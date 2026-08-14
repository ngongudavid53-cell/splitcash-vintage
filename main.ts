import { Hono } from "npm:hono@^4.10.7";
import type { Context } from "npm:hono@^4.10.7";
import { serveStatic } from "npm:hono@^4.10.7/deno";
import { cors } from "npm:hono@^4.10.7/cors";
import { streamSSE } from "npm:hono@^4.10.7/streaming";
import { GoogleGenerativeAI } from "npm:@google/generative-ai@^0.24.1";
import braintree from "npm:braintree@^3.38.0";
import Stripe from "npm:stripe@^17.12.0";

const app = new Hono();

// Allow the SPA (possibly on another origin) to call the API routes.
app.use("/api/*", cors());

function env(name: string): string | undefined {
  return Deno.env.get(name);
}

// --- in-memory usage tally, exposed at /api/stats (resets on restart) ---
const stats = {
  assistant: {
    requests: 0,
    errors: 0,
    rateLimited: 0,
    chunks: 0,
    models: {} as Record<string, number>,
  },
  ads: { requests: 0, served: 0, errors: 0 },
  braintree: { tokens: 0, sales: 0, salesOk: 0, salesFailed: 0, entitlements: 0 },
  stripe: { checkouts: 0, verified: 0, failed: 0 },
  startedAt: new Date().toISOString(),
};

app.get("/api/stats", (c) => c.json(stats));

// --- tiny spend limiter (protects the app owner's quota, not abusers) ---
const RATE_WINDOW_MS = 5 * 60 * 1000;
const RATE_MAX = 30;
const rateBuckets = new Map<string, number[]>();

function clientKey(c: Context): string {
  return c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

function rateLimited(key: string): boolean {
  const now = Date.now();
  const hits = (rateBuckets.get(key) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (hits.length >= RATE_MAX) {
    rateBuckets.set(key, hits);
    return true;
  }
  hits.push(now);
  rateBuckets.set(key, hits);
  return false;
}

// --- /api/config: what is wired up server-side? ---
app.get("/api/config", (c) =>
  c.json({
    assistant: Boolean(env("GEMINI_API_KEY")),
    ads: Boolean(env("GRAVITY_API_KEY")),
    braintree: Boolean(
      env("BRAINTREE_MERCHANT_ID") &&
        env("BRAINTREE_PUBLIC_KEY") &&
        env("BRAINTREE_PRIVATE_KEY"),
    ),
    stripe: Boolean(env("STRIPE_SECRET_KEY")),
    version: 2,
  }),
);

// --- /api/assistant: streams Gemini answers as SSE; key stays server-side ---
const ASSISTANT_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash"];

const ASSISTANT_SYSTEM = (brief: string) =>
  [
    "You are the keeper of the books for Common Pot, a shared expense ledger.",
    "Answer questions about THIS ledger. Be warm, brief and plain — no lectures.",
    "Use ONLY the numbers and entries given below. Never invent expenses, people, or amounts.",
    "If a question goes beyond the ledger, say in one line that it's outside the books.",
    "Keep money in the same format as the brief.",
    "THE LEDGER:",
    brief,
  ].join("\n");

app.post("/api/assistant", async (c) => {
  const key = env("GEMINI_API_KEY");
  if (!key) return c.json({ error: "assistant_not_configured" }, 503);
  if (rateLimited(clientKey(c))) {
    stats.assistant.rateLimited++;
    return c.json({ error: "rate_limited" }, 429);
  }
  stats.assistant.requests++;

  const body = await c.req.json().catch(() => null);
  if (!body || !Array.isArray(body.messages) || body.messages.length === 0) {
    stats.assistant.errors++;
    return c.json({ error: "bad_request" }, 400);
  }

  const messages = body.messages
    .slice(-30)
    .map((m: { role?: string; parts?: { text?: string }[] }) => ({
      role: m.role === "model" ? "model" : "user",
      parts: [{ text: String(m.parts?.[0]?.text ?? "").slice(0, 20000) }],
    }));
  const brief = String(body.brief ?? "").slice(0, 12000);

  const genAI = new GoogleGenerativeAI(key);
  const systemInstruction = ASSISTANT_SYSTEM(brief);

  return streamSSE(c, async (stream) => {
    let lastError: unknown = null;
    let started = false;
    for (const model of ASSISTANT_MODELS) {
      if (started) break;
      try {
        const gemini = genAI.getGenerativeModel({ model, systemInstruction });
        const result = await gemini.generateContentStream({ contents: messages });
        for await (const chunk of result.stream) {
          let text = "";
          try {
            text = chunk.text();
          } catch {
            // Blocked chunk — skip rather than failing the turn.
          }
          if (!text) continue;
          started = true;
          stats.assistant.models[model] = (stats.assistant.models[model] ?? 0) + 1;
          stats.assistant.chunks++;
          await stream.writeSSE({ data: JSON.stringify({ text }) });
        }
        lastError = null;
        break;
      } catch (err) {
        lastError = err;
      }
    }
    if (lastError && !started) {
      stats.assistant.errors++;
      await stream.writeSSE({
        event: "error",
        data: JSON.stringify({ message: String(lastError) }),
      });
    }
    await stream.writeSSE({ event: "done", data: "{}" });
    await stream.close();
  });
});

// --- /api/ad: proxies Gravity contextual ads; key stays server-side ---
app.post("/api/ad", async (c) => {
  const key = env("GRAVITY_API_KEY");
  if (!key) return c.json({ error: "ads_not_configured" }, 503);

  const production = env("GRAVITY_PRODUCTION") === "true";
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: "bad_request" }, 400);

  stats.ads.requests++;
  try {
    const res = await fetch("https://server.trygravity.ai/api/v1/ad", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({ ...body, testAd: !production }),
    });
    if (res.status === 204 || !res.ok) return c.body(null, 204);
    const data = await res.json();
    stats.ads.served++;
    return c.json(data);
  } catch (err) {
    stats.ads.errors++;
    return c.json({ error: `ad_service_unreachable: ${err}` }, 502);
  }
});

// --- Stripe payments — the premium checkout ---
const PREMIUM_PRICE = "4.99";
const PREMIUM_CENTS = 499;

let stripeClient: Stripe | null = null;

function stripeGateway(): Stripe | null {
  const key = env("STRIPE_SECRET_KEY");
  if (!key) return null;
  if (!stripeClient) stripeClient = new Stripe(key);
  return stripeClient;
}

app.post("/api/stripe/checkout", async (c) => {
  const client = stripeGateway();
  if (!client) {
    return c.json({ error: "Stripe is not configured on the server yet." }, 503);
  }
  try {
    const body = await c.req.json().catch(() => null);
    const amount = String(body?.amount ?? "").trim();
    if (amount && amount !== PREMIUM_PRICE) {
      return c.json({ error: "That amount isn't on the menu." }, 400);
    }
    const origin = String(body?.origin ?? c.req.header("origin") ?? "")
      .replace(/\/+$/, "");
    if (!origin) {
      return c.json({ error: "No app origin given for the return trip." }, 400);
    }
    const session = await client.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: PREMIUM_CENTS,
            product_data: {
              name: "The Premium Ledger",
              description:
                "One-time unlock — CSV export of any ledger's full daybook.",
            },
          },
          quantity: 1,
        },
      ],
      metadata: { product: "premium" },
      success_url: `${origin}/#/app?stripe_session={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/#/app`,
    });
    stats.stripe.checkouts++;
    if (!session.url) {
      return c.json({ error: "Stripe didn't return a checkout url." }, 500);
    }
    return c.json({ url: session.url });
  } catch (err) {
    stats.stripe.failed++;
    return c.json({ error: `Checkout creation failed: ${err}` }, 500);
  }
});

app.post("/api/stripe/verify", async (c) => {
  const client = stripeGateway();
  if (!client) {
    return c.json(
      { success: false, error: "Stripe is not configured on the server yet." },
      503,
    );
  }
  try {
    const body = await c.req.json();
    const sessionId = String(body.sessionId ?? "").trim();
    if (!sessionId) {
      return c.json({ success: false, error: "No session id was given." }, 400);
    }
    const session = await client.checkout.sessions.retrieve(sessionId);
    const paid = session.payment_status === "paid";
    const rightPrice = session.amount_total === PREMIUM_CENTS;
    const rightProduct = session.metadata?.product === "premium";
    if (!paid || !rightPrice || !rightProduct) {
      stats.stripe.failed++;
      return c.json({
        success: false,
        error: "That payment wasn't for the premium ledger.",
      });
    }
    stats.stripe.verified++;
    return c.json({
      success: true,
      transactionId: session.id,
      amount: ((session.amount_total ?? 0) / 100).toFixed(2),
    });
  } catch (err) {
    return c.json({ success: false, error: `Couldn't verify that payment: ${err}` }, 500);
  }
});

// --- Braintree payments — legacy tip-jar Drop-in (optional) ---
function braintreeGateway() {
  const merchantId = env("BRAINTREE_MERCHANT_ID");
  const publicKey = env("BRAINTREE_PUBLIC_KEY");
  const privateKey = env("BRAINTREE_PRIVATE_KEY");
  if (!merchantId || !publicKey || !privateKey) return null;
  return new braintree.BraintreeGateway({
    environment:
      env("BRAINTREE_ENVIRONMENT") === "production"
        ? braintree.Environment.Production
        : braintree.Environment.Sandbox,
    merchantId,
    publicKey,
    privateKey,
  });
}

const braintreeCurrency = () => env("BRAINTREE_CURRENCY") ?? "USD";

app.get("/api/braintree/token", async (c) => {
  const gateway = braintreeGateway();
  if (!gateway) {
    return c.json(
      { error: "Braintree is not configured on the server yet." },
      503,
    );
  }
  try {
    const { clientToken } = await gateway.clientToken.generate({});
    stats.braintree.tokens++;
    return c.json({ clientToken });
  } catch (err) {
    return c.json({ error: `Token generation failed: ${err}` }, 500);
  }
});

app.post("/api/braintree/checkout", async (c) => {
  const gateway = braintreeGateway();
  if (!gateway) {
    return c.json(
      { success: false, error: "Braintree is not configured on the server yet." },
      503,
    );
  }
  try {
    const body = await c.req.json();
    const amount = String(body.amount ?? "").trim();
    const nonce = String(body.paymentMethodNonce ?? "").trim();

    if (!/^\d+(\.\d{1,2})?$/.test(amount) || Number(amount) <= 0) {
      return c.json({ success: false, error: "Enter a valid amount (e.g. 5.00)." }, 400);
    }
    if (!nonce) {
      return c.json({ success: false, error: "No payment method was selected." }, 400);
    }

    stats.braintree.sales++;
    const result = await gateway.transaction.sale({
      amount,
      paymentMethodNonce: nonce,
      options: { submitForSettlement: true },
      currencyCode: braintreeCurrency(),
    });

    if (result.success) {
      stats.braintree.salesOk++;
      return c.json({
        success: true,
        transaction: {
          id: result.transaction.id,
          status: result.transaction.status,
          amount: result.transaction.amount,
        },
      });
    }
    stats.braintree.salesFailed++;
    return c.json({ success: false, error: result.message ?? "The payment was declined." });
  } catch (err) {
    stats.braintree.salesFailed++;
    return c.json({ success: false, error: `Sale failed: ${err}` }, 500);
  }
});

app.post("/api/braintree/entitle", async (c) => {
  const gateway = braintreeGateway();
  if (!gateway) {
    return c.json(
      { success: false, error: "Braintree is not configured on the server yet." },
      503,
    );
  }
  try {
    const body = await c.req.json();
    const txId = String(body.transactionId ?? "").trim();
    if (!txId) {
      return c.json({ success: false, error: "No transaction id was given." }, 400);
    }
    const tx = await gateway.transaction.find(txId);
    const settled =
      tx.status === "settled" ||
      tx.status === "submitted_for_settlement" ||
      tx.status === "settlement_pending";
    const rightPrice = Math.abs(Number(tx.amount) - Number(PREMIUM_PRICE)) < 0.005;
    if (!settled || !rightPrice) {
      stats.braintree.salesFailed++;
      return c.json({
        success: false,
        error: "That payment wasn't for the premium ledger.",
      });
    }
    stats.braintree.entitlements++;
    return c.json({ success: true, transactionId: tx.id, amount: tx.amount });
  } catch (err) {
    return c.json({ success: false, error: `Couldn't verify that payment: ${err}` }, 500);
  }
});

Deno.serve(app.fetch);

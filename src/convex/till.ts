/**
 * The till — the app's own backend endpoints, running inside the project's
 * Convex deployment. No separate server to deploy: the secret keys (Stripe,
 * Gemini, Gravity) are set in the project's Keys / API keys tab and arrive
 * here as process.env on the server side only.
 */

import { httpAction } from "./_generated/server";
const PREMIUM_PRICE = "4.99";
const PREMIUM_CENTS = 499;

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

const stats = {
  assistant: {
    requests: 0,
    errors: 0,
    rateLimited: 0,
    chunks: 0,
    models: {} as Record<string, number>,
  },
  ads: { requests: 0, served: 0, errors: 0 },
  stripe: { checkouts: 0, verified: 0, failed: 0 },
  startedAt: new Date().toISOString(),
};

const RATE_WINDOW_MS = 5 * 60 * 1000;
const RATE_MAX = 30;
const rateBuckets = new Map<string, number[]>();

function clientKey(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
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

export const preflight = httpAction(async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
});

export const config = httpAction(async () => {
  return json({
    assistant: Boolean(process.env.GEMINI_API_KEY),
    ads: Boolean(process.env.GRAVITY_API_KEY),
    braintree: false,
    stripe: Boolean(process.env.STRIPE_SECRET_KEY),
    version: 3,
  });
});

export const statsHandler = httpAction(async () => json(stats));

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

export const assistant = httpAction(async (_ctx, request) => {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return json({ error: "assistant_not_configured" }, 503);

  if (rateLimited(clientKey(request))) {
    stats.assistant.rateLimited++;
    return json({ error: "rate_limited" }, 429);
  }

  stats.assistant.requests++;

  const body = (await request.json().catch(() => null)) as {
    messages?: { role?: string; parts?: { text?: string }[] }[];
    brief?: unknown;
  } | null;

  if (!body || !Array.isArray(body.messages) || body.messages.length === 0) {
    stats.assistant.errors++;
    return json({ error: "bad_request" }, 400);
  }

  const contents = body.messages.slice(-30).map((m) => ({
    role: m.role === "model" ? "model" : "user",
    parts: [{ text: String(m.parts?.[0]?.text ?? "").slice(0, 20000) }],
  }));

  const brief = String(body.brief ?? "").slice(0, 12000);
  const systemInstruction = ASSISTANT_SYSTEM(brief);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();

      const sse = (event: string | undefined, data: string) => {
        const frame = event
          ? `event: ${event}\ndata: ${data}\n\n`
          : `data: ${data}\n\n`;
        controller.enqueue(encoder.encode(frame));
      };

      try {
        let lastError: unknown = null;
        let started = false;

        for (const model of ASSISTANT_MODELS) {
          if (started) break;

          try {
            const url =
              `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent` +
              `?alt=sse&key=${encodeURIComponent(key)}`;

            const response = await fetch(url, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                systemInstruction: {
                  parts: [{ text: systemInstruction }],
                },
                contents,
              }),
            });

            if (!response.ok || !response.body) {
              const errorText = await response.text().catch(() => "");
              throw new Error(
                `Gemini ${response.status}: ${errorText.slice(0, 1000)}`
              );
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";

            while (true) {
              const { value, done } = await reader.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });

              const lines = buffer.split(/\r?\n/);
              buffer = lines.pop() ?? "";

              for (const line of lines) {
                if (!line.startsWith("data:")) continue;

                const raw = line.slice(5).trim();
                if (!raw || raw === "[DONE]") continue;

                try {
                  const chunk = JSON.parse(raw);
                  const text =
                    chunk?.candidates?.[0]?.content?.parts
                      ?.map((part: { text?: string }) => part.text ?? "")
                      .join("") ?? "";

                  if (!text) continue;

                  started = true;
                  stats.assistant.models[model] =
                    (stats.assistant.models[model] ?? 0) + 1;
                  stats.assistant.chunks++;
                  sse(undefined, JSON.stringify({ text }));
                } catch {
                  // Ignore malformed SSE frames.
                }
              }
            }

            lastError = null;
            break;
          } catch (err) {
            lastError = err;
          }
        }

        if (lastError && !started) {
          stats.assistant.errors++;
          sse("error", JSON.stringify({ message: String(lastError) }));
        }

        sse("done", "{}");
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      ...CORS_HEADERS,
    },
  });
});

export const ad = httpAction(async (_ctx, request) => {
  const key = process.env.GRAVITY_API_KEY;
  if (!key) return json({ error: "ads_not_configured" }, 503);
  const production = process.env.GRAVITY_PRODUCTION === "true";
  const body = await request.json().catch(() => null);
  if (!body) return json({ error: "bad_request" }, 400);

  stats.ads.requests++;
  try {
    const res = await fetch("https://server.trygravity.ai/api/v1/ad", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ ...(body as object), testAd: !production }),
    });
    if (res.status === 204 || !res.ok) {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    const data = await res.json();
    stats.ads.served++;
    return json(data);
  } catch (err) {
    stats.ads.errors++;
    return json({ error: `ad_service_unreachable: ${err}` }, 502);
  }
});

const STRIPE_API = "https://api.stripe.com/v1";

interface StripeSession {
  id: string;
  url?: string | null;
  payment_status?: string;
  amount_total?: number | null;
  metadata?: Record<string, string>;
  error?: { message?: string };
}

function stripeSecret(): string | undefined {
  return process.env.STRIPE_SECRET_KEY;
}

async function stripeFetch(path: string, init?: RequestInit): Promise<StripeSession> {
  const secret = stripeSecret();
  const res = await fetch(`${STRIPE_API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${secret}`, ...(init?.headers ?? {}) },
  });
  return (await res.json()) as StripeSession;
}

export const stripeCheckout = httpAction(async (_ctx, request) => {
  if (!stripeSecret()) {
    return json({ error: "Stripe is not configured on the server yet." }, 503);
  }
  try {
    const body = (await request.json().catch(() => null)) as {
      amount?: unknown;
      origin?: unknown;
      uid?: unknown;
    } | null;
    const amount = String(body?.amount ?? "").trim();
    if (amount && amount !== PREMIUM_PRICE) {
      return json({ error: "That amount isn't on the menu." }, 400);
    }
    const origin = String(body?.origin ?? "").replace(/\/+$/, "");
    const uid = String(body?.uid ?? "").trim();
    if (!origin) return json({ error: "No app origin given for the return trip." }, 400);
    if (!uid || uid.length > 256) return json({ error: "No valid signed-in user was supplied." }, 401);

    const form = new URLSearchParams();
    form.set("mode", "payment");
    form.set("success_url", `${origin}/#/app?stripe_session={CHECKOUT_SESSION_ID}`);
    form.set("cancel_url", `${origin}/#/app`);
    form.set("line_items[0][price_data][currency]", "usd");
    form.set("line_items[0][price_data][unit_amount]", String(PREMIUM_CENTS));
    form.set("line_items[0][price_data][product_data][name]", "The Premium Ledger");
    form.set("line_items[0][price_data][product_data][description]", "One-time unlock — CSV export of any ledger's full daybook.");
    form.set("line_items[0][quantity]", "1");
    form.set("metadata[product]", "premium");
    form.set("metadata[uid]", uid);

    const data = await stripeFetch("/checkout/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });

    stats.stripe.checkouts++;
    if (!data.url) {
      return json({ error: data.error?.message ?? "Stripe didn't return a checkout url." }, 500);
    }
    return json({ url: data.url });
  } catch (err) {
    stats.stripe.failed++;
    return json({ error: `Checkout creation failed: ${err}` }, 500);
  }
});

export const stripeVerify = httpAction(async (_ctx, request) => {
  if (!stripeSecret()) {
    return json({ success: false, error: "Stripe is not configured on the server yet." }, 503);
  }
  try {
    const body = (await request.json().catch(() => null)) as { sessionId?: unknown } | null;
    const sessionId = String(body?.sessionId ?? "").trim();
    if (!sessionId) return json({ success: false, error: "No session id was given." }, 400);

    const data = await stripeFetch(`/checkout/sessions/${encodeURIComponent(sessionId)}`);
    const paid = data.payment_status === "paid";
    const rightPrice = data.amount_total === PREMIUM_CENTS;
    const rightProduct = data.metadata?.product === "premium";
    const uid = data.metadata?.uid?.trim() ?? "";
    if (!paid || !rightPrice || !rightProduct || !uid) {
      stats.stripe.failed++;
      return json({ success: false, error: "That payment wasn't for the premium ledger." });
    }
    stats.stripe.verified++;
    return json({
      success: true,
      transactionId: data.id,
      amount: ((data.amount_total ?? 0) / 100).toFixed(2),
      uid,
    });
  } catch (err) {
    return json({ success: false, error: `Couldn't verify that payment: ${err}` }, 500);
  }
});

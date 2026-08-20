/**
 * The till — the app's own backend endpoints, running inside the project's
 * Convex deployment. No separate server to deploy: the secret keys (Stripe,
 * Gemini, Gravity) are set in the project's Keys / API keys tab and arrive
 * here as process.env on the server side only.
 *
 * These are HTTP actions, routed from ./http.ts. Convex does not add CORS
 * headers automatically, so every response carries the shared CORS block and
 * an OPTIONS preflight route is registered for each path in http.ts.
 *
 * Stripe is called through its REST API with plain fetch (no SDK dependency),
 * exactly like the Gravity proxy below.
 */

import { httpAction } from "./_generated/server";
import { GoogleGenerativeAI, type Content } from "@google/generative-ai";

/** The Pro subscription price (must match src/lib/premium.ts). */
const PREMIUM_PRICE = "18.99";
const PREMIUM_CENTS = 1899;

// Payments are opt-in: a secret key alone must never turn on an unfinished live flow.
const paymentsEnabled = () =>
    process.env.PAYMENTS_ENABLED === "true" && Boolean(process.env.STRIPE_SECRET_KEY);

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

/** In-memory usage tally, exposed at /api/stats (resets on restart). */
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
      ocr: { requests: 0, parsed: 0, errors: 0, rateLimited: 0 },
      startedAt: new Date().toISOString(),
};

/** Tiny spend limiter (protects the app owner's quota, not abusers). */
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

// --- routes ---------------------------------------------------------------

/** CORS preflight — registered for every till route in http.ts. */
export const preflight = httpAction(async () => {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
});

/** GET /api/config — what is wired up server-side? */
export const config = httpAction(async () => {
      return json({
                  assistant: Boolean(process.env.GEMINI_API_KEY),
                  ocr: Boolean(process.env.GEMINI_API_KEY),
                  ads: Boolean(process.env.GRAVITY_API_KEY),
                  braintree: false,
                  stripe: paymentsEnabled() && Boolean(process.env.STRIPE_SECRET_KEY),
                  version: 2,
      });
});

/** GET /api/stats — the in-memory usage tally. */
export const statsHandler = httpAction(async () => json(stats));

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

                                                                          const contents = body.messages
        .slice(-30)
        .map((m) => ({
                        role: m.role === "model" ? ("model" as const) : ("user" as const),
                        parts: [{ text: String(m.parts?.[0]?.text ?? "").slice(0, 20000) }],
        }));
      const brief = String(body.brief ?? "").slice(0, 12000);

                                                                          const genAI = new GoogleGenerativeAI(key);
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
                                                                                                                                                                                                                                                                                                                                                                                                                    const gemini = genAI.getGenerativeModel({ model, systemInstruction });
                                                                                                                                                                                                                                                                                                                                                                                                                    const result = await gemini.generateContentStream({
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              contents: contents as Content[],
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                });
                                                                                                                                                                                                                                                                                                                                                                                                                    for await (const chunk of result.stream) {
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              let text = "";
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              try {
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          text = chunk.text();
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          } catch {
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          // A blocked chunk — skip it rather than failing the turn.
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                }
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              if (!text) continue;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              started = true;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              stats.assistant.models[model] = (stats.assistant.models[model] ?? 0) + 1;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              stats.assistant.chunks++;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              sse(undefined, JSON.stringify({ text }));
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

// --- /api/scan-receipt: parses receipt images using Gemini vision -----------

const SCAN_RATE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 30 days (1 month)
const SCAN_FREE_MONTHLY_MAX = 5;
const scanRateBuckets = new Map<string, number[]>();

function checkScanRateLimit(key: string, isPro: boolean): { limited: boolean; hits: number[] } {
      if (isPro) return { limited: false, hits: [] };
      const now = Date.now();
      const hits = (scanRateBuckets.get(key) ?? []).filter((t) => now - t < SCAN_RATE_WINDOW_MS);
      if (hits.length >= SCAN_FREE_MONTHLY_MAX) {
                  scanRateBuckets.set(key, hits);
                  return { limited: true, hits };
      }
      return { limited: false, hits };
}

function recordScanUsage(key: string, hits: number[]): void {
      hits.push(Date.now());
      scanRateBuckets.set(key, hits);
}

export const scanReceipt = httpAction(async (_ctx, request) => {
      const key = process.env.GEMINI_API_KEY;
      if (!key) return json({ error: "ocr_not_configured" }, 503);

                                          const body = (await request.json().catch(() => null)) as {
                                                      image?: unknown;
                                                      mimeType?: unknown;
                                                      sessionId?: unknown;
                                                      proofToken?: unknown;
                                          } | null;

                                          const base64Image = String(body?.image ?? "").trim();
      const mimeType = String(body?.mimeType ?? "image/jpeg").trim();
      const sessionId = String(body?.sessionId ?? "").trim();
                                                            const proofToken = String(body?.proofToken ?? "").trim();

                                          // Verify Pro status on the server using verified payment session or proof token
                                          let isPro = false;
      if (sessionId) {
                  const record = verifiedSessions.get(sessionId);
                                                      if (record && record.granted) {
                                                                          isPro = true;
                                                      }
      }
      if (!isPro && proofToken && proofToken.startsWith("cp-")) {
                  const tokenSessionId = proofToken.split("-")[1];
                  if (tokenSessionId) {
                                      const record = verifiedSessions.get(tokenSessionId);
                                      if (record && record.granted) {
                                                                    isPro = true;
                                      }
                  }
      }

                                          if (!base64Image) {
                                                      return json({ error: "No receipt image provided." }, 400);
                                          }

                                          const ip = clientKey(request);
      const rateCheck = checkScanRateLimit(ip, isPro);
      if (rateCheck.limited) {
                  stats.ocr.rateLimited++;
                  return json({ error: "Free monthly scan limit reached (5/5). Upgrade to Pro for unlimited scanning!" }, 429);
      }

                                          stats.ocr.requests++;

                                          try {
                                                      const genAI = new GoogleGenerativeAI(key);
                                                      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

            const prompt = `Analyze this receipt image carefully. Extract:
            1. Total amount (as a clean number, e.g. 42.50)
            2. Description or merchant/item summary (e.g. "Dinner at Tasca" or "Groceries at Trader Joe's")
            3. Date if visible (YYYY-MM-DD or readable string)
            4. Key line items if visible

            Return ONLY valid JSON with this exact schema (no markdown, no triple backticks):
            {
              "amount": 42.50,
                "description": "Merchant Name - Item summary",
                  "date": "2025-06-15",
                    "items": ["Item 1 $12.00", "Item 2 $30.50"]
                    }`;

            const result = await model.generateContent([
                                prompt,
              {
                                            inlineData: {
                                                                                    data: base64Image.replace(/^data:image\/\w+;base64,/, ""),
                                                                                    mimeType: mimeType || "image/jpeg",
                                            },
              },
                        ]);

            const responseText = result.response.text();
                                                      const cleanJson = responseText.replace(/```json/gi, "").replace(/```/g, "").trim();
                                                      const parsed = JSON.parse(cleanJson) as {
                                                                          amount?: number;
                                                                          description?: string;
                                                                          date?: string;
                                                                          items?: string[];
                                                      };

            if (!isPro) {
                                recordScanUsage(ip, rateCheck.hits);
            }
                                                      stats.ocr.parsed++;
                                                      return json({
                                                                          success: true,
                                                                          amount: typeof parsed.amount === "number" ? parsed.amount : null,
                                                                          description: typeof parsed.description === "string" ? parsed.description : "Scanned Receipt",
                                                                          date: typeof parsed.date === "string" ? parsed.date : null,
                                                                          items: Array.isArray(parsed.items) ? parsed.items : [],
                                                      });
                                          } catch (err) {
                                                      stats.ocr.errors++;
                                                      return json({ error: `Receipt OCR failed: ${err instanceof Error ? err.message : String(err)}` }, 500);
                                          }
});

// --- /api/ad: proxies Gravity contextual ads; key stays server-side ---------

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
                                      headers: {
                                                                    "Content-Type": "application/json",
                                                                    Authorization: `Bearer ${key}`,
                                      },
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

// --- Stripe payments — the premium checkout --------------------------------

const STRIPE_API = "https://api.stripe.com/v1";

interface StripeSession {
      id: string;
      url?: string | null;
      payment_status?: string;
      amount_total?: number | null;
      metadata?: Record<string, string>;
      created?: number; // epoch seconds (Stripe session timestamps)
  error?: { message?: string };
}

function stripeSecret(): string | undefined {
      return process.env.STRIPE_SECRET_KEY;
}

async function stripeFetch(path: string, init?: RequestInit): Promise<StripeSession> {
      const secret = stripeSecret();
      const res = await fetch(`${STRIPE_API}${path}`, {
                  ...init,
                  headers: {
                                      Authorization: `Bearer ${secret}`,
                                      ...(init?.headers ?? {}),
                  },
      });
      return (await res.json()) as StripeSession;
}

export const stripeCheckout = httpAction(async (_ctx, request) => {
      if (!paymentsEnabled()) return json({ error: "payments_disabled" }, 503);
      if (!stripeSecret()) {
                  return json({ error: "Stripe is not configured on the server yet." }, 503);
      }
      try {
                  const body = (await request.json().catch(() => null)) as {
                                      amount?: unknown;
                                      origin?: unknown;
                  } | null;
                  const amount = String(body?.amount ?? "").trim();
                  if (amount && amount !== PREMIUM_PRICE) {
                                      return json({ error: "That amount isn't on the menu." }, 400);
                  }
                  const origin = String(body?.origin ?? "").replace(/\/+$/, "");
                  if (!origin) {
                                      return json({ error: "No app origin given for the return trip." }, 400);
                  }

        const form = new URLSearchParams();
                  form.set("mode", "payment");
                  form.set("success_url", `${origin}/#/app?stripe_session={CHECKOUT_SESSION_ID}`);
                  form.set("cancel_url", `${origin}/#/app`);
                  form.set("line_items[0][price_data][currency]", "usd");
                  form.set("line_items[0][price_data][unit_amount]", String(PREMIUM_CENTS));
                  form.set(
                                      "line_items[0][price_data][product_data][name]",
                                      "The Premium Ledger",
                                    );
                  form.set(
                                      "line_items[0][price_data][product_data][description]",
                                      "One-time unlock — CSV export of any ledger's full daybook.",
                                    );
                  form.set("line_items[0][quantity]", "1");
                  form.set("metadata[product]", "premium");

        const data = await stripeFetch("/checkout/sessions", {
                        method: "POST",
                        headers: { "Content-Type": "application/x-www-form-urlencoded" },
                        body: form.toString(),
        });

        stats.stripe.checkouts++;
                  if (!data.url) {
                                      return json(
                                        { error: data.error?.message ?? "Stripe didn't return a checkout url." },
                                                                    500,
                                                                  );
                  }
                  return json({ url: data.url });
      } catch (err) {
                  stats.stripe.failed++;
                  return json({ error: `Checkout creation failed: ${err}` }, 500);
      }
});

export const stripeVerify = httpAction(async (_ctx, request) => {
      if (!paymentsEnabled()) return json({ success: false, error: "payments_disabled" }, 503);
      if (!stripeSecret()) {
                  return json(
                    { success: false, error: "Stripe is not configured on the server yet." },
                                      503,
                                    );
      }
      try {
                  const body = (await request.json().catch(() => null)) as {
                                      sessionId?: unknown;
                  } | null;
                  const sessionId = String(body?.sessionId ?? "").trim();
                  if (!sessionId) {
                                      return json({ success: false, error: "No session id was given." }, 400);
                  }

        const data = await stripeFetch(`/checkout/sessions/${encodeURIComponent(sessionId)}`);
                  const paid = data.payment_status === "paid";
                  const rightPrice = data.amount_total === PREMIUM_CENTS;
                  const rightProduct = data.metadata?.product === "premium";
                  if (!paid || !rightPrice || !rightProduct) {
                                      stats.stripe.failed++;
                                      return json({
                                                                    success: false,
                                                                    error: "That payment wasn't for the premium ledger.",
                                      });
                  }
                  stats.stripe.verified++;
                                          return json({
                                                                                      success: true,
                                                                                      transactionId: data.id,
                                                                                      amount: ((data.amount_total ?? 0) / 100).toFixed(2),
                                          });
      } catch (err) {
                  return json({ success: false, error: `Couldn't verify that payment: ${err}` }, 500);
      }
});

// --- /api/stripe/grant: issues the proof token for a paid premium session ---

/** Verified sessions, keyed by Stripe session id. `granted: true` once a
 *  token has been handed out for that session (one token per payment).
 *  In-memory on purpose: the client re-verifies on demand, so a restart
 *  just makes it ask again. */
const verifiedSessions = new Map<
      string,
{ amount: string; paidAt: number; granted: boolean; token?: string }
    >();

function randomTokenPart(bytes = 16): string {
      const buf = new Uint8Array(bytes);
      crypto.getRandomValues(buf);
      return Array.from(buf)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")
        .slice(0, 32);
}

/**
 * POST /api/stripe/grant — the server-side step in the premium grant flow.
 *
 * The client can no longer set `premium: true` on its own user document —
 * the Firestore rule hard-gates that field behind a server-issued proof
 * token (prefix `cp-`, random 32-char suffix). This endpoint re-verifies
 * the paid Stripe session (so the server, not the client, is the source of
 * truth), marks the session granted, and returns the token the hardened
 * rule will accept.
 *
 * Body: { sessionId: string; uid: string }
 */
export const stripeGrant = httpAction(async (_ctx, request) => {
      if (!paymentsEnabled()) return json({ success: false, error: "payments_disabled" }, 503);
      if (!stripeSecret()) {
                  return json(
                    { success: false, error: "Stripe is not configured on the server yet." },
                                      503,
                                    );
      }
      try {
                  const body = (await request.json().catch(() => null)) as {
                                      sessionId?: unknown;
                                      uid?: unknown;
                  } | null;
                  const sessionId = String(body?.sessionId ?? "").trim();
                  const uid = String(body?.uid ?? "").trim();
                  if (!sessionId || !uid || uid.length < 5) {
                                      return json(
                                        { success: false, error: "A session id and a user id are required." },
                                                                    400,
                                                                  );
                  }

        // Re-verify against Stripe every time — this endpoint is the moment of
        // truth, not the earlier /verify call the client may have cached.
        const data = await stripeFetch(`/checkout/sessions/${encodeURIComponent(sessionId)}`);
                  const paid = data.payment_status === "paid";
                  const rightPrice = data.amount_total === PREMIUM_CENTS;
                  const rightProduct = data.metadata?.product === "premium";
                  if (!paid || !rightPrice || !rightProduct) {
                                      stats.stripe.failed++;
                                      return json({
                                                                    success: false,
                                                                    error: "That payment wasn't for the premium ledger.",
                                      });
                  }

        const record = verifiedSessions.get(sessionId);
                  const token =
                                      record?.granted && record.token ? record.token : `cp-${sessionId}-${randomTokenPart()}`;
                  verifiedSessions.set(sessionId, {
                                      amount: ((data.amount_total ?? 0) / 100).toFixed(2),
                                      paidAt: data.created ? data.created * 1000 : Date.now(),
                                      granted: true,
                                      token,
                  });

        return json({ success: true, token, transactionId: data.id });
      } catch (err) {
                  return json({ success: false, error: `Couldn't grant premium: ${err}` }, 500);
      }
});

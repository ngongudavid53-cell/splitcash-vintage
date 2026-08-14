import type { AdResponse } from "@gravity-ai/react";
import { apiBase, fetchServerConfig } from "@/lib/server";

const API_KEY = import.meta.env.VITE_GRAVITY_API_KEY as string | undefined;
const FUNCTION_URL =
  import.meta.env.VITE_GRAVITY_FUNCTION_URL as string | undefined;
/** `true` = real ads (billed). Leave unset/false for free test ads. */
const PRODUCTION = import.meta.env.VITE_GRAVITY_PRODUCTION === "true";

/** The Gravity ad endpoint (same one the official SDK calls). */
const ENDPOINT = "https://server.trygravity.ai/api/v1/ad";
const TIMEOUT_MS = 4000;

/** True when a client-side path exists (legacy function URL or a direct key).
 *  The server proxy path is detected separately via the server config. */
export function isGravityConfigured(): boolean {
  return Boolean(API_KEY || FUNCTION_URL);
}

export interface AdRequestInput {
  sessionId: string;
  userId: string;
  messages: { role: "user" | "assistant"; content: string }[];
}

/** Browser device fingerprint, matching the shape the SDK sends. */
function browserDevice() {
  const nav = typeof navigator !== "undefined" ? navigator : undefined;
  const win = typeof window !== "undefined" ? window : undefined;
  return {
    ua: nav?.userAgent ?? "",
    browser: "web",
    device_type: /Mobi|Android/i.test(nav?.userAgent ?? "") ? "mobile" : "desktop",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    locale: Intl.DateTimeFormat().resolvedOptions().locale,
    language: nav?.language ?? "en",
    screen_width: win?.screen?.width,
    screen_height: win?.screen?.height,
    viewport_width: win?.innerWidth,
    viewport_height: win?.innerHeight,
    platform: nav?.platform ?? "web",
  };
}

/** Fetch one contextual ad for a conversation. Never throws — returns null
 *  when unconfigured, blocked (e.g. CORS), or when there's simply no ad.
 *
 *  Resolution order:
 *    1. The app's own server proxy (main.ts /api/ad) — the key stays
 *       server-side, detected automatically via /api/config.
 *    2. An explicit function URL (VITE_GRAVITY_FUNCTION_URL, legacy).
 *    3. A direct browser call with the key (VITE_GRAVITY_API_KEY, test mode).
 *
 *  Note: we replicate the official SDK's wire format with plain `fetch`
 *  instead of importing `@gravity-ai/api`, because that package pulls in
 *  Node-only proxy-agent code (`class extends undefined`) that crashes the
 *  browser bundle at load time. The type-only import above is erased at
 *  build; `@gravity-ai/react` itself only imports from `react`. */
export async function requestAd(input: AdRequestInput): Promise<AdResponse | null> {
  try {
    const payload = {
      messages: input.messages.slice(-2),
      sessionId: input.sessionId,
      placements: [
        { placement: "below_response", placement_id: "ask-the-books" },
      ],
      user: { id: input.userId },
      device: browserDevice(),
      relevancy: 0.2,
    };

    // 1) The app's own server proxy — key stays server-side, auto-detected.
    const config = await fetchServerConfig();
    if (config.ads) {
      const res = await fetch(`${apiBase()}/api/ad`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.status === 204 || !res.ok) return null;
      const data = (await res.json()) as AdResponse | AdResponse[];
      const ads = Array.isArray(data) ? data : [data];
      return ads[0] ?? null;
    }

    // 2) Legacy explicit function URL (user-provided proxy).
    if (FUNCTION_URL) {
      const res = await fetch(FUNCTION_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: input.messages.slice(-2),
          sessionId: input.sessionId,
          user: { id: input.userId },
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { ads?: AdResponse[] };
      return data.ads?.[0] ?? null;
    }

    // 3) Test/dev path: direct call from the browser with the API key.
    if (!API_KEY) return null;

    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({ ...payload, testAd: !PRODUCTION }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status === 204 || !res.ok) return null;
    const data = (await res.json()) as AdResponse | AdResponse[];
    const ads = Array.isArray(data) ? data : [data];
    return ads[0] ?? null;
  } catch {
    return null;
  }
}

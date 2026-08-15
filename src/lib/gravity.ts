import type { AdResponse } from "@gravity-ai/react";
import { apiBase, fetchServerConfig } from "@/lib/server";

// Production ads use the server-side Gravity key. A legacy function URL may
// still be supplied when an existing proxy is intentionally used.
const FUNCTION_URL = import.meta.env.VITE_GRAVITY_FUNCTION_URL as string | undefined;
const TIMEOUT_MS = 4000;

export function isGravityConfigured(): boolean {
  return Boolean(FUNCTION_URL);
}

export interface AdRequestInput {
  sessionId: string;
  userId: string;
  messages: { role: "user" | "assistant"; content: string }[];
}

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

export async function requestAd(input: AdRequestInput): Promise<AdResponse | null> {
  try {
    const payload = {
      messages: input.messages.slice(-2),
      sessionId: input.sessionId,
      placements: [{ placement: "below_response", placement_id: "ask-the-books" }],
      user: { id: input.userId },
      device: browserDevice(),
      relevancy: 0.2,
    };

    // Preferred production path: server-side Gravity key.
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
      return (Array.isArray(data) ? data : [data])[0] ?? null;
    }

    // Legacy proxy path; this contains no Gravity secret in the browser.
    if (!FUNCTION_URL) return null;
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
  } catch {
    return null;
  }
}

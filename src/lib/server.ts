import { useEffect, useState } from "react";

/** Minimal client for the app's own backend (the "till"). The backend runs
 *  inside the project's Convex deployment as HTTP actions
 *  (src/convex/till.ts, routed in src/convex/http.ts) — no separate server to
 *  deploy. It holds the real API keys; these helpers discover what is live and
 *  expose a base URL so the client can call the endpoints. Everything here
 *  degrades silently when no backend is reachable (e.g. a pure Vite preview)
 *  — callers then fall back to their direct, client-key paths. */

export interface ServerConfig {
  assistant: boolean;
  ads: boolean;
  braintree: boolean;
  stripe: boolean;
  version: number;
  /** True only when a live backend actually answered /api/config. Lets
   *  callers tell "no server at all" apart from "server up, keys missing". */
  reachable: boolean;
}

export interface ServerStats {
  assistant: {
    requests: number;
    errors: number;
    rateLimited: number;
    chunks: number;
    models: Record<string, number>;
  };
  ads: { requests: number; served: number; errors: number };
  braintree: {
    tokens: number;
    sales: number;
    salesOk: number;
    salesFailed: number;
    entitlements: number;
  };
  stripe: {
    checkouts: number;
    verified: number;
    failed: number;
  };
  startedAt: string;
}

const DEFAULT_CONFIG: ServerConfig = {
  assistant: false,
  ads: false,
  braintree: false,
  stripe: false,
  version: 0,
  reachable: false,
};

const CONFIG_TTL_MS = 60_000;

/** The Convex "site" URL hosts HTTP actions. Given the API URL
 *  (https://<slug>.convex.cloud) the site is https://<slug>.convex.site. */
function convexSiteUrl(apiUrl: string | undefined): string | undefined {
  if (!apiUrl) return undefined;
  const match = /^https:\/\/([a-z0-9-]+)\.convex\.cloud\/?$/.exec(apiUrl);
  return match ? `https://${match[1]}.convex.site` : undefined;
}

/** Base URL for the backend. Resolution order:
 *  1. VITE_CONVEX_SITE_URL — explicit Convex site URL (Keys tab), e.g.
 *     https://<deployment>.convex.site.
 *  2. Derived from VITE_CONVEX_URL — the platform's Convex deployment URL.
 *  3. VITE_API_URL — legacy: a separately deployed Deno/Hono server (main.ts).
 *  4. "" — same origin (the backend served alongside the app). */
export function apiBase(): string {
  const explicit = import.meta.env.VITE_CONVEX_SITE_URL as string | undefined;
  if (explicit) return explicit.replace(/\/+$/, "");
  const derived = convexSiteUrl(import.meta.env.VITE_CONVEX_URL as string | undefined);
  if (derived) return derived;
  const legacy = import.meta.env.VITE_API_URL as string | undefined;
  return (legacy ?? "").replace(/\/+$/, "");
}

let cached: { at: number; config: ServerConfig } | null = null;

/** Fetch (and briefly cache) what the backend has wired up. Never throws;
 *  `reachable` tells you whether a real backend answered at all. */
export async function fetchServerConfig(): Promise<ServerConfig> {
  if (cached && Date.now() - cached.at < CONFIG_TTL_MS) return cached.config;
  try {
    const res = await fetch(`${apiBase()}/api/config`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) throw new Error(`config ${res.status}`);
    const data = (await res.json()) as Partial<ServerConfig>;
    const config = { ...DEFAULT_CONFIG, ...data, reachable: true };
    cached = { at: Date.now(), config };
    return config;
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

/** Reactive wrapper for React: `ready` flips once the first config fetch
 *  settles (success or not), so components can avoid flashing "not wired"
 *  states before the backend has even been consulted. */
export function useServerConfig(): { config: ServerConfig; ready: boolean } {
  const [config, setConfig] = useState<ServerConfig>(DEFAULT_CONFIG);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchServerConfig().then((c) => {
      if (cancelled) return;
      setConfig(c);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { config, ready };
}

/** The backend's in-memory usage tally (/api/stats). Null when no backend is
 *  reachable (e.g. the Vite preview). Never throws. */
export async function fetchServerStats(): Promise<ServerStats | null> {
  try {
    const res = await fetch(`${apiBase()}/api/stats`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    return (await res.json()) as ServerStats;
  } catch {
    return null;
  }
}

/** Poll the backend's usage tally. Returns null until the first successful
 *  read — good for a "till tally" card that just shows nothing counted yet. */
export function useServerStats(intervalMs = 30_000): ServerStats | null {
  const [stats, setStats] = useState<ServerStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      void fetchServerStats().then((s) => {
        if (!cancelled) setStats(s);
      });
    };
    void load();
    const timer = window.setInterval(load, intervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [intervalMs]);

  return stats;
}

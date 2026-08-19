// Targeted smoke test for the Stripe client helpers
// (src/lib/stripe.ts):
//   · stripeBaseUrl() resolution:
//       VITE_CONVEX_SITE_URL  >  derived from VITE_CONVEX_URL  >  VITE_API_URL  >  same origin
//   · fetchStripeServerStatus() classification:
//       "live" | "not-configured" | "no-server"
//
// The module reads import.meta.env at load time, so we bundle it with esbuild
// and inject env values via `define` — the same mechanism Vite uses.
//
// Run with:
//   node --experimental-strip-types --experimental-specifier-resolution=node \
//     tests/stripe.smoke.mjs
import { strict as assert } from "node:assert";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

let passed = 0;
let failed = 0;

function ok(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  \u2713 ${name}`);
  } catch (err) {
    failed++;
    console.error(`  \u2717 ${name}\n    ${err.message}`);
  }
}

async function bundleStripe(defines) {
  const esbuild = await import("esbuild");
  const bundled = await esbuild.build({
    entryPoints: [new URL("../src/lib/stripe.ts", import.meta.url).pathname],
    bundle: true,
    format: "esm",
    platform: "neutral",
    define: defines,
    write: false,
  });
  const dir = mkdtempSync(join(tmpdir(), "cp-st-"));
  const file = join(dir, "st.mjs");
  writeFileSync(file, bundled.outputFiles[0].text);
  try {
    return await import(pathToFileURL(file).href);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function withFetch(impl, fn) {
  const real = globalThis.fetch;
  globalThis.fetch = impl;
  try {
    return fn();
  } finally {
    globalThis.fetch = real;
  }
}

function fakeResponse({ ok = true, contentType = "application/json", json } = {}) {
  return {
    ok,
    headers: { get: (name) => (name === "content-type" ? contentType : null) },
    json: async () => json,
  };
}

const NONE = {
  "import.meta.env.VITE_CONVEX_SITE_URL": "undefined",
  "import.meta.env.VITE_CONVEX_URL": "undefined",
  "import.meta.env.VITE_API_URL": "undefined",
};

console.log("stripe base url:");
try {
  const none = await bundleStripe(NONE);
  ok("no overrides -> same origin (empty base)", () =>
    assert.equal(none.stripeBaseUrl(), ""));

  const shared = await bundleStripe({
    ...NONE,
    "import.meta.env.VITE_API_URL": '"https://api.example.com/"',
  });
  ok("VITE_API_URL is used (trailing slash stripped)", () =>
    assert.equal(shared.stripeBaseUrl(), "https://api.example.com"));

  const site = await bundleStripe({
    ...NONE,
    "import.meta.env.VITE_API_URL": '"https://api.example.com/"',
    "import.meta.env.VITE_CONVEX_SITE_URL": '"https://my-pot-123.convex.site/"',
  });
  ok("VITE_CONVEX_SITE_URL beats VITE_API_URL (trailing slash stripped)", () =>
    assert.equal(site.stripeBaseUrl(), "https://my-pot-123.convex.site"));

  const derived = await bundleStripe({
    ...NONE,
    "import.meta.env.VITE_CONVEX_URL": '"https://my-pot-123.convex.cloud/"',
  });
  ok("convex site derived from VITE_CONVEX_URL", () =>
    assert.equal(derived.stripeBaseUrl(), "https://my-pot-123.convex.site"));

  console.log("stripe server status:");

  ok("live when /api/stripe/status reports stripe:true", () =>
    withFetch(
      async (url) => {
        assert.equal(String(url), "https://api.example.com/api/stripe/status");
        return fakeResponse({ json: { stripe: true } });
      },
      async () => {
        assert.equal(await shared.fetchStripeServerStatus(), "live");
      },
    ),
  );

  ok("not-configured when the server answers without durable Stripe setup", () =>
    withFetch(
      async () => fakeResponse({ json: { stripe: false, entitlementStore: false } }),
      async () => {
        assert.equal(await shared.fetchStripeServerStatus(), "not-configured");
      },
    ),
  );

  ok("no-server when the network call fails", () =>
    withFetch(
      async () => {
        throw new Error("offline");
      },
      async () => {
        assert.equal(await shared.fetchStripeServerStatus(), "no-server");
      },
    ),
  );

  ok("no-server when the address answers with HTML", () =>
    withFetch(
      async () => fakeResponse({ contentType: "text/html", json: null }),
      async () => {
        assert.equal(await shared.fetchStripeServerStatus(), "no-server");
      },
    ),
  );

  ok("no-server when the server answers a non-2xx", () =>
    withFetch(
      async () => fakeResponse({ ok: false, json: null }),
      async () => {
        assert.equal(await shared.fetchStripeServerStatus(), "no-server");
      },
    ),
  );
} catch (err) {
  console.error(
    `  \u26a0 stripe SKIPPED: could not load src/lib/stripe.ts in this environment\n    (${err.message})`,
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

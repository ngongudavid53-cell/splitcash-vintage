// Targeted smoke test for the Braintree client helpers
// (src/lib/braintree.ts):
//   · braintreeBaseUrl() resolution order:
//       VITE_BRAINTREE_FUNCTION_URL  >  VITE_API_URL  >  same origin (empty)
//   · fetchBraintreeServerStatus() classification:
//       "live" | "not-configured" | "no-server"
//
// The module reads import.meta.env at load time, so we bundle it with esbuild
// and inject env values via `define` — the same mechanism Vite uses.
//
// Run with:
//   node --experimental-strip-types --experimental-specifier-resolution=node \
//     tests/braintree.smoke.mjs
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

async function bundleBraintree(defines) {
  const esbuild = await import("esbuild");
  const bundled = await esbuild.build({
    entryPoints: [new URL("../src/lib/braintree.ts", import.meta.url).pathname],
    bundle: true,
    format: "esm",
    platform: "neutral",
    define: defines,
    write: false,
  });
  const dir = mkdtempSync(join(tmpdir(), "cp-bt-"));
  const file = join(dir, "bt.mjs");
  writeFileSync(file, bundled.outputFiles[0].text);
  try {
    return await import(pathToFileURL(file).href);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// Temporarily replace globalThis.fetch (the bundled module calls the global).
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

/** Backend envs unset (except the ones each case sets) — the shared module
 *  (src/lib/server.ts) reads the Convex env keys too, so they must be defined
 *  for the bundle to load. */
const NONE = {
  "import.meta.env.VITE_CONVEX_SITE_URL": "undefined",
  "import.meta.env.VITE_CONVEX_URL": "undefined",
  "import.meta.env.VITE_BRAINTREE_FUNCTION_URL": "undefined",
  "import.meta.env.VITE_API_URL": "undefined",
};

console.log("braintree base url:");
try {
  // 1) Nothing configured -> same origin (empty base URL, i.e. /api/... on the
  //    app's own domain).
  const none = await bundleBraintree(NONE);
  ok("no overrides -> same origin (empty base)", () =>
    assert.equal(none.braintreeBaseUrl(), ""));

  // 2) Only VITE_API_URL set (shared backend on another domain) -> the till
  //    uses it too, and a trailing slash is stripped.
  const shared = await bundleBraintree({
    ...NONE,
    "import.meta.env.VITE_API_URL": '"https://api.example.com/"',
  });
  ok("VITE_API_URL fallback is used", () =>
    assert.equal(shared.braintreeBaseUrl(), "https://api.example.com"));

  // 3) A dedicated till URL wins over the shared backend URL (trailing slash
  //    stripped).
  const override = await bundleBraintree({
    ...NONE,
    "import.meta.env.VITE_BRAINTREE_FUNCTION_URL": '"https://till.example.com/"',
    "import.meta.env.VITE_API_URL": '"https://api.example.com"',
  });
  ok("VITE_BRAINTREE_FUNCTION_URL wins over VITE_API_URL", () =>
    assert.equal(override.braintreeBaseUrl(), "https://till.example.com"));

  console.log("braintree server status:");

  ok("live when /api/config reports braintree:true", () =>
    withFetch(
      async (url) => {
        assert.equal(String(url), "https://till.example.com/api/config");
        return fakeResponse({ json: { braintree: true } });
      },
      async () => {
        assert.equal(await override.fetchBraintreeServerStatus(), "live");
      },
    ),
  );

  ok("not-configured when the server answers without Braintree keys", () =>
    withFetch(
      async () => fakeResponse({ json: { braintree: false } }),
      async () => {
        assert.equal(await override.fetchBraintreeServerStatus(), "not-configured");
      },
    ),
  );

  ok("no-server when the network call fails", () =>
    withFetch(
      async () => {
        throw new Error("offline");
      },
      async () => {
        assert.equal(await override.fetchBraintreeServerStatus(), "no-server");
      },
    ),
  );

  ok("no-server when the address answers with HTML (e.g. the Vite preview)", () =>
    withFetch(
      async () => fakeResponse({ contentType: "text/html", json: null }),
      async () => {
        assert.equal(await override.fetchBraintreeServerStatus(), "no-server");
      },
    ),
  );

  ok("no-server when the server answers a non-2xx", () =>
    withFetch(
      async () => fakeResponse({ ok: false, json: null }),
      async () => {
        assert.equal(await override.fetchBraintreeServerStatus(), "no-server");
      },
    ),
  );
} catch (err) {
  console.error(
    `  \u26a0 braintree SKIPPED: could not load src/lib/braintree.ts in this environment\n    (${err.message})`,
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

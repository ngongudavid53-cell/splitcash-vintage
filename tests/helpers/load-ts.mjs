// tests/helpers/load-ts.mjs
//
// Runtime loader for TypeScript modules used by the smoke tests. Lets a test
// import real src/lib/*.ts code with no build step and no duplicated loader
// glue in every test file.
//
// Strategy:
//  1. esbuild `transform()` (Vite's compiler, already in node_modules) erases
//     every type annotation — including array-of-object-literal annotations
//     that some Node type-strippers can't parse (e.g. the Freebuff
//     WebContainer's emulated Node). Relative value-imports left in the output
//     are rewritten to absolute `.ts` URLs so Node's strip-types can resolve
//     them from the temp file.
//  2. Falls back to Node's built-in `--experimental-strip-types` import.
//  3. If both fail, throws with both error messages.
//
// Run tests with the strip-types flags, e.g.:
//   node --experimental-strip-types --experimental-specifier-resolution=node \
//     tests/logic.smoke.mjs
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Import a TypeScript module at runtime.
 * @param {string | URL} sourceUrl The .ts module to load. Prefer passing a URL,
 *   e.g. `new URL("../src/lib/x.ts", import.meta.url)`, so relative imports
 *   inside the module resolve against its own directory.
 * @returns {Promise<object>} The module namespace.
 */
export async function loadTs(sourceUrl) {
  const url = sourceUrl instanceof URL ? sourceUrl : pathToFileURL(sourceUrl);
  const src = readFileSync(url, "utf8");

  // 1) esbuild transform — erases all type syntax, incl. array annotations.
  try {
    const esbuild = await import("esbuild");
    const { code } = await esbuild.transform(src, {
      loader: "ts",
      format: "esm",
      sourcefile: url.pathname.split("/").pop() || "module.ts",
    });
    const base = new URL("./", url);
    // Rewrite relative imports (./x, ../y) to absolute .ts URLs so the temp
    // copy can resolve them. Absolute and bare specifiers pass through.
    const js = code.replace(/from\s+["'](\.[^"']+)["']/g, (match, spec) => {
      const abs = new URL(spec, base);
      const resolved =
        abs.pathname.endsWith(".ts") || abs.pathname.endsWith(".tsx")
          ? abs
          : new URL(`${spec}.ts`, base);
      return `from ${JSON.stringify(resolved.href)}`;
    });

    const dir = mkdtempSync(join(tmpdir(), "load-ts-"));
    const file = join(dir, "module.mjs");
    writeFileSync(file, js);
    try {
      return await import(pathToFileURL(file).href);
    } finally {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        /* best-effort temp cleanup */
      }
    }
  } catch (esbuildErr) {
    // 2) Node's built-in TS stripping (real Node 22.12+).
    try {
      return await import(url.href);
    } catch (stripErr) {
      throw new Error(
        `loadTs: esbuild → ${esbuildErr.message}; strip-types → ${stripErr.message}`,
      );
    }
  }
}

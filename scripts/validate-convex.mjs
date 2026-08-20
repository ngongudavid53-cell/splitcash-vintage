import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(new URL("..", import.meta.url).pathname);
const config = JSON.parse(readFileSync(resolve(root, "convex.json"), "utf8"));

assert.equal(config.functions, "src/convex/", "convex.json must point at src/convex/");
assert.ok(existsSync(resolve(root, "src/convex/_generated/api.js")), "generated Convex API bindings are missing");
assert.ok(existsSync(resolve(root, "src/convex/_generated/server.js")), "generated Convex server bindings are missing");
assert.ok(existsSync(resolve(root, "src/convex/http.ts")), "Convex HTTP router is missing");
assert.ok(existsSync(resolve(root, "src/convex/stripe.ts")), "Convex Stripe actions are missing");

const result = spawnSync("npx", ["tsc", "-p", "src/convex/tsconfig.json", "--noEmit", "--pretty", "false"], {
  cwd: root,
  stdio: "inherit",
});
if (result.status !== 0) process.exit(result.status ?? 1);
console.log("Convex configuration and backend typecheck passed (deployment-independent mode).");

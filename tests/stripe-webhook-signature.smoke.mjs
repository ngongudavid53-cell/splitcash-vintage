import { strict as assert } from "node:assert";
import { createHmac } from "node:crypto";
import { validStripeSignature } from "../src/convex/stripeSignature.ts";

const secret = "whsec_test_secret";
const payload = JSON.stringify({ id: "evt_test", type: "checkout.session.completed" });
const timestamp = 1_700_000_000;
const signature = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
const validHeader = `t=${timestamp},v1=${signature},v0=legacy`;

const checks = [
  ["accepts a valid Stripe test-mode signature", validStripeSignature(payload, validHeader, secret, timestamp)],
  ["accepts a valid rotated v1 signature", validStripeSignature(payload, `t=${timestamp},v1=${"00".repeat(32)},v1=${signature}`, secret, timestamp)],
  ["rejects a tampered payload", !validStripeSignature(`${payload} `, validHeader, secret, timestamp)],
  ["rejects a wrong secret", !validStripeSignature(payload, validHeader, "whsec_wrong", timestamp)],
  ["rejects an expired timestamp", !validStripeSignature(payload, validHeader, secret, timestamp + 301)],
  ["rejects malformed signatures", !validStripeSignature(payload, `t=${timestamp},v1=not-hex`, secret, timestamp)],
];

let failed = 0;
for (const [name, passed] of checks) {
  if (passed) console.log(`  ✓ ${name}`);
  else {
    failed++;
    console.error(`  ✗ ${name}`);
  }
}

console.log(`\n${checks.length - failed} passed, ${failed} failed`);
assert.equal(failed, 0);

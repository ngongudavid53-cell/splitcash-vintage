import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const premium = readFileSync(join(root, "src/lib/premium.ts"), "utf8");
const stripe = readFileSync(join(root, "src/convex/stripe.ts"), "utf8");
const firebaseAdmin = readFileSync(join(root, "src/convex/firebaseAdmin.ts"), "utf8");
const stripeNode = readFileSync(join(root, "src/convex/stripeNode.ts"), "utf8");
const rules = readFileSync(join(root, "firestore.rules"), "utf8");

const checks = [
  ["client no longer writes premium fields", !premium.includes("setDoc(") && !premium.includes("premium: true")],
  ["grant route re-verifies Stripe", stripe.includes("paidPremiumSession(data)")],
  ["grant binds payment to user metadata", stripe.includes('data.metadata?.uid !== uid')],
  ["grant uses durable Firestore storage", stripeNode.includes("grantFirestorePremium")],
  ["entitlement store is server-side", firebaseAdmin.includes('requiredEnv("FIREBASE_PRIVATE_KEY")')],
  ["entitlement is keyed by Stripe session", firebaseAdmin.includes("stripeEntitlements") && firebaseAdmin.includes("sessionId")],
  ["client premium writes remain forbidden", rules.includes("affectedKeys().hasOnly([\"name\", \"email\"])")],
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
process.exit(failed ? 1 : 0);

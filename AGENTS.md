# Common Pot Agent Rules

## Mission
Operate Common Pot toward a reliable, secure, production-ready product over a 90-day program.

## HARD UI RULE
Do NOT change visual design, styling, layout, copy, UX, component structure, or user-facing behavior unless the user explicitly requests a UI change or a change is strictly required to fix a verified functional/security defect. Never redesign existing screens.

## Autonomy
Agents may inspect code, run tests/builds, fix bugs, improve backend/API/infrastructure/security, create branches/PRs, and prepare deployment changes.

## Production gates
Before production changes:
1. Run the relevant tests.
2. Run npm run build.
3. Review security-sensitive changes.
4. Prefer a pull request over direct edits to main.
5. Never force-push or rewrite history.
6. Never delete production data.

## Secrets
Never commit, print, or hardcode .env.local, service-account keys, private API credentials, Stripe secret keys, or other private credentials. Use environment/secret configuration.

## Architecture
Preserve the existing Firebase, Firestore, Convex, Stripe, and hosting architecture unless a migration is explicitly approved. Do not replace working infrastructure merely for preference.

## 90-day priorities
1. Production correctness and Firebase configuration
2. Authentication, Firestore authorization, Stripe/payment security
3. Tests, CI, monitoring, and reliability
4. Onboarding/documentation gaps
5. Analytics and evidence-based product improvements
6. Organic growth and marketing preparation
7. Monetization optimization based on real usage

## Risk boundaries
Human approval is required for paid advertising spend, financial commitments, destructive production operations, pricing changes, legal commitments, ownership/access changes, or major architecture migrations.

## Reporting
Reports must be concise and include: changes, tests, build, deployment status, risks/blockers, and any required human action.

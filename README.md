# Common Pot

A quiet little ledger for splitting expenses with friends — trips, flat shares,
dinner clubs and festival kits. Who paid, who owes, and the fewest transfers to
settle up. No fees, no card-linking, just arithmetic.

- **Landing** — `/` (public)
- **Auth** — `/auth` (email/password, Google, guest)
- **Your ledgers** — `/app` (protected)
- **A ledger** — `/app/g/:groupId` (protected)

## Tech stack

- Vite + React 19 + TypeScript (all routing via `react-router` v7)
- Tailwind v4 + shadcn/ui + Framer Motion
- **Firebase Auth** (email/password, Google, anonymous) + **Cloud Firestore**
  for data
- **Convex HTTP actions** (`src/convex/till.ts`) as the app's own backend —
  Gemini, Gravity ads, Stripe (premium checkout) — so API keys never reach the
  browser and there is **no separate server to deploy**
- PWA: `public/manifest.webmanifest` + a hand-written service worker
  (`public/sw.js`, registered in production builds only)

## Local development

The package manager is **npm** (Bun is not used in this project).

```bash
npm install      # first time only (node_modules ships pre-installed here)
npm run dev      # start the Vite dev server
npm test         # run all three smoke suites (logic + stripe + braintree)
npx tsc -b       # typecheck
```

## Firebase setup (required for the app to work)

Common Pot runs on Firebase Auth + Cloud Firestore. The app is fully built —
it just needs your project's web SDK config.

1. Create a Firebase project and add a **Web app**. Copy the config values.
2. In **Authentication → Sign-in method**, enable **Email/Password**, **Google**
   and **Anonymous** (guest mode).
3. In **Firestore Database**, create the database (production mode is fine) and
   publish the rules from the `firestore.rules` file in this project
   (Firestore → Rules → Publish). Without these rules Firestore refuses every
   read and the app shows a "shelves are locked" notice.
4. Paste the config into the project's **Keys / API keys** tab under:

   ```
   VITE_FIREBASE_API_KEY
   VITE_FIREBASE_AUTH_DOMAIN
   VITE_FIREBASE_PROJECT_ID
   VITE_FIREBASE_STORAGE_BUCKET   (optional)
   VITE_FIREBASE_MESSAGING_SENDER_ID (optional)
   VITE_FIREBASE_APP_ID
   ```

5. Refresh — the pot fills itself.

See `src/components/SetupNotice.tsx` for the same checklist rendered in the
app when the keys are missing.

## Monetization — what's wired up

Everything degrades gracefully: if a service isn't configured, its panel shows
exactly which key to add where instead of breaking.

| Feature | Where | Key(s) | Backend needed? |
|---|---|---|---|
| **Tip jar (Stripe)** | "Support the pot" button | `VITE_STRIPE_PAYMENT_LINK` (Keys tab) — a Payment Link with "customer sets amount" | No |
| **Premium ledger ($4.99)** | Dashboard → "The Premium Ledger" | `STRIPE_SECRET_KEY` (Keys tab); Stripe Checkout, verified server-side; unlocks CSV export on every ledger | Yes — the app's Convex backend |
| **Ask the books (Gemini)** | chat panel on each ledger | `GEMINI_API_KEY` (Keys tab) | Yes — the app's Convex backend |
| **Ads (Gravity)** | inside the chat panel | `GRAVITY_API_KEY` (Keys tab); test ads by default | Yes — the app's Convex backend |
| **Tip jar (Braintree, legacy)** | optional second tip channel | `BRAINTREE_MERCHANT_ID/PUBLIC_KEY/PRIVATE_KEY` | Only if you deploy `main.ts` |

Client-side-only fallbacks (`VITE_GEMINI_API_KEY`, `VITE_GRAVITY_API_KEY`,
`VITE_GRAVITY_FUNCTION_URL`) exist for previews without the backend — see
`.env.example` for the full key reference.

## Backend keys — no server to deploy

The paid integrations run as **HTTP actions inside this project's Convex
deployment** (`src/convex/till.ts`, routed in `src/convex/http.ts`):
`GET /api/config` (what's wired), `GET /api/stats`, `POST /api/assistant`
(Gemini, streamed over SSE), `POST /api/ad` (Gravity), `POST
/api/stripe/checkout` + `POST /api/stripe/verify` + `POST /api/stripe/grant`
(premium purchases).

To go live, paste these into the project's **Keys / API keys** tab — the
frontend auto-detects them via `/api/config`:

```
STRIPE_SECRET_KEY
GEMINI_API_KEY
GRAVITY_API_KEY
# optional: GRAVITY_PRODUCTION=true (real billed ads)
```

- No Deno Deploy, no GitHub repo, no separate server. The keys arrive
  server-side only (`process.env` in the Convex node runtime) and never reach
  the browser bundle.
- **Premium entitlement flow** — the client can never grant itself premium.
  After Stripe returns the user, the client calls `/api/stripe/grant`, which
  re-verifies the paid session server-side and returns a server-issued proof
  token (`cp-...`). The `users` rules in `firestore.rules` only accept
  `premium: true` when `premiumTx` matches that token format, so a paid
  purchase is what unlocks export — nothing the browser writes on its own.
- The client finds the backend automatically: it uses the Convex site URL
  (explicit `VITE_CONVEX_SITE_URL`, or derived from the deployment's
  `VITE_CONVEX_URL`), then falls back to a legacy `VITE_API_URL` if you've
  deployed the optional Deno/Hono server (`main.ts`) on another domain.
- Stripe test card: `4242 4242 4242 4242`, any future expiry, any CVV.

## Optional legacy server (`main.ts`)

`main.ts` is a Deno/Hono server that serves the same `/api/*` endpoints, for
setups that want a separate payments/AI proxy (e.g. the Braintree Drop-in
channel, or the app hosted somewhere with no Convex backend). It can be
deployed to Deno Deploy (entrypoint `main.ts`; `deno.json` maps the imports)
and pointed to via `VITE_API_URL`. It is optional — everything above works
without it.

## Project structure

```
src/
  pages/        Landing, Auth, Dashboard (ledger index), GroupView (a ledger), NotFound
  components/   product UI + the till (TillStatus, TillTally, PremiumCard/Dialog,
                StripeSetupNote, BraintreeTipJar, SupportPot, AskTheBooks, ExportLedger, ...)
  lib/          firebase/firestore (data), money/balances/codes (the maths),
                assistant (Gemini brief), gravity (ads), stripe (premium checkout),
                braintree (legacy), premium, server (backend client + config hook),
                csv (export builder)
  hooks/        use-auth, use-realtime (reactive Firestore), use-assistant, ...
  convex/       the app's own backend: till.ts (http actions) + auth + schema
main.ts         optional legacy Deno/Hono server (same endpoints, not required)
firestore.rules security rules — publish these to your Firebase project
tests/          logic.smoke.mjs (balances/codes/assistant/csv) + stripe.smoke.mjs +
                braintree.smoke.mjs
scripts/        gen-assets.mjs (regenerates public/og.png + icon PNGs from the brand glyph)
```

## Tests

```bash
npm test
```

Runs `tests/logic.smoke.mjs` (money, codes, balances, settle-up, assistant
brief, CSV export), `tests/stripe.smoke.mjs` (base-URL resolution and
server-status classification) and `tests/braintree.smoke.mjs` (legacy till
helpers). The suites bundle real `src/lib/*` modules with esbuild so the maths
you ship is the maths that's tested.

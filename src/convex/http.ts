import { httpRouter } from "convex/server";
import { auth } from "./auth";
import * as till from "./till";
import * as stripe from "./stripe";

const http = httpRouter();

auth.addHttpRoutes(http);

// The till — the app's own backend (config, stats, Gemini assistant, Gravity
// ads, and non-payment integrations). Stripe uses the dedicated durable
// entitlement actions in ./stripe.
const TILL_ROUTES = [
  { method: "GET", path: "/api/config", handler: till.config },
  { method: "GET", path: "/api/stats", handler: till.statsHandler },
  { method: "POST", path: "/api/assistant", handler: till.assistant },
  { method: "POST", path: "/api/scan-receipt", handler: till.scanReceipt },
  { method: "POST", path: "/api/ad", handler: till.ad },
] as const;

const STRIPE_ROUTES = [
  { method: "POST", path: "/api/stripe/checkout", handler: stripe.checkout },
  { method: "POST", path: "/api/stripe/verify", handler: stripe.verify },
  { method: "POST", path: "/api/stripe/grant", handler: stripe.grant },
] as const;

for (const route of [...TILL_ROUTES, ...STRIPE_ROUTES]) {
  http.route(route);
  http.route({ method: "OPTIONS", path: route.path, handler: till.preflight });
}

export default http;

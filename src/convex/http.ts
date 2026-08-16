import { httpRouter } from "convex/server";
import { auth } from "./auth";
import * as till from "./till";

const http = httpRouter();

auth.addHttpRoutes(http);

// The till — the app's own backend (config, stats, Gemini assistant, Gravity
// ads, Stripe premium checkout). Convex doesn't add CORS headers on its own,
// so every path also gets an OPTIONS preflight route (see ./till).
const TILL_ROUTES = [
  { method: "GET", path: "/api/config", handler: till.config },
  { method: "GET", path: "/api/stats", handler: till.statsHandler },
  { method: "POST", path: "/api/assistant", handler: till.assistant },
  { method: "POST", path: "/api/ad", handler: till.ad },
  { method: "POST", path: "/api/stripe/checkout", handler: till.stripeCheckout },
  { method: "POST", path: "/api/stripe/verify", handler: till.stripeVerify },
  { method: "POST", path: "/api/stripe/grant", handler: till.stripeGrant },
] as const;

for (const route of TILL_ROUTES) {
  http.route(route);
  http.route({ method: "OPTIONS", path: route.path, handler: till.preflight });
}

export default http;

import { httpRouter } from "convex/server";
import { auth } from "./auth";
import * as till from "./till";
import * as stripe from "./stripe";

const http = httpRouter();
auth.addHttpRoutes(http);

const TILL_ROUTES = [
  { method: "GET", path: "/api/config", handler: till.config },
  { method: "GET", path: "/api/stats", handler: till.statsHandler },
  { method: "POST", path: "/api/assistant", handler: till.assistant },
  { method: "POST", path: "/api/scan-receipt", handler: till.scanReceipt },
  { method: "POST", path: "/api/ad", handler: till.ad },
] as const;

const STRIPE_ROUTES = [
  { method: "GET", path: "/api/stripe/status", handler: stripe.status },
  { method: "POST", path: "/api/stripe/checkout", handler: stripe.checkout },
  { method: "POST", path: "/api/stripe/verify", handler: stripe.verify },
  { method: "POST", path: "/api/stripe/webhook", handler: stripe.webhook },
] as const;

for (const route of [...TILL_ROUTES, ...STRIPE_ROUTES]) {
  http.route(route);
  http.route({ method: "OPTIONS", path: route.path, handler: till.preflight });
}

export default http;

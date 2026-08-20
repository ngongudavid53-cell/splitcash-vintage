"use node";

import { createHmac, timingSafeEqual } from "node:crypto";

/** Verify Stripe's signed raw webhook payload within the five-minute tolerance. */
export function validStripeSignature(payload: string, header: string, secret: string, nowSeconds = Date.now() / 1000): boolean {
  const values = new Map<string, string[]>();
  for (const part of header.split(",")) {
    const separator = part.indexOf("=");
    if (separator <= 0) continue;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    values.set(key, [...(values.get(key) ?? []), value]);
  }

  const timestamp = Number(values.get("t")?.[0]);
  if (!Number.isSafeInteger(timestamp) || Math.abs(nowSeconds - timestamp) > 300) return false;

  const expected = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  const expectedBytes = Buffer.from(expected, "hex");
  return (values.get("v1") ?? []).some((signature) => {
    if (!/^[0-9a-f]{64}$/i.test(signature)) return false;
    const actual = Buffer.from(signature, "hex");
    return actual.length === expectedBytes.length && timingSafeEqual(expectedBytes, actual);
  });
}

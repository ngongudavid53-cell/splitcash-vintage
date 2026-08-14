const moneyFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

/** Round to the nearest cent, floating-point drift be damned. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function formatMoney(n: number): string {
  return moneyFmt.format(round2(n));
}

/** Parse a user-typed amount ("42", "$42.50", "42,5", "1,234.56") into
 *  dollars, or null when it isn't a positive number. A comma is treated as a
 *  decimal separator only when it has 1–2 digits after it (e.g. "42,50");
 *  otherwise commas are thousands separators and are removed. */
export function parseAmount(raw: string): number | null {
  const s = raw.trim().replace(/[$\s]/g, "");
  if (!s) return null;
  const cleaned = /^\d+(\.\d+)?,\d{1,2}$/.test(s)
    ? s.replace(",", ".")
    : s.replace(/,/g, "");
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0) return null;
  return round2(n);
}

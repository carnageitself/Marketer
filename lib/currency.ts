// lib/currency.ts — currency list and formatting, shared by server and browser.

/** Currencies the ECB publishes daily rates for: what an owner can report revenue in. */
export const CURRENCIES = [
  "USD", "EUR", "GBP", "INR", "CAD", "AUD", "NZD", "JPY", "CNY", "HKD", "SGD", "CHF", "SEK", "NOK", "DKK",
  "PLN", "CZK", "HUF", "RON", "BRL", "MXN", "ZAR", "KRW", "IDR", "MYR", "PHP", "THB", "TRY", "ILS", "ISK",
] as const;

/** "$1,234" / "$12.50" / "₹4,999". Whole units from 100 up, cents below. */
export function money(v: number | null | undefined, currency = "USD"): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: Math.abs(v) >= 100 ? 0 : 2, minimumFractionDigits: 0 }).format(v);
  } catch {
    return `${currency} ${v.toFixed(2)}`;
  }
}

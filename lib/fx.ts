// lib/fx.ts
// Currency conversion with the European Central Bank's daily reference rates
// (free, no key; ~30 major currencies). Rates are cached in fx_rates and in
// memory and refreshed at most every 6 hours, so recording a sale never waits
// on the network for long and keeps working if the ECB is unreachable.
import "server-only";
import { one, q } from "./db";

export { CURRENCIES } from "./currency";

type Rates = Record<string, number>;
// Used only until the first successful fetch (or if the ECB is down on day one).
const FALLBACK: Rates = { EUR: 1, USD: 1.12, GBP: 0.84, INR: 94, CAD: 1.55, AUD: 1.6, JPY: 177, CHF: 0.93, SEK: 11.2, NOK: 10.6, DKK: 7.47, PLN: 4.37, BRL: 6.1, MXN: 20.5, SGD: 1.45, NZD: 1.85 };

let cache: { rates: Rates; at: number } | null = null;
const FRESH_MS = 6 * 3_600_000;

async function fetchEcb(): Promise<Rates | null> {
  try {
    const res = await fetch("https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml", { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const xml = await res.text();
    const rates: Rates = { EUR: 1 };
    for (const m of xml.matchAll(/currency='([A-Z]{3})'\s+rate='([\d.]+)'/g)) rates[m[1]] = Number(m[2]);
    return rates.USD ? rates : null;
  } catch { return null; }
}

/** Latest rates per 1 EUR. */
export async function rates(): Promise<Rates> {
  if (cache && Date.now() - cache.at < FRESH_MS) return cache.rates;
  const stored = await one<{ day: string; rates: Rates }>("select day::text as day, rates from fx_rates order by day desc limit 1");
  const today = new Date().toISOString().slice(0, 10);
  if (stored?.day === today) { cache = { rates: stored.rates, at: Date.now() }; return stored.rates; }
  const fresh = await fetchEcb();
  if (fresh) {
    await q("insert into fx_rates (day, rates) values ($1, $2::text::jsonb) on conflict (day) do update set rates = excluded.rates", [today, JSON.stringify(fresh)]);
    cache = { rates: fresh, at: Date.now() };
    return fresh;
  }
  const r = stored?.rates ?? FALLBACK;
  cache = { rates: r, at: Date.now() - FRESH_MS + 600_000 }; // retry in 10 min
  return r;
}

export const isCurrency = (c: unknown): c is string => typeof c === "string" && /^[A-Z]{3}$/.test(c);

/** Converts between currencies. Unknown currencies are treated as `fallback` (the site's own). */
export function convert(amount: number, from: string, to: string, r: Rates, fallback = to): number {
  const f = r[from] ?? r[fallback] ?? 1, t = r[to] ?? 1;
  return (amount / f) * t;
}

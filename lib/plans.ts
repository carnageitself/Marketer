// lib/plans.ts
// The three plans: what each costs, its limits, and what it unlocks. Shared by
// the server (enforcement) and the pricing pages, so the two can't drift.
//
// Pricing logic: limits are on monthly page views because that's what drives
// our cost (every view is several database writes). Pro matches Plausible's
// price for 100k views but adds section analytics; Premium sits at Hotjar's
// entry price with 10× the traffic.

export type PlanId = "free" | "pro" | "premium";
export type Interval = "month" | "year";

export interface Plan {
  id: PlanId;
  name: string;
  tagline: string;
  /** USD per month, billed monthly / billed yearly. */
  price: { month: number; year: number };
  limits: { sites: number; pageviews: number; historyDays: number; /** teammates besides the owner */ members: number };
  /** Feature gates checked in the app. */
  can: { replay: boolean; converters: boolean; allInsights: boolean; /** revenue by section and source */ revenueDetail: boolean };
  features: string[];
  soon?: string[];
}

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free", name: "Free", tagline: "See what your website is doing.",
    price: { month: 0, year: 0 },
    limits: { sites: 1, pageviews: 10_000, historyDays: 30, members: 0 },
    can: { replay: false, converters: false, allInsights: false, revenueDetail: false },
    features: [
      "1 website, 10k page views a month",
      "30 days of history",
      "Traffic, sources, pages and scroll depth",
      "Section reading funnel",
      "Total revenue and revenue per visitor",
      "Top 3 “what to fix next” insights",
      "Automatic setup, no cookie banner",
    ],
  },
  pro: {
    id: "pro", name: "Pro", tagline: "Find out what makes visitors convert.",
    price: { month: 19, year: 15 },
    limits: { sites: 5, pageviews: 100_000, historyDays: 730, members: 3 },
    can: { replay: true, converters: true, allInsights: true, revenueDetail: true },
    features: [
      "5 websites, 100k page views a month",
      "2 years of history",
      "Everything in Free",
      "Which sections drive conversions",
      "Revenue by section, source and page",
      "What converters do differently",
      "Every “what to fix next” insight",
      "Visit replay, page by page",
      "Unlimited conversion goals",
      "Invite 3 teammates with roles",
    ],
  },
  premium: {
    id: "premium", name: "Premium", tagline: "Tie every section to revenue.",
    price: { month: 49, year: 39 },
    limits: { sites: 20, pageviews: 1_000_000, historyDays: 1825, members: 25 },
    can: { replay: true, converters: true, allInsights: true, revenueDetail: true },
    features: [
      "20 websites, 1M page views a month",
      "5 years of history",
      "Everything in Pro",
      "Invite up to 25 teammates",
      "Priority email support",
    ],
    soon: ["Refund-accurate revenue (Stripe, Paddle, Shopify)", "AI-written fixes for weak sections", "A/B test a section"],
  },
};

export const PLAN_ORDER: PlanId[] = ["free", "pro", "premium"];

export const planOf = (id: string | null | undefined): Plan => PLANS[(id as PlanId) in PLANS ? (id as PlanId) : "free"];

/** Report ranges each plan can open, by days of history. */
export const RANGE_DAYS: Record<string, number> = { "24h": 1, "7d": 7, "30d": 30, "90d": 90 };

export const fmtViews = (n: number) => (n >= 1_000_000 ? `${n / 1_000_000}M` : n >= 1000 ? `${n / 1000}k` : String(n));

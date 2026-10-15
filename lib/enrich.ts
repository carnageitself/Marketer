// lib/enrich.ts
// Everything the collector derives from the request rather than trusting the
// browser: device/browser/OS, country, traffic source and channel.
// Ported from the Preciprocal landing-page collector.
import "server-only";

export function parseUa(ua: string) {
  const is = (re: RegExp) => re.test(ua);
  const device = !ua || is(/\bbot\b|crawler|spider|crawling|headless|lighthouse|pagespeed|preview|facebookexternalhit|slurp|python-requests|curl\/|wget|axios|node-fetch|go-http-client/i)
    ? "bot"
    : is(/\biPad\b|\bTablet\b|\bPlayBook\b|\bSilk\b|Android(?!.*Mobile)/i) ? "tablet"
    : is(/Mobi|Android|iPhone|iPod|Windows Phone|webOS|BlackBerry/i) ? "mobile"
    : "desktop";

  let browser = "Other";
  if (/Edg(?:e|A|iOS)?\//.test(ua)) browser = "Edge";
  else if (/OPR\/|Opera\//.test(ua)) browser = "Opera";
  else if (/SamsungBrowser\//.test(ua)) browser = "Samsung Internet";
  else if (/Firefox\/|FxiOS/.test(ua)) browser = "Firefox";
  else if (/Chrome\/|CriOS/.test(ua)) browser = "Chrome";
  else if (/Safari/.test(ua)) browser = "Safari";

  const os = is(/Windows/) ? "Windows"
    : is(/iPhone|iPad|iPod/) ? "iOS"
    : is(/Mac OS X/) ? "macOS"
    : is(/Android/) ? "Android"
    : is(/CrOS/) ? "ChromeOS"
    : is(/Linux/) ? "Linux"
    : "Other";

  return { device, browser, os };
}

export function clientIp(h: Headers): string {
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return h.get("x-real-ip") || h.get("cf-connecting-ip") || "unknown";
}

function safeDecode(v: string | null) {
  if (!v) return null;
  try { return decodeURIComponent(v); } catch { return v; }
}

/** Set at the edge by Vercel or Cloudflare; null when running elsewhere. */
export function geo(h: Headers) {
  return {
    country: h.get("x-vercel-ip-country") || h.get("cf-ipcountry") || null,
    region: h.get("x-vercel-ip-country-region") || null,
    city: safeDecode(h.get("x-vercel-ip-city")),
  };
}

const SOURCES: Array<[RegExp, string, string]> = [
  [/(^|\.)google\./, "Google", "organic"],
  [/(^|\.)bing\./, "Bing", "organic"],
  [/duckduckgo\./, "DuckDuckGo", "organic"],
  [/(^|\.)yahoo\./, "Yahoo", "organic"],
  [/ecosia\./, "Ecosia", "organic"],
  [/search\.brave\./, "Brave Search", "organic"],
  [/baidu\./, "Baidu", "organic"],
  [/yandex\./, "Yandex", "organic"],
  [/chatgpt\.com|chat\.openai\.com/, "ChatGPT", "ai"],
  [/perplexity\./, "Perplexity", "ai"],
  [/claude\.ai/, "Claude", "ai"],
  [/gemini\.google\./, "Gemini", "ai"],
  [/copilot\.microsoft\./, "Copilot", "ai"],
  [/lnkd\.in|linkedin\./, "LinkedIn", "social"],
  [/(^|\.)t\.co$|twitter\.com|(^|\.)x\.com$/, "X", "social"],
  [/facebook\.|fb\.me|fb\.com/, "Facebook", "social"],
  [/instagram\./, "Instagram", "social"],
  [/reddit\.|redd\.it/, "Reddit", "social"],
  [/tiktok\./, "TikTok", "social"],
  [/youtube\.|youtu\.be/, "YouTube", "social"],
  [/pinterest\./, "Pinterest", "social"],
  [/threads\.net/, "Threads", "social"],
  [/discord\./, "Discord", "social"],
  [/(^|\.)t\.me$|telegram\./, "Telegram", "social"],
  [/whatsapp\./, "WhatsApp", "social"],
  [/news\.ycombinator\./, "Hacker News", "social"],
  [/quora\./, "Quora", "social"],
  [/medium\./, "Medium", "referral"],
  [/substack\./, "Substack", "referral"],
  [/github\./, "GitHub", "referral"],
  [/producthunt\./, "Product Hunt", "referral"],
  [/mail\.google\.|outlook\.|mail\.yahoo\.|mail\.proton/, "Webmail", "email"],
];

/** utm_source=linkedin → "LinkedIn", so tagged and untagged traffic group together. */
export function prettySource(utm: string): string {
  const u = utm.toLowerCase();
  const known = SOURCES.find(([re, name]) => name.toLowerCase() === u || re.test(`${u}.com`));
  return known ? known[1] : utm;
}

export function sourceOf(host: string | null): { name: string | null; channel: string | null } {
  if (!host) return { name: null, channel: null };
  for (const [re, name, channel] of SOURCES) if (re.test(host)) return { name, channel };
  return { name: host, channel: "referral" };
}

/** utm_medium wins (the campaign owner said so), then the referrer, then direct. */
export function channelOf(host: string | null, medium: string | null, source: string | null, paidClickId: boolean): string {
  const m = (medium || "").toLowerCase();
  if (m.includes("cpc") || m.includes("ppc") || m.includes("paid") || m.includes("display")) return "paid";
  if (m.includes("email") || m.includes("newsletter")) return "email";
  if (m.includes("social")) return "social";
  if (m.includes("affiliate")) return "affiliate";
  if (m.includes("referral")) return "referral";
  if (m.includes("organic")) return "organic";
  if (paidClickId) return "paid";
  const r = sourceOf(host).channel;
  if (r) return r;
  return source ? "campaign" : "direct";
}

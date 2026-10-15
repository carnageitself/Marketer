// lib/dns/detect.ts
// Looks a domain up the way a person would when setting things up by hand:
//   nameservers  → who runs its DNS (and so whether we can edit it by API)
//   A / CNAME    → where the site is hosted
//   homepage     → what it is built with, and whether our script is already on it
// Uses public resolvers directly so results don't depend on the local cache.
import "server-only";
import { Resolver } from "node:dns/promises";
import type { ScanResult } from "../sites";

export function resolver() {
  const r = new Resolver({ timeout: 4000, tries: 2 });
  r.setServers(["1.1.1.1", "8.8.8.8"]);
  return r;
}

const settle = async <T>(p: Promise<T>, fallback: T) => { try { return await p; } catch { return fallback; } };

/** Nameserver pattern → DNS provider. `auto` = we can create records through its API. */
export const DNS_PROVIDERS: Array<{ re: RegExp; id: string; name: string; auto: boolean }> = [
  { re: /\.ns\.cloudflare\.com$/, id: "cloudflare", name: "Cloudflare", auto: true },
  { re: /domaincontrol\.com$/, id: "godaddy", name: "GoDaddy", auto: true },
  { re: /vercel-dns\.com$/, id: "vercel", name: "Vercel", auto: true },
  { re: /digitalocean\.com$/, id: "digitalocean", name: "DigitalOcean", auto: true },
  { re: /netlifydns\.com$/, id: "netlify", name: "Netlify", auto: true },
  { re: /awsdns/, id: "route53", name: "Amazon Route 53", auto: false },
  { re: /googledomains\.com$|google\.com$/, id: "google", name: "Google Cloud DNS / Squarespace Domains", auto: false },
  { re: /registrar-servers\.com$/, id: "namecheap", name: "Namecheap", auto: false },
  { re: /dns-parking\.com$|hostinger/, id: "hostinger", name: "Hostinger", auto: false },
  { re: /squarespacedns\.com$/, id: "squarespace", name: "Squarespace", auto: false },
  { re: /wixdns\.net$/, id: "wix", name: "Wix", auto: false },
  { re: /wordpress\.com$/, id: "wordpresscom", name: "WordPress.com", auto: false },
  { re: /ui-dns\.|ionos/, id: "ionos", name: "IONOS", auto: false },
  { re: /porkbun\.com$/, id: "porkbun", name: "Porkbun", auto: false },
  { re: /name\.com$/, id: "namecom", name: "Name.com", auto: false },
  { re: /dnsimple/, id: "dnsimple", name: "DNSimple", auto: false },
  { re: /gandi\.net$/, id: "gandi", name: "Gandi", auto: false },
  { re: /hover\.com$/, id: "hover", name: "Hover", auto: false },
  { re: /bluehost\.com$/, id: "bluehost", name: "Bluehost", auto: false },
  { re: /hostgator/, id: "hostgator", name: "HostGator", auto: false },
  { re: /siteground/, id: "siteground", name: "SiteGround", auto: false },
  { re: /azure-dns/, id: "azure", name: "Azure DNS", auto: false },
  { re: /zoho/, id: "zoho", name: "Zoho", auto: false },
  // Last: NS1 also powers Netlify DNS (dns1.p0X.nsone.net), so scanDomain
  // upgrades this to Netlify when the site is hosted there.
  { re: /nsone\.net$/, id: "nsone", name: "NS1", auto: false },
];

/** Where to click in each provider's dashboard when records are added by hand. */
export const DNS_PROVIDER_LINKS: Record<string, string> = {
  cloudflare: "https://dash.cloudflare.com/?to=/:account/:zone/dns/records",
  godaddy: "https://dcc.godaddy.com/control/portfolio",
  vercel: "https://vercel.com/dashboard/domains",
  digitalocean: "https://cloud.digitalocean.com/networking/domains",
  netlify: "https://app.netlify.com/teams/-/dns",
  route53: "https://console.aws.amazon.com/route53/v2/hostedzones",
  namecheap: "https://ap.www.namecheap.com/domains/list/",
  hostinger: "https://hpanel.hostinger.com/domains",
  squarespace: "https://account.squarespace.com/domains",
  wix: "https://manage.wix.com/account/domains",
  porkbun: "https://porkbun.com/account/domainsSpeedy",
  ionos: "https://my.ionos.com/domains",
};

function hostFrom(records: ScanResult["records"], headers: Headers | null): ScanResult["host"] {
  const all = [...records.cname, ...records.wwwCname].join(" ");
  const a = records.a;
  const hv = (k: string) => headers?.get(k) ?? "";
  const server = hv("server").toLowerCase();
  if (hv("x-vercel-id") || /vercel/.test(all) || a.some(ip => ip === "76.76.21.21" || ip.startsWith("216.198.79."))) return { id: "vercel", name: "Vercel" };
  if (hv("x-nf-request-id") || /netlify/.test(all) || server.includes("netlify")) return { id: "netlify", name: "Netlify" };
  if (/shopify/.test(all) || hv("x-shopid") || a.some(ip => ip.startsWith("23.227.38."))) return { id: "shopify", name: "Shopify" };
  if (/wixdns|wix/.test(all) || hv("x-wix-request-id")) return { id: "wix", name: "Wix" };
  if (/squarespace/.test(all) || a.some(ip => ip.startsWith("198.185.159.") || ip.startsWith("198.49.23."))) return { id: "squarespace", name: "Squarespace" };
  if (/webflow/.test(all) || a.some(ip => ip.startsWith("75.2.70.") || ip.startsWith("99.83.190."))) return { id: "webflow", name: "Webflow" };
  if (/github\.io/.test(all) || a.some(ip => ip.startsWith("185.199.10"))) return { id: "github", name: "GitHub Pages" };
  if (/framer/.test(all)) return { id: "framer", name: "Framer" };
  if (/wpengine/.test(all) || hv("x-powered-by").toLowerCase().includes("wp engine")) return { id: "wpengine", name: "WP Engine" };
  if (/wordpress\.com|wp\.com/.test(all)) return { id: "wordpresscom", name: "WordPress.com" };
  if (/herokudns|herokuapp/.test(all)) return { id: "heroku", name: "Heroku" };
  if (/pages\.dev/.test(all)) return { id: "cfpages", name: "Cloudflare Pages" };
  if (/amplifyapp|cloudfront/.test(all) || hv("x-amz-cf-id")) return { id: "aws", name: "AWS" };
  if (/firebaseapp|web\.app/.test(all) || a.some(ip => ip.startsWith("199.36.158."))) return { id: "firebase", name: "Firebase Hosting" };
  if (/ghost\.io/.test(all)) return { id: "ghost", name: "Ghost(Pro)" };
  if (/hubspot/.test(all)) return { id: "hubspot", name: "HubSpot" };
  if (server.includes("litespeed")) return { id: "litespeed", name: "LiteSpeed host (e.g. Hostinger)" };
  if (server.includes("nginx") || server.includes("apache")) return { id: "server", name: `Own server (${server.split("/")[0]})` };
  return null;
}

function platformFrom(html: string, headers: Headers | null): ScanResult["platform"] {
  const has = (re: RegExp) => re.test(html);
  const gen = (html.match(/<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)/i)?.[1] ?? "").toLowerCase();
  if (gen.includes("wordpress") || has(/\/wp-content\/|\/wp-includes\//)) return { id: "wordpress", name: "WordPress" };
  if (has(/cdn\.shopify\.com|Shopify\.theme/)) return { id: "shopify", name: "Shopify" };
  if (has(/static\.wixstatic\.com|wix-code|_wixCIDX/) || headers?.get("x-wix-request-id")) return { id: "wix", name: "Wix" };
  if (has(/static1\.squarespace\.com|squarespace-cdn/)) return { id: "squarespace", name: "Squarespace" };
  if (has(/data-wf-page|data-wf-site|webflow\.js/)) return { id: "webflow", name: "Webflow" };
  if (has(/framerusercontent\.com|data-framer/)) return { id: "framer", name: "Framer" };
  if (gen.includes("ghost")) return { id: "ghost", name: "Ghost" };
  if (has(/hs-scripts\.com|hubspot/i) && has(/hs-sites|hubfs/)) return { id: "hubspot", name: "HubSpot CMS" };
  if (gen.includes("drupal") || has(/\/sites\/default\/files\//)) return { id: "drupal", name: "Drupal" };
  if (gen.includes("joomla")) return { id: "joomla", name: "Joomla" };
  if (has(/\/_next\/static\/|__NEXT_DATA__|next-route-announcer/)) return { id: "nextjs", name: "Next.js" };
  if (has(/__NUXT__|\/_nuxt\//)) return { id: "nuxt", name: "Nuxt" };
  if (has(/___gatsby/)) return { id: "gatsby", name: "Gatsby" };
  if (has(/astro-island|\/_astro\//)) return { id: "astro", name: "Astro" };
  if (gen.includes("hugo")) return { id: "hugo", name: "Hugo" };
  if (has(/<div id=["'](root|app)["']><\/div>/)) return { id: "spa", name: "React / Vue single-page app" };
  if (html) return { id: "html", name: "HTML / custom site" };
  return null;
}

function isPrivateIp(ip: string): boolean {
  if (ip.includes(":")) return /^(::1|::|fc|fd|fe80|::ffff:(10|127|169\.254|192\.168)\.)/i.test(ip);
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

/**
 * GET a customer's page without letting a typed-in domain reach our own
 * network: every hop's host must resolve only to public addresses, and
 * redirects are followed by hand so each one is checked.
 */
export async function safeFetch(url: string, init: RequestInit = {}, hops = 4): Promise<Response> {
  const r = resolver();
  let current = url;
  for (let i = 0; i <= hops; i++) {
    const u = new URL(current);
    if (!/^https?:$/.test(u.protocol)) throw new Error("Only http(s) is allowed");
    const ips = [...await settle(r.resolve4(u.hostname), [] as string[]), ...await settle(r.resolve6(u.hostname), [] as string[])];
    if (!ips.length) throw new Error(`${u.hostname} does not resolve`);
    if (ips.some(isPrivateIp)) throw new Error(`${u.hostname} points to a private address`);
    const res = await fetch(current, { ...init, redirect: "manual" });
    const loc = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && loc) { current = new URL(loc, current).toString(); continue; }
    Object.defineProperty(res, "url", { value: current });
    return res;
  }
  throw new Error("Too many redirects");
}

/** Full scan of a domain. Never throws; failures are reported in the result. */
export async function scanDomain(domain: string, siteId: string): Promise<ScanResult> {
  const r = resolver();
  const [ns, a, cname, wwwCname] = await Promise.all([
    settle(r.resolveNs(domain), [] as string[]),
    settle(r.resolve4(domain), [] as string[]),
    settle(r.resolveCname(domain), [] as string[]),
    settle(r.resolveCname(`www.${domain}`), [] as string[]),
  ]);
  const nameservers = ns.map(n => n.toLowerCase()).sort();
  const p = DNS_PROVIDERS.find(x => nameservers.some(n => x.re.test(n)));
  let dnsProvider = nameservers.length
    ? { id: p?.id ?? "other", name: p?.name ?? (nameservers[0].split(".").slice(-2).join(".")), auto: p?.auto ?? false, nameservers }
    : null;
  const records = { a, cname: cname.map(c => c.toLowerCase()), wwwCname: wwwCname.map(c => c.toLowerCase()) };

  let html = "";
  let headers: Headers | null = null;
  let finalUrl: string | undefined;
  let error: string | undefined;
  for (const url of [`https://${domain}/`, `https://www.${domain}/`, `http://${domain}/`]) {
    try {
      const res = await safeFetch(url, {
        signal: AbortSignal.timeout(8000),
        headers: { "user-agent": "Mozilla/5.0 (compatible; PagewiseSetup/1.0; +site-scan)", accept: "text/html" },
      });
      headers = res.headers;
      finalUrl = res.url;
      html = (await res.text()).slice(0, 600_000);
      error = undefined;
      break;
    } catch (e) {
      error = e instanceof Error ? (e.cause instanceof Error ? e.cause.message : e.message) : String(e);
    }
  }
  if (!nameservers.length && !a.length && !html) error = error ?? "Domain does not resolve";
  const host = hostFrom(records, headers);
  if (dnsProvider?.id === "nsone" && host?.id === "netlify") dnsProvider = { ...dnsProvider, id: "netlify", name: "Netlify", auto: true };

  return {
    scannedAt: new Date().toISOString(),
    reachable: !!html,
    finalUrl,
    dnsProvider,
    host,
    platform: platformFrom(html, headers),
    cloudflareProxied: !!headers?.get("cf-ray") && dnsProvider?.id === "cloudflare",
    scriptFound: html.includes(`data-site="${siteId}"`) || html.includes(`data-site='${siteId}'`),
    records,
    error,
  };
}

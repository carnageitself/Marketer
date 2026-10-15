// lib/dns/domainconnect.ts
// Domain Connect (https://www.domainconnect.org): the customer signs in at
// their own DNS provider (GoDaddy, IONOS, Vercel, NameSilo, WordPress.com…)
// and approves our records there. No API token is pasted and we never see
// their credentials.
//
// Flow (synchronous, signed):
//   1. discover()  TXT _domainconnect.<zone> → the provider's API host →
//                  GET https://<host>/v2/<zone>/settings
//   2. supports()  GET <urlAPI>/v2/domainTemplates/providers/<us>/services/<svc>
//                  is 200 once that provider has onboarded our template
//                  (domain-connect/*.json, see scripts/domain-connect.mjs)
//   3. applyUrl()  <urlSyncUX>/v2/domainTemplates/providers/<us>/services/<svc>/apply?…&sig=&key=
//                  The query is signed with our private key; the provider checks
//                  it against the public key we publish at <key>.<our domain>.
//   4. The provider redirects back to redirect_uri with our state (or error).
//
// Configured with DOMAIN_CONNECT_PROVIDER_ID, DOMAIN_CONNECT_SERVICE_ID,
// DOMAIN_CONNECT_PRIVATE_KEY and DOMAIN_CONNECT_KEY_ID. Without them nothing
// here is offered and setup falls back to API tokens / copy-paste records.
import "server-only";
import { createSign } from "node:crypto";
import { resolver, safeFetch } from "./detect";

export interface DcSettings { providerId: string; providerName: string; providerDisplayName?: string; urlSyncUX?: string; urlAPI: string }
export interface DcTarget { zone: string; host: string; settings: DcSettings }

export function dcConfig() {
  const providerId = process.env.DOMAIN_CONNECT_PROVIDER_ID;
  const serviceId = process.env.DOMAIN_CONNECT_SERVICE_ID;
  const privateKey = process.env.DOMAIN_CONNECT_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const keyId = process.env.DOMAIN_CONNECT_KEY_ID;
  return providerId && serviceId && privateKey && keyId ? { providerId, serviceId, privateKey, keyId } : null;
}

async function getJson(url: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await safeFetch(url, { signal: AbortSignal.timeout(6000), headers: { accept: "application/json" } });
    return res.ok ? (await res.json()) as Record<string, unknown> : null;
  } catch { return null; }
}

/**
 * Finds the DNS provider's Domain Connect endpoint. Walks up from the site's
 * domain to its zone (blog.example.com → example.com), since the record
 * lives at the zone apex.
 */
export async function discover(domain: string): Promise<DcTarget | null> {
  const labels = domain.split(".");
  for (let i = 0; i <= labels.length - 2; i++) {
    const zone = labels.slice(i).join(".");
    const txt = await resolver().resolveTxt(`_domainconnect.${zone}`).catch(() => [] as string[][]);
    const apiHost = txt[0]?.join("").trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
    if (!apiHost) continue;
    const s = await getJson(`https://${apiHost}/v2/${zone}/settings`);
    if (!s || typeof s.urlAPI !== "string" || typeof s.providerId !== "string") return null;
    return {
      zone, host: labels.slice(0, i).join("."),
      settings: {
        providerId: s.providerId, providerName: String(s.providerDisplayName ?? s.providerName ?? s.providerId),
        urlSyncUX: typeof s.urlSyncUX === "string" ? s.urlSyncUX : undefined, urlAPI: s.urlAPI.replace(/\/$/, ""),
      },
    };
  }
  return null;
}

/** True once this DNS provider has onboarded our template and offers the sign-in flow. */
export async function supports(settings: DcSettings): Promise<boolean> {
  const cfg = dcConfig();
  if (!cfg || !settings.urlSyncUX) return false;
  return !!(await getJson(`${settings.urlAPI}/v2/domainTemplates/providers/${cfg.providerId}/services/${cfg.serviceId}`));
}

/** The signed link that opens the provider's sign-in + approve screen. */
export function applyUrl(t: DcTarget, opts: { vars: Record<string, string>; groups: string[]; redirectUri: string; state: string }): string {
  const cfg = dcConfig();
  if (!cfg || !t.settings.urlSyncUX) throw new Error("Domain Connect isn't configured");
  const qs = new URLSearchParams({ domain: t.zone });
  if (t.host) qs.set("host", t.host);
  for (const [k, v] of Object.entries(opts.vars)) qs.set(k, v);
  qs.set("groupId", opts.groups.join(","));
  qs.set("redirect_uri", opts.redirectUri);
  qs.set("state", opts.state);
  const query = qs.toString();
  const sig = createSign("RSA-SHA256").update(query).sign(cfg.privateKey, "base64");
  return `${t.settings.urlSyncUX.replace(/\/$/, "")}/v2/domainTemplates/providers/${cfg.providerId}/services/${cfg.serviceId}/apply?${query}` +
    `&sig=${encodeURIComponent(sig)}&key=${encodeURIComponent(cfg.keyId)}`;
}

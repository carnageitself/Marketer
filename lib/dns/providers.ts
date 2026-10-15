// lib/dns/providers.ts
// Writes our DNS records straight into the customer's DNS provider, using an
// API token they paste once. Tokens are used for the one request and never
// stored.
//
// Records we create:
//   TXT   _pagewise.<domain>  "pagewise-verify=<token>"   proves ownership
//   CNAME <sub>.<domain>      → CNAME_TARGET                 first-party tracker
//                                                            (ad blockers skip it)
// Existing records are never changed or deleted: an identical record is
// skipped, and a conflicting CNAME stops with an explanation.
import "server-only";

export interface DesiredRecord { type: "TXT" | "CNAME"; name: string; fqdn: string; value: string; purpose: string }
export type Creds = Record<string, string>;
export interface StepLog { text: string; ok: boolean }

export const PROVIDER_FIELDS: Record<string, { label: string; fields: { key: string; label: string; secret?: boolean; optional?: boolean }[]; help: string; url: string }> = {
  cloudflare: {
    label: "Cloudflare",
    fields: [{ key: "token", label: "API token", secret: true }],
    help: "Create a token with Zone → DNS → Edit for this domain (add Workers Scripts → Edit and Workers Routes → Edit to also auto-install the script).",
    url: "https://dash.cloudflare.com/profile/api-tokens",
  },
  vercel: {
    label: "Vercel",
    fields: [{ key: "token", label: "Access token", secret: true }, { key: "teamId", label: "Team ID (if the domain is in a team)", optional: true }],
    help: "Account Settings → Tokens → Create. Scope it to the team that owns the domain.",
    url: "https://vercel.com/account/settings/tokens",
  },
  digitalocean: {
    label: "DigitalOcean",
    fields: [{ key: "token", label: "Personal access token", secret: true }],
    help: "API → Generate New Token with the domain:create scope.",
    url: "https://cloud.digitalocean.com/account/api/tokens",
  },
  godaddy: {
    label: "GoDaddy",
    fields: [{ key: "key", label: "API key", secret: true }, { key: "secret", label: "API secret", secret: true }],
    help: "Create a Production key. GoDaddy only allows DNS API access for accounts with 10+ domains or a Discount Domain Club plan.",
    url: "https://developer.godaddy.com/keys",
  },
  netlify: {
    label: "Netlify",
    fields: [{ key: "token", label: "Personal access token", secret: true }],
    help: "User settings → Applications → New access token.",
    url: "https://app.netlify.com/user/applications#personal-access-tokens",
  },
};

class ProviderError extends Error {}

async function call(url: string, init: RequestInit & { json?: unknown } = {}) {
  const { json, ...rest } = init;
  const res = await fetch(url, {
    ...rest,
    headers: { ...(json !== undefined ? { "content-type": "application/json" } : {}), ...(rest.headers ?? {}) },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const d = data as { errors?: { message?: string }[]; error?: { message?: string } | string; message?: string } | null;
    const msg = (Array.isArray(d?.errors) && d.errors.map(e => e.message).join("; ")) ||
      (typeof d?.error === "string" ? d.error : d?.error?.message) || d?.message || text.slice(0, 200) || res.statusText;
    throw new ProviderError(`${res.status} ${msg}`);
  }
  return data as Record<string, unknown>;
}

const same = (a: string, b: string) => a.replace(/^"|"$/g, "").replace(/\.$/, "").toLowerCase() === b.replace(/^"|"$/g, "").replace(/\.$/, "").toLowerCase();

// ── per-provider record writers ─────────────────────────────────────────────

type Writer = (creds: Creds, domain: string, rec: DesiredRecord) => Promise<string>;

async function cfZone(token: string, domain: string) {
  const z = await call(`https://api.cloudflare.com/client/v4/zones?name=${encodeURIComponent(domain)}`, { headers: { authorization: `Bearer ${token}` } });
  const zone = (z.result as { id: string; account: { id: string }; name: string }[])?.[0];
  if (!zone) throw new ProviderError(`This token can't see the ${domain} zone. Give it access to that zone.`);
  return zone;
}

const cloudflare: Writer = async (c, domain, rec) => {
  const auth = { authorization: `Bearer ${c.token}` };
  const zone = await cfZone(c.token, domain);
  const base = `https://api.cloudflare.com/client/v4/zones/${zone.id}/dns_records`;
  const existing = (await call(`${base}?name=${encodeURIComponent(rec.fqdn)}`, { headers: auth })).result as { type: string; content: string }[];
  if (existing.some(r => r.type === rec.type && same(r.content, rec.value))) return "already there";
  if (rec.type === "CNAME" && existing.length) throw new ProviderError(`${rec.fqdn} already has a ${existing[0].type} record; pick another subdomain`);
  await call(base, { method: "POST", headers: auth, json: { type: rec.type, name: rec.fqdn, content: rec.value, ttl: 1, proxied: false, comment: "Added by Pagewise" } });
  return "created";
};

const vercel: Writer = async (c, domain, rec) => {
  const auth = { authorization: `Bearer ${c.token}` };
  const team = c.teamId ? `?teamId=${encodeURIComponent(c.teamId)}` : "";
  const list = await call(`https://api.vercel.com/v4/domains/${domain}/records${team}${team ? "&" : "?"}limit=100`, { headers: auth });
  const recs = (list.records as { name: string; type: string; value: string }[]) ?? [];
  const here = recs.filter(r => r.name === rec.name);
  if (here.some(r => r.type === rec.type && same(r.value, rec.value))) return "already there";
  if (rec.type === "CNAME" && here.length) throw new ProviderError(`${rec.fqdn} already has a ${here[0].type} record; pick another subdomain`);
  await call(`https://api.vercel.com/v2/domains/${domain}/records${team}`, { method: "POST", headers: auth, json: { name: rec.name, type: rec.type, value: rec.value, ttl: 60, comment: "Added by Pagewise" } });
  return "created";
};

const digitalocean: Writer = async (c, domain, rec) => {
  const auth = { authorization: `Bearer ${c.token}` };
  const base = `https://api.digitalocean.com/v2/domains/${domain}/records`;
  const list = await call(`${base}?name=${encodeURIComponent(rec.fqdn)}`, { headers: auth });
  const here = (list.domain_records as { type: string; data: string }[]) ?? [];
  if (here.some(r => r.type === rec.type && same(r.data, rec.value))) return "already there";
  if (rec.type === "CNAME" && here.length) throw new ProviderError(`${rec.fqdn} already has a ${here[0].type} record; pick another subdomain`);
  await call(base, { method: "POST", headers: auth, json: { type: rec.type, name: rec.name, data: rec.type === "CNAME" ? `${rec.value}.` : rec.value, ttl: 1800 } });
  return "created";
};

const godaddy: Writer = async (c, domain, rec) => {
  const auth = { authorization: `sso-key ${c.key}:${c.secret}` };
  const url = `https://api.godaddy.com/v1/domains/${domain}/records/${rec.type}/${encodeURIComponent(rec.name)}`;
  const here = ((await call(url, { headers: auth })) as unknown as { data: string }[]) ?? [];
  if (here.some(r => same(r.data, rec.value))) return "already there";
  if (rec.type === "CNAME" && here.length) throw new ProviderError(`${rec.fqdn} already has a CNAME; pick another subdomain`);
  // PUT replaces the set for this type+name, so keep any TXT values already there.
  await call(url, { method: "PUT", headers: auth, json: [...here.map(r => ({ data: r.data, ttl: 600 })), { data: rec.value, ttl: 600 }] });
  return "created";
};

const netlify: Writer = async (c, domain, rec) => {
  const auth = { authorization: `Bearer ${c.token}` };
  const zones = (await call("https://api.netlify.com/api/v1/dns_zones", { headers: auth })) as unknown as { id: string; name: string }[];
  const zone = zones.find(z => z.name === domain);
  if (!zone) throw new ProviderError(`No Netlify DNS zone for ${domain} on this account`);
  const recs = (await call(`https://api.netlify.com/api/v1/dns_zones/${zone.id}/dns_records`, { headers: auth })) as unknown as { hostname: string; type: string; value: string }[];
  const here = recs.filter(r => r.hostname === rec.fqdn);
  if (here.some(r => r.type === rec.type && same(r.value, rec.value))) return "already there";
  if (rec.type === "CNAME" && here.length) throw new ProviderError(`${rec.fqdn} already has a ${here[0].type} record; pick another subdomain`);
  await call(`https://api.netlify.com/api/v1/dns_zones/${zone.id}/dns_records`, { method: "POST", headers: auth, json: { type: rec.type, hostname: rec.fqdn, value: rec.value, ttl: 3600 } });
  return "created";
};

const WRITERS: Record<string, Writer> = { cloudflare, vercel, digitalocean, godaddy, netlify };

export async function writeRecords(provider: string, creds: Creds, domain: string, records: DesiredRecord[]): Promise<StepLog[]> {
  const w = WRITERS[provider];
  if (!w) return [{ text: `Automatic setup isn't available for this DNS provider yet`, ok: false }];
  const out: StepLog[] = [];
  for (const rec of records) {
    try {
      const r = await w(creds, domain, rec);
      out.push({ text: `${rec.type} ${rec.fqdn} (${rec.purpose}): ${r}`, ok: true });
    } catch (e) {
      out.push({ text: `${rec.type} ${rec.fqdn} (${rec.purpose}): ${e instanceof Error ? e.message : String(e)}`, ok: false });
      break;
    }
  }
  return out;
}

// ── first-party subdomain on our own hosting ────────────────────────────────

/**
 * For <sub>.<customer-domain> to serve /t.js over HTTPS, our host has to know
 * the name and issue a certificate for it. On Vercel that's one API call;
 * elsewhere the operator configures it (see README).
 */
export async function attachToOurProject(fqdn: string): Promise<StepLog | null> {
  const token = process.env.VERCEL_API_TOKEN, project = process.env.VERCEL_PROJECT_ID;
  if (!token || !project) return null;
  const team = process.env.VERCEL_TEAM_ID ? `?teamId=${process.env.VERCEL_TEAM_ID}` : "";
  try {
    await call(`https://api.vercel.com/v10/projects/${project}/domains${team}`, { method: "POST", headers: { authorization: `Bearer ${token}` }, json: { name: fqdn } });
    return { text: `Added ${fqdn} to our hosting so it gets an HTTPS certificate`, ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/already|exists|409/.test(msg)) return { text: `${fqdn} is already on our hosting`, ok: true };
    return { text: `Couldn't add ${fqdn} to our hosting: ${msg}`, ok: false };
  }
}

// ── Cloudflare Worker: install the script with no code change ───────────────

const workerName = (siteId: string) => `pagewise-${siteId.toLowerCase().replace(/[^a-z0-9-]/g, "-")}`;

function workerSource(tag: string) {
  return `// Added by Pagewise: inserts the analytics tag into HTML pages. Safe to delete.
const TAG = ${JSON.stringify(tag)};
export default {
  async fetch(request, env, ctx) {
    ctx.passThroughOnException();
    const res = await fetch(request);
    if (!(res.headers.get("content-type") || "").includes("text/html")) return res;
    return new HTMLRewriter().on("head", { element(el) { el.append(TAG, { html: true }); } }).transform(res);
  },
};
`;
}

/**
 * Deploys a tiny Worker on example.com/* and www.example.com/* that adds the
 * tag to every HTML response. Needs the site to be proxied through Cloudflare
 * (orange cloud). Refuses to touch routes another Worker already owns.
 */
export async function installCloudflareWorker(token: string, domain: string, siteId: string, tag: string) {
  const auth = { authorization: `Bearer ${token}` };
  const zone = await cfZone(token, domain);
  const script = workerName(siteId);
  const form = new FormData();
  form.append("metadata", new Blob([JSON.stringify({ main_module: "worker.js", compatibility_date: "2024-09-23" })], { type: "application/json" }));
  form.append("worker.js", new Blob([workerSource(tag)], { type: "application/javascript+module" }), "worker.js");
  await call(`https://api.cloudflare.com/client/v4/accounts/${zone.account.id}/workers/scripts/${script}`, { method: "PUT", headers: auth, body: form });

  const routesUrl = `https://api.cloudflare.com/client/v4/zones/${zone.id}/workers/routes`;
  const existing = ((await call(routesUrl, { headers: auth })).result as { id: string; pattern: string; script?: string }[]) ?? [];
  const routeIds: string[] = [];
  const logs: StepLog[] = [{ text: `Deployed Worker "${script}"`, ok: true }];
  for (const pattern of [`${domain}/*`, `www.${domain}/*`]) {
    const clash = existing.find(r => r.pattern === pattern);
    if (clash && clash.script === script) { routeIds.push(clash.id); logs.push({ text: `Route ${pattern} already set`, ok: true }); continue; }
    if (clash) { logs.push({ text: `Route ${pattern} is used by your Worker "${clash.script}"; left it alone`, ok: false }); continue; }
    const r = await call(routesUrl, { method: "POST", headers: auth, json: { pattern, script } });
    routeIds.push((r.result as { id: string }).id);
    logs.push({ text: `Route ${pattern} → ${script}`, ok: true });
  }
  return { worker: { accountId: zone.account.id, zoneId: zone.id, script, routeIds, installedAt: new Date().toISOString() }, logs };
}

export async function removeCloudflareWorker(token: string, w: { accountId: string; zoneId: string; script: string; routeIds: string[] }) {
  const auth = { authorization: `Bearer ${token}` };
  for (const id of w.routeIds) await call(`https://api.cloudflare.com/client/v4/zones/${w.zoneId}/workers/routes/${id}`, { method: "DELETE", headers: auth }).catch(() => null);
  await call(`https://api.cloudflare.com/client/v4/accounts/${w.accountId}/workers/scripts/${w.script}?force=true`, { method: "DELETE", headers: auth });
}

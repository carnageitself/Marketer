// lib/dns/apply.ts
// The actions behind every "set it up for me" button, shared by the pasted-
// token route and the sign-in flows (Cloudflare OAuth, Domain Connect), so
// each path writes the same records and the same setup log.
import "server-only";
import { attachToOurProject, installCloudflareWorker, removeCloudflareWorker, writeRecords, type Creds, type StepLog } from "./providers";
import { checkRecords, cnameTarget, desiredRecords, pickSubdomain } from "./records";
import { patchSite, snippet, withLog, type DnsState, type Site } from "../sites";

/** Picks the first-party subdomain once, before any records are written. */
export async function withSubdomain(site: Site): Promise<Site> {
  const target = cnameTarget();
  if (!target || site.dns.subdomain) return site;
  return { ...site, dns: { ...site.dns, subdomain: await pickSubdomain(site.domain), cnameTarget: target } };
}

/** Creates the TXT (+ CNAME) records through a provider's API. */
export async function applyRecords(site: Site, provider: string, creds: Creds) {
  site = await withSubdomain(site);
  let dns = site.dns;
  const logs = await writeRecords(provider, creds, site.domain, desiredRecords(site));
  if (logs.every(l => l.ok)) {
    dns = { ...dns, autoConfiguredAt: new Date().toISOString(), autoProvider: provider };
    if (dns.subdomain && cnameTarget()) {
      const attached = await attachToOurProject(`${dns.subdomain}.${site.domain}`);
      if (attached) logs.push(attached);
    }
  }
  for (const l of logs) dns = withLog(dns, l.text, l.ok);
  site = (await patchSite(site.id, { dns }))!;
  return { site, logs, records: await checkRecords(site) };
}

/** Cloudflare: deploys the Worker that adds the tag to every HTML page. */
export async function applyWorker(site: Site, token: string, origin: string) {
  const { worker, logs } = await installCloudflareWorker(token, site.domain, site.id, snippet(site, origin));
  let dns: DnsState = { ...site.dns, worker };
  for (const l of logs) dns = withLog(dns, l.text, l.ok);
  return { site: (await patchSite(site.id, { dns }))!, logs };
}

export async function removeWorker(site: Site, token: string) {
  if (!site.dns.worker) throw new Error("No Worker installed");
  await removeCloudflareWorker(token, site.dns.worker);
  const { worker: _removed, ...rest } = site.dns;
  void _removed;
  const logs: StepLog[] = [{ text: "Removed the Cloudflare Worker; the script is no longer injected", ok: true }];
  return { site: (await patchSite(site.id, { dns: withLog(rest, logs[0].text) }))!, logs };
}

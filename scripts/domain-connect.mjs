// scripts/domain-connect.mjs — one-time setup for Domain Connect sign-in.
//
//   node scripts/domain-connect.mjs <your-domain> <app-host> [cname-target]
//   e.g. node scripts/domain-connect.mjs pagewise.io app.pagewise.io cname.pagewise.io
//
// Writes:
//   domain-connect/<your-domain>.analytics.json   the template to onboard with
//                                                 each DNS provider (GoDaddy,
//                                                 IONOS, Cloudflare, Vercel…)
//   .domain-connect-key.pem                       the signing key (gitignored via *.pem; keep it secret)
// and prints the TXT record(s) to publish and the env vars to set.
import { generateKeyPairSync, createPublicKey } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const [domain, appHost, cnameTarget] = process.argv.slice(2);
if (!domain || !appHost) {
  console.error("Usage: node scripts/domain-connect.mjs <your-domain> <app-host> [cname-target]");
  process.exit(1);
}
const serviceId = "analytics";
const keyId = "_dck1";
const keyFile = ".domain-connect-key.pem";

let privatePem;
if (existsSync(keyFile)) {
  privatePem = readFileSync(keyFile, "utf8");
  console.log(`Using the existing key in ${keyFile}`);
} else {
  privatePem = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" });
  writeFileSync(keyFile, privatePem, { mode: 0o600 });
  console.log(`Created a signing key in ${keyFile}`);
}
const pub = createPublicKey(privatePem).export({ type: "spki", format: "der" }).toString("base64");

const records = [{
  groupId: "verify", type: "TXT", host: "_pagewise", data: "pagewise-verify=%verify%", ttl: 3600,
  txtConflictMatchingMode: "Prefix", txtConflictMatchingPrefix: "pagewise-verify=",
}];
if (cnameTarget) records.push({ groupId: "tracking", type: "CNAME", host: "%sub%", pointsTo: cnameTarget, ttl: 3600 });

const template = {
  providerId: domain,
  providerName: "Pagewise",
  serviceId,
  serviceName: "Pagewise website analytics",
  version: 1,
  logoUrl: `https://${appHost}/icon.svg`,
  description: "Verifies that you own the domain" + (cnameTarget ? " and serves the Pagewise tracker from your own subdomain." : "."),
  variableDescription: "verify: per-website verification token; sub: subdomain that serves the tracker",
  syncBlock: false,
  syncPubKeyDomain: domain,
  syncRedirectDomain: appHost,
  warnPhishing: true,
  hostRequired: false,
  records,
};
mkdirSync("domain-connect", { recursive: true });
const file = `domain-connect/${domain}.${serviceId}.json`;
writeFileSync(file, JSON.stringify(template, null, 2) + "\n");

// Public key as TXT records of at most 255 characters each: p=<part>,a=RS256,d=<chunk>
const chunks = pub.match(/.{1,200}/g);
console.log(`\nWrote ${file}`);
console.log(`\n1. Publish these TXT records at ${keyId}.${domain}:`);
chunks.forEach((c, i) => console.log(`   p=${i + 1},a=RS256,d=${c}`));
console.log(`\n2. Set these environment variables on the Pagewise server:`);
console.log(`   DOMAIN_CONNECT_PROVIDER_ID=${domain}`);
console.log(`   DOMAIN_CONNECT_SERVICE_ID=${serviceId}`);
console.log(`   DOMAIN_CONNECT_KEY_ID=${keyId}`);
console.log(`   DOMAIN_CONNECT_PRIVATE_KEY="${privatePem.trim().replace(/\n/g, "\\n")}"`);
console.log(`\n3. Open a pull request with ${file} at https://github.com/Domain-Connect/Templates,`);
console.log(`   then ask each DNS provider to onboard it (see https://www.domainconnect.org/dns-providers).`);

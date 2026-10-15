// lib/oauth-login.ts
// "Continue with Google / Microsoft": OpenID Connect authorization code flow
// with PKCE and a nonce. The ID token comes straight from the provider's token
// endpoint over TLS (server to server, authenticated with our client secret),
// and we still check its issuer, audience, expiry and nonce.
//
// Env: GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET, MICROSOFT_CLIENT_ID /
// MICROSOFT_CLIENT_SECRET. Redirect URI to register with each provider:
//   <APP_URL>/api/auth/oauth/callback/google
//   <APP_URL>/api/auth/oauth/callback/microsoft
import "server-only";

export type LoginProvider = "google" | "microsoft";

const CONFIG: Record<LoginProvider, { name: string; authorize: string; token: string; issuer: (iss: string) => boolean; env: [string, string] }> = {
  google: {
    name: "Google",
    authorize: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
    issuer: iss => iss === "https://accounts.google.com" || iss === "accounts.google.com",
    env: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
  },
  microsoft: {
    name: "Microsoft",
    // "common" accepts both work/school and personal Microsoft accounts.
    authorize: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    token: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    issuer: iss => /^https:\/\/login\.microsoftonline\.com\/[0-9a-f-]{36}\/v2\.0$/.test(iss),
    env: ["MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET"],
  },
};

const creds = (p: LoginProvider) => {
  const [id, secret] = CONFIG[p].env.map(k => process.env[k]);
  return id && secret ? { id, secret } : null;
};

export const isLoginProvider = (p: string | null): p is LoginProvider => p === "google" || p === "microsoft";
export const providerName = (p: LoginProvider) => CONFIG[p].name;

/** Which sign-in buttons to show. */
export function loginProviders(): Record<LoginProvider, boolean> {
  return { google: !!creds("google"), microsoft: !!creds("microsoft") };
}

export function authorizeUrl(p: LoginProvider, redirectUri: string, state: string, challenge: string, nonce: string): string {
  const c = creds(p);
  if (!c) throw new Error(`${CONFIG[p].name} sign-in isn't set up`);
  return `${CONFIG[p].authorize}?${new URLSearchParams({
    client_id: c.id, redirect_uri: redirectUri, response_type: "code", scope: "openid email profile",
    state, nonce, code_challenge: challenge, code_challenge_method: "S256", prompt: "select_account",
  })}`;
}

export interface Claims { sub: string; email: string; emailVerified: boolean; name: string | null }

export async function exchange(p: LoginProvider, code: string, verifier: string, redirectUri: string, nonce: string): Promise<Claims> {
  const c = creds(p);
  if (!c) throw new Error(`${CONFIG[p].name} sign-in isn't set up`);
  const res = await fetch(CONFIG[p].token, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: c.id, client_secret: c.secret, code, code_verifier: verifier, redirect_uri: redirectUri, grant_type: "authorization_code" }),
    signal: AbortSignal.timeout(15_000),
  });
  const data = await res.json().catch(() => ({})) as { id_token?: string; error_description?: string; error?: string };
  if (!res.ok || !data.id_token) throw new Error(data.error_description ?? data.error ?? `${CONFIG[p].name} sign-in failed`);
  const t = JSON.parse(Buffer.from(data.id_token.split(".")[1] ?? "", "base64url").toString()) as Record<string, unknown>;
  if (!CONFIG[p].issuer(String(t.iss)) || t.aud !== c.id || Number(t.exp) * 1000 < Date.now() || t.nonce !== nonce) {
    throw new Error("The sign-in response didn't check out. Please try again.");
  }
  const email = String(t.email ?? t.preferred_username ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error(`Your ${CONFIG[p].name} account has no email address we can use`);
  return {
    sub: String(t.sub), email,
    // Google says when an address is verified. Microsoft work accounts can carry
    // any address their admin typed, so we never treat those as verified.
    emailVerified: p === "google" && t.email_verified === true,
    name: typeof t.name === "string" ? t.name.slice(0, 80) : null,
  };
}

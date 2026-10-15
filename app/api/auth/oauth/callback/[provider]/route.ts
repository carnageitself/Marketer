// app/api/auth/oauth/callback/[provider]/route.ts
// Back from Google / Microsoft. Signs in the linked account, links the
// provider to the account that's already signed in, or creates a new account.
// An existing password account is only linked automatically when the provider
// has verified the email (Google); otherwise the person logs in with their
// password first, so nobody can claim an account by typing its email into an
// identity provider they control.
import { NextResponse, type NextRequest } from "next/server";
import { currentUser, newId, startSession } from "@/lib/auth";
import { one, q } from "@/lib/db";
import { exchange, isLoginProvider, providerName } from "@/lib/oauth-login";
import { appOrigin } from "@/lib/sites";

export const runtime = "nodejs";

/** Same-site relative paths only, so `next` can't send people to another site. */
const safeNext = (n: string | undefined) => (n && n.startsWith("/") && !n.startsWith("//") && !n.startsWith("/\\") ? n : "/sites");

export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const origin = appOrigin(req);
  const fail = (msg: string) => {
    const res = NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(msg)}`, origin));
    res.cookies.set("pw_oauth", "", { path: "/api/auth/oauth", maxAge: 0 });
    return res;
  };
  if (!isLoginProvider(provider)) return fail("Unknown sign-in provider");

  let flow: { provider: string; state: string; nonce: string; verifier: string; next: string };
  try { flow = JSON.parse(Buffer.from(req.cookies.get("pw_oauth")?.value ?? "", "base64url").toString()); }
  catch { return fail("That sign-in took too long. Please try again."); }
  const p = req.nextUrl.searchParams;
  if (flow.provider !== provider || !flow.state || flow.state !== p.get("state")) return fail("That sign-in took too long. Please try again.");
  if (p.get("error")) return fail(p.get("error") === "access_denied" ? "Sign-in was cancelled." : p.get("error_description") ?? "Sign-in failed");

  try {
    const claims = await exchange(provider, p.get("code") ?? "", flow.verifier, `${origin}/api/auth/oauth/callback/${provider}`, flow.nonce);
    const linked = await one<{ user_id: string }>("select user_id from user_identities where provider = $1 and subject = $2", [provider, claims.sub]);
    let userId = linked?.user_id;
    if (!userId) {
      const signedIn = await currentUser();
      const existing = await one<{ id: string }>("select id from users where email = $1", [claims.email]);
      if (signedIn) userId = signedIn.id;                       // linking from inside the app
      else if (existing && claims.emailVerified) userId = existing.id;
      else if (existing) return fail(`An account with ${claims.email} already exists. Log in with your password; you can use ${providerName(provider)} next time.`);
      else {
        userId = newId("u");
        await q("insert into users (id, email, name, pass_hash) values ($1, $2, $3, '!oauth')", [userId, claims.email, claims.name]);
      }
      await q("insert into user_identities (provider, subject, user_id, email) values ($1, $2, $3, $4) on conflict do nothing",
        [provider, claims.sub, userId, claims.email]);
    }
    await startSession(userId);
    const res = NextResponse.redirect(new URL(safeNext(flow.next), origin));
    res.cookies.set("pw_oauth", "", { path: "/api/auth/oauth", maxAge: 0 });
    return res;
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
}

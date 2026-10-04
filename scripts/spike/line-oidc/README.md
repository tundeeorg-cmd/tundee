# Spike: LINE as a Supabase custom OIDC provider (option B)

Throwaway harness. It answers one question before any production code changes:
**can Supabase's custom OIDC provider sign students in with LINE, as a real
provider, with no email?** Touches nothing in the app and only a **staging**
Supabase project. Delete this folder once the decision is made.

## What decides it

| Check | Pass | Fail → option A |
|---|---|---|
| Sign-in completes | Back on the spike page, signed in | An error on return, typically a token signature/`alg` error |
| Labelled as LINE | identity `provider` is the custom id, not `email` | `provider=email` |
| No email | `email: null` when LINE grants none | Supabase demands an email |
| No duplicates | Signing in twice = one user | Two users with the same `sub` |

Known risk: LINE web login has signed ID tokens **HS256 with the channel
secret**, while LINE's JWKS publishes ES256 keys. If Supabase only verifies
against the JWKS, the first check fails.

## Steps

**0. Prerequisites (one-time)**
- A staging Supabase project, separate from production.
- A LINE Login channel. Use a separate test channel if you can. Its status can
  stay *Developing* as long as your LINE account is added as a tester.

**1. LINE's setup** (optional; works anywhere with internet)
```sh
node scripts/spike/line-oidc/check-line.mjs
```

**2. Configure staging**
- Supabase → Auth → Providers → add a custom OIDC provider:
  - issuer `https://access.line.me`
  - client id / secret = the LINE channel ID / channel secret
  - scopes `openid profile email`
  - email optional: **on**
- Note the **callback URL** Supabase shows, and the provider id (e.g. `custom:line`).
- LINE Developers Console → that channel → LINE Login → Callback URL → add Supabase's callback URL.
- Supabase → Auth → URL Configuration → Redirect URLs → add `http://localhost:3999/`.

**3. Sign in** (needs a person with a LINE account)
```sh
node scripts/spike/line-oidc/serve.mjs     # then open http://localhost:3999/
```
Enter the staging URL, the staging **anon** key and the provider id, then tap
the LINE button. Sign in with a LINE account that has **not** shared an email.
Then sign out and sign in a second time, to test for duplicates.

**4. Read back the result**
```sh
STAGING_SUPABASE_URL=https://xxxx.supabase.co \
STAGING_SUPABASE_SERVICE_ROLE_KEY=... \
node scripts/spike/line-oidc/inspect.mjs
```
Read-only. Prints each LINE account and a three-line verdict.

## What to send back

The result box from the spike page (or the error text) and the `inspect.mjs`
verdict. Neither contains a secret; the LINE `sub` in them is an opaque id.

# Setting Up Google OAuth for TunDee

Follow these steps to enable Google sign-in on tundee.org.

---

## Step 1 — Google Cloud Console

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Select your project (or create one named **TunDee**)
3. Navigate to **APIs & Services → Credentials**
4. Click **+ Create Credentials → OAuth 2.0 Client ID**
5. Application type: **Web application**
6. Name: `TunDee`
7. Under **Authorized redirect URIs**, add:
   ```
   https://<your-project-ref>.supabase.co/auth/v1/callback
   ```
   (Find your project ref in Supabase → Settings → General)
8. Click **Create** and copy the **Client ID** and **Client Secret**

---

## Step 2 — Supabase Dashboard

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) → your project
2. Navigate to **Authentication → Providers**
3. Click **Google** and toggle it on
4. Paste in your **Client ID** and **Client Secret**
5. Click **Save**

---

## Step 3 — Vercel Environment Variables

In your Vercel project settings → **Environment Variables**, add:

| Key | Value |
|-----|-------|
| `NEXT_PUBLIC_SITE_URL` | `https://www.tundee.org` |
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anon key |

> ⚠️ After adding variables, redeploy your Vercel project for them to take effect.

---

## Step 4 — Supabase Redirect URLs

1. In Supabase → **Authentication → URL Configuration**
2. Set **Site URL** to: `https://www.tundee.org`
3. Under **Redirect URLs**, add:
   ```
   https://www.tundee.org/auth/callback
   ```

---

## How It Works

The auth flow after this setup:

1. User clicks **Continue with Google** on `/auth`
2. Browser redirects to Google → user signs in
3. Google redirects to Supabase → Supabase redirects to `/auth/callback`
4. `/auth/callback/route.ts` calls `exchangeCodeForSession()`
5. New user → redirected to `/profile/setup`
6. Returning user → redirected to `/scholarships`

---

## Troubleshooting: Google shows "400. That's an error … malformed"

Checked on 2026-11-04, against production, without signing in:

- Supabase's `/auth/v1/authorize?provider=google` returns a well-formed Google URL:
  `client_id` set, `redirect_uri=https://<project>.supabase.co/auth/v1/callback`,
  `scope=email profile`, `response_type=code`.
- Google **accepts** it (302 to its normal "choose an account" page), both with a plain
  `redirect_to` and with the full return URL the app sends (next, consent, `/start`
  answers, parked-answers id, campaign) and PKCE. So the client ID, the authorized
  redirect URI and Supabase's provider settings are correct.

The app does not build the Google URL itself; `AuthForm` calls
`supabase.auth.signInWithOAuth({ provider: 'google' })`. If a student still sees the 400:

1. **Get the address** from that error page (or a screenshot of it) and which app they
   were in. A 400 on a URL Google otherwise accepts usually means the URL was cut or
   altered on the way — copied by hand, or reopened from history — not a settings error.
2. **In-app browsers:** Google refuses them (that shows as `403 disallowed_useragent`).
   `/auth` hides the Google button in the in-app browsers it recognises
   (`lib/browser/inAppBrowser.ts`); a browser it does not recognise would still show it.
3. **OAuth consent screen:** if it is in *Testing*, anyone not on the test-user list gets
   "Access blocked" (403). Publish it.


# LINE Login — what the code does, and what only you can check

TunDee's LINE Login exists for one behaviour: **app-to-app login**, where the
LINE app opens and the student approves with a single tap. The alternative LINE
falls back to is an email + password form, and most Thai users cannot complete
it — they registered LINE with a phone number and have never had a LINE
password. Every item here is about keeping students on the first path.

---

## How it works

LINE is a **Supabase Auth provider**, `custom:line`. `app/api/auth/line/start`
checks PDPA consent, asks Supabase for the authorize URL, and redirects; LINE
returns to Supabase, which returns to `/auth/callback` with a code — the same
path Google takes. Supabase does the code exchange, PKCE and `state`. Accounts
are labelled `custom:line` in Supabase and have **no email**.

`/auth/callback` then writes `profiles.line_user_id` (service role), which the
reminder bot and the LINE crons address students by.

Live since 2026-10-04. The 29 accounts created before that by the original
bridge (our own token exchange plus a `line_…@line.tundee.invalid` placeholder
email) were given a `custom:line` identity by
`scripts/20261005_v23_line_identities.sql`, so they sign into the account they
already had. The bridge has been removed; **do not bring it back** — those
accounts would get duplicates, and accounts created since have no email for it
to sign in with.

### The parameters that decide one-tap versus the password form

Passed through Supabase as `queryParams`:

| Parameter | Value | Why |
|---|---|---|
| `disable_auto_login` | **absent** on a first attempt | Setting it *is* the password form. It appears only on the retry below. |
| `initial_amr_display` | **absent** | `lineqr` would replace the app handoff with a QR code — useless on the phone displaying it. |
| `switch_amr` | **absent** | Default lets the student change method if they want to. |
| `ui_locales` | `th` | Otherwise the consent screen follows the device locale, so a Thai student on an English-locale handset reads English. |
| `bot_prompt` | `LINE_BOT_PROMPT`, default `aggressive` | Adds an "add TunDee as a friend" step. It costs one tap and feeds the LINE reminder crons. See the note below. |

### The auto-login retry

LINE documents a failed state check on return as the symptom of auto login
having failed part-way, and prescribes retrying with `disable_auto_login=true`.
A failed LINE attempt comes back to `/auth/callback` with `via_line=1` and an
`error`; the callback restarts it **once** with auto login disabled (marked
`line_retry=1`), then shows a message pointing at email. A cancel is final.

One case this cannot catch: if Supabase cannot read its own `state`, it does not
know the redirect URL and sends the student to the Site URL instead.

### `bot_prompt` — a judgement call, not a bug

`bot_prompt` inserts a screen between approval and the return, so one-tap
becomes two-tap. It is kept because that screen is how students opt into the
LINE deadline reminders the product actually runs (`/api/cron/line-*`). It is
set in `app/api/auth/line/start/route.ts`; `LINE_BOT_PROMPT=normal` softens it.
Decide deliberately; do not remove it as cleanup.

### Email

LINE's userinfo endpoint never returns an email, so the channel's *Email address
permission* is deliberately **not** applied for. A LINE student who wants email
reminders adds an address at `/tracker`; the link mailed to it makes it their
account email (`app/api/auth/verify-email`, claim), which also gives them email
sign-in as a fallback.

---

## Supabase — the provider config

Authentication → Sign In / Providers → Custom Providers → `LINE` (`custom:line`).
**It must use Manual configuration.** Auto-discovery verifies LINE's ID token
against LINE's JWKS, which only lists ES256, while LINE signs web-login tokens
HS256 with the channel secret — every sign-in fails with
`unexpected signature algorithm "HS256"` (confirmed on production, 2026-10-04).

| Field | Value |
|---|---|
| Authorization URL | `https://access.line.me/oauth2/v2.1/authorize` |
| Token URL | `https://api.line.me/oauth2/v2.1/token` |
| Userinfo URL | `https://api.line.me/oauth2/v2.1/userinfo` |
| JWKS URI | empty |
| Client ID / Secret | the LINE Login channel's ID and channel secret |
| Scopes | `openid, profile` |
| Allow users without email | on |

The configuration method cannot be changed after a provider is created —
delete and recreate it instead (safe only while no user depends on it; once
students sign in through it, deleting it would orphan their identities).

For this provider Supabase does not update `auth.identities.last_sign_in_at`;
`updated_at` moves on each LINE sign-in instead.

---

## What only you can check — LINE Developers Console

None of these are visible from the codebase, and any one of them can produce the
password form regardless of what the code sends.

- [ ] **Channel status is Published, not Developing.** A Developing channel
      admits only registered testers.
- [ ] **These callback URLs are registered**, exactly:
      - `https://<project>.supabase.co/auth/v1/callback` — sign-in (Supabase)
      - `https://www.tundee.org/api/line/callback` — bot account linking

      `https://www.tundee.org/api/auth/line/callback` was the retired bridge's
      and can be removed, as can any `http://localhost:…` entries.
- [ ] **The LINE Login channel is linked to the Messaging API channel.**
      Without the link `bot_prompt` silently does nothing.
- [ ] **Never reissue the channel secret** without updating it in the Supabase
      provider config at the same moment — sign-in breaks for everyone until
      the two match.

---

## What the webview does, and what nothing can do about it

Auto login needs a Universal Link (iOS) or App Link (Android) to fire. Third-party
webviews block them, so **the Facebook, Instagram, TikTok and Messenger browsers
will always fall back to LINE's password form.** No authorization parameter
changes this.

The app handles it rather than fighting it (`app/auth/AuthForm.tsx`):

| Context | Tapping LINE does |
|---|---|
| Real browser | Starts the flow normally — LINE is the largest button |
| **LINE's own** webview | Starts the flow normally; LINE documents auto login as working from there |
| FB/IG/TikTok/Messenger, **Android** | Fires a Chrome intent to the authorize entry point, carrying consent, the `/start` answers and the campaign. One tap, landing in a browser where auto login actually works |
| FB/IG/TikTok/Messenger, **iOS** | Shows the "open in Safari" instructions instead of starting a flow guaranteed to dead-end. Safari cannot be launched programmatically from a webview |

Email + password is above LINE in all four cases and always works, so none of
this is ever a blocker.

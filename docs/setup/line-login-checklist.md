# LINE Login — what the code does, and what only you can check

TunDee's LINE Login exists for one behaviour: **app-to-app login**, where the
LINE app opens and the student approves with a single tap. The alternative LINE
falls back to is an email + password form, and most Thai users cannot complete
it — they registered LINE with a phone number and have never had a LINE
password. Every item here is about keeping students on the first path.

---

## What the code now sends

`app/api/auth/line/start/route.ts` builds the authorization URL. The parameters
that decide one-tap versus the password form:

| Parameter | Value | Why |
|---|---|---|
| `disable_auto_login` | **absent** on a first attempt | Setting it *is* the password form. It appears only on the retry below. |
| `initial_amr_display` | **absent** | `lineqr` would replace the app handoff with a QR code — useless on the phone displaying it. |
| `switch_amr` | **absent** | Default lets the student change method if they want to. |
| `ui_locales` | `th` | Otherwise the consent screen follows the device locale, so a Thai student on an English-locale handset reads English. |
| `nonce` | random, per request | Binds the `id_token` to this request; checked at `/verify`. Previously missing entirely. |
| `code_challenge` / `_method` | S256 | PKCE. The authorization code crosses a redirect chain we do not control. |
| `bot_prompt` | `LINE_BOT_PROMPT`, default `normal` | Adds an "add TunDee as a friend" step. It costs one tap and feeds the LINE reminder crons. See the note below. |

### The auto-login retry

LINE documents a state mismatch on return as the symptom of auto login having
failed part-way, and says it is indistinguishable from a CSRF attempt. Both get
the same safe response — discard and start over — but the callback now retries
**once** with `disable_auto_login=true`, which is LINE's own prescribed remedy.

Before this, a student who hit it was sent to `/auth` with "LINE sign-in failed,
please try again", tapped LINE, and reissued exactly the request that had just
failed. A closed loop, on the method that is supposed to be one tap.

The retry flag rides in a cookie (`line_auth_retry`), not the query string,
because LINE returns to the registered Callback URL byte for byte — nothing we
append on the way out comes back. Without the cookie the retry would loop
forever.

### `bot_prompt` — a judgement call, not a bug

`bot_prompt=normal` inserts a screen between approval and the callback, so
one-tap becomes two-tap. It is kept because that screen is how students opt into
the LINE deadline reminders the product actually runs (`/api/cron/line-*`). To
drop it from login, set `LINE_BOT_PROMPT` to anything and remove the parameter in
`lib/line/redirectUri.ts`. Decide deliberately; do not remove it as cleanup.

---

## What only you can check — LINE Developers Console

None of these are visible from the codebase, and any one of them can produce the
password form regardless of what the code sends.

- [ ] **Channel status is Published, not Developing.** A Developing channel
      admits only registered testers.
- [ ] **Both callback URLs are registered**, exactly:
      - `https://www.tundee.org/api/auth/line/callback` — one-tap login
      - `https://www.tundee.org/api/line/callback` — bot account linking

      These are different routes for different flows. Registering only the
      second is an easy mistake and breaks login entirely.
- [ ] **The LINE Login channel is linked to the Messaging API channel.**
      Without the link `bot_prompt` silently does nothing.
- [ ] **Email address permission** — its approval state decides whether LINE
      returns a real address. Until it is approved, LINE accounts are created
      with a synthetic `@line.tundee.invalid` address and are deliberately
      skipped by the email reminder cron. 11 of 78 accounts are in this state.
- [ ] `LINE_AUTH_REDIRECT_URI` in Vercel matches the registered URL **byte for
      byte**. LINE compares it exactly, on both the authorize and token calls.

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

# Supabase Auth settings for TunDee

Run through this once, and re-check items 1 and 3 after any dashboard change.

TunDee has three ways in, and none of them asks for a password:

| Method | Where it is first | How it works |
|---|---|---|
| **LINE** | Everywhere except in-app browsers | Supabase provider `custom:line`; see [line-login-checklist.md](line-login-checklist.md) |
| **Email, six-digit code** | Inside Facebook / Instagram / TikTok | `signInWithOtp` sends a code; the student types it into the same page (`verifyOtp`). The same email carries a link as a fallback. |
| **Google** | Never first; hidden inside in-app browsers | Supabase Google provider |

Why a code and not a magic link: nearly all paid traffic arrives inside the
Facebook in-app browser, and a link opens in a *different* browser, where the
student is signed out and their `/start` answers are gone. That round trip
turned 79 Lead events into 10 accounts, which is why the link-only flow was
removed on 30 Aug 2026. A code never leaves the page (`lib/auth/otp.ts`).

All three go through the PDPA consent checkbox, which sits directly under the
first sign-in button on `/auth` and is re-checked on the server.

---

## 1. Email provider

**Path:** Authentication → Sign In / Providers → Email

| Setting | Value | Why |
|---|---|---|
| **Enable Email provider** | ON | Required for the six-digit code |
| **Confirm email** | **OFF** | With it ON, a new account must confirm before its first session — an extra round trip this flow exists to avoid. The code already proves the student owns the address. |
| **Email OTP length** | **6** | The form submits itself on the sixth digit (`OTP_LENGTH` in `lib/auth/otp.ts`). Any other length and every code is rejected. |
| **Enable Magic Links / email OTP** | ON | `signInWithOtp` is the email path. Turning it off breaks email sign-in entirely. |

The **Magic Link** email template must contain `{{ .Token }}`, or the email has
no code in it — see [email-templates.md](email-templates.md).

LINE and Google accounts are never gated by "Confirm email": OAuth sign-ins get
a session regardless. A LINE account has **no email**, so the Users list shows
it as "Waiting for verification". That label is cosmetic — those accounts sign
in normally. Do not "fix" it by confirming them or giving them placeholder
emails (line-login-checklist.md explains why).

> Old password accounts still work: Supabase matches the code to the address,
> and their password is not deleted. `/auth/reset` still serves old reset links.

---

## 2. Email templates

**Path:** Authentication → Emails

The **Magic Link** template carries the sign-in code (see above). **Confirm signup** matters only, and only as a safety net — paste the
HTML from `emails/supabase/confirm-signup.paste.html`.

The two emails TunDee actually sends are built in `lib/email/authEmails.ts` and
delivered through Resend, so their Thai copy lives in version control:

| Email | Sent when | Never sent |
|---|---|---|
| `setPasswordEmail` | Someone fails to sign in to an existing account — fired automatically, they do not have to find "forgot password" | At signup |
| `verifyEmailEmail` | A student switches on email deadline reminders at `/tracker` | At signup, and for anything else |

**Signup sends no email at all.** If you find yourself adding a third, check
first whether the thing you are gating really needs a verified address —
nothing else in the product does.

---

## 3. URL configuration

**Path:** Authentication → URL Configuration

| Field | Value |
|---|---|
| **Site URL** | `https://www.tundee.org` |

**Redirect URLs** — one per line:

```
https://www.tundee.org/**
https://tundee.org/**
http://localhost:3000/**
```

The `**` wildcard covers every callback path in use:

| Path | Reached by |
|---|---|
| `/auth/callback` | LINE and Google (`code`), the link in the sign-in email and password recovery (`token_hash`), and the hand-off after a typed code |
| `/auth/reset/confirm` | Where `/auth/callback` sends a verified recovery token |
| `/api/auth/verify-email` | The email-reminder verification link |

Removing the wildcard and listing paths individually will break at least one of
these. Keep the wildcard.

---

## 4. OTP expiry

**Path:** Authentication → Configuration → Auth

| Setting | Value |
|---|---|
| OTP expiry | `3600` (1 hour) |

This governs the six-digit sign-in code (and the link in the same email).
`OTP_VALID_SECONDS` in `lib/auth/otp.ts` assumes one hour, to tell an expired
code apart from a mistyped one; change both together.

---

## 5. LINE (`custom:line`)

**Path:** Authentication → Sign In / Providers → Custom providers → LINE

Channel ID and secret from the LINE Developers console. The **Callback URL** in
the LINE channel must be exactly `https://<project>.supabase.co/auth/v1/callback`
(Supabase handles LINE's return, then sends the student to `/auth/callback`,
which the Redirect URLs above must allow). Full checklist, including the
parameters that keep one-tap app login working:
[line-login-checklist.md](line-login-checklist.md).

---

## 6. Google OAuth (unchanged)

**Path:** Authentication → Sign In / Providers → Google

Client ID and Secret from the Google Cloud Console; the callback URL there must
be `https://<project>.supabase.co/auth/v1/callback`.

40 of 78 existing accounts are Google, so this is not optional cleanup — it is
half the user base. The app hides the Google button inside embedded webviews
because Google rejects those with `disallowed_useragent` on its own domain,
where no error of ours can be shown.

---

## 7. Test it end to end

1. Open `https://www.tundee.org/auth` on a phone. The consent box sits directly
   under the green LINE button. Tick it, tap LINE, approve in the LINE app:
   you land signed in.
2. Sign out. Enter a new email address and tap ส่งรหัสเข้าอีเมล. An email with
   a six-digit code arrives; type or paste it and the page signs you in on its
   own, with no confirmation email.
3. Repeat step 2 inside the Facebook app's browser. Email is the first option
   there, the consent box sits under its button, and you stay in the same page.
4. Sign in with an old password account's address: the code signs it in.
5. On `/tracker`, switch on email reminders. One verification email should
   arrive. Tap it and the page should confirm.
6. Repeat step 2 with JavaScript disabled. It must still work: the form is a
   real `POST` to `/api/auth/otp/send`, and the code form posts the same way.

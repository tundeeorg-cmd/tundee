# Supabase Auth settings for TunDee

Run through this once, and re-check items 1 and 3 after any dashboard change.

TunDee's primary sign-in is **email + password**, because it is the only method
that completes inside the Facebook, Instagram and TikTok in-app browsers that
nearly all paid traffic arrives in. Google is blocked there by policy, LINE
falls back to a password form most Thai users cannot complete, and a magic link
forces the student out of the browser and into a mail app, where they do not
come back. The magic-link flow has been removed entirely.

---

## 1. Email provider

**Path:** Authentication → Sign In / Providers → Email

| Setting | Value | Why |
|---|---|---|
| **Enable Email provider** | ON | Required for password sign-in |
| **Confirm email** | **OFF** | Load-bearing. With it ON, `signUp` returns no session and the student is stranded on a "check your email" screen — the exact drop-off this design removes. With it OFF, the account is live and signed in immediately. |
| **Enable Magic Links** | OFF | Nothing calls `signInWithOtp` any more. |
| **Minimum password length** | 8 or lower | The app enforces 8 (`lib/auth/password.ts`). A higher value here would reject passwords the form's own hint said were fine. |

> **If you ever turn "Confirm email" back on**, `app/api/auth/password/route.ts`
> already handles the shape change (Supabase then returns an obfuscated user
> with an empty `identities` array instead of a "User already registered"
> error), but every new signup would start requiring an email round trip again.

---

## 2. Email templates

**Path:** Authentication → Emails

Only **Confirm signup** still matters here, and only as a safety net — paste the
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
| `/auth/callback` | Google OAuth (`code`), the LINE bridge and password recovery (`token_hash`) |
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

This now governs recovery links only.

---

## 5. Google OAuth (unchanged)

**Path:** Authentication → Sign In / Providers → Google

Client ID and Secret from the Google Cloud Console; the callback URL there must
be `https://<project>.supabase.co/auth/v1/callback`.

40 of 78 existing accounts are Google, so this is not optional cleanup — it is
half the user base. The app hides the Google button inside embedded webviews
because Google rejects those with `disallowed_useragent` on its own domain,
where no error of ours can be shown.

---

## 6. Test it end to end

1. Open `https://www.tundee.org/auth` and sign up with a new address and a
   password. You should be signed in immediately, with **no email**.
2. Sign out, return, and sign in with the same pair.
3. Sign in again with a deliberately wrong password. A "set your password" email
   should arrive without you asking for one, and the page should say so.
4. Follow that link → `/auth/reset/confirm` → set a password → signed in.
5. On `/tracker`, switch on email reminders. One verification email should
   arrive. Tap it and the page should confirm.
6. Repeat step 1 with JavaScript disabled. It must still work: the form is a
   real `POST` to `/api/auth/password` with real field names.

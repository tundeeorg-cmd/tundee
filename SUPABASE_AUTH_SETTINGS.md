# Supabase Auth Settings for TunDee Magic Link

Run through this checklist once before launch.

---

## 1. Enable Magic Link / OTP Email

**Path:** Authentication → Sign In / Providers → Email

Settings to configure:
- ✅ **Enable Email provider** — ON
- ✅ **Enable Magic Links** — ON  
  *(This is the `signInWithOtp` method — sends a one-click sign-in link)*
- ⚙️ **Confirm email** — your choice:
  - `OFF` → users are logged in immediately after clicking the magic link (recommended for TunDee)
  - `ON`  → adds an extra email verification step for new accounts

> TunDee uses `shouldCreateUser: true` in `signInWithOtp` so Supabase automatically
> creates an account for emails it hasn't seen before — no separate sign-up step needed.

---

## 2. Update Email Templates

**Path:** Authentication → Emails

For each template, click it and paste the HTML from `EMAIL_TEMPLATES.md`:

| Template      | File section              | Priority |
|---------------|--------------------------|----------|
| Magic Link    | Section 1 (⭐ most important) | Required |
| Confirm signup| Section 2                | Recommended |
| Reset password| Section 3                | Recommended |

---

## 3. URL Configuration

**Path:** Authentication → URL Configuration

Set these values:

| Field | Value |
|-------|-------|
| **Site URL** | `https://www.tundee.org` |
| **Redirect URLs** | Add all three below |

Redirect URLs to add (one per line):
```
https://www.tundee.org/**
https://tundee.org/**
http://localhost:3000/**
```

> The `**` wildcard is required for the callback route to work
> (`/auth/callback?token_hash=...&type=email`).

---

## 4. Magic Link OTP Expiry

**Path:** Authentication → Configuration → Auth

| Setting | Recommended value |
|---------|------------------|
| OTP expiry | `3600` (1 hour) |
| Mailer OTP length | `6` (default) |

---

## 5. Google OAuth (keep existing)

**Path:** Authentication → Sign In / Providers → Google

This should already be configured. Make sure:
- Client ID and Secret from Google Cloud Console are set
- Callback URL in Google Console matches: `https://[your-supabase-project].supabase.co/auth/v1/callback`

---

## 6. Test magic link end-to-end

1. Go to `https://www.tundee.org/auth`
2. Enter your email address
3. Click **"ส่งลิงก์เข้าสู่ระบบ →"**
4. Check your email — you should get the TunDee-branded email within 30 seconds
5. Click the button in the email
6. You should land on `/profile/setup` (new user) or `/scholarships` (returning user)

> If the magic link redirects to a blank page or error, check that:
> - Your domain is in the Redirect URLs list above
> - The `/auth/callback` route is deployed (it handles `token_hash` from magic links)

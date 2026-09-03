# TunDee — Supabase Email Templates

Paste these in: **Supabase Dashboard → Authentication → Emails**

---

## ⚠️ Read this before pasting anything

These templates were rewritten on **3 Sep 2026**. The previous version predated
the passwordless rebuild by seven weeks and would have broken sign-in in two
ways at once. If the live templates still look like the old ones, email sign-in
does not work at all — and it fails silently, from the student's side.

**Two rules, and everything else here follows from them:**

**1. The Magic Link template MUST contain `{{ .Token }}`.**
Email sign-in is a six-digit code typed into the page the student is already
on. `{{ .Token }}` is that code. An email without it gives them nothing to
type, and the entire email path is dead — which matters most inside the
Facebook in-app browser, where it is the *only* way in that never leaves the
webview.

**2. Links MUST point at `/auth/callback?token_hash=…`, never `{{ .ConfirmationURL }}`.**
`{{ .ConfirmationURL }}` points at Supabase's own `/auth/v1/verify`, which
returns the session in the URL **fragment** (`#access_token=…`). A fragment is
never sent to the server, so `app/auth/callback/route.ts` receives an empty
query string and redirects to `?error=no_credentials`. That route has a
`console.error` describing exactly this, written when it was first diagnosed:

> *"This is NOT an expired link. It means the callback was reached with no
> token_hash and no code — which is what happens when an email points at
> Supabase's /auth/v1/verify endpoint."*

`{{ .TokenHash }}` is the server-readable equivalent and works from **any**
browser, which is what makes the link a usable fallback when a student taps it
in Gmail and lands in Chrome instead of the webview they started in.

**Which template does `signInWithOtp` use?** The **Magic Link** one. Supabase
sends that template for `signInWithOtp({ email })`, and it renders both
`{{ .Token }}` and `{{ .TokenHash }}` — so a single email carries the code AND
the link. Both paths land in the same session.

---

## 1. Magic Link / Sign-In OTP ⭐ The one that matters

**Subject:**
```
รหัสเข้าสู่ระบบ TunDee ทุนดี — Your sign-in code
```

**Body (HTML):**
```html
<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TunDee Sign-In Code</title>
</head>
<body style="margin:0;padding:0;background:#F5F5F7;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F5F7;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 20px rgba(0,0,0,0.08);">

        <tr><td style="height:4px;background:#F0A500;"></td></tr>

        <tr><td style="padding:36px 40px 28px;text-align:center;border-bottom:1px solid #F5F5F7;">
          <p style="margin:0 0 4px;font-size:28px;font-weight:700;color:#1D1D1F;letter-spacing:-0.5px;">ทุนดี</p>
          <p style="margin:0;font-size:11px;font-weight:600;color:#F0A500;letter-spacing:0.3em;text-transform:uppercase;">TUNDEE</p>
        </td></tr>

        <tr><td style="padding:36px 40px;">
          <p style="margin:0 0 8px;font-size:20px;font-weight:600;color:#1D1D1F;">
            รหัสเข้าสู่ระบบของคุณ
          </p>
          <p style="margin:0 0 24px;font-size:13px;color:#6E6E73;">Your sign-in code</p>

          <!-- THE CODE. First, largest, selectable. This is the primary path:
               the student types it into the page they are already on, and
               never leaves the browser they started in. -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
            <tr><td align="center" style="background:#FFF8E7;border:1px solid rgba(240,165,0,0.25);border-radius:14px;padding:24px 16px;">
              <p style="margin:0 0 10px;font-size:12px;color:#B8860B;letter-spacing:0.05em;">
                กรอกรหัสนี้ในหน้าเว็บ · Enter this code
              </p>
              <p style="margin:0;font-size:38px;font-weight:700;color:#1D1D1F;letter-spacing:0.28em;font-family:'SF Mono',Menlo,Consolas,monospace;">
                {{ .Token }}
              </p>
            </td></tr>
          </table>

          <!-- Divider -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
            <tr>
              <td style="border-bottom:1px solid #EFEFEF;"></td>
              <td width="60" align="center" style="font-size:12px;color:#ADADB8;">หรือ · or</td>
              <td style="border-bottom:1px solid #EFEFEF;"></td>
            </tr>
          </table>

          <!-- Fallback link. token_hash, NOT ConfirmationURL: it is readable by
               our server, so it works even when the student taps it in Gmail
               and lands in a different browser from the one that asked. -->
          <table cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
            <tr><td style="background:#1B3A6B;border-radius:50px;">
              <a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email"
                 style="display:inline-block;padding:14px 34px;font-size:15px;font-weight:700;color:#fff;text-decoration:none;">
                กดเพื่อเข้าสู่ระบบ · Sign in →
              </a>
            </td></tr>
          </table>

          <div style="background:#FFF8E7;border:1px solid rgba(240,165,0,0.2);border-radius:10px;padding:12px 16px;">
            <p style="margin:0;font-size:13px;color:#B8860B;">
              ⏱ รหัสหมดอายุใน 1 ชั่วโมง<br>
              <span style="font-size:12px;color:#D4920A;">This code expires in 1 hour</span>
            </p>
          </div>

          <p style="margin:20px 0 0;font-size:12px;color:#ADADB8;line-height:1.6;">
            หากคุณไม่ได้ขอรหัสนี้ โปรดเพิกเฉยต่ออีเมลนี้<br>
            If you didn't request this code, you can safely ignore this email.
          </p>
        </td></tr>

        <tr><td style="padding:20px 40px 28px;text-align:center;border-top:1px solid #F5F5F7;">
          <p style="margin:0;font-size:11px;color:#ADADB8;">
            © 2026 ทุนดี (TunDee) ·
            <a href="https://www.tundee.org" style="color:#F0A500;text-decoration:none;">tundee.org</a>
          </p>
          <p style="margin:4px 0 0;font-size:10px;color:#C8C8C8;">
            สร้างเพื่อนักเรียนไทยทุกคน · Built for every Thai student
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>
```

---

## 2. Reset Password

Still reachable: `/auth/reset` exists for anyone holding an old link, and
`/auth/callback` routes a `type=recovery` token to `/auth/reset/confirm`.
Same `token_hash` rule — a recovery link is routinely opened in a different
browser from the one that asked for it, which is precisely the case
`{{ .ConfirmationURL }}` cannot serve.

**Subject:**
```
รีเซ็ตรหัสผ่าน TunDee ทุนดี — Reset your password
```

**Body (HTML):**
```html
<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#F5F5F7;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F5F7;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 20px rgba(0,0,0,0.08);">

        <tr><td style="height:4px;background:#F0A500;"></td></tr>

        <tr><td style="padding:36px 40px 28px;text-align:center;border-bottom:1px solid #F5F5F7;">
          <p style="margin:0 0 4px;font-size:28px;font-weight:700;color:#1D1D1F;">ทุนดี</p>
          <p style="margin:0;font-size:11px;font-weight:600;color:#F0A500;letter-spacing:0.3em;text-transform:uppercase;">TUNDEE</p>
        </td></tr>

        <tr><td style="padding:36px 40px;">
          <p style="margin:0 0 8px;font-size:20px;font-weight:600;color:#1D1D1F;">ตั้งรหัสผ่านใหม่</p>
          <p style="margin:0 0 20px;font-size:13px;color:#6E6E73;">Reset your password</p>

          <p style="margin:0 0 20px;font-size:15px;color:#3D3D3D;line-height:1.7;">
            กดปุ่มด้านล่างเพื่อตั้งรหัสผ่านใหม่<br>
            <span style="color:#8E8E93;font-size:13px;">Click below to set a new password.</span>
          </p>

          <table cellpadding="0" cellspacing="0" style="margin:28px 0;">
            <tr><td style="background:#F0A500;border-radius:50px;">
              <a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=recovery"
                 style="display:inline-block;padding:15px 36px;font-size:15px;font-weight:700;color:#fff;text-decoration:none;">
                ตั้งรหัสผ่านใหม่ · Reset Password →
              </a>
            </td></tr>
          </table>

          <div style="background:#FFF8E7;border:1px solid rgba(240,165,0,0.2);border-radius:10px;padding:12px 16px;margin-bottom:16px;">
            <p style="margin:0;font-size:13px;color:#B8860B;">
              ⏱ ลิงก์หมดอายุใน 1 ชั่วโมง / Link expires in 1 hour
            </p>
          </div>

          <p style="margin:0;font-size:12px;color:#ADADB8;line-height:1.6;">
            หากคุณไม่ได้ขอรีเซ็ตรหัสผ่าน โปรดเพิกเฉยต่ออีเมลนี้<br>
            If you didn't request this, you can safely ignore this email.
          </p>
        </td></tr>

        <tr><td style="padding:20px 40px 28px;text-align:center;border-top:1px solid #F5F5F7;">
          <p style="margin:0;font-size:11px;color:#ADADB8;">
            © 2026 ทุนดี (TunDee) · <a href="https://www.tundee.org" style="color:#F0A500;text-decoration:none;">tundee.org</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
```

---

## 3. Confirm Sign Up — not in use

Production has **Confirm email OFF** (`mailer_autoconfirm: true`), so this
template is never sent. `emails/supabase/confirm-signup.html` is kept for the
case where it is switched back on. If it ever is, apply the same `token_hash`
rule: `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=signup`.

---

## Settings these templates depend on

**Authentication → Providers → Email**
- Email enabled
- **Confirm email OFF** — otherwise a new account cannot sign in until it
  confirms, and the code path stalls at a screen nobody expects

**Authentication → URL Configuration**
- Site URL: `https://www.tundee.org` — this is what `{{ .SiteURL }}` renders as,
  so it must be right or every link in every email points somewhere else
- Redirect URLs must include:
  - `https://www.tundee.org/auth/callback`
  - `http://localhost:3000/auth/callback`

---

## Verifying it actually works

Paste the template, then request a code at `/auth` and check the email:

1. **A six-digit number is visible** — if not, `{{ .Token }}` is missing and
   nobody can sign in by email
2. **The button's URL starts with `https://www.tundee.org/auth/callback?token_hash=`**
   — if it contains `/auth/v1/verify`, it is still `{{ .ConfirmationURL }}` and
   tapping it lands on `?error=no_credentials`
3. Type the code into the page: it should sign in without the page navigating
   away
4. Open the link instead, **in a different browser**: it should also sign in,
   and the `/start` answers should survive (that is what `pending_intake`
   carries)

Symptom-to-cause, for when it goes wrong:

| What the student sees | Cause |
|---|---|
| Email has a link but no code | `{{ .Token }}` missing from the template |
| `?error=no_credentials` after tapping the link | Link uses `{{ .ConfirmationURL }}` instead of `token_hash` |
| `?error=link_invalid` | Token genuinely expired or already used |
| Code is rejected as invalid every time | Wrong template edited — check **Magic Link**, not OTP or Confirm Signup |

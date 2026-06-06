# Supabase Setup Guide — TunDee Auth

Complete this once before launching magic link auth.

---

## 1. URL Configuration

**Path:** Authentication → URL Configuration

| Field | Value |
|-------|-------|
| **Site URL** | `https://www.tundee.org` |

**Redirect URLs** — add all three:
```
https://www.tundee.org/**
https://tundee.org/**
http://localhost:3000/**
```

> The `/**` wildcard is required so `/auth/callback?token_hash=…&type=email` is accepted.

---

## 2. Email Provider Settings

**Path:** Authentication → Sign In / Providers → Email

| Setting | Value |
|---------|-------|
| Enable Email provider | ✅ ON |
| Enable Magic Links | ✅ ON |
| Confirm email | ❌ OFF (users sign in immediately) |

> `shouldCreateUser: true` is set in code — Supabase auto-creates accounts for new emails.

---

## 3. Auth Settings

**Path:** Authentication → Configuration → Auth

| Setting | Value |
|---------|-------|
| OTP expiry (seconds) | `3600` (1 hour) |
| Mailer OTP length | `6` |

---

## 4. Magic Link Email Template

**Path:** Authentication → Emails → Magic Link

**Subject:**
```
ลิงก์เข้าสู่ระบบ TunDee ทุนดี — Your sign-in link
```

**Body (HTML):**
```html
<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TunDee Sign-In Link</title>
</head>
<body style="margin:0;padding:0;background:#F5F5F7;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F5F7;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 20px rgba(0,0,0,0.08);">

        <!-- Gold top bar -->
        <tr><td style="height:4px;background:#F0A500;"></td></tr>

        <!-- Header -->
        <tr><td style="padding:36px 40px 28px;text-align:center;border-bottom:1px solid #F5F5F7;">
          <p style="margin:0 0 4px;font-size:28px;font-weight:700;color:#1D1D1F;letter-spacing:-0.5px;">ทุนดี</p>
          <p style="margin:0;font-size:11px;font-weight:600;color:#F0A500;letter-spacing:0.3em;text-transform:uppercase;">TUNDEE</p>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:36px 40px;">
          <p style="margin:0 0 8px;font-size:20px;font-weight:600;color:#1D1D1F;">
            ลิงก์เข้าสู่ระบบของคุณ
          </p>
          <p style="margin:0 0 6px;font-size:13px;color:#6E6E73;">Your sign-in link</p>

          <p style="margin:20px 0;font-size:15px;color:#3D3D3D;line-height:1.7;">
            กดปุ่มด้านล่างเพื่อเข้าสู่ระบบ TunDee ทุนดี<br>
            <span style="color:#8E8E93;font-size:13px;">Click the button below to sign in to TunDee.</span>
          </p>

          <!-- CTA Button -->
          <table cellpadding="0" cellspacing="0" style="margin:28px 0;">
            <tr><td style="background:#F0A500;border-radius:50px;">
              <a href="{{ .ConfirmationURL }}"
                 style="display:inline-block;padding:15px 36px;font-size:15px;font-weight:700;color:#fff;text-decoration:none;letter-spacing:0.01em;">
                เข้าสู่ระบบ · Sign In →
              </a>
            </td></tr>
          </table>

          <!-- Fallback URL -->
          <p style="margin:0 0 8px;font-size:13px;color:#6E6E73;">
            หากปุ่มไม่ทำงาน คัดลอกลิงก์นี้ไปวางในเบราว์เซอร์:<br>
            <span style="color:#8E8E93;font-size:11px;">If the button doesn't work, paste this URL:</span>
          </p>
          <p style="margin:0 0 24px;font-size:11px;color:#ADADB8;word-break:break-all;">
            {{ .ConfirmationURL }}
          </p>

          <!-- Expiry notice -->
          <div style="background:#FFF8E7;border:1px solid rgba(240,165,0,0.2);border-radius:10px;padding:12px 16px;">
            <p style="margin:0;font-size:13px;color:#B8860B;">
              ⏱ ลิงก์หมดอายุใน 1 ชั่วโมง<br>
              <span style="font-size:12px;color:#D4920A;">Link expires in 1 hour</span>
            </p>
          </div>

          <p style="margin:20px 0 0;font-size:12px;color:#ADADB8;line-height:1.6;">
            หากคุณไม่ได้ขอลิงก์นี้ โปรดเพิกเฉยต่ออีเมลนี้<br>
            If you didn't request this link, you can safely ignore this email.
          </p>
        </td></tr>

        <!-- Footer -->
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

## 5. Google OAuth (if not already done)

**Path:** Authentication → Sign In / Providers → Google

1. Enable Google provider
2. Paste **Client ID** and **Client Secret** from Google Cloud Console
3. In Google Cloud Console → OAuth credentials → Authorized redirect URIs, add:
   ```
   https://egfcqafrlrhkjnynsiyb.supabase.co/auth/v1/callback
   ```

---

## 6. Test end-to-end

1. Visit `https://www.tundee.org/auth`
2. Enter your email → click **ส่งลิงก์เข้าสู่ระบบ**
3. Check inbox — branded TunDee email arrives within 30 s
4. Click **เข้าสู่ระบบ · Sign In →**
5. Browser should land on `/profile/setup` (new user) or `/scholarships` (returning)

**If redirected to `/auth?error=auth_failed`:**
- Confirm the domain is in Redirect URLs (`https://www.tundee.org/**`)
- Check OTP expiry is at least 3600
- Make sure "Enable Magic Links" is ON

---

## 7. Database: run SQL scripts

Run in **Supabase → SQL Editor** (in this order):

```sql
-- 1. Add last_active_at to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;

-- 2. Fix save/bookmark upsert
CREATE UNIQUE INDEX IF NOT EXISTS idx_applications_user_scholarship
  ON public.applications(user_id, scholarship_id);

ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS checklist_progress INTEGER[] DEFAULT '{}';
```

Then run `scripts/admin_views.sql` for the analytics dashboard.
Remember to replace `tundee.org@gmail.com` in that file with your actual admin email.

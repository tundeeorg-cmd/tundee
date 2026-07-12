# TunDee — Supabase Email Templates

Paste these in: **Supabase Dashboard → Authentication → Emails**

---

## 1. Magic Link / Sign-In OTP  ⭐ Most Important

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

          <!-- Or copy link -->
          <p style="margin:0 0 8px;font-size:13px;color:#6E6E73;">
            หากปุ่มไม่ทำงาน ให้คัดลอกลิงก์นี้ไปวางในเบราว์เซอร์:<br>
            <span style="color:#8E8E93;font-size:11px;">If the button doesn't work, copy and paste this URL:</span>
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

## 2. Confirm Sign Up (Email Verification)

**Subject:**
```
ยืนยันอีเมล TunDee ทุนดี — Confirm your email
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
          <p style="margin:0 0 8px;font-size:20px;font-weight:600;color:#1D1D1F;">ยืนยันที่อยู่อีเมล</p>
          <p style="margin:0 0 20px;font-size:13px;color:#6E6E73;">Confirm your email address</p>

          <p style="margin:0 0 20px;font-size:15px;color:#3D3D3D;line-height:1.7;">
            ขอบคุณที่สมัครสมาชิก TunDee ทุนดี!<br>
            กดปุ่มด้านล่างเพื่อยืนยันอีเมลและเริ่มค้นหาทุน<br>
            <span style="color:#8E8E93;font-size:13px;">Thanks for signing up! Click below to verify your email and start finding scholarships.</span>
          </p>

          <table cellpadding="0" cellspacing="0" style="margin:28px 0;">
            <tr><td style="background:#F0A500;border-radius:50px;">
              <a href="{{ .ConfirmationURL }}"
                 style="display:inline-block;padding:15px 36px;font-size:15px;font-weight:700;color:#fff;text-decoration:none;">
                ยืนยันอีเมล · Confirm Email →
              </a>
            </td></tr>
          </table>

          <p style="margin:0 0 8px;font-size:12px;color:#ADADB8;">{{ .ConfirmationURL }}</p>

          <p style="margin:20px 0 0;font-size:12px;color:#ADADB8;line-height:1.6;">
            หากคุณไม่ได้สมัครสมาชิก โปรดเพิกเฉยต่ออีเมลนี้<br>
            If you didn't sign up, you can safely ignore this email.
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

## 3. Reset Password

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
          <p style="margin:0 0 8px;font-size:20px;font-weight:600;color:#1D1D1F;">รีเซ็ตรหัสผ่าน</p>
          <p style="margin:0 0 20px;font-size:13px;color:#6E6E73;">Reset your password</p>

          <p style="margin:0 0 20px;font-size:15px;color:#3D3D3D;line-height:1.7;">
            กดปุ่มด้านล่างเพื่อตั้งรหัสผ่านใหม่<br>
            <span style="color:#8E8E93;font-size:13px;">Click below to set a new password for your account.</span>
          </p>

          <table cellpadding="0" cellspacing="0" style="margin:28px 0;">
            <tr><td style="background:#F0A500;border-radius:50px;">
              <a href="{{ .ConfirmationURL }}"
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
            If you didn't request a password reset, you can safely ignore this email.
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

## Where to paste these in Supabase

1. Go to **Authentication → Emails** in your Supabase dashboard
2. For each template type, click it and paste the **Subject** and **Body (HTML)** above
3. The `{{ .ConfirmationURL }}` placeholder is replaced automatically by Supabase

> **Note:** Magic link uses the **"Magic Link"** template. If your project uses **OTP**, use the **"OTP"** template instead (same content, Supabase picks based on your Email Auth settings).

/**
 * The line under the LINE button: what TunDee receives from LINE, and what not.
 *
 * LINE sign-in gives us the LINE user id, display name and profile picture —
 * never an email or phone number. Through Supabase's `custom:line` provider the
 * profile comes from LINE's userinfo endpoint, which has no email at all, so the
 * Email address permission is deliberately not applied for. Saying so up front
 * answers the "what does this take from me" question at the moment it is asked,
 * and must agree with §2 and §3 of /privacy, which say the same thing at length.
 *
 * Shared by AuthForm (hydrated) and AuthShell (no-JS) so the two cannot drift.
 */

export const LINE_DATA_NOTICE = {
  th: 'ทุนดีได้รับเฉพาะชื่อ รูปโปรไฟล์ และรหัสผู้ใช้ LINE ของคุณ ไม่ได้รับอีเมลหรือเบอร์โทร',
  en: 'TunDee receives only your LINE name, profile picture and user ID — never your email or phone number.',
  privacyLabel: { th: 'นโยบายความเป็นส่วนตัว', en: 'Privacy policy' },
} as const;

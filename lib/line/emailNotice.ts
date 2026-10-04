/**
 * The notice under the LINE button: what LINE will ask, and why we want the email.
 *
 * LINE only returns a user's email once the Login channel's *Email address
 * permission* is approved, and the application requires a screenshot of the
 * screen where users are told, before consenting, that the email is collected
 * and what for. This text is that screen. It also has to agree with §2 and §3
 * of /privacy, which say the same thing at length.
 *
 * Shared by AuthForm (hydrated) and AuthShell (no-JS) so the two cannot drift.
 */

export const LINE_EMAIL_NOTICE = {
  th: 'LINE จะถามว่าให้ทุนดีเห็นอีเมลของคุณหรือไม่ ถ้าอนุญาต เราใช้อีเมลนั้นเป็นอีเมลของบัญชี เพื่อให้เข้าสู่ระบบด้วยอีเมลได้ด้วย และใช้ส่งแจ้งเตือนกำหนดปิดรับทุนที่คุณบันทึกไว้หากคุณเปิดรับ ไม่อนุญาตก็ใช้ทุนดีได้ตามปกติ',
  en: "LINE will ask whether to share your email with TunDee. If you allow it, it becomes your account email, so you can also sign in by email, and it's used for deadline reminders on scholarships you save, if you turn them on. Saying no doesn't stop you using TunDee.",
  privacyLabel: { th: 'นโยบายความเป็นส่วนตัว', en: 'Privacy policy' },
} as const;

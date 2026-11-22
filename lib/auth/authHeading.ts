/**
 * The /auth heading, by why the student is there (`from`).
 *
 * The default talks about matched scholarships, which is right after the /start
 * quiz and wrong after a Save tap: a student who was already looking at
 * scholarships was told to sign in "to see" them. Shared by AuthShell (server,
 * no JavaScript) and AuthForm so the two cannot disagree.
 */

export function authHeading(from: string | null | undefined, th: boolean): string {
  if (from === 'track') {
    return th
      ? 'เข้าสู่ระบบเพื่อบันทึกทุนนี้ และรับแจ้งเตือนก่อนปิดรับ'
      : 'Sign in to save this scholarship and get a reminder before it closes';
  }
  return th ? 'เข้าสู่ระบบเพื่อดูทุนที่ตรงกับคุณ' : 'Sign in to see your matched scholarships';
}

/**
 * Which link brought the student to /auth, for the signup_started event.
 * Only known values are recorded; anything else is 'other', never the raw text.
 */
const KNOWN_FROM = new Set(['track', 'signup', 'scholarships', 'line-connect']);
export function authEntryFrom(from: string | null | undefined): string {
  if (!from) return 'direct';
  return KNOWN_FROM.has(from) ? from : 'other';
}

/**
 * Whether /auth opens with the email form unfolded.
 *
 * `from=signup` is the link labelled "สมัครด้วยอีเมล" on /start (buildSignupHref):
 * the student has already chosen email. Folding it behind "ใช้อีเมลแทน" made them
 * choose twice. LINE and Google stay on the page above it.
 */
export function emailOpenFor(from: string | null | undefined): boolean {
  return from === 'signup';
}

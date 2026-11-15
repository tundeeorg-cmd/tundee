/**
 * The "nobody signed up" alarm: what counts as an alert, and what it says.
 *
 * On 15 Nov 2026 a week of zero signups was reported as "signup is down". It
 * took an hour of queries to learn that nothing was broken: ~35 students had
 * opened the email form and not one pressed send. The alarm therefore does two
 * things: it fires when ad traffic arrives and no account is created, and it
 * says which of three situations that is, from the same funnel events, so the
 * next person does not start by rebuilding the SMTP setup.
 *
 * Pure: the cron route gathers the counts, this decides. Tested on its own.
 */

/** Below this many landing views in the window, zero signups is not news. */
export const MIN_LANDING_VIEWS = 30;

/** The window the daily check looks back over. */
export const WINDOW_HOURS = 24;

export interface SignupCounts {
  newAccounts:    number;
  landingViews:   number;
  /** /auth opened (signup_started). */
  signupStarted:  number;
  /** A code was sent (otp_sent). */
  otpSent:        number;
  /** A code was accepted (otp_verified). */
  otpVerified:    number;
  /** otp_failed at the send step: Supabase or the network refused to send. */
  sendFailures:   number;
  /** otp_failed at the verify step. */
  verifyFailures: number;
}

export type SignupDiagnosis =
  | 'ok'               // at least one account, or too little traffic to judge
  | 'send_failing'     // codes are being refused: delivery / Supabase / rate limit
  | 'codes_not_working'// codes go out but none is accepted
  | 'nobody_pressed_send' // the form is reached, nobody submits it
  | 'nobody_reached_signup'; // traffic, but nobody opens the sign-in form

export function diagnoseSignups(c: SignupCounts): SignupDiagnosis {
  if (c.newAccounts > 0 || c.landingViews < MIN_LANDING_VIEWS) return 'ok';
  if (c.sendFailures > 0 && c.otpSent === 0)                   return 'send_failing';
  if (c.otpSent > 0 && c.otpVerified === 0)                    return 'codes_not_working';
  if (c.signupStarted > 0 && c.otpSent === 0)                  return 'nobody_pressed_send';
  // Codes went out and were accepted, yet no new account: returning users only.
  if (c.otpVerified > 0)                                       return 'ok';
  return 'nobody_reached_signup';
}

const MEANING: Record<Exclude<SignupDiagnosis, 'ok'>, string> = {
  send_failing:
    'Codes are being REFUSED when students press send. This is a real outage: check ' +
    'Supabase → Authentication → Logs and the SMTP / rate-limit settings now.',
  codes_not_working:
    'Codes are sent but none is accepted. Check that the email arrives, and the ' +
    'Supabase email OTP length (must be 6) and the Magic Link template ({{ .Token }}).',
  nobody_pressed_send:
    'Students open the sign-in form and leave without pressing send. Nothing is ' +
    'failing technically; this is a conversion problem on /auth, not an outage.',
  nobody_reached_signup:
    'Visitors arrive but nobody opens the sign-in form. Look at the landing page, ' +
    'the ads and /start rather than at sign-in.',
};

export function buildSignupAlertEmail(c: SignupCounts, d: Exclude<SignupDiagnosis, 'ok'>) {
  const rows: [string, number][] = [
    ['New accounts',             c.newAccounts],
    ['Landing views',            c.landingViews],
    ['Sign-in form opened',      c.signupStarted],
    ['Codes sent',               c.otpSent],
    ['Codes accepted',           c.otpVerified],
    ['Send failures',            c.sendFailures],
    ['Wrong / expired codes',    c.verifyFailures],
  ];
  const subject = `TunDee: 0 signups in ${WINDOW_HOURS}h (${c.landingViews} landing views)`;
  const text = [
    `No new TunDee accounts in the last ${WINDOW_HOURS} hours, with ${c.landingViews} landing views.`,
    '',
    MEANING[d],
    '',
    ...rows.map(([k, v]) => `${k}: ${v}`),
    '',
    'Sent by /api/cron/signup-alert (daily, vercel.json).',
  ].join('\n');
  const html =
    `<p>No new TunDee accounts in the last ${WINDOW_HOURS} hours, with ${c.landingViews} landing views.</p>` +
    `<p><strong>${MEANING[d]}</strong></p>` +
    `<table cellpadding="4">${rows.map(([k, v]) => `<tr><td>${k}</td><td align="right">${v}</td></tr>`).join('')}</table>` +
    `<p style="color:#888">Sent by /api/cron/signup-alert (daily, vercel.json).</p>`;
  return { subject, text, html };
}

/**
 * Who gets the alert: SIGNUP_ALERT_EMAIL if set, else the admin addresses the
 * app already knows (NEXT_PUBLIC_ADMIN_EMAIL, ADMIN_EMAILS). Comma-separated.
 */
export function signupAlertRecipients(env: Record<string, string | undefined> = process.env): string[] {
  const split = (v?: string) => (v ?? '').split(',').map(s => s.trim()).filter(Boolean);
  const explicit = split(env.SIGNUP_ALERT_EMAIL);
  if (explicit.length) return explicit;
  const all = [...split(env.NEXT_PUBLIC_ADMIN_EMAIL), ...split(env.ADMIN_EMAILS)];
  return all.filter((e, i) => all.indexOf(e) === i);
}

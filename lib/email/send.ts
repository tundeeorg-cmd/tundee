/**
 * One Resend call, in one place.
 *
 * Returns a boolean rather than throwing: every caller's correct response to a
 * failed send is to fall back to Supabase's own mailer, never to fail the
 * user's request. An auth email that does not arrive in Thai is a degraded
 * experience; an auth flow that 500s is a locked-out student.
 */

const RESEND_API = 'https://api.resend.com/emails';

export interface OutgoingEmail {
  subject: string;
  html: string;
  text: string;
}

export async function sendEmail(to: string, from: string, email: OutgoingEmail): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;

  try {
    const res = await fetch(RESEND_API, {
      method:  'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        from,
        to:      [to],
        subject: email.subject,
        html:    email.html,
        text:    email.text,
      }),
    });
    if (!res.ok) {
      console.error('[email/send] Resend returned', res.status, await res.text());
      return false;
    }
    return true;
  } catch (e) {
    console.error('[email/send] Resend threw:', e);
    return false;
  }
}

/**
 * The "set your password" email.
 *
 * This is the ONLY way back into an account whose password is unknown or was
 * never set — which includes every account created by the magic-link flow that
 * email + password replaced. It cannot be allowed to fail silently, and it
 * cannot be skipped: setting a first password without proving control of the
 * address would let anyone who knows a student's email take their account.
 *
 * Two senders, in order:
 *   1. Our own Resend send, so the Thai copy lives in version control.
 *   2. Supabase's built-in mailer, on ANY failure of the above.
 * A problem with (1) costs a student the Thai wording, never the ability to
 * get back in.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { setPasswordEmail, AUTH_EMAIL_FROM } from '@/lib/email/authEmails';
import { sendEmail } from '@/lib/email/send';
import type { Language } from '@/lib/types';

function adminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/**
 * Sends the set-password email. Best-effort by contract: the boolean says
 * whether a send was attempted successfully, and callers show the same "check
 * your email" copy either way.
 *
 * Deliberately does NOT reveal whether the address exists. Supabase's own
 * resetPasswordForEmail behaves this way, and losing it would turn this into an
 * "is this person a TunDee user?" oracle for anyone who can type an address —
 * a real concern when the users are minors.
 */
export async function sendSetPasswordEmail(
  email: string,
  siteUrl: string,
  next: string,
  lang: Language = 'th',
): Promise<boolean> {
  const address = email.trim().toLowerCase();
  const redirectTo = `${siteUrl}/auth/callback?type=recovery&next=${encodeURIComponent(next)}`;

  const admin = adminClient();
  if (admin) {
    try {
      const { data, error } = await admin.auth.admin.generateLink({
        type:  'recovery',
        email: address,
        options: { redirectTo },
      });

      if (!error && data.properties?.hashed_token) {
        // Point at OUR callback with the token hash rather than using the
        // action_link, which routes through Supabase's /auth/v1/verify and
        // returns the session in a URL fragment the server can never read.
        const url = new URL(`${siteUrl}/auth/callback`);
        url.searchParams.set('token_hash', data.properties.hashed_token);
        url.searchParams.set('type', 'recovery');
        url.searchParams.set('next', next);

        if (await sendEmail(address, AUTH_EMAIL_FROM, setPasswordEmail(url.toString(), lang))) {
          return true;
        }
      } else if (error) {
        console.error('[auth/recovery] generateLink failed:', error.message);
      }
    } catch (e) {
      console.error('[auth/recovery] generateLink threw:', e);
    }
  }

  // Fallback: Supabase sends its own template. Different host, so a stall on
  // ours does not imply a stall on theirs.
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const url  = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!anon || !url) return false;

  const client = createClient(url, anon, { auth: { persistSession: false } });
  const { error } = await client.auth.resetPasswordForEmail(address, { redirectTo });
  if (error) {
    console.error('[auth/recovery] resetPasswordForEmail failed:', error.message);
    return false;
  }
  return true;
}

/**
 * Placeholder LINE addresses must be recognisable by anything that sends email.
 *
 * The bridge that minted them is retired; the accounts that carry one are not.
 *
 * 11 of ~70 accounts carry one today. `send-reminders` was handing them to Resend, which
 * accepts the request and bounces later against a domain that cannot resolve — the exact
 * traffic that damages a sender's reputation, and invisible because the failure happens
 * after the API call succeeds.
 */

import { describe, it, expect } from 'vitest';
import { isSyntheticEmail, SYNTHETIC_EMAIL_DOMAIN } from '@/lib/line/syntheticEmail';

describe('the placeholders the retired LINE bridge left behind', () => {
  it('sit on a domain that can never resolve', () => {
    // RFC 2606 reserves .invalid precisely so this can never reach a real inbox.
    expect(SYNTHETIC_EMAIL_DOMAIN.endsWith('.invalid')).toBe(true);
  });

  it('are recognised in the exact form Supabase stores them', () => {
    // Nothing mints these any more, but 27 accounts still carry one until the
    // student adds a real address. Supabase lowercases the LINE id on storage.
    expect(isSyntheticEmail('line_u84ee801c1a92d72b8119abf831bb2db3@line.tundee.invalid')).toBe(true);
  });
});

describe('isSyntheticEmail', () => {
  it('recognises the placeholder regardless of case', () => {
    expect(isSyntheticEmail(`line_U1@${SYNTHETIC_EMAIL_DOMAIN}`)).toBe(true);
    expect(isSyntheticEmail(`LINE_U1@${SYNTHETIC_EMAIL_DOMAIN.toUpperCase()}`)).toBe(true);
  });

  it('leaves real addresses alone', () => {
    for (const real of ['student@gmail.com', 'a@tundee.org', 'b@line.me']) {
      expect(isSyntheticEmail(real), real).toBe(false);
    }
  });

  it('does not match a lookalike domain', () => {
    // A real address that merely contains the domain as a substring must still send.
    expect(isSyntheticEmail('someone@notline.tundee.invalid.example.com')).toBe(false);
  });

  it('is null-safe, so a missing address never reads as sendable', () => {
    expect(isSyntheticEmail(null)).toBe(false);
    expect(isSyntheticEmail(undefined)).toBe(false);
    expect(isSyntheticEmail('')).toBe(false);
  });
});

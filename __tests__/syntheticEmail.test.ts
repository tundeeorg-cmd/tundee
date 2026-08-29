/**
 * Placeholder LINE addresses must be recognisable by anything that sends email.
 *
 * 11 of ~70 accounts carry one today. `send-reminders` was handing them to Resend, which
 * accepts the request and bounces later against a domain that cannot resolve — the exact
 * traffic that damages a sender's reputation, and invisible because the failure happens
 * after the API call succeeds.
 */

import { describe, it, expect } from 'vitest';
import { syntheticEmail, isSyntheticEmail, SYNTHETIC_EMAIL_DOMAIN } from '@/lib/line/syntheticEmail';

describe('syntheticEmail', () => {
  it('builds an address on a domain that can never resolve', () => {
    // RFC 2606 reserves .invalid precisely so this can never reach a real inbox.
    expect(syntheticEmail('U1234abcd')).toBe(`line_U1234abcd@${SYNTHETIC_EMAIL_DOMAIN}`);
    expect(SYNTHETIC_EMAIL_DOMAIN.endsWith('.invalid')).toBe(true);
  });

  it('strips characters that would make the address malformed', () => {
    expect(syntheticEmail('U 12@ab/cd')).toBe(`line_U12abcd@${SYNTHETIC_EMAIL_DOMAIN}`);
  });

  it('round-trips: what it builds, it recognises', () => {
    // The property that matters — the two functions live in one module so a change to
    // the domain cannot desynchronise the sender from the auth bridge.
    expect(isSyntheticEmail(syntheticEmail('Uabc123'))).toBe(true);
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

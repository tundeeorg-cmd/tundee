/**
 * A LINE student adds an email address to their account.
 *
 * LINE accounts have no email: none at all through Supabase's custom:line
 * provider, an undeliverable placeholder from the old bridge. When one of them
 * asks for email reminders, the tracker asks for an address, a link is mailed
 * to it, and tapping the link makes it their account email.
 *
 * What must hold:
 *   • nobody can attach an address they cannot receive mail at;
 *   • a claim link cannot be passed off as a verification link, or back;
 *   • the request never reveals whether an address already has an account;
 *   • a real address already on the account is never overwritten;
 *   • the sends are capped, because the address is chosen by the student.
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import {
  createClaimToken, verifyClaimToken, createVerificationToken, verifyVerificationToken,
} from '@/lib/auth/emailVerification';

const USER  = '2f1d8c3a-0000-4000-8000-000000000001';
const OTHER = '2f1d8c3a-0000-4000-8000-000000000002';
const EMAIL = 'student@example.com';

// ── route collaborators ──────────────────────────────────────────────────────
let sessionUser: { id: string; email: string | null } | null = null;
const profileUpsert = vi.fn(async () => ({ error: null }));
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: async () => ({ data: { user: sessionUser } }) },
    from: () => ({
      upsert: profileUpsert,
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
    }),
  }),
}));

let adminUser: { id: string; email: string | null } | null = null;
const updateUserById = vi.fn(async () => ({ data: {}, error: null as null | { code?: string; message: string } }));
const adminUpsert = vi.fn(async () => ({ error: null }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    auth: { admin: { getUserById: async () => ({ data: { user: adminUser }, error: null }), updateUserById } },
    from: () => ({ upsert: adminUpsert }),
  }),
}));

const sendEmail = vi.fn(async () => true);
vi.mock('@/lib/email/send', () => ({ sendEmail }));

type Handler = (req: NextRequest) => Promise<Response>;
let POST: Handler;
let GET: Handler;
beforeAll(async () => {
  const route = await import('../app/api/auth/verify-email/route');
  POST = route.POST as Handler;
  GET  = route.GET as Handler;
});

beforeEach(() => {
  vi.stubEnv('EMAIL_VERIFY_SECRET', 'test-secret-not-a-real-one');
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://www.tundee.org');
  sendEmail.mockClear();
  updateUserById.mockClear();
  updateUserById.mockResolvedValue({ data: {}, error: null });
  adminUpsert.mockClear();
});
afterEach(() => vi.unstubAllEnvs());

const post = (body: unknown) => POST(new NextRequest('https://www.tundee.org/api/auth/verify-email', {
  method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' },
}));
const claimLink = (token: string, email: string) =>
  GET(new NextRequest(`https://www.tundee.org/api/auth/verify-email?claim=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`));

// ── the token ────────────────────────────────────────────────────────────────

describe('claim token', () => {
  it('verifies the user and address it was minted for, case-insensitively', () => {
    const token = createClaimToken(USER, 'Student@Example.COM')!;
    expect(verifyClaimToken(token, EMAIL)).toEqual({ ok: true, userId: USER });
  });

  it('is useless for any other address', () => {
    const token = createClaimToken(USER, EMAIL)!;
    expect(verifyClaimToken(token, 'attacker@example.com').ok).toBe(false);
  });

  it('cannot be relabelled to another user', () => {
    const [, expires, sig] = createClaimToken(USER, EMAIL)!.split('.');
    expect(verifyClaimToken(`${OTHER}.${expires}.${sig}`, EMAIL).ok).toBe(false);
  });

  it('is not interchangeable with a verification token, either way', () => {
    expect(verifyClaimToken(createVerificationToken(USER, EMAIL)!, EMAIL).ok).toBe(false);
    expect(verifyVerificationToken(createClaimToken(USER, EMAIL)!, EMAIL).ok).toBe(false);
  });

  it('expires', () => {
    const token = createClaimToken(USER, EMAIL, Date.now() - 8 * 24 * 60 * 60 * 1000)!;
    expect(verifyClaimToken(token, EMAIL)).toEqual({ ok: false, reason: 'expired' });
  });
});

// ── asking ───────────────────────────────────────────────────────────────────

describe('POST: a LINE account asks for reminders', () => {
  it('with no address on the account and none supplied, asks for one', async () => {
    sessionUser = { id: USER, email: null };
    const body = await (await post({ optIn: true })).json();
    expect(body.reason).toBe('no_address');
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('treats a bridge-era placeholder as no address', async () => {
    sessionUser = { id: USER, email: 'line_uabc@line.tundee.invalid' };
    expect((await (await post({ optIn: true })).json()).reason).toBe('no_address');
  });

  it('mails a claim link to the typed address, and nothing else', async () => {
    sessionUser = { id: '2f1d8c3a-0000-4000-8000-0000000000a1', email: null };
    const body = await (await post({ optIn: true, email: ' Student@Example.com ' })).json();
    expect(body).toMatchObject({ verificationSent: true, address: EMAIL });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const [to, , mail] = sendEmail.mock.calls[0] as unknown as [string, string, { html?: string; text?: string }];
    expect(to).toBe(EMAIL);
    expect(JSON.stringify(mail)).toContain('/api/auth/verify-email?claim=');
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it('rejects an implausible or placeholder address without sending', async () => {
    sessionUser = { id: '2f1d8c3a-0000-4000-8000-0000000000a2', email: null };
    expect((await (await post({ optIn: true, email: 'not-an-email' })).json()).reason).toBe('invalid_email');
    expect((await (await post({ optIn: true, email: 'line_x@line.tundee.invalid' })).json()).reason).toBe('invalid_email');
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('caps the sends per account', async () => {
    sessionUser = { id: '2f1d8c3a-0000-4000-8000-0000000000a3', email: null };
    const reasons = [];
    for (let i = 0; i < 4; i++) reasons.push((await (await post({ optIn: true, email: `s${i}@example.com` })).json()).reason);
    expect(reasons.slice(0, 3)).toEqual([undefined, undefined, undefined]);
    expect(reasons[3]).toBe('rate_limited');
    expect(sendEmail).toHaveBeenCalledTimes(3);
  });

  it('never says whether the address already has an account', async () => {
    // The response shape is the same for any plausible address; there is no
    // lookup to leak. Taken-ness is only revealed to whoever opens the link.
    sessionUser = { id: '2f1d8c3a-0000-4000-8000-0000000000a4', email: null };
    const body = await (await post({ optIn: true, email: 'already-registered@example.com' })).json();
    expect(Object.keys(body).sort()).toEqual(['address', 'ok', 'optIn', 'verificationSent']);
  });
});

// ── tapping the link ─────────────────────────────────────────────────────────

describe('GET: the claim link is tapped', () => {
  it('makes the address the account email, verifies it, and offers it for sign-in — with no session', async () => {
    sessionUser = null;
    adminUser = { id: USER, email: null };
    const res = await claimLink(createClaimToken(USER, EMAIL)!, EMAIL);
    expect(updateUserById).toHaveBeenCalledWith(USER, { email: EMAIL, email_confirm: true });
    expect(adminUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: USER, email_reminders_opt_in: true, email_verified_at: expect.any(String) }),
      { onConflict: 'id' },
    );
    const to = new URL(res.headers.get('location')!);
    expect(to.pathname).toBe('/auth');
    expect(to.searchParams.get('error')).toBe('email_added');
    expect(to.searchParams.get('email')).toBe(EMAIL);
    expect(to.searchParams.get('next')).toBe('/tracker');
  });

  it('replaces a bridge-era placeholder', async () => {
    adminUser = { id: USER, email: 'line_uabc@line.tundee.invalid' };
    await claimLink(createClaimToken(USER, EMAIL)!, EMAIL);
    expect(updateUserById).toHaveBeenCalledWith(USER, { email: EMAIL, email_confirm: true });
  });

  it('never overwrites a real address the account already has', async () => {
    adminUser = { id: USER, email: 'real@example.com' };
    const res = await claimLink(createClaimToken(USER, EMAIL)!, EMAIL);
    expect(updateUserById).not.toHaveBeenCalled();
    expect(res.headers.get('location')).toBe('https://www.tundee.org/auth?error=claim_failed');
  });

  it('a second tap of the same link is harmless', async () => {
    adminUser = { id: USER, email: EMAIL };
    const res = await claimLink(createClaimToken(USER, EMAIL)!, EMAIL);
    expect(updateUserById).not.toHaveBeenCalled();
    expect(new URL(res.headers.get('location')!).searchParams.get('error')).toBe('email_added');
  });

  it('tells the inbox owner when the address belongs to another account', async () => {
    adminUser = { id: USER, email: null };
    updateUserById.mockResolvedValueOnce({ data: {}, error: { code: 'email_exists', message: 'A user with this email address has already been registered' } });
    const res = await claimLink(createClaimToken(USER, EMAIL)!, EMAIL);
    expect(res.headers.get('location')).toBe('https://www.tundee.org/auth?error=email_taken');
    expect(adminUpsert).not.toHaveBeenCalled();
  });

  it('rejects a link whose address was swapped', async () => {
    adminUser = { id: USER, email: null };
    const res = await claimLink(createClaimToken(USER, EMAIL)!, 'attacker@example.com');
    expect(updateUserById).not.toHaveBeenCalled();
    expect(res.headers.get('location')).toBe('https://www.tundee.org/auth?error=claim_failed');
  });
});

describe('the /auth page has copy for every outcome', () => {
  it('email_added, email_taken, claim_failed', async () => {
    const { readFileSync } = await import('node:fs');
    const form = readFileSync('app/auth/AuthForm.tsx', 'utf8');
    for (const code of ['email_added', 'email_taken', 'claim_failed']) expect(form).toContain(`case '${code}'`);
    // A success must not be logged as a failed signup.
    expect(form).toMatch(/if \(err !== 'email_added'( && [^)]*)?\)/);
  });
});

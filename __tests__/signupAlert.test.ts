/**
 * The "nobody signed up" alarm. The point of it is to tell an outage from a
 * conversion problem, so most of these pin the diagnosis to the funnel shape
 * each situation actually produces.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  diagnoseSignups, buildSignupAlertEmail, signupAlertRecipients,
  MIN_LANDING_VIEWS, type SignupCounts,
} from '@/lib/auth/signupAlert';

const base: SignupCounts = {
  newAccounts: 0, landingViews: 120, signupStarted: 0,
  otpSent: 0, otpVerified: 0, sendFailures: 0, verifyFailures: 0,
};
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('diagnoseSignups', () => {
  it('is quiet when anyone signed up', () => {
    expect(diagnoseSignups({ ...base, newAccounts: 1 })).toBe('ok');
  });

  it('is quiet when there was too little traffic to judge', () => {
    expect(diagnoseSignups({ ...base, landingViews: MIN_LANDING_VIEWS - 1 })).toBe('ok');
  });

  it('calls it an outage when sends are refused and none got through', () => {
    expect(diagnoseSignups({ ...base, signupStarted: 6, sendFailures: 4 })).toBe('send_failing');
  });

  it('flags codes that go out but are never accepted', () => {
    expect(diagnoseSignups({ ...base, signupStarted: 5, otpSent: 4, verifyFailures: 3 })).toBe('codes_not_working');
  });

  it('6–14 Nov 2026: form opened, nobody pressed send — conversion, not an outage', () => {
    expect(diagnoseSignups({ ...base, landingViews: 153, signupStarted: 5 })).toBe('nobody_pressed_send');
  });

  it('traffic that never reaches sign-in is its own case', () => {
    expect(diagnoseSignups(base)).toBe('nobody_reached_signup');
  });

  it('returning users signing in is not an alert', () => {
    expect(diagnoseSignups({ ...base, signupStarted: 2, otpSent: 2, otpVerified: 2 })).toBe('ok');
  });
});

describe('the alert email', () => {
  it('names the window, the traffic and what to look at', () => {
    const e = buildSignupAlertEmail({ ...base, signupStarted: 5 }, 'nobody_pressed_send');
    expect(e.subject).toContain('0 signups in 24h');
    expect(e.subject).toContain('120 landing views');
    expect(e.text).toMatch(/not an outage/);
    expect(e.text).toContain('Sign-in form opened: 5');
  });

  it('tells an outage to look at Supabase now', () => {
    expect(buildSignupAlertEmail(base, 'send_failing').text).toMatch(/real outage.*Supabase/s);
  });
});

describe('recipients', () => {
  it('prefers SIGNUP_ALERT_EMAIL', () => {
    expect(signupAlertRecipients({ SIGNUP_ALERT_EMAIL: 'a@x.org, b@x.org', ADMIN_EMAILS: 'c@x.org' }))
      .toEqual(['a@x.org', 'b@x.org']);
  });

  it('falls back to the admin addresses, without duplicates', () => {
    expect(signupAlertRecipients({ NEXT_PUBLIC_ADMIN_EMAIL: 'a@x.org', ADMIN_EMAILS: 'a@x.org,c@x.org' }))
      .toEqual(['a@x.org', 'c@x.org']);
  });

  it('is empty when nothing is configured', () => {
    expect(signupAlertRecipients({})).toEqual([]);
  });
});

describe('the cron', () => {
  const ROUTE = read('app/api/cron/signup-alert/route.ts');

  it('runs daily from vercel.json', () => {
    const crons = JSON.parse(read('vercel.json')).crons as { path: string; schedule: string }[];
    expect(crons).toContainEqual({ path: '/api/cron/signup-alert', schedule: '0 2 * * *' });
  });

  it('refuses without CRON_SECRET, like every other cron', () => {
    expect(ROUTE).toMatch(/!secret \|\| request\.headers\.get\('authorization'\) !== `Bearer \$\{secret\}`/);
  });

  it('goes red when an alert could not be delivered, instead of failing silently', () => {
    expect(ROUTE).toMatch(/status: notified > 0 \? 200 : 500/);
  });
});

/**
 * The bridge callback must not be able to fail quietly.
 *
 * From 6 to 20 Oct 2026 LINE students created an auth user and never got a
 * session, and nothing said so for three weeks. These assert the properties that
 * would have made it loud: every failure is logged with a reason, the account is
 * confirmed and has a profile before a session is minted, and every code the
 * callback can send to /auth has Thai copy with a retry button.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const CALLBACK = read('app/api/auth/line/callback/route.ts');
const FORM     = read('app/auth/AuthForm.tsx');

describe('/api/auth/line/callback (bridge)', () => {
  it('logs every failure through fail(), under the [auth/line] prefix', () => {
    expect(CALLBACK).toMatch(/console\.error\('\[auth\/line\] FAIL'/);
    expect(CALLBACK).not.toContain('[auth/line/callback]');
  });

  it('confirms the account and writes the profile before minting a session', () => {
    const confirm  = CALLBACK.indexOf('email_confirm: true });');
    const profile  = CALLBACK.indexOf(".from('profiles')", CALLBACK.indexOf('resolveUser(admin'));
    const mint     = CALLBACK.indexOf('admin.auth.admin.generateLink');
    expect(confirm).toBeGreaterThan(-1);
    expect(profile).toBeGreaterThan(confirm);
    expect(mint).toBeGreaterThan(profile);
  });

  it('does not swallow a profile upsert failure', () => {
    expect(CALLBACK).toContain("fail('line_profile_failed'");
    expect(CALLBACK).not.toMatch(/Non-fatal: the user still gets a session/);
  });

  it('never touches the research columns', () => {
    for (const col of ['ab_arm', 'cohort', 'ranking_variant', 'ranking_assigned_at']) {
      expect(CALLBACK, col).not.toContain(col);
    }
  });
});

describe('/auth copy for LINE failures', () => {
  const codes = [...CALLBACK.matchAll(/fail\('(line_[a-z_]+)'/g)].map(m => m[1]);

  it('the callback sends at least the codes we expect', () => {
    expect(codes).toEqual(expect.arrayContaining([
      'line_user_provisioning', 'line_confirm_failed', 'line_profile_failed', 'line_session_failed',
    ]));
  });

  it.each([...new Set(codes)])('%s has its own Thai message', (code) => {
    expect(FORM).toContain(`case '${code}':`);
  });

  it('offers a retry button on LINE failures', () => {
    expect(FORM).toContain('retryLine');
    expect(FORM).toContain('ลองอีกครั้ง');
  });
});

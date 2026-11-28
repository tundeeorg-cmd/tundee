/**
 * A local stand-in for Supabase, used only by the visual test (npm run test:visual).
 *
 * Why: the test server used to point at https://placeholder.invalid, so every
 * server-side query failed ("fetch failed" in the log) and the pages rendered
 * their failure fallbacks, and there was no way to be signed in, so step 6
 * (/profile/setup) and the signed-in /scholarships could never run.
 *
 * It answers the handful of endpoints the app calls, with fixture data:
 *   - auth: GET /auth/v1/user, POST /auth/v1/token, POST /auth/v1/logout
 *   - rest: td_scholarships (fixture rows), profiles (a new, empty profile),
 *           rpc get_public_scholarship_stats, anything else → empty
 *   - writes (POST/PATCH/DELETE) are accepted and discarded
 *
 * No real account, no network, nothing persisted. Plain Node, no dependencies.
 * Usage: node e2e/fake-supabase.mjs   (port from FAKE_SUPABASE_PORT, default 54329)
 */
import { createServer } from 'node:http';

const PORT = Number(process.env.FAKE_SUPABASE_PORT ?? 54329);

const E2E_USER_ID = '00000000-0000-4000-8000-00000000e2e0';

const b64url = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
/** Unsigned, but well-formed: supabase-js decodes it only to read `exp`. */
function e2eJwt() {
  const now = Math.floor(Date.now() / 1000);
  return [
    b64url({ alg: 'HS256', typ: 'JWT' }),
    b64url({ sub: E2E_USER_ID, role: 'authenticated', aud: 'authenticated', email: 'e2e@example.test', iat: now, exp: now + 24 * 3600 }),
    'e2e',
  ].join('.');
}

const USER = {
  id: E2E_USER_ID,
  aud: 'authenticated',
  role: 'authenticated',
  email: 'e2e@example.test',
  email_confirmed_at: '2026-01-01T00:00:00Z',
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: { full_name: 'ผู้ทดสอบ E2E' },
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

function session() {
  const token = e2eJwt();
  return {
    access_token: token,
    token_type: 'bearer',
    expires_in: 24 * 3600,
    expires_at: Math.floor(Date.now() / 1000) + 24 * 3600,
    refresh_token: 'e2e-refresh-token',
    user: USER,
  };
}

const FUNDERS = ['มหาวิทยาลัยขอนแก่น', 'มูลนิธิทดสอบ', 'กองทุนเงินให้กู้ยืมเพื่อการศึกษา', 'บริษัทตัวอย่าง จำกัด', 'ธนาคารตัวอย่าง'];
const TIERS = ['full_ride', 'full_tuition', 'large', 'medium', 'small'];
const STATUSES = ['Open', 'Closing Soon', 'Opening Soon'];

/** 24 public scholarships, shaped like td_scholarships rows. */
const SCHOLARSHIPS = Array.from({ length: 24 }, (_, i) => ({
  scholarship_id: `TD-E2E-${String(i).padStart(3, '0')}`,
  scholarship_name_en: `E2E Test Scholarship ${i + 1}`,
  scholarship_name_th: `ทุนทดสอบ E2E ลำดับที่ ${i + 1}`,
  scholarship_name: `E2E Test Scholarship ${i + 1}`,
  funder_en: null,
  funder_th: FUNDERS[i % FUNDERS.length],
  funder: FUNDERS[i % FUNDERS.length],
  funder_type: i % 2 ? 'Foundation' : 'University',
  level: i % 3 ? 'Undergraduate' : 'Multiple',
  field_of_study: 'All fields',
  award_value_tier: TIERS[i % TIERS.length],
  award_amount_thb: null,
  award_amount_thb_numeric: null,
  renewable: i % 2 === 0,
  bond_obligation: false,
  region_eligibility: 'National (Thailand)',
  targets_low_income: i % 2 === 1,
  welfare_card_priority: false,
  income_cap_thb: null,
  num_recipients: 10,
  min_gpa: i % 4 === 0 ? 3 : null,
  deadline_raw: i === 5 ? 'Rolling' : `15-${['Jan', 'Feb', 'Mar', 'Apr'][i % 4]}-2027`,
  deadline_date: i === 5 ? null : `2027-0${1 + (i % 4)}-15`,
  deadline_is_rolling: i === 5,
  open_date: null,
  status: STATUSES[i % STATUSES.length],
  status_effective: STATUSES[i % STATUSES.length],
  application_url: i === 4 ? null : 'https://example.org/apply',
  application_link: i === 4 ? '' : 'https://example.org/apply',
  source_url: 'https://example.org/source',
  last_verified: '2026-11-01',
  is_displayed: true,
  verification_status: 'verified',
  stale: false,
  source_language: 'th',
  translation_review: null,
  date_confidence: 'high',
  updated_at: '2026-11-28T00:00:00Z',
}));

const distinctFunders = new Set(SCHOLARSHIPS.map((s) => (s.funder_en || s.funder_th || s.funder).trim().toLowerCase())).size;

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,HEAD,OPTIONS',
    'Access-Control-Expose-Headers': 'Content-Range, X-Total-Count',
    ...headers,
  });
  res.end(status === 204 || body === undefined ? undefined : JSON.stringify(body));
}

/** PostgREST-ish: honour the single-object Accept header and the count headers. */
function sendRows(req, res, rows) {
  const accept = String(req.headers.accept ?? '');
  const range = { 'Content-Range': rows.length ? `0-${rows.length - 1}/${rows.length}` : '*/0' };
  if (accept.includes('vnd.pgrst.object')) {
    if (rows.length === 1) return send(res, 200, rows[0], range);
    return send(res, 406, {
      code: 'PGRST116',
      details: `The result contains ${rows.length} rows`,
      hint: null,
      message: 'JSON object requested, multiple (or no) rows returned',
    });
  }
  if (req.method === 'HEAD') return send(res, 200, undefined, range);
  return send(res, 200, rows, range);
}

createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const path = url.pathname;
  if (req.method === 'OPTIONS') return send(res, 204);

  // ── auth ──────────────────────────────────────────────────────────────────
  if (path === '/auth/v1/user') {
    const auth = String(req.headers.authorization ?? '');
    // Any token we issued (or the anon key, which is not a user) → only ours is a user.
    return auth.includes('.e2e') ? send(res, 200, USER) : send(res, 401, { code: 401, msg: 'invalid JWT' });
  }
  if (path === '/auth/v1/token') return send(res, 200, session());
  if (path === '/auth/v1/logout') return send(res, 204);
  if (path.startsWith('/auth/v1/')) return send(res, 200, {});

  // ── rest ──────────────────────────────────────────────────────────────────
  if (path === '/rest/v1/rpc/get_public_scholarship_stats') {
    return send(res, 200, [{ scholarships: SCHOLARSHIPS.length, funders: distinctFunders }]);
  }
  if (path.startsWith('/rest/v1/rpc/')) return send(res, 200, null);

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    // Writes are accepted and thrown away.
    req.resume();
    return send(res, req.method === 'POST' ? 201 : 200, []);
  }

  const table = path.replace('/rest/v1/', '');
  if (table === 'td_scholarships') {
    const id = url.searchParams.get('scholarship_id');
    const rows = id?.startsWith('eq.') ? SCHOLARSHIPS.filter((s) => s.scholarship_id === id.slice(3)) : SCHOLARSHIPS;
    const limit = Number(url.searchParams.get('limit') ?? NaN);
    return sendRows(req, res, Number.isFinite(limit) ? rows.slice(0, limit) : rows);
  }
  // profiles and everything else: a brand-new user has no rows anywhere.
  return sendRows(req, res, []);
}).listen(PORT, '127.0.0.1', () => {
  console.log(`[fake-supabase] listening on http://127.0.0.1:${PORT}`);
});

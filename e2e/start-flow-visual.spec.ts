/**
 * The paid-ad flow, in every view × theme (npm run test:visual).
 *
 *   viewports  390×844 · 820×1180 · 1180×820 · 1440×900
 *   themes     light · dark  (localStorage.tundee_theme, read by app/layout.tsx)
 *   steps      1 landing · 2 matcher · 3 loading · 4 results · 5 /auth (email open)
 *              · 7 /scholarships as a guest. Step 6 (/profile/setup) and the
 *              signed-in /scholarships need a session and are skipped without one.
 *
 * Each state must have: no horizontal scroll, zero axe `color-contrast` violations,
 * the right thing in view (the first question on arrival, the results heading after
 * submit), and nothing at the end of the results hidden under a fixed bar.
 *
 * Nothing leaves the browser: /api/preview-match is served from a fixture, Supabase
 * and every analytics host are blocked, and the age question is answered "ยังไม่ถึง"
 * so the visitor is never randomized (the spec fails if /api/start/randomize is hit).
 *
 * Screenshots: e2e/__screenshots__/start-flow/<viewport>-<theme>-<step>.png (git-ignored;
 * attach or upload them, do not commit them).
 */
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { appendFileSync, mkdirSync } from 'node:fs';
import { previewPage } from './fixtures/make-preview';

const VIEWPORTS = [
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'ipad-820', width: 820, height: 1180 },
  { name: 'ipad-landscape-1180', width: 1180, height: 820 },
  { name: 'desktop-1440', width: 1440, height: 900 },
] as const;
const THEMES = ['light', 'dark'] as const;
const SHOTS = 'e2e/__screenshots__/start-flow';
mkdirSync(SHOTS, { recursive: true });
mkdirSync('e2e/test-results', { recursive: true });

const BLOCKED_HOSTS = /supabase\.co|placeholder\.invalid|facebook|fbcdn|tiktok|google-analytics|googletagmanager|doubleclick|analytics\.google|connect\.facebook/;

async function isolate(page: Page) {
  let randomizeCalls = 0;
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (BLOCKED_HOSTS.test(url.host)) return route.abort();
    switch (url.pathname) {
      case '/api/preview-match': {
        const body = route.request().postDataJSON() as { offset?: number } | null;
        const offset = Number(body?.offset ?? 0);
        // Long enough to photograph the loading state.
        await new Promise((r) => setTimeout(r, offset ? 200 : 1500));
        return route.fulfill({ json: previewPage(offset) });
      }
      case '/api/start/randomize':
        randomizeCalls++;
        return route.fulfill({ status: 500, json: { error: 'must_not_randomize_in_tests' } });
      case '/api/intake':
        return route.fulfill({ json: { id: null } });
      case '/api/apply-click':
      case '/api/client-log':
      case '/api/meta/capi':
        return route.fulfill({ json: { ok: true } });
      default:
        return route.continue();
    }
  });
  return () => randomizeCalls;
}

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.addInitScript((t) => {
    try { localStorage.setItem('tundee_theme', t); } catch { /* ignore */ }
  }, theme);
  await page.emulateMedia({ colorScheme: theme });
}

async function expectNoHorizontalScroll(page: Page, where: string) {
  const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  expect.soft(sw, `${where}: horizontal scroll (${sw} > ${iw})`).toBeLessThanOrEqual(iw);
}

async function expectContrastOk(page: Page, where: string) {
  // @axe-core/playwright ships its own playwright-core typings; the runtime object is the same Page.
  // [data-brand="line"]: LINE's login button is white on LINE green #06C755 (2.25:1),
  // as LINE's button guidelines require. A deliberate, documented brand exception —
  // see the PR. Everything else must pass.
  await page.waitForTimeout(250);   // let transition-colors finish before sampling
  const r = await new AxeBuilder({ page: page as never })
    .withRules(['color-contrast'])
    .exclude('[data-brand="line"]')
    .analyze();
  const lines = r.violations.flatMap((v) => v.nodes.map((n) => {
    const d = (n.any[0]?.data ?? {}) as { contrastRatio?: number; fgColor?: string; bgColor?: string; fontSize?: string };
    return `  ${n.target.join(' ')} — ${d.contrastRatio}:1 (${d.fgColor} on ${d.bgColor}, ${d.fontSize}) "${(n.html ?? '').slice(0, 80)}"`;
  }));
  // Every violation is also appended to e2e/test-results/contrast.ndjson, so one run
  // lists them all; the soft expectation fails the test without stopping the walk.
  for (const v of r.violations) for (const n of v.nodes) {
    const d = (n.any[0]?.data ?? {}) as Record<string, unknown>;
    appendFileSync('e2e/test-results/contrast.ndjson', JSON.stringify({
      where, url: page.url(), target: n.target.join(' '), ratio: d.contrastRatio, fg: d.fgColor, bg: d.bgColor, size: d.fontSize, html: (n.html ?? '').slice(0, 160),
      vp: page.viewportSize()?.width, dark: await page.evaluate(() => document.documentElement.classList.contains('dark')),
    }) + '\n');
  }
  expect.soft(lines, `${where}: color-contrast violations\n${lines.join('\n')}`).toEqual([]);
}

async function inViewport(page: Page, selector: string): Promise<boolean> {
  return page.locator(selector).first().evaluate((el) => {
    const r = el.getBoundingClientRect();
    return r.top >= 0 && r.top < window.innerHeight && r.bottom > 0;
  });
}

/** Height of whatever is fixed to the bottom of the viewport (0 when nothing is). */
async function bottomBarHeight(page: Page): Promise<number> {
  return page.evaluate(() => {
    let h = 0;
    for (const el of Array.from(document.body.querySelectorAll<HTMLElement>('*'))) {
      const cs = getComputedStyle(el);
      if (cs.position !== 'fixed' || cs.display === 'none' || cs.visibility === 'hidden') continue;
      const r = el.getBoundingClientRect();
      if (r.height > 0 && r.width > window.innerWidth / 2 && Math.abs(r.bottom - window.innerHeight) < 2) h = Math.max(h, r.height);
    }
    return h;
  });
}

/**
 * The element can be read clear of any bottom bar: scrolled so that it sits just above
 * the bar (as far as the page allows), its centre is the element itself. At the very end
 * of the page this is exactly the "last thing hidden under the bar" case.
 */
async function notCovered(page: Page, selector: string): Promise<boolean> {
  const bar = await bottomBarHeight(page);
  return page.locator(selector).first().evaluate((el, barH) => {
    // 'instant': globals.css sets scroll-behavior: smooth, which would measure mid-scroll.
    const absBottom = el.getBoundingClientRect().bottom + window.scrollY;
    window.scrollTo({ top: absBottom - (window.innerHeight - barH - 8), behavior: 'instant' as ScrollBehavior });
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!hit && (hit === el || el.contains(hit) || hit.contains(el));
  }, bar);
}

/** At the very bottom of the page, the last link is not under a fixed bar. */
async function pageEndNotCovered(page: Page): Promise<boolean> {
  await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' as ScrollBehavior }));
  return page.evaluate(() => {
    const links = Array.from(document.querySelectorAll<HTMLElement>('a, button')).filter((e) => {
      const r = e.getBoundingClientRect();
      return r.height > 0 && r.bottom <= window.innerHeight && r.top >= 0 && getComputedStyle(e).position !== 'fixed' && !e.closest('[style*="position: fixed"], .fixed');
    });
    const last = links.sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom)[0];
    if (!last) return true;
    const r = last.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!hit && (hit === last || last.contains(hit) || hit.contains(last));
  });
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

for (const vp of VIEWPORTS) {
  for (const theme of THEMES) {
    test.describe(`${vp.name} · ${theme}`, () => {
      test.use({ viewport: { width: vp.width, height: vp.height } });
      const tag = `${vp.name}-${theme}`;

      test('steps 1–5: landing → matcher → loading → results → /auth', async ({ page }) => {
        const randomizeCalls = await isolate(page);
        await setTheme(page, theme);

        // ── 1. Landing (cookie banner included in the contrast check) ─────────
        await page.goto('/start?utm_source=facebook&utm_medium=paid&utm_campaign=isaan_2026&utm_content=ad1');
        await expect(page.locator('h1')).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(theme === 'dark');
        await page.waitForTimeout(400);
        await expectNoHorizontalScroll(page, 'landing');
        await expectContrastOk(page, 'landing');
        // The matcher is open on arrival, and its first question is in view.
        expect(await inViewport(page, '[data-testid="matcher-first-question"]'), 'first question in view on arrival').toBe(true);
        await shot(page, `${tag}-1-landing`);
        const reject = page.getByRole('button', { name: 'ปฏิเสธ' });
        if (await reject.isVisible().catch(() => false)) await reject.click();

        // ── 1b. The folded catalogue: chips wrap from md up, scroll without a track below ──
        await page.getByRole('button', { name: 'หรือดูทุนทั้งหมด' }).click();
        const chips = page.getByRole('group', { name: 'กรองทุน' });
        await expect(chips).toBeVisible();
        const chipLayout = await chips.evaluate((el: HTMLElement) => ({
          wraps: getComputedStyle(el).flexWrap === 'wrap',
          scrollbar: el.offsetHeight - el.clientHeight,
        }));
        expect(chipLayout.scrollbar, 'no visible scrollbar track under the chips').toBe(0);
        expect(chipLayout.wraps, 'chips wrap at md and up').toBe(vp.width >= 768);
        await expectNoHorizontalScroll(page, 'browse');
        await expectContrastOk(page, 'browse');
        await shot(page, `${tag}-1b-browse`);
        await page.getByRole('button', { name: 'หรือดูทุนทั้งหมด' }).click();

        // ── 2. Matcher: age (never randomize) → level → province → income ─────
        await page.getByRole('button', { name: 'ยังไม่ถึง' }).click();
        await page.getByRole('button', { name: 'ปริญญาตรี' }).click();
        await page.locator('#preview-province').selectOption('ขอนแก่น');
        await page.getByRole('button', { name: '5,000 – 10,000' }).click();
        await expectNoHorizontalScroll(page, 'matcher');
        await expectContrastOk(page, 'matcher');
        await shot(page, `${tag}-2-matcher`);

        // The adult path, to photograph and contrast-check the consent choice; then back.
        await page.getByRole('button', { name: /ใช่ \d+ ปีขึ้นไป/ }).click();
        await expect(page.getByRole('button', { name: 'ไม่เข้าร่วม' })).toBeVisible();
        await expectContrastOk(page, 'matcher (consent choice)');
        await shot(page, `${tag}-2b-consent`);
        await page.getByRole('button', { name: 'ยังไม่ถึง' }).click();

        // ── 3. Loading ───────────────────────────────────────────────────────
        await page.getByRole('button', { name: /ดูทุนที่ฉันมีสิทธิ์/ }).click();
        await expect(page.getByText('กำลังค้นหาทุนที่ตรงกับคุณ')).toBeVisible();
        await expectNoHorizontalScroll(page, 'loading');
        await shot(page, `${tag}-3-loading`);

        // ── 4. Results ───────────────────────────────────────────────────────
        const heading = page.locator('#start-results-heading');
        await expect(heading).toBeVisible();
        await page.waitForTimeout(700);              // smooth scroll settles
        expect(await inViewport(page, '#start-results-heading'), 'results heading in view after submit').toBe(true);
        await expect(heading).toBeFocused();
        await expectNoHorizontalScroll(page, 'results');
        await expectContrastOk(page, 'results');
        // Nothing at the end of the list sits under a fixed bar.
        expect(await notCovered(page, '[data-testid="results-reset"]'), '"แก้ไขข้อมูลของฉัน" not covered').toBe(true);
        expect(await notCovered(page, '[data-testid="results-all-link"]'), 'bottom /scholarships link not covered').toBe(true);
        expect(await pageEndNotCovered(page), 'nothing at the end of the page is under a fixed bar').toBe(true);
        await shot(page, `${tag}-4-results`);

        // Load ten more, same list.
        await page.getByRole('button', { name: 'ดูเพิ่มอีก 10 ทุน' }).click();
        await expect(page.getByText('(หน้า 2)').first()).toBeVisible();
        await expectNoHorizontalScroll(page, 'results page 2');
        await expectContrastOk(page, 'results page 2');

        // ── 5. /auth from the email sign-up link: the email form is open ──────
        await page.goto('/auth?from=signup&next=' + encodeURIComponent('/scholarships?from=preview'));
        await expect(page.locator('input[type="email"]').first()).toBeVisible();
        await expectNoHorizontalScroll(page, 'auth');
        await expectContrastOk(page, 'auth');
        await shot(page, `${tag}-5-auth`);

        expect(randomizeCalls(), 'the test visitor was never randomized').toBe(0);
      });

      test('step 7: /scholarships?from=preview as a guest (BottomNav on mobile)', async ({ page }) => {
        await isolate(page);
        await setTheme(page, theme);
        await page.goto('/scholarships?from=preview');
        await page.waitForLoadState('networkidle').catch(() => {});
        const reject = page.getByRole('button', { name: 'ปฏิเสธ' });
        if (await reject.isVisible().catch(() => false)) await reject.click();
        await expectNoHorizontalScroll(page, '/scholarships');
        await expectContrastOk(page, '/scholarships');
        await shot(page, `${tag}-7-scholarships-guest`);
      });

      test('step 6: /profile/setup?prefill=1 (needs a signed-in session)', async () => {
        test.skip(!process.env.E2E_STORAGE_STATE,
          'No signed-in test session: set E2E_STORAGE_STATE to a Playwright storage-state file for a test account to run step 6 and the signed-in /scholarships.');
      });
    });
  }
}

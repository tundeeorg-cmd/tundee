# /start preview + one-tap login — test checklist

Covers the two conversion changes on the ad-landing page: value-first matching
before signup (Task A) and one-tap Google/LINE login (Task B).

Automated coverage lives in `__tests__/previewMatch.test.ts` and
`__tests__/gradeLevel.test.ts` (`npm test`). Everything below needs a browser.

---

## 0. Setup

Environment variables (see `.env.example` for the full comments):

| Variable | Where it's set | Needed for |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `.env.local` / Vercel | preview matching |
| `SUPABASE_SERVICE_ROLE_KEY` | `.env.local` / Vercel | LINE login only |
| `LINE_LOGIN_CHANNEL_ID`, `LINE_LOGIN_CHANNEL_SECRET` | `.env.local` / Vercel | LINE login |
| `LINE_AUTH_REDIRECT_URI` | `.env.local` / Vercel | LINE login |
| `NEXT_PUBLIC_META_PIXEL_ID` | Vercel | pixel events |

**OAuth URLs to whitelist**

- Google Cloud Console → Credentials → OAuth 2.0 Client → Authorized redirect URIs:
  - `https://<project-ref>.supabase.co/auth/v1/callback`
- Supabase → Authentication → URL Configuration:
  - Site URL `https://www.tundee.org`
  - Redirect URLs `https://www.tundee.org/auth/callback`, `http://localhost:3000/auth/callback`
- LINE Developers Console → LINE Login channel → Callback URL (**both**):
  - `https://www.tundee.org/api/auth/line/callback`
  - `http://localhost:3000/api/auth/line/callback`

---

## 1. Logged-out matching (Task A)

Use a private window so no session exists.

- [ ] `/start` loads and the form (ระดับชั้น / เกรดเฉลี่ย / จังหวัด) is fully visible
      on a 375×812 phone viewport without scrolling.
- [ ] Submitting with a level missing shows `กรุณาเลือกระดับชั้นของคุณ`; GPA `4.5`
      shows the 0.00–4.00 message; no province shows `กรุณาเลือกจังหวัดของคุณ`.
- [ ] A valid submission (e.g. ม.4–6 / 3.25 / ขอนแก่น) shows the loading state,
      then a headline `เจอ N ทุนที่คุณมีสิทธิ์สมัคร` and 3 full cards.
- [ ] Each card shows name, funder, มูลค่าทุน, ปิดรับสมัคร and a
      `ทำไมคุณถึงเหมาะกับทุนนี้` sentence in Thai.
- [ ] No card is expired: cross-check a few `scholarship_id`s against
      `td_scholarships` — all must have `is_displayed = true`, status not `Closed`,
      and no past `deadline_date`.
- [ ] The whole flow works while logged out — DevTools → Application → Cookies
      shows no `sb-*` auth cookie.
- [ ] `แก้ไขข้อมูลของฉัน` returns to the form with the previous answers intact.

**Edge cases**

- [ ] Zero matches (try ม.1–3 with GPA 0.00 in a small province): shows
      `ยังไม่มีทุนที่ตรงเป๊ะ…` plus broader options — never an empty screen.
- [ ] Slow/failed DB: DevTools → Network → set Offline, submit → shows
      `เชื่อมต่อไม่สำเร็จ…` and the form stays filled in.
- [ ] Rate limit: submit >20 times in a minute → `มีการค้นหาบ่อยเกินไป…` (HTTP 429).

## 2. The signup gate

- [ ] Below the 3 real cards, blurred placeholder cards appear with
      `และอีก N ทุนที่คุณมีสิทธิ์ — ดูทั้งหมดฟรี`.
- [ ] N equals `total − 3` and no locked scholarship's name is readable in the
      DOM (view source on the blurred block — it must contain no real data).
- [ ] `ดูทุนทั้งหมด (ฟรี)` links to
      `/auth?from=signup&next=%2Fscholarships%3Ffrom%3Dpreview`.
- [ ] UTM params survive: load `/start?utm_source=fb&utm_campaign=test` and confirm
      they are appended to that same CTA link.

## 3. Google login (Task B)

- [ ] On `/auth`, Google and LINE are the top two buttons; email is below the
      `หรือใช้อีเมล` divider.
- [ ] Tapping Google completes sign-in and returns to TunDee, not an error page.
- [ ] A brand-new Google account lands on `/profile/setup`.
- [ ] An existing account with a completed profile lands directly on
      `/scholarships?from=preview`.

## 4. LINE login (Task B)

- [ ] Tapping `เข้าสู่ระบบด้วย LINE` opens LINE's consent screen (or the LINE app
      on a phone).
- [ ] Approving returns to TunDee **logged in**.
- [ ] Cancelling on LINE's screen returns to `/auth` with
      `ยกเลิกการเข้าสู่ระบบด้วย LINE` — not a crash.
- [ ] Logging in with LINE a second time reuses the same account (check
      `auth.users` — no duplicate row) and `profiles.line_user_id` is populated.
- [ ] With `LINE_LOGIN_CHANNEL_ID` unset, the button degrades to
      `ระบบ LINE ยังไม่พร้อมใช้งาน…` instead of erroring.
- [ ] The existing bot-linking flow still works: log in, go to `/tracker`, connect
      LINE via the old `/api/line/connect` route.

> **Known limitation** — until the LINE channel's Email address permission is
> approved, LINE-created accounts get a placeholder address
> (`line_<userId>@line.tundee.invalid`). Those users can only log in via LINE.
> After approval, new logins pick up the real address automatically.

## 5. Input persistence through login

The core requirement: a visitor never re-enters anything.

- [ ] Fill the form on `/start`, tap `ดูทุนทั้งหมด (ฟรี)`, sign up with Google.
- [ ] The setup wizard **skips** grade level, GPA and province (step 2 jumps
      straight to income).
- [ ] Finishing the wizard lands on `/scholarships?from=preview` and the profile
      shows the level/GPA/province typed on `/start`.
- [ ] Repeat with LINE login — same result.
- [ ] Repeat with the email magic link **opened in a different tab** — the cookie
      (not sessionStorage) must carry the answers, so the skip still happens.
- [ ] Going *back* from the income step returns to the prior-knowledge step, not
      into the skipped questions.
- [ ] The `tundee_preview` cookie is gone after the wizard saves.
- [ ] Consent (step 0) is **never** skipped — PDPA requires it explicitly.

## 6. No regressions

- [ ] Logged-in `/scholarships` still lists and ranks matches.
- [ ] `/tracker`, `/profile`, `/admin` behave as before.
- [ ] A logged-in user visiting `/auth?next=/tracker` is redirected to `/tracker`.
- [ ] `/auth?next=https://evil.example.com` redirects to `/scholarships`, never off-site.

## 7. Analytics

With `NEXT_PUBLIC_META_PIXEL_ID` set, in the Meta Pixel Helper:

- [ ] `Search` + `ViewContent` fire when preview results render.
- [ ] `Lead` fires on the gate CTA click.
- [ ] `CompleteRegistration` fires when the setup wizard saves.

---

## Behaviour change to watch

`lib/recommender/eligibility.ts` now normalizes grade levels through
`lib/recommender/gradeLevel.ts`. Previously `'M4-M6'` — the value
`/profile/setup` actually stores — matched none of the accepted tokens, so
**every "High school" scholarship was hidden from existing students**. After this
change those students see more matches than before. Expected, and the reason
match counts will jump for high-school users.

# Meta Pixel & Conversions API — setup and QA

Pixel / dataset: **28939107965678201** ("TunDee Website")

---

## 1. Turn it on

### Vercel env vars

| Variable | Scope | Value |
|---|---|---|
| `NEXT_PUBLIC_FB_PIXEL_ID` | **Production only** | `28939107965678201` |
| `META_CAPI_ACCESS_TOKEN` | Production | leave unset for now |
| `META_TEST_EVENT_CODE` | Production, temporarily | `TESTxxxxx` during QA, then **delete** |

Set the pixel ID in **Production scope only**. Preview deployments must not report
into the live dataset — the code also guards this via `NEXT_PUBLIC_VERCEL_ENV`,
but scoping the variable is the stronger protection.

`NEXT_PUBLIC_META_PIXEL_ID` still works as a fallback name. Set one or the other.

Env changes don't affect running deployments — **redeploy** after setting them.

### Nothing fires before consent

Every tag — Meta, GA4 and TikTok — is gated on the cookie banner. A visitor who
hasn't chosen, or who chose ปฏิเสธ, loads no analytics scripts at all. Expect a
step down in GA4 volume from the day this ships; that is the intended behaviour,
not a regression.

---

## 2. QA in Meta Events Manager

Use **Events Manager → TunDee Website → Test events**, and install the
**Meta Pixel Helper** Chrome extension. Copy the `TESTxxxxx` code into
`META_TEST_EVENT_CODE` so events land in Test events rather than counting as
live conversions.

Run everything in a fresh private window — consent is remembered per browser.

### Consent gate (do this first)

- [ ] Land on `/start`. The Thai banner appears at the bottom.
- [ ] **Before choosing**: Pixel Helper shows no pixel; DevTools → Network has no
      `connect.facebook.net` and no `googletagmanager` request.
- [ ] Tap **ปฏิเสธ**. Banner closes, still no pixel, still no GA.
- [ ] Reload — the banner does not reappear, and nothing loads.
- [ ] Clear site data, reload, tap **ยอมรับ**. The pixel loads immediately,
      **without a page reload**, and Pixel Helper shows `PageView`.

### Events

| Event | How to trigger | Expected params |
|---|---|---|
| `PageView` | Load any page | — |
| `PageView` | Navigate in-app (e.g. `/start` → footer → `/privacy`) | fires **once** per route change |
| `Search` | Submit the `/start` match form | `education_level`, `gpa_band`, `province` |
| `ViewContent` | The 3 preview cards render | `content_ids` = the 3 shown, `num_items` = total matches |
| `ViewContent` | Open any scholarship detail page | `content_ids` = `[TD-xxxx]`, `content_type=scholarship` |
| `Lead` | Tap `ดูทุนทั้งหมด (ฟรี)` at the signup gate | `content_category=signup_gate` |
| `CompleteRegistration` | Finish the signup wizard | `method` = `google` \| `line` \| `email` |
| `SubmitApplication` | Click `สมัครทุน` on a detail page or in the tracker | `content_ids` = `[TD-xxxx]` |

Checks:

- [ ] `gpa_band` is a band (`3.00_3.49`), **never** a raw GPA. Enter 3.25 and confirm.
- [ ] `PageView` fires exactly once per navigation, not twice.
      (In local `npm run dev` everything fires twice — that's React StrictMode
      in development only. Verify against a production build.)
- [ ] `CompleteRegistration` shows the right `method` for each of Google, LINE
      and email signup.
- [ ] Every event carries an **Event ID** in Pixel Helper (needed for CAPI dedup).

---

## 3. Turning CAPI on later

`/api/meta/capi` is already wired and returns 204 while `META_CAPI_ACCESS_TOKEN`
is unset — no errors, no log noise. To activate:

1. Log into Facebook as the **personal profile** that admins the TunDee business
   portfolio, not as the TunDee Page identity. This is what blocked token
   generation before.
2. Events Manager → TunDee Website → Settings → Conversions API →
   **Set up without Dataset Quality API** → Generate access token.
3. Put it in `META_CAPI_ACCESS_TOKEN` in Vercel (Production). Redeploy.
4. Confirm in Test events that `Lead`, `CompleteRegistration` and
   `SubmitApplication` now appear from **both** Browser and Server, and that Meta
   reports them as **deduplicated** rather than doubled.

If the system-user route is preferred instead: System users → CapiServer →
**Installed apps** → add the TunDee CAPI app → assign the TunDee Website dataset
with Full control → then Generate token.

No code change is needed either way.

### What CAPI sends

- Only `Lead`, `CompleteRegistration`, `SubmitApplication` — the three
  conversions ad delivery optimizes against and the ones browser blockers drop.
- `event_id` matching the browser event, so Meta collapses the pair into one.
- `_fbp` / `_fbc` cookies, user agent and IP from the request.
- SHA-256 hashed email/phone **only** when the visitor is signed in. The browser
  never sends personal data — the route reads the session itself and hashes
  server-side, so raw identifiers never travel through client code.

---

## 4. Ad setup

Optimize for **CompleteRegistration**. `Lead` fires at the signup gate — it's
pre-account intent and much more frequent, so it's the better early optimization
target while conversion volume is still low.

`Search` and `ViewContent` are the mid-funnel signals for building audiences of
students who saw real matches but didn't sign up — the most valuable retargeting
pool this funnel produces.

---

## 5. TikTok Pixel

TikTok runs through the same consent gate and the same shared event helper as
Meta. It is **dormant until `NEXT_PUBLIC_TIKTOK_PIXEL_ID` is set** — the base
script never loads and every `lib/analytics` call is a harmless no-op.

### Turn it on

1. TikTok Ads Manager → **Assets → Events → Web Events** → Set up Web Events →
   **TikTok Pixel** → Manually install code.
2. Copy the Pixel ID (looks like `C4XXXXXXXXXXXXXXXXXX`).
3. Set `NEXT_PUBLIC_TIKTOK_PIXEL_ID` in Vercel, **Production scope only** — same
   reasoning as Meta: preview deployments must not report into the live dataset.
4. Redeploy. Env changes don't affect running deployments.

### Event mapping

One logical event fans out to all three platforms from
`lib/analytics/index.ts`. TikTok's vocabulary is smaller than Meta's, so two
distinct funnel steps both land on `SubmitForm` — they stay distinguishable by
`content_type` (`signup_gate` vs `scholarship`).

| Our event | Meta | TikTok | GA4 |
|---|---|---|---|
| `pageView()` | `PageView` | `ttq.page()` | `page_view` |
| `search()` | `Search` | `Search` | `search` |
| `viewContent()` | `ViewContent` | `ViewContent` | `view_search_results` |
| `lead()` | `Lead` | `SubmitForm` | `generate_lead` |
| `completeRegistration()` | `CompleteRegistration` | `CompleteRegistration` | `sign_up` |
| `submitApplication()` | `SubmitApplication` | `SubmitForm` | `submit_application` |

---

## 6. QA both pixels together

Install **Meta Pixel Helper** and **TikTok Pixel Helper** (Chrome extensions),
and open **Meta Events Manager → Test events** and **TikTok Ads Manager →
Events → Test Event** side by side. Every row below must appear on **both**
pixels, **once each**.

Set `NEXT_PUBLIC_META_PIXEL_DEBUG=1` to exercise this locally.

- [ ] **Accept cookies first.** Before tapping ยอมรับ, both helpers must show
      *no pixel found* and the Network tab no request to `facebook.net` or
      `analytics.tiktok.com`. This is the PDPA check and the easiest to skip.
- [ ] **PageView on load** — land on `/`. Meta `PageView`, TikTok `Pageview`.
- [ ] **PageView on route change** — navigate `/` → `/scholarships` → `/start`
      **without reloading**. One new PageView per navigation on each pixel.
      Confirm the count goes up by exactly one, not two: the base scripts fire
      the initial one and `AnalyticsPageView` deliberately skips it.
- [ ] **Search** — submit the `/start` match form. Both pixels. Check the params
      carry `education_level`, `gpa_band` and `province` — and that `gpa_band`
      is a band like `3.00_3.49`, never a raw GPA.
- [ ] **ViewContent (preview)** — when the 2–3 preview matches render.
- [ ] **ViewContent (detail)** — open a scholarship detail page, both
      `/scholarships/[id]` and `/scholarships/td/[id]`.
- [ ] **Lead** — reach the signup gate. Meta `Lead`, TikTok `SubmitForm` with
      `content_type: signup_gate`.
- [ ] **SubmitApplication** — click an external สมัคร/apply link. Meta
      `SubmitApplication`, TikTok `SubmitForm` with `content_type: scholarship`.
      Check all three sites: both detail routes and `/tracker`.
      *This is the event that previously reached Meta but never TikTok.*

### CompleteRegistration — test all three, including the skip path

This is the one that was broken, so test it properly. There are **two** code
paths and they must never both fire for one signup.

- [ ] **Email signup** → sees `/profile/setup`, fires on wizard submit.
- [ ] **Google signup from `/start`** (answer the form, then sign up) → the auth
      callback writes the profile and **skips the wizard**, landing you straight
      on results. `CompleteRegistration` must still fire, on both pixels.
- [ ] **LINE signup from `/start`** → same, with `method: line`.
- [ ] **Refresh that landing page.** `CompleteRegistration` must **not** fire
      again — the marker cookie is deleted on first read.
- [ ] **Sign out and back in** as an existing user with a complete profile.
      `CompleteRegistration` must **not** fire — a returning login is not a
      signup.
- [ ] Check `document.cookie` after arrival: `tundee_signup_conversion` should
      be gone. If it lingers, the client component didn't run.

### Not double-counted

- [ ] Meta Events Manager shows no **"Duplicate events"** warning on the dataset.
- [ ] Pixel Helper shows exactly one instance of each pixel per page — two
      `fbq('init')` calls would double every PageView.
- [ ] Once CAPI is on, `Lead` / `CompleteRegistration` / `SubmitApplication`
      appear from Browser **and** Server but are reported **deduplicated**.

### Automated coverage

```bash
npx vitest run __tests__/analyticsFanout.test.ts __tests__/signupConversion.test.ts __tests__/metaAnalytics.test.ts
```

`analyticsFanout` asserts every event reaches all three platforms exactly once,
that nothing fires without consent, and that the GPA is bucketed before it
leaves the browser. `signupConversion` covers the cookie handoff and that it can
only fire once. Neither needs a live pixel.

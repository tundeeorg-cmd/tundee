# TunDee research codebook

**Status:** written 2026-10-26 from the code and from read-only queries run against production on that date. Where a number is quoted it carries that date. Where something could not be verified it says so rather than guessing.

**Companion documents.** `research/PREREGISTRATION.md` (v1.0, registered 2026-08-28) is the analysis plan and is never edited; this file describes the data that was actually collected and how. `docs/research-data-dictionary.md` (v2.0, 2026-07-19) describes the older research tables and is partly out of date: it calls `event` the replacement for `funnel_events`, but on 2026-10-26 `event` held 0 rows and `funnel_events` held 379,463.

Any change to hypotheses, outcomes, sample size, stopping rule, exclusions or analysis is an amendment file under `research/AMENDMENT-YYYY-MM-DD-*.md` (PREREG §0), not an edit to this file.

---

## 1. Who is in the data

| Cohort | `profiles.cohort` | Definition (PREREG §5.7) | Randomized? |
|---|---|---|---|
| Pilot | `pilot` | Account existing when migration `20260828_v16` was run (`UPDATE profiles SET cohort='pilot' WHERE cohort IS NULL`). The commits are timestamped 2026-08-29 00:08 +07 (`41d72c7`, `d3f0657`); **the exact moment the migration ran in production is not recorded in the repository** — read it off the largest `created_at` among `cohort='pilot'` rows | **Never.** Enforced by `profiles_pilot_never_randomized_check`. Receive the baseline ranking. Excluded from the primary analysis (§9.1). |
| Main | `main` | Created at or after that deployment | Only if they reach the randomization point and have current research consent (see §4). |

Counts of profiles on 2026-10-26: 123 total; 38 pilot (none randomized, as designed); 85 main, of which 82 have a complete profile (province and income bracket), 23 randomized, 59 complete but never randomized (see §8.2).

---

## 2. Variables on `profiles`

| Variable | Type / values | Meaning | Written | Notes |
|---|---|---|---|---|
| `ranking_variant` | `'baseline'` \| `'fairness_adjusted'` \| NULL | The assignment (PREREG §5.6). NULL = never randomized. | Once, by `POST /api/experiment/assign`. Immutable (`trg_freeze_ranking_variant`). | **The** treatment variable. Distinct from the legacy `ab_arm`. |
| `ranking_assigned_at` | timestamptz | When the assignment was made. | Same write as `ranking_variant`. | `profiles_ranking_variant_complete_check`: a variant must have this and the version below. |
| `assignment_algorithm_version` | text | Algorithm that produced the assignment. Currently `v2-hmac-stratified-2026-08`. | Same write. | Bump only for a genuine algorithm change. |
| `fairness_eligible` | boolean | Property of the person, computed for both arms (§5.5): `region_group = 'northeast' AND income_bracket <= 3`. | Same write. | An eligible student in the baseline arm gets an unmodified ranking. Treatment is applied only where eligible **and** `fairness_adjusted`. |
| `cohort` | `'pilot'` \| `'main'` | See §1. | Backfilled `pilot` at v16; default `main`. | `profiles_cohort_check`. |
| `region_group` | `'northeast'` \| `'bangkok_metro'` \| `'other'` \| NULL | Generated column from the declared province by `tundee_region_group()`. NULL when no province. | Computed. | Definition in §3. Never from IP or campaign. |
| `is_target_population` | boolean (generated) | `region_group = 'northeast' AND income_bracket IS NOT NULL AND income_bracket <= 3`. | Computed. | Primary analysis stratum (§5.3). |
| `province` | text | Declared home province (Thai name). | Wizard step 5, or `/start` merge. | |
| `income_bracket` | smallint 1–7 | Declared monthly household income. 1 <฿5,000; 2 ฿5,000–10,000; 3 ฿10,000–15,000; 4 ฿15,000–20,000; 5 ฿20,000–30,000; 6 ฿30,000–50,000; 7 >฿50,000. | Wizard step 6, or `/start` merge. | |
| `recruitment_source` | `'isaan_2026'` \| `'bkk_2026'` \| `'organic'` \| NULL | How the student was reached, from `utm_campaign` against a closed set (§5.4). Independent of `region_group`. Constraint `profiles_recruitment_source_campaign_check`. | First assignment or `/start` merge, whichever runs first; never rewritten. | **Meaning changed on v16 (2026-08-29).** Before that the column held the self-reported channel; v16 moved those values to `heard_about_us` and set `recruitment_source` to NULL for every existing row. Pilot rows therefore have NULL here unless written later. |
| `heard_about_us` | `school_teacher`, `friend_referral`, `google_search`, `social_media`, `unknown` | Self-reported channel (wizard step 8). Formerly named `recruitment_source`. | Wizard. | Not the pre-registered variable. No CHECK in the database; validated in the application. |
| `signup_cohort` | `wave_1_bangkok`, `wave_2_northeast`, `wave_2_north`, `wave_3_national` | Recruitment wave derived from province at save time. | Derived. | Not the trial cohort. |
| `prior_scholarship_knowledge` | smallint ∈ {0, 2, 6, 15}, or NULL | Answer to "how many scholarships do you know you are eligible for": none → 0, 1–3 → 2, 4–10 → 6, 10+ → 15 (midpoints, not counts). NULL = not answered. | Wizard step 2. | **Contaminated and ambiguous — see §8.4.** Also the only reliable marker that a student went through the wizard. |
| `research_opt_in` | boolean, default false | Checkbox on the wizard (never pre-ticked). | Wizard. | **Not** the research gate. See §5. |
| `guardian_acknowledged` | boolean | Guardian checkbox, optional. | Wizard. | |
| `consent_version`, `consent_at` | text, timestamptz | Terms-of-service consent (`lib/consent`). | Wizard / `/start` merge. | Terms, not research consent. |
| `ab_arm` | `'treatment'` \| `'control'` \| NULL | Pilot-era assignment (`md5(user_id)` byte parity, assigned client side; column added 2026-07-12, backfilled for existing rows). | Frozen. | **Not the randomization; excluded from all analyses** (§5.6). Its value is uncorrelated with the ranking actually delivered. |
| `grade_level`, `gpa`, `welfare_card`, `fields_of_interest` | various | Matching inputs. | Wizard / `/start`. | Latest answer only; no history (§8.6). |

---

## 3. `region_group`, exactly

Computed from the declared province only. The same rule exists in three places that must not drift: `NORTHEAST_PROVINCES` and `regionGroup()` in `lib/research/assignment.ts`, `NORTHEAST_PROVINCES` in `lib/matching/engine.ts`, and SQL `public.tundee_region_group()` (`scripts/20260828_v16_experiment_randomization.sql`).

- **`northeast`** (20 provinces): กาฬสินธุ์, ขอนแก่น, ชัยภูมิ, นครพนม, นครราชสีมา, บึงกาฬ, บุรีรัมย์, มหาสารคาม, มุกดาหาร, ยโสธร, ร้อยเอ็ด, เลย, ศรีสะเกษ, สกลนคร, สุรินทร์, หนองคาย, หนองบัวลำภู, อำนาจเจริญ, อุดรธานี, อุบลราชธานี
- **`bangkok_metro`** (4): กรุงเทพมหานคร, นนทบุรี, ปทุมธานี, สมุทรปราการ
- **`other`**: any other declared province
- **NULL**: no province declared

The value in the code is `northeast`, not `northeastern`.

---

## 4. The assignment procedure

`POST /api/experiment/assign` (`app/api/experiment/assign/route.ts`), called from the end of the profile wizard. Order of checks:

1. Not authenticated → 401.
2. `ranking_variant` already set → returned unchanged, nothing recomputed.
3. `cohort = 'pilot'` → not randomized.
4. **No current research consent → not randomized** (since 2026-10-26, §7). "Consent" is `student_profile.consent_research = TRUE AND consent_version = '2026-07-v1'` (`isResearchConsented()` in `lib/research/consentGate.ts`). A failed read is an error (500), never treated as "no consent".
5. Province or income bracket missing → 409, not randomized. Randomization needs the stratum.
6. Assign: `arm = HMAC-SHA256(RANDOMIZATION_SALT, user_id | stratum)`, low bit of the first byte; 0 → `baseline`, 1 → `fairness_adjusted`. `stratum = region_group | income_bracket` (e.g. `northeast|2`; 3 × 7 = 21 strata, PREREG §4). The salt is an environment variable, at least 16 characters, fixed before the first assignment and never changed; if absent the route returns 503 and nobody is randomized.
7. Written together: `ranking_variant`, `ranking_assigned_at`, `assignment_algorithm_version`, `fairness_eligible`, with `WHERE ranking_variant IS NULL` so a lost race cannot overwrite.

What the student sees: `/scholarships` reads `ranking_variant` and ranks with the fairness adjustment only when `ranking_variant = 'fairness_adjusted' AND fairness_eligible`. A NULL variant is ranked as baseline.

---

## 5. Consent

Two stores exist and they are not the same thing.

| Store | Columns | Used by |
|---|---|---|
| `profiles` | `research_opt_in`, `guardian_acknowledged` | Shown on the wizard; a convenience copy. |
| `student_profile` | `consent_research`, `consent_version`, `consent_at`, `consent_method` (`signup_inline`, `profile_settings`, `line_optin`), `guardian_consent` | **The research gate.** `/api/research/export`, the SQL view `v_event_research_export`, and (since 2026-10-26) `/api/experiment/assign`. |

Current research consent text version: `2026-07-v1`. The older text `2026-01-v1` is in the data.

Under-18 students need `guardian_consent` before `consent_research` can be turned on (`/api/profile/student`, 422). `birth_year` is optional, so the rule can only fire when it is supplied.

State of the two stores on 2026-10-26 (counts of profiles): 21 consent in both; **16** ticked `research_opt_in` but have no `student_profile` row (excluded from every export although they said yes); **9** have `consent_research = TRUE` while `research_opt_in = FALSE`, of which 8 consented under the old text `2026-01-v1` (before 2026-08-25) and 1 via `profile_settings` on 2026-09-20; 2 have research consent with `guardian_consent = FALSE`.

---

## 6. Events and outcome tables

### 6.1 `funnel_events` (live, append-only)
Written from the browser through RLS. Columns used for the trial: `event_type`, `user_id` (NULL if anonymous), `session_id`, `scholarship_id`, `served_rank`, `ranking_variant`, `context` (JSON), `occurred_at`. 379,463 rows on 2026-10-26, mostly `impression`. Impression events carry `context.fairness_mode` (`'on'` only when a fairness-adjusted ranking was applied) and `context.rank`. Failures are recorded as `signup_failed` with `context.reason` (e.g. `research_consent_not_recorded`, `assign_failed:<status>`, LINE and OTP reasons).

### 6.2 `apply_click` (live)
`id, user_id, scholarship_id, clicked_at` — 293 rows. **It has no arm, rank or personalization columns.** To use it for the primary outcome (PREREG §6.1: at least one apply-click within 14 days of `profile_completed`), join to `profiles` on `user_id`, take `ranking_variant` from there (it is immutable), and drop clicks earlier than `ranking_assigned_at`. Clicks made before assignment cannot be told apart from after unless that comparison is made at analysis time.

### 6.3 Other tables
`user_events` (1,815 rows, legacy event log), `recommendation_request` (417), `profile_baselines` (40), `student_profile` (39), `experiment_assignment` (34, pilot-era and **not** the randomization, DEPRECATED), `platform_rollouts` (5 rows; columns: province, region, feature name and description, rollout date and type, `is_ab_test`, `treatment_group_size`). `comparison_sample`, `foundation_outcomes`, `event`, `outcomes`, `pending_intake` held 0 rows. `platform_rollouts`, `comparison_sample` and `foundation_outcomes` exist in the database but **no migration in the repository creates them**.

### 6.4 Not yet collected
`questionnaire_responses`, `randomization_conflicts` and the `research_attrition` view are defined in `scripts/20261026_v24_questionnaire_and_conflicts.sql`, **which had not been run on 2026-10-26**. Until it is, nothing records which question was shown but not answered, nor an answer history. `GET /api/health/research` reports these as unavailable rather than zero.

---

## 7. Change log

| Date | Change | Effect on the data |
|---|---|---|
| 2026-07-12 | `ab_arm` added; assigned client side from a UUID hash | Legacy, pilot only. |
| 2026-07-19 | Research tables (`student_profile`, `event`, `experiment_assignment`) | |
| 2026-07-22 | Onboarding columns: `prior_scholarship_knowledge`, self-reported channel (then named `recruitment_source`), `signup_cohort` (v10) | |
| 2026-07-29 | `/start` ad landing page | |
| 2026-08-28 22:38 | Pre-registration v1.0 | |
| **2026-08-29 ~00:08** | **One randomization replaces two that disagreed at chance** (`41d72c7`, `d3f0657`; v16/v17): every existing account becomes `pilot`; `ranking_variant`, `cohort`, `region_group` introduced; `recruitment_source` repurposed (§2); algorithm `v2-hmac-stratified-2026-08` | Start of the `main` cohort. |
| 2026-08-30 | Signup in the in-app webview (#40, commit `f9272c9`): a `/start` visitor whose answers complete the profile **skips the wizard** | **From here ~72% of complete profiles never reach `/api/experiment/assign`** (§8.2). Violates PREREG §4 "assignment at profile completion, once". |
| 2026-08-31 | Grade-level domain fix (v19) | |
| 2026-09-01 | `pending_intake` (answers parked across browsers) | |
| 2026-10-04 | LINE sign-in via Supabase `custom:line` (#43/#44); LINE accounts have no email | 13 LINE accounts created from 2026-10-05 to 2026-10-18; 11 signed in. |
| 2026-10-26 | Randomization requires current research consent; consent decision is recorded before the arm; failures recorded in `funnel_events` (#52) | Students who decline are no longer randomized (§9). |

---

## 8. Known limitations

**8.1 Small sample.** On 2026-10-26: 23 randomized main-cohort students, of whom some unknown number have research consent (32 students have `consent_research` in total across both cohorts). Strata are tiny; only 2 northeast students were randomized (both `fairness_adjusted`). The pre-registered target is 294 completed profiles per arm in the target population (§8). The design has no power at present; the study is analysed on whatever is obtained at the stopping point.

**8.2 Most main-cohort profiles were never randomized.** 59 of 82 complete main profiles. Every one lacks `prior_scholarship_knowledge` (they skipped the wizard); none of the students who finished the wizard failed to be randomized. They are identifiable as `cohort = 'main' AND ranking_variant IS NULL`. They were not and will not be randomized retroactively, because assignment after enrolment is not random assignment (PREREG §9.1 reasoning). They saw baseline rankings. The `/start` merge path still does not call the assignment route.

**8.3 Pilot cohort.** 38 profiles, never randomized, baseline ranking, excluded (§9.1).

**8.4 `prior_scholarship_knowledge`.** (a) Contaminated: the student sees the scholarship list before being asked how many they knew. (b) 0 ("none") is recorded identically for "none" and for "I'm not sure". (c) The value is a midpoint code, not a count. (d) `asked_after_seeing_results` is **not** recorded. Treat as a covariate with these caveats, never as a baseline measure of awareness.

**8.5 Consent inconsistencies** (§5). 16 students who said yes are excluded; 8 consents are under superseded wording but are still exported because the export gate does not check the version; 1 student's two stores disagree.

**8.6 Per-answer history does not exist.** The wizard stores the latest answer only, so a changed answer overwrites the old one, and a question shown but not answered leaves no trace. Differential attrition (PREREG §10.6) can currently be assessed only from profile completeness.

**8.7 Attribution.** `apply_click` carries no arm, so arm is attached by joining to `profiles`; clicks before `ranking_assigned_at` must be dropped at analysis time.

**8.8 Provenance gaps.** Tables outside migrations (§6.3); no Vercel runtime logs older than ~30 minutes (Hobby plan), so signup failures before 2026-10-26 are only visible where a client logged `signup_failed`.

---

## 9. Deviations from the pre-registration (to disclose)

Draft amendment: `research/AMENDMENT-2026-10-26-consent-gated-randomization.md`. Adopting it is the study team's decision.

1. **`/start` completions are not randomized** (since 2026-08-30). PREREG §4 specifies assignment at profile completion for everyone. This is an implementation defect, not a decision; the affected students are enumerated in §8.2.
2. **Non-consenting students are not randomized** (since 2026-10-26). PREREG §9.2 and §12.4 say non-consenting users are excluded from research datasets *at analysis time*, from data recorded for everyone, and that "no user is filtered or excluded in application code." Withholding randomization is exclusion at enrolment. Consequence for the baseline arm: students who decline now always get the baseline ranking; previously a decliner could be assigned the adjusted ranking and be dropped at export.
3. **No outcome-by-arm interface exists**, consistent with PREREG §12.8. `/api/health/research` reports assignment balance, invariants and answer rate only.

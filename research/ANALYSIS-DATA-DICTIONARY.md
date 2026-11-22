# Analysis data dictionary

Every field the research export emits, and the pre-registration section it serves. Prereg = `research/PREREGISTRATION.md` v1.0 as amended (2026-10-26, 2026-11-22 ×2).

Two extracts, both admin-only NDJSON (`pd.read_json(path, lines=True)`):

- **Accounts** — `GET /api/research/export`: one line per `funnel_events` row of a consenting signed-up student.
- **Anonymous participants** — `GET /api/research/export?scope=anon`: visitors randomized on `/start` who never signed in. Three record types, joined on `pseudo_anon_id`.

A participant who signed in after randomization appears **only** in the accounts extract (and their pre-sign-in `apply_click` / impression rows carry their `user_id`). Primary-outcome rows for accounts are read from `apply_click` directly (SQL), as before.

Consent gate (both): consent to the current wording, `CURRENT_CONSENT_VERSION` = `2026-07-v1`. Excluded participants are counted in `X-Excluded-*` response headers.

## Anonymous extract (`?scope=anon`)

### `record_type = "participant"` — one per participant

| Field | Type | Meaning | Prereg |
|---|---|---|---|
| `pseudo_anon_id` | hex | sha256(anon_id). Stable across extracts; not reversible without the id. | §12 (pseudonymisation) |
| `ranking_variant` | `baseline` \| `fairness_adjusted` | The arm. Immutable. | §4, §5.6 |
| `ranking_assigned_at` | timestamptz | Randomization time = T0 of the 14-day window; also the enrollment date. | §6.1, §10.2 |
| `assignment_algorithm_version` | text | HMAC algorithm stamp. | §4 |
| `stratum` | `region|bracket` | Randomization stratum. | §4 |
| `fairness_eligible` | bool | Eligibility for the adjustment (a property of the person, both arms). | §5.5 |
| `research_consent_version` | text | Consent wording agreed to. | §9.2, §12 |
| `research_consented_at` | timestamptz | When. | §12 |
| `level` | `M1-M3` \| `M4-M6` \| `vocational` \| `uni` \| `graduate` | Grade level answered on `/start`. NULL = assigned before 2026-11-22. | §10.2 (grade level) |
| `province` | Thai name | Declared province. NULL before 2026-11-22. | §5.1 |
| `region_group` | `northeast` \| `bangkok_metro` \| `other` | From province. Back-filled from `stratum` for earlier rows. | §5.1, §5.3 |
| `income_bracket` | 1–7 | Declared monthly household income bracket. Back-filled from `stratum`. | §5.2, §5.3 |
| `gave_gpa` | bool | Whether a GPA was entered (GPA-gated awards are hidden otherwise). | descriptive |
| `is_target_population` | bool | `region_group = northeast AND income_bracket <= 3`. | §5.3, §10.1, §10.3 |
| `recruitment_source` | `isaan_2026` \| `bkk_2026` \| `organic` | From `utm_campaign` (closed set). NULL = assigned before 2026-11-22 (unknown, not organic). | §5.4, §10.2 |
| `utm_source`, `utm_medium`, `utm_campaign`, `utm_content` | text ≤ 200 | Landing URL parameters; `utm_content` = ad creative (`ad1`, `ad2`, `retarget`). | §5.4 (descriptive) |
| `landing_variant` | registry key | Headline variant seen. | §5.8 |

### `record_type = "impression"` — one per card served

| Field | Type | Meaning | Prereg |
|---|---|---|---|
| `pseudo_anon_id` | hex | Participant. | — |
| `scholarship_id` | text | Card served. | §6.2 #3–4 |
| `rank` | int ≥ 1 | 1-indexed position in the arm-ranked list (page 2 starts at 11). | §6.2 #4 |
| `fairness_mode` | `on` \| `off` | Whether the adjustment was applied to that list (on only for eligible participants in the adjusted arm). | §5.5, health invariant |
| `variant` | text | `anonymous-<arm>` label used when ranking. | audit |
| `broadened` | bool | True when nothing matched and the GPA rule was relaxed. | descriptive |
| `served_at` | timestamptz | Server time of serving. | §6.2 #4 (24 h rank window) |

### `record_type = "apply_click"` — one per click through to a funder

| Field | Type | Meaning | Prereg |
|---|---|---|---|
| `pseudo_anon_id` | hex | Participant (bound from the first-party cookie on the server). | §6.1 |
| `scholarship_id` | text | Scholarship clicked. | §6.2 #3 |
| `clicked_at` | timestamptz | Server time. | §6.1 window |
| `ranking_variant` | arm \| NULL | Arm at the time of the click (NULL before assignment). | §6.1, §10.1 |
| `ranking_assigned_at` | timestamptz | The participant's T0. | §6.1 |
| `rank_position` | int \| NULL | Rank of the latest impression of this scholarship within 24 h before the click. NULL if clicked from elsewhere. | §6.2 #4 |
| `was_personalized` | bool \| NULL | TRUE when clicked from the ranked results. | descriptive |
| `served_fairness_mode` | `on` \| `off` \| NULL | Mode of that list. | §5.5 |
| `excluded_from_primary` | bool | FALSE only if: consented to current wording, at/after assignment, within 14 days. NULL in the table is emitted as TRUE. | §6.1, §9 |
| `binding_source` | `server` \| `server_unbound` | `server_unbound` = the assignment could not be read at click time; excluded, re-bindable. | §9 |

**Primary outcome per participant:** 1 if any `apply_click` with `excluded_from_primary = false`, else 0; drop participants whose `ranking_assigned_at + 14 days` is after the analysis date (§9.3) and report how many.

## Accounts extract (default scope)

| Field | Meaning | Prereg |
|---|---|---|
| `pseudo_user_id` | sha256(user_id). | §12 |
| `session_id`, `scholarship_id`, `event_type`, `context`, `occurred_at` | The funnel event. `context.rank`, `context.fairness_mode` on impressions. | §6.2 |
| `region`, `area_type`, `household_income_band`, `welfare_card`, `school_type`, `first_generation`, `birth_year`, `gpa`, `intended_level`, `intended_field` | `student_profile` attributes. `birth_year` drives the guardian rule. | §5, §12.5 |
| `ranking_variant`, `ranking_assigned_at`, `excluded_from_primary` | Arm at the time of the event (`bindOutcome`). | §5.6, §9 |
| `cohort` | `main` \| `pilot`. | §5.7, §9.1 |
| `assignment_algorithm_version`, `fairness_eligible` | From `profiles`. | §4, §5.5 |
| `region_group`, `income_bracket` | From `profiles`. | §5.1–5.3 |

`recruitment_source` for accounts is on `profiles.recruitment_source` (SQL), not in this extract.

## Where each analysis input comes from

| Prereg input | Accounts | Anonymous |
|---|---|---|
| Arm (§10.1) | `profiles.ranking_variant` | `participant.ranking_variant` |
| Primary outcome (§6.1) | `apply_click` by `user_id` | `apply_click` records above |
| Target population (§5.3) | `profiles.region_group`, `income_bracket` | `participant.is_target_population` |
| `recruitment_source` (§10.2) | `profiles.recruitment_source` | `participant.recruitment_source` |
| Grade level (§10.2) | `profiles.grade_level` | `participant.level` |
| Enrollment date (§10.2) | `profiles.ranking_assigned_at` | `participant.ranking_assigned_at` |
| Served rank (§6.2 #4) | `apply_click.rank_position` | `apply_click.rank_position` |

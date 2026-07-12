# TunDee Research Data Dictionary
**Version:** 1.0 | **Date:** 2026-07-12 | **For:** Chula advisor + paper co-authors

This document describes every event type, field, and table used in the
causal-inference analysis of TunDee's fairness-adjusted scholarship matching.
All research queries filter `research_opt_in = TRUE` so the paper dataset
contains only consented users.

---

## 1. Core Tables

### `profile_baselines` — Immutable T=0 snapshot
Written **once** when the user completes profile setup. Never updated.
Edits to `profiles` do NOT affect this table.

| Column | Type | Description | Paper use |
|---|---|---|---|
| `user_id` | UUID | Pseudonymous user identifier | Join key |
| `grade_level` | TEXT | Grade at signup (M4-M6, uni, graduate, vocational) | Covariate for PSM |
| `gpa` | DECIMAL(3,2) | GPA at signup (0.00–4.00) | Covariate for PSM; RD running variable |
| `province_id` | TEXT | Province at signup (Thai name) | Subgroup analysis: rural vs urban |
| `income_bracket` | INTEGER 1–7 | Income bracket at signup (1=<฿5k, 7=>฿50k) | Subgroup analysis: low-income |
| `fields_of_interest` | TEXT[] | Fields of study at signup | Covariate for PSM |
| `welfare_card` | BOOLEAN | State welfare card holder at signup | Covariate for PSM |
| `ab_arm` | TEXT | 'treatment' or 'control' (see §3) | **Primary treatment indicator** |
| `research_opt_in` | BOOLEAN | User consented to research use | Filter for research dataset |
| `snapshotted_at` | TIMESTAMPTZ | Timestamp of profile completion | T=0 reference time |

### `applications` — Click-through outcomes
One row per (user × scholarship). Updated on each interaction.

| Column | Type | Description | Paper use |
|---|---|---|---|
| `user_id` | UUID | Pseudonymous user identifier | Join key |
| `scholarship_id` | UUID | Scholarship clicked | Outcome variable |
| `clicked_through_at` | TIMESTAMPTZ | Timestamp of "Start Applying" click | **Primary outcome: click-through** |
| `gpa_at_application` | DECIMAL(3,2) | GPA at time of click (snapshot) | Regression Discontinuity |
| `ab_arm` | TEXT | Arm at time of click (denormalised) | Treatment indicator on outcome |
| `income_bracket` | INTEGER | Income bracket at time of click | Subgroup analysis |
| `was_recommended` | BOOLEAN | Scholarship was in top-10 matches | PSM propensity score |
| `recommendation_rank` | INTEGER | Rank in matched list (1–10) | IV: instrument for recommendation |
| `status` | TEXT | started / submitted / won | Downstream outcome tracking |

### `recommendations` — Ranked lists shown to users
One row per (user × scholarship). Upserted each time matches are computed.

| Column | Type | Description | Paper use |
|---|---|---|---|
| `user_id` | UUID | Pseudonymous user identifier | Join key |
| `scholarship_id` | UUID | Scholarship shown | Treatment dosage |
| `score_raw` | NUMERIC(5,4) | Score before fairness correction | Control-arm counterfactual |
| `score_fairness_adjusted` | NUMERIC(5,4) | Score after equalized-odds correction | Treatment-arm rank determinant |
| `rank` | INTEGER | Position in list (1 = top) | IV for exposure |
| `ab_arm` | TEXT | Arm under which list was generated | Treatment indicator |
| `fairness_correction_applied` | BOOLEAN | Whether any boost was applied | Mechanism check |
| `correction_multiplier` | NUMERIC | Boost factor applied (null if none) | Magnitude of intervention |
| `algorithm_version` | TEXT | 'v1' (bootstrap bias scores) | Version control |
| `generated_at` | TIMESTAMPTZ | When the list was shown | Timeline |

### `user_events` — Granular event log

| Column | Type | Description | Paper use |
|---|---|---|---|
| `user_id` | UUID | Pseudonymous user identifier | Join key |
| `event_type` | TEXT | See §2 | Event classification |
| `scholarship_id` | UUID | Scholarship involved (nullable) | Scholarship-level analysis |
| `ab_arm` | TEXT | Arm at time of event | Treatment indicator on event |
| `income_bracket` | INTEGER | Income bracket at time of event | Subgroup analysis |
| `province_id_at_event` | TEXT | Province at time of event | Geographic analysis |
| `event_metadata` | JSONB | Event-specific payload | Secondary signals |
| `session_id` | TEXT | Tab-scoped session identifier | Session-level analysis |
| `occurred_at` | TIMESTAMPTZ | Event timestamp | Timeline / DiD time variable |

---

## 2. Event Types

| `event_type` | When fired | Key metadata fields | Paper analysis |
|---|---|---|---|
| `signup` | After email confirmation | — | Funnel entry |
| `profile_completed` | After setup wizard save | — | T=0 boundary (triggers baseline write) |
| `matching_results_viewed` | Each time match list loads | `match_count`, top scholarship id | Treatment exposure |
| `scholarship_viewed` | Click "View details" on a card | `rank` in match list | Engagement signal |
| `scholarship_saved` | Click bookmark | — | Secondary outcome |
| `scholarship_applied` | Click "Start Applying" | `rank` | **Primary outcome proxy** |
| `search_performed` | Search query typed | `query`, `results_count` | Browse behaviour |
| `checklist_step_completed` | Checklist item checked | — | Application progress |
| `outcome_reported` | User reports win/reject | — | Long-run outcome |
| `session_start` | Tab open / resume | — | Activity baseline |

---

## 3. A/B Assignment

**Design:** Deterministic split by user UUID.
`arm = get_byte(md5(user_id), 0) % 2`
- `treatment` — fairness-adjusted ranking (equalized odds post-processing)
- `control`   — raw eligibility score ranking (no fairness correction)

**Assignment is:**
- Stable: same UUID → same arm always
- ~50/50: uniform distribution of md5 first byte
- Recorded in `profiles.ab_arm` at first match-page load (or backfilled by migration)
- Stamped on every `recommendations`, `applications`, and `user_events` row

**The branch in code (`app/scholarships/page.tsx`):**
```
control:   sort by rawScore DESC   (equalized odds NOT applied)
treatment: sort by fairnessScore DESC (equalized odds APPLIED)
```

---

## 4. Analysis Views

| View | Query | Paper table/figure |
|---|---|---|
| `research_ctr_by_arm` | CTR by treatment vs control | Primary ITT estimate |
| `research_ctr_by_province_arm` | CTR by province × arm | Geographic heterogeneity (Table 3) |
| `research_ctr_by_income_arm` | CTR by income bracket × arm | Low-income subgroup (Table 4) |
| `research_user_outcomes` | One row per user: arm, demographics, ever_clicked, n_shown | PSM / DiD dataset export |

### Example queries

**a) Click-through rate by arm**
```sql
SELECT * FROM research_ctr_by_arm;
-- arm | users_exposed | users_clicked | click_through_rate | total_impressions
```

**b) Click-through rate by province × arm**
```sql
SELECT *
FROM research_ctr_by_province_arm
ORDER BY province_id, ab_arm;
```

**c) PSM dataset export (consented users only)**
```sql
SELECT *
FROM research_user_outcomes
WHERE research_opt_in = TRUE;
```

---

## 5. Privacy & PII Notes

- No raw PII in any event or research table
- `user_id` is the Supabase UUID — pseudonymous, not email or name
- Income stored as bracket (1–7), never exact figure
- Province stored as Thai province name — regional, not street-level
- Research dataset filtered to `research_opt_in = TRUE` (PDPA consent)
- GPA is academic data, not §26 sensitive data under PDPA

---

## 6. Causal Design Reference

| Analysis | Method | Key variables |
|---|---|---|
| Primary treatment effect | ITT (intent-to-treat) on arm assignment | `ab_arm`, `clicked_through_at` |
| Matching selection bias | PSM (propensity score matching) | `was_recommended`, `profile_baselines` covariates |
| GPA threshold effect | Regression Discontinuity | `gpa_at_application`, scholarship `min_gpa` |
| Difference-in-Differences | DiD over time × arm | `occurred_at`, `ab_arm`, `province_id` |
| Rural application rate | Subgroup ITT | `province_id` (NE provinces), `ab_arm` |
| Low-income subgroup | Subgroup ITT | `income_bracket ≤ 3`, `ab_arm` |

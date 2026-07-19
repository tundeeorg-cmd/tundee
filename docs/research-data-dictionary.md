# TunDee Research Data Dictionary
**Version:** 2.0 | **Date:** 2026-07-19 | **For:** Chula advisor + paper co-authors

**v2 changes:** Added `student_profile` (with 6 new v3 columns), `event` (new
append-only enriched event log), and `experiment_assignment.id` column.
Migration: `scripts/20260719_research_tables_v3.sql`.

This document describes every event type, field, and table used in the
causal-inference analysis of TunDee's fairness-adjusted scholarship matching.
All research queries filter `research_opt_in = TRUE` so the paper dataset
contains only consented users.

---

## 1. Core Tables

### `student_profile` — Protected attributes for fairness analysis

1:1 with `auth.users`. NEVER exported unless `consent_research = TRUE`.
Columns added in v3 migration are marked **(v3)**.

| Column | Type | Description | Paper use |
|---|---|---|---|
| `user_id` | UUID PK | FK → auth.users | Join key |
| `province` | TEXT | Thai province name | Geographic analysis |
| `region` | TEXT (generated) | Bangkok/Central/North/Northeast/South/East/West | Subgroup analysis |
| `area_type` | TEXT | urban / peri\_urban / rural | Urban–rural gap |
| `household_income_band` | TEXT | `<100k`…`600k+` (v3) or `band_1`…`band_7` (v2) | Low-income subgroup |
| `monthly_income_thb` | INTEGER **(v3)** | Monthly household income (THB) | Continuous income covariate |
| `welfare_card` | BOOLEAN | Holds state welfare card | PSM covariate |
| `first_generation` | BOOLEAN | First in family to pursue tertiary ed | PSM covariate |
| `parent_education` | TEXT **(v3)** | none/primary/secondary/vocational/bachelor/postgrad/unknown | SES covariate |
| `household_size` | INTEGER **(v3)** | Number of household members | SES covariate |
| `school_type` | TEXT | government/private/international/vocational | Covariate |
| `school_province` | TEXT **(v3)** | Province of school (may differ from home province) | Geographic precision |
| `gpa` | NUMERIC(3,2) | Current GPA | RD running variable |
| `class_rank_pct` | NUMERIC(5,2) **(v3)** | Percentile rank in class | Academic covariate |
| `gender` | TEXT | Self-described; optional | Subgroup analysis |
| `birth_year` | SMALLINT | Year of birth | Guardian consent gate |
| `disability_status` | TEXT **(v3)** | Self-described; optional | Accessibility subgroup |
| `intended_level` | TEXT | Target education level | Eligibility covariate |
| `intended_field` | TEXT | Target field of study | Eligibility covariate |
| `language_pref` | TEXT | th / en / th\_en | Bilingual analysis |
| `consent_research` | BOOLEAN | TRUE = may appear in research exports | **Research gate** |
| `consent_version` | TEXT | Consent form version (must match current) | PDPA audit |
| `guardian_consent` | BOOLEAN | Required when age < 18 | PDPA minor protection |

**Consent model:**
- `consent_research = TRUE AND consent_version = '2026-07-v1'` is the gate
  for ALL research exports. Code: `lib/research/consentGate.ts`.
- Under-18 students additionally require `guardian_consent = TRUE`.
- Opt-out: set `consent_research = FALSE`. Historical pseudonymised data
  cannot be recalled (SHA-256 hash is one-way).

---

### `event` — Append-only enriched interaction log (v3)

Replaces `funnel_events` for new instrumentation code. Distinct because it
has first-class recommender columns that power the causal study.

| Column | Type | Description | Paper use |
|---|---|---|---|
| `id` | UUID PK | Row identifier | — |
| `occurred_at` | TIMESTAMPTZ | Event timestamp | DiD time variable |
| `user_id` | UUID (nullable) | FK → auth.users; null = anonymous | Join key |
| `session_id` | TEXT | Browser-tab stable session id | Session analysis |
| `scholarship_id` | TEXT | FK → td\_scholarships | Scholarship-level analysis |
| `event_type` | TEXT | See event types below | Classification |
| `rank_position` | INTEGER | Position in ranked list (1-indexed) | IV: rank as instrument |
| `score` | NUMERIC(6,4) | Recommender final\_score (0–1) | Dosage measure |
| `recommender_variant` | TEXT | Algorithm version (`'baseline'`/`'hybrid'`) | Version control |
| `fairness_mode` | TEXT | `'on'` = fairness re-ranking; `'off'` = raw | **Treatment flag** |
| `query_text` | TEXT | Search query typed | Search analysis |
| `filters` | JSONB | Active filter state | Filter behaviour |
| `context` | JSONB | Tab, page, UI context | Secondary signals |
| `outcome` | TEXT | applied/awarded/rejected/withdrawn | **Primary outcome** |
| `outcome_source` | TEXT | click\_inferred/self\_report/partner\_verified | Outcome quality |
| `outcome_date` | DATE | Date of outcome (if known) | Timing analysis |

**Event types:**

| `event_type` | When fired | Key columns set |
|---|---|---|
| `search` | User types a query | `query_text`, `filters` |
| `view_list` | Match/browse tab loads | `context.tab` |
| `impression` | Scholarship card rendered | `rank_position`, `score`, `fairness_mode` |
| `view_detail` | Scholarship detail page opens | `scholarship_id`, `rank_position` |
| `click_apply` | "Apply" button clicked | `scholarship_id` |
| `track_add` | Student tracks a scholarship | `scholarship_id` |
| `track_remove` | Student untracks | `scholarship_id` |
| `status_change` | Tracker status updated | `outcome` (maps to tracker status) |
| `self_report_outcome` | Student self-reports result | `outcome`, `outcome_source='self_report'` |
| `outcome_verified` | Admin/partner imports result | `outcome`, `outcome_source='partner_verified'` |

**Append-only rule** (enforced at three layers):
1. PostgreSQL trigger `trg_event_append_only` raises `EXCEPTION` on `UPDATE`/`DELETE`.
2. Supabase RLS has no `UPDATE`/`DELETE` policy on `event`.
3. `EventRepository` (`lib/research/eventRepository.ts`) exposes only `insert()`.

To correct an outcome: **insert a new `outcome_verified` row** — never mutate.

---

### `experiment_assignment` — Sticky treatment assignment

| Column | Type | Description |
|---|---|---|
| `id` | UUID **(v3)** | Surrogate identifier |
| `user_id` | UUID | FK → auth.users |
| `experiment_key` | TEXT | e.g. `'ranking'` |
| `variant` | TEXT | `'control'` or `'treatment'` |
| `assigned_at` | TIMESTAMPTZ | Timestamp of first assignment |

Composite `UNIQUE (user_id, experiment_key)` ensures each user has exactly
one stable arm per experiment.

---

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

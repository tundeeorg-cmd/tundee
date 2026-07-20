# TunDee — Thai Scholarship Discovery and Matching

TunDee (ทุนดี) is a scholarship discovery and matching platform for Thai
students, focused on closing the information gap for rural and low-income
applicants who qualify for scholarships but never hear about them.

**Live:** [tundee.org](https://tundee.org)

---

## Overview

Many qualified Thai students never apply for scholarships — not for lack of
merit, but because scholarship information is scattered across dozens of
university and government websites, rarely reaches rural schools, and is
almost never translated into language a high-school student can act on.

TunDee lets students build a profile (grade, GPA, province, household income,
field of interest) and receive a ranked list of scholarships they qualify for,
with a plain-language explanation of why each one matched. Matching is
personalised: a student from Khon Kaen with a 3.2 GPA sees a different ranked
list than one from Bangkok with a 3.8 GPA.

All scholarships are human-verified before they appear in any results. No
unconfirmed listing, expired deadline, or unreviewed record is ever shown to
students.

---

## Key Features

- **Profile-based matching** — students enter grade, GPA, province, household
  income, field of interest, and welfare card status; the engine returns only
  scholarships they are eligible for.
- **Explainable recommendations** — every matched scholarship shows the
  specific reasons it was surfaced (e.g. "Your GPA 3.40 meets the 3.00
  minimum", "This scholarship is specifically for your province").
- **Fairness-aware ranking** — an equalized-odds post-processing layer
  adjusts recommendation rates for rural and low-income students so that
  qualified students from northeastern provinces receive fair visibility
  relative to Bangkok students.
- **Verified-only data** — a `review_status = 'verified'` gate enforced by
  both the import pipeline and Row Level Security means no unverified
  scholarship is ever visible.
- **Application checklist and tracker** — step-by-step guidance for each
  scholarship, with progress saved per user.
- **Bilingual** — all UI and scholarship data available in Thai and English.
- **Admin import** — CSV/XLSX upload from Google Sheets with dry-run preview,
  idempotent upsert, and a verified-only filter.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS |
| Database + Auth | Supabase (PostgreSQL, RLS, Magic Link, Google OAuth) |
| Email | Resend |
| Deployment | Vercel |
| Analytics | Google Analytics 4 |

---

## How It Works

### Matching

Each scholarship is scored against the student's profile in two stages.

**Stage 1 — Content-based eligibility scoring.**
Hard disqualifiers (GPA below minimum, income above ceiling, field or province
mismatch) eliminate scholarships immediately. Remaining scholarships receive a
normalised score (0–1) based on how closely they match: GPA margin above the
minimum, income proximity to the ceiling, welfare card priority, field of
study overlap, and province specificity. Targeted scholarships rank higher
than broad ones.

**Stage 2 — Equalized odds post-processing.**
Inspired by Hardt, Price & Srebro (NeurIPS 2016), the engine applies a
correction multiplier to scholarships with a high `historical_bias_score`
when the student is from a rural northeastern province *and* has household
income below ฿15,000/month. The multiplier is derived from the scholarship's
historical recommendation rate gap between advantaged and disadvantaged
student groups, and scales linearly to a hard cap of 2.0. The criterion is
equalized odds, not demographic parity — correction only applies within the
pool of students who already qualify for a scholarship.

### A/B Experiment

Each user is assigned a stable arm (`treatment` / `control`) by a
deterministic hash of their user UUID. The treatment arm receives
fairness-adjusted rankings; the control arm receives raw eligibility rankings.
Both arms are recorded in `profiles.ab_arm` and stamped on every
recommendation, click-through event, and user event row for
difference-in-differences analysis.

### Research Instrumentation

See [`docs/research-data-dictionary.md`](docs/research-data-dictionary.md)
for the full event schema, field definitions, and which causal-inference
analysis each field supports (PSM covariates, DiD time variable, ITT outcome,
subgroup analysis).

---

## Getting Started

### Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project

### Install

```bash
git clone https://github.com/tundeeorg-cmd/tundee.git
cd tundee
npm install
```

### Environment variables

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```
# Supabase — get these from Project Settings → API
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...

# Server-only — used for admin writes and the baseline snapshot API
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...

# Admin dashboard access (must match a Supabase auth user email)
NEXT_PUBLIC_ADMIN_EMAIL=your@email.com

# Optional — Google Analytics 4 measurement ID
NEXT_PUBLIC_GA_ID=G-XXXXXXXXXX

# Optional — Resend API key for deadline reminder emails
RESEND_API_KEY=re_...
```

### Database setup

In the Supabase SQL editor, run the files in order:

```
supabase/schema.sql
scripts/add_import_columns.sql
scripts/add_consent_columns.sql
scripts/add_ab_arm.sql
scripts/add_profile_baselines.sql
scripts/add_research_v2.sql
scripts/20260719_research_tables_v3.sql
scripts/20260719_full_research_migration.sql
scripts/20260719_v2_canonical_finalize.sql
scripts/20260719_v3_award_tier.sql
scripts/20260719_v4_drop_not_null_legacy.sql
scripts/20260720_v8_outcome_followup.sql
```

Every migration is **idempotent** — safe to re-run on a database that already has earlier scripts applied. All `ALTER TABLE` statements use `IF NOT EXISTS`; all `CREATE TABLE` statements use `IF NOT EXISTS`.

| Script | What it adds |
|---|---|
| `20260719_full_research_migration.sql` | Bilingual columns, research tables (`student_profile`, `event`, `experiment_assignment`, `tracked_scholarship`, `reminder_log`), LINE columns on `profiles` |
| `20260719_v2_canonical_finalize.sql` | Canonical URL columns (`application_url`, `source_url`), `reminder_opt_in`, canonical 5-value status CHECK |
| `20260719_v3_award_tier.sql` | `award_value_tier TEXT CHECK (... 6 codes)` on `td_scholarships` |
| `20260719_v4_drop_not_null_legacy.sql` | Drops NOT NULL from deprecated columns `scholarship_name`, `funder`, `application_link` so the 28-field importer can upsert without populating them |
| `20260720_v8_outcome_followup.sql` | `outcome_followup_log` table (LINE outcome self-report ledger); widens `event.outcome` CHECK to add `'waiting'` |

### Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Project Structure

```
tundee/
├── app/
│   ├── layout.tsx              # Root layout (Nav, Footer, GA)
│   ├── page.tsx                # Homepage
│   ├── about/                  # About + trust pillars page
│   ├── admin/                  # Admin dashboard (email-gated)
│   ├── api/
│   │   ├── admin/import/       # CSV/XLSX scholarship import endpoint
│   │   └── profile/baseline/   # Immutable research snapshot endpoint
│   ├── auth/                   # Auth callback handler
│   ├── privacy/                # PDPA privacy policy
│   ├── scholarships/           # Browse, match, and detail pages
│   ├── terms/                  # Terms of use
│   └── tracker/                # Application tracker
├── components/                 # Shared UI components
├── docs/
│   └── research-data-dictionary.md
├── lib/
│   ├── matching/               # Eligibility scoring + fairness engine
│   ├── research/               # Event logging, A/B context, arm assignment
│   ├── supabase/               # Client and server Supabase helpers
│   ├── translations.ts         # All bilingual UI strings (th + en)
│   └── types.ts                # TypeScript types
├── public/                     # Static assets
├── scripts/                    # SQL migrations (run in Supabase SQL editor)
└── supabase/
    └── schema.sql              # Database schema + RLS policies
```

---

## Research Data Tables

Three PostgreSQL tables power TunDee's causal-inference and fairness study.
All are created by running `scripts/add_research_v2.sql` then
`scripts/20260719_research_tables_v3.sql` in the Supabase SQL editor.

### `student_profile` — Protected attributes (1:1 with auth.users)

Stores the research-relevant attributes of each student:
geography (province, region, area\_type), socioeconomic status
(household\_income\_band, monthly\_income\_thb, welfare\_card,
first\_generation, parent\_education), education (school\_type,
school\_province, gpa, class\_rank\_pct), and academic intent
(intended\_level, intended\_field).

**Consent model (PDPA 2562):**

- `consent_research = TRUE` is required before any row enters a research
  export. The SQL views and the TypeScript `filterConsented()` utility both
  enforce this gate.
- When `EXTRACT(year FROM now()) - birth_year < 18` (i.e. the student is
  under 18), `guardian_consent = TRUE` is also required. The API enforces
  this server-side; the DB records the assertion.
- Opting out sets `consent_research = FALSE`, stopping future research use
  immediately. Historical pseudonymised exports (SHA-256 `user_id`) cannot
  be recalled individually.
- Sensitive data fields (income, disability, ethnicity proxies) fall under
  PDPA Section 26 and require explicit, granular consent before collection.

### `event` — Append-only interaction log

One row per user interaction: impressions, clicks, searches, status changes,
and partner-verified outcomes. Distinct from `funnel_events` (which is kept
for backward compatibility) in that it stores first-class recommender signals:

| Column | Purpose |
|---|---|
| `rank_position` | Position the scholarship was shown at (exposure signal) |
| `score` | Recommender final\_score (0–1) at time of impression |
| `recommender_variant` | Algorithm version (e.g. `'hybrid'`, `'baseline'`) |
| `fairness_mode` | Treatment flag: `'on'` (fairness re-ranking) or `'off'` (raw score) |
| `outcome`, `outcome_source`, `outcome_date` | Long-run outcome columns |

**Append-only rule:** rows in `event` may never be modified. This is enforced
at three layers simultaneously:
1. **DB trigger** (`trg_event_append_only`): raises `EXCEPTION` on any
   `UPDATE` or `DELETE`, catching even service-role direct SQL.
2. **RLS**: no `UPDATE` or `DELETE` policy exists — authenticated callers
   cannot mutate rows.
3. **Application layer**: `EventRepository` exposes only `insert()` and
   `insertBatch()`. There is no `update()`, `delete()`, or `upsert()` method.

To correct an incorrect outcome, **insert a new row** with
`event_type = 'outcome_verified'` — never modify the original.

### `experiment_assignment` — Sticky treatment assignment

One row per (user, experiment). The `(user_id, experiment_key)` composite
unique constraint guarantees that a user's arm never changes within an
experiment. Currently used for the `'ranking'` experiment:
- `variant = 'control'` → raw content-based ranking (`fairness_mode = 'off'`)
- `variant = 'treatment'` → fairness-aware re-ranking (`fairness_mode = 'on'`)

### `tracked_scholarship` — Per-user application tracker

One row per (user, scholarship). UNIQUE on `(user_id, scholarship_id)`.

| Column | Type | Notes |
|---|---|---|
| `status` | TEXT | `interested` → `applying` → `applied` → `awarded` / `rejected` |
| `reminder_opt_in` | BOOLEAN | Controls LINE reminder delivery (DEFAULT TRUE) |
| `notes` | TEXT | Free-text user notes |

### `reminder_log` — Idempotent LINE reminder ledger

One row per reminder sent. The UNIQUE constraint on
`(user_id, scholarship_id, offset_days, deadline_date)` makes the reminder
cron safe to re-run without re-sending. Supported offsets: 14 days and 1 day
before `deadline_date`.

### `outcome_followup_log` — Idempotent LINE outcome self-report ledger

One row per outcome-followup attempt sent (`attempt_no` 1–3, one per
`OUTCOME_OFFSETS` entry, default 30/60/90 days *after* `deadline_date`). The
UNIQUE constraint on `(user_id, scholarship_id, attempt_no)` makes the
`/api/cron/line-outcomes` job safe to re-run without re-sending. The
student's answer is written to `event` (`event_type='self_report_outcome'`,
`outcome` in `awarded`/`rejected`/`waiting`, `outcome_source='self_report'`),
and `tracked_scholarship.status` is updated to `awarded`/`rejected` unless
the answer is `waiting`.

### `td_scholarships` — Canonical 28-field scholarship schema

The authoritative scholarship table uses TEXT PK (`TD-0001` style). All 28
canonical columns mapped from the admin spreadsheet:

| # | Sheet header | DB column | Type |
|---|---|---|---|
| 1 | Scholarship ID | `scholarship_id` | TEXT PK |
| 2 | Scholarship Name (EN) | `scholarship_name_en` | TEXT |
| 3 | Scholarship Name (TH) | `scholarship_name_th` | TEXT |
| 4 | Funder (EN) | `funder_en` | TEXT |
| 5 | Funder (TH) | `funder_th` | TEXT |
| 6 | Funder Type | `funder_type` | TEXT |
| 7 | Level | `level` | TEXT |
| 8 | Field of Study | `field_of_study` | TEXT |
| 9 | Award Value Tier | `award_value_tier` | TEXT (see codes below) |
| 10 | Award Amount (THB) Numeric | `award_amount_thb_numeric` | INTEGER |
| 11 | Award Type | `award_type` | TEXT (`once`/`annual`/`monthly`/`full`) |
| 12 | Renewable (Y/N) | `renewable` | BOOLEAN |
| 13 | Bond/Obligation (Y/N) | `bond_obligation` | BOOLEAN |
| 14 | Region Eligibility | `region_eligibility` | TEXT |
| 15 | Targets Low-Income (Y/N) | `targets_low_income` | BOOLEAN |
| 16 | Welfare Card Priority (Y/N) | `welfare_card_priority` | BOOLEAN |
| 17 | Income Cap (THB/yr) | `income_cap_thb` | INTEGER |
| 18 | No. of Recipients | `num_recipients` | INTEGER |
| 19 | Min GPA | `min_gpa` | NUMERIC(3,2) |
| 20 | English Requirement | `english_requirement` | TEXT |
| 21 | Source Language | `source_language` | TEXT (`th`/`en`) |
| 22 | Deadline | `deadline_raw` | TEXT (raw; `deadline_date`/`is_rolling`/`note` derived) |
| 23 | Status | `status` | TEXT (`Open`/`Recheck`/`Closed`) |
| 24 | Application Link | `application_url` | TEXT — canonical apply URL |
| 25 | Source | `source_url` | TEXT — canonical source URL |
| 26 | Verification Status | `verification_status` | TEXT |
| 27 | Last Verified | `last_verified` | DATE |
| 28 | Notes | `notes` | TEXT |

**`award_value_tier` codes** (normalized on import from raw display strings):

| Code | Raw display string example |
|---|---|
| `full_ride` | "Full-ride (tuition+living)" |
| `full_tuition` | "Full-tuition" |
| `large` | "Large (≥100k THB)" |
| `medium` | "Medium (20k–100k)" |
| `small` | "Small (<20k)" |
| `stipend_only` | "Stipend-only" |
| `null` | blank cell |

**Internal columns** (computed by the app, not in import sheet): `translation_review`,
`deadline_date`, `deadline_is_rolling`, `deadline_note`, `is_displayed`,
`display_reason`, `stale`, `created_at`, `updated_at`.

**Deprecated columns** (nullable, back-filled for backward compat, not imported):
`scholarship_name`, `funder`, `application_link`, `source`, `award_amount_thb` (free text), `language`.

**Deleted columns** (dropped by migration v4, no longer in DB):
`application_open_date`.

---

## Author

**Jenissa Vichiansin**  
International School Bangkok

---

## License

MIT — see [LICENSE](LICENSE)

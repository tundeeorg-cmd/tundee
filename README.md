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
scripts/add_research_views.sql
```

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

## Author

**Jenissa Vichiansin**  
International School Bangkok

---

## License

MIT — see [LICENSE](LICENSE)

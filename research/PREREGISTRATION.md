# Pre-Registration: Fairness-Aware Ranking and Scholarship Application Rates

**Study:** Does Equalized Odds post-processing of scholarship recommendation
rankings increase application rates among rural low-income Thai students?

| | |
|---|---|
| **Version** | 1.0 |
| **Registered** | 2026-08-28 |
| **Platform** | TunDee (tundee.org) — Next.js 14 / Supabase scholarship matching |
| **Repository** | github.com/tundeeorg-cmd/tundee |
| **Design** | Two-arm, individually randomized, stratified controlled trial |
| **Status** | Registered before any outcome data from the randomized cohort has been observed |

---

## 0. Immutability and amendment procedure

This document is fixed at the commit that introduces it. **It is never edited.**

Any subsequent change — to hypotheses, outcomes, sample size, stopping rule,
exclusions, or analysis — is recorded in a separate dated file
`research/AMENDMENT-YYYY-MM-DD-<slug>.md` stating: what changed, why, the date,
and whether any outcome data had been observed at the time of the change. An
amendment made after outcomes are observed is disclosed as such in the paper.

The purpose is narrow and specific: to make it verifiable that the analysis
reported in the paper is the analysis planned before the data existed.

---

## 1. Research question

Does Equalized Odds post-processing (Hardt, Price & Srebro, NeurIPS 2016)
applied to scholarship recommendation rankings causally increase the rate at
which rural low-income Thai students click through to apply for scholarships?

---

## 2. Background and equipoise

TunDee ranks scholarships for each student by an eligibility-and-fit score. A
fairness correction based on Equalized Odds post-processing can re-rank that
list to compensate for measured historical disadvantage among students who are
both rural and low-income.

Whether this re-ranking changes real-world behaviour is unknown. It is
plausible that surfacing better-matched opportunities higher increases
applications; it is equally plausible that ordering has little effect against
the dominant barriers of awareness, confidence, and application cost. Genuine
equipoise holds, which is the justification for randomizing.

---

## 3. Hypotheses

### 3.1 Primary hypothesis (confirmatory)

Among users in the target population — `region_group = 'northeast'` **AND**
`income_bracket <= 3` — users assigned to `ranking_variant =
'fairness_adjusted'` have a **higher** apply-click rate than users assigned to
`ranking_variant = 'baseline'`.

- H₀: p_fairness_adjusted = p_baseline
- H₁: p_fairness_adjusted ≠ p_baseline (two-sided)

The test is two-sided. The directional expectation is stated, but a
significant effect in either direction is a reportable result.

### 3.2 Secondary hypotheses (exploratory)

Stated in advance, but **not** protected against multiplicity and **not**
capable of supporting a confirmatory claim:

1. The effect is larger in the target population than in the non-target population (interaction).
2. The effect is larger among users recruited through `isaan_2026` than `bkk_2026`.
3. Treatment reduces the mean served rank of clicked scholarships.

---

## 4. Design

| Element | Specification |
|---|---|
| **Unit of randomization** | The individual user |
| **Timing of assignment** | At profile completion (the `profile_completed` event), once |
| **Allocation ratio** | 1:1 |
| **Stratification** | `region_group` × `income_bracket` (3 × 7 = 21 strata) |
| **Assignment method** | Deterministic: `hash(user_id ‖ RANDOMIZATION_SALT)`, salt held in an environment variable |
| **Blinding** | Users are not told their arm. Analysis is conducted on arm labels only after the stopping point. |
| **Mutability** | Assignment is written once and never updated; enforced by database constraint or trigger, not application logic |

**On the salt.** The salt is fixed before the first assignment and never
changed. Changing it would silently re-randomize every already-assigned user
and destroy the correspondence between recorded arms and delivered treatment.

**On determinism.** A deterministic hash is used rather than a random draw so
that assignment is reproducible and auditable from `user_id` alone, and so
that a lost or re-created assignment row resolves to the same arm.

---

## 5. Variable definitions

These operational definitions are fixed here. They are grounded in the
existing schema and code, cited by file so they are unambiguous.

### 5.1 `region_group` — a property of the user

Derived from the user's own declared home province at profile completion.
**Never** derived from the advertising campaign.

| Value | Definition |
|---|---|
| `northeast` | Declared province ∈ the 20 Isan provinces enumerated in `lib/matching/engine.ts` (`NORTHEAST_PROVINCES`): กาฬสินธุ์, ขอนแก่น, ชัยภูมิ, นครพนม, นครราชสีมา, บึงกาฬ, บุรีรัมย์, มหาสารคาม, มุกดาหาร, ยโสธร, ร้อยเอ็ด, เลย, ศรีสะเกษ, สกลนคร, สุรินทร์, หนองคาย, หนองบัวลำภู, อำนาจเจริญ, อุดรธานี, อุบลราชธานี |
| `bangkok_metro` | Declared province ∈ {กรุงเทพมหานคร, นนทบุรี, ปทุมธานี, สมุทรปราการ} |
| `other` | Any other declared province |

### 5.2 `income_bracket` — a property of the user

Self-declared monthly household income, recorded on the 1–7 scale already in
use (`INCOME_OPTIONS`, `app/profile/setup/page.tsx`; `INCOME_CEILING`,
`lib/matching/engine.ts`):

| Value | Monthly household income (THB) |
|---|---|
| 1 | under 5,000 |
| 2 | 5,000 – 10,000 |
| 3 | 10,000 – 15,000 |
| 4 | 15,000 – 20,000 |
| 5 | 20,000 – 30,000 |
| 6 | 30,000 – 50,000 |
| 7 | over 50,000 |

`income_bracket <= 3` therefore means **declared monthly household income at or
below ฿15,000**.

### 5.3 `is_target_population`

`region_group = 'northeast' AND income_bracket <= 3`. This defines the primary
analysis stratum.

### 5.4 `recruitment_source` — how the user was reached

Derived from the `utm_campaign` parameter, validated against a closed set:

| Value | Condition |
|---|---|
| `isaan_2026` | `utm_campaign = 'isaan_2026'` exactly |
| `bkk_2026` | `utm_campaign = 'bkk_2026'` exactly |
| `organic` | Any other value, or absent |

**`recruitment_source` and `region_group` are independent variables and are
never conflated.** Campaign is how a person was reached; region_group is who
they are. A student living in Khon Kaen who arrives via the Bangkok ad is
`region_group = 'northeast'`, `recruitment_source = 'bkk_2026'`.

### 5.5 `fairness_eligible` — a property of the user

Computed for **every** user in **both** arms, and logged, whether or not any
adjustment is applied. Treatment is applied only where
`fairness_eligible = TRUE AND ranking_variant = 'fairness_adjusted'`.

Eligibility is a property of the person; treatment is an assignment. Logging
eligibility in both arms is what makes the comparison interpretable.

### 5.6 `ranking_variant` — the assignment

`'baseline'` or `'fairness_adjusted'`, per §4.

**Relationship to the legacy `ab_arm` field.** An earlier, non-stratified,
unsalted assignment (`get_byte(md5(user_id),0) % 2`, applied at first
match-page load) exists in the schema as `ab_arm`. It is **not** the
randomization for this study. `ranking_variant` is a distinct field. Legacy
`ab_arm` values are retained unmodified as pilot-era history and are not used
in any analysis specified here.

### 5.7 `cohort`

| Value | Definition |
|---|---|
| `pilot` | Account created **before** the deployment timestamp that introduced `ranking_variant` randomization |
| `main` | Account created at or after that timestamp |

The deployment timestamp is recorded in the deploy commit message and in
`assignment_algorithm_version`. As of registration the pilot cohort is
approximately 76 accounts, of which approximately 38 have completed profiles.

### 5.8 `landing_variant`

Landing-page copy variant, a recruitment-side manipulation. Recorded as a
covariate. It is **not** the treatment and must never influence, or be
influenced by, `ranking_variant`.

---

## 6. Outcomes

### 6.1 Primary outcome — one, named, and fixed

**The proportion of users with at least one `apply_click` within 14 days of
profile completion.**

- Binary per user: 1 if ≥1 apply-click in the window, else 0.
- Window opens at the `profile_completed` timestamp (T=0) and closes at T+14 days.
- Users whose 14-day window has not closed at the analysis date are excluded from the primary analysis, and their count is reported.

This is the **single** primary outcome. Every other measure below is secondary.

### 6.2 Secondary outcomes

1. Application started (`application_started` within 14 days).
2. Application submitted (`application_submitted` within 14 days).
3. Number of distinct scholarships applied to within 14 days (count).
4. Mean served rank of clicked scholarships (position measure).

Secondary outcomes are reported with unadjusted p-values, explicitly labelled
as exploratory, and cannot support a confirmatory claim.

---

## 7. Sample size and power

### 7.1 Assumptions

| Parameter | Value | Basis |
|---|---|---|
| Baseline apply-click rate (p₁) | 0.20 | Pilot-period observation; treated as an assumption, not an estimate |
| Minimum detectable effect | +10 percentage points | Smallest difference judged practically meaningful |
| Treatment rate under H₁ (p₂) | 0.30 | p₁ + MDE |
| α | 0.05, two-sided | Convention |
| Power (1−β) | 0.80 | Convention |

### 7.2 Calculation

Two-proportion comparison, pooled-variance form:

```
n = [ z(1-α/2)·√(2·p̄·(1-p̄)) + z(1-β)·√(p₁(1-p₁) + p₂(1-p₂)) ]² / (p₂ - p₁)²

p̄  = (0.20 + 0.30)/2 = 0.25
   = [ 1.9600·√0.375 + 0.8416·√0.37 ]² / 0.10²
   = [ 1.9600·0.612372 + 0.8416·0.608276 ]² / 0.01
   = [ 1.200250 + 0.511925 ]² / 0.01
   = 1.712175² / 0.01
   = 293.15
```

**n = 294 per arm (rounded up) → 588 users in the target population.**

The unpooled form gives n = 291 per arm; 294 is adopted as the more
conservative figure.

### 7.3 Recruitment target

| Quantity | Target |
|---|---|
| Target population (northeast AND income ≤ 3), per arm | 294 |
| Target population, total | 588 |
| Total completed profiles, including comparison groups and attrition | **800 – 1,200** |

The margin above 588 covers the Bangkok-metro comparison group, users outside
both groups, and loss from incomplete 14-day windows.

### 7.4 Status at registration

Approximately 38 completed profiles exist, all pilot cohort and all excluded
from the primary analysis. The randomized sample at registration is **zero**.
The study is approximately an order of magnitude short of target, and this is
a recruitment problem, not an analysis problem.

---

## 8. Stopping rule

Data collection stops at whichever of these comes **first**:

1. **294 completed profiles per arm within the target population** (`region_group = 'northeast' AND income_bracket <= 3 AND cohort = 'main'`); or
2. **31 January 2027**, a fixed calendar date, set by the submission timeline
   for the target venue and fixed independently of the data.

**No outcome analysis is run before that point.** No interim analysis, no
conditional-power check, no peeking at apply rates by arm. Enrollment counts
by stratum and arm may be monitored continuously in order to steer
recruitment; outcomes may not.

If the calendar date is reached with the target unmet, the study is analysed
as specified on the sample obtained, and the resulting power is reported
honestly alongside the estimate.

---

## 9. Exclusions

Fixed at registration. **No other exclusion is permitted without a dated
amendment.**

1. **Pilot cohort.** Users with `cohort = 'pilot'` — enrolled before randomization existed — are excluded from the primary analysis. They were never randomized; assigning them arms retrospectively would not be random assignment. They retain full product access and receive the baseline ranking.
2. **Non-consenting users.** Users without recorded research consent are excluded from all research datasets. They retain full product access.
3. **Incomplete observation window.** Users whose 14-day window has not closed at the analysis date, as in §6.1.

No user is filtered or excluded in application code. Exclusion is an analysis
decision applied at analysis time, from data that was recorded for everyone.

---

## 10. Statistical analysis plan

### 10.1 Primary analysis

**Two-proportion z-test**, two-sided, α = 0.05, comparing the primary outcome
(§6.1) between `ranking_variant` arms within the target population
(§5.3), restricted to `cohort = 'main'` and consented users.

Analysis is **intention-to-treat**: users are analysed in the arm they were
assigned, regardless of how many recommendations they saw, whether the
fairness adjustment ever fired for them, or whether they returned.

Reported: both arm proportions, the risk difference with a 95% confidence
interval, the z statistic, and the exact p-value.

### 10.2 Pre-specified secondary analysis

**Logistic regression** of the primary outcome on:

- `ranking_variant` (the coefficient of interest)
- `recruitment_source`
- grade level at signup
- enrollment date

Reported as an adjusted odds ratio with a 95% CI. This is a secondary,
supporting analysis; it does not replace §10.1, and a disagreement between the
two is reported rather than resolved by preference.

### 10.3 Heterogeneity

The interaction between `ranking_variant` and `is_target_population` is tested
in a model fitted on all `cohort = 'main'` users. Exploratory.

### 10.4 Multiplicity

One primary outcome, one primary test. No correction is required for the
primary analysis. All secondary and exploratory tests are reported with
unadjusted p-values and labelled as such.

### 10.5 Missing data

Missing declared attributes leave a user out of the stratum that attribute
defines; they are not imputed. Missing outcome data is treated as no event
(consistent with the outcome being defined as "at least one apply-click"),
and the count of users with no post-assignment activity is reported by arm as
a check on differential attrition.

### 10.6 Differential attrition check

Signup success and profile completion are compared across arms and across
device/browser classes. Because assignment happens at profile completion, any
differential attrition **before** that point cannot bias the arm comparison —
but attrition that correlates with device or connection quality is reported,
since it bears directly on the generalizability of a study about rural
low-income access.

---

## 11. What counts as a null result

Stated in advance so that a null is publishable rather than something to be
explained away.

**A null result is:** a two-sided p ≥ 0.05 on the primary test, with a 95%
confidence interval on the risk difference that includes zero.

Specifically, a confidence interval **contained within ±10 percentage points**
and including zero is reported as **evidence that Equalized Odds
post-processing does not produce a practically meaningful change in
application behaviour in this population** — not as an inconclusive study, and
not as a reason to search for a subgroup in which the effect appears.

This outcome is publishable and will be published. Fairness interventions that
work in offline metrics but do not change real behaviour are a finding the
literature needs, and this design is powered to detect the effect size that
was declared meaningful before the data existed.

A wide confidence interval arising from an under-recruited sample is reported
as an **underpowered** study, distinct from a null, and labelled as such.

---

## 12. Ethics

1. **The baseline arm receives the current production system**, not a degraded one. Nothing is withheld that users would otherwise have had.
2. **Both arms see real, verified scholarships they genuinely qualify for.** The manipulation is ordering only. Neither arm sees fewer or lower-quality opportunities.
3. **Equipoise holds** (§2).
4. **Participation is opt-in.** Declining research participation costs nothing: the product behaves identically, and the user is excluded from research datasets only.
5. **Participants include minors.** Consent language is plain Thai at secondary-school reading level, separate from the terms of service, versioned and timestamped. Under-18 users additionally require guardian consent, consistent with PDPA.
6. **No personal data is written before consent is recorded.**
7. **No product behaviour depends on outcomes.** Nothing in the system treats a user differently because they have converted, applied, or won.
8. **No outcome-by-arm interface exists** before the stopping point (§8), so that no one can be tempted to stop early on a favourable-looking split.

---

## 13. Declared deviations

None at registration.

Subsequent deviations are recorded in dated amendment files per §0 and
disclosed in the paper.

---

*Registered 2026-08-28. Fixed at the commit introducing this file.*

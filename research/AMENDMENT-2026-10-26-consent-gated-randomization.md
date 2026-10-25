# Amendment — consent-gated randomization, and unrandomized `/start` completions

**Status: DRAFT, not adopted.** Written 2026-10-26 by an AI coding assistant at the request of the project owner, from the code and read-only production queries. The study team decides whether to adopt, change or reject it. Per `research/PREREGISTRATION.md` §0 the pre-registration itself is not edited; this file is the record.

**Pre-registration amended:** v1.0, registered 2026-08-28 (commit `4a3cc5b`).
**Outcome data observed at the time of writing:** outcome *records* exist (`apply_click`, 293 rows; `funnel_events` impressions). **No analysis of any outcome by arm has been run.** The analysis in PREREG §10 has not been started. State this explicitly if the paper discloses amendments made after data collection began.

## 1. Consent-gated randomization (a change made on 2026-10-26, PR #52)

**What changed.** `POST /api/experiment/assign` no longer randomizes a student who does not hold current research consent (`student_profile.consent_research = TRUE` and `consent_version = '2026-07-v1'`). Their `ranking_variant` stays NULL and they receive the baseline ranking.

**What the pre-registration said.** §9.2: non-consenting users "are excluded from all research datasets"; §9 closing paragraph: "No user is filtered or excluded in application code. Exclusion is an analysis decision applied at analysis time, from data that was recorded for everyone." §12.4: "Declining research participation costs nothing: the product behaves identically."

**Why it differs.** Withholding randomization excludes at enrolment, in application code. It also changes the product for decliners: before, a decliner could be assigned the fairness-adjusted ranking and be dropped at export; now a decliner always receives the baseline ranking.

**Why it was done.** To avoid delivering a research treatment to a student who has not agreed to take part, which matters because participants include minors (§12.5). The study team should decide whether this supersedes §9.2/§12.4 or whether the original rule should be restored.

**Effect on the analysis.** The set of students eligible for the primary analysis (randomized, `main`, consenting) is unchanged in definition. The set of randomized students is now a subset of the consenting. No effect on any pre-specified estimand if consent is independent of arm, which holds by construction before assignment.

## 2. `/start` completions not randomized (a defect, from 2026-08-30)

**What happened.** Since 2026-08-30 (commit `f9272c9`), a visitor whose `/start` answers complete the profile is sent past the wizard, and the path that does this never calls the assignment route. PREREG §4 specifies assignment "at profile completion, once" for everyone.

**Extent (2026-10-26).** 59 of 82 complete `main`-cohort profiles (72%). 0 of the students who completed the wizard failed to be randomized. They received the baseline ranking.

**Decision requested.** Whether to (a) leave these students unrandomized and report them as a non-enrolled group, as this draft assumes, or (b) another treatment. Randomizing them retroactively is not proposed: assignment after enrolment is not random assignment (§9.1).

**Prevention.** Pending: ask research consent on `/start` before the questions, then call the assignment route at completion on that path.

## 3. Other facts the paper should state
- 16 students ticked research consent but have no `student_profile` row and are excluded from every export.
- The export gate (`/api/research/export`, `v_event_research_export`) does not check `consent_version`; 8 students consented under superseded wording (`2026-01-v1`).
- Effective sample is tens of students against a target of 294 per arm; the stopping rule (31 January 2027) will apply to whatever is obtained.

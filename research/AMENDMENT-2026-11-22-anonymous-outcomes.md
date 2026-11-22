# Amendment — outcomes of participants who never create an account

**Status: proposed 2026-11-22 with `fix/start-research-data`; awaiting confirmation by the advisor / ethics committee.** Written by an AI coding assistant at the project owner's request. Per `research/PREREGISTRATION.md` §0 the pre-registration itself is not edited; this file is the record.

**Pre-registration amended:** v1.0, registered 2026-08-28, as already amended by `AMENDMENT-2026-10-26-consent-gated-randomization.md` (randomization at `/start`) and `AMENDMENT-2026-11-22-age-threshold-18.md`.
**Outcome data observed at the time of the change:** none by arm. Outcome *records* exist; no analysis of any outcome by arm was run in preparing this change.

## What was wrong

Since the 2026-10-26 amendment a consenting adult visitor is randomized on `/start` before any account exists, and most never create one. For those participants the database held the arm (`anon_assignments`) and nothing else:

- their apply-clicks were written with `user_id = NULL` and nothing linking them to the assignment, so the primary outcome (§6.1) could not be attributed;
- their covariates (§5.1–5.4, §10.2) were not stored with the assignment;
- what they were shown, and at which rank (§6.2 #4), was not recorded.

## What changes

1. **Attribution by first-party cookie.** An apply-click from a browser carrying the `tundee_anon` cookie (first-party, httpOnly, server-minted, 90 days) whose assignment exists is bound **on the server** to that `anon_id`: arm, assignment time, rank of the latest impression of that scholarship within 24 h, and `excluded_from_primary`. The page never states an arm, a rank or an id. This applies to every apply link on the site (`/start` results, scholarship pages, tracker), signed out.
2. **T = 0 for an anonymous participant is `ranking_assigned_at`** (the moment of randomization on `/start`), which the 2026-10-26 amendment already made the point of assignment. The 14-day window of §6.1 runs from it. The 90-day cookie covers the window with margin.
3. **`excluded_from_primary`** is `false` only when the participant consented to the current wording (`CURRENT_CONSENT_VERSION`) and the click is at or after assignment and within 14 days. Later clicks keep their arm and are kept as behaviour. Nothing is dropped (§9: exclusion is an analysis decision; the flag records the facts it needs).
4. **Covariates are stored with the assignment, once** (`anon_assignments`, frozen by trigger): level, province, `region_group`, `income_bracket`, whether a GPA was given, the four UTMs, `recruitment_source` (same closed rule as §5.4) and `landing_variant` (§5.8). Rows assigned before this change have `region_group` and `income_bracket` recovered exactly from `stratum`; their other covariates are missing and are reported as such (§10.5), not imputed.
5. **Impressions** (`anon_impressions`): one row per card served, with its 1-indexed rank in the arm-ranked list. "ดูเพิ่มอีก 10 ทุน" continues the same list, so ranks 11, 12, … are real ranks.
6. **Sign-in.** When a participant later signs in, the existing merge rule decides the account's arm (unchanged), and every pre-sign-in click and impression row of that `anon_id` receives the `user_id`. A participant is then analysed **once, under the account**; the anonymous export omits claimed participants. Pre-sign-in clicks keep the arm they were bound to at the time (the treatment actually delivered); `randomization_conflicts` lists any participant whose account arm differs, as before.

## Known limitation — report as attrition

The anonymous identity is a cookie. A participant who **clears cookies, switches browser or device, or opens a funder link in a different browser** (for example, copying it out of the Facebook in-app browser) and clicks there is not attributed: that click has no `anon_id` and counts as no event (§10.5). This is non-differential by design — the arm is invisible to the participant and the cookie is identical in both arms — but it biases both arms' rates downward. Report, by arm:

- the number of anonymous participants with no recorded post-assignment activity (no impression after the first page, no click);
- the share of participants recruited inside in-app browsers (from `quiz_completed.context`), where cookie loss is most likely;
- a sensitivity analysis restricted to participants who signed in (whose clicks are attributed by account as well).

## Effect on the analysis

- §6.1: unchanged definition; T = 0 is the assignment time for participants randomized on `/start`.
- §9: no new exclusion. `excluded_from_primary` encodes §6.1 and §9.2 per click; the analyst applies §9.3 (incomplete window) at the analysis date.
- §10.1 / §10.2: anonymous participants enter with the covariates stored on their assignment (`research/ANALYSIS-DATA-DICTIONARY.md`). Grade level is the `/start` answer (`level`); enrollment date is `ranking_assigned_at`.

## Also changed on `/start` (no effect on the design)

- The matcher is the first thing on the page; the browse list is folded below it.
- Research consent after "ใช่ 18 ปีขึ้นไป" is an explicit choice between two equal buttons, "เข้าร่วมงานวิจัย (ไม่ระบุตัวตน)" / "ไม่เข้าร่วม", neither pre-selected; submit waits for one. The consent body text and version are unchanged; **the two button labels are new wording for the ethics committee to confirm.** Declining gives the same scholarships with the baseline ranking. `research_participation` is logged as before, so the opt-in rate can be compared across the change date (2026-11-22).

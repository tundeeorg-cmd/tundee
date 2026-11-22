# Amendment — research age threshold lowered from 20 to 18

**Status: decided by the project owner on 2026-11-22; awaiting confirmation by the advisor / ethics committee.** Written by an AI coding assistant at the project owner's request. Per `research/PREREGISTRATION.md` §0 the pre-registration itself is not edited; this file is the record.

**Pre-registration amended:** v1.0, registered 2026-08-28.
**Outcome data observed at the time of the change:** outcome *records* exist (`apply_click`, `funnel_events`). No analysis of any outcome by arm has been run by the author of this file; the project owner should confirm this for the study team.

## What changed

`MINOR_AGE_THRESHOLD` in `lib/research/consentGate.ts` (and `research_minor_age_threshold()` in SQL, `scripts/20261122_v37_minor_age_threshold_18.sql`) goes from **20** to **18**. The value drives three things:

1. **/start:** the age question becomes "คุณอายุ 18 ปีขึ้นไปหรือยัง". Visitors who answer yes are offered the study (when `ANON_RANDOMIZATION` is on).
2. **Guardian rule at export:** a consenting student is treated as an adult when `(year − birth_year) > 18`. Only the birth year is stored, so students born in `year − 18` are still asked for a guardian; students born in `year − 19` or earlier are not.
3. **Profile and consent screens:** the "under N" guardian wording follows the constant.

## History of the value

| Date | Value | Decided by |
|---|---|---|
| until 2026-10-26 | 18 | original implementation |
| 2026-10-26 | 20 | project owner (age of majority, PDPA §20) |
| 2026-11-22 | 18 | project owner (this amendment) |

## Why

The study needs 294 randomized, consenting students per arm in the target population by 31 January 2027 (§7, §8). At 20 the reachable pool is mostly university years 2–4. At 18 it includes Matthayom 6 leavers and first-year students, the group facing the costs this study is about. Thai research-ethics practice commonly accepts independent consent from 18 (for example, Mahidol University's age-related consent guidance requires no parent form from 18).

## What the study team must confirm

- **PDPA §20.** Under the Civil and Commercial Code, 18- and 19-year-olds are minors. A minor may consent alone only to acts the Code lets a minor do alone (§§22–24). Whether consenting to research use of income band and grades is such an act is a legal judgement. **If counsel or the ethics committee rejects it, revert to 20 (rollback in v37) and exclude 18–19-year-olds at analysis.** No data needs deleting: the export gate recomputes eligibility from `birth_year`.
- **§12.5** says under-18 participants require guardian consent. This change keeps that: no one under 18 is randomized without a guardian.
- **Self-declared age.** The /start answer cannot be verified; the export applies the birth-year rule again.

## Effect on the analysis

Eligibility only. Randomization (unit, ratio, stratification, salt, immutability) is unchanged. Report the threshold and its change date in the methods; a sensitivity analysis restricted to `(year − birth_year) > 20` reproduces the earlier population.

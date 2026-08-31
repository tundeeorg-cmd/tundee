-- ═════════════════════════════════════════════════════════════════════════════
-- v19b — Give back the answers the wizard threw away
--
-- Run AFTER 20260831_v19_grade_level_domain.sql.
--
-- WHAT WAS LOST, AND HOW
-- ──────────────────────
-- The old wizard held all nine steps in memory and wrote once, at the end:
--
--     upsert(payload)                       -- rejected by the CHECK constraint
--     if (error) update(payload).eq(id)     -- "fallback"
--     if (!updateError) → fire profile_completed, redirect to /scholarships
--
-- For a student who already had a profiles row, both statements hit the
-- constraint and they saw the raw Postgres error at 100%.
--
-- For a student with NO profiles row, the INSERT was rejected and the fallback
-- UPDATE matched ZERO rows — which PostgREST does not treat as an error. The
-- wizard concluded it had saved, fired profile_completed, and sent them to the
-- product with no profile at all. That is the silent half, and it is the larger
-- half: 20 of the 39 accounts that fired profile_completed have no profiles row.
-- 64 completion events in August; only 16 belong to a student who ended up with
-- a grade level.
--
-- Their wizard answers are gone. They were never written anywhere: no per-step
-- persistence, and user_events carries no answer payload (verified — 925 events,
-- none containing a grade). What CAN be given back is what a DIFFERENT form
-- collected from some of the same students.
--
-- WHAT THIS RESTORES
-- ──────────────────
-- student_profile (the research questionnaire) holds province, GPA and welfare
-- card for 7 students whose profiles row has none of them. Same student, same
-- answer, different table. Copying it across means they are not asked again.
--
-- WHAT THIS DELIBERATELY DOES NOT RESTORE
-- ───────────────────────────────────────
--   grade_level  — student_profile.intended_level is what a student INTENDS to
--                  study, not what year they are in now. Writing 'bachelor' into
--                  grade_level would put a claim on their record they never
--                  made. It is also unnecessary: lib/recommender/eligibility.ts
--                  already reads intended_level as a second level bucket, so
--                  these students are not being level-filtered today.
--   income_bracket — household_income_band is annual and banded ('<100k',
--                  '100-200k'); income_bracket is monthly and 1–7. '<100k'
--                  spans brackets 1 and 2, so any mapping is a guess, and this
--                  column is a pre-registered stratification variable (PREREG
--                  §5.2). A guess here would corrupt the study, not just a
--                  profile. These students are asked once, on step 6.
--
-- Everyone else resumes where they left off instead: app/profile/setup now reads
-- the stored row and opens on the first unanswered question (lib/profile/
-- setupDraft.ts, resumeStep), so nobody restarts at step 1.
--
-- Idempotent: only ever fills a NULL, never overwrites an answer.
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Make sure every auth user has a profiles row to resume into ──────────
-- Without a row, resumeStep() has nothing to read and the student starts at
-- step 0 — which is correct for a new signup and wrong for the 20 who were told
-- they had finished. The row is created EMPTY: no invented answers, just a place
-- for their own to land, and a record that the account exists.
INSERT INTO public.profiles (id)
SELECT u.id
FROM   auth.users u
LEFT   JOIN public.profiles p ON p.id = u.id
WHERE  p.id IS NULL
ON CONFLICT (id) DO NOTHING;

-- ── 2. Copy across answers the student already gave elsewhere ───────────────
UPDATE public.profiles p
SET    province     = COALESCE(p.province, NULLIF(sp.province, '')),
       gpa          = COALESCE(p.gpa, sp.gpa),
       welfare_card = COALESCE(p.welfare_card, sp.welfare_card),
       updated_at   = NOW()
FROM   public.student_profile sp
WHERE  sp.user_id = p.id
  AND (
        (p.province IS NULL AND NULLIF(sp.province, '') IS NOT NULL)
     OR (p.gpa IS NULL AND sp.gpa IS NOT NULL)
     OR (p.welfare_card IS NULL AND sp.welfare_card IS NOT NULL)
      );

-- ── 3. signup_cohort follows from province, so derive it where it is missing ─
-- Mirrors determineSignupCohort() in lib/profile/setupAnswers.ts. The constraint
-- rejects '', so every branch returns a real wave.
UPDATE public.profiles
SET    signup_cohort = CASE
         WHEN province = 'กรุงเทพมหานคร' THEN 'wave_1_bangkok'
         WHEN public.tundee_region_group(province) = 'northeast' THEN 'wave_2_northeast'
         WHEN province IN (
           'เชียงใหม่','เชียงราย','แม่ฮ่องสอน','ลำปาง','ลำพูน','พะเยา',
           'แพร่','น่าน','พิษณุโลก','สุโขทัย','ตาก','อุตรดิตถ์',
           'กำแพงเพชร','พิจิตร','เพชรบูรณ์','นครสวรรค์','อุทัยธานี'
         ) THEN 'wave_2_north'
         ELSE 'wave_3_national'
       END
WHERE  signup_cohort IS NULL
  AND  province IS NOT NULL
  AND  province <> '';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VERIFY (run manually after applying)
-- ═════════════════════════════════════════════════════════════════════════════
--
--   SELECT COUNT(*) FROM auth.users u
--   LEFT JOIN public.profiles p ON p.id = u.id WHERE p.id IS NULL;
--   -- expect 0
--
--   SELECT COUNT(*) FILTER (WHERE grade_level IS NULL)  AS no_grade,
--          COUNT(*) FILTER (WHERE province    IS NULL)  AS no_province,
--          COUNT(*)                                     AS total
--   FROM   public.profiles;
--   -- no_grade should fall as students return and resume; no_province should
--   -- have dropped by 7 the moment this ran.

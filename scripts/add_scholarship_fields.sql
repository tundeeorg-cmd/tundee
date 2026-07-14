-- Add all missing columns to scholarships table
-- Safe to run — uses ADD COLUMN IF NOT EXISTS

ALTER TABLE scholarships ADD COLUMN IF NOT EXISTS
  name_en TEXT;

ALTER TABLE scholarships ADD COLUMN IF NOT EXISTS
  funder_name_en TEXT;

ALTER TABLE scholarships ADD COLUMN IF NOT EXISTS
  amount_type TEXT DEFAULT 'annual'
  CHECK (amount_type IN ('annual','once','monthly','full'));

ALTER TABLE scholarships ADD COLUMN IF NOT EXISTS
  grade_levels TEXT[] DEFAULT '{}';
-- Values: M4, M5, M6, uni, graduate, any

ALTER TABLE scholarships ADD COLUMN IF NOT EXISTS
  english_level TEXT DEFAULT 'none'
  CHECK (english_level IN ('none','basic','proficient','fluent'));

ALTER TABLE scholarships ADD COLUMN IF NOT EXISTS
  english_score_required TEXT;
-- e.g. 'IELTS 6.5' or 'TOEFL 80'

ALTER TABLE scholarships ADD COLUMN IF NOT EXISTS
  bond_obligation BOOLEAN DEFAULT FALSE;
-- Must return to work/study in Thailand after graduation

ALTER TABLE scholarships ADD COLUMN IF NOT EXISTS
  renewable BOOLEAN DEFAULT FALSE;
-- TRUE = scholarship renews each year if GPA maintained

ALTER TABLE scholarships ADD COLUMN IF NOT EXISTS
  documents_required TEXT[] DEFAULT '{}';
-- Values: transcript, id_card, income_certificate,
--         welfare_card, photo, recommendation_letter,
--         personal_statement

ALTER TABLE scholarships ADD COLUMN IF NOT EXISTS
  description_th TEXT;
-- 1-3 sentence Thai description shown to students

-- NEW FIELD: enrolled university requirement
-- Some scholarships require you to already be a student
-- at a specific university (e.g. KKU scholarship requires
-- being a KKU student). NULL = open to anyone.
ALTER TABLE scholarships ADD COLUMN IF NOT EXISTS
  enrolled_university_required TEXT;
-- NULL = no restriction (open to anyone)
-- Text = university name in Thai, e.g. 'มหาวิทยาลัยขอนแก่น'

-- Verify
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'scholarships'
ORDER BY ordinal_position;

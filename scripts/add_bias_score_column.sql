-- TunDee: Run this in Supabase SQL Editor ONLY when ready to clear mock data.
-- Real scholarship data will be imported via CSV after this script runs.
-- DO NOT run in production until real data CSV is ready to upload.

ALTER TABLE scholarships
ADD COLUMN IF NOT EXISTS historical_bias_score DECIMAL(3,2) DEFAULT 0.5;

COMMENT ON COLUMN scholarships.historical_bias_score IS
'Fairness layer: estimated historical bias toward Bangkok/urban applicants.
0.1-0.3 = rural/low-income focused (EEF, provincial).
0.4-0.6 = neutral.
0.7-0.9 = historically urban-biased (top universities, international).
Used by equalized odds post-processing correction (Hardt, Price, Srebro 2016).';

ALTER TABLE scholarships
ADD COLUMN IF NOT EXISTS grade_levels TEXT[] DEFAULT NULL;

COMMENT ON COLUMN scholarships.grade_levels IS
'Eligible grade levels: ["M4","M5","M6","uni","graduate"] or NULL for any.';

-- Profiles table for storing student matching data
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  province_id TEXT,               -- Thai province name e.g. 'ขอนแก่น'
  income_bracket INTEGER CHECK (income_bracket BETWEEN 1 AND 7),
  gpa DECIMAL(3,2) CHECK (gpa BETWEEN 0 AND 4),
  fields_of_interest TEXT[] DEFAULT ARRAY['any'],
  welfare_card BOOLEAN DEFAULT FALSE,
  grade_level TEXT CHECK (grade_level IN ('M4','M5','M6','uni','graduate')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can upsert own profile"
  ON public.profiles FOR ALL
  USING (auth.uid() = id);

-- Recommendations table for logging match results (fairness audit)
CREATE TABLE IF NOT EXISTS public.recommendations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  scholarship_id UUID REFERENCES public.scholarships(id) ON DELETE CASCADE,
  score_raw DECIMAL(6,4),
  score_fairness_adjusted DECIMAL(6,4),
  rank INTEGER,
  reasons_json JSONB,
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, scholarship_id)
);

ALTER TABLE public.recommendations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own recommendations"
  ON public.recommendations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can upsert own recommendations"
  ON public.recommendations FOR ALL
  USING (auth.uid() = user_id);

-- TunDee: Run this in Supabase SQL Editor ONLY when ready to clear mock data.
-- Real scholarship data will be imported via CSV after this script runs.
-- DO NOT run in production until real data CSV is ready to upload.

TRUNCATE TABLE recommendations CASCADE;
TRUNCATE TABLE applications CASCADE;
TRUNCATE TABLE scholarships RESTART IDENTITY CASCADE;

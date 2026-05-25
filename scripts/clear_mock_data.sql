-- TunDee: Run this in Supabase SQL Editor ONLY when ready to clear mock data.
-- Real scholarship data will be imported via CSV after this script runs.
-- DO NOT run in production until real data CSV is ready to upload.

DELETE FROM recommendations;
DELETE FROM applications;
DELETE FROM scholarships
WHERE
  name_en ILIKE '%sample%'
  OR name_th ILIKE '%ตัวอย่าง%'
  OR name_en ILIKE '%Sample Scholarship%'
  OR funder_name_th ILIKE '%มูลนิธิตัวอย่าง%'
  OR application_url ILIKE '%example.th%'
  OR application_url ILIKE '%scholarship%.example%';

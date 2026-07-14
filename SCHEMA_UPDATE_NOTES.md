# Schema Update — New Fields

## Run this SQL first
`scripts/add_scholarship_fields.sql` in Supabase SQL Editor

## New field: enrolled_university_required
Some scholarships require the applicant to already be
enrolled at a specific university.

Examples:
- ทุน KKU อีสาน → enrolled_university_required = 'มหาวิทยาลัยขอนแก่น'
- ทุน CMU ภาคเหนือ → enrolled_university_required = 'มหาวิทยาลัยเชียงใหม่'
- ทุน กสศ. → enrolled_university_required = NULL (anyone)

## What is renewable?
- TRUE = scholarship continues each year for the full
  program duration if GPA requirement is maintained
- FALSE = one-time payment only

## amount_type values
- `annual`  → per year (default)
- `monthly` → per month
- `once`    → one-time payment (replaces old `one-time`)
- `full`    → covers full program cost

## grade_levels values
M4, M5, M6, uni, graduate, any, vocational

## Spreadsheet
Use TunDee_Master_Scholarship_Sheet_UPDATED.xlsx
(replaces old version — has 13 new columns)

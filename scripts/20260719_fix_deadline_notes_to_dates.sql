-- Migrate concrete date strings from deadline_note to deadline_date (ISO format).
-- These entries had parseable D-Mon-YYYY dates stored as text instead of proper dates.
-- After this migration, deadline_date is populated and deadline_note is cleared,
-- so TdScholarshipCard will format them via formatUserDate (Thai/Buddhist-era format).

UPDATE td_scholarships SET deadline_date = '2026-09-25', deadline_note = NULL WHERE scholarship_id = 'TD-0009' AND deadline_date IS NULL;
UPDATE td_scholarships SET deadline_date = '2026-08-31', deadline_note = NULL WHERE scholarship_id = 'TD-0013' AND deadline_date IS NULL;
UPDATE td_scholarships SET deadline_date = '2026-07-31', deadline_note = NULL WHERE scholarship_id = 'TD-0014' AND deadline_date IS NULL;
UPDATE td_scholarships SET deadline_date = '2026-10-06', deadline_note = NULL WHERE scholarship_id = 'TD-0020' AND deadline_date IS NULL;
UPDATE td_scholarships SET deadline_date = '2026-12-01', deadline_note = NULL WHERE scholarship_id = 'TD-0022' AND deadline_date IS NULL;
UPDATE td_scholarships SET deadline_date = '2026-07-31', deadline_note = NULL WHERE scholarship_id = 'TD-0010' AND deadline_date IS NULL;
UPDATE td_scholarships SET deadline_date = '2026-09-15', deadline_note = NULL WHERE scholarship_id = 'TD-0003' AND deadline_date IS NULL;
UPDATE td_scholarships SET deadline_date = '2026-09-15', deadline_note = NULL WHERE scholarship_id = 'TD-0004' AND deadline_date IS NULL;

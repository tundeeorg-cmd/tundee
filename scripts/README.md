# TunDee Scripts

## Export all scholarships to Excel (NEWEST MASTERSHEET)
Reads ALL scholarships from Supabase (active and inactive)
and saves to `NEWEST_MASTERSHEET.xlsx` in the project root.

```
python3 scripts/export_scholarships.py
```

Required env vars (loaded from `.env.local`):
- `NEXT_PUBLIC_SUPABASE_URL` or `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Hide all scholarships from public view
Sets `is_active = FALSE` on all scholarships.
**Does NOT delete any data.**

```
python3 scripts/hide_all_scholarships.py
```

**Always export first, then hide.**

## Restore all scholarships
Run this SQL in Supabase SQL Editor:
```sql
UPDATE scholarships SET is_active = TRUE;
```

Or restore specific ones:
```sql
UPDATE scholarships
SET is_active = TRUE
WHERE name_th LIKE '%กสศ%';
```

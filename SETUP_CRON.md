# Setting Up Daily Scholarship Expiry

TunDee automatically hides expired scholarships daily using one of two approaches.

---

## Option A — Vercel Cron (FREE, recommended for Vercel deployments)

This is already configured in `vercel.json`. It runs every day at 18:00 UTC (01:00 Thai time).

### 1. Add the cron secret to your environment variables

```bash
# Generate a random secret
openssl rand -base64 32
```

Add `CRON_SECRET=<your-random-secret>` to:
- Your `.env.local` file (for local testing)
- Vercel Dashboard → Settings → Environment Variables

### 2. Deploy

```bash
git push
```

Vercel automatically picks up the crons from `vercel.json` and invokes `/api/cron` on schedule.
The route is already created at `app/api/cron/route.ts`.

### 3. Test manually

```bash
curl -H "Authorization: Bearer <your-cron-secret>" https://www.tundee.org/api/cron
```

Expected response:
```json
{ "ok": true, "hidden": 2, "names": ["ทุน XYZ (2026-05-31)"], "ran_at": "2026-06-01T18:00:00.000Z" }
```

---

## Option B — Supabase pg_cron (requires Supabase paid plan)

If you prefer to run this directly in the database:

### 1. Enable pg_cron extension

Supabase Dashboard → Database → Extensions → search for `pg_cron` → Enable.

### 2. Schedule the job in SQL Editor

```sql
SELECT cron.schedule(
  'hide-expired-scholarships',
  '0 18 * * *',  -- runs daily at 18:00 UTC (01:00 Thailand time, UTC+7)
  $$
  UPDATE scholarships
  SET is_active = FALSE
  WHERE deadline_date IS NOT NULL
    AND deadline_date < CURRENT_DATE
    AND is_active = TRUE;
  $$
);
```

### 3. Verify

```sql
SELECT * FROM cron.job;
SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
```

---

## Option C — Supabase Edge Function

A Deno-based edge function is already created at `supabase/functions/hide-expired/index.ts`.

### Deploy it

```bash
npm install -g supabase
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase functions deploy hide-expired
```

### Schedule via pg_cron (calls the edge function via HTTP)

```sql
SELECT cron.schedule(
  'call-hide-expired-function',
  '0 18 * * *',
  $$
  SELECT net.http_post(
    url := 'https://<project-ref>.supabase.co/functions/v1/hide-expired',
    headers := '{"Authorization": "Bearer <SERVICE_ROLE_KEY>"}'::jsonb
  );
  $$
);
```

---

## Important: RLS policy

Make sure your RLS policy reads `is_active IS NOT FALSE` (not `is_active = TRUE`), so
scholarships with NULL `is_active` are treated as active until explicitly set to false.

The recommended policy:
```sql
DROP POLICY IF EXISTS "Public read scholarships" ON scholarships;
CREATE POLICY "Public read scholarships" ON scholarships
  FOR SELECT USING (is_active IS NOT FALSE);
```

This is safe because:
- New scholarships with `is_active = NULL` → treated as active (visible) ✓
- New scholarships with `is_active = TRUE` → visible ✓
- Expired scholarships with `is_active = FALSE` → hidden ✓

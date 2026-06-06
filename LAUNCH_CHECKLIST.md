# TunDee Launch Checklist

## Database (run manually in Supabase SQL Editor)

- [ ] `scripts/enable_rls.sql` — Enables Row Level Security on all tables
- [ ] `scripts/add_tracker_support.sql` — Adds `checklist_progress` column + indexes
- [ ] `scripts/fix_save_constraint.sql` — Unique index required for save/bookmark button
- [ ] `scripts/admin_views.sql` — Admin analytics views + `last_active_at` column
      ⚠️  Edit the admin email in `admin_views.sql` before running!
- [ ] Verify active scholarship count:
      ```sql
      SELECT COUNT(*) FROM scholarships WHERE is_active = TRUE;
      ```
      Should return 90+

---

## Vercel Environment Variables

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://egfcqafrlrhkjnynsiyb.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | *(from Supabase Dashboard → Settings → API)* |
| `NEXT_PUBLIC_SITE_URL` | `https://www.tundee.org` |
| `CRON_SECRET` | *(any random string — keeps `/api/cron` private)* |

- [ ] All 4 env vars set in Vercel Dashboard → Settings → Environment Variables
- [ ] Env vars set for: Production + Preview + Development

---

## DNS & SSL

- [x] `tundee.org` pointing to Vercel
- [x] `www.tundee.org` pointing to Vercel  
- [x] SSL certificate active (Vercel auto-provisions)

---

## Cron Job (auto-hide expired scholarships)

- [ ] `CRON_SECRET` set in Vercel environment variables
- [ ] `vercel.json` has cron entry (`0 18 * * *` = 01:00 Thailand time)
- [ ] Test manually: `curl -H "Authorization: Bearer <your-secret>" https://www.tundee.org/api/cron`

---

## Manual Tests (do these in browser before announcing launch)

### Auth
- [ ] Sign up with email → verify email link → log in → redirects to homepage
- [ ] Sign up with Google → redirects to `/profile` setup
- [ ] Log out → redirects to homepage
- [ ] Log back in → session restored, avatar visible in nav

### Scholarships
- [ ] Browse page shows 90+ scholarships
- [ ] Search by name filters results instantly
- [ ] Tier filter (🟢🟡🔴) shows count badges and filters correctly
- [ ] Sort by deadline / amount / A-Z works
- [ ] Grade level filter works (ม.ต้น / ม.ปลาย / ปวช./ปวส. / uni / graduate)
- [ ] Click a scholarship → detail page loads correctly
- [ ] Expired deadline shows red ⚠️ banner on detail page
- [ ] Apply button opens external URL (or Google search for CHECK_WEBSITE scholarships)
- [ ] Share button copies link / opens native share sheet on mobile
- [ ] Print button works (nav/buttons hidden in print preview)
- [ ] "ใหม่ / New" badge on recently added scholarships

### Matching Engine
- [ ] Fill profile: GPA 3.4, Surin province, income bracket 2, medicine, welfare card YES
- [ ] "ทุนที่ตรงกับคุณ" tab shows ranked results with reasons
- [ ] Fairness badges (⚖️) appear on scholarships with bias_score > 0.6
- [ ] Each card shows 2-3 match reasons in Thai

### Tracker
- [ ] Save a scholarship → appears in /tracker under "Saved"
- [ ] Start 7-step checklist → progress saves and reloads correctly
- [ ] Delete saved scholarship → removed from tracker
- [ ] Nav shows gold count badge for in-progress applications
- [ ] Red dot appears on nav Tracker link when deadline ≤ 7 days

### Profile
- [ ] Upload avatar → updates in nav immediately (no reload needed)
- [ ] Save profile fields → reloads with updated values
- [ ] Province selector has all 77 provinces

### UI / UX
- [ ] Toggle dark mode → all pages look correct
- [ ] Toggle Thai/English → all text switches (Thai is default on fresh load)
- [ ] Mobile (375px): bottom nav visible, no content overlap
- [ ] Back-to-top button appears after scrolling 400px

### Key Pages
- [ ] `/` — homepage loads, featured scholarships visible, CTA band shows live count
- [ ] `/scholarships` — browse + My Matches tabs work
- [ ] `/about` — all 7 sections load, dynamic count visible
- [ ] `/demo` — Ploy scenario button runs matching, fairness comparison shows
- [ ] `/tracker` — shows empty state or real applications (must be logged in)
- [ ] `/profile` — form loads with existing data
- [ ] `/auth` — login/signup works with email and Google
- [ ] `/not-found` — 404 page shows for unknown routes

---

## Performance

- [ ] Lighthouse score > 85 on `/scholarships` (mobile)
- [ ] No console errors in production (DevTools → Console)
- [ ] Page load < 3s on 3G (DevTools → Network throttle)

---

## NSC 2026 Submission

- [ ] `/demo` page polished and tested end-to-end
- [ ] Fairness table shows correction multipliers
- [ ] Tech stack section visible
- [ ] NSC 2026 branding in header
- [ ] GitHub link in footer and /demo footer
- [ ] Project deployed live at `https://www.tundee.org`

---

## Post-Launch

- [ ] Monitor Supabase logs for errors (Dashboard → Logs)
- [ ] Check Vercel deployment logs for build errors
- [ ] Check cron runs the next morning (Vercel → Functions → Cron)

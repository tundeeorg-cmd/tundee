# ทุนดี (TunDee) — Thai Scholarship Discovery Platform

A bilingual Thai/English scholarship discovery platform for Thai students. Built with Next.js 14, TypeScript, Tailwind CSS, and Supabase.

**Live:** [tundee.org](https://tundee.org)

---

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS |
| Database | Supabase (PostgreSQL) |
| Deployment | Vercel |
| Fonts | Sarabun (Thai) + DM Sans (English) |

---

## Local Development

### 1. Clone and install

```bash
git clone https://github.com/your-org/tundee.git
cd tundee
npm install
```

### 2. Set up Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. In the SQL editor, run **`supabase/schema.sql`** first, then **`supabase/seed.sql`**
3. Copy your project URL and anon key from **Project Settings → API**

### 3. Configure environment

```bash
cp .env.local.example .env.local
```

Edit `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
```

### 4. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Project Structure

```
tundee/
├── app/
│   ├── page.tsx                  # Homepage
│   ├── layout.tsx                # Root layout (Nav + Footer)
│   ├── globals.css               # Global styles + Google Fonts
│   ├── scholarships/
│   │   ├── page.tsx              # Browse & filter page
│   │   └── [id]/page.tsx         # Scholarship detail page
│   └── about/page.tsx            # About TunDee
├── components/
│   ├── Nav.tsx                   # Sticky nav with language toggle
│   ├── Footer.tsx
│   ├── HeroSection.tsx
│   ├── StatsBar.tsx
│   ├── ScholarshipCard.tsx       # Card used in browse + homepage
│   ├── ScholarshipFilters.tsx    # Filter sidebar/panel
│   ├── ChecklistUI.tsx           # 7-step application guide
│   └── LanguageToggle.tsx        # ไทย/EN switcher + useLanguage hook
├── lib/
│   ├── types.ts                  # TypeScript types
│   ├── translations.ts           # All UI strings (th + en)
│   └── supabase.ts               # Supabase client + data fetchers
└── supabase/
    ├── schema.sql                # Database schema + RLS policies
    └── seed.sql                  # 15 sample scholarships + checklist steps
```

---

## Deploying to Vercel

### Automatic (recommended)

1. Push to GitHub
2. Import repo at [vercel.com/new](https://vercel.com/new)
3. Add environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Set custom domain: `tundee.org`

### Manual deploy

```bash
npm install -g vercel
vercel --prod
```

---

## Bilingual System

All UI strings live in [`lib/translations.ts`](lib/translations.ts). Every visible text has a `th` and `en` value. The current language is stored in `localStorage` under the key `tundee_lang` and toggled via the top-right nav button.

Components receive the language from the `useLanguage()` hook (exported from `LanguageToggle.tsx`).

---

## Database Schema

See [`supabase/schema.sql`](supabase/schema.sql) for the full schema.

Key tables:
- **`scholarships`** — all scholarship data with RLS (public read for `is_active = true`)
- **`scholarship_checklist_steps`** — the 7-step application guide (static lookup)

---

## v1 Limitations (by design)

- No authentication — all data is public read
- Client-side filtering only (no server-side search)
- No AI matching (planned for v2)
- No deadline reminders (planned for v3)
- ChecklistUI is visual only — no state persistence

---

## License

MIT — see [LICENSE](LICENSE)

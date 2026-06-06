'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { getMatchedScholarships } from '@/lib/matching'
import type { MatchResult, ScholarshipRow, StudentProfile } from '@/lib/matching'
import { getScholarships } from '@/lib/supabase'
import { useLang } from '@/lib/LanguageContext'
import type { Scholarship } from '@/lib/types'

// ── Ploy's hardcoded profile ──────────────────────────────────────────────────
const PLOY_PROFILE: StudentProfile = {
  province_id: 'สุรินทร์', // Surin (northeast) — use Thai name to match engine's NORTHEAST_PROVINCES set
  income_bracket: 2,         // 5,001–10,000 THB/month
  gpa: 3.4,
  fields_of_interest: ['medicine', 'science'],
  welfare_card: true,
  grade_level: 'M6',
}

// ── Type helpers ──────────────────────────────────────────────────────────────
// getScholarships returns Scholarship[] but engine expects ScholarshipRow[]
// The shapes are compatible — cast via unknown.
function toScholarshipRows(scholarships: Scholarship[]): ScholarshipRow[] {
  return scholarships.map((s) => ({
    ...s,
    field_of_study: s.field_of_study ?? [],
    province_restriction: s.province_restriction ?? [],
    welfare_card_priority: s.welfare_card_priority ?? false,
    historical_bias_score: s.historical_bias_score ?? 0.5,
  })) as unknown as ScholarshipRow[]
}

// ── Small UI helpers ──────────────────────────────────────────────────────────
function ScoreBar({ pct, gold = true }: { pct: number; gold?: boolean }) {
  return (
    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
      <div
        className={`h-2 rounded-full transition-all duration-700 ${gold ? 'bg-[#F0A500]' : 'bg-emerald-500'}`}
        style={{ width: `${Math.min(pct, 100)}%` }}
      />
    </div>
  )
}

function Pill({ children, color = 'gray' }: { children: React.ReactNode; color?: 'gold' | 'gray' | 'green' | 'blue' }) {
  const colors: Record<string, string> = {
    gold: 'bg-[#F0A500]/15 text-[#F0A500] border border-[#F0A500]/30',
    gray: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600',
    green: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-700',
    blue: 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-700',
  }
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${colors[color]}`}>
      {children}
    </span>
  )
}

function LoadingSpinner() {
  return (
    <div className="flex justify-center items-center py-16">
      <div className="relative w-12 h-12">
        <div className="absolute inset-0 rounded-full border-4 border-gray-200 dark:border-gray-700" />
        <div className="absolute inset-0 rounded-full border-4 border-t-[#F0A500] animate-spin" />
      </div>
      <span className="ml-4 text-gray-500 dark:text-gray-400 text-sm">กำลังค้นหาทุน...</span>
    </div>
  )
}

// ── Scholarship card ──────────────────────────────────────────────────────────
function MatchCard({ result, lang }: { result: MatchResult; lang: string }) {
  const s = result.scholarship
  const name = lang === 'en' && s.name_en ? s.name_en : s.name_th
  const funder = lang === 'en' && s.funder_name_en ? s.funder_name_en : (s.funder_name_th ?? '—')
  const reasons = lang === 'en' ? result.reasons_en : result.reasons
  const rawPct = Math.round(result.raw_score * 100)
  const fairPct = Math.round(result.fairness_score * 100)

  return (
    <div className="bg-white dark:bg-[#2C2C2E] rounded-2xl p-5 border border-gray-100 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start gap-3 mb-3">
        {/* Rank badge */}
        <div className="flex-shrink-0 w-9 h-9 rounded-full bg-[#F0A500] text-white text-sm font-bold flex items-center justify-center">
          #{result.rank}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-[#1D1D1F] dark:text-white text-sm leading-snug line-clamp-2">{name}</h3>
          <p className="text-xs text-[#6E6E73] dark:text-gray-400 mt-0.5">{funder}</p>
        </div>
        {result.fairness_boosted && (
          <Pill color="green">⚖️ {lang === 'en' ? 'Fairness adjusted' : 'ปรับความยุติธรรมแล้ว'}</Pill>
        )}
      </div>

      {/* Score bar */}
      <div className="mb-3">
        <div className="flex justify-between text-xs text-[#6E6E73] dark:text-gray-400 mb-1">
          <span>{lang === 'en' ? 'Match score' : 'คะแนนตรงกัน'}</span>
          <span className="font-semibold text-[#F0A500]">{fairPct}%</span>
        </div>
        <ScoreBar pct={fairPct} />
      </div>

      {/* Raw vs fairness score if boosted */}
      {result.fairness_boosted && (
        <div className="mb-3 text-xs bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 rounded-lg px-3 py-2 border border-emerald-100 dark:border-emerald-800">
          {lang === 'en'
            ? `Original score: ${rawPct}% → After fairness: ${fairPct}%`
            : `คะแนนเดิม: ${rawPct}% → หลังปรับ: ${fairPct}%`}
        </div>
      )}

      {/* Reasons */}
      {reasons.length > 0 && (
        <ul className="space-y-1">
          {reasons.slice(0, 3).map((r, i) => (
            <li key={i} className="flex items-start gap-1.5 text-xs text-[#6E6E73] dark:text-gray-400">
              <span className="text-emerald-500 mt-0.5 flex-shrink-0">✓</span>
              <span>{r}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Tier badge */}
      {s.tier && (
        <div className="mt-3 flex gap-2">
          <Pill color={s.tier === 'SAFETY' ? 'green' : s.tier === 'TARGET' ? 'gold' : 'blue'}>
            {s.tier}
          </Pill>
          {s.amount_thb && (
            <Pill color="gray">฿{s.amount_thb.toLocaleString()}</Pill>
          )}
        </div>
      )}
    </div>
  )
}

// ── Mini rank row for Section 4 ───────────────────────────────────────────────
function RankRow({
  rank,
  name,
  pct,
  changed,
}: {
  rank: number
  name: string
  pct: number
  changed: boolean
}) {
  return (
    <div
      className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-colors ${
        changed
          ? 'bg-[#F0A500]/10 dark:bg-[#F0A500]/10 border border-[#F0A500]/30'
          : 'bg-gray-50 dark:bg-gray-800/50'
      }`}
    >
      <span
        className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold ${
          changed ? 'bg-[#F0A500] text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
        }`}
      >
        {rank}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-[#1D1D1F] dark:text-white truncate">{name}</p>
        <ScoreBar pct={pct} gold={changed} />
      </div>
      <span className="text-xs font-semibold text-[#6E6E73] dark:text-gray-400 flex-shrink-0">{pct}%</span>
    </div>
  )
}

// ── Technical details section ─────────────────────────────────────────────────
function TechnicalDetails({ results, lang }: { results: MatchResult[]; lang: string }) {
  const [open, setOpen] = useState(false)

  return (
    <section className="max-w-4xl mx-auto">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between bg-white dark:bg-[#2C2C2E] border border-gray-100 dark:border-gray-700 rounded-2xl px-6 py-4 text-left hover:bg-gray-50 dark:hover:bg-[#3A3A3C] transition-colors"
        aria-expanded={open}
      >
        <span className="font-semibold text-[#1D1D1F] dark:text-white">
          {lang === 'en' ? 'Technical Details' : 'รายละเอียดทางเทคนิค / Technical Details'}
        </span>
        <span className="text-[#F0A500] text-lg">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="mt-3 bg-white dark:bg-[#2C2C2E] border border-gray-100 dark:border-gray-700 rounded-2xl px-6 py-6 space-y-6">
          {/* Algorithm */}
          <div>
            <h4 className="text-xs font-semibold text-[#6E6E73] dark:text-gray-400 uppercase tracking-wide mb-2">
              Algorithm
            </h4>
            <p className="text-sm text-[#1D1D1F] dark:text-white font-medium">Equalized Odds Post-Processing</p>
            <p className="text-xs text-[#6E6E73] dark:text-gray-400 mt-1">
              Scores are adjusted so that among qualified students, recommendation rates are equal across demographic groups (Hardt et al., 2016).
            </p>
          </div>

          {/* Citation */}
          <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 border-l-4 border-[#F0A500]">
            <p className="text-xs font-mono text-[#6E6E73] dark:text-gray-300 leading-relaxed">
              Hardt, M., Price, E., &amp; Srebro, N. (2016).{' '}
              <em>Equality of Opportunity in Supervised Learning.</em>{' '}
              Advances in Neural Information Processing Systems (NeurIPS), 29, 3315–3323.{' '}
              <span className="text-[#F0A500]">arXiv:1610.02413</span>
            </p>
          </div>

          {/* Protected attributes */}
          <div>
            <h4 className="text-xs font-semibold text-[#6E6E73] dark:text-gray-400 uppercase tracking-wide mb-2">
              Protected Attributes
            </h4>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-[#1D1D1F] dark:text-white">
                <span className="text-[#F0A500]">◆</span>
                ภาค: ภาคตะวันออกเฉียงเหนือ (20 จังหวัด) / Region: Northeast Thailand (20 provinces)
              </div>
              <div className="flex items-center gap-2 text-sm text-[#1D1D1F] dark:text-white">
                <span className="text-[#F0A500]">◆</span>
                รายได้: Brackets 1–3 ({'< '}฿15,000/month) — both conditions required to trigger correction
              </div>
            </div>
          </div>

          {/* Correction method */}
          <div>
            <h4 className="text-xs font-semibold text-[#6E6E73] dark:text-gray-400 uppercase tracking-wide mb-2">
              Correction Method
            </h4>
            <p className="text-sm text-[#1D1D1F] dark:text-white">
              Multiplicative reweighting — max 2× boost. Bias score 0.5 → correction 1.0 (neutral). Bias score 0.9 → correction 1.24.
            </p>
          </div>

          {/* Per-scholarship table */}
          {results.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-[#6E6E73] dark:text-gray-400 uppercase tracking-wide mb-3">
                Per-Scholarship Correction Applied (Top 20)
              </h4>
              <div className="overflow-x-auto rounded-xl border border-gray-100 dark:border-gray-700">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-800/70 text-[#6E6E73] dark:text-gray-400">
                      <th className="text-left px-3 py-2 font-semibold">ทุน / Scholarship</th>
                      <th className="text-center px-3 py-2 font-semibold">Bias Score</th>
                      <th className="text-center px-3 py-2 font-semibold">Correction ×</th>
                      <th className="text-center px-3 py-2 font-semibold">Raw</th>
                      <th className="text-center px-3 py-2 font-semibold">Fairness</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {results.map((r) => {
                      const s = r.scholarship
                      const name = lang === 'en' && s.name_en ? s.name_en : s.name_th
                      return (
                        <tr
                          key={s.id}
                          className={r.fairness_boosted ? 'bg-emerald-50/60 dark:bg-emerald-900/10' : ''}
                        >
                          <td className="px-3 py-2 text-[#1D1D1F] dark:text-white max-w-[180px]">
                            <span className="line-clamp-1">{name}</span>
                          </td>
                          <td className="px-3 py-2 text-center text-[#6E6E73] dark:text-gray-400">
                            {(s.historical_bias_score ?? 0.5).toFixed(2)}
                          </td>
                          <td className="px-3 py-2 text-center font-mono">
                            <span className={r.fairness_boosted ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-[#6E6E73] dark:text-gray-400'}>
                              {r.correction_applied.toFixed(3)}×
                            </span>
                          </td>
                          <td className="px-3 py-2 text-center text-[#6E6E73] dark:text-gray-400">
                            {Math.round(r.raw_score * 100)}%
                          </td>
                          <td className="px-3 py-2 text-center font-semibold text-[#F0A500]">
                            {Math.round(r.fairness_score * 100)}%
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function DemoPage() {
  const { lang } = useLang()
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<MatchResult[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'all' | 'boosted'>('all')

  const runMatching = async () => {
    if (loading) return
    setLoading(true)
    setError(null)
    console.log('[TunDee Demo] Starting matching for Ploy profile', PLOY_PROFILE)

    try {
      const raw = await getScholarships()
      console.log('[TunDee Demo] Fetched scholarships from Supabase:', raw.length)

      const rows = toScholarshipRows(raw)
      const matched = getMatchedScholarships(rows, PLOY_PROFILE)
      console.log('[TunDee Demo] Matching complete. Results:', matched.length, 'Boosted:', matched.filter((r) => r.fairness_boosted).length)

      setResults(matched)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      console.error('[TunDee Demo] Matching failed:', msg)
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  // Fairness demo lists
  const top5ByRaw = results
    ? [...results].sort((a, b) => b.raw_score - a.raw_score).slice(0, 5)
    : []
  const top5ByFair = results
    ? [...results].sort((a, b) => b.fairness_score - a.fairness_score).slice(0, 5)
    : []

  // IDs that appear in different positions
  const rawIds = top5ByRaw.map((r) => r.scholarship.id)
  const fairIds = top5ByFair.map((r) => r.scholarship.id)
  const changedIds = new Set([
    ...rawIds.filter((id, i) => fairIds.indexOf(id) !== i),
    ...fairIds.filter((id, i) => rawIds.indexOf(id) !== i),
  ])

  const boostedCount = results ? results.filter((r) => r.fairness_boosted).length : 0

  const displayResults = results
    ? activeTab === 'boosted'
      ? results.filter((r) => r.fairness_boosted)
      : results
    : []

  return (
    <div className="min-h-screen bg-[#F5F5F7] dark:bg-[#1C1C1E]">
      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <header className="bg-[#1D1D1F] dark:bg-[#000000] text-white px-6 py-12 text-center">
        <div className="max-w-3xl mx-auto space-y-4">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Pill color="gold">NSC 2026 Demo</Pill>
            <Pill color="gray">ประเภทที่ 22 — โปรแกรมเพื่อส่งเสริมการเรียนรู้</Pill>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mt-3">
            TunDee ทุนดี — Live Demo
          </h1>
          <p className="text-gray-400 text-sm sm:text-base leading-relaxed max-w-2xl mx-auto">
            AI-powered scholarship matching with Fairness-Aware Ranking
            <br className="hidden sm:block" />
            <span className="text-gray-500 text-xs sm:text-sm">
              (Hardt, Price &amp; Srebro, NeurIPS 2016)
            </span>
          </p>
          <p className="text-gray-500 text-xs mt-1">
            การแข่งขันพัฒนาโปรแกรมคอมพิวเตอร์แห่งชาติ ครั้งที่ 28 (NSC 2026)
          </p>
        </div>
      </header>

      <main className="px-4 py-10 space-y-10">
        {/* ── SECTION 1 — Ploy's Profile ───────────────────────────────────── */}
        <section className="max-w-2xl mx-auto">
          <div className="bg-white dark:bg-[#2C2C2E] rounded-2xl border border-gray-100 dark:border-gray-700 p-6 shadow-sm">
            <h2 className="text-lg font-bold text-[#1D1D1F] dark:text-white mb-1">
              🎓 สถานการณ์: พลอย / Scenario: Ploy
            </h2>
            <p className="text-xs text-[#6E6E73] dark:text-gray-400 mb-5">
              นักเรียน ม.6 พ่อแม่ชาวนา อ.เมืองสุรินทร์ / Grade 12 student, rice farmer parents, Surin
            </p>

            <div className="flex flex-wrap gap-2">
              <Pill color="gold">GPA: 3.4</Pill>
              <Pill color="gray">จ.สุรินทร์ (ภาคอีสาน)</Pill>
              <Pill color="gray">รายได้ {'<'} ฿10k/เดือน</Pill>
              <Pill color="blue">สาขา: Medicine / Science</Pill>
              <Pill color="green">บัตรสวัสดิการ ✓</Pill>
              <Pill color="gray">ม.6 / M6</Pill>
            </div>

            <div className="mt-5 bg-[#F5F5F7] dark:bg-gray-800/40 rounded-xl p-4 grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs text-[#6E6E73] dark:text-gray-400">
              <div><span className="font-semibold text-[#1D1D1F] dark:text-white">Province ID</span><br/>TH-32 · สุรินทร์</div>
              <div><span className="font-semibold text-[#1D1D1F] dark:text-white">Income bracket</span><br/>2 (฿5,001–10,000/mo)</div>
              <div><span className="font-semibold text-[#1D1D1F] dark:text-white">Demographic group</span><br/><span className="text-amber-600 dark:text-amber-400 font-medium">Disadvantaged (A=1)</span></div>
            </div>
          </div>
        </section>

        {/* ── SECTION 2 — Run Matching button ─────────────────────────────── */}
        <section className="max-w-2xl mx-auto text-center">
          {error && (
            <div className="mb-5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 rounded-xl px-5 py-3 text-sm">
              {lang === 'en' ? 'Error: ' : 'เกิดข้อผิดพลาด: '}{error}
            </div>
          )}

          <button
            onClick={runMatching}
            disabled={loading}
            className="inline-flex items-center gap-3 bg-[#F0A500] hover:bg-[#D4920A] disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-base px-8 py-4 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-200 active:scale-95"
          >
            {loading ? (
              <>
                <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                {lang === 'en' ? 'Matching…' : 'กำลังค้นหา…'}
              </>
            ) : (
              <>
                {lang === 'en' ? "Show Ploy's Matches →" : 'ดูทุนที่ตรงกับพลอย → / Show Ploy\'s Matches →'}
              </>
            )}
          </button>

          {loading && <LoadingSpinner />}
        </section>

        {/* ── SECTION 3 — Match Results ────────────────────────────────────── */}
        {results !== null && !loading && (
          <section className="max-w-4xl mx-auto space-y-6">
            {/* Count header */}
            <div className="text-center">
              <p className="text-xl font-bold text-[#1D1D1F] dark:text-white">
                {lang === 'en'
                  ? `Found ${results.length} matching scholarships`
                  : `พบ ${results.length} ทุนที่ตรงกับโปรไฟล์ / Found ${results.length} matching scholarships`}
              </p>
              <p className="text-sm text-[#6E6E73] dark:text-gray-400 mt-1">
                {lang === 'en'
                  ? `${boostedCount} scholarships received fairness boost`
                  : `${boostedCount} ทุนได้รับการปรับความยุติธรรม`}
              </p>
            </div>

            {/* Sub-tabs */}
            <div className="flex justify-center gap-2">
              <button
                onClick={() => setActiveTab('all')}
                className={`px-5 py-2 rounded-full text-sm font-medium transition-colors ${
                  activeTab === 'all'
                    ? 'bg-[#F0A500] text-white shadow'
                    : 'bg-white dark:bg-[#2C2C2E] text-[#6E6E73] dark:text-gray-300 border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-[#3A3A3C]'
                }`}
              >
                {lang === 'en' ? 'All Results' : 'ผลลัพธ์ทั้งหมด / All Results'}
              </button>
              <button
                onClick={() => setActiveTab('boosted')}
                className={`px-5 py-2 rounded-full text-sm font-medium transition-colors ${
                  activeTab === 'boosted'
                    ? 'bg-emerald-600 text-white shadow'
                    : 'bg-white dark:bg-[#2C2C2E] text-[#6E6E73] dark:text-gray-300 border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-[#3A3A3C]'
                }`}
              >
                {lang === 'en' ? `Fairness Boosted (${boostedCount})` : `ปรับความยุติธรรม / Fairness Boosted (${boostedCount})`}
              </button>
            </div>

            {/* Cards grid */}
            {displayResults.length === 0 ? (
              <p className="text-center text-[#6E6E73] dark:text-gray-400 py-8 text-sm">
                {lang === 'en' ? 'No results for this filter.' : 'ไม่มีผลลัพธ์สำหรับตัวกรองนี้'}
              </p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {displayResults.map((r) => (
                  <MatchCard key={r.scholarship.id} result={r} lang={lang} />
                ))}
              </div>
            )}
          </section>
        )}

        {/* ── SECTION 4 — Fairness Demonstration ──────────────────────────── */}
        {results !== null && !loading && top5ByRaw.length > 0 && (
          <section className="max-w-4xl mx-auto space-y-4">
            <div className="text-center">
              <h2 className="text-xl font-bold text-[#1D1D1F] dark:text-white">
                {lang === 'en' ? 'Fairness Demonstration' : 'การสาธิตความยุติธรรม / Fairness Demonstration'}
              </h2>
              <p className="text-sm text-[#6E6E73] dark:text-gray-400 mt-1">
                {lang === 'en'
                  ? `Scholarships boosted: ${boostedCount}`
                  : `ทุนที่ได้รับการ boost: ${boostedCount} ทุน / Scholarships boosted: ${boostedCount}`}
              </p>
            </div>

            <div className="grid sm:grid-cols-2 gap-6">
              {/* LEFT — Before */}
              <div className="bg-white dark:bg-[#2C2C2E] rounded-2xl p-5 border border-gray-100 dark:border-gray-700 shadow-sm">
                <h3 className="font-semibold text-[#1D1D1F] dark:text-white text-sm mb-4 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-gray-400 inline-block" />
                  {lang === 'en' ? 'Before — Raw Score' : 'ก่อนปรับ / Before'}
                </h3>
                <div className="space-y-2">
                  {top5ByRaw.map((r, i) => {
                    const name = lang === 'en' && r.scholarship.name_en ? r.scholarship.name_en : r.scholarship.name_th
                    return (
                      <RankRow
                        key={r.scholarship.id}
                        rank={i + 1}
                        name={name}
                        pct={Math.round(r.raw_score * 100)}
                        changed={changedIds.has(r.scholarship.id)}
                      />
                    )
                  })}
                </div>
              </div>

              {/* RIGHT — After */}
              <div className="bg-white dark:bg-[#2C2C2E] rounded-2xl p-5 border border-gray-100 dark:border-gray-700 shadow-sm">
                <h3 className="font-semibold text-[#1D1D1F] dark:text-white text-sm mb-4 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#F0A500] inline-block" />
                  {lang === 'en' ? 'After — Fairness Score' : 'หลังปรับ / After (Fairness)'}
                </h3>
                <div className="space-y-2">
                  {top5ByFair.map((r, i) => {
                    const name = lang === 'en' && r.scholarship.name_en ? r.scholarship.name_en : r.scholarship.name_th
                    return (
                      <RankRow
                        key={r.scholarship.id}
                        rank={i + 1}
                        name={name}
                        pct={Math.round(r.fairness_score * 100)}
                        changed={changedIds.has(r.scholarship.id)}
                      />
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Legend */}
            <p className="text-xs text-center text-[#6E6E73] dark:text-gray-400">
              <span className="inline-block w-3 h-3 rounded bg-[#F0A500]/30 border border-[#F0A500]/40 mr-1 align-middle" />
              {lang === 'en' ? 'Gold highlight = rank changed after fairness correction' : 'สีทอง = ลำดับเปลี่ยนหลังปรับความยุติธรรม'}
            </p>
          </section>
        )}

        {/* ── SECTION 5 — Technical Details ───────────────────────────────── */}
        {results !== null && !loading && (
          <TechnicalDetails results={results} lang={lang} />
        )}

        {/* ── SECTION 6 — Tech Stack ───────────────────────────────────────── */}
        <section className="max-w-4xl mx-auto">
          <h2 className="text-xl font-bold text-[#1D1D1F] dark:text-white text-center mb-6">
            {lang === 'en' ? 'Tech Stack' : 'เทคโนโลยีที่ใช้ / Tech Stack'}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {[
              { name: 'Next.js 14', sub: 'App Router · Server & Client Components', icon: '▲' },
              { name: 'Supabase PostgreSQL', sub: 'Row-Level Security · Real-time', icon: '⚡' },
              { name: 'Tailwind CSS + TypeScript', sub: 'Type-safe · Responsive', icon: '🎨' },
              { name: 'Equalized Odds', sub: 'Hardt et al. 2016 · NeurIPS', icon: '⚖️' },
              { name: 'Vercel Edge Network', sub: 'Global CDN · Zero cold-start', icon: '🌐' },
              { name: 'Google OAuth + Email Auth', sub: 'Supabase Auth · JWT', icon: '🔐' },
            ].map((t) => (
              <div
                key={t.name}
                className="bg-white dark:bg-[#2C2C2E] rounded-2xl p-4 border border-gray-100 dark:border-gray-700 shadow-sm flex flex-col gap-1"
              >
                <span className="text-2xl">{t.icon}</span>
                <p className="font-semibold text-sm text-[#1D1D1F] dark:text-white">{t.name}</p>
                <p className="text-xs text-[#6E6E73] dark:text-gray-400">{t.sub}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* ── FOOTER ─────────────────────────────────────────────────────────── */}
      <footer className="text-center py-8 px-4 border-t border-gray-200 dark:border-gray-700 mt-6 space-y-2">
        <p className="text-xs text-[#6E6E73] dark:text-gray-500">
          Built for NSC 2026 by Jenissa Vichiansin (เจนิสาศ์ วิเชียรสินธุ์) — Grade 11, ISB ·{' '}
          <a href="https://www.tundee.org" className="text-[#F0A500] hover:underline" target="_blank" rel="noopener noreferrer">
            tundee.org
          </a>
        </p>
        <p className="text-xs text-[#6E6E73] dark:text-gray-500">
          <a
            href="https://github.com/jenissavichiansin/tundee"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#F0A500] hover:underline"
          >
            View source on GitHub →
          </a>
        </p>
      </footer>
    </div>
  )
}

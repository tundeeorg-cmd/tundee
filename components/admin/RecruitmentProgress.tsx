'use client';

/**
 * Recruitment readout for /admin (brief §2C, PREREG §8).
 *
 * ENROLLMENT COUNTS ONLY. There is deliberately no apply rate, no conversion
 * by arm, and no award count anywhere in this component — and no way to add one
 * without also changing the API route and the database view behind it, neither
 * of which carries outcome data.
 *
 * The reason is not squeamishness. Watching outcomes by arm while a trial is
 * running is how a researcher talks themselves into stopping on a good-looking
 * split, and that inflates the false positive rate. This panel exists so
 * recruitment can be steered — "we are short of low-income Isan students" —
 * without anyone learning anything about the effect.
 */

import { useEffect, useState } from 'react';

interface Cell {
  region_group: string | null;
  income_bracket: number | null;
  ranking_variant: string | null;
  recruitment_source: string | null;
  is_target_population: boolean | null;
  enrolled: number;
}

interface Progress {
  targetPopulation: {
    baseline: number;
    fairness_adjusted: number;
    targetPerArm: number;
    percentComplete: number;
  };
  cells: Cell[];
  byRecruitmentSource: Record<string, number>;
  totalRandomized: number;
}

const REGION_LABEL: Record<string, string> = {
  northeast:     'อีสาน (Northeast)',
  bangkok_metro: 'กรุงเทพฯ ปริมณฑล',
  other:         'อื่น ๆ',
};

const INCOME_LABEL: Record<number, string> = {
  1: '< ฿5k', 2: '฿5–10k', 3: '฿10–15k', 4: '฿15–20k',
  5: '฿20–30k', 6: '฿30–50k', 7: '> ฿50k',
};

export default function RecruitmentProgress() {
  const [data, setData]   = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/recruitment')
      .then(async (r) => {
        if (r.status === 503) {
          // A missing view means the migrations have not run. Say that, rather
          // than rendering zeros that look like nobody has enrolled.
          throw new Error('ยังไม่ได้รัน migration v16/v17 — ยังไม่มี v_recruitment_progress');
        }
        if (!r.ok) throw new Error('ดึงข้อมูลไม่สำเร็จ');
        return r.json();
      })
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, []);

  if (error) {
    return (
      <div className="rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
        {error}
      </div>
    );
  }

  if (!data) {
    return <div className="text-sm text-[#6e6e73] dark:text-[#8e8e93]">กำลังโหลด…</div>;
  }

  const { baseline, fairness_adjusted, targetPerArm, percentComplete } = data.targetPopulation;

  // Only cells with someone in them, so empty strata do not pad the table.
  const populated = data.cells
    .filter((c) => c.enrolled > 0)
    .sort((a, b) =>
      (a.region_group ?? '').localeCompare(b.region_group ?? '') ||
      (a.income_bracket ?? 0) - (b.income_bracket ?? 0));

  return (
    <section className="space-y-6">
      <header>
        <h2 className="text-lg font-bold text-[#1D1D1F] dark:text-[#F5F5F7]">
          ความคืบหน้าการรับสมัคร (Recruitment)
        </h2>
        <p className="mt-1 text-xs text-[#6e6e73] dark:text-[#8e8e93]">
          จำนวนผู้เข้าร่วมเท่านั้น — ไม่แสดงผลลัพธ์รายกลุ่ม จนกว่าจะถึงวันปิดรับข้อมูล 31 ม.ค. 2027
        </p>
      </header>

      {/* Progress against the pre-registered target */}
      <div className="rounded-xl border border-[#e0e0e0] dark:border-[#3a3a3c] p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#6e6e73] dark:text-[#8e8e93]">
          กลุ่มเป้าหมายหลัก · อีสาน &amp; รายได้ ≤ ฿15k
        </p>

        <div className="mt-3 grid grid-cols-2 gap-4">
          {([['baseline', baseline], ['fairness_adjusted', fairness_adjusted]] as const).map(
            ([label, n]) => (
              <div key={label}>
                <p className="text-xs text-[#6e6e73] dark:text-[#8e8e93]">{label}</p>
                <p className="text-2xl font-bold text-[#1D1D1F] dark:text-[#F5F5F7] tabular-nums">
                  {n}
                  <span className="text-sm font-normal text-[#8e8e93]"> / {targetPerArm}</span>
                </p>
              </div>
            ),
          )}
        </div>

        <div className="mt-4 h-2 rounded-full bg-[#E5E5EA] dark:bg-[#3a3a3c] overflow-hidden">
          <div
            className="h-full rounded-full bg-[#1B3A6B] transition-all"
            style={{ width: `${Math.min(100, percentComplete)}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-[#6e6e73] dark:text-[#8e8e93]">
          {percentComplete}% ของเป้าหมาย — คิดจากแขนที่น้อยกว่า เพราะต้องได้ครบ {targetPerArm} ทั้งสองแขน
        </p>
      </div>

      {/* Crosstab — counts only */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-[#6e6e73] dark:text-[#8e8e93]">
              <th className="py-2 pr-4">ภูมิภาค</th>
              <th className="py-2 pr-4">รายได้</th>
              <th className="py-2 pr-4">แขน</th>
              <th className="py-2 pr-4 text-right">จำนวน</th>
            </tr>
          </thead>
          <tbody>
            {populated.length === 0 && (
              <tr>
                <td colSpan={4} className="py-4 text-center text-[#8e8e93]">
                  ยังไม่มีผู้เข้าร่วมที่สุ่มแขนแล้ว
                </td>
              </tr>
            )}
            {populated.map((c, i) => (
              <tr
                key={i}
                className={`border-t border-[#e0e0e0] dark:border-[#3a3a3c] ${
                  c.is_target_population ? 'bg-[#EBF2FF]/50 dark:bg-[#162552]/40' : ''
                }`}
              >
                <td className="py-2 pr-4">{REGION_LABEL[c.region_group ?? ''] ?? c.region_group ?? '—'}</td>
                <td className="py-2 pr-4">{INCOME_LABEL[c.income_bracket ?? 0] ?? '—'}</td>
                <td className="py-2 pr-4">{c.ranking_variant ?? '—'}</td>
                <td className="py-2 pr-4 text-right tabular-nums">{c.enrolled}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Recruitment source — HOW they were reached, not WHO they are */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-[#6e6e73] dark:text-[#8e8e93] mb-2">
          ช่องทางที่เข้ามา (recruitment_source)
        </p>
        <div className="flex flex-wrap gap-3">
          {Object.entries(data.byRecruitmentSource).sort((a, b) => b[1] - a[1]).map(([src, n]) => (
            <span
              key={src}
              className="rounded-lg border border-[#e0e0e0] dark:border-[#3a3a3c] px-3 py-1.5 text-xs"
            >
              {src} <span className="font-bold tabular-nums">{n}</span>
            </span>
          ))}
          {Object.keys(data.byRecruitmentSource).length === 0 && (
            <span className="text-xs text-[#8e8e93]">—</span>
          )}
        </div>
        <p className="mt-2 text-xs text-[#8e8e93]">
          ช่องทางโฆษณา ≠ ภูมิภาคของผู้เรียน — นักเรียนขอนแก่นที่กดโฆษณากรุงเทพฯ
          นับเป็น northeast / bkk_2026
        </p>
      </div>

      <p className="text-xs text-[#8e8e93]">
        รวมผู้ที่สุ่มแขนแล้วทั้งหมด {data.totalRandomized} คน (ไม่รวม pilot cohort)
      </p>
    </section>
  );
}

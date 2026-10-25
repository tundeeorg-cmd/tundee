'use client';

/**
 * /admin/funnel — where visitors drop out, for the last 7 and 30 days.
 *
 * Totals only. This page never shows anything split by ranking_variant or ab_arm,
 * and must not: outcome-by-arm interfaces are forbidden before the pre-registered
 * stopping point (PREREG §8, §12.8).
 *
 * Access: NEXT_PUBLIC_ADMIN_EMAIL, enforced again by /api/admin/funnel.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { FunnelRow } from '@/lib/admin/funnel';

type Windows = Record<'d7' | 'd30', FunnelRow[]>;
type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; windows: Windows; generatedAt: string };

const pct = (v: number | null) => (v === null ? '–' : `${Math.round(v * 100)}%`);
const num = (v: number | null) => (v === null ? '–' : v.toLocaleString('th-TH'));

function Table({ title, rows }: { title: string; rows: FunnelRow[] }) {
  return (
    <section className="mb-10">
      <h2 className="text-lg font-bold mb-3">{title}</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left border-b border-[#E8ECF2] dark:border-[#1A2E4A]">
              <th className="py-2 pr-3">ขั้น</th>
              <th className="py-2 pr-3 text-right">จำนวน</th>
              <th className="py-2 pr-3 text-right">ของขั้นก่อนหน้า</th>
              <th className="py-2 pr-3 text-right">หลุดจากขั้นก่อน</th>
              <th className="py-2 text-right">ของขั้นแรก</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b border-[#F0F3F8] dark:border-[#12233A]">
                <td className="py-2 pr-3">{r.th}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{num(r.count)}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{pct(r.ofPrevious)}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{pct(r.droppedFromPrevious)}</td>
                <td className="py-2 text-right tabular-nums">{pct(r.ofFirst)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function AdminFunnelPage() {
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    const supabase = createClient();
    const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL;
    let cancelled = false;

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) { router.replace('/auth'); return; }
      if (!adminEmail || data.session.user.email !== adminEmail) { router.replace('/'); return; }

      try {
        const res = await fetch('/api/admin/funnel', { cache: 'no-store' });
        const body = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok) {
          setState({ kind: 'error', message: body?.hint ?? body?.error ?? `HTTP ${res.status}` });
          return;
        }
        setState({ kind: 'ready', windows: body.windows, generatedAt: body.generated_at });
      } catch {
        if (!cancelled) setState({ kind: 'error', message: 'เชื่อมต่อไม่สำเร็จ' });
      }
    })();

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="max-w-[900px] mx-auto px-4 py-8 text-[#0A2342] dark:text-[#E8EDF5]" style={{ fontFamily: "'Sarabun', system-ui, sans-serif" }}>
      <h1 className="text-2xl font-bold mb-1">กรวยผู้ใช้ (Funnel)</h1>
      <p className="text-sm text-[#6E7A8A] dark:text-[#8e9bb0] mb-6">
        นับเป็น session ของเบราว์เซอร์ (หนึ่งแท็บ = หนึ่ง session) ขั้นต่างๆ นับแยกกัน
        จึงอาจเกิน 100% ได้ เช่น คนสมัครโดยไม่ผ่านการเลื่อนดู หรือกลับมาจากอีกเครื่อง
        หน้านี้แสดงยอดรวมเท่านั้น ไม่แยกตามกลุ่มทดลอง
      </p>

      {state.kind === 'loading' && <p role="status">กำลังโหลด…</p>}
      {state.kind === 'error' && (
        <p role="alert" className="text-red-600 dark:text-red-400">โหลดไม่สำเร็จ: {state.message}</p>
      )}
      {state.kind === 'ready' && (
        <>
          <Table title="7 วันล่าสุด" rows={state.windows.d7} />
          <Table title="30 วันล่าสุด" rows={state.windows.d30} />
          <p className="text-xs text-[#6E7A8A] dark:text-[#8e9bb0]">
            คำนวณเมื่อ {new Date(state.generatedAt).toLocaleString('th-TH')} ·
            "กลับมาใช้งานอีกวัน" นับจากบัญชีที่มีกิจกรรมในวันหลังจากวันแรกที่มีกิจกรรม
          </p>
        </>
      )}
    </main>
  );
}

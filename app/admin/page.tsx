'use client';

/**
 * /admin — Scholarship management dashboard.
 * Protected by NEXT_PUBLIC_ADMIN_EMAIL env variable.
 * Allows toggling scholarships active/inactive and adding new ones.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Scholarship, FunderType, AmountType } from '@/lib/types';

type Tab = 'list' | 'add';
type SortField = 'created_at' | 'amount_thb' | 'name_th';

const FUNDER_TYPES: FunderType[] = ['government', 'corporate', 'foundation', 'royal', 'university'];
const AMOUNT_TYPES: AmountType[] = ['annual', 'monthly', 'one-time'];

function Spinner({ size = 5 }: { size?: number }) {
  return (
    <svg className={`animate-spin w-${size} h-${size}`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

const EMPTY_FORM = {
  name_th: '',
  name_en: '',
  funder_name_th: '',
  funder_name_en: '',
  funder_type: 'government' as FunderType,
  amount_thb: '',
  amount_type: 'annual' as AmountType,
  min_gpa: '',
  max_income_thb: '',
  field_of_study: '',      // comma-separated
  province_restriction: '', // comma-separated
  welfare_card_priority: false,
  deadline_date: '',
  application_url: '',
  documents_required: '',  // comma-separated
  description_th: '',
  description_en: '',
  historical_bias_score: '0.5',
  grade_levels: '',        // comma-separated: M4,M5,M6,uni,graduate
};

export default function AdminPage() {
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [tab, setTab] = useState<Tab>('list');

  // List state
  const [scholarships, setScholarships] = useState<Scholarship[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all');
  const [search, setSearch] = useState('');
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Add form state
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [saveError, setSaveError] = useState('');

  // Auth + admin check
  useEffect(() => {
    const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL;
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.replace('/auth');
        return;
      }
      if (adminEmail && data.session.user.email !== adminEmail) {
        router.replace('/');
        return;
      }
      setAuthorized(true);
      setLoading(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load scholarships
  useEffect(() => {
    if (!authorized) return;
    fetchScholarships();
  }, [authorized]);

  async function fetchScholarships() {
    setListLoading(true);
    const { data } = await supabase
      .from('scholarships')
      .select('*')
      .order(sortField, { ascending: sortField === 'name_th' });
    setScholarships((data as Scholarship[]) ?? []);
    setListLoading(false);
  }

  useEffect(() => {
    if (authorized) fetchScholarships();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortField]);

  async function toggleActive(s: Scholarship) {
    setTogglingId(s.id);
    await supabase
      .from('scholarships')
      .update({ is_active: !s.is_active })
      .eq('id', s.id);
    setScholarships(prev =>
      prev.map(x => x.id === s.id ? { ...x, is_active: !x.is_active } : x)
    );
    setTogglingId(null);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaveError('');
    setSaveMsg('');
    if (!form.name_th.trim()) { setSaveError('Name (Thai) is required.'); return; }
    setSaving(true);

    const parseArr = (s: string) => s.split(',').map(x => x.trim()).filter(Boolean);
    const parseNum = (s: string) => s === '' ? null : parseFloat(s);

    const payload = {
      name_th: form.name_th.trim(),
      name_en: form.name_en.trim() || null,
      funder_name_th: form.funder_name_th.trim() || null,
      funder_name_en: form.funder_name_en.trim() || null,
      funder_type: form.funder_type,
      amount_thb: parseNum(form.amount_thb),
      amount_type: form.amount_type,
      min_gpa: parseNum(form.min_gpa),
      max_income_thb: parseNum(form.max_income_thb),
      field_of_study: form.field_of_study ? parseArr(form.field_of_study) : null,
      province_restriction: form.province_restriction ? parseArr(form.province_restriction) : null,
      welfare_card_priority: form.welfare_card_priority,
      deadline_date: form.deadline_date || null,
      application_url: form.application_url.trim() || null,
      documents_required: form.documents_required ? parseArr(form.documents_required) : null,
      description_th: form.description_th.trim() || null,
      description_en: form.description_en.trim() || null,
      historical_bias_score: parseNum(form.historical_bias_score) ?? 0.5,
      grade_levels: form.grade_levels ? parseArr(form.grade_levels) : null,
      is_active: true,
    };

    const { error } = await supabase.from('scholarships').insert(payload);
    if (error) {
      setSaveError(error.message);
    } else {
      setSaveMsg(`✓ "${form.name_th}" added successfully.`);
      setForm(EMPTY_FORM);
      fetchScholarships();
    }
    setSaving(false);
  }

  const filtered = scholarships
    .filter(s => {
      if (filterActive === 'active' && !s.is_active) return false;
      if (filterActive === 'inactive' && s.is_active) return false;
      if (search) {
        const q = search.toLowerCase();
        return s.name_th.toLowerCase().includes(q) ||
          (s.name_en ?? '').toLowerCase().includes(q) ||
          (s.funder_name_th ?? '').toLowerCase().includes(q);
      }
      return true;
    });

  if (loading) {
    return (
      <main className="min-h-screen bg-[#F5F5F7] flex items-center justify-center">
        <Spinner size={8} />
      </main>
    );
  }

  if (!authorized) return null;

  const activeCount = scholarships.filter(s => s.is_active).length;
  const inactiveCount = scholarships.length - activeCount;

  return (
    <main className="min-h-screen bg-[#F5F5F7] pt-20 pb-16">
      <div className="max-w-5xl mx-auto px-4">

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-1">
            <span className="text-2xl">⚙️</span>
            <h1 className="text-2xl font-semibold text-[#1D1D1F]">Admin Dashboard</h1>
          </div>
          <p className="text-sm text-[#6E6E73]">Manage TunDee scholarship data</p>

          {/* Stats */}
          <div className="flex gap-4 mt-4">
            {[
              { label: 'Total', value: scholarships.length, color: 'bg-[#F5F5F7] text-[#1D1D1F]' },
              { label: 'Active', value: activeCount, color: 'bg-green-50 text-green-700' },
              { label: 'Inactive', value: inactiveCount, color: 'bg-red-50 text-red-600' },
            ].map(stat => (
              <div key={stat.label} className={`px-4 py-2 rounded-xl border border-[#E5E5EA] ${stat.color}`}>
                <div className="text-lg font-semibold">{stat.value}</div>
                <div className="text-xs">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex rounded-xl bg-white border border-[#E5E5EA] p-1 w-fit mb-6">
          {(['list', 'add'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-6 py-2 rounded-lg text-sm font-medium transition-all ${
                tab === t ? 'bg-[#F0A500] text-white shadow-sm' : 'text-[#6E6E73] hover:text-[#1D1D1F]'
              }`}
            >
              {t === 'list' ? '📋 Scholarships' : '➕ Add New'}
            </button>
          ))}
        </div>

        {/* ── LIST TAB ────────────────────────────────────────────── */}
        {tab === 'list' && (
          <div className="bg-white rounded-2xl border border-[#E5E5EA] overflow-hidden">
            {/* Controls */}
            <div className="flex flex-wrap gap-3 p-4 border-b border-[#E5E5EA]">
              <input
                type="text"
                placeholder="Search by name or funder..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="flex-1 min-w-[200px] px-3 py-2 rounded-lg border border-[#E5E5EA] text-sm focus:outline-none focus:ring-2 focus:ring-[#F0A500]"
              />
              <select
                value={filterActive}
                onChange={e => setFilterActive(e.target.value as typeof filterActive)}
                className="px-3 py-2 rounded-lg border border-[#E5E5EA] text-sm bg-white focus:outline-none"
              >
                <option value="all">All status</option>
                <option value="active">Active only</option>
                <option value="inactive">Inactive only</option>
              </select>
              <select
                value={sortField}
                onChange={e => setSortField(e.target.value as SortField)}
                className="px-3 py-2 rounded-lg border border-[#E5E5EA] text-sm bg-white focus:outline-none"
              >
                <option value="created_at">Sort: Newest</option>
                <option value="amount_thb">Sort: Amount</option>
                <option value="name_th">Sort: Name A–Z</option>
              </select>
              <button
                onClick={fetchScholarships}
                className="px-4 py-2 rounded-lg border border-[#E5E5EA] text-sm text-[#6E6E73] hover:border-[#F0A500] transition-colors"
              >
                ↻ Refresh
              </button>
            </div>

            {/* Table */}
            {listLoading ? (
              <div className="flex justify-center py-16"><Spinner /></div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-16 text-[#6E6E73] text-sm">No scholarships found.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#E5E5EA] bg-[#F5F5F7]">
                      <th className="text-left px-4 py-3 font-medium text-[#6E6E73]">Name</th>
                      <th className="text-left px-4 py-3 font-medium text-[#6E6E73]">Funder</th>
                      <th className="text-right px-4 py-3 font-medium text-[#6E6E73]">Amount</th>
                      <th className="text-center px-4 py-3 font-medium text-[#6E6E73]">Bias Score</th>
                      <th className="text-center px-4 py-3 font-medium text-[#6E6E73]">Status</th>
                      <th className="text-center px-4 py-3 font-medium text-[#6E6E73]">Toggle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((s, i) => (
                      <tr key={s.id} className={`border-b border-[#F5F5F7] hover:bg-[#FAFAFA] ${i % 2 === 0 ? '' : 'bg-[#FDFDFD]'}`}>
                        <td className="px-4 py-3">
                          <div className="font-medium text-[#1D1D1F] leading-tight">{s.name_th}</div>
                          {s.name_en && <div className="text-xs text-[#6E6E73] mt-0.5">{s.name_en}</div>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-[#1D1D1F]">{s.funder_name_th ?? '—'}</div>
                          <div className="text-xs text-[#ADADB8] capitalize">{s.funder_type ?? ''}</div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {s.amount_thb != null
                            ? <span className="font-medium text-[#1D1D1F]">{s.amount_thb.toLocaleString()} ฿</span>
                            : <span className="text-[#ADADB8]">—</span>}
                          {s.amount_type && <div className="text-xs text-[#ADADB8]">{s.amount_type}</div>}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {(s as Scholarship & { historical_bias_score?: number }).historical_bias_score != null ? (
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                              ((s as Scholarship & { historical_bias_score?: number }).historical_bias_score ?? 0.5) <= 0.3
                                ? 'bg-green-50 text-green-700'
                                : ((s as Scholarship & { historical_bias_score?: number }).historical_bias_score ?? 0.5) >= 0.7
                                  ? 'bg-red-50 text-red-600'
                                  : 'bg-gray-100 text-gray-600'
                            }`}>
                              {((s as Scholarship & { historical_bias_score?: number }).historical_bias_score ?? 0.5).toFixed(1)}
                            </span>
                          ) : (
                            <span className="text-[#ADADB8]">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            s.is_active ? 'bg-green-50 text-green-700' : 'bg-[#F5F5F7] text-[#6E6E73]'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${s.is_active ? 'bg-green-500' : 'bg-[#ADADB8]'}`} />
                            {s.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => toggleActive(s)}
                            disabled={togglingId === s.id}
                            className={`px-3 py-1 rounded-lg text-xs font-medium border transition-colors disabled:opacity-50 ${
                              s.is_active
                                ? 'border-red-200 text-red-600 hover:bg-red-50'
                                : 'border-green-200 text-green-700 hover:bg-green-50'
                            }`}
                          >
                            {togglingId === s.id
                              ? <Spinner size={3} />
                              : s.is_active ? 'Deactivate' : 'Activate'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="px-4 py-2 border-t border-[#F5F5F7] text-xs text-[#ADADB8]">
              Showing {filtered.length} of {scholarships.length} scholarships
            </div>
          </div>
        )}

        {/* ── ADD TAB ─────────────────────────────────────────────── */}
        {tab === 'add' && (
          <form onSubmit={handleAdd} className="bg-white rounded-2xl border border-[#E5E5EA] p-6 space-y-6">
            <h2 className="text-base font-semibold text-[#1D1D1F]">Add New Scholarship</h2>

            {saveMsg && <p className="text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2">{saveMsg}</p>}
            {saveError && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{saveError}</p>}

            {/* Names */}
            <fieldset className="space-y-3">
              <legend className="text-xs font-semibold text-[#6E6E73] uppercase tracking-wider mb-2">Names</legend>
              <Field label="Name (Thai) *" value={form.name_th} onChange={v => setForm(f => ({ ...f, name_th: v }))} placeholder="ทุน..." />
              <Field label="Name (English)" value={form.name_en} onChange={v => setForm(f => ({ ...f, name_en: v }))} placeholder="Scholarship..." />
            </fieldset>

            {/* Funder */}
            <fieldset className="space-y-3">
              <legend className="text-xs font-semibold text-[#6E6E73] uppercase tracking-wider mb-2">Funder</legend>
              <Field label="Funder Name (Thai)" value={form.funder_name_th} onChange={v => setForm(f => ({ ...f, funder_name_th: v }))} />
              <Field label="Funder Name (English)" value={form.funder_name_en} onChange={v => setForm(f => ({ ...f, funder_name_en: v }))} />
              <div>
                <label className="block text-sm font-medium text-[#1D1D1F] mb-1">Funder Type</label>
                <select value={form.funder_type} onChange={e => setForm(f => ({ ...f, funder_type: e.target.value as FunderType }))}
                  className="w-full px-3 py-2 rounded-lg border border-[#E5E5EA] text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#F0A500]">
                  {FUNDER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </fieldset>

            {/* Amount */}
            <fieldset className="space-y-3">
              <legend className="text-xs font-semibold text-[#6E6E73] uppercase tracking-wider mb-2">Amount</legend>
              <Field label="Amount (THB)" value={form.amount_thb} onChange={v => setForm(f => ({ ...f, amount_thb: v }))} type="number" placeholder="50000" />
              <div>
                <label className="block text-sm font-medium text-[#1D1D1F] mb-1">Amount Type</label>
                <select value={form.amount_type} onChange={e => setForm(f => ({ ...f, amount_type: e.target.value as AmountType }))}
                  className="w-full px-3 py-2 rounded-lg border border-[#E5E5EA] text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#F0A500]">
                  {AMOUNT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </fieldset>

            {/* Eligibility */}
            <fieldset className="space-y-3">
              <legend className="text-xs font-semibold text-[#6E6E73] uppercase tracking-wider mb-2">Eligibility</legend>
              <Field label="Min GPA" value={form.min_gpa} onChange={v => setForm(f => ({ ...f, min_gpa: v }))} type="number" placeholder="2.50" />
              <Field label="Max Income (THB/year)" value={form.max_income_thb} onChange={v => setForm(f => ({ ...f, max_income_thb: v }))} type="number" placeholder="360000" />
              <Field label="Grade Levels (comma-separated)" value={form.grade_levels} onChange={v => setForm(f => ({ ...f, grade_levels: v }))} placeholder="M4,M5,M6,uni,graduate" />
              <Field label="Field of Study (comma-separated)" value={form.field_of_study} onChange={v => setForm(f => ({ ...f, field_of_study: v }))} placeholder="วิศวกรรมศาสตร์,วิทยาศาสตร์" />
              <Field label="Province Restriction (comma-separated, blank = all)" value={form.province_restriction} onChange={v => setForm(f => ({ ...f, province_restriction: v }))} placeholder="ขอนแก่น,อุดรธานี" />
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.welfare_card_priority} onChange={e => setForm(f => ({ ...f, welfare_card_priority: e.target.checked }))} className="accent-[#F0A500]" />
                <span className="text-sm text-[#1D1D1F]">Welfare card priority</span>
              </label>
            </fieldset>

            {/* Details */}
            <fieldset className="space-y-3">
              <legend className="text-xs font-semibold text-[#6E6E73] uppercase tracking-wider mb-2">Details</legend>
              <Field label="Deadline Date" value={form.deadline_date} onChange={v => setForm(f => ({ ...f, deadline_date: v }))} type="date" />
              <Field label="Application URL" value={form.application_url} onChange={v => setForm(f => ({ ...f, application_url: v }))} placeholder="https://..." />
              <Field label="Documents Required (comma-separated)" value={form.documents_required} onChange={v => setForm(f => ({ ...f, documents_required: v }))} placeholder="สำเนาบัตรประชาชน,ใบแสดงผลการเรียน" />
              <TextareaField label="Description (Thai)" value={form.description_th} onChange={v => setForm(f => ({ ...f, description_th: v }))} />
              <TextareaField label="Description (English)" value={form.description_en} onChange={v => setForm(f => ({ ...f, description_en: v }))} />
            </fieldset>

            {/* Fairness */}
            <fieldset className="space-y-3">
              <legend className="text-xs font-semibold text-[#6E6E73] uppercase tracking-wider mb-2">Fairness</legend>
              <Field
                label="Historical Bias Score (0.1 = rural-friendly, 0.5 = neutral, 0.9 = urban-biased)"
                value={form.historical_bias_score}
                onChange={v => setForm(f => ({ ...f, historical_bias_score: v }))}
                type="number" placeholder="0.5"
              />
            </fieldset>

            <button type="submit" disabled={saving}
              className="w-full bg-[#F0A500] hover:bg-[#D4920A] text-white font-semibold py-3 rounded-xl text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
              {saving && <Spinner />}
              Add Scholarship
            </button>
          </form>
        )}
      </div>
    </main>
  );
}

// ── Reusable field components ────────────────────────────────────────────────

function Field({ label, value, onChange, type = 'text', placeholder = '' }: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-[#1D1D1F] mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded-lg border border-[#E5E5EA] text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#F0A500]"
      />
    </div>
  );
}

function TextareaField({ label, value, onChange }: {
  label: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-[#1D1D1F] mb-1">{label}</label>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={3}
        className="w-full px-3 py-2 rounded-lg border border-[#E5E5EA] text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#F0A500] resize-y"
      />
    </div>
  );
}

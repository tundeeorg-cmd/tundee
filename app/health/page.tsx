'use client';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

interface Check {
  name: string;
  status: 'checking' | 'ok' | 'error';
  detail: string;
}

export default function HealthPage() {
  const [checks, setChecks] = useState<Check[]>([
    { name: 'Database connection',    status: 'checking', detail: '' },
    { name: 'Scholarships loading',   status: 'checking', detail: '' },
    { name: 'Auth system',            status: 'checking', detail: '' },
    { name: 'OG image exists',        status: 'checking', detail: '' },
    { name: 'Sitemap accessible',     status: 'checking', detail: '' },
    { name: 'Environment variables',  status: 'checking', detail: '' },
  ]);

  function update(index: number, status: 'ok' | 'error', detail: string) {
    setChecks(prev => prev.map((c, i) =>
      i === index ? { ...c, status, detail } : c
    ));
  }

  useEffect(() => {
    const supabase = createClient();

    // Check 0: Database connection
    void (async () => {
      try {
        const { count, error } = await supabase
          .from('scholarships')
          .select('count', { count: 'exact', head: true });
        if (error) update(0, 'error', error.message);
        else update(0, 'ok', `Connected — ${count} scholarships`);
      } catch (e: unknown) {
        update(0, 'error', e instanceof Error ? e.message : 'Unexpected error');
      }
    })();

    // Check 1: Scholarships loading
    void (async () => {
      try {
        const { data, error } = await supabase
          .from('scholarships')
          .select('id, name_th')
          .eq('is_active', true)
          .limit(3);
        if (error) update(1, 'error', error.message);
        else if (!data || data.length === 0)
          update(1, 'error', 'No scholarships returned — check RLS');
        else update(1, 'ok', `Loading OK — first: ${data[0].name_th}`);
      } catch (e: unknown) {
        update(1, 'error', e instanceof Error ? e.message : 'Unexpected error');
      }
    })();

    // Check 2: Auth system
    void (async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) update(2, 'error', error.message);
        else
          update(
            2,
            'ok',
            data.session
              ? `Logged in as ${data.session.user.email}`
              : 'Not logged in (auth system working)',
          );
      } catch (e: unknown) {
        update(2, 'error', e instanceof Error ? e.message : 'Unexpected error');
      }
    })();

    // Check 3: OG image — prefer .svg, fall back to .png
    fetch('/og-image.svg', { method: 'HEAD' })
      .then(r => {
        if (r.ok) {
          update(3, 'ok', 'og-image.svg exists');
        } else {
          fetch('/og-image.png', { method: 'HEAD' }).then(r2 => {
            if (r2.ok) update(3, 'ok', 'og-image.png exists');
            else update(3, 'error', 'Neither og-image.svg nor og-image.png found in /public');
          });
        }
      })
      .catch(() => update(3, 'error', 'OG image fetch failed'));

    // Check 4: Sitemap
    fetch('/sitemap.xml', { method: 'HEAD' })
      .then(r => {
        if (r.ok) update(4, 'ok', 'sitemap.xml accessible');
        else update(4, 'error', `sitemap.xml not found (${r.status})`);
      })
      .catch(() => update(4, 'error', 'sitemap.xml fetch failed'));

    // Check 5: Public environment variables
    const vars: Record<string, boolean> = {
      SUPABASE_URL:  !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      SUPABASE_ANON: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      SITE_URL:      !!process.env.NEXT_PUBLIC_SITE_URL,
      GA_ID:         !!process.env.NEXT_PUBLIC_GA_ID,
    };
    const missing = Object.entries(vars)
      .filter(([, v]) => !v)
      .map(([k]) => k);
    if (missing.length > 0)
      update(5, 'error', `Missing: ${missing.join(', ')}`);
    else
      update(5, 'ok', 'All public env vars present');
  }, []);

  const allDone = checks.every(c => c.status !== 'checking');
  const allOk   = checks.every(c => c.status === 'ok');

  return (
    <div className="min-h-screen bg-[#F5F5F7] dark:bg-[#111111] p-8">
      <div className="max-w-lg mx-auto">
        <h1 className="text-2xl font-bold text-[#1D1D1F] dark:text-white mb-2">
          TunDee Health Check
        </h1>
        <p className="text-sm text-[#6e6e73] mb-8">
          tundee.org · {new Date().toLocaleDateString('th-TH')}
        </p>

        <div className="space-y-3">
          {checks.map((check, i) => (
            <div
              key={i}
              className="bg-white dark:bg-[#1D1D1F] rounded-xl border border-[#e0e0e0] dark:border-[#3a3a3c] p-4 flex items-start gap-3"
            >
              <div
                className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold mt-0.5 ${
                  check.status === 'checking'
                    ? 'bg-gray-200 text-gray-500 animate-pulse'
                    : check.status === 'ok'
                      ? 'bg-green-100 text-green-600'
                      : 'bg-red-100 text-red-600'
                }`}
              >
                {check.status === 'checking' ? '·' : check.status === 'ok' ? '✓' : '✗'}
              </div>
              <div>
                <p className="text-sm font-semibold text-[#1D1D1F] dark:text-[#F5F5F7]">
                  {check.name}
                </p>
                {check.detail && (
                  <p
                    className={`text-xs mt-0.5 ${
                      check.status === 'ok' ? 'text-[#6e6e73]' : 'text-red-500 font-mono'
                    }`}
                  >
                    {check.detail}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>

        {allDone && (
          <div
            className={`mt-6 p-4 rounded-xl text-center font-semibold ${
              allOk ? 'bg-green-100 text-green-700' : 'bg-red-50 text-red-700'
            }`}
          >
            {allOk
              ? '✓ All systems operational. TunDee is ready.'
              : '✗ Some checks failed. See details above.'}
          </div>
        )}

        <p className="text-xs text-[#aeaeb2] text-center mt-6">
          Developer-only diagnostic page. Not linked from navigation.
        </p>
      </div>
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

interface Props {
  scholarshipId: string;
  size?: 'sm' | 'md';
}

export default function TrackButton({ scholarshipId, size = 'md' }: Props) {
  const supabase = createClient();
  const router   = useRouter();

  const [tracked,  setTracked]  = useState(false);
  const [loading,  setLoading]  = useState(true);
  const [working,  setWorking]  = useState(false);
  const [trackId,  setTrackId]  = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user || cancelled) { setLoading(false); return; }
      supabase
        .from('tracked_scholarship')
        .select('id')
        .eq('user_id', data.user.id)
        .eq('scholarship_id', scholarshipId)
        .maybeSingle()
        .then(({ data: row }) => {
          if (cancelled) return;
          setTracked(!!row);
          setTrackId(row?.id ?? null);
          setLoading(false);
        });
    });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scholarshipId]);

  async function toggle() {
    setWorking(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push('/auth?from=track');
      setWorking(false);
      return;
    }

    if (tracked && trackId) {
      const { error } = await supabase
        .from('tracked_scholarship')
        .delete()
        .eq('id', trackId)
        .eq('user_id', user.id);
      if (!error) { setTracked(false); setTrackId(null); }
    } else {
      const { data, error } = await supabase
        .from('tracked_scholarship')
        .upsert({ user_id: user.id, scholarship_id: scholarshipId }, { onConflict: 'user_id,scholarship_id' })
        .select('id')
        .single();
      if (!error && data) { setTracked(true); setTrackId(data.id); }
    }
    setWorking(false);
  }

  const small = size === 'sm';

  if (loading) {
    return (
      <div className={`rounded-lg bg-[#F5F5F7] dark:bg-[#1A2E4A] animate-pulse ${small ? 'w-16 h-7' : 'w-24 h-9'}`} />
    );
  }

  return (
    <button
      onClick={toggle}
      disabled={working}
      title={tracked ? 'Untrack scholarship' : 'Track scholarship'}
      className={`flex items-center gap-1.5 rounded-lg font-medium transition-colors disabled:opacity-50 ${
        small ? 'px-2.5 py-1.5 text-xs' : 'px-3.5 py-2 text-sm'
      } ${
        tracked
          ? 'bg-[#2E6BE6] text-white hover:bg-[#1E57CC]'
          : 'bg-[#F5F5F7] dark:bg-[#1A2E4A] text-[#1D1D1F] dark:text-white hover:bg-[#E5E5EA] dark:hover:bg-[#243552]'
      }`}
    >
      {working ? (
        <svg className={`animate-spin ${small ? 'w-3 h-3' : 'w-4 h-4'}`} fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
        </svg>
      ) : (
        <span>{tracked ? '✓' : '🔖'}</span>
      )}
      {tracked ? 'Tracking' : 'Track'}
    </button>
  );
}

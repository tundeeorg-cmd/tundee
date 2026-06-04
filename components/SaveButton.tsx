'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SaveButtonProps {
  scholarshipId: string;
  size?: 'sm' | 'md';
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SaveButton({ scholarshipId, size = 'sm' }: SaveButtonProps) {
  const supabase = createClient();

  const [userId, setUserId]   = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  // appId is retained for future optimistic-delete by id
  const [_appId, setAppId]    = useState<string | null>(null);
  const [ready, setReady]     = useState(false);
  const [loading, setLoading] = useState(false);

  // ── Auth + saved-state check on mount ─────────────────────────────────────
  const init = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        setReady(true); // not logged in — render nothing, but mark ready
        return;
      }

      const uid = session.user.id;
      setUserId(uid);

      const { data, error } = await supabase
        .from('applications')
        .select('id, status')
        .eq('user_id', uid)
        .eq('scholarship_id', scholarshipId)
        .maybeSingle();

      if (!error && data) {
        setIsSaved(true);
        setAppId(data.id);
      }
    } catch {
      // Fail silently if table doesn't exist yet
    } finally {
      setReady(true);
    }
  }, [supabase, scholarshipId]);

  useEffect(() => {
    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        setUserId(null);
        setIsSaved(false);
        setAppId(null);
      } else if (session.user.id !== userId) {
        // User switched — re-init
        init();
      }
    });

    return () => subscription.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scholarshipId]);

  // ── Toggle ─────────────────────────────────────────────────────────────────
  const handleToggle = async () => {
    if (!userId || loading) return;

    // Optimistic UI
    const wasaved = isSaved;
    setIsSaved(!wasaved);
    setLoading(true);

    try {
      if (!wasaved) {
        // Save: upsert a 'viewing' application
        const { data, error } = await supabase
          .from('applications')
          .upsert(
            {
              user_id:            userId,
              scholarship_id:     scholarshipId,
              status:             'viewing',
              checklist_progress: [],
            },
            { onConflict: 'user_id,scholarship_id' }
          )
          .select('id')
          .maybeSingle();

        if (error) {
          // Roll back optimistic update
          setIsSaved(wasaved);
          console.warn('[TunDee] SaveButton upsert error (non-fatal):', error.message);
        } else if (data) {
          setAppId(data.id);
        }
      } else {
        // Unsave: delete the row
        const { error } = await supabase
          .from('applications')
          .delete()
          .eq('user_id', userId)
          .eq('scholarship_id', scholarshipId);

        if (error) {
          // Roll back optimistic update
          setIsSaved(wasaved);
          console.warn('[TunDee] SaveButton delete error (non-fatal):', error.message);
        } else {
          setAppId(null);
        }
      }
    } catch {
      // Fail silently — roll back
      setIsSaved(wasaved);
    } finally {
      setLoading(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  // Not yet determined (checking auth) — render nothing to avoid flash
  if (!ready) return null;
  // Not logged in — render nothing
  if (!userId) return null;

  const iconSize  = size === 'md' ? 'text-lg' : 'text-base';
  const showLabel = size === 'md';

  return (
    <div className="relative z-10">
      <button
        type="button"
        onClick={handleToggle}
        disabled={loading}
        aria-label={isSaved ? 'Remove from saved' : 'Save scholarship'}
        className={[
          'p-1.5 rounded-full transition-all duration-200 flex items-center gap-1',
          isSaved
            ? 'text-[#F0A500] bg-[#FFF8E7]'
            : 'text-[#ADADB8] hover:text-[#F0A500] hover:bg-[#FFF8E7]',
          loading ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer',
        ].join(' ')}
      >
        <span className={iconSize} aria-hidden="true">
          {isSaved ? '♥' : '♡'}
        </span>
        {showLabel && (
          <span className="text-xs font-medium leading-none">
            {isSaved ? 'Saved' : 'Save'}
          </span>
        )}
      </button>
    </div>
  );
}

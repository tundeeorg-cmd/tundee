'use client';

/**
 * Saves the scholarship a guest tapped "บันทึก" on, once they are signed in.
 *
 * Mounted once in the root layout, because sign-in can land anywhere: back on
 * /start, on a scholarship page, or in Chrome after LINE's hand-off from the
 * Facebook webview. It reads the `save` param, then localStorage
 * (lib/tracker/pendingSave), saves once, says so, and forgets it.
 *
 * Without a session it does nothing except copy a URL `save` into storage, so a
 * student who arrives signed out still has it when they sign in on this browser.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { logFunnelEvent } from '@/lib/research/funnel';
import { addToWishlist } from '@/lib/analytics';
import { notifyTrackedCountChanged } from '@/lib/tracker/countBus';
import {
  SAVE_PARAM, clearPendingSave, pendingSaveFrom, rememberPendingSave,
} from '@/lib/tracker/pendingSave';

const TH = { fontFamily: 'Sarabun, sans-serif' } as const;

export default function PendingSaveResolver() {
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const id = pendingSaveFrom(window.location.search);
    if (!id) return;
    let cancelled = false;

    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (cancelled) return;
      const user = data.user;
      if (!user) {
        rememberPendingSave(id);
        return;
      }

      const { error } = await supabase
        .from('tracked_scholarship')
        .upsert({ user_id: user.id, scholarship_id: id }, { onConflict: 'user_id,scholarship_id' });
      if (cancelled) return;
      if (error) {
        // Kept for a later page: a failed write is not a reason to lose the tap.
        console.warn('[pending-save] could not save:', error.message);
        return;
      }

      clearPendingSave();
      const url = new URL(window.location.href);
      if (url.searchParams.has(SAVE_PARAM)) {
        url.searchParams.delete(SAVE_PARAM);
        window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
      }
      logFunnelEvent({ eventType: 'track_add', scholarshipId: id, userId: user.id, context: { via: 'guest_save' } });
      addToWishlist({ scholarshipId: id });
      notifyTrackedCountChanged();
      setSaved(true);
    });

    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 6000);
    return () => clearTimeout(t);
  }, [saved]);

  if (!saved) return null;
  return (
    <div
      role="status"
      className="fixed left-1/2 -translate-x-1/2 bottom-[calc(76px+env(safe-area-inset-bottom,0px))] md:bottom-6 z-[70] w-[calc(100%-32px)] max-w-sm rounded-2xl bg-[#0A2342] text-white px-4 py-3 shadow-lg flex items-center justify-between gap-3"
      style={TH}
    >
      <span className="text-sm">✓ บันทึกทุนแล้ว เราจะเตือนก่อนปิดรับ</span>
      <Link href="/tracker" className="shrink-0 text-sm font-semibold underline">ดูทุนที่บันทึก</Link>
    </div>
  );
}

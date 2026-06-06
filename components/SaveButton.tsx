'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Toast from '@/components/Toast';
import { useLang } from '@/lib/LanguageContext';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SaveButtonProps {
  scholarshipId: string;
  size?: 'sm' | 'md';
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SaveButton({ scholarshipId, size = 'sm' }: SaveButtonProps) {
  const supabase = createClient();
  const router   = useRouter();
  const { lang } = useLang();

  const [userId, setUserId]   = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [_appId, setAppId]    = useState<string | null>(null);
  const [ready, setReady]     = useState(false);
  const [loading, setLoading] = useState(false);

  // Toast
  const [toastMsg,     setToastMsg]     = useState('');
  const [toastType,    setToastType]    = useState<'success' | 'error'>('success');
  const [toastVisible, setToastVisible] = useState(false);

  function showToast(message: string, type: 'success' | 'error') {
    setToastMsg(message);
    setToastType(type);
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 2800);
  }

  // ── Auth + saved-state check on mount ─────────────────────────────────────
  const init = useCallback(async () => {
    try {
      // getUser() hits the server — more reliable than getSession() for auth checks
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setReady(true);
        return;
      }

      const uid = user.id;
      setUserId(uid);

      const { data, error } = await supabase
        .from('applications')
        .select('id, status')
        .eq('user_id', uid)
        .eq('scholarship_id', scholarshipId)
        .maybeSingle();

      if (error) {
        // If error is permission-related, applications table may not have RLS set up yet
        console.warn('[TunDee] SaveButton init check:', error.message);
      } else if (data) {
        setIsSaved(true);
        setAppId(data.id);
      }
    } catch {
      // Fail silently
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
        setReady(true);
      } else {
        init();
      }
    });

    return () => subscription.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scholarshipId]);

  // ── Toggle ─────────────────────────────────────────────────────────────────
  const handleToggle = async () => {
    // Not logged in → toast + redirect to auth
    if (!userId) {
      showToast(
        lang === 'th'
          ? 'เข้าสู่ระบบเพื่อบันทึกทุน'
          : 'Log in to save scholarships',
        'error'
      );
      setTimeout(() => router.push('/auth'), 700);
      return;
    }

    if (loading) return;

    // Optimistic update
    const wasaved = isSaved;
    setIsSaved(!wasaved);
    setLoading(true);

    try {
      if (!wasaved) {
        // ── Save ──────────────────────────────────────────────────────────
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
          setIsSaved(wasaved); // roll back
          console.error('[TunDee] SaveButton upsert error:', error.code, error.message);
          showToast(
            lang === 'th'
              ? 'บันทึกไม่สำเร็จ กรุณาลองใหม่'
              : 'Save failed. Please try again.',
            'error'
          );
        } else {
          if (data) setAppId(data.id);
          showToast(lang === 'th' ? 'บันทึกแล้ว ♥' : 'Saved ♥', 'success');
        }
      } else {
        // ── Unsave ────────────────────────────────────────────────────────
        const { error } = await supabase
          .from('applications')
          .delete()
          .eq('user_id', userId)
          .eq('scholarship_id', scholarshipId);

        if (error) {
          setIsSaved(wasaved); // roll back
          console.error('[TunDee] SaveButton delete error:', error.code, error.message);
          showToast(
            lang === 'th'
              ? 'ลบไม่สำเร็จ กรุณาลองใหม่'
              : 'Remove failed. Please try again.',
            'error'
          );
        } else {
          setAppId(null);
          showToast(
            lang === 'th' ? 'ลบออกจากรายการแล้ว' : 'Removed from saved',
            'success'
          );
        }
      }
    } catch (err) {
      setIsSaved(wasaved); // roll back
      console.error('[TunDee] SaveButton unexpected error:', err);
      showToast(
        lang === 'th'
          ? 'เกิดข้อผิดพลาด กรุณาลองใหม่'
          : 'An error occurred. Please try again.',
        'error'
      );
    } finally {
      setLoading(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  // Not ready yet — invisible placeholder to prevent layout shift
  if (!ready) {
    return (
      <div
        style={{ width: size === 'md' ? 88 : 28, height: 28 }}
        aria-hidden="true"
      />
    );
  }

  const iconSize  = size === 'md' ? 'text-lg' : 'text-base';
  const showLabel = size === 'md';

  return (
    <>
      <Toast message={toastMsg} type={toastType} visible={toastVisible} />

      <div className="relative z-10">
        <button
          type="button"
          onClick={handleToggle}
          disabled={loading}
          aria-label={isSaved ? 'Remove from saved' : 'Save scholarship'}
          title={
            !userId
              ? (lang === 'th' ? 'เข้าสู่ระบบเพื่อบันทึก' : 'Log in to save')
              : undefined
          }
          className={[
            'p-1.5 rounded-full transition-all duration-200 flex items-center gap-1',
            isSaved
              ? 'text-[#F0A500] bg-[#FFF8E7]'
              : userId
                ? 'text-[#ADADB8] hover:text-[#F0A500] hover:bg-[#FFF8E7]'
                : 'text-[#ADADB8] hover:text-[#6E6E73]',
            loading ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer',
          ].join(' ')}
        >
          {loading ? (
            <svg
              className={`animate-spin ${size === 'md' ? 'w-5 h-5' : 'w-4 h-4'}`}
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12" cy="12" r="10"
                stroke="currentColor" strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
              />
            </svg>
          ) : (
            <span className={iconSize} aria-hidden="true">
              {isSaved ? '♥' : '♡'}
            </span>
          )}
          {showLabel && (
            <span className="text-xs font-medium leading-none">
              {loading
                ? '...'
                : isSaved
                  ? (lang === 'th' ? 'บันทึกแล้ว' : 'Saved')
                  : (lang === 'th' ? 'บันทึก' : 'Save')}
            </span>
          )}
        </button>
      </div>
    </>
  );
}

'use client';

/**
 * Asks a signed-in student for research consent again — only the students who need it
 * (lib/research/reconsent.ts): those who agreed to an earlier wording, and those who
 * ticked the box at sign-up but whose answer was never recorded. Everyone else sees
 * nothing, and so does anyone while the status cannot be read.
 *
 * The question itself is <ResearchConsent>: neither option pre-selected, agree and
 * decline of equal weight, a guardian acknowledgement when the server requires one.
 * "Later" is not a third answer; it hides the card for this browser session and the
 * question comes back next time. Declining costs nothing and is final.
 */

import { useEffect, useRef, useState } from 'react';
import ResearchConsent from '@/components/ResearchConsent';
import { logFunnelEvent } from '@/lib/research/funnel';

const DISMISS_KEY = 'tundee_reconsent_later';

type State = 'checking' | 'needed' | 'hidden';

export default function ReconsentPrompt({ lang }: { lang: string }) {
  const th = lang === 'th';
  const font = th ? 'Sarabun, sans-serif' : 'Inter, system-ui, sans-serif';
  const [state, setState] = useState<State>('checking');
  const reasonRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    try {
      if (sessionStorage.getItem(DISMISS_KEY)) { setState('hidden'); return; }
    } catch { /* sessionStorage unavailable: ask */ }

    fetch('/api/profile/consent-status', { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`status ${res.status}`);
        return res.json() as Promise<{ needsReconsent: boolean; reason: string | null }>;
      })
      .then((body) => {
        if (cancelled) return;
        reasonRef.current = body.reason;
        setState(body.needsReconsent ? 'needed' : 'hidden');
        if (body.needsReconsent) {
          logFunnelEvent({ eventType: 'profile_updated', context: { event: 'research_reconsent_shown', reason: body.reason } });
        }
      })
      .catch((err) => {
        // Never a prompt on a guess, never a stuck spinner: hide, and say why.
        console.error('[reconsent] status unavailable:', err);
        if (!cancelled) setState('hidden');
      });

    return () => { cancelled = true; };
  }, []);

  if (state !== 'needed') return null;

  return (
    <section className="mb-8" aria-label={th ? 'ขอความยินยอมงานวิจัยอีกครั้ง' : 'Research consent'}>
      <p className="mb-2 text-sm text-[#1D1D1F] dark:text-[#F5F5F7]" style={{ fontFamily: font }}>
        {th
          ? 'เราขอถามความยินยอมเรื่องงานวิจัยอีกครั้ง เพื่อให้บันทึกของคุณตรงกับข้อความฉบับปัจจุบัน'
          : 'We are asking about research consent again so that your record matches the current wording.'}
      </p>

      <ResearchConsent
        lang={lang}
        method="profile_settings"
        onDecided={(consented) => {
          logFunnelEvent({
            eventType: 'profile_updated',
            context: { event: 'research_reconsent_decided', decision: consented ? 'agree' : 'decline', reason: reasonRef.current },
          });
        }}
      />

      <p className="mt-2 text-right">
        <button
          type="button"
          onClick={() => {
            try { sessionStorage.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ }
            setState('hidden');
          }}
          className="text-xs text-[#8e8e93] underline"
          style={{ fontFamily: font }}
        >
          {th ? 'ไว้ทีหลัง' : 'Later'}
        </button>
      </p>
    </section>
  );
}

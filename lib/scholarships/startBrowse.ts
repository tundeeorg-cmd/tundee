/**
 * The first screen of /start, fetched on the server so the cards are in the HTML.
 *
 * A visitor from a Facebook ad is on a phone, usually on a slow connection, inside
 * a webview. Cards that arrive after a client-side fetch are a spinner for as long
 * as that takes; cards in the HTML are there when the page is. Cached for five
 * minutes — the list is the same for everyone, so one query serves every visitor.
 *
 * Server-only. Anon key, so the public RLS policy decides what is visible, exactly
 * as it does for /scholarships.
 */

import { unstable_cache } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import type { TdScholarship } from '@/lib/tdScholarships/types';
import { START_CARD_SELECT } from '@/lib/tdScholarships/startColumns';
import { bangkokToday, isActionable, sortByDeadline } from './startFilter';

/** How many cards the first paint carries. The brief asks for at least six. */
export const START_INITIAL_CARDS = 12;

export interface StartCards {
  ok: boolean;
  cards: TdScholarship[];
}

/**
 * Throws on failure rather than returning an empty result: unstable_cache stores
 * what a function RETURNS, so a returned "no cards" would be served to every
 * visitor for five minutes. A throw is not cached.
 */
async function fetchStartCards(): Promise<TdScholarship[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase env missing');

  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  // Over-fetch a little: anything past its deadline is dropped below, and a row
  // whose status has not caught up with its date must not take a slot.
  const { data, error } = await db
    .from('td_scholarships')
    .select(START_CARD_SELECT)
    .eq('is_displayed', true)
    .in('status_effective', ['Closing Soon', 'Open'])
    .order('deadline_date', { ascending: true, nullsFirst: false })
    .limit(START_INITIAL_CARDS * 3);

  if (error) throw new Error(`scholarship list query failed: ${error.message}`);

  const today = bangkokToday();
  const cards = sortByDeadline(
    ((data ?? []) as unknown as TdScholarship[]).filter((s) => isActionable(s, today)),
    today,
  ).slice(0, START_INITIAL_CARDS);

  // An empty list is as wrong to cache as an error: say so and let it retry.
  if (cards.length === 0) throw new Error('no open scholarships returned');
  return cards;
}

const cached = unstable_cache(fetchStartCards, ['start-browse-cards'], {
  revalidate: 300,
  tags: ['start-browse'],
});

/** Never throws: /start must render, with or without the list. */
export async function getStartCards(): Promise<StartCards> {
  try {
    return { ok: true, cards: await cached() };
  } catch (err) {
    console.error('[start] could not load the scholarship list:', (err as Error).message);
    return { ok: false, cards: [] };
  }
}

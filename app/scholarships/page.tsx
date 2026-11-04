/**
 * /scholarships — the server half.
 *
 * Fetches the displayed scholarships here, cached (lib/tdScholarships/browseList),
 * and hands them to ScholarshipsClient, so the HTML a visitor receives already
 * contains the first cards. Nothing here reads cookies or the session: the page
 * is the same for everyone and is served from Vercel's cache; who is signed in is
 * worked out in the browser afterwards, only to switch on the matches tab.
 */

import ScholarshipsClient from './ScholarshipsClient';
import { getBrowseList } from '@/lib/tdScholarships/browseList';

// Same hour as BROWSE_REVALIDATE_SECONDS. A literal, because Next reads route
// segment config statically and will not follow an import.
export const revalidate = 3600;

export default async function ScholarshipsPage() {
  const scholarships = await getBrowseList();
  return <ScholarshipsClient initialScholarships={scholarships} />;
}

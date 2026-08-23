/**
 * Homepage. A server component purely so the scholarship count is resolved before
 * anything renders: the count is marketing copy, and a number that pops in after
 * hydration is a number that was briefly wrong.
 *
 * `revalidate` replaces the previous `force-dynamic`. The count changes when an import
 * runs, not per request, so an hourly rebuild is both fresher than the "at least daily"
 * requirement and far cheaper than querying on every visit.
 */

import HomeContent from './HomeContent';
import { getScholarshipStats } from '@/lib/scholarships/counts';

export const revalidate = 3600;

export default async function HomePage() {
  const stats = await getScholarshipStats();
  return <HomeContent stats={stats} />;
}

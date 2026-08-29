/**
 * Thai region groupings — the single source of truth.
 *
 * Client-safe on purpose. This list previously existed in three places that
 * could drift:
 *
 *   • NORTHEAST_PROVINCES in lib/matching/engine.ts   (not exported)
 *   • NORTHEAST_PROVINCES in lib/research/assignment.ts (server-only: node:crypto)
 *   • public.tundee_region_group() in scripts/20260828_v16_*.sql
 *
 * lib/research/assignment.ts cannot be imported by client code — it pulls in
 * node:crypto so the randomization salt can never reach the browser — which is
 * why the re-ranker could not simply reuse its copy. Hence this module: no
 * imports, no side effects, usable from anywhere.
 *
 * The SQL function remains a deliberate fourth copy; a GENERATED column cannot
 * call into TypeScript. Both are commented as mirroring the other.
 */

export type RegionGroup = 'northeast' | 'bangkok_metro' | 'other';

/** The 20 Isan provinces (PREREG §5.1). */
export const NORTHEAST_PROVINCES: ReadonlySet<string> = new Set([
  'กาฬสินธุ์', 'ขอนแก่น', 'ชัยภูมิ', 'นครพนม', 'นครราชสีมา',
  'บึงกาฬ', 'บุรีรัมย์', 'มหาสารคาม', 'มุกดาหาร', 'ยโสธร',
  'ร้อยเอ็ด', 'เลย', 'ศรีสะเกษ', 'สกลนคร', 'สุรินทร์',
  'หนองคาย', 'หนองบัวลำภู', 'อำนาจเจริญ', 'อุดรธานี', 'อุบลราชธานี',
]);

/** Bangkok and its three adjacent provinces (PREREG §5.1). */
export const BANGKOK_METRO_PROVINCES: ReadonlySet<string> = new Set([
  'กรุงเทพมหานคร', 'นนทบุรี', 'ปทุมธานี', 'สมุทรปราการ',
]);

/**
 * Region group from a declared Thai province name.
 *
 * Returns null for an unknown or absent province rather than guessing — a
 * student whose province we do not recognise is not evidence that they are
 * 'other', and silently bucketing them would put them in a stratum they do not
 * belong to.
 */
export function regionGroupFromProvince(
  province: string | null | undefined,
): RegionGroup | null {
  if (!province) return null;
  const p = province.trim();
  if (NORTHEAST_PROVINCES.has(p)) return 'northeast';
  if (BANGKOK_METRO_PROVINCES.has(p)) return 'bangkok_metro';
  return 'other';
}

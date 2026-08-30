/**
 * Which link to show for a scholarship, and what we are allowed to call it.
 *
 * The obvious version of this feature — "ดูประกาศต้นทางจาก {funder} →" on every card —
 * cannot be built honestly from the data we have. Measured 30 Aug 2026 across the 491
 * displayed scholarships:
 *
 *     414  source_url is a third-party aggregator (scholarshiptab, eduzones, dek-d, …)
 *     373  application_url is one too
 *      43  either URL is on a regulated Thai institutional domain
 *
 * So for roughly five out of six scholarships, a link promising the funder's own
 * announcement would open an ad-supported aggregator instead. On a site whose entire
 * problem is being mistaken for a scam, that is the worst available failure: the student
 * checks the one claim we invited them to check, and it is false. Better to say less.
 *
 * Hence a positive test rather than a blocklist. `.ac.th`, `.go.th`, `.or.th` and `.mi.th`
 * are registry-controlled in Thailand — an .ac.th requires Ministry accreditation, an
 * .or.th requires registration documents — so a URL on one of them genuinely belongs to
 * an institution, and no guesswork is involved. A blocklist of known aggregators would
 * have the opposite failure mode: an aggregator we have not seen yet gets promoted to
 * "the funder's official announcement" silently.
 *
 * The cost is under-claiming for real funders outside those domains — daad-thailand.org,
 * studyinnl.org, waseda.jp are official and are still labelled the weaker way. That is the
 * safe direction to be wrong in, and each row upgrades itself the moment someone puts a
 * funder URL in the sheet. Nothing here needs revisiting when that happens.
 */

/**
 * Thailand's registry-controlled second-level domains. Membership is documented and
 * enforced by THNIC, which is what makes this a fact about the URL rather than a guess.
 */
const OFFICIAL_TH_DOMAIN = /\.(?:ac|go|or|mi)\.th$/;

export type SourceLinkKind =
  /** Verifiably the institution's own site: the strong label is honest. */
  | 'official'
  /** Where we found it. True of any URL, and all we can say about most of them. */
  | 'source';

export interface SourceLink {
  href: string;
  kind: SourceLinkKind;
}

interface SourceFields {
  source_url?: string | null;
  application_url?: string | null;
  application_link?: string | null;
}

/** True when the URL is on a registry-controlled Thai institutional domain. */
export function isOfficialFunderDomain(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const host = new URL(String(url)).hostname.replace(/^www\./, '').toLowerCase();
    return OFFICIAL_TH_DOMAIN.test(host);
  } catch {
    // An unparseable URL is not evidence of anything.
    return false;
  }
}

function usable(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = String(url).trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    // Only http(s). A javascript: or data: URL in this position would be a link the
    // page invites the student to click, which is not somewhere to be relaxed.
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return trimmed;
  } catch {
    return null;
  }
}

/**
 * Pick the best link and say what it is.
 *
 * An institutional URL wins even when it is the application link rather than the source,
 * because the point of the link is for the student to check the scholarship against its
 * own institution. Returns null when there is nothing to link to — the caller renders
 * nothing at all, never a placeholder.
 */
export function resolveSourceLink(s: SourceFields): SourceLink | null {
  const application = usable(s.application_url) ?? usable(s.application_link);
  const source = usable(s.source_url);

  if (isOfficialFunderDomain(application)) return { href: application!, kind: 'official' };
  if (isOfficialFunderDomain(source)) return { href: source!, kind: 'official' };

  // Neither is verifiably the institution. Prefer where we actually found the listing.
  const fallback = source ?? application;
  return fallback ? { href: fallback, kind: 'source' } : null;
}

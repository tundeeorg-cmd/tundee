/**
 * Which link to show for a scholarship, and what we are allowed to call it.
 *
 * The obvious version of this feature — "ดูประกาศต้นทางจาก {funder} →" on every card —
 * cannot be built honestly from the data we have. Measured 30 Aug 2026 across the 491
 * displayed scholarships:
 *
 *     414  source_url is a third-party aggregator (scholarshiptab, eduzones, dek-d, …)
 *     373  application_url is one too
 *      43  either URL is on a registry-controlled Thai institutional domain
 *      26  more sit on an equivalent registry abroad (.edu, .ac.uk, .edu.hk, …)
 *
 * So for roughly five out of six scholarships, a link promising the funder's own
 * announcement would open an ad-supported aggregator instead. On a site whose entire
 * problem is being mistaken for a scam, that is the worst available failure: the student
 * checks the one claim we invited them to check, and it is false. Better to say less.
 *
 * Hence a positive test rather than a blocklist. A blocklist of known aggregators has the
 * opposite failure mode: the next aggregator we have not seen yet gets promoted to "the
 * funder's official announcement" silently. The candidate list for this catalogue
 * contains forms.gle, which is the kind of thing a blocklist would wave through.
 *
 * The cost is under-claiming for real funders outside those domains — daad-thailand.org,
 * studyinnl.org, waseda.jp are official and are still labelled the weaker way. That is the
 * safe direction to be wrong in, and each row upgrades itself the moment someone puts a
 * funder URL in the sheet. Nothing here needs revisiting when that happens.
 */

/**
 * Registry-controlled suffixes: an institution cannot hold one without documented
 * accreditation or government status, which is what makes membership a fact about the
 * URL rather than an opinion about who owns it.
 *
 *   .ac.th .go.th .or.th .mi.th   THNIC, requires Ministry accreditation or registration
 *   .ac.uk .edu.au .edu.hk .go.kr and the other two-letter academic/government registries
 *   .edu .gov .mil                the US restricted TLDs
 *
 * Deliberately structural. A domain like chevening.org or gatescambridge.org plainly
 * belongs to the funder too, but "this suffix is registry-controlled" is checkable by
 * anyone, while "chevening.org is the UK government's scholarship" is something I happen
 * to know. The strong label should rest on the first kind of statement, so hosts of the
 * second kind stay on the weaker label until a person confirms them — see
 * scripts/export_source_host_review.mjs, which lists exactly those.
 *
 * The suffix must terminate the hostname, or "ac.th.evil.com" would qualify.
 */
const REGISTRY_CONTROLLED = new RegExp(
  [
    '\\.(?:ac|go|gov|or|mi|edu)\\.[a-z]{2}$',  // .ac.th, .ac.uk, .edu.au, .go.kr, …
    '\\.(?:edu|gov|mil)$',                      // US restricted TLDs
  ].join('|'),
);

/**
 * Hosts a person has confirmed belong to the funder.
 *
 * These are the ones the registry test cannot reach. chevening.org is the UK government's
 * scholarship and ethz.ch is ETH Zurich, but no property of either URL proves it — that is
 * knowledge, and the point of REGISTRY_CONTROLLED is that it needs none. So the knowledge
 * lives here instead, in a list somebody actually checked, rather than being smuggled into
 * a pattern.
 *
 * Reviewed 30 Aug 2026 from scripts/export_source_host_review.mjs: 42 candidate hosts, 38
 * confirmed, 4 rejected. The rejections are the reason this is a reviewed list and not a
 * "not a known aggregator" rule — forms.gle, docs.google.com, facebook.com and mytcas.com
 * all appeared as candidates, and all four would have been promoted to "the funder's
 * official announcement" by any heuristic that assumes an unrecognised host is a good one.
 *
 * Matched as whole hostnames, not suffixes. A suffix test would accept
 * chevening.org.example.net; this accepts chevening.org and nothing that merely ends in it.
 *
 * Adding a host means someone opened it and confirmed the funder owns it. There is no way
 * to derive an entry here, which is the property that makes the strong label trustworthy.
 */
const REVIEWED_FUNDER_HOSTS: ReadonlySet<string> = new Set([
  'admissions.hku.hk',
  'apply.stipendiumhungaricum.hu',
  'campusfrance.org',
  'chevening.org',
  'connect.schwarzmanscholars.org',
  'daad-thailand.org',
  'dsu.toscana.it',
  'eef-scholarship.thaijobjob.com',
  'epfl.ch',
  'erasmus-plus.ec.europa.eu',
  'eria.org',
  'esteri.it',
  'ethz.ch',
  'future.utoronto.ca',
  'gatescambridge.org',
  'grants.at',
  'lomhaijai.org',
  'lunduniversity.lu.se',
  'nanmee.com',
  'od.globaluni.ru',
  'pao.ssk.in.th',
  'polimi.it',
  'princess-it.org',
  'regist.yesthailand.info',
  'sbfi.admin.ch',
  'scholarship.tiscofoundation.org',
  'sciencespo.fr',
  'searca.org',
  'stfhome.com',
  'studyinnl.org',
  'thailande.campusfrance.org',
  'ualberta.ca',
  'unibo.it',
  'universiteitleiden.nl',
  'uu.se',
  'uwaterloo.ca',
  'uwc.org',
  'you.ubc.ca',
]);

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
    return REGISTRY_CONTROLLED.test(host) || REVIEWED_FUNDER_HOSTS.has(host);
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

/**
 * The link a scholarship shows, and what we are allowed to call it.
 *
 * 414 of the 491 displayed scholarships have a source_url on a third-party aggregator,
 * so the label has to be earned per row rather than asserted for all of them.
 */

import { describe, it, expect } from 'vitest';
import { resolveSourceLink, isOfficialFunderDomain } from '@/lib/scholarships/sourceLink';
import { formatVerifiedDate } from '@/lib/formatDate';

describe('isOfficialFunderDomain', () => {
  it('accepts the registry-controlled Thai institutional domains', () => {
    for (const u of [
      'https://admissions.siit.tu.ac.th/x',
      'https://www.eef.or.th/scholarship',
      'https://ops.go.th/announce',
      'https://rtaf.mi.th/th/grant',
    ]) expect(isOfficialFunderDomain(u)).toBe(true);
  });

  it('rejects the aggregators the catalogue is actually full of', () => {
    for (const u of [
      'https://www.scholarshiptab.com/x',
      'https://www.eduzones.com/2026/06/26/siit-tcas70/',
      'https://dek-d.com/x',
      'https://dekuni.com/lomhaijai69/',
    ]) expect(isOfficialFunderDomain(u)).toBe(false);
  });

  it('accepts the equivalent registries abroad', () => {
    // Same principle as .ac.th: an institution cannot hold one of these without
    // documented accreditation, so membership is checkable rather than assumed.
    for (const u of [
      'https://amherst.edu/admission/aid',
      'https://www.bristol.ac.uk/scholarships',
      'https://join.hkust.edu.hk/awards',
      'https://www.studyinkorea.go.kr/gks',
      'https://nyuad.nyu.edu/en/admissions.html',
    ]) expect(isOfficialFunderDomain(u)).toBe(true);
  });

  it('leaves plainly-real funder domains on the weaker label', () => {
    // chevening.org and gatescambridge.org obviously belong to their funders, but that
    // is knowledge rather than a checkable property of the URL. They stay weak until a
    // person confirms them, which is what the host review file exists for.
    for (const u of [
      'https://www.chevening.org/scholarship/thailand/',
      'https://www.gatescambridge.org/apply/',
      'https://ethz.ch/en/studies/financial.html',
    ]) expect(isOfficialFunderDomain(u)).toBe(false);
  });

  it('does not wave through a form host, which a blocklist would', () => {
    // forms.gle is in this catalogue's candidate list. It is not a funder domain, and
    // it is exactly the case that makes "not a known aggregator" the wrong rule.
    expect(isOfficialFunderDomain('https://forms.gle/abc123')).toBe(false);
  });

  it('is not fooled by a lookalike host', () => {
    // The suffix must terminate the hostname, or "notac.th.evil.com" would pass.
    expect(isOfficialFunderDomain('https://ac.th.evil.com/x')).toBe(false);
    expect(isOfficialFunderDomain('https://fake-ac.th.example.org')).toBe(false);
    expect(isOfficialFunderDomain('https://notedu.com/x')).toBe(false);
    expect(isOfficialFunderDomain('https://edu.com.evil.net/x')).toBe(false);
  });

  it('treats anything unparseable as not official', () => {
    expect(isOfficialFunderDomain('utcc.ac.th')).toBe(false);   // no scheme — 7 rows like this
    expect(isOfficialFunderDomain(null)).toBe(false);
    expect(isOfficialFunderDomain('')).toBe(false);
  });
});

describe('resolveSourceLink', () => {
  const AGG = 'https://www.eduzones.com/2026/06/26/siit-tcas70/';
  const OFFICIAL = 'https://admissions.siit.tu.ac.th';

  it('prefers the institutional URL even when it is the application link', () => {
    // TD-0003 exactly: found on eduzones, applied for at the university.
    expect(resolveSourceLink({ source_url: AGG, application_url: OFFICIAL }))
      .toEqual({ href: OFFICIAL, kind: 'official' });
  });

  it('uses the institutional source when the application link is an aggregator', () => {
    expect(resolveSourceLink({ source_url: OFFICIAL, application_url: AGG }))
      .toEqual({ href: OFFICIAL, kind: 'official' });
  });

  it('falls back to the weaker label rather than overclaiming', () => {
    // The common case: 373 of 491. Never labelled as the funder's own announcement.
    expect(resolveSourceLink({ source_url: AGG, application_url: AGG }))
      .toEqual({ href: AGG, kind: 'source' });
  });

  it('prefers where we found it when neither is institutional', () => {
    const other = 'https://dek-d.com/x';
    expect(resolveSourceLink({ source_url: AGG, application_url: other }).href).toBe(AGG);
  });

  it('renders nothing when there is nothing to link to', () => {
    expect(resolveSourceLink({})).toBeNull();
    expect(resolveSourceLink({ source_url: null, application_url: '  ' })).toBeNull();
  });

  it('refuses a non-http scheme in a link we invite students to click', () => {
    expect(resolveSourceLink({ source_url: 'javascript:alert(1)' })).toBeNull();
    expect(resolveSourceLink({ source_url: 'data:text/html,x' })).toBeNull();
  });

  it('falls back to application_link, the older column name', () => {
    expect(resolveSourceLink({ application_link: AGG })).toEqual({ href: AGG, kind: 'source' });
  });
});

describe('formatVerifiedDate', () => {
  it('renders Buddhist era with spaces, as the brief specifies', () => {
    expect(formatVerifiedDate('2026-08-28', 'th')).toBe('28 ส.ค. 2569');
    expect(formatVerifiedDate('2026-08-28', 'en')).toBe('28 Aug 2026');
  });

  it('reads an ISO timestamp the same way', () => {
    expect(formatVerifiedDate('2026-08-28T11:00:00Z', 'th')).toBe('28 ส.ค. 2569');
  });

  it('returns null rather than inventing a date', () => {
    // The instruction is explicit: a missing date renders as nothing, never as a
    // placeholder and never as today.
    expect(formatVerifiedDate(null, 'th')).toBeNull();
    expect(formatVerifiedDate(undefined, 'th')).toBeNull();
    expect(formatVerifiedDate('', 'th')).toBeNull();
    expect(formatVerifiedDate('not a date', 'th')).toBeNull();
  });
});

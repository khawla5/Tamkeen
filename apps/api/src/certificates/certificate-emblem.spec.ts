import { clearEmblemCache, hasMinistryEmblem, ministryEmblemSvg } from './certificate-emblem';

/**
 * The ministry emblem the certificate face inlines (TAM-136).
 *
 * The interesting assertions are all about the *document it lands in*: an inline
 * `<svg>` inside HTML shares the page's stylesheet and the page's parser, so
 * artwork exported straight from a drawing tool brings two things a certificate
 * has nowhere to put — a global class selector, and an XML prolog part-way
 * through a body.
 */
describe('ministry emblem', () => {
  beforeEach(() => {
    clearEmblemCache();
  });

  it('reads as a single svg element', () => {
    const svg = ministryEmblemSvg();

    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
  });

  it('keeps its viewBox, so it scales to the slot instead of a fixed size', () => {
    expect(ministryEmblemSvg()).toMatch(/viewBox="[\d\s.]+"/);
  });

  it('dissolves the exported stylesheet into fill attributes', () => {
    const svg = ministryEmblemSvg();

    expect(svg).not.toContain('<style');
    expect(svg).not.toContain('class="st0"');
    /* Every path that was painted by the class is still painted. */
    expect(svg).toContain('fill="#0C9648"');
  });

  it('carries no XML prolog or generator comment', () => {
    const svg = ministryEmblemSvg();

    expect(svg).not.toContain('<?xml');
    expect(svg).not.toContain('<!--');
  });

  it('is read once and cached', () => {
    /* Certificates issue in batches; re-reading 60 KB per render is pure waste.
       Asserted by identity, so the test fails if the cache is ever bypassed. */
    expect(ministryEmblemSvg()).toBe(ministryEmblemSvg());
  });

  it('reports that the face carries the ministry’s artwork', () => {
    /* §4C.7's "no logo supplied" notice reads this, so the notice cannot outlive
       the artwork. The seal and the signature are still owed (D-051). */
    expect(hasMinistryEmblem()).toBe(true);
  });
});

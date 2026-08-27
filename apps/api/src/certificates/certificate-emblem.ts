import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The Ministry of Interior emblem, inlined into the certificate face (TAM-136).
 *
 * **The API keeps its own copy, for the same reasons the fonts do.** The web app
 * serves `public/brand/MOI.svg`; PDFs render inside the API, which is deployed
 * on its own, and a runtime read across into `apps/web` would resolve on a
 * developer's machine and be a missing path in a container. The file is also
 * what the ministry supplied — a certificate must not fetch its own crest over
 * the network at render time, because a credential that renders differently
 * when a host is unreachable is not a credential.
 *
 * **Inlined as markup rather than a data URI** so it inherits the sheet's own
 * sizing and stays vector in the PDF at any print size.
 *
 * **What this is not.** D-051's blocker is only half closed: the emblem is real,
 * the *seal* and the signatory's signature are still to come from the ministry.
 * `hasEmblem` is what §4C.7 reads to say so honestly.
 */

/** Resolved from `__dirname` so it is correct under both ts-jest and dist. */
const EMBLEM_PATH = join(__dirname, 'assets', 'ministry-emblem.svg');

let cached: string | null = null;

/**
 * The emblem as an `<svg>` element ready to drop into the page.
 *
 * Two rewrites on the way through, both about the document it lands in:
 *
 *   - the XML prolog and the generator comment are stripped, because an
 *     `<?xml …?>` declaration part-way through an HTML body is not markup the
 *     parser has anywhere to put;
 *   - the artwork's `<style>` block is dissolved into a `fill` attribute on each
 *     path. An inline `<svg>` inside HTML shares the document's stylesheet, so
 *     the exported `.st0` selector would be a global rule named after nothing,
 *     one collision away from repainting part of the certificate.
 */
export function ministryEmblemSvg(): string {
  if (cached !== null) {
    return cached;
  }

  const raw = readFileSync(EMBLEM_PATH, 'utf8');

  const fill = /\.st0\s*\{\s*fill\s*:\s*(#[0-9A-Fa-f]{3,8})\s*;?\s*\}/.exec(raw)?.[1];

  if (fill === undefined) {
    /* Loud rather than a certificate with an invisible crest on it. The rewrite
       below depends on this class existing; if the ministry supplies new
       artwork shaped differently, that must be noticed here and not on paper. */
    throw new Error('ministry-emblem.svg: expected a .st0 fill rule to inline');
  }

  cached = raw
    .replace(/<\?xml[^>]*\?>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/class="st0"/g, `fill="${fill}"`)
    .trim();

  return cached;
}

/**
 * Whether the certificate face carries the ministry's own artwork.
 *
 * A constant today, and deliberately a function: it is what §4C.7's "no logo
 * supplied" notice is driven by, and the day the seal arrives this is where the
 * answer changes rather than in a view model.
 */
export function hasMinistryEmblem(): boolean {
  return true;
}

/** Test seam — lets a suite prove the cache is populated rather than assume it. */
export function clearEmblemCache(): void {
  cached = null;
}

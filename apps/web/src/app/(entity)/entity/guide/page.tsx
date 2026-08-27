import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { parseMarkdown } from '@/lib/markdown';

import { EntityGuideView } from './entity-guide-view';

/**
 * The entity authoring guide (§4B, TAM-134).
 *
 * A server component so the Markdown file is read and parsed once, on the
 * server — `docs/entity-authoring-guide.md` is the one source; this page has
 * no copy of its own, in `ar.json` or anywhere else, so the guide and what an
 * entity actually sees cannot drift apart the way a duplicated copy would.
 *
 * Not in the entity nav (§3, D-071's reasoning): the guide is reached from
 * the three points in the product where the question it answers actually
 * comes up — the create-course card, the content read-back, and a
 * Moodle-side publish blocker — never as a fifth destination competing with
 * the four that already exist.
 */
export default function EntityGuidePage() {
  const path = resolve(process.cwd(), '..', '..', 'docs', 'entity-authoring-guide.md');
  const source = readFileSync(path, 'utf-8');
  const { content } = parseMarkdown(source);

  return <EntityGuideView content={content} />;
}

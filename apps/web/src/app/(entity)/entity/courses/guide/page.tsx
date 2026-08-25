import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { renderMarkdown } from '@/lib/simple-markdown';

import { GuideView } from './guide-view';

/**
 * §4B — the entity authoring guide (TAM-134), rendered from the one source
 * in `docs/entity-authoring-guide.md`. A server component: the file is read at
 * render time, converted by the in-repo Markdown subset, and handed to the
 * client shell as HTML the converter itself wrote (it escapes the source, so
 * `dangerouslySetInnerHTML` carries only our own tags).
 *
 * Two candidate paths, because `process.cwd()` is the workspace in `next dev`
 * / `next start` from `apps/web`, and the repo root when started from there.
 */
const CANDIDATES = [
  join(process.cwd(), '..', '..', 'docs', 'entity-authoring-guide.md'),
  join(process.cwd(), 'docs', 'entity-authoring-guide.md'),
];

function readGuide(): string {
  for (const candidate of CANDIDATES) {
    try {
      return readFileSync(candidate, 'utf8');
    } catch {
      /* try the next one */
    }
  }
  return '';
}

export default function EntityGuidePage() {
  const source = readGuide();
  const { html, headings } = renderMarkdown(source);

  return (
    <GuideView
      html={html}
      sections={headings
        .filter((heading) => heading.level === 2 && heading.id)
        .map((heading) => ({ id: heading.id!, text: heading.text }))}
      missing={source === ''}
    />
  );
}

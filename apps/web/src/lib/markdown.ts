import { createElement, Fragment, type ReactNode } from 'react';

/**
 * A parser for exactly the Markdown subset `entity-authoring-guide.md` uses —
 * headings (with an optional `{#id}` anchor), paragraphs, bold, inline code,
 * links, unordered lists, tables, blockquotes, horizontal rules and a
 * block-level `![alt](src)` image (a screenshot on its own line — this guide
 * never needs one inline inside a sentence). Nothing more.
 *
 * Not `react-markdown`/`remark`: this renders one static, internally-authored
 * document, not arbitrary content, so the usual reasons for a full Markdown
 * ecosystem (untrusted input, CommonMark edge cases, plugin composition)
 * don't apply here — and an unused dependency in a government system is one
 * more thing to review, patch and justify at every audit (D-037 made the same
 * call about a query library). If the guide ever needs a Markdown feature
 * this does not support, that is the signal to add it here, not to reach for
 * a library that would then dwarf the document it renders.
 */

export interface MarkdownHeading {
  id: string;
  text: string;
  level: 2 | 3;
}

export interface ParsedMarkdown {
  content: ReactNode;
  /** In document order, for a future table-of-contents — not consumed yet. */
  headings: MarkdownHeading[];
}

/** Renders inline spans: **bold**, `code`, and [text](url) — in that scan order. */
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /\*\*(.+?)\*\*|`(.+?)`|\[(.+?)\]\((.+?)\)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let index = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const key = `${keyPrefix}-${index}`;
    index += 1;

    if (match[1] !== undefined) {
      nodes.push(
        createElement('strong', { key, className: 'font-semibold text-foreground' }, match[1]),
      );
    } else if (match[2] !== undefined) {
      nodes.push(
        createElement(
          'code',
          { key, className: 'rounded bg-neutral-100 px-1.5 py-0.5 text-xs' },
          match[2],
        ),
      );
    } else {
      const href = match[4]!;
      nodes.push(
        createElement(
          'a',
          {
            key,
            href,
            className: 'font-medium text-primary-700 underline-offset-4 hover:underline',
          },
          match[3],
        ),
      );
    }

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

/** `## Heading text {#anchor-id}` — the id is explicit, never auto-slugified
 *  from Arabic text, so it stays stable and predictable for deep links from
 *  the publish blockers. */
function parseHeading(line: string): { level: 2 | 3; text: string; id: string } | null {
  const match = /^(#{2,3})\s+(.+?)(?:\s+\{#([a-z0-9-]+)\})?$/.exec(line);
  if (!match) return null;

  const level = match[1]!.length === 2 ? 2 : 3;
  const text = match[2]!.trim();
  const id = match[3] ?? text.toLowerCase().replace(/\s+/g, '-');

  return { level, text, id };
}

/** `![alt](src)`, alone on its line — a screenshot, not an inline image. */
function parseImage(line: string): { alt: string; src: string } | null {
  const match = /^!\[(.*?)\]\((\S+?)\)$/.exec(line.trim());

  return match ? { alt: match[1]!, src: match[2]! } : null;
}

export function parseMarkdown(source: string): ParsedMarkdown {
  const lines = source.split('\n');
  const blocks: ReactNode[] = [];
  const headings: MarkdownHeading[] = [];
  let i = 0;
  let blockKey = 0;

  while (i < lines.length) {
    const line = lines[i]!;

    if (line.trim() === '') {
      i += 1;
      continue;
    }

    if (line.trim() === '---') {
      blocks.push(createElement('hr', { key: blockKey++, className: 'my-2 border-border' }));
      i += 1;
      continue;
    }

    const heading = parseHeading(line);
    if (heading) {
      headings.push({ id: heading.id, text: heading.text, level: heading.level });
      const Tag = heading.level === 2 ? 'h2' : 'h3';
      blocks.push(
        createElement(
          Tag,
          {
            key: blockKey++,
            id: heading.id,
            className:
              heading.level === 2
                ? 'mt-8 scroll-mt-20 text-xl font-semibold text-foreground first:mt-0'
                : 'mt-6 scroll-mt-20 text-lg font-semibold text-foreground',
          },
          heading.text,
        ),
      );
      i += 1;
      continue;
    }

    const image = parseImage(line);
    if (image) {
      blocks.push(
        createElement('img', {
          key: blockKey++,
          src: image.src,
          alt: image.alt,
          loading: 'lazy',
          className: 'w-full rounded-md border border-border',
        }),
      );
      i += 1;
      continue;
    }

    if (line.startsWith('> ')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i]!.startsWith('> ')) {
        quoteLines.push(lines[i]!.slice(2));
        i += 1;
      }
      const text = quoteLines.join(' ');
      blocks.push(
        createElement(
          'blockquote',
          {
            key: blockKey++,
            className: 'rounded-md border-e-4 border-primary-600 bg-primary-50 px-4 py-3 text-sm',
          },
          renderInline(text, `bq-${blockKey}`),
        ),
      );
      continue;
    }

    if (line.startsWith('- ')) {
      const items: string[] = [];
      while (i < lines.length && lines[i]!.startsWith('- ')) {
        items.push(lines[i]!.slice(2));
        i += 1;
      }
      blocks.push(
        createElement(
          'ul',
          { key: blockKey++, className: 'list-disc space-y-1 ps-5 text-sm' },
          items.map((item, itemIndex) =>
            createElement(
              'li',
              { key: itemIndex },
              renderInline(item, `li-${blockKey}-${itemIndex}`),
            ),
          ),
        ),
      );
      continue;
    }

    if (line.startsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i]!.startsWith('|')) {
        tableLines.push(lines[i]!);
        i += 1;
      }
      /* Row 2 is the `---|---` separator — every table in this document has
         one, since it is what makes a table a table rather than a paragraph
         that happens to contain pipes. */
      const rows = [tableLines[0]!, ...tableLines.slice(2)].map((row) =>
        row
          .split('|')
          .slice(1, -1)
          .map((cell) => cell.trim()),
      );
      const [head, ...body] = rows;

      blocks.push(
        createElement(
          'div',
          { key: blockKey++, className: 'overflow-x-auto' },
          createElement(
            'table',
            { className: 'w-full border-collapse text-sm' },
            createElement(
              'thead',
              null,
              createElement(
                'tr',
                { className: 'border-b border-border' },
                head!.map((cell, cellIndex) =>
                  createElement(
                    'th',
                    {
                      key: cellIndex,
                      className: 'px-3 py-2 text-start font-semibold text-foreground',
                    },
                    renderInline(cell, `th-${blockKey}-${cellIndex}`),
                  ),
                ),
              ),
            ),
            createElement(
              'tbody',
              null,
              body.map((row, rowIndex) =>
                createElement(
                  'tr',
                  { key: rowIndex, className: 'border-b border-border last:border-0' },
                  row.map((cell, cellIndex) =>
                    createElement(
                      'td',
                      { key: cellIndex, className: 'px-3 py-2 align-top text-muted-foreground' },
                      renderInline(cell, `td-${blockKey}-${rowIndex}-${cellIndex}`),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      );
      continue;
    }

    /* A paragraph: everything up to the next blank line or block-starting
       token, joined with spaces the way a reflowed paragraph reads. */
    const paragraphLines: string[] = [];
    while (
      i < lines.length &&
      lines[i]!.trim() !== '' &&
      !parseHeading(lines[i]!) &&
      lines[i]!.trim() !== '---' &&
      !lines[i]!.startsWith('- ') &&
      !lines[i]!.startsWith('> ') &&
      !lines[i]!.startsWith('|') &&
      !parseImage(lines[i]!)
    ) {
      paragraphLines.push(lines[i]!);
      i += 1;
    }
    blocks.push(
      createElement(
        'p',
        { key: blockKey++, className: 'text-sm leading-7 text-foreground' },
        renderInline(paragraphLines.join(' '), `p-${blockKey}`),
      ),
    );
  }

  return { content: createElement(Fragment, null, blocks), headings };
}

/**
 * A deliberately small Markdown → HTML converter for documents we author
 * ourselves (TAM-134's authoring guide). Zero dependencies, on purpose: the
 * guide uses headings, paragraphs, lists, bold, inline code and links, and a
 * converter for exactly that subset is forty lines we can read — a general
 * Markdown library would be a new dependency to review for a government repo
 * and would still need escaping rules of our own.
 *
 * Supported:
 *   #, ##, ### headings — with an optional `{#anchor}` suffix that becomes the id
 *   paragraphs, `-` bullet lists, `1.` numbered lists (one level)
 *   **bold**, `code`, [text](href) — hrefs restricted to relative, `#`, http(s)
 *
 * Everything is HTML-escaped first, so the source can never inject markup; the
 * only tags in the output are the ones this file writes.
 */

const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const SAFE_HREF = /^(#|\/|\.\/|\.\.\/|https?:\/\/)/;

function inline(text: string): string {
  let out = escapeHtml(text);
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_match, label: string, href: string) =>
    SAFE_HREF.test(href) ? `<a href="${href}">${label}</a>` : label,
  );
  return out;
}

const HEADING = /^(#{1,3})\s+(.*?)(?:\s+\{#([A-Za-z0-9_-]+)\})?\s*$/;
const BULLET = /^-\s+(.*)$/;
const NUMBERED = /^\d+\.\s+(.*)$/;

export interface MarkdownHeading {
  level: 1 | 2 | 3;
  id: string | null;
  text: string;
}

export function renderMarkdown(source: string): { html: string; headings: MarkdownHeading[] } {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const html: string[] = [];
  const headings: MarkdownHeading[] = [];
  let paragraph: string[] = [];
  let list: { tag: 'ul' | 'ol'; items: string[] } | null = null;

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      html.push(`<p>${inline(paragraph.join(' '))}</p>`);
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list) {
      html.push(
        `<${list.tag}>${list.items.map((item) => `<li>${item}</li>`).join('')}</${list.tag}>`,
      );
      list = null;
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (line.trim() === '') {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1]!.length as 1 | 2 | 3;
      const text = heading[2]!.trim();
      const id = heading[3] ?? null;
      headings.push({ level, id, text });
      html.push(`<h${level}${id ? ` id="${id}"` : ''}>${inline(text)}</h${level}>`);
      continue;
    }

    const bullet = BULLET.exec(line);
    const numbered = bullet ? null : NUMBERED.exec(line);
    if (bullet || numbered) {
      flushParagraph();
      const tag = bullet ? 'ul' : 'ol';
      const item = inline((bullet ?? numbered)![1]!);
      if (!list || list.tag !== tag) {
        flushList();
        list = { tag, items: [] };
      }
      list.items.push(item);
      continue;
    }

    flushList();
    paragraph.push(line.trim());
  }

  flushParagraph();
  flushList();

  return { html: html.join('\n'), headings };
}

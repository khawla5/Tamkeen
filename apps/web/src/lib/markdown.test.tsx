import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { parseMarkdown } from './markdown';

/**
 * Covers exactly the subset `entity-authoring-guide.md` uses (TAM-134) — see
 * the doc comment on `parseMarkdown` for why this is a bespoke parser rather
 * than a library.
 */

describe('parseMarkdown', () => {
  it('gives headings a stable id from an explicit {#anchor}, not an auto-slug', () => {
    const { headings } = parseMarkdown('## شروط الإكمال {#completion}\n\nنص.');

    expect(headings).toEqual([{ id: 'completion', text: 'شروط الإكمال', level: 2 }]);
  });

  it('falls back to a slug of the heading text when no {#anchor} is given', () => {
    const { headings } = parseMarkdown('### Open Editor\n\nنص.');

    expect(headings[0]).toMatchObject({ id: 'open-editor', level: 3 });
  });

  it('renders headings, at the right level, with their id set on the element', () => {
    const { content } = parseMarkdown('## القسم {#section}\n\n### فرعي {#sub}\n\nنص.');
    render(content);

    expect(screen.getByRole('heading', { level: 2, name: 'القسم' })).toHaveAttribute(
      'id',
      'section',
    );
    expect(screen.getByRole('heading', { level: 3, name: 'فرعي' })).toHaveAttribute('id', 'sub');
  });

  it('renders bold, inline code and links within a paragraph', () => {
    const { content } = parseMarkdown('نص **مهم** و`رمز` و[رابط](/entity/guide).');
    render(content);

    expect(screen.getByText('مهم').tagName).toBe('STRONG');
    expect(screen.getByText('رمز').tagName).toBe('CODE');
    expect(screen.getByRole('link', { name: 'رابط' })).toHaveAttribute('href', '/entity/guide');
  });

  it('joins a wrapped paragraph onto one line', () => {
    const { content } = parseMarkdown('السطر الأول\nالسطر الثاني');
    render(content);

    expect(screen.getByText('السطر الأول السطر الثاني')).toBeInTheDocument();
  });

  it('renders a dash list as list items', () => {
    const { content } = parseMarkdown('- أول\n- ثاني\n- ثالث');
    render(content);

    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'أول',
      'ثاني',
      'ثالث',
    ]);
  });

  it('renders a table with its header and body rows, skipping the separator row', () => {
    const { content } = parseMarkdown('| طريقة | متى |\n| --- | --- |\n| URL | فيديو طويل |');
    render(content);

    expect(screen.getByRole('columnheader', { name: 'طريقة' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'URL' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'فيديو طويل' })).toBeInTheDocument();
  });

  it('renders a blockquote, joining its lines with a space', () => {
    const { content } = parseMarkdown('> السطر الأول\n> السطر الثاني');
    render(content);

    expect(screen.getByText('السطر الأول السطر الثاني').tagName).toBe('BLOCKQUOTE');
  });

  it('renders --- as a horizontal rule', () => {
    const { content } = parseMarkdown('نص أول\n\n---\n\nنص ثاني');
    const { container } = render(content);

    expect(container.querySelector('hr')).not.toBeNull();
  });
});

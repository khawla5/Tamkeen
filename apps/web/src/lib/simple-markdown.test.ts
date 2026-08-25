import { describe, expect, it } from 'vitest';

import { renderMarkdown } from './simple-markdown';

describe('renderMarkdown (TAM-134)', () => {
  it('renders headings with anchor ids, paragraphs and both list kinds', () => {
    const { html, headings } = renderMarkdown(
      [
        '# عنوان',
        '',
        '## قسم {#create}',
        'فقرة أولى',
        'تكملة',
        '',
        '- أ',
        '- ب',
        '',
        '1. واحد',
        '2. اثنان',
      ].join('\n'),
    );

    expect(html).toContain('<h1>عنوان</h1>');
    expect(html).toContain('<h2 id="create">قسم</h2>');
    expect(html).toContain('<p>فقرة أولى تكملة</p>');
    expect(html).toContain('<ul><li>أ</li><li>ب</li></ul>');
    expect(html).toContain('<ol><li>واحد</li><li>اثنان</li></ol>');
    expect(headings).toEqual([
      { level: 1, id: null, text: 'عنوان' },
      { level: 2, id: 'create', text: 'قسم' },
    ]);
  });

  it('renders bold, code and safe links inline', () => {
    const { html } = renderMarkdown(
      'اضغط **حفظ** ثم `.mp4` — [القسم](#completion) و[موقع](https://x.example)',
    );

    expect(html).toContain('<strong>حفظ</strong>');
    expect(html).toContain('<code>.mp4</code>');
    expect(html).toContain('<a href="#completion">القسم</a>');
    expect(html).toContain('<a href="https://x.example">موقع</a>');
  });

  it('escapes HTML in the source and drops unsafe link targets', () => {
    const { html } = renderMarkdown('<script>x</script> [نص](javascript:alert(1))');

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('نص');
  });

  it('handles Windows line endings', () => {
    expect(renderMarkdown('## أ {#a}\r\n\r\nنص\r\n').html).toBe('<h2 id="a">أ</h2>\n<p>نص</p>');
  });
});

import { toCsv } from './csv';

/**
 * The CSV writer (D-076).
 *
 * Small, and every case here is one that has produced a real support ticket in
 * some other product: a BOM-less export that Excel reads as mojibake, a title
 * with a comma that shifts every column after it, and a value beginning with `=`
 * that Excel evaluates as a formula.
 */
describe('toCsv', () => {
  it('starts with a byte-order mark', () => {
    /* Excel does not sniff UTF-8. Without this, every Arabic name in the file
       is read as the system codepage and arrives as mojibake — which is the
       whole reason the ministry could not open the report. */
    expect(toCsv(['a'], [['b']]).charCodeAt(0)).toBe(0xfeff);
  });

  it('round-trips Arabic unchanged', () => {
    const csv = toCsv(['الاسم'], [['سارة العتيبي']]);

    expect(csv).toContain('الاسم');
    expect(csv).toContain('سارة العتيبي');
  });

  it('uses CRLF, which is what RFC 4180 and Excel expect', () => {
    expect(toCsv(['a', 'b'], [['1', '2']])).toBe('﻿a,b\r\n1,2\r\n');
  });

  it('quotes a value containing a comma', () => {
    expect(toCsv(['t'], [['القيادة, والتفاوض']])).toContain('"القيادة, والتفاوض"');
  });

  it('doubles an embedded quote rather than escaping it', () => {
    /* CSV has no backslash escape; a quote is written twice. */
    expect(toCsv(['t'], [['قال "نعم"']])).toContain('"قال ""نعم"""');
  });

  it('quotes a value containing a newline, so one row stays one row', () => {
    /* Course titles and descriptions are authored text. A stray line break would
       otherwise split a row silently, and the file would look fine. */
    const csv = toCsv(['t'], [['سطر\nآخر']]);

    expect(csv).toContain('"سطر\nآخر"');
  });

  it('defuses a value Excel would treat as a formula', () => {
    /*
     * `=`, `+`, `-` and `@` start a formula in Excel. A course title beginning
     * with a hyphen becomes an error cell; a crafted one becomes a formula that
     * runs when somebody opens the file. Quoting alone does not stop it — the
     * value is prefixed.
     */
    for (const dangerous of ['=1+1', '+1', '-1', '@SUM(A1)']) {
      const csv = toCsv(['t'], [[dangerous]]);

      expect(csv).not.toContain(`,${dangerous}`);
      expect(csv).toContain(`'${dangerous}`);
    }
  });

  it('renders null and undefined as an empty cell, not as the word', () => {
    expect(toCsv(['a', 'b'], [[null, undefined]])).toBe('﻿a,b\r\n,\r\n');
  });

  it('renders numbers without quoting them', () => {
    /* A quoted number is text in Excel, and a column of text will not sum. */
    expect(toCsv(['n'], [[70]])).toContain('\r\n70\r\n');
  });

  it('writes a header-only file when there is nothing to report', () => {
    /* An empty report is a real answer — "nobody has completed a path yet" —
       and a zero-byte file is not. */
    expect(toCsv(['a', 'b'], [])).toBe('﻿a,b\r\n');
  });
});

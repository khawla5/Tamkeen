/**
 * CSV, written for Excel (D-076).
 *
 * **The BOM is the whole reason this file exists.** Excel does not sniff UTF-8:
 * a BOM-less file is read as the system codepage, and every Arabic name in it
 * becomes mojibake. Three bytes are the difference between a report the ministry
 * can open and one they cannot, and every other consumer — LibreOffice, `csv` in
 * Python, pandas — skips them without noticing.
 *
 * Deliberately hand-written rather than a dependency. The whole of CSV that this
 * needs is quoting, and a package would be one more thing to review, patch and
 * justify in a government build for forty lines of string handling.
 */

/** U+FEFF. Prepended to every export; see above. */
const BOM = '﻿';

export const CSV_CONTENT_TYPE = 'text/csv; charset=utf-8';

/**
 * Quotes one field.
 *
 * A field is quoted when it contains a comma, a quote, or any newline — and the
 * newline case is the one that matters here, because course titles and path
 * descriptions are authored text and a stray line break would otherwise split
 * one row into two silently.
 *
 * Also quoted: anything starting with `=`, `+`, `-` or `@`. Excel treats those
 * as formulas, so a title beginning with a hyphen becomes an error cell — and
 * worse, a crafted value becomes a formula that runs when somebody opens the
 * file. Prefixing a tab is the usual fix; quoting alone does not stop it, so the
 * value is prefixed too.
 */
function field(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  const raw = String(value);
  const risky = /^[=+\-@\t\r]/.test(raw);
  const text = risky ? `'${raw}` : raw;

  if (/[",\r\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }

  return text;
}

/**
 * Renders rows as a CSV document.
 *
 * CRLF line endings, which is what RFC 4180 specifies and what Excel on Windows
 * expects — the ministry's environment.
 */
export function toCsv(headers: readonly string[], rows: ReadonlyArray<readonly unknown[]>): string {
  const lines = [headers.map(field).join(','), ...rows.map((row) => row.map(field).join(','))];

  return BOM + lines.join('\r\n') + '\r\n';
}

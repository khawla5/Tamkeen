import { afterEach, describe, expect, it, vi } from 'vitest';

import { HTML_DIR, HTML_LANG, getFormatContext } from './config';

describe('web locale configuration', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('renders the document as Arabic and RTL, unconditionally (D-001)', () => {
    expect(HTML_LANG).toBe('ar');
    expect(HTML_DIR).toBe('rtl');
  });

  it('defaults to Western digits and the Gregorian calendar (D-018)', () => {
    expect(getFormatContext()).toEqual({
      locale: 'ar',
      numberFormat: 'western',
      calendar: 'gregory',
    });
  });

  it('honours NUMBER_FORMAT=arabic-indic from the environment alone', () => {
    vi.stubEnv('NUMBER_FORMAT', 'arabic-indic');

    expect(getFormatContext().numberFormat).toBe('arabic-indic');
  });

  it('honours the optional Hijri calendar from the environment alone', () => {
    vi.stubEnv('DATE_CALENDAR', 'islamic-umalqura');

    expect(getFormatContext().calendar).toBe('islamic-umalqura');
  });

  it('falls back to the documented default on an unrecognised NUMBER_FORMAT', () => {
    vi.stubEnv('NUMBER_FORMAT', 'roman');

    expect(getFormatContext().numberFormat).toBe('western');
  });

  it('never emits a Unicode extension subtag as the html lang value', () => {
    // `ar-u-nu-latn` would be invalid in `lang`; that tag belongs to Intl only.
    expect(HTML_LANG).not.toContain('-u-');
  });
});

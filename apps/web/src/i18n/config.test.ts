import { afterEach, describe, expect, it, vi } from 'vitest';

import { baseLocale, getFormatContext, htmlDir, htmlLang, resolveLocale } from './config';

describe('web locale configuration', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('renders Arabic as RTL and English as LTR, with direction derived not stored', () => {
    expect(htmlLang('ar')).toBe('ar');
    expect(htmlDir('ar')).toBe('rtl');
    expect(htmlLang('en')).toBe('en');
    expect(htmlDir('en')).toBe('ltr');
  });

  /*
   * Arabic is the default and the fallback (D-001, D-041): a visitor with no
   * cookie, or a corrupted one, gets the primary product rather than an error.
   * A regression here would silently switch the ministry's default language.
   */
  it('falls back to Arabic for a missing or unrecognised locale cookie', () => {
    expect(resolveLocale(undefined)).toBe('ar');
    expect(resolveLocale('')).toBe('ar');
    expect(resolveLocale('fr')).toBe('ar');
    expect(resolveLocale('en')).toBe('en');
    expect(resolveLocale('ar')).toBe('ar');
  });

  /*
   * next-intl is handed the *extended* tag so ICU-embedded numbers honour the
   * D-018 digit switch. Client components read that tag back, so recovering the
   * bare locale from it has to work — otherwise the switcher would compare
   * "ar-u-nu-latn-ca-gregory" against "ar" and always offer the wrong language.
   */
  it('recovers the bare locale from the extended Intl tag', () => {
    expect(baseLocale('ar-u-nu-latn-ca-gregory')).toBe('ar');
    expect(baseLocale('en-u-nu-latn-ca-gregory')).toBe('en');
    expect(baseLocale('ar')).toBe('ar');
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
    expect(htmlLang('ar')).not.toContain('-u-');
    expect(htmlLang('en')).not.toContain('-u-');
  });
});

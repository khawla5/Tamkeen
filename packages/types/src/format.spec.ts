import { beforeEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_FORMAT_CONTEXT,
  clearFormatterCaches,
  formatDate,
  formatFraction,
  formatLocaleTag,
  formatNumber,
  formatPercent,
  type FormatContext,
} from './format';

const WESTERN_DIGITS = /[0-9]/;
const ARABIC_INDIC_DIGITS = /[٠-٩]/;

const arabicIndic: FormatContext = { ...DEFAULT_FORMAT_CONTEXT, numberFormat: 'arabic-indic' };
const hijri: FormatContext = { ...DEFAULT_FORMAT_CONTEXT, calendar: 'islamic-umalqura' };

describe('formatting layer (D-018)', () => {
  beforeEach(() => {
    clearFormatterCaches();
  });

  describe('defaults', () => {
    it('defaults to Arabic locale, Western digits, Gregorian calendar', () => {
      expect(DEFAULT_FORMAT_CONTEXT).toEqual({
        locale: 'ar',
        numberFormat: 'western',
        calendar: 'gregory',
      });
    });

    it('builds a locale tag carrying both the digit system and the calendar', () => {
      expect(formatLocaleTag(DEFAULT_FORMAT_CONTEXT)).toBe('ar-u-nu-latn-ca-gregory');
      expect(formatLocaleTag(arabicIndic)).toBe('ar-u-nu-arab-ca-gregory');
      expect(formatLocaleTag(hijri)).toBe('ar-u-nu-latn-ca-islamic-umalqura');
    });
  });

  describe('numbers', () => {
    it('uses Western Arabic numerals by default', () => {
      const output = formatNumber(1234);

      expect(output).toMatch(WESTERN_DIGITS);
      expect(output).not.toMatch(ARABIC_INDIC_DIGITS);
    });

    it('switches every digit to Arabic-Indic from the context alone', () => {
      const output = formatNumber(1234, arabicIndic);

      expect(output).toMatch(ARABIC_INDIC_DIGITS);
      expect(output).not.toMatch(WESTERN_DIGITS);
    });

    it('formats a quiz grade on the 0-100 scale Moodle returns', () => {
      expect(formatPercent(70)).toContain('70');
      expect(formatPercent(70)).toContain('%');
    });

    it('formats the path-build counter as "current من total" (§4.5)', () => {
      expect(formatFraction(4, 10)).toBe('4 من 10');
    });

    it('honours the digit switch inside the counter too', () => {
      const output = formatFraction(4, 10, arabicIndic);

      expect(output).toContain('من');
      expect(output).not.toMatch(WESTERN_DIGITS);
    });
  });

  describe('dates', () => {
    const date = new Date(Date.UTC(2026, 7, 17));

    it('renders long dates with Arabic month names', () => {
      const output = formatDate(date);

      expect(output).toContain('2026');
      // Arabic script present => month name was localised, not left in English.
      expect(output).toMatch(/[؀-ۿ]/);
    });

    it('renders short dates numerically', () => {
      expect(formatDate(date, DEFAULT_FORMAT_CONTEXT, 'short')).toMatch(/2026/);
    });

    it('supports the optional Hijri presentation without touching feature code', () => {
      const output = formatDate(date, hijri);

      // 2026-08-17 Gregorian falls in 1448 AH.
      expect(output).toContain('1448');
    });

    it('applies the digit switch to dates as well as numbers', () => {
      const output = formatDate(date, { ...arabicIndic }, 'short');

      expect(output).toMatch(ARABIC_INDIC_DIGITS);
      expect(output).not.toMatch(WESTERN_DIGITS);
    });
  });

  describe('formatter cache', () => {
    it('does not bleed one context’s digits into another', () => {
      expect(formatNumber(5)).toMatch(WESTERN_DIGITS);
      expect(formatNumber(5, arabicIndic)).toMatch(ARABIC_INDIC_DIGITS);
      expect(formatNumber(5)).toMatch(WESTERN_DIGITS);
    });
  });
});

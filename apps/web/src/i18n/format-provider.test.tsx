import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DEFAULT_FORMAT_CONTEXT, type FormatContext } from '@tamkeen/types';

import { FormatProvider, useFormat } from './format-provider';

const ARABIC_INDIC_DIGITS = /[٠-٩]/;
const WESTERN_DIGITS = /[0-9]/;

function Probe() {
  const f = useFormat();

  return (
    <div>
      <span data-testid="number">{f.number(1234)}</span>
      <span data-testid="percent">{f.percent(85)}</span>
      <span data-testid="fraction">{f.fraction(4, 10)}</span>
      <span data-testid="date">{f.date(new Date(Date.UTC(2026, 7, 17)), 'short')}</span>
    </div>
  );
}

describe('FormatProvider / useFormat', () => {
  it('formats with Western digits under the default context', () => {
    render(
      <FormatProvider context={DEFAULT_FORMAT_CONTEXT}>
        <Probe />
      </FormatProvider>,
    );

    expect(screen.getByTestId('number').textContent).toMatch(WESTERN_DIGITS);
    expect(screen.getByTestId('number').textContent).not.toMatch(ARABIC_INDIC_DIGITS);
  });

  it('switches every client-rendered figure when the context changes (D-018)', () => {
    const arabicIndic: FormatContext = {
      ...DEFAULT_FORMAT_CONTEXT,
      numberFormat: 'arabic-indic',
    };

    render(
      <FormatProvider context={arabicIndic}>
        <Probe />
      </FormatProvider>,
    );

    for (const id of ['number', 'percent', 'fraction', 'date']) {
      const text = screen.getByTestId(id).textContent ?? '';
      expect(text, `${id} should use Arabic-Indic digits`).toMatch(ARABIC_INDIC_DIGITS);
      expect(text, `${id} should contain no Western digits`).not.toMatch(WESTERN_DIGITS);
    }
  });

  it('falls back to the default context when no provider is mounted', () => {
    render(<Probe />);

    expect(screen.getByTestId('number').textContent).toMatch(WESTERN_DIGITS);
  });
});

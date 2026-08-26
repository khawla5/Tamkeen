import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Input } from './input';
import { Textarea } from './textarea';

describe('Textarea (TAM-118)', () => {
  it('is a labelled multi-line field that reports invalidity through aria-invalid', () => {
    render(
      <>
        <label htmlFor="notes">ملاحظات</label>
        <Textarea id="notes" aria-invalid="true" />
      </>,
    );

    const field = screen.getByLabelText('ملاحظات');
    expect(field.tagName).toBe('TEXTAREA');
    expect(field).toHaveAttribute('rows', '4');
    expect(field.className).toMatch(/aria-\[invalid=true\]:border-danger/);
  });

  it('shares the Input anatomy: same radius, edge and focus ring', () => {
    const { container } = render(
      <>
        <Input />
        <Textarea />
      </>,
    );
    const [input, textarea] = Array.from(container.children) as HTMLElement[];

    for (const token of [
      'rounded-[4px]',
      'border-neutral-400',
      'focus-visible:border-primary-600',
    ]) {
      expect(input!.className).toContain(token);
      expect(textarea!.className).toContain(token);
    }
  });
});

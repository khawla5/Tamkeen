import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Progress } from './progress';

describe('Progress (TAM-118)', () => {
  it('is a labelled progressbar whose value is spoken in Arabic, and also written', () => {
    render(<Progress value={3} max={7} label="تقدم المسار" valueText="3 من 7 دورات مكتملة" />);

    const bar = screen.getByRole('progressbar', { name: 'تقدم المسار' });
    expect(bar).toHaveAttribute('aria-valuenow', '3');
    expect(bar).toHaveAttribute('aria-valuemax', '7');
    expect(bar).toHaveAttribute('aria-valuetext', '3 من 7 دورات مكتملة');
    /* WCAG 1.4.1: the state is in the text, not only in the fill. */
    expect(screen.getByText('3 من 7 دورات مكتملة')).toBeVisible();
  });

  it('fills the primary over a neutral track, proportionally, and never past the ends', () => {
    const { container, rerender } = render(
      <Progress value={1} max={4} label="x" valueText="1 من 4" />,
    );
    const track = screen.getByRole('progressbar');
    const fill = track.firstElementChild as HTMLElement;

    expect(track.className).toMatch(/bg-neutral-200/);
    expect(fill.className).toMatch(/bg-primary-600/);
    expect(fill.style.width).toBe('25%');

    rerender(<Progress value={9} max={4} label="x" valueText="9 من 4" />);
    expect(fill.style.width).toBe('100%');

    rerender(<Progress value={2} max={0} label="x" valueText="—" />);
    /* A zero maximum is a data problem, not a division-by-zero problem. */
    expect(fill.style.width).toBe('100%');
    expect(container).toBeInTheDocument();
  });
});

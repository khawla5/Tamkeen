import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Badge, Tag } from './badge';

describe('Badge / Tag (TAM-118)', () => {
  it('is inline text a screen reader reads as part of its sentence', () => {
    render(
      <p>
        مسار الأمن <Badge variant="primary">موصى به</Badge>
      </p>,
    );

    expect(screen.getByText('موصى به').tagName).toBe('SPAN');
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('gives each status tone its own fill and text colour, never colour alone', () => {
    const { container } = render(
      <>
        <Badge variant="success">ناجح</Badge>
        <Badge variant="warning">قيد المراجعة</Badge>
        <Badge variant="danger">مرفوض</Badge>
        <Badge variant="info">جديد</Badge>
        <Badge variant="neutral">عام</Badge>
      </>,
    );
    const chips = Array.from(container.querySelectorAll('span'));

    expect(chips.map((chip) => chip.className)).toEqual([
      expect.stringMatching(/bg-success-50.*text-success/),
      expect.stringMatching(/bg-warning-50.*text-warning/),
      expect.stringMatching(/bg-danger-50.*text-danger/),
      expect.stringMatching(/bg-info-50.*text-info/),
      expect.stringMatching(/bg-neutral-100.*text-neutral-700/),
    ]);
    /* Every chip has words in it — the tone repeats the meaning, it is not it. */
    for (const chip of chips) expect(chip.textContent!.trim().length).toBeGreaterThan(0);
  });

  it('keeps the older names working as aliases', () => {
    const { container } = render(<Badge variant="soft">قديم</Badge>);

    expect(container.firstElementChild!.className).toMatch(/bg-neutral-100/);
  });

  it('is also exported under the system’s own name', () => {
    expect(Tag).toBe(Badge);
  });
});

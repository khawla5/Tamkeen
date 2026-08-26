import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { Tabs } from './tabs';

const ITEMS = [
  { value: 'a', label: 'التقييم' },
  { value: 'b', label: 'المسار' },
  { value: 'c', label: 'الدورات' },
] as const;

function Harness({ dir = 'rtl' }: { dir?: 'rtl' | 'ltr' }) {
  const [value, setValue] = useState('a');
  return (
    <div dir={dir} style={{ direction: dir }}>
      <Tabs items={ITEMS} value={value} onValueChange={setValue} label="المراحل">
        <p>لوحة {value}</p>
      </Tabs>
    </div>
  );
}

describe('Tabs (TAM-118)', () => {
  it('is a named tablist with one selected tab labelling the panel', () => {
    render(<Harness />);

    expect(screen.getByRole('tablist', { name: 'المراحل' })).toBeInTheDocument();
    const selected = screen.getByRole('tab', { selected: true });
    expect(selected).toHaveTextContent('التقييم');
    expect(screen.getByRole('tabpanel', { name: 'التقييم' })).toHaveTextContent('لوحة a');
  });

  it('keeps exactly one tab in the tab order', () => {
    render(<Harness />);
    const tabs = screen.getAllByRole('tab');

    expect(tabs.map((tab) => tab.tabIndex)).toEqual([0, -1, -1]);
  });

  it('selects on click', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('tab', { name: 'الدورات' }));
    expect(screen.getByRole('tab', { selected: true })).toHaveTextContent('الدورات');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('لوحة c');
  });

  it('advances with ArrowLeft in an RTL page, wraps, and moves focus with selection', async () => {
    const user = userEvent.setup();
    render(<Harness dir="rtl" />);

    screen.getByRole('tab', { name: 'التقييم' }).focus();
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('tab', { selected: true })).toHaveTextContent('المسار');
    expect(screen.getByRole('tab', { name: 'المسار' })).toHaveFocus();

    await user.keyboard('{ArrowLeft}{ArrowLeft}');
    /* Past the end comes back to the start. */
    expect(screen.getByRole('tab', { selected: true })).toHaveTextContent('التقييم');

    await user.keyboard('{End}');
    expect(screen.getByRole('tab', { selected: true })).toHaveTextContent('الدورات');
    await user.keyboard('{Home}');
    expect(screen.getByRole('tab', { selected: true })).toHaveTextContent('التقييم');
  });

  it('advances with ArrowRight in an LTR context', async () => {
    const user = userEvent.setup();
    render(<Harness dir="ltr" />);

    screen.getByRole('tab', { name: 'التقييم' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { selected: true })).toHaveTextContent('المسار');
  });
});

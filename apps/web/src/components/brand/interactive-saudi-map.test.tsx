import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { InteractiveSaudiMap } from './interactive-saudi-map';
import { SAUDI_REGIONS } from './saudi-map-paths';

describe('InteractiveSaudiMap', () => {
  it('offers every region as a named button, none of them pressed at first', () => {
    render(<InteractiveSaudiMap label="الخريطة" selectedId={null} onSelect={vi.fn()} />);

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(SAUDI_REGIONS.length);
    expect(screen.getByRole('button', { name: 'الرياض' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('group', { name: 'الخريطة' })).toBeInTheDocument();
  });

  it('reports the region that was clicked', async () => {
    const onSelect = vi.fn();
    render(<InteractiveSaudiMap label="الخريطة" selectedId={null} onSelect={onSelect} />);

    await userEvent.setup().click(screen.getByRole('button', { name: 'عسير' }));

    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ name: 'عسير' }));
  });

  it('marks the selected region as pressed, and clicking it again clears the selection', async () => {
    const onSelect = vi.fn();
    const riyadh = SAUDI_REGIONS.find((region) => region.name === 'الرياض')!;

    render(<InteractiveSaudiMap label="الخريطة" selectedId={riyadh.id} onSelect={onSelect} />);

    const button = screen.getByRole('button', { name: 'الرياض' });
    expect(button).toHaveAttribute('aria-pressed', 'true');

    await userEvent.setup().click(button);
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it('selects from the keyboard with Enter and Space', async () => {
    const onSelect = vi.fn();
    render(<InteractiveSaudiMap label="الخريطة" selectedId={null} onSelect={onSelect} />);

    const user = userEvent.setup();
    const button = screen.getByRole('button', { name: 'تبوك' });

    button.focus();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');

    expect(onSelect).toHaveBeenCalledTimes(2);
  });
});

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

  describe('showing data (bands and captions)', () => {
    const riyadh = SAUDI_REGIONS.find((region) => region.name === 'الرياض')!;

    it('names a region with its caption, so the shading is never the only carrier', () => {
      render(
        <InteractiveSaudiMap
          label="الخريطة"
          selectedId={null}
          onSelect={vi.fn()}
          bands={{ [riyadh.id]: 'high' }}
          captions={{ [riyadh.id]: '77%' }}
        />,
      );

      expect(screen.getByRole('button', { name: 'الرياض، 77%' })).toBeInTheDocument();
      /* The caption is also printed on the map itself. */
      expect(screen.getByText('77%')).toBeInTheDocument();
    });

    it('shades by band, and shows a selection by outline — the fill still belongs to the data', () => {
      const { container } = render(
        <InteractiveSaudiMap
          label="الخريطة"
          selectedId={riyadh.id}
          onSelect={vi.fn()}
          bands={{ [riyadh.id]: 'low' }}
        />,
      );

      const path = container.querySelector(`path[data-region="${riyadh.id}"]`)!;

      expect(path.getAttribute('class')).toContain('fill-primary-600/15');
      expect(path.getAttribute('class')).toContain('stroke-neutral-800');
      expect(path.getAttribute('class')).not.toContain('fill-primary-600 ');
    });
  });

  describe('being driven from outside', () => {
    const riyadh = SAUDI_REGIONS.find((region) => region.name === 'الرياض')!;
    const tabuk = SAUDI_REGIONS.find((region) => region.name === 'تبوك')!;

    it('says what the tooltip contains, and shows it on hover', async () => {
      render(
        <InteractiveSaudiMap
          label="الخريطة"
          selectedId={null}
          onSelect={vi.fn()}
          tooltip={(region) => <span>{`تفاصيل ${region.name}`}</span>}
        />,
      );

      expect(screen.queryByText('تفاصيل الرياض')).not.toBeInTheDocument();

      await userEvent.setup().hover(screen.getByRole('button', { name: 'الرياض' }));

      expect(screen.getByText('تفاصيل الرياض')).toBeInTheDocument();
    });

    it('reports hover and focus to its owner, and clears when they leave', async () => {
      const onHoverChange = vi.fn();
      render(
        <InteractiveSaudiMap
          label="الخريطة"
          selectedId={null}
          onSelect={vi.fn()}
          onHoverChange={onHoverChange}
        />,
      );
      const user = userEvent.setup();

      await user.hover(screen.getByRole('button', { name: 'الرياض' }));
      expect(onHoverChange).toHaveBeenLastCalledWith(riyadh.id);

      await user.unhover(screen.getByRole('button', { name: 'الرياض' }));
      expect(onHoverChange).toHaveBeenLastCalledWith(null);

      /* The keyboard gets the same treatment as the pointer. */
      screen.getByRole('button', { name: 'تبوك' }).focus();
      expect(onHoverChange).toHaveBeenLastCalledWith(tabuk.id);
    });

    it('lights a region its owner highlights, without a tooltip (there is no cursor over it)', () => {
      const { container } = render(
        <InteractiveSaudiMap
          label="الخريطة"
          selectedId={null}
          onSelect={vi.fn()}
          highlightId={riyadh.id}
          tooltip={() => <span>تلميح</span>}
        />,
      );

      const path = container.querySelector(`path[data-region="${riyadh.id}"]`)!;

      expect(path).toHaveAttribute('filter', 'url(#region-lift)');
      expect(screen.queryByText('تلميح')).not.toBeInTheDocument();
    });

    it('fades the regions its owner dims, and keeps them reachable', () => {
      const { container } = render(
        <InteractiveSaudiMap
          label="الخريطة"
          selectedId={null}
          onSelect={vi.fn()}
          dimmed={(id) => id !== riyadh.id}
        />,
      );

      expect(container.querySelector(`path[data-region="${tabuk.id}"]`)?.closest('g')).toHaveClass(
        'opacity-25',
      );
      expect(
        container.querySelector(`path[data-region="${riyadh.id}"]`)?.closest('g'),
      ).not.toHaveClass('opacity-25');
      /* Faded is not removed: a dimmed region is still a button. */
      expect(screen.getByRole('button', { name: 'تبوك' })).toBeInTheDocument();
    });

    it('offers a way back out only while a region is chosen and the map zooms on it', async () => {
      const onSelect = vi.fn();
      const { rerender } = render(
        <InteractiveSaudiMap
          label="الخريطة"
          selectedId={null}
          onSelect={onSelect}
          zoomToSelected
          resetLabel="عرض كل المناطق"
        />,
      );

      expect(screen.queryByRole('button', { name: 'عرض كل المناطق' })).not.toBeInTheDocument();

      rerender(
        <InteractiveSaudiMap
          label="الخريطة"
          selectedId={riyadh.id}
          onSelect={onSelect}
          zoomToSelected
          resetLabel="عرض كل المناطق"
        />,
      );

      await userEvent.setup().click(screen.getByRole('button', { name: 'عرض كل المناطق' }));
      expect(onSelect).toHaveBeenCalledWith(null);
    });

    it('stays on the whole map where the browser cannot measure a region, rather than guessing a frame', () => {
      const { container } = render(
        <InteractiveSaudiMap
          label="الخريطة"
          selectedId={riyadh.id}
          onSelect={vi.fn()}
          zoomToSelected
          resetLabel="عرض كل المناطق"
        />,
      );

      /* jsdom has no `getBBox`; the component must not throw, and must not zoom. */
      expect(container.querySelector('svg')).toHaveAttribute('viewBox', '0 0 1000 824');
    });
  });
});

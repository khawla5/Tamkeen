'use client';

import { useId, type KeyboardEvent, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * Tabs, on Platforms Code's underline-tab anatomy (D-069, TAM-118), extracted
 * from the landing explorer's tablist so pages that switch views share one
 * implementation of the semantics that keep being hand-rolled wrong.
 *
 * A real `tablist` (WAI-ARIA Tabs, automatic activation): one tab is in the
 * tab order, arrow keys move between tabs and select, Home/End jump to the
 * ends, the panel is labelled by its tab. **Direction-aware:** in an RTL page
 * the "next" tab sits to the left, so ArrowLeft advances — read from the
 * tablist's own `dir` at the moment of the keypress, never assumed.
 *
 * Controlled only: the page owns which tab is selected, because selection
 * is usually part of its state (a URL, a step) rather than a private detail.
 */
export interface TabItem {
  value: string;
  label: ReactNode;
  /** A leading icon; decorative, the label is the name. */
  icon?: ReactNode;
}

export interface TabsProps {
  items: readonly TabItem[];
  value: string;
  onValueChange: (value: string) => void;
  /** The tablist's accessible name — what these tabs switch between. */
  label: string;
  /** The single panel the tabs control; rendered below the list. */
  children: ReactNode;
  className?: string;
  panelClassName?: string;
}

export function Tabs({
  items,
  value,
  onValueChange,
  label,
  children,
  className,
  panelClassName,
}: TabsProps) {
  const baseId = useId();
  const tabId = (index: number) => `${baseId}-tab-${index}`;
  const panelId = `${baseId}-panel`;
  const selectedIndex = Math.max(
    0,
    items.findIndex((item) => item.value === value),
  );

  function move(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    /* The nearest declared `dir` wins, then the computed direction, then the
       document's — an Arabic-first app defaults to RTL when nothing says. */
    const declared = event.currentTarget.closest('[dir]')?.getAttribute('dir');
    const computed = getComputedStyle(event.currentTarget).direction;
    const rtl = (declared || computed || document.dir || 'rtl') === 'rtl';
    /* The visually-next tab: to the left in RTL, to the right in LTR. */
    const forward = rtl ? 'ArrowLeft' : 'ArrowRight';
    const backward = rtl ? 'ArrowRight' : 'ArrowLeft';

    let next: number | null = null;
    if (event.key === forward) next = (index + 1) % items.length;
    else if (event.key === backward) next = (index - 1 + items.length) % items.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = items.length - 1;
    if (next === null) return;

    event.preventDefault();
    onValueChange(items[next]!.value);
    document.getElementById(tabId(next))?.focus();
  }

  return (
    <div className={className}>
      <div
        role="tablist"
        aria-label={label}
        /* `pb-px` gives the tabs' 1px overhang (`-mb-px`, so the active
           underline sits on this border) room inside the scroll container —
           without it that pixel is vertical overflow and the row grows a
           scrollbar. */
        className="flex gap-2 overflow-x-auto border-b border-border pb-px"
      >
        {items.map((item, index) => {
          const selected = index === selectedIndex;
          return (
            <button
              key={item.value}
              id={tabId(index)}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={panelId}
              tabIndex={selected ? 0 : -1}
              onClick={() => onValueChange(item.value)}
              onKeyDown={(event) => move(event, index)}
              className={cn(
                '-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-base font-medium transition-colors',
                'outline-none focus-visible:ring-[3px] focus-visible:ring-primary-600/50',
                selected
                  ? 'border-primary-600 text-primary-700'
                  : 'border-transparent text-neutral-700 hover:text-foreground',
              )}
            >
              {item.icon}
              {item.label}
            </button>
          );
        })}
      </div>

      <div
        id={panelId}
        role="tabpanel"
        aria-labelledby={tabId(selectedIndex)}
        className={panelClassName}
      >
        {children}
      </div>
    </div>
  );
}

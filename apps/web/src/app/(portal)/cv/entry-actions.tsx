'use client';

import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';

/**
 * Reorder and remove, for one entry in a repeatable section (§4.11).
 *
 * **Buttons rather than drag-and-drop**, deliberately. Dragging needs a
 * dependency, is awkward on a phone, and is unusable by keyboard without
 * reimplementing the same buttons anyway — so it would be a library plus a
 * fallback in place of two arrows. WCAG 2.1 AA requires the keyboard path to
 * exist (§2B DoD 5); this makes it the only path.
 *
 * Each control names the entry it acts on, because a form with four experience
 * entries otherwise presents twelve identically-named buttons.
 */
export function EntryActions({
  name,
  index,
  count,
  onMove,
  onRemove,
}: {
  /** What this entry is, for the accessible names. */
  name: string;
  index: number;
  count: number;
  onMove: (from: number, to: number) => void;
  onRemove: (index: number) => void;
}) {
  const t = useTranslations('cv');
  const label = name.trim().length > 0 ? name : `#${String(index + 1)}`;

  return (
    <div className="flex shrink-0 items-center gap-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        /* Disabled rather than hidden: a control that vanishes at the ends
           makes the row jump as entries move. */
        disabled={index === 0}
        aria-label={`${t('moveUp')} — ${label}`}
        onClick={() => onMove(index, index - 1)}
      >
        <ArrowUp aria-hidden="true" />
      </Button>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={index === count - 1}
        aria-label={`${t('moveDown')} — ${label}`}
        onClick={() => onMove(index, index + 1)}
      >
        <ArrowDown aria-hidden="true" />
      </Button>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label={t('removeEntry', { name: label })}
        onClick={() => onRemove(index)}
      >
        <Trash2 aria-hidden="true" className="text-destructive" />
      </Button>
    </div>
  );
}

/** Moves an item, returning a new array. Out-of-range moves are a no-op. */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  if (to < 0 || to >= items.length || from === to) {
    return [...items];
  }

  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);

  return next;
}

import { cn } from '@/lib/utils';

export interface ProgressProps {
  value: number;
  max: number;
  /** Accessible name — required, because "a bar" tells a screen reader nothing. */
  label: string;
  /** The same information as text, e.g. "3 من 7 دورات مكتملة". */
  valueText: string;
  className?: string;
}

/**
 * A progress bar that is legible without seeing it.
 *
 * `aria-valuetext` carries the Arabic phrasing rather than leaving a screen
 * reader to announce a bare percentage, and the same text is rendered visibly —
 * WCAG 1.4.1 forbids conveying the state by the coloured fill alone.
 */
export function Progress({ value, max, label, valueText, className }: ProgressProps) {
  const safeMax = max > 0 ? max : 1;
  const percent = Math.min(100, Math.max(0, (value / safeMax) * 100));

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={valueText}
        /* The track needs to be visible against a white card even when the fill
           is zero-width — cream on white is not. A tint of the muted blue reads
           on both surfaces without introducing a colour outside the palette. */
        className="h-2 w-full overflow-hidden rounded-full bg-muted/20"
      >
        <div
          className="h-full rounded-full bg-secondary transition-[width]"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="text-sm text-muted-foreground">{valueText}</p>
    </div>
  );
}

import { AlertCircle, CheckCircle2, Info } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * A form-level status banner on Platforms Code's status tokens: the `-50`
 * fill, the status colour for border, icon and text. An error is announced
 * assertively (`role="alert"`); information and success are polite statuses
 * — a successful "link sent" must not interrupt a screen reader mid-sentence.
 */
const TONES = {
  error: { icon: AlertCircle, className: 'border-danger bg-danger-50 text-danger', role: 'alert' },
  success: {
    icon: CheckCircle2,
    className: 'border-success bg-success-50 text-success',
    role: 'status',
  },
  info: { icon: Info, className: 'border-info bg-info-50 text-info', role: 'status' },
} as const;

export function Alert({
  tone,
  children,
  className,
}: {
  tone: keyof typeof TONES;
  children: ReactNode;
  className?: string;
}) {
  const { icon: Icon, className: toneClass, role } = TONES[tone];

  return (
    <div
      role={role}
      className={cn(
        'flex items-start gap-2 rounded-[4px] border px-3 py-2.5 text-sm leading-5',
        toneClass,
        className,
      )}
    >
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <div className="flex flex-col items-start gap-2">{children}</div>
    </div>
  );
}

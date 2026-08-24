'use client';

import { Eye, EyeOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, type ComponentProps } from 'react';

import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/**
 * A password field with a show/hide toggle. The toggle is a real button with
 * `aria-pressed`, named for what it does next, and `type="button"` so it can
 * never submit the form it sits in. It lives on the end edge of the field
 * (logical — `pe-`/`end-`), so it mirrors correctly in RTL.
 */
export function PasswordInput({ className, ...props }: Omit<ComponentProps<'input'>, 'type'>) {
  const t = useTranslations('auth');
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <Input {...props} type={visible ? 'text' : 'password'} className={cn('pe-10', className)} />
      <button
        type="button"
        aria-pressed={visible}
        aria-label={visible ? t('hidePassword') : t('showPassword')}
        onClick={() => setVisible((v) => !v)}
        className="absolute inset-y-0 end-0 flex w-10 items-center justify-center rounded-e-[4px] text-neutral-500 hover:text-foreground"
      >
        {visible ? (
          <EyeOff aria-hidden="true" className="size-4" />
        ) : (
          <Eye aria-hidden="true" className="size-4" />
        )}
      </button>
    </div>
  );
}

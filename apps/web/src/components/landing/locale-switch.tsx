'use client';

import { Globe } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, baseLocale } from '@/i18n/config';
import { cn } from '@/lib/utils';

/**
 * The language switch (D-041).
 *
 * It offers the language you are NOT reading — "English" while the page is
 * Arabic, "العربية" while it is English — because a control labelled with the
 * current state gives the reader nothing to act on.
 *
 * Each label is written in its own language, and carries its own `lang`
 * attribute. Without that, a screen reader set to Arabic reads "English" with
 * Arabic phonetics and the word is unrecognisable to the person it is aimed at
 * — the one reader who most needs to find this control.
 *
 * The switch writes a cookie and refreshes: the messages, `<html lang>` and
 * `<html dir>` are all decided on the server from that one value, so there is
 * nothing to keep in sync on the client. `useTransition` keeps the old page
 * interactive while the new one is fetched instead of blanking it.
 */
export function LocaleSwitch({ className }: { className?: string }) {
  const t = useTranslations('a11y');
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  /* next-intl holds the *extended* tag (`ar-u-nu-latn-…`), not the bare one. */
  const current = baseLocale(useLocale());
  const next = current === 'ar' ? 'en' : 'ar';

  const switchTo = () => {
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; samesite=lax`;
    startTransition(() => router.refresh());
  };

  return (
    <button
      type="button"
      onClick={switchTo}
      disabled={pending}
      aria-label={t('switchLanguage')}
      className={cn(
        'flex items-center gap-1.5 rounded-full border border-transparent px-3 py-2 text-sm font-medium text-navy-soft transition-colors hover:bg-gold/10 hover:text-navy focus-visible:bg-gold/10 disabled:opacity-60',
        className,
      )}
    >
      <Globe aria-hidden="true" className="size-4" />
      <span lang={next} dir={next === 'ar' ? 'rtl' : 'ltr'}>
        {next === 'ar' ? 'العربية' : 'English'}
      </span>
    </button>
  );
}

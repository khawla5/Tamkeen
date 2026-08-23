'use client';

import type { ReactNode } from 'react';

import { DEFAULT_FORMAT_CONTEXT, type NumberFormat } from '@tamkeen/types';

import { FormatProvider } from '@/i18n/format-provider';

/**
 * Re-provides the formatting context with the signed-in person's digits choice
 * (§4.12, D-018).
 *
 * **The switch point stays single.** `format.ts` is still the only thing that
 * turns a number or a date into text anywhere in the product — this changes the
 * *context* it is given for one subtree, not where formatting happens. That is
 * what D-018 meant by "a single locale switch point": one implementation, one
 * place to change what it is told.
 *
 * Null means "follow the system default", which is what §4C.6 sets. So the
 * ministry can change the default for everyone and anybody who has expressed a
 * preference keeps theirs — and a person who has not is not silently pinned to
 * whatever the default happened to be when they registered.
 *
 * Wrapped around each portal rather than the root layout, because the root
 * renders for signed-out visitors too and there is nobody to have a preference.
 */
export function PreferenceProvider({
  numberFormat,
  children,
}: {
  numberFormat: NumberFormat | null;
  children: ReactNode;
}) {
  if (numberFormat === null) {
    /* Nothing to override. Rendering the children plainly keeps the root
       layout's context — the system default — rather than re-asserting a copy
       of it that could drift. */
    return <>{children}</>;
  }

  return (
    <FormatProvider context={{ ...DEFAULT_FORMAT_CONTEXT, numberFormat }}>
      {children}
    </FormatProvider>
  );
}

'use client';

import type { ReactNode } from 'react';

import type { NumberFormat } from '@tamkeen/types';

import { FormatProvider, useFormat } from '@/i18n/format-provider';

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
 * **It always renders the provider, including when there is no preference.**
 * Returning `children` bare in that case looks like the cheaper path and is a
 * trap: React compares element types by position, so the first time somebody
 * saved a preference the tree shape changed, the entire portal below unmounted
 * and remounted, and every piece of page state went with it — the "saved"
 * confirmation they had just earned, a half-filled form, an open dialog. The
 * shape has to be constant for the subtree to survive the change.
 *
 * **And the fallback is the inherited context, not a fresh default.** The root
 * layout resolves `NUMBER_FORMAT` from the environment, so a deployment can ship
 * Arabic-Indic digits as its default; substituting `DEFAULT_FORMAT_CONTEXT` here
 * would quietly override that for every signed-in person who never expressed a
 * preference — which is the opposite of what null means.
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
  const { context } = useFormat();

  return (
    <FormatProvider context={numberFormat === null ? context : { ...context, numberFormat }}>
      {children}
    </FormatProvider>
  );
}

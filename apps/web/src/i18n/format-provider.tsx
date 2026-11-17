'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';

import {
  DEFAULT_FORMAT_CONTEXT,
  formatDate,
  formatDateTime,
  formatFraction,
  formatMonthYear,
  formatNumber,
  formatPercent,
  type DateStyle,
  type FormatContext,
} from '@tamkeen/types';

/**
 * Makes the server-resolved format context available to client components, so
 * that both server and client render numbers and dates through the *same*
 * `@tamkeen/types` functions the API uses for certificates and emails.
 *
 * Without this, client components would have no access to `NUMBER_FORMAT` (a
 * server-only variable) and would drift into calling `Intl` directly — which is
 * precisely the fragmentation D-018 exists to prevent.
 */
const FormatContextValue = createContext<FormatContext>(DEFAULT_FORMAT_CONTEXT);

export function FormatProvider({
  context,
  children,
}: {
  context: FormatContext;
  children: ReactNode;
}) {
  return <FormatContextValue.Provider value={context}>{children}</FormatContextValue.Provider>;
}

export function useFormat() {
  const context = useContext(FormatContextValue);

  return useMemo(
    () => ({
      context,
      number: (value: number) => formatNumber(value, context),
      percent: (value: number) => formatPercent(value, context),
      fraction: (current: number, total: number) => formatFraction(current, total, context),
      date: (value: Date, style?: DateStyle) => formatDate(value, context, style),
      dateTime: (value: Date) => formatDateTime(value, context),
      /* «أغسطس ٢٠٢٦» from the `YYYY-MM` a trend point carries — through the
         shared layer like everything else, so a month heading honours D-018's
         digit switch rather than deciding for itself. */
      monthYear: (value: string) => formatMonthYear(value, context),
    }),
    [context],
  );
}

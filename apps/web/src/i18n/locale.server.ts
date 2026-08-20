import { cookies } from 'next/headers';

import type { Locale } from '@tamkeen/types';

import { LOCALE_COOKIE, resolveLocale } from './config';

/**
 * The reader's locale for the current request.
 *
 * Server-only, and kept apart from `config.ts` because `next/headers` cannot be
 * imported from a plain Node test or from client code — splitting it here is
 * what lets the resolution rules themselves stay pure and unit-testable.
 *
 * Reading a cookie opts the route into dynamic rendering. That is the actual
 * price of the switch: a page cannot be statically cached at build time and
 * still know which language its reader chose.
 */
export async function getRequestLocale(): Promise<Locale> {
  const store = await cookies();

  return resolveLocale(store.get(LOCALE_COOKIE)?.value);
}

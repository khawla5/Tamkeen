import { getRequestConfig } from 'next-intl/server';

import { formatLocaleTag } from '@tamkeen/types';

import { DEFAULT_TIME_ZONE, getFormatContext } from './config';
import { getRequestLocale } from './locale.server';

/**
 * next-intl request configuration.
 *
 * There is deliberately **no locale-prefixed routing** and no `[locale]` route
 * segment: the chosen language rides in a cookie instead, so every page keeps
 * one canonical URL (D-041, superseding the single-locale half of D-024).
 *
 * Note the locale handed to next-intl is the *extended* tag
 * (`ar-u-nu-latn-ca-gregory`), not bare `ar`. next-intl passes it straight to
 * `Intl`, so numbers and dates embedded in ICU messages honour the D-018 digit
 * and calendar switch automatically. The bare tag is used for `<html lang>`
 * (see `htmlLang`) — an extension subtag there would be wrong HTML.
 *
 * The catalogs are imported by name rather than through a template literal:
 * `resolveLocale` has already narrowed the value to a known locale, and an
 * explicit map means a bundler can see both files and a typo becomes a build
 * error instead of a runtime module-not-found on someone's first visit.
 */
const MESSAGES = {
  ar: () => import('../../messages/ar.json'),
  en: () => import('../../messages/en.json'),
} as const;

export default getRequestConfig(async () => {
  const locale = await getRequestLocale();
  const context = getFormatContext(locale);

  return {
    locale: formatLocaleTag(context),
    timeZone: DEFAULT_TIME_ZONE,
    messages: (await MESSAGES[locale]()).default,
  };
});

import { getRequestConfig } from 'next-intl/server';

import { formatLocaleTag } from '@tamkeen/types';

import { DEFAULT_TIME_ZONE, getFormatContext } from './config';

/**
 * next-intl request configuration.
 *
 * Arabic is the only locale, so there is deliberately **no locale-prefixed
 * routing** and no `[locale]` route segment (D-024) — URLs stay clean.
 *
 * Note the locale handed to next-intl is the *extended* tag
 * (`ar-u-nu-latn-ca-gregory`), not bare `ar`. next-intl passes it straight to
 * `Intl`, so numbers and dates embedded in ICU messages honour the D-018 digit
 * and calendar switch automatically. The bare `ar` is used for `<html lang>`
 * (see `HTML_LANG`) — an extension subtag there would be wrong HTML.
 */
export default getRequestConfig(async () => {
  const context = getFormatContext();

  return {
    locale: formatLocaleTag(context),
    timeZone: DEFAULT_TIME_ZONE,
    messages: (await import('../../messages/ar.json')).default,
  };
});

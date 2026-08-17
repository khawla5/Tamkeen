'use client';

import { useTranslations } from 'next-intl';

import { ApiError, NetworkError } from '@/lib/api-client';

/**
 * Translates an API error *code* into Arabic.
 *
 * The API deliberately returns codes rather than prose (D-024), so this is the
 * single place the two vocabularies meet. An unrecognised code falls back to a
 * generic message rather than showing the raw code to a user — a screen reading
 * "INVALID_CREDENTIALS" is a bug, not an error message.
 */
export function useErrorMessage(): (error: unknown) => string {
  const t = useTranslations('auth.errors');

  return (error: unknown): string => {
    const code =
      error instanceof ApiError
        ? error.code
        : error instanceof NetworkError
          ? 'NETWORK_ERROR'
          : 'UNKNOWN_ERROR';

    /* t.has() avoids next-intl throwing on a missing key, which would replace a
       useful error with a crash. */
    return t.has(code) ? t(code) : t('UNKNOWN_ERROR');
  };
}

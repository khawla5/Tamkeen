'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Suspense, useEffect, useRef, useState } from 'react';

import { useErrorMessage } from '@/components/auth/use-error-message';
import { AuthLayout } from '@/components/auth/auth-layout';
import { LoadingState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { authApi } from '@/lib/api-client';

/**
 * Completing an email change (§4.12).
 *
 * Its own page rather than a branch inside `/verify-email`: the two tokens do
 * different things — one activates an account, the other moves one — and a
 * single redemption route that branched on token type is how a link meant for
 * one ends up doing the other.
 *
 * **Public, and it has to be.** The link arrives in the new mailbox, which is
 * very often open in a different browser from the one that asked. Requiring a
 * session here would strand exactly the person the flow is for.
 *
 * On success it says the sessions were ended and points at sign-in, because
 * that is what happened: the identifier the person signs in with has changed,
 * so the server revoked everything rather than leave sessions authenticated
 * against an address that no longer exists.
 */
type Status = 'pending' | 'changed' | 'failed';

function VerifyEmailChange() {
  const t = useTranslations('auth');
  const translateError = useErrorMessage();
  const token = useSearchParams().get('token');

  const [status, setStatus] = useState<Status>('pending');
  const [error, setError] = useState<string | null>(null);

  /* React StrictMode mounts effects twice in development; without this the
     single-use token would be spent by the first run and the second would
     report a failure that did not happen. */
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) {
      return;
    }
    attempted.current = true;

    if (!token) {
      setStatus('failed');
      return;
    }

    authApi
      .confirmEmailChange(token)
      .then(() => setStatus('changed'))
      .catch((caught: unknown) => {
        /* The address being taken since the link was sent is a different
           problem from an expired link, and the person can act on it — so it is
           named rather than folded into "invalid token". */
        setError(translateError(caught));
        setStatus('failed');
      });
  }, [token, translateError]);

  if (status === 'pending') {
    return (
      <AuthLayout title={t('emailChangeTitle')}>
        <LoadingState rows={0} label={t('emailChangePending')} />
      </AuthLayout>
    );
  }

  if (status === 'changed') {
    return (
      <AuthLayout title={t('emailChangeSuccessTitle')} subtitle={t('emailChangeSuccessBody')}>
        <Button asChild size="lg" className="w-full">
          <Link href="/login">{t('submitSignIn')}</Link>
        </Button>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title={t('emailChangeFailedTitle')}
      subtitle={token ? (error ?? t('emailChangeFailedBody')) : t('verifyMissingToken')}
    >
      <Button asChild size="lg" variant="secondary" className="w-full">
        <Link href="/login">{t('signInLink')}</Link>
      </Button>
    </AuthLayout>
  );
}

export default function VerifyEmailChangePage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailChange />
    </Suspense>
  );
}

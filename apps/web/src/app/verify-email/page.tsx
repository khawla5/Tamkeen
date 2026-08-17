'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Suspense, useEffect, useRef, useState } from 'react';

import { AuthCard } from '@/components/auth/auth-card';
import { LoadingState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { authApi } from '@/lib/api-client';

type Status = 'pending' | 'verified' | 'failed';

function VerifyEmail() {
  const t = useTranslations('auth');
  const token = useSearchParams().get('token');

  const [status, setStatus] = useState<Status>('pending');
  /* React 18+ StrictMode mounts effects twice in development; without this the
     single-use token would be consumed by the first run and the second would
     report failure. */
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
      .verifyEmail(token)
      .then(() => setStatus('verified'))
      .catch(() => setStatus('failed'));
  }, [token]);

  if (status === 'pending') {
    return (
      <AuthCard title={t('verifyTitle')}>
        <LoadingState rows={0} label={t('verifyPending')} />
      </AuthCard>
    );
  }

  if (status === 'verified') {
    return (
      <AuthCard title={t('verifySuccessTitle')} subtitle={t('verifySuccessBody')}>
        <Button asChild>
          <Link href="/login">{t('submitSignIn')}</Link>
        </Button>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={t('verifyFailedTitle')}
      subtitle={token ? t('verifyFailedBody') : t('verifyMissingToken')}
    >
      <Button asChild variant="outline">
        <Link href="/login">{t('signInLink')}</Link>
      </Button>
    </AuthCard>
  );
}

export default function VerifyEmailPage() {
  /* useSearchParams needs a Suspense boundary to avoid opting the whole route
     out of static rendering. */
  return (
    <Suspense fallback={null}>
      <VerifyEmail />
    </Suspense>
  );
}

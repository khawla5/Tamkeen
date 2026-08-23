'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { AuthCard } from '@/components/auth/auth-card';
import { HOME_FOR_ROLE } from '@/components/layout/portal-routes';
import { useErrorMessage } from '@/components/auth/use-error-message';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ApiError, authApi } from '@/lib/api-client';

/**
 * Sign-in (§4.1): email, password, forgot-password. Nothing else.
 *
 * The one place the UI reacts to a *specific* failure is EMAIL_NOT_VERIFIED,
 * where it offers to resend the link — the password was correct, so this tells
 * the caller nothing they did not already know. Every other failure shows the
 * same generic message the API returns.
 */
export default function LoginPage() {
  const t = useTranslations('auth');
  const translateError = useErrorMessage();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [unverified, setUnverified] = useState(false);
  const [resent, setResent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setUnverified(false);
    setResent(false);
    setSubmitting(true);

    try {
      const { user } = await authApi.login({ email, password });

      /*
       * Routed by role (D-065, D-075). The sign-in response already carries it,
       * so this costs no extra request — and sending everyone to `/` would land
       * an entity or an admin on the learner dashboard, which would then bounce
       * them onwards, producing a visible flicker on every sign-in rather than a
       * destination.
       *
       * Written as an exhaustive mapping rather than a single "not an employee"
       * branch: until Phase 5 there was no admin portal, so a SUPER_ADMIN fell
       * through to `/` and was bounced into the *entity* portal — a real
       * destination, for somebody else.
       */
      /* refresh() so the server components re-render with the new session
         rather than serving a cached anonymous view. */
      router.replace(HOME_FOR_ROLE[user.role]);
      router.refresh();
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === 'EMAIL_NOT_VERIFIED') {
        setUnverified(true);
      }
      setError(translateError(caught));
    } finally {
      setSubmitting(false);
    }
  }

  async function onResend() {
    setResent(false);
    try {
      await authApi.resendVerification(email);
    } finally {
      /* Always report sent, whatever happened — the endpoint is deliberately
         indistinguishable for unknown and already-verified addresses. */
      setResent(true);
    }
  }

  return (
    <AuthCard
      title={t('signInTitle')}
      subtitle={t('signInSubtitle')}
      footer={
        <span>
          {t('noAccount')}{' '}
          <Link href="/register" className="font-medium text-foreground underline">
            {t('registerLink')}
          </Link>
        </span>
      }
    >
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field id="email" label={t('email')} required>
          {(props) => (
            <Input
              {...props}
              type="email"
              inputMode="email"
              dir="ltr"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
            />
          )}
        </Field>

        <Field id="password" label={t('password')} required>
          {(props) => (
            <Input
              {...props}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
            />
          )}
        </Field>

        {error ? (
          <div role="alert" className="flex flex-col items-start gap-2">
            <p className="text-sm font-medium text-destructive">{error}</p>
            {unverified ? (
              <Button type="button" variant="outline" size="sm" onClick={onResend}>
                {t('resendVerification')}
              </Button>
            ) : null}
          </div>
        ) : null}

        {resent ? (
          <p role="status" className="text-sm text-muted-foreground">
            {t('resendSent')}
          </p>
        ) : null}

        <Button type="submit" disabled={submitting}>
          {submitting ? t('submitting') : t('submitSignIn')}
        </Button>

        <Link
          href="/forgot-password"
          className="self-start text-sm text-muted-foreground underline"
        >
          {t('forgotPasswordLink')}
        </Link>
      </form>
    </AuthCard>
  );
}

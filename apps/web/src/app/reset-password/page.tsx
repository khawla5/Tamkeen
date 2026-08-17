'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Suspense, useState } from 'react';

import { AuthCard } from '@/components/auth/auth-card';
import { useErrorMessage } from '@/components/auth/use-error-message';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { authApi } from '@/lib/api-client';
import { PASSWORD_MIN_LENGTH } from '@/lib/auth-constants';

function ResetPassword() {
  const t = useTranslations('auth');
  /* Error codes live in one app-wide catalogue, not under 'auth' — the same
     codes are raised by every module (D-024). */
  const tErrors = useTranslations('errors');
  const translateError = useErrorMessage();
  const token = useSearchParams().get('token');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFieldError(null);
    setFormError(null);

    if (password !== confirmPassword) {
      setFieldError('PASSWORDS_DO_NOT_MATCH');
      return;
    }

    if (!token) {
      setFormError(tErrors('TOKEN_REQUIRED'));
      return;
    }

    setSubmitting(true);
    try {
      await authApi.resetPassword(token, password);
      setDone(true);
    } catch (error) {
      setFormError(translateError(error));
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <AuthCard title={t('resetSuccessTitle')} subtitle={t('resetSuccessBody')}>
        <Button asChild>
          <Link href="/login">{t('submitSignIn')}</Link>
        </Button>
      </AuthCard>
    );
  }

  return (
    <AuthCard title={t('resetTitle')} subtitle={t('resetSubtitle')}>
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field
          id="password"
          label={t('newPassword')}
          hint={t('passwordHint', { min: PASSWORD_MIN_LENGTH })}
          required
        >
          {(props) => (
            <Input
              {...props}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
            />
          )}
        </Field>

        <Field
          id="confirmPassword"
          label={t('confirmPassword')}
          required
          error={fieldError ? tErrors(fieldError) : undefined}
        >
          {(props) => (
            <Input
              {...props}
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
            />
          )}
        </Field>

        {formError ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {formError}
          </p>
        ) : null}

        <Button type="submit" disabled={submitting}>
          {submitting ? t('submitting') : t('resetSubmit')}
        </Button>
      </form>
    </AuthCard>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPassword />
    </Suspense>
  );
}

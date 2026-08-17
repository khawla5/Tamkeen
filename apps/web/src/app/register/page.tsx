'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { AuthCard } from '@/components/auth/auth-card';
import { useErrorMessage } from '@/components/auth/use-error-message';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { authApi } from '@/lib/api-client';
import { PASSWORD_MIN_LENGTH } from '@/lib/auth-constants';

/**
 * Registration (§4.1). Minimal fields only: email, password, confirmation, full
 * name, employee id, department. No social login — the ministry owns identity.
 *
 * On success the page shows a neutral "check your email" panel that is identical
 * whether or not the address was already registered, preserving the API's
 * enumeration resistance right through to the UI. Leaking it here would undo the
 * work done on the server.
 */
export default function RegisterPage() {
  const t = useTranslations('auth');
  const translateError = useErrorMessage();

  const [form, setForm] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    fullName: '',
    employeeId: '',
    department: '',
  });
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const update = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setForm((current) => ({ ...current, [key]: event.target.value }));
  };

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFieldError(null);
    setFormError(null);

    if (form.password !== form.confirmPassword) {
      setFieldError('PASSWORDS_DO_NOT_MATCH');
      return;
    }

    setSubmitting(true);
    try {
      await authApi.register({
        email: form.email,
        password: form.password,
        fullName: form.fullName,
        employeeId: form.employeeId,
        department: form.department,
      });
      setSent(true);
    } catch (error) {
      setFormError(translateError(error));
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <AuthCard title={t('registerSentTitle')} subtitle={t('registerSentBody')}>
        <Button asChild>
          <Link href="/login">{t('signInLink')}</Link>
        </Button>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={t('registerTitle')}
      subtitle={t('registerSubtitle')}
      footer={
        <span>
          {t('haveAccount')}{' '}
          <Link href="/login" className="font-medium text-foreground underline">
            {t('signInLink')}
          </Link>
        </span>
      }
    >
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field id="fullName" label={t('fullName')} required>
          {(props) => (
            <Input
              {...props}
              value={form.fullName}
              onChange={update('fullName')}
              autoComplete="name"
            />
          )}
        </Field>

        <Field id="email" label={t('email')} required>
          {(props) => (
            <Input
              {...props}
              type="email"
              inputMode="email"
              /* Latin-script field inside an RTL page: force LTR so the address
                 and its punctuation read correctly. */
              dir="ltr"
              value={form.email}
              onChange={update('email')}
              autoComplete="email"
            />
          )}
        </Field>

        <Field id="employeeId" label={t('employeeId')} required>
          {(props) => (
            <Input {...props} dir="ltr" value={form.employeeId} onChange={update('employeeId')} />
          )}
        </Field>

        <Field id="department" label={t('department')} required>
          {(props) => <Input {...props} value={form.department} onChange={update('department')} />}
        </Field>

        <Field
          id="password"
          label={t('password')}
          hint={t('passwordHint', { min: PASSWORD_MIN_LENGTH })}
          required
        >
          {(props) => (
            <Input
              {...props}
              type="password"
              value={form.password}
              onChange={update('password')}
              autoComplete="new-password"
            />
          )}
        </Field>

        <Field
          id="confirmPassword"
          label={t('confirmPassword')}
          required
          error={fieldError ? t(`errors.${fieldError}`) : undefined}
        >
          {(props) => (
            <Input
              {...props}
              type="password"
              value={form.confirmPassword}
              onChange={update('confirmPassword')}
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
          {submitting ? t('submitting') : t('submitRegister')}
        </Button>
      </form>
    </AuthCard>
  );
}

'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { AuthCard } from '@/components/auth/auth-card';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { authApi } from '@/lib/api-client';

/**
 * Password reset request.
 *
 * Always shows the same confirmation, whatever the API said — including on
 * error. The endpoint is deliberately indistinguishable for known and unknown
 * addresses, and a UI that surfaced "no such account" would reintroduce exactly
 * the enumeration oracle the server avoids.
 */
export default function ForgotPasswordPage() {
  const t = useTranslations('auth');

  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);

    try {
      await authApi.forgotPassword(email);
    } catch {
      /* Intentionally swallowed — see the note above. */
    } finally {
      setSubmitting(false);
      setSent(true);
    }
  }

  if (sent) {
    return (
      <AuthCard title={t('forgotSentTitle')} subtitle={t('forgotSentBody')}>
        <Button asChild variant="outline">
          <Link href="/login">{t('signInLink')}</Link>
        </Button>
      </AuthCard>
    );
  }

  return (
    <AuthCard title={t('forgotTitle')} subtitle={t('forgotSubtitle')}>
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

        <Button type="submit" disabled={submitting}>
          {submitting ? t('submitting') : t('forgotSubmit')}
        </Button>

        <Link href="/login" className="self-start text-sm text-muted-foreground underline">
          {t('signInLink')}
        </Link>
      </form>
    </AuthCard>
  );
}

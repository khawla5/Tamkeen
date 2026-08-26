'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { useErrorMessage } from '@/components/auth/use-error-message';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { authApi } from '@/lib/api-client';
import { PASSWORD_MIN_LENGTH } from '@/lib/auth-constants';

/**
 * Changing your own password (§4.12 for the employee, §4B.6 for the entity —
 * TAM-110).
 *
 * One component for every portal: the credential belongs to the account, not
 * to the role, and `POST /api/auth/change-password` asks no more of an entity
 * than of an employee. The current password is required — a session cookie is
 * enough to *be* the user, so this is the whole security of the change — and a
 * wrong one counts toward the same lockout as sign-in (D-104), which the
 * `ACCOUNT_LOCKED` message below explains when it happens.
 */
export function PasswordCard() {
  const t = useTranslations('profile');
  const translateError = useErrorMessage();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const mismatch = confirmation.length > 0 && confirmation !== newPassword;

  async function save() {
    setError(null);
    setDone(false);
    setBusy(true);

    try {
      await authApi.changePassword(currentPassword, newPassword, confirmation);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmation('');
      setDone(true);
    } catch (caught) {
      setError(translateError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('passwordHeading')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {/* Said before the form. Asking for the current password is the whole
            security of this, and somebody who understands why will not read it
            as friction. */}
        <p className="text-sm text-muted-foreground">{t('passwordHint')}</p>

        <Field id="current-password" label={t('currentPassword')} required>
          {(field) => (
            <Input
              {...field}
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
            />
          )}
        </Field>

        <Field
          id="new-password"
          label={t('newPassword')}
          hint={t('passwordLength', { min: PASSWORD_MIN_LENGTH })}
          required
        >
          {(field) => (
            <Input
              {...field}
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
            />
          )}
        </Field>

        <Field
          id="confirm-password"
          label={t('confirmPassword')}
          error={mismatch ? t('passwordsDiffer') : undefined}
          required
        >
          {(field) => (
            <Input
              {...field}
              type="password"
              autoComplete="new-password"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
            />
          )}
        </Field>

        <Button
          className="self-start"
          disabled={
            busy ||
            mismatch ||
            currentPassword.length === 0 ||
            newPassword.length < PASSWORD_MIN_LENGTH ||
            confirmation !== newPassword
          }
          onClick={() => void save()}
        >
          {t('passwordSave')}
        </Button>

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        {done && !error ? (
          <p role="status" className="text-sm text-success">
            {t('passwordSaved')}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

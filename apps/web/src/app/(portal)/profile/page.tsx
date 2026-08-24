'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import type { NumberFormat } from '@tamkeen/types';

import { useErrorMessage } from '@/components/auth/use-error-message';
import { PortalPage } from '@/components/layout/portal-page';
import { usePortal } from '@/components/layout/portal-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { authApi } from '@/lib/api-client';
import { PASSWORD_MIN_LENGTH } from '@/lib/auth-constants';
import { useApiMutation } from '@/lib/use-api';

/**
 * Profile (§4.12), completed in Phase 5.
 *
 * Phase 1 shipped this read-only and said why: none of the rest was a Phase 1
 * deliverable, and a form that does not work is worse than one that is not there
 * yet. Sub-phase 5.9 pays the debt.
 *
 * **Changing a password requires the current one.** A session cookie is enough
 * to *be* the user, so without that check anyone who reached an unlocked machine
 * could take the account permanently — and the owner would find out at their
 * next sign-in.
 *
 * **There is no language selector, and that is a decision rather than an
 * omission** (recorded as a decision, not left as a gap). The interface is
 * Arabic-only; a control offering English would do nothing but promise. What
 * genuinely differs between readers is which digits they prefer, so the page
 * offers that instead — through D-018's single switch point.
 */
export default function ProfilePage() {
  const t = useTranslations('profile');
  const { user, refreshSession } = usePortal();
  const router = useRouter();

  const signOut = useApiMutation(() => authApi.logout());

  const roleLabel =
    user.role === 'SUPER_ADMIN'
      ? t('roleAdmin')
      : user.role === 'ENTITY'
        ? t('roleEntity')
        : t('roleEmployee');

  async function onSignOut() {
    await signOut.run();
    /* Navigate regardless: if the session was already gone the request fails,
       and keeping the user on a page they cannot use would be the wrong
       response to that. */
    router.replace('/login');
  }

  return (
    <PortalPage title={t('title')}>
      <div className="mx-auto max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>{t('personalHeading')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <dl className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <dt className="text-sm text-muted-foreground">{t('fullName')}</dt>
                <dd className="font-medium">{user.fullName}</dd>
              </div>
              <div className="flex flex-col gap-1">
                <dt className="text-sm text-muted-foreground">{t('email')}</dt>
                {/* The address is Latin script; `dir="ltr"` stops RTL reordering
                    turning it into something that is not the user's address. */}
                <dd dir="ltr" className="text-start font-medium">
                  {user.email}
                </dd>
              </div>
              <div className="flex flex-col gap-1">
                <dt className="text-sm text-muted-foreground">{t('role')}</dt>
                <dd className="font-medium">{roleLabel}</dd>
              </div>
            </dl>

            <Button
              type="button"
              variant="outline"
              className="self-start"
              disabled={signOut.isPending}
              onClick={() => void onSignOut()}
            >
              {signOut.isPending ? t('signingOut') : t('signOut')}
            </Button>
          </CardContent>
        </Card>

        <EmailCard current={user.email} />
        <DigitsCard current={user.numberFormat} onChanged={refreshSession} />
        <PasswordCard />
      </div>
    </PortalPage>
  );
}

/**
 * `null` is a real third state, so the control needs a value for it.
 *
 * The two formats come from the shared union rather than being typed out here:
 * they are what the server validates against and what `format.ts` switches on,
 * and a literal that drifts from either produces a control that looks correct
 * and is refused on save. Typing them once means a typo is a build error.
 */
type Choice = NumberFormat | 'system';

const DIGIT_CHOICES: ReadonlyArray<{ value: Choice; label: string }> = [
  { value: 'system', label: 'digitsSystem' },
  { value: 'western', label: 'digitsWestern' },
  { value: 'arabic-indic', label: 'digitsArabic' },
];

/**
 * Changing the address the account signs in with (§4.12).
 *
 * **Nothing here changes anything.** Submitting sends a link to the *new*
 * address and stops; `users.email` moves only when somebody opens it. The card
 * says so before the fields, because a form that appears to have saved and has
 * not is how somebody locks themselves out of their own account believing they
 * did the opposite.
 *
 * The current password is asked for the same reason the password form asks —
 * only more so. Whoever can move the address can then use "forgot password" and
 * own the account outright, with the real employee locked out and unnotified.
 */
function EmailCard({ current }: { current: string }) {
  const t = useTranslations('profile');
  const translateError = useErrorMessage();

  const [newEmail, setNewEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  const unchanged = newEmail.trim().toLowerCase() === current.toLowerCase();

  async function save() {
    setError(null);
    setSent(null);
    setBusy(true);

    try {
      await authApi.changeEmail(newEmail, currentPassword);
      setSent(newEmail);
      setNewEmail('');
      setCurrentPassword('');
    } catch (caught) {
      setError(translateError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>{t('emailHeading')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">{t('emailHint')}</p>

        <Field id="new-email" label={t('newEmail')} required>
          {(field) => (
            <Input
              {...field}
              type="email"
              /* Latin script inside an RTL document: without this the
                 punctuation reorders as it is typed and what is on screen is
                 not what will be submitted. */
              dir="ltr"
              className="text-start"
              autoComplete="email"
              value={newEmail}
              onChange={(event) => setNewEmail(event.target.value)}
            />
          )}
        </Field>

        {/* Its own label, not a second "current password": two fields sharing
            one label on a page is a screen reader announcing the same thing
            twice with no way to tell which is which. */}
        <Field id="email-password" label={t('emailPassword')} required>
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

        <Button
          className="self-start"
          disabled={
            busy || newEmail.trim().length === 0 || currentPassword.length === 0 || unchanged
          }
          onClick={() => void save()}
        >
          {t('emailSend')}
        </Button>

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        {sent && !error ? (
          /* Names the address the link went to. "A link has been sent" without
             saying where is unhelpful precisely when it matters — when the
             address was mistyped. */
          <p role="status" className="text-sm text-success">
            {t('emailSent', { email: sent })}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

/**
 * The digits preference (§4.12, D-018).
 *
 * "Follow the system" is a real third option rather than a null dressed up: it
 * means whatever §4C.6 has set applies, so somebody who never expressed a
 * preference is not silently pinned to whatever the default happened to be the
 * day they registered.
 */
function DigitsCard({
  current,
  onChanged,
}: {
  current: NumberFormat | null;
  onChanged: () => void;
}) {
  const t = useTranslations('profile');
  const translateError = useErrorMessage();

  const [value, setValue] = useState<Choice>(current ?? 'system');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function save() {
    setError(null);
    setDone(false);
    setBusy(true);

    try {
      await authApi.setNumberFormat(value === 'system' ? null : value);
      onChanged();
      setDone(true);
    } catch (caught) {
      setError(translateError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>{t('digitsHeading')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Field id="digits" label={t('digitsLabel')} hint={t('digitsHint')}>
          {(field) => (
            <select
              {...field}
              value={value}
              onChange={(event) => setValue(event.target.value as Choice)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {DIGIT_CHOICES.map((choice) => (
                <option key={choice.value} value={choice.value}>
                  {t(choice.label)}
                </option>
              ))}
            </select>
          )}
        </Field>

        {/* Save appears only when there is something to save (§3). */}
        {value !== (current ?? 'system') ? (
          <Button className="self-start" disabled={busy} onClick={() => void save()}>
            {t('digitsSave')}
          </Button>
        ) : null}

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        {done && !error ? (
          <p role="status" className="text-sm text-success">
            {t('digitsSaved')}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** Changing your own password (§4.12). */
function PasswordCard() {
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
      await authApi.changePassword(currentPassword, newPassword);
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
    <Card className="mt-6">
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

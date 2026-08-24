'use client';

import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';

import type { NumberFormat } from '@tamkeen/types';

import { useErrorMessage } from '@/components/auth/use-error-message';
import { PortalPage } from '@/components/layout/portal-page';
import { usePortal } from '@/components/layout/portal-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { authApi, profileApi } from '@/lib/api-client';
import { DEPARTMENTS, PASSWORD_MIN_LENGTH } from '@/lib/auth-constants';
import { useApiMutation } from '@/lib/use-api';

type FieldName = 'fullName' | 'department';
type FieldErrors = Partial<Record<FieldName, string>>;

function validate(form: { fullName: string; department: string }): FieldErrors {
  const errors: FieldErrors = {};

  if (form.fullName.trim().length === 0) errors.fullName = 'FULL_NAME_REQUIRED';
  if (form.department.trim().length === 0) errors.department = 'DEPARTMENT_REQUIRED';

  return errors;
}

/**
 * Profile (§4.12), completed in Phase 5.
 *
 * The top card is الاسم الكامل، البريد الإلكتروني، الرقم الوظيفي، الإدارة،
 * الصلاحية — name and department editable in place, the rest read-only, one
 * save for both fields rather than per-field autosave. A name change also has
 * to reach Moodle (the course player renders a learner's name from Moodle's
 * own record), and firing that on every keystroke would spam an external
 * system for a field nobody has finished typing — so `PATCH /api/me/profile`
 * is best-effort about that propagation: a Moodle hiccup is audited
 * server-side and never blocks or fails this save.
 *
 * The three cards below pay the rest of §4.12's Phase 1 debt. **Changing a
 * password requires the current one.** A session cookie is enough to *be* the
 * user, so without that check anyone who reached an unlocked machine could
 * take the account permanently — and the owner would find out at their next
 * sign-in.
 *
 * **There is no language selector, and that is a decision rather than an
 * omission** (recorded as a decision, not left as a gap). The interface is
 * Arabic-only; a control offering English would do nothing but promise. What
 * genuinely differs between readers is which digits they prefer, so the page
 * offers that instead — through D-018's single switch point.
 */
export default function ProfilePage() {
  const t = useTranslations('profile');
  const tErrors = useTranslations('errors');
  const { user, refreshSession } = usePortal();

  const [fullName, setFullName] = useState(user.fullName);
  const [department, setDepartment] = useState(user.department);
  /* What is actually saved, separate from `user` — `usePortal()` is not
     refetched after a save, so comparing against it would leave the form
     reading "dirty" forever the moment editing succeeds once (the same
     reasoning the CV builder's own `baseline` state exists for). */
  const [baseline, setBaseline] = useState({
    fullName: user.fullName,
    department: user.department,
  });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [saved, setSaved] = useState(false);

  const save = useApiMutation((input: { fullName: string; department: string }) =>
    profileApi.update(input),
  );

  const isDirty = fullName !== baseline.fullName || department !== baseline.department;

  const roleLabel =
    user.role === 'SUPER_ADMIN'
      ? t('roleAdmin')
      : user.role === 'ENTITY'
        ? t('roleEntity')
        : t('roleEmployee');

  const errorFor = (key: FieldName) => {
    const code = fieldErrors[key];
    return code ? tErrors(code) : undefined;
  };

  /*
   * The dropdown only ever *offers* the closed list — but the server still
   * accepts any non-empty department (auth-constants.ts), so an existing
   * value from before this list existed, or simply not on it, must stay
   * selected rather than silently blank out or snap to the first option.
   * Once the employee picks a real option this extra entry drops away on
   * its own, since `department` no longer needs it.
   */
  const departmentOptions =
    department.length === 0 || DEPARTMENTS.includes(department)
      ? DEPARTMENTS
      : [department, ...DEPARTMENTS];

  async function onSave(event: FormEvent) {
    event.preventDefault();
    setSaved(false);

    const errors = validate({ fullName, department });
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const trimmed = { fullName: fullName.trim(), department: department.trim() };
    const result = await save.run(trimmed);

    if (result) {
      /* The server's copy wins — it is what was actually validated and saved. */
      setFullName(result.fullName);
      setDepartment(result.department);
      setBaseline({ fullName: result.fullName, department: result.department });
      setSaved(true);
      /* Keeps the portal-wide `user` in sync with what was just saved — the
         same call `DigitsCard` makes after its own save, and safe to make
         here for the same reason: it no longer re-gates the portal on
         `isLoading`, so it cannot unmount this confirmation out from under
         itself. */
      refreshSession();
    }
  }

  return (
    <PortalPage title={t('title')}>
      <div className="mx-auto max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>{t('personalHeading')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <form
              onSubmit={(event) => void onSave(event)}
              className="flex flex-col gap-6"
              noValidate
            >
              <Field
                id="profile-full-name"
                label={t('fullName')}
                required
                error={errorFor('fullName')}
              >
                {(fieldProps) => (
                  <Input
                    {...fieldProps}
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    autoComplete="name"
                  />
                )}
              </Field>

              <div className="flex flex-col gap-1">
                <span className="text-sm font-semibold text-foreground">{t('email')}</span>
                {/* The address is Latin script; `dir="ltr"` stops RTL reordering
                    turning it into something that is not the user's address. */}
                <span dir="ltr" className="text-start text-sm text-muted-foreground">
                  {user.email}
                </span>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-sm font-semibold text-foreground">{t('employeeId')}</span>
                <span dir="ltr" className="text-start text-sm text-muted-foreground">
                  {user.employeeId}
                </span>
              </div>

              <Field
                id="profile-department"
                label={t('department')}
                required
                error={errorFor('department')}
              >
                {(fieldProps) => (
                  <Select
                    {...fieldProps}
                    value={department}
                    onChange={(event) => setDepartment(event.target.value)}
                  >
                    <option value="" disabled>
                      {t('departmentPlaceholder')}
                    </option>
                    {departmentOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>

              <div className="flex flex-col gap-1">
                <span className="text-sm font-semibold text-foreground">{t('role')}</span>
                <span className="text-sm text-muted-foreground">{roleLabel}</span>
              </div>

              {/* A failed save is reported where the action is, not as a page
                  error — the form is still on screen and still editable. */}
              {save.error ? (
                <p role="alert" className="text-sm font-medium text-destructive">
                  {t('saveFailed')}
                </p>
              ) : null}

              <div className="flex items-center gap-3">
                {/* Same visible "حفظ" every save button on this page uses, but
                    a card-specific accessible name — the digits card below
                    has one too, and two controls both announced as plain
                    "حفظ" would be indistinguishable to a screen reader. */}
                <Button
                  type="submit"
                  aria-label={t('saveAriaLabel')}
                  disabled={save.isPending || !isDirty}
                >
                  {save.isPending ? t('saving') : t('save')}
                </Button>

                {saved && !isDirty && !save.isPending ? (
                  <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Check aria-hidden="true" className="size-4 text-success" />
                    {t('saved')}
                  </span>
                ) : null}
              </div>
            </form>
            {/* No sign-out here: the header's user menu is the one way out
                (D-096) — a second button would be the redundancy §3 forbids. */}
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

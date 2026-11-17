'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { AuthLayout } from '@/components/auth/auth-layout';
import { useErrorMessage } from '@/components/auth/use-error-message';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Select } from '@/components/ui/select';
import { useFormat } from '@/i18n/format-provider';
import { ApiError, authApi } from '@/lib/api-client';
import {
  DEPARTMENTS,
  EMPLOYEE_ID_PATTERN,
  FULL_NAME_DIGITS,
  FULL_NAME_MIN_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '@/lib/auth-constants';

/**
 * Registration (§4.1) as a two-step wizard: the account (email, password,
 * confirmation), then the employee (full name, employee id, department). One
 * client component with local step state — no routing per step, so going back
 * keeps what was typed and the URL stays /register. One submit, at the end;
 * every server rule (restricted domain, employee-id pattern, password policy)
 * is unchanged, and a server error returns the user to the step that owns the
 * offending field.
 *
 * Each step validates its own fields before moving on — the same shapes the
 * server enforces (email form, password length, the employee-id pattern, a
 * department from the list) — so a user learns the rule at the field, not
 * after a round trip. The server remains authoritative.
 *
 * On success the page shows a neutral "check your email" panel that is
 * identical whether or not the address was already registered, preserving the
 * API's enumeration resistance right through to the UI.
 */

type FieldName =
  'email' | 'password' | 'confirmPassword' | 'fullName' | 'employeeId' | 'department';
type FieldErrors = Partial<Record<FieldName, string>>;

/** A deliberately loose shape check: the server decides what an address is. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateStepOne(form: {
  email: string;
  password: string;
  confirmPassword: string;
}): FieldErrors {
  const errors: FieldErrors = {};
  if (!EMAIL_SHAPE.test(form.email.trim())) errors.email = 'EMAIL_INVALID';
  if (form.password.length === 0) errors.password = 'PASSWORD_REQUIRED';
  else if (form.password.length < PASSWORD_MIN_LENGTH) errors.password = 'PASSWORD_TOO_SHORT';
  if (form.password !== form.confirmPassword) errors.confirmPassword = 'PASSWORDS_DO_NOT_MATCH';
  return errors;
}

function validateStepTwo(form: {
  fullName: string;
  employeeId: string;
  department: string;
}): FieldErrors {
  const errors: FieldErrors = {};
  const name = form.fullName.trim();
  if (name.length === 0) errors.fullName = 'FULL_NAME_REQUIRED';
  else if (name.length < FULL_NAME_MIN_LENGTH) errors.fullName = 'FULL_NAME_TOO_SHORT';
  else if (FULL_NAME_DIGITS.test(name)) errors.fullName = 'FULL_NAME_HAS_DIGITS';
  if (form.employeeId.trim().length === 0) errors.employeeId = 'EMPLOYEE_ID_REQUIRED';
  else if (!EMPLOYEE_ID_PATTERN.test(form.employeeId.trim()))
    errors.employeeId = 'EMPLOYEE_ID_INVALID';
  if (!DEPARTMENTS.includes(form.department)) errors.department = 'DEPARTMENT_REQUIRED';
  return errors;
}

const STEP_COUNT = 2;

/** Which step owns each server error code, so the user lands on its field. */
const STEP_FOR_ERROR: Record<string, 1 | 2> = {
  EMAIL_INVALID: 1,
  EMAIL_DOMAIN_NOT_ALLOWED: 1,
  PASSWORD_REQUIRED: 1,
  PASSWORD_TOO_SHORT: 1,
  PASSWORD_TOO_LONG: 1,
  PASSWORDS_DO_NOT_MATCH: 1,
  FULL_NAME_REQUIRED: 2,
  EMPLOYEE_ID_REQUIRED: 2,
  EMPLOYEE_ID_INVALID: 2,
  DEPARTMENT_REQUIRED: 2,
};

export default function RegisterPage() {
  const t = useTranslations('auth');
  /* Error codes live in one app-wide catalogue, not under 'auth' — the same
     codes are raised by every module (D-024). */
  const tErrors = useTranslations('errors');
  const tActions = useTranslations('actions');
  const translateError = useErrorMessage();
  const { number } = useFormat();

  const [step, setStep] = useState<1 | 2>(1);
  const [form, setForm] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    fullName: '',
    employeeId: '',
    department: '',
  });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const update =
    (key: keyof typeof form) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      setForm((current) => ({ ...current, [key]: event.target.value }));
    };

  const errorFor = (key: FieldName) => {
    const code = fieldErrors[key];
    return code ? tErrors(code) : undefined;
  };

  function onNext(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    const errors = validateStepOne(form);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setStep(2);
  }

  function onBack() {
    setFormError(null);
    setStep(1);
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    const errors = validateStepTwo(form);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);

    try {
      await authApi.register({
        email: form.email.trim(),
        password: form.password,
        fullName: form.fullName.trim(),
        employeeId: form.employeeId.trim(),
        department: form.department,
      });
      setSent(true);
    } catch (error) {
      setFormError(translateError(error));
      if (error instanceof ApiError) {
        setStep(STEP_FOR_ERROR[error.code] ?? 2);
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <AuthLayout title={t('registerSentTitle')} subtitle={t('registerSentBody')}>
        <Button asChild size="lg" className="w-full">
          <Link href="/login">{t('signInLink')}</Link>
        </Button>
      </AuthLayout>
    );
  }

  const stepLabel = t('stepOf', { current: number(step), total: number(STEP_COUNT) });

  return (
    <AuthLayout
      title={t('registerTitle')}
      subtitle={t('registerSubtitle')}
      footer={
        <span>
          {t('haveAccount')}{' '}
          <Link
            href="/login"
            className="font-medium text-primary-700 underline-offset-4 hover:underline"
          >
            {t('signInLink')}
          </Link>
        </span>
      }
    >
      {/* The step indicator: text first (the digits are what a screen reader
          needs), then a two-segment track that fills as the user advances. */}
      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold text-foreground">
          {stepLabel}
          <span className="font-normal text-muted-foreground">
            {' — '}
            {step === 1 ? t('stepAccount') : t('stepEmployee')}
          </span>
        </p>
        <div aria-hidden="true" className="flex gap-1.5">
          <span className="h-1 flex-1 rounded-full bg-primary-600" />
          <span
            className={
              step === 2
                ? 'h-1 flex-1 rounded-full bg-primary-600'
                : 'h-1 flex-1 rounded-full bg-neutral-200'
            }
          />
        </div>
      </div>

      {step === 1 ? (
        <form noValidate onSubmit={onNext} className="flex flex-col gap-4">
          <Field id="email" label={t('email')} required error={errorFor('email')}>
            {(props) => (
              <Input
                {...props}
                type="email"
                inputMode="email"
                /* Latin-script field inside an RTL page: force LTR so the
                   address and its punctuation read correctly. */
                dir="ltr"
                value={form.email}
                onChange={update('email')}
                autoComplete="email"
              />
            )}
          </Field>

          <Field
            id="password"
            label={t('password')}
            hint={t('passwordHint', { min: number(PASSWORD_MIN_LENGTH) })}
            required
            error={errorFor('password')}
          >
            {(props) => (
              <PasswordInput
                {...props}
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
            error={errorFor('confirmPassword')}
          >
            {(props) => (
              <PasswordInput
                {...props}
                value={form.confirmPassword}
                onChange={update('confirmPassword')}
                autoComplete="new-password"
              />
            )}
          </Field>

          {formError ? <Alert tone="error">{formError}</Alert> : null}

          <Button type="submit" size="lg" className="w-full">
            {tActions('next')}
          </Button>
        </form>
      ) : (
        <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
          <Field id="fullName" label={t('fullName')} required error={errorFor('fullName')}>
            {(props) => (
              <Input
                {...props}
                value={form.fullName}
                onChange={update('fullName')}
                autoComplete="name"
              />
            )}
          </Field>

          <Field id="employeeId" label={t('employeeId')} required error={errorFor('employeeId')}>
            {(props) => (
              <Input
                {...props}
                dir="ltr"
                inputMode="numeric"
                maxLength={10}
                value={form.employeeId}
                onChange={update('employeeId')}
              />
            )}
          </Field>

          <Field id="department" label={t('department')} required error={errorFor('department')}>
            {(props) => (
              <Select {...props} value={form.department} onChange={update('department')}>
                <option value="" disabled>
                  {t('departmentPlaceholder')}
                </option>
                {DEPARTMENTS.map((department) => (
                  <option key={department} value={department}>
                    {department}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          {formError ? <Alert tone="error">{formError}</Alert> : null}

          <div className="flex flex-col gap-3 sm:flex-row-reverse">
            <Button type="submit" size="lg" disabled={submitting} className="w-full sm:flex-1">
              {submitting ? t('submitting') : t('submitRegister')}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="lg"
              onClick={onBack}
              className="w-full sm:w-auto"
            >
              {tActions('back')}
            </Button>
          </div>
        </form>
      )}
    </AuthLayout>
  );
}

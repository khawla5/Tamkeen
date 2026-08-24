'use client';

import { Check } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';

import { PortalPage } from '@/components/layout/portal-page';
import { usePortal } from '@/components/layout/portal-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { authApi, profileApi } from '@/lib/api-client';
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
 * Profile (§4.12): الاسم الكامل، البريد الإلكتروني، الرقم الوظيفي، الإدارة،
 * الصلاحية — name and department editable in place, the rest read-only.
 *
 * One save for both fields, not per-field autosave: a name change also has to
 * reach Moodle (the course player renders a learner's name from Moodle's own
 * record), and firing that on every keystroke would spam an external system
 * for a field nobody has finished typing. `PATCH /api/me/profile` is
 * best-effort about that propagation — a Moodle hiccup is audited server-side
 * and never blocks or fails this save.
 *
 * §4.12 also lists change-password, email re-verification and a language
 * setting. Still absent, same reason as before: none is this task's
 * deliverable, and a form that does not work is worse than one not yet built.
 */
export default function ProfilePage() {
  const t = useTranslations('profile');
  const tErrors = useTranslations('errors');
  const { user } = usePortal();
  const router = useRouter();

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
  const signOut = useApiMutation(() => authApi.logout());

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
    }
  }

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
                  <Input
                    {...fieldProps}
                    value={department}
                    onChange={(event) => setDepartment(event.target.value)}
                  />
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
                <Button type="submit" disabled={save.isPending || !isDirty}>
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
      </div>
    </PortalPage>
  );
}

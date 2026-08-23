'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import type { UserRole } from '@tamkeen/types';

import { AdminDialog } from '@/components/admin/admin-dialog';
import { useErrorMessage } from '@/components/auth/use-error-message';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { adminApi } from '@/lib/api-client';
import { useApiQuery } from '@/lib/use-api';

/**
 * §4C.2 — provisioning an account.
 *
 * **The form asks for no password, and the result shows none.** The account is
 * created with a hash of random bytes nothing keeps, and an invitation goes to
 * the address; the person chooses their own password from the link. A field for
 * the administrator to type one would create a credential two people know,
 * relayed over whatever channel the admin used to pass it on.
 *
 * The organisation selector appears only for an ENTITY account, because it is
 * required for exactly that role and forbidden for the others — showing it
 * greyed out for an employee would be a control that can never apply (§3).
 */
export function CreateUserDialog({ onClose }: { onClose: () => void }) {
  const t = useTranslations('admin');
  const translateError = useErrorMessage();

  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [department, setDepartment] = useState('');
  const [role, setRole] = useState<UserRole>('EMPLOYEE');
  const [entityId, setEntityId] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invited, setInvited] = useState<string | null>(null);

  /* Only fetched when it can be needed. An employee-only ministry never calls
     the organisations endpoint from this dialog at all. */
  const entities = useApiQuery(
    () => (role === 'ENTITY' ? adminApi.listEntities() : Promise.resolve([])),
    [role],
  );

  async function submit() {
    setError(null);
    setSubmitting(true);

    try {
      const result = await adminApi.createUser({
        email,
        fullName,
        employeeId,
        department,
        role,
        entityId: role === 'ENTITY' ? entityId : undefined,
      });

      setInvited(result.invitationSentTo);
    } catch (caught) {
      setError(translateError(caught));
    } finally {
      setSubmitting(false);
    }
  }

  if (invited) {
    return (
      <AdminDialog
        title={t('inviteSentTitle')}
        onClose={onClose}
        /* No footer action: the account exists and the invitation is out. The
           only thing left to do is close, which the shared cancel button does. */
      >
        <p className="text-sm text-foreground">
          {t('inviteSentBody')}{' '}
          <span dir="ltr" className="font-medium">
            {invited}
          </span>
        </p>
        <p className="text-sm text-muted-foreground">{t('inviteSentHint')}</p>
      </AdminDialog>
    );
  }

  return (
    <AdminDialog
      title={t('createUser')}
      description={t('createUserHint')}
      onClose={onClose}
      footer={
        <Button
          type="button"
          onClick={submit}
          disabled={submitting || !email || !fullName || !employeeId || !department}
        >
          {submitting ? t('sending') : t('sendInvitation')}
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="new-email" label={t('columnEmail')} required>
          {(field) => (
            <Input
              {...field}
              type="email"
              dir="ltr"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          )}
        </Field>

        <Field id="new-name" label={t('columnName')} required>
          {(field) => (
            <Input
              {...field}
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
            />
          )}
        </Field>

        <Field
          id="new-employee-id"
          label={t('columnEmployeeId')}
          /* Named differently for an entity, where it is a reference we assign
             rather than a ministry employee number they already hold. */
          hint={role === 'ENTITY' ? t('employeeIdEntityHint') : undefined}
          required
        >
          {(field) => (
            <Input
              {...field}
              dir="ltr"
              value={employeeId}
              onChange={(event) => setEmployeeId(event.target.value)}
            />
          )}
        </Field>

        <Field id="new-department" label={t('columnDepartment')} required>
          {(field) => (
            <Input
              {...field}
              value={department}
              onChange={(event) => setDepartment(event.target.value)}
            />
          )}
        </Field>

        <Field id="new-role" label={t('columnRole')} required>
          {(field) => (
            <select
              {...field}
              value={role}
              onChange={(event) => setRole(event.target.value as UserRole)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="EMPLOYEE">{t('roleEmployee')}</option>
              <option value="ENTITY">{t('roleEntity')}</option>
              <option value="SUPER_ADMIN">{t('roleAdmin')}</option>
            </select>
          )}
        </Field>

        {role === 'ENTITY' ? (
          <Field
            id="new-entity"
            label={t('columnEntity')}
            hint={entities.data?.length === 0 ? t('noEntitiesYet') : undefined}
            required
          >
            {(field) => (
              <select
                {...field}
                value={entityId}
                onChange={(event) => setEntityId(event.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">{t('chooseEntity')}</option>
                {(entities.data ?? []).map((entity) => (
                  <option key={entity.id} value={entity.id}>
                    {entity.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </AdminDialog>
  );
}

'use client';

import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';

import type { EntityProfileView } from '@tamkeen/types';

import { EntityPage } from '@/components/layout/entity-page';
import { useEntity } from '@/components/layout/entity-provider';
import { DigitsCard } from '@/components/profile/digits-card';
import { PasswordCard } from '@/components/profile/password-card';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/states';
import { entityApi, type CurrentUser } from '@/lib/api-client';
import { useApiMutation } from '@/lib/use-api';

/**
 * §4B.6 — the entity's profile, with the same editable surface the employee
 * has (§4.12): the account holder's own name, the organisation's contact
 * details, the digits preference and the password.
 *
 * **What stays read-only is the organisation's name.** That is what the
 * ministry contracted with (D-063), so it is edited in §4C.2 by the ministry —
 * everything else on the page belongs to the account or to the organisation's
 * own housekeeping, and there is no reason a supplier should have to ask an
 * administrator to correct their contact address.
 *
 * Same two-column arrangement as the employee's page: the account card leads
 * the start column with the digits beneath it, the password sits in the end
 * column. No email-change card — an entity address lives outside the
 * ministry domain that `POST /api/auth/change-email` enforces (D-017), so the
 * card would only ever refuse.
 */
export default function EntityProfilePage() {
  const t = useTranslations('entity');
  const { user, entity, refreshSession } = useEntity();

  return (
    <EntityPage title={t('profileTitle')}>
      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <div className="flex flex-col gap-6">
          {entity === null ? (
            /* A super-admin reaching this page: they legitimately have no
               organisation, which is a normal state to render rather than an
               error to report. */
            <EmptyState title={t('profileEmpty')} />
          ) : (
            <AccountCard user={user} entity={entity} onSaved={refreshSession} />
          )}

          <DigitsCard current={user.numberFormat} onChanged={refreshSession} />
        </div>

        <div className="flex flex-col gap-6">
          <PasswordCard />
        </div>
      </div>
    </EntityPage>
  );
}

type FieldName = 'fullName' | 'contactEmail';
type FieldErrors = Partial<Record<FieldName, string>>;

function validate(form: { fullName: string; contactEmail: string }): FieldErrors {
  const errors: FieldErrors = {};

  if (form.fullName.trim().length === 0) errors.fullName = 'FULL_NAME_REQUIRED';
  /* Empty is allowed — an organisation may have no named contact yet — but an
     address that is present has to look like one before the server says so. */
  const email = form.contactEmail.trim();
  if (email.length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.contactEmail = 'CONTACT_EMAIL_INVALID';
  }

  return errors;
}

/** The account's own name and the organisation's contact — one save (§4B.6). */
function AccountCard({
  user,
  entity,
  onSaved,
}: {
  user: CurrentUser;
  entity: EntityProfileView;
  onSaved: () => void;
}) {
  const t = useTranslations('entity');
  const tProfile = useTranslations('profile');
  const tErrors = useTranslations('errors');

  const [fullName, setFullName] = useState(user.fullName);
  const [contactName, setContactName] = useState(entity.contactName);
  const [contactEmail, setContactEmail] = useState(entity.contactEmail);
  /* What is actually saved, kept apart from the provider's copy for the same
     reason the employee page does: the form must stop reading "dirty" the
     moment a save succeeds, before any refetch lands. */
  const [baseline, setBaseline] = useState({
    fullName: user.fullName,
    contactName: entity.contactName,
    contactEmail: entity.contactEmail,
  });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [saved, setSaved] = useState(false);

  const save = useApiMutation(
    (input: { fullName: string; contactName: string; contactEmail: string }) =>
      entityApi.updateProfile(input),
  );

  const isDirty =
    fullName !== baseline.fullName ||
    contactName !== baseline.contactName ||
    contactEmail !== baseline.contactEmail;

  const errorFor = (key: FieldName) => {
    const code = fieldErrors[key];
    return code ? tErrors(code) : undefined;
  };

  async function onSave(event: FormEvent) {
    event.preventDefault();
    setSaved(false);

    const errors = validate({ fullName, contactEmail });
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const trimmed = {
      fullName: fullName.trim(),
      contactName: contactName.trim(),
      contactEmail: contactEmail.trim(),
    };
    const result = await save.run(trimmed);

    if (result) {
      /* The server's copy wins — it is what was actually validated and saved. */
      setFullName(trimmed.fullName);
      setContactName(result.contactName);
      setContactEmail(result.contactEmail);
      setBaseline({
        fullName: trimmed.fullName,
        contactName: result.contactName,
        contactEmail: result.contactEmail,
      });
      setSaved(true);
      onSaved();
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('profileHeading')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={(event) => void onSave(event)} className="flex flex-col gap-6" noValidate>
          <Field
            id="entity-full-name"
            label={tProfile('fullName')}
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

          <ReadOnly label={tProfile('email')} value={user.email} dir="ltr" />
          <ReadOnly label={tProfile('role')} value={tProfile('roleEntity')} />

          {/* The organisation's name is the ministry's to change (D-063); the
              hint says where, so nobody hunts for an edit that is not here. */}
          <ReadOnly label={t('profileName')} value={entity.name} hint={t('profileNameHint')} />

          <Field id="entity-contact-name" label={t('profileContactName')}>
            {(fieldProps) => (
              <Input
                {...fieldProps}
                value={contactName}
                onChange={(event) => setContactName(event.target.value)}
                autoComplete="organization"
              />
            )}
          </Field>

          <Field
            id="entity-contact-email"
            label={t('profileContactEmail')}
            error={errorFor('contactEmail')}
          >
            {(fieldProps) => (
              <Input
                {...fieldProps}
                type="email"
                dir="ltr"
                value={contactEmail}
                onChange={(event) => setContactEmail(event.target.value)}
                autoComplete="email"
              />
            )}
          </Field>

          {save.error ? (
            <p role="alert" className="text-sm font-medium text-destructive">
              {tProfile('saveFailed')}
            </p>
          ) : null}

          <div className="flex items-center gap-3">
            <Button
              type="submit"
              aria-label={t('profileSaveAriaLabel')}
              disabled={save.isPending || !isDirty}
            >
              {save.isPending ? tProfile('saving') : tProfile('save')}
            </Button>

            {saved && !isDirty && !save.isPending ? (
              <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Check aria-hidden="true" className="size-4 text-success" />
                {tProfile('saved')}
              </span>
            ) : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function ReadOnly({
  label,
  value,
  hint,
  dir,
}: {
  label: string;
  value: string;
  hint?: string;
  dir?: 'ltr';
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-semibold text-foreground">{label}</span>
      {/* `dir="ltr"` for a Latin address so RTL reordering cannot turn it into
          something that is not the address. */}
      <span dir={dir} className="text-start text-sm text-muted-foreground">
        {value}
      </span>
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </div>
  );
}

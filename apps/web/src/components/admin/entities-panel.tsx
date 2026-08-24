'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import type { AdminEntityRow } from '@tamkeen/types';

import { AdminDialog } from '@/components/admin/admin-dialog';
import { useErrorMessage } from '@/components/auth/use-error-message';
import { DataView } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useFormat } from '@/i18n/format-provider';
import { adminApi } from '@/lib/api-client';
import { useApiQuery } from '@/lib/use-api';

/**
 * §4C.2 — the organisations that supply courses.
 *
 * **This is where Phase 4's seam closes.** An entity used to exist only if
 * `prisma/seed.ts` created one, so onboarding a ministry supplier needed a
 * developer with database access.
 *
 * There is no delete, and the two counts are why: an organisation holding
 * courses cannot be removed at all (the schema refuses it, D-063), and one
 * holding accounts is a counterparty on an audit trail that must stay
 * resolvable. Suspension is the operational answer, and it is complete —
 * every request from a suspended organisation's accounts is refused server-side.
 */
export function EntitiesPanel() {
  const t = useTranslations('admin');
  const [creating, setCreating] = useState(false);

  const entities = useApiQuery(() => adminApi.listEntities(), []);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="outline" onClick={() => setCreating(true)}>
          {t('createEntity')}
        </Button>
      </div>

      <DataView
        isLoading={entities.isInitialLoad}
        error={entities.error}
        onRetry={entities.refetch}
        isEmpty={entities.data?.length === 0}
        emptyProps={{ title: t('entitiesEmpty'), body: t('entitiesEmptyHint') }}
      >
        <ul className="space-y-3">
          {(entities.data ?? []).map((entity) => (
            <li key={entity.id}>
              <EntityCard entity={entity} onChanged={entities.refetch} />
            </li>
          ))}
        </ul>
      </DataView>

      {creating ? (
        <CreateEntityDialog
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            entities.refetch();
          }}
        />
      ) : null}
    </div>
  );
}

function EntityCard({ entity, onChanged }: { entity: AdminEntityRow; onChanged: () => void }) {
  const t = useTranslations('admin');
  const format = useFormat();
  const translateError = useErrorMessage();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const suspended = entity.status === 'SUSPENDED';

  async function toggle() {
    setError(null);
    setBusy(true);

    try {
      await adminApi.updateEntity(entity.id, { status: suspended ? 'ACTIVE' : 'SUSPENDED' });
      onChanged();
    } catch (caught) {
      setError(translateError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex flex-wrap items-start justify-between gap-4 p-5">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 font-medium text-foreground">
          {entity.name}
          {suspended ? <Badge variant="navy">{t('statusSuspended')}</Badge> : null}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {/*
            Both counts, because together they answer the only structural
            question an administrator has about an organisation: whether it is
            actually operating, or a shell somebody created and never staffed.
          */}
          {t('entityCounts', {
            accounts: format.number(entity.accountCount),
            courses: format.number(entity.courseCount),
          })}
        </p>
        {entity.contactEmail ? (
          <p className="mt-1 text-sm text-muted-foreground" dir="ltr">
            {entity.contactEmail}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="mt-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>

      <Button variant={suspended ? 'outline' : 'destructive'} disabled={busy} onClick={toggle}>
        {suspended ? t('reactivateEntity') : t('suspendEntity')}
      </Button>
    </Card>
  );
}

function CreateEntityDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const t = useTranslations('admin');
  const translateError = useErrorMessage();

  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setBusy(true);

    try {
      await adminApi.createEntity({
        key,
        name,
        contactName: contactName || undefined,
        contactEmail: contactEmail || undefined,
      });
      onCreated();
    } catch (caught) {
      setError(translateError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminDialog
      title={t('createEntity')}
      description={t('createEntityHint')}
      onClose={onClose}
      footer={
        <Button type="button" onClick={submit} disabled={busy || !key || !name}>
          {t('createEntityAction')}
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="entity-name" label={t('entityName')} required>
          {(field) => (
            <Input {...field} value={name} onChange={(event) => setName(event.target.value)} />
          )}
        </Field>

        <Field id="entity-key" label={t('entityKey')} hint={t('entityKeyHint')} required>
          {(field) => (
            <Input
              {...field}
              dir="ltr"
              value={key}
              onChange={(event) => setKey(event.target.value)}
            />
          )}
        </Field>

        <Field id="entity-contact-name" label={t('entityContactName')}>
          {(field) => (
            <Input
              {...field}
              value={contactName}
              onChange={(event) => setContactName(event.target.value)}
            />
          )}
        </Field>

        <Field id="entity-contact-email" label={t('entityContactEmail')}>
          {(field) => (
            <Input
              {...field}
              type="email"
              dir="ltr"
              value={contactEmail}
              onChange={(event) => setContactEmail(event.target.value)}
            />
          )}
        </Field>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </AdminDialog>
  );
}

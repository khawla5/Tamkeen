'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import type {
  AdminAssessmentAssignmentRow,
  AdminAssessmentGroupRow,
  AdminAssessmentKeyOption,
  AdminUserRow,
  AssignmentScope,
} from '@tamkeen/types';

import { AdminDialog } from '@/components/admin/admin-dialog';
import { useErrorMessage } from '@/components/auth/use-error-message';
import { AdminPage } from '@/components/layout/admin-page';
import { DataView } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useFormat } from '@/i18n/format-provider';
import { adminApi } from '@/lib/api-client';
import { DEPARTMENTS } from '@/lib/auth-constants';
import { useApiQuery } from '@/lib/use-api';
import { cn } from '@/lib/utils';

/**
 * §4C.3's Assignments tab (TAM-147) — who is handed which instrument or named
 * group, whether it is required, and in what order the tracker shows it.
 *
 * **This edits the rule, never the outcome.** An employee's effective list is
 * resolved live from these rows on every dashboard load (see
 * `AssessmentAssignmentResolutionService`) — nothing here computes or stores
 * who currently has what, so a change here reaches every learner it now
 * covers on their next visit, with nothing to re-run.
 *
 * Two resources, one page, the same split the API makes: assignments (who
 * gets what) and groups (named bundles an assignment can point at instead of
 * a single instrument). A group is only ever authored to be assigned, so its
 * editor lives beside the thing that assigns it rather than on its own
 * destination.
 */
export default function AdminAssignmentsPage() {
  const t = useTranslations('admin');
  const [creating, setCreating] = useState(false);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const assignments = useApiQuery(() => adminApi.listAssignments(), []);
  const groups = useApiQuery(() => adminApi.listAssessmentGroups(), []);
  const keys = useApiQuery(() => adminApi.assessmentKeys(), []);

  return (
    <AdminPage
      title={t('assignmentsTitle')}
      action={<Button onClick={() => setCreating(true)}>{t('assignmentCreate')}</Button>}
    >
      <div className="space-y-8">
        {notice ? (
          <p role="status" className="text-sm text-success">
            {notice}
          </p>
        ) : null}

        <section aria-labelledby="assignments-heading" className="space-y-3">
          <h2 id="assignments-heading" className="text-lg font-semibold text-foreground">
            {t('assignmentsHeading')}
          </h2>
          <DataView
            isLoading={assignments.isInitialLoad}
            error={assignments.error}
            onRetry={assignments.refetch}
            isEmpty={assignments.data?.length === 0}
            emptyProps={{ title: t('assignmentsEmpty'), body: t('assignmentsEmptyHint') }}
          >
            <ul className="space-y-3">
              {(assignments.data ?? []).map((row) => (
                <li key={row.id}>
                  <AssignmentCard
                    row={row}
                    onChanged={() => {
                      setNotice(null);
                      assignments.refetch();
                    }}
                    onRemoved={() => {
                      setNotice(t('assignmentRemoved'));
                      assignments.refetch();
                    }}
                  />
                </li>
              ))}
            </ul>
          </DataView>
        </section>

        <section aria-labelledby="groups-heading" className="space-y-3">
          <div className="flex items-center justify-between gap-4">
            <h2 id="groups-heading" className="text-lg font-semibold text-foreground">
              {t('groupsHeading')}
            </h2>
            <Button variant="outline" onClick={() => setCreatingGroup(true)}>
              {t('groupCreate')}
            </Button>
          </div>
          <DataView
            isLoading={groups.isInitialLoad}
            error={groups.error}
            onRetry={groups.refetch}
            isEmpty={groups.data?.length === 0}
            emptyProps={{ title: t('groupsEmpty'), body: t('groupsEmptyHint') }}
          >
            <ul className="space-y-3">
              {(groups.data ?? []).map((group) => (
                <li key={group.id}>
                  <GroupCard
                    group={group}
                    keys={keys.data ?? []}
                    onChanged={() => {
                      setNotice(null);
                      groups.refetch();
                    }}
                    onRemoved={() => {
                      setNotice(t('groupRemoved'));
                      groups.refetch();
                    }}
                  />
                </li>
              ))}
            </ul>
          </DataView>
        </section>
      </div>

      {creating ? (
        <CreateAssignmentDialog
          keys={keys.data ?? []}
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            setNotice(null);
            assignments.refetch();
          }}
        />
      ) : null}

      {creatingGroup ? (
        <SaveGroupDialog
          keys={keys.data ?? []}
          onClose={() => setCreatingGroup(false)}
          onSaved={() => {
            setCreatingGroup(false);
            setNotice(null);
            groups.refetch();
            keys.refetch();
          }}
        />
      ) : null}
    </AdminPage>
  );
}

function AssignmentCard({
  row,
  onChanged,
  onRemoved,
}: {
  row: AdminAssessmentAssignmentRow;
  onChanged: () => void;
  onRemoved: () => void;
}) {
  const t = useTranslations('admin');
  const format = useFormat();
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);

  return (
    <Card className="flex flex-wrap items-start justify-between gap-4 p-5">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 font-medium text-foreground">
          {row.resolvedTitle}
          <Badge variant="soft">
            {row.resolvedKind === 'GROUP'
              ? t('assignmentKindGroup')
              : t('assignmentKindInstrument')}
          </Badge>
          {row.required ? <Badge variant="primary">{t('assignmentRequired')}</Badge> : null}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {t(`assignmentScope.${row.scope}`)}
          {row.scope !== 'ALL' ? ` — ${row.targetLabel ?? row.target}` : ''}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {t('assignmentOrder', { order: format.number(row.displayOrder) })}
        </p>
      </div>

      <div className="flex gap-2">
        <Button variant="outline" onClick={() => setEditing(true)}>
          {t('assignmentEdit')}
        </Button>
        <Button variant="ghost" onClick={() => setRemoving(true)}>
          {t('assignmentRemove')}
        </Button>
      </div>

      {editing ? (
        <EditAssignmentDialog
          row={row}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            onChanged();
          }}
        />
      ) : null}

      {removing ? (
        <RemoveAssignmentDialog
          row={row}
          onClose={() => setRemoving(false)}
          onRemoved={() => {
            setRemoving(false);
            onRemoved();
          }}
        />
      ) : null}
    </Card>
  );
}

function CreateAssignmentDialog({
  keys,
  onClose,
  onCreated,
}: {
  keys: AdminAssessmentKeyOption[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const t = useTranslations('admin');
  const translateError = useErrorMessage();

  const [assessmentKey, setAssessmentKey] = useState('');
  const [scope, setScope] = useState<AssignmentScope>('ALL');
  const [department, setDepartment] = useState(DEPARTMENTS[0] ?? '');
  const [userQuery, setUserQuery] = useState('');
  const [userResults, setUserResults] = useState<AdminUserRow[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [required, setRequired] = useState(true);
  const [displayOrder, setDisplayOrder] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function searchUsers() {
    setSearching(true);
    try {
      const page = await adminApi.listUsers({ q: userQuery });
      setUserResults(page.rows);
    } catch {
      setUserResults([]);
    } finally {
      setSearching(false);
    }
  }

  const canSubmit =
    assessmentKey !== '' &&
    (scope === 'ALL' || (scope === 'DEPARTMENT' ? department !== '' : userId !== null));

  async function submit() {
    setError(null);
    setBusy(true);

    try {
      await adminApi.createAssignment({
        assessmentKey,
        scope,
        target:
          scope === 'DEPARTMENT'
            ? department
            : scope === 'USER'
              ? (userId ?? undefined)
              : undefined,
        required,
        displayOrder,
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
      title={t('assignmentCreate')}
      description={t('assignmentCreateHint')}
      onClose={onClose}
      footer={
        <Button type="button" disabled={busy || !canSubmit} onClick={submit}>
          {t('assignmentCreateAction')}
        </Button>
      }
    >
      <Field id="assignment-key" label={t('assignmentKey')} required>
        {(field) => (
          <select
            {...field}
            value={assessmentKey}
            onChange={(event) => setAssessmentKey(event.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="" disabled>
              {t('assignmentKeyPlaceholder')}
            </option>
            {keys.map((option) => (
              <option key={option.key} value={option.key}>
                {option.title}
                {option.kind === 'GROUP' ? ` (${t('assignmentKindGroup')})` : ''}
              </option>
            ))}
          </select>
        )}
      </Field>

      <Field id="assignment-scope" label={t('assignmentScopeLabel')} required>
        {(field) => (
          <select
            {...field}
            value={scope}
            onChange={(event) => {
              setScope(event.target.value as AssignmentScope);
              setUserId(null);
            }}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="ALL">{t('assignmentScope.ALL')}</option>
            <option value="DEPARTMENT">{t('assignmentScope.DEPARTMENT')}</option>
            <option value="USER">{t('assignmentScope.USER')}</option>
          </select>
        )}
      </Field>

      {scope === 'DEPARTMENT' ? (
        <Field id="assignment-department" label={t('assignmentDepartment')} required>
          {(field) => (
            <select
              {...field}
              value={department}
              onChange={(event) => setDepartment(event.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {DEPARTMENTS.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          )}
        </Field>
      ) : null}

      {scope === 'USER' ? (
        <div className="flex flex-col gap-2">
          <Field id="assignment-user-search" label={t('assignmentUserSearch')}>
            {(field) => (
              <div className="flex gap-2">
                <Input
                  {...field}
                  value={userQuery}
                  onChange={(event) => setUserQuery(event.target.value)}
                />
                <Button type="button" variant="outline" disabled={searching} onClick={searchUsers}>
                  {t('assignmentUserSearchAction')}
                </Button>
              </div>
            )}
          </Field>

          {userResults.length > 0 ? (
            <ul className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-border p-2">
              {userResults.map((user) => (
                <li key={user.id}>
                  <button
                    type="button"
                    onClick={() => setUserId(user.id)}
                    className={cn(
                      'w-full rounded-md px-3 py-2 text-start text-sm',
                      userId === user.id
                        ? 'bg-primary-100 font-medium text-primary-700'
                        : 'hover:bg-neutral-50',
                    )}
                  >
                    {user.fullName} — {user.department}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {userId ? (
            <p className="text-sm text-muted-foreground">
              {t('assignmentUserSelected', {
                name: userResults.find((user) => user.id === userId)?.fullName ?? '',
              })}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="assignment-required" label={t('assignmentRequiredLabel')}>
          {(field) => (
            <select
              {...field}
              value={required ? 'true' : 'false'}
              onChange={(event) => setRequired(event.target.value === 'true')}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="true">{t('assignmentRequired')}</option>
              <option value="false">{t('assignmentOptional')}</option>
            </select>
          )}
        </Field>

        <Field id="assignment-display-order" label={t('assignmentDisplayOrder')} required>
          {(field) => (
            <Input
              {...field}
              type="number"
              min={1}
              max={1000}
              value={displayOrder}
              onChange={(event) => setDisplayOrder(Number(event.target.value) || 1)}
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

function EditAssignmentDialog({
  row,
  onClose,
  onSaved,
}: {
  row: AdminAssessmentAssignmentRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations('admin');
  const translateError = useErrorMessage();

  const [required, setRequired] = useState(row.required);
  const [displayOrder, setDisplayOrder] = useState(row.displayOrder);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setBusy(true);

    try {
      await adminApi.updateAssignment(row.id, { required, displayOrder });
      onSaved();
    } catch (caught) {
      setError(translateError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminDialog
      title={t('assignmentEdit')}
      onClose={onClose}
      footer={
        <Button type="button" disabled={busy} onClick={submit}>
          {t('assignmentSave')}
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={`edit-assignment-required-${row.id}`} label={t('assignmentRequiredLabel')}>
          {(field) => (
            <select
              {...field}
              value={required ? 'true' : 'false'}
              onChange={(event) => setRequired(event.target.value === 'true')}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="true">{t('assignmentRequired')}</option>
              <option value="false">{t('assignmentOptional')}</option>
            </select>
          )}
        </Field>

        <Field id={`edit-assignment-order-${row.id}`} label={t('assignmentDisplayOrder')} required>
          {(field) => (
            <Input
              {...field}
              type="number"
              min={1}
              max={1000}
              value={displayOrder}
              onChange={(event) => setDisplayOrder(Number(event.target.value) || 1)}
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

function RemoveAssignmentDialog({
  row,
  onClose,
  onRemoved,
}: {
  row: AdminAssessmentAssignmentRow;
  onClose: () => void;
  onRemoved: () => void;
}) {
  const t = useTranslations('admin');
  const translateError = useErrorMessage();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setBusy(true);

    try {
      await adminApi.removeAssignment(row.id);
      onRemoved();
    } catch (caught) {
      setError(translateError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminDialog
      title={t('assignmentRemove')}
      description={t('assignmentRemoveBody', { title: row.resolvedTitle })}
      onClose={onClose}
      footer={
        <Button type="button" variant="destructive" disabled={busy} onClick={submit}>
          {t('assignmentRemove')}
        </Button>
      }
    >
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </AdminDialog>
  );
}

function GroupCard({
  group,
  keys,
  onChanged,
  onRemoved,
}: {
  group: AdminAssessmentGroupRow;
  keys: AdminAssessmentKeyOption[];
  onChanged: () => void;
  onRemoved: () => void;
}) {
  const t = useTranslations('admin');
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);

  return (
    <Card className="flex flex-wrap items-start justify-between gap-4 p-5">
      <div className="min-w-0">
        <p className="font-medium text-foreground">{group.name}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {group.memberTitles.filter(Boolean).join('، ') || t('groupNoMembers')}
        </p>
      </div>

      <div className="flex gap-2">
        <Button variant="outline" onClick={() => setEditing(true)}>
          {t('assignmentEdit')}
        </Button>
        <Button variant="ghost" onClick={() => setRemoving(true)}>
          {t('assignmentRemove')}
        </Button>
      </div>

      {editing ? (
        <SaveGroupDialog
          keys={keys}
          group={group}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            onChanged();
          }}
        />
      ) : null}

      {removing ? (
        <RemoveGroupDialog
          group={group}
          onClose={() => setRemoving(false)}
          onRemoved={() => {
            setRemoving(false);
            onRemoved();
          }}
        />
      ) : null}
    </Card>
  );
}

function SaveGroupDialog({
  keys,
  group,
  onClose,
  onSaved,
}: {
  keys: AdminAssessmentKeyOption[];
  group?: AdminAssessmentGroupRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations('admin');
  const translateError = useErrorMessage();

  const [key, setKey] = useState(group?.key ?? '');
  const [name, setName] = useState(group?.name ?? '');
  const [memberKeys, setMemberKeys] = useState<string[]>(group?.memberKeys ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* A group cannot contain another group — the resolver expands one level, so
     only instrument keys are offered as members. */
  const instrumentKeys = keys.filter((option) => option.kind === 'INSTRUMENT');

  function toggle(memberKey: string) {
    setMemberKeys((current) =>
      current.includes(memberKey)
        ? current.filter((value) => value !== memberKey)
        : [...current, memberKey],
    );
  }

  async function submit() {
    setError(null);
    setBusy(true);

    try {
      await adminApi.saveAssessmentGroup({ key, name, memberKeys });
      onSaved();
    } catch (caught) {
      setError(translateError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminDialog
      title={group ? t('groupEdit') : t('groupCreate')}
      onClose={onClose}
      footer={
        <Button
          type="button"
          disabled={busy || !key || !name || memberKeys.length === 0}
          onClick={submit}
        >
          {t('groupSave')}
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="group-name" label={t('groupName')} required>
          {(field) => (
            <Input {...field} value={name} onChange={(event) => setName(event.target.value)} />
          )}
        </Field>

        <Field id="group-key" label={t('groupKey')} hint={t('entityKeyHint')} required>
          {(field) => (
            <Input
              {...field}
              dir="ltr"
              disabled={Boolean(group)}
              value={key}
              onChange={(event) => setKey(event.target.value)}
            />
          )}
        </Field>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-semibold text-foreground">{t('groupMembers')}</legend>
        <div className="flex flex-col gap-2 rounded-md border border-border p-3">
          {instrumentKeys.map((option) => (
            <label key={option.key} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={memberKeys.includes(option.key)}
                onChange={() => toggle(option.key)}
                className="size-4 accent-primary-600"
              />
              {option.title}
            </label>
          ))}
        </div>
      </fieldset>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </AdminDialog>
  );
}

function RemoveGroupDialog({
  group,
  onClose,
  onRemoved,
}: {
  group: AdminAssessmentGroupRow;
  onClose: () => void;
  onRemoved: () => void;
}) {
  const t = useTranslations('admin');
  const translateError = useErrorMessage();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setBusy(true);

    try {
      await adminApi.removeAssessmentGroup(group.id);
      onRemoved();
    } catch (caught) {
      setError(translateError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminDialog
      title={t('assignmentRemove')}
      description={t('groupRemoveBody', { name: group.name })}
      onClose={onClose}
      footer={
        <Button type="button" variant="destructive" disabled={busy} onClick={submit}>
          {t('assignmentRemove')}
        </Button>
      }
    >
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </AdminDialog>
  );
}

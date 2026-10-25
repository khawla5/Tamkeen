'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { type AdminUserDetail } from '@tamkeen/types';

import { AdminDialog } from '@/components/admin/admin-dialog';
import { useErrorMessage } from '@/components/auth/use-error-message';
import { DataView } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { useFormat } from '@/i18n/format-provider';
import { adminApi } from '@/lib/api-client';
import { DEPARTMENTS } from '@/lib/auth-constants';
import { useApiQuery } from '@/lib/use-api';

/**
 * §4C.2 — one account: where they are, and what can be done with it.
 *
 * **The journey is a summary, not a copy of the learner's screens.** The Holland
 * Code without the six scores, progress without the course list, a certificate
 * count rather than the certificates. An administrator asks "where is this
 * person up to, and is anything stuck"; answering more than that would mean two
 * implementations of what "complete" means and would put a colleague's training
 * record on a screen that did not need it.
 *
 * **The role is not here, and that is deliberate.** An account's role is decided
 * once, when it is created; changing it afterwards is not a thing this screen
 * does for anybody. What it offers is an employee's department, suspending and
 * reactivating, re-sending an invitation, and deleting.
 *
 * Suspending and deleting can be refused by the server — an administrator cannot
 * act on their own account, cannot remove the last active administrator, and
 * cannot delete an account that holds certificates. The refusal is shown as it is
 * returned rather than pre-empted by hiding the control: a disabled button with
 * no explanation teaches nothing, and the rules are the server's to enforce in
 * any case.
 */
export function UserDetailPanel({
  userId,
  onClose,
  onChanged,
}: {
  userId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const t = useTranslations('admin');
  const detail = useApiQuery(() => adminApi.getUser(userId), [userId]);

  return (
    <AdminDialog title={t('manageAccount')} onClose={onClose}>
      <DataView isLoading={detail.isInitialLoad} error={detail.error} onRetry={detail.refetch}>
        {detail.data ? (
          <Body
            user={detail.data}
            onChanged={() => {
              detail.refetch();
              onChanged();
            }}
            onDeleted={() => {
              /* The list behind the panel is stale, and the panel has no subject
                 any more — so refresh the one and close the other. */
              onChanged();
              onClose();
            }}
          />
        ) : null}
      </DataView>
    </AdminDialog>
  );
}

function Body({
  user,
  onChanged,
  onDeleted,
}: {
  user: AdminUserDetail;
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const t = useTranslations('admin');
  const format = useFormat();
  const translateError = useErrorMessage();

  /* An employee's one editable fact is where they work, so the department is the
     decision this section makes for them. */
  const isEmployee = user.role === 'EMPLOYEE';
  const [department, setDepartment] = useState(user.department);
  /* The list the registration form offers, plus the account's own department if it
     predates the list — dropping it would make the select lie about where the
     person is. */
  const departments = DEPARTMENTS.includes(user.department)
    ? DEPARTMENTS
    : [user.department, ...DEPARTMENTS];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  async function run(action: () => Promise<unknown>, message: string) {
    setError(null);
    setDone(null);
    setBusy(true);

    try {
      await action();
      setDone(message);
      onChanged();
    } catch (caught) {
      setError(translateError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <Detail label={t('columnName')} value={user.fullName} />
        <Detail label={t('columnEmail')} value={user.email} ltr />
        <Detail label={t('columnEmployeeId')} value={user.employeeId} ltr />
        <Detail label={t('columnDepartment')} value={user.department} />
        <Detail
          label={t('columnStatus')}
          value={
            user.status === 'SUSPENDED'
              ? t('statusSuspended')
              : user.emailVerifiedAt
                ? t('statusActive')
                : t('statusInvited')
          }
        />
        <Detail label={t('activeSessions')} value={format.number(user.activeSessions)} />
      </dl>

      <section className="rounded-md border border-border p-4">
        <h3 className="mb-2 text-sm font-semibold text-foreground">{t('journeyHeading')}</h3>
        {/* The paths themselves are not repeated here: the assignments section
            below names each one with its rung and its one control, and a second
            rendering of the same list would be the redundant UI §3 forbids. */}
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <Detail label={t('journeyCertificates')} value={format.number(user.certificateCount)} />
          <Detail
            label={t('journeyLms')}
            value={user.hasLmsAccount ? t('lmsProvisioned') : t('lmsNotProvisioned')}
          />
        </dl>
      </section>

      {user.role === 'EMPLOYEE' ? <AssignmentsSection user={user} busy={busy} run={run} /> : null}

      <section className="flex flex-col gap-3 rounded-md border border-border p-4">
        <h3 className="text-sm font-semibold text-foreground">
          {isEmployee ? t('departmentHeading') : t('accountStatusHeading')}
        </h3>

        {isEmployee ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="detail-department" label={t('columnDepartment')}>
              {(field) => (
                <select
                  {...field}
                  value={department}
                  onChange={(event) => setDepartment(event.target.value)}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  {departments.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {/* Offered only once the department has been changed (§3). */}
          {isEmployee && department !== user.department ? (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() =>
                run(() => adminApi.setUserDepartment(user.id, department), t('departmentChanged'))
              }
            >
              {t('applyDepartment')}
            </Button>
          ) : null}

          {user.status === 'ACTIVE' ? (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              className="border-danger text-danger hover:bg-danger-50"
              onClick={() =>
                run(() => adminApi.setUserStatus(user.id, 'SUSPENDED'), t('accountSuspended'))
              }
            >
              {t('suspendAccount')}
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() =>
                run(() => adminApi.setUserStatus(user.id, 'ACTIVE'), t('accountReactivated'))
              }
            >
              {t('reactivateAccount')}
            </Button>
          )}

          {/* The solid red is the one that cannot be undone: the account and its
              records are removed (suspending is the outlined red beside it, and
              reversible). The step beyond suspending.
              A confirmation stands in front of it, and the server refuses what must
              not go (yourself, the last administrator, a holder of certificates). */}
          <Button
            type="button"
            variant="destructive"
            disabled={busy}
            onClick={() => setConfirmingDelete(true)}
          >
            {t('deleteAccount')}
          </Button>

          {/* Only for an account that has never been activated. Re-inviting one
              that has is a password reset, and the server refuses it as such. */}
          {!user.emailVerifiedAt ? (
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => run(() => adminApi.reinvite(user.id), t('invitationResent'))}
            >
              {t('resendInvitation')}
            </Button>
          ) : null}
        </div>

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        {done ? (
          <p role="status" className="text-sm text-success">
            {done}
          </p>
        ) : null}
      </section>

      {confirmingDelete ? (
        <ConfirmDeleteAccountDialog
          user={user}
          onClose={() => setConfirmingDelete(false)}
          onDeleted={onDeleted}
        />
      ) : null}
    </div>
  );
}

function ConfirmDeleteAccountDialog({
  user,
  onClose,
  onDeleted,
}: {
  user: AdminUserDetail;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const t = useTranslations('admin');
  const translateError = useErrorMessage();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setBusy(true);

    try {
      await adminApi.deleteUser(user.id);
      onDeleted();
    } catch (caught) {
      /* Shown here rather than swallowed: the likeliest refusals are the ones the
         server exists to make — yourself, the last administrator, an account
         that holds certificates — and its answer names which. */
      setError(translateError(caught));
      setBusy(false);
    }
  }

  return (
    <AdminDialog
      title={t('deleteAccountTitle')}
      description={user.fullName}
      onClose={onClose}
      footer={
        <Button type="button" variant="destructive" disabled={busy} onClick={() => void submit()}>
          {t('deleteAccountConfirm')}
        </Button>
      }
    >
      <p className="text-sm text-muted-foreground">{t('deleteAccountBody')}</p>
      {user.hasLmsAccount ? (
        <p className="text-sm text-muted-foreground">{t('deleteAccountLms')}</p>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </AdminDialog>
  );
}

/**
 * D-130/D-133/D-134 — which paths this employee is on, managed here.
 *
 * **Assignment is an account decision**, not a screen of its own: the current
 * assignments with their status (revoke only while nobody has been placed —
 * absence, not a disabled control), and the paths they are not on yet as a
 * multi-selection with one assign action for everything ticked.
 *
 * Checkboxes rather than a `<select multiple>`: the honest multi-select control,
 * where a ctrl-click list hides its own mechanics. Only **published** paths are
 * offered — a draft has no assessment or nothing placed, so assigning somebody
 * to it would strand them, and the server refuses it anyway.
 */
function AssignmentsSection({
  user,
  busy,
  run,
}: {
  user: AdminUserDetail;
  busy: boolean;
  run: (action: () => Promise<unknown>, message: string) => Promise<void>;
}) {
  const t = useTranslations('admin');
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());

  const paths = useApiQuery(() => adminApi.listPaths(), []);

  const assignable = (paths.data ?? []).filter(
    (path) =>
      path.status === 'PUBLISHED' &&
      /* A REVOKED hold is history, not a current one — the path is offered
         again, and assigning it reactivates that same row. */
      !user.paths.some((held) => held.pathId === path.id && held.status !== 'REVOKED'),
  );
  /* The selection survives refetches only while it is still assignable. */
  const selected = assignable.filter((path) => chosen.has(path.id));

  function toggle(pathId: string) {
    setChosen((current) => {
      const next = new Set(current);
      if (next.has(pathId)) {
        next.delete(pathId);
      } else {
        next.add(pathId);
      }
      return next;
    });
  }

  return (
    <section className="flex flex-col gap-3 rounded-md border border-border p-4">
      <h3 className="text-sm font-semibold text-foreground">{t('assignments.heading')}</h3>

      {user.paths.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {user.paths.map((path) => (
            <li
              key={path.userPathId}
              className="flex flex-wrap items-center gap-2 border-b border-border pb-2 last:border-b-0"
            >
              <span className="min-w-0 flex-1 text-sm text-foreground">{path.name}</span>

              {path.status === 'REVOKED' ? (
                <Badge variant="neutral">{t('assignments.statusRevoked')}</Badge>
              ) : path.placedLevel ? (
                <Badge variant="success">{path.placedLevel.name}</Badge>
              ) : (
                <Badge variant="neutral">{t('assignments.statusPending')}</Badge>
              )}

              {/* A REVOKED row has nothing left to revoke — it is already the
                  history a revoke produces, and reassigning it happens through
                  the list below, not a control here. Everything still held
                  (placed or not) can be revoked: the row moves to REVOKED and
                  keeps whatever progress exists under it rather than being
                  deleted (§3 — absence once there truly is nothing left, not
                  before). */}
              {path.status === 'REVOKED' ? null : (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => {
                    if (path.placedLevel && !window.confirm(t('assignments.revokeConfirm'))) {
                      return;
                    }

                    void run(
                      () => adminApi.revokePath(user.id, path.pathId),
                      t('assignments.revoked'),
                    );
                  }}
                >
                  {t('assignments.revoke')}
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{t('assignments.none')}</p>
      )}

      {assignable.length > 0 ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium text-foreground">
            {t('assignments.assignLabel')}
          </legend>
          {assignable.map((path) => (
            <label
              key={path.id}
              className="flex w-fit cursor-pointer items-center gap-2.5 text-sm text-foreground"
            >
              <input
                type="checkbox"
                className="size-4 accent-primary-600"
                checked={chosen.has(path.id)}
                disabled={busy}
                onChange={() => toggle(path.id)}
              />
              {path.name}
            </label>
          ))}
          <Button
            type="button"
            variant="outline"
            className="mt-1 self-start"
            disabled={busy || selected.length === 0}
            onClick={() =>
              run(
                /* One decision per path on the wire too — each grant is its own
                   auditable event, exactly as the API records it. */
                () => Promise.all(selected.map((path) => adminApi.assignPath(path.id, [user.id]))),
                t('assignments.assigned'),
              )
            }
          >
            {t('assignments.assignAction')}
          </Button>
        </fieldset>
      ) : null}
    </section>
  );
}

function Detail({ label, value, ltr }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-all font-medium text-foreground" dir={ltr ? 'ltr' : undefined}>
        {value}
      </dd>
    </div>
  );
}

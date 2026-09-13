'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { type AdminUserDetail, type UserRole } from '@tamkeen/types';

import { AdminDialog } from '@/components/admin/admin-dialog';
import { useErrorMessage } from '@/components/auth/use-error-message';
import { DataView } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { useFormat } from '@/i18n/format-provider';
import { adminApi } from '@/lib/api-client';
import { useApiQuery } from '@/lib/use-api';

/**
 * §4C.2 — one account: where they are, and the two decisions available.
 *
 * **The journey is a summary, not a copy of the learner's screens.** The Holland
 * Code without the six scores, progress without the course list, a certificate
 * count rather than the certificates. An administrator asks "where is this
 * person up to, and is anything stuck"; answering more than that would mean two
 * implementations of what "complete" means and would put a colleague's training
 * record on a screen that did not need it.
 *
 * Both decisions can be refused by the server — an administrator cannot change
 * their own role, cannot remove the last active administrator, and cannot
 * convert a learner who already holds a result or a certificate. The refusal is
 * shown as it is returned rather than pre-empted by hiding the control: a
 * disabled button with no explanation teaches nothing, and the rules are the
 * server's to enforce in any case.
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
          />
        ) : null}
      </DataView>
    </AdminDialog>
  );
}

function Body({ user, onChanged }: { user: AdminUserDetail; onChanged: () => void }) {
  const t = useTranslations('admin');
  const format = useFormat();
  const translateError = useErrorMessage();

  const [role, setRole] = useState<UserRole>(user.role);
  const [entityId, setEntityId] = useState(user.entity?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const entities = useApiQuery(
    () => (role === 'ENTITY' ? adminApi.listEntities() : Promise.resolve([])),
    [role],
  );

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
<<<<<<< HEAD
=======
          <Detail
            label={t('journeyPath')}
            value={
              user.path
                ? `${user.path.name} · ${format.fraction(user.path.coursesPassed, user.path.coursesChosen)}`
                : t('journeyNoPath')
            }
          />
>>>>>>> origin/main
          <Detail label={t('journeyCertificates')} value={format.number(user.certificateCount)} />
          <Detail
            label={t('journeyLms')}
            value={user.hasLmsAccount ? t('lmsProvisioned') : t('lmsNotProvisioned')}
          />
        </dl>
      </section>

<<<<<<< HEAD
      {user.role === 'EMPLOYEE' ? <AssignmentsSection user={user} busy={busy} run={run} /> : null}
=======
      {/*
       * Every instrument this person has taken (§4C.2 part 5, TAM-147) — the
       * Holland code or the CEFR level, the version, the date, and the retake
       * count where one exists. Never the per-question answers: those are kept
       * only so a result can be re-explained (§3A), not for review here.
       */}
      <section className="rounded-md border border-border p-4">
        <h3 className="mb-2 text-sm font-semibold text-foreground">{t('assessmentsHeading')}</h3>
        {user.assessments.length > 0 ? (
          <ul className="flex flex-col divide-y divide-border">
            {user.assessments.map((assessment) => (
              <li
                key={assessment.key}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2 text-sm"
              >
                <span className="font-medium text-foreground">{assessment.title}</span>
                <span dir="ltr" className="text-muted-foreground">
                  {assessment.result} ·{' '}
                  {t('versionLabel', { version: format.number(assessment.version) })} ·{' '}
                  {format.date(new Date(assessment.completedAt))}
                  {assessment.attempts > 1
                    ? ` · ${t('journeyAttempts', { count: format.number(assessment.attempts) })}`
                    : ''}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{t('journeyNotAssessed')}</p>
        )}
      </section>
>>>>>>> origin/main

      <section className="flex flex-col gap-3 rounded-md border border-border p-4">
        <h3 className="text-sm font-semibold text-foreground">{t('roleHeading')}</h3>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="detail-role" label={t('columnRole')}>
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
            <Field id="detail-entity" label={t('columnEntity')}>
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

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() =>
              run(
                () => adminApi.setUserRole(user.id, role, role === 'ENTITY' ? entityId : undefined),
                t('roleChanged'),
              )
            }
          >
            {t('applyRole')}
          </Button>

          {user.status === 'ACTIVE' ? (
            <Button
              type="button"
              variant="destructive"
              disabled={busy}
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
    </div>
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
    (path) => path.status === 'PUBLISHED' && !user.paths.some((held) => held.pathId === path.id),
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

              {path.placedLevel ? (
                <Badge variant="success">{path.placedLevel.name}</Badge>
              ) : (
                <Badge variant="neutral">{t('assignments.statusPending')}</Badge>
              )}

              {/* Absence, not a disabled control (§3): once a learner has been
                  placed the assignment is part of a record, and revoking it
                  would leave a placement pointing at a path they were never
                  on. */}
              {path.placedLevel ? null : (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    run(() => adminApi.revokePath(user.id, path.pathId), t('assignments.revoked'))
                  }
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

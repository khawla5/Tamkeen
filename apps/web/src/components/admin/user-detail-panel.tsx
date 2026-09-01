'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import {
  ASSESSMENT_INSTRUMENTS,
  type AdminUserDetail,
  type AssessmentInstrument,
  type UserRole,
} from '@tamkeen/types';

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
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <Detail
            label={t('journeyAssessment')}
            value={
              user.assessment
                ? /* Latin letters in an RTL page. */
                  `${user.assessment.code} · ${format.date(new Date(user.assessment.completedAt))}`
                : t('journeyNotAssessed')
            }
            ltr={Boolean(user.assessment)}
          />
          <Detail
            label={t('journeyPath')}
            value={
              user.path
                ? `${user.path.name} · ${format.fraction(user.path.coursesPassed, user.path.coursesChosen)}`
                : t('journeyNoPath')
            }
          />
          <Detail label={t('journeyCertificates')} value={format.number(user.certificateCount)} />
          <Detail
            label={t('journeyLms')}
            value={user.hasLmsAccount ? t('lmsProvisioned') : t('lmsNotProvisioned')}
          />
        </dl>
      </section>

      {user.role === 'EMPLOYEE' ? <AssignmentsSection user={user} busy={busy} run={run} /> : null}

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
 * D-132/D-133 — which instruments this employee may take, managed here:
 * current assignments with their status (revoke only while untaken — absence,
 * not a disabled control), and the not-yet-assigned instruments as a
 * multi-selection (checkboxes — the honest multi-select control; a
 * ctrl-click `<select multiple>` hides its own mechanics) with one assign
 * action for everything ticked. When every instrument is assigned the
 * control is gone — there is nothing left to decide.
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
  const [chosen, setChosen] = useState<ReadonlySet<AssessmentInstrument>>(new Set());

  const unassigned = ASSESSMENT_INSTRUMENTS.filter(
    (instrument) => !user.assignments.some((assignment) => assignment.instrument === instrument),
  );
  /* The selection survives refetches only while it is still assignable. */
  const selected = unassigned.filter((instrument) => chosen.has(instrument));

  function toggle(instrument: AssessmentInstrument) {
    setChosen((current) => {
      const next = new Set(current);
      if (next.has(instrument)) {
        next.delete(instrument);
      } else {
        next.add(instrument);
      }
      return next;
    });
  }

  return (
    <section className="flex flex-col gap-3 rounded-md border border-border p-4">
      <h3 className="text-sm font-semibold text-foreground">{t('assignments.heading')}</h3>

      {user.assignments.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {user.assignments.map((assignment) => (
            <li
              key={assignment.id}
              className="flex flex-wrap items-center justify-between gap-2 text-sm"
            >
              <span className="flex items-center gap-2">
                <span className="font-medium text-foreground">
                  {t(`assignments.instrument.${assignment.instrument}`)}
                </span>
                {assignment.taken ? (
                  <Badge variant="success">{t('assignments.statusTaken')}</Badge>
                ) : (
                  <Badge variant="neutral">{t('assignments.statusPending')}</Badge>
                )}
              </span>
              {assignment.taken ? null : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    run(() => adminApi.revokeAssignment(assignment.id), t('assignments.revoked'))
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

      {unassigned.length > 0 ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium text-foreground">
            {t('assignments.assignLabel')}
          </legend>
          {unassigned.map((instrument) => (
            <label
              key={instrument}
              className="flex w-fit cursor-pointer items-center gap-2.5 text-sm text-foreground"
            >
              <input
                type="checkbox"
                className="size-4 accent-primary-600"
                checked={chosen.has(instrument)}
                disabled={busy}
                onChange={() => toggle(instrument)}
              />
              {t(`assignments.instrument.${instrument}`)}
            </label>
          ))}
          <Button
            type="button"
            variant="outline"
            className="mt-1 self-start"
            disabled={busy || selected.length === 0}
            onClick={() =>
              run(
                /* One decision per instrument on the wire too — each grant is
                   its own auditable event, exactly as the API records it. */
                () =>
                  Promise.all(
                    selected.map((instrument) =>
                      adminApi.assign({ instrument, userIds: [user.id] }),
                    ),
                  ),
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

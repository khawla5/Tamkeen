'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';

import type { AdminDashboardView } from '@tamkeen/types';

import { AdminPage } from '@/components/layout/admin-page';
import { DataView } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { adminApi } from '@/lib/api-client';
import { useApiQuery } from '@/lib/use-api';
import { useFormat } from '@/i18n/format-provider';

/**
 * §4C.1 — the admin dashboard.
 *
 * **Integration health is the page; the counts are context.** §4C.1 asks for
 * both, and §3 requires that what is shown be actionable — an administrator can
 * do nothing about "312 employees", but a Moodle that stopped answering, or a
 * sync job that has not run since yesterday, is theirs to fix and nobody else's.
 * So health sits first and reads in words rather than as a coloured tick, and
 * the totals follow as the context that makes the health figure mean something.
 */
export default function AdminDashboardPage() {
  const t = useTranslations('admin');
  const dashboard = useApiQuery(() => adminApi.dashboard(), []);

  return (
    <AdminPage title={t('dashboardTitle')}>
      <DataView isLoading={dashboard.isLoading} error={dashboard.error} onRetry={dashboard.refetch}>
        {dashboard.data ? <DashboardBody data={dashboard.data} /> : null}
      </DataView>
    </AdminPage>
  );
}

function DashboardBody({ data }: { data: AdminDashboardView }) {
  const t = useTranslations('admin');
  const format = useFormat();

  return (
    <div className="space-y-8">
      <IntegrationHealth data={data} />

      <section aria-labelledby="admin-people">
        <SectionHeading id="admin-people">{t('sectionPeople')}</SectionHeading>
        {/*
          Three tiles, not four. The count of accounts that never verified their
          address used to sit here, and it was the one figure on the page an
          administrator could neither act on nor interpret: it cannot say WHICH
          accounts, and §4C.2 already marks each one «بانتظار التفعيل» beside the
          resend-invitation button that fixes it. A number whose only use is to
          send you somewhere else is what §3 rules out.
        */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Stat label={t('statEmployees')} value={format.number(data.users.employees)} />
          <Stat label={t('statEntities')} value={format.number(data.entities.active)} />
          <Stat label={t('statSuspended')} value={format.number(data.users.suspended)} />
        </div>
      </section>

      <section aria-labelledby="admin-journey">
        <SectionHeading id="admin-journey">{t('sectionJourney')}</SectionHeading>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label={t('statAssessed')} value={format.number(data.journey.assessed)} />
          <Stat label={t('statActivePaths')} value={format.number(data.journey.active)} />
          <Stat
            label={t('statPathCompletion')}
            /* An em dash, not 0%: a rate over an empty denominator is undefined,
               and "0%" on a product nobody has finished yet reads as failure. */
            value={
              data.journey.pathCompletionRate === null
                ? '—'
                : format.percent(data.journey.pathCompletionRate)
            }
          />
          <Stat
            label={t('statCertificates')}
            value={format.number(data.journey.certificatesIssued)}
          />
        </div>
      </section>

      <section aria-labelledby="admin-catalogue">
        <SectionHeading id="admin-catalogue">{t('sectionCatalogue')}</SectionHeading>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label={t('statPathsActive')} value={format.number(data.paths.active)} />
          <Stat label={t('statCoursesPublished')} value={format.number(data.courses.published)} />
          <Stat label={t('statCoursesDraft')} value={format.number(data.courses.draft)} />
          {/* Courses no entity supplies (D-063). §4C.5 makes them the admin's,
              and they are invisible from every entity portal by construction. */}
          <Stat label={t('statCoursesUnowned')} value={format.number(data.courses.unowned)} />
        </div>
      </section>

      <LetterDistribution rows={data.letterDistribution} />
      <RecentActivity rows={data.recentActivity} />
    </div>
  );
}

function IntegrationHealth({ data }: { data: AdminDashboardView }) {
  const t = useTranslations('admin');
  const format = useFormat();

  const stamp = (value: string | null) =>
    value === null ? t('syncNever') : format.dateTime(new Date(value));

  return (
    <section aria-labelledby="admin-health">
      <SectionHeading id="admin-health">{t('sectionHealth')}</SectionHeading>

      <Card className="p-5">
        <p className="flex flex-wrap items-center gap-2 text-base font-medium text-foreground">
          {/*
            The dot is decorative and paired with the wording beside it: colour
            alone must never carry the state (WCAG 1.4.1), and "متصل" / "غير
            متصل" is what a screen reader and a colour-blind operator both read.
          */}
          <span
            aria-hidden="true"
            className={`size-2.5 shrink-0 rounded-full ${data.lms.reachable ? 'bg-success' : 'bg-destructive'}`}
          />
          {data.lms.reachable ? t('lmsReachable') : t('lmsUnreachable')}
          {data.lms.siteName ? (
            <span className="text-sm font-normal text-muted-foreground">{data.lms.siteName}</span>
          ) : null}
        </p>

        {/* Why it is unreachable, when it is: a bad token and a down server need
            different fixes, and one red dot would cost the operator an hour. */}
        {!data.lms.reachable && data.lms.failureCode ? (
          <p className="mt-2 text-sm text-destructive">{t(`lmsFailure.${data.lms.failureCode}`)}</p>
        ) : null}

        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-3">
          <Detail label={t('lmsAddress')} value={data.lms.baseUrl || '—'} ltr />
          {/*
            Sync freshness is asked separately from reachability on purpose: a
            Moodle that answers while the job has not run since yesterday is a
            healthy LMS behind a broken scheduler, and a single tick hides it.
          */}
          <Detail label={t('lastCatalogSync')} value={stamp(data.lms.lastCatalogSyncAt)} />
          <Detail label={t('lastCompletionSync')} value={stamp(data.lms.lastCompletionSyncAt)} />
        </dl>

        {data.assessment ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <p className="text-sm text-muted-foreground">
              {t('assessmentVersion', {
                version: format.number(data.assessment.version),
                date: format.date(new Date(data.assessment.effectiveFrom)),
              })}
            </p>

            {/*
              The unfinished edit, finally shown. The server has reported
              `hasDraft` since §4C.1 was built — "the one thing on this page
              waiting on the administrator personally" — and nothing rendered
              it, so a half-finished assessment could sit unpublished with no
              trace of it anywhere an administrator looks first. It appears only
              when there IS a draft, so it costs nothing on the ordinary day.
            */}
            {data.assessment.hasDraft ? (
              <span className="flex flex-wrap items-center gap-3">
                <span className="text-sm text-foreground">{t('assessmentDraftPending')}</span>
                <Button asChild size="sm" variant="outline">
                  <Link href="/admin/assessment">{t('assessmentDraftAction')}</Link>
                </Button>
              </span>
            ) : null}
          </div>
        ) : null}
      </Card>
    </section>
  );
}

/**
 * §4C.1 — where the ministry's people are, against what is offered them.
 *
 * **This used to be a list of Holland Codes, and it said nothing.** «SIA» is
 * three Latin letters in an RTL page, one of thirty-odd values, and no
 * administrator has ever had a decision that turned on it — §4C.8's reports
 * already keep that breakdown for the analyst who wants it, so the dashboard
 * copy bought nothing either. The bars were painted in a token D-069 retired,
 * so they rendered with no fill at all: the chart was invisible as well.
 *
 * What replaces it is the same population read by its *dominant* letter — six
 * values, each with the Arabic name the ministry already uses — set beside the
 * number of paths offered for that letter. The pairing is the point: a type
 * many employees lead with and no path serves is a gap in the catalogue, and
 * this is the only screen where both halves of that comparison exist.
 */
function LetterDistribution({ rows }: { rows: AdminDashboardView['letterDistribution'] }) {
  const t = useTranslations('admin');
  const format = useFormat();

  const assessed = rows.reduce((sum, row) => sum + row.employees, 0);
  /* Bars scale against the largest share rather than the total: six types
     rarely split evenly, and against the total the smaller ones would all be
     slivers of much the same indistinguishable width. */
  const largest = rows.reduce((max, row) => Math.max(max, row.employees), 0);

  return (
    <section aria-labelledby="admin-codes">
      <SectionHeading id="admin-codes">{t('sectionCodes')}</SectionHeading>

      {assessed === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">{t('codesEmpty')}</Card>
      ) : (
        <Card className="p-5">
          {/* Says what the section counts, because a bare "توزيع" left the
              administrator guessing whether it meant people, paths or results. */}
          <p className="mb-4 text-sm text-muted-foreground">{t('sectionCodesHint')}</p>

          <ul className="space-y-4">
            {rows.map((row) => (
              <li key={row.letter} className="grid gap-1">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-medium text-foreground">
                    {t(`riasec.${row.letter}`)}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {/* The count and its share: a bar is a comparison, and an
                        administrator reporting upward needs the number. */}
                    {t('codesColumnEmployees', { count: format.number(row.employees) })} ·{' '}
                    {format.percent(Math.round((row.employees / assessed) * 100))}
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="h-2 flex-1 overflow-hidden rounded-full bg-muted/20"
                  >
                    <span
                      className="block h-full rounded-full bg-primary"
                      style={{
                        width: largest === 0 ? '0%' : `${(row.employees / largest) * 100}%`,
                      }}
                    />
                  </span>

                  {/*
                    The other half of the comparison. A type with no path offered
                    for it is the finding this section exists to surface, so it
                    is said in words rather than left as a "0" to be noticed —
                    and the warning colour is paired with that wording, never
                    carrying the meaning alone (WCAG 1.4.1).
                  */}
                  <span
                    className={
                      row.activePaths === 0
                        ? 'shrink-0 text-xs font-medium text-warning'
                        : 'shrink-0 text-xs text-muted-foreground'
                    }
                  >
                    {row.activePaths === 0
                      ? t('codesNoPaths')
                      : t('codesColumnPaths', { count: format.number(row.activePaths) })}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </section>
  );
}

/**
 * §4C.1 — the newest audit entries.
 *
 * **The list scrolls inside itself.** It is the only unbounded section on the
 * page: everything above it is a fixed set of figures, so letting a dozen
 * activity rows decide the page's height pushed the integration health — the
 * thing the page is actually for — further from the fold every time the
 * ministry got busier. The container is focusable and labelled so it can be
 * reached and scrolled from the keyboard, which an `overflow` box otherwise
 * cannot be (WCAG 2.1.1).
 */
function RecentActivity({ rows }: { rows: AdminDashboardView['recentActivity'] }) {
  const t = useTranslations('admin');
  const tAction = useTranslations('admin.auditAction');
  const format = useFormat();

  return (
    <section aria-labelledby="admin-activity">
      <SectionHeading id="admin-activity">{t('sectionActivity')}</SectionHeading>

      {rows.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">{t('activityEmpty')}</Card>
      ) : (
        <Card className="overflow-hidden">
          <div
            role="group"
            aria-label={t('activityScrollLabel')}
            tabIndex={0}
            className="max-h-72 overflow-y-auto"
          >
            <ul className="divide-y divide-border">
              {rows.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-wrap items-baseline justify-between gap-3 px-5 py-3"
                >
                  <span className="text-sm text-foreground">
                    {/* An unknown action falls back to its own code rather than to
                        an empty string — a blank row would hide the event. */}
                    {tAction.has(row.action) ? tAction(row.action) : row.action}
                    {row.outcome === 'FAILURE' ? (
                      <span className="ms-2 text-xs text-destructive">{t('outcomeFailure')}</span>
                    ) : null}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {row.actorName ?? t('actorSystem')} · {format.dateTime(new Date(row.occurredAt))}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      )}
    </section>
  );
}

function SectionHeading({ id, children }: { id: string; children: string }) {
  return (
    <h2 id={id} className="mb-3 text-lg font-semibold text-foreground">
      {children}
    </h2>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-foreground">{value}</p>
    </Card>
  );
}

function Detail({ label, value, ltr }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-all text-foreground" dir={ltr ? 'ltr' : undefined}>
        {value}
      </dd>
    </div>
  );
}

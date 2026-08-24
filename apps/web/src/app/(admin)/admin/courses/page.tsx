'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import type {
  AdminCourseRow,
  AdminEntityRow,
  CoursePublication,
  CourseStatus,
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
import { useApiQuery } from '@/lib/use-api';

/**
 * §4C.5 — course oversight.
 *
 * **The screen exists to answer one question**: why can nobody see this course?
 * The answer is always the publication decision and the two LMS facts
 * disagreeing, so all three are on the row rather than only the conclusion —
 * a course that is `PUBLISHED` but `RETIRED` is one the LMS stopped returning,
 * and no amount of looking at the status alone would say so.
 *
 * **Unowned courses get their own filter and a standing count.** Roughly forty
 * seeded courses have no supplier (D-063); they are invisible from every entity
 * portal by construction, so if the administrator does not see them here, nobody
 * ever does.
 */
export default function AdminCoursesPage() {
  const t = useTranslations('admin');
  const format = useFormat();

  const [q, setQ] = useState('');
  const [status, setStatus] = useState<CourseStatus | ''>('');
  const [unowned, setUnowned] = useState(false);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<AdminCourseRow | null>(null);

  const courses = useApiQuery(
    () =>
      adminApi.listCourses({
        q: q || undefined,
        status: status || undefined,
        unowned: unowned || undefined,
        page,
      }),
    [q, status, unowned, page],
  );

  return (
    <AdminPage title={t('coursesTitle')}>
      <div className="space-y-4">
        {courses.data && courses.data.unownedTotal > 0 ? (
          <Card className="p-4 text-sm text-muted-foreground">
            {t('coursesUnownedNotice', { count: format.number(courses.data.unownedTotal) })}
          </Card>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-3">
          <Field id="course-search" label={t('searchLabel')}>
            {(field) => (
              <Input
                {...field}
                type="search"
                value={q}
                placeholder={t('coursesSearchPlaceholder')}
                onChange={(event) => {
                  setQ(event.target.value);
                  setPage(1);
                }}
              />
            )}
          </Field>

          <Field id="course-status" label={t('columnStatus')}>
            {(field) => (
              <select
                {...field}
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value as CourseStatus | '');
                  setPage(1);
                }}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">{t('filterAny')}</option>
                <option value="DRAFT">{t('courseStatus.DRAFT')}</option>
                <option value="AVAILABLE">{t('courseStatus.AVAILABLE')}</option>
                <option value="HIDDEN_BUT_COMPLETABLE">
                  {t('courseStatus.HIDDEN_BUT_COMPLETABLE')}
                </option>
                <option value="RETIRED">{t('courseStatus.RETIRED')}</option>
              </select>
            )}
          </Field>

          <Field id="course-unowned" label={t('coursesOwnership')}>
            {(field) => (
              <select
                {...field}
                value={unowned ? 'unowned' : ''}
                onChange={(event) => {
                  setUnowned(event.target.value === 'unowned');
                  setPage(1);
                }}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">{t('filterAny')}</option>
                <option value="unowned">{t('coursesUnownedOnly')}</option>
              </select>
            )}
          </Field>
        </div>

        <DataView
          isLoading={courses.isInitialLoad}
          error={courses.error}
          onRetry={courses.refetch}
          isEmpty={courses.data?.rows.length === 0}
          emptyProps={{ title: t('coursesEmpty'), body: t('coursesEmptyHint') }}
        >
          {courses.data ? (
            <>
              <CourseTable rows={courses.data.rows} onManage={setSelected} />

              {courses.data.total > courses.data.pageSize ? (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-muted-foreground">
                    {t('resultCountCourses', { count: format.number(courses.data.total) })}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage(page - 1)}
                    >
                      {t('previousPage')}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page * courses.data.pageSize >= courses.data.total}
                      onClick={() => setPage(page + 1)}
                    >
                      {t('nextPage')}
                    </Button>
                  </div>
                </div>
              ) : null}
            </>
          ) : null}
        </DataView>
      </div>

      {selected ? (
        <InterveneDialog
          course={selected}
          onClose={() => setSelected(null)}
          onDone={() => {
            setSelected(null);
            courses.refetch();
          }}
        />
      ) : null}
    </AdminPage>
  );
}

function CourseTable({
  rows,
  onManage,
}: {
  rows: AdminCourseRow[];
  onManage: (course: AdminCourseRow) => void;
}) {
  const t = useTranslations('admin');
  const format = useFormat();

  return (
    /* Scrolls inside its own container: seven columns do not fit a narrow
       viewport, and a horizontally scrolling page breaks every other screen. */
    <Card className="overflow-x-auto">
      <table className="w-full min-w-[52rem] text-sm">
        <caption className="sr-only">{t('coursesTitle')}</caption>
        <thead className="border-b border-border text-muted-foreground">
          <tr>
            <Th>{t('columnCourse')}</Th>
            <Th>{t('columnEntity')}</Th>
            <Th>{t('columnPublication')}</Th>
            <Th>{t('columnStatus')}</Th>
            <Th>{t('columnHeld')}</Th>
            <Th>{t('columnPublishedAt')}</Th>
            <Th>
              <span className="sr-only">{t('columnActions')}</span>
            </Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="px-4 py-3 font-medium text-foreground">
                {row.title}
                {row.paths.length > 0 ? (
                  <span className="block text-xs font-normal text-muted-foreground">
                    {row.paths.map((path) => path.name).join(' · ')}
                  </span>
                ) : null}
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {row.ownerEntityName ?? t('pathCourseUnowned')}
              </td>
              <td className="px-4 py-3">{t(`coursePublication.${row.publication}`)}</td>
              <td className="px-4 py-3">
                <Badge variant={row.status === 'AVAILABLE' ? 'soft' : 'dark'}>
                  {t(`courseStatus.${row.status}`)}
                </Badge>
                {/* The LMS half of the derivation, shown only when it is the
                    reason — a course that is published and still invisible. */}
                {!row.lmsPresent ? (
                  <span className="block text-xs text-muted-foreground">{t('lmsAbsent')}</span>
                ) : !row.lmsVisible ? (
                  <span className="block text-xs text-muted-foreground">{t('lmsHidden')}</span>
                ) : null}
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {format.number(row.heldByLearners)}
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {row.publishedAt ? format.date(new Date(row.publishedAt)) : '—'}
              </td>
              <td className="px-4 py-3 text-end">
                <Button variant="outline" size="sm" onClick={() => onManage(row)}>
                  {t('manage')}
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function InterveneDialog({
  course,
  onClose,
  onDone,
}: {
  course: AdminCourseRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useTranslations('admin');
  const format = useFormat();
  const translateError = useErrorMessage();

  const [owner, setOwner] = useState(course.ownerEntityId ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const entities = useApiQuery(() => adminApi.listEntities(), []);

  async function run(patch: { publication?: CoursePublication; ownerEntityId?: string | null }) {
    setError(null);
    setBusy(true);

    try {
      await adminApi.interveneCourse(course.id, patch);
      onDone();
    } catch (caught) {
      setError(translateError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminDialog title={course.title} onClose={onClose}>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <Detail
          label={t('columnPublication')}
          value={t(`coursePublication.${course.publication}`)}
        />
        <Detail label={t('columnStatus')} value={t(`courseStatus.${course.status}`)} />
        <Detail
          label={t('lmsState')}
          value={
            !course.lmsPresent ? t('lmsAbsent') : course.lmsVisible ? t('lmsShown') : t('lmsHidden')
          }
        />
        <Detail label={t('columnHeld')} value={format.number(course.heldByLearners)} />
      </dl>

      {/*
        The rule, stated before the action rather than discovered after it.
        Hiding a course a learner holds cannot remove it from them — the status
        is derived, and no combination of inputs produces that (§2/D-015).
      */}
      {course.heldByLearners > 0 ? (
        <p className="text-sm text-muted-foreground">{t('coursesHeldNotice')}</p>
      ) : null}

      <Field id="course-owner" label={t('columnEntity')} hint={t('coursesOwnerHint')}>
        {(field) => (
          <select
            {...field}
            value={owner}
            onChange={(event) => setOwner(event.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">{t('pathCourseUnowned')}</option>
            {(entities.data ?? []).map((entity: AdminEntityRow) => (
              <option key={entity.id} value={entity.id}>
                {entity.name}
              </option>
            ))}
          </select>
        )}
      </Field>

      <div className="flex flex-wrap gap-2">
        {owner !== (course.ownerEntityId ?? '') ? (
          <Button disabled={busy} onClick={() => run({ ownerEntityId: owner || null })}>
            {t('coursesSaveOwner')}
          </Button>
        ) : null}

        {/* Context-dependent, never both (§3). */}
        {course.publication === 'PUBLISHED' ? (
          <Button
            variant="destructive"
            disabled={busy}
            onClick={() => run({ publication: 'UNPUBLISHED' })}
          >
            {t('coursesHide')}
          </Button>
        ) : (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => run({ publication: 'PUBLISHED' })}
          >
            {t('coursesRestore')}
          </Button>
        )}
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </AdminDialog>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium text-foreground">{value}</dd>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th scope="col" className="px-4 py-3 text-start font-medium">
      {children}
    </th>
  );
}

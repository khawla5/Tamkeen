'use client';

import { BookOpen, Building2, CircleOff, EyeOff, Route } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import {
  courseVisibility,
  type AdminCourseRow,
  type AdminEntityRow,
  type CourseVisibility,
} from '@tamkeen/types';

import { AdminDialog } from '@/components/admin/admin-dialog';
import { NeedsAction } from '@/components/admin/needs-action';
import { useErrorMessage } from '@/components/auth/use-error-message';
import { AdminPage } from '@/components/layout/admin-page';
import { DataView } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, cardVariants } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useFormat } from '@/i18n/format-provider';
import { adminApi } from '@/lib/api-client';
import { useApiQuery } from '@/lib/use-api';
import { cn } from '@/lib/utils';

/**
 * §4C.5 — course oversight.
 *
 * **The screen answers one question: can an employee choose this course, or
 * not.** That is why the status column carries two words rather than four
 * (`courseVisibility`, TAM-134) — an administrator is not being asked to hold
 * the difference between a draft, a withdrawal and a retirement in their head.
 * The four-state derivation is still underneath and still decides; what changed
 * is the vocabulary the page speaks.
 *
 * **The reason sits under the badge, and that is not a decoration.** "Hidden" is
 * the answer; whether the cause is the publication decision, an availability
 * period that has ended, or the LMS having dropped the course is the next thing
 * the administrator needs, and the row prints exactly the one that applies.
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
  const [visibility, setVisibility] = useState<CourseVisibility | ''>('');
  const [unowned, setUnowned] = useState(false);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<AdminCourseRow | null>(null);

  const courses = useApiQuery(
    () =>
      adminApi.listCourses({
        q: q || undefined,
        visibility: visibility || undefined,
        unowned: unowned || undefined,
        page,
      }),
    [q, visibility, unowned, page],
  );

  /* The same box the dashboard opens with — what is waiting on the administrator —
     so it is in front of them here too, where courses are placed. Drawn only when
     there is something to do, and silent if the figures cannot be had: it is a
     reminder, not what this page is for. */
  const dashboard = useApiQuery(() => adminApi.dashboard(), []);

  return (
    <AdminPage title={t('coursesTitle')}>
      <div className="space-y-4">
        {dashboard.data ? <NeedsAction data={dashboard.data} /> : null}

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
              <Select
                {...field}
                value={visibility}
                onChange={(event) => {
                  setVisibility(event.target.value as CourseVisibility | '');
                  setPage(1);
                }}
              >
                <option value="">{t('filterAny')}</option>
                <option value="AVAILABLE">{t('courseVisibility.AVAILABLE')}</option>
                <option value="HIDDEN">{t('courseVisibility.HIDDEN')}</option>
              </Select>
            )}
          </Field>

          <Field id="course-unowned" label={t('coursesOwnership')}>
            {(field) => (
              <Select
                {...field}
                value={unowned ? 'unowned' : ''}
                onChange={(event) => {
                  setUnowned(event.target.value === 'unowned');
                  setPage(1);
                }}
              >
                <option value="">{t('filterAny')}</option>
                <option value="unowned">{t('coursesUnownedOnly')}</option>
              </Select>
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
        <ManageCourseDialog
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

/**
 * Why a hidden course is hidden — the one cause that applies, or nothing.
 *
 * Ordered by how much it matters: a course the LMS no longer has cannot be
 * restored from this screen at all, an ended period is a date to retype, a
 * withdrawal is a button away, and a draft is waiting on its supplier. Printing
 * all of them would turn the row back into the derivation table the two-word
 * status exists to spare the reader.
 */
function hiddenReasonKey(row: AdminCourseRow): string | null {
  if (courseVisibility(row.status) === 'AVAILABLE') {
    return null;
  }

  if (!row.lmsPresent) return 'lmsAbsent';
  if (row.publication === 'DRAFT') return 'reasonDraft';
  if (row.publication === 'UNPUBLISHED') return 'reasonWithdrawn';
  if (row.availableUntil !== null || row.availableFrom !== null) return 'reasonOutsideWindow';
  if (!row.lmsVisible) return 'lmsHidden';

  return null;
}

/** One supplier's courses, split by whether they sit in a path. */
interface SupplierBlock {
  key: string;
  name: string | null;
  inPath: AdminCourseRow[];
  inNone: AdminCourseRow[];
}

/**
 * The rows grouped by supplier, in the order the API returned them (it sorts by
 * supplier, so a supplier's courses arrive together and the unowned last).
 */
function blocksOf(rows: AdminCourseRow[]): SupplierBlock[] {
  const blocks: SupplierBlock[] = [];

  for (const row of rows) {
    const key = row.ownerEntityId ?? 'none';
    let block = blocks.find((candidate) => candidate.key === key);

    if (!block) {
      block = { key, name: row.ownerEntityName, inPath: [], inNone: [] };
      blocks.push(block);
    }

    (row.paths.length > 0 ? block.inPath : block.inNone).push(row);
  }

  return blocks;
}

/**
 * Every course as a card, in the shape the assessment page uses: a tinted icon,
 * the name set large, and a band underneath. A green band names each supplier, and
 * under it a quieter label says whether the courses below are already in a path or
 * in none — the second being the administrator's work queue: a course in no path
 * reaches no employee at all. The filters and the paging are unchanged.
 */
function CourseTable({
  rows,
  onManage,
}: {
  rows: AdminCourseRow[];
  onManage: (course: AdminCourseRow) => void;
}) {
  const t = useTranslations('admin');
  const format = useFormat();

  const blocks = blocksOf(rows);

  return (
    <div className="space-y-6">
      {blocks.map((block) => (
        <section
          key={block.key}
          aria-label={block.name ?? t('pathCourseUnowned')}
          className="space-y-3"
        >
          {/* The supplier: green, white text (#067647 is 5.9:1 with white), its
              icon and how many of its courses are on this page. */}
          <h2 className="flex items-center gap-2 rounded-lg bg-success px-4 py-1 text-sm font-semibold leading-6 text-white">
            <Building2 aria-hidden="true" className="size-4 shrink-0" />
            {block.name ?? t('pathCourseUnowned')}
            <span className="rounded-full bg-white/20 px-2 text-xs font-medium">
              {format.number(block.inPath.length + block.inNone.length)}
            </span>
          </h2>

          <CourseGroup
            icon={Route}
            label={t('courseGroupInPath')}
            rows={block.inPath}
            onManage={onManage}
          />
          <CourseGroup
            icon={CircleOff}
            label={t('courseGroupInNone')}
            rows={block.inNone}
            tone="warning"
            onManage={onManage}
          />
        </section>
      ))}
    </div>
  );
}

/** A label and its cards; nothing at all when there are no rows. */
function CourseGroup({
  icon: Icon,
  label,
  rows,
  tone = 'default',
  onManage,
}: {
  icon: typeof Route;
  label: string;
  rows: AdminCourseRow[];
  tone?: 'default' | 'warning';
  onManage: (course: AdminCourseRow) => void;
}) {
  const format = useFormat();

  if (rows.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      <p
        className={cn(
          'flex items-center gap-2 rounded-md px-3 py-1 text-xs font-semibold',
          tone === 'warning' ? 'bg-warning-50 text-warning' : 'bg-primary-50 text-primary-800',
        )}
      >
        <Icon aria-hidden="true" className="size-3.5 shrink-0" />
        {label}
        <span>({format.number(rows.length)})</span>
      </p>

      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((row) => (
          <li key={row.id}>
            <CourseCard row={row} onManage={onManage} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function CourseCard({
  row,
  onManage,
}: {
  row: AdminCourseRow;
  onManage: (course: AdminCourseRow) => void;
}) {
  const t = useTranslations('admin');
  const format = useFormat();

  const visibility = courseVisibility(row.status);
  const reason = hiddenReasonKey(row);
  const reachable = visibility === 'AVAILABLE';
  const Icon = reachable ? BookOpen : EyeOff;

  return (
    <div className={cn(cardVariants(), 'flex h-full flex-col overflow-hidden')}>
      <div className="flex items-start gap-3 p-5">
        <span
          aria-hidden="true"
          className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-lg',
            reachable ? 'bg-primary-50 text-primary-700' : 'bg-neutral-100 text-neutral-500',
          )}
        >
          <Icon className="size-5" />
        </span>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <p className="text-lg font-semibold leading-snug text-foreground">{row.title}</p>
          {row.paths.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              {row.paths.map((path) => path.name).join(' · ')}
            </p>
          ) : null}
          <div>
            <Badge variant={reachable ? 'soft' : 'dark'}>
              {t(`courseVisibility.${visibility}`)}
            </Badge>
            {reason ? (
              <span className="mt-1 block text-xs text-muted-foreground">{t(reason)}</span>
            ) : null}
          </div>
        </div>
      </div>

      <dl className="space-y-1 px-5 pb-4 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">{t('columnAvailability')}</dt>
          <dd className="text-end text-foreground">
            <AvailabilityCell course={row} />
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">{t('columnHeld')}</dt>
          <dd className="text-foreground">{format.number(row.heldByLearners)}</dd>
        </div>
      </dl>

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-border bg-neutral-50 px-5 py-3">
        <span className="min-w-0 text-sm">
          <span className="text-muted-foreground">{t('columnEntity')}: </span>
          <span className="font-medium text-foreground">
            {row.ownerEntityName ?? t('pathCourseUnowned')}
          </span>
        </span>
        <Button variant="outline" size="sm" onClick={() => onManage(row)}>
          {t('manage')}
        </Button>
      </div>
    </div>
  );
}

/** The period in words, or the dash that says there is no period. */
function AvailabilityCell({ course }: { course: AdminCourseRow }) {
  const t = useTranslations('admin');
  const format = useFormat();

  const from = course.availableFrom;
  const until = course.availableUntil;

  if (from === null && until === null) {
    return <span>{t('availabilityNone')}</span>;
  }

  const day = (value: string) => format.date(new Date(`${value}T12:00:00Z`));

  if (from !== null && until !== null) {
    return <span>{t('availabilityBetween', { from: day(from), until: day(until) })}</span>;
  }

  return (
    <span>
      {from !== null ? t('availabilityFrom', { from: day(from) }) : null}
      {until !== null ? t('availabilityUntil', { until: day(until) }) : null}
    </span>
  );
}

/**
 * The manage panel: three sections, in the order the decisions get harder.
 *
 * The facts first, then the reversible settings (who supplies it, when it is
 * available, whether it is in the catalogue), then deletion — kept apart, styled
 * differently, and simply absent with the reason in its place for a course
 * nobody may delete. The same shape §4C.4's path panel takes, for the same
 * reason: an administrator reaching for delete when they meant hide is the
 * mistake the separation exists to catch (D-098).
 */
function ManageCourseDialog({
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
  const [from, setFrom] = useState(course.availableFrom ?? '');
  const [until, setUntil] = useState(course.availableUntil ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const entities = useApiQuery(() => adminApi.listEntities(), []);

  const visibility = courseVisibility(course.status);
  const reason = hiddenReasonKey(course);
  const windowChanged =
    from !== (course.availableFrom ?? '') || until !== (course.availableUntil ?? '');

  async function run(patch: Parameters<typeof adminApi.interveneCourse>[1]) {
    setError(null);
    setBusy(true);

    try {
      await adminApi.interveneCourse(course.id, patch);
      onDone();
    } catch (caught) {
      setError(translateError(caught));
      setBusy(false);
    }
  }

  if (confirmingDelete) {
    return (
      <ConfirmDeleteDialog
        course={course}
        onClose={() => setConfirmingDelete(false)}
        onDeleted={onDone}
      />
    );
  }

  return (
    <AdminDialog title={course.title} onClose={onClose}>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <Detail label={t('columnStatus')} value={t(`courseVisibility.${visibility}`)} />
        {reason ? <Detail label={t('coursesHiddenReason')} value={t(reason)} /> : null}
        <Detail
          label={t('columnEntity')}
          value={course.ownerEntityName ?? t('pathCourseUnowned')}
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

      <section className="space-y-3 rounded-md border border-border p-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{t('coursesWindowHeading')}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{t('coursesWindowHint')}</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="course-available-from" label={t('coursesAvailableFrom')}>
            {(field) => (
              <Input
                {...field}
                type="date"
                dir="ltr"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
              />
            )}
          </Field>

          <Field id="course-available-until" label={t('coursesAvailableUntil')}>
            {(field) => (
              <Input
                {...field}
                type="date"
                dir="ltr"
                value={until}
                onChange={(event) => setUntil(event.target.value)}
              />
            )}
          </Field>
        </div>

        {/* Save appears only when there is something to save (§3). Empty means
            "no bound", which is why it is sent as null rather than skipped. */}
        {windowChanged ? (
          <Button
            disabled={busy}
            onClick={() => void run({ availableFrom: from || null, availableUntil: until || null })}
          >
            {t('coursesSaveWindow')}
          </Button>
        ) : null}
      </section>

      <section className="space-y-3 rounded-md border border-border p-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{t('coursesOwnerHeading')}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{t('coursesOwnerHint')}</p>
        </div>

        <Field id="course-owner" label={t('columnEntity')}>
          {(field) => (
            <Select {...field} value={owner} onChange={(event) => setOwner(event.target.value)}>
              <option value="">{t('pathCourseUnowned')}</option>
              {(entities.data ?? []).map((entity: AdminEntityRow) => (
                <option key={entity.id} value={entity.id}>
                  {entity.name}
                </option>
              ))}
            </Select>
          )}
        </Field>

        {owner !== (course.ownerEntityId ?? '') ? (
          <Button disabled={busy} onClick={() => void run({ ownerEntityId: owner || null })}>
            {t('coursesSaveOwner')}
          </Button>
        ) : null}
      </section>

      <section className="flex flex-wrap items-center gap-3 rounded-md border border-border p-4">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-foreground">{t('coursesHideHeading')}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {course.publication === 'PUBLISHED' ? t('coursesHideHint') : t('coursesRestoreHint')}
          </p>
        </div>

        {/* Context-dependent, never both (§3). */}
        {course.publication === 'PUBLISHED' ? (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void run({ publication: 'UNPUBLISHED' })}
          >
            {t('coursesHide')}
          </Button>
        ) : (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void run({ publication: 'PUBLISHED' })}
          >
            {t('coursesRestore')}
          </Button>
        )}
      </section>

      {/*
        Deletion, kept apart from hiding and never dressed the same way. Hiding
        is the reversible decision above and keeps the outline button; this one
        is destructive, sits last, and is simply absent — with the reason in its
        place — for any course somebody has taken. The server refuses that case
        regardless; saying so here means the administrator learns the rule
        without being refused by it.
      */}
      <section className="flex flex-wrap items-center gap-3 rounded-md border border-border p-4">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-foreground">{t('coursesRemoveHeading')}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {course.canDelete ? t('coursesRemoveHint') : t('coursesRemoveBlocked')}
          </p>
        </div>

        {course.canDelete ? (
          <Button variant="destructive" disabled={busy} onClick={() => setConfirmingDelete(true)}>
            {t('coursesRemove')}
          </Button>
        ) : null}
      </section>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </AdminDialog>
  );
}

/**
 * The last chance to not do it.
 *
 * Names the course in the question, because "are you sure" beside a list of
 * fifty is a question about nothing in particular — and says in the same breath
 * that the course goes from the learning platform too, since that is the part an
 * administrator cannot undo from any screen.
 */
function ConfirmDeleteDialog({
  course,
  onClose,
  onDeleted,
}: {
  course: AdminCourseRow;
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
      await adminApi.deleteCourse(course.id);
      onDeleted();
    } catch (caught) {
      /* Shown here rather than swallowed: the likeliest failures are a learner
         having chosen the course since the screen loaded, and the LMS refusing —
         and the server's refusal names which. */
      setError(translateError(caught));
      setBusy(false);
    }
  }

  return (
    <AdminDialog
      title={t('coursesRemoveConfirmTitle')}
      description={t('coursesRemoveConfirmBody', { name: course.title })}
      onClose={onClose}
      footer={
        <Button type="button" variant="destructive" disabled={busy} onClick={() => void submit()}>
          {t('coursesRemoveConfirm')}
        </Button>
      }
    >
      <p className="text-sm text-muted-foreground">{t('coursesRemoveConfirmHint')}</p>

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

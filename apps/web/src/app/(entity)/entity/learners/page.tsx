'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import type { EntityLearnerRow } from '@tamkeen/types';

import { EntityPage } from '@/components/layout/entity-page';
import { DataView } from '@/components/states';
import { Field } from '@/components/ui/field';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useFormat } from '@/i18n/format-provider';
import { entityApi } from '@/lib/api-client';
import { useApiQuery } from '@/lib/use-api';

/**
 * §4B.5 — Learners / Review.
 *
 * **What this page does not show is the specification** (D-064): no email, no
 * employee ID, no Holland Code, no path, no certificates. Review needs to
 * identify a colleague and see how they did on this entity's course, and nothing
 * more — email and employee ID are the two identifiers that would make an export
 * directly actionable elsewhere in the ministry, and neither helps a reviewer.
 *
 * The server enforces this; the page simply has nothing else to render.
 */
export default function EntityLearnersPage() {
  const t = useTranslations('entity');
  const [courseId, setCourseId] = useState('');

  const courses = useApiQuery(() => entityApi.listCourses(), []);
  const learners = useApiQuery(() => entityApi.learners(courseId || undefined), [courseId]);

  return (
    <EntityPage title={t('learnersTitle')}>
      <div className="space-y-6">
        <div className="max-w-sm">
          <Field id="learner-course" label={t('filterByCourse')}>
            {(field) => (
              <select
                {...field}
                value={courseId}
                onChange={(event) => setCourseId(event.target.value)}
                className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground"
              >
                <option value="">{t('allCourses')}</option>
                {courses.data?.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.title}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>

        <DataView
          isLoading={learners.isLoading}
          error={learners.error}
          isEmpty={learners.data?.length === 0}
          onRetry={learners.refetch}
          emptyProps={{ title: t('learnersEmptyTitle'), body: t('learnersEmptyBody') }}
        >
          <LearnerTable rows={learners.data ?? []} />
        </DataView>
      </div>
    </EntityPage>
  );
}

function LearnerTable({ rows }: { rows: readonly EntityLearnerRow[] }) {
  const t = useTranslations('entity');
  const format = useFormat();

  return (
    /* Scrolls inside its own container so the page body never scrolls
       horizontally on a narrow viewport. */
    <Table caption={t('learnersTitle')} minWidthClassName="min-w-[42rem]">
      <TableHeader>
        <TableRow>
          <TableHead>{t('learnerName')}</TableHead>
          <TableHead>{t('learnerDepartment')}</TableHead>
          <TableHead>{t('learnerCourse')}</TableHead>
          <TableHead>{t('learnerStatus')}</TableHead>
          <TableHead>{t('learnerGrade')}</TableHead>
          <TableHead>{t('learnerResult')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={`${row.userId}:${row.courseId}`}>
            <TableCell>{row.fullName}</TableCell>
            <TableCell>{row.department}</TableCell>
            <TableCell>{row.courseTitle}</TableCell>
            <TableCell>{t(`status${row.status}`)}</TableCell>
            {/* Null, not zero: nothing attempted is not a failed attempt. */}
            <TableCell>
              {row.gradePercent === null ? t('learnerNoGrade') : format.percent(row.gradePercent)}
            </TableCell>
            <TableCell>{row.passed ? t('learnerPassed') : t('learnerNotPassed')}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAppRouter } from '@/lib/use-app-router';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import {
  directionForCourseLanguage,
  type CoursePublication,
  type EntityCourseSummary,
} from '@tamkeen/types';

import { EntityPage } from '@/components/layout/entity-page';
import { DataView } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useFormat } from '@/i18n/format-provider';
import { entityApi } from '@/lib/api-client';
import { useApiQuery } from '@/lib/use-api';
import { useErrorMessage } from '@/components/auth/use-error-message';

/**
 * §4B.2 — this entity's courses, plus the create form.
 *
 * The form lives here rather than on a page of its own because creating a course
 * is a three-field step, not a destination: §4B's nav has four items and adding a
 * fifth for a form that is used once per course would be exactly the redundant
 * navigation §3 rules out. It opens from the single primary action.
 */
export default function EntityCoursesPage() {
  const t = useTranslations('entity');
  const searchParams = useSearchParams();

  /* `?new=1` lets the dashboard's primary action land straight on the open form
     rather than on a list the entity then has to act on again. */
  const [creating, setCreating] = useState(searchParams.get('new') === '1');
  const [query, setQuery] = useState('');
  const [publication, setPublication] = useState<CoursePublication | ''>('');

  const courses = useApiQuery(
    () => entityApi.listCourses({ q: query || undefined, publication: publication || undefined }),
    [query, publication],
  );

  return (
    <EntityPage
      title={t('coursesTitle')}
      action={
        creating ? undefined : <Button onClick={() => setCreating(true)}>{t('addCourse')}</Button>
      }
    >
      <div className="space-y-6">
        {creating ? (
          <CreateCourseForm onCancel={() => setCreating(false)} onCreated={courses.refetch} />
        ) : null}

        <div className="flex flex-wrap gap-3">
          <div className="min-w-56 flex-1">
            <Field id="course-search" label={t('searchLabel')}>
              {(field) => (
                <Input
                  {...field}
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              )}
            </Field>
          </div>

          <div className="min-w-44">
            <Field id="course-publication" label={t('filterAll')}>
              {(field) => (
                <select
                  {...field}
                  value={publication}
                  onChange={(event) => setPublication(event.target.value as CoursePublication | '')}
                  className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground"
                >
                  <option value="">{t('filterAll')}</option>
                  <option value="DRAFT">{t('publicationDRAFT')}</option>
                  <option value="PUBLISHED">{t('publicationPUBLISHED')}</option>
                  <option value="UNPUBLISHED">{t('publicationUNPUBLISHED')}</option>
                </select>
              )}
            </Field>
          </div>
        </div>

        <DataView
          isLoading={courses.isLoading}
          error={courses.error}
          isEmpty={courses.data?.length === 0}
          onRetry={courses.refetch}
          emptyProps={{ title: t('coursesEmptyTitle'), body: t('coursesEmptyBody') }}
        >
          <ul className="space-y-3">
            {courses.data?.map((course) => (
              <li key={course.id}>
                <CourseRow course={course} />
              </li>
            ))}
          </ul>
        </DataView>
      </div>
    </EntityPage>
  );
}

function CourseRow({ course }: { course: EntityCourseSummary }) {
  const t = useTranslations('entity');
  const format = useFormat();

  return (
    <Card className="flex flex-wrap items-start justify-between gap-4 p-5">
      <div className="min-w-0">
        {/*
          The course's own language, not the app's (D-047). Without `dir` an
          English title inside this RTL container has its punctuation and any
          trailing digits rearranged — so this is correctness, not polish.
        */}
        <p
          dir={directionForCourseLanguage(course.language)}
          lang={course.language === 'EN' ? 'en' : 'ar'}
          className="font-medium text-foreground"
        >
          {course.title}
        </p>

        <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span>{t(`publication${course.publication}`)}</span>
          <span>{t(`status${course.status}`)}</span>
          <span>
            {format.number(course.enrolledCount)} {t('enrolled')}
          </span>
          {course.completionRate !== null ? (
            <span>
              {t('completionRate')} {format.percent(course.completionRate)}
            </span>
          ) : null}
        </p>
      </div>

      <Button asChild variant="outline">
        <Link href={`/entity/courses/${course.id}`}>{t('manageTitle')}</Link>
      </Button>
    </Card>
  );
}

/**
 * The create form (§4B.3).
 *
 * Three fields only. Path membership, duration, objectives and prerequisites are
 * set on the manage screen afterwards — asking for all of it up front would make
 * an entity fill a long form before they have even seen the course in Moodle,
 * and most of those answers are ones they form while authoring.
 */
function CreateCourseForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: () => void;
}) {
  const t = useTranslations('entity');
  const tActions = useTranslations('actions');
  const router = useAppRouter();
  const translateError = useErrorMessage();

  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [language, setLanguage] = useState<'AR' | 'EN'>('AR');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const course = await entityApi.createCourse({ title, summary, language });
      onCreated();
      /* Straight to the manage screen: the course exists but is a draft with
         nothing set, and the next thing to do is always there. */
      router.push(`/entity/courses/${course.id}`);
    } catch (caught) {
      setError(translateError(caught));
      setSubmitting(false);
    }
  }

  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold text-foreground">{t('createTitle')}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t('createHint')}</p>

      <form onSubmit={onSubmit} className="mt-4 space-y-4">
        <Field id="new-course-title" label={t('fieldTitle')} required>
          {(field) => (
            <Input
              {...field}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              minLength={3}
              maxLength={200}
            />
          )}
        </Field>

        <Field id="new-course-summary" label={t('fieldSummary')} required>
          {(field) => (
            <Textarea
              {...field}
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
              maxLength={2000}
              rows={3}
            />
          )}
        </Field>

        <Field id="new-course-language" label={t('fieldLanguage')}>
          {(field) => (
            <select
              {...field}
              value={language}
              onChange={(event) => setLanguage(event.target.value as 'AR' | 'EN')}
              className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground"
            >
              <option value="AR">{t('languageAr')}</option>
              <option value="EN">{t('languageEn')}</option>
            </select>
          )}
        </Field>

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <div className="flex gap-3">
          <Button type="submit" disabled={submitting}>
            {submitting ? t('creating') : t('create')}
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>
            {tActions('cancel')}
          </Button>
        </div>
      </form>
    </Card>
  );
}

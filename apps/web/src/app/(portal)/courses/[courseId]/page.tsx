'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

import type { CourseDetail } from '@tamkeen/types';

import { useErrorMessage } from '@/components/auth/use-error-message';
import { PortalPage } from '@/components/layout/portal-page';
import { DataView } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useFormat } from '@/i18n/format-provider';
import { coursesApi, myPathApi } from '@/lib/api-client';
import { toHours } from '@/lib/duration';
import { useApiMutation, useApiQuery } from '@/lib/use-api';

/**
 * Course detail (§4.7).
 *
 * The single primary action is whatever the server said it is. The client does
 * not decide between "add", "start" and "completed" — that logic lives in
 * `resolveCourseAction` on the API, which returns exactly one value, so §3's
 * "never all three" cannot be broken by a rendering mistake here.
 */
export default function CourseDetailPage() {
  const t = useTranslations('courseDetail');
  const params = useParams<{ courseId: string }>();
  const courseId = params.courseId;

  const course = useApiQuery(() => coursesApi.detail(courseId), [courseId]);

  return (
    <PortalPage title={course.data?.title ?? t('title')}>
      <DataView isLoading={course.isLoading} error={course.error} onRetry={course.refetch}>
        {course.data ? <Detail course={course.data} onReload={course.refetch} /> : null}
      </DataView>
    </PortalPage>
  );
}

function Detail({ course, onReload }: { course: CourseDetail; onReload: () => void }) {
  const t = useTranslations('courseDetail');
  const translateError = useErrorMessage();
  const format = useFormat();

  const add = useApiMutation(() => myPathApi.addCourse(course.id));
  const hours = toHours(course.durationMinutes);

  async function onAdd() {
    const result = await add.run();

    /* `addCourse` resolves to undefined on both success (204) and failure, so
       the reload is what confirms the outcome — and it is what updates the
       action to IN_PATH either way. */
    if (result !== undefined || !add.error) {
      onReload();
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      {/* No card title: the page header already carries the course name as the
          page's single h1, and repeating it is the redundant UI §3 forbids. */}
      <Card>
        <CardContent className="flex flex-col gap-5 pt-6">
          <p className="text-muted-foreground">{course.summary}</p>

          {hours !== null ? (
            <p className="text-sm text-muted-foreground">
              {t('duration', { hours: format.number(hours) })}
            </p>
          ) : null}

          {course.objectives.length > 0 ? (
            <section className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold text-foreground">{t('objectives')}</h2>
              <ul className="flex list-disc flex-col gap-1 ps-5 text-sm">
                {course.objectives.map((objective) => (
                  <li key={objective}>{objective}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* Omitted entirely when there are none — an empty "المتطلبات" heading
              is noise, and §3 forbids showing what is not needed. */}
          {course.prerequisites ? (
            <section className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold text-foreground">{t('prerequisites')}</h2>
              <p className="text-sm">{course.prerequisites}</p>
            </section>
          ) : null}

          {course.paths.length > 0 ? (
            <section className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold text-foreground">{t('paths')}</h2>
              <p className="text-sm text-muted-foreground">
                {course.paths.map((path) => path.name).join('، ')}
              </p>
            </section>
          ) : null}

          <p className="text-sm text-muted-foreground">{t('certificate')}</p>

          {add.error ? (
            <p role="alert" className="text-sm font-medium text-destructive">
              {translateError(add.error)}
            </p>
          ) : null}

          <CourseAction course={course} isPending={add.isPending} onAdd={() => void onAdd()} />
        </CardContent>
      </Card>

      <Button asChild variant="ghost" size="sm" className="self-start">
        <Link href="/courses">{t('backToCourses')}</Link>
      </Button>
    </div>
  );
}

/** Renders the one action the server chose — never a menu of them. */
function CourseAction({
  course,
  isPending,
  onAdd,
}: {
  course: CourseDetail;
  isPending: boolean;
  onAdd: () => void;
}) {
  const t = useTranslations('courseDetail');

  switch (course.action) {
    case 'ADD_TO_PATH':
      return (
        <Button type="button" onClick={onAdd} disabled={isPending} className="self-start">
          {isPending ? t('adding') : t('actionAdd')}
        </Button>
      );

    case 'IN_PATH':
      return (
        <Button asChild variant="outline" className="self-start">
          <Link href={`/paths/${course.buildablePathId}`}>{t('actionInPath')}</Link>
        </Button>
      );

    case 'START_COURSE':
      return (
        <Button asChild className="self-start">
          {/* Through the player, which mints the signed handoff on click. A
              direct LMS link carries no session (D-044). */}
          <Link href={`/courses/${course.id}/player`}>{t('actionStart')}</Link>
        </Button>
      );

    case 'COMPLETED':
      return (
        <p className="self-start rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground">
          {t('actionCompleted')}
        </p>
      );

    case 'UNAVAILABLE':
      return <p className="text-sm text-muted-foreground">{t('actionUnavailable')}</p>;

    case 'NONE':
    default:
      /* Nothing to do here yet — browsing is allowed, acting is not. Rendering
         a disabled button instead would advertise an action that will never
         become available from this page. */
      return null;
  }
}

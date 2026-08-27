'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

import type { CourseDetail } from '@tamkeen/types';

import { useErrorMessage } from '@/components/auth/use-error-message';
import { CourseStatusChip } from '@/components/courses/course-status-chip';
import { PortalPage } from '@/components/layout/portal-page';
import { DataView } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useFormat } from '@/i18n/format-provider';
import { certificatesApi, coursesApi, myPathApi } from '@/lib/api-client';
import { toHours } from '@/lib/duration';
import { useApiMutation, useApiQuery } from '@/lib/use-api';

/**
 * Course detail (§4.7, TAM-128).
 *
 * The single primary action is whatever the server said it is, and it lives in
 * the page header (`PortalPage`'s `action` slot) so it is visible without
 * scrolling — the client does not decide between "add", "start" and
 * "completed", that logic lives in `resolveCourseAction` on the API, which
 * returns exactly one value, so §3's "never all three" cannot be broken by a
 * rendering mistake here. This ticket relocates that action; it does not
 * reinvent it.
 */
export default function CourseDetailPage() {
  const t = useTranslations('courseDetail');
  const params = useParams<{ courseId: string }>();
  const courseId = params.courseId;

  const course = useApiQuery(() => coursesApi.detail(courseId), [courseId]);
  const add = useApiMutation(() => myPathApi.addCourse(courseId));

  async function onAdd() {
    const result = await add.run();

    /* `addCourse` resolves to undefined on both success (204) and failure, so
       the reload is what confirms the outcome — and it is what updates the
       action to IN_PATH either way. */
    if (result !== undefined || !add.error) {
      course.refetch();
    }
  }

  return (
    <PortalPage
      title={course.data?.title ?? t('title')}
      action={
        course.data ? (
          <CourseAction course={course.data} isPending={add.isPending} onAdd={() => void onAdd()} />
        ) : undefined
      }
    >
      <DataView isLoading={course.isLoading} error={course.error} onRetry={course.refetch}>
        {course.data ? <Detail course={course.data} addError={add.error} /> : null}
      </DataView>
    </PortalPage>
  );
}

function Detail({ course, addError }: { course: CourseDetail; addError: unknown }) {
  const t = useTranslations('courseDetail');
  const translateError = useErrorMessage();
  const format = useFormat();

  const hours = toHours(course.durationMinutes);

  const hasMeta = hours !== null || course.paths.length > 0 || course.personalStatus !== null;

  return (
    <div className="flex flex-col gap-6">
      {/* Header block (§4.7): summary, then the meta row — duration as text,
          path membership and personal status as quiet tags. Under the page
          title, not inside the content card, so it reads as page framing
          rather than one more section. */}
      <div className="flex flex-col gap-3">
        <p className="text-muted-foreground">{course.summary}</p>

        {hasMeta ? (
          <div className="flex flex-wrap items-center gap-2">
            {hours !== null ? (
              <span className="text-sm text-muted-foreground">
                {t('duration', { hours: format.number(hours) })}
              </span>
            ) : null}
            {course.paths.map((path) => (
              <Badge key={path.id} variant="neutral">
                {path.name}
              </Badge>
            ))}
            {/* At most one chip, and the same component every catalogue card
                uses (TAM-127) — a course outside the user's path gets none,
                absence is the signal. */}
            <CourseStatusChip status={course.personalStatus} />
          </div>
        ) : null}
      </div>

      {addError ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {translateError(addError)}
        </p>
      ) : null}

      {/* No card title: the page header already carries the course name as the
          page's single h1, and repeating it is the redundant UI §3 forbids. */}
      <Card>
        <CardContent className="flex flex-col gap-5 pt-6">
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

          {/* A quiet footnote, not a section heading — the certificate line
              was never structured content, and giving it one now would be
              the new content §3 forbids. */}
          <p className="text-sm text-muted-foreground">{t('certificate')}</p>
        </CardContent>
      </Card>

      <Button asChild variant="ghost" size="sm" className="self-start">
        <Link href="/courses">{t('backToCourses')}</Link>
      </Button>
    </div>
  );
}

/** Renders the one action the server chose, in the page header — never a
 *  menu of them. */
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
        <Button type="button" onClick={onAdd} disabled={isPending}>
          {isPending ? t('adding') : t('actionAdd')}
        </Button>
      );

    case 'IN_PATH':
      return (
        <Button asChild variant="outline">
          <Link href={`/paths/${course.buildablePathId}`}>{t('actionInPath')}</Link>
        </Button>
      );

    case 'START_COURSE':
      return (
        <Button asChild>
          {/* Through the player, which mints the signed handoff on click. A
              direct LMS link carries no session (D-044). */}
          <Link href={`/courses/${course.id}/player`}>{t('actionStart')}</Link>
        </Button>
      );

    case 'COMPLETED':
      /* A certificate is only guaranteed once the sync job has issued one;
         until then this falls back to the old static pill rather than
         linking to a certificate that does not exist yet. */
      return course.certificateId !== null ? (
        <Button asChild variant="outline">
          <a
            href={certificatesApi.fileUrl(course.certificateId, 'inline')}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t('actionCompletedAriaLabel')}
          >
            {t('actionCompleted')}
          </a>
        </Button>
      ) : (
        <Badge variant="success" className="text-sm">
          {t('actionCompleted')}
        </Badge>
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

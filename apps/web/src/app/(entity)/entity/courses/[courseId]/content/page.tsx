'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback } from 'react';

import { directionForCourseLanguage, type EntityCourseDetail } from '@tamkeen/types';

import { BlockerList } from '@/components/entity/blocker-list';
import { MoodleEmbed } from '@/components/entity/moodle-embed';
import { PublishAction } from '@/components/entity/publish-action';
import { EntityPage } from '@/components/layout/entity-page';
import { DataView } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useFormat } from '@/i18n/format-provider';
import { entityApi } from '@/lib/api-client';
import { useApiQuery } from '@/lib/use-api';

/**
 * §4B.4 — Course Content: the authoring loop on one page (TAM-130, D-098).
 *
 * Moodle's own editor, framed inside the shell with editing on, and beside it
 * the **read-back** of what Moodle holds — activities, the quiz, completion
 * criteria (D-061). The entity adds material, watches the read-back update
 * (the frame says when something changed), and publishes from the page header
 * without ever seeing Moodle's frame around the editor.
 *
 * We still do not rebuild the editor (D-046): everything inside the frame is
 * Moodle's. What this page owns is the seam — the launch, the read-back, the
 * D-042 warning where it can be acted on, and the decision to publish.
 */
export default function CourseContentPage() {
  const t = useTranslations('entity');
  const params = useParams<{ courseId: string }>();
  const courseId = params.courseId;

  /* One request carries the read-back AND the publish gate, so a change in the
     editor refreshes both — the blockers clear on the page the entity is
     looking at. */
  const course = useApiQuery(() => entityApi.getCourse(courseId), [courseId]);
  const refresh = course.refetch;
  const onContentChanged = useCallback(() => {
    refresh();
  }, [refresh]);

  return (
    <EntityPage
      title={t('contentTitle')}
      action={course.data ? <PublishAction course={course.data} onChanged={refresh} /> : undefined}
    >
      {/* First load only: the read-back refetches after every edit, and a
          spinner over the editor each time would be exactly the interruption
          the frame exists to remove. */}
      <DataView
        isLoading={course.isLoading && course.data === undefined}
        error={course.error}
        onRetry={course.refetch}
      >
        {course.data ? (
          <div className="space-y-6">
            <ReadBackStrip course={course.data} onRefresh={refresh} />
            <MoodleEmbed
              courseId={courseId}
              title={course.data.title}
              onContentChanged={onContentChanged}
            />
          </div>
        ) : null}
      </DataView>
    </EntityPage>
  );
}

/**
 * What Moodle holds right now, and why publishing is blocked if it is. Compact
 * on purpose — it sits above the editor, not instead of it.
 */
function ReadBackStrip({
  course,
  onRefresh,
}: {
  course: EntityCourseDetail;
  onRefresh: () => void;
}) {
  const t = useTranslations('entity');
  const format = useFormat();
  const content = course.content;
  const blocked = course.publication !== 'PUBLISHED' && course.publishBlockers.length > 0;

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p
            dir={directionForCourseLanguage(course.language)}
            lang={course.language === 'EN' ? 'en' : 'ar'}
            className="truncate text-base font-semibold text-foreground"
          >
            {course.title}
          </p>
          {course.summary ? (
            /* The description learners will read — shown where the entity
               edits the course, so the two never drift unnoticed (TAM-134). */
            <p
              dir={directionForCourseLanguage(course.language)}
              lang={course.language === 'EN' ? 'en' : 'ar'}
              className="mt-1 text-sm text-muted-foreground"
            >
              {course.summary}
            </p>
          ) : null}
          <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span>{t(`publication${course.publication}`)}</span>
            <span>{t(`status${course.status}`)}</span>
            <Link href="/entity/courses/guide#content" className="text-primary-700 underline">
              {t('guideLink')}
            </Link>
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={onRefresh}>
            {t('contentRefresh')}
          </Button>
          <Button asChild variant="outline">
            <Link href={`/entity/courses/${course.id}`}>{t('manageTitle')}</Link>
          </Button>
        </div>
      </div>

      {content ? (
        <dl className="mt-4 grid gap-3 sm:grid-cols-3">
          <Row label={t('contentActivities')} value={format.number(content.activityCount)} />
          <Row
            label={t('contentQuiz')}
            value={content.hasQuiz ? t('contentYes') : t('contentNo')}
          />
          <Row
            label={t('contentCompletion')}
            value={content.completionConfigured ? t('contentYes') : t('contentNo')}
          />
        </dl>
      ) : (
        /*
          Null means the LMS could not be asked, which the publish gate treats
          as a blocker rather than as "fine" — so saying so plainly here matches
          what the entity will be told when they try.
        */
        <p role="status" className="mt-4 text-sm text-muted-foreground">
          {t('contentUnavailable')}
        </p>
      )}

      {content && !content.completionConfigured ? (
        /* The D-042 dead end, named beside the editor that fixes it. */
        <p role="alert" className="mt-3 text-sm text-destructive">
          {t('contentCriteriaWarning')}
        </p>
      ) : null}

      {blocked ? (
        <div className="mt-3">
          <p className="text-sm font-medium text-foreground">{t('publishBlockedTitle')}</p>
          <BlockerList blockers={course.publishBlockers} maxPaths={course.pathRules.maxPaths} />
        </div>
      ) : null}
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-base font-medium text-foreground">{value}</dd>
    </div>
  );
}

'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { EntityPage } from '@/components/layout/entity-page';
import { DataView } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useErrorMessage } from '@/components/auth/use-error-message';
import { useFormat } from '@/i18n/format-provider';
import { entityApi } from '@/lib/api-client';
import { useApiQuery } from '@/lib/use-api';

/**
 * §4B.4 — Course Content.
 *
 * Deliberately thin: a launch into Moodle, and a **read-back** of what Moodle
 * holds. We do not rebuild Moodle's editor (D-046), and we do not render its
 * material (D-000/D-045) — so there is nothing else this page could honestly
 * show.
 *
 * Its real job is the last line of the read-back. D-042 found that a Moodle
 * course with no completion criteria reports `completed: false` forever, so
 * nobody on it can ever pass and no certificate can ever be issued, with nothing
 * in any log to explain it. This is where an entity sees that before publishing
 * rather than weeks later through a confused learner.
 */
export default function CourseContentPage() {
  const t = useTranslations('entity');
  const params = useParams<{ courseId: string }>();
  const courseId = params.courseId;

  const content = useApiQuery(() => entityApi.content(courseId), [courseId]);

  return (
    <EntityPage title={t('contentTitle')}>
      <div className="space-y-6">
        <LaunchCard courseId={courseId} />

        <Card className="p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-foreground">{t('contentHeading')}</h2>
            <Button variant="ghost" onClick={content.refetch}>
              {t('contentRefresh')}
            </Button>
          </div>

          <DataView isLoading={content.isLoading} error={content.error} onRetry={content.refetch}>
            {content.data ? (
              <ContentSummary data={content.data} />
            ) : (
              /*
                Null means the LMS could not be asked, which the publish gate
                treats as a blocker rather than as "fine" — so saying so plainly
                here matches what the entity will be told when they try.
              */
              <p role="status" className="mt-4 text-sm text-muted-foreground">
                {t('contentUnavailable')}
              </p>
            )}
          </DataView>
        </Card>
      </div>
    </EntityPage>
  );
}

function ContentSummary({
  data,
}: {
  data: { activityCount: number; hasQuiz: boolean; completionConfigured: boolean };
}) {
  const t = useTranslations('entity');
  const format = useFormat();

  return (
    <>
      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
        <Row label={t('contentActivities')} value={format.number(data.activityCount)} />
        <Row label={t('contentQuiz')} value={data.hasQuiz ? t('contentYes') : t('contentNo')} />
        <Row
          label={t('contentCompletion')}
          value={data.completionConfigured ? t('contentYes') : t('contentNo')}
        />
      </dl>

      {!data.completionConfigured ? (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {t('contentCriteriaWarning')}
        </p>
      ) : null}
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-lg font-medium text-foreground">{value}</dd>
    </div>
  );
}

/** The handoff, minted on the click and never rendered into the page (D-045). */
function LaunchCard({ courseId }: { courseId: string }) {
  const t = useTranslations('entity');
  const translateError = useErrorMessage();
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onLaunch() {
    setError(null);
    setLaunching(true);

    try {
      const { url } = await entityApi.authorLaunch(courseId);
      window.location.href = url;
    } catch (caught) {
      setError(translateError(caught));
      setLaunching(false);
    }
  }

  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold text-foreground">{t('authorTitle')}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t('authorHint')}</p>

      <div className="mt-4 flex flex-wrap gap-3">
        <Button onClick={onLaunch} disabled={launching}>
          {launching ? t('authorLaunching') : t('authorLaunch')}
        </Button>
        <Button asChild variant="outline">
          <Link href={`/entity/courses/${courseId}`}>{t('manageTitle')}</Link>
        </Button>
      </div>

      {error ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </Card>
  );
}

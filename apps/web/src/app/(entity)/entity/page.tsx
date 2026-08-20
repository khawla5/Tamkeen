'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';

import type { EntityDashboardView } from '@tamkeen/types';

import { BlockerList } from '@/components/entity/blocker-list';
import { EntityPage } from '@/components/layout/entity-page';
import { DataView } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { entityApi } from '@/lib/api-client';
import { useApiQuery } from '@/lib/use-api';
import { useFormat } from '@/i18n/format-provider';

/**
 * §4B.1 — the entity dashboard.
 *
 * **`needsAttention` is the page; the counts are context.** §3 requires every
 * screen to show only what is actionable now, and an entity can do nothing about
 * "twelve published courses". What they can act on is a draft that cannot be
 * published as it stands — so that list is the substance, and the single primary
 * action is creating a course.
 */
export default function EntityDashboardPage() {
  const t = useTranslations('entity');
  const dashboard = useApiQuery(() => entityApi.dashboard(), []);

  return (
    <EntityPage
      title={t('dashboardTitle')}
      action={
        <Button asChild>
          <Link href="/entity/courses?new=1">{t('addCourse')}</Link>
        </Button>
      }
    >
      <DataView isLoading={dashboard.isLoading} error={dashboard.error} onRetry={dashboard.refetch}>
        {dashboard.data ? <DashboardBody data={dashboard.data} /> : null}
      </DataView>
    </EntityPage>
  );
}

function DashboardBody({ data }: { data: EntityDashboardView }) {
  const t = useTranslations('entity');
  const format = useFormat();

  return (
    <div className="space-y-6">
      <section
        aria-label={t('dashboardTitle')}
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5"
      >
        <Stat label={t('statPublished')} value={format.number(data.publishedCourses)} />
        <Stat label={t('statDraft')} value={format.number(data.draftCourses)} />
        <Stat label={t('statWithdrawn')} value={format.number(data.withdrawnCourses)} />
        <Stat label={t('statLearners')} value={format.number(data.totalLearners)} />
        <Stat
          label={t('statCompletion')}
          /* Null rather than 0% when nobody has started: a rate over an empty
             denominator is undefined, and "0%" reads as failure. */
          value={data.completionRate === null ? '—' : format.percent(data.completionRate)}
        />
      </section>

      <section aria-labelledby="needs-attention">
        <h2 id="needs-attention" className="mb-3 text-lg font-semibold text-foreground">
          {t('needsAttention')}
        </h2>

        {data.needsAttention.length === 0 ? (
          <Card className="p-6 text-sm text-muted-foreground">{t('needsAttentionEmpty')}</Card>
        ) : (
          <ul className="space-y-3">
            {data.needsAttention.map((course) => (
              <li key={course.id}>
                <Card className="flex flex-wrap items-start justify-between gap-4 p-5">
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">{course.title}</p>
                    <BlockerList blockers={course.blockers} />
                  </div>
                  <Button asChild variant="outline">
                    <Link href={`/entity/courses/${course.id}`}>{t('manageTitle')}</Link>
                  </Button>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
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

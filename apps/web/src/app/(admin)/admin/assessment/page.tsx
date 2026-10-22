'use client';

import { AlertTriangle, CheckCircle2, ChevronLeft, ClipboardCheck } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { AdminPage } from '@/components/layout/admin-page';
import { DataView } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { cardVariants } from '@/components/ui/card';
import { adminApi } from '@/lib/api-client';
import { useApiQuery } from '@/lib/use-api';
import { cn } from '@/lib/utils';

/**
 * §4C.3 — the assessments as one list (D-133, D-134).
 *
 * **One per path, so the list is the paths.** There is no "the assessment" any
 * more: a path places its own learners, with its own bank and its own bands, and
 * a path with none strands everybody the ministry assigns to it. That is what
 * this page is for — the row that says «لم يُنشأ بعد» is the finding, and it is
 * the reason the list exists rather than a link straight into one editor.
 *
 * Assignment is not here: who is put on a path is decided per account in
 * «الحسابات» (D-133).
 */
export default function AdminAssessmentsListPage() {
  const t = useTranslations('admin');

  const paths = useApiQuery(() => adminApi.listPaths(), []);

  return (
    <AdminPage title={t('assessmentTitle')}>
      <DataView
        isLoading={paths.isInitialLoad}
        error={paths.error}
        onRetry={paths.refetch}
        isEmpty={paths.data?.length === 0}
        emptyProps={{ title: t('pathsEmpty'), body: t('pathsEmptyHint') }}
      >
        {/* One card for each path, in a grid: the name set large, its two small states
            beside it, and under it — in a band of its own — the one thing this page
            exists to say, whether the path has an assessment that can place anybody. */}
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {(paths.data ?? []).map((path) => (
            <li key={path.id}>
              <Link
                href={`/admin/assessment/${path.id}`}
                className={cn(
                  cardVariants(),
                  'group flex h-full flex-col overflow-hidden transition-colors hover:border-primary-600',
                )}
              >
                <span className="flex items-start gap-3 p-5">
                  <span
                    aria-hidden="true"
                    className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-700"
                  >
                    <ClipboardCheck className="size-5" />
                  </span>

                  <span className="flex min-w-0 flex-1 flex-col gap-2">
                    <span className="text-lg font-semibold leading-snug text-foreground">
                      {path.name}
                    </span>
                    {path.status !== 'PUBLISHED' || path.hasDraftAssessment ? (
                      <span className="flex flex-wrap items-center gap-2">
                        {path.status === 'PUBLISHED' ? null : (
                          <Badge variant="soft">{t('pathDraft')}</Badge>
                        )}
                        {path.hasDraftAssessment ? (
                          <Badge variant="neutral">{t('assessmentPathDraft')}</Badge>
                        ) : null}
                      </span>
                    ) : null}
                  </span>

                  <ChevronLeft
                    aria-hidden="true"
                    className="mt-1 size-5 shrink-0 text-neutral-400 transition-colors group-hover:text-primary-600"
                  />
                </span>

                {/* The finding, said in words on the card: a published path with no
                    published assessment strands everybody assigned to it at
                    «بانتظار تحديد المستوى», and the wording carries it rather than
                    the colour (WCAG 1.4.1). */}
                <span
                  className={cn(
                    'mt-auto flex items-center gap-2 border-t px-5 py-3 text-sm',
                    path.hasActiveAssessment
                      ? 'border-border bg-neutral-50 text-muted-foreground'
                      : 'border-warning/30 bg-warning-50 font-medium text-warning',
                  )}
                >
                  {path.hasActiveAssessment ? (
                    <CheckCircle2 aria-hidden="true" className="size-4 shrink-0 text-success" />
                  ) : (
                    <AlertTriangle aria-hidden="true" className="size-4 shrink-0" />
                  )}
                  {path.hasActiveAssessment
                    ? t('assessmentPathActive')
                    : t('assessmentPathMissing')}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </DataView>
    </AdminPage>
  );
}

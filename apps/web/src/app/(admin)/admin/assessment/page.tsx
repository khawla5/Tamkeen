'use client';

import { ChevronLeft } from 'lucide-react';
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
        <ul className="flex flex-col gap-4">
          {(paths.data ?? []).map((path) => (
            <li key={path.id}>
              <Link
                href={`/admin/assessment/${path.id}`}
                className={cn(
                  cardVariants(),
                  'flex items-center justify-between gap-4 p-5 transition-colors hover:border-primary-600',
                )}
              >
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-lg font-semibold text-foreground">{path.name}</span>
                    {path.status === 'PUBLISHED' ? null : (
                      <Badge variant="soft">{t('pathDraft')}</Badge>
                    )}
                    {path.hasDraftAssessment ? (
                      <Badge variant="neutral">{t('assessmentPathDraft')}</Badge>
                    ) : null}
                  </span>
                  {/* The finding, said on the row: a published path with no
                      published assessment strands everybody assigned to it at
                      «بانتظار تحديد المستوى», and the wording carries it rather
                      than a colour (WCAG 1.4.1). */}
                  <span
                    className={
                      path.hasActiveAssessment
                        ? 'text-sm text-muted-foreground'
                        : 'text-sm font-medium text-warning'
                    }
                  >
                    {path.hasActiveAssessment
                      ? t('assessmentPathActive')
                      : t('assessmentPathMissing')}
                  </span>
                </span>
                <ChevronLeft aria-hidden="true" className="size-5 shrink-0 text-neutral-500" />
              </Link>
            </li>
          ))}
        </ul>
      </DataView>
    </AdminPage>
  );
}

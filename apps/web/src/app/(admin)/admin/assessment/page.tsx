'use client';

import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { AdminPage } from '@/components/layout/admin-page';
import { DataView } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { cardVariants } from '@/components/ui/card';
import { useFormat } from '@/i18n/format-provider';
import { adminApi } from '@/lib/api-client';
import { useApiQuery } from '@/lib/use-api';
import { cn } from '@/lib/utils';

/**
 * §4C.3 — the assessments as one list (D-133): every instrument the ministry
 * runs, each row opening its own question editor beneath this page. The
 * editors stay separate pages sharing no code (D-124); this shelf is the one
 * thing they share. Assignment is not here — who may take an instrument is
 * decided per account in «الحسابات».
 */
export default function AdminAssessmentsListPage() {
  const t = useTranslations('admin');
  const { number } = useFormat();

  const riasec = useApiQuery(() => adminApi.assessmentOverview(), []);
  const english = useApiQuery(() => adminApi.englishOverview(), []);

  const rows = [
    {
      href: '/admin/assessment/riasec',
      name: t('assignments.instrument.RIASEC'),
      overview: riasec,
    },
    {
      href: '/admin/assessment/english',
      name: t('assignments.instrument.ENGLISH_CEFR'),
      overview: english,
    },
  ];

  return (
    <AdminPage title={t('assessmentTitle')}>
      <DataView
        isLoading={riasec.isInitialLoad || english.isInitialLoad}
        error={riasec.error ?? english.error}
        onRetry={() => {
          riasec.refetch();
          english.refetch();
        }}
      >
        <ul className="flex flex-col gap-4">
          {rows.map((row) => {
            const active = row.overview.data?.active ?? null;
            const hasDraft = Boolean(row.overview.data?.draft);

            return (
              <li key={row.href}>
                <Link
                  href={row.href}
                  className={cn(
                    cardVariants(),
                    'flex items-center justify-between gap-4 p-5 transition-colors hover:border-primary-600',
                  )}
                >
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-lg font-semibold text-foreground">{row.name}</span>
                      {hasDraft ? (
                        <Badge variant="warning">{t('instrumentDraftBadge')}</Badge>
                      ) : null}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {active
                        ? t('instrumentActiveSummary', {
                            version: number(active.version),
                            questions: number(active.questionCount),
                          })
                        : t('instrumentNoActive')}
                    </span>
                  </span>
                  <ChevronLeft aria-hidden="true" className="size-5 shrink-0 text-neutral-500" />
                </Link>
              </li>
            );
          })}
        </ul>
      </DataView>
    </AdminPage>
  );
}

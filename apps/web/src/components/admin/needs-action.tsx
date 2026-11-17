'use client';

import { AlertCircle, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import type { AdminDashboardView } from '@tamkeen/types';

import { Button } from '@/components/ui/button';
import { useFormat } from '@/i18n/format-provider';

/** What is waiting on the administrator, each with the screen that clears it. */
export function NeedsAction({ data }: { data: AdminDashboardView }) {
  const t = useTranslations('admin');
  const format = useFormat();

  const unassignedCourses = data.courses.unassigned;
  /* Employees who hold no path: all employees less those holding at least one. */
  const employeesWithoutPath = Math.max(0, data.users.employees - data.journey.assigned);
  const stranded = data.pathsWithoutAssessment;

  if (unassignedCourses === 0 && employeesWithoutPath === 0 && stranded.length === 0) {
    return null;
  }

  return (
    <section
      aria-labelledby="admin-needs-action"
      className="rounded-xl border border-warning/60 bg-card px-4 py-3"
    >
      <h2
        id="admin-needs-action"
        className="mb-2 flex items-center gap-2 text-sm font-medium text-warning"
      >
        <AlertCircle aria-hidden="true" className="size-[18px]" />
        {t('actionTitle')}
      </h2>

      <ul className="flex flex-col gap-1.5">
        {unassignedCourses > 0 ? (
          <ActionRow
            text={t('actionUnassigned', {
              n: unassignedCourses,
              count: format.number(unassignedCourses),
            })}
            href="/admin/paths"
            label={t('actionUnassignedButton')}
          />
        ) : null}

        {employeesWithoutPath > 0 ? (
          <ActionRow
            text={t('actionNoPath', {
              n: employeesWithoutPath,
              count: format.number(employeesWithoutPath),
            })}
            href="/admin/users"
            label={t('actionNoPathButton')}
          />
        ) : null}

        {/* A path with no published assessment strands everybody assigned to it
            at «بانتظار تحديد المستوى», and assignment happens on another screen —
            so by the time somebody notices, a directorate is on a path that goes
            nowhere. Each one links straight to the assessment that fixes it. */}
        {stranded.length > 0 ? (
          <li className="flex flex-col gap-1.5 border-t border-border pt-1.5 text-sm first:border-t-0 first:pt-0">
            <span className="flex items-center gap-2 text-foreground">
              <AlertTriangle aria-hidden="true" className="size-4 shrink-0 text-warning" />
              {t('sectionStuckPaths')}
            </span>
            <span className="text-xs text-muted-foreground">{t('stuckPathsHint')}</span>
            <span className="flex flex-wrap gap-2">
              {stranded.map((path) => (
                <Button key={path.id} asChild size="sm" variant="outline">
                  <Link href={`/admin/assessment/${path.id}`}>{path.name}</Link>
                </Button>
              ))}
            </span>
          </li>
        ) : null}
      </ul>
    </section>
  );
}

function ActionRow({ text, href, label }: { text: string; href: string; label: string }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-1.5 text-sm first:border-t-0 first:pt-0">
      <span className="text-foreground">{text}</span>
      <Button asChild size="sm" variant="outline">
        <Link href={href}>{label}</Link>
      </Button>
    </li>
  );
}

'use client';

import { ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import type { AdminPathRow } from '@tamkeen/types';

import { useErrorMessage } from '@/components/auth/use-error-message';
import { PathRoadmap } from '@/components/admin/path-roadmap';
import { AdminPage } from '@/components/layout/admin-page';
import { DataView } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useFormat } from '@/i18n/format-provider';
import { adminApi } from '@/lib/api-client';
import { useApiQuery } from '@/lib/use-api';
import { useAppRouter } from '@/lib/use-app-router';
import { cn } from '@/lib/utils';

/** A path key nobody has to read or type: it never appears again once the
 *  path exists, so a short random slug does the job a form field used to. */
function randomPathKey(): string {
  return `path-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * §4C.4 — study paths and their ladders (D-134).
 *
 * **Each row says how much of the path is still waiting on the administrator.**
 * A course an entity has offered and nobody has placed reaches no learner at
 * all, and that is invisible from every other screen — so the count of
 * unassigned memberships is on the list itself, beside the count of placed ones,
 * rather than a page deeper.
 *
 * The other number is how many learners the ministry has put on the path: what
 * matters before touching anything, because nothing an administrator does here
 * can take a path away from somebody holding it.
 *
 * **The list only lists.** Editing a ladder is its own screen at
 * `/admin/paths/[pathId]` — the work is long enough to scroll and to come back
 * to, which is not what a modal is for.
 *
 * **"إنشاء مسار" lands there too, immediately — the same screen "إدارة"
 * opens, not a form of its own first.** A path answers to nothing but a name
 * and a description, and both are already editable the moment the ladder
 * screen opens; asking for them a second time in a dialog or a separate page
 * would be the same two fields twice. So the button creates a plain, unnamed
 * path outright and hands off straight into its ladder screen, where the
 * administrator's first move is simply to name it.
 */
export default function AdminPathsPage() {
  const t = useTranslations('admin');
  const router = useAppRouter();
  const translateError = useErrorMessage();

  const paths = useApiQuery(() => adminApi.listPaths(), []);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setError(null);
    setCreating(true);

    try {
      const path = await adminApi.createPath({
        key: randomPathKey(),
        name: t('pathNewDefaultName'),
        description: t('pathNewDefaultDescription'),
      });
      /* Replace, not push: the placeholder path this just created is not
         somewhere the back button should return to. */
      router.replace(`/admin/paths/${path.id}`);
    } catch (caught) {
      setError(translateError(caught));
      setCreating(false);
    }
  }

  return (
    <AdminPage
      title={t('pathsTitle')}
      action={
        <Button onClick={() => void create()} disabled={creating}>
          {t('pathCreate')}
        </Button>
      }
    >
      <div className="space-y-4">
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <DataView
          isLoading={paths.isInitialLoad}
          error={paths.error}
          onRetry={paths.refetch}
          isEmpty={paths.data?.length === 0}
          emptyProps={{ title: t('pathsEmpty'), body: t('pathsEmptyHint') }}
        >
          <ul className="space-y-3">
            {(paths.data ?? []).map((path) => (
              <li key={path.id}>
                <PathCard path={path} />
              </li>
            ))}
          </ul>
        </DataView>
      </div>
    </AdminPage>
  );
}

function PathCard({ path }: { path: AdminPathRow }) {
  const t = useTranslations('admin');
  const format = useFormat();
  const [open, setOpen] = useState(false);

  const panelId = `path-road-${path.id}`;

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          {/* The name opens the road of the path's courses beneath it. A button, not a
              link: it changes what this card shows, and the ladder editor stays one
              click away on «إدارة» exactly as before. */}
          <p className="flex flex-wrap items-center gap-2 font-medium text-foreground">
            <button
              type="button"
              aria-expanded={open}
              aria-controls={panelId}
              onClick={() => setOpen((value) => !value)}
              className="inline-flex items-center gap-1.5 rounded-md text-start outline-none hover:text-primary-700 focus-visible:ring-[3px] focus-visible:ring-primary-600/50"
            >
              {path.name}
              <ChevronDown
                aria-hidden="true"
                className={cn(
                  'size-4 shrink-0 text-neutral-500 transition-transform',
                  open && 'rotate-180',
                )}
              />
            </button>
            {path.status === 'PUBLISHED' ? null : <Badge variant="soft">{t('pathDraft')}</Badge>}
            {/* The work queue, on the list: memberships nobody has placed reach no
                learner, and nothing else on this screen would say so. */}
            {path.unassignedCourseCount > 0 ? (
              <Badge variant="warning">
                {t('pathUnassigned', { count: format.number(path.unassignedCourseCount) })}
              </Badge>
            ) : null}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('pathSummary', {
              levels: format.number(path.levelCount),
              courses: format.number(path.placedCourseCount),
              learners: format.number(path.assignedLearners),
            })}
          </p>
        </div>

        {/* A link, not a button: the ladder has an address now, so it can be
            opened in a new tab, bookmarked, and linked to from the dashboard's
            stuck-paths list. */}
        <Link
          href={`/admin/paths/${path.id}`}
          className={cn(buttonVariants({ variant: 'outline' }), 'shrink-0')}
        >
          {t('manage')}
        </Link>
      </div>

      {/* Loaded only once opened, and again each time — the road is a view of the
          ladder, which the administrator may have changed since. */}
      {open ? (
        <div id={panelId} className="mt-4 border-t border-border pt-4">
          <PathRoadmap pathId={path.id} />
        </div>
      ) : null}
    </Card>
  );
}

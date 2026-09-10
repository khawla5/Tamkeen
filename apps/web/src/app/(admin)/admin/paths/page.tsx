'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import type { AdminPathRow } from '@tamkeen/types';

import { AdminDialog } from '@/components/admin/admin-dialog';
import { useErrorMessage } from '@/components/auth/use-error-message';
import { AdminPage } from '@/components/layout/admin-page';
import { DataView } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useFormat } from '@/i18n/format-provider';
import { adminApi } from '@/lib/api-client';
import { useApiQuery } from '@/lib/use-api';
import { useAppRouter } from '@/lib/use-app-router';
import { cn } from '@/lib/utils';

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
 * to, which is not what a modal is for. Creating a path stays a dialog, because
 * three fields answered once is exactly what a modal is for.
 */
export default function AdminPathsPage() {
  const t = useTranslations('admin');
  const [creating, setCreating] = useState(false);

  const paths = useApiQuery(() => adminApi.listPaths(), []);

  return (
    <AdminPage
      title={t('pathsTitle')}
      action={<Button onClick={() => setCreating(true)}>{t('pathCreate')}</Button>}
    >
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

      {creating ? <CreatePathDialog onClose={() => setCreating(false)} /> : null}
    </AdminPage>
  );
}

function PathCard({ path }: { path: AdminPathRow }) {
  const t = useTranslations('admin');
  const format = useFormat();

  return (
    <Card className="flex flex-wrap items-start justify-between gap-4 p-5">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 font-medium text-foreground">
          {path.name}
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
    </Card>
  );
}

function CreatePathDialog({ onClose }: { onClose: () => void }) {
  const t = useTranslations('admin');
  const router = useAppRouter();
  const translateError = useErrorMessage();

  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setBusy(true);

    try {
      const path = await adminApi.createPath({ key, name, description });
      /* Straight into the ladder editor: a path is created with no rungs, no
         assessment and nothing placed, so the next step is always the same one
         and it is never on this screen. */
      router.push(`/admin/paths/${path.id}`);
    } catch (caught) {
      setError(translateError(caught));
      setBusy(false);
    }
  }

  return (
    <AdminDialog
      title={t('pathCreate')}
      /* Says up front that the path will not be offered yet, so the absence of
         an "activate" switch on this form is an answer rather than an omission. */
      description={t('pathCreateHint')}
      onClose={onClose}
      footer={
        <Button
          type="button"
          disabled={busy || !key || !name || description.trim().length < 10}
          onClick={submit}
        >
          {t('pathCreateAction')}
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="new-path-name" label={t('pathName')} required>
          {(field) => (
            <Input {...field} value={name} onChange={(event) => setName(event.target.value)} />
          )}
        </Field>

        <Field id="new-path-key" label={t('pathKey')} hint={t('entityKeyHint')} required>
          {(field) => (
            <Input
              {...field}
              dir="ltr"
              value={key}
              onChange={(event) => setKey(event.target.value)}
            />
          )}
        </Field>

        <div className="sm:col-span-2">
          <Field id="new-path-description" label={t('pathDescription')} required>
            {(field) => (
              <Textarea
                {...field}
                rows={3}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            )}
          </Field>
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </AdminDialog>
  );
}

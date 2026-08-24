'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { RIASEC_LETTERS, type AdminPathRow, type RiasecLetter } from '@tamkeen/types';

import { AdminDialog } from '@/components/admin/admin-dialog';
import { PathDetailPanel } from '@/components/admin/path-detail-panel';
import { useErrorMessage } from '@/components/auth/use-error-message';
import { AdminPage } from '@/components/layout/admin-page';
import { DataView } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useFormat } from '@/i18n/format-provider';
import { adminApi } from '@/lib/api-client';
import { useApiQuery } from '@/lib/use-api';

/**
 * §4C.4 — study paths.
 *
 * **The 5-10 rule is printed and never offered as a control** (D-074, §2). It is
 * on the page because an administrator asked to explain a rejected path build
 * needs the numbers in front of them; it is read-only because a floor of five
 * that can be lowered is a floor of three the first time delivery is late.
 *
 * Each row shows how many learners have *confirmed* the path, which is the
 * number that matters before touching anything: D-002 makes those choices
 * permanent, and nothing an administrator does here can take a path away from
 * somebody holding it.
 */
export default function AdminPathsPage() {
  const t = useTranslations('admin');
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const paths = useApiQuery(() => adminApi.listPaths(), []);
  const bounds = useApiQuery(() => adminApi.pathBounds(), []);

  return (
    <AdminPage
      title={t('pathsTitle')}
      action={<Button onClick={() => setCreating(true)}>{t('pathCreate')}</Button>}
    >
      <div className="space-y-6">
        {bounds.data ? <BoundsNotice min={bounds.data.min} max={bounds.data.max} /> : null}

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
                <PathCard path={path} onManage={() => setSelected(path.id)} />
              </li>
            ))}
          </ul>
        </DataView>
      </div>

      {creating ? (
        <CreatePathDialog
          onClose={() => setCreating(false)}
          onCreated={(pathId) => {
            setCreating(false);
            paths.refetch();
            /* Straight into the detail panel: a path is created empty and cannot
               be offered until it has courses, so the next step is always the
               same one. */
            setSelected(pathId);
          }}
        />
      ) : null}

      {selected ? (
        <PathDetailPanel
          pathId={selected}
          onClose={() => {
            setSelected(null);
            paths.refetch();
          }}
          onChanged={() => paths.refetch()}
        />
      ) : null}
    </AdminPage>
  );
}

function BoundsNotice({ min, max }: { min: number; max: number }) {
  const t = useTranslations('admin');
  const format = useFormat();

  return (
    <Card className="p-4 text-sm text-muted-foreground">
      {t('pathBoundsNotice', { min: format.number(min), max: format.number(max) })}
    </Card>
  );
}

function PathCard({ path, onManage }: { path: AdminPathRow; onManage: () => void }) {
  const t = useTranslations('admin');
  const format = useFormat();

  return (
    <Card className="flex flex-wrap items-start justify-between gap-4 p-5">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 font-medium text-foreground">
          {path.name}
          {/* The accent marks the letter because that is what the letter
              *does* — it is the recommendation signal (§3A). One accent since
              D-069 retired gold; the treatment, not the hue, carries it. */}
          <Badge variant="primary">{t(`riasec.${path.riasecLetter}`)}</Badge>
          {path.isActive ? null : <Badge variant="soft">{t('pathNotOffered')}</Badge>}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('pathSummary', {
            courses: format.number(path.courseCount),
            learners: format.number(path.committedLearners),
          })}
        </p>
      </div>

      <Button variant="outline" onClick={onManage}>
        {t('manage')}
      </Button>
    </Card>
  );
}

function CreatePathDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (pathId: string) => void;
}) {
  const t = useTranslations('admin');
  const translateError = useErrorMessage();

  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [letter, setLetter] = useState<RiasecLetter>('R');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setBusy(true);

    try {
      const path = await adminApi.createPath({ key, name, description, riasecLetter: letter });
      onCreated(path.id);
    } catch (caught) {
      setError(translateError(caught));
    } finally {
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

        <Field id="new-path-letter" label={t('pathLetter')} hint={t('pathLetterHint')} required>
          {(field) => (
            <select
              {...field}
              value={letter}
              onChange={(event) => setLetter(event.target.value as RiasecLetter)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {RIASEC_LETTERS.map((value) => (
                <option key={value} value={value}>
                  {t(`riasec.${value}`)}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </AdminDialog>
  );
}

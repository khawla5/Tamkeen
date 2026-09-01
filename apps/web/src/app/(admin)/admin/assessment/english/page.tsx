'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import type { AdminEnglishOverview, AdminEnglishVersion } from '@tamkeen/types';

import { EnglishAssessmentEditor } from '@/components/admin/english-assessment-editor';
import { useErrorMessage } from '@/components/auth/use-error-message';
import { AdminPage } from '@/components/layout/admin-page';
import { DataView } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useFormat } from '@/i18n/format-provider';
import { adminApi } from '@/lib/api-client';
import { useApiQuery } from '@/lib/use-api';

/**
 * §4C.9 — English placement management.
 *
 * **A parallel page to §4C.3, not a tab of it** (D-124). It follows §4C.3's
 * shape because that shape is right — the frozen-results notice above the
 * primary action, the history showing how many people each version placed — and
 * shares none of its code, so a change to one instrument's editor cannot reach
 * the other.
 *
 * The one place it genuinely diverges: **the primary action works with no active
 * version.** §4C.3 disables "edit" until there is a bank to copy, which is right
 * for a seeded instrument that has always had one. Here the first version has to
 * be creatable from the screen, or a ministry whose seed never ran has an editor
 * that cannot make the thing it edits.
 */
export default function AdminEnglishPage() {
  const t = useTranslations('admin');
  const overview = useApiQuery(() => adminApi.englishOverview(), []);
  const [editing, setEditing] = useState(false);

  return (
    <AdminPage title={t('englishTitle')}>
      <DataView
        isLoading={overview.isInitialLoad}
        error={overview.error}
        onRetry={overview.refetch}
      >
        {overview.data ? (
          <Body
            overview={overview.data}
            editing={editing || overview.data.draft !== null}
            onEnterEditor={() => setEditing(true)}
            onExitEditor={() => {
              setEditing(false);
              overview.refetch();
            }}
          />
        ) : null}
      </DataView>
    </AdminPage>
  );
}

function Body({
  overview,
  editing,
  onEnterEditor,
  onExitEditor,
}: {
  overview: AdminEnglishOverview;
  editing: boolean;
  onEnterEditor: () => void;
  onExitEditor: () => void;
}) {
  const t = useTranslations('admin');

  if (editing) {
    return <DraftPane onDone={onExitEditor} />;
  }

  return (
    <div className="space-y-6">
      {overview.active ? (
        <VersionCard version={overview.active} highlight />
      ) : (
        <Card className="p-6 text-sm text-muted-foreground">{t('englishMissing')}</Card>
      )}

      <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="min-w-0">
          <p className="font-medium text-foreground">{t('englishEditHeading')}</p>
          {/* Said before the decision, not after it — D-049 is only reassuring
              if the person about to change the instrument knows it, otherwise
              the safe-feeling move is to leave it alone forever. */}
          <p className="mt-1 text-sm text-muted-foreground">{t('englishFrozenNotice')}</p>
        </div>
        <Button onClick={onEnterEditor}>
          {overview.active ? t('englishStartEdit') : t('englishCreateFirst')}
        </Button>
      </Card>

      {overview.history.length > 0 ? (
        <section aria-labelledby="english-history">
          <h2 id="english-history" className="mb-3 text-lg font-semibold text-foreground">
            {t('englishHistoryHeading')}
          </h2>
          <ul className="space-y-3">
            {overview.history.map((version) => (
              <li key={version.id}>
                <VersionCard version={version} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

/**
 * Opens the draft, creating one if none exists.
 *
 * Separated from the editor so it mounts against a draft that is already there;
 * creating it inside would mean rendering an editor for a bank that does not
 * exist yet, which is a loading state pretending to be a page.
 */
function DraftPane({ onDone }: { onDone: () => void }) {
  const translateError = useErrorMessage();

  const draft = useApiQuery(async () => {
    try {
      return await adminApi.englishDraft();
    } catch {
      /* No draft yet — the ordinary case on entering the editor. Creating it
         here keeps "edit the test" one action rather than two. */
      return adminApi.createEnglishDraft();
    }
  }, []);

  const [current, setCurrent] = useState<Awaited<ReturnType<typeof adminApi.englishDraft>> | null>(
    null,
  );

  const shown = current ?? draft.data;

  return (
    /* No "back" control, for §4C.3's reason: entering the editor creates the
       draft and the page routes to the editor whenever a draft exists, so a back
       button would return to the overview for exactly as long as the refetch
       took and then land the administrator back here. The two real exits are in
       the editor's header — publish, or discard. */
    <div className="space-y-4">
      <DataView isLoading={draft.isInitialLoad} error={draft.error} onRetry={draft.refetch}>
        {shown ? (
          <EnglishAssessmentEditor draft={shown} onChanged={setCurrent} onPublished={onDone} />
        ) : (
          <p className="text-sm text-destructive">{translateError(draft.error)}</p>
        )}
      </DataView>
    </div>
  );
}

function VersionCard({
  version,
  highlight = false,
}: {
  version: AdminEnglishVersion;
  highlight?: boolean;
}) {
  const t = useTranslations('admin');
  const format = useFormat();

  return (
    <Card edge={highlight ? 'primary' : 'none'} className="p-5">
      <div className="flex flex-wrap items-center gap-3">
        <p className="font-medium text-foreground">
          {t('versionLabel', { version: format.number(version.version) })}
        </p>
        <Badge variant={version.status === 'ACTIVE' ? 'primary' : 'soft'}>
          {t(`versionStatus.${version.status}`)}
        </Badge>
      </div>

      <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-muted-foreground">{t('effectiveFrom')}</dt>
          <dd className="mt-0.5 text-foreground">
            {version.effectiveFrom ? format.date(new Date(version.effectiveFrom)) : '—'}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t('questionCount')}</dt>
          <dd className="mt-0.5 text-foreground">{format.number(version.questionCount)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t('englishPlacedCount')}</dt>
          {/* The concrete form of D-049 for this instrument: these placements
              exist, and an edit does not touch them. */}
          <dd className="mt-0.5 text-foreground">{format.number(version.resultCount)}</dd>
        </div>
      </dl>
    </Card>
  );
}

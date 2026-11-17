'use client';

import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import type { AdminAssessmentOverview, AdminAssessmentVersion } from '@tamkeen/types';

import { AssessmentEditor } from '@/components/admin/assessment-editor';
import { AdminPage } from '@/components/layout/admin-page';
import { DataView } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useFormat } from '@/i18n/format-provider';
import { adminApi } from '@/lib/api-client';
import { useApiQuery } from '@/lib/use-api';
import { useErrorMessage } from '@/components/auth/use-error-message';

/**
 * §4C.3 — one path's placement assessment (D-134).
 *
 * **The page says what an edit will and will not do, before the edit starts.**
 * D-049 makes existing placements frozen, and that is only reassuring if the
 * person about to change the instrument knows it — otherwise the safe-feeling
 * move is to leave the assessment alone forever, and the ministry never improves
 * it. So the notice sits above the primary action, and again in the publish
 * dialog.
 *
 * The history is not decoration either: each retired version shows how many
 * people it placed, which is the concrete form of "these placements exist and
 * this edit does not touch them".
 */
export default function AdminAssessmentPage() {
  const t = useTranslations('admin');
  const params = useParams<{ pathId: string }>();
  const pathId = params.pathId;

  const overview = useApiQuery(() => adminApi.assessmentOverview(pathId), [pathId]);
  const [editing, setEditing] = useState(false);

  return (
    <AdminPage title={overview.data?.pathName ?? t('assessmentTitle')}>
      <DataView
        isLoading={overview.isInitialLoad}
        error={overview.error}
        onRetry={overview.refetch}
      >
        {overview.data ? (
          <Body
            pathId={pathId}
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
  pathId,
  overview,
  editing,
  onEnterEditor,
  onExitEditor,
}: {
  pathId: string;
  overview: AdminAssessmentOverview;
  editing: boolean;
  onEnterEditor: () => void;
  onExitEditor: () => void;
}) {
  const t = useTranslations('admin');

  if (editing) {
    return <DraftPane pathId={pathId} onDone={onExitEditor} />;
  }

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[1.6fr_1fr]">
      {/* What is live, and the decision to change it — the notice before the button. */}
      <div className="space-y-4">
        {overview.active ? (
          <VersionCard version={overview.active} highlight />
        ) : (
          <Card className="p-6 text-sm text-muted-foreground">{t('assessmentMissing')}</Card>
        )}

        <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="min-w-0">
            <p className="font-medium text-foreground">{t('editHeading')}</p>
            {/* Said before the decision, not after it. */}
            <p className="mt-1 text-sm text-muted-foreground">{t('editFrozenNotice')}</p>
          </div>
          {/* Enabled with no active version too: a path with no assessment at
              all is exactly the case this screen has to be able to fix, and a
              disabled button would leave the administrator with no way in. */}
          <Button onClick={onEnterEditor}>
            {overview.active === null ? t('startFirstEdit') : t('startEdit')}
          </Button>
        </Card>
      </div>

      {overview.history.length > 0 ? (
        <section aria-labelledby="assessment-history" className="rounded-2xl bg-neutral-100 p-4">
          <h2 id="assessment-history" className="mb-3 text-lg font-semibold text-foreground">
            {t('historyHeading')}
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
 * Separated from the overview so the editor mounts against a draft that is
 * already there. Creating it inside the editor would mean rendering an editor
 * for a bank that does not exist yet, which is a loading state pretending to be
 * a page.
 */
function DraftPane({ pathId, onDone }: { pathId: string; onDone: () => void }) {
  const translateError = useErrorMessage();

  const draft = useApiQuery(async () => {
    try {
      return await adminApi.assessmentDraft(pathId);
    } catch {
      /* No draft yet — the ordinary case on entering the editor for the first
         time. Creating it here keeps "edit the assessment" one action rather
         than two, which is what §3 asks of a primary action. */
      return adminApi.createAssessmentDraft(pathId);
    }
  }, [pathId]);

  const [current, setCurrent] = useState<Awaited<
    ReturnType<typeof adminApi.assessmentDraft>
  > | null>(null);

  const shown = current ?? draft.data;

  return (
    /*
     * **No "back" control, deliberately.** It used to sit here and it could not
     * work: entering the editor creates the draft, and the page routes to the
     * editor whenever a draft exists — so «رجوع» returned to the overview for
     * exactly as long as the refetch took, then landed the administrator back
     * where they started. A control that undoes itself teaches that the screen
     * is broken. The two exits are the real ones and both are in the editor's
     * own header: publish the version, or discard the draft. The portal
     * navigation is always there for leaving the subject entirely.
     */
    <div className="space-y-4">
      <DataView isLoading={draft.isInitialLoad} error={draft.error} onRetry={draft.refetch}>
        {shown ? (
          <AssessmentEditor
            pathId={pathId}
            draft={shown}
            onChanged={setCurrent}
            onPublished={onDone}
          />
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
  version: AdminAssessmentVersion;
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
          <dt className="text-muted-foreground">{t('scoredCount')}</dt>
          {/* The concrete form of D-049: these results exist, and an edit does
              not touch them. */}
          <dd className="mt-0.5 text-foreground">{format.number(version.resultCount)}</dd>
        </div>
      </dl>
    </Card>
  );
}

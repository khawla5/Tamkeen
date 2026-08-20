'use client';

import { Check, Download } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import type { CvProfile, CvView } from '@tamkeen/types';

import { PortalPage } from '@/components/layout/portal-page';
import { DataView } from '@/components/states';
import { Button } from '@/components/ui/button';
import { cvApi } from '@/lib/api-client';
import { useApiMutation, useApiQuery } from '@/lib/use-api';
import { CvForm } from './cv-form';
import { CvPreview } from './cv-preview';

/**
 * The CV builder (§4.11, D-050).
 *
 * **One save and one export**, per §4.11 — no autosave. A CV is a document a
 * person composes; saving on every keystroke would make an unfinished sentence
 * the stored version, and "saved" would stop meaning anything. The preview is
 * live, so nothing is hidden while they work; only the commit is explicit.
 *
 * The builder's chrome is Arabic-first like the rest of the product, while what
 * the learner types is English. The notice at the top says so, because a form
 * whose labels are Arabic and whose fields expect English is otherwise a guess.
 */
export default function CvPage() {
  const t = useTranslations('cv');

  const cv = useApiQuery(() => cvApi.get(), []);
  const save = useApiMutation((profile: CvProfile) => cvApi.save(profile));

  /* The edited copy. Held here rather than in the form so the preview and the
     save button read exactly what the form is showing. */
  const [profile, setProfile] = useState<CvProfile | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  /*
   * What is currently on the server, which is *not* the same as what the query
   * first returned. Comparing against `cv.data` instead would leave the form
   * dirty forever after a save — the query is not refetched, so its copy stays
   * as it was loaded and every subsequent comparison reports a change.
   */
  const [baseline, setBaseline] = useState<string | null>(null);

  useEffect(() => {
    if (cv.data) {
      setProfile(cv.data.profile);
      setSavedAt(cv.data.savedAt);
      setBaseline(JSON.stringify(cv.data.profile));
    }
  }, [cv.data]);

  const onSave = async () => {
    if (!profile) return;

    const result: CvView | undefined = await save.run(profile);

    if (result) {
      /* The server's copy wins: it has been through validation, and its
         `savedAt` is what the "saved" indicator is about. */
      setProfile(result.profile);
      setSavedAt(result.savedAt);
      setBaseline(JSON.stringify(result.profile));
    }
  };

  const isDirty = profile !== null && baseline !== null && JSON.stringify(profile) !== baseline;

  /* Exportable only when the saved document and the one on screen are the same
     thing, and only once there is a saved document at all. */
  const canExport = savedAt !== null && !isDirty && !save.isPending;

  return (
    <PortalPage
      title={t('title')}
      action={
        <div className="flex items-center gap-3">
          {savedAt && !isDirty && !save.isPending ? (
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Check aria-hidden="true" className="size-4 text-success" />
              {t('saved')}
            </span>
          ) : null}

          {/*
            The export renders the *saved* document, so it is unavailable while
            there are unsaved edits. A file that quietly differed from the
            preview it was exported from would be worse than one the learner
            has to press save for — and the reason is stated rather than left
            to be inferred from a greyed-out button.
          */}
          <Button
            asChild={canExport}
            variant="outline"
            disabled={!canExport}
            title={canExport ? undefined : t('exportBlocked')}
          >
            {canExport ? (
              <a href={cvApi.exportUrl()}>
                <Download aria-hidden="true" />
                {t('export')}
              </a>
            ) : (
              <span>
                <Download aria-hidden="true" />
                {t('export')}
              </span>
            )}
          </Button>

          <Button
            type="button"
            onClick={() => void onSave()}
            disabled={!profile || save.isPending || !isDirty}
          >
            {save.isPending ? t('saving') : t('save')}
          </Button>
        </div>
      }
    >
      <DataView isLoading={cv.isLoading} error={cv.error} onRetry={cv.refetch}>
        {cv.data && profile ? (
          <div className="flex flex-col gap-6">
            <p className="rounded-card border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
              {t('languageNotice')}
            </p>

            {/* A failed save is reported where the action is, not as a page
                error — the document is still on screen and still editable. */}
            {save.error ? (
              <p role="alert" className="text-sm font-medium text-destructive">
                {t('saveFailed')}
              </p>
            ) : null}

            <div className="grid gap-8 xl:grid-cols-2">
              <CvForm profile={profile} autofill={cv.data.autofill} onChange={setProfile} />
              <div className="xl:sticky xl:top-6 xl:self-start">
                <CvPreview profile={profile} autofill={cv.data.autofill} />
              </div>
            </div>
          </div>
        ) : null}
      </DataView>
    </PortalPage>
  );
}

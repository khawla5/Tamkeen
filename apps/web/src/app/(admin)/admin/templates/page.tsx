'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import type { AdminCertificateTemplateView } from '@tamkeen/types';

import { useErrorMessage } from '@/components/auth/use-error-message';
import { AdminPage } from '@/components/layout/admin-page';
import { DataView } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { adminApi } from '@/lib/api-client';
import { useApiQuery } from '@/lib/use-api';

/**
 * §4C.7 — the certificate face.
 *
 * **The notice is the most important thing on the page.** Issued certificates
 * store their rendered bytes (D-052), so editing this changes what the *next*
 * certificate looks like and cannot touch a document somebody already holds.
 * That is a feature — a credential that could be restyled after the fact is not
 * a credential — but only if the person editing knows it, and an administrator
 * who thinks a correction will propagate is one who will not make the
 * correction.
 *
 * **The preview is the real template**, rendered by the same function issuance
 * calls, with obviously-sample content. A preview drawn separately would
 * eventually disagree with the document, and by then certificates would exist
 * that look nothing like what was approved.
 */
export default function AdminTemplatesPage() {
  const t = useTranslations('admin');
  const template = useApiQuery(() => adminApi.certificateTemplate(), []);
  const [current, setCurrent] = useState<AdminCertificateTemplateView | null>(null);

  const shown = current ?? template.data;

  return (
    <AdminPage title={t('templatesTitle')}>
      <DataView
        isLoading={template.isInitialLoad}
        error={template.error}
        onRetry={template.refetch}
      >
        {shown ? (
          <div className="space-y-6">
            <Card className="border-s-4 border-s-info p-5">
              <p className="font-medium text-foreground">{t('templatesFutureOnlyTitle')}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t('templatesFutureOnly')}</p>
            </Card>

            {/* The blocker, named where it matters rather than tracked only in a
                document nobody reading this page has open. */}
            {!shown.hasLogo ? (
              <Card className="p-5 text-sm text-muted-foreground">{t('templatesNoLogo')}</Card>
            ) : null}

            <SignatureForm
              view={shown}
              onSaved={(next) => {
                setCurrent(next);
                template.refetch();
              }}
            />

            <section aria-labelledby="template-preview" className="space-y-3">
              <h2 id="template-preview" className="text-lg font-semibold text-foreground">
                {t('templatesPreview')}
              </h2>
              <p className="text-sm text-muted-foreground">{t('templatesPreviewHint')}</p>

              <Card className="overflow-hidden p-0">
                {/*
                  Sandboxed and srcDoc'd: the preview is a complete document with
                  its own fonts and page geometry, and rendering it inline would
                  put the certificate's stylesheet into the admin portal. The
                  sandbox has no allow-scripts — the template has no scripts, and
                  a preview that could run them would be a rendering surface for
                  whatever a settings field contained.
                */}
                <iframe
                  title={t('templatesPreview')}
                  srcDoc={shown.previewHtml}
                  sandbox=""
                  className="h-[38rem] w-full border-0 bg-white"
                />
              </Card>
            </section>
          </div>
        ) : null}
      </DataView>
    </AdminPage>
  );
}

function SignatureForm({
  view,
  onSaved,
}: {
  view: AdminCertificateTemplateView;
  onSaved: (next: AdminCertificateTemplateView) => void;
}) {
  const t = useTranslations('admin');
  const translateError = useErrorMessage();

  const [name, setName] = useState(view.signatory.name);
  const [title, setTitle] = useState(view.signatory.title);
  const [issuingBody, setIssuingBody] = useState(view.signatory.issuingBody);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const dirty =
    name !== view.signatory.name ||
    title !== view.signatory.title ||
    issuingBody !== view.signatory.issuingBody;

  async function save() {
    setError(null);
    setDone(false);
    setBusy(true);

    try {
      /*
       * Written through the settings endpoints — §4C.6 owns writing settings,
       * and a second writer for the same three rows is exactly the divergence
       * D-072 exists to prevent.
       */
      await adminApi.updateSetting('CERT_SIGNATORY_NAME', name);
      await adminApi.updateSetting('CERT_SIGNATORY_TITLE', title);
      await adminApi.updateSetting('CERT_ISSUING_BODY', issuingBody);

      onSaved(await adminApi.certificateTemplate());
      setDone(true);
    } catch (caught) {
      setError(translateError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="template-signature" className="space-y-3">
      <h2 id="template-signature" className="text-lg font-semibold text-foreground">
        {t('templatesSignature')}
      </h2>

      <Card className="space-y-4 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="sig-name"
            label={t('templatesSignatoryName')}
            hint={t('templatesSignatoryHint')}
          >
            {(field) => (
              <Input {...field} value={name} onChange={(event) => setName(event.target.value)} />
            )}
          </Field>

          <Field id="sig-title" label={t('templatesSignatoryTitle')}>
            {(field) => (
              <Input {...field} value={title} onChange={(event) => setTitle(event.target.value)} />
            )}
          </Field>

          <div className="sm:col-span-2">
            <Field id="sig-body" label={t('templatesIssuingBody')}>
              {(field) => (
                <Input
                  {...field}
                  value={issuingBody}
                  onChange={(event) => setIssuingBody(event.target.value)}
                />
              )}
            </Field>
          </div>
        </div>

        {/* Save appears only when there is something to save (§3). */}
        {dirty ? (
          <Button disabled={busy} onClick={save}>
            {t('templatesSave')}
          </Button>
        ) : null}

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        {done && !error ? (
          <p role="status" className="text-sm text-success">
            {t('templatesSaved')}
          </p>
        ) : null}
      </Card>
    </section>
  );
}

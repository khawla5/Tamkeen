'use client';

import { BadgeCheck, ShieldQuestion } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { ErrorState, LoadingState } from '@/components/states';
import { useFormat } from '@/i18n/format-provider';
import { ApiError, certificatesApi } from '@/lib/api-client';
import { useApiQuery } from '@/lib/use-api';

/**
 * What a third party sees when they scan the QR on a certificate (§2, D-016).
 *
 * **Everything absent here is absent on purpose.** No employee id, no email, no
 * department, no grade, no download of the PDF. A verifier needs to know that
 * the credential is real, whose it is, what it is for and when it was issued;
 * anything beyond that is a ministry employee's personal data handed to whoever
 * holds a piece of paper. The API's `select` enforces the same boundary, so
 * this page could not show more even if it tried.
 *
 * **A missing certificate is not an error.** An id that does not resolve is far
 * more likely to be a mistyped or half-scanned link than a forgery, so the 404
 * gets its own calm state telling the visitor what to do — distinct from the
 * network failure state, which offers a retry.
 */
export function CertificateVerification({ verificationId }: { verificationId: string }) {
  const t = useTranslations('verify');
  const format = useFormat();

  const { data, isLoading, error, refetch } = useApiQuery(
    () => certificatesApi.verify(verificationId),
    [verificationId],
  );

  const notFound = error instanceof ApiError && error.status === 404;

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-md">
        <h1 className="mb-4 text-center text-xl font-semibold text-foreground">{t('title')}</h1>

        {isLoading ? (
          <LoadingState rows={3} label={t('pending')} />
        ) : notFound ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
              <ShieldQuestion aria-hidden="true" className="size-8 text-muted-foreground" />
              <p className="font-semibold text-foreground">{t('notFoundTitle')}</p>
              <p className="max-w-prose text-sm text-muted-foreground">{t('notFoundBody')}</p>
            </CardContent>
          </Card>
        ) : error || !data ? (
          <ErrorState onRetry={refetch} />
        ) : (
          <Card className="border-2 border-gold">
            <CardHeader className="items-center gap-2 text-center">
              {/*
                The one thing the visitor came to find out, stated first.

                Success green rather than gold: "valid" is a status signal, and
                D-025 added the functional colours precisely because brand gold
                cannot carry one at AA (3.42:1 on white). The gold border still
                says "credential"; the tick says "genuine".
              */}
              <BadgeCheck aria-hidden="true" className="size-9 text-success" />
              <p className="text-lg font-semibold text-foreground">{t('validTitle')}</p>
              <p className="text-sm text-muted-foreground">{t('validBody')}</p>
            </CardHeader>

            <CardContent>
              <dl className="divide-y divide-border">
                <Row label={t('holder')} value={data.holderName} />
                <Row
                  label={data.type === 'PATH' ? t('subjectPath') : t('subjectCourse')}
                  value={data.subjectTitle}
                />
                {/* Through format.ts, like every other date in the product (D-018). */}
                <Row label={t('issuedAt')} value={format.date(new Date(data.issuedAt))} />
              </dl>

              <p className="mt-6 text-center text-xs text-muted-foreground">{t('issuer')}</p>
              <p className="mt-1 text-center text-xs text-muted-foreground">{t('privacyNote')}</p>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="font-medium text-foreground sm:text-end">{value}</dd>
    </div>
  );
}

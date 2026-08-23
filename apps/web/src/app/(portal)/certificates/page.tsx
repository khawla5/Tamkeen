'use client';

import { Award, Download, Eye, Medal } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';

import type { CertificateSummary } from '@tamkeen/types';

import { PortalPage } from '@/components/layout/portal-page';
import { usePortal } from '@/components/layout/portal-provider';
import { DataView } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useFormat } from '@/i18n/format-provider';
import { certificatesApi, notificationsApi } from '@/lib/api-client';
import { useApiQuery } from '@/lib/use-api';
import { cn } from '@/lib/utils';

/**
 * Certificates (§4.10).
 *
 * A flat gallery — no grouping, no filters, no search. §4.10 asks for title,
 * date earned, view and download, and says "nothing else"; a page with three
 * certificates on it does not need tools for finding them.
 *
 * The path certificate is the larger award and is styled as one, matching the
 * gold frame it carries on paper so the two are recognisable as the same thing
 * on screen and in hand.
 */
export default function CertificatesPage() {
  const t = useTranslations('certificates');
  const certificates = useApiQuery(() => certificatesApi.list(), []);
  const { unreadCertificates, refreshNotifications } = usePortal();

  /*
   * Arriving here *is* the acknowledgement (§2).
   *
   * The indicator points at exactly one destination, so a separate "mark as
   * read" control would be a second thing to do about a dot. Guarded on there
   * being something unread so a learner browsing their gallery does not send a
   * write on every visit, and the ref stops React's development double-mount
   * firing it twice.
   */
  const cleared = useRef(false);

  useEffect(() => {
    if (unreadCertificates === 0 || cleared.current) {
      return;
    }
    cleared.current = true;

    void notificationsApi
      .markCertificatesRead()
      .then(refreshNotifications)
      /* A failed clear leaves the dot up, which is the harmless direction: the
         learner sees it again next time rather than losing the news. */
      .catch(() => undefined);
  }, [unreadCertificates, refreshNotifications]);

  return (
    <PortalPage title={t('title')}>
      <DataView
        isLoading={certificates.isLoading}
        error={certificates.error}
        onRetry={certificates.refetch}
        isEmpty={certificates.data?.length === 0}
        emptyProps={{ title: t('emptyTitle'), body: t('emptyBody') }}
      >
        <ul className="grid gap-4 sm:grid-cols-2">
          {certificates.data?.map((certificate) => (
            <li key={certificate.id}>
              <CertificateCard certificate={certificate} />
            </li>
          ))}
        </ul>
      </DataView>
    </PortalPage>
  );
}

function CertificateCard({ certificate }: { certificate: CertificateSummary }) {
  const t = useTranslations('certificates');
  const format = useFormat();

  const isPath = certificate.type === 'PATH';
  const Icon = isPath ? Medal : Award;

  return (
    <Card className={cn('h-full', isPath ? 'border-2 border-primary-600' : 'border-border')}>
      <CardContent className="flex h-full flex-col gap-3 pt-6">
        <div className="flex items-start gap-3">
          <Icon
            aria-hidden="true"
            className={cn(
              'mt-0.5 size-6 shrink-0',
              isPath ? 'text-primary-700' : 'text-muted-foreground',
            )}
          />
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">
              {isPath ? t('typePath') : t('typeCourse')}
            </p>
            <h2 className="font-semibold text-foreground">{certificate.subjectTitle}</h2>
          </div>
        </div>

        {/* Through format.ts, like every date in the product (D-018). */}
        <p className="text-sm text-muted-foreground">
          {t('issuedOn', { date: format.date(new Date(certificate.issuedAt)) })}
        </p>

        {/*
          Two actions, because §4.10 names both — and they are genuinely
          different: view opens the browser's PDF reader, download saves the
          file. Plain links rather than fetch-and-blob: the browser does both
          better than we would, and the session cookie rides along as it does
          on any navigation.

          `rel="noopener"` on the new tab, and an accessible name that carries
          the certificate's title so a screen reader hears "view <title>"
          rather than a page full of identical "view" buttons.
        */}
        <div className="mt-auto flex gap-2 pt-2">
          <Button asChild variant="outline" size="sm">
            <a
              href={certificatesApi.fileUrl(certificate.id, 'inline')}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t('viewLabel', { title: certificate.subjectTitle })}
            >
              <Eye aria-hidden="true" className="size-4" />
              {t('view')}
            </a>
          </Button>

          <Button asChild variant="outline" size="sm">
            <a
              href={certificatesApi.fileUrl(certificate.id, 'attachment')}
              aria-label={t('downloadLabel', { title: certificate.subjectTitle })}
            >
              <Download aria-hidden="true" className="size-4" />
              {t('download')}
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

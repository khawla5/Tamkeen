import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { CertificateVerification } from './certificate-verification';

/**
 * The public certificate check (§2, D-016) — the one page in the product that
 * works without a session.
 *
 * A **server component wrapper around a client component**, for one reason:
 * `robots: noindex` has to be a real metadata export, and a page that fetches on
 * the client cannot export one. The page carries a ministry employee's name and
 * a credential, and a third party scanning a QR code must not be the reason it
 * lands in a search index — permanently, and outside anyone's control.
 *
 * The API sends `X-Robots-Tag` on the same reasoning, since the JSON is
 * fetchable on its own.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('verify');

  return {
    title: t('title'),
    robots: { index: false, follow: false, nocache: true },
  };
}

export default async function VerifyCertificatePage({
  params,
}: {
  params: Promise<{ verificationId: string }>;
}) {
  const { verificationId } = await params;

  return <CertificateVerification verificationId={verificationId} />;
}

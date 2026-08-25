'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { EntityPage } from '@/components/layout/entity-page';
import { ErrorState } from '@/components/states';
import { Card } from '@/components/ui/card';

/**
 * The guide's shell (TAM-134): the entity frame, a table of contents built
 * from the guide's own `##` headings, and the article. Not a nav destination —
 * §4B keeps the entity nav to four — it is reached from the create card, the
 * Content page, and the publish blockers whose fix is in Moodle.
 */
export function GuideView({
  html,
  sections,
  missing,
}: {
  html: string;
  sections: Array<{ id: string; text: string }>;
  missing: boolean;
}) {
  const t = useTranslations('entity');

  return (
    <EntityPage title={t('guideTitle')}>
      {missing ? (
        <ErrorState title={t('guideMissingTitle')} body={t('guideMissingBody')} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
          <Card className="h-fit p-4 lg:sticky lg:top-6">
            <nav aria-label={t('guideContents')}>
              <p className="text-sm font-semibold text-foreground">{t('guideContents')}</p>
              <ol className="mt-2 space-y-1 text-sm">
                {sections.map((section) => (
                  <li key={section.id}>
                    <Link href={`#${section.id}`} className="text-primary-700 hover:underline">
                      {section.text}
                    </Link>
                  </li>
                ))}
              </ol>
            </nav>
          </Card>

          <Card className="p-6">
            <article
              className="guide-article max-w-prose space-y-4 text-foreground [&_h1]:text-2xl [&_h1]:font-semibold [&_h2]:mt-8 [&_h2]:scroll-mt-6 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mt-4 [&_h3]:text-base [&_h3]:font-semibold [&_ol]:list-decimal [&_ol]:ps-6 [&_ul]:list-disc [&_ul]:ps-6 [&_li]:mt-1 [&_p]:leading-7 [&_code]:rounded-sm [&_code]:bg-neutral-100 [&_code]:px-1 [&_a]:text-primary-700 [&_a]:underline"
              /* Only tags the converter itself writes; the source is escaped. */
              dangerouslySetInnerHTML={{ __html: html }}
            />
          </Card>
        </div>
      )}
    </EntityPage>
  );
}

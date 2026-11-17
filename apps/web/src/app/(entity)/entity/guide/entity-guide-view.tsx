'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';

import { EntityPage } from '@/components/layout/entity-page';
import { Card, CardContent } from '@/components/ui/card';

/**
 * The rendering half of `/entity/guide` — split from `page.tsx` so the
 * Markdown read and parse stay server-side (they touch the filesystem, which
 * a client component cannot do) while `EntityPage`'s chrome, which needs the
 * entity portal's client-side session context, stays here.
 */
export function EntityGuideView({ content }: { content: ReactNode }) {
  const t = useTranslations('entity');

  return (
    <EntityPage title={t('guideTitle')}>
      <Card>
        <CardContent className="flex flex-col gap-4 p-6">{content}</CardContent>
      </Card>
    </EntityPage>
  );
}

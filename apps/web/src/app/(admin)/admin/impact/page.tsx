'use client';

import { useTranslations } from 'next-intl';

import { ImpactDashboard } from '@/components/admin/impact-dashboard';
import { ImpactTab } from '@/components/admin/impact-tab';
import { AdminPage } from '@/components/layout/admin-page';

/**
 * §4C.8's «الأثر» — the programme at a glance, then participation and learning
 * by period and department.
 *
 * Its own destination rather than a tab of the audit page: it is the question
 * the ministry arrives with (TAM-149), while the trail is evidence consulted when
 * something needs explaining. It opens like the dashboard does — the Kingdom,
 * four totals, the programmes people joined most — and the detailed analysis
 * (TAM-149, unchanged) follows under its own heading, with its own filters.
 */
export default function AdminImpactPage() {
  const t = useTranslations('admin');

  return (
    <AdminPage title={t('impactTitle')}>
      <div className="space-y-10">
        <ImpactDashboard />

        <section aria-labelledby="impact-detail" className="space-y-6">
          <h2 id="impact-detail" className="text-xl font-semibold text-foreground">
            {t('impactDetailTitle')}
          </h2>
          <ImpactTab />
        </section>
      </div>
    </AdminPage>
  );
}

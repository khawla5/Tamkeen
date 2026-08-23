'use client';

import { useTranslations } from 'next-intl';

import { EntityPage } from '@/components/layout/entity-page';
import { useEntity } from '@/components/layout/entity-provider';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/states';

/**
 * §4B.6 — the organisation's own record. Minimal, and read-only.
 *
 * This is procurement information the ministry already holds about a supplier —
 * an organisation name and a departmental contact — not new personal data
 * collected from an individual. There is no per-user profile here because the
 * account belongs to the organisation rather than the reverse (D-063).
 *
 * **Read-only on purpose.** Who a ministry supplier is, and who speaks for them,
 * is a contractual fact rather than a self-service setting; §4C.2 gives the
 * super-admin that edit in Phase 5. Offering the field here would let one
 * account change what the ministry believes about its own supplier.
 */
export default function EntityProfilePage() {
  const t = useTranslations('entity');
  const { entity } = useEntity();

  return (
    <EntityPage title={t('profileTitle')}>
      {entity === null ? (
        /* A super-admin reaching this page: they legitimately have no
           organisation, which is a normal state to render rather than an error
           to report. */
        <EmptyState title={t('profileEmpty')} />
      ) : (
        <Card className="max-w-xl p-6">
          <dl className="space-y-4">
            <Row label={t('profileName')} value={entity.name} />
            <Row label={t('profileContactName')} value={entity.contactName || '—'} />
            <Row label={t('profileContactEmail')} value={entity.contactEmail || '—'} />
          </dl>

          <p className="mt-6 text-sm text-muted-foreground">{t('profileReadOnly')}</p>
        </Card>
      )}
    </EntityPage>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      {/* `dir="auto"` because a contact address is Latin while the organisation
          name is Arabic, and both sit in the same RTL column. */}
      <dd dir="auto" className="mt-1 font-medium text-foreground">
        {value}
      </dd>
    </div>
  );
}

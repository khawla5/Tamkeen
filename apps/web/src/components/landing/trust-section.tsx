import { KeyRound, Languages, ShieldCheck, Accessibility, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';

const TRUST_ITEMS: Array<{ key: string; icon: LucideIcon }> = [
  { key: 'trust1', icon: Languages },
  { key: 'trust2', icon: Accessibility },
  { key: 'trust3', icon: ShieldCheck },
  { key: 'trust4', icon: KeyRound },
];

/**
 * Grounded in what CLAUDE.md §2 and §2B actually lock in — RTL/Arabic as
 * architecture, WCAG 2.1 AA, unique-ID+QR certificate verification, and the
 * security baseline (hashed passwords, sessions, audit log) — not aspirational
 * marketing claims.
 */
export function TrustSection() {
  const t = useTranslations('landing');

  return (
    <section className="py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <Badge>{t('trustEyebrow')}</Badge>
          <h2 className="mt-4 text-3xl font-bold text-navy">{t('trustTitle')}</h2>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {TRUST_ITEMS.map(({ key, icon: Icon }) => (
            <Card key={key}>
              <CardContent className="pt-6">
                <Icon aria-hidden="true" className="size-6 text-navy-soft" />
                <h3 className="mt-4 font-semibold text-navy">{t(`${key}Title`)}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {t(`${key}Body`)}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

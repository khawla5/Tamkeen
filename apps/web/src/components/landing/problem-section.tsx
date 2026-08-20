import { Compass, FileQuestion, ListChecks, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';

const PROBLEMS: Array<{ key: string; icon: LucideIcon }> = [
  { key: 'problem1', icon: Compass },
  { key: 'problem2', icon: ListChecks },
  { key: 'problem3', icon: FileQuestion },
];

/** §1.1 of the PRD, in three cards: no clear path, no commitment, no proof. */
export function ProblemSection() {
  const t = useTranslations('landing');

  return (
    <section className="py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <Badge>{t('problemEyebrow')}</Badge>
          <h2 className="mt-4 text-3xl font-bold text-navy">{t('problemTitle')}</h2>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-3">
          {PROBLEMS.map(({ key, icon: Icon }) => (
            <Card key={key}>
              <CardContent className="pt-6">
                <div className="flex size-11 items-center justify-center rounded-xl bg-cream ring-1 ring-border">
                  <Icon aria-hidden="true" className="size-5 text-navy-soft" />
                </div>
                <h3 className="mt-4 font-semibold text-navy">{t(`${key}Title`)}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {t(`${key}Body`)}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        <p className="mx-auto mt-10 max-w-2xl text-center text-base leading-relaxed text-foreground">
          {t('solutionBody', { min: 5, max: 10 })}
        </p>
      </div>
    </section>
  );
}

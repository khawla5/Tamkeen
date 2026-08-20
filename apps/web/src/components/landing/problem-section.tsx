import { Briefcase, Building2, ChevronLeft, GraduationCap, Award } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { LucideIcon } from 'lucide-react';

import { GapPanel } from '@/components/landing/gap-panel';
import { Card, CardContent } from '@/components/ui/card';

/**
 * The gap, stated once per audience: students, graduates, faculty advisors and
 * employers, three points each — then answered on navy by `GapPanel` inside the
 * same section, which is what makes it an argument rather than a list of
 * complaints.
 */
const AUDIENCES: Array<{ key: string; icon: LucideIcon }> = [
  { key: 'problem1', icon: GraduationCap },
  { key: 'problem2', icon: Briefcase },
  { key: 'problem3', icon: Award },
  { key: 'problem4', icon: Building2 },
];

const POINTS = ['Point1', 'Point2', 'Point3'] as const;

export function ProblemSection() {
  const t = useTranslations('landing');

  return (
    <section id="challenges" tabIndex={-1} className="scroll-mt-20 py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-3xl text-center">
          {/* gold-deep, the one gold that carries text this small, and only on
              a white-ish ground (globals.css / D-042). Tracked uppercase is
              applied under `ltr:` only: Arabic is cursive and has no uppercase,
              so both would damage it. */}
          <p className="text-xs font-bold text-gold-deep ltr:uppercase ltr:tracking-[0.2em]">
            {t('problemEyebrow')}
          </p>

          <h2 className="mt-4 text-3xl font-bold leading-snug text-navy sm:text-4xl">
            {t('problemTitle')}
          </h2>

          {/* Gold as a rule: a border role, where the 3:1 threshold applies. */}
          <span aria-hidden="true" className="mx-auto mt-6 block h-px w-16 bg-gold" />

          <p className="mt-6 leading-relaxed text-muted-foreground">{t('problemBody')}</p>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-2">
          {AUDIENCES.map(({ key, icon: Icon }) => (
            <Card key={key}>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-cream ring-1 ring-border">
                    <Icon aria-hidden="true" className="size-5 text-navy-soft" />
                  </div>
                  <h3 className="font-semibold text-navy">{t(`${key}Title`)}</h3>
                </div>

                <ul className="mt-5 flex flex-col gap-3">
                  {POINTS.map((point) => (
                    <li key={point} className="flex items-start gap-2 border-t border-border pt-3">
                      {/*
                        `ChevronLeft` points at the end of the line, which is
                        left in Arabic and right in English — hence the rotation
                        under `ltr:` rather than a second icon. Decorative: the
                        list marker is presentational, the text carries meaning.
                      */}
                      <ChevronLeft
                        aria-hidden="true"
                        className="mt-1 size-4 shrink-0 text-muted-foreground ltr:rotate-180"
                      />
                      <span className="text-sm leading-relaxed text-muted-foreground">
                        {t(`${key}${point}`)}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="mt-8">
          <GapPanel />
        </div>
      </div>
    </section>
  );
}

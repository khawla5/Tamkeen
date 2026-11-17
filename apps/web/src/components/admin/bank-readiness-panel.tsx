'use client';

import { useTranslations } from 'next-intl';

import type { AdminAssessmentReadiness, LevelRef } from '@tamkeen/types';

import { Card } from '@/components/ui/card';
import { useFormat } from '@/i18n/format-provider';

/**
 * Why a draft can or cannot be published (§4C.3, D-071, D-134).
 *
 * **Blockers and warnings are rendered as different things, because they are.**
 * A blocker is a refusal the server will repeat; a warning is a judgement the
 * administrator is allowed to make. Styling them alike would teach that both can
 * be clicked past, which is exactly wrong for the one that decides where every
 * learner this version places will start.
 *
 * The panel prints **the highest attainable total**, because it is the number
 * the band table has to cover and the one an administrator cannot work out by
 * looking. A rung with no item aimed at it is named rather than counted, for the
 * same reason: "المستوى المتقدم" tells them what to write next, "١ ناقص" does
 * not.
 */
export function BankReadinessPanel({
  readiness,
  levels,
}: {
  readiness: AdminAssessmentReadiness;
  levels: LevelRef[];
}) {
  const t = useTranslations('admin');
  const format = useFormat();

  const nameOf = (levelId: string) => levels.find((level) => level.id === levelId)?.name ?? levelId;

  const clean = readiness.blockers.length === 0 && readiness.warnings.length === 0;

  if (clean) {
    return (
      <Card edge="success" className="p-5">
        <p className="text-sm font-medium text-foreground">{t('bankReady')}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('bankReadyHint', { maxScore: format.number(readiness.maxScore) })}
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {readiness.blockers.length > 0 ? (
        <Card edge="danger" className="p-5" role="alert">
          <h3 className="text-sm font-semibold text-foreground">{t('bankBlockedTitle')}</h3>
          <ul className="mt-2 list-disc space-y-1 pe-5 text-sm text-foreground">
            {readiness.blockers.map((code) => (
              <li key={code}>{t(`bankBlocker.${code}`)}</li>
            ))}
          </ul>

          <p className="mt-4 text-sm text-muted-foreground">
            {t('bankMaxScore', { maxScore: format.number(readiness.maxScore) })}
          </p>
        </Card>
      ) : null}

      {readiness.warnings.length > 0 ? (
        <Card edge="warning" className="p-5">
          <h3 className="text-sm font-semibold text-foreground">{t('bankWarningTitle')}</h3>
          <ul className="mt-2 list-disc space-y-1 pe-5 text-sm text-foreground">
            {readiness.warnings.map((code) => (
              <li key={code}>{t(`bankWarning.${code}`)}</li>
            ))}
          </ul>

          {readiness.levelsWithoutQuestion.length > 0 ? (
            <p className="mt-2 text-sm text-foreground">
              {readiness.levelsWithoutQuestion.map(nameOf).join('، ')}
            </p>
          ) : null}

          {/* Said plainly, so nobody has to try the button to find out. */}
          <p className="mt-2 text-sm text-muted-foreground">{t('bankWarningHint')}</p>
        </Card>
      ) : null}
    </div>
  );
}

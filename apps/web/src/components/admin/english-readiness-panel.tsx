'use client';

import { useTranslations } from 'next-intl';

import type { AdminEnglishReadiness } from '@tamkeen/types';

import { Card } from '@/components/ui/card';
import { useFormat } from '@/i18n/format-provider';

/**
 * Why an English draft can or cannot be published (§4C.9).
 *
 * A sibling of `BankReadinessPanel`, built on the same two-severity rule —
 * blockers and warnings are rendered as different things, because a blocker is a
 * refusal the server will repeat and a warning is a judgement the administrator
 * is allowed to make. Styling them alike teaches that both can be clicked past.
 *
 * **What it prints instead of the attainable-per-dimension table is the
 * attainable total.** Holland's panel names an imbalance and shows what each
 * dimension can reach; there is no imbalance here (D-125). The number that
 * matters for English is the one the band table has to cover — it changes every
 * time a question is added or its marks are edited, so it is the thing an
 * administrator will most often have out of step, and it is shown whether or not
 * anything is currently wrong.
 */
export function EnglishReadinessPanel({ readiness }: { readiness: AdminEnglishReadiness }) {
  const t = useTranslations('admin');
  const tLevel = useTranslations('english.level');
  const format = useFormat();

  const clean = readiness.blockers.length === 0 && readiness.warnings.length === 0;

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {t('englishMaxScore', { score: format.number(readiness.maxScore) })}
      </p>

      {clean ? (
        <Card edge="success" className="p-5">
          <p className="text-sm font-medium text-foreground">{t('englishReady')}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t('englishReadyHint')}</p>
        </Card>
      ) : null}

      {readiness.blockers.length > 0 ? (
        <Card edge="danger" className="p-5" role="alert">
          <h3 className="text-sm font-semibold text-foreground">{t('englishBlockedTitle')}</h3>
          {/* Named individually rather than counted: "three problems" sends
              somebody hunting; naming them says what to do. */}
          <ul className="mt-2 list-disc space-y-1 pe-5 text-sm text-foreground">
            {readiness.blockers.map((code) => (
              <li key={code}>{t(`englishBlocker.${code}`)}</li>
            ))}
          </ul>
        </Card>
      ) : null}

      {readiness.warnings.length > 0 ? (
        <Card edge="warning" className="p-5">
          <h3 className="text-sm font-semibold text-foreground">{t('englishWarningTitle')}</h3>
          <ul className="mt-2 list-disc space-y-1 pe-5 text-sm text-foreground">
            {readiness.warnings.map((code) => (
              <li key={code}>{t(`englishWarning.${code}`)}</li>
            ))}
          </ul>
          {readiness.levelsWithoutQuestion.length > 0 ? (
            /* Which levels, not just that some are missing — the same reasoning
               that makes Holland's panel print the attainable maxima. */
            <p className="mt-2 text-sm text-foreground">
              {t('englishLevelsMissing', {
                levels: readiness.levelsWithoutQuestion
                  .map((level) => `${level} (${tLevel(level)})`)
                  .join('، '),
              })}
            </p>
          ) : null}
          <p className="mt-2 text-sm text-muted-foreground">{t('englishWarningHint')}</p>
        </Card>
      ) : null}
    </div>
  );
}

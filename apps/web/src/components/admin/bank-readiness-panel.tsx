'use client';

import { useTranslations } from 'next-intl';

import { RIASEC_LETTERS, type AdminBankReadiness } from '@tamkeen/types';

import { Card } from '@/components/ui/card';
import { useFormat } from '@/i18n/format-provider';

/**
 * Why a draft can or cannot be published (§4C.3, D-071).
 *
 * **Blockers and warnings are rendered as different things, because they are.**
 * A blocker is a refusal the server will repeat; a warning is a judgement the
 * administrator is allowed to make. Styling them alike would teach that both can
 * be clicked past, which is exactly wrong for the one that skews every Holland
 * Code the version will ever produce.
 *
 * When the bank is unbalanced the panel prints **what each dimension can
 * attain**, rather than only saying that something is wrong. "الاجتماعي ٢٤ /
 * الواقعي ٢٠" tells an administrator which dimension to even up; "غير متوازن"
 * sends them to count questions by hand.
 */
export function BankReadinessPanel({ readiness }: { readiness: AdminBankReadiness }) {
  const t = useTranslations('admin');
  const format = useFormat();

  const clean = readiness.blockers.length === 0 && readiness.warnings.length === 0;

  if (clean) {
    return (
      <Card edge="success" className="p-5">
        <p className="text-sm font-medium text-foreground">{t('bankReady')}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t('bankReadyHint')}</p>
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

          {!readiness.balanced ? (
            <>
              <p className="mt-4 text-sm text-muted-foreground">{t('attainableHeading')}</p>
              <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm">
                {RIASEC_LETTERS.map((letter) => (
                  <div key={letter} className="flex gap-2">
                    <dt className="text-muted-foreground">{t(`riasec.${letter}`)}</dt>
                    <dd className="font-medium text-foreground">
                      {format.number(readiness.attainable[letter])}
                    </dd>
                  </div>
                ))}
              </dl>
            </>
          ) : null}
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
          {/* Said plainly, so nobody has to try the button to find out. */}
          <p className="mt-2 text-sm text-muted-foreground">{t('bankWarningHint')}</p>
        </Card>
      ) : null}
    </div>
  );
}

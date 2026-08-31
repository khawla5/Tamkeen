'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { CEFR_LEVELS, type AdminEnglishDraft, type CefrBand } from '@tamkeen/types';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useFormat } from '@/i18n/format-provider';

/**
 * §4C.9's configurable scoring rule: the score range that maps to each CEFR
 * band (D-125).
 *
 * **The administrator edits five numbers, not twelve.** A partition of
 * `0 … maxScore` is completely determined by its five internal boundaries — A1
 * starts at 0, each band starts one above the previous one's ceiling, and C2
 * ends at the attainable total. Offering twelve independent fields would let
 * somebody type a gap or an overlap and then be refused for it; deriving the
 * lower bounds makes both **unreachable through this screen**, while the server
 * still validates, because rows can arrive another way.
 *
 * That is the same shape as the option editor's radio semantics: make the
 * invalid state unreachable in the UI, keep the guard in the gate.
 *
 * The ceilings are still *shown* for every band, so what is being edited reads
 * as the table it is rather than as five disconnected numbers.
 */
export function EnglishBandEditor({
  draft,
  busy,
  onSave,
}: {
  draft: AdminEnglishDraft;
  busy: boolean;
  onSave: (bands: CefrBand[]) => void;
}) {
  const t = useTranslations('admin');
  const tLevel = useTranslations('english.level');
  const format = useFormat();

  const maxScore = draft.readiness.maxScore;

  /* The five editable ceilings, A1 through C1. Held as strings so a half-typed
     value is not coerced to 0 on every keystroke — the field must be allowed to
     be empty while somebody replaces a number. */
  const [ceilings, setCeilings] = useState<string[]>(() => initialCeilings(draft.bands, maxScore));

  /* Re-seed when the draft's own bands change under us — after a save, or after
     adding a question moved `maxScore`. Keyed on the values rather than the
     object, so an unrelated re-render does not discard what is being typed. */
  const signature = `${maxScore}:${draft.bands.map((b) => `${b.level}-${b.minScore}-${b.maxScore}`).join('|')}`;
  const [seenSignature, setSeenSignature] = useState(signature);
  useEffect(() => {
    if (signature !== seenSignature) {
      setSeenSignature(signature);
      setCeilings(initialCeilings(draft.bands, maxScore));
    }
  }, [signature, seenSignature, draft.bands, maxScore]);

  const bands = deriveBands(ceilings, maxScore);
  /* Ascending and inside the range: the only two things the derived table can
     still get wrong, and both are the administrator's typing rather than the
     structure. Reported here so the save button explains itself. */
  const ordered = bands.every(
    (band, index) => band.maxScore >= band.minScore && (index === 0 || band.minScore > 0),
  );
  const withinRange = ceilings.every((value) => {
    const parsed = Number(value);
    return value.trim() !== '' && Number.isInteger(parsed) && parsed >= 0 && parsed < maxScore;
  });
  const valid = ordered && withinRange && maxScore > 0;

  function distributeEvenly() {
    /* A starting point, not a policy. Growing a bank from twenty items to thirty
       makes every boundary stale at once, and retyping five numbers to get back
       to "roughly even" is work the screen can do — the administrator then moves
       the ones they actually have an opinion about. */
    const step = (maxScore + 1) / CEFR_LEVELS.length;
    setCeilings(
      Array.from({ length: CEFR_LEVELS.length - 1 }, (_unused, index) =>
        String(Math.max(index, Math.round(step * (index + 1)) - 1)),
      ),
    );
  }

  return (
    <Card className="space-y-4 p-5">
      <div>
        <h3 className="text-sm font-semibold text-foreground">{t('englishBandsHeading')}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{t('englishBandsHint')}</p>
      </div>

      <ul className="space-y-3">
        {bands.map((band, index) => {
          const isLast = index === CEFR_LEVELS.length - 1;

          return (
            <li key={band.level} className="flex flex-wrap items-end gap-3">
              <span className="min-w-32 pb-2 text-sm font-medium text-foreground">
                <span dir="ltr">{band.level}</span> · {tLevel(band.level)}
              </span>

              <span className="pb-2 text-sm text-muted-foreground">
                {t('englishBandFrom', { score: format.number(band.minScore) })}
              </span>

              {isLast ? (
                /* C2's ceiling is the attainable total by definition. Shown, not
                   editable — a field here would be a control whose only legal
                   value is already known. */
                <span className="pb-2 text-sm font-medium text-foreground">
                  {t('englishBandToFixed', { score: format.number(band.maxScore) })}
                </span>
              ) : (
                <div className="w-32">
                  <Field
                    id={`band-${band.level}`}
                    label={t('englishBandTo', { level: band.level })}
                  >
                    {(field) => (
                      <Input
                        {...field}
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={Math.max(0, maxScore - 1)}
                        value={ceilings[index] ?? ''}
                        onChange={(event) =>
                          setCeilings((current) =>
                            current.map((value, position) =>
                              position === index ? event.target.value : value,
                            ),
                          )
                        }
                      />
                    )}
                  </Field>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={() => onSave(bands)} disabled={busy || !valid}>
          {t('englishBandsSave')}
        </Button>
        <Button type="button" variant="outline" onClick={distributeEvenly} disabled={busy}>
          {t('englishBandsDistribute')}
        </Button>
        {!valid ? (
          <p role="status" className="text-sm text-muted-foreground">
            {maxScore > 0 ? t('englishBandsInvalid') : t('englishBandsNoQuestions')}
          </p>
        ) : null}
      </div>
    </Card>
  );
}

/** The five editable ceilings, from a stored table or evenly spread. */
function initialCeilings(bands: readonly CefrBand[], maxScore: number): string[] {
  const byLevel = new Map(bands.map((band) => [band.level, band]));

  return CEFR_LEVELS.slice(0, -1).map((level, index) => {
    const stored = byLevel.get(level);
    if (stored) return String(stored.maxScore);

    const step = (maxScore + 1) / CEFR_LEVELS.length;
    return String(Math.max(index, Math.round(step * (index + 1)) - 1));
  });
}

/**
 * The five ceilings back into a full table.
 *
 * A1 starts at 0; each band starts one above the previous ceiling; C2 ends at
 * the attainable total. Gaps and overlaps are not representable here, which is
 * the point.
 */
function deriveBands(ceilings: readonly string[], maxScore: number): CefrBand[] {
  let floor = 0;

  return CEFR_LEVELS.map((level, index) => {
    const isLast = index === CEFR_LEVELS.length - 1;
    const ceiling = isLast ? maxScore : Number(ceilings[index] ?? 0);
    const band: CefrBand = { level, minScore: floor, maxScore: ceiling };
    floor = ceiling + 1;
    return band;
  });
}

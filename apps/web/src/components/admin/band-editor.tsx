'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { checkBands, type LevelRef, type PlacementBand } from '@tamkeen/types';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useFormat } from '@/i18n/format-provider';

/**
 * The placement rule (§4C.3, D-134): which score lands on which rung.
 *
 * **The whole table at once, never one band.** A partition is a single object —
 * moving one boundary necessarily changes two rows — so a per-band save would
 * force the administrator through states that are invalid by construction and
 * make the editor reject its own intermediate steps.
 *
 * **The problems are checked here with the same function the server publishes
 * against** (`checkBands` in `@tamkeen/types`), which is what §2B means by
 * enforcing a rule on both sides: the panel cannot say "fine" about a table the
 * publish gate will refuse.
 *
 * A path with no authored table is not broken — placement falls back to an even
 * split, and the editor shows that split as the rule in force rather than as an
 * empty form. Saying «القاعدة الافتراضية» beside it is what stops an
 * administrator believing nobody can be placed yet.
 */
export function BandEditor({
  levels,
  bands,
  maxScore,
  isDefault,
  busy,
  onSave,
}: {
  levels: LevelRef[];
  bands: PlacementBand[];
  maxScore: number;
  isDefault: boolean;
  busy: boolean;
  onSave: (bands: PlacementBand[]) => void;
}) {
  const t = useTranslations('admin');
  const format = useFormat();

  /* Strings, not numbers: a half-typed "1" must not become a band of one while
     the administrator is still typing the second digit. */
  const [draft, setDraft] = useState<Record<string, { min: string; max: string }>>(() =>
    Object.fromEntries(
      levels.map((level) => {
        const band = bands.find((row) => row.levelId === level.id);
        return [level.id, { min: String(band?.minScore ?? ''), max: String(band?.maxScore ?? '') }];
      }),
    ),
  );

  const parsed: PlacementBand[] = levels.flatMap((level) => {
    const row = draft[level.id];
    if (!row || row.min === '' || row.max === '') return [];

    return [{ levelId: level.id, minScore: Number(row.min), maxScore: Number(row.max) }];
  });

  const problems = levels.length === 0 ? [] : checkBands(parsed, levels, maxScore);

  return (
    <Card className="space-y-4 p-5">
      <div>
        <h3 className="text-sm font-semibold text-foreground">{t('bandsHeading')}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {isDefault
            ? t('bandsDefaultHint', { maxScore: format.number(maxScore) })
            : t('bandsHint', { maxScore: format.number(maxScore) })}
        </p>
      </div>

      {levels.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('bandsNoLevels')}</p>
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {levels.map((level) => (
              <li key={level.id} className="flex flex-wrap items-end gap-3">
                <span className="min-w-32 pb-2 text-sm font-medium text-foreground">
                  {level.name}
                </span>

                <Field id={`band-min-${level.id}`} label={t('bandMin')}>
                  {(field) => (
                    <Input
                      {...field}
                      type="number"
                      min={0}
                      dir="ltr"
                      className="w-24"
                      value={draft[level.id]?.min ?? ''}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          [level.id]: {
                            min: event.target.value,
                            max: current[level.id]?.max ?? '',
                          },
                        }))
                      }
                    />
                  )}
                </Field>

                <Field id={`band-max-${level.id}`} label={t('bandMax')}>
                  {(field) => (
                    <Input
                      {...field}
                      type="number"
                      min={0}
                      dir="ltr"
                      className="w-24"
                      value={draft[level.id]?.max ?? ''}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          [level.id]: {
                            min: current[level.id]?.min ?? '',
                            max: event.target.value,
                          },
                        }))
                      }
                    />
                  )}
                </Field>
              </li>
            ))}
          </ul>

          {problems.length > 0 && parsed.length > 0 ? (
            <p role="alert" className="text-sm text-destructive">
              {t(`bandProblem.${problems[0]!.kind}`)}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={busy || parsed.length === 0 || problems.length > 0}
              onClick={() => onSave(parsed)}
            >
              {t('bandsSave')}
            </Button>

            {/* Back to the even split. Clearing the table is a real choice, not
                a way of emptying a form: the fallback is the rule the product
                states, and returning to it should not mean typing it out. */}
            {!isDefault ? (
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => onSave([])}>
                {t('bandsReset')}
              </Button>
            ) : null}
          </div>
        </>
      )}
    </Card>
  );
}

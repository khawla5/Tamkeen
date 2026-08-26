'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import type { NumberFormat } from '@tamkeen/types';

import { useErrorMessage } from '@/components/auth/use-error-message';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { authApi } from '@/lib/api-client';

type Choice = NumberFormat | 'system';

const DIGIT_CHOICES: ReadonlyArray<{ value: Choice; label: string }> = [
  { value: 'system', label: 'digitsSystem' },
  { value: 'western', label: 'digitsWestern' },
  { value: 'arabic-indic', label: 'digitsArabic' },
];

/**
 * The digits preference (§4.12, D-018).
 *
 * "Follow the system" is a real third option rather than a null dressed up: it
 * means whatever §4C.6 has set applies, so somebody who never expressed a
 * preference is not silently pinned to whatever the default happened to be the
 * day they registered.
 */
export function DigitsCard({
  current,
  onChanged,
}: {
  current: NumberFormat | null;
  onChanged: () => void;
}) {
  const t = useTranslations('profile');
  const translateError = useErrorMessage();

  const [value, setValue] = useState<Choice>(current ?? 'system');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function save() {
    setError(null);
    setDone(false);
    setBusy(true);

    try {
      await authApi.setNumberFormat(value === 'system' ? null : value);
      onChanged();
      setDone(true);
    } catch (caught) {
      setError(translateError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('digitsHeading')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Field id="digits" label={t('digitsLabel')} hint={t('digitsHint')}>
          {(field) => (
            <select
              {...field}
              value={value}
              onChange={(event) => setValue(event.target.value as Choice)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {DIGIT_CHOICES.map((choice) => (
                <option key={choice.value} value={choice.value}>
                  {t(choice.label)}
                </option>
              ))}
            </select>
          )}
        </Field>

        {/* Save appears only when there is something to save (§3). */}
        {value !== (current ?? 'system') ? (
          <Button
            className="self-start"
            aria-label={t('digitsSaveAriaLabel')}
            disabled={busy}
            onClick={() => void save()}
          >
            {t('digitsSave')}
          </Button>
        ) : null}

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        {done && !error ? (
          <p role="status" className="text-sm text-success">
            {t('digitsSaved')}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

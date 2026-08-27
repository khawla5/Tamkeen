'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import type { AdminSetting, AdminSettingsView } from '@tamkeen/types';

import { useErrorMessage } from '@/components/auth/use-error-message';
import { AdminPage } from '@/components/layout/admin-page';
import { DataView } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { adminApi } from '@/lib/api-client';
import { useApiQuery } from '@/lib/use-api';

/**
 * §4C.6 — system settings.
 *
 * **Two sections, and the read-only one is not filler.** The editable knobs are
 * what the ministry must be able to change while the system is running — the
 * sync interval, the registration gate, the signature block. The fixed ones are
 * the 5-10 path bounds (D-074) and the auth rate limits, which §2 makes a
 * product rule and a security floor: an administrator asked to explain either
 * needs the number, and nobody needs a control that moves it.
 *
 * **The pass threshold is not here** — since the ministry's 2026-08-25 direction
 * it is deployment configuration read from the environment, with no endpoint
 * that can move it (D-102).
 *
 * **Each field's shape is the server's answer, not this file's guess** (TAM-135).
 * `setting.editor` is derived from the very Zod field that validates the value,
 * so a dropdown's options are exactly what a save would accept and a numeric
 * field is numeric because the schema says so. A hand-written option list here
 * would be a second source of truth for the allowed values.
 *
 * **What is on neither list is the point.** The Moodle token, the database URL
 * and the SMTP credentials are not settings and have no endpoint (D-072) — a
 * setting readable by the screen that edits it is one that appears in a network
 * response.
 *
 * Every row says whether it holds the ministry's value or the deployment's
 * default, because "reset to default" is only an honest offer if you can see
 * which one you are looking at.
 */
export default function AdminSettingsPage() {
  const t = useTranslations('admin');
  const settings = useApiQuery(() => adminApi.settings(), []);
  const [current, setCurrent] = useState<AdminSettingsView | null>(null);

  const shown = current ?? settings.data;

  return (
    <AdminPage title={t('settingsTitle')}>
      <DataView
        isLoading={settings.isInitialLoad}
        error={settings.error}
        onRetry={settings.refetch}
      >
        {shown ? (
          <div className="space-y-6">
            <section aria-labelledby="settings-editable" className="space-y-3">
              <h2 id="settings-editable" className="text-lg font-semibold text-foreground">
                {t('settingsEditable')}
              </h2>

              {shown.settings.map((setting) => (
                <SettingRow key={setting.key} setting={setting} onChanged={setCurrent} />
              ))}
            </section>

            <section aria-labelledby="settings-fixed" className="space-y-3">
              <h2 id="settings-fixed" className="text-lg font-semibold text-foreground">
                {t('settingsFixed')}
              </h2>
              <p className="text-sm text-muted-foreground">{t('settingsFixedHint')}</p>

              <Card className="divide-y divide-border">
                {shown.readOnly.map((row) => (
                  <div
                    key={row.key}
                    className="flex flex-wrap items-baseline justify-between gap-3 px-5 py-3"
                  >
                    <span className="text-sm text-foreground">{t(`setting.${row.key}`)}</span>
                    <span className="text-sm font-medium text-muted-foreground" dir="ltr">
                      {row.value}
                    </span>
                  </div>
                ))}
              </Card>
            </section>
          </div>
        ) : null}
      </DataView>
    </AdminPage>
  );
}

function SettingRow({
  setting,
  onChanged,
}: {
  setting: AdminSetting;
  onChanged: (next: AdminSettingsView) => void;
}) {
  const t = useTranslations('admin');
  const translateError = useErrorMessage();

  const [value, setValue] = useState(setting.value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const dirty = value !== setting.value;

  async function run(action: () => Promise<AdminSettingsView>) {
    setError(null);
    setDone(false);
    setBusy(true);

    try {
      const next = await action();
      onChanged(next);
      setValue(next.settings.find((row) => row.key === setting.key)?.value ?? value);
      setDone(true);
    } catch (caught) {
      setError(translateError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 font-medium text-foreground">
          {t(`setting.${setting.key}`)}
          {/* Which value this is: the ministry's, or the deployment's. Without
              it, "reset" is a button whose effect cannot be predicted. */}
          {setting.isOverridden ? (
            <Badge variant="primary">{t('settingOverridden')}</Badge>
          ) : (
            <Badge variant="soft">{t('settingDefault')}</Badge>
          )}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">{t(`settingHint.${setting.key}`)}</p>
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1">
          <Field id={`setting-${setting.key}`} label={t('settingValue')}>
            {(field) =>
              setting.editor === 'select' ? (
                <Select {...field} value={value} onChange={(event) => setValue(event.target.value)}>
                  {setting.options.map((option) => (
                    <option key={option} value={option}>
                      {t(`settingOption.${setting.key}.${option}`)}
                    </option>
                  ))}
                </Select>
              ) : (
                <Input
                  {...field}
                  dir="ltr"
                  /* A numeric knob takes digits and nothing else. `inputMode`
                     brings up the right keyboard; the strip is what actually
                     enforces it, because `type="number"` still accepts `e`,
                     `+` and `-` and then reports an empty value for them. */
                  {...(setting.editor === 'number'
                    ? { inputMode: 'numeric' as const, pattern: '[0-9]*' }
                    : {})}
                  value={value}
                  onChange={(event) =>
                    setValue(
                      setting.editor === 'number'
                        ? event.target.value.replace(/\D/g, '')
                        : event.target.value,
                    )
                  }
                />
              )
            }
          </Field>
        </div>

        {/* Save appears only when there is something to save (§3). */}
        {dirty ? (
          <Button
            disabled={busy}
            onClick={() => run(() => adminApi.updateSetting(setting.key, value))}
          >
            {t('settingSave')}
          </Button>
        ) : null}

        {setting.isOverridden ? (
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => run(() => adminApi.resetSetting(setting.key))}
          >
            {t('settingReset')}
          </Button>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {done && !error ? (
        <p role="status" className="mt-2 text-sm text-success">
          {t('settingSaved')}
        </p>
      ) : null}
    </Card>
  );
}

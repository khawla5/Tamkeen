import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AdminSetting, AdminSettingsView } from '@tamkeen/types';

import { renderWithProviders } from '@/test/render';

/**
 * §4C.6 — system settings.
 *
 * **The screen has to say which value you are looking at.** A knob showing "5"
 * could be the deployment's default or the ministry's decision, and "reset to
 * default" is only an honest offer if the difference is visible — otherwise it
 * is a button whose effect nobody can predict.
 *
 * **And it must not offer what it cannot do.** The auth rate limits are rendered
 * with no input at all, because §2 makes them a security floor rather than a
 * knob an operator may loosen. The 5-10 course bounds are gone entirely: nobody
 * builds a path any more (D-134).
 *
 * **Each field's shape comes from the server** (TAM-135): `editor` is derived
 * from the Zod field that validates the value, so these tests assert the screen
 * honours it rather than restating which key is which kind — restating it here
 * is precisely the second source of truth the design avoids.
 */

const api = vi.hoisted(() => ({
  settings: vi.fn(),
  updateSetting: vi.fn(),
  resetSetting: vi.fn(),
}));

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');

  return { ...actual, adminApi: api };
});

vi.mock('@/components/layout/admin-page', () => ({
  AdminPage: ({ title, children }: { title: string; children: ReactNode }) => (
    <div>
      <h1>{title}</h1>
      {children}
    </div>
  ),
}));

const { default: AdminSettingsPage } = await import('@/app/(admin)/admin/settings/page');

const text = (key: AdminSetting['key'], value: string, isOverridden = false): AdminSetting => ({
  key,
  value,
  isOverridden,
  editor: 'text',
  options: [],
});

function view(overrides: Partial<AdminSettingsView> = {}): AdminSettingsView {
  return {
    settings: [
      {
        key: 'COMPLETION_SYNC_INTERVAL_MINUTES',
        value: '5',
        isOverridden: true,
        editor: 'number',
        options: [],
      },
      {
        key: 'REGISTRATION_MODE',
        value: 'restricted',
        isOverridden: false,
        editor: 'select',
        options: ['restricted', 'admin-only'],
      },
      text('ALLOWED_EMAIL_DOMAINS', 'ministry.gov.example'),
    ],
    readOnly: [
      { key: 'API_RATE_LIMIT_MAX_REQUESTS', value: '120' },
      { key: 'API_RATE_LIMIT_WINDOW_SECONDS', value: '60' },
    ],
    ...overrides,
  };
}

describe('Admin settings (§4C.6)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.settings.mockResolvedValue(view());
  });

  it('shows the loading state before the settings arrive', () => {
    api.settings.mockReturnValue(new Promise(() => {}));
    renderWithProviders(<AdminSettingsPage />);

    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('offers a retry when the request fails', async () => {
    api.settings.mockRejectedValue(new Error('down'));
    renderWithProviders(<AdminSettingsPage />);

    expect(await screen.findByRole('button', { name: /إعادة/ })).toBeInTheDocument();
  });

  it('says whether a value is the ministry’s or the deployment’s default', async () => {
    renderWithProviders(<AdminSettingsPage />);

    expect(await screen.findByText('قيمة الوزارة')).toBeInTheDocument();
    expect(screen.getAllByText('القيمة الافتراضية')).toHaveLength(2);
  });

  it('offers reset only for a value somebody actually overrode', async () => {
    renderWithProviders(<AdminSettingsPage />);

    await screen.findByText('سياسة التسجيل');
    /* One overridden setting in the fixture, so exactly one reset. A reset on a
       default would do nothing and teach that the button is decorative. */
    expect(screen.getAllByRole('button', { name: 'إرجاع إلى الافتراضي' })).toHaveLength(1);
  });

  it('offers save only once a value has changed', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AdminSettingsPage />);

    const input = await screen.findByLabelText('القيمة', {
      selector: '#setting-ALLOWED_EMAIL_DOMAINS',
    });
    expect(screen.queryByRole('button', { name: 'حفظ' })).not.toBeInTheDocument();

    await user.clear(input);
    await user.type(input, 'moi.gov.sa');

    expect(await screen.findByRole('button', { name: 'حفظ' })).toBeInTheDocument();
  });

  it('renders an enum knob as a dropdown of exactly the values the server accepts', async () => {
    renderWithProviders(<AdminSettingsPage />);

    const select = (await screen.findByLabelText('القيمة', {
      selector: '#setting-REGISTRATION_MODE',
    })) as HTMLSelectElement;

    expect(select.tagName).toBe('SELECT');
    /* The Arabic option labels, not the raw `restricted` / `admin-only` the
       ministry previously had to know and type into a free-text box. */
    expect([...select.options].map((option) => [option.value, option.text])).toEqual([
      ['restricted', 'تسجيل ذاتي مقيّد'],
      ['admin-only', 'بإنشاء المسؤول فقط'],
    ]);
    expect(select.value).toBe('restricted');
  });

  it('saves the value the dropdown selects, not its label', async () => {
    const user = userEvent.setup();
    api.updateSetting.mockResolvedValue(view());
    renderWithProviders(<AdminSettingsPage />);

    const select = await screen.findByLabelText('القيمة', {
      selector: '#setting-REGISTRATION_MODE',
    });
    await user.selectOptions(select, 'admin-only');
    await user.click(screen.getByRole('button', { name: 'حفظ' }));

    expect(api.updateSetting).toHaveBeenCalledWith('REGISTRATION_MODE', 'admin-only');
  });

  it('takes digits and nothing else in a numeric knob', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AdminSettingsPage />);

    const input = (await screen.findByLabelText('القيمة', {
      selector: '#setting-COMPLETION_SYNC_INTERVAL_MINUTES',
    })) as HTMLInputElement;

    expect(input).toHaveAttribute('inputmode', 'numeric');

    await user.clear(input);
    await user.type(input, '1a5-b');

    /* Typed rather than set: the strip has to hold per keystroke, because
       `type="number"` would have accepted `e` and `-` and then reported the
       field empty rather than refusing the character. */
    expect(input.value).toBe('15');
  });

  it('names the certificate signature settings in words an administrator can read', async () => {
    api.settings.mockResolvedValue(
      view({
        settings: [
          text('CERT_SIGNATORY_NAME', ''),
          text('CERT_SIGNATORY_TITLE', ''),
          text('CERT_ISSUING_BODY', 'وزارة الداخلية'),
        ],
      }),
    );
    renderWithProviders(<AdminSettingsPage />);

    /* These three shipped as the raw `admin.setting.CERT_SIGNATORY_NAME` — the
       fallback made a missing translation look like a deliberate label. */
    expect(await screen.findByText('اسم الموقِّع على الشهادات')).toBeInTheDocument();
    expect(screen.getByText('صفة الموقِّع على الشهادات')).toBeInTheDocument();
    expect(screen.getByText('الجهة المصدرة للشهادات')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('admin.setting');
  });

  it('does not offer the pass threshold, which is no longer a setting', async () => {
    renderWithProviders(<AdminSettingsPage />);

    await screen.findByText('سياسة التسجيل');
    expect(screen.queryByText('درجة الاجتياز')).not.toBeInTheDocument();
  });

  it('says the Moodle token is not a setting, on the setting that names Moodle', async () => {
    api.settings.mockResolvedValue(view({ settings: [text('MOODLE_BASE_URL', 'http://x')] }));
    renderWithProviders(<AdminSettingsPage />);

    expect(await screen.findByText(/رمز التكامل ليس إعدادًا/)).toBeInTheDocument();
  });

  it('renders the fixed rules with no control at all', async () => {
    renderWithProviders(<AdminSettingsPage />);

    await screen.findByText('قواعد ثابتة');

    /* Three editable settings in the fixture, so three fields — and none for
       either rate limit, which §2 makes a security floor. */
    expect(screen.getAllByLabelText('القيمة')).toHaveLength(3);
  });

  it('shows the server’s refusal for an invalid value', async () => {
    const user = userEvent.setup();
    const { ApiError } = await import('@/lib/api-client');
    api.updateSetting.mockRejectedValue(new ApiError('SETTING_INVALID_ALLOWED_EMAIL_DOMAINS', 400));

    renderWithProviders(<AdminSettingsPage />);

    const input = await screen.findByLabelText('القيمة', {
      selector: '#setting-ALLOWED_EMAIL_DOMAINS',
    });
    await user.clear(input);
    await user.type(input, 'not-a-domain');
    await user.click(screen.getByRole('button', { name: 'حفظ' }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  });

  it('confirms a save', async () => {
    const user = userEvent.setup();
    api.updateSetting.mockResolvedValue(
      view({ settings: [text('ALLOWED_EMAIL_DOMAINS', 'moi.gov.sa', true)] }),
    );

    renderWithProviders(<AdminSettingsPage />);

    const input = await screen.findByLabelText('القيمة', {
      selector: '#setting-ALLOWED_EMAIL_DOMAINS',
    });
    await user.clear(input);
    await user.type(input, 'moi.gov.sa');
    await user.click(screen.getByRole('button', { name: 'حفظ' }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('حُفظ الإعداد.'));
  });
});

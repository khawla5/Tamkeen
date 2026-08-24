import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AdminSettingsView } from '@tamkeen/types';

import { renderWithProviders } from '@/test/render';

/**
 * §4C.6 — system settings.
 *
 * **The screen has to say which value you are looking at.** A knob showing "70"
 * could be the deployment's default or the ministry's decision, and "reset to
 * default" is only an honest offer if the difference is visible — otherwise it
 * is a button whose effect nobody can predict.
 *
 * **And it must not offer what it cannot do.** The 5-10 bounds and the rate
 * limits are rendered with no input at all, because §2 makes them a product rule
 * and a security floor rather than knobs (D-074).
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

function view(overrides: Partial<AdminSettingsView> = {}): AdminSettingsView {
  return {
    settings: [
      { key: 'PASS_THRESHOLD', value: '70', isOverridden: false },
      { key: 'COMPLETION_SYNC_INTERVAL_MINUTES', value: '5', isOverridden: true },
      { key: 'ALLOWED_EMAIL_DOMAINS', value: 'ministry.gov.example', isOverridden: false },
    ],
    readOnly: [
      { key: 'PATH_MIN_COURSES', value: '5' },
      { key: 'PATH_MAX_COURSES', value: '10' },
      { key: 'API_RATE_LIMIT_MAX_REQUESTS', value: '120' },
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

    await screen.findByText('درجة الاجتياز');
    /* One overridden setting in the fixture, so exactly one reset. A reset on a
       default would do nothing and teach that the button is decorative. */
    expect(screen.getAllByRole('button', { name: 'إرجاع إلى الافتراضي' })).toHaveLength(1);
  });

  it('offers save only once a value has changed', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AdminSettingsPage />);

    const input = await screen.findByLabelText('القيمة', { selector: '#setting-PASS_THRESHOLD' });
    expect(screen.queryByRole('button', { name: 'حفظ' })).not.toBeInTheDocument();

    await user.clear(input);
    await user.type(input, '85');

    expect(await screen.findByRole('button', { name: 'حفظ' })).toBeInTheDocument();
  });

  it('explains what the pass threshold does to results already recorded', async () => {
    renderWithProviders(<AdminSettingsPage />);

    /* D-042's guarantee, said where the change is made: an administrator raising
       the bar needs to know it does not re-judge anybody. */
    expect(
      await screen.findByText(/النتائج السابقة تبقى محسوبة بالدرجة التي كانت سارية/),
    ).toBeInTheDocument();
  });

  it('says the Moodle token is not a setting, on the setting that names Moodle', async () => {
    api.settings.mockResolvedValue(
      view({ settings: [{ key: 'MOODLE_BASE_URL', value: 'http://x', isOverridden: false }] }),
    );
    renderWithProviders(<AdminSettingsPage />);

    expect(await screen.findByText(/رمز التكامل ليس إعدادًا/)).toBeInTheDocument();
  });

  it('renders the fixed rules with no control at all', async () => {
    renderWithProviders(<AdminSettingsPage />);

    await screen.findByText('الحد الأدنى لعدد دورات المسار');

    /* Three editable settings in the fixture, so three inputs — and none for the
       bounds or the rate limit (D-074, §2). */
    expect(screen.getAllByLabelText('القيمة')).toHaveLength(3);
    expect(screen.getByText('قواعد ثابتة')).toBeInTheDocument();
  });

  it('shows the server’s refusal for an invalid value', async () => {
    const user = userEvent.setup();
    const { ApiError } = await import('@/lib/api-client');
    api.updateSetting.mockRejectedValue(new ApiError('SETTING_INVALID_PASS_THRESHOLD', 400));

    renderWithProviders(<AdminSettingsPage />);

    const input = await screen.findByLabelText('القيمة', { selector: '#setting-PASS_THRESHOLD' });
    await user.clear(input);
    await user.type(input, '150');
    await user.click(screen.getByRole('button', { name: 'حفظ' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/رقمًا بين 0 و100/));
  });

  it('confirms a save', async () => {
    const user = userEvent.setup();
    api.updateSetting.mockResolvedValue(
      view({
        settings: [
          { key: 'PASS_THRESHOLD', value: '85', isOverridden: true },
          { key: 'COMPLETION_SYNC_INTERVAL_MINUTES', value: '5', isOverridden: true },
          { key: 'ALLOWED_EMAIL_DOMAINS', value: 'ministry.gov.example', isOverridden: false },
        ],
      }),
    );

    renderWithProviders(<AdminSettingsPage />);

    const input = await screen.findByLabelText('القيمة', { selector: '#setting-PASS_THRESHOLD' });
    await user.clear(input);
    await user.type(input, '85');
    await user.click(screen.getByRole('button', { name: 'حفظ' }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('حُفظ الإعداد.'));
  });
});

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CurrentUser } from '@/lib/api-client';

import { renderWithProviders } from '@/test/render';

/**
 * §4.12, finished in Phase 5.
 *
 * **The current password is the whole security of the change form.** A session
 * cookie is enough to *be* the user, so a change form that trusts the session
 * alone hands the account to anyone who reaches an unlocked machine — and the
 * owner discovers it at their next sign-in. The test asserts the field is
 * required rather than merely present, because a field the form will submit
 * empty is decoration.
 *
 * **And the digits options must show their own glyphs.** The two sets name each
 * other in ordinary speech; a reader choosing between them is choosing between
 * shapes, so the shapes have to be on screen.
 */

const api = vi.hoisted(() => ({
  logout: vi.fn(),
  changePassword: vi.fn(),
  changeEmail: vi.fn(),
  setNumberFormat: vi.fn(),
}));

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');

  return { ...actual, authApi: api };
});

const portal = vi.hoisted(() => ({
  value: { user: {} as CurrentUser, refreshSession: vi.fn() },
}));

vi.mock('@/components/layout/portal-provider', () => ({
  usePortal: () => portal.value,
}));

vi.mock('@/components/layout/portal-page', () => ({
  PortalPage: ({ title, children }: { title: string; children: ReactNode }) => (
    <div>
      <h1>{title}</h1>
      {children}
    </div>
  ),
}));

const replace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
}));

const { default: ProfilePage } = await import('@/app/(portal)/profile/page');

function setUser(overrides: Partial<CurrentUser> = {}) {
  portal.value = {
    user: {
      id: 'user-1',
      email: 'sara@ministry.gov.example',
      fullName: 'سارة العتيبي',
      role: 'EMPLOYEE',
      numberFormat: null,
      ...overrides,
    },
    refreshSession: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  api.changePassword.mockResolvedValue(undefined);
  api.changeEmail.mockResolvedValue({ status: 'EMAIL_CHANGE_PENDING' });
  api.setNumberFormat.mockResolvedValue(undefined);
  api.logout.mockResolvedValue(undefined);
  setUser();
});

describe('profile — personal information', () => {
  it('shows the account as it stands', () => {
    renderWithProviders(<ProfilePage />);

    expect(screen.getByText('سارة العتيبي')).toBeInTheDocument();
    expect(screen.getByText('sara@ministry.gov.example')).toBeInTheDocument();
  });

  it('renders the address left-to-right so it stays the address', () => {
    renderWithProviders(<ProfilePage />);

    /* An email is Latin script inside an RTL document; without this the
       punctuation reorders and the text on screen is not what would be typed
       back in. */
    expect(screen.getByText('sara@ministry.gov.example')).toHaveAttribute('dir', 'ltr');
  });
});

describe('profile — changing a password', () => {
  async function fill(user: ReturnType<typeof userEvent.setup>, current: string, next: string) {
    if (current.length > 0) {
      await user.type(screen.getByLabelText(/كلمة المرور الحالية/), current);
    }
    await user.type(screen.getByLabelText(/كلمة المرور الجديدة/), next);
    await user.type(screen.getByLabelText(/تأكيد كلمة المرور/), next);
  }

  it('asks for the current password, and will not submit without it', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ProfilePage />);

    expect(screen.getByLabelText(/كلمة المرور الحالية/)).toBeRequired();

    await fill(user, '', 'a-new-long-password');

    /* Everything else is filled; only the current password is missing, and the
       form still refuses. */
    expect(screen.getByRole('button', { name: 'تغيير كلمة المرور' })).toBeDisabled();
  });

  it('refuses a confirmation that does not match, and says so', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ProfilePage />);

    await user.type(screen.getByLabelText(/كلمة المرور الحالية/), 'the-old-password');
    await user.type(screen.getByLabelText(/كلمة المرور الجديدة/), 'a-new-long-password');
    await user.type(screen.getByLabelText(/تأكيد كلمة المرور/), 'a-new-long-passwerd');

    expect(await screen.findByText('كلمتا المرور غير متطابقتين.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'تغيير كلمة المرور' })).toBeDisabled();
  });

  it('refuses a new password shorter than the minimum', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ProfilePage />);

    await fill(user, 'the-old-password', 'short');

    /* Refused on the client so the rule is visible where the typing happens;
       refused again on the server, which is the one that counts (§2B). */
    expect(screen.getByRole('button', { name: 'تغيير كلمة المرور' })).toBeDisabled();
  });

  it('sends both passwords and clears the form on success', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ProfilePage />);

    await fill(user, 'the-old-password', 'a-new-long-password');
    await user.click(screen.getByRole('button', { name: 'تغيير كلمة المرور' }));

    await waitFor(() =>
      expect(api.changePassword).toHaveBeenCalledWith('the-old-password', 'a-new-long-password'),
    );

    /* Passwords left sitting in the DOM after a successful change are three
       plaintext secrets waiting for the next person at the machine. */
    await waitFor(() => expect(screen.getByLabelText(/كلمة المرور الحالية/)).toHaveValue(''));
    expect(screen.getByLabelText(/كلمة المرور الجديدة/)).toHaveValue('');
  });

  it('says the other sessions were signed out, because that is what happened', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ProfilePage />);

    await fill(user, 'the-old-password', 'a-new-long-password');
    await user.click(screen.getByRole('button', { name: 'تغيير كلمة المرور' }));

    /* Somebody changing a password because it may be known elsewhere needs to
       know the other sessions are gone — otherwise they cannot tell whether the
       change achieved the thing they did it for. */
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/جلساتك الأخرى/));
  });

  it('surfaces a wrong current password as an error, not a silent no-op', async () => {
    const { ApiError } = await import('@/lib/api-client');
    api.changePassword.mockRejectedValue(new ApiError('INVALID_CREDENTIALS', 401));

    const user = userEvent.setup();
    renderWithProviders(<ProfilePage />);

    await fill(user, 'the-wrong-password', 'a-new-long-password');
    await user.click(screen.getByRole('button', { name: 'تغيير كلمة المرور' }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});

describe('profile — the digits preference (§4.12, D-018)', () => {
  it('shows each option in the digits it names', () => {
    renderWithProviders(<ProfilePage />);

    /* The one place literal digits in copy are correct: they are specimens of
       what the reader is choosing, which is exactly what the formatting layer
       cannot supply. */
    expect(screen.getByRole('option', { name: /0123/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /٠١٢٣/ })).toBeInTheDocument();
  });

  it('offers "follow the system" as a real option, not a blank', () => {
    renderWithProviders(<ProfilePage />);

    /* Null is a genuine third state — it means whatever §4C.6 sets applies, so
       the ministry can change the default without overwriting a choice. */
    expect(screen.getByLabelText(/الأرقام المعروضة/)).toHaveValue('system');
  });

  it('offers no save until something has actually changed', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ProfilePage />);

    expect(screen.queryByRole('button', { name: 'حفظ' })).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText(/الأرقام المعروضة/), 'arabic-indic');

    expect(screen.getByRole('button', { name: 'حفظ' })).toBeInTheDocument();
  });

  it('saves the chosen format and refreshes the session so the app re-renders', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ProfilePage />);

    await user.selectOptions(screen.getByLabelText(/الأرقام المعروضة/), 'arabic-indic');
    await user.click(screen.getByRole('button', { name: 'حفظ' }));

    await waitFor(() => expect(api.setNumberFormat).toHaveBeenCalledWith('arabic-indic'));
    /* Without the refresh the preference is stored but the page keeps rendering
       the old digits — which reads as a save that did not work. */
    expect(portal.value.refreshSession).toHaveBeenCalled();
  });

  it('sends null when the user goes back to following the system', async () => {
    setUser({ numberFormat: 'arabic-indic' });

    const user = userEvent.setup();
    renderWithProviders(<ProfilePage />);

    await user.selectOptions(screen.getByLabelText(/الأرقام المعروضة/), 'system');
    await user.click(screen.getByRole('button', { name: 'حفظ' }));

    /* Not the string "system" — the column is nullable precisely so "no
       preference" and "prefers Western" stay distinguishable. */
    await waitFor(() => expect(api.setNumberFormat).toHaveBeenCalledWith(null));
  });
});

describe('profile — changing the email (§4.12)', () => {
  it('says nothing changes until the new address is confirmed', () => {
    renderWithProviders(<ProfilePage />);

    /* Said before the fields. A form that looks like it saved and did not is
       how somebody locks themselves out believing they did the opposite. */
    expect(screen.getByText(/لن يتغيّر بريدك قبل أن تفتح رابط التأكيد/)).toBeInTheDocument();
  });

  it('asks for the current password, and will not submit without it', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ProfilePage />);

    await user.type(
      screen.getByLabelText('البريد الإلكتروني الجديد'),
      'sara.new@ministry.gov.example',
    );

    /* Whoever can move the address can then reset the password and own the
       account outright — so this field is the whole gate. */
    expect(screen.getByRole('button', { name: 'إرسال رابط التأكيد' })).toBeDisabled();
  });

  it('refuses to submit the address the account already has', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ProfilePage />);

    await user.type(screen.getByLabelText('البريد الإلكتروني الجديد'), 'sara@ministry.gov.example');
    await user.type(screen.getByLabelText('كلمة المرور للتأكيد'), 'the-old-password');

    expect(screen.getByRole('button', { name: 'إرسال رابط التأكيد' })).toBeDisabled();
  });

  it('renders the new-address field left-to-right', () => {
    renderWithProviders(<ProfilePage />);

    /* Latin script in an RTL document: without this the punctuation reorders as
       it is typed, and what is on screen is not what will be submitted. */
    expect(screen.getByLabelText('البريد الإلكتروني الجديد')).toHaveAttribute('dir', 'ltr');
  });

  it('sends the request and names the address the link went to', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ProfilePage />);

    await user.type(
      screen.getByLabelText('البريد الإلكتروني الجديد'),
      'sara.new@ministry.gov.example',
    );
    await user.type(screen.getByLabelText('كلمة المرور للتأكيد'), 'the-old-password');
    await user.click(screen.getByRole('button', { name: 'إرسال رابط التأكيد' }));

    await waitFor(() =>
      expect(api.changeEmail).toHaveBeenCalledWith(
        'sara.new@ministry.gov.example',
        'the-old-password',
      ),
    );

    /* "A link has been sent" without saying where is unhelpful exactly when it
       matters — when the address was mistyped. */
    expect(await screen.findByRole('status')).toHaveTextContent('sara.new@ministry.gov.example');
  });

  it('surfaces a refused domain as an error rather than a silent no-op', async () => {
    const { ApiError } = await import('@/lib/api-client');
    api.changeEmail.mockRejectedValue(new ApiError('EMAIL_DOMAIN_NOT_ALLOWED', 400));

    const user = userEvent.setup();
    renderWithProviders(<ProfilePage />);

    await user.type(screen.getByLabelText('البريد الإلكتروني الجديد'), 'sara@gmail.example');
    await user.type(screen.getByLabelText('كلمة المرور للتأكيد'), 'the-old-password');
    await user.click(screen.getByRole('button', { name: 'إرسال رابط التأكيد' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/نطاقات الوزارة/);
  });
});

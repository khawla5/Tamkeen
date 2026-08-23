import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import messages from '../../../messages/ar.json';
import { AppShell } from './app-shell';

const api = vi.hoisted(() => ({ logout: vi.fn() }));
const nav = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock('@/lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-client')>();
  return { ...actual, authApi: { ...actual.authApi, logout: api.logout } };
});

vi.mock('next/navigation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/navigation')>();
  return {
    ...actual,
    usePathname: () => '/courses',
    useRouter: () => ({ replace: nav.replace, push: vi.fn(), refresh: vi.fn() }),
  };
});

function renderShell() {
  return render(
    <NextIntlClientProvider locale="ar-u-nu-latn-ca-gregory" messages={messages}>
      <AppShell title="الدورات" user={{ fullName: 'سارة العتيبي' }}>
        <p>المحتوى</p>
      </AppShell>
    </NextIntlClientProvider>,
  );
}

/** The sidebar footer: who is signed in, and the way out (TAM-112). */
describe('AppShell — sidebar footer', () => {
  beforeEach(() => {
    api.logout.mockReset();
    nav.replace.mockReset();
  });

  it('shows the signed-in user and a sign-out button outside the primary navigation landmark', () => {
    renderShell();

    const button = screen.getByRole('button', { name: 'تسجيل الخروج' });
    expect(screen.getByText('سارة العتيبي')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'التنقل الرئيسي' })).not.toContainElement(button);
  });

  it('signs out and goes to the sign-in page', async () => {
    const user = userEvent.setup();
    api.logout.mockResolvedValue({ status: 'ok' });
    renderShell();

    await user.click(screen.getByRole('button', { name: 'تسجيل الخروج' }));

    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/login'));
    expect(api.logout).toHaveBeenCalledTimes(1);
  });

  it('still leaves when the logout request fails — a dead session must not trap the user', async () => {
    const user = userEvent.setup();
    api.logout.mockRejectedValue(new Error('gone'));
    renderShell();

    await user.click(screen.getByRole('button', { name: 'تسجيل الخروج' }));

    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/login'));
  });
});

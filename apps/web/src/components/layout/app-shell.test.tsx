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
      <AppShell
        title="الدورات"
        user={{ fullName: 'سارة العتيبي', department: 'تقنية المعلومات', employeeId: 'EMP-2048' }}
        profileHref="/profile"
      >
        <p>المحتوى</p>
      </AppShell>
    </NextIntlClientProvider>,
  );
}

function menuButton() {
  return screen.getByRole('button', { name: 'قائمة المستخدم' });
}

/**
 * The header's user menu is the one sign-out (TAM-112, D-096); the sidebar
 * footer only names who is signed in.
 */
describe('AppShell — header user menu', () => {
  beforeEach(() => {
    api.logout.mockReset();
    nav.replace.mockReset();
  });

  it('offers no sign-out anywhere until the menu opens; identity lives in the menu alone', () => {
    renderShell();

    /* The name appears only inside the user menu — no sidebar name strip. */
    expect(screen.queryByText('سارة العتيبي')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'تسجيل الخروج' })).not.toBeInTheDocument();

    const trigger = menuButton();
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('banner')).toContainElement(trigger);
  });

  it('carries the identity line in the header: department and employee number (D-096)', () => {
    renderShell();

    const banner = screen.getByRole('banner');
    expect(banner).toHaveTextContent('تقنية المعلومات');
    expect(banner).toHaveTextContent('الرقم الوظيفي');
    expect(banner).toHaveTextContent('EMP-2048');
  });

  it('opens to the identity block, the profile link and the sign-out', async () => {
    const user = userEvent.setup();
    renderShell();

    await user.click(menuButton());

    const menu = screen.getByRole('menu', { name: 'قائمة المستخدم' });
    expect(menu).toHaveTextContent('سارة العتيبي');
    expect(menu).toHaveTextContent('تقنية المعلومات');
    expect(screen.getByRole('menuitem', { name: 'الملف الشخصي' })).toHaveAttribute(
      'href',
      '/profile',
    );
    expect(screen.getByRole('menuitem', { name: 'تسجيل الخروج' })).toBeInTheDocument();
  });

  it('closes on Escape and returns focus to the avatar', async () => {
    const user = userEvent.setup();
    renderShell();

    await user.click(menuButton());
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(menuButton()).toHaveFocus();
  });

  it('signs out and goes to the sign-in page', async () => {
    const user = userEvent.setup();
    api.logout.mockResolvedValue({ status: 'ok' });
    renderShell();

    await user.click(menuButton());
    await user.click(screen.getByRole('menuitem', { name: 'تسجيل الخروج' }));

    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/login'));
    expect(api.logout).toHaveBeenCalledTimes(1);
  });

  it('still leaves when the logout request fails — a dead session must not trap the user', async () => {
    const user = userEvent.setup();
    api.logout.mockRejectedValue(new Error('gone'));
    renderShell();

    await user.click(menuButton());
    await user.click(screen.getByRole('menuitem', { name: 'تسجيل الخروج' }));

    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/login'));
  });
});

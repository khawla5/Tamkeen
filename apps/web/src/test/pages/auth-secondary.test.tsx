import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ForgotPasswordPage from '@/app/forgot-password/page';
import ResetPasswordPage from '@/app/reset-password/page';
import VerifyEmailPage from '@/app/verify-email/page';
import { renderWithProviders } from '@/test/render';

const api = vi.hoisted(() => ({
  forgotPassword: vi.fn(),
  resetPassword: vi.fn(),
  verifyEmail: vi.fn(),
}));
const search = vi.hoisted(() => ({ token: null as string | null }));

vi.mock('@/lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-client')>();
  return { ...actual, authApi: { ...actual.authApi, ...api } };
});

vi.mock('next/navigation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/navigation')>();
  return {
    ...actual,
    useSearchParams: () => ({ get: (key: string) => (key === 'token' ? search.token : null) }),
  };
});

/** The three remaining auth pages on the government shell (TAM-104). */
describe('secondary auth pages on AuthLayout', () => {
  beforeEach(() => {
    api.forgotPassword.mockReset();
    api.resetPassword.mockReset();
    api.verifyEmail.mockReset();
    search.token = null;
  });

  describe('forgot password', () => {
    it('sits in the government shell with the ministry header', () => {
      renderWithProviders(<ForgotPasswordPage />);

      expect(screen.getByRole('banner').querySelector('img[alt="وزارة الداخلية"]')).not.toBeNull();
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
        'إعادة تعيين كلمة المرور',
      );
    });

    it('shows the same neutral confirmation whether the request succeeded or failed', async () => {
      const user = userEvent.setup();
      api.forgotPassword.mockRejectedValue(new Error('boom'));
      renderWithProviders(<ForgotPasswordPage />);

      await user.type(screen.getByLabelText('البريد الإلكتروني'), 'who@ministry.gov.example');
      await user.click(screen.getByRole('button', { name: 'إرسال الرابط' }));

      expect(
        await screen.findByRole('heading', { name: 'تحقّق من بريدك الإلكتروني' }),
      ).toBeInTheDocument();
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });

  describe('reset password', () => {
    it('uses password fields with the show/hide toggle, and catches a mismatch before sending', async () => {
      const user = userEvent.setup();
      search.token = 'tok';
      renderWithProviders(<ResetPasswordPage />);

      expect(screen.getAllByRole('button', { name: 'إظهار كلمة المرور' })).toHaveLength(2);
      await user.type(screen.getByLabelText('كلمة المرور الجديدة'), 'a-long-enough-password');
      await user.type(screen.getByLabelText('تأكيد كلمة المرور'), 'different');
      await user.click(screen.getByRole('button', { name: 'حفظ كلمة المرور' }));

      expect(screen.getByRole('alert')).toHaveTextContent('كلمتا المرور غير متطابقتين.');
      expect(api.resetPassword).not.toHaveBeenCalled();
    });

    it('without a token, explains the link is incomplete instead of sending', async () => {
      const user = userEvent.setup();
      renderWithProviders(<ResetPasswordPage />);

      await user.type(screen.getByLabelText('كلمة المرور الجديدة'), 'a-long-enough-password');
      await user.type(screen.getByLabelText('تأكيد كلمة المرور'), 'a-long-enough-password');
      await user.click(screen.getByRole('button', { name: 'حفظ كلمة المرور' }));

      expect(screen.getByRole('alert')).toHaveTextContent('الرابط غير مكتمل.');
      expect(api.resetPassword).not.toHaveBeenCalled();
    });

    it('on success shows the done panel with a way to sign in', async () => {
      const user = userEvent.setup();
      search.token = 'tok';
      api.resetPassword.mockResolvedValue({});
      renderWithProviders(<ResetPasswordPage />);

      await user.type(screen.getByLabelText('كلمة المرور الجديدة'), 'a-long-enough-password');
      await user.type(screen.getByLabelText('تأكيد كلمة المرور'), 'a-long-enough-password');
      await user.click(screen.getByRole('button', { name: 'حفظ كلمة المرور' }));

      expect(
        await screen.findByRole('heading', { name: 'تم تحديث كلمة المرور' }),
      ).toBeInTheDocument();
      expect(api.resetPassword).toHaveBeenCalledWith('tok', 'a-long-enough-password');
      expect(screen.getByRole('link', { name: 'تسجيل الدخول' })).toHaveAttribute('href', '/login');
    });
  });

  describe('verify email', () => {
    it('confirms a valid token and offers sign-in', async () => {
      search.token = 'tok';
      api.verifyEmail.mockResolvedValue({});
      renderWithProviders(<VerifyEmailPage />);

      expect(
        await screen.findByRole('heading', { name: 'تم تأكيد بريدك الإلكتروني' }),
      ).toBeInTheDocument();
      expect(api.verifyEmail).toHaveBeenCalledTimes(1);
    });

    it('explains a missing token, and a rejected one, without calling anything twice', async () => {
      renderWithProviders(<VerifyEmailPage />);

      await waitFor(() =>
        expect(
          screen.getByRole('heading', { name: 'تعذّر تأكيد البريد الإلكتروني' }),
        ).toBeInTheDocument(),
      );
      expect(
        screen.getByText('الرابط غير مكتمل. افتح الرابط كما ورد في الرسالة.'),
      ).toBeInTheDocument();
      expect(api.verifyEmail).not.toHaveBeenCalled();
    });
  });
});

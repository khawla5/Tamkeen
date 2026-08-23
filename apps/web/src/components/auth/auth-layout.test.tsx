import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import messages from '../../../messages/ar.json';
import { AuthLayout } from './auth-layout';

function withIntl(ui: ReactNode) {
  return render(
    <NextIntlClientProvider locale="ar-u-nu-latn-ca-gregory" messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe('AuthLayout', () => {
  it('renders exactly one h1, and it names the page purpose', () => {
    withIntl(<AuthLayout title="تسجيل الدخول">form</AuthLayout>);

    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent('تسجيل الدخول');
  });

  it('places the form content inside the main landmark', () => {
    withIntl(<AuthLayout title="تسجيل الدخول">حقول النموذج</AuthLayout>);

    expect(screen.getByRole('main')).toHaveTextContent('حقول النموذج');
  });

  it('frames the form the way a government sign-in page is framed: header, emblem over the card, footer strip', () => {
    const { container } = withIntl(<AuthLayout title="تسجيل الدخول">form</AuthLayout>);

    const header = screen.getByRole('banner');
    expect(header.querySelector('img[alt="وزارة الداخلية"]')).not.toBeNull();
    expect(header.querySelector('img[alt="تمكين"]')).not.toBeNull();
    /* The emblem inside the card is decorative — the header already names
       the ministry, and the h1 names the page. */
    expect(screen.getByRole('main').querySelector('img[alt=""]')).not.toBeNull();
    expect(screen.getByRole('contentinfo')).toHaveTextContent('وزارة الداخلية');
    /* A visible way out, not just the logo convention. */
    expect(screen.getByRole('link', { name: 'العودة إلى الصفحة الرئيسية' })).toHaveAttribute(
      'href',
      '/landing',
    );
    /* The background pattern is decoration and must say nothing. */
    expect(container.querySelector('svg[aria-hidden="true"] pattern')).not.toBeNull();
  });

  it('shows the subtitle and the footer when provided', () => {
    withIntl(
      <AuthLayout
        title="تسجيل الدخول"
        subtitle="سجّل دخولك للمتابعة"
        footer={<span>ليس لديك حساب؟</span>}
      >
        form
      </AuthLayout>,
    );

    expect(screen.getByText('سجّل دخولك للمتابعة')).toBeInTheDocument();
    expect(screen.getByText('ليس لديك حساب؟')).toBeInTheDocument();
  });

  it('hides decorative svgs from assistive technology', () => {
    const { container } = withIntl(<AuthLayout title="تسجيل الدخول">form</AuthLayout>);

    for (const svg of container.querySelectorAll('svg')) {
      expect(svg).toHaveAttribute('aria-hidden', 'true');
    }
  });

  it('uses only logical direction classes, and no retired brand or gold tokens', () => {
    const { container } = withIntl(
      <AuthLayout title="تسجيل الدخول" subtitle="نص" footer={<span>تذييل</span>}>
        form
      </AuthLayout>,
    );

    const physical =
      /(?:^|[\s"])(?:-?(?:ml|mr|pl|pr|left|right)-|text-left|text-right|border-l(?:-|\s|")|border-r(?:-|\s|"))/;
    for (const el of container.querySelectorAll('[class]')) {
      expect(el.getAttribute('class') ?? '').not.toMatch(physical);
    }
    expect(container.innerHTML).not.toMatch(/navy|gold|cream/);
  });
});

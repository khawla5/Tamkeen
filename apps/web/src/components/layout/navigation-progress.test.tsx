import { act, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import messages from '../../../messages/ar.json';
import { NavigationProgress, startNavigation } from './navigation-progress';

const nav = vi.hoisted(() => ({ pathname: '/' }));

vi.mock('next/navigation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/navigation')>();
  return {
    ...actual,
    usePathname: () => nav.pathname,
    useSearchParams: () => new URLSearchParams(),
  };
});

/* Plain anchors on purpose: the loader must catch any internal link, not only
   next/link — the capture-phase listener is what makes it universal. */
/* eslint-disable @next/next/no-html-link-for-pages */
function mount() {
  return render(
    <NextIntlClientProvider locale="ar-u-nu-latn-ca-gregory" messages={messages}>
      <NavigationProgress />
      <a href="/courses">الدورات</a>
      <a href="https://example.gov.sa/">خارجي</a>
      <a href="/courses" target="_blank">
        نافذة جديدة
      </a>
      <a href="#about">داخل الصفحة</a>
    </NextIntlClientProvider>,
  );
}

const bar = () => document.querySelector('[data-navigation-progress]');

/**
 * One loader for every navigation (D-072): a thin bar at the top that starts
 * when a navigation starts and completes when the route has changed.
 */
describe('NavigationProgress', () => {
  beforeEach(() => {
    nav.pathname = '/';
  });

  it('is idle and silent until something navigates', () => {
    mount();

    expect(bar()).toHaveAttribute('data-state', 'idle');
    expect(screen.getByRole('status')).toHaveTextContent('');
  });

  it('starts on a click on an internal link, announcing once, and completes when the path changes', () => {
    const { rerender } = mount();

    fireEvent.click(screen.getByRole('link', { name: 'الدورات' }));
    expect(bar()).toHaveAttribute('data-state', 'active');
    expect(screen.getByRole('status')).toHaveTextContent('جارٍ الانتقال');

    act(() => {
      nav.pathname = '/courses';
    });
    rerender(
      <NextIntlClientProvider locale="ar-u-nu-latn-ca-gregory" messages={messages}>
        <NavigationProgress />
      </NextIntlClientProvider>,
    );
    expect(bar()).toHaveAttribute('data-state', 'complete');
  });

  it('ignores external links, new-window links, same-page anchors and modified clicks', () => {
    mount();

    fireEvent.click(screen.getByRole('link', { name: 'خارجي' }));
    fireEvent.click(screen.getByRole('link', { name: 'نافذة جديدة' }));
    fireEvent.click(screen.getByRole('link', { name: 'داخل الصفحة' }));
    fireEvent.click(screen.getByRole('link', { name: 'الدورات' }), { ctrlKey: true });

    expect(bar()).toHaveAttribute('data-state', 'idle');
  });

  it('starts for programmatic navigations through startNavigation()', () => {
    mount();

    act(() => {
      startNavigation();
    });
    expect(bar()).toHaveAttribute('data-state', 'active');
  });

  it('is hidden from assistive technology except for the single status line', () => {
    mount();

    expect(bar()).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
  });
});

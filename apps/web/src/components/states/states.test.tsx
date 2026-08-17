import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import messages from '../../../messages/ar.json';
import { DataView, EmptyState, ErrorState, LoadingState } from './index';

function withIntl(ui: ReactNode) {
  return render(
    <NextIntlClientProvider locale="ar-u-nu-latn-ca-gregory" messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe('LoadingState', () => {
  it('announces itself once as a polite busy status', () => {
    withIntl(<LoadingState rows={3} />);

    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-busy', 'true');
    expect(status).toHaveAttribute('aria-live', 'polite');
  });

  it('shows the Arabic loading label', () => {
    withIntl(<LoadingState />);

    expect(screen.getByRole('status')).toHaveTextContent('جارٍ التحميل');
  });

  it('hides the decorative skeletons from assistive technology', () => {
    const { container } = withIntl(<LoadingState rows={4} />);

    const skeletons = container.querySelectorAll('[aria-hidden="true"].animate-pulse');
    expect(skeletons).toHaveLength(4);
  });
});

describe('EmptyState', () => {
  it('renders the Arabic empty copy', () => {
    withIntl(<EmptyState />);

    expect(screen.getByText('لا يوجد محتوى بعد')).toBeInTheDocument();
  });

  it('is not an alert — an empty result is a success, not a failure', () => {
    withIntl(<EmptyState />);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('accepts a single optional action', async () => {
    withIntl(<EmptyState action={<button type="button">إضافة</button>} />);

    expect(screen.getByRole('button', { name: 'إضافة' })).toBeInTheDocument();
  });

  it('allows overriding the copy for a specific view', () => {
    withIntl(<EmptyState title="لا توجد شهادات" body="أكمل دورة لتحصل على شهادة." />);

    expect(screen.getByText('لا توجد شهادات')).toBeInTheDocument();
  });
});

describe('ErrorState', () => {
  it('announces immediately via role=alert', () => {
    withIntl(<ErrorState />);

    expect(screen.getByRole('alert')).toHaveTextContent('تعذّر تحميل البيانات');
  });

  it('offers a retry action that fires the handler', async () => {
    const onRetry = vi.fn();
    withIntl(<ErrorState onRetry={onRetry} />);

    await userEvent.click(screen.getByRole('button', { name: /إعادة المحاولة/ }));

    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('omits the retry button when no handler is given', () => {
    withIntl(<ErrorState />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('never exposes technical detail to the user', () => {
    withIntl(<ErrorState />);

    const text = screen.getByRole('alert').textContent ?? '';
    expect(text).not.toMatch(/error|stack|http|\/api\//i);
  });
});

describe('DataView', () => {
  const content = <p>المحتوى</p>;

  it('shows loading first', () => {
    withIntl(
      <DataView isLoading error={new Error('x')} isEmpty>
        {content}
      </DataView>,
    );

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByText('المحتوى')).not.toBeInTheDocument();
  });

  it('prefers error over empty, so a failed request is never reported as "nothing here"', () => {
    withIntl(
      <DataView isLoading={false} error={new Error('boom')} isEmpty>
        {content}
      </DataView>,
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText('لا يوجد محتوى بعد')).not.toBeInTheDocument();
  });

  it('shows empty when the request succeeded with no rows', () => {
    withIntl(
      <DataView isLoading={false} isEmpty>
        {content}
      </DataView>,
    );

    expect(screen.getByText('لا يوجد محتوى بعد')).toBeInTheDocument();
  });

  it('renders children only once loaded, successful and non-empty', () => {
    withIntl(
      <DataView isLoading={false} isEmpty={false}>
        {content}
      </DataView>,
    );

    expect(screen.getByText('المحتوى')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('passes the retry handler through to the error state', async () => {
    const onRetry = vi.fn();
    withIntl(
      <DataView isLoading={false} error="failed" onRetry={onRetry}>
        {content}
      </DataView>,
    );

    await userEvent.click(screen.getByRole('button', { name: /إعادة المحاولة/ }));

    expect(onRetry).toHaveBeenCalledOnce();
  });
});

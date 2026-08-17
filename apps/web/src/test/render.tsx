import { render, type RenderResult } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';

import { DEFAULT_FORMAT_CONTEXT } from '@tamkeen/types';

import { FormatProvider } from '@/i18n/format-provider';

import messages from '../../messages/ar.json';

/**
 * Renders a component inside the providers the real app supplies.
 *
 * The **real** Arabic catalogue is used, not a stub. A test that passes with
 * invented messages proves the component renders *something*; using the shipping
 * catalogue means a missing or renamed key fails the test, which is the failure
 * that would otherwise reach a user as a next-intl crash.
 *
 * The locale tag is the extended form (D-024) so numbers inside ICU messages
 * are formatted the same way they are in production.
 */
export function renderWithProviders(ui: ReactNode): RenderResult {
  return render(
    <NextIntlClientProvider locale="ar-u-nu-latn-ca-gregory" messages={messages}>
      <FormatProvider context={DEFAULT_FORMAT_CONTEXT}>{ui}</FormatProvider>
    </NextIntlClientProvider>,
  );
}

'use client';

import { useTranslations } from 'next-intl';

import { CtaSection } from '@/components/landing/cta-section';
import { HeroSection } from '@/components/landing/hero-section';
import { ProblemSection } from '@/components/landing/problem-section';
import { SiteFooter } from '@/components/landing/site-footer';
import { SiteHeader } from '@/components/landing/site-header';
import { StepsSection } from '@/components/landing/steps-section';
import { TrustSection } from '@/components/landing/trust-section';

/**
 * The public marketing page's content, extracted so it can be mounted in two
 * places: `/landing` directly, and the root `/` for a signed-out visitor
 * (`PortalProvider` renders this instead of redirecting to `/login` when the
 * session check 401s on that one path — see its comment for why). Both mounts
 * render the identical tree; there is no behavioural difference between them.
 */
export function LandingView() {
  const tA11y = useTranslations('a11y');

  return (
    <div className="min-h-dvh bg-cream">
      {/* First focusable element — WCAG 2.4.1, same pattern as AppShell. */}
      <a
        href="#main-content"
        className="sr-only-focusable fixed top-3 start-3 z-50 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
      >
        {tA11y('skipToContent')}
      </a>

      <SiteHeader />

      <main id="main-content">
        <HeroSection />
        <ProblemSection />
        <StepsSection />
        <TrustSection />
        <CtaSection />
      </main>

      <SiteFooter />
    </div>
  );
}

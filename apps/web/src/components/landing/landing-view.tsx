'use client';

import { useTranslations } from 'next-intl';

import { FaqSection } from '@/components/landing/faq-section';
import { HeroSection } from '@/components/landing/hero-section';
import { AboutSection } from '@/components/landing/about-section';
import { SiteFooter } from '@/components/landing/site-footer';
import { SiteHeader } from '@/components/landing/site-header';

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
    <div className="min-h-dvh bg-background">
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
        <AboutSection />
        <FaqSection />
      </main>

      <SiteFooter />
    </div>
  );
}

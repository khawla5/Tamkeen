'use client';

import { MotionConfig } from 'framer-motion';
import { useTranslations } from 'next-intl';

import { CtaSection } from '@/components/landing/cta-section';
import { EcosystemSection } from '@/components/landing/ecosystem-section';
import { FeaturesSection } from '@/components/landing/features-section';
import { HeroSection } from '@/components/landing/hero-section';
import { JourneysSection } from '@/components/landing/journeys-section';
import { PartnershipsSection } from '@/components/landing/partnerships-section';
import { ProblemSection } from '@/components/landing/problem-section';
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
    /*
     * `reducedMotion="user"` makes every framer-motion animation on the page
     * obey the operating-system preference — without it the library animates
     * regardless, and the CSS block in globals.css cannot reach transforms
     * driven from JavaScript. One provider at the root rather than a
     * `useReducedMotion()` check inside each animated component, because the
     * check that gets forgotten is the one in the component added next.
     */
    <MotionConfig reducedMotion="user">
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
          {/* Section order, and the ids the header's nav links target, both match
            the reference frontend's landing page one for one. */}
          <HeroSection />
          <ProblemSection />
          <FeaturesSection />
          <JourneysSection />
          <EcosystemSection />
          <PartnershipsSection />
          <CtaSection />
        </main>

        <SiteFooter />
      </div>
    </MotionConfig>
  );
}

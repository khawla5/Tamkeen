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
 * Public marketing/landing page, at `/landing` — deliberately NOT at `/`,
 * and deliberately outside the `(portal)` route group.
 *
 * `app/(portal)/page.tsx` (the authenticated dashboard) already owns `/`;
 * route groups don't add a path segment, so a page placed at bare
 * `app/page.tsx` collides with it on the same URL. Putting the marketing
 * page here avoids that collision entirely, rather than moving the
 * already-built, already-tested dashboard route — which the landing-page
 * brief explicitly puts out of scope ("no auth/assessment/application
 * functionality").
 *
 * A client component, not a server one: nothing here needs server-side data,
 * and `StepsSection` already needs the client-only `useFormat` (D-018's
 * shared digit formatting). Keeping the whole tree on one side avoids a
 * server/client seam that would buy nothing.
 */
export default function LandingPage() {
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

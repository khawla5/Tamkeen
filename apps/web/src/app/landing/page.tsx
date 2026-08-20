import { LandingView } from '@/components/landing/landing-view';

/**
 * `/landing` is kept as a stable, direct URL to the marketing page even
 * though `/` now shows the same content to a signed-out visitor (see
 * `PortalProvider`). Anyone who already has this link bookmarked or shared
 * it keeps working; the two routes render the identical `LandingView`.
 */
export default function LandingPage() {
  return <LandingView />;
}

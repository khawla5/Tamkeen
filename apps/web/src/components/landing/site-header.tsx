'use client';

import { Menu, X } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

import { LocaleSwitch } from '@/components/landing/locale-switch';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Public marketing header — deliberately separate from `AppShell` (§4's
 * six-item portal rail), which requires an authenticated session. This is the
 * only header an unauthenticated visitor ever sees.
 *
 * Two actions only: sign in (existing employees) and create an account
 * (§3 — a single clear primary action plus one quiet secondary link). Sign-in
 * reuses the `auth` namespace so the header and the auth pages never say
 * something different for the same action. The primary reads "ابدأ الآن"
 * rather than the auth pages' "إنشاء حساب": on a marketing header the label
 * names the journey, not the form at the end of it — a deliberate exception
 * to the reuse rule above, and the only one.
 *
 * The nav links are same-page anchors, and every one of them scrolls to a
 * section this page actually renders — §3 forbids a link that leads nowhere,
 * so the bar and the page were extended together rather than the bar alone.
 * `landing.test.tsx` resolves every href against the rendered DOM, which is
 * what keeps that true when a section is renamed or removed.
 */
const NAV_SECTIONS = [
  { key: 'navHome', href: '#top' },
  { key: 'navProblem', href: '#challenges' },
  { key: 'navFeatures', href: '#features' },
  { key: 'navSteps', href: '#how-it-works' },
  { key: 'navEcosystem', href: '#ecosystem' },
  { key: 'navPartnerships', href: '#partnerships' },
  { key: 'navDemo', href: '#cta' },
] as const;

/**
 * Hover/focus treatment for a nav link: a translucent gold pill behind the
 * label. Gold at 10% over white lands around #F6F3EB, so navy-soft on it stays
 * far above AA — this tint is a background wash, never a fill carrying
 * body-size text in its own right, which is the line D-025 draws. The same
 * classes fire on `focus-visible`, so a keyboard user gets the identical cue
 * a mouse user does, on top of the global focus ring.
 */
const NAV_LINK_CLASS =
  'rounded-full border border-transparent px-3 py-2 text-sm font-medium whitespace-nowrap text-navy-soft transition-colors hover:bg-gold/10 hover:text-navy focus-visible:bg-gold/10';

/** Current section: the same pill, outlined in gold. Gold is a border here,
    not text — the 3:1 non-text threshold, which it clears (D-025). */
const NAV_LINK_ACTIVE_CLASS = 'border-gold bg-surface text-navy';

/**
 * Which section the reader is actually looking at, for the active pill.
 *
 * The observation root is a THIN STRIP just under the header, not the viewport:
 * the top margin is the header's own height and the bottom margin removes
 * almost everything below it. A section is "current" when it is crossing that
 * strip, which is the line a reader's eye actually follows — using the whole
 * viewport instead would leave three tall sections intersecting at once.
 *
 * Ties go to the LAST section in document order, and that detail is load-
 * bearing: every target carries `scroll-mt-20`, so an anchor jump parks the new
 * section's top *below* the strip's top edge while the previous section's
 * bottom edge is still inside it. Both intersect, and taking the earlier one
 * left the pill a full section behind on every click — which is exactly what it
 * did before this rule.
 *
 * Guarded on `IntersectionObserver` existing: jsdom does not implement it, and
 * a landing page must not break where an observer is missing. The fallback is
 * the initial value — the first link — which is what a reader at the top of the
 * page would see anyway.
 */
function useActiveSection(hrefs: readonly string[]) {
  const [active, setActive] = useState(hrefs[0]);
  const visible = useRef(new Set<string>());

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.current.add(entry.target.id);
          else visible.current.delete(entry.target.id);
        }

        /* Last match wins — a plain loop rather than `findLast`, which is
           ES2023 and outside this project's `lib` (ES2022). */
        let current: string | undefined;
        for (const href of hrefs) {
          if (visible.current.has(href.slice(1))) current = href;
        }

        if (current) setActive(current);
      },
      { rootMargin: '-64px 0px -85% 0px' },
    );

    const targets = hrefs
      .map((href) => document.getElementById(href.slice(1)))
      .filter((element): element is HTMLElement => element !== null);

    targets.forEach((target) => observer.observe(target));
    return () => observer.disconnect();
  }, [hrefs]);

  return active;
}

const NAV_HREFS = NAV_SECTIONS.map((section) => section.href);

export function SiteHeader() {
  const tLanding = useTranslations('landing');
  const tAuth = useTranslations('auth');
  const tA11y = useTranslations('a11y');
  const [open, setOpen] = useState(false);
  const active = useActiveSection(NAV_HREFS);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
        {/*
          Not "/" — that path is the authenticated dashboard
          (`app/(portal)/page.tsx`). This page lives at `/landing` precisely
          so the two never collide.
        */}
        <Link href="/landing" className="flex shrink-0 items-center" aria-label={tLanding('brand')}>
          {/*
            The brand's own horizontal lockup, which already carries the Arabic
            wordmark and the Latin one together — so there is no text beside it
            to fall out of step with the artwork, and no logotype string to keep
            out of the message catalog.

            An image with an empty alt inside a link leaves that link unnamed,
            and a screen reader falls back to announcing the URL. The accessible
            name therefore sits on the link itself. `width`/`height` are the
            file's own pixels: the rendered size comes from the class, but the
            intrinsic pair is what reserves the space so the header does not
            shift as the image decodes.
          */}
          <Image
            src="/brand/tamkeen_logo_transparent.png"
            alt=""
            width={1216}
            height={504}
            priority
            className="h-10 w-auto"
          />
        </Link>

        <nav aria-label={tA11y('primaryNav')} className="hidden items-center gap-1 xl:flex">
          {NAV_SECTIONS.map(({ key, href }) => (
            <a
              key={key}
              href={href}
              aria-current={href === active ? 'true' : undefined}
              className={cn(NAV_LINK_CLASS, href === active && NAV_LINK_ACTIVE_CLASS)}
            >
              {tLanding(key)}
            </a>
          ))}
        </nav>

        <div className="ms-auto flex items-center gap-3">
          <div className="hidden items-center gap-3 sm:flex">
            <LocaleSwitch />

            <Button asChild variant="outline" size="sm" className="rounded-full bg-cream px-5">
              <Link href="/login">{tAuth('signInLink')}</Link>
            </Button>
            <Button asChild size="sm" className="rounded-full px-5">
              <Link href="/register">{tLanding('headerCta')}</Link>
            </Button>
          </div>

          {/* Visible below `xl`, not below `sm`: that is the width at which the
              seven links leave the bar, and they have to stay reachable. */}
          <button
            type="button"
            className="inline-flex size-10 items-center justify-center rounded-md text-foreground xl:hidden"
            aria-expanded={open}
            aria-controls="mobile-nav"
            onClick={() => setOpen((value) => !value)}
          >
            {open ? (
              <X aria-hidden="true" className="size-5" />
            ) : (
              <Menu aria-hidden="true" className="size-5" />
            )}
            <span className="sr-only">{tA11y('primaryNav')}</span>
          </button>
        </div>
      </div>

      {open && (
        <nav
          id="mobile-nav"
          aria-label={tA11y('primaryNav')}
          className="border-t border-border xl:hidden"
        >
          <div className="flex flex-col gap-3 px-4 py-4">
            {NAV_SECTIONS.map(({ key, href }) => (
              <a
                key={key}
                href={href}
                aria-current={href === active ? 'true' : undefined}
                className={cn(NAV_LINK_CLASS, href === active && NAV_LINK_ACTIVE_CLASS)}
                onClick={() => setOpen(false)}
              >
                {tLanding(key)}
              </a>
            ))}
            <LocaleSwitch className="self-start sm:hidden" />
            <Link
              href="/login"
              className="text-sm font-medium text-foreground sm:hidden"
              onClick={() => setOpen(false)}
            >
              {tAuth('signInLink')}
            </Link>
            <Button asChild size="sm" className="w-full rounded-full sm:hidden">
              <Link href="/register" onClick={() => setOpen(false)}>
                {tLanding('headerCta')}
              </Link>
            </Button>
          </div>
        </nav>
      )}
    </header>
  );
}

'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

/**
 * The one loader for moving between pages (D-093): a thin primary bar along
 * the top edge that starts the instant a navigation starts and completes when
 * the route has changed. Mounted once, in the root layout; every page gets it
 * without asking.
 *
 * Two triggers feed it. A capture-phase click listener catches every internal
 * link — `next/link` included — so the bar starts before Next has done
 * anything. Programmatic navigations (`router.push/replace`) call
 * `startNavigation()`; `useAppRouter()` wraps the router so call sites cannot
 * forget. Completion is the pathname/search change itself, which is the only
 * honest signal the App Router gives: when it changes, the new page is in.
 *
 * In-page data loading is a different thing and keeps `LoadingState`; this
 * bar never speaks for a fetch.
 *
 * Assistive technology hears one polite "جارٍ الانتقال" per navigation; the
 * bar itself is decoration and says nothing. The width animation honours the
 * global reduced-motion rule, which collapses it to appear/disappear.
 */

const START_EVENT = 'tamkeen:navigation-start';
const COMPLETE_HOLD_MS = 250;

export function startNavigation(): void {
  window.dispatchEvent(new Event(START_EVENT));
}

function isInternalNavigation(event: MouseEvent): boolean {
  if (event.defaultPrevented || event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;

  const anchor = (event.target as Element | null)?.closest('a');
  if (!anchor) return false;
  if (anchor.target && anchor.target !== '_self') return false;
  if (anchor.hasAttribute('download')) return false;

  const href = anchor.getAttribute('href');
  if (!href || href.startsWith('#')) return false;

  const url = new URL(anchor.href, window.location.href);
  if (url.origin !== window.location.origin) return false;
  /* Same document, hash only: the browser scrolls, nothing loads. */
  return url.pathname + url.search !== window.location.pathname + window.location.search;
}

type State = 'idle' | 'active' | 'complete';

export function NavigationProgress() {
  const t = useTranslations('states');
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [state, setState] = useState<State>('idle');
  const route = `${pathname}?${searchParams.toString()}`;
  const lastRoute = useRef(route);

  useEffect(() => {
    const start = () => setState('active');
    const onClick = (event: MouseEvent) => {
      if (isInternalNavigation(event)) start();
    };
    window.addEventListener(START_EVENT, start);
    document.addEventListener('click', onClick, true);
    window.addEventListener('popstate', start);
    return () => {
      window.removeEventListener(START_EVENT, start);
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('popstate', start);
    };
  }, []);

  /* The route changed: whatever was loading has arrived. Hold the full bar
     briefly so a fast navigation still registers as "something happened". */
  useEffect(() => {
    if (route === lastRoute.current) return;
    lastRoute.current = route;
    setState('complete');
    const timer = window.setTimeout(() => setState('idle'), COMPLETE_HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [route]);

  return (
    <>
      <div
        data-navigation-progress
        data-state={state}
        aria-hidden="true"
        className="navigation-progress"
      />
      <div role="status" aria-live="polite" className="sr-only">
        {state === 'active' ? t('navigating') : ''}
      </div>
    </>
  );
}

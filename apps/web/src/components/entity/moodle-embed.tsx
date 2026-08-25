'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useErrorMessage } from '@/components/auth/use-error-message';
import { ErrorState, LoadingState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { entityApi } from '@/lib/api-client';

/** How long a framed page may take to announce itself before we give up. */
export const EMBED_READY_TIMEOUT_MS = 8_000;

type Phase = 'launching' | 'loading' | 'ready' | 'failed';

/**
 * Moodle's course editor, inside the page (TAM-130, D-098).
 *
 * The frame's first URL is the same single-use handoff the full-page launch
 * uses (D-044), asked for with `embed: true` so Moodle hides its own chrome and
 * opens with editing on (TAM-129). It is minted **on mount**, never prefetched,
 * and never rendered before the request resolves; once the frame has loaded it,
 * the plugin has spent the nonce, so the `src` left in the DOM is a used token
 * that logs nobody in (the D-045 amendment recorded in D-098).
 *
 * The plugin talks back with two messages, and only from Moodle's own origin —
 * anything else is ignored:
 *  - `tamkeen:ready`           the framed page rendered with a session
 *  - `tamkeen:content-changed` the course's structure changed; refresh the read-back
 *
 * If `ready` never arrives — blocked framing, a cookie the browser refused, a
 * Moodle that is down — the frame is replaced by one recovery: the full-page
 * handoff on a **fresh** token, since the first is spent. The same link sits
 * under the frame at all times for anyone who needs the editor at full size.
 */
export function MoodleEmbed({
  courseId,
  title,
  onContentChanged,
  readyTimeoutMs = EMBED_READY_TIMEOUT_MS,
}: {
  courseId: string;
  /** The course name — the frame's accessible name. */
  title: string;
  onContentChanged: () => void;
  /** Overridable for tests; the page never passes it. */
  readyTimeoutMs?: number;
}) {
  const t = useTranslations('entity');
  const translateError = useErrorMessage();

  const [phase, setPhase] = useState<Phase>('launching');
  const [src, setSrc] = useState<string | null>(null);
  const [origin, setOrigin] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

  const phaseRef = useRef<Phase>('launching');
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  /* Mint on mount. The cleanup flag matters: React's development double-mount
     would otherwise put the FIRST (already superseded) URL into the frame. */
  useEffect(() => {
    let ignore = false;

    setPhase('launching');
    setSrc(null);
    setFailure(null);

    entityApi
      .authorLaunch(courseId, { embed: true })
      .then((launch) => {
        if (ignore) return;
        setOrigin(new URL(launch.url).origin);
        setSrc(launch.url);
        setPhase('loading');
      })
      .catch((caught: unknown) => {
        if (ignore) return;
        setFailure(translateError(caught));
        setPhase('failed');
      });

    return () => {
      ignore = true;
    };
    // translateError is stable for a locale; re-minting on its identity would
    // spend tokens for nothing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  /* The ready timeout. A blocked frame fires `load` like any other, so the
     only honest signal is the plugin's own message. */
  useEffect(() => {
    if (phase !== 'loading') return;

    const timer = window.setTimeout(() => {
      if (phaseRef.current === 'loading') {
        setPhase('failed');
      }
    }, readyTimeoutMs);

    return () => window.clearTimeout(timer);
  }, [phase, readyTimeoutMs]);

  /* Messages from the frame — origin-checked against the launch URL's origin,
     which is Moodle's. A message from anywhere else changes nothing. */
  useEffect(() => {
    if (!origin) return;

    function onMessage(event: MessageEvent) {
      if (event.origin !== origin) return;
      const data = event.data as { type?: unknown } | null;
      if (!data || typeof data.type !== 'string') return;

      if (data.type === 'tamkeen:ready') {
        setPhase((current) => (current === 'failed' ? current : 'ready'));
      } else if (data.type === 'tamkeen:content-changed') {
        onContentChanged();
      }
    }

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [origin, onContentChanged]);

  /* The fallback: a fresh handoff, full page. `location.assign` rather than a
     new tab — `window.open` from an async callback is what popup blockers exist
     to stop (D-045). */
  const openFullPage = useCallback(async () => {
    setOpening(true);
    try {
      const { url } = await entityApi.authorLaunch(courseId);
      window.location.assign(url);
    } catch (caught) {
      setFailure(translateError(caught));
      setPhase('failed');
      setOpening(false);
    }
  }, [courseId, translateError]);

  if (phase === 'failed') {
    return (
      <div className="space-y-4">
        <ErrorState title={t('embedFailedTitle')} body={failure ?? t('embedFailedBody')} />
        <Button onClick={openFullPage} disabled={opening}>
          {opening ? t('authorLaunching') : t('embedOpenFullPage')}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        {phase !== 'ready' ? (
          <div className="absolute inset-0 z-10 bg-card p-6">
            <LoadingState rows={4} label={t('embedLoading')} />
          </div>
        ) : null}

        {src ? (
          <iframe
            src={src}
            title={title}
            allow="fullscreen"
            referrerPolicy="strict-origin"
            className="h-[calc(100dvh-14rem)] min-h-[32rem] w-full rounded-card border border-border bg-card"
          />
        ) : (
          /* Holds the height while the launch is in flight, so the page does
             not jump when the frame arrives. */
          <div aria-hidden="true" className="h-[calc(100dvh-14rem)] min-h-[32rem] w-full" />
        )}
      </div>

      {/* Quiet, always there: the editor at full size for zoom and screen-reader
          users, and for anyone the frame does not suit. Secondary by design —
          the page's primary action is publishing. */}
      <Button variant="ghost" onClick={openFullPage} disabled={opening}>
        {opening ? t('authorLaunching') : t('embedOpenFullPage')}
      </Button>
    </div>
  );
}

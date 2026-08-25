'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { ErrorState, LoadingState } from '@/components/states';
import { Button } from '@/components/ui/button';

/** How long a framed page may take to announce itself before we give up. */
export const EMBED_READY_TIMEOUT_MS = 8_000;

type Phase = 'launching' | 'loading' | 'ready' | 'failed';

export interface MoodleEmbedLabels {
  loading: string;
  failedTitle: string;
  failedBody: string;
  openFullPage: string;
  opening: string;
}

/**
 * Moodle inside the page (D-098 for the entity's editor, D-102 for the
 * learner's course). Portal-agnostic: the caller supplies the two launches and
 * the words; the frame supplies the discipline.
 *
 * `launchEmbed` is minted **on mount**, never prefetched, and never rendered
 * before the request resolves; once the frame has loaded it, the plugin has
 * spent the nonce, so the `src` left in the DOM is a used token that logs
 * nobody in (the D-045 amendment recorded in D-098).
 *
 * The plugin talks back, and only from Moodle's own origin — anything else is
 * ignored:
 *  - `tamkeen:ready`            the framed page rendered with a session
 *  - `tamkeen:content-changed`  the course's structure changed (authors)
 *  - `tamkeen:quiz-finished`    a quiz attempt was submitted (learners)
 *
 * If `ready` never arrives — blocked framing, a cookie the browser refused, a
 * Moodle that is down — the frame is replaced by one recovery: the full-page
 * handoff on a **fresh** token (`launchFullPage`), since the first is spent.
 * The same link sits under the frame at all times for anyone who needs Moodle
 * at full size.
 */
export function MoodleEmbed({
  title,
  labels,
  launchEmbed,
  launchFullPage,
  translateError,
  onContentChanged,
  onQuizFinished,
  readyTimeoutMs = EMBED_READY_TIMEOUT_MS,
}: {
  /** The course name — the frame's accessible name. */
  title: string;
  labels: MoodleEmbedLabels;
  /** Mints the framed launch (`embed: true`). Called once per mount. */
  launchEmbed: () => Promise<{ url: string }>;
  /** Mints the plain handoff, for the fallback. Called per click. */
  launchFullPage: () => Promise<{ url: string }>;
  translateError: (error: unknown) => string;
  onContentChanged?: () => void;
  onQuizFinished?: () => void;
  /** Overridable for tests; pages never pass it. */
  readyTimeoutMs?: number;
}) {
  const [phase, setPhase] = useState<Phase>('launching');
  const [src, setSrc] = useState<string | null>(null);
  const [origin, setOrigin] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

  const phaseRef = useRef<Phase>('launching');
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  /* The callbacks are read through refs so a caller re-rendering with a fresh
     closure neither re-mints the launch nor re-binds the listener. */
  const launchEmbedRef = useRef(launchEmbed);
  const translateRef = useRef(translateError);
  const contentChangedRef = useRef(onContentChanged);
  const quizFinishedRef = useRef(onQuizFinished);
  useEffect(() => {
    launchEmbedRef.current = launchEmbed;
    translateRef.current = translateError;
    contentChangedRef.current = onContentChanged;
    quizFinishedRef.current = onQuizFinished;
  });

  /* Mint on mount. The cleanup flag matters: React's development double-mount
     would otherwise put the FIRST (already superseded) URL into the frame. */
  useEffect(() => {
    let ignore = false;

    setPhase('launching');
    setSrc(null);
    setFailure(null);

    launchEmbedRef
      .current()
      .then((launch) => {
        if (ignore) return;
        setOrigin(new URL(launch.url).origin);
        setSrc(launch.url);
        setPhase('loading');
      })
      .catch((caught: unknown) => {
        if (ignore) return;
        setFailure(translateRef.current(caught));
        setPhase('failed');
      });

    return () => {
      ignore = true;
    };
  }, []);

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
        contentChangedRef.current?.();
      } else if (data.type === 'tamkeen:quiz-finished') {
        quizFinishedRef.current?.();
      }
    }

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [origin]);

  /* The fallback: a fresh handoff, full page. `location.assign` rather than a
     new tab — `window.open` from an async callback is what popup blockers exist
     to stop (D-045). */
  const openFullPage = useCallback(async () => {
    setOpening(true);
    try {
      const { url } = await launchFullPage();
      window.location.assign(url);
    } catch (caught) {
      setFailure(translateRef.current(caught));
      setPhase('failed');
      setOpening(false);
    }
  }, [launchFullPage]);

  if (phase === 'failed') {
    return (
      <div className="space-y-4">
        <ErrorState title={labels.failedTitle} body={failure ?? labels.failedBody} />
        <Button onClick={openFullPage} disabled={opening}>
          {opening ? labels.opening : labels.openFullPage}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        {phase !== 'ready' ? (
          <div className="absolute inset-0 z-10 bg-card p-6">
            <LoadingState rows={4} label={labels.loading} />
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

      {/* Quiet, always there: Moodle at full size for zoom and screen-reader
          users, and for anyone the frame does not suit. Secondary by design. */}
      <Button variant="ghost" onClick={openFullPage} disabled={opening}>
        {opening ? labels.opening : labels.openFullPage}
      </Button>
    </div>
  );
}

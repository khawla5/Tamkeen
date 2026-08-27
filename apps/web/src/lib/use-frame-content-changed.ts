'use client';

import { useEffect, useRef } from 'react';

/**
 * Listens for the framed Moodle editor's `tamkeen:content-changed` signal
 * (§4B.4, TAM-133) and calls `onChanged` when it arrives.
 *
 * `origin` must be the exact origin the open iframe was minted for — the same
 * check the plugin's own `frame-ancestors` policy makes in the other
 * direction (TAM-129) — so a message from anywhere else, including a stray
 * same-page script, is ignored rather than trusted. Pass `null` while no
 * frame is open: the listener stays attached, but nothing can match a `null`
 * origin, so every message is ignored until a frame actually opens.
 *
 * `onChanged` is read through a ref so the listener can be attached once —
 * for the component's whole lifetime, not re-attached whenever the caller's
 * inline callback gets a new identity — while still calling whichever
 * closure is current when a message arrives.
 */
export function useFrameContentChanged(origin: string | null, onChanged: () => void): void {
  const latest = useRef(onChanged);
  latest.current = onChanged;

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (origin === null || event.origin !== origin) {
        return;
      }

      const data = event.data as { type?: unknown } | null;

      if (data?.type === 'tamkeen:content-changed') {
        latest.current();
      }
    }

    window.addEventListener('message', onMessage);

    return () => window.removeEventListener('message', onMessage);
  }, [origin]);
}

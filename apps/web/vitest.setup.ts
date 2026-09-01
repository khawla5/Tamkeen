import '@testing-library/jest-dom/vitest';

/**
 * jsdom does not implement `HTMLDialogElement.showModal()` / `close()`.
 *
 * The confirmation gate (§4.5) uses the native `<dialog>` deliberately — it
 * gives focus trapping, the inert background, Escape-to-close and `aria-modal`
 * from the platform rather than from hand-written code that usually gets one of
 * them wrong. Rewriting it as a div to suit the test environment would trade a
 * real accessibility property for a testable one.
 *
 * So the gap is filled here instead. This is a **shim for the missing API, not
 * a substitute for the behaviour**: it toggles the `open` attribute so the
 * dialog's content mounts and can be asserted on. Focus trapping and inertness
 * are genuinely not exercised here — the Playwright happy path drives the real
 * element in Chromium, which is where those properties actually exist.
 */
if (typeof HTMLDialogElement !== 'undefined' && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };

  HTMLDialogElement.prototype.close = function close(
    this: HTMLDialogElement,
    returnValue?: string,
  ) {
    this.removeAttribute('open');
    if (returnValue !== undefined) {
      this.returnValue = returnValue;
    }
    this.dispatchEvent(new Event('close'));
  };
}

/**
 * jsdom does not implement `window.matchMedia`.
 *
 * The landing hero (TAM-150) checks `(prefers-reduced-motion: reduce)` before
 * starting its background-photo rotation (WCAG 2.3.3), so any test that
 * mounts it crashes in a `useEffect` without this. Reports `matches: false`
 * unconditionally — no test here asserts the reduced-motion branch itself,
 * which would need a real value to flip, not a constant stub.
 */
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = function matchMedia(query: string): MediaQueryList {
    return {
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    } as MediaQueryList;
  };
}

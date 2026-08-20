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
 * jsdom does not implement `IntersectionObserver`.
 *
 * The landing page needs it twice: the header's active-section indicator, which
 * guards for its absence itself, and framer-motion's `whileInView`, which does
 * not — it throws on mount, and took eleven landing tests down with it.
 *
 * This is a **shim for the missing API, not a substitute for the behaviour**.
 * It reports every observed element as intersecting on the next tick, so
 * scroll-triggered content settles into its final state and tests assert what a
 * reader would actually see rather than the pre-animation frame. What it does
 * NOT exercise is intersection itself — thresholds, root margins, and anything
 * that depends on an element leaving the viewport. The Playwright suite drives
 * the real observer in Chromium, which is where those properties exist.
 */
if (typeof globalThis.IntersectionObserver === 'undefined') {
  class IntersectionObserverStub implements IntersectionObserver {
    readonly root = null;
    readonly rootMargin = '';
    readonly thresholds: readonly number[] = [];

    private readonly targets = new Set<Element>();

    constructor(private readonly callback: IntersectionObserverCallback) {}

    observe(target: Element) {
      this.targets.add(target);

      queueMicrotask(() => {
        if (!this.targets.has(target)) return;

        this.callback(
          [{ target, isIntersecting: true, intersectionRatio: 1 } as IntersectionObserverEntry],
          this,
        );
      });
    }

    unobserve(target: Element) {
      this.targets.delete(target);
    }

    disconnect() {
      this.targets.clear();
    }

    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  }

  globalThis.IntersectionObserver =
    IntersectionObserverStub as unknown as typeof IntersectionObserver;
}

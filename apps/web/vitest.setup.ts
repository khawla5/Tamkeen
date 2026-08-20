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

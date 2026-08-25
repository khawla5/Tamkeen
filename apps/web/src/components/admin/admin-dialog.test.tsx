import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '@/test/render';

import { AdminDialog } from './admin-dialog';

/**
 * The admin portal's modal.
 *
 * **The centring is asserted because losing it is silent.** A `<dialog>` is
 * centred by the UA stylesheet's `margin: auto`, Tailwind's preflight resets
 * every margin to 0, and the result is a modal pinned to the block-start
 * inline-start corner — the TOP RIGHT of an RTL page. Nothing throws, no test
 * that only reads text notices, and every admin modal shipped that way. So the
 * class that restores it is pinned here, next to the reason.
 */
describe('AdminDialog', () => {
  function open(props: Partial<Parameters<typeof AdminDialog>[0]> = {}) {
    return renderWithProviders(
      <AdminDialog title="إدارة الحساب" onClose={props.onClose ?? (() => {})} {...props}>
        <p>المحتوى</p>
      </AdminDialog>,
    );
  }

  it('centres itself rather than pinning to the corner of the viewport', () => {
    const { container } = open();
    const dialog = container.querySelector('dialog')!;

    /* Without `m-auto` the browser puts this at the top right of an RTL page. */
    expect(dialog.className).toContain('m-auto');
  });

  it('uses a live palette token for the backdrop', () => {
    const { container } = open();

    /* `bg-navy/40` outlived the token D-069 retired, so the backdrop rendered
       fully transparent and the page behind it stayed visually live. */
    expect(container.querySelector('dialog')!.className).not.toMatch(/navy|gold|cream/);
    expect(container.querySelector('dialog')!.className).toMatch(/backdrop:bg-neutral-900/);
  });

  it('caps its height and scrolls the body, not the frame', () => {
    const { container } = open();
    const dialog = container.querySelector('dialog')!;

    /* A path's whole course list is taller than a laptop viewport, and an
       overflowing dialog takes its own cancel button off-screen. */
    expect(dialog.className).toMatch(/max-h-/);
    expect(container.querySelector('.overflow-y-auto')).toBeInTheDocument();
  });

  it('names itself to assistive technology, with an id unique per instance', () => {
    const { container } = open({ description: 'شرح قصير' });
    const dialog = container.querySelector('dialog')!;

    const labelledBy = dialog.getAttribute('aria-labelledby')!;
    const describedBy = dialog.getAttribute('aria-describedby')!;

    expect(document.getElementById(labelledBy)).toHaveTextContent('إدارة الحساب');
    expect(document.getElementById(describedBy)).toHaveTextContent('شرح قصير');
    /* Admin dialogs nest — a picker opened from a manage panel — so a hardcoded
       id would leave two elements sharing one and announce the wrong title. */
    expect(labelledBy).not.toBe('admin-dialog-title');
  });

  it('describes nothing when there is no description', () => {
    const { container } = open();

    expect(container.querySelector('dialog')).not.toHaveAttribute('aria-describedby');
  });

  it('wraps its content in no form, so an untyped button cannot close it', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <AdminDialog title="إدارة المسار" onClose={onClose}>
        {/* No `type`, exactly like the save and retire controls in the path
            panel. Under the old `<form method="dialog">` this submitted the
            form and shut the dialog behind the request it had just fired. */}
        <button onClick={() => {}}>حفظ التعديلات</button>
      </AdminDialog>,
    );

    expect(document.querySelector('dialog')!.querySelector('form')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'حفظ التعديلات' }));

    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes through the caller rather than behind its back', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    open({ onClose });

    await user.click(screen.getByRole('button', { name: 'إلغاء' }));

    /* Escape and the button route through the same callback, so the parent's
       state cannot drift out of step with the browser's. */
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

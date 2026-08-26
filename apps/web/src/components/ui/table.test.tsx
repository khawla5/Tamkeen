import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './table';

function renderTable(props: Partial<React.ComponentProps<typeof Table>> = {}) {
  return render(
    <Table caption="المتدربون" {...props}>
      <TableHeader>
        <TableRow>
          <TableHead>الاسم</TableHead>
          <TableHead>الحالة</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell>سارة</TableCell>
          <TableCell>مكتملة</TableCell>
        </TableRow>
      </TableBody>
    </Table>,
  );
}

describe('Table (TAM-118)', () => {
  it('is a real table with a name and column headers a screen reader can use', () => {
    renderTable();

    const table = screen.getByRole('table', { name: 'المتدربون' });
    expect(table).toBeInTheDocument();
    for (const header of screen.getAllByRole('columnheader')) {
      expect(header).toHaveAttribute('scope', 'col');
    }
    expect(screen.getByRole('cell', { name: 'سارة' })).toBeInTheDocument();
  });

  it('keeps the caption for assistive technology unless asked to show it', () => {
    const { unmount } = renderTable();
    expect(screen.getByText('المتدربون').className).toMatch(/sr-only/);
    unmount();

    renderTable({ captionVisible: true });
    expect(screen.getByText('المتدربون').className).not.toMatch(/sr-only/);
  });

  it('scrolls inside its own frame, so a wide table never scrolls the page', () => {
    const { container } = renderTable({ minWidthClassName: 'min-w-[42rem]' });

    const frame = container.firstElementChild!;
    expect(frame.className).toMatch(/overflow-x-auto/);
    expect(screen.getByRole('table').className).toMatch(/min-w-\[42rem\]/);
  });

  it('puts the header row on the neutral ground in semibold', () => {
    renderTable();

    expect(screen.getAllByRole('rowgroup')[0]!.className).toMatch(/bg-neutral-50/);
    expect(screen.getAllByRole('columnheader')[0]!.className).toMatch(/font-semibold/);
  });
});

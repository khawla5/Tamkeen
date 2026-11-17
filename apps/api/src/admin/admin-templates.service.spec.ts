import { NotFoundException } from '@nestjs/common';

import { AdminTemplatesService } from './admin-templates.service';

/**
 * §4C.7 — the preview is the real template, drawn for whoever the administrator
 * picks, or for the sample when nobody is picked.
 */

function build(options: {
  user?: { fullName: string } | null;
  path?: { name: string; pathCourses: Array<{ levelId: string | null }> } | null;
}) {
  const prisma = {
    user: { findUnique: jest.fn().mockResolvedValue(options.user ?? null) },
    path: { findUnique: jest.fn().mockResolvedValue(options.path ?? null) },
  };
  const settings = { get: jest.fn().mockResolvedValue('') };

  const service = new AdminTemplatesService(settings as never, prisma as never);

  return { service, prisma };
}

/** What a reader of the printed certificate would see of the holder and the path. */
function text(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');
}

describe('AdminTemplatesService.view', () => {
  it('is the sample certificate when nobody is picked, and looks nobody up', async () => {
    const { service, prisma } = build({});

    const { previewHtml } = await service.view();

    expect(text(previewHtml)).toContain('اسم الموظف');
    expect(text(previewHtml)).toContain('اسم المسار');
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.path.findUnique).not.toHaveBeenCalled();
  });

  it('prints the picked employee’s name instead of the sample', async () => {
    const { service } = build({ user: { fullName: 'سارة العتيبي' } });

    const { previewHtml } = await service.view({ userId: 'u1' });

    expect(text(previewHtml)).toContain('سارة العتيبي');
    /* Only what was picked is replaced: the path is still the sample. */
    expect(text(previewHtml)).toContain('اسم المسار');
  });

  it('prints the picked path and the number of courses placed in it', async () => {
    const { service } = build({
      path: {
        name: 'مسار اللغة الإنجليزية',
        /* An unplaced course reaches no learner, so it is not "a course taken". */
        pathCourses: [{ levelId: 'l1' }, { levelId: 'l1' }, { levelId: 'l2' }, { levelId: null }],
      },
    });

    const { previewHtml } = await service.view({ pathId: 'p1' });

    expect(text(previewHtml)).toContain('مسار اللغة الإنجليزية');
    expect(text(previewHtml)).toContain('باجتياز 3 دورات ضمن المسار');
  });

  it('refuses an employee that does not exist rather than drawing the sample', async () => {
    const { service } = build({ user: null });

    await expect(service.view({ userId: 'missing' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses a path that does not exist', async () => {
    const { service } = build({ path: null });

    await expect(service.view({ pathId: 'missing' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('reads only the name, never the rest of the account', async () => {
    const { service, prisma } = build({ user: { fullName: 'سارة العتيبي' } });

    await service.view({ userId: 'u1' });

    /* A preview needs a name. Fetching the row whole would put an email and an
       employee number in memory to draw a line of text. */
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'u1' },
      select: { fullName: true },
    });
  });
});

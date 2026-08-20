import { config as loadEnv } from 'dotenv';

loadEnv({ path: ['.env'], quiet: true });

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { PdfRendererService } from '../../apps/api/src/certificates/pdf-renderer.service';
import { CvExportService } from '../../apps/api/src/cv/cv-export.service';
import { CvService } from '../../apps/api/src/cv/cv.service';
import { PrismaService } from '../../apps/api/src/prisma/prisma.service';

/**
 * Renders a real CV PDF through the real services, against the real database.
 *
 * The Jest integration suite stubs the renderer — Puppeteer 25 is ESM-only and
 * Jest's CommonJS runtime cannot load it — so this is where the actual bytes
 * get produced and inspected. It is the CV half of what
 * `verify-issuance.ts` does for certificates.
 *
 *     npx tsx spike/pdf/verify-cv-export.ts <user-email>
 */

const email = process.argv[2] ?? 'cert-verify-c1@ministry.gov.example';
const OUT = process.env.CV_OUT ?? '.';

const prisma = new PrismaService();
const renderer = new PdfRendererService();
const exporter = new CvExportService(new CvService(prisma), renderer);

let failures = 0;

function check(label: string, ok: boolean, detail = ''): void {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(56)} ${detail}`);
}

async function main(): Promise<void> {
  await prisma.$connect();

  const user = await prisma.user.findUniqueOrThrow({
    where: { email },
    select: { id: true, fullName: true },
  });

  const started = Date.now();
  const file = await exporter.render(user.id);
  const took = Date.now() - started;

  const path = join(OUT, file.filename);
  writeFileSync(path, file.bytes);

  const raw = file.bytes.toString('latin1');

  check('rendered a PDF', file.bytes.subarray(0, 5).toString() === '%PDF-', `${took} ms`);
  check('the typeface is embedded', /IBMPlexSansArabic/.test(raw));
  check('the filename is ASCII-safe', /^cv[a-z0-9-]*\.pdf$/.test(file.filename), file.filename);
  check(
    'it is a reasonable size',
    file.bytes.byteLength > 10_000,
    `${(file.bytes.byteLength / 1024).toFixed(0)} KB`,
  );

  console.log(`\nwritten to: ${path}`);
  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);

  await renderer.onModuleDestroy();
  await prisma.$disconnect();

  process.exitCode = failures === 0 ? 0 : 1;
}

void main().catch(async (error: unknown) => {
  console.error(error);
  await renderer.onModuleDestroy().catch(() => undefined);
  await prisma.$disconnect().catch(() => undefined);
  process.exitCode = 1;
});

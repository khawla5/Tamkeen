import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { AppConfigService } from '../config/app-config.module';
import { CertificateStorageService } from './certificate-storage.service';

describe('CertificateStorageService', () => {
  let root: string;
  let storage: CertificateStorageService;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'tamkeen-certs-'));
    storage = new CertificateStorageService({
      get: () => root,
    } as unknown as AppConfigService);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('shards by issue year so one directory does not hold every certificate', () => {
    expect(storage.pathFor('abc', new Date('2026-08-19T00:00:00Z'))).toBe('2026/abc.pdf');
  });

  it('writes the bytes and reports their digest', async () => {
    const bytes = Buffer.from('%PDF-1.4 a certificate');

    const stored = await storage.write('2026/one.pdf', bytes);

    expect(stored.bytes).toBe(bytes.byteLength);
    expect(stored.sha256).toBe(createHash('sha256').update(bytes).digest('hex'));
    expect(readFileSync(join(root, '2026', 'one.pdf'))).toEqual(bytes);
  });

  it('reads back exactly what was written', async () => {
    const bytes = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x00, 0xff]);

    await storage.write('2026/two.pdf', bytes);

    expect(await storage.read('2026/two.pdf')).toEqual(bytes);
  });

  it('refuses a path that escapes the storage root', async () => {
    /* Every path handled here is one we generated, so this is defence in depth
       — but "it came from our own database" is exactly the assumption that
       stops holding, and a traversal out of the root reads arbitrary files. */
    await expect(storage.read('../../../etc/passwd')).rejects.toThrow(
      'Refusing a certificate path outside the storage root',
    );
  });

  it('refuses an absolute path', async () => {
    await expect(storage.read('/etc/passwd')).rejects.toThrow(
      'Refusing a certificate path outside the storage root',
    );
  });

  it('does not fail when asked to remove a file that is not there', async () => {
    /* Cleanup after a lost race must not turn litter into an error. */
    await expect(storage.removeQuietly('2026/never-written.pdf')).resolves.toBeUndefined();
  });
});

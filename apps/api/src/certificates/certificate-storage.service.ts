import { createHash } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

import { Injectable, Logger } from '@nestjs/common';

import { AppConfigService } from '../config/app-config.module';

/**
 * Where the rendered certificate bytes live.
 *
 * **Rendered once, at issue time, and never re-rendered.** A certificate is a
 * credential, so the artefact a third party checks has to be the artefact that
 * was issued. Rendering on demand would make it a *view* of current data — a
 * template tweak, a re-synced course title or a corrected name would silently
 * change a document someone had already downloaded, printed and filed. That the
 * bytes are immutable is the whole reason Phase 5's certificate-template editor
 * can only affect future issuances.
 *
 * Object storage is a Phase 7 concern; the filesystem behind a configured root
 * is the right amount of infrastructure for now, and the row stores a
 * **relative** path so the root can move without rewriting every certificate.
 */
@Injectable()
export class CertificateStorageService {
  private readonly logger = new Logger(CertificateStorageService.name);
  private readonly root: string;

  constructor(config: AppConfigService) {
    this.root = resolve(config.get('CERT_STORAGE_DIR'));
  }

  /**
   * The stored path for a certificate.
   *
   * Named by the row's **id**, never by its `verificationId`. The verification
   * id is public — it travels in a QR code on paper — and naming files after it
   * would mean anyone holding one could fetch the whole PDF straight out of the
   * storage root if it were ever exposed by a misconfigured static mount. The
   * public handle and the storage path are deliberately unrelated.
   *
   * Sharded by year so a directory does not accumulate every certificate the
   * ministry has ever issued.
   */
  pathFor(certificateId: string, issuedAt: Date): string {
    return `${issuedAt.getUTCFullYear()}/${certificateId}.pdf`;
  }

  async write(relativePath: string, bytes: Buffer): Promise<{ sha256: string; bytes: number }> {
    const absolute = this.absolute(relativePath);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, bytes);

    return {
      sha256: createHash('sha256').update(bytes).digest('hex'),
      bytes: bytes.byteLength,
    };
  }

  async read(relativePath: string): Promise<Buffer> {
    return readFile(this.absolute(relativePath));
  }

  /**
   * Deletes a rendered file. Used only to clean up after losing a race to
   * insert, so a failure here is logged and swallowed: an orphaned PDF nobody
   * can reach is litter, and litter must not fail a certificate issuance.
   */
  async removeQuietly(relativePath: string): Promise<void> {
    try {
      await unlink(this.absolute(relativePath));
    } catch (error) {
      this.logger.warn(
        `Could not remove orphaned certificate file ${relativePath}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }
  }

  /**
   * Resolves under the root and refuses anything that escapes it.
   *
   * Every path handled here is one we generated, so this is defence in depth
   * rather than a live threat — but "the value came from our own database" is
   * exactly the assumption that stops holding the day something else writes to
   * that column, and a traversal out of a storage root reads arbitrary files.
   */
  private absolute(relativePath: string): string {
    const absolute = resolve(this.root, relativePath);
    const within = relative(this.root, absolute);

    if (isAbsolute(within) || within.startsWith(`..${sep}`) || within === '..') {
      throw new Error('Refusing a certificate path outside the storage root');
    }

    return absolute;
  }

  /** Exposed for the health/debug surface; never sent to a browser. */
  get storageRoot(): string {
    return join(this.root);
  }
}

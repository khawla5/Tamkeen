import { NotFoundException } from '@nestjs/common';

import type { PrismaService } from '../prisma/prisma.service';
import {
  CertificateVerificationService,
  isPlausibleVerificationId,
} from './certificate-verification.service';

/**
 * The public lookup — and mostly, what it refuses to say.
 *
 * This is the only unauthenticated read in the product, so the tests that
 * matter are about the boundary: which columns are asked for, and what an
 * unknown id produces.
 */

const VALID_ID = 'k7Qz2Xr9TfLmA4vN8bYcJ1sWdEpHgU6oRt3iZnQxKvM';

function harness(row: unknown = null) {
  const selects: unknown[] = [];

  const prisma = {
    certificate: {
      findUnique: (args: { select: unknown }) => {
        selects.push(args.select);
        return Promise.resolve(row);
      },
    },
  } as unknown as PrismaService;

  return { service: new CertificateVerificationService(prisma), selects };
}

const STORED = {
  type: 'COURSE' as const,
  holderName: 'سارة بنت أحمد القحطاني',
  subjectTitle: 'أساسيات القيادة الإدارية',
  issuedAt: new Date('2026-08-19T09:30:00.000Z'),
};

describe('CertificateVerificationService', () => {
  it('confirms a certificate it holds', async () => {
    const { service } = harness(STORED);

    await expect(service.verify(VALID_ID)).resolves.toEqual({
      type: 'COURSE',
      holderName: 'سارة بنت أحمد القحطاني',
      subjectTitle: 'أساسيات القيادة الإدارية',
      issuedAt: '2026-08-19T09:30:00.000Z',
      valid: true,
    });
  });

  it('asks the database for nothing beyond the four public fields', async () => {
    /*
     * The privacy boundary, asserted where it is actually enforced. Employee id,
     * email, department and the quiz grade are not merely unrendered — they are
     * never loaded, so no later template edit can leak them.
     */
    const { service, selects } = harness(STORED);

    await service.verify(VALID_ID);

    expect(selects[0]).toEqual({
      type: true,
      holderName: true,
      subjectTitle: true,
      issuedAt: true,
    });
  });

  it('treats an id it does not hold as not found, never as "invalid"', async () => {
    /* We cannot know a certificate is fake — only that we do not hold that id,
       which is far more often a mistyped or half-scanned link. */
    const { service } = harness(null);

    await expect(service.verify(VALID_ID)).rejects.toThrow(NotFoundException);
  });

  it('rejects a malformed id without touching the database', async () => {
    /* An unbounded string on an unauthenticated route is free work for whoever
       sends it. */
    const { service, selects } = harness(STORED);

    await expect(service.verify('too-short')).rejects.toThrow(NotFoundException);
    await expect(service.verify('')).rejects.toThrow(NotFoundException);
    await expect(service.verify(`${VALID_ID}extra`)).rejects.toThrow(NotFoundException);

    expect(selects).toEqual([]);
  });

  it('answers a wrong id and an unknown id identically', async () => {
    /* Any difference — a distinct code, a distinct message — would turn
       guessing from pointless into merely slow. */
    const { service } = harness(null);

    const rejection = async (id: string): Promise<NotFoundException> => {
      try {
        await service.verify(id);
        throw new Error('expected a rejection');
      } catch (error) {
        return error as NotFoundException;
      }
    };

    const malformed = await rejection('nope');
    const unknown = await rejection(VALID_ID);

    expect(malformed.getStatus()).toBe(unknown.getStatus());
    expect(malformed.message).toBe(unknown.message);
  });

  describe('isPlausibleVerificationId', () => {
    it('accepts what generateToken produces', () => {
      /* 32 CSPRNG bytes, base64url, unpadded — 43 characters. */
      expect(isPlausibleVerificationId(VALID_ID)).toBe(true);
      expect(VALID_ID).toHaveLength(43);
    });

    it('rejects padding, slashes and plus signs from standard base64', () => {
      expect(isPlausibleVerificationId(`${VALID_ID.slice(0, 42)}=`)).toBe(false);
      expect(isPlausibleVerificationId(`${VALID_ID.slice(0, 42)}/`)).toBe(false);
      expect(isPlausibleVerificationId(`${VALID_ID.slice(0, 42)}+`)).toBe(false);
    });

    it('rejects an id carrying path traversal or a wildcard', () => {
      expect(isPlausibleVerificationId('../../../etc/passwd')).toBe(false);
      expect(isPlausibleVerificationId('%')).toBe(false);
    });
  });
});

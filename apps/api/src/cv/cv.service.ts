import { Injectable, NotFoundException } from '@nestjs/common';

import {
  emptyCvProfile,
  type CvAutofill,
  type CvCareerProfile,
  type CvEducationEntry,
  type CvExperienceEntry,
  type CvExternalCertification,
  type CvProfile,
  type CvView,
  type RiasecLetter,
} from '@tamkeen/types';

import { PrismaService } from '../prisma/prisma.service';
import type { SaveCvDto } from './cv.dto';

/**
 * The CV builder's data layer (§4.11, D-050).
 *
 * **The split between authored and known is the design.** What the learner
 * types is stored; what the system knows about them is recomputed on every
 * load and never written into the document. That is not a storage
 * optimisation — it is what stops a CV from claiming a certificate its holder
 * no longer has, or showing a department they left. A CV that could go stale
 * against the record it is drawn from would be worth less than one typed by
 * hand.
 *
 * It also means the certifications section cannot be faked: it is not a field
 * with a default, it is a read of `certificates` performed at render time.
 */
@Injectable()
export class CvService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Loads the CV, pre-filled.
   *
   * A learner who has never saved gets a document rather than an empty state:
   * their name, department and email are already in it, their certificates are
   * already listed, and their career profile is already written. §4.11 asks
   * that the CV "pre-fills everything the system knows so the user never
   * retypes it", and the first screen is where that has to be true.
   */
  async get(userId: string): Promise<CvView> {
    const [user, stored] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { fullName: true, department: true, email: true },
      }),
      this.prisma.cvProfile.findUnique({ where: { userId } }),
    ]);

    if (!user) {
      throw new NotFoundException('USER_NOT_FOUND');
    }

    const autofill = await this.autofillFor(userId, user);

    if (!stored) {
      return { profile: emptyCvProfile(autofill), autofill, savedAt: null };
    }

    return {
      profile: {
        fullName: stored.fullName,
        jobTitle: stored.jobTitle,
        department: stored.department,
        email: stored.email,
        phone: stored.phone,
        summary: stored.summary,
        experience: stored.experience as unknown as CvExperienceEntry[],
        education: stored.education as unknown as CvEducationEntry[],
        skills: stored.skills as unknown as string[],
        externalCertifications:
          stored.externalCertifications as unknown as CvExternalCertification[],
        showCareerProfile: stored.showCareerProfile,
      },
      autofill,
      savedAt: stored.updatedAt.toISOString(),
    };
  }

  /**
   * Saves the authored half and returns the whole view again.
   *
   * One save, per §4.11 — the document is written whole rather than
   * section-by-section, which is also what makes reordering entries a normal
   * edit instead of a synchronisation problem.
   *
   * Nothing from `autofill` is accepted here even if a client sends it: the
   * DTO does not declare those fields and the global pipe strips what it does
   * not declare, so a learner cannot post themselves a certificate.
   */
  async save(userId: string, input: SaveCvDto): Promise<CvView> {
    const data = {
      fullName: input.fullName,
      jobTitle: input.jobTitle,
      department: input.department,
      email: input.email,
      phone: input.phone,
      summary: input.summary,
      experience: input.experience as unknown as object,
      education: input.education as unknown as object,
      skills: input.skills as unknown as object,
      externalCertifications: input.externalCertifications as unknown as object,
      showCareerProfile: input.showCareerProfile,
    };

    await this.prisma.cvProfile.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });

    return this.get(userId);
  }

  /**
   * Everything the system contributes.
   *
   * Read on every load, never cached into the row — see the class comment.
   */
  private async autofillFor(
    userId: string,
    user: { fullName: string; department: string; email: string },
  ): Promise<CvAutofill> {
    const [certificates, careerProfile] = await Promise.all([
      this.prisma.certificate.findMany({
        where: { userId },
        select: { id: true, type: true, subjectTitle: true, issuedAt: true },
        orderBy: { issuedAt: 'desc' },
      }),
      this.careerProfileFor(userId),
    ]);

    return {
      accountFullName: user.fullName,
      accountDepartment: user.department,
      accountEmail: user.email,
      certifications: certificates.map((certificate) => ({
        certificateId: certificate.id,
        type: certificate.type,
        /* The title as printed on the certificate, not the live course title —
           the CV and the credential must agree (D-040). */
        title: certificate.subjectTitle,
        issuedAt: certificate.issuedAt.toISOString(),
      })),
      careerProfile,
    };
  }

  /**
   * The career-orientation line: the learner's path and Holland Code.
   *
   * §4.11 calls this "distinctive to this platform", and it is — no ordinary CV
   * carries a validated interest profile. Null before the assessment, because
   * there is nothing to say yet.
   */
  private async careerProfileFor(userId: string): Promise<CvCareerProfile | null> {
    const [result, userPath] = await Promise.all([
      /* Retakes append (D-033), so the newest row is "their result". */
      this.prisma.assessmentResult.findFirst({
        where: { userId },
        select: { code: true },
        orderBy: { completedAt: 'desc' },
      }),
      this.prisma.userPath.findUnique({
        where: { userId },
        select: { status: true, confirmedAt: true, path: { select: { name: true } } },
      }),
    ]);

    if (!result) {
      return null;
    }

    /* A path only counts once committed to — one being built is not yet
       something to put on a CV (D-002). */
    const committed = userPath?.confirmedAt != null;

    return {
      pathName: committed ? (userPath?.path.name ?? null) : null,
      pathCompleted: userPath?.status === 'COMPLETED',
      hollandCode: [...result.code] as RiasecLetter[],
    };
  }
}

export type { CvProfile };

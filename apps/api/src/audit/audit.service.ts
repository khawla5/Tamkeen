import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import type { AuditActionCode, AuditReasonCode } from './audit.actions';

export interface AuditEntry {
  action: AuditActionCode;
  outcome: 'SUCCESS' | 'FAILURE';
  /** Null for anonymous events, e.g. a sign-in against an unknown address. */
  actorUserId?: string | null;
  ipAddress?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  /** Enumerated reason codes only — never free text, which could carry PII. */
  reason?: AuditReasonCode;
  /** Additional structured, non-PII detail. */
  detail?: Record<string, string | number | boolean>;
}

/**
 * The audit trail (§2 security baseline).
 *
 * **The pattern for later phases:** call `record()` from the *service* that
 * performs the change, inside the same flow as the change itself — never from a
 * controller. A controller-level log is bypassed the moment a second caller
 * (a job, an admin action, another service) invokes the same logic.
 *
 * Auditable actions per §2: sign-in, path confirmation, certificate issuance,
 * and every admin or entity change.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Writes an audit entry.
   *
   * Deliberately never throws. An audit write failing must not turn a successful
   * sign-in into a 500 — the user's action already happened, and rolling it back
   * because the *log* failed would be worse than a gap in the log. The failure is
   * reported to the application log so it is not silent.
   *
   * The trade-off is explicit: this system prefers availability of the action
   * over guaranteed completeness of the trail. If a later phase needs
   * tamper-evident, gap-free auditing for a specific action, that action should
   * write its audit entry inside the same database transaction as the change.
   */
  async record(entry: AuditEntry): Promise<void> {
    const metadata: Record<string, string | number | boolean> = { ...entry.detail };
    if (entry.reason) {
      metadata.reason = entry.reason;
    }

    try {
      await this.prisma.auditLog.create({
        data: {
          action: entry.action,
          outcome: entry.outcome,
          actorUserId: entry.actorUserId ?? null,
          ipAddress: entry.ipAddress ?? null,
          targetType: entry.targetType ?? null,
          targetId: entry.targetId ?? null,
          metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to write audit entry ${entry.action}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }
  }
}

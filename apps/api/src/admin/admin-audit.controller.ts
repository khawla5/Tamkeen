import { Controller, Get, Header, Query } from '@nestjs/common';

import type { AdminAuditPage, AdminReports } from '@tamkeen/types';

import { Roles } from '../auth/auth.decorators';
import { AdminAuditService } from './admin-audit.service';
import { AdminAuditQueryDto } from './admin.dto';
import { CSV_CONTENT_TYPE, toCsv } from './csv';

/**
 * §4C.8 — the audit trail and reports.
 *
 * **Read-only, with no write path anywhere in the module.** `AuditService` is
 * the only writer and it is called from the services that perform each change.
 * An endpoint here that could edit or delete an entry would make the trail
 * evidence of nothing, which is why there is not one.
 */
@Controller('admin')
@Roles('SUPER_ADMIN')
export class AdminAuditController {
  constructor(private readonly audit: AdminAuditService) {}

  @Get('audit')
  list(@Query() query: AdminAuditQueryDto): Promise<AdminAuditPage> {
    return this.audit.list(query);
  }

  @Get('reports')
  reports(): Promise<AdminReports> {
    return this.audit.reports();
  }

  /**
   * The reports as CSV (D-076).
   *
   * One file with several sections rather than one endpoint per report: the
   * ministry's question is "how is the programme doing", and answering it in
   * four downloads that have to be reassembled is answering a different one.
   */
  @Get('reports.csv')
  @Header('Content-Type', CSV_CONTENT_TYPE)
  @Header('Content-Disposition', 'attachment; filename="tamkeen-reports.csv"')
  async reportsCsv(): Promise<string> {
    const reports = await this.audit.reports();

    return toCsv(
      ['التقرير', 'البند', 'القيمة', 'قيمة إضافية'],
      [
        ['المسار', 'أكملوا التقييم', reports.journey.assessed, ''],
        ['المسار', 'يختارون دوراتهم', reports.journey.building, ''],
        ['المسار', 'مسارهم قيد التنفيذ', reports.journey.active, ''],
        ['المسار', 'أكملوا المسار', reports.journey.completed, ''],
        ['المسار', 'نسبة إكمال المسارات', reports.journey.pathCompletionRate ?? '', ''],
        ['الشهادات', 'شهادات دورات', reports.certificates.course, ''],
        ['الشهادات', 'شهادات مسارات', reports.certificates.path, ''],
        ...reports.pathPopularity.map((row) => [
          'المسارات الأكثر اختيارًا',
          row.name,
          row.chosen,
          row.completed,
        ]),
        ...reports.codeDistribution.map((row) => [
          'توزيع الأنماط المهنية',
          row.code,
          row.count,
          '',
        ]),
        ...reports.courseOutcomes.map((row) => [
          'نتائج الدورات',
          row.title,
          row.passRate ?? '',
          row.enrolled,
        ]),
      ],
    );
  }

  /** The trail as CSV, honouring whatever filter the screen has applied. */
  @Get('audit.csv')
  @Header('Content-Type', CSV_CONTENT_TYPE)
  @Header('Content-Disposition', 'attachment; filename="tamkeen-audit.csv"')
  async auditCsv(@Query() query: AdminAuditQueryDto): Promise<string> {
    /* Bounded: an export is not a licence to page the whole table into memory,
       and a trail that grows without limit would otherwise make this endpoint
       the way to take the API down. */
    const page = await this.audit.list({ ...query, pageSize: 5_000 });

    /* The target as its *name*, with the id only where nothing resolved — the
       same rule the screen follows (TAM-137). An export whose target column is
       a uuid is one nobody can read without the database open beside them. */
    return toCsv(
      ['التاريخ', 'الإجراء', 'النتيجة', 'المنفِّذ', 'نوع الهدف', 'الهدف', 'السبب', 'التفاصيل'],
      page.rows.map((row) => [
        row.occurredAt,
        row.action,
        row.outcome,
        row.actorName ?? '',
        row.targetType ?? '',
        row.targetLabel ?? row.targetId ?? '',
        row.reason ?? '',
        row.detail ? JSON.stringify(row.detail) : '',
      ]),
    );
  }
}

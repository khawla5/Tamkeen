import { Controller, Get, Header, Query } from '@nestjs/common';

import type { AdminAuditPage, AdminImpactView, AdminReports } from '@tamkeen/types';

import { Roles } from '../auth/auth.decorators';
import { AdminAuditService } from './admin-audit.service';
import { AdminImpactService } from './admin-impact.service';
import { AdminAuditQueryDto, AdminImpactQueryDto } from './admin.dto';
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
  constructor(
    private readonly audit: AdminAuditService,
    private readonly impact: AdminImpactService,
  ) {}

  @Get('audit')
  list(@Query() query: AdminAuditQueryDto): Promise<AdminAuditPage> {
    return this.audit.list(query);
  }

  /**
   * §4C.8's first tab — «الأثر» (TAM-149).
   *
   * It lives on this controller because it is the same page: the reports beside
   * it answer "how is the system doing", this answers "how many of our people
   * took part this quarter, and is it growing". Read-only like everything else
   * here, so nothing is audited beyond the `AUTHZ_DENIED` the guard already
   * writes for a caller who should not be asking.
   */
  @Get('impact')
  impactView(@Query() query: AdminImpactQueryDto): Promise<AdminImpactView> {
    return this.impact.view(query);
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
}

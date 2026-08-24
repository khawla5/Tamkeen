import { Controller, Get } from '@nestjs/common';

import type { AdminCertificateTemplateView } from '@tamkeen/types';

import { Roles } from '../auth/auth.decorators';
import { AdminTemplatesService } from './admin-templates.service';

/**
 * §4C.7 — the certificate face.
 *
 * **There is no write endpoint here, and that is deliberate.** The signature
 * block is three settings, and §4C.6 already owns writing settings — giving this
 * controller its own PATCH would make two writers for one row, which is the
 * divergence D-072 exists to prevent. What this adds is the thing settings
 * cannot give: a rendered preview of what the next certificate will look like.
 *
 * The preview is the real template with sample content, not a mock-up. A preview
 * drawn separately from the renderer is a preview that eventually lies.
 */
@Controller('admin/certificate-template')
@Roles('SUPER_ADMIN')
export class AdminTemplatesController {
  constructor(private readonly templates: AdminTemplatesService) {}

  @Get()
  view(): Promise<AdminCertificateTemplateView> {
    return this.templates.view();
  }
}

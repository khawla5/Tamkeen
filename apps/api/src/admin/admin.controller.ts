import { Controller, Get } from '@nestjs/common';

import type { AdminDashboardView } from '@tamkeen/types';

import { Roles } from '../auth/auth.decorators';
import { AdminDashboardService } from './admin-dashboard.service';

/**
 * The super-admin portal (§4C).
 *
 * **`@Roles('SUPER_ADMIN')` at class level, and nothing else is admitted.**
 * Unlike `EntityController`, which admits an admin alongside an entity because
 * §4C.5 gives them global oversight of the same rows, nothing here has a second
 * legitimate caller. A handler added to this controller in a later sub-phase
 * inherits the restriction rather than shipping open until someone remembers —
 * the same fail-closed posture `SessionGuard` takes for authentication.
 *
 * **There is no scope resolver here and that is the point.** The admin is the
 * one caller for whom the unfiltered read is correct (D-075), so these handlers
 * read directly. Every *other* portal's controller filters first, and the two
 * must not be confused: an endpoint that forgot its filter and an endpoint that
 * is deliberately unfiltered look identical in a diff unless the difference is
 * stated. It is stated here.
 */
@Controller('admin')
@Roles('SUPER_ADMIN')
export class AdminController {
  constructor(private readonly dashboard: AdminDashboardService) {}

  /** §4C.1 — system-wide overview and integration health. */
  @Get('dashboard')
  getDashboard(): Promise<AdminDashboardView> {
    return this.dashboard.get();
  }
}

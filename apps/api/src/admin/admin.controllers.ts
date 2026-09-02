import { AdminAssessmentAssignmentsController } from './admin-assessment-assignments.controller';
import { AdminAssessmentController } from './admin-assessment.controller';
import { AdminAuditController } from './admin-audit.controller';
import { AdminEnglishController } from './admin-english.controller';
import { AdminCoursesController } from './admin-courses.controller';
import { AdminSettingsController } from './admin-settings.controller';
import { AdminTemplatesController } from './admin-templates.controller';
import { AdminPathsController } from './admin-paths.controller';
import { AdminUsersController } from './admin-users.controller';
import { AdminController } from './admin.controller';

/**
 * Every controller of the super-admin portal, in one list.
 *
 * **`AdminModule` registers this array and `admin-rbac.e2e-spec.ts` imports the
 * same one.** That is the whole reason it exists: the RBAC suite reflects Nest's
 * routing metadata off whatever is in here and asserts each route against an
 * employee, an entity and an anonymous caller. A controller added in a later
 * sub-phase is therefore covered the moment it is *routable*, with no second
 * place to remember.
 *
 * The alternative — one enormous controller — would give the same guarantee and
 * was the shape 5.1 started from. It stops scaling at eight pages: §4C's
 * surface is roughly forty endpoints, and a single file holding all of them
 * makes the boundary between "users" and "settings" a matter of scrolling.
 * A list of controllers keeps both properties.
 *
 * **Anything added here must carry `@Roles('SUPER_ADMIN')` at class level.**
 * The suite proves it, rather than trusting it.
 */
export const ADMIN_CONTROLLERS = [
  AdminController,
  AdminUsersController,
  AdminAssessmentController,
  /* §4C.9 — the English placement test's own editor (D-124). A separate
     controller, so the RBAC suite covers it the moment it is routable. */
  AdminEnglishController,
  /* §4C.3 — assigning instruments and groups to everyone, a department or a
     person (TAM-147). */
  AdminAssessmentAssignmentsController,
  AdminPathsController,
  AdminCoursesController,
  AdminSettingsController,
  AdminTemplatesController,
  AdminAuditController,
];

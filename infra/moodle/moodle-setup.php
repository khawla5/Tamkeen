<?php
/**
 * Configures a fresh local Moodle for the Tamkeen integration (§5.1) —
 * idempotent, so re-running repairs rather than duplicates.
 *
 *   docker exec tamkeen-moodle php /tmp/moodle-setup.php --secret=<sso-secret>
 *
 * What it does, in order:
 *   1. Enables web services + the REST protocol (+ completion tracking).
 *   2. Creates the integration user (never logs in interactively).
 *   3. Creates the least-privilege "Tamkeen Integration" role, assigns the
 *      capability set the adapter's eleven WS functions need — including the
 *      four fixes Phase 2's original list missed (moodle/role:assign, the
 *      allow-assignments matrix rows for student and editingteacher,
 *      gradereport/user:view, and the manual-enrol welcome message off).
 *   4. Creates the restricted external service with exactly those functions,
 *      authorises the integration user, and mints the WS token.
 *   5. Stores the local_tamkeensso shared secret.
 *   6. Allows the Tamkeen portal — and only it — to frame Moodle (TAM-129):
 *      allowframembedding on, plus the plugin's frame-ancestors origin.
 *
 * The token is printed ONCE on stdout as MOODLE_WS_TOKEN=... — copy it to .env.
 */

define('CLI_SCRIPT', true);

require '/opt/bitnami/moodle/config.php';
require_once $CFG->libdir . '/clilib.php';
require_once $CFG->dirroot . '/user/lib.php';
require_once $CFG->dirroot . '/webservice/lib.php';

list($options, $unrecognised) = cli_get_params(['secret' => '', 'appurl' => ''], []);
if ($options['secret'] === '') {
    cli_error('Pass --secret=<sso-secret> (the driver generates one).');
}

$syscontext = context_system::instance();

// ── 1. Web services + REST + completion ─────────────────────────────────────
set_config('enablewebservices', 1);
set_config('webserviceprotocols', 'rest');
set_config('enablecompletion', 1);
// Phase 2 fix #4: the manual-enrol welcome email confuses learners who only
// ever enter Moodle through the seamless handoff.
set_config('sendcoursewelcomemessage', 0, 'enrol_manual');
cli_writeln('web services + REST enabled');

// ── 2. Integration user ─────────────────────────────────────────────────────
$username = 'tamkeen-integration';
$user = $DB->get_record('user', ['username' => $username, 'deleted' => 0]);
if (!$user) {
    $userid = user_create_user((object) [
        'username'  => $username,
        'password'  => bin2hex(random_bytes(16)) . 'Aa1!', // never used interactively
        'firstname' => 'Tamkeen',
        'lastname'  => 'Integration',
        'email'     => 'integration@ministry.gov.example',
        'auth'      => 'manual',
        'confirmed' => 1,
        'mnethostid' => $CFG->mnet_localhost_id,
    ], true, false);
    $user = $DB->get_record('user', ['id' => $userid]);
    cli_writeln('integration user created');
} else {
    cli_writeln('integration user exists');
}

// ── 3. Role + capabilities ──────────────────────────────────────────────────
$shortname = 'tamkeenws';
$roleid = $DB->get_field('role', 'id', ['shortname' => $shortname]);
if (!$roleid) {
    $roleid = create_role('Tamkeen Integration', $shortname,
        'Least-privilege role for the Tamkeen web-services account (§5.1).');
    cli_writeln('role created');
} else {
    cli_writeln('role exists');
}
set_role_contextlevels($roleid, [CONTEXT_SYSTEM]);

$capabilities = [
    'webservice/rest:use',
    // users: provision + the lookups D-038 constrains
    'moodle/user:create',
    'moodle/user:viewdetails',
    'moodle/user:viewhiddendetails',
    // courses: catalogue sync + entity course shells (D-060)
    'moodle/course:create',
    'moodle/course:view',
    'moodle/course:viewhiddencourses',
    'moodle/course:update',
    'moodle/course:viewparticipants',
    // enrolment: learners at confirm, entities as editingteacher
    'enrol/manual:enrol',
    'moodle/role:assign',           // Phase 2 fix #1
    // completion + grades, read for any learner
    'gradereport/user:view',        // Phase 2 fix #3
    'moodle/grade:viewall',
    'report/completion:view',
];
// The content read-back (§4B.4, D-061) must see EVERY activity, published or
// not. `core_course_get_contents` drops a module the calling user may not
// view, and a module's own `mod/<name>:view` capability decides that for a
// user who is not enrolled — so without these the quiz an entity just added is
// invisible to the read-back and the publish gate keeps refusing for a reason
// the entity has already fixed (found 2026-08-25, TAM-139 follow-up). Granted
// for every installed module rather than a hand-kept list, plus hidden
// activities/sections, which an author may keep hidden until publishing.
// Bound parameters: a literal ':view' would be read as a named placeholder.
$viewcaps = $DB->get_fieldset_select('capabilities', 'name',
    'name LIKE :pattern OR name = :book', ['pattern' => 'mod/%:view', 'book' => 'mod/book:read']);
$capabilities = array_merge($capabilities, $viewcaps, [
    'moodle/course:viewhiddenactivities',
    'moodle/course:viewhiddensections',
]);

foreach ($capabilities as $capability) {
    assign_capability($capability, CAP_ALLOW, $roleid, $syscontext->id, true);
}
// Phase 2 fix #2: the allow-assignments matrix — without these rows,
// enrol_manual_enrol_users may not hand out the student/teacher roles.
// Guarded: the helper inserts unconditionally and a re-run would die on the
// unique index, which is the opposite of "safe to re-run".
foreach ([5 /* student */, 3 /* editingteacher */] as $allowed) {
    if (!$DB->record_exists('role_allow_assign', ['roleid' => $roleid, 'allowassign' => $allowed])) {
        core_role_set_assign_allowed($roleid, $allowed);
    }
}
role_assign($roleid, $user->id, $syscontext->id);
$syscontext->mark_dirty();
cli_writeln('capabilities assigned (' . count($capabilities) . ')');

// ── 4. External service, functions, token ───────────────────────────────────
$functions = [
    'core_webservice_get_site_info',
    'core_user_create_users',
    'core_user_get_users_by_field',
    'core_course_get_courses',
    'core_course_get_courses_by_field',
    'core_course_get_contents',
    'core_course_create_courses',
    'core_enrol_get_users_courses',
    'enrol_manual_enrol_users',
    'core_completion_get_course_completion_status',
    'gradereport_user_get_grade_items',
];

$webservicemanager = new webservice();
$service = $DB->get_record('external_services', ['shortname' => 'tamkeen']);
if (!$service) {
    $serviceid = $webservicemanager->add_external_service((object) [
        'name' => 'Tamkeen',
        'shortname' => 'tamkeen',
        'enabled' => 1,
        'restrictedusers' => 1,
        'downloadfiles' => 0,
        'uploadfiles' => 0,
    ]);
    $service = $DB->get_record('external_services', ['id' => $serviceid]);
    cli_writeln('external service created');
} else {
    cli_writeln('external service exists');
}

foreach ($functions as $function) {
    if (!$DB->record_exists('external_services_functions',
            ['externalserviceid' => $service->id, 'functionname' => $function])) {
        $webservicemanager->add_external_function_to_service($function, $service->id);
    }
}
cli_writeln('service functions in place (' . count($functions) . ')');

if (!$DB->record_exists('external_services_users',
        ['externalserviceid' => $service->id, 'userid' => $user->id])) {
    $webservicemanager->add_ws_authorised_user((object) [
        'externalserviceid' => $service->id,
        'userid' => $user->id,
    ]);
}

$existingtoken = $DB->get_record_sql(
    'SELECT t.token FROM {external_tokens} t
      WHERE t.externalserviceid = :sid AND t.userid = :uid',
    ['sid' => $service->id, 'uid' => $user->id], IGNORE_MULTIPLE);
if ($existingtoken) {
    $token = $existingtoken->token;
    cli_writeln('token exists (reusing)');
} else {
    $token = \core_external\util::generate_token(
        EXTERNAL_TOKEN_PERMANENT, $service, $user->id, $syscontext);
    cli_writeln('token minted');
}

// ── 5. Seamless-login shared secret (D-044) ─────────────────────────────────
set_config('secret', $options['secret'], 'local_tamkeensso');
cli_writeln('SSO secret stored');

// ── 6. Framing by the portal only (TAM-129) ─────────────────────────────────
// `allowframembedding` removes Moodle's X-Frame-Options; on its own that lets
// any site frame a login page, so the plugin sends frame-ancestors for the
// one origin given here. Skipped entirely when no --appurl is passed.
if ($options['appurl'] !== '') {
    set_config('allowframembedding', 1);
    set_config('allowedframeancestor', $options['appurl'], 'local_tamkeensso');
    cli_writeln('framing allowed from ' . $options['appurl']);
} else {
    cli_writeln('no --appurl: framing left as is');
}

cli_writeln('');
cli_writeln('MOODLE_WS_TOKEN=' . $token);

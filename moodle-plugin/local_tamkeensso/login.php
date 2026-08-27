<?php
/**
 * Seamless-login endpoint for the Tamkeen platform.
 *
 * The Tamkeen app is the identity owner. A learner who is already signed in
 * there must reach a Moodle course without meeting a second login, and core
 * Moodle cannot do that for an arbitrary user: every mechanism it offers mints a
 * session for the web-service token's *own* user, and the integration token
 * belongs to the integration account rather than to the learner.
 *
 * So Tamkeen mints a short-lived, single-use, HMAC-signed token bound to one
 * user and one course, and this endpoint spends it.
 *
 * Order of checks matters, and each rejection is deliberately indistinguishable
 * to the caller beyond its own message: signature first (so nothing else is
 * parsed from an unauthenticated payload), then expiry, then single use, then
 * the account.
 *
 * @package   local_tamkeensso
 * @license   https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

require_once(__DIR__ . '/../../config.php');

// This page must never be cached: the URL carries a credential.
header('Cache-Control: no-store, no-cache, must-revalidate, private');
header('Pragma: no-cache');
header('Referrer-Policy: no-referrer');

$token = required_param('token', PARAM_RAW);
// Embed mode (TAM-129): `author` opens the course inside the Tamkeen portal's
// frame with editing on and Moodle's own chrome hidden. Not part of the signed
// token — being framed grants nothing, so it needs no signature. Any other
// value is ignored rather than rejected.
$embed = optional_param('embed', '', PARAM_ALPHA);
$secret = (string) get_config('local_tamkeensso', 'secret');

$PAGE->set_url(new moodle_url('/local/tamkeensso/login.php'));
$PAGE->set_context(context_system::instance());

// Refuse to run unconfigured rather than fall back to something weaker. A short
// secret would make the signature decorative, so the same floor the platform
// enforces at mint time is enforced here at spend time.
if (strlen($secret) < 32) {
    local_tamkeensso_fail('error_disabled');
}

$claims = local_tamkeensso_verify($token, $secret);

if ($claims === null) {
    local_tamkeensso_fail('error_invalid');
}

if ($claims->expiresat <= time()) {
    local_tamkeensso_fail('error_expired');
}

// Single use. The unique index on `nonce` is what actually enforces this: two
// simultaneous requests both pass a "have I seen this?" read, and only the
// insert can decide the race. Catching the constraint violation is the check,
// not a fallback for one.
$spent = (object) [
    'nonce'     => $claims->nonce,
    'userid'    => $claims->moodleuserid,
    'expiresat' => $claims->expiresat,
    'usedat'    => time(),
];

try {
    $DB->insert_record('local_tamkeensso_used', $spent);
} catch (dml_exception $e) {
    local_tamkeensso_fail('error_used');
}

// Opportunistic cleanup. The table only ever holds tokens from the last few
// minutes, so this stays small without needing a scheduled task.
$DB->delete_records_select('local_tamkeensso_used', 'expiresat < ?', [time() - DAYSECS]);

$user = $DB->get_record('user', [
    'id'      => $claims->moodleuserid,
    'deleted' => 0,
    'suspended' => 0,
], '*', IGNORE_MISSING);

if (!$user || $user->mnethostid != $CFG->mnet_localhost_id) {
    local_tamkeensso_fail('error_nouser');
}

// If someone else is already signed in on this browser, their session is
// replaced rather than reused — otherwise a shared machine would silently carry
// one learner's session into another learner's course.
if (isloggedin() && !isguestuser() && (int) $USER->id !== (int) $user->id) {
    require_logout();
}

if (!isloggedin() || isguestuser() || (int) $USER->id !== (int) $user->id) {
    complete_user_login($user);
}

if ($embed === 'author' || $embed === 'learner') {
    // Remembered for the whole session: every later page in the frame reads
    // it (hook_callbacks) to hide the chrome and post the ready message.
    // 'learner' (D-121): the course framed by the learner portal — no editing,
    // and the quiz review page announces itself.
    $SESSION->tamkeen_embed = $embed;
    // Editing on from the first page. The edit-mode switch sits in the navbar
    // the embed hides, and it is a per-session flag, so setting it here is
    // exactly what the switch would do. Moodle still checks the capability
    // before honouring it, so a learner gains nothing from it.
    $USER->editing = $embed === 'author' ? 1 : 0;
} else {
    unset($SESSION->tamkeen_embed);
    unset($SESSION->tamkeen_content_changed);
}

$courseid = (int) $claims->moodlecourseid;
$course = $DB->get_record('course', ['id' => $courseid], 'id', IGNORE_MISSING);

// The token binds one course, so a missing one means the catalogue and Moodle
// have diverged. The learner is signed in either way; sending them to the
// dashboard beats a raw error page.
$target = $course
    ? new moodle_url('/course/view.php', ['id' => $courseid])
    : new moodle_url('/my/');

redirect($target);

/**
 * Verifies the signature and shape of a handoff token.
 *
 * Returns the claims, or null. Deliberately returns null for every failure
 * rather than distinguishing them: the caller learns only that the token was
 * not usable.
 *
 * @param string $token
 * @param string $secret
 * @return stdClass|null
 */
function local_tamkeensso_verify(string $token, string $secret): ?stdClass {
    $parts = explode('.', $token);

    if (count($parts) !== 2) {
        return null;
    }

    [$encoded, $signature] = $parts;

    $expected = local_tamkeensso_b64url_encode(
        hash_hmac('sha256', $encoded, $secret, true)
    );

    // hash_equals is constant-time: a byte-by-byte comparison would let an
    // attacker recover a valid signature one character at a time by timing.
    if (!hash_equals($expected, $signature)) {
        return null;
    }

    $payload = json_decode(local_tamkeensso_b64url_decode($encoded));

    if (!is_object($payload)) {
        return null;
    }

    // The platform emits camelCase; normalise once, here, so nothing downstream
    // has to know that.
    $claims = (object) [
        'moodleuserid'   => isset($payload->moodleUserId) ? (int) $payload->moodleUserId : 0,
        'moodlecourseid' => isset($payload->moodleCourseId) ? (int) $payload->moodleCourseId : 0,
        'expiresat'      => isset($payload->expiresAt) ? (int) $payload->expiresAt : 0,
        'nonce'          => isset($payload->nonce) ? (string) $payload->nonce : '',
    ];

    if ($claims->moodleuserid <= 0 || $claims->moodlecourseid <= 0) {
        return null;
    }

    // A nonce that is empty or absurdly long is not one we minted.
    if ($claims->nonce === '' || strlen($claims->nonce) > 64) {
        return null;
    }

    return $claims;
}

function local_tamkeensso_b64url_encode(string $raw): string {
    return rtrim(strtr(base64_encode($raw), '+/', '-_'), '=');
}

function local_tamkeensso_b64url_decode(string $value): string {
    return (string) base64_decode(strtr($value, '-_', '+/'), false);
}

/**
 * Stops with a learner-facing message.
 *
 * Never echoes the token or any part of it: this page is reached with a
 * credential in the URL, and an error page that reflected it would put it into
 * screenshots and support tickets.
 *
 * @param string $stringkey
 * @return never
 */
function local_tamkeensso_fail(string $stringkey) {
    global $OUTPUT, $PAGE;

    $PAGE->set_title(get_string('pluginname', 'local_tamkeensso'));
    echo $OUTPUT->header();
    echo $OUTPUT->notification(get_string($stringkey, 'local_tamkeensso'), 'error');
    echo $OUTPUT->footer();
    die();
}

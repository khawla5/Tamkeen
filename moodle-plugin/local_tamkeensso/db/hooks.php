<?php
/**
 * Hook callbacks for local_tamkeensso (TAM-129).
 *
 * Two hooks, both from Moodle's 4.3+ hook API rather than the legacy
 * `lib.php` callbacks, so nothing here needs a theme edit and it survives
 * upgrades:
 *
 *  - before_http_headers: sends the `frame-ancestors` policy that restricts
 *    who may frame this site. `allowframembedding` alone would let ANY site
 *    frame a Moodle login page, which is a clickjacking hole rather than a
 *    configuration toggle.
 *  - before_standard_head_html_generation: when the session was opened in embed
 *    mode, injects the CSS that hides Moodle's own chrome and the script that
 *    tells the framing page it is ready.
 *
 * @package   local_tamkeensso
 * @license   https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

defined('MOODLE_INTERNAL') || die();

$callbacks = [
    [
        'hook' => \core\hook\output\before_http_headers::class,
        'callback' => \local_tamkeensso\hook_callbacks::class . '::before_http_headers',
        'priority' => 500,
    ],
    [
        'hook' => \core\hook\output\before_standard_head_html_generation::class,
        'callback' => \local_tamkeensso\hook_callbacks::class . '::before_standard_head_html_generation',
        'priority' => 500,
    ],
];

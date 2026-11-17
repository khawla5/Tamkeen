<?php
/**
 * Hook callbacks: frame-ancestors policy, and the embedded-mode chrome.
 *
 * @package   local_tamkeensso
 * @license   https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace local_tamkeensso;

defined('MOODLE_INTERNAL') || die();

class hook_callbacks {
    /**
     * Restricts who may frame this site to the Tamkeen portal (TAM-129).
     *
     * Moodle's `allowframembedding` only removes its own `X-Frame-Options:
     * sameorigin`; on its own it lets any site frame a Moodle page, including
     * the login page. `frame-ancestors` is the modern replacement and takes a
     * list, so the portal and Moodle itself are allowed and nothing else.
     *
     * Sent on every page, not only embedded ones: the policy protects the
     * pages a hostile site would try to frame, which are precisely the ones
     * not opened through the handoff.
     */
    public static function before_http_headers(\core\hook\output\before_http_headers $hook): void {
        $origin = self::allowed_ancestor();

        if ($origin === null || headers_sent()) {
            return;
        }

        header("Content-Security-Policy: frame-ancestors 'self' {$origin}");
    }

    /**
     * Hides Moodle's chrome and announces readiness when the session was opened
     * in embed mode (login.php?embed=author).
     *
     * What is hidden: the top navbar (site logo, primary navigation — the
     * entries that lead OUT of the course — and the user menu), the footer,
     * and the breadcrumb. What stays: the secondary course navigation
     * (Settings, Participants, Grades, More…) and the course index, because the
     * quiz editor, question bank and activity settings are reached through
     * them and the editor is unusable without them.
     *
     * The edit-mode switch lives in the hidden navbar; login.php turns editing
     * on for the session instead, so an author never needs the switch.
     */
    public static function before_standard_head_html_generation(
        \core\hook\output\before_standard_head_html_generation $hook
    ): void {
        global $SESSION, $PAGE;

        if (empty($SESSION->tamkeen_embed)) {
            return;
        }

        $mode = (string) $SESSION->tamkeen_embed;
        $origin = self::allowed_ancestor();
        $changed = !empty($SESSION->tamkeen_content_changed);
        // Consumed: one change, one message.
        unset($SESSION->tamkeen_content_changed);
        // A learner has just submitted a quiz when the review page renders
        // (D-121); the portal then asks for an on-demand completion sync.
        $quizfinished = $mode === 'learner' && strpos((string) $PAGE->pagetype, 'mod-quiz-review') === 0;
        // Which activity this page is — the portal's previous/next keeps in
        // step with what the frame shows (D-122). Null on the course page.
        $cmid = ($PAGE->cm !== null) ? (int) $PAGE->cm->id : null;

        $hook->add_html(self::chrome_css($mode));

        if ($origin !== null) {
            $hook->add_html(self::messaging_script($origin, $changed, $quizfinished, $cmid));
        }
    }

    /**
     * The configured framing origin, normalised to scheme://host[:port], or
     * null when unset or unparseable. A malformed value fails closed — no
     * header, no messages — rather than sending a policy nobody wrote.
     */
    public static function allowed_ancestor(): ?string {
        $raw = trim((string) get_config('local_tamkeensso', 'allowedframeancestor'));

        if ($raw === '') {
            return null;
        }

        $parts = parse_url($raw);

        if (empty($parts['scheme']) || empty($parts['host'])) {
            return null;
        }

        if (!in_array(strtolower($parts['scheme']), ['http', 'https'], true)) {
            return null;
        }

        $origin = strtolower($parts['scheme']) . '://' . strtolower($parts['host']);

        if (!empty($parts['port'])) {
            $origin .= ':' . (int) $parts['port'];
        }

        return $origin;
    }

    private static function chrome_css(string $mode): string {
        // Selectors are Boost 4.x. `!important` because the theme sets the
        // 60px navbar offset with its own specificity; this must win without a
        // theme edit.
        return '<style id="tamkeen-embed">'
            . 'nav.navbar.fixed-top,#page-footer,#page-header .breadcrumb,'
            . 'nav[aria-label="Navigation bar"],.tamkeen-embed-hidden,'
            // Moodle's first-visit user tour: onboarding for a chrome the frame
            // does not show, so it would point at things that are not there.
            . '[data-flexitour="container"],[data-flexitour="backdrop"],'
            . '[data-flexitour="step-background"],.tour-backdrop{display:none!important}'
            . '#page,#page.drawers,#page-wrapper,#topofscroll{margin-top:0!important;padding-top:0!important}'
            . '.drawer{top:0!important;height:100vh!important}'
            . '.drawer-toggles .drawer-toggler{top:.5rem!important}'
            . 'body{scroll-padding-top:0!important}'
            // Learners have no business in Settings / Participants / Grades:
            // the course tabs go too, leaving the material and the course index.
            // …and the course heading, which the portal's own panel already shows.
            . ($mode === 'learner' ? '.secondary-navigation,#page-header .page-header-headings{display:none!important}' : '')
            . '</style>';
    }

    private static function messaging_script(string $origin, bool $changed, bool $quizfinished = false, ?int $cmid = null): string {
        // Target origin is the configured ancestor, never `*`: a message to a
        // wildcard would reach whatever framed the page, and the whole point
        // of frame-ancestors is that only the portal can.
        $originjson = json_encode($origin, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT);
        $changedjson = $changed ? 'true' : 'false';
        $quizjson = $quizfinished ? 'true' : 'false';
        $cmidjson = $cmid === null ? 'null' : (string) $cmid;

        return '<script id="tamkeen-embed-messages">(function(){'
            . 'var origin=' . $originjson . ';'
            . 'if(!origin||window.parent===window){return;}'
            . 'function post(message){try{window.parent.postMessage(message,origin);}catch(e){}}'
            . 'function announce(){post({type:"tamkeen:ready",cmid:' . $cmidjson . '});'
            . 'if(' . $changedjson . '){post({type:"tamkeen:content-changed"});}'
            . 'if(' . $quizjson . '){post({type:"tamkeen:quiz-finished"});}}'
            . 'if(document.readyState==="loading"){document.addEventListener("DOMContentLoaded",announce);}'
            . 'else{announce();}'
            . '})();</script>';
    }
}

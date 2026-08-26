<?php
/**
 * Event observer: remembers that course content changed in this session.
 *
 * @package   local_tamkeensso
 * @license   https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace local_tamkeensso;

defined('MOODLE_INTERNAL') || die();

class observer {
    /**
     * Sets a session flag the head hook turns into one `tamkeen:content-changed`
     * message on the next render. Only meaningful inside an embedded session —
     * elsewhere nobody is listening, so the flag is simply never read.
     *
     * The observer runs in the request that made the change (Moodle's default
     * observers are synchronous), so `$SESSION` here is the author's own.
     *
     * @param \core\event\base $event
     */
    public static function content_changed(\core\event\base $event): void {
        global $SESSION;

        if (empty($SESSION->tamkeen_embed)) {
            return;
        }

        $SESSION->tamkeen_content_changed = true;
    }
}

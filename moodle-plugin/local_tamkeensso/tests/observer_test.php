<?php
/**
 * Covers `observer::content_changed` against the event that triggers it
 * (§4B.4, TAM-133): a course-level edit — name, summary, visibility, format —
 * made from the course's own Settings tab, exactly as `course_module_*` and
 * `course_section_*` edits already did.
 *
 * This suite runs under Moodle's own PHPUnit harness (`php admin/tool/phpunit/cli/init.php`
 * against a full Moodle checkout with this plugin installed) — there is no
 * Moodle instance in this repository to run it against, so it is verified by
 * inspection here rather than by a green run. It follows the same
 * `advanced_testcase` / `resetAfterTest` conventions every Moodle core and
 * plugin suite uses.
 *
 * @package   local_tamkeensso
 * @license   https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace local_tamkeensso;

defined('MOODLE_INTERNAL') || die();

final class observer_test extends \advanced_testcase {
    protected function setUp(): void {
        parent::setUp();
        $this->resetAfterTest();
    }

    /** Builds a `course_updated` event for a real course, the same event
     *  Moodle fires when the Settings tab is saved. */
    private function course_updated_event(\stdClass $course): \core\event\course_updated {
        return \core\event\course_updated::create([
            'objectid' => $course->id,
            'context' => \context_course::instance($course->id),
            'other' => ['shortname' => $course->shortname],
        ]);
    }

    public function test_course_updated_sets_the_session_flag_inside_an_embedded_session(): void {
        global $SESSION;

        $course = $this->getDataGenerator()->create_course();
        $SESSION->tamkeen_embed = true;
        unset($SESSION->tamkeen_content_changed);

        observer::content_changed($this->course_updated_event($course));

        $this->assertTrue(!empty($SESSION->tamkeen_content_changed));
    }

    /**
     * Outside an embedded session nobody is listening for the message the
     * flag would eventually become, so the observer must not set it — a
     * flag that lingers past the request it belongs to would surface as a
     * stray "content changed" message on a later, unrelated embed.
     */
    public function test_course_updated_does_nothing_outside_an_embedded_session(): void {
        global $SESSION;

        $course = $this->getDataGenerator()->create_course();
        unset($SESSION->tamkeen_embed);
        unset($SESSION->tamkeen_content_changed);

        observer::content_changed($this->course_updated_event($course));

        $this->assertTrue(empty($SESSION->tamkeen_content_changed));
    }

    /**
     * The observer is registered for `course_updated` in `db/events.php`
     * (TAM-133) — this is the wiring, not the behaviour above, and a typo in
     * the event name there would pass every test in this file while the
     * feature quietly never fired in production.
     */
    public function test_course_updated_is_registered_in_db_events(): void {
        global $CFG;

        $observers = [];
        require($CFG->dirroot . '/local/tamkeensso/db/events.php');

        $registered = array_column($observers, 'eventname');

        $this->assertContains('\core\event\course_updated', $registered);
    }
}

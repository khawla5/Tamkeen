<?php
/**
 * Event observers for local_tamkeensso (TAM-129).
 *
 * The framing portal shows a read-back of what the course holds (activities,
 * quiz, completion criteria — D-061), and mirrors the course's own name,
 * summary and visibility (§4B.4, TAM-133). Rather than polling, the plugin
 * remembers that something changed in this session and posts one message to
 * the parent on the next page render. Course structure and course-level
 * settings are both observed; nothing about learners or grades ever crosses
 * the frame boundary.
 *
 * @package   local_tamkeensso
 * @license   https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

defined('MOODLE_INTERNAL') || die();

$observers = [
    [
        'eventname' => '\core\event\course_module_created',
        'callback' => '\local_tamkeensso\observer::content_changed',
    ],
    [
        'eventname' => '\core\event\course_module_updated',
        'callback' => '\local_tamkeensso\observer::content_changed',
    ],
    [
        'eventname' => '\core\event\course_module_deleted',
        'callback' => '\local_tamkeensso\observer::content_changed',
    ],
    [
        'eventname' => '\core\event\course_section_created',
        'callback' => '\local_tamkeensso\observer::content_changed',
    ],
    [
        'eventname' => '\core\event\course_section_updated',
        'callback' => '\local_tamkeensso\observer::content_changed',
    ],
    [
        'eventname' => '\core\event\course_section_deleted',
        'callback' => '\local_tamkeensso\observer::content_changed',
    ],
    [
        'eventname' => '\core\event\course_completion_updated',
        'callback' => '\local_tamkeensso\observer::content_changed',
    ],
    /*
     * The frame also signals course-level edits (§4B.4, TAM-133): a rename, a
     * summary edit, a visibility toggle or a format change, all made from the
     * course's own Settings tab. One message type is enough — the portal
     * reacts to `tamkeen:content-changed` the same way whether the change was
     * to the course's structure or to the course itself, so this reuses the
     * same observer rather than teaching the frame a second message.
     */
    [
        'eventname' => '\core\event\course_updated',
        'callback' => '\local_tamkeensso\observer::content_changed',
    ],
];

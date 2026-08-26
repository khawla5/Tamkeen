<?php
/**
 * Event observers for local_tamkeensso (TAM-129).
 *
 * The framing portal shows a read-back of what the course holds (activities,
 * quiz, completion criteria — D-061). Rather than polling, the plugin remembers
 * that something changed in this session and posts one message to the parent
 * on the next page render. Only course-structure events are observed: nothing
 * about learners or grades ever crosses the frame boundary.
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
];

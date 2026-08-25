<?php
define('CLI_SCRIPT', true);
require '/opt/bitnami/moodle/config.php';
require_once $CFG->libdir . '/gradelib.php';

// marks reviewable immediately after, later while open, and after close.
$reviewmarks = 0x01000 | 0x00100 | 0x00010;

foreach ([6, 7, 8, 9, 10] as $courseid) {
    $quiz = $DB->get_record('quiz', ['course' => $courseid], '*', MUST_EXIST);
    $quiz->reviewmarks = $reviewmarks;
    $quiz->reviewattempt = 0x10000 | $reviewmarks;
    $DB->update_record('quiz', $quiz);

    $item = grade_item::fetch([
        'courseid' => $courseid, 'itemtype' => 'mod', 'itemmodule' => 'quiz', 'iteminstance' => $quiz->id,
    ]);
    $item->set_hidden(0, true);
    grade_regrade_final_grades($courseid);
    echo "course $courseid: quiz grades visible\n";
}

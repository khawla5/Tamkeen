<?php
define('CLI_SCRIPT', true);
require '/opt/bitnami/moodle/config.php';
require_once $CFG->libdir . '/clilib.php';
require_once $CFG->dirroot . '/lib/completionlib.php';
require_once $CFG->dirroot . '/completion/criteria/completion_criteria_activity.php';

foreach (['TAMKEEN-T1', 'TAMKEEN-T2', 'TAMKEEN-T3', 'TAMKEEN-T4', 'TAMKEEN-T5'] as $shortname) {
    $course = $DB->get_record('course', ['shortname' => $shortname], '*', MUST_EXIST);
    $quiz = $DB->get_record('quiz', ['course' => $course->id], '*', MUST_EXIST);
    $module = $DB->get_field('modules', 'id', ['name' => 'quiz'], MUST_EXIST);
    $cm = $DB->get_record('course_modules',
        ['course' => $course->id, 'module' => $module, 'instance' => $quiz->id], '*', MUST_EXIST);

    if ($DB->record_exists('course_completion_criteria', ['course' => $course->id])) {
        cli_writeln($shortname . ': criteria already present');
        continue;
    }

    $data = new stdClass();
    $data->id = $course->id;
    $data->criteria_activity = [$cm->id => 1];
    $criterion = new completion_criteria_activity();
    $criterion->update_config($data);

    foreach ([null, COMPLETION_CRITERIA_TYPE_ACTIVITY] as $type) {
        $aggdata = ['course' => $course->id, 'criteriatype' => $type];
        $aggregation = new completion_aggregation($aggdata);
        $aggregation->setMethod(COMPLETION_AGGREGATION_ALL);
        $aggregation->save();
    }

    $count = $DB->count_records('course_completion_criteria', ['course' => $course->id]);
    cli_writeln($shortname . ': criteria rows now ' . $count);
}
cli_writeln('done');

<?php
/**
 * Creates five Arabic test courses, each completable end to end (§5.5):
 * a one-question multiple-choice quiz, activity completion on receiving a
 * grade, and course completion criteria on that quiz — so the whole loop
 * (enrol → take quiz → completion sync detects grade + completion) is
 * provable against this instance without touching the Moodle UI.
 *
 *   docker exec tamkeen-moodle php /tmp/moodle-testcourses.php
 *
 * Idempotent: a course whose shortname already exists is skipped whole.
 */

define('CLI_SCRIPT', true);

require '/opt/bitnami/moodle/config.php';
require_once $CFG->libdir . '/clilib.php';
require_once $CFG->dirroot . '/course/lib.php';
require_once $CFG->dirroot . '/course/modlib.php';
require_once $CFG->dirroot . '/lib/completionlib.php';
require_once $CFG->dirroot . '/completion/criteria/completion_criteria_activity.php';
require_once $CFG->dirroot . '/question/engine/bank.php';

// add_moduleinfo saves draft files against $USER — a CLI run has none.
\core\session\manager::set_user(get_admin());

$courses = [
    ['shortname' => 'TAMKEEN-T1', 'fullname' => 'أساسيات التحول الرقمي (تجريبية)'],
    ['shortname' => 'TAMKEEN-T2', 'fullname' => 'مقدمة في أمن المعلومات (تجريبية)'],
    ['shortname' => 'TAMKEEN-T3', 'fullname' => 'مهارات التواصل المؤسسي (تجريبية)'],
    ['shortname' => 'TAMKEEN-T4', 'fullname' => 'إدارة المشاريع الحكومية (تجريبية)'],
    ['shortname' => 'TAMKEEN-T5', 'fullname' => 'خدمة المستفيدين (تجريبية)'],
];

foreach ($courses as $definition) {
  try {
    if ($DB->record_exists('course', ['shortname' => $definition['shortname']])) {
        cli_writeln($definition['shortname'] . ' exists — skipped');
        continue;
    }

    // ── the course, with completion tracking on ─────────────────────────────
    $course = create_course((object) [
        'fullname' => $definition['fullname'],
        'shortname' => $definition['shortname'],
        'category' => 1,
        'summary' => 'دورة تجريبية لإثبات حلقة الإكمال: اختبار من سؤال واحد.',
        'summaryformat' => FORMAT_HTML,
        'format' => 'topics',
        'numsections' => 1,
        'enablecompletion' => 1,
        'visible' => 1,
        'lang' => 'ar',
    ]);
    cli_writeln($definition['shortname'] . ': course ' . $course->id);

    // ── one multiple-choice question in the course's question bank ──────────
    $context = context_course::instance($course->id);
    require_once $CFG->libdir . '/questionlib.php';
    $category = question_make_default_categories([$context]);

    $questionid = $DB->insert_record('question', (object) [
        'parent' => 0,
        'name' => 'سؤال التحقق',
        'questiontext' => 'هل أكملت محتوى هذه الدورة؟',
        'questiontextformat' => FORMAT_HTML,
        'generalfeedback' => '',
        'generalfeedbackformat' => FORMAT_HTML,
        'defaultmark' => 1,
        'penalty' => 0,
        'qtype' => 'multichoice',
        'length' => 1,
        'stamp' => make_unique_id_code(),
        'timecreated' => time(),
        'timemodified' => time(),
        'createdby' => 2, // admin
        'modifiedby' => 2,
    ]);

    // Moodle 4.x question-bank versioning: entry + version rows.
    $entryid = $DB->insert_record('question_bank_entries', (object) [
        'questioncategoryid' => $category->id,
        'idnumber' => null,
        'ownerid' => 2,
    ]);
    $DB->insert_record('question_versions', (object) [
        'questionbankentryid' => $entryid,
        'version' => 1,
        'questionid' => $questionid,
        'status' => 'ready',
    ]);

    $DB->insert_record('qtype_multichoice_options', (object) [
        'questionid' => $questionid,
        'layout' => 0,
        'single' => 1,
        'shuffleanswers' => 0,
        'correctfeedback' => '',
        'correctfeedbackformat' => FORMAT_HTML,
        'partiallycorrectfeedback' => '',
        'partiallycorrectfeedbackformat' => FORMAT_HTML,
        'incorrectfeedback' => '',
        'incorrectfeedbackformat' => FORMAT_HTML,
        'answernumbering' => 'abc',
        'shownumcorrect' => 0,
        'showstandardinstruction' => 0,
    ]);
    foreach ([['نعم', 1.0], ['لا', 0.0]] as [$text, $fraction]) {
        $DB->insert_record('question_answers', (object) [
            'question' => $questionid,
            'answer' => $text,
            'answerformat' => FORMAT_HTML,
            'fraction' => $fraction,
            'feedback' => '',
            'feedbackformat' => FORMAT_HTML,
        ]);
    }
    cli_writeln($definition['shortname'] . ': question ' . $questionid);

    // ── the quiz, completing on any grade ───────────────────────────────────
    $moduleid = $DB->get_field('modules', 'id', ['name' => 'quiz'], MUST_EXIST);
    $moduleinfo = (object) [
        'modulename' => 'quiz',
        'module' => $moduleid,
        'course' => $course->id,
        'section' => 1,
        'visible' => 1,
        'name' => 'اختبار الدورة',
        'introeditor' => ['text' => 'أجب عن السؤال لإكمال الدورة.', 'format' => FORMAT_HTML, 'itemid' => 0],
        'quizpassword' => '',
        'grade' => 100,
        'grademethod' => 1, // highest
        'attempts' => 0,    // unlimited
        'timeopen' => 0,
        'timeclose' => 0,
        'timelimit' => 0,
        'overduehandling' => 'autosubmit',
        'graceperiod' => 0,
        'preferredbehaviour' => 'deferredfeedback',
        // Marks visible to the learner after the attempt — without these the
        // quiz's grade item is born hidden, which masks the course total from
        // gradereport_user_get_grade_items and the sync reads null.
        'reviewattempt' => 0x10000 | 0x01000 | 0x00100 | 0x00010,
        'reviewmarks' => 0x01000 | 0x00100 | 0x00010,
        'shuffleanswers' => 0,
        'questionsperpage' => 1,
        'navmethod' => 'free',
        'decimalpoints' => 2,
        'questiondecimalpoints' => -1,
        'cmidnumber' => '',
        'groupmode' => 0,
        'groupingid' => 0,
        // Activity completion: complete when a grade is received.
        'completion' => COMPLETION_TRACKING_AUTOMATIC,
        'completionusegrade' => 1,
        'completionpassgrade' => 0,
        'completionexpected' => 0,
    ];
    $moduleinfo = add_moduleinfo($moduleinfo, $course);
    $quizid = $moduleinfo->instance;
    cli_writeln($definition['shortname'] . ': quiz ' . $quizid);

    // Put the question on the quiz (quiz API).
    require_once $CFG->dirroot . '/mod/quiz/locallib.php';
    quiz_add_quiz_question($questionid, $DB->get_record('quiz', ['id' => $quizid], '*', MUST_EXIST), 0, 1);
    // Recompute sumgrades so the attempt maps to the 100 scale.
    $quiz = $DB->get_record('quiz', ['id' => $quizid], '*', MUST_EXIST);
    $quiz->sumgrades = 1;
    $DB->update_record('quiz', $quiz);

    // ── course completion criteria: the quiz's activity completion ──────────
    $criterion = new completion_criteria_activity();
    $criteriadata = (object) [
        'course' => $course->id,
        'criteria_activity_value' => [$moduleinfo->coursemodule => 1],
    ];
    $criterion->update_config($criteriadata);
    // Aggregate: all criteria (there is one).
    $aggdata = ['course' => $course->id, 'criteriatype' => null];
    $aggregation = new completion_aggregation($aggdata);
    $aggregation->setMethod(COMPLETION_AGGREGATION_ALL);
    $aggregation->save();

    rebuild_course_cache($course->id, true);
    cli_writeln($definition['shortname'] . ': completion criteria set');
  } catch (Throwable $e) {
    cli_writeln('FAILED ' . $definition['shortname'] . ': ' . $e->getMessage());
    cli_writeln($e->getTraceAsString());
    if ($e instanceof dml_exception) { cli_writeln('debuginfo: ' . ($e->debuginfo ?? '')); }
    exit(1);
  }
}

cli_writeln('done');

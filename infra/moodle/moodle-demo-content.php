<?php
/**
 * Fills an existing course with one of every content kind the authoring guide
 * (docs/entity-authoring-guide.md, TAM-143) describes, so an entity or a tester
 * can see and try each one without building it by hand:
 *
 *   video link (url) · PDF (resource) · page with an image · folder with two
 *   files · book with two chapters · label · three-question quiz with a grade
 *   to pass · completion tracking + course completion on the quiz
 *
 *   docker exec -u daemon tamkeen-moodle php /tmp/moodle-demo-content.php --courseid=<id>
 *
 * The course itself is created from the portal («إضافة دورة», D-060) so it is
 * owned by an entity; this script only adds content to it. Idempotent: a
 * course that already carries the demo (its label is present) is left alone.
 * Development-only — never a deployment artefact.
 */

define('CLI_SCRIPT', true);

require '/opt/bitnami/moodle/config.php';
require_once $CFG->libdir . '/clilib.php';
require_once $CFG->dirroot . '/course/lib.php';
require_once $CFG->dirroot . '/course/modlib.php';
require_once $CFG->libdir . '/completionlib.php';
require_once $CFG->dirroot . '/completion/criteria/completion_criteria_activity.php';
require_once $CFG->libdir . '/questionlib.php';
require_once $CFG->libdir . '/filelib.php';
require_once $CFG->libdir . '/resourcelib.php';

list($options, $unrecognised) = cli_get_params(['courseid' => 0], []);
$courseid = (int) $options['courseid'];
if ($courseid <= 0) {
    cli_error('Pass --courseid=<moodle course id> (the course created from the portal).');
}

$course = $DB->get_record('course', ['id' => $courseid], '*', MUST_EXIST);
$context = context_course::instance($course->id);
$MARKER = 'محتوى تجريبي — واحد من كل نوع';

if ($DB->record_exists('label', ['course' => $course->id, 'name' => $MARKER])) {
    cli_writeln("course {$course->id} already carries the demo — nothing to do");
    exit(0);
}

// The CLI runs as admin: draft areas and authorship are the admin's.
$USER = $DB->get_record('user', ['id' => 2], '*', MUST_EXIST);
\core\session\manager::set_user($USER);

// Completion tracking on, so activity conditions mean something.
if (!$course->enablecompletion) {
    $course->enablecompletion = 1;
    $DB->update_record('course', $course);
}

$fs = get_file_storage();

/** A draft area holding the given files, for add_moduleinfo's `files`. */
function demo_draft_area(array $files): int {
    global $USER;
    $draftid = file_get_unused_draft_itemid();
    $fs = get_file_storage();
    $usercontext = context_user::instance($USER->id);
    foreach ($files as $name => $content) {
        $fs->create_file_from_string([
            'contextid' => $usercontext->id,
            'component' => 'user',
            'filearea' => 'draft',
            'itemid' => $draftid,
            'filepath' => '/',
            'filename' => $name,
        ], $content);
    }
    return $draftid;
}

/** The smallest valid PDF with one line of text. */
function demo_pdf(string $text): string {
    $stream = "BT /F1 18 Tf 60 720 Td ($text) Tj ET";
    $objects = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
        "<< /Length " . strlen($stream) . " >>\nstream\n{$stream}\nendstream",
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ];
    $pdf = "%PDF-1.4\n";
    $offsets = [];
    foreach ($objects as $i => $body) {
        $offsets[] = strlen($pdf);
        $pdf .= ($i + 1) . " 0 obj\n{$body}\nendobj\n";
    }
    $xref = strlen($pdf);
    $pdf .= "xref\n0 " . (count($objects) + 1) . "\n0000000000 65535 f \n";
    foreach ($offsets as $offset) {
        $pdf .= sprintf("%010d 00000 n \n", $offset);
    }
    $pdf .= "trailer\n<< /Size " . (count($objects) + 1) . " /Root 1 0 R >>\nstartxref\n{$xref}\n%%EOF\n";
    return $pdf;
}

/** A 160×90 PNG in the brand green, via GD (present in the Bitnami image). */
function demo_png(): string {
    $image = imagecreatetruecolor(160, 90);
    $green = imagecolorallocate($image, 27, 131, 84);
    $white = imagecolorallocate($image, 255, 255, 255);
    imagefill($image, 0, 0, $green);
    imagefilledrectangle($image, 20, 30, 140, 60, $white);
    ob_start();
    imagepng($image);
    imagedestroy($image);
    return ob_get_clean();
}

function demo_module(string $modname, stdClass $course, array $fields): stdClass {
    global $DB;
    $moduleid = $DB->get_field('modules', 'id', ['name' => $modname], MUST_EXIST);
    $info = (object) array_merge([
        'modulename' => $modname,
        'module' => $moduleid,
        'course' => $course->id,
        'section' => 0,
        'visible' => 1,
        'cmidnumber' => '',
        'groupmode' => 0,
        'groupingid' => 0,
        'completion' => COMPLETION_TRACKING_NONE,
        'completionexpected' => 0,
    ], $fields);
    $info = add_moduleinfo($info, $course);
    cli_writeln("  {$modname}: cm {$info->coursemodule}");
    return $info;
}

$intro = fn(string $text) => ['text' => $text, 'format' => FORMAT_HTML, 'itemid' => 0];

// ── 0. the marker label ──────────────────────────────────────────────────
demo_module('label', $course, [
    'name' => $MARKER,
    'introeditor' => $intro('<p><strong>' . $MARKER . '</strong>: رابط فيديو، ملف PDF، صفحة بصورة، مجلد، كتاب، واختبار من ثلاثة أسئلة مع شروط الإكمال.</p>'),
]);

// ── 1. video as a link ───────────────────────────────────────────────────
demo_module('url', $course, [
    'name' => 'فيديو تعريفي (رابط)',
    'introeditor' => $intro('<p>الفيديو مستضاف خارج منصة التعلّم — الخيار الموصى به لأي فيديو يتجاوز بضع دقائق.</p>'),
    'externalurl' => 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'display' => RESOURCELIB_DISPLAY_EMBED,
    'parameters' => '',
]);

// ── 2. a PDF document ────────────────────────────────────────────────────
demo_module('resource', $course, [
    'name' => 'مذكرة الدورة (PDF)',
    'introeditor' => $intro('<p>ملف PDF يُفتح داخل الدورة.</p>'),
    'files' => demo_draft_area(['course-notes.pdf' => demo_pdf('Tamkeen demo course notes')]),
    'display' => RESOURCELIB_DISPLAY_EMBED,
    'showsize' => 1,
    'showtype' => 1,
    'showdate' => 0,
    'printintro' => 0,
    'filterfiles' => 0,
]);

// ── 3. a page with text and an embedded image ────────────────────────────
$pngdata = base64_encode(demo_png());
demo_module('page', $course, [
    'name' => 'صفحة تعريفية بصورة',
    'introeditor' => $intro(''),
    'page' => [
        'text' => '<h4>مقدمة</h4><p>هذه صفحة نصية من شاشة واحدة، فيها صورة بوصف بديل.</p>'
            . '<p><img src="data:image/png;base64,' . $pngdata . '" alt="مستطيل أبيض على خلفية خضراء — صورة توضيحية" width="160" height="90"></p>'
            . '<p>يمكن للجهة إدراج الصور من زر الصورة في المحرّر.</p>',
        'format' => FORMAT_HTML,
        'itemid' => 0,
    ],
    'display' => RESOURCELIB_DISPLAY_OPEN,
    'printintro' => 0,
    'printlastmodified' => 0,
]);

// ── 4. a folder with two files ───────────────────────────────────────────
demo_module('folder', $course, [
    'name' => 'ملفات مساندة (مجلد)',
    'introeditor' => $intro('<p>مجموعة ملفات في مجلد واحد.</p>'),
    'files' => demo_draft_area([
        'checklist.txt' => "قائمة تحقق\n- اقرأ المذكرة\n- شاهد الفيديو\n- أدِّ الاختبار\n",
        'glossary.pdf' => demo_pdf('Tamkeen demo glossary'),
    ]),
    'display' => 0,
    'showexpanded' => 1,
    'showdownloadfolder' => 1,
    'forcedownload' => 1,
]);

// ── 5. a book with two chapters ──────────────────────────────────────────
$book = demo_module('book', $course, [
    'name' => 'كتاب الدورة (فصلان)',
    'introeditor' => $intro('<p>نص طويل مقسّم إلى فصول.</p>'),
    'numbering' => 1,
    'navstyle' => 1,
    'customtitles' => 0,
]);
foreach ([['الفصل الأول: المفاهيم', '<p>محتوى الفصل الأول.</p>'], ['الفصل الثاني: التطبيق', '<p>محتوى الفصل الثاني.</p>']] as $i => [$title, $content]) {
    $DB->insert_record('book_chapters', (object) [
        'bookid' => $book->instance,
        'pagenum' => $i + 1,
        'subchapter' => 0,
        'title' => $title,
        'content' => $content,
        'contentformat' => FORMAT_HTML,
        'hidden' => 0,
        'timecreated' => time(),
        'timemodified' => time(),
        'importsrc' => '',
    ]);
}
cli_writeln('  book: 2 chapters');

// ── 6. three multiple-choice questions ───────────────────────────────────
$category = question_make_default_categories([$context]);
$questions = [
    ['ما الخيار الموصى به لفيديو طويل؟', [['رابط لفيديو مستضاف', 1.0], ['رفع الملف داخل الدورة', 0.0], ['نسخ الفيديو في صفحة', 0.0]]],
    ['أين تُضبط شروط إكمال النشاط؟', [['في إعدادات النشاط', 1.0], ['في بيانات الدورة بالمنصة', 0.0], ['لا تُضبط', 0.0]]],
    ['ما الحد الأقصى لمسارات الدورة الواحدة؟', [['ثلاثة', 1.0], ['واحد', 0.0], ['بلا حد', 0.0]]],
];
$questionids = [];
foreach ($questions as $n => [$text, $answers]) {
    $qid = $DB->insert_record('question', (object) [
        'parent' => 0,
        'name' => 'سؤال ' . ($n + 1),
        'questiontext' => $text,
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
        'createdby' => $USER->id,
        'modifiedby' => $USER->id,
    ]);
    $entryid = $DB->insert_record('question_bank_entries', (object) [
        'questioncategoryid' => $category->id,
        'idnumber' => null,
        'ownerid' => $USER->id,
    ]);
    $DB->insert_record('question_versions', (object) [
        'questionbankentryid' => $entryid,
        'version' => 1,
        'questionid' => $qid,
        'status' => 'ready',
    ]);
    $DB->insert_record('qtype_multichoice_options', (object) [
        'questionid' => $qid,
        'layout' => 0,
        'single' => 1,
        'shuffleanswers' => 1,
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
    foreach ($answers as [$answer, $fraction]) {
        $DB->insert_record('question_answers', (object) [
            'question' => $qid,
            'answer' => $answer,
            'answerformat' => FORMAT_HTML,
            'fraction' => $fraction,
            'feedback' => '',
            'feedbackformat' => FORMAT_HTML,
        ]);
    }
    $questionids[] = $qid;
}
cli_writeln('  questions: ' . count($questionids));

// ── 7. the quiz: grade to pass 70, completes on passing ──────────────────
$quizinfo = demo_module('quiz', $course, [
    'name' => 'اختبار الدورة (ثلاثة أسئلة)',
    'introeditor' => $intro('<p>درجة النجاح 70٪. محاولات غير محدودة.</p>'),
    'quizpassword' => '',
    'grade' => 100,
    'grademethod' => 1,
    'attempts' => 0,
    'timeopen' => 0,
    'timeclose' => 0,
    'timelimit' => 0,
    'overduehandling' => 'autosubmit',
    'graceperiod' => 0,
    'preferredbehaviour' => 'deferredfeedback',
    'reviewattempt' => 0x10000 | 0x01000 | 0x00100 | 0x00010,
    'reviewmarks' => 0x01000 | 0x00100 | 0x00010,
    'shuffleanswers' => 1,
    'questionsperpage' => 1,
    'navmethod' => 'free',
    'decimalpoints' => 2,
    'questiondecimalpoints' => -1,
    'completion' => COMPLETION_TRACKING_AUTOMATIC,
    'completionusegrade' => 1,
    'completionpassgrade' => 1,
    'gradepass' => 70,
]);
require_once $CFG->dirroot . '/mod/quiz/locallib.php';
$quiz = $DB->get_record('quiz', ['id' => $quizinfo->instance], '*', MUST_EXIST);
foreach ($questionids as $qid) {
    quiz_add_quiz_question($qid, $quiz, 0, 1);
}
$quiz->sumgrades = count($questionids);
$DB->update_record('quiz', $quiz);
// Grade to pass on the grade item, which is what "passing grade" completion reads.
$item = $DB->get_record('grade_items', ['itemtype' => 'mod', 'itemmodule' => 'quiz', 'iteminstance' => $quiz->id]);
if ($item) {
    $item->gradepass = 70;
    $DB->update_record('grade_items', $item);
}

// ── 8. course completion: the quiz ───────────────────────────────────────
$criterion = new completion_criteria_activity();
// A variable, not a literal: update_config takes its argument by reference.
$criteriadata = (object) [
    'course' => $course->id,
    'criteria_activity_value' => [$quizinfo->coursemodule => 1],
];
$criterion->update_config($criteriadata);
$aggregation = new completion_aggregation(['course' => $course->id, 'criteriatype' => null]);
$aggregation->setMethod(COMPLETION_AGGREGATION_ALL);
$aggregation->save();

rebuild_course_cache($course->id, true);
cli_writeln("done: course {$course->id} carries the demo content");

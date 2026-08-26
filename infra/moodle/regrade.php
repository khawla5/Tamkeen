<?php
define("CLI_SCRIPT", 1);
require "/opt/bitnami/moodle/config.php";
require_once $CFG->libdir . "/gradelib.php";
foreach ([6, 7, 8, 9, 10] as $cid) {
  $r = grade_regrade_final_grades($cid);
  echo "course $cid regrade: " . ($r === true ? "ok" : json_encode($r)) . "
";
}

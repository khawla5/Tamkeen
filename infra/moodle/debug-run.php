<?php
define("CLI_SCRIPT", 1);
require "/opt/bitnami/moodle/config.php";
$CFG->debug = E_ALL;
$CFG->debugdisplay = 1;
require "/tmp/moodle-testcourses.php";

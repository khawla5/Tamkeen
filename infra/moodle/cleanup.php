<?php
define("CLI_SCRIPT", 1);
require "/opt/bitnami/moodle/config.php";
$id = $DB->get_field("course", "id", ["shortname" => "TAMKEEN-T1"]);
if ($id) { delete_course($id, false); echo "deleted T1
"; }

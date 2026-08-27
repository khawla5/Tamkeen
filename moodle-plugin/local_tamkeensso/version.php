<?php
// Tamkeen seamless login for Moodle.
//
// Accepts a short-lived, single-use, HMAC-signed handoff token from the Tamkeen
// platform and logs the matching learner straight into one course, so a user who
// is already signed in to Tamkeen never meets a second login (CLAUDE.md §5.3).

defined('MOODLE_INTERNAL') || die();

$plugin->component = 'local_tamkeensso';
$plugin->version   = 2026082502; // D-122: the ready message names the activity.
// Moodle 4.5 LTS is the production target (D-039); development runs 5.2.
$plugin->requires  = 2024100700; // Moodle 4.5.
$plugin->maturity  = MATURITY_ALPHA;
$plugin->release   = '0.3.0';

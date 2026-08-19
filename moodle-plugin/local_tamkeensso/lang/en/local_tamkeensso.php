<?php
// English strings for local_tamkeensso.

defined('MOODLE_INTERNAL') || die();

$string['pluginname'] = 'Tamkeen seamless login';
$string['privacy:metadata'] = 'The Tamkeen seamless login plugin stores only spent handoff identifiers, which are random values carrying no personal data.';
$string['secret'] = 'Shared secret';
$string['secret_desc'] = 'Must match MOODLE_SSO_SECRET in the Tamkeen platform. At least 32 characters. Rotating it invalidates in-flight handoff links, which expire within a minute anyway.';
$string['error_disabled'] = 'Seamless login is not configured on this site.';
$string['error_invalid'] = 'This sign-in link is not valid.';
$string['error_expired'] = 'This sign-in link has expired. Please return to the platform and open the course again.';
$string['error_used'] = 'This sign-in link has already been used. Please return to the platform and open the course again.';
$string['error_nouser'] = 'This sign-in link does not match an active account.';

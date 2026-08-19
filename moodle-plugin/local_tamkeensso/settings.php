<?php
// Admin settings for Tamkeen seamless login.

defined('MOODLE_INTERNAL') || die();

if ($hassiteconfig) {
    $settings = new admin_settingpage(
        'local_tamkeensso',
        get_string('pluginname', 'local_tamkeensso')
    );

    // The shared secret. `configpasswordunmask` keeps it out of plain sight in
    // the admin UI; it is still stored in the Moodle config table, which is why
    // it must be a value used for nothing else.
    $settings->add(new admin_setting_configpasswordunmask(
        'local_tamkeensso/secret',
        get_string('secret', 'local_tamkeensso'),
        get_string('secret_desc', 'local_tamkeensso'),
        ''
    ));

    $ADMIN->add('localplugins', $settings);
}

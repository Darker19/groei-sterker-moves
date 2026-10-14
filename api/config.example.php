<?php
// Voorbeeld van de instellingen. Het echte bestand (config.php) staat NIET in git:
// de workflow maakt het bij het uploaden naar Hostnet aan uit de GitHub-secrets
// DB_HOST, DB_NAME, DB_USER, DB_PASS en SETUP_CODE.
return [
  'db_host' => 'localhost',
  'db_name' => 'rugschema',
  'db_user' => 'rugschema',
  'db_pass' => 'geheim',
  'setup_code' => 'lange-willekeurige-code',
  'data_key' => '',          // sleutel om de gegevens versleuteld op te slaan: openssl rand -base64 32 (leeg = niet versleutelen)
  'cookie_secure' => true,   // alleen false bij lokaal testen zonder https
];

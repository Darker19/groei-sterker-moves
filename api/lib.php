<?php
// Gedeelde code voor de API: instellingen, databaseverbinding, sessies en antwoorden.
// Werkt op PHP 7.4 en hoger (Hostnet). Geen externe bibliotheken nodig.

const SESSIE_COOKIE = 'rs_sessie';
const SESSIE_UREN = 12;            // therapeut: automatisch uitloggen na zoveel uur zonder activiteit
const CLIENT_DAGEN = 30;           // cliënt: blijft zo lang ingelogd op het eigen apparaat
const MAX_POGINGEN = 8;            // mislukte inlogpogingen per IP of e-mail ...
const POGING_MINUTEN = 15;         // ... binnen dit aantal minuten
const MAX_BODY = 4 * 1024 * 1024;  // grootste toegestane verzoek (4 MB)

// Nooit technische foutmeldingen tonen: wel loggen voor de beheerder, de app krijgt alleen "serverfout"
ini_set('display_errors', '0');
set_exception_handler(function ($e) {
  error_log('RugSchema: ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
  if (!headers_sent()) antwoord(['fout' => 'serverfout'], 500);
});

function antwoord($data, $code = 200) {
  http_response_code($code);
  header('Content-Type: application/json; charset=utf-8');
  header('Cache-Control: no-store');
  header('X-Content-Type-Options: nosniff');
  echo json_encode($data, JSON_UNESCAPED_UNICODE);
  exit;
}

function instellingen() {
  static $c = null;
  if ($c === null) {
    $pad = __DIR__ . '/config.php';
    if (!is_file($pad)) antwoord(['fout' => 'niet-ingesteld'], 503);
    $c = require $pad;
  }
  return $c;
}

function db() {
  static $pdo = null;
  if ($pdo === null) {
    $c = instellingen();
    try {
      $pdo = new PDO('mysql:host=' . $c['db_host'] . ';dbname=' . $c['db_name'] . ';charset=utf8mb4', $c['db_user'], $c['db_pass'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
      ]);
    } catch (PDOException $e) {
      error_log('RugSchema db: ' . $e->getMessage());
      antwoord(['fout' => 'database-onbereikbaar'], 503);
    }
  }
  return $pdo;
}

// Tabellen aanmaken als ze nog niet bestaan (aangeroepen door setup.php)
function maak_tabellen() {
  $db = db();
  // email: het e-mailadres (therapeut) of de gebruikersnaam (cliënt) waarmee iemand inlogt
  $db->exec("CREATE TABLE IF NOT EXISTS gebruikers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(190) NOT NULL UNIQUE,
    naam VARCHAR(100) NOT NULL,
    wachtwoord VARCHAR(255) NOT NULL,
    aangemaakt DATETIME NOT NULL,
    rol VARCHAR(20) NOT NULL DEFAULT 'therapeut',
    client_id VARCHAR(40) NULL UNIQUE,
    laatst_ingelogd DATETIME NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
  $db->exec("CREATE TABLE IF NOT EXISTS sessies (
    token_hash CHAR(64) PRIMARY KEY,
    gebruiker_id INT NOT NULL,
    verloopt DATETIME NOT NULL,
    INDEX (gebruiker_id), INDEX (verloopt)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
  $db->exec("CREATE TABLE IF NOT EXISTS inlogpogingen (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ip VARCHAR(45) NOT NULL,
    email VARCHAR(190) NOT NULL,
    tijd DATETIME NOT NULL,
    INDEX (ip, tijd), INDEX (email, tijd)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
  // Voorlopig alle gegevens van de praktijk als één JSON-document (rij id=1), met een versienummer
  // zodat twee apparaten elkaars wijzigingen niet ongemerkt overschrijven.
  $db->exec("CREATE TABLE IF NOT EXISTS praktijkdata (
    id TINYINT PRIMARY KEY,
    gegevens LONGTEXT NOT NULL,
    afgevinkt LONGTEXT NOT NULL,
    versie INT NOT NULL,
    gewijzigd DATETIME NOT NULL,
    gewijzigd_door INT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
  maak_client_tabel($db);
}

// Wat een cliënt zelf invult (afvinken en smileys), per dag apart van de praktijkgegevens:
// zo krijgt de therapeut geen conflict als een cliënt tegelijk oefent.
function maak_client_tabel($db) {
  $db->exec("CREATE TABLE IF NOT EXISTS client_dagen (
    client_id VARCHAR(40) NOT NULL,
    datum DATE NOT NULL,
    afgevinkt TEXT NOT NULL,
    beoordelingen TEXT NOT NULL,
    gewijzigd DATETIME NOT NULL,
    PRIMARY KEY (client_id, datum)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
}

// Een database van vóór de cliënt-accounts bijwerken (één snelle controle per keer dat de app opent)
function werk_database_bij() {
  $db = db();
  if (!$db->query("SHOW TABLES LIKE 'gebruikers'")->fetch()) return; // nog niet geïnstalleerd (setup.php)
  $rol = $db->query("SHOW COLUMNS FROM gebruikers LIKE 'rol'")->fetch();
  if (!$rol) {
    $db->exec("ALTER TABLE gebruikers ADD rol VARCHAR(20) NOT NULL DEFAULT 'therapeut', ADD client_id VARCHAR(40) NULL UNIQUE, ADD laatst_ingelogd DATETIME NULL");
    maak_client_tabel($db);
  } elseif (stripos($rol['Type'], 'varchar(20)') === false) {
    $db->exec("ALTER TABLE gebruikers MODIFY rol VARCHAR(20) NOT NULL DEFAULT 'therapeut'"); // ruimte voor 'ontwikkelaar'
  }
}

function invoer() {
  if (isset($_SERVER['CONTENT_LENGTH']) && (int)$_SERVER['CONTENT_LENGTH'] > MAX_BODY) antwoord(['fout' => 'te-groot'], 413);
  $ruw = file_get_contents('php://input', false, null, 0, MAX_BODY + 1);
  if (strlen($ruw) > MAX_BODY) antwoord(['fout' => 'te-groot'], 413);
  $data = json_decode($ruw, true);
  if (!is_array($data)) antwoord(['fout' => 'ongeldige-invoer'], 400);
  return $data;
}

// Wijzigende verzoeken moeten van de app zelf komen: een eigen header kan een andere site niet meesturen
function eis_app_verzoek() {
  if ($_SERVER['REQUEST_METHOD'] !== 'POST' || ($_SERVER['HTTP_X_RUGSCHEMA'] ?? '') !== '1') antwoord(['fout' => 'niet-toegestaan'], 403);
}

function nu($plus = '') { return date('Y-m-d H:i:s', $plus ? strtotime($plus) : time()); }
function client_ip() { return substr($_SERVER['REMOTE_ADDR'] ?? '', 0, 45); }

function zet_cookie($waarde, $verloopt) {
  setcookie(SESSIE_COOKIE, $waarde, [
    'expires' => $verloopt, 'path' => '/', 'secure' => instellingen()['cookie_secure'] ?? true,
    'httponly' => true, 'samesite' => 'Strict',
  ]);
}

function sessie_duur($rol) { return $rol === 'client' ? '+' . CLIENT_DAGEN . ' days' : '+' . SESSIE_UREN . ' hours'; }

function start_sessie($gebruiker_id, $rol) {
  $token = bin2hex(random_bytes(32));
  db()->prepare('INSERT INTO sessies (token_hash, gebruiker_id, verloopt) VALUES (?, ?, ?)')
      ->execute([hash('sha256', $token), $gebruiker_id, nu(sessie_duur($rol))]);
  // therapeut: sessiecookie (weg als de browser sluit); cliënt: blijft bewaard zodat een kind niet elke keer hoeft in te loggen
  zet_cookie($token, $rol === 'client' ? strtotime(sessie_duur($rol)) : 0);
}

// Geeft de ingelogde gebruiker terug (en verlengt de sessie), of null
function huidige_gebruiker() {
  $token = $_COOKIE[SESSIE_COOKIE] ?? '';
  if (!preg_match('/^[a-f0-9]{64}$/', $token)) return null;
  $hash = hash('sha256', $token);
  $q = db()->prepare('SELECT g.id, g.email, g.naam, g.rol, g.client_id FROM sessies s JOIN gebruikers g ON g.id = s.gebruiker_id WHERE s.token_hash = ? AND s.verloopt > ?');
  $q->execute([$hash, nu()]);
  $g = $q->fetch();
  if (!$g) return null;
  db()->prepare('UPDATE sessies SET verloopt = ? WHERE token_hash = ?')->execute([nu(sessie_duur($g['rol'])), $hash]);
  return $g;
}

function eis_gebruiker() {
  $g = huidige_gebruiker();
  if (!$g) antwoord(['fout' => 'niet-ingelogd'], 401);
  return $g;
}

// Alleen de therapeut mag bij de praktijkgegevens; een cliënt ziet alleen het eigen schema
function eis_therapeut() {
  $g = eis_gebruiker();
  if ($g['rol'] !== 'therapeut') antwoord(['fout' => 'geen-toegang'], 403);
  return $g;
}

// Ontwikkelaar: ziet de echte oefeningen en schema's, maar alleen de eigen testcliënten (rij RIJ_ONTWIKKELAAR)
function eis_therapeut_of_ontwikkelaar() {
  $g = eis_gebruiker();
  if ($g['rol'] !== 'therapeut' && $g['rol'] !== 'ontwikkelaar') antwoord(['fout' => 'geen-toegang'], 403);
  return $g;
}

function eis_client() {
  $g = eis_gebruiker();
  if ($g['rol'] !== 'client' || !$g['client_id']) antwoord(['fout' => 'geen-toegang'], 403);
  return $g;
}

// In praktijkdata staan twee rijen: 1 = de praktijk (therapeut), 2 = de testcliënten van de ontwikkelaar
// (alleen clients en ratings; die ziet de therapeut nooit, en de ontwikkelaar ziet de echte cliënten nooit)
const RIJ_PRAKTIJK = 1;
const RIJ_ONTWIKKELAAR = 2;
function rij_van($g) { return $g['rol'] === 'ontwikkelaar' ? RIJ_ONTWIKKELAAR : RIJ_PRAKTIJK; }

function lees_rij($rij) {
  $q = db()->prepare('SELECT gegevens, afgevinkt, versie FROM praktijkdata WHERE id = ?');
  $q->execute([$rij]);
  return $q->fetch() ?: null;
}
function praktijkgegevens() {
  $r = lees_rij(RIJ_PRAKTIJK);
  return $r ? json_decode($r['gegevens'], true) : null;
}
function clients_van($rij) {
  $r = lees_rij($rij);
  return $r ? (json_decode($r['gegevens'], true)['clients'] ?? []) : [];
}
function ids_van($clients) {
  return array_values(array_filter(array_map(function ($c) { return (string)($c['id'] ?? ''); }, $clients)));
}
// cliënt opzoeken in één rij, of (zonder $rij) in beide
function zoek_client($id, $rij = null) {
  foreach ($rij ? [$rij] : [RIJ_PRAKTIJK, RIJ_ONTWIKKELAAR] as $r)
    foreach (clients_van($r) as $c) if (($c['id'] ?? null) === $id) return $c;
  return null;
}

// Wachtwoord dat een kind kan overtypen, bijv. "tijger-blauw-4821" (pogingen zijn beperkt, zie MAX_POGINGEN)
function maak_client_wachtwoord() {
  $w = ['appel','beer','bloem','boom','draak','eend','egel','fiets','haai','haas','kat','kikker','koe','leeuw','maan','muis',
        'olifant','otter','panda','paard','pinguin','raket','regen','ster','tijger','uil','vis','vos','wolk','zebra','zon','zwaan',
        'blauw','geel','groen','oranje','paars','rood','roze','snel','sterk','stoer','vrolijk','wild','zacht','blij','dapper','slim'];
  return $w[random_int(0, count($w) - 1)] . '-' . $w[random_int(0, count($w) - 1)] . '-' . random_int(1000, 9999);
}


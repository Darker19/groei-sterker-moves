<?php
// API van RugSchema. Aanroepen als api/?a=<actie>.
//   GET  sessie     -> {ingelogd, naam, email}
//   POST login      {email, wachtwoord}
//   POST uitloggen
//   GET  gegevens   -> {gegevens, afgevinkt, versie}
//   POST bewaar     {gegevens, afgevinkt, versie} -> {versie} of 409 als iemand anders intussen heeft opgeslagen
//   POST wachtwoord {oud, nieuw}
// Cliënt-accounts (therapeut voor de praktijk, ontwikkelaar voor de eigen testcliënten):
//   GET  accounts                         -> {accounts: [{client_id, login, aangemaakt, laatst_ingelogd}]}
//   POST account-maak {client_id, login}  -> {login, wachtwoord}   (het wachtwoord is daarna niet meer op te vragen)
//   POST account-reset {client_id}        -> {login, wachtwoord}
//   POST account-weg {client_id}
// Ontwikkelaar-account (alleen therapeut; er is er hooguit één):
//   GET  dev-account                      -> {account: {login, aangemaakt, laatst_ingelogd} of null}
//   POST dev-maak {login}                 -> {login, wachtwoord}
//   POST dev-reset                        -> {login, wachtwoord}
//   POST dev-weg
// Cliënt:
//   GET  mijn                             -> {client, schema, kaarten, cats, vandaag}  (alleen het eigen schema)
//   POST voortgang {datum, afgevinkt, beoordelingen}
//   POST mijn-account {oud, login?, wachtwoord?}  -> {login}   eigen gebruikersnaam en/of wachtwoord wijzigen
require __DIR__ . '/lib.php';

$actie = $_GET['a'] ?? '';

if ($actie === 'sessie') {
  // eerst controleren of de server is ingesteld en de database bereikbaar is (anders 503: de app draait dan als demo)
  instellingen();
  werk_database_bij();
  $g = huidige_gebruiker();
  antwoord($g ? ['ingelogd' => true, 'naam' => $g['naam'], 'email' => $g['email'], 'rol' => $g['rol']] : ['ingelogd' => false]);
}

if ($actie === 'login') {
  eis_app_verzoek();
  $in = invoer();
  $email = strtolower(trim((string)($in['email'] ?? '')));
  $ww = (string)($in['wachtwoord'] ?? '');
  $db = db();
  $grens = nu('-' . POGING_MINUTEN . ' minutes');
  $q = $db->prepare('SELECT COUNT(*) FROM inlogpogingen WHERE (ip = ? OR email = ?) AND tijd > ?');
  $q->execute([client_ip(), $email, $grens]);
  if ((int)$q->fetchColumn() >= MAX_POGINGEN) antwoord(['fout' => 'te-vaak'], 429);

  $q = $db->prepare('SELECT id, naam, email, wachtwoord, rol FROM gebruikers WHERE email = ?');
  $q->execute([$email]);
  $g = $q->fetch();
  // ook zonder gebruiker een wachtwoord controleren, zodat de responstijd niet verraadt of het e-mailadres bestaat
  $ok = $g ? password_verify($ww, $g['wachtwoord']) : (password_verify($ww, password_hash('nep', PASSWORD_DEFAULT)) && false);
  if (!$g || !$ok) {
    $db->prepare('INSERT INTO inlogpogingen (ip, email, tijd) VALUES (?, ?, ?)')->execute([client_ip(), $email, nu()]);
    antwoord(['fout' => 'onjuist'], 401);
  }
  if (password_needs_rehash($g['wachtwoord'], PASSWORD_DEFAULT)) {
    $db->prepare('UPDATE gebruikers SET wachtwoord = ? WHERE id = ?')->execute([password_hash($ww, PASSWORD_DEFAULT), $g['id']]);
  }
  $db->prepare('DELETE FROM inlogpogingen WHERE email = ? OR tijd < ?')->execute([$email, nu('-1 day')]);
  $db->prepare('DELETE FROM sessies WHERE verloopt < ?')->execute([nu()]);
  $db->prepare('UPDATE gebruikers SET laatst_ingelogd = ? WHERE id = ?')->execute([nu(), $g['id']]);
  start_sessie($g['id'], $g['rol']);
  antwoord(['ingelogd' => true, 'naam' => $g['naam'], 'email' => $g['email'], 'rol' => $g['rol']]);
}

if ($actie === 'uitloggen') {
  eis_app_verzoek();
  $token = $_COOKIE[SESSIE_COOKIE] ?? '';
  if (preg_match('/^[a-f0-9]{64}$/', $token)) db()->prepare('DELETE FROM sessies WHERE token_hash = ?')->execute([hash('sha256', $token)]);
  zet_cookie('', time() - 3600);
  antwoord(['ingelogd' => false]);
}

if ($actie === 'gegevens') {
  $g = eis_therapeut_of_ontwikkelaar();
  $p = lees_rij(RIJ_PRAKTIJK);
  if ($g['rol'] === 'ontwikkelaar') {
    // echte oefeningen en schema's, met de eigen testcliënten in plaats van de echte
    $d = lees_rij(RIJ_ONTWIKKELAAR);
    $dev = $d ? json_decode($d['gegevens'], true) : [];
    $gegevens = $p ? json_decode($p['gegevens'], true) : [];
    $gegevens['clients'] = $dev['clients'] ?? [];
    $gegevens['ratings'] = $dev['ratings'] ?? [];
    $afgevinkt = $d ? (json_decode($d['afgevinkt'], true) ?: []) : [];
    $versie = $d ? (int)$d['versie'] : 0;
  } else {
    if (!$p) antwoord(['gegevens' => null, 'afgevinkt' => new stdClass(), 'versie' => 0]);
    $gegevens = json_decode($p['gegevens'], true);
    $afgevinkt = json_decode($p['afgevinkt'], true) ?: [];
    $versie = (int)$p['versie'];
  }
  // wat de eigen cliënten zelf hebben ingevuld erbij zetten (dat gaat voor wat in de gegevens staat)
  $ids = ids_van($gegevens['clients'] ?? []);
  if ($ids) {
    $q = db()->prepare('SELECT client_id, datum, afgevinkt, beoordelingen FROM client_dagen WHERE client_id IN (' . implode(',', array_fill(0, count($ids), '?')) . ')');
    $q->execute($ids);
    foreach ($q->fetchAll() as $d) {
      $afgevinkt[$d['client_id'] . ':' . $d['datum']] = json_decode($d['afgevinkt']) ?: new stdClass();
      $gegevens['ratings'] = array_values(array_filter($gegevens['ratings'] ?? [], function ($x) use ($d) {
        return !(($x['c'] ?? '') === $d['client_id'] && ($x['d'] ?? '') === $d['datum']);
      }));
      foreach (json_decode($d['beoordelingen'], true) ?: [] as $b) $gegevens['ratings'][] = ['c' => $d['client_id'], 'd' => $d['datum']] + $b;
    }
  }
  antwoord(['gegevens' => $gegevens, 'afgevinkt' => $afgevinkt ?: new stdClass(), 'versie' => $versie]);
}

if ($actie === 'bewaar') {
  eis_app_verzoek();
  $g = eis_therapeut_of_ontwikkelaar();
  $rij = rij_van($g);
  $in = invoer();
  if (!isset($in['gegevens']['cards']) || !is_array($in['gegevens']['cards'])) antwoord(['fout' => 'ongeldige-gegevens'], 400);
  $clients = is_array($in['gegevens']['clients'] ?? null) ? $in['gegevens']['clients'] : [];
  // ontwikkelaar: alleen de testcliënten en hun beoordelingen bewaren; oefeningen en schema's blijven van de therapeut
  $data = $rij === RIJ_ONTWIKKELAAR ? ['clients' => $clients, 'ratings' => $in['gegevens']['ratings'] ?? []] : $in['gegevens'];
  $gegevens = json_encode($data, JSON_UNESCAPED_UNICODE);
  $afgevinkt = json_encode(isset($in['afgevinkt']) && is_array($in['afgevinkt']) && $in['afgevinkt'] ? $in['afgevinkt'] : new stdClass(), JSON_UNESCAPED_UNICODE);
  $versie = (int)($in['versie'] ?? -1);
  $db = db();
  if ($versie === 0) {
    // eerste keer opslaan: alleen als er nog niets staat
    $q = $db->prepare('INSERT IGNORE INTO praktijkdata (id, gegevens, afgevinkt, versie, gewijzigd, gewijzigd_door) VALUES (?, ?, ?, 1, ?, ?)');
    $q->execute([$rij, $gegevens, $afgevinkt, nu(), $g['id']]);
  } else {
    $q = $db->prepare('UPDATE praktijkdata SET gegevens = ?, afgevinkt = ?, versie = versie + 1, gewijzigd = ?, gewijzigd_door = ? WHERE id = ? AND versie = ?');
    $q->execute([$gegevens, $afgevinkt, nu(), $g['id'], $rij, $versie]);
  }
  if ($q->rowCount() !== 1) {
    $q = $db->prepare('SELECT versie FROM praktijkdata WHERE id = ?');
    $q->execute([$rij]);
    antwoord(['fout' => 'conflict', 'versie' => (int)$q->fetchColumn()], 409);
  }
  // accounts en gegevens van cliënten die nergens meer bestaan opruimen (in geen van beide rijen)
  $ids = array_merge(ids_van($clients), ids_van(clients_van($rij === RIJ_PRAKTIJK ? RIJ_ONTWIKKELAAR : RIJ_PRAKTIJK)));
  $niet = $ids ? ' AND client_id NOT IN (' . implode(',', array_fill(0, count($ids), '?')) . ')' : '';
  $q = $db->prepare("SELECT id FROM gebruikers WHERE rol = 'client'" . $niet);
  $q->execute($ids);
  foreach ($q->fetchAll(PDO::FETCH_COLUMN) as $weg) {
    $db->prepare('DELETE FROM sessies WHERE gebruiker_id = ?')->execute([$weg]);
    $db->prepare('DELETE FROM gebruikers WHERE id = ?')->execute([$weg]);
  }
  $db->prepare('DELETE FROM client_dagen WHERE 1' . $niet)->execute($ids);
  antwoord(['versie' => $versie + 1]);
}

/* ---------- Cliënt-accounts (therapeut voor de echte cliënten, ontwikkelaar voor de testcliënten) ---------- */

// de therapeut beheert alleen accounts van de praktijk, de ontwikkelaar alleen die van de eigen testcliënten
function eis_eigen_client($g, $id) {
  if ($id === '' || !in_array($id, ids_van(clients_van(rij_van($g))), true)) antwoord(['fout' => 'onbekende-client'], 404);
}

if ($actie === 'accounts') {
  $g = eis_therapeut_of_ontwikkelaar();
  $eigen = ids_van(clients_van(rij_van($g)));
  $r = db()->query("SELECT client_id, email AS login, aangemaakt, laatst_ingelogd FROM gebruikers WHERE rol = 'client'")->fetchAll();
  antwoord(['accounts' => array_values(array_filter($r, function ($a) use ($eigen) { return in_array($a['client_id'], $eigen, true); }))]);
}

if ($actie === 'account-maak') {
  eis_app_verzoek();
  $g = eis_therapeut_of_ontwikkelaar();
  $in = invoer();
  $id = (string)($in['client_id'] ?? '');
  $login = strtolower(trim((string)($in['login'] ?? '')));
  if (!preg_match('/^[a-z0-9][a-z0-9._-]{2,39}$/', $login)) antwoord(['fout' => 'ongeldige-login'], 400);
  $c = zoek_client($id, rij_van($g));
  if (!$c) antwoord(['fout' => 'onbekende-client'], 404);
  $db = db();
  $q = $db->prepare('SELECT COUNT(*) FROM gebruikers WHERE email = ? OR client_id = ?');
  $q->execute([$login, $id]);
  if ((int)$q->fetchColumn() > 0) antwoord(['fout' => 'bestaat-al'], 409);
  $ww = maak_client_wachtwoord();
  $voornaam = explode(' ', trim((string)($c['name'] ?? '')))[0];
  $db->prepare("INSERT INTO gebruikers (email, naam, wachtwoord, aangemaakt, rol, client_id) VALUES (?, ?, ?, ?, 'client', ?)")
     ->execute([$login, mb_substr($voornaam, 0, 100), password_hash($ww, PASSWORD_DEFAULT), nu(), $id]);
  antwoord(['login' => $login, 'wachtwoord' => $ww]);
}

if ($actie === 'account-reset') {
  eis_app_verzoek();
  $g = eis_therapeut_of_ontwikkelaar();
  $in = invoer();
  $id = (string)($in['client_id'] ?? '');
  eis_eigen_client($g, $id);
  $q = db()->prepare("SELECT id, email FROM gebruikers WHERE rol = 'client' AND client_id = ?");
  $q->execute([$id]);
  $a = $q->fetch();
  if (!$a) antwoord(['fout' => 'geen-account'], 404);
  $ww = maak_client_wachtwoord();
  db()->prepare('UPDATE gebruikers SET wachtwoord = ? WHERE id = ?')->execute([password_hash($ww, PASSWORD_DEFAULT), $a['id']]);
  db()->prepare('DELETE FROM sessies WHERE gebruiker_id = ?')->execute([$a['id']]); // overal uitloggen
  antwoord(['login' => $a['email'], 'wachtwoord' => $ww]);
}

if ($actie === 'account-weg') {
  eis_app_verzoek();
  $g = eis_therapeut_of_ontwikkelaar();
  $in = invoer();
  $id = (string)($in['client_id'] ?? '');
  eis_eigen_client($g, $id);
  $q = db()->prepare("SELECT id FROM gebruikers WHERE rol = 'client' AND client_id = ?");
  $q->execute([$id]);
  $a = $q->fetchColumn();
  if ($a) {
    db()->prepare('DELETE FROM sessies WHERE gebruiker_id = ?')->execute([$a]);
    db()->prepare('DELETE FROM gebruikers WHERE id = ?')->execute([$a]);
  }
  antwoord(['ok' => true]);
}

/* ---------- Ontwikkelaar-account (therapeut) ---------- */

if ($actie === 'dev-account') {
  eis_therapeut();
  $r = db()->query("SELECT email AS login, aangemaakt, laatst_ingelogd FROM gebruikers WHERE rol = 'ontwikkelaar' LIMIT 1")->fetch();
  antwoord(['account' => $r ?: null]);
}

if ($actie === 'dev-maak') {
  eis_app_verzoek();
  eis_therapeut();
  $in = invoer();
  $login = strtolower(trim((string)($in['login'] ?? '')));
  if (!filter_var($login, FILTER_VALIDATE_EMAIL) && !preg_match('/^[a-z0-9][a-z0-9._-]{2,39}$/', $login)) antwoord(['fout' => 'ongeldige-login'], 400);
  $db = db();
  if ($db->query("SELECT COUNT(*) FROM gebruikers WHERE rol = 'ontwikkelaar'")->fetchColumn() > 0) antwoord(['fout' => 'bestaat-al'], 409);
  $q = $db->prepare('SELECT COUNT(*) FROM gebruikers WHERE email = ?');
  $q->execute([$login]);
  if ((int)$q->fetchColumn() > 0) antwoord(['fout' => 'bestaat-al'], 409);
  $ww = bin2hex(random_bytes(10));
  $db->prepare("INSERT INTO gebruikers (email, naam, wachtwoord, aangemaakt, rol) VALUES (?, 'Ontwikkelaar', ?, ?, 'ontwikkelaar')")
     ->execute([$login, password_hash($ww, PASSWORD_DEFAULT), nu()]);
  antwoord(['login' => $login, 'wachtwoord' => $ww]);
}

if ($actie === 'dev-reset') {
  eis_app_verzoek();
  eis_therapeut();
  $g = db()->query("SELECT id, email FROM gebruikers WHERE rol = 'ontwikkelaar' LIMIT 1")->fetch();
  if (!$g) antwoord(['fout' => 'geen-account'], 404);
  $ww = bin2hex(random_bytes(10));
  db()->prepare('UPDATE gebruikers SET wachtwoord = ? WHERE id = ?')->execute([password_hash($ww, PASSWORD_DEFAULT), $g['id']]);
  db()->prepare('DELETE FROM sessies WHERE gebruiker_id = ?')->execute([$g['id']]);
  antwoord(['login' => $g['email'], 'wachtwoord' => $ww]);
}

if ($actie === 'dev-weg') {
  eis_app_verzoek();
  eis_therapeut();
  foreach (db()->query("SELECT id FROM gebruikers WHERE rol = 'ontwikkelaar'")->fetchAll(PDO::FETCH_COLUMN) as $id) {
    db()->prepare('DELETE FROM sessies WHERE gebruiker_id = ?')->execute([$id]);
    db()->prepare('DELETE FROM gebruikers WHERE id = ?')->execute([$id]);
  }
  antwoord(['ok' => true]);
}

/* ---------- Cliënt ---------- */

// Datum van de cliënt (diens "vandaag") accepteren als die hooguit een dag van de serverdatum afwijkt
function geldige_datum($d) {
  if (!is_string($d) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $d)) return false;
  return abs(strtotime($d) - strtotime(date('Y-m-d'))) <= 86400;
}

if ($actie === 'mijn') {
  $g = eis_client();
  $c = zoek_client($g['client_id']);
  if (!$c) antwoord(['fout' => 'geen-toegang'], 403);
  $p = praktijkgegevens();
  $schema = $c['custom'] ?? null;
  if (!$schema) foreach ($p['schemas'] ?? [] as $s) if (($s['id'] ?? null) === ($c['schema'] ?? '')) $schema = $s;
  // alleen wat de cliënt nodig heeft: voornaam, eigen schema en de kaarten daaruit
  $kaarten = [];
  $cats = [];
  if ($schema) {
    $nodig = array_column($schema['items'] ?? [], 'card');
    foreach ($p['cards'] ?? [] as $k) if (in_array($k['id'] ?? null, $nodig, true)) {
      $kaarten[] = ['id' => $k['id'], 'name' => $k['name'] ?? '', 'cat' => $k['cat'] ?? '', 'note' => $k['note'] ?? ''];
      $cats[$k['cat'] ?? ''] = true;
    }
    $schema = ['id' => $schema['id'] ?? 'schema', 'name' => $schema['name'] ?? '', 'days' => $schema['days'] ?? null, 'weeks' => $schema['weeks'] ?? null,
      'items' => array_map(function ($i) { return ['card' => $i['card'], 'sets' => $i['sets'] ?? 0, 'reps' => $i['reps'] ?? 0, 'hold' => $i['hold'] ?? 0, 'rest' => $i['rest'] ?? 0]; }, $schema['items'] ?? [])];
  }
  $q = db()->prepare('SELECT datum, afgevinkt, beoordelingen FROM client_dagen WHERE client_id = ? AND datum >= ?');
  $q->execute([$g['client_id'], date('Y-m-d', strtotime('-2 days'))]);
  $dagen = [];
  foreach ($q->fetchAll() as $d) $dagen[$d['datum']] = ['afgevinkt' => json_decode($d['afgevinkt']) ?: new stdClass(), 'beoordelingen' => json_decode($d['beoordelingen'], true) ?: []];
  antwoord([
    'client' => ['id' => $c['id'], 'name' => $g['naam']],
    'schema' => $schema,
    'kaarten' => $kaarten,
    'cats' => array_values(array_filter($p['cats'] ?? [], function ($x) use ($cats) { return isset($cats[$x['name'] ?? '']); })),
    'dagen' => $dagen ?: new stdClass(),
  ]);
}

if ($actie === 'voortgang') {
  eis_app_verzoek();
  $g = eis_client();
  $in = invoer();
  $datum = $in['datum'] ?? '';
  if (!geldige_datum($datum)) antwoord(['fout' => 'ongeldige-datum'], 400);
  $af = [];
  foreach ((array)($in['afgevinkt'] ?? []) as $k => $v) if (preg_match('/^[\w-]{1,40}$/', (string)$k) && $v) $af[$k] = true;
  $bo = [];
  foreach ((array)($in['beoordelingen'] ?? []) as $b) {
    if (!is_array($b) || !preg_match('/^[\w-]{1,40}$/', (string)($b['e'] ?? ''))) continue;
    $x = ['e' => (string)$b['e']];
    foreach (['hard', 'fun'] as $f) if (isset($b[$f]) && in_array($b[$f], [1, 2, 3, 4, 5], true)) $x[$f] = $b[$f];
    $bo[] = $x;
  }
  if (count($af) > 200 || count($bo) > 200) antwoord(['fout' => 'te-groot'], 413);
  db()->prepare('REPLACE INTO client_dagen (client_id, datum, afgevinkt, beoordelingen, gewijzigd) VALUES (?, ?, ?, ?, ?)')
      ->execute([$g['client_id'], $datum, json_encode($af ?: new stdClass()), json_encode($bo), nu()]);
  antwoord(['ok' => true]);
}

if ($actie === 'mijn-account') {
  eis_app_verzoek();
  $g = eis_client();
  $in = invoer();
  $db = db();
  // foute pogingen tellen mee voor de inlogbeperking, zodat het huidige wachtwoord hier niet te raden is
  $q = $db->prepare('SELECT COUNT(*) FROM inlogpogingen WHERE (ip = ? OR email = ?) AND tijd > ?');
  $q->execute([client_ip(), $g['email'], nu('-' . POGING_MINUTEN . ' minutes')]);
  if ((int)$q->fetchColumn() >= MAX_POGINGEN) antwoord(['fout' => 'te-vaak'], 429);
  $q = $db->prepare('SELECT wachtwoord FROM gebruikers WHERE id = ?');
  $q->execute([$g['id']]);
  if (!password_verify((string)($in['oud'] ?? ''), $q->fetchColumn())) {
    $db->prepare('INSERT INTO inlogpogingen (ip, email, tijd) VALUES (?, ?, ?)')->execute([client_ip(), $g['email'], nu()]);
    antwoord(['fout' => 'onjuist'], 401);
  }
  $login = strtolower(trim((string)($in['login'] ?? '')));
  $ww = (string)($in['wachtwoord'] ?? '');
  if ($login !== '' && $login !== $g['email']) {
    if (!preg_match('/^[a-z0-9][a-z0-9._-]{2,39}$/', $login)) antwoord(['fout' => 'ongeldige-login'], 400);
    $q = $db->prepare('SELECT COUNT(*) FROM gebruikers WHERE email = ?');
    $q->execute([$login]);
    if ((int)$q->fetchColumn() > 0) antwoord(['fout' => 'bestaat-al'], 409);
    $db->prepare('UPDATE gebruikers SET email = ? WHERE id = ?')->execute([$login, $g['id']]);
  } else $login = $g['email'];
  if ($ww !== '') {
    if (strlen($ww) < 8) antwoord(['fout' => 'te-kort'], 400);
    $db->prepare('UPDATE gebruikers SET wachtwoord = ? WHERE id = ?')->execute([password_hash($ww, PASSWORD_DEFAULT), $g['id']]);
    // andere apparaten uitloggen, dit apparaat blijft ingelogd
    $db->prepare('DELETE FROM sessies WHERE gebruiker_id = ? AND token_hash <> ?')->execute([$g['id'], hash('sha256', $_COOKIE[SESSIE_COOKIE])]);
  }
  antwoord(['login' => $login]);
}

if ($actie === 'wachtwoord') {
  eis_app_verzoek();
  $g = eis_therapeut();
  $in = invoer();
  $nieuw = (string)($in['nieuw'] ?? '');
  if (strlen($nieuw) < 12) antwoord(['fout' => 'te-kort'], 400);
  $q = db()->prepare('SELECT wachtwoord FROM gebruikers WHERE id = ?');
  $q->execute([$g['id']]);
  if (!password_verify((string)($in['oud'] ?? ''), $q->fetchColumn())) antwoord(['fout' => 'onjuist'], 401);
  db()->prepare('UPDATE gebruikers SET wachtwoord = ? WHERE id = ?')->execute([password_hash($nieuw, PASSWORD_DEFAULT), $g['id']]);
  // andere apparaten uitloggen, deze sessie blijft
  db()->prepare('DELETE FROM sessies WHERE gebruiker_id = ? AND token_hash <> ?')->execute([$g['id'], hash('sha256', $_COOKIE[SESSIE_COOKIE])]);
  antwoord(['ok' => true]);
}

antwoord(['fout' => 'onbekende-actie'], 404);

<?php
// Eenmalige installatie: maakt de tabellen en het eerste therapeut-account aan.
// Werkt alleen zolang er nog geen account is, en alleen met de installatiecode (setup_code in config.php,
// die de workflow uit het GitHub-secret SETUP_CODE haalt).
require __DIR__ . '/lib.php';

header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header("Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; form-action 'self'");

$c = instellingen();
maak_tabellen();
$al = (int)db()->query('SELECT COUNT(*) FROM gebruikers')->fetchColumn() > 0;
$melding = '';
$klaar = false;

if (!$al && $_SERVER['REQUEST_METHOD'] === 'POST') {
  $code = (string)($_POST['code'] ?? '');
  $naam = trim((string)($_POST['naam'] ?? ''));
  $email = strtolower(trim((string)($_POST['email'] ?? '')));
  $ww = (string)($_POST['wachtwoord'] ?? '');
  if (empty($c['setup_code']) || !hash_equals((string)$c['setup_code'], $code)) { sleep(2); $melding = 'De installatiecode klopt niet.'; }
  elseif ($naam === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) $melding = 'Vul een naam en een geldig e-mailadres in.';
  elseif (strlen($ww) < 12) $melding = 'Kies een wachtwoord van minstens 12 tekens.';
  elseif ($ww !== (string)($_POST['wachtwoord2'] ?? '')) $melding = 'De twee wachtwoorden zijn niet gelijk.';
  else {
    db()->prepare('INSERT INTO gebruikers (email, naam, wachtwoord, aangemaakt) VALUES (?, ?, ?, ?)')
        ->execute([$email, $naam, password_hash($ww, PASSWORD_DEFAULT), nu()]);
    $klaar = true;
  }
}
$e = function ($s) { return htmlspecialchars($s, ENT_QUOTES, 'UTF-8'); };
?><!doctype html>
<html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Groei Sterker Moves installeren</title>
<style>
body{font:16px/1.5 system-ui,sans-serif;background:#ffdecc;color:#1f1f1f;margin:0;padding:24px 16px}
main{max-width:440px;margin:0 auto;background:#fff;border-radius:18px;padding:24px;border:2px solid #f9b18a}
h1{font-size:1.4rem;margin:0 0 8px} label{display:block;margin-top:12px;font-weight:600;font-size:.9rem}
input{width:100%;box-sizing:border-box;font:inherit;padding:9px 11px;border:1px solid #e6c3ad;border-radius:10px;margin-top:4px}
button{margin-top:18px;font:600 1rem system-ui;background:#f9b18a;border:0;border-radius:999px;padding:11px 22px;cursor:pointer}
.fout{background:#f8e1df;color:#b3362f;padding:10px 12px;border-radius:10px} .ok{background:#e3f3e8;color:#2e7d4f;padding:10px 12px;border-radius:10px}
a{color:#8f4119}
</style></head><body><main>
<h1>Groei Sterker Moves installeren</h1>
<?php if ($klaar): ?>
  <p class="ok">Klaar! Je account is aangemaakt.</p><p><a href="../">Naar de app en inloggen</a></p>
<?php elseif ($al): ?>
  <p class="ok">Groei Sterker Moves is al geïnstalleerd. Deze pagina doet niets meer.</p><p><a href="../">Naar de app</a></p>
<?php else: ?>
  <p>Maak het account voor de therapeut aan. Dit kan maar één keer.</p>
  <?php if ($melding): ?><p class="fout"><?= $e($melding) ?></p><?php endif; ?>
  <form method="post" autocomplete="off">
    <label>Installatiecode<input name="code" type="password" required></label>
    <label>Naam<input name="naam" value="<?= $e($_POST['naam'] ?? '') ?>" required maxlength="100"></label>
    <label>E-mailadres<input name="email" type="email" value="<?= $e($_POST['email'] ?? '') ?>" required maxlength="190"></label>
    <label>Wachtwoord (minstens 12 tekens)<input name="wachtwoord" type="password" required minlength="12" autocomplete="new-password"></label>
    <label>Wachtwoord nog een keer<input name="wachtwoord2" type="password" required minlength="12" autocomplete="new-password"></label>
    <button>Account aanmaken</button>
  </form>
<?php endif; ?>
</main></body></html>

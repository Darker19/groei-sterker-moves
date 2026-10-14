# RugSchema

Prototype van een oefenschema-app voor kinderfysiotherapie (rug).

- `index.html`: de pagina
- `css/style.css`: opmaak
- `js/app.js`: alle logica en schermen
- `js/data.js`: voorbeelddata (alleen verzonnen namen)
- `js/versie.js`: versienummer onderaan de pagina. Wordt bij elke commit automatisch bijgewerkt door `.git/hooks/pre-commit` (dat bestand staat niet in git; zet het terug als je de repo opnieuw kloont)
- `js/categorieen.js`: categorieën beheren (knop ✎ Categorieën in de kaartenbak). De categorieën staan in de gegevens (`S.cats`, naam + kleur), de volgorde daar is de volgorde in de hele app
- `js/import.js`: oefeningen importeren uit Excel (knop in de kaartenbak). Leest het bestand met SheetJS (`js/vendor/xlsx.full.min.js`, Apache-2.0-licentie), dat pas laadt als je het importvenster opent
- `js/opslag.js`: alle opslag op één plek. Op app.groei-sterker.nl praat dit met de API (`api/`); zonder server (GitHub Pages-preview, lokaal) werkt de app als demo met opslag in de browser. Wil je naar een andere database (bijv. Supabase), dan vervang je alleen dit bestand
- `api/`: PHP-API op Hostnet (inloggen en gegevens in MySQL). `api/config.php` staat niet in git: de workflow maakt het bij het uploaden aan uit de GitHub-secrets `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASS` en `SETUP_CODE`. Eenmalig installeren via `https://app.groei-sterker.nl/api/setup.php` (vraagt de installatiecode)
- Versleuteling: praktijkgegevens en wat cliënten invullen staan versleuteld in de database (AES-256-GCM, `versleutel()`/`ontsleutel()` in `api/lib.php`). De sleutel komt uit het GitHub-secret `DATA_KEY` (maken met `openssl rand -base64 32`). Zonder sleutel wordt leesbaar opgeslagen; staat de sleutel er, dan worden oude leesbare gegevens vanzelf versleuteld. **Sleutel kwijt = gegevens kwijt, en verander hem nooit**: bewaar hem ook in een wachtwoordmanager
- `css/fonts.css` + `fonts/`: lettertypen zelf gehost (niet via Google Fonts), SIL Open Font License (`fonts/OFL.txt`)
- `js/accounts.js`: inloggen voor cliënten. De therapeut maakt in de cliëntkaart een account (gebruikersnaam + makkelijk wachtwoord). Een ingelogde cliënt ziet alleen het eigen schema en blijft 30 dagen ingelogd; afvinken en smileys gaan naar de tabel `client_dagen`, apart van de praktijkgegevens. Een bestaande database krijgt de nieuwe kolommen en tabel vanzelf bij het openen van de app
- Ontwikkelaar-account (knop in het praktijkoverzicht, alleen voor de therapeut): ziet de echte oefeningen en schema's, maar nooit de echte cliënten. De ontwikkelaar heeft een eigen opslag (rij 2 in `praktijkdata`) met alleen testcliënten (knop **+ Testcliënten**: Testpiet 6, Testduif 16, Testpiloot 22) en kan daar cliënt-accounts voor maken. Wijzigingen aan oefeningen en schema's door de ontwikkelaar slaat de server niet op

Met **Voorbeelddata herstellen** (rechtsboven in de therapeutweergave, twee keer klikken) zet je alles terug.

## Lokaal draaien

Open de map in VS Code en start **Live Server**, of:

```bash
python3 -m http.server 8000
```

en ga naar http://localhost:8000.

## Let op

Gebruik alleen verzonnen namen zolang de app op een openbare GitHub Pages-site staat.

## Online (GitHub Pages)

Na elke `git push` staat de nieuwe versie binnen een minuut op https://darker19.github.io/rugschema/

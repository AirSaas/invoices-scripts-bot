# Invoices Bot

Bot qui télécharge automatiquement les factures depuis 6 plateformes SaaS via Playwright + Chrome.

**Sites supportés** : Dropcontact, Fullenrich, Hyperline, BetterContact, Sejda, Dedupe

---

## Utilisation

### 1. Installation

```bash
npm install
cp .env.example .env   # puis remplir les variables
```

### 2. Authentification (première fois)

Ouvre un Chrome avec tous les sites en onglets pour se connecter manuellement :

```bash
npm run auth
```

Se connecter à chaque site, puis fermer le navigateur. La session est sauvegardée.

### 3. Gestion des profils Chrome

```bash
npm run profiles
```

Permet de sélectionner/créer un profil Chrome ou de se connecter via CDP (Chrome DevTools Protocol).

### 4. Lancer le bot

```bash
# Tous les sites
npm start

# Sites spécifiques — en langage naturel
node main.js "dropcontact et hyperline"
node main.js "lance drop et better"
node main.js "juste dedupe"
node main.js "fullenrich"
```

Le bot comprend le français naturel grâce à un appel OpenAI (gpt-4o-mini). Si la demande est ambiguë, il pose des questions de clarification dans le terminal :

```
$ node main.js "le truc de contacts"
🤖 Par "le truc de contacts", tu veux dire dropcontact, bettercontact, ou fullenrich ?
👉 better
SITE_FILTER: AI selected → bettercontact
```

### 5. Résultat

- Chaque exécution crée un dossier unique : `factures/YYYY-MM-DD_HHhMM/`
- Les factures sont nommées `YYYY-MM-DD_provider_nom-original.ext` (ex: `2026-03-22_dropcontact_invoice_123.pdf`)
- Relancer le bot le même jour ne risque pas d'écraser les téléchargements précédents
- Les logs texte sont dans `logs/log-YYYY-MM-DD.txt`
- Les logs JSON structurés dans `logs/execution-{timestamp}.json`

Exemple de structure :

```
factures/
  2026-03-22_14h35/
    dropcontact/
      2026-03-22_dropcontact_invoice_123.pdf
    hyperline/
      2026-03-22_hyperline_receipt_001.pdf
  2026-03-22_16h20/
    dropcontact/
      2026-03-22_dropcontact_invoice_123.pdf
```

---

## Variables d'environnement

### Requises

| Variable | Description |
|---|---|
| `OPENAI_API_KEY` | Clé API OpenAI (détection de sélecteurs + filtre de sites) |
| `CDP_PORT` | Port Chrome DevTools Protocol (défaut: 9222) |
| `GMAIL_COMPOSE_URL` | URL de composition Gmail |
| `RECIPIENT_EMAIL` | Email destinataire des factures |
| `FULLENRICH_EMAIL` | Email du compte Fullenrich (sélection compte Google OAuth) |
| `BETTERCONTACT_EMAIL` | Email du compte BetterContact (sélection compte Google OAuth) |

### Optionnelles (fallback si session expirée)

| Variable | Description |
|---|---|
| `SEJDA_EMAIL` / `SEJDA_PSW` | Login auto Sejda si session expirée |
| `BETTERCONTACT_PSW` | Login auto BetterContact si session expirée |
| `FULLENRICH_PSW` | Login auto Fullenrich si session expirée |
| `GMAIL_PSW` | Login auto Gmail si session expirée |
| `RECIPIENT_PSW` | Mot de passe destinataire (si nécessaire) |

> **Note** : Le bot fonctionne en mode CDP — tu te connectes manuellement aux sites dans Chrome avant de lancer. Les mots de passe ne sont qu'un filet de sécurité si la session expire en cours d'exécution.

---

## Architecture

```
main.js                        Point d'entrée, orchestre le flow
auth.js                        Script d'authentification manuelle
manageProfiles.js              Gestion des profils Chrome

sites/
  dropcontact.js               Scraper Dropcontact
  fullenrich.js                Scraper Fullenrich
  hyperline.js                 Scraper Hyperline
  bettercontact.js             Scraper BetterContact
  sejda.js                     Scraper Sejda
  dedupe.js                    Scraper Dedupe

utils/
  browserConfig.js             Connexion CDP ou persistent context
  profileManager.js            Sélection profil Chrome / CDP
  scraperRunner.js             Boucle d'exécution des scrapers
  siteFilter.js                Filtre de sites par langage naturel (OpenAI)
  invoiceDownloader.js         Boucle download + pagination IA
  selectorAI.js                3 appels OpenAI (candidates, selectors, pagination)
  download.js                  Download unitaire (click, event, fallback href)
  folderManager.js             Création du dossier d'exécution horodaté
  executionLogger.js           Logs JSON structurés par exécution
  logger.js                    Logs texte dans fichier + console

factures/                      Factures téléchargées (par run horodaté, par site)
logs/                          Logs texte et JSON
```

### Flow d'exécution

```
main.js
  ├─ parseSiteFilter()         Comprend quels sites lancer (OpenAI chat)
  ├─ createBrowser()           Ouvre Chrome (CDP ou profil persistant)
  ├─ runAllScrapers()          Pour chaque site filtré :
  │    └─ site.run()
  │         └─ downloadAllInvoices()    Boucle par page :
  │              ├─ findCandidateElements()   AI #1 : trouve les éléments de download
  │              ├─ getCssSelectors()         AI #2 : génère des sélecteurs CSS
  │              ├─ attemptDownloads()        Download 1 par 1
  │              ├─ findPaginationElement()   AI #3 : détecte la pagination
  │              └─ click next / scroll       Passe à la page suivante
  └─ log results               Résumé des téléchargements
```

### Options de download

| Option | Défaut | Description |
|---|---|---|
| `maxInvoices` | 12 | Nombre max de factures par site |
| `filterHtml` | `defaultFilterHtml` | Fonction custom pour filtrer le HTML avant les appels IA |

Exemple dans un scraper :

```js
downloadedFiles = await downloadAllInvoices(page, downloadPath, SITE_NAME, executionLog, {
  maxInvoices: 5,
  filterHtml: myCustomFilter,
});
```

---

## Ajouter un nouveau site

4 fichiers à modifier :

1. **Créer** `sites/{nom}.js` — copier le pattern d'un site existant, adapter login + URL
2. **`utils/scraperRunner.js`** — ajouter l'import et l'entrée dans le tableau `allScrapers`
3. **`utils/folderManager.js`** — ajouter le nom du site dans `this.sites`
4. **`auth.js`** — ajouter l'URL dans `authUrls`

Le filtre de sites (`siteFilter.js`) se met à jour automatiquement : la liste `AVAILABLE_SITES` doit inclure le nouveau nom, et le prompt système décrit le contexte de chaque site.

**Authentification** : le scraper doit vérifier si l'utilisateur est déjà connecté (via CDP) avant de tenter un login. Les mots de passe (`*_PSW`) sont optionnels — le bot doit fonctionner sans, tant que l'utilisateur se connecte manuellement avant.

---

## Logs et debug

### Logs texte (`logs/log-YYYY-MM-DD.txt`)

Logs lisibles de l'exécution complète.

### Logs JSON (`logs/execution-{timestamp}.json`)

Structure par site avec :
- `status` : success / partial / failed
- `downloads` : fichiers téléchargés et échoués
- `errors` : phase de l'erreur (navigation, login, ai_candidates, ai_selectors, ai_pagination, download, pagination_click)
- `aiCalls` : candidats trouvés, sélecteurs générés, pagination détectée
- `pages` : pages traitées avec URL

### Niveaux de log dans le code

```
SITE_FILTER:           Sélection des sites (IA)
INVOICE_DOWNLOADER:    Boucle principale de download
PAGE_N:                Traitement de la page N
DOWNLOAD_HTTP:         Status HTTP des fetches directs
DOWNLOAD_CLICK:        Clic sur un élément
DOWNLOAD_OK:           Fichier téléchargé avec succès
DOWNLOAD_FAILED:       Échec de téléchargement
DOWNLOAD_WRITE_OK:     Fichier écrit sur disque
DOWNLOAD_STATS:        Résumé sélecteurs matchés vs essayés
selectorAI:            Appels et réponses IA
```

# Invoices Bot

Bot qui télécharge automatiquement les factures depuis 6 plateformes SaaS, puis les envoie par email via Gmail.

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

- Les factures sont téléchargées dans `factures/<nom-du-site>/`
- Un email récapitulatif avec les pièces jointes est envoyé via Gmail
- Les logs texte sont dans `logs/log-YYYY-MM-DD.txt`
- Les logs JSON structurés dans `logs/execution-{timestamp}.json`

---

## Variables d'environnement

| Variable | Description |
|---|---|
| `OPENAI_API_KEY` | Clé API OpenAI (utilisée pour la détection de sélecteurs et le filtre de sites) |
| `CDP_PORT` | Port Chrome DevTools Protocol (défaut: 9222) |
| `GMAIL_COMPOSE_URL` | URL de composition Gmail |
| `RECIPIENT_EMAIL` | Email destinataire des factures |
| `FULLENRICH_EMAIL/PSW` | Credentials Fullenrich |
| `BETTERCONTACT_EMAIL/PSW` | Credentials BetterContact |
| `SEJDA_EMAIL/PSW` | Credentials Sejda |

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
  emailSender.js               Envoi Gmail avec pièces jointes
  folderManager.js             Création des dossiers requis
  executionLogger.js           Logs JSON structurés par exécution
  logger.js                    Logs texte dans fichier + console

factures/                      Factures téléchargées (par site)
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
  └─ sendEmail()               Envoie les factures par Gmail
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

5 fichiers à modifier :

1. **Créer** `sites/{nom}.js` — copier le pattern d'un site existant, adapter login + URL
2. **`utils/scraperRunner.js`** — ajouter l'import et l'entrée dans le tableau `allScrapers`
3. **`utils/folderManager.js`** — ajouter `factures/{nom}` dans `requiredFolders`
4. **`auth.js`** — ajouter l'URL dans `authUrls`
5. **`utils/emailSender.js`** — ajouter dans `expectedSites` de `generateDynamicEmailBody`

Le filtre de sites (`siteFilter.js`) se met à jour automatiquement : la liste `AVAILABLE_SITES` doit inclure le nouveau nom, et le prompt système décrit le contexte de chaque site.

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

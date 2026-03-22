# Invoices Bot

Bot qui télécharge automatiquement les factures depuis plusieurs SaaS via Playwright + Chrome.

**Sites supportés** : Dropcontact, Fullenrich, Hyperline, BetterContact, Dedupe

---

## Utilisation

### 1. Installation

```bash
npm install
cp .env.example .env   # puis remplir les variables
```

### 2. Authentification (première fois)

Ouvre un Chrome avec les sites de l'utilisateur en onglets pour se connecter manuellement :

```bash
npm run auth                    # menu interactif : choix du user
node auth.js "bertran"          # auth directe pour Bertran
```

Se connecter à chaque site, puis fermer le navigateur. La session est sauvegardée.

### 3. Gestion des profils Chrome

```bash
npm run profiles
```

Permet de sélectionner/créer un profil Chrome ou de se connecter via CDP (Chrome DevTools Protocol).

### 4. Lancer le bot

```bash
# Menu interactif (choix du user, puis des sites)
npm start

# User + mode + sites — en langage naturel
node main.js "bertran batch dropcontact et hyperline"
node main.js "bertran all"
node main.js "simon batch drop"
node main.js "bertran juste dedupe"
```

**Deux modes de téléchargement :**

| Mode | Défaut | Description |
|---|---|---|
| `batch` | 3 factures | Téléchargement rapide (vérification) |
| `all` | 12 factures | Téléchargement complet |

Le mode par défaut est `batch`. Chaque site peut avoir un override dans `SITE_CONFIG` (`utils/scraperRunner.js`).

Le bot comprend le français naturel grâce à un appel OpenAI (gpt-4o-mini). Si la demande est ambiguë, il pose des questions de clarification dans le terminal :

```
$ node main.js "bertran le truc de contacts"
🤖 Par "le truc de contacts", tu veux dire dropcontact, bettercontact, ou fullenrich ?
👉 better
SITE_FILTER: AI selected → bettercontact (mode: batch)
```

### 5. Résultat

- Chaque exécution crée un dossier unique : `factures/{user}/YYYY-MM-DD_HHhMM/`
- Les factures sont nommées `YYYY-MM-DD_provider_nom-original.ext` (ex: `2026-03-22_dropcontact_invoice_123.pdf`)
- Relancer le bot le même jour ne risque pas d'écraser les téléchargements précédents
- Les logs texte sont dans `logs/log-YYYY-MM-DD.txt`
- Les logs JSON structurés dans `logs/execution-{timestamp}.json`

Exemple de structure :

```
factures/
  bertran/
    2026-03-22_14h35/
      dropcontact/
        2026-03-22_dropcontact_invoice_123.pdf
      hyperline/
        2026-03-22_hyperline_receipt_001.pdf
  simon/
    2026-03-22_16h20/
      dropcontact/
        2026-03-22_dropcontact_invoice_456.pdf
```

---

## Multi-utilisateur

La config des utilisateurs est dans `users.config.js` :

```js
const USERS = {
  bertran: {
    displayName: 'Bertran',
    sites: ['dropcontact', 'fullenrich', 'hyperline', 'bettercontact', 'dedupe'],
  },
  simon: {
    displayName: 'Simon',
    sites: [],  // à remplir
  },
};
```

**Ajouter un utilisateur** : ajouter une entrée dans `users.config.js` avec `displayName` et `sites`.

**Ajouter un site à un utilisateur** : ajouter le nom du site dans son tableau `sites`.

---

## Variables d'environnement

### Requises

| Variable | Description |
|---|---|
| `OPENAI_API_KEY` | Clé API OpenAI (détection de sélecteurs + filtre de sites) |
| `CDP_PORT` | Port Chrome DevTools Protocol (défaut: 9222) |

### Optionnelles — fallback login si session expirée

| Variable | Description |
|---|---|
| `FULLENRICH_EMAIL` | Sélection compte Google OAuth (si plusieurs comptes) |
| `BETTERCONTACT_EMAIL` | Sélection compte Google OAuth (si plusieurs comptes) |
| `BETTERCONTACT_PSW` | Login auto BetterContact |
| `FULLENRICH_PSW` | Login auto Fullenrich |

> **Note** : Le bot fonctionne en mode CDP — tu te connectes manuellement aux sites dans Chrome avant de lancer. Les mots de passe et emails ne sont qu'un filet de sécurité si la session expire en cours d'exécution.

---

## Architecture

```
main.js                        Point d'entrée, orchestre le flow
auth.js                        Script d'authentification manuelle
users.config.js                Config multi-utilisateur (sites par personne)
manageProfiles.js              Gestion des profils Chrome

sites/
  dropcontact.js               Scraper Dropcontact
  fullenrich.js                Scraper Fullenrich
  hyperline.js                 Scraper Hyperline
  bettercontact.js             Scraper BetterContact
  dedupe.js                    Scraper Dedupe

utils/
  userManager.js               Sélection utilisateur (CLI ou menu interactif)
  browserConfig.js             Connexion CDP ou persistent context
  profileManager.js            Sélection profil Chrome / CDP
  scraperRunner.js             Registre des scrapers + boucle d'exécution
  siteFilter.js                Filtre de sites par langage naturel (OpenAI)
  invoiceDownloader.js         Boucle download + pagination IA
  selectorAI.js                3 appels OpenAI (candidates, selectors, pagination)
  download.js                  Download unitaire (click, event, fallback href)
  folderManager.js             Création du dossier d'exécution horodaté par user
  executionLogger.js           Logs JSON structurés par exécution
  logger.js                    Logs texte dans fichier + console

factures/{user}/               Factures téléchargées (par user, par run, par site)
logs/                          Logs texte et JSON
```

### Flow d'exécution

```
main.js
  ├─ selectUser()              Résout l'utilisateur (CLI ou menu interactif)
  ├─ parseSiteFilter()         Comprend quels sites lancer (OpenAI chat, scopé au user)
  ├─ FolderManager(user)       Crée factures/{user}/YYYY-MM-DD_HHhMM/{site}/
  ├─ createBrowser()           Ouvre Chrome (CDP ou profil persistant)
  ├─ runAllScrapers()          Pour chaque site du user :
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
| `maxInvoices` | 3 (batch) / 12 (all) | Nombre max de factures par site, selon le mode |
| `filterHtml` | `defaultFilterHtml` | Fonction custom pour filtrer le HTML avant les appels IA |

---

## Ajouter un nouveau site

4 fichiers à modifier :

1. **Créer** `sites/{nom}.js` — copier le pattern d'un site existant, adapter login + URL
2. **`utils/scraperRunner.js`** — ajouter une entrée dans `SCRAPER_REGISTRY`
3. **`auth.js`** — ajouter l'URL dans `allAuthUrls` (avec le champ `site`)
4. **`users.config.js`** — ajouter le site dans les `sites` de l'utilisateur concerné

Le filtre de sites (`siteFilter.js`) s'adapte automatiquement : il reçoit la liste de sites du user en paramètre.

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
USER_MANAGER:          Sélection de l'utilisateur
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

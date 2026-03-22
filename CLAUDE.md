# Invoices Bot — Instructions Claude

## Projet

Bot qui télécharge automatiquement les factures depuis plusieurs SaaS (Dropcontact, Fullenrich, Hyperline, BetterContact, Dedupe) via Playwright + Chrome.

## Architecture

- `main.js` — point d'entrée, orchestre le flow complet
- `users.config.js` — config multi-utilisateur (liste des sites par personne)
- `sites/*.js` — un scraper par site (navigation + login spécifique au site)
- `utils/userManager.js` — sélection utilisateur (CLI ou menu interactif)
- `utils/invoiceDownloader.js` — boucle générique : download 1 par 1 + pagination IA
- `utils/selectorAI.js` — 3 appels OpenAI (findCandidateElements, getCssSelectors, findPaginationElement)
- `utils/download.js` — download unitaire d'un fichier (click, event download/popup, fallback href)
- `utils/executionLogger.js` — logs JSON structurés par exécution
- `utils/browserConfig.js` — connexion CDP ou persistent context
- `utils/profileManager.js` — menu sélection profil Chrome / CDP

## Procédure "Lance le bot"

Quand l'utilisateur demande de lancer le bot, d'exécuter les scrapers, ou de tester le téléchargement, suivre cette boucle **automatiquement** sans attendre de validation entre chaque étape :

### Boucle (max 3 tentatives)

1. **Lancer** `npm start`
2. **Lire** le dernier fichier `logs/execution-*.json`
3. **Analyser** chaque site :
   - `status` : success / partial / failed
   - `downloads` : fichiers téléchargés et échoués
   - `errors` : phase de l'erreur (navigation, login, ai_candidates, ai_selectors, ai_pagination, download, pagination_click)
   - `aiCalls` : candidats trouvés ? sélecteurs générés ? pagination détectée ?
4. **Si des sites ont échoué** → corriger le code directement, puis **relancer** (retour à l'étape 1)
5. **Si tout est OK** → sortir de la boucle

Types de corrections possibles :
- Sélecteurs qui ne matchent pas → ajuster le prompt IA ou les fallback selectors
- Login échoué → vérifier les sélecteurs de login du site
- Pagination non détectée → ajuster le prompt de findPaginationElement
- Timeout → augmenter les délais
- Erreur réseau → ajouter retry

### Résumé final

Après la dernière tentative (succès ou max atteint), envoyer un message résumé à l'utilisateur :
- Nombre de sites OK / KO
- Nombre total de fichiers téléchargés
- Problèmes restants non résolus (si max 3 tentatives atteint)
- Changements de code effectués pendant les itérations

## Multi-utilisateur

Le bot supporte plusieurs utilisateurs. La config est dans `users.config.js` :

```js
const USERS = {
  bertran: { displayName: 'Bertran', sites: ['dropcontact', 'fullenrich', ...] },
  simon:   { displayName: 'Simon',   sites: [] },
};
```

Usage CLI : `node main.js "bertran quarter drop"` ou `node main.js` (menu interactif).
Les factures sont rangées dans `factures/{user}/YYYY-MM-DD_HHhMM/{site}/`.

### Ajouter un nouvel utilisateur

1 fichier à modifier : `users.config.js` — ajouter une entrée avec `displayName` et `sites`.

## Procédure "Ajouter un nouveau site"

Quand l'utilisateur demande d'ajouter un site, **poser ces 3 questions AVANT de coder** :

### Questions obligatoires

1. **Nom du site + URL billing** — "Quel est le nom du site et l'URL de la page factures/billing ?"
2. **Pour quel(s) utilisateur(s) ?** — Lister les users disponibles (lire `users.config.js`). Exemple : "Pour qui ? Users disponibles : Bertran, Simon, Matthieu"
3. **Nombre de factures spécifique ?** — "Le nombre de factures par défaut est 3 (quarter) / 12 (year). Ce site a-t-il un nombre précis à récupérer (pour le mode cron/target) ?" Si oui → ajouter `target: N` dans `SITE_CONFIG` de `utils/scraperRunner.js`.

### Fichiers à modifier (4 fichiers)

1. **Créer `sites/{nom}.js`** — copier le pattern d'un site existant, adapter login + URL
2. **`utils/scraperRunner.js`** — ajouter une entrée dans `SCRAPER_REGISTRY` (+ `SITE_CONFIG` si nb custom)
3. **`auth.js`** — ajouter l'URL dans `allAuthUrls` (avec le champ `site`)
4. **`users.config.js`** — ajouter le site dans les `sites` du/des utilisateur(s) concerné(s)

### Règle authentification (CDP)

Le bot fonctionne en mode CDP : l'utilisateur se connecte manuellement aux sites dans Chrome avant de lancer le bot. Les scrapers **ne doivent jamais exiger de mot de passe** pour fonctionner.

Pattern à suivre dans `sites/{nom}.js` :
1. Naviguer vers la page cible (factures/billing)
2. Vérifier si on est redirigé vers une page de login
3. **Si déjà connecté** → continuer normalement
4. **Si session expirée et mot de passe dispo** (`process.env.{NOM}_PSW`) → tenter le login auto
5. **Si session expirée et pas de mot de passe** → log un warning clair et throw (ne pas crasher silencieusement)

Les variables `*_PSW` dans `.env` sont **optionnelles** — c'est un fallback, pas le fonctionnement principal.
Les variables `*_EMAIL` ne sont utiles que pour sélectionner le bon compte Google si le site utilise Google OAuth avec plusieurs comptes connectés.

### Test après ajout

Lancer `node auth.js "{user}"` pour ouvrir Chrome et se connecter au nouveau site, puis `node main.js "{user} quarter {site}"` pour tester le téléchargement.

## Git

- À chaque push sur `main`, mettre à jour le `README.md` si les changements l'impactent.

## Conventions

- JavaScript (pas TypeScript), Node.js, CommonJS (`require`/`module.exports`)
- Logs texte dans `logs/log-YYYY-MM-DD.txt` via `utils/logger.js`
- Logs JSON structurés dans `logs/execution-{timestamp}.json` via `utils/executionLogger.js`
- Factures téléchargées dans `factures/{user}/YYYY-MM-DD_HHhMM/{site}/`
- Variables d'environnement dans `.env` (voir `.env.example`)
- Prompts IA en espagnol (historique), multilingue FR/EN/ES pour les sélecteurs

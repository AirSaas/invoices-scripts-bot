# Invoices Bot — Instructions Claude

## Projet

Bot qui télécharge automatiquement les factures depuis 6 plateformes SaaS (Dropcontact, Fullenrich, Hyperline, BetterContact, Sejda, Dedupe) via Playwright + Chrome, puis les envoie par email via Gmail.

## Architecture

- `main.js` — point d'entrée, orchestre le flow complet
- `sites/*.js` — un scraper par site (navigation + login spécifique au site)
- `utils/invoiceDownloader.js` — boucle générique : download 1 par 1 + pagination IA
- `utils/selectorAI.js` — 3 appels OpenAI (findCandidateElements, getCssSelectors, findPaginationElement)
- `utils/download.js` — download unitaire d'un fichier (click, event download/popup, fallback href)
- `utils/executionLogger.js` — logs JSON structurés par exécution
- `utils/emailSender.js` — envoi Gmail avec pièces jointes
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

## Ajouter un nouveau site

5 fichiers à modifier :
1. Créer `sites/{nom}.js` (copier le pattern d'un site existant, adapter login + URL)
2. `utils/scraperRunner.js` — ajouter l'import et l'entrée dans le tableau `scrapers`
3. `utils/folderManager.js` — ajouter `factures/{nom}` dans `requiredFolders`
4. `auth.js` — ajouter l'URL dans `authUrls`
5. `utils/emailSender.js` — ajouter dans `expectedSites` de `generateDynamicEmailBody`

## Conventions

- JavaScript (pas TypeScript), Node.js, CommonJS (`require`/`module.exports`)
- Logs texte dans `logs/log-YYYY-MM-DD.txt` via `utils/logger.js`
- Logs JSON structurés dans `logs/execution-{timestamp}.json` via `utils/executionLogger.js`
- Factures téléchargées dans `factures/{nom-du-site}/`
- Variables d'environnement dans `.env` (voir `.env.example`)
- Prompts IA en espagnol (historique), multilingue FR/EN/ES pour les sélecteurs

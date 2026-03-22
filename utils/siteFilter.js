const { log } = require('./logger');

/**
 * Alias map: each key is a keyword that can match a site.
 * Values are the canonical site names used in scraperRunner.
 */
const SITE_ALIASES = {
  // Dropcontact
  'dropcontact': 'dropcontact',
  'drop': 'dropcontact',

  // Fullenrich
  'fullenrich': 'fullenrich',
  'full': 'fullenrich',
  'enrich': 'fullenrich',

  // Hyperline
  'hyperline': 'hyperline',
  'hyper': 'hyperline',

  // BetterContact
  'bettercontact': 'bettercontact',
  'better': 'bettercontact',
  'betterco': 'bettercontact',

  // Sejda
  'sejda': 'sejda',

  // Dedupe
  'dedupe': 'dedupe',
  'dedup': 'dedupe',
};

/**
 * Parse a natural language phrase and return matching site names.
 * Examples:
 *   "dropcontact et hyperline" → ['dropcontact', 'hyperline']
 *   "lance drop et better"     → ['dropcontact', 'bettercontact']
 *   "je veux fullenrich"       → ['fullenrich']
 *   ""                         → [] (means: run all)
 *
 * @param {string} input - Natural language phrase
 * @returns {{ matched: string[], unknown: string[] }}
 */
function parseSiteFilter(input) {
  if (!input || !input.trim()) {
    return { matched: [], unknown: [] };
  }

  // Normalize: lowercase, remove accents, split on non-alpha chars
  const normalized = input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, ' ')
    .trim();

  const words = normalized.split(/\s+/).filter(w => w.length > 2);

  const matched = new Set();
  const unknown = [];

  for (const word of words) {
    // Skip common filler words
    if (['les', 'des', 'une', 'est', 'que', 'qui', 'pour', 'avec', 'dans',
         'sur', 'par', 'pas', 'tout', 'tous', 'the', 'and', 'for', 'but',
         'lance', 'lancer', 'run', 'start', 'execute', 'veux', 'veut',
         'factures', 'facture', 'invoices', 'invoice',
         'site', 'sites', 'seulement', 'only', 'just',
         'fait', 'faire', 'moi', 'juste'].includes(word)) {
      continue;
    }

    if (SITE_ALIASES[word]) {
      matched.add(SITE_ALIASES[word]);
    } else {
      // Try partial match (word is contained in alias or alias in word)
      let found = false;
      for (const [alias, site] of Object.entries(SITE_ALIASES)) {
        if (alias.includes(word) || word.includes(alias)) {
          matched.add(site);
          found = true;
          break;
        }
      }
      if (!found) {
        unknown.push(word);
      }
    }
  }

  return { matched: [...matched], unknown };
}

/**
 * Filter the scrapers list based on parsed site names.
 * If no filter (empty matched), returns all scrapers.
 *
 * @param {Array} scrapers - Full list of scrapers from scraperRunner
 * @param {string[]} siteNames - Canonical site names to keep
 * @returns {Array} Filtered scrapers
 */
function filterScrapers(scrapers, siteNames) {
  if (!siteNames || siteNames.length === 0) {
    return scrapers; // No filter = run all
  }

  return scrapers.filter(s => {
    const name = (s.bot.SITE_NAME || s.name).toLowerCase();
    return siteNames.includes(name);
  });
}

module.exports = { parseSiteFilter, filterScrapers, SITE_ALIASES };

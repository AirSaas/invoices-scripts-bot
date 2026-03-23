const { log } = require('./logger');
const path = require('path');
const { filterScrapers } = require('./siteFilter');

// Scraper registry: maps site name to display name and module path
const SCRAPER_REGISTRY = {
  dropcontact:   { name: 'Dropcontact',   module: '../sites/dropcontact' },
  fullenrich:    { name: 'Fullenrich',     module: '../sites/fullenrich' },
  hyperline:     { name: 'Hyperline',      module: '../sites/hyperline' },
  bettercontact: { name: 'BetterContact',  module: '../sites/bettercontact' },
  sejda:         { name: 'Sejda',          module: '../sites/sejda' },
  dedupe:        { name: 'Dedupe',         module: '../sites/dedupe' },
  claude:        { name: 'Claude',        module: '../sites/claude' },
  ubereats:      { name: 'UberEats',      module: '../sites/ubereats' },
};

// Download mode defaults
const MODE_DEFAULTS = {
  quarter: 3,
  year: 12,
};

// Per-site config (optional). Only 'target' is used: nb précis de factures à fetch.
// Sites SANS target sont skippés en mode target.
// Usage cron : `node main.js "bertran target"` → ne lance que les sites configurés.
// Example: { target: 5 }
const SITE_CONFIG = {
  dropcontact: {},
  fullenrich: {},
  hyperline: {},
  bettercontact: {},
  sejda: {},
  dedupe: {},
  claude: { target: 200 },
  ubereats: { target: 25 },
};

/**
 * Get maxInvoices for a site based on mode and per-site config.
 * Returns null in 'target' mode if the site has no target config (= skip this site).
 */
function getMaxInvoices(siteName, mode) {
  const siteConf = SITE_CONFIG[siteName] || {};
  if (mode === 'target') {
    return siteConf.target ?? null;
  }
  return MODE_DEFAULTS[mode] ?? MODE_DEFAULTS.quarter;
}

/**
 * Build scraper list from user's sites, using the registry for lazy require.
 * @param {string[]} userSites - Sites to load
 */
function buildScraperList(userSites) {
  return userSites
    .filter(s => SCRAPER_REGISTRY[s])
    .map(s => ({
      name: SCRAPER_REGISTRY[s].name,
      bot: require(SCRAPER_REGISTRY[s].module),
    }));
}

async function runAllScrapers(browser, executionLog, siteFilter = [], folderManager = null, mode = 'quarter', userSites = []) {
  let allDownloadedFiles = [];

  const allScrapers = buildScraperList(userSites);
  const scrapers = filterScrapers(allScrapers, siteFilter);

  if (siteFilter.length > 0) {
    log(`===== STARTING SCRAPERS (filtered: ${siteFilter.join(', ')}, mode: ${mode}) =====`);
    log(`Running ${scrapers.length}/${allScrapers.length} scrapers`);
  } else {
    log(`===== STARTING SCRAPERS (all, mode: ${mode}) =====`);
  }

  // Run each scraper
  for (const scraper of scrapers) {
    const siteName = scraper.bot.SITE_NAME || scraper.name.toLowerCase();

    // Initialize site in execution log
    if (executionLog) {
      executionLog.startSite(siteName);
    }

    try {
      const maxInvoices = getMaxInvoices(siteName, mode);
      if (maxInvoices === null) {
        log(`SKIP ${scraper.name.toUpperCase()}: no 'target' config for this site`);
        continue;
      }
      log(`===== EXECUTING ${scraper.name.toUpperCase()} SCRAPER (max: ${maxInvoices} invoices) =====`);
      const files = await scraper.bot.run(browser, executionLog, folderManager, { maxInvoices });

      if (files && files.length > 0) {
        allDownloadedFiles.push(...files);
        log(`${scraper.name.toUpperCase()} SUCCESS: Downloaded ${files.length} file(s)`);
        files.forEach(file => log(`  - ${path.basename(file)}`));

        if (executionLog) {
          executionLog.finishSite(siteName, 'success');
        }
      } else {
        log(`${scraper.name.toUpperCase()} NO_FILES: No files downloaded`);

        if (executionLog) {
          executionLog.finishSite(siteName, 'partial');
        }
      }

    } catch (error) {
      log(`${scraper.name.toUpperCase()} ERROR: ${error.message}`);

      if (executionLog) {
        executionLog.logError(siteName, {
          phase: 'scraper_run',
          message: error.message,
          stack: error.stack,
        });
        executionLog.finishSite(siteName, 'failed');
      }
      // Continue with the next scraper even if one fails
    }
  }

  log("===== SCRAPERS COMPLETED =====");
  log(`Total files downloaded: ${allDownloadedFiles.length}`);

  if (allDownloadedFiles.length > 0) {
    log("Downloaded files:");
    allDownloadedFiles.forEach(file => log(`  - ${path.basename(file)}`));
  }

  return allDownloadedFiles;
}

module.exports = { runAllScrapers, MODE_DEFAULTS, SITE_CONFIG, SCRAPER_REGISTRY };

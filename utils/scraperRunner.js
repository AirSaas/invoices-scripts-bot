const { log } = require('./logger');
const path = require('path');
const { filterScrapers } = require('./siteFilter');

// Import all scrapers
const sejdaBot = require('../sites/sejda');
const dropcontactBot = require('../sites/dropcontact');
const fullenrichBot = require('../sites/fullenrich');
const hyperlineBot = require('../sites/hyperline');
const bettercontactBot = require('../sites/bettercontact');
const dedupeBot = require('../sites/dedupe');

// Download mode defaults
const MODE_DEFAULTS = {
  batch: 3,
  all: 12,
};

// Per-site overrides (optional). Set batch/all to override the default for a specific site.
// Example: { batch: 5, all: 20 }
const SITE_CONFIG = {
  dropcontact: {},
  fullenrich: {},
  hyperline: {},
  bettercontact: {},
  sejda: {},
  dedupe: {},
};

/**
 * Get maxInvoices for a site based on mode and per-site config.
 */
function getMaxInvoices(siteName, mode) {
  const siteConf = SITE_CONFIG[siteName] || {};
  return siteConf[mode] ?? MODE_DEFAULTS[mode] ?? MODE_DEFAULTS.batch;
}

async function runAllScrapers(browser, executionLog, siteFilter = [], folderManager = null, mode = 'batch') {
  let allDownloadedFiles = [];

  // List of scrapers to run
  const allScrapers = [
    { name: 'Dropcontact', bot: dropcontactBot },
    { name: 'Fullenrich', bot: fullenrichBot },
    { name: 'Hyperline', bot: hyperlineBot },
    { name: 'BetterContact', bot: bettercontactBot },
    //{ name: 'Sejda', bot: sejdaBot },
    { name: 'Dedupe', bot: dedupeBot }
  ];

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

module.exports = { runAllScrapers, MODE_DEFAULTS, SITE_CONFIG };

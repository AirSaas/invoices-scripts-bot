const { log } = require('./logger');
const path = require('path');

// Import all scrapers
const sejdaBot = require('../sites/sejda');
const dropcontactBot = require('../sites/dropcontact');
const fullenrichBot = require('../sites/fullenrich');
const hyperlineBot = require('../sites/hyperline');
const bettercontactBot = require('../sites/bettercontact');
const dedupeBot = require('../sites/dedupe');

async function runAllScrapers(browser, executionLog) {
  let allDownloadedFiles = [];

  log("===== STARTING SCRAPERS =====");

  // List of scrapers to run
  const scrapers = [
    { name: 'Dropcontact', bot: dropcontactBot },
    { name: 'Fullenrich', bot: fullenrichBot },
    { name: 'Hyperline', bot: hyperlineBot },
    { name: 'BetterContact', bot: bettercontactBot },
    //{ name: 'Sejda', bot: sejdaBot },
    { name: 'Dedupe', bot: dedupeBot }
  ];

  // Run each scraper
  for (const scraper of scrapers) {
    const siteName = scraper.bot.SITE_NAME || scraper.name.toLowerCase();

    // Initialize site in execution log
    if (executionLog) {
      executionLog.startSite(siteName);
    }

    try {
      log(`===== EXECUTING ${scraper.name.toUpperCase()} SCRAPER =====`);
      const files = await scraper.bot.run(browser, executionLog);

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

module.exports = { runAllScrapers };

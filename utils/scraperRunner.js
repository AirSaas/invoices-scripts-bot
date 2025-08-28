const { log } = require('./logger');
const path = require('path');

// Importar todos los scrapers
const sejdaBot = require('../sites/sejda');
const dropcontactBot = require('../sites/dropcontact');
const fullenrichBot = require('../sites/fullenrich');
const hyperlineBot = require('../sites/hyperline');
const bettercontactBot = require('../sites/bettercontact');
const dedupeBot = require('../sites/dedupe');

async function runAllScrapers(browser) {
  let allDownloadedFiles = [];
  
  log("===== STARTING SCRAPERS =====");

  // Lista de scrapers a ejecutar
  const scrapers = [
    { name: 'Dropcontact', bot: dropcontactBot },
    { name: 'Fullenrich', bot: fullenrichBot },
    { name: 'Hyperline', bot: hyperlineBot },
    { name: 'BetterContact', bot: bettercontactBot },
    //{ name: 'Sejda', bot: sejdaBot },
    { name: 'Dedupe', bot: dedupeBot }
  ];

  // Ejecutar cada scraper
  for (const scraper of scrapers) {
    try {
      log(`===== EXECUTING ${scraper.name.toUpperCase()} SCRAPER =====`);
      const files = await scraper.bot.run(browser);
      
      if (files && files.length > 0) {
        allDownloadedFiles.push(...files);
        log(`${scraper.name.toUpperCase()} SUCCESS: Downloaded ${files.length} file(s)`);
        files.forEach(file => log(`  - ${path.basename(file)}`));
      } else {
        log(`${scraper.name.toUpperCase()} NO_FILES: No files downloaded`);
      }
      
    } catch (error) {
      log(`${scraper.name.toUpperCase()} ERROR: ${error.message}`);
      // Continuar con el siguiente scraper aunque uno falle
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

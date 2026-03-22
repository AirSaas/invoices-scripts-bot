require('dotenv').config();
const { log } = require('./utils/logger');
const { createBrowser, closeBrowser } = require('./utils/browserConfig');
const { runAllScrapers } = require('./utils/scraperRunner');
const ProfileManager = require('./utils/profileManager');
const FolderManager = require('./utils/folderManager');
const ExecutionLogger = require('./utils/executionLogger');
const { parseSiteFilter } = require('./utils/siteFilter');

async function main() {
  log("===== INVOICES BOT STARTED =====");

  // Parse site filter from CLI args: node main.js "dropcontact et hyperline"
  const rawFilter = process.argv.slice(2).join(' ');
  const siteFilter = await parseSiteFilter(rawFilter);

  // Initialize execution logger (JSON structured logs)
  const executionLog = new ExecutionLogger();

  // Initialize folder structure first
  try {
    const folderManager = new FolderManager();
    log("Initializing required folders...");
    await folderManager.initializeFolders();

    // Verify all folders exist
    const folderStatus = folderManager.checkFoldersExist();
    if (!folderStatus.allExist) {
      log(`WARNING: Some folders are missing: ${folderStatus.missingFolders.join(', ')}`);
    } else {
      log("All required folders are ready");
    }
  } catch (error) {
    log(`CRITICAL ERROR: Failed to initialize folders: ${error.message}`);
    log("The bot cannot run without proper folder structure");
    process.exit(1);
  }

  // Initialize profile manager
  const profileManager = new ProfileManager();

  // Show profile selection menu
  log("Detecting available Chrome profiles...");
  const selectedProfile = await profileManager.showProfileMenu();

  // Validate selected profile
  try {
    profileManager.validateProfile(selectedProfile);
  } catch (error) {
    log(`Error with selected profile: ${error.message}`);
    process.exit(1);
  }

  log(`\nStarting bot with profile: ${selectedProfile.description}`);

  let browser;
  try {
    // Create and configure browser with selected profile
    browser = await createBrowser(selectedProfile);

    // Execute all scrapers with execution logging
    const allDownloadedFiles = await runAllScrapers(browser, executionLog, siteFilter);

    log(`===== DOWNLOAD COMPLETE: ${allDownloadedFiles.length} file(s) =====`);

  } catch (error) {
    log(`===== GENERAL ERROR =====`);
    log(`ERROR: ${error.message}`);

    if (error.message.includes('Profile directory is in use')) {
      log('SOLUTION: Close Google Chrome and try again.');
    }
  } finally {
    if (browser) {
      await closeBrowser(browser);
      log("===== BROWSER CLOSED =====");
    }

    // Save execution log to JSON file
    try {
      const logPath = executionLog.save();
      log(`===== EXECUTION LOG SAVED: ${logPath} =====`);
    } catch (saveError) {
      log(`ERROR saving execution log: ${saveError.message}`);
    }

    log("===== INVOICES BOT FINISHED =====");
  }
}

// Execute main function
main().catch(error => {
  log(`FATAL ERROR: ${error.message}`);
  process.exit(1);
});

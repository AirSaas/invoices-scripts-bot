require('dotenv').config();
const { log } = require('./utils/logger');
const { createBrowser } = require('./utils/browserConfig');
const { runAllScrapers } = require('./utils/scraperRunner');
const { sendEmail } = require('./utils/emailSender');
const ProfileManager = require('./utils/profileManager');

async function main() {
  log("===== INVOICES BOT STARTED =====");
  
  // Initialize profile manager
  const profileManager = new ProfileManager();
  
  // Show profile selection menu
  log("🔍 Detecting available Chrome profiles...");
  const selectedProfile = await profileManager.showProfileMenu();
  
  // Validate selected profile
  try {
    profileManager.validateProfile(selectedProfile);
  } catch (error) {
    log(`❌ Error with selected profile: ${error.message}`);
    process.exit(1);
  }
  
  log(`\n🚀 Starting bot with profile: ${selectedProfile.description}`);
  
  let browser;
  try {
    // Create and configure browser with selected profile
    browser = await createBrowser(selectedProfile);
    
    // Execute all scrapers
    const allDownloadedFiles = await runAllScrapers(browser);
    
    // Send email if there are downloaded files
    if (allDownloadedFiles.length > 0) {
      log("===== SENDING EMAIL =====");
      log(`Sending email with ${allDownloadedFiles.length} files`);
      await sendEmail(browser, allDownloadedFiles);
      log("===== EMAIL SENT =====");
    } else {
      log("===== NO FILES TO EMAIL =====");
    }

  } catch (error) {
    log(`===== GENERAL ERROR =====`);
    log(`ERROR: ${error.message}`);
    
    if (error.message.includes('Profile directory is in use')) {
      log('SOLUTION: Close Google Chrome and try again.');
    }
  } finally {
    if (browser) {
      await browser.close();
      log("===== BROWSER CLOSED =====");
    }
    log("===== INVOICES BOT FINISHED =====");
  }
}

// Execute main function
main().catch(error => {
  log(`FATAL ERROR: ${error.message}`);
  process.exit(1);
});

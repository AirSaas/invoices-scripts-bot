require("dotenv").config();
const { log } = require("./utils/logger");
const { createBrowser } = require("./utils/browserConfig");
const ProfileManager = require("./utils/profileManager");

async function auth() {
  log("===== AUTHENTICATION SCRIPT STARTED =====");
  log(
    "This script will open a Chrome browser window with all required websites in separate tabs."
  );
  log("");
  log(
    "After completing authentication, close the browser window manually to save your session."
  );
  log("");

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
  
  log(`\n🔐 Starting authentication with profile: ${selectedProfile.description}`);

  let browser;
  try {
    // Create and configure browser with selected profile
    browser = await createBrowser(selectedProfile);

    log("===== BROWSER OPENED =====");
    log("Opening required websites in separate tabs...");

    // List of URLs that need authentication
    const authUrls = [
      {
        name: "BetterContact Billing",
        url: "https://app.bettercontact.rocks/billing",
        description: "Billing page to verify access after login",
      },
      {
        name: "Sejda",
        url: "https://www.sejda.com/account/invoices",
        description: "Sejda invoice access page",
      },
      {
        name: "Dedupe",
        url: "https://app.dedupe.ly/company-settings/billing",
        description: "Dedupe billing and invoice history page",
      },
      {
        name: "Dropcontact",
        url: "https://app.dropcontact.io/billing",
        description: "Dropcontact billing and invoice page",
      },
      {
        name: "Fullenrich",
        url: "https://app.fullenrich.com/billing",
        description: "Fullenrich billing and invoice page",
      },
      {
        name: "Hyperline",
        url: "https://app.hyperline.co/billing",
        description: "Hyperline billing and invoice page",
      },
      {
        name: "Gmail",
        url: "https://mail.google.com",
        description: "Gmail for email sending functionality",
      },
    ];

    // Open each URL in a new tab
    for (const site of authUrls) {
      try {
        log(`Opening ${site.name}: ${site.url}`);
        const page = await browser.newPage();
        await page.goto(site.url, {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        });
        log(`✓ ${site.name} opened successfully`);

        // Wait a bit between each tab to avoid overload
        await page.waitForTimeout(2000);
      } catch (error) {
        log(`✗ Error opening ${site.name}: ${error.message}`);
      }
    }

    log("===== ALL WEBSITES OPENED =====");
    log("Please complete the authentication process in each tab.");
    log("The browser will remain open until you close it manually.");
    log("");
    log("Authentication checklist:");
    authUrls.forEach((site) => {
      log(`  □ ${site.name} - ${site.description}`);
    });
    log("");
    log("After completing all logins, close the browser window manually.");
    log(
      "IMPORTANT: Do NOT close this terminal window until you're done with authentication!"
    );

    // Keep browser open until user closes it
    // Use a simpler and more reliable approach
    log("Waiting for browser to be closed manually...");
    log("Close the browser window when you're done with authentication.");

    // Keep process active indefinitely until user closes browser
    // or presses Ctrl+C in terminal
    await new Promise((resolve) => {
      // Only listen for process close events
      const cleanup = () => {
        log("Received signal to close, cleaning up...");
        resolve();
      };

      process.on("SIGINT", cleanup);
      process.on("SIGTERM", cleanup);

      // Also listen if browser closes for any external reason
      browser.on("disconnected", () => {
        log("Browser disconnected, authentication session may be lost");
        cleanup();
      });

      log("Browser is now open and waiting for manual closure...");
      log(
        "Press Ctrl+C in this terminal to force close, or close the browser window manually."
      );
    });

    log("===== AUTHENTICATION COMPLETED =====");
    log("Your authentication session has been saved.");
    log("You can now run 'npm start' to execute the bot.");
  } catch (error) {
    log(`===== AUTHENTICATION ERROR =====`);
    log(`ERROR: ${error.message}`);

    if (error.message.includes("Profile directory is in use")) {
      log("SOLUTION: Close Google Chrome and try again.");
    }
  } finally {
    if (browser) {
      try {
        await browser.close();
        log("===== BROWSER CLOSED =====");
      } catch (closeError) {
        log(`BROWSER_CLOSE_ERROR: ${closeError.message}`);
      }
    }
    log("===== AUTHENTICATION SCRIPT FINISHED =====");
  }
}

// Execute authentication function
auth().catch((error) => {
  log(`FATAL ERROR: ${error.message}`);
  process.exit(1);
});

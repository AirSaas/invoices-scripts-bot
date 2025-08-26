const { chromium } = require("playwright");
const path = require("path");
const { log } = require("./logger");

async function createBrowser(selectedProfile = null) {
  let userDataDir;
  
  if (selectedProfile) {
    // Use the profile selected by the user
    userDataDir = selectedProfile.path;
    log(`Using selected Chrome profile: ${selectedProfile.description}`);
    log(`Profile path: ${userDataDir}`);
  } else {
    // Fallback to default profile (previous behavior)
    userDataDir = path.join(process.env.HOME, 'Library', 'Application Support', 'Google', 'Chrome', 'Default');
    log(`Using default Chrome profile: ${userDataDir}`);
  }
  
  const browser = await chromium.launchPersistentContext(userDataDir, {
    channel: "chrome",
    headless: false, // Start in non-headless mode to see progress
    args: [
      "--disable-blink-features=AutomationControlled",
      "--disable-web-security", // May help with some sites
      "--disable-features=VizDisplayCompositor", // May improve compatibility
      "--no-first-run", // Avoid first run dialog
      "--no-default-browser-check", // Avoid default browser check
      "--disable-default-apps" // Disable default apps
    ],
    // Configure to avoid capturing page logs
    ignoreDefaultArgs: ['--enable-logging'],
    devtools: false,
    // Use existing extensions and configurations
    acceptDownloads: true,
    // Configure for multiple languages (Spanish, English, French)
    locale: 'es-ES',
    extraHTTPHeaders: {
      'Accept-Language': 'es-ES,es;q=0.9,en-US;q=0.8,en;q=0.7,fr-FR;q=0.6,fr;q=0.5'
    }
  });

  return browser;
}

module.exports = { createBrowser };

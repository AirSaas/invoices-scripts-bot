const { chromium } = require("playwright");
const path = require("path");
const http = require("http");
const { log } = require("./logger");

/**
 * Check if a Chrome CDP endpoint is available on the given port.
 * Returns true if Chrome is running with --remote-debugging-port.
 */
async function isCdpAvailable(port) {
  const cdpPort = port || process.env.CDP_PORT || 9222;
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${cdpPort}/json/version`, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const info = JSON.parse(data);
          log(`CDP endpoint found: ${info.Browser || "Chrome"}`);
          resolve(true);
        } catch {
          resolve(false);
        }
      });
    });
    req.on("error", () => resolve(false));
    req.setTimeout(2000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function createBrowser(selectedProfile = null) {
  // CDP mode: connect to an already-running Chrome instance
  if (selectedProfile && selectedProfile.type === "cdp") {
    const cdpPort = process.env.CDP_PORT || 9222;
    log(`Connecting to Chrome via CDP on port ${cdpPort}...`);

    const cdpBrowser = await chromium.connectOverCDP(
      `http://localhost:${cdpPort}`
    );
    const context = cdpBrowser.contexts()[0];

    if (!context) {
      await cdpBrowser.close();
      throw new Error(
        "CDP connection succeeded but no browser context found. Is Chrome fully loaded?"
      );
    }

    // Attach CDP browser reference for proper cleanup
    context._cdpBrowser = cdpBrowser;
    context._isCdp = true;

    log("Successfully connected via CDP — using existing Chrome session");
    return context;
  }

  // Persistent context mode (existing behavior)
  let userDataDir;

  if (selectedProfile) {
    userDataDir = selectedProfile.path;
    log(`Using selected Chrome profile: ${selectedProfile.description}`);
    log(`Profile path: ${userDataDir}`);
  } else {
    userDataDir = path.join(
      process.env.HOME,
      "Library",
      "Application Support",
      "Google",
      "Chrome",
      "Default"
    );
    log(`Using default Chrome profile: ${userDataDir}`);
  }

  const browser = await chromium.launchPersistentContext(userDataDir, {
    channel: "chrome",
    headless: false,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--disable-web-security",
      "--disable-features=VizDisplayCompositor",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-default-apps",
    ],
    ignoreDefaultArgs: ["--enable-logging"],
    devtools: false,
    acceptDownloads: true,
    locale: "es-ES",
    extraHTTPHeaders: {
      "Accept-Language":
        "es-ES,es;q=0.9,en-US;q=0.8,en;q=0.7,fr-FR;q=0.6,fr;q=0.5",
    },
  });

  browser._isCdp = false;
  return browser;
}

/**
 * Properly close/disconnect the browser context.
 * - CDP mode: disconnects from Chrome (Chrome stays open)
 * - Persistent context mode: closes the browser
 */
async function closeBrowser(context) {
  if (context._isCdp && context._cdpBrowser) {
    await context._cdpBrowser.close();
  } else {
    await context.close();
  }
}

module.exports = { createBrowser, closeBrowser, isCdpAvailable };

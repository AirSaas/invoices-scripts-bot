const path = require('path');
const { log } = require('../utils/logger');
const { downloadAllInvoices } = require('../utils/invoiceDownloader');

const SITE_NAME = 'lovable';
const TARGET_URL = 'https://lovable.dev/settings/billing';

function filterHtmlForAI(html) {
  let filtered = html
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/<svg[\s\S]*?<\/svg>/gi, '[ICON]')
    .split('\n')
    .filter(line => {
      const l = line.toLowerCase();
      return (
        l.includes('billing') ||
        l.includes('invoice') ||
        l.includes('facture') ||
        l.includes('download') ||
        l.includes('télécharger') ||
        l.includes('view') ||
        l.includes('pdf') ||
        l.includes('receipt') ||
        l.includes('payment') ||
        l.includes('manage') ||
        l.includes('<button') ||
        l.includes('</button>') ||
        l.includes('<a ') ||
        l.includes('</a>') ||
        l.includes('href=') ||
        l.includes('onclick=') ||
        l.includes('<table') ||
        l.includes('<tbody') ||
        l.includes('<tr') ||
        l.includes('<td') ||
        l.includes('<th') ||
        l.includes('</table>') ||
        l.includes('</tbody>') ||
        l.includes('</tr>') ||
        l.includes('</td>') ||
        l.includes('</th') ||
        l.match(/\d{1,2}\s*\/\s*\d{1,2}\s*\/\s*\d{4}/) ||
        l.includes('€') ||
        l.includes('$') ||
        (l.includes('<div') && (l.includes('class=') || l.includes('id='))) ||
        l.trim() === ''
      );
    })
    .join('\n');

  if (filtered.length > 30000) {
    filtered = filtered.substring(0, 30000) + '\n<!-- HTML truncated for AI processing -->';
  }

  return filtered;
}

async function isLoginPage(page) {
  const currentUrl = page.url();
  const title = await page.title();

  log(`${SITE_NAME.toUpperCase()} CHECKING_LOGIN_PAGE - URL: ${currentUrl}, TITLE: "${title}"`);

  const isLogin = currentUrl.includes('login') ||
    currentUrl.includes('/oauth') ||
    currentUrl.includes('/sign-in') ||
    title.toLowerCase().includes('log in') ||
    title.toLowerCase().includes('sign in');

  log(`${SITE_NAME.toUpperCase()} IS_LOGIN_PAGE: ${isLogin}`);
  return isLogin;
}

/**
 * Navigate through the Lovable billing flow:
 * 1. Click "Manage" button on billing page → opens modal
 * 2. In modal, click "Invoices and payments" → navigates to invoice page
 */
async function navigateToInvoices(page) {
  // Step 1: Click "Manage" button to open the billing modal
  log(`${SITE_NAME.toUpperCase()} CLICKING "Manage" button...`);

  const manageSelectors = [
    'button:has-text("Manage")',
    'a:has-text("Manage")',
    '[data-testid*="manage"]',
    'button:has-text("Manage subscription")',
    'a:has-text("Manage subscription")',
  ];

  let manageClicked = false;
  for (const selector of manageSelectors) {
    try {
      const el = await page.locator(selector).first();
      if (await el.isVisible({ timeout: 3000 })) {
        await el.click();
        manageClicked = true;
        log(`${SITE_NAME.toUpperCase()} CLICKED "Manage" via: ${selector}`);
        break;
      }
    } catch {
      // try next selector
    }
  }

  if (!manageClicked) {
    log(`${SITE_NAME.toUpperCase()} WARNING: Could not find "Manage" button, proceeding anyway...`);
    return;
  }

  // Wait for modal to appear
  await page.waitForTimeout(3000);

  // Step 2: Click "Invoices and payments" in the modal
  log(`${SITE_NAME.toUpperCase()} CLICKING "Invoices and payments"...`);

  const invoiceSelectors = [
    'button:has-text("Invoices and payments")',
    'a:has-text("Invoices and payments")',
    ':text("Invoices and payments")',
    'button:has-text("Invoices")',
    'a:has-text("Invoices")',
    '[role="dialog"] button:has-text("Invoices")',
    '[role="dialog"] a:has-text("Invoices")',
  ];

  let invoicesClicked = false;
  for (const selector of invoiceSelectors) {
    try {
      const el = await page.locator(selector).first();
      if (await el.isVisible({ timeout: 3000 })) {
        await el.click();
        invoicesClicked = true;
        log(`${SITE_NAME.toUpperCase()} CLICKED "Invoices and payments" via: ${selector}`);
        break;
      }
    } catch {
      // try next selector
    }
  }

  if (!invoicesClicked) {
    log(`${SITE_NAME.toUpperCase()} WARNING: Could not find "Invoices and payments" link, proceeding anyway...`);
    return;
  }

  // Wait for page navigation after clicking
  await page.waitForTimeout(5000);
  log(`${SITE_NAME.toUpperCase()} NAVIGATED TO: ${page.url()}`);
}

async function run(context, executionLog, folderManager, options = {}) {
  const page = await context.newPage();

  page.on('console', () => {});
  page.on('pageerror', () => {});

  const downloadPath = folderManager ? folderManager.getSiteDownloadPath(SITE_NAME) : path.resolve(__dirname, '..', 'factures', SITE_NAME);
  let downloadedFiles = [];

  try {
    log(`${SITE_NAME.toUpperCase()} START (AI-Powered)`);

    try {
      await page.goto(TARGET_URL, {
        waitUntil: 'domcontentloaded',
        timeout: 90000,
      });
      log(`${SITE_NAME.toUpperCase()} PAGE LOADED`);
      await page.waitForTimeout(5000);
    } catch (gotoError) {
      log(`${SITE_NAME.toUpperCase()} GOTO_ERROR: ${gotoError.message}`);
      const currentUrl = page.url();
      if (currentUrl.includes('login') || currentUrl.includes('sign-in')) {
        throw new Error('Session expired. Please login to lovable.dev first via CDP (node auth.js).');
      }
      log(`${SITE_NAME.toUpperCase()} RETRYING with different strategy...`);
      await page.goto(TARGET_URL, { waitUntil: 'load', timeout: 30000 });
    }

    if (await isLoginPage(page)) {
      throw new Error('Lovable session expired. Please login to lovable.dev first via CDP (node auth.js).');
    }

    if (executionLog) {
      executionLog.setSiteUrl(SITE_NAME, TARGET_URL);
      executionLog.setCurrentUrl(SITE_NAME, page.url());
    }

    // Navigate through modal flow to reach invoices page
    await navigateToInvoices(page);

    downloadedFiles = await downloadAllInvoices(page, downloadPath, SITE_NAME, executionLog, {
      filterHtml: filterHtmlForAI,
      maxInvoices: options.maxInvoices,
    });

    log(`${SITE_NAME.toUpperCase()} DONE ${downloadedFiles.length} file(s)`);

  } catch (error) {
    log(`ERROR in ${SITE_NAME}: ${error.message}`);
  } finally {
    await page.close();
  }
  return downloadedFiles;
}

module.exports = { run, SITE_NAME };

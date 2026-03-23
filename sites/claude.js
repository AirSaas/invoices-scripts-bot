const path = require('path');
const { log } = require('../utils/logger');
const { downloadAllInvoices } = require('../utils/invoiceDownloader');

const SITE_NAME = 'claude';
const TARGET_URL = 'https://claude.ai/admin-settings/billing';

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
        l.includes('voir') ||
        l.includes('view') ||
        l.includes('pdf') ||
        l.includes('receipt') ||
        l.includes('reçu') ||
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
    title.toLowerCase().includes('log in') ||
    title.toLowerCase().includes('sign in');

  log(`${SITE_NAME.toUpperCase()} IS_LOGIN_PAGE: ${isLogin}`);
  return isLogin;
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
      await page.waitForTimeout(10000);
    } catch (gotoError) {
      log(`${SITE_NAME.toUpperCase()} GOTO_ERROR: ${gotoError.message}`);
      const currentUrl = page.url();
      if (currentUrl.includes('login') || currentUrl.includes('oauth')) {
        throw new Error('Session expired. Please login to claude.ai first via CDP (node auth.js).');
      }
      log(`${SITE_NAME.toUpperCase()} RETRYING with different strategy...`);
      await page.goto(TARGET_URL, { waitUntil: 'load', timeout: 30000 });
    }

    if (await isLoginPage(page)) {
      throw new Error('Claude session expired. Please login to claude.ai first via CDP (node auth.js).');
    }

    if (executionLog) {
      executionLog.setSiteUrl(SITE_NAME, TARGET_URL);
      executionLog.setCurrentUrl(SITE_NAME, page.url());
    }

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

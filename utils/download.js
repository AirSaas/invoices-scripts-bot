const fs = require('fs');
const path = require('path');
const { log } = require('./logger');

/**
 * Sanitize a filename: remove query params, invalid chars, ensure non-empty.
 */
function sanitizeFilename(raw, fallbackIndex) {
  let name = raw || '';
  // Strip query params and hash
  name = name.split('?')[0].split('#')[0];
  name = path.basename(name);
  // Remove invalid filesystem chars
  name = name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_');
  return name || `file_${fallbackIndex}.tmp`;
}

/**
 * Build a filename with date and provider prefix: YYYY-MM-DD_provider_originalname.ext
 */
function buildPrefixedFilename(originalFilename, siteName) {
  const today = new Date().toISOString().slice(0, 10);
  const provider = (siteName || 'unknown').toLowerCase().replace(/[^a-z0-9]/g, '');
  return `${today}_${provider}_${originalFilename}`;
}

/**
 * Safely write a buffer to disk. Returns { success, filePath, fileSize, error }.
 */
function safeWriteFile(filePath, buffer) {
  try {
    fs.writeFileSync(filePath, buffer);
    const fileSize = fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;
    log(`DOWNLOAD_WRITE_OK: ${path.basename(filePath)} — ${fileSize} bytes on disk`);
    return { success: true, fileSize };
  } catch (e) {
    log(`DOWNLOAD_WRITE_ERROR: ${filePath} — ${e.message}`);
    return { success: false, fileSize: 0, error: e.message };
  }
}

/**
 * Fetch a URL via Playwright request and validate the response.
 * Returns { ok, buffer, filename, contentType, status, error }.
 */
async function safeFetch(page, url, fallbackIndex) {
  try {
    const response = await page.context().request.get(url);
    const status = response.status();
    const headers = response.headers();
    const contentType = headers['content-type'] || 'unknown';

    log(`DOWNLOAD_HTTP: status=${status} content-type="${contentType}" url=${url}`);

    if (status < 200 || status >= 400) {
      return { ok: false, error: `HTTP ${status} for ${url}` };
    }

    const buffer = await response.body();
    const filename = sanitizeFilename(path.basename(url), fallbackIndex);
    return { ok: true, buffer, filename, contentType, status };
  } catch (e) {
    return { ok: false, error: `Fetch failed: ${e.message}` };
  }
}

/**
 * Download a single file from a page element.
 * Returns { success, filePath, filename, fileSize, error }
 */
async function downloadOneFile(page, element, selector, downloadPath, index, siteName) {
  try {
    // Prepare to wait for download OR new tab
    const downloadPromise = page.waitForEvent('download', { timeout: 8000 });
    const popupPromise = page.context().waitForEvent('page', { timeout: 8000 });

    await element.click({ force: true });
    log(`DOWNLOAD_CLICK [${index}] selector="${selector}"`);

    let result;
    try {
      result = await Promise.race([downloadPromise, popupPromise]);
    } catch (raceError) {
      // Fallback: try direct href/onclick download
      const href = await element.getAttribute('href');
      const onclick = await element.getAttribute('onclick');

      log(`DOWNLOAD_NO_EVENT [${index}] href=${href}, onclick=${onclick}`);

      if (href && (href.endsWith('.pdf') || href.endsWith('.csv') || href.endsWith('.xlsx') ||
                   href.includes('.pdf?') || href.includes('.csv?') || href.includes('.xlsx?'))) {
        let absoluteHref = href;
        if (!href.includes('://')) {
          const currentUrl = page.url();
          const baseUrl = new URL(currentUrl).origin + new URL(currentUrl).pathname.replace(/\/[^\/]*$/, '/');
          absoluteHref = new URL(href, baseUrl).href;
        }

        const fetchResult = await safeFetch(page, absoluteHref, index);
        if (!fetchResult.ok) return { success: false, error: fetchResult.error };

        const filename = buildPrefixedFilename(sanitizeFilename(fetchResult.filename, index), siteName);
        const filePath = path.join(downloadPath, filename);
        const writeResult = safeWriteFile(filePath, fetchResult.buffer);
        if (!writeResult.success) return { success: false, error: writeResult.error };

        return { success: true, filePath, filename, fileSize: writeResult.fileSize };
      }

      if (onclick && onclick.includes('window.open')) {
        const urlMatch = onclick.match(/window\.open\(['"]([^'"]+)['"]/);
        if (urlMatch) {
          let url = urlMatch[1];
          if (!url.includes('://')) {
            const currentUrl = page.url();
            const baseUrl = new URL(currentUrl).origin + new URL(currentUrl).pathname.replace(/\/[^\/]*$/, '/');
            url = new URL(url, baseUrl).href;
          }

          const fetchResult = await safeFetch(page, url, index);
          if (!fetchResult.ok) return { success: false, error: fetchResult.error };

          const filename = buildPrefixedFilename(sanitizeFilename(fetchResult.filename, index), siteName);
          const filePath = path.join(downloadPath, filename);
          const writeResult = safeWriteFile(filePath, fetchResult.buffer);
          if (!writeResult.success) return { success: false, error: writeResult.error };

          return { success: true, filePath, filename, fileSize: writeResult.fileSize };
        }
      }

      return { success: false, error: `No download event and no direct href/onclick fallback for selector "${selector}"` };
    }

    // Handle download event or popup
    let filePath, filename, fileSize;

    if (result.suggestedFilename && typeof result.suggestedFilename === 'function') {
      const download = result;
      filename = buildPrefixedFilename(sanitizeFilename(download.suggestedFilename(), index), siteName);
      filePath = path.join(downloadPath, filename);
      await download.saveAs(filePath);
      fileSize = fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;
      log(`DOWNLOAD_OK [${index}] (direct) ${filename} — ${fileSize} bytes`);
    } else if (typeof result.waitForLoadState === 'function') {
      // It's a Page (popup/new tab)
      const newPage = result;
      try {
        await newPage.waitForLoadState('domcontentloaded');
        const url = newPage.url();
        log(`DOWNLOAD_NEW_TAB [${index}] URL: ${url}`);

        const fetchResult = await safeFetch(newPage, url, index);
        if (!fetchResult.ok) {
          await newPage.close();
          return { success: false, error: fetchResult.error };
        }

        filename = buildPrefixedFilename(sanitizeFilename(fetchResult.filename, index), siteName);
        filePath = path.join(downloadPath, filename);
        const writeResult = safeWriteFile(filePath, fetchResult.buffer);
        fileSize = writeResult.fileSize;
        await newPage.close();

        if (!writeResult.success) return { success: false, error: writeResult.error };

        log(`DOWNLOAD_OK [${index}] (new tab) ${filename} — ${fileSize} bytes`);
      } catch (pageError) {
        if (typeof newPage.close === 'function') await newPage.close();
        return { success: false, error: `New tab download failed: ${pageError.message}` };
      }
    } else {
      return { success: false, error: `Unknown download result type` };
    }

    return { success: true, filePath, filename, fileSize };
  } catch (error) {
    return { success: false, error: `Click/download failed for selector "${selector}": ${error.message.split('\n')[0]}` };
  }
}

/**
 * Attempt to download matching files from the current page, one by one.
 * Each file is saved to disk immediately after download.
 * @param {number} maxFiles - Max files to download on this page (0 = unlimited)
 * Returns array of { filePath, filename, selector, fileSize }
 */
async function attemptDownloads(page, selectors, downloadPath, executionLog, siteName, maxFiles = 0) {
  if (!fs.existsSync(downloadPath)) {
    fs.mkdirSync(downloadPath, { recursive: true });
  }

  const downloadedFiles = [];

  // Fallback selectors
  const fallbackSelectors = [
    // English
    'a:has-text("Download sample file")',
    'a:has-text("Download")',
    'a:has-text("Get file")',
    'a:has-text("Sample")',
    'a:has-text("Template")',
    'a:has-text("Download Deduped CSV")',
    'a:has-text("Download CSV")',
    'a:has-text("Export")',
    'a:has-text("Export CSV")',
    'a:has-text("Download Invoice")',
    'a:has-text("Download Receipt")',
    'a:has-text("View Invoice")',
    'a:has-text("View Receipt")',
    'a:has-text("Invoice History")',
    'a:has-text("Billing History")',
    'a:has-text("Payment History")',
    // Spanish
    'a:has-text("Descargar archivo")',
    'a:has-text("Descargar")',
    'a:has-text("Bajar archivo")',
    'a:has-text("Plantilla")',
    'a:has-text("Ejemplo")',
    'a:has-text("Descargar CSV")',
    'a:has-text("Exportar")',
    'a:has-text("Ver Factura")',
    'a:has-text("Descargar Factura")',
    // French
    'a:has-text("Télécharger fichier")',
    'a:has-text("Télécharger")',
    'a:has-text("Fichier")',
    'a:has-text("Modèle")',
    'a:has-text("Exemple")',
    'a:has-text("Télécharger CSV")',
    'a:has-text("Exporter")',
    'a:has-text("Voir Facture")',
    // Generic by attributes
    'a[onclick*="window.open"]',
    'a[onclick*="template.csv"]',
    'a[href*=".csv"]',
    'a[href*=".pdf"]',
    'a[href*=".xlsx"]',
    // Specific selectors
    'a#download-button',
    'a#overview-button',
    'button#download-button',
    'button#overview-button',
    'a[href="/user/overview"]',
    'a[href*="overview"]',
    'a[href*="download"]',
    'a[href*="export"]',
    'a[href*="invoice"]',
    'a[href*="receipt"]',
    'a[href*="billing"]',
    'a[href*="csv"]',
    'a[href*="pdf"]',
    // Class selectors
    'a.download-button',
    'a.export-button',
    'a.invoice-button',
    'button.download-button',
    'button.export-button',
    'button.invoice-button',
    // Data attributes
    'a[data-testid*="download"]',
    'a[data-testid*="export"]',
    'a[data-testid*="invoice"]',
    'button[data-testid*="download"]',
    'button[data-testid*="export"]',
    'button[data-testid*="invoice"]',
    // Aria-label
    'a[aria-label*="download"]',
    'a[aria-label*="export"]',
    'a[aria-label*="invoice"]',
    'button[aria-label*="download"]',
    'button[aria-label*="export"]',
    'button[aria-label*="invoice"]'
  ];

  const allSelectors = [...selectors, ...fallbackSelectors];
  log(`DOWNLOAD_SELECTORS_TOTAL: ${allSelectors.length} (${selectors.length} AI + ${fallbackSelectors.length} fallback)`);

  const triedSelectors = new Set();
  let duplicateCount = 0;
  let matchedSelectorCount = 0;

  for (const selector of allSelectors) {
    if (triedSelectors.has(selector)) {
      duplicateCount++;
      continue;
    }
    triedSelectors.add(selector);

    let elementCount;
    try {
      elementCount = await page.locator(selector).count();
    } catch (e) {
      log(`DOWNLOAD_SELECTOR_ERROR: "${selector}" — ${e.message}`);
      continue;
    }

    if (elementCount === 0) continue;

    matchedSelectorCount++;
    log(`DOWNLOAD_FOUND: ${elementCount} element(s) for "${selector}"`);

    // Download each element one by one, re-fetching by index to avoid stale handles
    for (let i = 0; i < elementCount; i++) {
      log(`DOWNLOAD_ATTEMPT: [${downloadedFiles.length + 1}] element ${i + 1}/${elementCount} of "${selector}"`);

      let element;
      try {
        element = await page.locator(selector).nth(i).elementHandle();
      } catch (e) {
        log(`DOWNLOAD_STALE_ELEMENT: [${i + 1}] "${selector}" — ${e.message}`);
        continue;
      }

      if (!element) {
        log(`DOWNLOAD_ELEMENT_GONE: [${i + 1}] "${selector}" — element no longer exists`);
        continue;
      }

      const result = await downloadOneFile(page, element, selector, downloadPath, downloadedFiles.length + 1, siteName);

      if (result.success) {
        downloadedFiles.push({
          filePath: result.filePath,
          filename: result.filename,
          selector,
          fileSize: result.fileSize,
        });
        log(`DOWNLOAD_SAVED: [${downloadedFiles.length}] ${result.filename} — saved to disk immediately`);

        if (executionLog && siteName) {
          executionLog.logDownload(siteName, {
            filename: result.filename,
            selector,
            status: 'success',
            fileSize: result.fileSize,
          });
        }

        // Small delay between downloads
        await page.waitForTimeout(1000);

        // Check maxFiles limit
        if (maxFiles > 0 && downloadedFiles.length >= maxFiles) {
          log(`DOWNLOAD_MAX_REACHED: ${downloadedFiles.length}/${maxFiles} files — stopping`);
          break;
        }
      } else {
        log(`DOWNLOAD_FAILED: [element ${i + 1}] ${result.error}`);
        if (executionLog && siteName) {
          executionLog.logDownload(siteName, {
            selector,
            status: 'failed',
            error: result.error,
          });
        }
      }
    }

    // If we found matching elements and downloaded at least one file, stop
    if (downloadedFiles.length > 0) {
      log(`DOWNLOAD_COMPLETE: ${downloadedFiles.length} file(s) with selector "${selector}"`);
      break;
    }
  }

  if (duplicateCount > 0) {
    log(`DOWNLOAD_DUPLICATES_SKIPPED: ${duplicateCount} duplicate selector(s)`);
  }
  log(`DOWNLOAD_STATS: ${matchedSelectorCount} selector(s) matched elements out of ${triedSelectors.size} unique tried`);
  log(`DOWNLOAD_TOTAL: ${downloadedFiles.length} file(s) downloaded on this page`);
  return downloadedFiles;
}

module.exports = { attemptDownloads, downloadOneFile };

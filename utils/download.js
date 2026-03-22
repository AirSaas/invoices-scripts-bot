const fs = require('fs');
const path = require('path');
const { log } = require('./logger');

/**
 * Download a single file from a page element.
 * Returns { success, filePath, filename, error }
 */
async function downloadOneFile(page, element, selector, downloadPath, index) {
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

      if (href && (href.includes('.pdf') || href.includes('.csv') || href.includes('.xlsx'))) {
        let absoluteHref = href;
        if (href.startsWith('./') || href.startsWith('../') || !href.includes('://')) {
          const currentUrl = page.url();
          const baseUrl = new URL(currentUrl).origin + new URL(currentUrl).pathname.replace(/\/[^\/]*$/, '/');
          absoluteHref = new URL(href, baseUrl).href;
        }

        log(`DOWNLOAD_DIRECT_FETCH [${index}] ${absoluteHref}`);
        const response = await page.context().request.get(absoluteHref);
        const fileBuffer = await response.body();
        const filename = path.basename(absoluteHref.split('?')[0]) || `file_${index}.tmp`;
        const filePath = path.join(downloadPath, filename);
        fs.writeFileSync(filePath, fileBuffer);
        log(`DOWNLOAD_OK [${index}] (direct fetch) ${filename} — ${fileBuffer.length} bytes`);
        return { success: true, filePath, filename, fileSize: fileBuffer.length };
      }

      if (onclick && onclick.includes('window.open')) {
        const urlMatch = onclick.match(/window\.open\(['"]([^'"]+)['"]/);
        if (urlMatch) {
          let url = urlMatch[1];
          if (url.startsWith('./') || url.startsWith('../') || !url.includes('://')) {
            const currentUrl = page.url();
            const baseUrl = new URL(currentUrl).origin + new URL(currentUrl).pathname.replace(/\/[^\/]*$/, '/');
            url = new URL(url, baseUrl).href;
          }
          log(`DOWNLOAD_ONCLICK_FETCH [${index}] ${url}`);
          const response = await page.context().request.get(url);
          const fileBuffer = await response.body();
          const filename = path.basename(url.split('?')[0]) || `file_${index}.tmp`;
          const filePath = path.join(downloadPath, filename);
          fs.writeFileSync(filePath, fileBuffer);
          log(`DOWNLOAD_OK [${index}] (onclick fetch) ${filename} — ${fileBuffer.length} bytes`);
          return { success: true, filePath, filename, fileSize: fileBuffer.length };
        }
      }

      return { success: false, error: `No download event and no direct href/onclick fallback for selector "${selector}"` };
    }

    // Handle download event or popup
    let filePath, filename, fileSize;

    if (result.suggestedFilename && typeof result.suggestedFilename === 'function') {
      const download = result;
      filename = download.suggestedFilename();
      filePath = path.join(downloadPath, filename);
      await download.saveAs(filePath);
      fileSize = fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;
      log(`DOWNLOAD_OK [${index}] (direct) ${filename} — ${fileSize} bytes`);
    } else if (result.constructor.name === 'Page' && typeof result.waitForLoadState === 'function') {
      const newPage = result;
      try {
        await newPage.waitForLoadState('domcontentloaded');
        const url = newPage.url();
        filename = path.basename(url) || `file_${index}.tmp`;
        log(`DOWNLOAD_NEW_TAB [${index}] URL: ${url}`);
        const response = await newPage.context().request.get(url);
        const fileBuffer = await response.body();
        filePath = path.join(downloadPath, filename);
        fs.writeFileSync(filePath, fileBuffer);
        fileSize = fileBuffer.length;
        log(`DOWNLOAD_OK [${index}] (new tab) ${filename} — ${fileSize} bytes`);
        await newPage.close();
      } catch (pageError) {
        if (newPage.close && typeof newPage.close === 'function') await newPage.close();
        return { success: false, error: `New tab download failed: ${pageError.message}` };
      }
    } else {
      return { success: false, error: `Unknown result type: ${result.constructor.name}` };
    }

    return { success: true, filePath, filename, fileSize };
  } catch (error) {
    return { success: false, error: `Click/download failed for selector "${selector}": ${error.message.split('\n')[0]}` };
  }
}

/**
 * Attempt to download ALL matching files from the current page, one by one.
 * Each file is saved to disk immediately after download.
 * Returns array of { filePath, filename, selector, fileSize }
 */
async function attemptDownloads(page, selectors, downloadPath, executionLog, siteName) {
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

  for (const selector of allSelectors) {
    if (triedSelectors.has(selector)) continue;
    triedSelectors.add(selector);

    let elements;
    try {
      elements = await page.locator(selector).elementHandles();
    } catch (e) {
      log(`DOWNLOAD_SELECTOR_ERROR: "${selector}" — ${e.message}`);
      continue;
    }

    if (elements.length === 0) continue;

    log(`DOWNLOAD_FOUND: ${elements.length} element(s) for "${selector}"`);

    // Download each element one by one
    for (let i = 0; i < elements.length; i++) {
      log(`DOWNLOAD_ATTEMPT: [${downloadedFiles.length + 1}] element ${i + 1}/${elements.length} of "${selector}"`);

      const result = await downloadOneFile(page, elements[i], selector, downloadPath, downloadedFiles.length + 1);

      if (result.success) {
        downloadedFiles.push({
          filePath: result.filePath,
          filename: result.filename,
          selector,
          fileSize: result.fileSize,
        });
        log(`DOWNLOAD_SAVED: [${downloadedFiles.length}] ${result.filename} — saved to disk immediately`);

        // Log to JSON execution log if available
        if (executionLog && siteName) {
          executionLog.logDownload(siteName, {
            filename: result.filename,
            selector,
            status: 'success',
            fileSize: result.fileSize,
          });
        }

        // Small delay between downloads to avoid overwhelming the server
        await page.waitForTimeout(1000);
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

    // If we found matching elements and downloaded at least one file,
    // stop trying more selectors (they likely point to the same elements)
    if (downloadedFiles.length > 0) {
      log(`DOWNLOAD_COMPLETE: ${downloadedFiles.length} file(s) downloaded with selector "${selector}", stopping selector search`);
      break;
    }
  }

  log(`DOWNLOAD_TOTAL: ${downloadedFiles.length} file(s) downloaded on this page`);
  return downloadedFiles;
}

module.exports = { attemptDownloads, downloadOneFile };

const fs = require('fs');
const path = require('path');
const { log } = require('./logger');

async function attemptDownloads(page, selectors, downloadPath) {
  if (!fs.existsSync(downloadPath)) {
    fs.mkdirSync(downloadPath, { recursive: true });
  }

  const downloadedFiles = [];

  // Agregar selectores de respaldo conocidos
  const fallbackSelectors = [
    // Inglés
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
    // Español
    'a:has-text("Descargar archivo")',
    'a:has-text("Descargar")',
    'a:has-text("Bajar archivo")',
    'a:has-text("Plantilla")',
    'a:has-text("Ejemplo")',
    'a:has-text("Descargar CSV")',
    'a:has-text("Exportar")',
    'a:has-text("Ver Factura")',
    'a:has-text("Descargar Factura")',
    // Francés
    'a:has-text("Télécharger fichier")',
    'a:has-text("Télécharger")',
    'a:has-text("Fichier")',
    'a:has-text("Modèle")',
    'a:has-text("Exemple")',
    'a:has-text("Télécharger CSV")',
    'a:has-text("Exporter")',
    'a:has-text("Voir Facture")',
    // Genéricos por atributos
    'a[onclick*="window.open"]',
    'a[onclick*="template.csv"]',
    'a[href*=".csv"]',
    'a[href*=".pdf"]',
    'a[href*=".xlsx"]',
    // Selectores específicos para Dedupe
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
    // Selectores por clase
    'a.download-button',
    'a.export-button',
    'a.invoice-button',
    'button.download-button',
    'button.export-button',
    'button.invoice-button',
    // Selectores por data attributes
    'a[data-testid*="download"]',
    'a[data-testid*="export"]',
    'a[data-testid*="invoice"]',
    'button[data-testid*="download"]',
    'button[data-testid*="export"]',
    'button[data-testid*="invoice"]',
    // Selectores por aria-label
    'a[aria-label*="download"]',
    'a[aria-label*="export"]',
    'a[aria-label*="invoice"]',
    'button[aria-label*="download"]',
    'button[aria-label*="export"]',
    'button[aria-label*="invoice"]'
  ];
  
  const allSelectors = [...selectors, ...fallbackSelectors];
  log(`Total selectors to try: ${allSelectors.length}`);

  for (const selector of allSelectors) {
    log(`Trying selector: "${selector}"`);
    const elements = await page.locator(selector).elementHandles();
    if (elements.length === 0) {
      log(`No elements found for selector: "${selector}"`);
      continue; // No es un fallo, simplemente no encontró elementos con este selector
    }
    log(`Found ${elements.length} element(s) for selector: "${selector}"`);

    log(`Attempting click with selector: "${selector}"`);
    // Probamos con el primer elemento que coincida con el selector
    const element = elements[0]; 
    try {
      // Preparamos para esperar CUALQUIERA de los dos eventos, con un timeout más generoso
      const downloadPromise = page.waitForEvent('download', { timeout: 8000 });
      const popupPromise = page.context().waitForEvent('page', { timeout: 8000 });

      // Hacemos clic
      await element.click({ force: true });
      log(`Click executed on selector: "${selector}"`);

      // Esperamos a que se resuelva la descarga O la nueva pestaña, con manejo de timeout
      let result;
      try {
        result = await Promise.race([downloadPromise, popupPromise]);
        log(`Event received: ${result.constructor.name}`);
      } catch (raceError) {
        log(`No download or popup event within timeout: ${raceError.message}`);
        
        // Estrategia de respaldo: verificar si el enlace tiene href y descargar directamente
        const href = await element.getAttribute('href');
        const onclick = await element.getAttribute('onclick');
        
        log(`Element href: ${href}, onclick: ${onclick}`);
        
        if (href && (href.includes('.pdf') || href.includes('.csv') || href.includes('.xlsx'))) {
          // Si es una URL relativa, convertirla a absoluta
          let absoluteHref = href;
          if (href.startsWith('./') || href.startsWith('../') || !href.includes('://')) {
            const currentUrl = page.url();
            const baseUrl = new URL(currentUrl).origin + new URL(currentUrl).pathname.replace(/\/[^\/]*$/, '/');
            absoluteHref = new URL(href, baseUrl).href;
          }
          
          // Descarga directa usando fetch
          log(`Attempting direct download from href: ${absoluteHref}`);
          const response = await page.context().request.get(absoluteHref);
          const fileBuffer = await response.body();
          const filename = path.basename(absoluteHref.split('?')[0]) || 'downloaded-file.tmp';
          const filePath = path.join(downloadPath, filename);
          fs.writeFileSync(filePath, fileBuffer);
          log(`DOWNLOAD_OK (direct fetch) ${filename}`);
          downloadedFiles.push(filePath);
          return downloadedFiles;
        } else if (onclick && onclick.includes('window.open')) {
          // Extraer URL del onclick
          const urlMatch = onclick.match(/window\.open\(['"]([^'"]+)['"]/);
          if (urlMatch) {
            let url = urlMatch[1];
            
            // Si es una URL relativa, convertirla a absoluta
            if (url.startsWith('./') || url.startsWith('../') || !url.includes('://')) {
              const currentUrl = page.url();
              const baseUrl = new URL(currentUrl).origin + new URL(currentUrl).pathname.replace(/\/[^\/]*$/, '/');
              url = new URL(url, baseUrl).href;
            }
            
            log(`Attempting direct download from onclick URL: ${url}`);
            const response = await page.context().request.get(url);
            const fileBuffer = await response.body();
            const filename = path.basename(url.split('?')[0]) || 'downloaded-file.tmp';
            const filePath = path.join(downloadPath, filename);
            fs.writeFileSync(filePath, fileBuffer);
            log(`DOWNLOAD_OK (onclick fetch) ${filename}`);
            downloadedFiles.push(filePath);
            return downloadedFiles;
          }
        }
        
        // Si no hay estrategia de respaldo, continuar con el siguiente selector
        continue;
      }

      let filePath;

      // Debug: Vamos a ver qué tipo de objeto recibimos
      log(`DEBUG: result type: ${typeof result}, constructor: ${result.constructor.name}`);
      log(`DEBUG: result has url: ${!!result.url}, url type: ${typeof result.url}`);
      log(`DEBUG: result has suggestedFilename: ${!!result.suggestedFilename}, suggestedFilename type: ${typeof result.suggestedFilename}`);

      // Verificamos si el resultado es una DESCARGA DIRECTA (más común)
      if (result.suggestedFilename && typeof result.suggestedFilename === 'function') {
        const download = result;
        const filename = download.suggestedFilename();
        filePath = path.join(downloadPath, filename);
        await download.saveAs(filePath);
        log(`DOWNLOAD_OK (direct) ${filename}`);
      }
      // Si no, verificamos si es una PÁGINA NUEVA (popup)
      else if (result.constructor.name === 'Page' && result.waitForLoadState && typeof result.waitForLoadState === 'function') {
        const newPage = result;
        try {
          await newPage.waitForLoadState('domcontentloaded');
          const url = newPage.url();
          const filename = path.basename(url) || 'downloaded-file.tmp';

          log(`New tab opened with URL: ${url}. Downloading content...`);
          const response = await newPage.context().request.get(url);
          const fileBuffer = await response.body();
          
          filePath = path.join(downloadPath, filename);
          fs.writeFileSync(filePath, fileBuffer);
          log(`DOWNLOAD_OK (from new tab) ${filename}`);
          await newPage.close();
        } catch (pageError) {
          log(`Error handling new page: ${pageError.message}`);
          if (newPage.close && typeof newPage.close === 'function') {
            await newPage.close();
          }
          throw pageError;
        }
      }
      else {
        throw new Error(`Unknown result type: ${result.constructor.name}. Available methods: ${Object.getOwnPropertyNames(result).join(', ')}`);
      }

      downloadedFiles.push(filePath);
      
      // Si ya descargamos algo, el trabajo está hecho. Salimos del bucle.
      if (downloadedFiles.length > 0) {
        return downloadedFiles;
      }

    } catch (error) {
      log(`DOWNLOAD_ATTEMPT_FAIL with selector "${selector}": ${error.message.split('\n')[0]}`);
    }
  }
  return downloadedFiles;
}

module.exports = { attemptDownloads };
const path = require('path');
const { log } = require('../utils/logger');
const { findCandidateElements, getCssSelectors } = require('../utils/selectorAI');
const { attemptDownloads } = require('../utils/download');

const SITE_NAME = 'hyperline';
const TARGET_URL = 'https://app.hyperline.co/app/settings/billing';

function filterHtmlForAI(html) {
  // Estrategia específica para Hyperline: extraer solo las secciones relevantes de billing
  let filtered = html
    // Remover todo el head y mantener solo el body
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    // Remover scripts completamente
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    // Remover estilos completamente
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    // Remover comentarios HTML
    .replace(/<!--[\s\S]*?-->/g, '')
    // Remover iframes
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    // Simplificar SVG pero mantener información de botones
    .replace(/<svg[\s\S]*?<\/svg>/gi, '[DOWNLOAD_ICON]')
    // Extraer solo secciones que contengan palabras clave de facturación
    .split('\n')
    .filter(line => {
      const lowerLine = line.toLowerCase();
      // Mantener líneas que contengan términos de facturación o elementos interactivos
      return (
        lowerLine.includes('billing') ||
        lowerLine.includes('invoice') ||
        lowerLine.includes('facture') ||
        lowerLine.includes('receipt') ||
        lowerLine.includes('payment') ||
        lowerLine.includes('subscription') ||
        lowerLine.includes('history') ||
        lowerLine.includes('download') ||
        lowerLine.includes('descargar') ||
        lowerLine.includes('télécharger') ||
        lowerLine.includes('pdf') ||
        lowerLine.includes('stripe.com') ||
        lowerLine.includes('pay.stripe') ||
        lowerLine.includes('hyperline') ||
        lowerLine.includes('<button') ||
        lowerLine.includes('</button>') ||
        lowerLine.includes('<a ') ||
        lowerLine.includes('</a>') ||
        lowerLine.includes('href=') ||
        lowerLine.includes('onclick=') ||
        lowerLine.includes('target=') ||
        lowerLine.includes('class="') ||
        lowerLine.includes('id="') ||
        lowerLine.includes('<table') ||
        lowerLine.includes('<tbody') ||
        lowerLine.includes('<tr') ||
        lowerLine.includes('<td') ||
        lowerLine.includes('<th') ||
        lowerLine.includes('</table>') ||
        lowerLine.includes('</tbody>') ||
        lowerLine.includes('</tr>') ||
        lowerLine.includes('</td>') ||
        lowerLine.includes('</th') ||
        lowerLine.includes('<ul') ||
        lowerLine.includes('<li') ||
        lowerLine.includes('</ul>') ||
        lowerLine.includes('</li>') ||
        // Mantener fechas que podrían ser de facturas
        lowerLine.match(/\d{1,2}[-\/]\d{1,2}[-\/]\d{4}/) ||
        lowerLine.match(/\d{4}[-\/]\d{1,2}[-\/]\d{1,2}/) ||
        // Mantener precios en diferentes formatos
        lowerLine.includes('$') ||
        lowerLine.includes('€') ||
        lowerLine.includes('£') ||
        lowerLine.includes('usd') ||
        lowerLine.includes('eur') ||
        lowerLine.includes('gbp') ||
        lowerLine.includes('price') ||
        lowerLine.includes('amount') ||
        lowerLine.includes('total') ||
        // Mantener elementos de interfaz comunes
        (lowerLine.includes('<div') && (lowerLine.includes('class=') || lowerLine.includes('id='))) ||
        (lowerLine.includes('<span') && (lowerLine.includes('class=') || lowerLine.includes('id='))) ||
        lowerLine.trim() === '' // Mantener líneas vacías para estructura
      );
    })
    .join('\n');

  // Limitar a 30000 caracteres para asegurar que cabe en el contexto de ChatGPT
  if (filtered.length > 30000) {
    filtered = filtered.substring(0, 30000) + '\n<!-- HTML truncated for AI processing -->';
  }

  return filtered;
}

async function run(context) {
  const page = await context.newPage();
  
  // Suprimir logs de console de la página para evitar spam en logs
  page.on('console', () => {}); // Ignorar todos los console.log de la página
  page.on('pageerror', () => {}); // Ignorar errores de la página
  
  const downloadPath = path.resolve(__dirname, '..', 'factures', SITE_NAME);
  let downloadedFiles = [];

  try {
    log(`${SITE_NAME.toUpperCase()} START (AI-Powered)`);

    // Intentar cargar la página con timeout más largo y estrategia más robusta
    try {
      await page.goto(TARGET_URL, { 
        waitUntil: 'domcontentloaded', 
        timeout: 60000 
      });
      log(`${SITE_NAME.toUpperCase()} PAGE LOADED`);
      
      // Esperar un poco más para que cargue completamente (especialmente para SPAs)
      await page.waitForTimeout(8000);
      
    } catch (gotoError) {
      log(`${SITE_NAME.toUpperCase()} GOTO_ERROR: ${gotoError.message}`);
      
      // Verificar si la página requiere login
      const currentUrl = page.url();
      log(`${SITE_NAME.toUpperCase()} CURRENT_URL: ${currentUrl}`);
      
      if (currentUrl.includes('login') || currentUrl.includes('auth') || currentUrl.includes('signin') || currentUrl.includes('sign-in')) {
        throw new Error('Page requires authentication. Please login to Hyperline first.');
      }
      
      // Si no es un problema de autenticación, reintentar con estrategia diferente
      log(`${SITE_NAME.toUpperCase()} RETRYING with different strategy...`);
      await page.goto(TARGET_URL, { 
        waitUntil: 'load', 
        timeout: 30000 
      });
      await page.waitForTimeout(5000);
    }

    const html = await page.content();
    log(`${SITE_NAME.toUpperCase()} HTML content fetched (${html.length} chars)`);

    // Verificar si el HTML contiene contenido útil
    if (html.length < 1000) {
      log(`${SITE_NAME.toUpperCase()} WARNING: HTML content seems too short, might be blocked or redirected`);
    }

    // Verificar si estamos en la página correcta
    const title = await page.title();
    log(`${SITE_NAME.toUpperCase()} PAGE_TITLE: "${title}"`);

    // Verificar si es una SPA que necesita más tiempo para cargar
    if (html.includes('loading') || html.includes('spinner') || title.toLowerCase().includes('loading')) {
      log(`${SITE_NAME.toUpperCase()} SPA_DETECTED: Waiting additional time for content to load...`);
      await page.waitForTimeout(10000);
      const updatedHtml = await page.content();
      if (updatedHtml.length > html.length) {
        log(`${SITE_NAME.toUpperCase()} SPA_CONTENT_UPDATED: Content loaded after waiting`);
      }
    }

    // Filtrar el HTML para reducir el tamaño antes de enviarlo a la IA
    log(`${SITE_NAME.toUpperCase()} Filtering HTML to reduce size for AI...`);
    const filteredHtml = filterHtmlForAI(html);
    log(`${SITE_NAME.toUpperCase()} Filtered HTML size: ${filteredHtml.length} chars (reduced from ${html.length})`);

    // Debug logging - HTML files disabled

    // Verificar si hay elementos de facturación
    const billingKeywords = ['invoice', 'billing', 'payment', 'subscription', 'receipt'];
    const foundKeywords = billingKeywords.filter(keyword => filteredHtml.toLowerCase().includes(keyword));
    
    if (foundKeywords.length > 0) {
      log(`${SITE_NAME.toUpperCase()} BILLING_ELEMENTS_DETECTED: Found keywords: ${foundKeywords.join(', ')}`);
    } else {
      log(`${SITE_NAME.toUpperCase()} NO_BILLING_ELEMENTS: No billing keywords found in filtered HTML`);
    }

    // Verificar si hay enlaces de descarga potenciales
    const downloadKeywords = ['download', 'pdf', 'invoice', 'receipt'];
    const foundDownloadKeywords = downloadKeywords.filter(keyword => filteredHtml.toLowerCase().includes(keyword));
    
    if (foundDownloadKeywords.length > 0) {
      log(`${SITE_NAME.toUpperCase()} DOWNLOAD_ELEMENTS_DETECTED: Found keywords: ${foundDownloadKeywords.join(', ')}`);
    } else {
      log(`${SITE_NAME.toUpperCase()} NO_DOWNLOAD_ELEMENTS: No download keywords found`);
    }

    // Verificar si hay facturas disponibles antes de llamar a la IA
    if (filteredHtml.includes('No invoices') || 
        filteredHtml.includes('No billing history') || 
        filteredHtml.includes('No payments') ||
        filteredHtml.includes('Empty') ||
        (filteredHtml.includes('billing') && filteredHtml.length < 2000)) {
      log(`${SITE_NAME.toUpperCase()} NO_INVOICES_AVAILABLE: No invoices found or billing section is empty`);
      throw new Error('No invoices available for download. Billing section appears to be empty.');
    }

    // Llamada a IA #1 - Buscar elementos candidatos para descargar facturas
    const candidates = await findCandidateElements(filteredHtml);
    log(`${SITE_NAME.toUpperCase()} CANDIDATES_FROM_AI ${candidates.length}`);
    if (candidates.length === 0) {
      log(`${SITE_NAME.toUpperCase()} DEBUG: No candidates found by AI`);
      throw new Error('AI did not find any download candidates.');
    }

    const selectors = await getCssSelectors(candidates);
    log(`${SITE_NAME.toUpperCase()} SELECTORS_FROM_AI ${selectors.length}`);
    if (selectors.length === 0) {
      throw new Error('AI did not generate any CSS selectors.');
    }
    log(`AI suggested selectors: ${selectors.join(', ')}`);

    downloadedFiles = await attemptDownloads(page, selectors, downloadPath);

    if (downloadedFiles.length === 0) {
      log(`${SITE_NAME.toUpperCase()} AI selectors failed to trigger a download.`);
    }

    log(`${SITE_NAME.toUpperCase()} DONE ${downloadedFiles.length} file(s)`);

  } catch (error) {
    log(`ERROR in ${SITE_NAME}: ${error.message}`);
  } finally {
    await page.close();
  }
  return downloadedFiles;
}

module.exports = { run, SITE_NAME };

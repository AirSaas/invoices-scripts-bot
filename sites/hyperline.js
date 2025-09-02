const path = require('path');
const { log } = require('../utils/logger');
const { findCandidateElements, getCssSelectors } = require('../utils/selectorAI');
const { attemptDownloads } = require('../utils/download');

const SITE_NAME = 'hyperline';
const TARGET_URL = 'https://app.hyperline.co/app/settings/billing';

// Función para manejar el login con Google
async function handleGoogleLogin(page) {
  log(`${SITE_NAME.toUpperCase()} LOGIN: Starting Google OAuth process...`);
  
  // Obtener el email de la variable de entorno
  const targetEmail = process.env.HYPERLINE_EMAIL;
  if (!targetEmail) {
    throw new Error('HYPERLINE_EMAIL environment variable is required for Google login');
  }
  
  log(`${SITE_NAME.toUpperCase()} LOGIN: Target email: ${targetEmail}`);
  
  // Buscar y hacer clic en el botón "Continue with Google"
  const googleButtonSelectors = [
    'button:has-text("Continue with Google")',
    'button:has-text("Sign in with Google")',
    'button:has-text("Login with Google")',
    'button:has-text("Google")',
    'a:has-text("Continue with Google")',
    'a:has-text("Sign in with Google")',
    'a:has-text("Login with Google")',
    'a:has-text("Google")',
    '[data-testid*="google"]',
    '[class*="google"]',
    'iframe[src*="accounts.google.com"]'
  ];
  
  let googleButtonFound = false;
  
  for (const selector of googleButtonSelectors) {
    try {
      log(`${SITE_NAME.toUpperCase()} LOGIN: Trying selector: ${selector}`);
      await page.waitForSelector(selector, { timeout: 3000 });
      await page.click(selector);
      log(`${SITE_NAME.toUpperCase()} LOGIN: Google button clicked with selector: ${selector}`);
      googleButtonFound = true;
      break;
    } catch (error) {
      log(`${SITE_NAME.toUpperCase()} LOGIN: Selector failed: ${selector} - ${error.message}`);
      continue;
    }
  }
  
  if (!googleButtonFound) {
    throw new Error('Could not find Google login button');
  }
  
  // Esperar a que se abra la página de selección de cuenta de Google
  await page.waitForTimeout(3000);
  
  // Verificar si estamos en la página de Google
  const currentUrl = page.url();
  log(`${SITE_NAME.toUpperCase()} LOGIN: Current URL after Google button click: ${currentUrl}`);
  
  if (currentUrl.includes('accounts.google.com')) {
    log(`${SITE_NAME.toUpperCase()} LOGIN: On Google account selection page`);
    
    // Buscar y hacer clic en la cuenta específica
    const accountSelectors = [
      `[data-email="${targetEmail}"]`,
      `[data-identifier="${targetEmail}"]`,
      `div:has-text("${targetEmail}")`,
      `[aria-label*="${targetEmail}"]`,
      `[title*="${targetEmail}"]`
    ];
    
    let accountFound = false;
    
    for (const selector of accountSelectors) {
      try {
        log(`${SITE_NAME.toUpperCase()} LOGIN: Looking for account with selector: ${selector}`);
        await page.waitForSelector(selector, { timeout: 3000 });
        await page.click(selector);
        log(`${SITE_NAME.toUpperCase()} LOGIN: Target account clicked with selector: ${selector}`);
        accountFound = true;
        break;
      } catch (error) {
        log(`${SITE_NAME.toUpperCase()} LOGIN: Account selector failed: ${selector} - ${error.message}`);
        continue;
      }
    }
    
    if (!accountFound) {
      log(`${SITE_NAME.toUpperCase()} LOGIN: Target account not found, trying to continue with default selection`);
      // Si no encontramos la cuenta específica, intentar continuar con la selección por defecto
      await page.waitForTimeout(3000);
    }
  } else {
    log(`${SITE_NAME.toUpperCase()} LOGIN: Not on Google account page, current URL: ${currentUrl}`);
    // Si no estamos en la página de Google, esperar un poco más
    await page.waitForTimeout(3000);
  }
  
  // Esperar a que se complete la autenticación
  await page.waitForTimeout(5000);
  
  // Esperar a que se redirija de vuelta a Hyperline con manejo de timeout
  try {
    await page.waitForNavigation({ timeout: 15000 });
    log(`${SITE_NAME.toUpperCase()} LOGIN: Redirected back to Hyperline`);
  } catch (navigationError) {
    log(`${SITE_NAME.toUpperCase()} LOGIN: Navigation timeout, but continuing...`);
    // Continuar aunque haya timeout en la navegación
  }
  
  // Esperar adicional 5 segundos como solicitado
  await page.waitForTimeout(5000);
  
  // Verificar la URL final
  const finalUrl = page.url();
  log(`${SITE_NAME.toUpperCase()} LOGIN: Final URL after OAuth: ${finalUrl}`);
  
  if (finalUrl.includes('hyperline.co') && !finalUrl.includes('login') && !finalUrl.includes('auth')) {
    log(`${SITE_NAME.toUpperCase()} LOGIN: Successfully authenticated via Google OAuth`);
  } else {
    throw new Error('Authentication may have failed. Still on login page or unexpected URL.');
  }
}

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

    // Intentar cargar la página de billing
    try {
      await page.goto(TARGET_URL, { 
        waitUntil: 'domcontentloaded', 
        timeout: 30000 
      });
      log(`${SITE_NAME.toUpperCase()} PAGE LOADED`);
      
      // Esperar 6 segundos para que la SPA procese la autenticación y posible redirección
      log(`${SITE_NAME.toUpperCase()} WAITING_FOR_SPA_REDIRECT: Waiting 6 seconds for SPA to process authentication...`);
      await page.waitForTimeout(6000);
      
      // Verificar si fue redirigido al login después de la carga inicial
      const currentUrl = page.url();
      log(`${SITE_NAME.toUpperCase()} CURRENT_URL_AFTER_WAIT: ${currentUrl}`);
      
      if (currentUrl.toLowerCase().includes('login')) {
        log(`${SITE_NAME.toUpperCase()} LOGIN_REDIRECT_DETECTED: SPA redirected to login page`);
        
        // Intentar manejar el login automáticamente
        try {
          await handleGoogleLogin(page);
          log(`${SITE_NAME.toUpperCase()} LOGIN_SUCCESS: Proceeding to billing page...`);
          
          // Después del login, navegar a la página de facturación
          await page.goto(TARGET_URL, { 
            waitUntil: 'domcontentloaded', 
            timeout: 30000 
          });
          await page.waitForTimeout(2000);
          
        } catch (loginError) {
          log(`${SITE_NAME.toUpperCase()} LOGIN_FAILED: ${loginError.message}`);
          throw new Error(`Failed to login to Hyperline: ${loginError.message}`);
        }
      } else {
        log(`${SITE_NAME.toUpperCase()} NO_LOGIN_REDIRECT: Already authenticated, proceeding to billing...`);
      }
      
    } catch (gotoError) {
      log(`${SITE_NAME.toUpperCase()} GOTO_ERROR: ${gotoError.message}`);
      
      // Verificar si la página requiere login
      const currentUrl = page.url();
      log(`${SITE_NAME.toUpperCase()} CURRENT_URL: ${currentUrl}`);
      
      if (currentUrl.toLowerCase().includes('login')) {
        log(`${SITE_NAME.toUpperCase()} LOGIN_PAGE_DETECTED: Handling login page...`);
        
        // Intentar manejar el login automáticamente
        try {
          await handleGoogleLogin(page);
          log(`${SITE_NAME.toUpperCase()} LOGIN_SUCCESS: Proceeding to billing page...`);
          
          // Después del login, navegar a la página de facturación
          await page.goto(TARGET_URL, { 
            waitUntil: 'domcontentloaded', 
            timeout: 30000 
          });
          await page.waitForTimeout(2000);
          
        } catch (loginError) {
          log(`${SITE_NAME.toUpperCase()} LOGIN_FAILED: ${loginError.message}`);
          throw new Error(`Failed to login to Hyperline: ${loginError.message}`);
        }
      } else {
        // Si no es un problema de autenticación, reintentar con estrategia diferente
        log(`${SITE_NAME.toUpperCase()} RETRYING with different strategy...`);
        await page.goto(TARGET_URL, { 
          waitUntil: 'load', 
          timeout: 30000 
        });
        await page.waitForTimeout(3000);
      }
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
      await page.waitForTimeout(15000);
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

    // Primero intentar navegar a la página de invoices si se encuentra
    log(`${SITE_NAME.toUpperCase()} LOOKING_FOR_INVOICES_PAGE: Searching for invoices page link...`);
    
    try {
      await page.waitForSelector('a:has-text("Invoices")', { timeout: 5000 });
      await page.click('a:has-text("Invoices")');
      log(`${SITE_NAME.toUpperCase()} NAVIGATED_TO_INVOICES: Clicked on Invoices link`);
      
      // Esperar a que cargue la página de invoices
      await page.waitForTimeout(6000);
      
      // Obtener el HTML de la página de invoices
      const invoicesHtml = await page.content();
      log(`${SITE_NAME.toUpperCase()} INVOICES_PAGE_HTML: ${invoicesHtml.length} chars`);
      
      // Filtrar el HTML de la página de invoices
      const filteredInvoicesHtml = filterHtmlForAI(invoicesHtml);
      log(`${SITE_NAME.toUpperCase()} FILTERED_INVOICES_HTML: ${filteredInvoicesHtml.length} chars`);
      
      // Buscar elementos de descarga en la página de invoices
      const invoiceCandidates = await findCandidateElements(filteredInvoicesHtml);
      log(`${SITE_NAME.toUpperCase()} INVOICE_CANDIDATES_FROM_AI ${invoiceCandidates.length}`);
      
      if (invoiceCandidates.length > 0) {
        const invoiceSelectors = await getCssSelectors(invoiceCandidates);
        log(`${SITE_NAME.toUpperCase()} INVOICE_SELECTORS_FROM_AI ${invoiceSelectors.length}`);
        log(`AI suggested invoice selectors: ${invoiceSelectors.join(', ')}`);
        
        downloadedFiles = await attemptDownloads(page, invoiceSelectors, downloadPath);
        
        if (downloadedFiles.length > 0) {
          log(`${SITE_NAME.toUpperCase()} INVOICES_DOWNLOADED: Successfully downloaded ${downloadedFiles.length} files from invoices page`);
          return downloadedFiles;
        }
      }
      
    } catch (error) {
      log(`${SITE_NAME.toUpperCase()} INVOICES_PAGE_ERROR: ${error.message}`);
    }

    // Si no se pudo navegar a invoices o no se encontraron descargas, usar la página actual
    log(`${SITE_NAME.toUpperCase()} FALLBACK_TO_CURRENT_PAGE: Using current page for download search...`);
    
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

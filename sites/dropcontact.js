const path = require('path');
const { log } = require('../utils/logger');
const { findCandidateElements, getCssSelectors } = require('../utils/selectorAI');
const { attemptDownloads } = require('../utils/download');

const SITE_NAME = 'dropcontact';
const TARGET_URL = 'https://app.dropcontact.com/billing';

function filterHtmlForAI(html) {
  // Estrategia más agresiva: extraer solo las secciones relevantes
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
        lowerLine.includes('download') ||
        lowerLine.includes('descargar') ||
        lowerLine.includes('télécharger') ||
        lowerLine.includes('pdf') ||
        lowerLine.includes('stripe.com') ||
        lowerLine.includes('pay.stripe') ||
        lowerLine.includes('<button') ||
        lowerLine.includes('</button>') ||
        lowerLine.includes('<a ') ||
        lowerLine.includes('</a>') ||
        lowerLine.includes('href=') ||
        lowerLine.includes('onclick=') ||
        lowerLine.includes('target=') ||
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
        // Mantener fechas que podrían ser de facturas
        lowerLine.match(/\d{1,2}\s*\/\s*\d{1,2}\s*\/\s*\d{4}/) ||
        // Mantener precios
        lowerLine.includes('€') ||
        lowerLine.includes('$') ||
        (lowerLine.includes('<div') && (lowerLine.includes('class=') || lowerLine.includes('id='))) ||
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

// Function to check if we're on a login page
async function isLoginPage(page) {
  const currentUrl = page.url();
  const title = await page.title();
  
  log(`${SITE_NAME.toUpperCase()} CHECKING_LOGIN_PAGE - URL: ${currentUrl}, TITLE: "${title}"`);
  
  const isLogin = currentUrl.includes('login') || 
         currentUrl.includes('auth') || 
         title.toLowerCase().includes('log in') ||
         title.toLowerCase().includes('sign in') ||
         title.toLowerCase().includes('connexion') ||
         title.toLowerCase().includes('connection') ||
         title.toLowerCase().includes('login');
  
  log(`${SITE_NAME.toUpperCase()} IS_LOGIN_PAGE: ${isLogin}`);
  return isLogin;
}

// Function to handle Google login
async function handleGoogleLogin(page) {
  log(`${SITE_NAME.toUpperCase()} HANDLING_GOOGLE_LOGIN`);
  
  // Get the email from environment variable
  const targetEmail = process.env.BETTERCONTACT_EMAIL;
  if (!targetEmail) {
    throw new Error('BETTERCONTACT_EMAIL environment variable is not set');
  }
  
  log(`${SITE_NAME.toUpperCase()} TARGET_EMAIL: ${targetEmail}`);
  
  // Wait for the page to load completely
  await page.waitForTimeout(3000);
  
  // Look for the "Continue with Google" button
  const googleButtonSelectors = [
    'button:has-text("Continue with Google")',
    'button:has-text("Log in with Google")',
    'button:has-text("Sign in with Google")',
    '[data-testid="google-login"]',
    'button[aria-label*="Google"]',
    'button:has(img[alt*="Google"])',
    'a:has-text("Continue with Google")',
    'a:has-text("Log in with Google")',
    'a:has-text("Sign in with Google")'
  ];
  
  let googleButton = null;
  for (const selector of googleButtonSelectors) {
    try {
      googleButton = await page.$(selector);
      if (googleButton) {
        log(`${SITE_NAME.toUpperCase()} GOOGLE_BUTTON_FOUND: ${selector}`);
        break;
      }
    } catch (e) {
      // Continue to next selector
    }
  }
  
  if (!googleButton) {
    throw new Error('Google login button not found');
  }
  
  // Click the Google button
  await googleButton.click();
  log(`${SITE_NAME.toUpperCase()} GOOGLE_BUTTON_CLICKED`);
  
  // Wait for Google account selection page
  await page.waitForTimeout(5000);
  
  // Check if we're on Google account selection page
  const currentUrl = page.url();
  if (currentUrl.includes('accounts.google.com')) {
    log(`${SITE_NAME.toUpperCase()} ON_GOOGLE_ACCOUNT_PAGE`);
    
    // Look for the target email in the account list
    const emailSelectors = [
      `[data-email="${targetEmail}"]`,
      `[data-identifier="${targetEmail}"]`,
      `div:has-text("${targetEmail}")`,
      `[aria-label*="${targetEmail}"]`,
      `div[role="button"]:has-text("${targetEmail}")`
    ];
    
    let targetAccount = null;
    for (const selector of emailSelectors) {
      try {
        targetAccount = await page.$(selector);
        if (targetAccount) {
          log(`${SITE_NAME.toUpperCase()} TARGET_ACCOUNT_FOUND: ${selector}`);
          break;
        }
      } catch (e) {
        // Continue to next selector
      }
    }
    
    if (targetAccount) {
      // Click on the target account
      await targetAccount.click();
      log(`${SITE_NAME.toUpperCase()} TARGET_ACCOUNT_CLICKED`);
      
      // Wait for authentication to complete
      await page.waitForTimeout(3000);
      
      // Wait for redirect back to dropcontact
      await page.waitForNavigation({ timeout: 30000 });
      log(`${SITE_NAME.toUpperCase()} REDIRECTED_BACK_TO_DROPCONTACT`);
      
      // Wait additional 3 seconds as requested
      await page.waitForTimeout(3000);
      
    } else {
      throw new Error(`Target email ${targetEmail} not found in Google account selection`);
    }
  } else {
    log(`${SITE_NAME.toUpperCase()} NOT_ON_GOOGLE_ACCOUNT_PAGE, current URL: ${currentUrl}`);
    // If not on Google account page, wait and continue
    await page.waitForTimeout(3000);
  }
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
        timeout: 90000 
      });
      log(`${SITE_NAME.toUpperCase()} PAGE LOADED`);
      
      // Esperar un poco más para que cargue completamente
      await page.waitForTimeout(8000);
      
    } catch (gotoError) {
      log(`${SITE_NAME.toUpperCase()} GOTO_ERROR: ${gotoError.message}`);
      
      // Verificar si la página requiere login
      const currentUrl = page.url();
      log(`${SITE_NAME.toUpperCase()} CURRENT_URL: ${currentUrl}`);
      
      if (currentUrl.includes('login') || currentUrl.includes('auth')) {
        throw new Error('Page requires authentication. Please login to Dropcontact first.');
      }
      
      // Si no es un problema de autenticación, reintentar con estrategia diferente
      log(`${SITE_NAME.toUpperCase()} RETRYING with different strategy...`);
      await page.goto(TARGET_URL, { 
        waitUntil: 'load', 
        timeout: 30000 
      });
    }

    // Check if we're on a login page after loading
    const title = await page.title();
    log(`${SITE_NAME.toUpperCase()} PAGE_TITLE: "${title}"`);
    
    if (await isLoginPage(page)) {
      log(`${SITE_NAME.toUpperCase()} LOGIN_REQUIRED: Detected login page`);
      
      // Handle Google login
      await handleGoogleLogin(page);
      
      // After login, navigate to billing page
      await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
      log(`${SITE_NAME.toUpperCase()} NAVIGATED_TO_BILLING_AFTER_LOGIN`);
      
      // Wait for billing page to load
      await page.waitForTimeout(5000);
    }

    const html = await page.content();
    log(`${SITE_NAME.toUpperCase()} HTML content fetched (${html.length} chars)`);

    // Verificar si el HTML contiene contenido útil
    if (html.length < 1000) {
      log(`${SITE_NAME.toUpperCase()} WARNING: HTML content seems too short, might be blocked or redirected`);
    }

    // Filtrar el HTML para reducir el tamaño antes de enviarlo a la IA
    log(`${SITE_NAME.toUpperCase()} Filtering HTML to reduce size for AI...`);
    const filteredHtml = filterHtmlForAI(html);
    log(`${SITE_NAME.toUpperCase()} Filtered HTML size: ${filteredHtml.length} chars (reduced from ${html.length})`);

    // Verificar si hay enlaces a Stripe (facturas)
    if (filteredHtml.includes('pay.stripe.com/invoice')) {
      log(`${SITE_NAME.toUpperCase()} STRIPE_INVOICE_DETECTED: Found Stripe invoice links`);
    } else {
      log(`${SITE_NAME.toUpperCase()} NO_STRIPE_LINKS: No Stripe invoice links found in filtered HTML`);
    }

    // Verificar si hay facturas disponibles antes de llamar a la IA
    if (filteredHtml.includes('<table><tbody></tbody></table>')) {
      log(`${SITE_NAME.toUpperCase()} NO_INVOICES_AVAILABLE: Billing history table is empty`);
      throw new Error('No invoices available for download. The billing history table is empty.');
    }

    // Llamada a IA #1 (ahora sin la palabra clave específica)
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

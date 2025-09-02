const path = require('path');
const { log } = require('../utils/logger');
const { findCandidateElements, getCssSelectors } = require('../utils/selectorAI');
const { attemptDownloads } = require('../utils/download');

const SITE_NAME = 'fullenrich';
const TARGET_URL = 'https://app.fullenrich.com/app/settings/billing';

// Función para manejar el login automático
async function handleLogin(page) {
  log(`${SITE_NAME.toUpperCase()} LOGIN: Starting automatic login process...`);
  
  // Esperar a que aparezca el formulario de login
  await page.waitForSelector('input[type="email"], input[placeholder*="email"], input[name*="email"]', { timeout: 10000 });
  log(`${SITE_NAME.toUpperCase()} LOGIN: Email field found`);
  
  // Buscar el campo de email
  const emailSelectors = [
    'input[type="email"]',
    'input[placeholder*="email"]',
    'input[name*="email"]',
    'input[aria-label*="Email"]'
  ];
  
  let emailField = null;
  for (const selector of emailSelectors) {
    try {
      emailField = page.locator(selector).first();
      await emailField.waitFor({ timeout: 2000 });
      log(`${SITE_NAME.toUpperCase()} LOGIN: Email field located with selector: ${selector}`);
      break;
    } catch (e) {
      // Continuar con el siguiente selector
    }
  }
  
  if (!emailField) {
    throw new Error('Email field not found on login page');
  }
  
  // Rellenar el email (usar el email del perfil de Chrome)
  if (!process.env.FULLENRICH_EMAIL) {
    throw new Error('FULLENRICH_EMAIL environment variable is required. Please set it in your .env file.');
  }
  
  const emailToUse = process.env.FULLENRICH_EMAIL;
  await emailField.click();
  await emailField.fill(emailToUse);
  log(`${SITE_NAME.toUpperCase()} LOGIN: Email filled: ${emailToUse}`);
  
  // Buscar y hacer clic en el botón "Continue"
  const continueSelectors = [
    'button:has-text("Continue")',
    'button[type="submit"]',
    'input[type="submit"]',
    'button:has-text("Continue")',
    'div[role="button"]:has-text("Continue")'
  ];
  
  let continueButton = null;
  for (const selector of continueSelectors) {
    try {
      continueButton = page.locator(selector).first();
      await continueButton.waitFor({ timeout: 2000 });
      log(`${SITE_NAME.toUpperCase()} LOGIN: Continue button found with selector: ${selector}`);
      break;
    } catch (e) {
      // Continuar con el siguiente selector
    }
  }
  
  if (!continueButton) {
    throw new Error('Continue button not found on login page');
  }
  
  // Hacer clic en Continue
  await continueButton.click();
  log(`${SITE_NAME.toUpperCase()} LOGIN: Continue button clicked`);
  
  // Después de hacer clic en Continue, esperar a que se procese
  log(`${SITE_NAME.toUpperCase()} LOGIN: Waiting for email processing...`);
  await page.waitForTimeout(3000);
  
  // SEGUNDO PASO: Buscar y hacer clic en el botón de Google OAuth que aparece después del email
  log(`${SITE_NAME.toUpperCase()} LOGIN: Looking for Google OAuth button after email...`);
  
  // Buscar el iframe de Google OAuth
  const iframeSelectors = [
    'iframe[src*="accounts.google.com"]',
    'iframe[title*="Google"]',
    'iframe[title*="Acceder"]',
    'iframe[title*="Sign in"]',
    'iframe[title*="Botón"]',
    'iframe.L5Fo6c-PQbLGe',
    'iframe[id*="gsi"]'
  ];
  
  let googleIframe = null;
  for (const selector of iframeSelectors) {
    try {
      googleIframe = page.locator(selector).first();
      await googleIframe.waitFor({ timeout: 2000 });
      log(`${SITE_NAME.toUpperCase()} LOGIN: Google iframe found with selector: ${selector}`);
      break;
    } catch (e) {
      log(`${SITE_NAME.toUpperCase()} LOGIN: Iframe selector ${selector} failed: ${e.message}`);
      // Continuar con el siguiente selector
    }
  }
  
  if (!googleIframe) {
    // Si no encontramos el iframe, buscar el botón directamente
    log(`${SITE_NAME.toUpperCase()} LOGIN: Iframe not found, looking for direct button...`);
    
    // Buscar el botón de Google OAuth que contiene el usuario pre-seleccionado
    const googleButtonSelectors = [
      // Selectores específicos para el botón azul con usuario pre-seleccionado
      'button:has-text("Acceder como")',
      'button:has-text("Se connecter en tant que")',
      'button:has-text("Access as")',
      'button:has-text("Login as")',
      'button:has-text("Sign in as")',
      'div[role="button"]:has-text("Acceder como")',
      'div[role="button"]:has-text("Se connecter en tant que")',
      'div[role="button"]:has-text("Access as")',
      'div[role="button"]:has-text("Login as")',
      'div[role="button"]:has-text("Sign in as")',
      'a:has-text("Acceder como")',
      'a:has-text("Se connecter en tant que")',
      'a:has-text("Access as")',
      'a:has-text("Login as")',
      'a:has-text("Sign in as")',
      // Selectores más específicos para el botón azul
      'button[style*="background"]:has-text("Acceder")',
      'button[style*="background"]:has-text("Se connecter")',
      'button[style*="background"]:has-text("Access")',
      'button[style*="background"]:has-text("Login")',
      'button[style*="background"]:has-text("Sign in")',
      'div[role="button"][style*="background"]:has-text("Acceder")',
      'div[role="button"][style*="background"]:has-text("Se connecter")',
      'div[role="button"][style*="background"]:has-text("Access")',
      'div[role="button"][style*="background"]:has-text("Login")',
      'div[role="button"][style*="background"]:has-text("Sign in")',
      // Selectores por clase o atributos específicos
      'button[class*="google"]',
      'button[class*="oauth"]',
      'button[class*="login"]',
      'div[role="button"][class*="google"]',
      'div[role="button"][class*="oauth"]',
      'div[role="button"][class*="login"]',
      // Selectores de respaldo más genéricos
      'button:has(img[alt*="Google"])',
      'button[aria-label*="Google"]',
      'button:has-text("Google")',
      'div[role="button"]:has-text("Google")',
      'a:has-text("Google")'
    ];
    
    let googleButton = null;
    for (const selector of googleButtonSelectors) {
      try {
        // Usar page.locator en lugar de page.$ para mejor compatibilidad
        const button = page.locator(selector).first();
        await button.waitFor({ timeout: 2000 });
        googleButton = button;
        log(`${SITE_NAME.toUpperCase()} LOGIN: Google OAuth button found with selector: ${selector}`);
        break;
      } catch (e) {
        log(`${SITE_NAME.toUpperCase()} LOGIN: Selector ${selector} failed: ${e.message}`);
        // Continuar con el siguiente selector
      }
    }
    
    if (!googleButton) {
      throw new Error('Google OAuth button not found after email submission');
    }
    
    // Hacer clic en el botón de Google OAuth
    await googleButton.click();
    log(`${SITE_NAME.toUpperCase()} LOGIN: Google OAuth button clicked`);
  } else {
    // Si encontramos el iframe, hacer clic en él
    log(`${SITE_NAME.toUpperCase()} LOGIN: Clicking on Google iframe...`);
    await googleIframe.click();
    log(`${SITE_NAME.toUpperCase()} LOGIN: Google iframe clicked`);
  }
  
  // Esperar a que se abra la página de selección de cuenta de Google
  await page.waitForTimeout(5000);
  
  // Verificar si estamos en la página de Google
  const currentUrl = page.url();
  log(`${SITE_NAME.toUpperCase()} LOGIN: Current URL after Google button click: ${currentUrl}`);
  
  if (currentUrl.includes('accounts.google.com')) {
    log(`${SITE_NAME.toUpperCase()} LOGIN: On Google account selection page`);
    
    // Obtener el email objetivo de la variable de entorno
    const targetEmail = process.env.FULLENRICH_EMAIL;
    if (!targetEmail) {
      throw new Error('FULLENRICH_EMAIL environment variable is not set');
    }
    
    log(`${SITE_NAME.toUpperCase()} LOGIN: Looking for account: ${targetEmail}`);
    
    // Buscar la cuenta específica en la lista de cuentas de Google
    const accountSelectors = [
      `[data-email="${targetEmail}"]`,
      `[data-identifier="${targetEmail}"]`,
      `div:has-text("${targetEmail}")`,
      `[aria-label*="${targetEmail}"]`,
      `div[role="button"]:has-text("${targetEmail}")`,
      `div:has-text("${targetEmail.split('@')[0]}")`, // Buscar por nombre de usuario
      `div:has-text("${targetEmail.split('@')[1]}")`   // Buscar por dominio
    ];
    
    let targetAccount = null;
    for (const selector of accountSelectors) {
      try {
        const account = page.locator(selector).first();
        await account.waitFor({ timeout: 2000 });
        targetAccount = account;
        log(`${SITE_NAME.toUpperCase()} LOGIN: Target account found with selector: ${selector}`);
        break;
      } catch (e) {
        log(`${SITE_NAME.toUpperCase()} LOGIN: Account selector ${selector} failed: ${e.message}`);
        // Continuar con el siguiente selector
      }
    }
    
    if (targetAccount) {
      // Hacer clic en la cuenta específica
      await targetAccount.click();
      log(`${SITE_NAME.toUpperCase()} LOGIN: Target account clicked`);
      
      // Esperar a que se complete la autenticación
      await page.waitForTimeout(3000);
      
      // Esperar a que se redirija de vuelta a FullEnrich
      await page.waitForNavigation({ timeout: 30000 });
      log(`${SITE_NAME.toUpperCase()} LOGIN: Redirected back to FullEnrich`);
      
      // Esperar adicional 3 segundos como solicitado
      await page.waitForTimeout(3000);
      
    } else {
      log(`${SITE_NAME.toUpperCase()} LOGIN: Target account not found, trying to continue with default selection`);
      // Si no encontramos la cuenta específica, intentar continuar con la selección por defecto
      await page.waitForTimeout(5000);
    }
  } else {
    log(`${SITE_NAME.toUpperCase()} LOGIN: Not on Google account page, current URL: ${currentUrl}`);
    // Si no estamos en la página de Google, esperar un poco más
    await page.waitForTimeout(5000);
  }
  
  // Verificar si el login fue exitoso
  const finalUrl = page.url();
  log(`${SITE_NAME.toUpperCase()} LOGIN: Final URL after OAuth: ${finalUrl}`);
  
  if (finalUrl.includes('fullenrich.com') && !finalUrl.includes('login') && !finalUrl.includes('auth')) {
    log(`${SITE_NAME.toUpperCase()} LOGIN: Successfully authenticated via Google OAuth`);
  } else {
    log(`${SITE_NAME.toUpperCase()} LOGIN: Still in authentication flow, may need manual intervention`);
  }
}

function filterHtmlForAI(html) {
  // Estrategia específica para Fullenrich: extraer solo las secciones relevantes de billing
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
        lowerLine.includes('subscription') ||
        lowerLine.includes('manage') ||
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
        lowerLine.match(/\d{1,2}[-\/]\d{1,2}[-\/]\d{4}/) ||
        // Mantener precios
        lowerLine.includes('$') ||
        lowerLine.includes('€') ||
        lowerLine.includes('usd') ||
        lowerLine.includes('eur') ||
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
      
      // Esperar un poco más para que cargue completamente
      await page.waitForTimeout(5000);
      
    } catch (gotoError) {
      log(`${SITE_NAME.toUpperCase()} GOTO_ERROR: ${gotoError.message}`);
      
          // Verificar si la página requiere login
    const currentUrl = page.url();
    log(`${SITE_NAME.toUpperCase()} CURRENT_URL: ${currentUrl}`);
    
    if (currentUrl.includes('login') || currentUrl.includes('auth') || currentUrl.includes('signin')) {
      log(`${SITE_NAME.toUpperCase()} LOGIN_PAGE_DETECTED: Handling login page...`);
      
      // Intentar manejar el login automáticamente
      try {
        await handleLogin(page);
        log(`${SITE_NAME.toUpperCase()} LOGIN_SUCCESS: Proceeding to billing page...`);
        
        // Después del login, navegar a la página de facturación
        await page.goto(TARGET_URL, { 
          waitUntil: 'domcontentloaded', 
          timeout: 30000 
        });
        await page.waitForTimeout(3000);
        
      } catch (loginError) {
        log(`${SITE_NAME.toUpperCase()} LOGIN_FAILED: ${loginError.message}`);
        throw new Error('Failed to login to Fullenrich. Please check your credentials or login manually first.');
      }
    }
      
      // Si no es un problema de autenticación, reintentar con estrategia diferente
      log(`${SITE_NAME.toUpperCase()} RETRYING with different strategy...`);
      await page.goto(TARGET_URL, { 
        waitUntil: 'load', 
        timeout: 30000 
      });
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
    
    // Verificar si estamos en una página de login y necesitamos autenticarnos
    if (title.toLowerCase().includes('login') || title.toLowerCase().includes('sign in')) {
      log(`${SITE_NAME.toUpperCase()} LOGIN_PAGE_DETECTED: Handling login page...`);
      
      // Intentar manejar el login automáticamente
      try {
        await handleLogin(page);
        log(`${SITE_NAME.toUpperCase()} LOGIN_SUCCESS: Proceeding to billing page...`);
        
        // Después del login, navegar a la página de facturación
        await page.goto(TARGET_URL, { 
          waitUntil: 'domcontentloaded', 
          timeout: 30000 
        });
        await page.waitForTimeout(3000);
        
        // Verificar que ahora estamos en la página correcta
        const newTitle = await page.title();
        log(`${SITE_NAME.toUpperCase()} NEW_PAGE_TITLE: "${newTitle}"`);
        
        if (newTitle.toLowerCase().includes('login') || newTitle.toLowerCase().includes('sign in')) {
          throw new Error('Still on login page after authentication attempt. Login may have failed.');
        }
        
        // Obtener el HTML actualizado después del login
        const updatedHtml = await page.content();
        log(`${SITE_NAME.toUpperCase()} UPDATED_HTML: ${updatedHtml.length} chars after login`);
        
        // Continuar con el HTML actualizado
        return await processBillingPage(page, updatedHtml, downloadPath);
        
      } catch (loginError) {
        log(`${SITE_NAME.toUpperCase()} LOGIN_FAILED: ${loginError.message}`);
        throw new Error(`Failed to login to Fullenrich: ${loginError.message}`);
      }
    }

    // Continuar con el procesamiento normal de la página de facturación
    return await processBillingPage(page, html, downloadPath);

  } catch (error) {
    log(`ERROR in ${SITE_NAME}: ${error.message}`);
  } finally {
    await page.close();
  }
  return downloadedFiles;
}

// Función para procesar la página de facturación después del login
async function processBillingPage(page, html, downloadPath) {
  log(`${SITE_NAME.toUpperCase()} PROCESSING_BILLING_PAGE: Starting billing page analysis...`);
  
  // Filtrar el HTML para reducir el tamaño antes de enviarlo a la IA
  log(`${SITE_NAME.toUpperCase()} Filtering HTML to reduce size for AI...`);
  const filteredHtml = filterHtmlForAI(html);
  log(`${SITE_NAME.toUpperCase()} Filtered HTML size: ${filteredHtml.length} chars (reduced from ${html.length})`);

  // Verificar si hay enlaces a Stripe (facturas)
  if (filteredHtml.includes('stripe.com') || filteredHtml.includes('manage subscription')) {
    log(`${SITE_NAME.toUpperCase()} BILLING_ELEMENTS_DETECTED: Found billing-related elements`);
  } else {
    log(`${SITE_NAME.toUpperCase()} NO_BILLING_ELEMENTS: No billing elements found in filtered HTML`);
  }

  // Verificar si hay acceso de administrador
  if (filteredHtml.toLowerCase().includes('admin') || filteredHtml.toLowerCase().includes('manage')) {
    log(`${SITE_NAME.toUpperCase()} ADMIN_ACCESS_DETECTED: User appears to have admin access`);
  } else {
    log(`${SITE_NAME.toUpperCase()} NO_ADMIN_ACCESS: User may not have admin privileges for billing`);
  }

  // Verificar si hay facturas disponibles antes de llamar a la IA
  if (filteredHtml.includes('No invoices') || filteredHtml.includes('No billing history')) {
    log(`${SITE_NAME.toUpperCase()} NO_INVOICES_AVAILABLE: No invoices found`);
    throw new Error('No invoices available for download. No billing history found.');
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

  const downloadedFiles = await attemptDownloads(page, selectors, downloadPath);

  if (downloadedFiles.length === 0) {
    log(`${SITE_NAME.toUpperCase()} AI selectors failed to trigger a download.`);
  }

  log(`${SITE_NAME.toUpperCase()} DONE ${downloadedFiles.length} file(s)`);
  return downloadedFiles;
}

module.exports = { run, SITE_NAME };

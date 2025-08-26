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
  
  // NUEVO: Verificar si aparece un campo de contraseña después del email
  log(`${SITE_NAME.toUpperCase()} LOGIN: Checking for password field after email...`);
  
  try {
    // Buscar campo de contraseña que pueda aparecer después del email
    const passwordSelectors = [
      'input[type="password"]',
      'input[name="password"]',
      'input[aria-label*="password"]',
      'input[aria-label*="contraseña"]',
      'input[placeholder*="password"]',
      'input[placeholder*="contraseña"]',
      'input[id*="password"]',
      'input[data-testid*="password"]'
    ];
    
    let passwordFieldFound = false;
    for (const selector of passwordSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 3000 });
        log(`${SITE_NAME.toUpperCase()} LOGIN: Password field found with selector: ${selector}`);
        
        // Obtener la contraseña de la variable de entorno
        const password = process.env.FULLENRICH_PSW;
        if (!password) {
          log(`${SITE_NAME.toUpperCase()} LOGIN: WARNING: FULLENRICH_PSW environment variable not set`);
          throw new Error('FULLENRICH_PSW environment variable is required for password field');
        }
        
        // Limpiar el campo y escribir la contraseña
        await page.fill(selector, '');
        await page.type(selector, password, { delay: 100 });
        log(`${SITE_NAME.toUpperCase()} LOGIN: Password entered successfully`);
        
        passwordFieldFound = true;
        break;
        
      } catch (selectorError) {
        log(`${SITE_NAME.toUpperCase()} LOGIN: Password selector ${selector} failed: ${selectorError.message}`);
        continue;
      }
    }
    
    if (passwordFieldFound) {
      // Buscar y hacer clic en el botón "Sign In" o "Login" después de la contraseña
      log(`${SITE_NAME.toUpperCase()} LOGIN: Looking for sign in button after password...`);
      
      const signInAfterPasswordSelectors = [
        'button:has-text("Sign In")',
        'button:has-text("Sign in")',
        'button:has-text("Login")',
        'button:has-text("Log in")',
        'button:has-text("Continue")',
        'button:has-text("Submit")',
        'button[type="submit"]',
        'input[type="submit"]',
        'div[role="button"]:has-text("Sign In")',
        'div[role="button"]:has-text("Login")'
      ];
      
      let signInButtonClicked = false;
      for (const selector of signInAfterPasswordSelectors) {
        try {
          await page.waitForSelector(selector, { timeout: 3000 });
          log(`${SITE_NAME.toUpperCase()} LOGIN: Sign in button after password found: ${selector}`);
          await page.click(selector);
          log(`${SITE_NAME.toUpperCase()} LOGIN: Sign in button after password clicked`);
          signInButtonClicked = true;
          break;
        } catch (selectorError) {
          log(`${SITE_NAME.toUpperCase()} LOGIN: Sign in button selector ${selector} failed: ${selectorError.message}`);
          continue;
        }
      }
      
      if (!signInButtonClicked) {
        log(`${SITE_NAME.toUpperCase()} LOGIN: WARNING: Could not find sign in button after password, continuing...`);
      }
      
      // Esperar a que se procese la contraseña
      await page.waitForTimeout(5000);
      
    } else {
      log(`${SITE_NAME.toUpperCase()} LOGIN: No password field found, continuing with email-only flow...`);
    }
    
  } catch (passwordError) {
    log(`${SITE_NAME.toUpperCase()} LOGIN: Password handling error: ${passwordError.message}`);
    // Continuar sin manejar la contraseña si hay algún error
  }
  
  // Después de manejar email y posible contraseña, Google OAuth se maneja automáticamente
  // Solo necesitamos esperar a que se complete el flujo de autenticación
  log(`${SITE_NAME.toUpperCase()} LOGIN: Waiting for Google OAuth to complete...`);
  
  // Esperar a que se complete la redirección y autenticación
  await page.waitForTimeout(8000);
  
  // Verificar si el login fue exitoso
  const currentUrl = page.url();
  log(`${SITE_NAME.toUpperCase()} LOGIN: Current URL after OAuth: ${currentUrl}`);
  
  if (currentUrl.includes('fullenrich.com') && !currentUrl.includes('login') && !currentUrl.includes('auth')) {
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

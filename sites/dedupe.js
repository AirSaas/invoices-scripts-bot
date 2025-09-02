const path = require('path');
const { log } = require('../utils/logger');
const { findCandidateElements, getCssSelectors } = require('../utils/selectorAI');
const { attemptDownloads } = require('../utils/download');

const SITE_NAME = 'dedupe';
const TARGET_URL = 'https://app.dedupe.ly/company-settings/billing';
const LOGIN_URL = 'https://app.dedupe.ly/login';

// Función para manejar el inicio de sesión con Google
async function handleGoogleLogin(page) {
  log(`${SITE_NAME.toUpperCase()} HANDLING_GOOGLE_LOGIN`);
  
  try {
    // Ir a la página de login
    log(`${SITE_NAME.toUpperCase()} GOING_TO_LOGIN_PAGE: ${LOGIN_URL}`);
    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    log(`${SITE_NAME.toUpperCase()} LOGIN_PAGE_LOADED`);
    
    // Esperar un poco más para que se cargue completamente
    await page.waitForTimeout(6000);
    
    // Buscar botones de login con Google usando múltiples selectores
    const googleButtonSelectors = [
      'a[href*="google"]',
      'a[href*="oauth"]',
      'a[href*="auth"]',
      'a:has-text("Google")',
      'a:has-text("Sign in with Google")',
      'a:has-text("Continue with Google")',
      'a:has-text("Login with Google")',
      'button:has-text("Google")',
      'button:has-text("Sign in with Google")',
      'button:has-text("Continue with Google")',
      'button:has-text("Login with Google")',
      'a[data-provider="google"]',
      'button[data-provider="google"]',
      'a[aria-label*="Google"]',
      'button[aria-label*="Google"]',
      'a[class*="btn"]',
      'a[class*="button"]',
      'button[class*="btn"]',
      'button[class*="button"]',
      'a[role="button"]',
      'div[role="button"]',
      'span[role="button"]'
    ];
    
    let googleButtonFound = false;
    for (const selector of googleButtonSelectors) {
      try {
        log(`${SITE_NAME.toUpperCase()} TRYING_SELECTOR: ${selector}`);
        await page.waitForSelector(selector, { timeout: 3000 });
        log(`${SITE_NAME.toUpperCase()} GOOGLE_SIGNIN_BUTTON_FOUND with selector: ${selector}`);
        
        // Hacer clic en el botón de Google
        await page.click(selector);
        log(`${SITE_NAME.toUpperCase()} CLICKED_GOOGLE_SIGNIN`);
        googleButtonFound = true;
        break;
        
      } catch (selectorError) {
        log(`${SITE_NAME.toUpperCase()} Selector ${selector} failed: ${selectorError.message}`);
        continue;
      }
    }
    
    if (!googleButtonFound) {
      // Búsqueda genérica por texto que funciona independientemente de la estructura
      log(`${SITE_NAME.toUpperCase()} NO_BUTTON_FOUND, performing generic text search...`);
      
      const googleElements = await page.$$('a:has-text("Google"), a:has-text("Sign in"), a:has-text("Login"), a:has-text("Continue")');
      log(`${SITE_NAME.toUpperCase()} GOOGLE_LINK_ELEMENTS_FOUND: ${googleElements.length}`);
      
      if (googleElements.length > 0) {
        for (const element of googleElements) {
          try {
            const text = await element.textContent();
            const href = await element.getAttribute('href');
            const textLower = text?.toLowerCase() || '';
            
            log(`${SITE_NAME.toUpperCase()} TRYING_LINK_ELEMENT: text="${text?.trim()}", href="${href}"`);
            
            if (textLower.includes('google') || 
                (textLower.includes('sign') && textLower.includes('in')) ||
                textLower.includes('login') ||
                textLower.includes('continue') ||
                (href && (href.includes('google') || href.includes('oauth') || href.includes('auth')))) {
              
              await element.click();
              log(`${SITE_NAME.toUpperCase()} CLICKED_GOOGLE_LINK: "${text.trim()}" with href="${href}"`);
              googleButtonFound = true;
              break;
            }
          } catch (clickError) {
            log(`${SITE_NAME.toUpperCase()} CLICK_FAILED: ${clickError.message}`);
            continue;
          }
        }
      }
      
      if (!googleButtonFound) {
        throw new Error('Could not find Google sign-in button with any selector or text search');
      }
    }
    
    // Esperar a que se abra la ventana de selección de cuenta de Google
    await page.waitForTimeout(6000);
    
    // Verificar si estamos en la página de selección de cuenta de Google
    const currentUrl = page.url();
    log(`${SITE_NAME.toUpperCase()} CURRENT_URL_AFTER_GOOGLE_CLICK: ${currentUrl}`);
    
    if (currentUrl.includes('accounts.google.com')) {
      log(`${SITE_NAME.toUpperCase()} GOOGLE_ACCOUNT_SELECTION_PAGE`);
      
      // Si hay múltiples cuentas, buscar y seleccionar la cuenta específica
      const targetEmail = process.env.DEDUPE_EMAIL;
      if (targetEmail) {
        log(`${SITE_NAME.toUpperCase()} LOOKING_FOR_ACCOUNT: ${targetEmail}`);
        
        // Esperar a que aparezcan las opciones de cuenta
        await page.waitForTimeout(5000);
        
        // Buscar la cuenta específica por email usando múltiples selectores
        const accountSelectors = [
          `[data-email="${targetEmail}"]`,
          `[aria-label*="${targetEmail}"]`,
          `div:has-text("${targetEmail}")`,
          `[data-identifier="${targetEmail}"]`,
          `div[role="button"]:has-text("${targetEmail}")`,
          `button:has-text("${targetEmail}")`
        ];
        
        let accountFound = false;
        for (const selector of accountSelectors) {
          try {
            await page.waitForSelector(selector, { timeout: 3000 });
            log(`${SITE_NAME.toUpperCase()} TARGET_ACCOUNT_FOUND with selector: ${selector}`);
            await page.click(selector);
            log(`${SITE_NAME.toUpperCase()} TARGET_ACCOUNT_SELECTED`);
            accountFound = true;
            break;
          } catch (selectorError) {
            log(`${SITE_NAME.toUpperCase()} Selector ${selector} failed: ${selectorError.message}`);
            continue;
          }
        }
        
        if (!accountFound) {
          log(`${SITE_NAME.toUpperCase()} TARGET_ACCOUNT_NOT_FOUND: ${targetEmail}`);
          log(`${SITE_NAME.toUpperCase()} CONTINUING_WITH_FIRST_AVAILABLE_ACCOUNT`);
          
          // Intentar hacer clic en la primera cuenta disponible
          try {
            const firstAccountSelector = 'div[role="button"], button, div[data-email], div[aria-label]';
            await page.waitForSelector(firstAccountSelector, { timeout: 5000 });
            await page.click(firstAccountSelector);
            log(`${SITE_NAME.toUpperCase()} FIRST_AVAILABLE_ACCOUNT_SELECTED`);
          } catch (firstAccountError) {
            log(`${SITE_NAME.toUpperCase()} FIRST_ACCOUNT_SELECTION_FAILED: ${firstAccountError.message}`);
          }
        }
      }
      
      // Esperar a que se complete la autenticación
      await page.waitForTimeout(8000);
      
      // Verificar si hay un botón "Next" o "Continue" después de seleccionar la cuenta
      try {
        const nextButtonSelector = 'button:has-text("Next"), button:has-text("Continue"), button:has-text("Siguiente"), button:has-text("Continuar")';
        await page.waitForSelector(nextButtonSelector, { timeout: 3000 });
        log(`${SITE_NAME.toUpperCase()} NEXT_BUTTON_FOUND, clicking...`);
        await page.click(nextButtonSelector);
        await page.waitForTimeout(5000);
      } catch (nextButtonError) {
        log(`${SITE_NAME.toUpperCase()} NO_NEXT_BUTTON: ${nextButtonError.message}`);
      }
    }
    
    // Verificar si la autenticación fue exitosa
    await page.waitForTimeout(6000);
    const finalUrl = page.url();
    log(`${SITE_NAME.toUpperCase()} FINAL_URL_AFTER_LOGIN: ${finalUrl}`);
    
    if (finalUrl.includes('login') || finalUrl.includes('auth') || finalUrl.includes('accounts.google.com')) {
      throw new Error('Google login failed - still on login or Google page');
    }
    
    log(`${SITE_NAME.toUpperCase()} GOOGLE_LOGIN_SUCCESSFUL`);
    return true;
    
  } catch (error) {
    log(`${SITE_NAME.toUpperCase()} GOOGLE_LOGIN_ERROR: ${error.message}`);
    throw error;
  }
}

function filterHtmlForAI(html) {
  // Estrategia específica para Dedupe: extraer solo las secciones relevantes de billing e invoice history
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
    // Extraer solo secciones que contengan palabras clave de facturación e invoice history
    .split('\n')
    .filter(line => {
      const lowerLine = line.toLowerCase();
      // Mantener líneas que contengan términos de facturación, invoice history o elementos interactivos
      return (
        lowerLine.includes('billing') ||
        lowerLine.includes('invoice') ||
        lowerLine.includes('invoice history') ||
        lowerLine.includes('facture') ||
        lowerLine.includes('receipt') ||
        lowerLine.includes('payment') ||
        lowerLine.includes('subscription') ||
        lowerLine.includes('history') ||
        lowerLine.includes('credits') ||
        lowerLine.includes('plan') ||
        lowerLine.includes('usage') ||
        lowerLine.includes('download') ||
        lowerLine.includes('descargar') ||
        lowerLine.includes('télécharger') ||
        lowerLine.includes('pdf') ||
        lowerLine.includes('csv') ||
        lowerLine.includes('export') ||
        lowerLine.includes('stripe.com') ||
        lowerLine.includes('pay.stripe') ||
        lowerLine.includes('dedupe') ||
        lowerLine.includes('dedupe.ly') ||
        lowerLine.includes('overview') ||
        lowerLine.includes('download deduped csv') ||
        lowerLine.includes('download csv') ||
        lowerLine.includes('export csv') ||
        lowerLine.includes('view invoice') ||
        lowerLine.includes('download invoice') ||
        lowerLine.includes('download receipt') ||
        lowerLine.includes('billing history') ||
        lowerLine.includes('payment history') ||
        lowerLine.includes('transaction history') ||
        lowerLine.includes('company settings') ||
        lowerLine.includes('account settings') ||
        lowerLine.includes('user settings') ||
        lowerLine.includes('<button') ||
        lowerLine.includes('</button>') ||
        lowerLine.includes('<a ') ||
        lowerLine.includes('</a>') ||
        lowerLine.includes('href=') ||
        lowerLine.includes('onclick=') ||
        lowerLine.includes('target=') ||
        lowerLine.includes('class="') ||
        lowerLine.includes('id="') ||
        lowerLine.includes('data-testid=') ||
        lowerLine.includes('aria-label=') ||
        lowerLine.includes('<table') ||
        lowerLine.includes('<tbody') ||
        lowerLine.includes('<tr') ||
        lowerLine.includes('<td') ||
        lowerLine.includes('<th') ||
        lowerLine.includes('</table>') ||
        lowerLine.includes('</tbody>') ||
        lowerLine.includes('</tr>') ||
        lowerLine.includes('</td>') ||
        lowerLine.includes('</th>') ||
        lowerLine.includes('<ul') ||
        lowerLine.includes('<li') ||
        lowerLine.includes('</ul>') ||
        lowerLine.includes('</li>') ||
        lowerLine.includes('<nav') ||
        lowerLine.includes('</nav>') ||
        // Mantener fechas que podrían ser de facturas
        lowerLine.match(/\d{1,2}[-\/]\d{1,2}[-\/]\d{4}/) ||
        lowerLine.match(/\d{4}[-\/]\d{1,2}[-\/]\d{1,2}/) ||
        lowerLine.match(/\w+ \d{1,2}, \d{4}/) ||
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
        lowerLine.includes('cost') ||
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

    // LÓGICA CORREGIDA: Verificar si ya estamos logueados
    log(`${SITE_NAME.toUpperCase()} CHECKING_AUTH_STATUS`);
    
    // Guardar la URL inicial antes de ir a TARGET_URL
    const initialUrl = page.url();
    log(`${SITE_NAME.toUpperCase()} INITIAL_URL: ${initialUrl}`);
    
    // Intentar ir a la página de billing
    try {
      await page.goto(TARGET_URL, { 
        waitUntil: 'domcontentloaded', 
        timeout: 30000 
      });
      
      // Obtener la URL después de la navegación
      const finalUrl = page.url();
      log(`${SITE_NAME.toUpperCase()} FINAL_URL_AFTER_NAVIGATION: ${finalUrl}`);
      
      // Verificar si la URL cambió a LOGIN_URL o se mantuvo en TARGET_URL
      if (finalUrl === TARGET_URL || finalUrl.includes('/company-settings/billing')) {
        log(`${SITE_NAME.toUpperCase()} ALREADY_LOGGED_IN: URL remained on billing page`);
        log(`${SITE_NAME.toUpperCase()} CONTINUING_WITH_BILLING_PAGE - NO LOGIN NEEDED`);
        log(`${SITE_NAME.toUpperCase()} SKIPPING_LOGIN_PROCESS_AND_CONTINUING_DIRECTLY`);
        
        // Esperar un poco más para que cargue completamente (especialmente para SPAs)
        await page.waitForTimeout(8000);
        
        // CONTINUAR DIRECTAMENTE CON EL PROCESO DE BILLING
        // NO necesitamos ir a LOGIN_URL ni hacer login
        
      } else if (finalUrl.includes('/login') || finalUrl.includes('/auth') || finalUrl.includes('/signin') || finalUrl.includes('/sign-in')) {
        log(`${SITE_NAME.toUpperCase()} LOGIN_REQUIRED: URL changed to login page (${finalUrl})`);
        log(`${SITE_NAME.toUpperCase()} ATTEMPTING_GOOGLE_LOGIN...`);
        
        // Intentar hacer login con Google
        await handleGoogleLogin(page);
        
        // Después del login exitoso, ir a la página de billing
        log(`${SITE_NAME.toUpperCase()} REDIRECTING_TO_BILLING_AFTER_LOGIN`);
        await page.goto(TARGET_URL, { 
          waitUntil: 'domcontentloaded', 
          timeout: 30000 
        });
        await page.waitForTimeout(5000);
        
      } else {
        log(`${SITE_NAME.toUpperCase()} UNEXPECTED_REDIRECT: URL changed to ${finalUrl}`);
        log(`${SITE_NAME.toUpperCase()} CHECKING_IF_BILLING_CONTENT_IS_AVAILABLE...`);
        
        // Verificar si el contenido de billing está disponible en esta URL inesperada
        const currentHtml = await page.content();
        if (currentHtml.toLowerCase().includes('billing') || 
            currentHtml.toLowerCase().includes('invoice') ||
            currentHtml.toLowerCase().includes('payment')) {
          log(`${SITE_NAME.toUpperCase()} BILLING_CONTENT_FOUND_IN_UNEXPECTED_URL: Continuing...`);
          await page.waitForTimeout(8000);
        } else {
          log(`${SITE_NAME.toUpperCase()} NO_BILLING_CONTENT_FOUND: Attempting login...`);
          await handleGoogleLogin(page);
          await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await page.waitForTimeout(8000);
        }
      }
      
    } catch (gotoError) {
      log(`${SITE_NAME.toUpperCase()} GOTO_ERROR: ${gotoError.message}`);
      
      // Verificar si la página requiere login
      const currentUrl = page.url();
      log(`${SITE_NAME.toUpperCase()} CURRENT_URL: ${currentUrl}`);
      
      if (currentUrl.includes('login') || currentUrl.includes('auth') || currentUrl.includes('signin') || currentUrl.includes('sign-in')) {
        log(`${SITE_NAME.toUpperCase()} LOGIN_REQUIRED: Attempting Google login...`);
        
        // Intentar hacer login con Google
        await handleGoogleLogin(page);
        
        // Después del login exitoso, ir a la página de billing
        log(`${SITE_NAME.toUpperCase()} REDIRECTING_TO_BILLING_AFTER_LOGIN`);
        await page.goto(TARGET_URL, { 
          waitUntil: 'domcontentloaded', 
          timeout: 30000 
        });
        await page.waitForTimeout(8000);
        
      } else {
        // Si no es un problema de autenticación, reintentar con estrategia diferente
        log(`${SITE_NAME.toUpperCase()} RETRYING with different strategy...`);
        await page.goto(TARGET_URL, { 
          waitUntil: 'load', 
          timeout: 30000 
        });
        await page.waitForTimeout(8000);
      }
    }

    let html = await page.content();
    log(`${SITE_NAME.toUpperCase()} HTML content fetched (${html.length} chars)`);

    // Verificar si el HTML contiene contenido útil
    if (html.length < 1000) {
      log(`${SITE_NAME.toUpperCase()} WARNING: HTML content seems too short, might be blocked or redirected`);
    }

    // Verificar si estamos en la página correcta
    const title = await page.title();
    log(`${SITE_NAME.toUpperCase()} PAGE_TITLE: "${title}"`);

    // Verificación final: solo hacer login si realmente estamos en una página de login
    // Verificar tanto la URL como el contenido para evitar falsos positivos
    const currentUrl = page.url();
    const isOnLoginPage = currentUrl.includes('/login') || 
                          currentUrl.includes('/auth') || 
                          currentUrl.includes('/signin') || 
                          currentUrl.includes('/sign-in');
    
    const hasLoginForm = html.toLowerCase().includes('sign in') || 
                        html.toLowerCase().includes('login') || 
                        html.toLowerCase().includes('email address') ||
                        html.toLowerCase().includes('password');
    
    // Solo hacer login si estamos en una página de login Y hay un formulario de login
    if (isOnLoginPage && hasLoginForm) {
      log(`${SITE_NAME.toUpperCase()} WARNING: Still on login page despite logic - this shouldn't happen`);
      log(`${SITE_NAME.toUpperCase()} ATTEMPTING_EMERGENCY_LOGIN...`);
      
      // Intentar hacer login con Google como último recurso
      await handleGoogleLogin(page);
      
      // Después del login exitoso, recargar la página de billing
      log(`${SITE_NAME.toUpperCase()} RELOADING_BILLING_PAGE_AFTER_EMERGENCY_LOGIN`);
      await page.goto(TARGET_URL, { 
        waitUntil: 'domcontentloaded', 
        timeout: 30000 
      });
      await page.waitForTimeout(8000);
      
      // Obtener el HTML actualizado después del login
      const updatedHtml = await page.content();
      if (updatedHtml.length > html.length) {
        log(`${SITE_NAME.toUpperCase()} HTML_UPDATED_AFTER_EMERGENCY_LOGIN: Content loaded successfully`);
        html = updatedHtml;
      } else {
        throw new Error('Emergency login successful but billing page content not accessible');
      }
    } else if (hasLoginForm && !isOnLoginPage) {
      // Si hay elementos de login en el HTML pero no estamos en una página de login,
      // probablemente son elementos residuales o del layout. Continuar normalmente.
      log(`${SITE_NAME.toUpperCase()} LOGIN_ELEMENTS_DETECTED_IN_HTML_BUT_NOT_ON_LOGIN_PAGE: Continuing normally`);
      log(`${SITE_NAME.toUpperCase()} CURRENT_URL: ${currentUrl}`);
      log(`${SITE_NAME.toUpperCase()} This is normal - login elements can exist in the layout`);
    } else {
      log(`${SITE_NAME.toUpperCase()} NO_LOGIN_REQUIRED: Continuing with billing page`);
    }

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

    // Verificar si hay elementos de facturación
    const billingKeywords = ['invoice', 'billing', 'payment', 'subscription', 'receipt', 'credits', 'plan', 'invoice history'];
    const foundKeywords = billingKeywords.filter(keyword => filteredHtml.toLowerCase().includes(keyword));
    
    if (foundKeywords.length > 0) {
      log(`${SITE_NAME.toUpperCase()} BILLING_ELEMENTS_DETECTED: Found keywords: ${foundKeywords.join(', ')}`);
    } else {
      log(`${SITE_NAME.toUpperCase()} NO_BILLING_ELEMENTS: No billing keywords found in filtered HTML`);
    }

    // Verificar si hay enlaces de descarga potenciales
    const downloadKeywords = ['download', 'pdf', 'invoice', 'receipt', 'export', 'csv'];
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
        filteredHtml.includes('No transactions') ||
        filteredHtml.includes('Empty') ||
        (filteredHtml.includes('billing') && filteredHtml.length < 2000)) {
      log(`${SITE_NAME.toUpperCase()} NO_INVOICES_AVAILABLE: No invoices found or billing section is empty`);
      throw new Error('No invoices available for download. Billing section appears to be empty.');
    }

    // Llamada a IA #1 - Buscar elementos candidatos para descargar facturas
    // Específicamente buscando en la sección "invoice history"
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

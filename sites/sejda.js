const path = require('path');
const { log } = require('../utils/logger');
const { findCandidateElements, getCssSelectors } = require('../utils/selectorAI');
const { attemptDownloads } = require('../utils/download');

const SITE_NAME = 'sejda';
const TARGET_URL = 'https://www.sejda.com/account/invoices';
const LOGIN_URL = 'https://www.sejda.com/login';

// Función para manejar el login de Sejda
async function handleSejdaLogin(page) {
  log(`${SITE_NAME.toUpperCase()} HANDLING_SEJDA_LOGIN`);
  
  try {
    // Verificar que tenemos las credenciales necesarias
    const email = process.env.SEJDA_EMAIL;
    const password = process.env.SEJDA_PSW;
    
    if (!email || !password) {
      throw new Error('SEJDA_EMAIL and SEJDA_PSW environment variables are required');
    }
    
    log(`${SITE_NAME.toUpperCase()} CREDENTIALS_FOUND: ${email}`);
    
    // Ir a la página de login
    log(`${SITE_NAME.toUpperCase()} GOING_TO_LOGIN_PAGE: ${LOGIN_URL}`);
    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    log(`${SITE_NAME.toUpperCase()} LOGIN_PAGE_LOADED`);
    
    // Verificar que estamos en la página correcta
    const currentLoginUrl = page.url();
    log(`${SITE_NAME.toUpperCase()} CURRENT_LOGIN_URL: ${currentLoginUrl}`);
    
    // Esperar a que aparezcan los campos de login
    await page.waitForSelector('input[placeholder="Email"]', { timeout: 10000 });
    await page.waitForSelector('input[placeholder="Password"]', { timeout: 10000 });
    log(`${SITE_NAME.toUpperCase()} LOGIN_FORM_FOUND`);
    
    // Llenar el campo de email
    await page.fill('input[placeholder="Email"]', email);
    log(`${SITE_NAME.toUpperCase()} EMAIL_FILLED`);
    
    // Llenar el campo de contraseña
    await page.fill('input[placeholder="Password"]', password);
    log(`${SITE_NAME.toUpperCase()} PASSWORD_FILLED`);
    
    // Esperar a que aparezca el captcha de Cloudflare
    log(`${SITE_NAME.toUpperCase()} WAITING_FOR_CLOUDFLARE_CAPTCHA...`);
    await page.waitForTimeout(3000);
    
    // Buscar y hacer clic en el checkbox de "Verifica que eres un ser humano"
    try {
      const captchaSelector = 'input[type="checkbox"], .cf-checkbox, [class*="cf-"]';
      await page.waitForSelector(captchaSelector, { timeout: 10000 });
      log(`${SITE_NAME.toUpperCase()} CAPTCHA_CHECKBOX_FOUND`);
      
      // Hacer clic en el checkbox
      await page.click(captchaSelector);
      log(`${SITE_NAME.toUpperCase()} CAPTCHA_CHECKBOX_CLICKED`);
      
      // Esperar un poco para que se procese
      await page.waitForTimeout(2000);
      
    } catch (captchaError) {
      log(`${SITE_NAME.toUpperCase()} CAPTCHA_NOT_FOUND: ${captchaError.message}`);
      log(`${SITE_NAME.toUpperCase()} CONTINUING_WITHOUT_CAPTCHA...`);
    }
    
    // Buscar y hacer clic en el botón "Sign in"
    const signInButtonSelector = 'button:has-text("Sign in"), input[type="submit"], button[type="submit"]';
    await page.waitForSelector(signInButtonSelector, { timeout: 10000 });
    log(`${SITE_NAME.toUpperCase()} SIGN_IN_BUTTON_FOUND`);
    
    // Hacer clic en el botón de login
    await page.click(signInButtonSelector);
    log(`${SITE_NAME.toUpperCase()} SIGN_IN_BUTTON_CLICKED`);
    
    // Esperar a que se complete el login
    log(`${SITE_NAME.toUpperCase()} WAITING_FOR_LOGIN_COMPLETION...`);
    await page.waitForTimeout(5000);
    
    // Verificar si el login fue exitoso
    const finalUrl = page.url();
    log(`${SITE_NAME.toUpperCase()} FINAL_URL_AFTER_LOGIN: ${finalUrl}`);
    
    if (finalUrl.includes('login') || finalUrl.includes('auth')) {
      throw new Error('Sejda login failed - still on login page');
    }
    
    log(`${SITE_NAME.toUpperCase()} SEJDA_LOGIN_SUCCESSFUL`);
    return true;
    
  } catch (error) {
    log(`${SITE_NAME.toUpperCase()} SEJDA_LOGIN_ERROR: ${error.message}`);
    throw error;
  }
}

function filterHtmlForAI(html) {
  // Estrategia específica para Sejda: extraer solo las secciones relevantes de invoices
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
        lowerLine.includes('invoice') ||
        lowerLine.includes('billing') ||
        lowerLine.includes('facture') ||
        lowerLine.includes('receipt') ||
        lowerLine.includes('payment') ||
        lowerLine.includes('subscription') ||
        lowerLine.includes('history') ||
        lowerLine.includes('account') ||
        lowerLine.includes('download') ||
        lowerLine.includes('descargar') ||
        lowerLine.includes('télécharger') ||
        lowerLine.includes('pdf') ||
        lowerLine.includes('stripe.com') ||
        lowerLine.includes('pay.stripe') ||
        lowerLine.includes('sejda') ||
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
        lowerLine.includes('<ul') ||
        lowerLine.includes('<li') ||
        lowerLine.includes('</ul>') ||
        lowerLine.includes('</li>') ||
        // Mantener fechas que podrían ser de facturas
        lowerLine.match(/\d{1,2}[-\/]\d{1,2}[-\/]\d{4}/) ||
        lowerLine.match(/\d{4}[-\/]\d{1,2}[-\/]\d{1,2}/) ||
        lowerLine.match(/\w+ \d{1,2}, \d{4}/) ||
        // Mantener precios
        lowerLine.includes('$') ||
        lowerLine.includes('€') ||
        lowerLine.includes('£') ||
        lowerLine.includes('usd') ||
        lowerLine.includes('eur') ||
        lowerLine.includes('price') ||
        lowerLine.includes('amount') ||
        lowerLine.includes('total') ||
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

    // NUEVA LÓGICA: Verificar si ya estamos logueados
    log(`${SITE_NAME.toUpperCase()} CHECKING_AUTH_STATUS`);
    
    // Guardar la URL inicial antes de ir a TARGET_URL
    const initialUrl = page.url();
    log(`${SITE_NAME.toUpperCase()} INITIAL_URL: ${initialUrl}`);
    
    // Intentar ir a la página de invoices
    try {
      await page.goto(TARGET_URL, { 
        waitUntil: 'domcontentloaded', 
        timeout: 30000 
      });
      
      // Obtener la URL después de la navegación
      const finalUrl = page.url();
      log(`${SITE_NAME.toUpperCase()} FINAL_URL_AFTER_NAVIGATION: ${finalUrl}`);
      
      // Verificar si la URL cambió a LOGIN_URL o se mantuvo en TARGET_URL
      if (finalUrl === TARGET_URL || finalUrl.includes('/account/invoices')) {
        log(`${SITE_NAME.toUpperCase()} ALREADY_LOGGED_IN: URL remained on invoices page`);
        log(`${SITE_NAME.toUpperCase()} CONTINUING_WITH_INVOICES_PAGE - NO LOGIN NEEDED`);
        
        // Esperar un poco más para que cargue completamente
        await page.waitForTimeout(5000);
        
        // CONTINUAR DIRECTAMENTE CON EL PROCESO DE INVOICES
        // NO necesitamos ir a LOGIN_URL ni hacer login
        
      } else if (finalUrl.includes('/login') || finalUrl.includes('/auth') || finalUrl.includes('/signin')) {
        log(`${SITE_NAME.toUpperCase()} LOGIN_REQUIRED: URL changed to login page (${finalUrl})`);
        log(`${SITE_NAME.toUpperCase()} ATTEMPTING_SEJDA_LOGIN...`);
        
        // Intentar hacer login con credenciales del .env
        await handleSejdaLogin(page);
        
        // Después del login exitoso, ir a la página de invoices
        log(`${SITE_NAME.toUpperCase()} REDIRECTING_TO_INVOICES_AFTER_LOGIN`);
        await page.goto(TARGET_URL, { 
          waitUntil: 'domcontentloaded', 
          timeout: 30000 
        });
        await page.waitForTimeout(5000);
        
      } else {
        log(`${SITE_NAME.toUpperCase()} UNEXPECTED_REDIRECT: URL changed to ${finalUrl}`);
        log(`${SITE_NAME.toUpperCase()} CHECKING_IF_INVOICES_CONTENT_IS_AVAILABLE...`);
        
        // Verificar si el contenido de invoices está disponible en esta URL inesperada
        const currentHtml = await page.content();
        if (currentHtml.toLowerCase().includes('invoice') || 
            currentHtml.toLowerCase().includes('billing') ||
            currentHtml.toLowerCase().includes('account')) {
          log(`${SITE_NAME.toUpperCase()} INVOICES_CONTENT_FOUND_IN_UNEXPECTED_URL: Continuing...`);
          await page.waitForTimeout(5000);
        } else {
          log(`${SITE_NAME.toUpperCase()} NO_INVOICES_CONTENT_FOUND: Attempting login...`);
          await handleSejdaLogin(page);
          await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await page.waitForTimeout(5000);
        }
      }
      
    } catch (gotoError) {
      log(`${SITE_NAME.toUpperCase()} GOTO_ERROR: ${gotoError.message}`);
      
      // Verificar si la página requiere login
      const currentUrl = page.url();
      log(`${SITE_NAME.toUpperCase()} CURRENT_URL: ${currentUrl}`);
      
      if (currentUrl.includes('login') || currentUrl.includes('auth') || currentUrl.includes('signin')) {
        log(`${SITE_NAME.toUpperCase()} LOGIN_REQUIRED: Attempting Sejda login...`);
        
        // Intentar hacer login con credenciales del .env
        await handleSejdaLogin(page);
        
        // Después del login exitoso, ir a la página de invoices
        log(`${SITE_NAME.toUpperCase()} REDIRECTING_TO_INVOICES_AFTER_LOGIN`);
        await page.goto(TARGET_URL, { 
          waitUntil: 'domcontentloaded', 
          timeout: 30000 
        });
        await page.waitForTimeout(5000);
        
      } else {
        // Si no es un problema de autenticación, reintentar con estrategia diferente
        log(`${SITE_NAME.toUpperCase()} RETRYING with different strategy...`);
        await page.goto(TARGET_URL, { 
          waitUntil: 'load', 
          timeout: 30000 
        });
        await page.waitForTimeout(5000);
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

    // Verificación final: solo hacer login si realmente estamos en una página de login
    // Verificar tanto la URL como el contenido para evitar falsos positivos
    const currentUrl = page.url();
    const isOnLoginPage = currentUrl.includes('/login') || 
                          currentUrl.includes('/auth') || 
                          currentUrl.includes('/signin');
    
    const hasLoginForm = html.toLowerCase().includes('sign in') || 
                        html.toLowerCase().includes('login') || 
                        html.toLowerCase().includes('email') && html.toLowerCase().includes('password');
    
    // Solo hacer login si estamos en una página de login Y hay un formulario de login
    if (isOnLoginPage && hasLoginForm) {
      log(`${SITE_NAME.toUpperCase()} WARNING: Still on login page despite logic - this shouldn't happen`);
      log(`${SITE_NAME.toUpperCase()} ATTEMPTING_EMERGENCY_LOGIN...`);
      
      // Intentar hacer login con credenciales del .env como último recurso
      await handleSejdaLogin(page);
      
      // Después del login exitoso, recargar la página de invoices
      log(`${SITE_NAME.toUpperCase()} RELOADING_INVOICES_PAGE_AFTER_EMERGENCY_LOGIN`);
      await page.goto(TARGET_URL, { 
        waitUntil: 'domcontentloaded', 
        timeout: 30000 
      });
      await page.waitForTimeout(5000);
      
      // Obtener el HTML actualizado después del login
      const updatedHtml = await page.content();
      if (updatedHtml.length > html.length) {
        log(`${SITE_NAME.toUpperCase()} HTML_UPDATED_AFTER_EMERGENCY_LOGIN: Content loaded successfully`);
        html = updatedHtml;
      } else {
        throw new Error('Emergency login successful but invoices page content not accessible');
      }
    } else if (hasLoginForm && !isOnLoginPage) {
      // Si hay elementos de login en el HTML pero no estamos en una página de login,
      // probablemente son elementos residuales o del layout. Continuar normalmente.
      log(`${SITE_NAME.toUpperCase()} LOGIN_ELEMENTS_DETECTED_IN_HTML_BUT_NOT_ON_LOGIN_PAGE: Continuing normally`);
      log(`${SITE_NAME.toUpperCase()} CURRENT_URL: ${currentUrl}`);
      log(`${SITE_NAME.toUpperCase()} This is normal - login elements can exist in the layout`);
    } else {
      log(`${SITE_NAME.toUpperCase()} NO_LOGIN_REQUIRED: Continuing with invoices page`);
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
        filteredHtml.includes('<table><tbody></tbody></table>') ||
        (filteredHtml.includes('invoice') && filteredHtml.length < 2000)) {
      log(`${SITE_NAME.toUpperCase()} NO_INVOICES_AVAILABLE: No invoices found or billing section is empty`);
      throw new Error('No invoices available for download. Invoice section appears to be empty.');
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

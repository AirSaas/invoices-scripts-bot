const { log } = require('./logger');
const path = require('path');

async function sendEmail(browser, attachments) {
  log("GMAIL_START");
  const page = await browser.newPage();
  
  // Suppress page console logs to avoid spam in logs
  page.on('console', () => {}); // Ignore all console.log from page
  page.on('pageerror', () => {}); // Ignore page errors
  
  // Detect Gmail language
  let gmailLanguage = 'en'; // Default to English
  
  try {
    const GMAIL_COMPOSE_URL = process.env.GMAIL_COMPOSE_URL;
    const RECIPIENT_EMAIL = process.env.RECIPIENT_EMAIL;

    // NEW: First go to Gmail main to handle authentication if needed
    log("GMAIL_AUTH: Starting Gmail authentication process...");
    
    // Go to Gmail main instead of directly to compose
    const gmailMainUrl = 'https://mail.google.com';
    await page.goto(gmailMainUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    log("GMAIL_AUTH: Gmail main page loaded");
    
    // Check if we need authentication
    const currentUrl = page.url();
    log(`GMAIL_AUTH: Current URL: ${currentUrl}`);
    
    if (currentUrl.includes('accounts.google.com') || currentUrl.includes('signin') || currentUrl.includes('login')) {
      log("GMAIL_AUTH: Authentication required, handling login...");
      await handleGmailAuthentication(page);
      
      // After authentication, go to Gmail main
      await page.goto(gmailMainUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      log("GMAIL_AUTH: Redirected to Gmail main page after authentication");
      await page.waitForTimeout(3000);
    } else {
      log("GMAIL_AUTH: Already authenticated, proceeding...");
    }
    
    // Now go to compose page
    log("GMAIL_COMPOSE: Going to compose page...");
    await page.goto(GMAIL_COMPOSE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    // Detect Gmail language after compose page loads
    gmailLanguage = await detectGmailLanguage(page);
    log(`GMAIL_LANGUAGE_DETECTED: ${gmailLanguage}`);
    
    // Wait for page to load (with more generous timeout and different strategy)
    try {
      await page.waitForLoadState('domcontentloaded', { timeout: 15000 });
      log("GMAIL_PAGE_DOM_LOADED");
      
      // Wait for key Gmail elements to appear (multiple languages)
      const composeSelectors = [
        'div[role="region"][aria-label*="Mensaje"]', // Spanish
        'div[role="region"][aria-label*="Message"]', // English  
        'div[role="region"][aria-label*="message"]', // English (lowercase)
        'div[role="region"][aria-label*="Rédiger"]', // French - "Draft"
        'div[role="region"][aria-label*="Composer"]' // French - "Compose"
      ];
      
      let composeFound = false;
      for (const selector of composeSelectors) {
        try {
          await page.waitForSelector(selector, { timeout: 2000 });
          log(`GMAIL_COMPOSE_READY with selector: ${selector}`);
          composeFound = true;
          break;
        } catch (e) {
          // Continue with next selector
        }
      }
      
      if (!composeFound) {
        log("GMAIL_COMPOSE_WARNING: No compose area found with any selector");
      }
    } catch (loadError) {
      log(`GMAIL_LOAD_WARNING: ${loadError.message}`);
      // Continue anyway, it might already be loaded
      await page.waitForTimeout(2000);
    }

    // Debug: See what elements are available
    const pageTitle = await page.title();
    log(`GMAIL_PAGE_TITLE: ${pageTitle}`);

    // Fill "To" field
    await fillToField(page, RECIPIENT_EMAIL);
    
    // Fill "Subject" field
    await fillSubjectField(page);
    
    // Fill message body
    await fillBodyField(page, attachments);
    
    // Attach files
    await attachFiles(page, attachments);
    
    // Send email
    await sendEmailMessage(page);

  } catch (error) {
    log(`GMAIL_ERROR: ${error.message}`);
  } finally {
    await page.close();
  }
}

async function fillToField(page, recipientEmail) {
  // Selectores multiidioma para el campo "Para" - Priorizando francés
  const toSelectors = [
    // Francés (prioritario)
    'input[aria-label="Destinataires"]',
    'input[aria-label="À"]',
    'input[placeholder="Destinataires"]',
    'input[placeholder="À"]',
    'div[aria-label="Destinataires"]',
    'div[aria-label="À"]',
    // Inglés
    'input[aria-label="Recipients"]',
    'input[aria-label="To"]',
    'input[placeholder="Recipients"]',
    'input[placeholder="To"]',
    'div[aria-label="Recipients"]',
    'div[aria-label="To"]',
    // Español
    'input[aria-label="Destinatarios"]',
    'input[aria-label="Para"]',
    'input[placeholder="Destinatarios"]',
    'input[placeholder="Para"]',
    'div[aria-label="Destinatarios"]',
    'div[aria-label="Para"]',
    // Genéricos (solo los que funcionan)
    'input[name="to"]',
    'div[name="to"]',
    'input[role="combobox"]',
    'div[role="combobox"]'
  ];

  let toField = null;
  for (const selector of toSelectors) {
    try {
      await page.waitForSelector(selector, { timeout: 5000 });
      toField = page.locator(selector).first();
      log(`GMAIL_TO_FIELD_FOUND: ${selector}`);
      break;
    } catch (e) {
      log(`GMAIL_TO_FIELD_NOT_FOUND: ${selector}`);
    }
  }

  if (!toField) {
    log("GMAIL_TO_FIELD_NOT_FOUND: Trying alternative approach...");
    
    // Alternative approach: try to find any input field and click on it
    try {
      const anyInput = await page.locator('input, textarea, div[contenteditable="true"]').first();
      await anyInput.click();
      await page.keyboard.type(recipientEmail);
      log(`GMAIL_TO_FILLED_ALTERNATIVE: ${recipientEmail}`);
    } catch (altError) {
      throw new Error(`No se pudo encontrar el campo "Para" en Gmail: ${altError.message}`);
    }
  } else {
    // Rellenar el campo "Para"
    await toField.click();
    await toField.fill(recipientEmail);
    log(`GMAIL_TO_FILLED: ${recipientEmail}`);
  }
}

async function fillSubjectField(page) {
  // Selectores multiidioma para el campo "Asunto" - Priorizando francés
  const subjectSelectors = [
    // Francés (prioritario)
    'input[placeholder="Objet"]',
    'input[aria-label="Objet"]',
    'div[aria-label="Objet"]',
    // Inglés
    'input[placeholder="Subject"]',
    'input[aria-label="Subject"]',
    'div[aria-label="Subject"]',
    // Español
    'input[placeholder="Asunto"]',
    'input[aria-label="Asunto"]',
    'div[aria-label="Asunto"]',
    // Genéricos (solo los que funcionan)
    'input[name="subjectbox"]'
  ];

  let subjectField = null;
  for (const selector of subjectSelectors) {
    try {
      await page.waitForSelector(selector, { timeout: 5000 });
      subjectField = page.locator(selector).first();
      log(`GMAIL_SUBJECT_FIELD_FOUND: ${selector}`);
      break;
    } catch (e) {
      log(`GMAIL_SUBJECT_FIELD_NOT_FOUND: ${selector}`);
    }
  }

  if (subjectField) {
    const subject = `Invoices - ${new Date().toISOString().split("T")[0]}`;
    await subjectField.click();
    await subjectField.fill(subject);
    log(`GMAIL_SUBJECT_FILLED: ${subject}`);
  } else {
    log("GMAIL_SUBJECT_FIELD_NOT_FOUND: Subject field not found, continuing...");
  }
}

async function fillBodyField(page, attachments) {
  // Selectores multiidioma para el campo "Cuerpo del mensaje" - Priorizando francés
  const bodySelectors = [
    // Francés (prioritario)
    'div[aria-label="Corps du message"]',
    'textarea[aria-label="Corps du message"]',
    'div[aria-label="Message"]',
    'textarea[aria-label="Message"]',
    // Inglés
    'div[aria-label="Message body"]',
    'textarea[aria-label="Message body"]',
    'div[aria-label="Body"]',
    'textarea[aria-label="Body"]',
    // Español
    'div[aria-label="Cuerpo del mensaje"]',
    'textarea[aria-label="Cuerpo del mensaje"]',
    'div[aria-label="Mensaje"]',
    'textarea[aria-label="Mensaje"]',
    // Genéricos (solo los que funcionan)
    'div[role="textbox"]',
    'div[contenteditable="true"]'
  ];

  let bodyField = null;
  for (const selector of bodySelectors) {
    try {
      await page.waitForSelector(selector, { timeout: 5000 });
      bodyField = page.locator(selector).first();
      log(`GMAIL_BODY_FIELD_FOUND: ${selector}`);
      break;
    } catch (e) {
      log(`GMAIL_BODY_FIELD_NOT_FOUND: ${selector}`);
    }
  }

  if (bodyField) {
    // Generate dynamic report based on downloaded files
    const body = generateDynamicEmailBody(attachments);
    await bodyField.click();
    await bodyField.fill(body);
    log(`GMAIL_BODY_FILLED`);
  } else {
    log("GMAIL_BODY_FIELD_NOT_FOUND: Body field not found, trying alternative approach...");
    
    // Alternative approach: try to find any editable area
    try {
      const editableArea = await page.locator('div[contenteditable="true"], textarea').first();
      await editableArea.click();
      const body = generateDynamicEmailBody(attachments);
      await page.keyboard.type(body);
      log(`GMAIL_BODY_FILLED_ALTERNATIVE`);
    } catch (altError) {
      log(`GMAIL_BODY_FILLED_ALTERNATIVE_FAILED: ${altError.message}`);
    }
  }
}

async function attachFiles(page, attachments) {
  // Selectores multiidioma para adjuntar archivos - Priorizando francés
  const attachSelectors = [
    // Francés (prioritario)
    'div[data-tooltip="Joindre des fichiers"]',
    'div[aria-label="Joindre des fichiers"]',
    'div[data-tooltip="Joindre"]',
    'div[aria-label="Joindre"]',
    'div[data-tooltip*="Joindre"]',
    'div[aria-label*="Joindre"]',
    'div[data-tooltip*="fichiers"]',
    'div[aria-label*="fichiers"]',
    'div[data-tooltip*="Pièce"]',
    'div[aria-label*="Pièce"]',
    // Inglés
    'div[data-tooltip="Attach files"]',
    'div[aria-label="Attach files"]',
    'div[data-tooltip="Attach"]',
    'div[aria-label="Attach"]',
    'div[data-tooltip*="Attach"]',
    'div[aria-label*="Attach"]',
    'div[data-tooltip*="files"]',
    'div[aria-label*="files"]',
    'div[data-tooltip*="Attachment"]',
    'div[aria-label*="Attachment"]',
    // Español
    'div[data-tooltip="Adjuntar archivos"]',
    'div[aria-label="Adjuntar archivos"]',
    'div[data-tooltip="Adjuntar"]',
    'div[aria-label="Adjuntar"]',
    'div[data-tooltip*="Adjuntar"]',
    'div[aria-label*="Adjuntar"]',
    'div[data-tooltip*="archivos"]',
    'div[aria-label*="archivos"]',
    'div[data-tooltip*="Archivo"]',
    'div[aria-label*="Archivo"]',
    // Genérico (solo los que funcionan)
    'div[command="Files"]',
    'input[type="file"]'
  ];

  let attachButton = null;
  for (const selector of attachSelectors) {
    try {
      await page.waitForSelector(selector, { timeout: 5000 });
      attachButton = page.locator(selector).first();
      log(`GMAIL_ATTACH_BUTTON_FOUND: ${selector}`);
      break;
    } catch (e) {
      log(`GMAIL_ATTACH_BUTTON_NOT_FOUND: ${selector}`);
    }
  }

  if (attachButton) {
    try {
      const fileChooserPromise = page.waitForEvent("filechooser");
      await attachButton.click();
      const fileChooser = await fileChooserPromise;
      await fileChooser.setFiles(attachments);
      log("GMAIL_FILES_SELECTED");

      // Esperar a que los archivos se carguen (con timeout más generoso)
      await page.waitForTimeout(3000); // Esperar 3 segundos para que se procesen
      log("GMAIL_ATTACHMENTS_OK");
    } catch (attachError) {
      log(`GMAIL_ATTACH_ERROR: ${attachError.message}`);
    }
  }
}

async function sendEmailMessage(page) {
  // Selectores multiidioma para enviar - Priorizando francés
  const sendSelectors = [
    // Francés (prioritario)
    'div[data-tooltip="Envoyer"]',
    'div[aria-label="Envoyer"]',
    'div[data-tooltip="Envoyer ‪(Ctrl-Enter)‬"]',
    'div[aria-label="Envoyer ‪(Ctrl-Enter)‬"]',
    'div[role="button"]:has-text("Envoyer")',
    'button:has-text("Envoyer")',
    'div.T-I.J-J5-Ji.aoO.v7.T-I-atl.L3:has-text("Envoyer")',
    // Inglés
    'div[data-tooltip="Send"]',
    'div[aria-label="Send"]',
    'div[data-tooltip="Send ‪(Ctrl-Enter)‬"]',
    'div[aria-label="Send ‪(Ctrl-Enter)‬"]',
    'div[role="button"]:has-text("Send")',
    'button:has-text("Send")',
    'div.T-I.J-J5-Ji.aoO.v7.T-I-atl.L3:has-text("Send")',
    // Español
    'div[data-tooltip="Enviar"]',
    'div[aria-label="Enviar"]',
    'div[data-tooltip="Enviar ‪(Ctrl-Enter)‬"]',
    'div[aria-label="Enviar ‪(Ctrl-Enter)‬"]',
    'div[role="button"]:has-text("Enviar")',
    'button:has-text("Enviar")',
    'div.T-I.J-J5-Ji.aoO.v7.T-I-atl.L3:has-text("Enviar")',
    // Genéricos (solo los que funcionan)
    'div[role="button"][aria-label*="envoyer"]',
    'div[role="button"][aria-label*="send"]',
    'div[role="button"][aria-label*="enviar"]'
  ];

  let sendButton = null;
  for (const selector of sendSelectors) {
    try {
      await page.waitForSelector(selector, { timeout: 5000 });
      sendButton = page.locator(selector).first();
      log(`GMAIL_SEND_BUTTON_FOUND: ${selector}`);
      break;
    } catch (e) {
      log(`GMAIL_SEND_BUTTON_NOT_FOUND: ${selector}`);
    }
  }

  if (sendButton) {
    // Esperar 10 segundos antes de enviar para asegurar que todo esté listo
    log("GMAIL_WAITING_BEFORE_SEND (10 seconds)");
    await page.waitForTimeout(10000);
    
    await sendButton.click();
    log("GMAIL_SEND_CLICKED");
    
    // Verificar que el correo se envió
    await verifyEmailSent(page);
    
  } else {
    log("GMAIL_SEND_BUTTON_NOT_FOUND - Email not sent");
  }
}

async function verifyEmailSent(page) {
  try {
    // Buscar indicadores de que el correo se está enviando o se envió
    await page.waitForTimeout(3000); // Esperar 3 segundos para que procese
    
    // Verificar si hay mensajes de confirmación o error
    const confirmationSelectors = [
      // Francés (prioritario)
      'div:has-text("Message envoyé")',
      'div:has-text("Envoyé")',
      'div:has-text("Message enregistré")',
      'div:has-text("Enregistré")',
      'span:has-text("Message envoyé")',
      'span:has-text("Envoyé")',
      'span:has-text("Message enregistré")',
      'span:has-text("Enregistré")',
      'div[aria-label*="envoyé"]',
      'div[aria-label*="enregistré"]',
      'div[role="alert"]:has-text("envoyé")',
      'div[role="alert"]:has-text("enregistré")',
      // Inglés
      'div:has-text("Message sent")',
      'div:has-text("Sent")',
      'div:has-text("Message saved")',
      'div:has-text("Saved")',
      'span:has-text("Message sent")',
      'span:has-text("Sent")',
      'span:has-text("Message saved")',
      'span:has-text("Saved")',
      'div[aria-label*="sent"]',
      'div[aria-label*="saved"]',
      'div[role="alert"]:has-text("sent")',
      'div[role="alert"]:has-text("saved")',
      // Español
      'div:has-text("Mensaje enviado")',
      'div:has-text("Enviado")',
      'div:has-text("Mensaje guardado")',
      'div:has-text("Guardado")',
      'span:has-text("Mensaje enviado")',
      'span:has-text("Enviado")',
      'span:has-text("Mensaje guardado")',
      'span:has-text("Guardado")',
      'div[aria-label*="enviado"]',
      'div[aria-label*="guardado"]',
      'div[role="alert"]:has-text("enviado")',
      'div[role="alert"]:has-text("guardado")'
    ];
    
    let sentConfirmed = false;
    for (const selector of confirmationSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 2000 });
        log(`GMAIL_SEND_CONFIRMED: Found confirmation with selector "${selector}"`);
        sentConfirmed = true;
        break;
      } catch (e) {
        // Continuar con el siguiente selector
      }
    }
    
    if (!sentConfirmed) {
      log("GMAIL_SEND_WARNING: No confirmation message found, but send was attempted");
      
      // Verificar si aún estamos en la ventana de composición (lo que indicaría que no se envió)
      try {
        await page.waitForSelector('div[data-tooltip="Envoyer"]', { timeout: 2000 });
        log("GMAIL_SEND_FAILED: Still in compose window - email likely not sent");
      } catch (e) {
        log("GMAIL_SEND_UNKNOWN: Not in compose window, but no confirmation found");
      }
    }
    
    // Verificar si hay errores o diálogos
    await checkForEmailErrors(page);
    
    log("GMAIL_SEND_VERIFICATION_COMPLETE");
    
  } catch (verificationError) {
    log(`GMAIL_SEND_VERIFICATION_ERROR: ${verificationError.message}`);
  }
}

async function checkForEmailErrors(page) {
  const errorSelectors = [
    // Francés (prioritario)
    'div[aria-label*="erreur"]',
    'div[aria-label*="Erreur"]',
    'div:has-text("Erreur")',
    'div:has-text("erreur")',
    // Inglés
    'div[aria-label*="error"]',
    'div[aria-label*="Error"]',
    'div:has-text("Error")',
    'div:has-text("error")',
    // Español
    'div[aria-label*="error"]',
    'div[aria-label*="Error"]',
    'div:has-text("Error")',
    'div:has-text("error")',
    // Genérico
    'div[role="alertdialog"]'
  ];
  
  // Comprobar si hay mensajes de error en la interfaz de Gmail tras intentar enviar el correo
  for (const selector of errorSelectors) {
    try {
      await page.waitForSelector(selector, { timeout: 1000 });
      log(`GMAIL_SEND_ERROR: Error dialog found with selector "${selector}"`);
      break; // Si se encuentra un error, no es necesario seguir buscando
    } catch (e) {
      // No se encontró un error con este selector, continuar con el siguiente
    }
  }
}

// NEW FUNCTION: Generate dynamic email body based on downloaded files
function generateDynamicEmailBody(attachments) {
  // Define all expected sites
  const expectedSites = [
    { name: 'Dropcontact', folder: 'dropcontact', displayName: 'Dropcontact' },
    { name: 'Fullenrich', folder: 'fullenrich', displayName: 'Fullenrich' },
    { name: 'Hyperline', folder: 'hyperline', displayName: 'Hyperline' },
    { name: 'BetterContact', folder: 'bettercontact', displayName: 'BetterContact' },
    { name: 'Sejda', folder: 'sejda', displayName: 'Sejda' },
    { name: 'Dedupe', folder: 'dedupe', displayName: 'Dedupe' }
  ];

  // Analyze downloaded files by site
  const siteAnalysis = expectedSites.map(site => {
    const siteFiles = attachments.filter(file => 
      file.includes(`/factures/${site.folder}/`) || 
      file.includes(`\\factures\\${site.folder}\\`)
    );
    
    return {
      ...site,
      files: siteFiles,
      hasFiles: siteFiles.length > 0,
      fileCount: siteFiles.length
    };
  });

  // Generate email body
  let body = `Bot Execution Summary\n\n`;
  
  // Attached files section
  if (attachments.length > 0) {
    body += `📎 Attached Files (${attachments.length} total):\n`;
    attachments.forEach((file, index) => {
      const fileName = path.basename(file);
      body += `${index + 1}. ${fileName}\n`;
    });
    body += '\n';
  } else {
    body += `📎 No files were downloaded during this execution.\n\n`;
  }

  // Site status report
  body += `📊 Site Status Report:\n`;
  body += `=====================\n`;
  
  siteAnalysis.forEach(site => {
    if (site.hasFiles) {
      body += `✅ ${site.displayName}: ${site.fileCount} invoice(s) downloaded\n`;
    } else {
      body += `❌ ${site.displayName}: No invoices available or download failed\n`;
    }
  });

  body += `\n`;
  
  // Summary
  const successfulSites = siteAnalysis.filter(site => site.hasFiles);
  const failedSites = siteAnalysis.filter(site => !site.hasFiles);
  
  body += `📈 Summary:\n`;
  body += `- Successful downloads: ${successfulSites.length}/${expectedSites.length} sites\n`;
  body += `- Failed downloads: ${failedSites.length}/${expectedSites.length} sites\n`;
  body += `- Total files: ${attachments.length}\n`;
  
  // Add timestamp
  const timestamp = new Date().toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short'
  });
  
  body += `\n⏰ Execution completed: ${timestamp}\n`;
  
  // Add note about failed sites
  if (failedSites.length > 0) {
    body += `\n⚠️  Note: Sites with failed downloads may require manual authentication or have no invoices available.\n`;
  }

  return body;
}

// NEW FUNCTION: Handle Gmail authentication
async function handleGmailAuthentication(page) {
  log("GMAIL_AUTH: Starting Gmail authentication...");
  
  try {
    // Wait for authentication page to load
    await page.waitForTimeout(3000);
    
    // Check if we're on Google account selection page
    const currentUrl = page.url();
    log(`GMAIL_AUTH: Current URL during authentication: ${currentUrl}`);
    
    if (currentUrl.includes('accounts.google.com')) {
      log("GMAIL_AUTH: Google account selection page detected");
      
      // If there are multiple accounts, search and select the specific account
      const targetEmail = process.env.GMAIL_EMAIL;
      if (targetEmail) {
        log(`GMAIL_AUTH: Looking for account: ${targetEmail}`);
        
        // Wait for account options to appear
        await page.waitForTimeout(2000);
        
        // Search for specific account by email using multiple selectors
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
            log(`GMAIL_AUTH: Target account found with selector: ${selector}`);
            await page.click(selector);
            log("GMAIL_AUTH: Target account selected");
            accountFound = true;
            break;
          } catch (selectorError) {
            log(`GMAIL_AUTH: Selector ${selector} failed: ${selectorError.message}`);
            continue;
          }
        }
        
        if (!accountFound) {
          log(`GMAIL_AUTH: Target account not found: ${targetEmail}`);
          log("GMAIL_AUTH: Continuing with first available account");
          
          // Try to click on first available account
          try {
            const firstAccountSelector = 'div[role="button"], button, div[data-email], div[aria-label]';
            await page.waitForSelector(firstAccountSelector, { timeout: 5000 });
            await page.click(firstAccountSelector);
            log("GMAIL_AUTH: First available account selected");
          } catch (firstAccountError) {
            log(`GMAIL_AUTH: First account selection failed: ${firstAccountError.message}`);
          }
        }
      }
      
      // Wait for account selection to complete
      await page.waitForTimeout(3000);
      
      // Check if there's a "Next" or "Continue" button after selecting account
      try {
        const nextButtonSelector = 'button:has-text("Next"), button:has-text("Continue"), button:has-text("Siguiente"), button:has-text("Continuar")';
        await page.waitForSelector(nextButtonSelector, { timeout: 3000 });
        log("GMAIL_AUTH: Next button found, clicking...");
        await page.click(nextButtonSelector);
        await page.waitForTimeout(3000);
      } catch (nextButtonError) {
        log(`GMAIL_AUTH: No next button: ${nextButtonError.message}`);
      }
      
      // NEW: Handle Gmail password field if it appears
      log("GMAIL_AUTH: Checking for password field...");
      
      try {
        // Wait for password field to appear
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
            log(`GMAIL_AUTH: Password field found with selector: ${selector}`);
            
            // Get password from environment variable
            const password = process.env.GMAIL_PSW;
            if (!password) {
              log("GMAIL_AUTH: WARNING: GMAIL_PSW environment variable not set");
              throw new Error('GMAIL_PSW environment variable is required for password field');
            }
            
            // Clear field and type password
            await page.fill(selector, '');
            await page.type(selector, password, { delay: 100 });
            log("GMAIL_AUTH: Password entered successfully");
            
            passwordFieldFound = true;
            break;
            
          } catch (selectorError) {
            log(`GMAIL_AUTH: Password selector ${selector} failed: ${selectorError.message}`);
            continue;
          }
        }
        
        if (passwordFieldFound) {
          // Search and click "Next" or "Continue" button after password
          log("GMAIL_AUTH: Looking for next button after password...");
          
          const nextAfterPasswordSelectors = [
            'button:has-text("Next")',
            'button:has-text("Continue")',
            'button:has-text("Siguiente")',
            'button:has-text("Continuar")',
            'button[type="submit"]',
            'input[type="submit"]',
            'div[role="button"]:has-text("Next")',
            'div[role="button"]:has-text("Continue")'
          ];
          
          let nextButtonClicked = false;
          for (const selector of nextAfterPasswordSelectors) {
            try {
              await page.waitForSelector(selector, { timeout: 3000 });
              log(`GMAIL_AUTH: Next button after password found: ${selector}`);
              await page.click(selector);
              log("GMAIL_AUTH: Next button after password clicked");
              nextButtonClicked = true;
              break;
            } catch (selectorError) {
              log(`GMAIL_AUTH: Next button selector ${selector} failed: ${selectorError.message}`);
              continue;
            }
          }
          
          if (!nextButtonClicked) {
            log("GMAIL_AUTH: WARNING: Could not find next button after password, continuing...");
          }
          
          // Wait for password to be processed
          await page.waitForTimeout(5000);
          
        } else {
          log("GMAIL_AUTH: No password field found, continuing with account selection only");
        }
        
      } catch (passwordError) {
        log(`GMAIL_AUTH: Password handling error: ${passwordError.message}`);
        // Continue without handling password if there's an error
      }
      
    } else {
      log("GMAIL_AUTH: Not on Google accounts page, may already be authenticated");
    }
    
    // Wait for authentication to complete
    await page.waitForTimeout(5000);
    
    // Verify if authentication was successful
    const finalUrl = page.url();
    log(`GMAIL_AUTH: Final URL after authentication: ${finalUrl}`);
    
    if (finalUrl.includes('accounts.google.com') || finalUrl.includes('signin') || finalUrl.includes('login')) {
      throw new Error('Gmail authentication failed - still on login or Google page');
    }
    
    log("GMAIL_AUTH: Gmail authentication successful");
    return true;
    
  } catch (error) {
    log(`GMAIL_AUTH: Authentication error: ${error.message}`);
    throw error;
  }
}

// NEW FUNCTION: Detect Gmail language
async function detectGmailLanguage(page) {
  try {
    await page.waitForTimeout(2000); // Wait for page to load
    
    // Get page content to analyze language
    const pageContent = await page.content();
    const pageTitle = await page.title();
    
    log(`GMAIL_DETECTION: Page title: ${pageTitle}`);
    
    // Check for language indicators in content
    if (pageContent.includes('Nouveau message') || 
        pageContent.includes('Destinataires') || 
        pageContent.includes('Objet') ||
        pageContent.includes('Envoyer')) {
      log("GMAIL_DETECTION: French language detected");
      return 'fr';
    } else if (pageContent.includes('Nuevo mensaje') || 
               pageContent.includes('Destinatarios') || 
               pageContent.includes('Asunto') ||
               pageContent.includes('Enviar')) {
      log("GMAIL_DETECTION: Spanish language detected");
      return 'es';
    } else if (pageContent.includes('New message') || 
               pageContent.includes('Recipients') || 
               pageContent.includes('Subject') ||
               pageContent.includes('Send')) {
      log("GMAIL_DETECTION: English language detected");
      return 'en';
    } else {
      log("GMAIL_DETECTION: Language not detected, defaulting to English");
      return 'en';
    }
  } catch (error) {
    log(`GMAIL_DETECTION_ERROR: ${error.message}`);
    return 'en'; // Default to English on error
  }
}

module.exports = { sendEmail };

const { log } = require('./logger');
const path = require('path');

async function sendEmail(browser, attachments) {
  log("GMAIL_START");
  const page = await browser.newPage();
  
  // Suppress page console logs to avoid spam in logs
  page.on('console', () => {}); // Ignore all console.log from page
  page.on('pageerror', () => {}); // Ignore page errors
  
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
  // Selectores basados en el HTML real proporcionado
  const toSelectors = [
    'input[aria-label="Destinatarios en Para"]', // Selector exacto del HTML
    'input.agP.aFw', // Clase exacta del input
    'input[peoplekit-id="BbVjBd"]', // ID específico
    'textarea[name="to"]', // Selector clásico por si acaso
    'input[name="to"]',
    'div[name="to"]',
    'div[aria-label*="Para"]'
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
    throw new Error('No se pudo encontrar el campo "Para" en Gmail');
  }

  // Rellenar el campo "Para"
  await toField.click();
  await toField.fill(recipientEmail);
  log(`GMAIL_TO_FILLED: ${recipientEmail}`);
}

async function fillSubjectField(page) {
  // Selectores para el asunto basados en el HTML real
  const subjectSelectors = [
    'input[name="subjectbox"]', // Selector exacto del HTML
    'input.aoT', // Clase exacta del input de asunto
    'input[placeholder="Asunto"]', // Placeholder exacto
    'input[aria-label="Asunto"]', // Aria-label exacto
    'input[aria-label*="Subject"]'
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
  }
}

async function fillBodyField(page, attachments) {
  // Selectores para el cuerpo del mensaje basados en el HTML real
  const bodySelectors = [
    'div[aria-label="Cuerpo del mensaje"]', // Aria-label exacto
    'div.Am.aiL.Al.editable.LW-avf.tS-tW', // Clases exactas del div editable
    'textarea[aria-label="Cuerpo del mensaje"]', // El textarea también
    'textarea.Ak.aiL', // Clases del textarea
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
  }
}

async function attachFiles(page, attachments) {
  // Selectores para adjuntar archivos basados en el HTML real
  const attachSelectors = [
    // Español
    'div[data-tooltip="Adjuntar archivos"]', // Tooltip exacto
    'div[aria-label="Adjuntar archivos"]', // Aria-label exacto
    'div[command="Files"]', // Command exacto del HTML
    'input[type="file"][name="Filedata"]', // Input file específico
    // Inglés
    'div[data-tooltip*="Attach"]',
    'div[aria-label*="Attach"]',
    'div[data-tooltip*="files"]',
    'div[aria-label*="files"]',
    // Francés
    'div[data-tooltip*="Joindre"]',
    'div[aria-label*="Joindre"]',
    'div[data-tooltip*="fichiers"]',
    'div[aria-label*="fichiers"]',
    'div[data-tooltip*="Pièce"]',
    'div[aria-label*="Pièce"]',
    // Genérico
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
  // Selectores para enviar basados en el HTML real
  const sendSelectors = [
    // Español
    'div[data-tooltip="Enviar"]', // Tooltip exacto
    'div[aria-label="Enviar"]', // Aria-label exacto
    'div.T-I.J-J5-Ji.aoO.v7.T-I-atl.L3:has-text("Enviar")', // Clases exactas del botón
    'div[role="button"]:has-text("Enviar")',
    // Inglés
    'div[data-tooltip="Send"]',
    'div[aria-label="Send"]',
    'div[aria-label*="Send"]',
    'div[role="button"]:has-text("Send")',
    'div.T-I.J-J5-Ji.aoO.v7.T-I-atl.L3:has-text("Send")',
    // Francés
    'div[data-tooltip="Envoyer"]',
    'div[aria-label="Envoyer"]',
    'div[role="button"]:has-text("Envoyer")',
    'div.T-I.J-J5-Ji.aoO.v7.T-I-atl.L3:has-text("Envoyer")'
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
      // Español
      'div:has-text("Mensaje enviado")',
      'div:has-text("Enviado")',
      'span:has-text("Mensaje enviado")',
      'span:has-text("Enviado")',
      'div[aria-label*="enviado"]',
      'div[role="alert"]:has-text("enviado")',
      // Inglés
      'div:has-text("Message sent")',
      'div:has-text("Sent")',
      'span:has-text("Message sent")',
      'span:has-text("Sent")',
      'div[aria-label*="sent"]',
      'div[role="alert"]:has-text("sent")',
      // Francés
      'div:has-text("Message envoyé")',
      'div:has-text("Envoyé")',
      'span:has-text("Message envoyé")',
      'span:has-text("Envoyé")',
      'div[aria-label*="envoyé"]',
      'div[role="alert"]:has-text("envoyé")'
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
        await page.waitForSelector('div[data-tooltip="Enviar"]', { timeout: 2000 });
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
    // Genérico
    'div[role="alertdialog"]',
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
    // Francés
    'div[aria-label*="erreur"]',
    'div[aria-label*="Erreur"]',
    'div:has-text("Erreur")',
    'div:has-text("erreur")'
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

module.exports = { sendEmail };

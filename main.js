require('dotenv').config();
const { chromium } = require("playwright");
const { log } = require("./utils/logger");
//const sejdaBot = require("./sites/sejda");
//const tmobsBot = require('./sites/tmobs');
const dropcontactBot = require('./sites/dropcontact');
const fullenrichBot = require('./sites/fullenrich'); 

const path = require("path");

const GMAIL_COMPOSE_URL = process.env.GMAIL_COMPOSE_URL;
const RECIPIENT_EMAIL = process.env.RECIPIENT_EMAIL;

async function sendEmail(browser, attachments) {
  log("GMAIL_START");
  const page = await browser.newPage();
  
  // Suprimir logs de console de la página para evitar spam en logs
  page.on('console', () => {}); // Ignorar todos los console.log de la página
  page.on('pageerror', () => {}); // Ignorar errores de la página
  
  try {
    await page.goto(GMAIL_COMPOSE_URL);
    
    // Esperar a que la página cargue (con timeout más generoso y estrategia diferente)
    try {
      await page.waitForLoadState('domcontentloaded', { timeout: 15000 });
      log("GMAIL_PAGE_DOM_LOADED");
      
      // Esperar a que aparezca algún elemento clave de Gmail (múltiples idiomas)
      const composeSelectors = [
        'div[role="region"][aria-label*="Mensaje"]', // Español
        'div[role="region"][aria-label*="Message"]', // Inglés  
        'div[role="region"][aria-label*="message"]', // Inglés (minúscula)
        'div[role="region"][aria-label*="Rédiger"]', // Francés - "Redactar"
        'div[role="region"][aria-label*="Composer"]' // Francés - "Componer"
      ];
      
      let composeFound = false;
      for (const selector of composeSelectors) {
        try {
          await page.waitForSelector(selector, { timeout: 2000 });
          log(`GMAIL_COMPOSE_READY with selector: ${selector}`);
          composeFound = true;
          break;
        } catch (e) {
          // Continuar con el siguiente selector
        }
      }
      
      if (!composeFound) {
        log("GMAIL_COMPOSE_WARNING: No compose area found with any selector");
      }
    } catch (loadError) {
      log(`GMAIL_LOAD_WARNING: ${loadError.message}`);
      // Continuar de todas formas, puede que ya esté cargado
      await page.waitForTimeout(2000);
    }

    // Debug: Ver qué elementos están disponibles
    const pageTitle = await page.title();
    log(`GMAIL_PAGE_TITLE: ${pageTitle}`);

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
    await toField.fill(RECIPIENT_EMAIL);
    log(`GMAIL_TO_FILLED: ${RECIPIENT_EMAIL}`);

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
      const body = `Resumen de la ejecución de bots de descarga.\n\nArchivos adjuntos:\n${attachments
        .map((p) => path.basename(p))
        .join("\n")}\n\nIncluye:\n- Facturas de Dropcontact\n- Facturas de Fullenrich`;
      await bodyField.click();
      await bodyField.fill(body);
      log(`GMAIL_BODY_FILLED`);
    }

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
      
      // Esperar a que el correo se procese y verificar que se envió
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
        
        log("GMAIL_SEND_VERIFICATION_COMPLETE");
        
      } catch (verificationError) {
        log(`GMAIL_SEND_VERIFICATION_ERROR: ${verificationError.message}`);
      }
      
    } else {
      log("GMAIL_SEND_BUTTON_NOT_FOUND - Email not sent");
    }
  } catch (error) {
    log(`GMAIL_ERROR: ${error.message}`);
  } finally {
    await page.close();
  }
}

(async () => {
  // Usar el perfil real de Google Chrome del usuario
  // Esto permitirá usar todas las sesiones ya iniciadas (Gmail, etc.)
  const userDataDir = path.join(process.env.HOME, 'Library', 'Application Support', 'Google', 'Chrome', 'Default');
  
  log(`===== STARTING =====`);
  log(`Using Chrome profile: ${userDataDir}`);
  
  let browser;
  try {
    browser = await chromium.launchPersistentContext(userDataDir, {
      channel: "chrome",
      headless: false, // Inicia en modo no headless para ver el progreso
      args: [
        "--disable-blink-features=AutomationControlled",
        "--disable-web-security", // Puede ayudar con algunos sitios
        "--disable-features=VizDisplayCompositor", // Puede mejorar la compatibilidad
        "--no-first-run", // Evita el diálogo de primera ejecución
        "--no-default-browser-check", // Evita el check de navegador por defecto
        "--disable-default-apps" // Desactiva aplicaciones por defecto
      ],
      // Configurar para evitar capturar logs de la página
      ignoreDefaultArgs: ['--enable-logging'],
      devtools: false,
      // Usar las extensiones y configuraciones existentes
      acceptDownloads: true,
      // Configurar para manejar múltiples idiomas (español, inglés, francés)
      locale: 'es-ES',
      extraHTTPHeaders: {
        'Accept-Language': 'es-ES,es;q=0.9,en-US;q=0.8,en;q=0.7,fr-FR;q=0.6,fr;q=0.5'
      }
    });

    let allDownloadedFiles = [];

    // Ejecutar el bot de T-Mobs
    //const tmobsFiles = await tmobsBot.run(browser);
    //allDownloadedFiles.push(...tmobsFiles);

    // Ejecutar el bot de Dropcontact
    const dropcontactFiles = await dropcontactBot.run(browser);
    allDownloadedFiles.push(...dropcontactFiles);

    // Ejecutar el bot de Fullenrich
    const fullenrichFiles = await fullenrichBot.run(browser);
    allDownloadedFiles.push(...fullenrichFiles);

    // Ejecutar el bot de Sejda (comentado por ahora)
    //const sejdaFiles = await sejdaBot.run(browser);
    //allDownloadedFiles.push(...sejdaFiles);

    // Enviar el correo electrónico solo si hay archivos descargados
    if (allDownloadedFiles.length > 0) {
      log(`Sending email with ${allDownloadedFiles.length} files: ${allDownloadedFiles.map(f => path.basename(f)).join(', ')}`);
      await sendEmail(browser, allDownloadedFiles);
    } else {
      log("No files to email.");
    }

  } catch (error) {
    log(`ERROR GENERAL: ${error.message}`);
    if (error.message.includes('Profile directory is in use')) {
      log('ERROR: El perfil de Chrome está en uso. Cierra Google Chrome e inténtalo de nuevo.');
    }
  } finally {
    if (browser) {
      await browser.close();
    }
    log("ALL_DONE");
  }
})();

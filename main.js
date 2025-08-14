require('dotenv').config();
const { log } = require('./utils/logger');
const { createBrowser } = require('./utils/browserConfig');
const { runAllScrapers } = require('./utils/scraperRunner');
const { sendEmail } = require('./utils/emailSender');

async function main() {
  log("===== INVOICES BOT STARTED =====");
  
  let browser;
  try {
    // Crear y configurar el navegador
    browser = await createBrowser();
    
    // Ejecutar todos los scrapers
    const allDownloadedFiles = await runAllScrapers(browser);
    
    // Enviar correo electrónico si hay archivos descargados
    if (allDownloadedFiles.length > 0) {
      log("===== SENDING EMAIL =====");
      log(`Sending email with ${allDownloadedFiles.length} files`);
      await sendEmail(browser, allDownloadedFiles);
      log("===== EMAIL SENT =====");
    } else {
      log("===== NO FILES TO EMAIL =====");
    }

  } catch (error) {
    log(`===== GENERAL ERROR =====`);
    log(`ERROR: ${error.message}`);
    
    if (error.message.includes('Profile directory is in use')) {
      log('SOLUTION: Close Google Chrome and try again.');
    }
  } finally {
    if (browser) {
      await browser.close();
      log("===== BROWSER CLOSED =====");
    }
    log("===== INVOICES BOT FINISHED =====");
  }
}

// Ejecutar la función principal
main().catch(error => {
  log(`FATAL ERROR: ${error.message}`);
  process.exit(1);
});

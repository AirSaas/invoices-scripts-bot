const { chromium } = require("playwright");
const path = require("path");
const { log } = require("./logger");

async function createBrowser() {
  // Usar el perfil real de Google Chrome del usuario
  // Esto permitirá usar todas las sesiones ya iniciadas (Gmail, etc.)
  const userDataDir = path.join(process.env.HOME, 'Library', 'Application Support', 'Google', 'Chrome', 'Default');
  
  log(`Using Chrome profile: ${userDataDir}`);
  
  const browser = await chromium.launchPersistentContext(userDataDir, {
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

  return browser;
}

module.exports = { createBrowser };

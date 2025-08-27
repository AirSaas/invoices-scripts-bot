const fs = require('fs');
const path = require('path');

// Ensure logs directory exists
const logsDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const logFilePath = path.join(logsDir, `log-${new Date().toISOString().split('T')[0]}.txt`);

function log(message) {
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const logMessage = `[${timestamp}] ${message}\n`;
  console.log(logMessage.trim());
  
  try {
    fs.appendFileSync(logFilePath, logMessage, 'utf8');
  } catch (error) {
    // Fallback: if file writing fails, just log to console
    console.error(`[LOGGER_ERROR] Failed to write to log file: ${error.message}`);
  }
}

module.exports = { log };
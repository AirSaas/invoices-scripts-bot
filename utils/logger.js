const fs = require('fs');
const path = require('path');

const logFilePath = path.join(__dirname, '..', 'logs', `log-${new Date().toISOString().split('T')[0]}.txt`);

function log(message) {
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const logMessage = `[${timestamp}] ${message}\n`;
  console.log(logMessage.trim());
  fs.appendFileSync(logFilePath, logMessage, 'utf8');
}

module.exports = { log };
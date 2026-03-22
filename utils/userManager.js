const readline = require('readline');
const { log } = require('./logger');
const { USERS } = require('../users.config');

const USER_KEYS = Object.keys(USERS);

/**
 * Ask a question in the terminal and return the user's answer.
 */
function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Show interactive user selection menu.
 * @returns {string} Selected user key
 */
async function showUserMenu() {
  log('');
  log('=== User Selection ===');
  USER_KEYS.forEach((key, i) => {
    const u = USERS[key];
    const sitesInfo = u.sites.length > 0 ? u.sites.join(', ') : 'no sites configured';
    log(`  ${i + 1}. ${u.displayName} (${sitesInfo})`);
  });
  log(`  0. Exit`);
  log('');

  while (true) {
    const answer = await ask('For whom? (number): ');
    const num = parseInt(answer, 10);

    if (num === 0) {
      log('Exiting.');
      process.exit(0);
    }

    if (num >= 1 && num <= USER_KEYS.length) {
      const selected = USER_KEYS[num - 1];
      log(`USER_MANAGER: Selected user → ${USERS[selected].displayName}`);
      return selected;
    }

    log('Invalid selection, try again.');
  }
}

/**
 * Select user from CLI args or interactive menu.
 * Tries to match the first word of rawArgs against user keys (case-insensitive).
 *
 * @param {string} rawArgs - Raw CLI arguments string
 * @returns {{ user: string, remainingArgs: string }}
 */
async function selectUser(rawArgs) {
  if (rawArgs && rawArgs.trim()) {
    const parts = rawArgs.trim().split(/\s+/);
    const firstWord = parts[0].toLowerCase();

    // Check if first word matches a user key or display name
    const matchedKey = USER_KEYS.find(key =>
      key === firstWord || USERS[key].displayName.toLowerCase() === firstWord
    );

    if (matchedKey) {
      log(`USER_MANAGER: User from CLI → ${USERS[matchedKey].displayName}`);
      return {
        user: matchedKey,
        remainingArgs: parts.slice(1).join(' '),
      };
    }
  }

  // No user in CLI args — show interactive menu
  const user = await showUserMenu();
  return { user, remainingArgs: rawArgs || '' };
}

/**
 * Get config for a user.
 * @param {string} userName - User key
 * @returns {{ displayName: string, sites: string[] }}
 */
function getUserConfig(userName) {
  const config = USERS[userName];
  if (!config) {
    throw new Error(`Unknown user: "${userName}". Available: ${USER_KEYS.join(', ')}`);
  }
  return config;
}

/**
 * Get the list of sites for a user.
 * @param {string} userName - User key
 * @returns {string[]}
 */
function getAvailableSites(userName) {
  return getUserConfig(userName).sites;
}

module.exports = { selectUser, getUserConfig, getAvailableSites, USER_KEYS };

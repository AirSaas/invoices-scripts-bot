const fs = require('fs');
const path = require('path');
const { log } = require('./logger');

class FolderManager {
  constructor() {
    this.projectRoot = path.join(__dirname, '..');
    this.requiredFolders = [
      'logs',
      'factures',
      'factures/dropcontact',
      'factures/fullenrich',
      'factures/hyperline',
      'factures/bettercontact',
      'factures/sejda',
      'factures/dedupe',
      'user-data'
    ];
  }

  // Initialize all required folders
  async initializeFolders() {
    log('FOLDER_MANAGER: Starting folder initialization...');
    
    try {
      for (const folder of this.requiredFolders) {
        await this.ensureFolderExists(folder);
      }
      
      log('FOLDER_MANAGER: All required folders initialized successfully');
      return true;
    } catch (error) {
      log(`FOLDER_MANAGER_ERROR: Failed to initialize folders: ${error.message}`);
      throw error;
    }
  }

  // Ensure a specific folder exists, create if it doesn't
  async ensureFolderExists(folderPath) {
    const fullPath = path.join(this.projectRoot, folderPath);
    
    try {
      if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
        log(`FOLDER_MANAGER: Created folder: ${folderPath}`);
      } else {
        log(`FOLDER_MANAGER: Folder already exists: ${folderPath}`);
      }
      return fullPath;
    } catch (error) {
      log(`FOLDER_MANAGER_ERROR: Failed to create folder ${folderPath}: ${error.message}`);
      throw error;
    }
  }

  // Get the full path for a specific folder
  getFolderPath(folderName) {
    return path.join(this.projectRoot, folderName);
  }

  // Check if all required folders exist
  checkFoldersExist() {
    const missingFolders = [];
    
    for (const folder of this.requiredFolders) {
      const fullPath = path.join(this.projectRoot, folder);
      if (!fs.existsSync(fullPath)) {
        missingFolders.push(folder);
      }
    }
    
    return {
      allExist: missingFolders.length === 0,
      missingFolders
    };
  }

  // Get folder statistics
  getFolderStats() {
    const stats = {};
    
    for (const folder of this.requiredFolders) {
      const fullPath = path.join(this.projectRoot, folder);
      try {
        if (fs.existsSync(fullPath)) {
          const files = fs.readdirSync(fullPath);
          stats[folder] = {
            exists: true,
            fileCount: files.length,
            files: files.filter(file => !file.startsWith('.')) // Exclude hidden files
          };
        } else {
          stats[folder] = {
            exists: false,
            fileCount: 0,
            files: []
          };
        }
      } catch (error) {
        stats[folder] = {
          exists: false,
          fileCount: 0,
          files: [],
          error: error.message
        };
      }
    }
    
    return stats;
  }
}

module.exports = FolderManager;

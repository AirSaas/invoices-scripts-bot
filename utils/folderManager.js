const fs = require('fs');
const path = require('path');
const { log } = require('./logger');

class FolderManager {
  /**
   * @param {string} userName - User key (e.g. 'bertran')
   * @param {string[]} userSites - Sites for this user
   */
  constructor(userName, userSites = []) {
    this.projectRoot = path.join(__dirname, '..');
    this.userName = userName;
    this.sites = userSites;
    // Generate unique run folder: factures/{user}/YYYY-MM-DD_HHhMM/
    const now = new Date();
    const date = now.toISOString().slice(0, 10);
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    this.userFolder = `factures/${userName}`;
    this.runFolder = `${this.userFolder}/${date}_${hours}h${minutes}`;
    this.requiredFolders = [
      'logs',
      'factures',
      this.userFolder,
      this.runFolder,
      ...this.sites.map(site => `${this.runFolder}/${site}`)
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

  // Get the download path for a site in the current run
  getSiteDownloadPath(siteName) {
    return path.join(this.projectRoot, this.runFolder, siteName);
  }

  // Get the current run folder name
  getRunFolder() {
    return this.runFolder;
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

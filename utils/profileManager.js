const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { log } = require('./logger');

class ProfileManager {
  constructor() {
    this.profilesDir = path.join(__dirname, '..', 'user-data');
    this.chromeProfilesDir = path.join(process.env.HOME, 'Library', 'Application Support', 'Google', 'Chrome');
  }

  // Detect existing user profiles
  async detectExistingProfiles() {
    const profiles = [];
    
    try {
      // Only detect real Chrome user profiles
      if (fs.existsSync(this.chromeProfilesDir)) {
        const chromeProfiles = fs.readdirSync(this.chromeProfilesDir, { withFileTypes: true })
          .filter(dirent => dirent.isDirectory())
          .filter(dirent => this.isValidChromeProfile(dirent.name))
          .map(dirent => ({
            name: dirent.name,
            path: path.join(this.chromeProfilesDir, dirent.name),
            type: 'chrome',
            description: `Chrome Profile: ${dirent.name}`
          }));
        profiles.push(...chromeProfiles);
      }

      // If no Chrome profiles, show error message
      if (profiles.length === 0) {
        log('❌ No valid Chrome profiles found');
        log('💡 Make sure you have at least one Chrome profile configured');
        process.exit(1);
      }

    } catch (error) {
      log(`Error detecting profiles: ${error.message}`);
    }

    return profiles;
  }

  // Verify if it's a valid Chrome profile
  isValidChromeProfile(profileName) {
    // Exclude Chrome system folders
    const systemFolders = [
      'System Profile', 'Guest Profile', 'Crashpad', 'BrowserMetrics',
      'GrShaderCache', 'GraphiteDawnCache', 'ShaderCache', 'Safe Browsing',
      'extensions_crx_cache', 'component_crx_cache', 'optimization_guide_model_store',
      'segmentation_platform', 'NativeMessagingHosts', 'MEIPreload',
      'FileTypePolicies', 'FirstPartySetsPreloaded', 'OnDeviceHeadSuggestModel',
      'OpenCookieDatabase', 'OptimizationHints', 'OriginTrials', 'PKIMetadata',
      'PrivacySandboxAttestationsPreloaded', 'ProbabilisticRevealTokenRegistry',
      'RecoveryImproved', 'SSLErrorAssistant', 'SafetyTips', 'Subresource Filter',
      'TpcdMetadata', 'TrustTokenKeyCommitments', 'Webstore Downloads',
      'WidevineCdm', 'ZxcvbnData', 'download_cache', 'AmountExtractionHeuristicRegexes',
      'AutofillStates', 'CertificateRevocation', 'CookieReadinessList',
      'Crowd Deny', 'DeferredBrowserMetrics'
    ];
    
    // Only include profiles that are NOT system folders
    return !systemFolders.includes(profileName);
  }

  // Show interactive menu
  async showProfileMenu() {
    const profiles = await this.detectExistingProfiles();
    
    log('\n🎯 CHROME PROFILE SELECTION');
    log('=====================================\n');

    // Show available profiles
    profiles.forEach((profile, index) => {
      log(`${index + 1}. 🌐 ${profile.description}`);
    });

    log('\n0. 🚪 Exit');
    log('');

    // Create read interface
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return new Promise((resolve, reject) => {
      const askProfile = () => {
        rl.question('👉 Select the number of the profile you want to use: ', (answer) => {
          const choice = parseInt(answer);
          
          if (choice === 0) {
            log('👋 Goodbye!');
            rl.close();
            process.exit(0);
          }
          
          if (choice >= 1 && choice <= profiles.length) {
            const selectedProfile = profiles[choice - 1];
            log(`\n✅ Profile selected: ${selectedProfile.description}`);
            log(`📍 Path: ${selectedProfile.path}`);
            rl.close();
            resolve(selectedProfile);
          } else {
            log('❌ Invalid option. Please select a valid number.');
            askProfile();
          }
        });
      };

      askProfile();
    });
  }

  // Create new local profile (kept for compatibility but not used)
  async createNewProfile(profileName) {
    const profilePath = path.join(this.profilesDir, profileName);
    
    if (fs.existsSync(profilePath)) {
      throw new Error(`Profile '${profileName}' already exists`);
    }

    fs.mkdirSync(profilePath, { recursive: true });
    
    return {
      name: profileName,
      path: profilePath,
      type: 'local',
      description: `Local Profile: ${profileName}`
    };
  }

  // Validate that the selected profile is valid
  validateProfile(profile) {
    if (!profile || !profile.path) {
      throw new Error('Invalid profile');
    }

    // If it's a Chrome user profile, verify it exists
    if (profile.type === 'chrome' && !fs.existsSync(profile.path)) {
      throw new Error(`Chrome profile '${profile.name}' does not exist`);
    }

    return true;
  }
}

module.exports = ProfileManager;

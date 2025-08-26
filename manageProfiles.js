require('dotenv').config();
const { log } = require('./utils/logger');
const ProfileManager = require('./utils/profileManager');
const readline = require('readline');

async function manageProfiles() {
  log("===== CHROME PROFILE MANAGEMENT =====");
  log("This script allows you to view information about your Chrome profiles for the invoices bot.\n");

  const profileManager = new ProfileManager();
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const showMainMenu = () => {
    log('\n📋 MAIN MENU');
    log('==================');
    log('1. 🔍 View available Chrome profiles');
    log('2. 📝 Profile information');
    log('3. 🚪 Exit');
    log('');
  };

  const askChoice = (question) => {
    return new Promise((resolve) => {
      rl.question(question, (answer) => {
        resolve(answer.trim());
      });
    });
  };

  const viewProfiles = async () => {
    log('\n🔍 AVAILABLE CHROME PROFILES');
    log('==================================');
    
    const profiles = await profileManager.detectExistingProfiles();
    
    if (profiles.length === 0) {
      log('❌ No Chrome profiles found');
      return;
    }

    profiles.forEach((profile, index) => {
      log(`✅ ${index + 1}. 🌐 ${profile.description}`);
      log(`   📍 Path: ${profile.path}`);
      log(`   🏷️  Type: ${profile.type}`);
      log('');
    });
  };

  const profileInfo = async () => {
    log('\n📝 PROFILE INFORMATION');
    log('============================');
    
    const profiles = await profileManager.detectExistingProfiles();
    
    log(`Total Chrome profiles detected: ${profiles.length}`);
    
    log('\n💡 Profile types:');
    log('• 🌐 Chrome: Existing profiles from your Chrome browser');
    log('• 🔒 Secure: Only real user profiles (system folders filtered)');
    
    log('\n📋 Profiles found:');
    profiles.forEach((profile, index) => {
      log(`• ${profile.name} - ${profile.path}`);
    });
    
    log('\n💡 Note: Only valid Chrome user profiles are shown.');
    log('   Chrome system folders are automatically filtered out.');
  };

  // Main menu loop
  let running = true;
  while (running) {
    showMainMenu();
    
    const choice = await askChoice('👉 Select an option: ');
    
    switch (choice) {
      case '1':
        await viewProfiles();
        break;
      case '2':
        await profileInfo();
        break;
      case '3':
        running = false;
        break;
      default:
        log('❌ Invalid option. Please select a number from 1 to 3.');
    }
  }

  log('\n👋 Goodbye!');
  rl.close();
}

// Execute main function
manageProfiles().catch(error => {
  log(`FATAL ERROR: ${error.message}`);
  process.exit(1);
});

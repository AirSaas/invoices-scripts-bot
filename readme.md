# Invoices Bot 🤖

Bot for downloading invoices from multiple SaaS platforms using Chrome profiles and AI-powered element detection.

## Features

- **Multi-Platform Support**: Automatically downloads invoices from SaaS platforms
- **Chrome Profile Management**: Use your existing Chrome profiles for seamless authentication
- **AI-Powered Scraping**: Intelligent element detection with multiple fallback strategies
- **Automatic Email Reports**: Sends detailed execution summaries via Gmail
- **Robust Error Handling**: Comprehensive error handling and recovery mechanisms
- **Multi-Language Support**: Works with Spanish, English, and French websites
- **Automatic Folder Management**: Creates required directory structure automatically

## 🚀 Quick Start

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd invoices-bot
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your credentials
   ```

4. **Run the bot**
   ```bash
   npm start
   ```

## 📋 Available Commands

- `npm start` - Run the main bot
- `npm run auth` - Authenticate manually in all websites
- `npm run profiles` - Manage Chrome profiles

## 🏗️ Project Structure

```
invoices-bot/
├── sites/                 # Website scrapers
│   ├── bettercontact.js   # BetterContact scraper
│   ├── dropcontact.js     # Dropcontact scraper
│   ├── fullenrich.js      # Fullenrich scraper
│   ├── hyperline.js       # Hyperline scraper
│   ├── sejda.js          # Sejda scraper
│   └── dedupe.js         # Dedupe scraper
├── utils/                 # Utility modules
│   ├── browserConfig.js   # Browser configuration
│   ├── download.js        # File download utilities
│   ├── emailSender.js     # Email functionality
│   ├── folderManager.js   # Directory management
│   ├── logger.js          # Logging system
│   ├── profileManager.js  # Chrome profile management
│   └── scraperRunner.js   # Scraper orchestration
├── factures/              # Downloaded invoices (auto-created)
├── logs/                  # Execution logs (auto-created)
├── main.js                # Main entry point
├── auth.js                # Authentication script
└── manageProfiles.js      # Profile management script
```

## 🔐 Authentication

The bot supports multiple authentication methods:

### Supported Platforms
- **BetterContact** - Billing and invoice access
- **Dropcontact** - Billing and invoice management
- **Fullenrich** - Billing and invoice downloads
- **Hyperline** - Billing and invoice access
- **Sejda** - Account invoice downloads
- **Dedupe** - Company billing and invoice history

### Authentication Flow
1. **Profile Selection**: Choose your Chrome profile
2. **Automatic Login**: Bot handles Google OAuth automatically
3. **Password Handling**: Automatically fills password fields when needed
4. **Session Persistence**: Maintains authentication across executions

## 📧 Email Reports

The bot automatically sends detailed email reports after each execution:

### Report Contents
- **Execution Summary**: Overview of the bot run
- **File Attachments**: All downloaded invoices
- **Site Status Report**: Success/failure for each platform
- **Statistics**: Download counts and success rates
- **Timestamp**: When the execution completed

### Email Configuration
Required environment variables:
- `GMAIL_EMAIL` - Your Gmail address
- `GMAIL_PSW` - Your Gmail password
- `RECIPIENT_EMAIL` - Where to send reports
- `GMAIL_COMPOSE_URL` - Gmail compose URL

## 🗂️ Chrome Profile Management

### Automatic Detection
The bot automatically detects your existing Chrome profiles:
- **User Profiles**: Real Chrome user profiles
- **System Filtering**: Excludes Chrome system folders
- **Smart Selection**: Interactive menu for profile choice

### Profile Types
- **Chrome Profiles**: Your existing browser profiles
- **Session Persistence**: Maintains login states
- **Multi-Account Support**: Works with multiple Google accounts

## 🔧 Technical Features

### AI-Powered Element Detection
- **Multiple Selectors**: Uses various CSS selectors for reliability
- **Fallback Strategies**: Multiple approaches for element interaction
- **Language Support**: Works with Spanish, English, and French interfaces

### Robust Error Handling
- **Timeout Management**: Configurable timeouts for all operations
- **Retry Mechanisms**: Automatic retry for failed operations
- **Graceful Degradation**: Continues operation even if some sites fail

### File Management
- **Automatic Directory Creation**: Creates required folders automatically
- **Git Integration**: Maintains folder structure in version control
- **File Organization**: Organizes downloads by platform

## 📁 Required Environment Variables

Create a `.env` file with the following variables:

```bash
# Chrome Profile (optional, will prompt if not set)
CHROME_PROFILE_PATH=

# Gmail Configuration
GMAIL_EMAIL=your-email@gmail.com
GMAIL_PSW=your-app-password
RECIPIENT_EMAIL=recipient@example.com
GMAIL_COMPOSE_URL=https://mail.google.com/mail/u/0/#compose

# Platform Credentials
BETTERCONTACT_EMAIL=your-email@example.com
BETTERCONTACT_PSW=your-password
FULLENRICH_EMAIL=your-email@example.com
FULLENRICH_PSW=your-password

# Other platforms may require similar credentials
```

## 🔄 Updates

The bot automatically:
- **Creates missing directories**
- **Maintains folder structure**
- **Handles authentication flows**
- **Manages Chrome profiles**
- **Sends execution reports**

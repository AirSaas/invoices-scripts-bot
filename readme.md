# Invoice Automation Bot

Automated bot that logs into websites, downloads invoices using AI, and sends them via email.

## Features

- **AI-Powered**: Uses OpenAI to identify download elements
- **Auto-Login**: Handles Google OAuth authentication
- **Smart Detection**: Automatically detects if login is needed
- **Email Reports**: Sends invoices with logs via Gmail
- **Persistent Sessions**: Reuses browser sessions
- **Multi-Profile Support**: Choose from existing Chrome profiles or create new ones

## Project Structure

```
factures-bot/
├─ factures/          # Downloaded invoices
├─ logs/              # Log files
├─ sites/             # Site-specific scripts
├─ utils/             # Utility functions
├─ user-data/         # Browser session data
├─ main.js            # Main entry point
├─ auth.js            # Authentication script
├─ manageProfiles.js  # Profile management script
├─ package.json       # Dependencies
└─ .env.example       # Environment variables template
```

## Quick Start

1. **Install**
   ```bash
   npm install
   ```

2. **Configure**
   ```bash
   # Create .env file with your settings based in .env.example file
   ```

3. **Manage Profiles** (optional)
   ```bash
   npm run profiles
   ```

4. **Authenticate** (first time only)
   ```bash
   npm run auth
   ```

5. **Run**
   ```bash
   npm start
   ```

## Commands

- `npm start` - Run the bot
- `npm run auth` - Authenticate manually in all pages
- `npm run profiles` - Manage Chrome profiles

## Profile Management

The bot now supports multiple Chrome profiles:

### **Automatic Profile Detection**
- **Chrome Profiles**: Automatically detects existing Chrome user profiles
- **Local Profiles**: Creates and manages profiles specific to the bot
- **Smart Selection**: Interactive menu to choose which profile to use

### **Profile Types**
- **🌐 Chrome Profiles**: Your existing Chrome browser profiles
- **📁 Local Profiles**: Profiles created specifically for the bot
- **⚙️ Default Profile**: System default Chrome profile

### **Using Profiles**
1. **First Run**: The bot will show you available profiles and let you choose
2. **Profile Selection**: Interactive menu with clear descriptions
3. **Session Persistence**: Each profile maintains its own sessions and cookies
4. **Multiple Accounts**: Use different profiles for different accounts/sites

## How It Works

1. **Profile Selection**: Choose which Chrome profile to use
2. **Check Auth**: Goes to billing page, detects if login needed
3. **Auto-Login**: If needed, handles Google OAuth automatically
4. **Download**: Uses AI to find and download invoices
5. **Email**: Sends results with logs attached

## Troubleshooting

- **Chrome Profile**: Close all Chrome windows if "Profile in use" error
- **Login Issues**: Run `npm run auth` to re-authenticate manually in all pages
- **Profile Issues**: Use `npm run profiles` to manage and troubleshoot profiles

## Adding New Sites

1. Create `sites/newsite.js`
2. Implement `run` function (see `sejda.js` for example)
3. Add to `scraperRunner.js`

## Profile Management Commands

### **View Profiles**
```bash
npm run profiles
# Then select option 1
```

### **Create New Profile**
```bash
npm run profiles
# Then select option 2
```

### **Delete Profile**
```bash
npm run profiles
# Then select option 3
```

### **Profile Information**
```bash
npm run profiles
# Then select option 4
```

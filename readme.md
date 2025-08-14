# Invoice Automation Bot

Automated bot that logs into websites, downloads invoices using AI, and sends them via email.

## Features

- **AI-Powered**: Uses OpenAI to identify download elements
- **Auto-Login**: Handles Google OAuth authentication
- **Smart Detection**: Automatically detects if login is needed
- **Email Reports**: Sends invoices with logs via Gmail
- **Persistent Sessions**: Reuses browser sessions

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

3. **Authenticate** (first time only)
   ```bash
   npm run auth
   ```

4. **Run**
   ```bash
   npm start
   ```

## Commands

- `npm start` - Run the bot
- `npm run auth` - Authenticate manually in all pages

## How It Works

1. **Check Auth**: Goes to billing page, detects if login needed
2. **Auto-Login**: If needed, handles Google OAuth automatically
3. **Download**: Uses AI to find and download invoices
4. **Email**: Sends results with logs attached

## Troubleshooting

- **Chrome Profile**: Close all Chrome windows if "Profile in use" error
- **Login Issues**: Run `npm run auth` to re-authenticate manually in all pages

## Adding New Sites

1. Create `sites/newsite.js`
2. Implement `run` function (see `sejda.js` for example)
3. Add to `scraperRunner.js`

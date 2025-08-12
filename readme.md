# Playwright Invoice Automation Bot

This is an automated bot designed to log into specific websites, locate, and download invoice files (PDFs). It uses OpenAI's GPT models to dynamically identify download elements, making it robust against minor website structure changes. The bot concludes by sending a summary email via Gmail with the downloaded invoices and a log file as attachments.

---

## Key Features

- **AI-Powered Selectors**: Uses OpenAI to analyze page HTML and generate robust CSS selectors for download links/buttons.
- **Persistent Authentication**: Leverages Playwright's persistent context to reuse browser sessions, minimizing the need for repeated logins.
- **Robust Download Handling**: Manages multiple download scenarios, including direct links, click-triggered downloads, new tabs, and iframes.
- **Comprehensive Logging**: Records every significant action, success, and failure into a dated log file for easy debugging.
- **Email Reporting**: Automates sending a summary email through the Gmail web interface, attaching all downloaded invoices and the session log.
- **Scalable Structure**: Organized to easily add new website scripts without modifying the core logic.

---

## Project Structure

```
factures-bot/
├─ factures/
│ └─ sejda/
├─ logs/
│ └─ log-YYYY-MM-DD.txt
├─ sites/
│ └─ sejda.js
├─ utils/
│ ├─ logger.js
│ ├─ selectorAI.js
│ └─ download.js
├─ user-data/
├─ main.js
├─ package.json
└─ README.md
```

---

## Setup and Installation

1.  **Clone the Repository**
    ```bash
    git clone <this-repo-url>
    cd factures-bot
    ```

2.  **Install Dependencies**
    ```bash
    npm install
    ```

3.  **Set Environment Variables**
    You must set your OpenAI API key as an environment variable. Do not hardcode it.

    - **Linux/macOS**: `export OPENAI_API_KEY='your-secret-key'`
    - **Windows (PowerShell)**: `$env:OPENAI_API_KEY='your-secret-key'`

4.  **One-Time Authentication**
    You need to log into the target websites (e.g., Sejda) and Gmail once to save the session. Run the `auth` script:
    ```bash
    npm run auth
    ```
    This will open a Chrome window. Log into all necessary websites, then close the window. Your session will be saved in the `user-data` directory.

---

## Usage

To run the bot, execute the main script:
```bash
npm start
```
Or directly:
```bash
node main.js
```
The bot will launch, perform the defined tasks, download the files, and send the final email report.

---

## Configuration

- **Site Credentials**: **WARNING:** Credentials are currently stored in plain text within each site script (e.g., `sites/sejda.js`). This is not secure. For production use, source these from a secure vault or environment variables.
- **Email Recipient**: The recipient's email address is set in `main.js`. Modify the `RECIPIENT_EMAIL` constant as needed.
- **Adding a New Site**:
  1. Create a new file in the `sites/` directory (e.g., `newsite.js`).
  2. Implement the `run` function following the structure of `sejda.js`.
  3. Import and call your new site's `run` function within `main.js`.

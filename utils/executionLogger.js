const fs = require('fs');
const path = require('path');

const logsDir = path.join(__dirname, '..', 'logs');

class ExecutionLogger {
  constructor() {
    this.startTime = new Date().toISOString();
    this.sites = {};
    this.summary = {
      totalFiles: 0,
      totalErrors: 0,
      totalPages: 0,
    };
  }

  // Initialize a site entry
  startSite(siteName) {
    this.sites[siteName] = {
      startTime: new Date().toISOString(),
      endTime: null,
      status: 'in_progress',
      url: null,
      currentUrl: null,
      pages: [],
      downloads: [],
      errors: [],
      aiCalls: [],
      pagination: [],
      totalFiles: 0,
    };
    return this.sites[siteName];
  }

  // Log site URL
  setSiteUrl(siteName, url) {
    if (this.sites[siteName]) {
      this.sites[siteName].url = url;
    }
  }

  // Log current URL (after redirects, login, etc.)
  setCurrentUrl(siteName, url) {
    if (this.sites[siteName]) {
      this.sites[siteName].currentUrl = url;
    }
  }

  // Log a page being processed (for pagination tracking)
  logPageProcessed(siteName, pageNumber, url, elementsFound) {
    if (this.sites[siteName]) {
      this.sites[siteName].pages.push({
        pageNumber,
        url,
        elementsFound,
        timestamp: new Date().toISOString(),
      });
    }
  }

  // Log an AI call
  logAiCall(siteName, type, input, output) {
    if (this.sites[siteName]) {
      this.sites[siteName].aiCalls.push({
        type, // 'findCandidates', 'getSelectors', 'findPagination'
        inputSize: typeof input === 'string' ? input.length : JSON.stringify(input).length,
        output: typeof output === 'string' ? output : JSON.stringify(output),
        timestamp: new Date().toISOString(),
      });
    }
  }

  // Log a single file download (one by one tracking)
  logDownload(siteName, { filename, selector, status, error, fileSize }) {
    if (this.sites[siteName]) {
      const entry = {
        filename: filename || null,
        selector: selector || null,
        status, // 'success', 'failed', 'skipped'
        error: error || null,
        fileSize: fileSize || null,
        timestamp: new Date().toISOString(),
      };
      this.sites[siteName].downloads.push(entry);
      if (status === 'success') {
        this.sites[siteName].totalFiles++;
        this.summary.totalFiles++;
      }
    }
  }

  // Log pagination detection result
  logPagination(siteName, { detected, selector, action, pageNumber }) {
    if (this.sites[siteName]) {
      this.sites[siteName].pagination.push({
        detected,
        selector: selector || null,
        action: action || null, // 'click_next', 'scroll', 'no_more_pages'
        pageNumber: pageNumber || null,
        timestamp: new Date().toISOString(),
      });
      if (detected) {
        this.summary.totalPages++;
      }
    }
  }

  // Log an error for a site
  logError(siteName, { phase, message, stack }) {
    if (this.sites[siteName]) {
      this.sites[siteName].errors.push({
        phase, // 'navigation', 'login', 'ai_candidates', 'ai_selectors', 'ai_pagination', 'download', 'pagination_click'
        message,
        stack: stack || null,
        timestamp: new Date().toISOString(),
      });
      this.summary.totalErrors++;
    }
  }

  // Finish a site
  finishSite(siteName, status) {
    if (this.sites[siteName]) {
      this.sites[siteName].endTime = new Date().toISOString();
      this.sites[siteName].status = status; // 'success', 'partial', 'failed', 'skipped'
    }
  }

  // Build the full execution report
  getReport() {
    return {
      execution: {
        startTime: this.startTime,
        endTime: new Date().toISOString(),
        summary: {
          ...this.summary,
          sitesProcessed: Object.keys(this.sites).length,
          sitesSucceeded: Object.values(this.sites).filter(s => s.status === 'success').length,
          sitesFailed: Object.values(this.sites).filter(s => s.status === 'failed').length,
          sitesPartial: Object.values(this.sites).filter(s => s.status === 'partial').length,
        },
      },
      sites: this.sites,
    };
  }

  // Write the JSON log to disk
  save() {
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filePath = path.join(logsDir, `execution-${timestamp}.json`);
    const report = this.getReport();

    fs.writeFileSync(filePath, JSON.stringify(report, null, 2), 'utf8');
    return filePath;
  }
}

module.exports = ExecutionLogger;

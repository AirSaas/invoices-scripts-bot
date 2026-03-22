const { log } = require('./logger');
const { findCandidateElements, getCssSelectors, findPaginationElement } = require('./selectorAI');
const { attemptDownloads } = require('./download');

const MAX_PAGES = 20; // Safety limit to avoid infinite loops

/**
 * Default HTML filter — removes scripts, styles, SVGs, keeps billing-related content.
 * Can be overridden per site.
 */
function defaultFilterHtml(html) {
  let filtered = html
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/<svg[\s\S]*?<\/svg>/gi, '[ICON]')
    .split('\n')
    .filter(line => {
      const l = line.toLowerCase();
      return (
        l.includes('billing') || l.includes('invoice') || l.includes('facture') ||
        l.includes('download') || l.includes('descargar') || l.includes('télécharger') ||
        l.includes('pdf') || l.includes('csv') || l.includes('xlsx') ||
        l.includes('stripe.com') || l.includes('pay.stripe') ||
        l.includes('<button') || l.includes('</button>') ||
        l.includes('<a ') || l.includes('</a>') ||
        l.includes('href=') || l.includes('onclick=') || l.includes('target=') ||
        l.includes('<table') || l.includes('<tbody') || l.includes('<tr') ||
        l.includes('<td') || l.includes('<th') ||
        l.includes('</table>') || l.includes('</tbody>') || l.includes('</tr>') ||
        l.includes('</td>') || l.includes('</th') ||
        l.includes('€') || l.includes('$') ||
        // Pagination keywords
        l.includes('next') || l.includes('suivant') || l.includes('siguiente') ||
        l.includes('previous') || l.includes('précédent') || l.includes('anterior') ||
        l.includes('page') || l.includes('pagination') ||
        l.includes('load more') || l.includes('charger plus') || l.includes('ver más') ||
        l.includes('show more') || l.includes('voir plus') || l.includes('mostrar más') ||
        l.includes('chevron') || l.includes('arrow') ||
        l.includes('nav') || l.includes('pager') ||
        l.match(/\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}/) ||
        (l.includes('<div') && (l.includes('class=') || l.includes('id='))) ||
        l.trim() === ''
      );
    })
    .join('\n');

  if (filtered.length > 30000) {
    filtered = filtered.substring(0, 30000) + '\n<!-- HTML truncated -->';
  }
  return filtered;
}

/**
 * Download all invoices from a page, handling pagination automatically.
 *
 * @param {Page} page - Playwright page (already navigated to billing page)
 * @param {string} downloadPath - Where to save files
 * @param {string} siteName - Site name for logging
 * @param {ExecutionLogger} executionLog - JSON execution logger
 * @param {object} options
 * @param {function} options.filterHtml - Custom HTML filter (optional, defaults to defaultFilterHtml)
 * @param {number} options.maxInvoices - Max number of invoices to download (default: 12)
 * @returns {string[]} Array of downloaded file paths
 */
async function downloadAllInvoices(page, downloadPath, siteName, executionLog, options = {}) {
  const filterHtml = options.filterHtml || defaultFilterHtml;
  const maxInvoices = options.maxInvoices ?? 12;
  const allDownloadedFiles = [];
  let currentPage = 1;
  let pagesProcessed = 0;

  log(`${siteName.toUpperCase()} INVOICE_DOWNLOADER: Starting download loop (max ${maxInvoices} invoices)`);

  while (currentPage <= MAX_PAGES) {
    log(`${siteName.toUpperCase()} PAGE_${currentPage}: Processing page ${currentPage}`);

    // 1. Get and filter HTML
    let html;
    try {
      html = await page.content();
      log(`${siteName.toUpperCase()} PAGE_${currentPage}: HTML fetched (${html.length} chars)`);
    } catch (pageError) {
      log(`${siteName.toUpperCase()} PAGE_${currentPage}: page.content() FAILED — ${pageError.message}`);
      if (executionLog) {
        executionLog.logError(siteName, { phase: 'navigation', message: `page.content() failed: ${pageError.message}` });
      }
      break;
    }

    const filteredHtml = filterHtml(html);
    log(`${siteName.toUpperCase()} PAGE_${currentPage}: Filtered HTML (${filteredHtml.length} chars, reduced from ${html.length})`);

    if (executionLog) {
      executionLog.logPageProcessed(siteName, currentPage, page.url(), null);
    }

    // 2. AI call #1 — find candidate download elements
    let candidates;
    try {
      candidates = await findCandidateElements(filteredHtml);
      log(`${siteName.toUpperCase()} PAGE_${currentPage}: AI found ${candidates.length} candidate(s)`);
      if (executionLog) {
        executionLog.logAiCall(siteName, 'findCandidates', filteredHtml, candidates);
      }
    } catch (aiError) {
      log(`${siteName.toUpperCase()} PAGE_${currentPage}: AI findCandidates FAILED — ${aiError.message}`);
      if (executionLog) {
        executionLog.logError(siteName, { phase: 'ai_candidates', message: aiError.message, stack: aiError.stack });
      }
      break;
    }

    if (candidates.length === 0) {
      log(`${siteName.toUpperCase()} PAGE_${currentPage}: No candidates found, stopping`);
      break;
    }

    // 3. AI call #2 — generate CSS selectors
    let selectors;
    try {
      selectors = await getCssSelectors(candidates);
      log(`${siteName.toUpperCase()} PAGE_${currentPage}: AI generated ${selectors.length} selector(s): ${selectors.join(', ')}`);
      if (executionLog) {
        executionLog.logAiCall(siteName, 'getSelectors', candidates, selectors);
      }
    } catch (aiError) {
      log(`${siteName.toUpperCase()} PAGE_${currentPage}: AI getSelectors FAILED — ${aiError.message}`);
      if (executionLog) {
        executionLog.logError(siteName, { phase: 'ai_selectors', message: aiError.message, stack: aiError.stack });
      }
      break;
    }

    if (selectors.length === 0) {
      log(`${siteName.toUpperCase()} PAGE_${currentPage}: No selectors generated, stopping`);
      break;
    }

    // 4. Download one by one
    const remaining = maxInvoices - allDownloadedFiles.length;
    const pageFiles = await attemptDownloads(page, selectors, downloadPath, executionLog, siteName, remaining);
    const filePaths = pageFiles.map(f => f.filePath);
    allDownloadedFiles.push(...filePaths);
    pagesProcessed++;
    log(`${siteName.toUpperCase()} PAGE_${currentPage}: Downloaded ${pageFiles.length} file(s) (total: ${allDownloadedFiles.length}/${maxInvoices})`);

    // Check if we reached the max
    if (allDownloadedFiles.length >= maxInvoices) {
      log(`${siteName.toUpperCase()} PAGE_${currentPage}: Reached max invoices limit (${maxInvoices}) — stopping`);
      break;
    }

    // 5. AI call #3 — check for pagination
    log(`${siteName.toUpperCase()} PAGE_${currentPage}: Checking for pagination...`);

    let paginationResult;
    try {
      // Re-fetch HTML after downloads (DOM may have changed)
      const currentHtml = await page.content();
      const filteredCurrentHtml = filterHtml(currentHtml);
      log(`${siteName.toUpperCase()} PAGE_${currentPage}: Pagination HTML (${filteredCurrentHtml.length} chars)`);
      paginationResult = await findPaginationElement(filteredCurrentHtml);
      if (executionLog) {
        executionLog.logAiCall(siteName, 'findPagination', filteredCurrentHtml, paginationResult);
      }
    } catch (aiError) {
      log(`${siteName.toUpperCase()} PAGE_${currentPage}: AI findPagination FAILED — ${aiError.message}`);
      if (executionLog) {
        executionLog.logError(siteName, { phase: 'ai_pagination', message: aiError.message, stack: aiError.stack });
      }
      break;
    }

    if (!paginationResult.found) {
      log(`${siteName.toUpperCase()} PAGE_${currentPage}: No pagination found — done`);
      if (executionLog) {
        executionLog.logPagination(siteName, { detected: false, action: 'no_more_pages', pageNumber: currentPage });
      }
      break;
    }

    log(`${siteName.toUpperCase()} PAGE_${currentPage}: Pagination detected — type="${paginationResult.type}", selector="${paginationResult.selector}", reason="${paginationResult.reason}"`);

    // 6. Handle pagination
    if (paginationResult.type === 'infinite_scroll') {
      // Scroll to bottom and wait for new content
      log(`${siteName.toUpperCase()} PAGE_${currentPage}: Infinite scroll — scrolling down...`);
      try {
        const previousHeight = await page.evaluate(() => document.body.scrollHeight);
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(3000);
        const newHeight = await page.evaluate(() => document.body.scrollHeight);

        if (newHeight === previousHeight) {
          log(`${siteName.toUpperCase()} PAGE_${currentPage}: No new content after scroll — done`);
          if (executionLog) {
            executionLog.logPagination(siteName, { detected: true, action: 'scroll', pageNumber: currentPage });
          }
          break;
        }

        if (executionLog) {
          executionLog.logPagination(siteName, { detected: true, selector: null, action: 'scroll', pageNumber: currentPage });
        }
      } catch (scrollError) {
        log(`${siteName.toUpperCase()} PAGE_${currentPage}: Scroll FAILED — ${scrollError.message}`);
        if (executionLog) {
          executionLog.logError(siteName, { phase: 'pagination_click', message: `scroll failed: ${scrollError.message}` });
        }
        break;
      }
    } else if (paginationResult.selector) {
      // Click the next page element
      try {
        const nextElement = await page.locator(paginationResult.selector).first();
        await nextElement.waitFor({ timeout: 5000 });
        await nextElement.click();
        log(`${siteName.toUpperCase()} PAGE_${currentPage}: Clicked pagination element "${paginationResult.selector}"`);
        await page.waitForTimeout(3000);

        if (executionLog) {
          executionLog.logPagination(siteName, {
            detected: true,
            selector: paginationResult.selector,
            action: 'click_next',
            pageNumber: currentPage,
          });
        }
      } catch (clickError) {
        log(`${siteName.toUpperCase()} PAGE_${currentPage}: Failed to click pagination — ${clickError.message}`);
        if (executionLog) {
          executionLog.logError(siteName, { phase: 'pagination_click', message: clickError.message, stack: clickError.stack });
          executionLog.logPagination(siteName, {
            detected: true,
            selector: paginationResult.selector,
            action: 'click_failed',
            pageNumber: currentPage,
          });
        }
        break;
      }
    } else {
      log(`${siteName.toUpperCase()} PAGE_${currentPage}: Pagination detected but no selector — stopping`);
      break;
    }

    currentPage++;
  }

  if (currentPage > MAX_PAGES) {
    log(`${siteName.toUpperCase()} WARNING: Reached max page limit (${MAX_PAGES})`);
  }

  log(`${siteName.toUpperCase()} INVOICE_DOWNLOADER: Finished — ${allDownloadedFiles.length} total file(s) across ${pagesProcessed} page(s)`);
  return allDownloadedFiles;
}

module.exports = { downloadAllInvoices, defaultFilterHtml };

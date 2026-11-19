import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { captureSnapshot } from './capture.js';

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    throw new Error(
      'Taking snapshots needs Playwright. Install it with:\n' +
      '  npm i -D playwright && npx playwright install chromium',
    );
  }
}

export async function openBrowser() {
  const { chromium } = await loadPlaywright();
  try {
    return await chromium.launch();
  } catch (bundledError) {
    // Fall back to an installed Google Chrome when Playwright's own browser is missing.
    try {
      return await chromium.launch({ channel: 'chrome' });
    } catch {
      throw bundledError;
    }
  }
}

function friendly(err, url) {
  const msg = String(err && err.message);
  if (/ERR_CONNECTION_REFUSED|ECONNREFUSED/.test(msg)) {
    return new Error(`Cannot open ${url}: nothing is listening there. Is your dev server running, and on this port?`);
  }
  if (/ERR_CERT|SSL|certificate/i.test(msg)) {
    return new Error(`Cannot open ${url}: the HTTPS certificate is not trusted. Use the http:// address, or trust your dev certificate (e.g. \`dotnet dev-certs https --trust\`).`);
  }
  return err;
}

/**
 * Captures one page with an already open browser.
 *
 * @param {import('playwright').Browser} browser
 * @param {string} target URL or path to an HTML file
 * @param {{ width?: number, height?: number, screen?: string, ignore?: string[],
 *           storageState?: string, waitFor?: string, delay?: number,
 *           onWarning?: (msg: string) => void }} [options]
 */
export async function capturePage(browser, target, options = {}) {
  const url = existsSync(target) ? pathToFileURL(resolve(target)).href : target;
  const warn = options.onWarning || ((m) => process.stderr.write(`uichanges: warning: ${m}\n`));
  if (options.storageState && !existsSync(options.storageState)) {
    throw new Error(`Session file ${options.storageState} not found. Create it with:\n  npx playwright codegen --save-storage=${options.storageState} <url>`);
  }
  const context = await browser.newContext({
    viewport: { width: options.width || 1280, height: options.height || 800 },
    storageState: options.storageState || undefined,
  });
  try {
    const page = await context.newPage();
    try {
      await page.goto(url, { waitUntil: 'networkidle' });
    } catch (err) {
      throw friendly(err, url);
    }
    if (options.waitFor) await page.waitForSelector(options.waitFor, { state: 'visible', timeout: 15000 });
    if (options.delay) await page.waitForTimeout(options.delay);

    const requested = new URL(url).pathname;
    const actual = new URL(page.url()).pathname;
    if (requested !== actual) {
      warn(`requested ${requested}, but the page redirected to ${actual}. If this is a login page, pass --storage-state auth.json`);
    }

    const screen = options.screen || actual.split('/').pop() || '/';
    return await page.evaluate(captureSnapshot, { screen, ignore: options.ignore || [] });
  } finally {
    await context.close();
  }
}

/** Opens a browser, captures one page, closes the browser. */
export async function snapshotPage(target, options = {}) {
  const browser = await openBrowser();
  try {
    return await capturePage(browser, target, options);
  } finally {
    await browser.close();
  }
}

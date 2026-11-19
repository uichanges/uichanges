import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { captureSnapshot } from './capture.js';

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    throw new Error(
      'The snapshot command needs Playwright. Install it with:\n' +
      '  npm i -D playwright && npx playwright install chromium',
    );
  }
}

/**
 * Opens a URL or a local HTML file in a headless browser and captures a snapshot.
 *
 * @param {string} target URL or path to an HTML file.
 * @param {{ width?: number, height?: number, screen?: string, ignore?: string[] }} [options]
 */
export async function snapshotPage(target, options = {}) {
  const { chromium } = await loadPlaywright();
  const url = existsSync(target) ? pathToFileURL(resolve(target)).href : target;
  const width = options.width || 1280;
  const height = options.height || 800;

  let browser;
  try {
    browser = await chromium.launch();
  } catch (bundledError) {
    // Fall back to an installed Google Chrome when Playwright's own browser is missing.
    try {
      browser = await chromium.launch({ channel: 'chrome' });
    } catch {
      throw bundledError;
    }
  }

  try {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.goto(url, { waitUntil: 'networkidle' });
    const screen = options.screen || new URL(page.url()).pathname.split('/').pop() || '/';
    return await page.evaluate(captureSnapshot, { screen, ignore: options.ignore || [] });
  } finally {
    await browser.close();
  }
}

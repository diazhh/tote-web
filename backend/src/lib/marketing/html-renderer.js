// Renders an HTML template (with advanced CSS) to a PNG via headless Chromium.
// The template defines the visual design (the "lienzo"); `fill` injects the day's
// data by CSS selector so the same template serves every day.
import puppeteer from 'puppeteer';
import sharp from 'sharp';

let _browser = null;

async function getBrowser() {
  if (_browser && _browser.connected) return _browser;
  _browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
  });
  return _browser;
}

/**
 * Render a template to a PNG buffer.
 * @param {string} templatePath absolute path to the template .html
 * @param {{texts?: [string,string][], attrs?: [string,string,string][]}} fill
 *        texts: [selector, textContent]; attrs: [selector, attrName, value]
 * @param {number} width  output width (default 1080)
 * @param {number} height output height (default 1350)
 * @param {number} scale  render device scale; output is downscaled to width×height (default 2 for crisp text)
 * @returns {Promise<Buffer>} PNG buffer sized width×height
 */
export async function renderTemplateToPng({ templatePath, fill = {}, width = 1080, height = 1350, scale = 2 }) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport({ width, height, deviceScaleFactor: scale });
    await page.goto('file://' + templatePath, { waitUntil: 'networkidle0', timeout: 30000 });

    await page.evaluate((spec) => {
      for (const [sel, val] of (spec.texts || [])) {
        const el = document.querySelector(sel);
        if (el) el.textContent = val;
      }
      for (const [sel, attr, val] of (spec.attrs || [])) {
        const el = document.querySelector(sel);
        if (el) el.setAttribute(attr, val);
      }
    }, fill);

    // Wait for webfonts and any (re)loaded images before snapshot.
    await page.evaluate(async () => { if (document.fonts && document.fonts.ready) await document.fonts.ready; });
    await page.evaluate(() => Promise.all(
      Array.from(document.images).map((img) =>
        img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; }))
    ));

    const board = await page.$('#board');
    const raw = await (board || page).screenshot({ type: 'png' });
    if (scale !== 1) {
      return await sharp(raw).resize(width, height, { fit: 'fill' }).png().toBuffer();
    }
    return raw;
  } finally {
    await page.close();
  }
}

export async function closeBrowser() {
  if (_browser) {
    try { await _browser.close(); } catch { /* ignore */ }
    _browser = null;
  }
}

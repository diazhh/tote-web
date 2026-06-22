// Builds a 9:16 "results reveal" story-video: the result cells pop in one by one
// (staggered scale+fade), ending on the full board, held a beat. Frames are
// captured with Puppeteer (deterministic per-frame styling) and encoded by ffmpeg.
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import sharp from 'sharp';
import ffmpeg from 'fluent-ffmpeg';
import logger from '../logger.js';
import { getBrowser } from './html-renderer.js';

/**
 * @param {object} o
 * @param {string} o.templatePath  story template (.html) to animate (must use .cell items)
 * @param {{texts?:[string,string][], attrs?:[string,string,string][]}} [o.fill]
 * @param {string} o.outPath       output .mp4
 * @param {number} [o.width=1080] @param {number} [o.height=1920]
 * @param {number} [o.durationSec=3.4] @param {number} [o.fps=24]
 * @param {number} [o.stagger=0.11]  seconds between consecutive cell entrances
 * @param {number} [o.cellDur=0.36]  seconds for one cell's pop
 * @param {number} [o.scale=1]       device scale factor for capture
 */
export async function buildRevealVideo({
  templatePath, fill = {}, outPath, width = 1080, height = 1920,
  durationSec = 3.4, fps = 24, stagger = 0.11, cellDur = 0.36, scale = 1,
}) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'reveal-'));
  try {
    await page.setViewport({ width, height, deviceScaleFactor: scale });
    await page.goto('file://' + templatePath, { waitUntil: 'networkidle0', timeout: 30000 });

    // Inject the day's data (same selector contract as html-renderer).
    await page.evaluate((spec) => {
      for (const [sel, val] of (spec.texts || [])) { const el = document.querySelector(sel); if (el) el.textContent = val; }
      for (const [sel, attr, val] of (spec.attrs || [])) { const el = document.querySelector(sel); if (el) el.setAttribute(attr, val); }
    }, fill);
    await page.evaluate(async () => { if (document.fonts && document.fonts.ready) await document.fonts.ready; });
    await page.evaluate(() => Promise.all(
      Array.from(document.images).map((img) => img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; }))
    ));

    // Deterministic per-frame reveal driver: window.__revealAt(t) sets every cell's
    // opacity+scale for absolute time t. easeOutBack gives a subtle overshoot "pop".
    await page.evaluate(({ stagger, cellDur }) => {
      const cells = Array.from(document.querySelectorAll('.cell'));
      cells.forEach((c) => { c.style.willChange = 'transform, opacity'; });
      const easeOutBack = (x) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
      window.__revealAt = (t) => {
        cells.forEach((cell, i) => {
          const start = i * stagger;
          let p = (t - start) / cellDur;
          p = Math.max(0, Math.min(1, p));
          const s = p <= 0 ? 0.55 : 0.55 + 0.45 * easeOutBack(p);
          cell.style.opacity = String(Math.max(0, Math.min(1, p * 1.8)));
          cell.style.transform = `scale(${s})`;
        });
      };
      window.__revealAt(0);
    }, { stagger, cellDur });

    const board = await page.$('#board');
    const frames = Math.round(fps * durationSec);
    for (let f = 0; f < frames; f++) {
      const t = f / fps;
      await page.evaluate((tt) => window.__revealAt(tt), t);
      const raw = await (board || page).screenshot({ type: 'png' });
      const buf = scale !== 1 ? await sharp(raw).resize(width, height, { fit: 'fill' }).png().toBuffer() : raw;
      await fs.writeFile(path.join(tmpDir, `f_${String(f).padStart(4, '0')}.png`), buf);
    }

    await encodeFrames({ tmpDir, fps, durationSec, outPath });
    logger.info(`[reveal-video] generado: ${outPath} (${frames} frames @ ${fps}fps)`);
    return outPath;
  } finally {
    await page.close();
    try { await fs.rm(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

function encodeFrames({ tmpDir, fps, durationSec, outPath }) {
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(path.join(tmpDir, 'f_%04d.png'))
      .inputOptions([`-framerate ${fps}`])
      // silent audio generated in-graph (anullsrc) — IG/FB require an audio track.
      .complexFilter(['[0:v]format=yuv420p[v]', 'anullsrc=channel_layout=stereo:sample_rate=44100[a]'])
      .outputOptions([
        '-map [v]', '-map [a]',
        '-c:v libx264', '-pix_fmt yuv420p', '-profile:v high', '-level 4.0',
        `-r ${fps}`, `-t ${durationSec}`, '-shortest',
        '-c:a aac', '-b:a 128k', '-movflags +faststart',
      ])
      .on('end', () => resolve(outPath))
      .on('error', (err) => { logger.error(`[reveal-video] ffmpeg error: ${err.message}`); reject(err); })
      .save(outPath);
  });
}

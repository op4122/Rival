// Renders promo/index.html to promo/rival-promo.mp4.
//   python3 -m http.server 8765 &      (from the repo root)
//   python3 promo/music.py             (writes promo/music.wav)
//   node promo/render.mjs              (needs Playwright and ffmpeg)
// Options: --stills 1.5,9.2  writes PNG stills at those seconds instead of the video.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = createRequire(import.meta.url)('playwright');
const here = dirname(fileURLToPath(import.meta.url));
const FPS = 30;
const url = process.env.PROMO_URL || 'http://localhost:8765/promo/index.html?capture';
const args = process.argv.slice(2);
const stillsAt = args.includes('--stills') ? args[args.indexOf('--stills') + 1].split(',').map(Number) : null;
const outDir = process.env.PROMO_OUT || here;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
page.on('pageerror', e => { console.error('page error:', e.message); process.exitCode = 1; });
await page.goto(url);
await page.evaluate(() => window.ready);
const dur = await page.evaluate(() => window.DUR);

if (stillsAt) {
  for (const t of stillsAt) {
    await page.evaluate(t => window.seek(t), t);
    writeFileSync(join(outDir, `still-${t.toFixed(2)}.png`), await page.screenshot({ type: 'png' }));
  }
} else {
  const music = join(here, 'music.wav');
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    ...(existsSync(music) ? ['-i', music, '-c:a', 'aac', '-b:a', '192k'] : []),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '23', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-shortest',
    join(outDir, 'rival-promo.mp4')], { stdio: ['pipe', 'inherit', 'inherit'] });
  const frames = Math.round(dur * FPS);
  for (let i = 0; i < frames; i++) {
    await page.evaluate(t => window.seek(t), i / FPS);
    const buf = await page.screenshot({ type: 'jpeg', quality: 95 });
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if (i % 150 === 0) console.log(`frame ${i}/${frames}`);
  }
  ff.stdin.end();
  await new Promise(r => ff.on('close', r));
  console.log('wrote rival-promo.mp4');
}
await browser.close();

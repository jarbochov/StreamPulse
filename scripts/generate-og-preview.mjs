import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const docsImgDir = path.join(__dirname, '..', 'docs', 'images');

async function generate() {
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 2 });

    const studioImgPath = path.join(docsImgDir, 'custom-overlay-studio.png');
    const studioImgBase64 = fs.existsSync(studioImgPath)
        ? fs.readFileSync(studioImgPath).toString('base64')
        : '';

    const logoImgPath = path.join(docsImgDir, 'apple-touch-icon.png');
    const logoImgBase64 = fs.existsSync(logoImgPath)
        ? fs.readFileSync(logoImgPath).toString('base64')
        : '';

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset='utf-8'>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      width: 1200px;
      height: 630px;
      background: #090d16;
      background-image: 
        radial-gradient(circle at 18% 22%, rgba(99, 102, 241, 0.28) 0%, transparent 48%),
        radial-gradient(circle at 82% 78%, rgba(79, 70, 229, 0.22) 0%, transparent 48%),
        linear-gradient(180deg, #0f172a 0%, #090d16 100%);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #f8fafc;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 46px 56px;
      overflow: hidden;
      position: relative;
    }
    .glow-border {
      position: absolute;
      inset: 0;
      border: 2px solid rgba(99, 102, 241, 0.35);
      pointer-events: none;
    }
    .top-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      z-index: 2;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .brand-icon {
      width: 44px;
      height: 44px;
      border-radius: 10px;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 0 24px rgba(99, 102, 241, 0.6);
    }
    .brand-icon img {
      width: 100%;
      height: 100%;
      display: block;
    }
    .brand-name {
      font-size: 28px;
      font-weight: 900;
      letter-spacing: -0.03em;
      color: #ffffff;
    }
    .brand-badge {
      font-size: 13px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #a5b4fc;
      background: rgba(99, 102, 241, 0.15);
      border: 1px solid rgba(99, 102, 241, 0.4);
      padding: 6px 14px;
      border-radius: 999px;
    }
    .main-content {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 36px;
      z-index: 2;
      margin-top: 6px;
    }
    .text-col {
      flex: 1.15;
      max-width: 590px;
    }
    h1 {
      font-size: 44px;
      font-weight: 900;
      line-height: 1.15;
      letter-spacing: -0.03em;
      margin-bottom: 14px;
      background: linear-gradient(135deg, #ffffff 40%, #c7d2fe 80%, #818cf8 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    p.desc {
      font-size: 18px;
      line-height: 1.55;
      color: #94a3b8;
      margin-bottom: 22px;
    }
    .tags-row {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }
    .tag {
      font-size: 13px;
      font-weight: 600;
      color: #cbd5e1;
      background: rgba(30, 41, 59, 0.8);
      border: 1px solid rgba(255, 255, 255, 0.14);
      padding: 6px 13px;
      border-radius: 6px;
    }
    .tag.highlight {
      color: #818cf8;
      border-color: rgba(99, 102, 241, 0.45);
      background: rgba(99, 102, 241, 0.15);
    }
    .preview-col {
      flex: 0.95;
      position: relative;
    }
    .preview-card {
      border-radius: 14px;
      overflow: hidden;
      border: 1px solid rgba(255, 255, 255, 0.2);
      box-shadow: 0 25px 60px rgba(0, 0, 0, 0.8), 0 0 40px rgba(99, 102, 241, 0.3);
      transform: rotate(-1.5deg) scale(1.02);
    }
    .preview-card img {
      width: 100%;
      display: block;
    }
    .bottom-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      z-index: 2;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
      padding-top: 16px;
      color: #64748b;
      font-size: 14px;
      font-weight: 600;
    }
    .bottom-row span.url {
      color: #818cf8;
    }
  </style>
</head>
<body>
  <div class='glow-border'></div>
  <div class='top-row'>
    <div class='brand'>
      <div class='brand-icon'>
        <img src='data:image/png;base64,${logoImgBase64}' alt='StreamPulse Logo' />
      </div>
      <div class='brand-name'>StreamPulse</div>
    </div>
    <div class='brand-badge'>Local-First Broadcast Suite · 100% Free & Open-Source</div>
  </div>
  
  <div class='main-content'>
    <div class='text-col'>
      <h1>Cinematic Overlays & Live Stream Control</h1>
      <p class='desc'>The local-first companion for Twitch and SocialStream Ninja. Movie-style credits, choice randomizers, live overlays & community engagement.</p>
      <div class='tags-row'>
        <span class='tag highlight'>Local First</span>
        <span class='tag highlight'>Zero Cloud Lock-in</span>
        <span class='tag'>OBS Ready</span>
        <span class='tag'>Community Engagement</span>
        <span class='tag'>Bitfocus Companion</span>
        <span class='tag'>Free and Community Funded</span>
      </div>
    </div>
    <div class='preview-col'>
      <div class='preview-card'>
        <img src='data:image/png;base64,${studioImgBase64}' />
      </div>
    </div>
  </div>
  
  <div class='bottom-row'>
    <div>Open Source Broadcast Software · MIT License</div>
    <div class='url'>https://jarbochov.github.io/StreamPulse/</div>
  </div>
</body>
</html>`;

    await page.setContent(html);
    const dest = path.join(docsImgDir, 'og-preview.png');
    await page.screenshot({ path: dest, type: 'png' });
    console.log(`Saved updated OG preview to ${dest}`);

    await browser.close();
}

generate().catch(err => {
    console.error(err);
    process.exit(1);
});

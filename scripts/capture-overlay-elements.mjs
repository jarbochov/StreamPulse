import puppeteer from 'puppeteer';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const docsImgDir = path.join(__dirname, '..', 'docs', 'images');
const baseUrl = (process.env.STREAMPULSE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');

async function run() {
    console.log('Launching browser to capture realistic Custom Overlay Editor screenshots...');
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });

    const editorUrl = `${baseUrl}/custom-overlay-editor.html?id=docs-demo-overlay`;
    console.log(`Navigating to ${editorUrl}...`);
    await page.goto(editorUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000));

    // 1. Full studio overview with all layers loaded
    console.log('Capturing custom-overlay-studio.png...');
    await page.screenshot({ path: path.join(docsImgDir, 'custom-overlay-studio.png') });
    console.log('Saved custom-overlay-studio.png');

    // 2. Select Webcam Aperture Frame
    console.log('Selecting Webcam Aperture Frame...');
    await page.evaluate(() => {
        const item = document.querySelector('.layer[data-id="el-cam-cutout"]') || document.querySelector('.layer');
        if (item) item.click();
    });
    await new Promise(r => setTimeout(r, 1000));
    await page.screenshot({ path: path.join(docsImgDir, 'overlay-cutout-webcam.png') });
    console.log('Saved overlay-cutout-webcam.png');

    // 3. Select Text HUD layer
    console.log('Selecting Text HUD layer...');
    await page.evaluate(() => {
        const item = document.querySelector('.layer[data-id="el-stream-hud"]');
        if (item) item.click();
    });
    await new Promise(r => setTimeout(r, 1000));
    await page.screenshot({ path: path.join(docsImgDir, 'overlay-text-inspector.png') });
    console.log('Saved overlay-text-inspector.png');

    // 4. Select Game Plan Schedule Cards
    console.log('Selecting Game Plan Cards layer...');
    await page.evaluate(() => {
        const item = document.querySelector('.layer[data-id="el-game-plan"]');
        if (item) item.click();
    });
    await new Promise(r => setTimeout(r, 1000));
    await page.screenshot({ path: path.join(docsImgDir, 'overlay-game-plan-cards.png') });
    console.log('Saved overlay-game-plan-cards.png');

    // 5. Select Retro CRT layer
    console.log('Selecting Retro CRT layer...');
    await page.evaluate(() => {
        const item = document.querySelector('.layer[data-id="el-retro-crt"]');
        if (item) item.click();
    });
    await new Promise(r => setTimeout(r, 1000));
    await page.screenshot({ path: path.join(docsImgDir, 'overlay-retro-shaders.png') });
    console.log('Saved overlay-retro-shaders.png');

    // 6. Open the Add Element Mega Menu
    console.log('Opening Add Element Menu...');
    await page.evaluate(() => {
        const btn = document.getElementById('add-element');
        if (btn) btn.click();
    });
    await new Promise(r => setTimeout(r, 600));
    await page.screenshot({ path: path.join(docsImgDir, 'overlay-elements-menu.png') });
    console.log('Saved overlay-elements-menu.png');

    await browser.close();
    console.log('All custom overlay screenshots refreshed successfully!');
}

run().catch(err => {
    console.error('Fatal error capturing screenshots:', err);
    process.exit(1);
});

import puppeteer from 'puppeteer';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const docsImgDir = path.join(__dirname, '..', 'docs', 'images');

const baseUrl = (process.env.STREAMPULSE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');

async function run() {
    console.log(`Connecting to ${baseUrl} to capture documentation screenshots...`);
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1600,1000']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 2 });
    page.on('dialog', async d => { await d.accept(); });

    const targets = [
        {
            url: `${baseUrl}/dashboard.html`,
            file: 'dashboard.png',
            wait: 1500
        },
        {
            url: `${baseUrl}/custom-overlay-editor.html`,
            file: 'custom-overlay-studio.png',
            wait: 2000
        },
        {
            url: `${baseUrl}/randomizer-editor.html`,
            file: 'randomizer-studio.png',
            wait: 1500
        },
        {
            url: `${baseUrl}/credits-editor.html`,
            file: 'credits-studio.png',
            wait: 1500
        },
        {
            url: `${baseUrl}/game-plan-editor.html`,
            file: 'game-plan-studio.png',
            wait: 2000,
            action: async (p) => {
                // Click calendar view if available for extra visual pop
                await p.evaluate(() => {
                    const calBtn = document.querySelector('[data-view="calendar"]');
                    if (calBtn) calBtn.click();
                });
                await new Promise(r => setTimeout(r, 1000));
            }
        },
        {
            url: `${baseUrl}/analytics.html`,
            file: 'community-directory.png',
            wait: 1500,
            action: async (p) => {
                // Switch to Community Directory tab
                await p.evaluate(() => {
                    const crmTab = document.querySelector('.tab-btn[data-tab="crm"]');
                    if (crmTab) crmTab.click();
                });
                await new Promise(r => setTimeout(r, 1000));
            }
        },
        {
            url: `${baseUrl}/alert-queue.html`,
            file: 'alert-queue.png',
            wait: 1500
        }
    ];

    for (const target of targets) {
        try {
            console.log(`Capturing ${target.url} -> ${target.file}...`);
            await page.goto(target.url, { waitUntil: 'networkidle2', timeout: 30000 });
            if (target.wait) {
                await new Promise(r => setTimeout(r, target.wait));
            }
            if (target.action) {
                await target.action(page);
            }
            const outPath = path.join(docsImgDir, target.file);
            await page.screenshot({ path: outPath, fullPage: false });
            console.log(`Saved: ${outPath}`);
        } catch (err) {
            console.error(`Failed capturing ${target.file}:`, err.message);
        }
    }

    await browser.close();
    console.log('All screenshots captured successfully!');
}

run().catch(err => {
    console.error('Fatal error capturing screenshots:', err);
    process.exit(1);
});

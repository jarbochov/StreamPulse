import puppeteer from 'puppeteer';
import { execSync } from 'child_process';
import fs from 'fs';

const baseUrl = (process.env.STREAMPULSE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const artifactDir = '/Users/jaredacherup/.gemini/antigravity-cli/brain/1124f4e5-e872-47d9-8fc6-aab167e140a9';

async function run() {
    console.log('Starting visual verification of radial options and inner shadow under border...');
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    try {
        // --- 1. Live Overlay Verification on border-showcase ---
        console.log('Loading border-showcase overlay...');
        await page.goto(`${baseUrl}/custom-overlay.html?id=border-showcase&preview=true`, { waitUntil: 'networkidle0', timeout: 30000 });
        await page.waitForSelector('.overlay-element');

        // Check DOM state of elements
        const elementsInfo = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('.overlay-element')).map(el => {
                const inner = el.querySelector('[data-inner-glow]');
                const fx = el.querySelector('[data-border-fx-ring]');
                return {
                    id: el.id || el.dataset.id,
                    text: el.textContent.trim().split('\n')[0],
                    border: el.style.border,
                    hasInner: !!inner,
                    innerInset: inner?.style.inset,
                    innerZIndex: inner?.style.zIndex,
                    innerShadow: inner?.style.boxShadow,
                    hasFx: !!fx,
                    fxZIndex: fx?.style.zIndex,
                    fxAnimation: fx?.style.animation,
                    fxBackground: fx?.style.background
                };
            });
        });

        console.log('Showcase elements evaluated:', JSON.stringify(elementsInfo, null, 2));

        // Capture Frame 1 (t=0)
        const frame1Path = `${artifactDir}/screenshot-chrome-showcase-radial-f1.png`;
        await page.screenshot({ path: frame1Path });
        console.log(`Saved ${frame1Path}`);

        // Wait 1.5 seconds for radial orbit to travel
        await new Promise(r => setTimeout(r, 1500));

        // Capture Frame 2 (t=1.5s)
        const frame2Path = `${artifactDir}/screenshot-chrome-showcase-radial-f2.png`;
        await page.screenshot({ path: frame2Path });
        console.log(`Saved ${frame2Path}`);

        // Zoomed crop of inner shadow under static border
        const staticInnerEl = await page.$('#elem-innershadow-static') || (await page.$$('.overlay-element'))[9];
        if (staticInnerEl) {
            await staticInnerEl.screenshot({ path: `${artifactDir}/screenshot-crop-inner-shadow-under-static-border.png` });
            console.log('Saved screenshot-crop-inner-shadow-under-static-border.png');
        }

        // Zoomed crop of inner shadow under animated radial border
        const animInnerEl = await page.$('#elem-innershadow-animated') || (await page.$$('.overlay-element'))[10];
        if (animInnerEl) {
            await animInnerEl.screenshot({ path: `${artifactDir}/screenshot-crop-inner-shadow-under-radial-border.png` });
            console.log('Saved screenshot-crop-inner-shadow-under-radial-border.png');
        }

        // Zoomed crop of zero-border inner shadow
        const zeroBorderEl = await page.$('#elem-innershadow-fill') || (await page.$$('.overlay-element'))[8];
        if (zeroBorderEl) {
            await zeroBorderEl.screenshot({ path: `${artifactDir}/screenshot-crop-inner-shadow-zero-border.png` });
            console.log('Saved screenshot-crop-inner-shadow-zero-border.png');
        }

        // Zoomed crop of radial spotlight
        const radSpotEl = await page.$('#elem-rad-spot') || (await page.$$('.overlay-element'))[4];
        if (radSpotEl) {
            await radSpotEl.screenshot({ path: `${artifactDir}/screenshot-crop-radial-spotlight.png` });
            console.log('Saved screenshot-crop-radial-spotlight.png');
        }

        // Zoomed crop of radial two-tone
        const radTwoToneEl = await page.$('#elem-rad-twotone') || (await page.$$('.overlay-element'))[5];
        if (radTwoToneEl) {
            await radTwoToneEl.screenshot({ path: `${artifactDir}/screenshot-crop-radial-twotone.png` });
            console.log('Saved screenshot-crop-radial-twotone.png');
        }

        // Zoomed crop of radial rainbow
        const radRainbowEl = await page.$('#elem-rad-rainbow') || (await page.$$('.overlay-element'))[6];
        if (radRainbowEl) {
            await radRainbowEl.screenshot({ path: `${artifactDir}/screenshot-crop-radial-rainbow.png` });
            console.log('Saved screenshot-crop-radial-rainbow.png');
        }

        // --- 2. Custom Overlay Editor UI Verification ---
        console.log('Loading Editor to verify inspector controls...');
        await page.goto(`${baseUrl}/editors/custom-overlay-editor.html?id=border-showcase`, { waitUntil: 'networkidle0', timeout: 30000 });
        await page.waitForSelector('#stage');
        await new Promise(r => setTimeout(r, 1000));

        // Click element elem-rad-twotone in editor canvas
        await page.evaluate(() => {
            const el = document.querySelector('[data-id="elem-rad-twotone"]');
            if (el) {
                el.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));
                el.dispatchEvent(new window.MouseEvent('mouseup', { bubbles: true }));
                el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
            }
        });
        await new Promise(r => setTimeout(r, 600));

        // Capture Editor with Radial Two-Tone selected
        await page.screenshot({ path: `${artifactDir}/screenshot-editor-radial-twotone-inspector.png` });
        console.log('Saved screenshot-editor-radial-twotone-inspector.png');

        // Capture properties panel zoomed
        const propPanel = await page.$('#properties');
        if (propPanel) {
            await propPanel.screenshot({ path: `${artifactDir}/screenshot-inspector-radial-controls.png` });
            console.log('Saved screenshot-inspector-radial-controls.png');
        }

        // Click element elem-innershadow-static to verify inner shadow controls
        await page.evaluate(() => {
            const el = document.querySelector('[data-id="elem-innershadow-static"]');
            if (el) {
                el.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));
                el.dispatchEvent(new window.MouseEvent('mouseup', { bubbles: true }));
                el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
            }
        });
        await new Promise(r => setTimeout(r, 600));

        if (propPanel) {
            await propPanel.screenshot({ path: `${artifactDir}/screenshot-inspector-innershadow-controls.png` });
            console.log('Saved screenshot-inspector-innershadow-controls.png');
        }

    } finally {
        await browser.close();
    }

    // --- 3. Safari (WebKit) Live Verification ---
    try {
        console.log('Running Safari verification...');
        const safariUrl = `${baseUrl}/custom-overlay.html?id=border-showcase&preview=true`;
        execSync(`osascript -e '
            tell application "Safari"
                activate
                open location "${safariUrl}"
                delay 3
            end tell
        '`);
        const safariOut = `${artifactDir}/screenshot-safari-showcase-radial.png`;
        execSync(`screencapture -x -o -l$(osascript -e 'tell application "Safari" to id of window 1') "${safariOut}" 2>/dev/null || screencapture -x "${safariOut}"`);
        console.log(`Saved ${safariOut}`);
    } catch (e) {
        console.warn('Safari capture note:', e.message);
    }

    console.log('All verification tasks finished successfully.');
}

run().catch(err => {
    console.error('Verification error:', err);
    process.exit(1);
});

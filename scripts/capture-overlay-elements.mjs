import puppeteer from 'puppeteer';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const docsImgDir = path.join(__dirname, '..', 'docs', 'images');
const baseUrl = (process.env.STREAMPULSE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');

async function run() {
    console.log('Launching browser to capture custom overlay element screenshots...');
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });

    // Open Custom Overlay Editor
    console.log(`Navigating to ${baseUrl}/custom-overlay-editor.html...`);
    await page.goto(`${baseUrl}/custom-overlay-editor.html`, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 1200));

    // 1. Capture the Add Element Mega Menu open
    console.log('Capturing Add Element Menu...');
    await page.evaluate(() => {
        const btn = document.getElementById('add-element');
        if (btn) btn.click();
    });
    await new Promise(r => setTimeout(r, 400));
    await page.screenshot({ path: path.join(docsImgDir, 'overlay-elements-menu.png') });
    console.log('Saved overlay-elements-menu.png');

    // Close menu
    await page.evaluate(() => {
        const btn = document.getElementById('add-element');
        if (btn && btn.getAttribute('aria-expanded') === 'true') btn.click();
    });
    await new Promise(r => setTimeout(r, 300));

    // 2. Select Text element and open Placeholder Picker Modal
    console.log('Selecting Text element...');
    await page.evaluate(() => {
        const S = window.OverlayEditor?.state;
        if (S) {
            S.overlay.elements.push({
                id: 'el-text-demo',
                type: 'text',
                x: 80,
                y: 80,
                width: 600,
                height: 120,
                content: '{{stream.title}} · {{viewers.current}} Viewers',
                style: {
                    fontSize: 32,
                    fontFamily: "'Silkscreen', monospace",
                    fontWeight: '700',
                    color: '#6366f1',
                    textShadow: { blur: 12, color: 'rgba(99, 102, 241, 0.6)' },
                    background: 'rgba(15, 20, 34, 0.9)',
                    borderRadius: 12,
                    borderWidth: 2,
                    borderColor: '#1e293b',
                    padding: 16
                }
            });
            S.selectedIds = new Set(['el-text-demo']);
            window.OverlayEditor.canvas?.renderCanvas();
            window.OverlayEditor.inspector?.renderProperties();
            window.OverlayEditor.layers?.renderLayers();
        }
    });
    await new Promise(r => setTimeout(r, 600));
    await page.screenshot({ path: path.join(docsImgDir, 'overlay-text-inspector.png') });
    console.log('Saved overlay-text-inspector.png');

    console.log('Capturing Placeholder Picker dialog...');
    await page.evaluate(() => {
        const btn = document.getElementById('open-variables');
        if (btn) btn.click();
    });
    await new Promise(r => setTimeout(r, 700));
    const modalVisible = await page.evaluate(() => {
        const modal = document.querySelector('.modal-wrap, .dialog-backdrop, #placeholders-modal, .placeholders-modal, [role="dialog"]');
        return modal && getComputedStyle(modal).display !== 'none';
    });
    if (modalVisible) {
        await page.screenshot({ path: path.join(docsImgDir, 'overlay-placeholder-picker.png') });
        console.log('Saved overlay-placeholder-picker.png');
        await page.keyboard.press('Escape');
        await new Promise(r => setTimeout(r, 400));
    }

    // 3. Setup a rich demo scene with diverse elements on canvas
    console.log('Configuring rich demo elements on canvas...');
    await page.evaluate(() => {
        if (window.OverlayEditor && window.OverlayEditor.state) {
            const S = window.OverlayEditor.state;
            S.overlay.name = 'Broadcast Studio Master Scene';
            S.overlay.elements = [
                // Webcam cutout
                {
                    id: 'el-cam-cutout',
                    type: 'cutout',
                    x: 60,
                    y: 60,
                    width: 480,
                    height: 270,
                    cutout: { shape: 'rectangle', feather: 0 },
                    style: {
                        borderRadius: 16,
                        borderWidth: 3,
                        borderColor: '#6366f1',
                        borderGlow: { enabled: true, color: '#6366f1', blur: 16, spread: 2 },
                        innerShadow: { enabled: true, color: 'rgba(0,0,0,0.7)', blur: 12 }
                    }
                },
                // Game Plan card widget
                {
                    id: 'el-game-plan',
                    type: 'game-list',
                    x: 60,
                    y: 360,
                    width: 520,
                    height: 320,
                    gameList: {
                        layout: 'columns',
                        listId: 'scheduled',
                        coverFit: 'cover',
                        coverScale: 100,
                        showTitles: true,
                        showDates: true
                    },
                    style: {
                        background: 'rgba(15, 20, 34, 0.85)',
                        borderRadius: 14,
                        borderWidth: 1,
                        borderColor: '#1e293b'
                    }
                },
                // Progress Ring
                {
                    id: 'el-sub-goal',
                    type: 'progress',
                    x: 620,
                    y: 60,
                    width: 280,
                    height: 120,
                    progress: {
                        mode: 'bar',
                        valueToken: '{{goal.subscriber-goal.percent}}',
                        trackColor: '#1e293b',
                        fillColor: '#10b981',
                        label: 'Sub Goal · 85%',
                        showText: true
                    },
                    style: {
                        background: 'rgba(15, 20, 34, 0.85)',
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: '#1e293b',
                        padding: 12
                    }
                },
                // Dynamic QR code
                {
                    id: 'el-qr',
                    type: 'qr',
                    x: 620,
                    y: 210,
                    width: 140,
                    height: 140,
                    qr: {
                        text: 'https://twitch.tv/PixelKnight',
                        fg: '#ffffff',
                        bg: 'transparent',
                        ecc: 'M',
                        margin: 1
                    },
                    style: {
                        background: 'rgba(15, 20, 34, 0.85)',
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: '#1e293b',
                        padding: 8
                    }
                },
                // Styled Text element
                {
                    id: 'el-title-text',
                    type: 'text',
                    x: 60,
                    y: 710,
                    width: 700,
                    height: 90,
                    content: '{{stream.title}} · Now Playing {{stream.category}}',
                    style: {
                        fontSize: 26,
                        fontFamily: "'Segoe UI', sans-serif",
                        fontWeight: '700',
                        color: '#f8fafc',
                        textShadow: { blur: 8, color: 'rgba(0,0,0,0.8)' },
                        background: 'linear-gradient(90deg, rgba(99, 102, 241, 0.25) 0%, transparent 100%)',
                        borderRadius: 8,
                        padding: 12
                    }
                }
            ];
            // Select the camera cutout to showcase Inspector
            S.selectedIds = new Set(['el-cam-cutout']);
            if (window.OverlayEditor.canvas && typeof window.OverlayEditor.canvas.renderCanvas === 'function') {
                window.OverlayEditor.canvas.renderCanvas();
            }
            if (window.OverlayEditor.inspector && typeof window.OverlayEditor.inspector.renderProperties === 'function') {
                window.OverlayEditor.inspector.renderProperties();
            }
            if (window.OverlayEditor.layers && typeof window.OverlayEditor.layers.renderLayers === 'function') {
                window.OverlayEditor.layers.renderLayers();
            }
        }
    });
    await new Promise(r => setTimeout(r, 1000));

    // 4. Capture Cutout Webcam frame selected
    console.log('Capturing Cutout element in Editor...');
    await page.screenshot({ path: path.join(docsImgDir, 'overlay-cutout-webcam.png') });
    console.log('Saved overlay-cutout-webcam.png');

    // 5. Select and showcase Game Plan element
    console.log('Selecting Game Plan element...');
    await page.evaluate(() => {
        const S = window.OverlayEditor?.state;
        if (S) {
            S.selectedIds = new Set(['el-game-plan']);
            window.OverlayEditor.inspector?.renderProperties();
            window.OverlayEditor.layers?.renderLayers();
        }
    });
    await new Promise(r => setTimeout(r, 800));
    await page.screenshot({ path: path.join(docsImgDir, 'overlay-game-plan-cards.png') });
    console.log('Saved overlay-game-plan-cards.png');

    // 6. Select and showcase Shaders & Retro FX on a media layer
    console.log('Configuring Retro Display Shaders...');
    await page.evaluate(() => {
        const S = window.OverlayEditor?.state;
        if (S) {
            // Add a video/image retro layer
            S.overlay.elements.push({
                id: 'el-retro-display',
                type: 'image',
                x: 940,
                y: 60,
                width: 440,
                height: 330,
                src: '/local-file?path=demo-screen.png',
                mediaFilter: {
                    retro: {
                        display: 'crt',
                        crtMask: 'scanlines',
                        curvature: true,
                        static: true,
                        vhs: true,
                        bloom: 30
                    }
                },
                style: {
                    borderRadius: 16,
                    borderWidth: 2,
                    borderColor: '#38bdf8'
                }
            });
            S.selectedIds = new Set(['el-retro-display']);
            window.OverlayEditor.canvas?.renderCanvas();
            window.OverlayEditor.inspector?.renderProperties();
            window.OverlayEditor.layers?.renderLayers();
        }
    });
    await new Promise(r => setTimeout(r, 800));
    await page.screenshot({ path: path.join(docsImgDir, 'overlay-retro-shaders.png') });
    console.log('Saved overlay-retro-shaders.png');

    await browser.close();
    console.log('All overlay element screenshots captured successfully!');
}

run().catch(err => {
    console.error('Fatal error capturing overlay element screenshots:', err);
    process.exit(1);
});

import puppeteer from 'puppeteer';

const baseUrl = (process.env.STREAMPULSE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const artifactDir = '/Users/jaredacherup/.gemini/antigravity-cli/brain/1124f4e5-e872-47d9-8fc6-aab167e140a9';

async function run() {
    console.log('Verifying visual outcome on live overlay...');
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    try {
        await page.goto(`${baseUrl}/custom-overlay.html?id=new-overlay-3&preview=true`, { waitUntil: 'networkidle0', timeout: 30000 });
        await page.waitForSelector('.overlay-element');

        // Inspect elements on page
        const elementReport = await page.evaluate(() => {
            const els = Array.from(document.querySelectorAll('.overlay-element'));
            return els.map((el, i) => {
                const rect = el.getBoundingClientRect();
                const fxRing = el.querySelector('[data-border-fx-ring]');
                const gradRing = el.querySelector('[data-border-ring]');
                const innerGlow = el.querySelector('[data-inner-glow]');
                const cs = window.getComputedStyle(el);
                return {
                    index: i,
                    id: el.id || el.dataset.id,
                    type: el.dataset.type,
                    rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
                    computedBorder: cs.border,
                    computedBoxShadow: cs.boxShadow,
                    hasFxRing: !!fxRing,
                    fxRingStyle: fxRing ? {
                        border: fxRing.style.border,
                        background: fxRing.style.background,
                        animation: fxRing.style.animation,
                        mask: fxRing.style.mask || fxRing.style.webkitMask,
                        rect: fxRing.getBoundingClientRect()
                    } : null,
                    hasGradRing: !!gradRing,
                    hasInnerGlow: !!innerGlow,
                    innerGlowStyle: innerGlow ? {
                        boxShadow: innerGlow.style.boxShadow,
                        rect: innerGlow.getBoundingClientRect()
                    } : null
                };
            });
        });

        console.log('Element Report on new-overlay-3:');
        console.dir(elementReport, { depth: 5 });

        // Capture full HD live screenshot
        await page.screenshot({ path: `${artifactDir}/screenshot-live-new-overlay-3-outcome.png` });
        console.log(`Saved screenshot-live-new-overlay-3-outcome.png`);

        // If element 0 exists, capture a cropped zoom of element 0
        const el0 = await page.$('.overlay-element');
        if (el0) {
            await el0.screenshot({ path: `${artifactDir}/screenshot-live-element-0-zoom.png` });
            console.log(`Saved screenshot-live-element-0-zoom.png`);
        }

    } finally {
        await browser.close();
    }
}

run().catch(err => {
    console.error('Error verifying outcome:', err);
    process.exit(1);
});

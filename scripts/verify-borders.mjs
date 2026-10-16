import puppeteer from 'puppeteer';
import fs from 'fs';

const baseUrl = (process.env.STREAMPULSE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');

async function run() {
    console.log('Testing border enhancements in custom overlay...');
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    page.on('console', msg => console.log('BROWSER:', msg.text()));

    try {
        await page.goto(`${baseUrl}/editors/custom-overlay-editor.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForSelector('#stage');

        // Verify editor loaded OverlayShared with border methods and constants
        const sharedCheck = await page.evaluate(() => {
            return {
                hasApplyBorderEffects: typeof window.OverlayShared?.applyBorderEffects === 'function',
                borderStyles: window.OverlayShared?.BORDER_STYLES,
                borderAnimTypes: window.OverlayShared?.BORDER_ANIM_TYPES
            };
        });
        console.log('OverlayShared border support:', sharedCheck);
        if (!sharedCheck.hasApplyBorderEffects) throw new Error('OverlayShared.applyBorderEffects is missing');

        // Test creating an overlay with various borders and verifying rendering
        const testResults = await page.evaluate(() => {
            const results = {};
            const container = document.createElement('div');
            container.style.position = 'relative';
            container.style.width = '400px';
            container.style.height = '300px';
            document.body.appendChild(container);

            const testNode = document.createElement('div');
            testNode.style.width = '200px';
            testNode.style.height = '150px';
            testNode.style.position = 'absolute';
            container.appendChild(testNode);

            // Test 1: Border Styles
            const styles = window.OverlayShared.BORDER_STYLES;
            results.borderStyles = {};
            for (const st of styles) {
                window.OverlayShared.applyBorderEffects(testNode, {
                    borderWidth: 4,
                    borderStyle: st,
                    borderColor: '#ff0055'
                });
                results.borderStyles[st] = {
                    borderStyle: testNode.style.borderStyle,
                    borderWidth: testNode.style.borderWidth,
                    borderColor: testNode.style.borderColor
                };
            }

            // Test 2: Border Glow & Neon Core + Inner Glow Overlay
            window.OverlayShared.applyBorderEffects(testNode, {
                borderWidth: 4,
                borderStyle: 'solid',
                borderColor: '#00ffff',
                borderGlow: { enabled: true, color: '#00ffff', blur: 20, spread: 4, neon: true, inner: true }
            });
            results.neonGlow = {
                boxShadow: testNode.style.boxShadow,
                hasWhiteCore: testNode.style.boxShadow.includes('rgb(255, 255, 255)') || testNode.style.boxShadow.includes('#ffffff'),
                hasColor: testNode.style.boxShadow.includes('rgb(0, 255, 255)') || testNode.style.boxShadow.includes('#00ffff'),
                hasInnerRing: !!testNode._innerGlowRing,
                innerShadow: testNode._innerGlowRing?.style.boxShadow || '',
                hasInnerWhiteCore: (testNode._innerGlowRing?.style.boxShadow || '').includes('#ffffff') || (testNode._innerGlowRing?.style.boxShadow || '').includes('rgb(255, 255, 255)'),
                hasInnerInset: (testNode._innerGlowRing?.style.boxShadow || '').includes('inset')
            };

            // Test 3: Animated Borders
            // 3A: Rotating beam (conic spotlight)
            window.OverlayShared.applyBorderEffects(testNode, {
                borderWidth: 4,
                borderStyle: 'solid',
                borderColor: '#1f6feb',
                borderAnimation: { type: 'rotating', speed: 3, color2: '#ffffff', size: 40 }
            });
            const rotatingRing = testNode._borderFxRing;
            results.rotating = {
                hasRing: !!rotatingRing,
                animation: rotatingRing?.style.animation,
                hasMask: rotatingRing?.style.webkitMask?.includes('content-box') || rotatingRing?.style.mask?.includes('content-box'),
                isBaseBorderTransparent: testNode.style.border.includes('transparent')
            };

            // 3B: Pulsing glow (breathing)
            window.OverlayShared.applyBorderEffects(testNode, {
                borderWidth: 4,
                borderStyle: 'solid',
                borderColor: '#ff00aa',
                borderAnimation: { type: 'pulsing', speed: 2 }
            });
            const pulseRing = testNode._borderFxRing;
            results.pulsing = {
                hasRing: !!pulseRing,
                animation: pulseRing?.style.animation,
                isBaseBorderTransparent: testNode.style.border.includes('transparent')
            };

            // 3C: Gradient sweep with middle color
            window.OverlayShared.applyBorderEffects(testNode, {
                borderWidth: 4,
                borderStyle: 'solid',
                borderColor: '#10b981',
                borderAnimation: { type: 'gradient', speed: 4, color2: '#6366f1', color3: '#f59e0b' }
            });
            const gradRing = testNode._borderFxRing;
            results.gradient = {
                hasRing: !!gradRing,
                animation: gradRing?.style.animation,
                hasMidColor: gradRing?.style.background.includes('245, 158, 11') || gradRing?.style.background.includes('#f59e0b') || gradRing?.style.background.includes('rgb(245, 158, 11)'),
                isBaseBorderTransparent: testNode.style.border.includes('transparent')
            };

            // 3D: Sweeping gradient via borderGradient with middle color
            window.OverlayShared.applyBorderEffects(testNode, {
                borderWidth: 4,
                borderGradient: { enabled: true, from: '#ff0055', mid: '#ffee00', to: '#00bbff', animate: true, speed: 5 }
            });
            const borderGradRing = testNode._borderRing;
            results.borderGradientMid = {
                hasRing: !!borderGradRing,
                animation: borderGradRing?.style.animation,
                hasMidColor: borderGradRing?.style.background.includes('255, 238, 0') || borderGradRing?.style.background.includes('#ffee00') || borderGradRing?.style.background.includes('rgb(255, 238, 0)')
            };

            // 3E: Rainbow cycle
            window.OverlayShared.applyBorderEffects(testNode, {
                borderWidth: 4,
                borderStyle: 'solid',
                borderColor: '#ff0000',
                borderAnimation: { type: 'rainbow', speed: 5 }
            });
            const rainbowRing = testNode._borderFxRing;
            results.rainbow = {
                hasRing: !!rainbowRing,
                animation: rainbowRing?.style.animation,
                isBaseBorderTransparent: testNode.style.border.includes('transparent')
            };

            // 3F: Marching ants
            window.OverlayShared.applyBorderEffects(testNode, {
                borderWidth: 3,
                borderStyle: 'dashed',
                borderColor: '#f59e0b',
                borderAnimation: { type: 'marching', speed: 2 }
            });
            const marchingRing = testNode._borderFxRing;
            const svgRect = marchingRing?.querySelector('svg rect');
            results.marching = {
                hasRing: !!marchingRing,
                hasSvg: !!marchingRing?.querySelector('svg'),
                hasRect: !!svgRect,
                animation: svgRect?.style?.animation || svgRect?.getAttribute('style'),
                isBaseBorderTransparent: testNode.style.border.includes('transparent')
            };

            // Test 4: Teardown
            window.OverlayShared.applyBorderEffects(testNode, {
                borderWidth: 0
            });
            results.teardown = {
                noRing: !testNode._borderFxRing,
                noInnerRing: !testNode._innerGlowRing,
                noBorderGradRing: !testNode._borderRing,
                noBorder: testNode.style.border === '0px' || testNode.style.border === 'none' || testNode.style.border === '',
                noShadow: testNode.style.boxShadow === 'none' || testNode.style.boxShadow === ''
            };

            container.remove();
            return results;
        });

        console.log('Test results:', JSON.stringify(testResults, null, 2));

        // Assertions
        for (const [st, val] of Object.entries(testResults.borderStyles)) {
            if (val.borderStyle !== st) throw new Error(`Border style ${st} failed to apply, got ${val.borderStyle}`);
        }
        if (!testResults.neonGlow.hasWhiteCore || !testResults.neonGlow.hasInnerRing || !testResults.neonGlow.hasInnerInset) {
            throw new Error('Neon glow / inner glow failed assertions: ' + JSON.stringify(testResults.neonGlow));
        }
        if (!testResults.rotating.hasRing || !testResults.rotating.animation.includes('sp-border-spin')) {
            throw new Error('Rotating border animation failed: ' + JSON.stringify(testResults.rotating));
        }
        if (!testResults.pulsing.hasRing || !testResults.pulsing.animation.includes('sp-border-pulse')) {
            throw new Error('Pulsing border animation failed: ' + JSON.stringify(testResults.pulsing));
        }
        if (!testResults.gradient.hasRing || !testResults.gradient.animation.includes('sp-border-gradient-shift') || !testResults.gradient.hasMidColor) {
            throw new Error('Gradient border animation with middle color failed: ' + JSON.stringify(testResults.gradient));
        }
        if (!testResults.borderGradientMid.hasRing || !testResults.borderGradientMid.hasMidColor) {
            throw new Error('Sweeping borderGradient with middle color failed: ' + JSON.stringify(testResults.borderGradientMid));
        }
        if (!testResults.rainbow.hasRing || !testResults.rainbow.animation.includes('sp-border-rainbow')) {
            throw new Error('Rainbow border animation failed: ' + JSON.stringify(testResults.rainbow));
        }
        if (!testResults.marching.hasRect || !testResults.marching.animation.includes('sp-border-marching')) {
            throw new Error('Marching border animation failed: ' + JSON.stringify(testResults.marching));
        }
        if (!testResults.teardown.noRing || !testResults.teardown.noInnerRing || !testResults.teardown.noBorderGradRing) {
            throw new Error('Teardown failed: ' + JSON.stringify(testResults.teardown));
        }

        console.log('Testing Editor Inspector UI interactions...');
        await page.goto(`${baseUrl}/editors/custom-overlay-editor.html?id=new-overlay-3`, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForSelector('#stage');
        await page.waitForSelector('.canvas-element');

        // Click the first element to select it
        await page.click('.canvas-element');
        await page.waitForSelector('#properties [data-path="style.borderWidth"]');

        // Set border width to 6
        await page.$eval('#properties [data-path="style.borderWidth"]', input => {
            input.value = '6';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
        });

        // Wait for style.borderStyle to appear in inspector
        await page.waitForSelector('#properties [data-path="style.borderStyle"]');
        console.log('Border style selector appeared after setting border width > 0');

        // Change borderStyle to dashed
        await page.select('#properties [data-path="style.borderStyle"]', 'dashed');
        console.log('Selected dashed border style');

        // Toggle border glow on
        await page.$eval('#properties [data-path="style.borderGlow.enabled"]', checkbox => {
            checkbox.checked = true;
            checkbox.dispatchEvent(new Event('input', { bubbles: true }));
            checkbox.dispatchEvent(new Event('change', { bubbles: true }));
        });

        // Wait for glow controls to expand
        await page.waitForSelector('#properties [data-path="style.borderGlow.neon"]');
        console.log('Border glow sub-controls expanded');

        // Toggle neon core on
        await page.$eval('#properties [data-path="style.borderGlow.neon"]', checkbox => {
            checkbox.checked = true;
            checkbox.dispatchEvent(new Event('input', { bubbles: true }));
            checkbox.dispatchEvent(new Event('change', { bubbles: true }));
        });

        // Select rotating animation
        await page.select('#properties [data-path="style.borderAnimation.type"]', 'rotating');
        await page.waitForSelector('#properties [data-path="style.borderAnimation.speed"]');
        console.log('Border animation controls expanded for rotating beam');

        // Verify canvas element got border effects and beam
        const canvasFx = await page.evaluate(() => {
            const el = document.querySelector('.canvas-element.selected');
            const fxRing = el?._borderFxRing;
            return {
                borderWidth: el?.style.borderWidth,
                boxShadow: el?.style.boxShadow,
                hasRing: !!fxRing,
                animation: fxRing?.style.animation,
                hasInnerRing: !!el?._innerGlowRing
            };
        });
        console.log('Canvas element state:', canvasFx);
        if (canvasFx.borderWidth !== '6px' || !canvasFx.hasRing || !canvasFx.animation.includes('sp-border-spin')) {
            throw new Error('Canvas element did not reflect border inspector changes: ' + JSON.stringify(canvasFx));
        }

        const artifactDir = '/Users/jaredacherup/.gemini/antigravity-cli/brain/1124f4e5-e872-47d9-8fc6-aab167e140a9';
        // Scroll properties panel so border controls are in view
        await page.$eval('.rail.right', el => { el.scrollTop = 450; });
        await new Promise(r => setTimeout(r, 300));
        await page.screenshot({ path: `${artifactDir}/screenshot-editor-border-effects.png` });
        console.log('Editor Full HD screenshot saved.');

        // Also take a screenshot focused on the properties rail with animated borders
        const rail = await page.$('.rail.right');
        if (rail) {
            await page.$eval('.rail.right', el => { el.scrollTop = 450; });
            await new Promise(r => setTimeout(r, 200));
            await rail.screenshot({ path: `${artifactDir}/screenshot-inspector-border-controls.png` });

            await page.$eval('.rail.right', el => { el.scrollTop = 800; });
            await new Promise(r => setTimeout(r, 200));
            await rail.screenshot({ path: `${artifactDir}/screenshot-inspector-animated-borders.png` });
            console.log('Inspector animated borders screenshot saved.');
        }

        console.log('All border tests passed successfully!');
    } finally {
        await browser.close();
    }
}

run().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});

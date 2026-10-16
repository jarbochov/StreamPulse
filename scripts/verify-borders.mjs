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

            // 3E: Rainbow cycle (clean linear gradient border-image for sharp rect, SVG stroke for rounded)
            window.OverlayShared.applyBorderEffects(testNode, {
                borderWidth: 4,
                borderStyle: 'solid',
                borderRadius: 0,
                borderColor: '#ff0000',
                borderAnimation: { type: 'rainbow', speed: 5 }
            });
            const rainbowRing = testNode._borderFxRing;
            results.rainbow = {
                hasRing: !!rainbowRing,
                animation: rainbowRing?.style.animation,
                isLinear: (rainbowRing?.style.borderImage || rainbowRing?.style.background || '').includes('linear-gradient'),
                isBaseBorderTransparent: testNode.style.border.includes('transparent')
            };

            // 3E2: Rainbow cycle rounded (SVG vector stroke)
            window.OverlayShared.applyBorderEffects(testNode, {
                borderWidth: 4,
                borderStyle: 'solid',
                borderRadius: 16,
                borderColor: '#ff0000',
                borderAnimation: { type: 'rainbow', speed: 5 }
            });
            const rainbowRoundRing = testNode._borderFxRing;
            results.rainbowRound = {
                hasRing: !!rainbowRoundRing,
                animation: rainbowRoundRing?.style.animation,
                hasSvg: !!rainbowRoundRing?.querySelector('svg'),
                hasLinearGrad: !!rainbowRoundRing?.querySelector('linearGradient'),
                hasRect: !!rainbowRoundRing?.querySelector('rect')
            };

            // 3F: Radial rotating (radial gradient in center that rotates and is masked for border)
            window.OverlayShared.applyBorderEffects(testNode, {
                borderWidth: 4,
                borderStyle: 'solid',
                borderColor: '#38bdf8',
                borderAnimation: { type: 'radial', speed: 3, color2: '#ffffff', size: 50 }
            });
            const radialRing = testNode._borderFxRing;
            results.radial = {
                hasRing: !!radialRing,
                animation: radialRing?.style.animation,
                isRadial: radialRing?.style.background.includes('radial-gradient'),
                hasHighlight: radialRing?.style.background.includes('#ffffff') || radialRing?.style.background.includes('rgb(255, 255, 255)')
            };

            // 3G: Cycle Stability test (repeated applyBorderEffects does NOT reset or replace fxRing)
            const ringBefore = testNode._borderFxRing;
            window.OverlayShared.applyBorderEffects(testNode, {
                borderWidth: 4,
                borderStyle: 'solid',
                borderColor: '#38bdf8',
                borderAnimation: { type: 'radial', speed: 3, color2: '#ffffff', size: 50 }
            });
            const ringAfter = testNode._borderFxRing;
            results.cycleStability = {
                sameInstance: ringBefore === ringAfter,
                sigPreserved: ringBefore?._sig === ringAfter?._sig
            };

            // 3H: Marching ants
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

            // Test 4: Dedicated Inner Shadow (under border element)
            // 4A: Inner shadow with borderWidth: 0
            window.OverlayShared.applyBorderEffects(testNode, {
                borderWidth: 0,
                innerShadow: { blur: 18, spread: 3, x: 2, y: 4, color: 'rgba(0, 0, 0, 0.75)' }
            });
            results.innerShadowZeroBorder = {
                hasInnerRing: !!testNode._innerGlowRing,
                boxShadow: testNode._innerGlowRing?.style.boxShadow || '',
                hasInset: (testNode._innerGlowRing?.style.boxShadow || '').includes('inset') && (testNode._innerGlowRing?.style.boxShadow || '').includes('2px 4px 18px 3px'),
                zIndex: testNode._innerGlowRing?.style.zIndex,
                inset: testNode._innerGlowRing?.style.inset
            };

            // 4B: Inner shadow UNDER ring border (must have zIndex 1 and inset matching border width)
            window.OverlayShared.applyBorderEffects(testNode, {
                borderWidth: 10,
                borderRadius: 16,
                borderColor: '#00ffff',
                borderAnimation: { type: 'radial', mode: 'two-tone', speed: 4, direction: 'ccw', color2: '#ff00aa' },
                innerShadow: { blur: 20, spread: 4, x: 0, y: 0, color: 'rgba(0, 0, 0, 0.9)' }
            });
            const innerRingUnderRingBorder = testNode._innerGlowRing;
            const fxRingOverInnerShadow = testNode._borderFxRing;
            results.innerShadowUnderRingBorder = {
                hasInnerRing: !!innerRingUnderRingBorder,
                hasFxRing: !!fxRingOverInnerShadow,
                innerZIndex: innerRingUnderRingBorder?.style.zIndex,
                fxZIndex: fxRingOverInnerShadow?.style.zIndex,
                innerUnderFx: Number(innerRingUnderRingBorder?.style.zIndex || 0) < Number(fxRingOverInnerShadow?.style.zIndex || 0),
                innerInset: innerRingUnderRingBorder?.style.inset,
                isInsetBorderWidth: innerRingUnderRingBorder?.style.inset === '10px',
                radialMode: fxRingOverInnerShadow?.style.background.includes('rgb(255, 0, 170)') || fxRingOverInnerShadow?.style.background.includes('#ff00aa'),
                radialCcwAnim: fxRingOverInnerShadow?.style.animation.includes('sp-border-radial-circuit-rev')
            };

            // 4C: Radial Alternate and Rainbow mode
            window.OverlayShared.applyBorderEffects(testNode, {
                borderWidth: 6,
                borderAnimation: { type: 'radial', mode: 'rainbow', speed: 5, direction: 'alternate' }
            });
            const rainbowRadialRing = testNode._borderFxRing;
            results.radialRainbowAlternate = {
                hasRing: !!rainbowRadialRing,
                isAlternate: rainbowRadialRing?.style.animation.includes('alternate'),
                hasRainbowStops: rainbowRadialRing?.style.background.includes('rgb(255, 0, 85)') || rainbowRadialRing?.style.background.includes('#ff0055')
            };

            // 4D: Inner shadow UNDER static border (zIndex 1, inset 0 inside padding box)
            window.OverlayShared.applyBorderEffects(testNode, {
                borderWidth: 10,
                borderRadius: 16,
                borderStyle: 'solid',
                borderColor: '#10b981',
                innerShadow: { blur: 15, spread: 2, color: 'rgba(0, 0, 0, 0.8)' }
            });
            const innerRingStaticBorder = testNode._innerGlowRing;
            results.innerShadowUnderStaticBorder = {
                hasInnerRing: !!innerRingStaticBorder,
                innerZIndex: innerRingStaticBorder?.style.zIndex,
                innerInset: innerRingStaticBorder?.style.inset,
                hasBorderOnNode: testNode.style.border.includes('10px')
            };

            // Test 5: Teardown
            window.OverlayShared.applyBorderEffects(testNode, {
                borderWidth: 0,
                innerShadow: { blur: 0 }
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
        if (!testResults.radial.hasRing || !testResults.radial.animation.includes('sp-border-radial-circuit') || !testResults.radial.isRadial || !testResults.radial.hasHighlight) {
            throw new Error('Radial rotating animation failed: ' + JSON.stringify(testResults.radial));
        }
        if (!testResults.cycleStability.sameInstance) {
            throw new Error('Cycle stability failed (ring was recreated/reset): ' + JSON.stringify(testResults.cycleStability));
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
        if (!testResults.rainbow.hasRing || !testResults.rainbow.animation.includes('sp-border-rainbow') || !testResults.rainbow.isLinear) {
            throw new Error('Rainbow border animation failed: ' + JSON.stringify(testResults.rainbow));
        }
        if (!testResults.rainbowRound.hasSvg || !testResults.rainbowRound.hasLinearGrad || !testResults.rainbowRound.hasRect) {
            throw new Error('Rainbow rounded border SVG failed: ' + JSON.stringify(testResults.rainbowRound));
        }
        if (!testResults.marching.hasRect || !testResults.marching.animation.includes('sp-border-marching')) {
            throw new Error('Marching border animation failed: ' + JSON.stringify(testResults.marching));
        }
        if (!testResults.innerShadowZeroBorder.hasInnerRing || !testResults.innerShadowZeroBorder.hasInset) {
            throw new Error('Inner shadow with zero border failed: ' + JSON.stringify(testResults.innerShadowZeroBorder));
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
                nodeBorderWidth: el?.style.borderWidth,
                ringBorderWidth: fxRing?.style.borderWidth,
                boxShadow: el?.style.boxShadow,
                hasRing: !!fxRing,
                animation: fxRing?.style.animation,
                hasInnerRing: !!el?._innerGlowRing
            };
        });
        console.log('Canvas element state:', canvasFx);
        if (canvasFx.ringBorderWidth !== '6px' || !canvasFx.hasRing || !canvasFx.animation.includes('sp-border-spin')) {
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

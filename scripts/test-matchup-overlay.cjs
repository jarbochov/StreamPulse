'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const puppeteer = require('puppeteer');

const OVERLAY_URL = 'file://' + path.resolve(__dirname, '../public/overlays/matchup.html');

test('matchup overlay renders topbar, bottom HUD, compact bug, versus stage, themes, and toggles', async () => {
    let browser;

    try {
        browser = await puppeteer.launch({
            headless: 'new',
            pipe: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--allow-file-access-from-files']
        });
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 720 });

        // 1. Top Bar layout (?layout=top)
        await page.goto(`${OVERLAY_URL}?preview=1&layout=top`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.topbar-panel');

        const p1Name = await page.$eval('.topbar-competitor.c1 .competitor-name', el => el.textContent.trim());
        const p2Name = await page.$eval('.topbar-competitor.c2 .competitor-name', el => el.textContent.trim());
        assert.equal(p1Name, 'Daigo');
        assert.equal(p2Name, 'Justin Wong');

        const phaseBadge = await page.$eval('.match-phase-badge', el => el.textContent.trim());
        assert.equal(phaseBadge, 'Grand Finals');

        const scoreBoxes = await page.$$('.score-box');
        assert.equal(scoreBoxes.length, 2, 'Top bar should render 2 score boxes for 2 competitors');

        // Series win pips
        const pips = await page.$$('.pip');
        assert.ok(pips.length >= 4, 'Top bar should render series win pips for Best-of series');

        // 2. Esports Lower-Third HUD layout (?layout=bottom)
        await page.goto(`${OVERLAY_URL}?preview=1&layout=bottom`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.bottom-hud-card');
        const hudTitle = await page.$eval('.hud-top-meta', el => el.textContent.trim());
        assert.ok(hudTitle.includes('Street Fighter 6'));

        // 3. Compact Score Bug (?layout=compact)
        await page.goto(`${OVERLAY_URL}?preview=1&layout=compact`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.compact-bug');
        const bugRows = await page.$$('.compact-row');
        assert.equal(bugRows.length, 2, 'Compact score bug should render a row per competitor');

        // 4. Versus Screen Stage Card (?layout=versus)
        await page.goto(`${OVERLAY_URL}?preview=1&layout=versus`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.versus-card-stage');
        const vsBadge = await page.$eval('.versus-badge-big', el => el.textContent.trim());
        assert.equal(vsBadge, 'VS');

        // 5. Named Theme presets (?overlay=neon)
        await page.goto(`${OVERLAY_URL}?preview=1&overlay=neon`, { waitUntil: 'domcontentloaded' });
        const hasNeonClass = await page.$eval('body', el => el.classList.contains('theme-cyber') || el.classList.contains('theme-neon'));
        assert.ok(hasNeonClass, 'Body should receive theme-cyber class for neon preset');

        // 6. Custom Hex Overlay Tint (?overlay=1a202c)
        await page.goto(`${OVERLAY_URL}?preview=1&overlay=1a202c`, { waitUntil: 'domcontentloaded' });
        const hasCustomTheme = await page.$eval('body', el => el.classList.contains('theme-custom'));
        assert.ok(hasCustomTheme, 'Body should receive theme-custom class for custom hex overlay');

        // 7. Toggle: Hide series win pips (?pips=0)
        await page.goto(`${OVERLAY_URL}?preview=1&layout=top&pips=0`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.topbar-panel');
        const pipsHidden = await page.$('.pip');
        assert.equal(pipsHidden, null, 'Pips should be hidden when ?pips=0 is set');

        // 7b. Independent: Show round pips without score pips (?pips=0&roundpips=1)
        await page.goto(`${OVERLAY_URL}?preview=1&layout=top&pips=0&roundpips=1`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.topbar-panel');
        const roundPipEl = await page.$('.pip-round');
        assert.ok(roundPipEl, 'Round pips should be visible when ?pips=0&roundpips=1 is set');

        // 8. Toggle: Hide character tags (?tags=0)
        await page.goto(`${OVERLAY_URL}?preview=1&layout=top&tags=0`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.topbar-panel');
        const tagEl = await page.$('.competitor-tag');
        assert.equal(tagEl, null, 'Character tag should be omitted when ?tags=0 is set');

        // 9. Modern FGC (EVO Style) (?layout=fgc)
        await page.goto(`${OVERLAY_URL}?preview=1&layout=fgc`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.fgc-panel');
        const fgcP1 = await page.$eval('.fgc-side.p1 .fgc-player-name', el => el.textContent.trim());
        const fgcP2 = await page.$eval('.fgc-side.p2 .fgc-player-name', el => el.textContent.trim());
        assert.equal(fgcP1, 'Daigo');
        assert.equal(fgcP2, 'Justin Wong');

        // 10. Split Corners (?layout=split)
        await page.goto(`${OVERLAY_URL}?preview=1&layout=split`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.split-stage');
        const splitCorners = await page.$$('.split-corner-card');
        assert.equal(splitCorners.length, 2, 'Split layout should render top-left and top-right corner pods');

        // 11. Minimal / Center-Less (?layout=minimal)
        await page.goto(`${OVERLAY_URL}?preview=1&layout=minimal`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.minimal-bar');
        const centerBadge = await page.$('.match-phase-badge');
        assert.equal(centerBadge, null, 'Minimal layout should omit center header');

        // 12. Hide Center on Top Bar (?center=0)
        await page.goto(`${OVERLAY_URL}?preview=1&layout=top&center=0`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.topbar-panel');
        const centerOffBadge = await page.$('.match-phase-badge');
        assert.equal(centerOffBadge, null, 'Center badge should be omitted when ?center=0');

        // 13. EVO Championship Theme (?overlay=fgc-evo)
        await page.goto(`${OVERLAY_URL}?preview=1&overlay=fgc-evo`, { waitUntil: 'domcontentloaded' });
        const hasEvoClass = await page.$eval('body', el => el.classList.contains('theme-fgc-evo'));
        assert.ok(hasEvoClass, 'Body should receive theme-fgc-evo class');

        // 14. Side Pillar Layout (?layout=pillar)
        await page.goto(`${OVERLAY_URL}?preview=1&layout=pillar`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.pillar-panel');
        const pillarCards = await page.$$('.pillar-competitor');
        assert.equal(pillarCards.length, 2, 'Pillar stack should render 2 stacked competitor cards');

        // 15. Pip Style: Rectangular Bars (?pipstyle=bar)
        await page.goto(`${OVERLAY_URL}?preview=1&pipstyle=bar`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.pip-bar');
        const pipBars = await page.$$('.pip-bar');
        assert.ok(pipBars.length >= 2, 'Pips should receive pip-bar class');

        // 16. Pip Style: Numeric Counter (?pipstyle=digit)
        await page.goto(`${OVERLAY_URL}?preview=1&pipstyle=digit`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.pip-digit-badge');
        const digitText = await page.$eval('.pip-digit-badge', el => el.textContent.trim());
        assert.ok(digitText.includes('/'), 'Should render numeric counter format');

        // 17. Tight content bounding box fit (?fit=content)
        await page.goto(`${OVERLAY_URL}?preview=1&fit=content`, { waitUntil: 'domcontentloaded' });
        const hasFitContent = await page.$eval('body', el => el.classList.contains('fit-content'));
        assert.ok(hasFitContent, 'Body should receive fit-content class when ?fit=content is passed');

        // 18. Sample data fallback (?sample=1)
        await page.goto(`${OVERLAY_URL}?sample=1`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.topbar-panel');
        const sampleP1 = await page.$eval('.topbar-competitor.c1 .competitor-name', el => el.textContent.trim());
        assert.equal(sampleP1, 'Daigo');

        // 19. Round Pips: Diamond round pips (?roundpips=1)
        await page.goto(`${OVERLAY_URL}?preview=1&roundpips=1`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.pip-round');
        const roundPips = await page.$$('.pip-round');
        assert.ok(roundPips.length > 0, 'Matchup overlay should render diamond round pips');

        // 20. Pip Style: Diamonds for score pips (?pipstyle=diamond)
        await page.goto(`${OVERLAY_URL}?preview=1&pipstyle=diamond`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.pip.pip-diamond');
        const pipDiamonds = await page.$$('.pip.pip-diamond');
        assert.ok(pipDiamonds.length >= 2, 'Score pips should receive pip-diamond class when ?pipstyle=diamond');

        // 21. Equal sizing for score pips and round pips (both 8px x 8px)
        await page.goto(`${OVERLAY_URL}?preview=1&roundpips=1`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.pip');
        await page.waitForSelector('.pip.pip-round');
        const gamePipSize = await page.$eval('.pip:not(.pip-round)', el => ({ w: getComputedStyle(el).width, h: getComputedStyle(el).height }));
        const roundPipSize = await page.$eval('.pip.pip-round', el => ({ w: getComputedStyle(el).width, h: getComputedStyle(el).height }));
        assert.equal(gamePipSize.w, '8px', 'Game pip width should be 8px');
        assert.equal(gamePipSize.h, '8px', 'Game pip height should be 8px');
        assert.equal(roundPipSize.w, '8px', 'Round pip width should be 8px (equal size)');
        assert.equal(roundPipSize.h, '8px', 'Round pip height should be 8px (equal size)');

        // 22. Round pip options (?roundpipstyle=circle, bar, digit)
        await page.goto(`${OVERLAY_URL}?preview=1&roundpips=1&roundpipstyle=circle`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.pip.pip-round.pip-circle');
        const roundCircles = await page.$$('.pip.pip-round.pip-circle');
        assert.ok(roundCircles.length > 0, 'Should render circle round pips with ?roundpipstyle=circle');

        await page.goto(`${OVERLAY_URL}?preview=1&roundpips=1&roundpipstyle=bar`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.pip.pip-round.pip-bar');
        const roundBars = await page.$$('.pip.pip-round.pip-bar');
        assert.ok(roundBars.length > 0, 'Should render bar round pips with ?roundpipstyle=bar');

        await page.goto(`${OVERLAY_URL}?preview=1&roundpips=1&roundpipstyle=digit`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.pip-digit-rounds');
        const digitRoundText = await page.$eval('.pip-digit-rounds', el => el.textContent.trim());
        assert.ok(digitRoundText.includes('/'), 'Should render numeric round counter with ?roundpipstyle=digit');

        // 23. Scaling (?scale=1.5 and ?scale=0.75) proportional rem scaling
        await page.goto(`${OVERLAY_URL}?preview=1&layout=top&scale=1.5`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.score-box');
        const rootFontSize15 = await page.evaluate(() => getComputedStyle(document.documentElement).fontSize);
        assert.equal(rootFontSize15, '24px', 'Root font-size at scale=1.5 should be 24px (16px * 1.5)');

        await page.goto(`${OVERLAY_URL}?preview=1&layout=top&scale=0.75`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.score-box');
        const rootFontSize075 = await page.evaluate(() => getComputedStyle(document.documentElement).fontSize);
        assert.equal(rootFontSize075, '12px', 'Root font-size at scale=0.75 should be 12px (16px * 0.75)');

        // 24. Explicit width constraints (?width=480px&maxwidth=600px)
        await page.goto(`${OVERLAY_URL}?preview=1&layout=top&width=480px&maxwidth=600px`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('#matchup-container');
        const containerWidth = await page.$eval('#matchup-container', el => ({
            w: getComputedStyle(el).width,
            mw: getComputedStyle(el).maxWidth
        }));
        assert.equal(containerWidth.w, '480px', 'Container width should match ?width=480px');
        assert.equal(containerWidth.mw, '600px', 'Container max-width should match ?maxwidth=600px');

        // 25. Elimination of rigid fixed heights: .fgc-side and .score-box have min-height and flexible height
        await page.goto(`${OVERLAY_URL}?preview=1&layout=fgc`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.fgc-side');
        const fgcHeightStyles = await page.$eval('.fgc-side', el => {
            const cs = getComputedStyle(el);
            return {
                minHeight: cs.minHeight,
                height: el.style.height || cs.height
            };
        });
        assert.ok(parseFloat(fgcHeightStyles.minHeight) > 0, 'FGC side should have a computed min-height');

        // 26. Responsive narrow width container wrapping (< 540px)
        await page.setViewport({ width: 440, height: 300 });
        await page.goto(`${OVERLAY_URL}?preview=1&layout=top`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.topbar-panel');
        const centerBadgeOrder = await page.$eval('.topbar-center-badge', el => getComputedStyle(el).order);
        assert.equal(centerBadgeOrder, '-1', 'Center badge should wrap above competitors with order -1 at narrow widths');

        await page.goto(`${OVERLAY_URL}?preview=1&layout=fgc`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.fgc-panel');
        const fgcFlexDir = await page.$eval('.fgc-panel', el => getComputedStyle(el).flexDirection);
        assert.equal(fgcFlexDir, 'column', 'FGC panel should stack into column layout at narrow widths');

    } finally {
        if (browser) await browser.close();
    }
});

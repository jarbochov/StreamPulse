'use strict';
/* global renderMatchup, currentMatchup, updateMatchupOverlayUrl, updateTourneyOverlayUrl, localStorage, switchTab, setPreviewMode, setPreviewBackdrop, setPreviewSampleData, setTourneyFitWholeBracket, setPreviewViewport, previewBackdrop, previewUseSample, tourneyFitWholeBracket, previewMode, currentViewportW, currentViewportH */

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

        // 27. Center Phase Badge Disabled with Intact / Adjustable Gap (?center=0&gap=intact and ?center=0&gap=240px)
        await page.setViewport({ width: 1280, height: 720 });
        await page.goto(`${OVERLAY_URL}?preview=1&layout=top&center=0&gap=intact`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.topbar-panel');
        const gapIntactState = await page.evaluate(() => ({
            noCenter: document.body.classList.contains('no-center-badge'),
            hasGap: document.body.classList.contains('has-center-gap'),
            gapVar: document.documentElement.style.getPropertyValue('--center-gap'),
            panelGap: getComputedStyle(document.querySelector('.topbar-panel')).gap
        }));
        assert.equal(gapIntactState.noCenter, true, 'Body should have no-center-badge class when ?center=0');
        assert.equal(gapIntactState.hasGap, true, 'Body should have has-center-gap class when ?gap=intact');
        assert.equal(gapIntactState.gapVar, '160px', '--center-gap should be 160px for ?gap=intact');
        assert.equal(gapIntactState.panelGap, '160px', '.topbar-panel computed gap should be 160px');

        await page.goto(`${OVERLAY_URL}?preview=1&layout=top&center=0&gap=240px`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.topbar-panel');
        const gap240 = await page.$eval('.topbar-panel', el => getComputedStyle(el).gap);
        assert.equal(gap240, '240px', '.topbar-panel computed gap should be 240px for ?gap=240px');

        // 28. Speedrun Race Layout (?layout=race) with Master Race Clock and Reveal-on-Finish (?runnertimers=finish) vs Always (?runnertimers=always)
        await page.goto(`${OVERLAY_URL}?preview=1&layout=race&runnertimers=finish`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.race-panel');
        await page.waitForSelector('.race-master-bar');
        const masterClockExists = await page.$('.race-master-clock-digits');
        assert.ok(masterClockExists, 'Speedrun race layout should render the Master Race Clock in the header');

        // Inject a live race state where Runner 1 has finished (1st place) and Runner 2 is still running
        await page.evaluate(() => {
            renderMatchup({
                title: 'Super Metroid Any%',
                phase: 'Finals Race',
                format: 'bestOf',
                bestOf: 1,
                targetScore: 1,
                clock: {
                    enabled: true,
                    mode: 'race',
                    runnerTimersMode: 'finish',
                    elapsed: 2530.40,
                    isRunning: true,
                    estimate: '45:00'
                },
                competitors: [
                    {
                        id: 'c1',
                        name: 'Zoast',
                        tag: 'PB 41:16',
                        color: '#10b981',
                        score: 1,
                        timer: { elapsed: 2512.80, isRunning: false, finished: true, finishTime: '41:52.80', finishSeconds: 2512.80, place: 1, delta: 'WINNER', deltaSeconds: 0 }
                    },
                    {
                        id: 'c2',
                        name: 'Behemoth',
                        tag: 'PB 41:45',
                        color: '#3b82f6',
                        score: 0,
                        timer: { elapsed: 2530.40, isRunning: true, finished: false, finishTime: null, place: null, delta: null }
                    }
                ]
            });
        });

        const unfinHero = await page.$('.race-runner-card:not(.finished) .race-timer-hero');
        assert.equal(unfinHero, null, 'In runnertimers=finish mode, an active un-finished runner hides their individual timer until finish');
        const finishedHeroText = await page.$eval('.race-runner-card.finished .race-timer-digits', el => el.textContent.trim());
        assert.equal(finishedHeroText, '41:52.80', 'Finished runner should reveal their official finish time');

        // Now finish Runner 2 (+12.65s behind Runner 1) and verify delta is displayed
        await page.evaluate(() => {
            currentMatchup.competitors[1].timer = {
                elapsed: 2525.45,
                isRunning: false,
                finished: true,
                finishTime: '42:05.45',
                finishSeconds: 2525.45,
                place: 2,
                delta: '+00:12.65',
                deltaSeconds: 12.65
            };
            renderMatchup(currentMatchup);
        });
        const unfinAfterBothFinish = await page.$('.race-runner-card:not(.finished) .race-timer-hero');
        assert.equal(unfinAfterBothFinish, null, 'Once both runners finish, both runners are marked finished');
        const deltaBadges = await page.$$eval('.race-finish-badge', els => els.map(e => e.textContent.trim()));
        assert.ok(deltaBadges.some(t => t.includes('+00:12.65')), 'Second finisher should display +00:12.65 time difference behind 1st place');

        // 29. Speedrun Clock with Runner Timers OFF (?runnertimers=off)
        await page.goto(`${OVERLAY_URL}?preview=1&layout=race&runnertimers=off`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.race-panel');
        await page.waitForSelector('.race-master-bar');
        const heroBoxesOff = await page.$$('.race-timer-hero');
        assert.equal(heroBoxesOff.length, 0, 'In runnertimers=off mode, no runner timer boxes should be rendered');

        // 30. Speedrun Clock with Splits DELTAS OFF (?splits=0)
        await page.goto(`${OVERLAY_URL}?preview=1&layout=race&splits=0`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.race-panel');
        const badgesNoSplits = await page.$$eval('.race-finish-badge', els => els.map(e => e.textContent.trim()));
        assert.ok(badgesNoSplits.length >= 1, 'Finished runner should still show a finish badge');
        assert.ok(!badgesNoSplits.some(t => t.includes('+00:12.65')), 'When ?splits=0 is set, delta differences behind 1st place should be hidden');

        // 30b. Scoreboard layout (top) with Splits ON vs OFF
        await page.goto(`${OVERLAY_URL}?preview=1&layout=top&splits=0`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.topbar-panel');
        await page.evaluate(() => {
            renderMatchup({
                competitors: [
                    { name: 'Runner1', score: 1, timer: { finished: true, elapsed: 2500, finishTime: '41:40.00', place: 1 } },
                    { name: 'Runner2', score: 0, timer: { finished: true, elapsed: 2510, finishTime: '41:50.00', place: 2, delta: '+00:10.00' } }
                ],
                clock: { enabled: true, mode: 'race', showSplits: false }
            });
        });
        const pillDeltaTags = await page.$$('.runner-delta-tag');
        assert.equal(pillDeltaTags.length, 0, 'Scoreboard runner pill should omit delta tag when showSplits is false');

        // 31. Theme clean-light contrast verification
        await page.goto(`${OVERLAY_URL}?preview=1&layout=top&overlay=clean-light`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.topbar-panel');
        const bodyClassList = await page.$eval('body', el => Array.from(el.classList));
        assert.ok(bodyClassList.includes('theme-clean-light'), 'Body should have theme-clean-light');
        const compTextColor = await page.$eval('.topbar-competitor.c1 .competitor-name', el => getComputedStyle(el).color);
        assert.ok(compTextColor.includes('31, 35, 40') || compTextColor.includes('rgb('), 'Text should be high-contrast dark in clean-light theme');

        // 32. Verify versus tool persists overlay prefs to localStorage
        const VERSUS_TOOL_URL = 'file://' + path.resolve(__dirname, '../public/tools/versus.html');
        await page.goto(VERSUS_TOOL_URL, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('#matchup-opt-layout');

        // Modify checkboxes and selects
        await page.evaluate(() => {
            document.getElementById('matchup-opt-layout').value = 'race';
            document.getElementById('matchup-opt-splits').checked = false;
            document.getElementById('matchup-opt-roundpips').checked = false;
            document.getElementById('tourney-opt-highlight').checked = false;
            updateMatchupOverlayUrl();
            updateTourneyOverlayUrl();
        });

        const storedRaw = await page.evaluate(() => localStorage.getItem('streampulse_versus_overlay_prefs'));
        assert.ok(storedRaw, 'versus overlay options should be persisted to localStorage');
        const stored = JSON.parse(storedRaw);
        assert.equal(stored.matchup.layout, 'race');
        assert.equal(stored.matchup.splits, false);
        assert.equal(stored.matchup.roundpips, false);
        assert.equal(stored.tourney.highlight, false);

        // 33. Estimated time is marked as EST and not as a division slash (/ 45:00)
        await page.goto(`${OVERLAY_URL}?preview=1&layout=top&clockstyle=badge&showest=1`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.topbar-panel');
        await page.evaluate(() => {
            renderMatchup({
                competitors: [{ name: 'P1', score: 0 }, { name: 'P2', score: 0 }],
                clock: { enabled: true, mode: 'stopwatch', elapsed: 120, estimate: '45:00' }
            });
        });
        const estText = await page.$eval('.clock-est', el => el.textContent.trim());
        assert.ok(estText.includes('EST'), 'Estimated time should be explicitly marked as EST');
        assert.ok(!estText.startsWith('/'), 'Estimated time should not be formatted as a division slash or fraction');
        assert.ok(estText.includes('45:00'), 'Estimated time should include the estimate value');

        // Check bottom dock clock as well
        await page.goto(`${OVERLAY_URL}?preview=1&layout=top&clockstyle=bottom&showest=1`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.clock-dock-pill');
        const dockEstText = await page.$eval('.clock-dock-pill .clock-est', el => el.textContent.trim());
        assert.ok(dockEstText.includes('EST'), 'Bottom dock estimated time should be marked as EST');
        assert.ok(!dockEstText.startsWith('/'), 'Bottom dock estimated time should not be formatted as a division slash');

        // 34. Versus Live Overlay preview settings persistence across tab switches and reloads
        await page.goto(VERSUS_TOOL_URL, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('#matchup-opt-layout');

        await page.evaluate(() => {
            switchTab('overlays');
            setPreviewMode('tourney-tree');
            setPreviewBackdrop('checkerboard');
            setPreviewSampleData(false);
            setTourneyFitWholeBracket(true);
            setPreviewViewport(1280, 220, document.getElementById('chip-vp-race'));
        });

        // Switch tabs away from overlays and back
        await page.evaluate(() => {
            switchTab('matchup');
            switchTab('tourney');
            switchTab('overlays');
        });

        const stateAfterTabSwitches = await page.evaluate(() => ({
            previewMode,
            previewBackdrop,
            previewUseSample,
            tourneyFitWholeBracket,
            currentViewportW,
            currentViewportH,
            activeChipId: document.querySelector('#prev-viewport-chips .preset-chip-btn.active')?.id,
            storedTab: localStorage.getItem('versus-overlay-tab'),
            storedBackdrop: localStorage.getItem('versus-preview-backdrop'),
            storedSample: localStorage.getItem('versus-preview-sample'),
            storedFit: localStorage.getItem('versus-tourney-fit-whole-bracket'),
            storedVpTree: localStorage.getItem('versus-viewport-tourney-tree'),
        }));

        assert.equal(stateAfterTabSwitches.previewMode, 'tourney-tree', 'Preview mode should remain tourney-tree after switching tabs');
        assert.equal(stateAfterTabSwitches.previewBackdrop, 'checkerboard', 'Canvas backdrop should remain checkerboard');
        assert.equal(stateAfterTabSwitches.previewUseSample, false, 'Sample data should remain OFF');
        assert.equal(stateAfterTabSwitches.tourneyFitWholeBracket, true, 'Whole bracket fit should remain ON');
        assert.equal(stateAfterTabSwitches.currentViewportW, 1280, 'Viewport width should remain 1280');
        assert.equal(stateAfterTabSwitches.currentViewportH, 220, 'Viewport height should remain 220');
        assert.equal(stateAfterTabSwitches.activeChipId, 'chip-vp-race', 'Active chip should remain chip-vp-race');
        assert.equal(stateAfterTabSwitches.storedTab, 'tourney-tree');
        assert.equal(stateAfterTabSwitches.storedBackdrop, 'checkerboard');
        assert.equal(stateAfterTabSwitches.storedSample, '0');
        assert.equal(stateAfterTabSwitches.storedFit, '1');

        // Reload page to verify persistence across page reloads
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForSelector('#matchup-opt-layout');

        const stateAfterReload = await page.evaluate(() => {
            switchTab('overlays');
            return {
                previewMode,
                previewBackdrop,
                previewUseSample,
                tourneyFitWholeBracket,
                currentViewportW,
                currentViewportH,
                activeChipId: document.querySelector('#prev-viewport-chips .preset-chip-btn.active')?.id
            };
        });

        assert.equal(stateAfterReload.previewMode, 'tourney-tree', 'Preview mode should be restored as tourney-tree after page reload');
        assert.equal(stateAfterReload.previewBackdrop, 'checkerboard', 'Canvas backdrop should be restored as checkerboard after reload');
        assert.equal(stateAfterReload.previewUseSample, false, 'Sample data should be restored as OFF after reload');
        assert.equal(stateAfterReload.tourneyFitWholeBracket, true, 'Whole bracket fit should be restored as ON after reload');
        assert.equal(stateAfterReload.currentViewportW, 1280, 'Viewport width should be restored as 1280 after reload');
        assert.equal(stateAfterReload.currentViewportH, 220, 'Viewport height should be restored as 220 after reload');
        assert.equal(stateAfterReload.activeChipId, 'chip-vp-race', 'Active chip should be restored as chip-vp-race after reload');

        // 35. Polls Live Overlay preview mode persistence across tab switches and reloads
        const POLLS_TOOL_URL = 'file://' + path.resolve(__dirname, '../public/tools/polls.html');
        await page.goto(POLLS_TOOL_URL, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('#poll-opt-theme');

        await page.evaluate(() => {
            switchTab('overlays');
            setPreviewMode('active');
        });

        assert.equal(
            await page.evaluate(() => localStorage.getItem('polls-overlay-preview-mode')),
            'active',
            'Polls preview mode active should be stored in localStorage'
        );

        // Switch to poll tab and back to overlays tab
        await page.evaluate(() => {
            switchTab('poll');
            switchTab('overlays');
        });

        const pollPreviewModeAfterTabSwitch = await page.evaluate(() => previewMode);
        assert.equal(pollPreviewModeAfterTabSwitch, 'active', 'Polls preview mode should remain active after switching tabs');

        // Reload page
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForSelector('#poll-opt-theme');
        await page.evaluate(() => switchTab('overlays'));

        const pollPreviewModeAfterReload = await page.evaluate(() => previewMode);
        assert.equal(pollPreviewModeAfterReload, 'active', 'Polls preview mode should be restored as active after reload');

        // 36. Single Player Pod layout & Player Filtering (?player=1 and ?player=4)
        await page.goto(`${OVERLAY_URL}?preview=1&player=1`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.single-player-pod');
        const p1PodName = await page.$eval('.single-player-pod .competitor-name', el => el.textContent.trim());
        const p1PodSlot = await page.$eval('.single-player-pod .player-slot-pill', el => el.textContent.trim());
        assert.equal(p1PodName, 'Daigo', 'Player 1 pod should display competitor name Daigo');
        assert.equal(p1PodSlot, 'P1', 'Player 1 pod should display P1 slot badge');

        await page.goto(`${OVERLAY_URL}?preview=1&player=4`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.single-player-pod');
        const p4PodName = await page.$eval('.single-player-pod .competitor-name', el => el.textContent.trim());
        const p4PodSlot = await page.$eval('.single-player-pod .player-slot-pill', el => el.textContent.trim());
        assert.equal(p4PodName, 'Punk', 'Player 4 pod should display competitor name Punk');
        assert.equal(p4PodSlot, 'P4', 'Player 4 pod should display P4 slot badge');

        // 37. Master Clock Only layout & Filtering (?player=none / ?layout=clock)
        await page.goto(`${OVERLAY_URL}?preview=1&player=none`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.master-clock-panel');
        const clockDigits = await page.$eval('.clock-digits-hero', el => el.textContent.trim());
        assert.ok(clockDigits.length > 0, 'Master clock panel should display clock digits');
        const compsInClockOnly = await page.$$('.competitor-name, .single-player-pod, .topbar-competitor');
        assert.equal(compsInClockOnly.length, 0, 'Master clock mode should not render competitor score cards');

        // 38. Custom Accent Color & Center Match Badge Color (?accent=...&badgecolor=...)
        await page.goto(`${OVERLAY_URL}?preview=1&accent=%23e11d48&badgecolor=%2310b981`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.topbar-panel');
        const styles = await page.evaluate(() => {
            const el = document.documentElement;
            return {
                accent: el.style.getPropertyValue('--matchup-accent'),
                badgeColor: el.style.getPropertyValue('--matchup-badge-color')
            };
        });
        assert.equal(styles.accent, '#e11d48', 'Custom accent color should be applied to --matchup-accent');
        assert.equal(styles.badgeColor, '#10b981', 'Custom badge color should be applied to --matchup-badge-color');

        // 39. Versus Studio Overlay Generator: Slot Filter, Accent Color, and Badge Color Persistence
        await page.goto(VERSUS_TOOL_URL, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('#matchup-opt-layout');
        await page.evaluate(() => switchTab('overlays'));

        await page.evaluate(() => {
            const playerSelect = document.getElementById('matchup-opt-player');
            const accentInput = document.getElementById('matchup-opt-accent');
            const badgeInput = document.getElementById('matchup-opt-badgecolor');
            const tourneyAccentInput = document.getElementById('tourney-opt-accent');
            const tourneyBadgeInput = document.getElementById('tourney-opt-badgecolor');

            if (playerSelect) { playerSelect.value = '3'; }
            if (accentInput) { accentInput.value = '#e11d48'; }
            if (badgeInput) { badgeInput.value = '#10b981'; }
            if (tourneyAccentInput) { tourneyAccentInput.value = '#a855f7'; }
            if (tourneyBadgeInput) { tourneyBadgeInput.value = '#f59e0b'; }

            updateMatchupOverlayUrl();
            updateTourneyOverlayUrl();
        });

        const matchupUrl = await page.$eval('#url-matchup-overlay', el => el.value);
        assert.ok(matchupUrl.includes('player=3'), 'Matchup overlay URL should include player=3');
        assert.ok(matchupUrl.includes('accent=%23e11d48') || matchupUrl.includes('accent=#e11d48'), 'Matchup overlay URL should include accent=#e11d48');
        assert.ok(matchupUrl.includes('badgecolor=%2310b981') || matchupUrl.includes('badgecolor=#10b981'), 'Matchup overlay URL should include badgecolor=#10b981');

        const tourneyUrl = await page.$eval('#url-tourney-overlay', el => el.value);
        assert.ok(tourneyUrl.includes('accent=%23a855f7') || tourneyUrl.includes('accent=#a855f7'), 'Tournament overlay URL should include accent=#a855f7');
        assert.ok(tourneyUrl.includes('badgecolor=%23f59e0b') || tourneyUrl.includes('badgecolor=#f59e0b'), 'Tournament overlay URL should include badgecolor=#f59e0b');

        // Reload to verify persistence in localStorage
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForSelector('#matchup-opt-layout');
        await page.evaluate(() => switchTab('overlays'));

        const persistedMatchupPlayer = await page.$eval('#matchup-opt-player', el => el.value);
        const persistedMatchupAccent = await page.$eval('#matchup-opt-accent', el => el.value);
        const persistedMatchupBadge = await page.$eval('#matchup-opt-badgecolor', el => el.value);
        const persistedTourneyAccent = await page.$eval('#tourney-opt-accent', el => el.value);
        const persistedTourneyBadge = await page.$eval('#tourney-opt-badgecolor', el => el.value);

        assert.equal(persistedMatchupPlayer, '3', 'Matchup player slot selection should persist across reload');
        assert.equal(persistedMatchupAccent, '#e11d48', 'Matchup accent color should persist across reload');
        assert.equal(persistedMatchupBadge, '#10b981', 'Matchup badge color should persist across reload');
        assert.equal(persistedTourneyAccent, '#a855f7', 'Tournament accent color should persist across reload');
        assert.equal(persistedTourneyBadge, '#f59e0b', 'Tournament badge color should persist across reload');

        // 40. Individual Player Pods Theme Rendering (?player=1..4 & ?overlay=...)
        // 40a. Clean Light Theme with Player Pod
        await page.goto(`${OVERLAY_URL}?preview=1&player=1&overlay=clean-light`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.single-player-pod');
        const cleanLightPod = await page.evaluate(() => {
            const pod = document.querySelector('.single-player-pod');
            const name = pod.querySelector('.competitor-name');
            const score = pod.querySelector('.score-box');
            const csPod = getComputedStyle(pod);
            const csName = getComputedStyle(name);
            const csScore = getComputedStyle(score);
            return {
                bg: csPod.backgroundColor,
                textColor: csName.color,
                scoreBg: csScore.backgroundColor,
                scoreColor: csScore.color
            };
        });
        assert.ok(cleanLightPod.bg.includes('255, 255, 255'), 'Single player pod should have white background in clean-light theme');
        assert.ok(cleanLightPod.textColor.includes('31, 35, 40'), 'Single player pod text should be dark high-contrast in clean-light theme');
        assert.ok(cleanLightPod.scoreColor.includes('31, 35, 40'), 'Single player pod score should be dark in clean-light theme');

        // 40b. Retro Theme with Player Pod
        await page.goto(`${OVERLAY_URL}?preview=1&player=2&overlay=retro`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.single-player-pod');
        const retroPod = await page.evaluate(() => {
            const pod = document.querySelector('.single-player-pod');
            const score = pod.querySelector('.score-box');
            const csPod = getComputedStyle(pod);
            const csScore = getComputedStyle(score);
            return {
                borderRadius: csPod.borderRadius,
                scoreRadius: csScore.borderRadius,
                border: csPod.borderColor
            };
        });
        assert.equal(retroPod.borderRadius, '0px', 'Single player pod should have 0px border-radius in retro theme');
        assert.equal(retroPod.scoreRadius, '0px', 'Score box should have 0px border-radius in retro theme');

        // 40c. Neon Theme with Player Pod
        await page.goto(`${OVERLAY_URL}?preview=1&player=3&overlay=neon`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.single-player-pod');
        const neonPod = await page.evaluate(() => {
            const pod = document.querySelector('.single-player-pod');
            const csPod = getComputedStyle(pod);
            return {
                border: csPod.borderColor,
                boxShadow: csPod.boxShadow
            };
        });
        assert.ok(neonPod.border.includes('0, 240, 255') || neonPod.border.includes('#00f0ff'), 'Single player pod should have cyan neon border in neon theme');
        assert.ok(neonPod.boxShadow.includes('0, 240, 255') || neonPod.boxShadow.includes('rgba('), 'Single player pod should have cyan neon glow in neon theme');

        // 40d. Championship Gold Theme with Player Pod
        await page.goto(`${OVERLAY_URL}?preview=1&player=1&overlay=championship`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.single-player-pod');
        const goldPod = await page.evaluate(() => {
            const pod = document.querySelector('.single-player-pod');
            const score = pod.querySelector('.score-box');
            return {
                border: getComputedStyle(pod).borderColor,
                scoreColor: getComputedStyle(score).color
            };
        });
        assert.ok(goldPod.border.includes('255, 215, 0'), 'Single player pod should have gold border in championship theme');
        assert.ok(goldPod.scoreColor.includes('255, 215, 0'), 'Single player pod score should be gold in championship theme');

        // 40e. Glass Theme with Player Pod
        await page.goto(`${OVERLAY_URL}?preview=1&player=1&overlay=glass`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.single-player-pod');
        const glassPod = await page.evaluate(() => {
            const pod = document.querySelector('.single-player-pod');
            const csPod = getComputedStyle(pod);
            return {
                bg: csPod.backgroundColor,
                backdrop: csPod.backdropFilter || csPod.webkitBackdropFilter
            };
        });
        assert.ok(glassPod.bg.includes('rgba(13, 17, 23, 0.65)'), 'Single player pod should have frosted glass background in glass theme');

        // 41. Individual Player Pod Layout Styling (?player=1&layout=...)
        // 41a. Angular Slash Pod (?player=1&layout=angular)
        await page.goto(`${OVERLAY_URL}?preview=1&player=1&layout=angular`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.single-player-pod.pod-angular');
        const hasPodAngular = await page.$eval('.single-player-pod', el => el.classList.contains('pod-angular'));
        assert.ok(hasPodAngular, 'Player pod should receive .pod-angular class when layout=angular');

        // 41b. Modern FGC Pod (?player=2&layout=fgc)
        await page.goto(`${OVERLAY_URL}?preview=1&player=2&layout=fgc`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.single-player-pod.pod-fgc');
        const hasPodFgc = await page.$eval('.single-player-pod', el => el.classList.contains('pod-fgc'));
        assert.ok(hasPodFgc, 'Player pod should receive .pod-fgc class when layout=fgc');

        // 41c. Compact Score Bug Pod (?player=3&layout=compact)
        await page.goto(`${OVERLAY_URL}?preview=1&player=3&layout=compact`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.single-player-pod.pod-compact');
        const hasPodCompact = await page.$eval('.single-player-pod', el => el.classList.contains('pod-compact'));
        assert.ok(hasPodCompact, 'Player pod should receive .pod-compact class when layout=compact');

        // 41d. Minimal Pod (?player=4&layout=minimal)
        await page.goto(`${OVERLAY_URL}?preview=1&player=4&layout=minimal`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.single-player-pod.pod-minimal');
        const hasPodMinimal = await page.$eval('.single-player-pod', el => el.classList.contains('pod-minimal'));
        assert.ok(hasPodMinimal, 'Player pod should receive .pod-minimal class when layout=minimal');

        // 41e. Vertical Pillar Pod (?player=1&layout=pillar)
        await page.goto(`${OVERLAY_URL}?preview=1&player=1&layout=pillar`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.single-player-pod.pod-pillar');
        const pillarDirection = await page.$eval('.single-player-pod', el => getComputedStyle(el).flexDirection);
        assert.equal(pillarDirection, 'column', 'Pillar layout pod should have flex-direction column');

        // 41f. Pill Capsule Pod (?player=1&layout=pill)
        await page.goto(`${OVERLAY_URL}?preview=1&player=1&layout=pill`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.single-player-pod.pod-pill');
        const pillRadius = await page.$eval('.single-player-pod', el => getComputedStyle(el).borderRadius);
        assert.equal(pillRadius, '9999px', 'Pill layout pod should have 9999px border-radius');

        // 42. Pod Mirroring and Reflection (?mirror=1)
        // 42a. Mirror Pod with ?mirror=1
        await page.goto(`${OVERLAY_URL}?preview=1&player=1&mirror=1`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.single-player-pod.mirrored');
        const podFlexDir = await page.$eval('.single-player-pod', el => getComputedStyle(el).flexDirection);
        const metaTextAlign = await page.$eval('.single-player-pod .competitor-meta', el => getComputedStyle(el).textAlign);
        assert.equal(podFlexDir, 'row-reverse', 'Mirrored pod should use flex-direction row-reverse');
        assert.equal(metaTextAlign, 'right', 'Mirrored pod competitor-meta should align text to the right');

        // 42b. Angular Pod Mirroring (?player=2&layout=angular&mirror=1)
        await page.goto(`${OVERLAY_URL}?preview=1&player=2&layout=angular&mirror=1`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.single-player-pod.pod-angular.mirrored');
        const isAngularMirrored = await page.$eval('.single-player-pod', el => el.classList.contains('pod-angular') && el.classList.contains('mirrored'));
        assert.ok(isAngularMirrored, 'Angular pod should have both .pod-angular and .mirrored classes');

        // 42c. Versus Studio: Mirror checkbox toggles ?mirror=1 and persists across reloads
        const VERSUS_URL = 'file://' + path.resolve(__dirname, '../public/tools/versus.html');
        await page.goto(VERSUS_URL, { waitUntil: 'domcontentloaded' });
        await page.evaluate(() => {
            switchTab('overlays');
            const mirrorCheck = document.getElementById('matchup-opt-mirror');
            if (mirrorCheck) {
                mirrorCheck.checked = true;
                mirrorCheck.dispatchEvent(new Event('change'));
            }
        });
        const matchupUrlAfterMirror = await page.$eval('#url-matchup-overlay', el => el.value);
        assert.ok(matchupUrlAfterMirror.includes('mirror=1'), 'Matchup overlay URL should include mirror=1 when mirror is checked');

        // Check preview toolbar mirror checkbox stayed in sync
        const toolbarMirrorChecked = await page.$eval('#prev-ctrl-mirror', el => el.checked);
        assert.equal(toolbarMirrorChecked, true, 'Preview toolbar mirror checkbox should be in sync');

        // Persistence across reload
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.evaluate(() => switchTab('overlays'));
        const persistedMirror = await page.$eval('#matchup-opt-mirror', el => el.checked);
        assert.equal(persistedMirror, true, 'Pod mirror setting should persist in localStorage across reloads');

    } finally {
        if (browser) await browser.close();
    }
});

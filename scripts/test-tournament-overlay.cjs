'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const puppeteer = require('puppeteer');

const OVERLAY_URL = 'file://' + path.resolve(__dirname, '../public/overlays/tournament.html');

test('tournament overlay renders tree layout, active HUD layout, theme presets, and showscores toggle', async () => {
    let browser;

    try {
        browser = await puppeteer.launch({
            headless: 'new',
            pipe: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--allow-file-access-from-files']
        });
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 720 });

        // 1. Tree layout with sample data
        await page.goto(`${OVERLAY_URL}?preview=1&layout=tree`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.bracket-tree');

        const treeMatches = await page.$$('.match-card');
        assert.ok(treeMatches.length >= 3, 'Tree layout should render multiple tournament match cards');

        const titleText = await page.$eval('.tournament-title', el => el.textContent.trim());
        assert.equal(titleText, 'Retro Community Championship');

        // 2. Esports Lower-Third Match HUD layout (?layout=active)
        await page.goto(`${OVERLAY_URL}?preview=1&layout=active`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.match-hud-card');

        const hudHeader = await page.$eval('.hud-header', el => el.textContent.trim());
        assert.ok(hudHeader.includes('Semifinals'), 'HUD header should include round name');

        const hudEntrant1 = await page.$eval('.hud-entrant.e1 .hud-entrant-name', el => el.textContent.trim());
        const hudEntrant2 = await page.$eval('.hud-entrant.e2 .hud-entrant-name', el => el.textContent.trim());
        assert.equal(hudEntrant1, 'Chrono Trigger');
        assert.equal(hudEntrant2, 'EarthBound');

        const pips1 = await page.$$('.hud-entrant.e1 .win-pip');
        assert.ok(pips1.length >= 2, 'HUD should render series win pips for best-of series');

        // 3. Theme styling: ?overlay=neon
        await page.goto(`${OVERLAY_URL}?preview=1&overlay=neon`, { waitUntil: 'domcontentloaded' });
        const hasNeonClass = await page.evaluate(() => document.body.classList.contains('theme-neon'));
        assert.equal(hasNeonClass, true, 'Body should have theme-neon class when ?overlay=neon');

        // 4. Custom color hash styling: ?overlay=0d1117
        await page.goto(`${OVERLAY_URL}?preview=1&overlay=1a202c`, { waitUntil: 'domcontentloaded' });
        const customBg = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--tourney-bg').trim());
        assert.equal(customBg, '#1a202c', 'CSS variable --tourney-bg should match hex hash');

        // 5. Hide scores: ?showscores=0
        await page.goto(`${OVERLAY_URL}?preview=1&layout=tree&showscores=0`, { waitUntil: 'domcontentloaded' });
        const scoresPresent = await page.evaluate(() => document.querySelectorAll('.score-badge').length);
        assert.equal(scoresPresent, 0, 'Score badges should not be rendered when ?showscores=0');

        // 6. Round Robin Standings Table & Aligned Match Schedule in overlay
        await page.goto(`${OVERLAY_URL}?preview=1&format=roundRobin&showseeds=1`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.rr-table');
        const hasRRTable = await page.$('.rr-table');
        assert.ok(hasRRTable, 'Round Robin layout should render standings table');

        const rrSeedPills = await page.$$('.seed-pill');
        assert.ok(rrSeedPills.length >= 4, 'Round Robin should render seed pills in standings and match schedule when ?showseeds=1');

        const scorePills = await page.$$('.rr-score-pill');
        assert.ok(scorePills.length >= 2, 'Round Robin matches should render aligned score pills');
        const scoreText = await page.$eval('.rr-score-pill', el => el.textContent.trim());
        assert.ok(scoreText.includes('—'), 'Score pill should format as score — score');

        await page.evaluate(() => {
            window.renderTournament({
                id: 'rr-test',
                title: 'Trio Showdown',
                format: 'roundRobin',
                entrantCount: 3,
                standings: [
                    { name: 'Chrono', seed: 1, played: 2, won: 2, lost: 0, points: 6 },
                    { name: 'Zelda', seed: 2, played: 2, won: 1, lost: 1, points: 3 },
                    { name: 'Mario', seed: 3, played: 2, won: 0, lost: 2, points: 0 }
                ],
                matches: [
                    { id: 'rr_1_1', round: 1, entrant1: { name: 'Chrono', score: 2 }, entrant2: { name: 'Zelda', score: 1 }, scores: [2, 1], status: 'COMPLETED', winner: 'Chrono' }
                ]
            });
        });

        // 7. BYE match rendering in single elim (odd participant count)
        await page.evaluate(() => {
            window.renderTournament({
                id: 'bye-test',
                title: '3-Player Single Elim',
                format: 'single',
                bracketSize: 4,
                matches: [
                    { id: 'm_1_1', round: 1, isBye: true, entrant1: { name: 'Alice', seed: 1 }, entrant2: { name: 'BYE', seed: 4 }, status: 'COMPLETED', winner: 'Alice' },
                    { id: 'm_1_2', round: 1, entrant1: { name: 'Bob', seed: 2, score: 0 }, entrant2: { name: 'Charlie', seed: 3, score: 0 }, status: 'PENDING' },
                    { id: 'm_2_1', round: 2, entrant1: { name: 'Alice', seed: 1, score: 0 }, entrant2: { name: 'TBD', seed: 0, score: 0 }, status: 'PENDING' }
                ]
            });
        });
        const byeCard = await page.$('.match-card.bye-card');
        assert.ok(byeCard, 'BYE match should render with .bye-card styling');
        const byeBadgeText = await page.$eval('.bye-badge', el => el.textContent.trim());
        assert.equal(byeBadgeText, '1st Round BYE');

        // 8. Title Centering & Show/Hide Controls
        await page.goto(`${OVERLAY_URL}?preview=1&layout=tree`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.tournament-header');
        const headerAlign = await page.$eval('.tournament-header', el => getComputedStyle(el).textAlign);
        assert.equal(headerAlign, 'center', 'Tournament header text-align should be centered');

        // 9. Hide Title: ?showtitle=0
        await page.goto(`${OVERLAY_URL}?preview=1&layout=tree&showtitle=0`, { waitUntil: 'domcontentloaded' });
        const titleEl = await page.$('.tournament-header');
        assert.equal(titleEl, null, 'Tournament header should be omitted when ?showtitle=0');

        // 10. Hide Format Pill: ?showformat=0
        await page.goto(`${OVERLAY_URL}?preview=1&layout=tree&showformat=0`, { waitUntil: 'domcontentloaded' });
        const formatPills = await page.$$eval('.meta-pill', pills => pills.map(p => p.textContent.trim()));
        assert.ok(!formatPills.includes('Single Elimination'), 'Elimination mode pill should be hidden when ?showformat=0');

        // 11. Hide Seeds & Tags: ?showseeds=0&showtags=0
        await page.goto(`${OVERLAY_URL}?preview=1&layout=tree&showseeds=0&showtags=0`, { waitUntil: 'domcontentloaded' });
        const seedsCount = await page.evaluate(() => document.querySelectorAll('.seed-pill').length);
        const tagsCount = await page.evaluate(() => document.querySelectorAll('.entrant-tag').length);
        assert.equal(seedsCount, 0, 'Seeds should be hidden when ?showseeds=0');
        assert.equal(tagsCount, 0, 'Tags should be hidden when ?showtags=0');

        // 12. Round Pips in Tournament Match Cards
        await page.goto(`${OVERLAY_URL}?preview=1&layout=tree&roundpips=1`, { waitUntil: 'domcontentloaded' });
        const roundPips = await page.$$('.match-round-pip');
        assert.ok(roundPips.length > 0, 'Match card should display diamond round pips when ?roundpips=1 and roundsBestOf > 0');

        // 12b. Score pip diamonds in tournament HUD (?pipstyle=diamond) & equal size (8px)
        await page.goto(`${OVERLAY_URL}?preview=1&layout=hud&pipstyle=diamond`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.win-pip.pip-diamond');
        const winPipDiamonds = await page.$$('.win-pip.pip-diamond');
        assert.ok(winPipDiamonds.length >= 2, 'HUD win pips should receive pip-diamond class when ?pipstyle=diamond');
        const winPipSize = await page.$eval('.win-pip', el => ({ w: getComputedStyle(el).width, h: getComputedStyle(el).height }));
        assert.equal(winPipSize.w, '8px', 'Tournament win pip width should be 8px');
        assert.equal(winPipSize.h, '8px', 'Tournament win pip height should be 8px');

        // 12c. Round pip options in tournament (?roundpipstyle=circle, bar, digit) & equal size (8px)
        await page.goto(`${OVERLAY_URL}?preview=1&layout=tree&roundpips=1&roundpipstyle=circle`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.match-round-pip.pip-circle');
        const tourneyRoundCircleSize = await page.$eval('.match-round-pip.pip-circle', el => ({ w: getComputedStyle(el).width, h: getComputedStyle(el).height }));
        assert.equal(tourneyRoundCircleSize.w, '8px', 'Tournament round pip width should be 8px (equal size)');
        assert.equal(tourneyRoundCircleSize.h, '8px', 'Tournament round pip height should be 8px (equal size)');

        await page.goto(`${OVERLAY_URL}?preview=1&layout=tree&roundpips=1&roundpipstyle=bar`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.match-round-pip.pip-bar');

        await page.goto(`${OVERLAY_URL}?preview=1&layout=hud&roundpips=1&roundpipstyle=digit`, { waitUntil: 'domcontentloaded' });
        const hudRoundsBadge = await page.$('.score-badge');
        assert.ok(hudRoundsBadge, 'Tournament HUD should render digit rounds badge with ?roundpipstyle=digit');

        // Return to tree layout for tree assertions
        await page.goto(`${OVERLAY_URL}?preview=1&layout=tree&roundpips=1`, { waitUntil: 'domcontentloaded' });

        // 13. Entrant color accents and dots
        await page.evaluate(() => {
            window.renderTournament({
                id: 'color-test',
                title: 'Color Overlay Test',
                format: 'single',
                bracketSize: 2,
                matches: [
                    {
                        id: 'm_1_1',
                        round: 1,
                        entrant1: { name: 'Player Red', color: '#ff2255', score: 1 },
                        entrant2: { name: 'Player Blue', color: '#2255ff', score: 0 },
                        status: 'ACTIVE'
                    }
                ]
            });
        });
        const e1Border = await page.$eval('.entrant-row', el => el.style.borderLeft);
        assert.ok(e1Border.includes('255, 34, 85') || e1Border.includes('#ff2255'), 'Entrant row should display custom left border color');
        const colorDot = await page.$('.entrant-color-dot');
        assert.ok(colorDot, 'Entrant row should display color dot');

        // 14. Poll Tournament (?source=poll) should NEVER show round pips even if roundpips=1 is passed
        await page.goto(`${OVERLAY_URL}?preview=1&source=poll&roundpips=1`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.match-card');
        const pollRoundPips = await page.$$('.match-round-pips');
        assert.equal(pollRoundPips.length, 0, 'Poll tournament (?source=poll) should never render round pips');

        // 15. Multi-Match Highlight Disable (?highlight=0 and highlightLive: false)
        await page.goto(`${OVERLAY_URL}?preview=1&highlight=0`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.match-card');
        const activeCardsWhenHighlightOff = await page.$$('.match-card.active');
        assert.equal(activeCardsWhenHighlightOff.length, 0, 'No match card should have .active class when ?highlight=0');

        // 16. Center Phase Badge Disabled with Intact Gap (?layout=active&center=0&gap=intact)
        await page.goto(`${OVERLAY_URL}?preview=1&layout=active&center=0&gap=intact`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.match-hud-card');
        const tourneyGapState = await page.evaluate(() => ({
            noCenter: document.body.classList.contains('no-center-badge'),
            hasGap: document.body.classList.contains('has-center-gap'),
            gapVar: document.documentElement.style.getPropertyValue('--tourney-center-gap')
        }));
        assert.equal(tourneyGapState.noCenter, true, 'Body should have no-center-badge class when ?center=0');
        assert.equal(tourneyGapState.hasGap, true, 'Body should have has-center-gap class when ?gap=intact');
        assert.equal(tourneyGapState.gapVar, '160px', '--tourney-center-gap should be 160px when ?gap=intact');

        // 17. Custom Bracket Accent Color & Center Match Badge Color (?accent=...&badgecolor=...)
        await page.goto(`${OVERLAY_URL}?preview=1&accent=%23e11d48&badgecolor=%23fbbf24`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.match-card');
        const tourneyColorStyles = await page.evaluate(() => {
            const el = document.documentElement;
            return {
                accent: el.style.getPropertyValue('--tourney-accent'),
                badgeBg: el.style.getPropertyValue('--tourney-badge-bg')
            };
        });
        assert.equal(tourneyColorStyles.accent, '#e11d48', '--tourney-accent should be set to #e11d48');
        assert.equal(tourneyColorStyles.badgeBg, '#fbbf24', '--tourney-badge-bg should be set to #fbbf24');

        // 18. Confetti default is OFF unless explicitly requested (?confetti=1)
        await page.goto(`${OVERLAY_URL}?preview=1`, { waitUntil: 'domcontentloaded' });
        const confettiDefaultOff = await page.evaluate(() => {
            return typeof window.enableConfetti !== 'undefined' ? window.enableConfetti : false;
        });
        assert.equal(confettiDefaultOff, false, 'Confetti should be disabled by default on tournament overlay');

        await page.goto(`${OVERLAY_URL}?preview=1&confetti=1`, { waitUntil: 'domcontentloaded' });
        const confettiExplicitOn = await page.evaluate(() => {
            return typeof window.enableConfetti !== 'undefined' ? window.enableConfetti : false;
        });
        assert.equal(confettiExplicitOn, true, 'Confetti should be enabled when ?confetti=1');

    } finally {
        if (browser) await browser.close();
    }
});

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

        // 6. Round Robin Standings Table in overlay
        await page.evaluate(() => {
            window.renderTournament({
                id: 'rr-test',
                title: 'Trio Showdown',
                format: 'roundRobin',
                entrantCount: 3,
                standings: [
                    { name: 'Chrono', played: 2, won: 2, lost: 0, points: 6 },
                    { name: 'Zelda', played: 2, won: 1, lost: 1, points: 3 },
                    { name: 'Mario', played: 2, won: 0, lost: 2, points: 0 }
                ],
                matches: [
                    { id: 'rr_1_1', round: 1, entrant1: { name: 'Chrono', score: 2 }, entrant2: { name: 'Zelda', score: 1 }, status: 'COMPLETED', winner: 'Chrono' }
                ]
            });
        });
        const hasRRTable = await page.$('.rr-table');
        assert.ok(hasRRTable, 'Round Robin layout should render standings table');

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

    } finally {
        if (browser) await browser.close();
    }
});

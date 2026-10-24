'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const puppeteer = require('puppeteer');

const OVERLAY_URL = 'file://' + path.resolve(__dirname, '../public/overlays/poll.html');

test('poll overlay renders live active poll, parses ?overlay=hash and toggles ?howtovote bottom footer', async () => {
    let browser;

    try {
        browser = await puppeteer.launch({
            headless: 'new',
            pipe: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--allow-file-access-from-files']
        });
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 720 });

        // 1. Test basic render with active poll and ?howtovote=1
        await page.goto(`${OVERLAY_URL}?howtovote=1`, { waitUntil: 'domcontentloaded' });
        await page.evaluate(() => {
            window.renderPoll({
                id: 'active-fixture-poll',
                title: 'Favorite retro soundtrack?',
                status: 'ACTIVE',
                duration: 120,
                startedAt: new Date(Date.now() - 30000).toISOString(),
                choices: [
                    { id: '1', title: 'Chrono Trigger', votes: 12 },
                    { id: '2', title: 'Castlevania SOTN', votes: 8 },
                    { id: '3', title: 'Donkey Kong Country 2', votes: 15 }
                ]
            });
        });
        await page.waitForSelector('.choice-row');

        const title = await page.$eval('#poll-title', el => el.textContent.trim());
        assert.equal(title, 'Favorite retro soundtrack?');

        const choices = await page.$$eval('.choice-name', els => els.map(el => el.textContent.trim()));
        assert.deepEqual(choices, ['Chrono Trigger', 'Castlevania SOTN', 'Donkey Kong Country 2']);

        // Check How To Vote bottom bar is visible and formatted
        const howToVoteDisplay = await page.$eval('#poll-how-to-vote', el => window.getComputedStyle(el).display);
        assert.notEqual(howToVoteDisplay, 'none');

        const howToVoteText = await page.$eval('#poll-how-to-vote-text', el => el.textContent.trim());
        assert.match(howToVoteText, /1–3|!vote/);

        // 2. Test overlay with custom hex color without hash: ?overlay=161b22
        await page.goto(`${OVERLAY_URL}?overlay=161b22`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.poll-card');
        const bgVal = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--poll-bg').trim());
        assert.equal(bgVal, '#161b22');

        // Without ?howtovote, footer is hidden
        const footerHidden = await page.$eval('#poll-how-to-vote', el => window.getComputedStyle(el).display);
        assert.equal(footerHidden, 'none');

        // 3. Test overlay with preset theme ?overlay=glass
        await page.goto(`${OVERLAY_URL}?overlay=glass`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.poll-card');
        const hasGlass = await page.$eval('#poll-card', el => el.classList.contains('theme-glass'));
        assert.ok(hasGlass);

        // 4. Test custom instructions string: ?howtovote=Cast+your+vote+in+chat+now!
        await page.goto(`${OVERLAY_URL}?sample=1&howtovote=Cast+your+vote+in+chat+now!`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('#poll-how-to-vote');
        const customText = await page.$eval('#poll-how-to-vote-text', el => el.textContent.trim());
        assert.equal(customText, 'Cast your vote in chat now!');

        // 5. Test sample / preview mode when no active poll
        await page.goto(`${OVERLAY_URL}?preview=1&sample=1`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.choice-row');
        const sampleChoices = await page.$$('.choice-row');
        assert.ok(sampleChoices.length >= 2);

    } finally {
        if (browser) await browser.close();
    }
});

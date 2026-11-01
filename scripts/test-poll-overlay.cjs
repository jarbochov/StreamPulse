'use strict';
/* global competitiveFixture, fetchInitialPoll, PageTransitionEvent */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const puppeteer = require('puppeteer');
const { installCompetitiveFixture } = require('./competitive-browser-fixture.cjs');

const OVERLAY_URL = 'file://' + path.resolve(__dirname, '../public/overlays/poll.html');

        test('poll overlay rejects stale HTTP snapshots, recovers latest results, and suspends live work', async () => {
            const browser = await puppeteer.launch({ headless: 'new', pipe: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
            try {
                const page = await browser.newPage();
                await installCompetitiveFixture(page);
                const url = 'http://competitive-fixture.test/overlays/poll.html?confetti=0';
                await page.goto(url, { waitUntil: 'domcontentloaded' });
                await page.evaluate(async () => {
                    const f = competitiveFixture;
                    f.poll = {
                        id: 'fixture-new', title: 'New community vote', status: 'ACTIVE',
                        startedAt: new Date(f.now).toISOString(), duration: 60,
                        choices: [{ id: 'a', title: 'Star Harbor', votes: 4 }, { id: 'b', title: 'Moon Valley', votes: 2 }]
                    };
                    f.sockets[0].receive('poll-update', f.poll);
                    f.requests[0].respond({ poll: { ...f.poll, id: 'fixture-old', title: 'Old community vote' } });
                    await new Promise(resolve => setTimeout(resolve, 0));
                });
                assert.equal(await page.$eval('#poll-title', el => el.textContent), 'New community vote');
                assert.equal(await page.evaluate(() => competitiveFixture.requests[0].url), '/api/polls/latest');

                await page.goto(url, { waitUntil: 'domcontentloaded' });
                await page.evaluate(async () => {
                    const f = competitiveFixture;
                    f.result = {
                        id: 'fixture-result', title: 'Completed community vote', status: 'COMPLETED',
                        endedAt: new Date(f.now - 5000).toISOString(),
                        settings: { resultsSeconds: 15, celebration: { sound: '/fixture-sound.mp3' } },
                        choices: [{ id: 'a', title: 'Star Harbor', votes: 4 }, { id: 'b', title: 'Moon Valley', votes: 2 }]
                    };
                    f.sockets[0].receive('poll-update', f.result);
                    f.requests[0].respond({ poll: null });
                    await new Promise(resolve => setTimeout(resolve, 0));
                });
                assert.equal(await page.$eval('#poll-stage', el => el.classList.contains('hidden')), false, 'Late null HTTP must not erase WS final results');
                assert.equal(await page.$eval('#poll-badge-text', el => el.textContent), 'FINAL RESULTS');
                assert.equal(await page.evaluate(() => competitiveFixture.sounds), 1);

                await page.evaluate(() => {
                    const f = competitiveFixture;
                    f.now += 11000;
                    f.sockets[0].receive('poll-update', f.result);
                });
                assert.equal(await page.$eval('#poll-stage', el => el.classList.contains('hidden')), true, 'Repeated snapshots must not extend the result deadline');
                assert.equal(await page.evaluate(() => competitiveFixture.sounds), 1);

                await page.evaluate(() => competitiveFixture.sockets[0].close());
                await page.waitForFunction(() => competitiveFixture.requests.length === 2 && competitiveFixture.sockets.length === 2);
                await page.evaluate(async () => {
                    competitiveFixture.requests[1].respond({ poll: competitiveFixture.result });
                    await new Promise(resolve => setTimeout(resolve, 0));
                });
                assert.equal(await page.$eval('#poll-stage', el => el.classList.contains('hidden')), true, 'Reconnect must not revive expired results');
                assert.equal(await page.evaluate(() => competitiveFixture.sounds), 1, 'Reconnect must not replay celebration');

                await page.evaluate(() => {
                    fetchInitialPoll();
                    window.dispatchEvent(new PageTransitionEvent('pagehide'));
                });
                assert.equal(await page.evaluate(() => competitiveFixture.requests[2].options.signal.aborted), true);
                assert.equal(await page.evaluate(() => competitiveFixture.sockets[1].readyState), 3);
                await page.evaluate(() => {
                    competitiveFixture.sockets[1].receive('poll-update', { ...competitiveFixture.result, status: 'ACTIVE', title: 'Stale socket' });
                    window.dispatchEvent(new PageTransitionEvent('pageshow'));
                });
                assert.equal(await page.evaluate(() => competitiveFixture.sockets.length), 3);
                await page.evaluate(async () => {
                    const f = competitiveFixture;
                    f.requests[3].respond({ poll: null });
                    f.requests[2].respond({ poll: { ...f.result, status: 'ACTIVE', title: 'Aborted snapshot' } });
                    await new Promise(resolve => setTimeout(resolve, 0));
                });
                assert.equal(await page.$eval('#poll-stage', el => el.classList.contains('hidden')), true, 'Recovered null/reset must clear state and ignore aborted responses');
                assert.notEqual(await page.$eval('#poll-title', el => el.textContent), 'Aborted snapshot');

                await page.goto(url, { waitUntil: 'domcontentloaded' });
                await page.evaluate(async () => {
                    const f = competitiveFixture;
                    f.requests[0].respond({ poll: {
                        id: 'fixture-expired', title: 'Older final results', status: 'COMPLETED',
                        endedAt: new Date(f.now - 60000).toISOString(),
                        settings: { celebration: { sound: '/fixture-sound.mp3' } },
                        choices: [{ id: 'a', title: 'Star Harbor', votes: 4 }, { id: 'b', title: 'Moon Valley', votes: 2 }]
                    } });
                    await new Promise(resolve => setTimeout(resolve, 0));
                });
                assert.equal(await page.$eval('#poll-stage', el => el.classList.contains('hidden')), true);
                assert.equal(await page.evaluate(() => competitiveFixture.sounds), 0, 'Already expired HTTP results must not celebrate');
            } finally {
                await browser.close();
            }
        });
test('poll overlay renders live active poll, parses ?overlay=hash and toggles ?howtovote bottom footer', async () => {
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: 'new',
            pipe: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--allow-file-access-from-files']
        });
        const page = await browser.newPage();
        await installCompetitiveFixture(page, { '/api/polls/latest': { poll: null } });
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

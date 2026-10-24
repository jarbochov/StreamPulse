'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const puppeteer = require('puppeteer');

const NAV_JS_PATH = path.resolve(__dirname, '../public/js/nav.js');
const VERSUS_URL = 'file://' + path.resolve(__dirname, '../public/tools/versus.html');
const ADMIN_URL = 'file://' + path.resolve(__dirname, '../public/tools/tournament-admin.html');
const POLLS_URL = 'file://' + path.resolve(__dirname, '../public/tools/polls.html');

test('nav bar nests Tournament Manager inside Versus dropdown and handles completed tournaments', async () => {
    let browser;

    try {
        browser = await puppeteer.launch({
            headless: 'new',
            pipe: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--allow-file-access-from-files']
        });
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });

        // 1. Check nav on versus page (injecting nav.js directly)
        await page.goto(VERSUS_URL, { waitUntil: 'domcontentloaded' });
        await page.addScriptTag({ path: NAV_JS_PATH });
        await page.waitForSelector('#main-nav .dropdown');

        const navSubmenuData = await page.evaluate(() => {
            const submenu = document.querySelector('.dropdown-submenu');
            if (!submenu) return null;
            const toggle = submenu.querySelector('.dropdown-submenu-toggle');
            const items = Array.from(submenu.querySelectorAll('.dropdown-submenu-menu a')).map(a => ({
                label: a.textContent.trim(),
                href: a.getAttribute('href')
            }));
            return {
                parentText: toggle ? toggle.textContent.trim() : null,
                items
            };
        });

        assert.ok(navSubmenuData, 'Navigation should render .dropdown-submenu in Tools dropdown');
        assert.ok(navSubmenuData.parentText.includes('Versus'), 'Submenu parent toggle should be Versus');
        assert.equal(navSubmenuData.items.length, 2, 'Submenu should have 2 nested children');
        assert.equal(navSubmenuData.items[0].label, 'Versus Studio');
        assert.equal(navSubmenuData.items[0].href, '/versus.html');
        assert.equal(navSubmenuData.items[1].label, 'Tournament Manager');
        assert.equal(navSubmenuData.items[1].href, '/tournament-admin.html');

        // 2. Completed tournament remains visible and active in versus.html
        await page.evaluate(() => {
            const completedTourney = {
                id: 'comp-tourney-1',
                title: 'Spring Showdown',
                format: 'single',
                status: 'COMPLETED',
                champion: 'Simon',
                matches: [
                    { id: 'm1', round: 1, roundName: 'Finals', entrant1: { name: 'Simon', score: 2 }, entrant2: { name: 'Doug', score: 1 }, winner: 'Simon', status: 'COMPLETED' }
                ]
            };
            window.renderTournamentStudio(completedTourney);
        });

        const versusCardVisibility = await page.evaluate(() => {
            const monitorCard = document.getElementById('active-tourney-card');
            const createCard = document.getElementById('card-create-tourney');
            const title = document.getElementById('tourney-active-title')?.textContent;
            const reviewStep = document.querySelector('#bracket-steps .bstep[data-step="review"]')?.classList.contains('active');
            return {
                monitorDisplay: monitorCard ? monitorCard.style.display : null,
                createDisplay: createCard ? createCard.style.display : null,
                title,
                reviewActive: reviewStep
            };
        });

        assert.equal(versusCardVisibility.monitorDisplay, 'block', 'Active tournament card should stay visible when tournament status is COMPLETED');
        assert.equal(versusCardVisibility.createDisplay, 'none', 'Create tournament card should NOT hide completed tournament');
        assert.ok(versusCardVisibility.title.includes('Completed'), 'Title should indicate tournament is Completed');
        assert.equal(versusCardVisibility.reviewActive, true, 'Review step breadcrumb should be active');

        // 3. Check tournament-admin.html does NOT disable or hide completed tournament
        await page.goto(ADMIN_URL, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('#admin-empty-state');

        await page.evaluate(() => {
            const completedAdminTourney = {
                id: 'admin-comp-1',
                title: 'Masters Cup',
                format: 'single',
                status: 'COMPLETED',
                champion: 'Bees',
                matches: [
                    { id: 'm_fin', round: 1, roundName: 'Finals', entrant1: { name: 'Bees', score: 3 }, entrant2: { name: 'Jon', score: 0 }, winner: 'Bees', status: 'COMPLETED' }
                ]
            };
            window.renderAdminPage(completedAdminTourney);
        });

        const adminState = await page.evaluate(() => {
            const emptyState = document.getElementById('admin-empty-state');
            const matchesContainer = document.getElementById('admin-matches-container');
            const title = document.getElementById('admin-tourney-title')?.textContent;
            return {
                emptyDisplay: emptyState ? emptyState.style.display : null,
                matchesDisplay: matchesContainer ? matchesContainer.style.display : null,
                title
            };
        });

        assert.equal(adminState.emptyDisplay, 'none', 'tournament-admin empty state should NOT be displayed when status is COMPLETED');
        assert.equal(adminState.matchesDisplay, 'block', 'Matches container should remain visible to review completed tournament');
        assert.ok(adminState.title.includes('Completed'), 'Title should display Completed in tournament admin');

        // 4. Check polls.html has tournament overlay options (gap, accent, badgecolor, pipstyle, confetti, etc.)
        await page.goto(POLLS_URL, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('#tourney-opt-layout');

        const pollOptionsExist = await page.evaluate(() => {
            return {
                gap: !!document.getElementById('tourney-opt-gap'),
                accent: !!document.getElementById('tourney-opt-accent'),
                badgecolor: !!document.getElementById('tourney-opt-badgecolor'),
                pipstyle: !!document.getElementById('tourney-opt-pipstyle'),
                highlight: !!document.getElementById('tourney-opt-highlight'),
                center: !!document.getElementById('tourney-opt-center'),
                format: !!document.getElementById('tourney-opt-format'),
                mode: !!document.getElementById('tourney-opt-mode'),
                entrants: !!document.getElementById('tourney-opt-entrants'),
                status: !!document.getElementById('tourney-opt-status'),
                seeds: !!document.getElementById('tourney-opt-seeds'),
                tags: !!document.getElementById('tourney-opt-tags'),
                badges: !!document.getElementById('tourney-opt-badges'),
                champion: !!document.getElementById('tourney-opt-champion'),
                confetti: !!document.getElementById('tourney-opt-confetti'),
                confettiChecked: document.getElementById('tourney-opt-confetti')?.checked
            };
        });

        assert.equal(pollOptionsExist.gap, true, 'polls.html should have #tourney-opt-gap');
        assert.equal(pollOptionsExist.accent, true, 'polls.html should have #tourney-opt-accent');
        assert.equal(pollOptionsExist.badgecolor, true, 'polls.html should have #tourney-opt-badgecolor');
        assert.equal(pollOptionsExist.pipstyle, true, 'polls.html should have #tourney-opt-pipstyle');
        assert.equal(pollOptionsExist.highlight, true, 'polls.html should have #tourney-opt-highlight');
        assert.equal(pollOptionsExist.center, true, 'polls.html should have #tourney-opt-center');
        assert.equal(pollOptionsExist.format, true, 'polls.html should have #tourney-opt-format');
        assert.equal(pollOptionsExist.mode, true, 'polls.html should have #tourney-opt-mode');
        assert.equal(pollOptionsExist.seeds, true, 'polls.html should have #tourney-opt-seeds');
        assert.equal(pollOptionsExist.tags, true, 'polls.html should have #tourney-opt-tags');
        assert.equal(pollOptionsExist.badges, true, 'polls.html should have #tourney-opt-badges');
        assert.equal(pollOptionsExist.champion, true, 'polls.html should have #tourney-opt-champion');
        assert.equal(pollOptionsExist.confetti, true, 'polls.html should have #tourney-opt-confetti');
        assert.equal(pollOptionsExist.confettiChecked, false, '#tourney-opt-confetti should default to unchecked');

        // Test URL update in polls.html
        const pollUrlGenerated = await page.evaluate(() => {
            document.getElementById('tourney-opt-gap').value = '240px';
            document.getElementById('tourney-opt-accent').value = '#10b981';
            document.getElementById('tourney-opt-badgecolor').value = '#f59e0b';
            document.getElementById('tourney-opt-pipstyle').value = 'diamond';
            document.getElementById('tourney-opt-confetti').checked = true;
            window.updateTourneyOverlayUrl();
            return document.getElementById('url-tourney-overlay')?.value;
        });

        assert.ok(pollUrlGenerated.includes('gap=240px'), 'URL should include gap=240px');
        assert.ok(pollUrlGenerated.includes('accent=%2310b981') || pollUrlGenerated.includes('accent=#10b981'), 'URL should include accent');
        assert.ok(pollUrlGenerated.includes('badgecolor=%23f59e0b') || pollUrlGenerated.includes('badgecolor=#f59e0b'), 'URL should include badgecolor');
        assert.ok(pollUrlGenerated.includes('pipstyle=diamond'), 'URL should include pipstyle=diamond');
        assert.ok(pollUrlGenerated.includes('confetti=1'), 'URL should include confetti=1 when checked');

    } finally {
        if (browser) await browser.close();
    }
});

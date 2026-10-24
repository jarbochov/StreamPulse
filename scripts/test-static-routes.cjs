const http = require('http');
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer');
const assert = require('node:assert/strict');
const { createStaticRouter } = require('../server/static-router');

const rootDir = path.resolve(__dirname, '..');
const publicDir = path.join(rootDir, 'public');
const docsDir = path.join(rootDir, 'docs');

const staticRouter = createStaticRouter({
    rootDir,
    publicDir,
    customOverlayAssetsDir: path.join(rootDir, 'data', 'custom-overlay-assets')
});

const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/docs' || url.pathname.startsWith('/docs/')) {
        const relativePath = decodeURIComponent(url.pathname.slice('/docs'.length)).replace(/^\/+/, '') || 'index.html';
        const docsPath = path.resolve(docsDir, relativePath);
        if (!docsPath.startsWith(docsDir + path.sep)) {
            res.writeHead(403);
            res.end('Forbidden');
            return;
        }
        fs.readFile(docsPath, (err, content) => {
            if (err) {
                res.writeHead(err.code === 'ENOENT' ? 404 : 500);
                res.end(err.code === 'ENOENT' ? 'Not Found' : 'Internal Server Error');
                return;
            }
            const contentTypes = {
                '.css': 'text/css; charset=utf-8',
                '.html': 'text/html; charset=utf-8',
                '.js': 'application/javascript; charset=utf-8',
                '.md': 'text/markdown; charset=utf-8',
                '.svg': 'image/svg+xml'
            };
            res.writeHead(200, { 'Content-Type': contentTypes[path.extname(docsPath)] || 'application/octet-stream' });
            res.end(content);
        });
        return;
    }
    if (url.pathname === '/api/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ viewers: { live: false, current: 0 }, twitch: { hasToken: false }, ssn: { connected: false } }));
        return;
    }
    const fixtures = {
        '/api/config': { theme: {}, music: { enabled: false }, credits: {} },
        '/api/randomizer/presets': { presets: [] },
        '/api/randomizer/button-presets': { presets: [] },
        '/api/randomizer/quote-presets': { presets: [] },
        '/api/randomizer/chatters': { chatters: [] },
        '/api/variables': { variables: [] },
        '/api/music/now-playing': { state: 'stopped' },
        '/api/music/overlay': { visible: true },
        '/api/chatbot': { settings: {}, commands: [], messages: [], quotes: [], triggers: [] },
        '/api/chatbot/log': [],
        '/api/chatbot/usage': {},
        '/api/polls/active': { status: 'ok', poll: null },
        '/api/polls/history': { status: 'ok', history: [] },
        '/api/polls/presets': { status: 'ok', presets: [] },
        '/api/tournament': { status: 'ok', tournament: null },
        '/api/tournament/history': { status: 'ok', history: [] },
        '/api/tournament/presets': { status: 'ok', presets: [] },
        '/api/matchup': { status: 'ok', matchup: null, queue: [] },
        '/api/matchup/presets': { status: 'ok', presets: [] },
        '/api/matchup/history': { status: 'ok', history: [] }
    };
    if (Object.hasOwn(fixtures, url.pathname)) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(fixtures[url.pathname]));
        return;
    }
    if (staticRouter.handleRequest(req, res)) {
        return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
});

const legacyUrlsToTest = [
    // Overlays (OBS browser sources)
    '/credits.html',
    '/stats.html',
    '/hashtags.html',
    '/viewers.html',
    '/goal.html',
    '/goal.html?mode=cycle',
    '/game-plan.html',
    '/milestones.html',
    '/randomizer.html',
    '/randomizer.html?mode=roller&theme=purple',
    '/music.html',
    '/music.html?mode=mini',
    '/countdown.html',
    '/stopwatch.html',
    '/custom-overlay.html',
    '/tournament.html',
    '/matchup.html',
    '/poll.html',

    // Editors & Studios
    '/credits-editor.html',
    '/theme-editor.html',
    '/randomizer-editor.html',
    '/timers-editor.html',
    '/goals-editor.html',
    '/game-plan-editor.html',
    '/music-editor.html',
    '/assets.html',
    '/custom-overlay-editor.html',

    // URL Wizards
    '/overlay-url-wizard.html',
    '/timer-url-wizard.html',
    '/music-url-wizard.html',
    '/game-plan-url-wizard.html',
    '/milestone-url-wizard.html',

    // Tools
    '/polls.html',
    '/versus.html',
    '/competitions.html',
    '/tournaments.html',
    '/chatbot.html',
    '/commands.html',
    '/alerts.html',
    '/alert-queue.html',
    '/placeholders.html',
    '/manage-hashtags.html',

    // Library
    '/sessions.html',
    '/highlights.html',
    '/clips.html',
    '/categories.html',
    '/analytics.html',
    '/hashtag-stats.html',

    // System
    '/config-editor.html',
    '/twitch-connect.html',
    '/backup.html',
    '/update.html',
    '/overlays.html',
    '/custom-overlays.html',

    // Top Level
    '/dashboard.html',
    '/api.html',
    '/docs.html',

    // Assets & Scripts
    '/admin.css',
    '/nav.js',
    '/appearance.js',
    '/credits.js',
    '/overlay-shared.js',
    '/overlay-runtime.js',
    '/overlay-presets.js',
    '/overlay-theme.js',
    '/timers-overlay.js',
    '/tag-chips.js',
    '/favicon.svg'
];

const structuredUrlsToTest = [
    '/overlays/music.html',
    '/overlays/randomizer.html',
    '/overlays/credits.html',
    '/overlays/tournament.html',
    '/overlays/poll.html',
    '/editors/randomizer-editor.html',
    '/editors/timers-editor.html',
    '/tools/chatbot.html',
    '/library/sessions.html',
    '/system/config-editor.html',
    '/css/admin.css',
    '/js/nav.js'
];

async function run() {
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    console.log(`Testing server running at ${baseUrl}...`);
    let passed = 0;
    let failed = 0;

    // 1. Test all legacy URLs via HTTP fetch
    console.log('\n--- 1. Testing Legacy Root URLs (HTTP 200) ---');
    for (const urlPath of legacyUrlsToTest) {
        try {
            const res = await fetch(`${baseUrl}${urlPath}`);
            await res.arrayBuffer();
            if (res.status === 200) {
                passed++;
            } else {
                console.error(`FAIL: ${urlPath} returned HTTP ${res.status}`);
                failed++;
            }
        } catch (err) {
            console.error(`FAIL: ${urlPath} threw error: ${err.message}`);
            failed++;
        }
    }
    console.log(`Legacy URLs tested: ${legacyUrlsToTest.length}, Passed: ${passed}, Failed: ${failed}`);

    // 2. Test structured categorized URLs
    console.log('\n--- 2. Testing Structured Categorized URLs ---');
    let structPassed = 0;
    for (const urlPath of structuredUrlsToTest) {
        const res = await fetch(`${baseUrl}${urlPath}`);
        await res.arrayBuffer();
        if (res.status === 200) {
            structPassed++;
        } else {
            console.error(`FAIL: ${urlPath} returned HTTP ${res.status}`);
            failed++;
        }
    }
    console.log(`Structured URLs tested: ${structuredUrlsToTest.length}, Passed: ${structPassed}`);
    assert.equal(failed, 0, 'Static URL requests failed');

    // 3. Test in Puppeteer for visual rendering & console errors
    console.log('\n--- 3. Testing in Headless Browser (Puppeteer) ---');
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });
        await page.setRequestInterception(true);
        page.on('request', request => {
            if (/^https?:/.test(request.url()) && !request.url().startsWith(baseUrl + '/')) {
                request.respond({ status: 204 }).catch(() => {});
            } else {
                request.continue().catch(() => {});
            }
        });
        const pageErrors = [];
        page.on('pageerror', err => pageErrors.push(err.message));

        // Test dashboard at root
        console.log('Testing dashboard in browser...');
        await page.goto(`${baseUrl}/dashboard.html`, { waitUntil: 'networkidle0' });
        assert.ok(await page.$('#main-nav'), 'Dashboard navigation is missing');
        console.log('✓ Dashboard rendered successfully with main-nav');

        // Test documentation navigation on a phone-sized viewport
        console.log('Testing documentation mobile navigation...');
        await page.setViewport({ width: 390, height: 844 });
        await page.goto(`${baseUrl}/docs/`, { waitUntil: 'networkidle0' });
        await page.waitForSelector('.sidebar-toggle');
        await page.waitForSelector('.markdown-section h1');
        let mobileLayout = await page.evaluate(() => {
            const toggle = document.querySelector('.sidebar-toggle').getBoundingClientRect();
            const sidebar = document.querySelector('.sidebar').getBoundingClientRect();
            return {
                viewportWidth: window.innerWidth,
                documentWidth: document.documentElement.scrollWidth,
                toggleRight: toggle.right,
                toggleTop: toggle.top,
                toggleBottom: toggle.bottom,
                sidebarRight: sidebar.right,
                expanded: document.querySelector('.sidebar-toggle').getAttribute('aria-expanded')
            };
        });
        assert.ok(mobileLayout.documentWidth <= mobileLayout.viewportWidth, 'Documentation page overflows horizontally on mobile');
        assert.ok(mobileLayout.toggleRight <= mobileLayout.viewportWidth && mobileLayout.toggleTop >= 0, 'Mobile navigation toggle is outside the viewport');
        assert.ok(mobileLayout.toggleBottom <= 68, 'Mobile navigation toggle is outside the compact header');
        assert.ok(mobileLayout.sidebarRight <= 0, 'Mobile sidebar should start closed');
        assert.equal(mobileLayout.expanded, 'false', 'Closed mobile sidebar should report aria-expanded=false');

        await page.click('.sidebar-toggle');
        await page.waitForFunction(() => {
            const sidebar = document.querySelector('.sidebar').getBoundingClientRect();
            return document.body.classList.contains('close') && sidebar.left >= -1;
        }, { timeout: 2000 });
        assert.equal(await page.$eval('.sidebar-toggle', toggle => toggle.getAttribute('aria-expanded')), 'true');
        await page.click('.sidebar-nav a[href="#/features"]');
        await page.waitForFunction(() => document.querySelector('.markdown-section h1')?.textContent.includes('Features'));
        await page.waitForFunction(() => !document.body.classList.contains('close'));
        mobileLayout = await page.evaluate(() => ({
            viewportWidth: window.innerWidth,
            documentWidth: document.documentElement.scrollWidth,
            expanded: document.querySelector('.sidebar-toggle').getAttribute('aria-expanded')
        }));
        assert.ok(mobileLayout.documentWidth <= mobileLayout.viewportWidth, 'Feature guide overflows horizontally on mobile');
        assert.equal(mobileLayout.expanded, 'false', 'Mobile sidebar should close after navigating to a guide');
        await page.setViewport({ width: 320, height: 720 });
        mobileLayout = await page.evaluate(() => {
            const toggle = document.querySelector('.sidebar-toggle').getBoundingClientRect();
            return {
                viewportWidth: window.innerWidth,
                documentWidth: document.documentElement.scrollWidth,
                toggleRight: toggle.right
            };
        });
        assert.ok(mobileLayout.documentWidth <= mobileLayout.viewportWidth, 'Feature guide overflows horizontally at narrow mobile width');
        assert.ok(mobileLayout.toggleRight <= mobileLayout.viewportWidth, 'Mobile navigation toggle is outside a narrow viewport');
        console.log('✓ Mobile navigation opens, navigates, and closes without horizontal overflow');

        // Test randomizer overlay at legacy root url
        console.log('Testing randomizer overlay in browser...');
        await page.goto(`${baseUrl}/randomizer.html?mode=roller&theme=purple`, { waitUntil: 'networkidle0' });
        assert.ok(await page.$('#roller-view'), 'Randomizer roller is missing');
        console.log('✓ Randomizer overlay rendered successfully at legacy root URL');

        // Test randomizer editor at legacy root url
        console.log('Testing randomizer editor in browser...');
        await page.goto(`${baseUrl}/randomizer-editor.html`, { waitUntil: 'networkidle0' });
        assert.ok(await page.$('#btn-spin'), 'Randomizer spin control is missing');
        console.log('✓ Randomizer editor rendered successfully at legacy root URL');

        // Test music overlay at legacy root url
        console.log('Testing music overlay in browser...');
        await page.goto(`${baseUrl}/music.html?mode=mini`, { waitUntil: 'networkidle0' });
        console.log('✓ Music overlay loaded at legacy root URL');

        // Test chatbot at legacy root url
        console.log('Testing chatbot in browser...');
        await page.goto(`${baseUrl}/chatbot.html`, { waitUntil: 'networkidle0' });
        console.log('✓ Chatbot page loaded at legacy root URL');
        assert.deepEqual(pageErrors, [], 'Browser pages reported uncaught errors');

        console.log('\n========================================');
        console.log('ALL PHASE 1 URL REDIRECTION TESTS PASSED!');
        console.log('========================================');
    } finally {
        await browser.close();
    }
}

run().catch(err => {
    console.error(err);
    process.exitCode = 1;
}).finally(() => {
    server.close();
    server.closeAllConnections();
});

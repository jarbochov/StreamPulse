const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

// Import server components
const { createStaticRouter } = require('../server/static-router');
const { createSystemRoutes } = require('../server/routes/system');

const PORT = 4831;
const CONFIG_PATH = path.join(__dirname, 'test-temp-config.json');

const initialConfig = {
    broadcaster_name: 'test_streamer',
    active_subs_only: false,
    days_filter: 30,
    hashtags_enabled: true,
    chatbot_enabled: true,
    chat_log_enabled: true,
    auto_backup_on_session_end: false,
    rate_limit: { enabled: false, requests_per_minute: 120, mutation_per_minute: 30 },
    theme: {},
    music: { enabled: false, source: 'apple_music', poll_seconds: 5 },
    clip_candidates: { enabled: true, chat_spike_messages: 5 },
    credits: { sections: {}, section_order: [], special_thanks: {}, custom_sections: [], social: {} },
    session_lifecycle: { auto: false },
    viewer_tracking: { enabled: false },
    weather: { enabled: false }
};

fs.writeFileSync(CONFIG_PATH, JSON.stringify(initialConfig, null, 2));

let config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

function normalizeClipCandidateConfig(val) {
    const input = val && typeof val === 'object' ? val : {};
    return {
        enabled: input.enabled !== false,
        chat_spike_messages: Number(input.chat_spike_messages) || 5
    };
}

const handleSystemRoutes = createSystemRoutes({
    rootDir: path.resolve(__dirname, '..'),
    configPath: CONFIG_PATH,
    getConfig: () => config,
    safeWriteFileSync: (p, data) => { fs.writeFileSync(p, data); },
    applyRuntimeConfig: (next) => { config = next; },
    getRestartRequiredConfigChanges: () => [],
    normalizeViewerTrackingConfig: (c) => c,
    normalizeWeatherConfig: (c) => ({ enabled: c?.enabled === true }),
    normalizeGoalsConfig: (c) => c,
    normalizeClipCandidateConfig,
    getBroadcasterName: () => config.broadcaster_name,
    port: PORT,
    getTwitchClientId: () => '',
    getTwitchClientSecret: () => '',
    getStatus: () => ({
        twitch: { hasToken: twitchConnected },
        modules: {
            chatbot: config.chatbot_enabled !== false,
            clips: config.clip_candidates?.enabled !== false,
            weather: config.weather?.enabled === true,
            music: config.music?.enabled === true,
            hashtags: config.hashtags_enabled !== false,
            promoCreator: config.promo_creator_enabled === true
        }
    })
});

let twitchConnected = true;

const rootDir = path.resolve(__dirname, '..');
const publicDir = path.join(rootDir, 'public');

const staticRouter = createStaticRouter({
    rootDir,
    publicDir,
    customOverlayAssetsDir: path.join(rootDir, 'data', 'custom-overlay-assets')
});

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const pathname = url.pathname;

    if (pathname === '/api/twitch/auth/status' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            connected: twitchConnected,
            mode: 'shared_device',
            clientId: 'fictional-client',
            broadcasterConfigured: true,
            broadcasterSaved: twitchConnected,
            scopes: twitchConnected ? ['channel:read:subscriptions', 'channel:read:polls'] : []
        }));
        return;
    }
    if (pathname === '/api/twitch/auth/disconnect' && req.method === 'POST') {
        twitchConnected = false;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
    }

    const handled = await handleSystemRoutes(req, res, url, pathname);
    if (handled) return;

    if (staticRouter.handleRequest(req, res)) return;

    res.writeHead(404);
    res.end('Not found');
});

server.listen(PORT, async () => {
    console.log(`Test server running on port ${PORT}...`);
    try {
        // 1. Test GET /api/config
        console.log('Testing GET /api/config...');
        let res = await fetch(`http://localhost:${PORT}/api/config`);
        let json = await res.json();
        if (json.music && json.music.enabled === false) {
            console.log('✓ GET /api/config returned music config');
        } else {
            throw new Error(`GET /api/config music mismatch: ${JSON.stringify(json.music)}`);
        }
        if (json.clip_candidates && json.clip_candidates.enabled === true) {
            console.log('✓ GET /api/config returned clip_candidates config');
        } else {
            throw new Error(`GET /api/config clip_candidates mismatch: ${JSON.stringify(json.clip_candidates)}`);
        }
        if (json.promo_creator_enabled === false) {
            console.log('✓ GET /api/config defaults promo_creator_enabled to false');
        } else {
            throw new Error(`GET /api/config promo_creator_enabled should default false, got: ${JSON.stringify(json.promo_creator_enabled)}`);
        }

        // 2. Test PUT /api/config
        console.log('Testing PUT /api/config with clip_candidates.enabled = false...');
        res = await fetch(`http://localhost:${PORT}/api/config`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clip_candidates: { enabled: false } })
        });
        json = await res.json();
        if (json.status !== 'saved') throw new Error(`PUT /api/config failed: ${JSON.stringify(json)}`);
        if (config.clip_candidates.enabled !== false) throw new Error('config.clip_candidates.enabled was not updated');
        console.log('✓ PUT /api/config updated clip_candidates.enabled to false');

        // 3. Test Puppeteer
        console.log('Launching headless browser...');
        const browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 900 });

        console.log('Navigating to config-editor.html...');
        await page.goto(`http://localhost:${PORT}/config-editor.html`, { waitUntil: 'networkidle0' });

        // Wait for modules tab
        await page.waitForSelector('#config-editor .tab-btn');
        await page.evaluate(() => {
            document.querySelector('.tab-btn[data-tab="modules"]')?.click();
        });
        await page.waitForSelector('.module-card');

        // Check if Chat Bot, Music section and Clip Detection section exist and have BETA tags
        const betaSummaryTags = await page.evaluate(() => {
            const results = {};
            document.querySelectorAll('.module-card-title').forEach(s => {
                const text = s.querySelector('span')?.textContent?.trim() || '';
                const hasTag = !!s.querySelector('.beta-tag');
                if (['Chat Bot', 'Music Now-Playing', 'Clip Detection'].includes(text)) {
                    results[text === 'Music Now-Playing' ? 'Music' : text] = hasTag;
                }
            });
            return results;
        });

        for (const mod of ['Music', 'Clip Detection']) {
            if (!betaSummaryTags[mod]) throw new Error(`Summary for ${mod} is missing BETA tag! Got: ${JSON.stringify(betaSummaryTags)}`);
            console.log(`✓ ${mod} section has BETA badge in summary heading`);
        }

        // Verify that setting checkbox labels DO NOT have duplicate beta tags
        const checkboxLabelsHaveBeta = await page.evaluate(() => {
            const labels = [
                document.querySelector('label[for="cfg-chatbot-enabled"]'),
                document.querySelector('label[for="cfg-music-enabled"]'),
                document.querySelector('label[for="cfg-clips-enabled"]')
            ];
            return labels.some(l => !!l?.querySelector('.beta-tag'));
        });
        if (checkboxLabelsHaveBeta) throw new Error('Duplicate beta-tag found on setting checkbox labels! Only title should have it.');
        console.log('✓ Setting checkbox labels have NO duplicate beta tags (only on title)');

        // Initial state: config has music.enabled = false, clips.enabled = false
        const musicInNavWhenDisabled = await page.evaluate(() => {
            const links = [...document.querySelectorAll('#main-nav a')];
            return links.some(a => a.textContent.includes('Music Settings'));
        });
        if (musicInNavWhenDisabled) throw new Error('Music Settings was STILL present in navbar while music is disabled! Modularity failed.');
        console.log('✓ Music Settings is correctly HIDDEN from navbar when music is disabled');

        const clipsInNavWhenDisabled = await page.evaluate(() => {
            const links = [...document.querySelectorAll('#main-nav a')];
            return links.some(a => a.textContent.includes('Clips'));
        });
        if (clipsInNavWhenDisabled) throw new Error('Clips was STILL present in navbar while clips is disabled! Modularity failed.');
        console.log('✓ Clips is correctly HIDDEN from navbar when clips is disabled');

        // Verify Promo Creator is hidden by default & Twitch Connect removed from System nav
        const navChecksBefore = await page.evaluate(() => {
            const links = [...document.querySelectorAll('#main-nav a')];
            const headings = [...document.querySelectorAll('#main-nav .menu-heading')].map(el => el.textContent.trim());
            const twitchPillHref = document.getElementById('nav-twitch-indicator')?.getAttribute('href') || '';
            return {
                hasPromo: links.some(a => a.textContent.includes('Promo Creator')),
                hasProdHeading: headings.includes('Production & Exports'),
                hasTwitchNav: links.some(a => a.textContent.trim() === 'Twitch Connect'),
                twitchPillHref
            };
        });
        if (navChecksBefore.hasPromo || navChecksBefore.hasProdHeading) {
            throw new Error(`Promo Creator / Production & Exports should be hidden when disabled: ${JSON.stringify(navChecksBefore)}`);
        }
        if (navChecksBefore.hasTwitchNav) throw new Error('Twitch Connect should be removed from System nav dropdown!');
        if (navChecksBefore.twitchPillHref !== '/config-editor.html#connection') {
            throw new Error(`Expected nav-twitch-indicator href /config-editor.html#connection, got ${navChecksBefore.twitchPillHref}`);
        }
        console.log('✓ Promo Creator hidden by default, Twitch Connect removed from System nav, status pill links to #connection');

        // Verify Production & Exports sub-nav & search filter (without marking config dirty)
        const searchCheck = await page.evaluate(() => {
            const input = document.getElementById('module-search');
            const dirtyPill = document.getElementById('dirty-pill');
            const prodTab = document.querySelector('#pane-modules [data-module-cat="production"]');
            if (!input || !prodTab) return { ok: false, reason: 'missing search input or production tab' };
            input.value = 'promo';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            const visibleCards = [...document.querySelectorAll('#pane-modules .module-card')].filter(c => c.style.display !== 'none').map(c => c.getAttribute('data-module'));
            const dirtyAfterSearch = dirtyPill.classList.contains('show');
            input.value = 'zzznomatchservice';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            const emptyShown = !document.getElementById('module-empty-state').hidden;
            document.getElementById('module-empty-reset').click();
            const restoredCount = [...document.querySelectorAll('#pane-modules .module-card')].filter(c => c.style.display !== 'none').length;
            return { ok: true, visibleCards, dirtyAfterSearch, emptyShown, restoredCount };
        });
        if (!searchCheck.ok || searchCheck.visibleCards.length !== 1 || searchCheck.visibleCards[0] !== 'promo-creator') {
            throw new Error(`Module search failed: ${JSON.stringify(searchCheck)}`);
        }
        if (searchCheck.dirtyAfterSearch) throw new Error('Typing in #module-search should NOT mark config dirty!');
        if (!searchCheck.emptyShown || searchCheck.restoredCount < 10) {
            throw new Error(`Empty state / reset failed: ${JSON.stringify(searchCheck)}`);
        }
        console.log('✓ Module search filter works live, preserves clean dirty state, and handles empty state + reset');

        // Open details to make Chat Bot, Music, and Clip Detection visible
        await page.evaluate(() => {
            document.querySelectorAll('#config-editor details').forEach(d => {
                const title = d.querySelector('summary')?.textContent || '';
                if (title.includes('Chat Bot') || title.includes('Music') || title.includes('Clip Detection')) {
                    d.open = true;
                }
            });
        });

        // Toggle on
        await page.$eval('#cfg-chatbot-enabled', el => { el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true })); });
        await page.$eval('#cfg-music-enabled', el => { el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true })); });
        await page.$eval('#cfg-clips-enabled', el => { el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true })); });
        await page.$eval('#cfg-promo-creator-enabled', el => { el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true })); });

        // Save
        console.log('Saving config in UI with all modules enabled...');
        await page.click('#top-save-config');
        await page.waitForSelector('.toast.show', { timeout: 3000 });
        console.log('✓ Saved successfully from UI!');

        // Verify server config was updated
        if (config.chatbot_enabled !== true) throw new Error('Chat Bot was not enabled in config!');
        if (config.music.enabled !== true) throw new Error('Music was not enabled in config!');
        if (config.clip_candidates.enabled !== true) throw new Error('Clip Detection was not enabled in config!');
        if (config.promo_creator_enabled !== true) throw new Error('Promo Creator was not enabled in config!');
        console.log('✓ Server config now has chatbot_enabled, music.enabled, clip_candidates.enabled, and promo_creator_enabled = true');

        // Verify Promo Creator now appears under Tools > Production & Exports
        const promoInNavWhenEnabled = await page.evaluate(() => {
            const toolsDropdown = [...document.querySelectorAll('#main-nav .dropdown')].find(d => d.querySelector('.dropdown-toggle')?.textContent?.trim() === 'Tools');
            const headings = [...(toolsDropdown?.querySelectorAll('.menu-heading') || [])].map(h => h.textContent.trim());
            const links = [...(toolsDropdown?.querySelectorAll('a[href]') || [])].map(a => a.getAttribute('href'));
            return { hasHeading: headings.includes('Production & Exports'), hasLink: links.includes('/promo-creator.html') };
        });
        if (!promoInNavWhenEnabled.hasHeading || !promoInNavWhenEnabled.hasLink) {
            throw new Error(`Promo Creator / Production & Exports did not appear under Tools nav: ${JSON.stringify(promoInNavWhenEnabled)}`);
        }
        console.log('✓ Promo Creator appears under Tools → Production & Exports after enabling');

        // Switch to Connection & Security tab and verify Twitch Connection card
        await page.evaluate(() => {
            document.querySelector('.tab-btn[data-tab="connection"]')?.click();
        });
        await page.waitForFunction(() => document.getElementById('badge-twitch')?.textContent === 'Connected', { timeout: 3000 });
        const twitchCardState = await page.evaluate(() => ({
            badge: document.getElementById('badge-twitch')?.textContent,
            status: document.getElementById('cfg-twitch-auth-status')?.textContent,
            deviceHref: document.getElementById('cfg-twitch-device-link')?.getAttribute('href'),
            oauthHref: document.getElementById('cfg-twitch-oauth-link')?.getAttribute('href'),
            scopeCount: document.querySelectorAll('#cfg-twitch-scopes .twitch-scope-chip').length,
            disconnectVisible: !document.getElementById('cfg-twitch-disconnect-btn')?.hidden
        }));
        if (twitchCardState.deviceHref !== '/twitch-connect.html' || twitchCardState.oauthHref !== '/auth/twitch' || twitchCardState.scopeCount !== 2 || !twitchCardState.disconnectVisible) {
            throw new Error(`Twitch Connection card mismatch: ${JSON.stringify(twitchCardState)}`);
        }
        console.log('✓ Twitch Connection card displays Connected status, scopes, auth links, and Disconnect button');

        // Test Disconnect action (override confirm)
        await page.evaluate(() => { window.confirm = () => true; });
        await page.click('#cfg-twitch-disconnect-btn');
        await page.waitForFunction(() => document.getElementById('badge-twitch')?.textContent === 'Not Connected', { timeout: 3000 });
        const afterDisconnect = await page.evaluate(() => ({
            badge: document.getElementById('badge-twitch')?.textContent,
            disconnectHidden: document.getElementById('cfg-twitch-disconnect-btn')?.hidden
        }));
        if (!afterDisconnect.disconnectHidden) throw new Error('Disconnect button should hide after disconnecting Twitch');
        console.log('✓ Twitch Disconnect updates live status to Not Connected');

        // Switch back to Modules tab for remaining assertions
        await page.evaluate(() => {
            document.querySelector('.tab-btn[data-tab="modules"]')?.click();
        });

        // Verify Music Settings and Clips NOW appear in navbar
        const musicInNavWhenEnabled = await page.evaluate(() => {
            const links = [...document.querySelectorAll('#main-nav a')];
            return links.some(a => a.textContent.includes('Music Settings'));
        });
        if (!musicInNavWhenEnabled) throw new Error('Music Settings did not appear in navbar after enabling!');
        console.log('✓ Music Settings correctly APPEARS in navbar after enabling');

        const clipsInNavWhenEnabled = await page.evaluate(() => {
            const links = [...document.querySelectorAll('#main-nav a')];
            return links.some(a => a.textContent.includes('Clips'));
        });
        if (!clipsInNavWhenEnabled) throw new Error('Clips did not appear in navbar after enabling!');
        console.log('✓ Clips correctly APPEARS in navbar after enabling');

        // Now toggle music back off in UI and save
        console.log('Toggling music back off in UI and saving...');
        await page.$eval('#cfg-music-enabled', el => { el.checked = false; el.dispatchEvent(new Event('change', { bubbles: true })); });
        await page.click('#top-save-config');
        await new Promise(r => setTimeout(r, 600));

        const musicInNavAfterDisable = await page.evaluate(() => {
            const links = [...document.querySelectorAll('#main-nav a')];
            return links.some(a => a.textContent.includes('Music Settings'));
        });
        if (musicInNavAfterDisable) throw new Error('Music Settings remained in navbar after being disabled!');
        console.log('✓ Music Settings correctly DISAPPEARS from navbar immediately when disabled!');

        // Scroll to Chat Bot section and screenshot
        await page.evaluate(() => {
            document.querySelectorAll('#config-editor details').forEach(d => {
                const title = d.querySelector('summary')?.textContent || '';
                if (title.includes('Chat Bot')) {
                    d.scrollIntoView({ behavior: 'instant', block: 'start' });
                }
            });
        });
        const artifactDir = '/Users/jaredacherup/.gemini/antigravity-cli/brain/1124f4e5-e872-47d9-8fc6-aab167e140a9';
        await page.screenshot({ path: path.join(artifactDir, 'screenshot-config-editor-modular.png'), fullPage: false });
        console.log('✓ Saved screenshot to screenshot-config-editor-modular.png');

        await browser.close();
        console.log('\nALL MODULAR CONFIG TESTS PASSED!');
    } finally {
        server.close();
        try { fs.unlinkSync(CONFIG_PATH); } catch (e) {}
    }
});

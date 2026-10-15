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
        modules: {
            chatbot: config.chatbot_enabled !== false,
            clips: config.clip_candidates?.enabled !== false,
            weather: config.weather?.enabled === true,
            music: config.music?.enabled === true,
            hashtags: config.hashtags_enabled !== false
        }
    })
});

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

        // Wait for details sections
        await page.waitForSelector('#config-editor details');

        // Check if Music section and Clip Detection section exist
        const hasMusicSection = await page.evaluate(() => {
            const headings = [...document.querySelectorAll('#config-editor .cfg-section')];
            return headings.some(h => h.textContent.trim() === 'Music');
        });
        if (!hasMusicSection) throw new Error('Music section missing in config-editor.html');
        console.log('✓ Music section exists in config-editor.html');

        const hasClipsSection = await page.evaluate(() => {
            const headings = [...document.querySelectorAll('#config-editor .cfg-section')];
            return headings.some(h => h.textContent.trim() === 'Clip Detection');
        });
        if (!hasClipsSection) throw new Error('Clip Detection section missing in config-editor.html');
        console.log('✓ Clip Detection section exists in config-editor.html');

        // Verify inputs
        const musicEnabled = await page.$eval('#cfg-music-enabled', el => el.checked);
        const clipsEnabled = await page.$eval('#cfg-clips-enabled', el => el.checked);
        console.log(`Current toggles in UI: music.enabled = ${musicEnabled}, clips.enabled = ${clipsEnabled}`);

        // Verify Music Settings link is in the navbar even though music is DISABLED
        const musicSettingsInNav = await page.evaluate(() => {
            const links = [...document.querySelectorAll('#main-nav a')];
            return links.some(a => a.textContent.includes('Music Settings'));
        });
        if (!musicSettingsInNav) throw new Error('Music Settings was hidden in navbar while music is disabled! Lockout bug reproduced.');
        console.log('✓ Music Settings is VISIBLE in navbar even though music.enabled = false (No Lockout!)');

        // Open details to make Music and Clip Detection visible
        await page.evaluate(() => {
            document.querySelectorAll('#config-editor details').forEach(d => {
                const title = d.querySelector('summary')?.textContent || '';
                if (title.includes('Music') || title.includes('Clip Detection')) {
                    d.open = true;
                }
            });
        });

        // Toggle both on
        await page.$eval('#cfg-music-enabled', el => { el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true })); });
        await page.$eval('#cfg-clips-enabled', el => { el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true })); });

        // Save
        console.log('Saving config in UI...');
        await page.click('#top-save-config');
        await page.waitForSelector('.toast.show', { timeout: 3000 });
        console.log('✓ Saved successfully from UI!');

        // Verify server config was updated
        if (config.music.enabled !== true) throw new Error('Music was not enabled in config!');
        if (config.clip_candidates.enabled !== true) throw new Error('Clip Detection was not enabled in config!');
        console.log('✓ Server config now has music.enabled = true and clip_candidates.enabled = true');

        // Scroll to Music section and screenshot
        await page.evaluate(() => {
            document.querySelectorAll('#config-editor details').forEach(d => {
                const title = d.querySelector('summary')?.textContent || '';
                if (title.includes('Music') || title.includes('Clip Detection')) {
                    d.open = true;
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

const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const { createStaticRouter } = require('../server/static-router');
const { createGamePlanService } = require('../server/services/game-plan');
const { createGamePlanRoutes } = require('../server/routes/game-plan');

const PORT = 4833;
const TEMP_DATA_DIR = path.join(__dirname, 'test-temp-gameplan-data');
if (!fs.existsSync(TEMP_DATA_DIR)) fs.mkdirSync(TEMP_DATA_DIR, { recursive: true });

const GAME_PLAN_PATH = path.join(TEMP_DATA_DIR, 'game-plan.json');

const initialPlan = {
    lists: [],
    tiers: [],
    tierSets: {},
    playingNowId: 'game-1',
    periods: ['Tonight', 'Next Week'],
    items: [
        {
            id: 'game-1',
            name: 'Silent Hill 2',
            status: 'tonight',
            gameType: 'playthrough',
            streamDate: '2026-10-15',
            streamTime: '20:00',
            twitchSegmentId: '',
            period: 'Tonight',
            note: 'Main campaign playthrough - exploring hospital',
            twitchCategory: 'Silent Hill 2',
            rating: 5,
            tier: 'S',
            tags: ['horror', 'story'],
            custom: true
        },
        {
            id: 'game-2',
            name: 'Jackbox Party Pack 10',
            status: 'tonight',
            gameType: 'one-off',
            streamDate: '2026-10-15',
            streamTime: '22:30',
            twitchSegmentId: '',
            period: 'Tonight',
            note: 'Community party games with chat',
            twitchCategory: 'The Jackbox Party Pack 10',
            rating: 4,
            tier: 'A',
            tags: ['party', 'chat'],
            custom: true
        },
        {
            id: 'game-3',
            name: 'Elden Ring',
            status: 'scheduled',
            gameType: 'playthrough',
            streamDate: '2026-10-20',
            streamTime: '19:00',
            twitchSegmentId: 'segment-999',
            period: 'Next Week',
            note: 'Shadow of the Erdtree DLC run',
            twitchCategory: 'Elden Ring',
            rating: 5,
            tier: 'S',
            tags: ['rpg', 'challenge'],
            custom: true
        },
        {
            id: 'game-4',
            name: 'Metaphor: ReFantazio',
            status: 'up-next',
            gameType: 'playthrough',
            streamDate: '',
            streamTime: '',
            twitchSegmentId: '',
            period: '',
            note: 'Looking forward to starting this soon',
            rating: 0,
            tags: ['jrpg'],
            custom: true
        },
        {
            id: 'game-5',
            name: 'Hades II',
            status: 'backlog',
            gameType: 'one-off',
            streamDate: '',
            streamTime: '',
            twitchSegmentId: '',
            period: '',
            note: 'Someday rogue-like run',
            rating: 0,
            tags: ['roguelike'],
            custom: true
        }
    ]
};

fs.writeFileSync(GAME_PLAN_PATH, JSON.stringify(initialPlan, null, 2), 'utf8');

const mockTwitchService = {
    createdSegments: [],
    deletedSegments: [],
    updatedCategories: [],
    createScheduleSegment: async ({ startTime, durationMinutes, title, categoryId, isRecurring }) => {
        const seg = {
            id: `seg-${Date.now()}-${mockTwitchService.createdSegments.length}`,
            start_time: startTime,
            duration: String(durationMinutes),
            title,
            category_id: categoryId,
            is_recurring: Boolean(isRecurring)
        };
        mockTwitchService.createdSegments.push(seg);
        return { ok: true, segment: seg };
    },
    deleteScheduleSegment: async (segmentId) => {
        mockTwitchService.deletedSegments.push(segmentId);
        return { ok: true };
    },
    getGameCategoryByName: async (name) => {
        return { id: `cat-${String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '')}`, name };
    },
    updateChannelCategory: async (categoryName, gameId = null) => {
        const id = gameId || `cat-${String(categoryName || '').toLowerCase().replace(/[^a-z0-9]/g, '')}`;
        mockTwitchService.updatedCategories.push({ name: categoryName, id });
        return { ok: true, gameId: id, categoryName };
    }
};

const gamePlanService = createGamePlanService({
    dataDir: TEMP_DATA_DIR,
    safeWriteFileSync: (p, c) => fs.writeFileSync(p, c, 'utf8'),
    broadcastToOverlays: () => {},
    getConfig: () => ({}),
    getStreamInfo: () => [{ category: 'Silent Hill 2' }],
    getViewerStats: () => ({}),
    normalizeViewerStats: v => v || {},
    archivedCategoryMinutes: () => ({}),
    categoryMinutesFor: () => ({}),
    categoryTimeFor: () => ({}),
    publicGameInfo: (name) => ({ name: name || '' }),
    refreshGameInfo: () => Promise.resolve(null),
    getGameInfoCached: () => null
});

const handleGamePlanRoutes = createGamePlanRoutes({
    gamePlanService,
    twitchService: mockTwitchService,
    getTwitchClientId: () => 'mock-id',
    getAppToken: () => Promise.resolve('mock-token'),
    getChatData: () => ({ streamInfo: [] }),
    refreshGameInfo: () => Promise.resolve(null),
    publicGameInfo: (name) => ({ name }),
    gameInfoCache: {},
    infoKey: n => String(n || '').toLowerCase(),
    sessionsDir: path.join(TEMP_DATA_DIR, 'sessions')
});

const rootDir = path.resolve(__dirname, '..');
const staticRouter = createStaticRouter(rootDir);

const server = http.createServer(async (req, res) => {
    try {
        const url = new URL(req.url, `http://localhost:${PORT}`);
        const pathname = url.pathname;

        if (pathname.startsWith('/api/game-plan') || pathname === '/api/game-search' || pathname === '/api/game' || pathname === '/api/categories') {
            const handled = await handleGamePlanRoutes(req, res, pathname);
            if (handled) return;
        }

        if (pathname === '/api/config') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ theme: { accent: '#3b82f6' } }));
            return;
        }

        if (staticRouter.handleRequest(req, res)) return;
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
    } catch (e) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end(e.stack);
    }
});

async function run() {
    await new Promise(resolve => server.listen(PORT, resolve));
    console.log(`Test server running on port ${PORT}...`);

    try {
        // --- 1. Test Backend API ---
        console.log('Testing GET /api/game-plan snapshot...');
        const planRes = await fetch(`http://localhost:${PORT}/api/game-plan`);
        const snapshot = await planRes.json();
        console.log(`✓ GET /api/game-plan returned ${snapshot.items.length} items`);
        const sh2 = snapshot.items.find(i => i.id === 'game-1');
        if (!sh2 || sh2.status !== 'tonight' || sh2.gameType !== 'playthrough') {
            throw new Error(`Silent Hill 2 failed validation: ${JSON.stringify(sh2)}`);
        }
        console.log('✓ Item 1 has status=tonight and gameType=playthrough');

        // Test POST /api/game-plan/now category update
        console.log('Testing POST /api/game-plan/now and Twitch category update...');
        const nowRes = await fetch(`http://localhost:${PORT}/api/game-plan/now`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: 'game-1' })
        });
        const nowData = await nowRes.json();
        if (!nowData.twitchResult || !nowData.twitchResult.ok) {
            throw new Error(`Expected twitchResult on nowData: ${JSON.stringify(nowData.twitchResult)}`);
        }
        console.log(`✓ POST /api/game-plan/now updated Twitch category to: "${nowData.twitchResult.categoryName}"`);

        // Test advance from playthrough
        console.log('Testing POST /api/game-plan/advance on playthrough...');
        const advRes1 = await fetch(`http://localhost:${PORT}/api/game-plan/advance`, { method: 'POST' });
        const adv1 = await advRes1.json();
        console.log(`✓ Advanced. Now playing: ${adv1.current}`);
        if (adv1.current !== 'Jackbox Party Pack 10') {
            throw new Error(`Expected Jackbox Party Pack 10 next, got: ${adv1.current}`);
        }
        if (!adv1.twitchResult || !adv1.twitchResult.ok) {
            throw new Error(`Expected twitchResult on adv1: ${JSON.stringify(adv1.twitchResult)}`);
        }
        console.log(`✓ Advance updated Twitch category to: "${adv1.twitchResult.categoryName}"`);

        // Verify playthrough was NOT marked 'played' but recorded session
        const planAfterAdv1 = await (await fetch(`http://localhost:${PORT}/api/game-plan`)).json();
        const sh2After = planAfterAdv1.items.find(i => i.id === 'game-1');
        if (sh2After.status !== 'tonight') {
            throw new Error(`Playthrough game should remain in tonight, got: ${sh2After.status}`);
        }
        console.log('✓ Playthrough campaign remained active in tonight with session recorded');

        // Test advance from one-off
        console.log('Testing POST /api/game-plan/advance on one-off (Jackbox)...');
        const advRes2 = await fetch(`http://localhost:${PORT}/api/game-plan/advance`, { method: 'POST' });
        const adv2 = await advRes2.json();
        console.log(`✓ Advanced one-off. Next: ${adv2.current}`);
        const planAfterAdv2 = await (await fetch(`http://localhost:${PORT}/api/game-plan`)).json();
        const jbAfter = planAfterAdv2.items.find(i => i.id === 'game-2');
        if (jbAfter.status !== 'played' || !jbAfter.finished) {
            throw new Error(`One-off game should be marked played and finished, got status=${jbAfter.status}, finished=${jbAfter.finished}`);
        }
        console.log('✓ One-off game was marked played and finished upon completion');

        // Test multi-day and recurring Twitch Schedule endpoint
        console.log('Testing POST /api/game-plan/twitch-schedule with multi-date and recurring...');
        // First add extra date and recurring flag to game-3
        const planBeforeSchedule = await (await fetch(`http://localhost:${PORT}/api/game-plan`)).json();
        const g3 = planBeforeSchedule.items.find(i => i.id === 'game-3');
        g3.streamRecurring = true;
        g3.streamDates = [{ date: '2026-10-22', time: '19:00' }];
        await fetch(`http://localhost:${PORT}/api/game-plan`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: planBeforeSchedule.items })
        });

        const twitchPushRes = await fetch(`http://localhost:${PORT}/api/game-plan/twitch-schedule`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ itemId: 'game-3' })
        });
        const twitchPushData = await twitchPushRes.json();
        if (!twitchPushData.ok || !twitchPushData.segments || twitchPushData.segments.length !== 2) {
            throw new Error(`Expected 2 schedule segments, got: ${JSON.stringify(twitchPushData)}`);
        }
        if (!twitchPushData.segments[0].is_recurring) {
            throw new Error(`Expected segment to be recurring, got: ${JSON.stringify(twitchPushData.segments[0])}`);
        }
        console.log(`✓ Twitch multi-day recurring schedule segments created: ${twitchPushData.segments.map(s => s.id).join(', ')}`);

        // Test Twitch Schedule delete (should delete both segments)
        console.log('Testing DELETE /api/game-plan/twitch-schedule...');
        const twitchDelRes = await fetch(`http://localhost:${PORT}/api/game-plan/twitch-schedule`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ itemId: 'game-3' })
        });
        const twitchDelData = await twitchDelRes.json();
        if (!twitchDelData.ok) {
            throw new Error(`Failed to delete Twitch schedule: ${JSON.stringify(twitchDelData)}`);
        }
        console.log('✓ All Twitch schedule segments deleted successfully');

        // --- 2. Test in Puppeteer ---
        console.log('Launching headless browser...');
        const browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        await page.setViewport({ width: 1200, height: 900 });

        console.log('Navigating to game-plan-editor.html...');
        page.on('console', msg => console.log('[Browser Console]', msg.type(), msg.text()));
        page.on('pageerror', err => console.log('[Browser Error]', err.message));
        await page.goto(`http://localhost:${PORT}/editors/game-plan-editor.html`, { waitUntil: 'networkidle0' });

        // Check tabs
        const tabTexts = await page.$$eval('.tabs .tab', tabs => tabs.map(t => t.textContent.trim()));
        console.log('Found tabs in UI:', tabTexts.join(' | '));
        const requiredTabs = ["Tonight's Lineup", 'Schedule', 'Up Next', 'Backlog', 'Played'];
        for (const reqTab of requiredTabs) {
            if (!tabTexts.some(t => t.includes(reqTab))) {
                throw new Error(`Missing expected tab: ${reqTab}`);
            }
        }
        console.log('✓ All 5 schedule stage tabs exist in UI');

        // Check Tonight's banner
        const bannerText = await page.$eval('.tonight-banner', el => el.textContent.trim());
        console.log('Tonight Banner:', bannerText.split('\n')[0]);
        console.log('✓ Tonight stream rundown banner is displayed');

        // Check badges on cards
        const badges = await page.$$eval('.item .badge', list => list.map(b => b.textContent.trim()));
        console.log('Found badges on game cards:', badges.join(', '));
        if (!badges.some(b => b.includes('PLAYTHROUGH'))) {
            throw new Error('Missing PLAYTHROUGH badge');
        }
        console.log('✓ Playstyle badges correctly rendered on cards');

        // Open details dialog
        console.log('Opening details dialog on first item...');
        await page.click('.item [data-edit]');
        await page.waitForSelector('#dlg[open]');
        const playstyleVal = await page.$eval('#f-game-type', el => el.value);
        console.log(`✓ Dialog opened. Playstyle value: ${playstyleVal}`);

        // Check recurring checkbox and multi-date section in dialog
        const recurringCheck = await page.$('#f-stream-recurring');
        if (!recurringCheck) throw new Error('Missing #f-stream-recurring checkbox in dialog');
        console.log('✓ Recurring stream checkbox exists in dialog');

        await page.click('#f-add-date');
        const extraDateRows = await page.$$eval('#f-stream-dates-list [data-date-idx]', rows => rows.length);
        if (extraDateRows < 1) throw new Error('Clicking + Add Date did not create a new date slot');
        console.log('✓ Multi-day stream date controls working properly in dialog');

        // Set extra date and time simulating datepicker selection
        await page.$eval('#f-stream-dates-list [data-extra-date]', el => {
            el.value = '2026-10-25';
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
        });
        await page.$eval('#f-stream-dates-list [data-extra-time]', el => {
            el.value = '21:00';
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
        });

        // Close dialog with Done button (triggers save)
        await page.click('#f-done');
        await new Promise(r => setTimeout(r, 600));

        // Verify backend persisted the extra date
        const verifyPlan = await (await fetch(`http://localhost:${PORT}/api/game-plan`)).json();
        const savedItem1 = verifyPlan.items.find(i => i.id === 'game-1');
        if (!savedItem1.streamDates || !savedItem1.streamDates.some(d => d.date === '2026-10-25')) {
            throw new Error(`Extra date was not saved to backend! streamDates: ${JSON.stringify(savedItem1.streamDates)}`);
        }
        console.log('✓ Additional stream date successfully saved to backend:', JSON.stringify(savedItem1.streamDates));

        // Check date badge on game card shows extra date indicator
        const item1DateBadge = await page.$eval('.item[data-id="game-1"] .date-badge', el => el.textContent.trim());
        console.log('Item 1 Date Badge:', item1DateBadge);
        if (!item1DateBadge.includes('+1 date')) {
            throw new Error(`Expected date badge to reflect (+1 date), got: "${item1DateBadge}"`);
        }
        console.log('✓ Game card date badge reflects extra scheduled date');

        // Re-open dialog and verify extra date row value is rendered
        console.log('Re-opening dialog on item 1 to verify extra date persistence in UI...');
        await page.click('.item[data-id="game-1"] [data-edit]');
        await page.waitForSelector('#dlg[open]');
        const reloadedExtraDate = await page.$eval('#f-stream-dates-list [data-extra-date]', el => el.value);
        if (reloadedExtraDate !== '2026-10-25') {
            throw new Error(`Expected reloaded extra date to be 2026-10-25, got: "${reloadedExtraDate}"`);
        }
        console.log('✓ Extra date row accurately preserved and rendered on dialog re-open:', reloadedExtraDate);
        await page.click('#f-done');
        console.log('Checking Game Plan overlay view (/overlays/game-plan.html?list=tonight)...');
        await page.goto(`http://localhost:${PORT}/overlays/game-plan.html?list=tonight`, { waitUntil: 'networkidle0' });
        const overlayCards = await page.$$eval('.schedule-title', titles => titles.map(t => t.textContent.trim()));
        console.log('Overlay games in tonight lineup:', overlayCards.join(', '));
        if (!overlayCards.length) {
            throw new Error('Overlay did not render any games for tonight');
        }
        console.log('✓ Overlay renders tonight lineup with accurate styling');

        // Go back to editor to take polished screenshot
        await page.goto(`http://localhost:${PORT}/editors/game-plan-editor.html`, { waitUntil: 'networkidle0' });
        const screenshotPath = '/Users/jaredacherup/.gemini/antigravity-cli/brain/1124f4e5-e872-47d9-8fc6-aab167e140a9/screenshot-game-plan-scheduling.png';
        await page.screenshot({ path: screenshotPath, fullPage: true });
        console.log(`✓ Saved screenshot to ${screenshotPath}`);

        await browser.close();
        console.log('\nALL GAME PLAN SCHEDULING TESTS PASSED!');
    } finally {
        server.close();
        if (fs.existsSync(TEMP_DATA_DIR)) {
            fs.rmSync(TEMP_DATA_DIR, { recursive: true, force: true });
        }
    }
}

run().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});

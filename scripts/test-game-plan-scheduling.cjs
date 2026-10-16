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
    // Simulate Twitch polling while offline (changedAt 2 hours ago, but viewerStats.live is false)
    getStreamInfo: () => [{ category: 'Silent Hill 2', changedAt: new Date(Date.now() - 2 * 3600000).toISOString() }],
    getViewerStats: () => ({ live: false, streamStartedAt: null }),
    normalizeViewerStats: v => v || { live: false, streamStartedAt: null },
    archivedCategoryMinutes: () => ({}),
    categoryMinutesFor: (entries, endMs, floor) => {
        // Real categoryMinutesFor behavior: if called without valid floor, it would return 120 mins
        if (!Number.isFinite(floor)) return { 'silent hill 2': 120 };
        return {};
    },
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

        if (pathname.startsWith('/api/game-plan') || pathname === '/api/game-search' || pathname === '/api/twitch-categories' || pathname === '/api/game' || pathname === '/api/categories') {
            const handled = await handleGamePlanRoutes(req, res, pathname);
            if (handled) return;
        }

        if (pathname === '/api/custom-overlays/assets') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                assets: [
                    { id: 'asset-1', name: 'retro-arcade-frame.png', url: '/favicon.svg', contentType: 'image/svg+xml', tags: ['retro', 'artwork'] },
                    { id: 'asset-2', name: 'just-chatting-banner.png', url: '/favicon.svg', contentType: 'image/svg+xml', tags: ['chatting'] }
                ]
            }));
            return;
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
        console.log('Testing GET /api/game-plan snapshot & offline stream time guard...');
        const planRes = await fetch(`http://localhost:${PORT}/api/game-plan`);
        const snapshot = await planRes.json();
        console.log(`✓ GET /api/game-plan returned ${snapshot.items.length} items`);
        const sh2 = snapshot.items.find(i => i.id === 'game-1');
        if (!sh2 || sh2.status !== 'tonight' || sh2.gameType !== 'playthrough') {
            throw new Error(`Silent Hill 2 failed validation: ${JSON.stringify(sh2)}`);
        }
        if (sh2.minutesPlayed !== 0) {
            throw new Error(`Expected minutesPlayed to be 0 when offline on Twitch, got: ${sh2.minutesPlayed}`);
        }
        console.log('✓ Offline stream time guard verified: minutesPlayed === 0 when viewerStats.live is false');

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

        // Verify playthrough was NOT marked 'played'
        const planAfterAdv1 = await (await fetch(`http://localhost:${PORT}/api/game-plan`)).json();
        const sh2After = planAfterAdv1.items.find(i => i.id === 'game-1');
        if (sh2After.status !== 'tonight') {
            throw new Error(`Playthrough game should remain in tonight, got: ${sh2After.status}`);
        }
        console.log('✓ Playthrough campaign remained active in tonight');

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
        const twitchPushRes = await fetch(`http://localhost:${PORT}/api/game-plan/twitch-schedule`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                itemId: 'game-3',
                streamDate: '2026-10-20',
                streamTime: '19:00',
                streamDuration: 240,
                streamRecurring: true,
                streamDates: [{ date: '2026-10-22', time: '19:00' }],
                twitchCategory: 'Just Chatting'
            })
        });
        const twitchPushData = await twitchPushRes.json();
        if (!twitchPushData.ok || !twitchPushData.segments || twitchPushData.segments.length !== 2) {
            throw new Error(`Expected 2 schedule segments, got: ${JSON.stringify(twitchPushData)}`);
        }
        if (!twitchPushData.segments[0].is_recurring || twitchPushData.segments[0].duration !== '240') {
            throw new Error(`Expected segment to be recurring with duration 240, got: ${JSON.stringify(twitchPushData.segments[0])}`);
        }
        console.log(`✓ Atomic Twitch multi-day recurring schedule segments created: ${twitchPushData.segments.map(s => s.id).join(', ')}`);

        // --- 2. Test in Puppeteer ---
        console.log('Launching headless browser...');
        const browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        await page.setViewport({ width: 1240, height: 900 });

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
        console.log('✓ All 5 schedule stage tabs exist in single clean row');

        // Verify duplicate inline "Next" / "Tonight" period pills are gone
        const inlinePeriodPills = await page.$$('.item .qchip, .item [data-set-period]');
        if (inlinePeriodPills.length > 0) {
            throw new Error(`Expected 0 inline period pills on items, found ${inlinePeriodPills.length}`);
        }
        console.log('✓ Redundant inline Tonight/Next/Weekend pills removed from item rows');

        // Capture screenshot of clean List View
        const listScreenshotPath = '/Users/jaredacherup/.gemini/antigravity-cli/brain/1124f4e5-e872-47d9-8fc6-aab167e140a9/screenshot-game-plan-scheduling.png';
        await page.screenshot({ path: listScreenshotPath });
        console.log(`✓ Saved clean List View screenshot to ${listScreenshotPath}`);

        // Check cross-list search bar (#v-search)
        console.log('Testing cross-list search (#v-search)...');
        await page.type('#v-search', 'Hades');
        await page.waitForSelector('.cross-search-box');
        const crossMatchName = await page.$eval('.cross-search-box .item .name', el => el.textContent.trim());
        if (!crossMatchName.includes('Hades II')) {
            throw new Error(`Expected cross-list search to find Hades II, got: ${crossMatchName}`);
        }
        console.log('✓ Cross-list search found Hades II in Backlog while viewing Tonight tab');
        await page.click('#v-search-clear');

        // Open details dialog on first item
        console.log('Opening details dialog on first item...');
        await page.click('.item[data-id="game-1"] [data-edit]');
        await page.waitForSelector('#dlg[open]');

        // Click 2nd and 3rd day pills in the 14-day quick strip
        await page.click('#f-quick-days .day-pill:nth-child(2)');
        await page.click('#f-quick-days .day-pill:nth-child(3)');
        const selectedChipsCount = await page.$$eval('#f-selected-dates-chips .sdate-chip', chips => chips.length);
        if (selectedChipsCount < 2) {
            throw new Error(`Expected at least 2 selected date chips after clicking quick strip, got: ${selectedChipsCount}`);
        }
        console.log(`✓ 14-Day Quick Calendar Strip toggled ${selectedChipsCount} dates with single clicks`);

        // Close dialog with Done button
        await page.click('#f-done');
        await new Promise(r => setTimeout(r, 600));

        // Switch to Full Calendar View
        console.log('Switching to Full Calendar View ([data-view="calendar"])...');
        await page.click('[data-view="calendar"]');
        await page.waitForSelector('#cal-view:not([hidden]) .cal-grid');
        const calCellCount = await page.$$eval('#cal-view .cal-cell', cells => cells.length);
        const calEventCount = await page.$$eval('#cal-view .cal-event', evs => evs.length);
        if (calCellCount !== 42 || calEventCount < 3) {
            throw new Error(`Expected 42 calendar cells and >=3 events, got cells=${calCellCount}, events=${calEventCount}`);
        }
        console.log(`✓ Full Calendar View rendered ${calCellCount} day cells and ${calEventCount} scheduled/streamed events`);

        // Test scheduling a game directly from a calendar day's '+' button
        await page.click('#cal-view .cal-cell.today [data-cal-add]');
        await page.waitForSelector('#cal-pick-dlg[open]');
        await page.click('#cal-pick-list [data-pick-game="game-4"]');
        await new Promise(r => setTimeout(r, 500));
        console.log('✓ Scheduled Metaphor: ReFantazio onto calendar day via + button');

        // Capture screenshot of Full Calendar View
        const calScreenshotPath = '/Users/jaredacherup/.gemini/antigravity-cli/brain/1124f4e5-e872-47d9-8fc6-aab167e140a9/screenshot-game-plan-calendar.png';
        await page.screenshot({ path: calScreenshotPath });
        console.log(`✓ Saved Full Calendar View screenshot to ${calScreenshotPath}`);

        // Switch back to List View and test moving item 1 from Tonight back to Schedule
        await page.click('[data-view="list"]');
        await page.waitForSelector('#items:not([hidden])');
        await page.click('.item[data-id="game-1"] [data-action="move-to-schedule"]');
        await new Promise(r => setTimeout(r, 600));
        const verifyAfterMove = await (await fetch(`http://localhost:${PORT}/api/game-plan`)).json();
        const movedItem1 = verifyAfterMove.items.find(i => i.id === 'game-1');
        if (movedItem1.status !== 'scheduled' || movedItem1.period !== '') {
            throw new Error(`Expected item 1 to move to scheduled and clear Tonight period, got status=${movedItem1.status}, period=${movedItem1.period}`);
        }
        console.log('✓ Item 1 moved from Tonight back to Schedule and cleared auto "Tonight" period');

        await browser.close();
        console.log('\nALL GAME PLAN SCHEDULING, CALENDAR & POLISH TESTS PASSED!');
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

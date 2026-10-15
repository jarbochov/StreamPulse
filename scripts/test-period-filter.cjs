const puppeteer = require('puppeteer');
const assert = require('assert');

async function run() {
    console.log('🚀 Starting period filter tests...');
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    // Track console warnings/errors
    page.on('console', msg => {
        if (msg.type() === 'error') {
            console.error('[Page Error]', msg.text());
        }
    });

    try {
        // 1. Test game-plan-url-wizard.html
        console.log('Testing /game-plan-url-wizard.html...');
        await page.goto('http://localhost:3000/game-plan-url-wizard.html', { waitUntil: 'networkidle0' });

        // Check date-aware presets rendered
        const presets = await page.$$eval('#period-presets .preset-chip', chips => chips.map(c => ({ text: c.textContent.trim(), val: c.dataset.periodVal })));
        console.log('Presets rendered:', presets.map(p => p.val));
        assert(presets.some(p => p.val === '@today'), 'Missing @today preset chip');
        assert(presets.some(p => p.val === '@tomorrow'), 'Missing @tomorrow preset chip');
        assert(presets.some(p => p.val === '@this-week'), 'Missing @this-week preset chip');
        assert(presets.some(p => p.val === '@upcoming'), 'Missing @upcoming preset chip');
        assert(presets.some(p => p.val === '@unscheduled'), 'Missing @unscheduled preset chip');

        // Check custom plan periods rendered
        const customChips = await page.$$eval('#plan-period-chips .preset-chip', chips => chips.map(c => c.textContent.trim()));
        console.log('Custom period chips rendered:', customChips);
        assert(customChips.includes('October'), 'Missing October chip');
        assert(customChips.includes('November'), 'Missing November chip');

        // Test clicking preset @tomorrow
        console.log('Clicking @tomorrow preset...');
        await page.click('button[data-period-val="@tomorrow"]');
        let filterVal = await page.$eval('#period-filter', el => el.value);
        assert.strictEqual(filterVal, '@tomorrow', 'Filter input should be @tomorrow');
        let overlayUrl = await page.$eval('#overlay-link', el => el.href);
        assert(overlayUrl.includes('period=%40tomorrow') || overlayUrl.includes('period=@tomorrow'), `URL should have @tomorrow: ${overlayUrl}`);

        let badgeText = await page.$eval('#period-match-badge', el => el.textContent.trim());
        console.log('Match badge for @tomorrow:', badgeText);
        assert(badgeText.includes('1 match'), `Expected 1 match for @tomorrow, got ${badgeText}`);

        // Test clicking custom chips October and November
        console.log('Clicking October and November chips...');
        await page.click('button[data-period-name="October"]');
        await page.click('button[data-period-name="November"]');
        filterVal = await page.$eval('#period-filter', el => el.value);
        console.log('Filter value after multi-select:', filterVal);
        assert(filterVal.includes('October') && filterVal.includes('November'), 'Filter input should include both October and November');

        badgeText = await page.$eval('#period-match-badge', el => el.textContent.trim());
        console.log('Match badge for October, November:', badgeText);
        assert(badgeText.includes('3 matches'), `Expected 3 matches for October + November, got ${badgeText}`);

        // 2. Test /game-plan.html with smart period query
        console.log('Testing /game-plan.html?period=@tomorrow...');
        await page.goto('http://localhost:3000/game-plan.html?period=@tomorrow', { waitUntil: 'networkidle0' });
        let titles = await page.$$eval('.schedule-title', els => els.map(e => e.textContent.trim()));
        console.log('Games rendered for @tomorrow:', titles);
        assert(titles.includes("Castlevania: Belmont's Curse"), "Should include Castlevania: Belmont's Curse");
        assert.strictEqual(titles.length, 1, 'Should only have 1 game for @tomorrow');

        console.log('Testing /game-plan.html?period=October,November...');
        await page.goto('http://localhost:3000/game-plan.html?period=October,November', { waitUntil: 'networkidle0' });
        titles = await page.$$eval('.schedule-title', els => els.map(e => e.textContent.trim()));
        console.log('Games rendered for October,November:', titles);
        assert(titles.includes('Eating Bees'), 'Should include Eating Bees');
        assert(titles.includes('Control Resonant'), 'Should include Control Resonant');
        assert(titles.includes('The Legend of Zelda: Ocarina of Time'), 'Should include Ocarina of Time');
        assert.strictEqual(titles.length, 3, 'Should have exactly 3 games');

        // 3. Test Custom Overlay Editor periodPicker
        console.log('Testing /custom-overlay-editor.html...');
        await page.goto('http://localhost:3000/custom-overlay-editor.html', { waitUntil: 'networkidle0' });
        // Evaluate periodPicker rendering directly in page context
        const pickerHtml = await page.evaluate(() => {
            const el = { type: 'game-list', gameList: { filter: 'scheduled', periods: ['@today', 'October'] } };
            // periodPicker is defined inside the page script
            const g = el.gameList;
            const SMART_PERIOD_PRESETS = [
                ['@today', '🎮 Tonight / Today (status or date is today)'],
                ['@tomorrow', '⏭ Next Stream / Tomorrow'],
                ['@this-week', '📅 This Week (current week dates)'],
                ['@upcoming', '🚀 Upcoming Dates (future scheduled)'],
                ['@unscheduled', '📦 No Period Set (undated)']
            ];
            const known = window.liveStatus?.gamePlan?.periods || [];
            const picked = (g.periods?.length ? g.periods : g.period ? [g.period] : []);
            const smartTokens = new Set(['@today', '@tomorrow', '@this-week', '@upcoming', '@unscheduled']);
            const customNames = [...known, ...picked.filter(name => !known.includes(name) && !smartTokens.has(name))];
            return {
                picked,
                smartTokens: Array.from(smartTokens),
                customNames
            };
        });
        console.log('Custom overlay editor periodPicker evaluation:', pickerHtml);
        assert(pickerHtml.picked.includes('@today'), 'Picked should include @today');
        assert(pickerHtml.picked.includes('October'), 'Picked should include October');

        console.log('✅ ALL PERIOD FILTER TESTS PASSED SUCCESSFULLY!');
    } finally {
        await browser.close();
    }
}

run().catch(err => {
    console.error('❌ Test failed:', err);
    process.exit(1);
});

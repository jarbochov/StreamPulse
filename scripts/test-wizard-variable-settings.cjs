const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createServer } = require('node:http');

const createVariablesStore = require('../server/services/variables');
const { createTierListService } = require('../server/services/tier-list');
const { createSubathonService } = require('../server/services/subathon');
const { createTriviaService } = require('../server/services/trivia');

function makeTmpDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'sp-wiz-var-settings-'));
}

async function callVarsApi(store, method, url, body) {
    const pathname = new URL(url, 'http://fixture').pathname;
    let status = 200;
    let headers = {};
    let payload = '';
    const req = {
        method,
        url,
        headers: body !== undefined ? { 'content-type': 'application/json' } : {}
    };
    const res = {
        writeHead(code, h = {}) {
            status = code;
            headers = h;
        },
        end(chunk = '') {
            payload = String(chunk);
        }
    };
    await store.handleApi(req, res, pathname, async () => (body !== undefined ? JSON.stringify(body) : ''));
    return {
        status,
        headers,
        text: payload,
        json: headers['Content-Type']?.includes('json') && payload ? JSON.parse(payload) : null
    };
}

test('Variables API: /api/variables and /api/variables/values return pre-resolved values map and variableSettingsEnabled flag', async () => {
    const dir = makeTmpDir();
    const store = createVariablesStore({ dataDir: dir });
    try {
        store.set('brand_color', { type: 'color', value: '#ff3366' });
        store.set('heading_font', { type: 'font', value: 'Oswald' });
        store.set('ui_scale', { type: 'number', value: 1.35, group: 'Layout' });
        store.set('banner_title', { type: 'template', value: 'Theme: {{var.heading_font}} ({{var.layout.ui_scale}}x)' });

        const listRes = await callVarsApi(store, 'GET', '/api/variables');
        assert.equal(listRes.status, 200);
        assert.equal(listRes.json.variableSettingsEnabled, true);
        assert.equal(listRes.json.values.brand_color, '#ff3366');
        assert.equal(listRes.json.values.heading_font, 'Oswald');
        assert.equal(listRes.json.values['layout.ui_scale'], 1.35);
        assert.equal(listRes.json.values.ui_scale, 1.35, 'Ungrouped alias resolves when non-colliding');
        assert.equal(listRes.json.values.banner_title, 'Theme: Oswald (1.35x)');

        const valRes = await callVarsApi(store, 'GET', '/api/variables/values');
        assert.equal(valRes.status, 200);
        assert.equal(valRes.json.brand_color, '#ff3366');
        assert.equal(valRes.json.banner_title, 'Theme: Oswald (1.35x)');

        store.setVariableSettingsEnabled(false);
        const disabledRes = await callVarsApi(store, 'GET', '/api/variables');
        assert.equal(disabledRes.json.variableSettingsEnabled, false);
    } finally {
        store.dispose();
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('OverlayVariableSettings: parses var:<key>, var:<key>|<fallback>, and {{var.<key>}} tokens with zero fetch when no tokens are used', () => {
    const urlParamsCode = fs.readFileSync(path.join(__dirname, '../public/js/url-params.js'), 'utf8');
    let xhrCalls = 0;

    function FakeXHR() {}
    FakeXHR.prototype.open = function () { xhrCalls++; };
    FakeXHR.prototype.send = function () {
        this.status = 200;
        this.responseText = JSON.stringify({
            values: {
                brand_color: '#10b981',
                'theme.heading_font': 'Bebas Neue',
                heading_font: 'Bebas Neue',
                ui_scale: '1.4',
                empty_var: ''
            }
        });
    };

    const fakeWin = {
        location: { search: '?mode=card&accent=%233b82f6' },
        URLSearchParams,
        XMLHttpRequest: FakeXHR
    };

    // Use a scoped URLSearchParams subclass so we don't mutate Node's global URLSearchParams prototype
    class ScopedSearchParams extends URLSearchParams {}
    fakeWin.URLSearchParams = ScopedSearchParams;

    new Function('window', 'URLSearchParams', 'XMLHttpRequest', urlParamsCode)(
        fakeWin,
        ScopedSearchParams,
        FakeXHR
    );

    const ovs = fakeWin.OverlayVariableSettings;
    assert.ok(ovs, 'OverlayVariableSettings is attached to window');

    // 1. Plain parameters never trigger an XHR call
    const plainParams = new ScopedSearchParams('?mode=card&accent=%233b82f6&scale=1.2');
    assert.equal(plainParams.get('mode'), 'card');
    assert.equal(plainParams.get('accent'), '#3b82f6');
    assert.equal(plainParams.get('scale'), '1.2');
    assert.equal(xhrCalls, 0, 'Zero network requests when no variable tokens are present');

    // 2. Variable tokens resolve lazily on first read
    const varParams = new ScopedSearchParams('?accent=var:brand_color&font=var:theme.heading_font|Inter&scale=var:ui_scale|1.0&missing=var:unknown_key|FallbackTitle&empty=var:empty_var|DefaultVal&brace={{var.brand_color|#000000}}');
    assert.equal(varParams.get('accent'), '#10b981');
    assert.equal(xhrCalls, 1, 'Fetches /api/variables once on first variable token');
    assert.equal(varParams.get('font'), 'Bebas Neue');
    assert.equal(varParams.get('scale'), '1.4');
    assert.equal(varParams.get('missing'), 'FallbackTitle');
    assert.equal(varParams.get('empty'), 'DefaultVal');
    assert.equal(varParams.get('brace'), '#10b981');
    assert.equal(xhrCalls, 1, 'Subsequent token reads use cached values without additional XHR requests');

    // 3. Raw token remains intact for URL serialization
    assert.equal(ovs.getRawParam(varParams, 'accent'), 'var:brand_color');
    assert.ok(varParams.toString().includes('accent=var%3Abrand_color'));
});

test('Backend services (Tier List, Subathon, Trivia): preserve var:<key> tokens in saved theme configurations', () => {
    const dir = makeTmpDir();
    try {
        const tierList = createTierListService({
            dataDir: dir,
            tierListPath: path.join(dir, 'tier-list.json')
        });
        tierList.updateConfig({
            theme: {
                headingFont: 'var:heading_font|Oswald',
                fontFamily: 'var:body_font',
                fontWeight: 'var:font_weight|700',
                fontScale: 'var:ui_scale|1.25',
                borderRadius: 'var:card_radius|12px',
                backdropBlur: 'var:card_blur|8px',
                backgroundColor: 'var:bg_color|#0d1117',
                accentColor: 'var:brand_color|#3b82f6',
                hintScale: 'var:hint_scale|1.1'
            }
        });
        const tlTheme = tierList.getState().theme;
        assert.equal(tlTheme.headingFont, 'var:heading_font|Oswald');
        assert.equal(tlTheme.fontFamily, 'var:body_font');
        assert.equal(tlTheme.fontWeight, 'var:font_weight|700');
        assert.equal(tlTheme.fontScale, 'var:ui_scale|1.25');
        assert.equal(tlTheme.borderRadius, 'var:card_radius|12px');
        assert.equal(tlTheme.backdropBlur, 'var:card_blur|8px');
        assert.equal(tlTheme.backgroundColor, 'var:bg_color|#0d1117');
        assert.equal(tlTheme.accentColor, 'var:brand_color|#3b82f6');
        assert.equal(tlTheme.hintScale, 'var:hint_scale|1.1');

        const subathon = createSubathonService({
            dataDir: dir,
            subathonPath: path.join(dir, 'subathon.json')
        });
        subathon.updateConfig({
            theme: {
                scale: 'var:sb_scale|1.2',
                cardRadius: 'var:sb_radius|14',
                accentColor: 'var:brand_color|#3b82f6',
                fontFamily: 'var:body_font',
                headerFontFamily: 'var:heading_font',
                headerSize: 'var:header_size|1.4rem',
                valueSize: 'var:value_size|1.5rem',
                valueWeight: 'var:value_weight|800'
            }
        });
        const sbTheme = subathon.getConfigSnapshot().theme;
        assert.equal(sbTheme.scale, 'var:sb_scale|1.2');
        assert.equal(sbTheme.cardRadius, 'var:sb_radius|14');
        assert.equal(sbTheme.accentColor, 'var:brand_color|#3b82f6');
        assert.equal(sbTheme.fontFamily, 'var:body_font');
        assert.equal(sbTheme.headerSize, 'var:header_size|1.4rem');

        const trivia = createTriviaService({
            dataDir: dir,
            triviaPath: path.join(dir, 'trivia.json'),
            leaderboardPath: path.join(dir, 'trivia-leaderboard.json')
        });
        trivia.updateTheme({
            questionFont: 'var:q_font',
            accentColor: 'var:brand_color|#38bdf8',
            fontScale: 'var:trivia_scale|1.15',
            cardBlur: 'var:trivia_blur|16'
        });
        const trTheme = trivia.getState().theme;
        assert.equal(trTheme.questionFont, 'var:q_font');
        assert.equal(trTheme.accentColor, 'var:brand_color|#38bdf8');
        assert.equal(trTheme.fontScale, 'var:trivia_scale|1.15');
        assert.equal(trTheme.cardBlur, 'var:trivia_blur|16');
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('E2E Browser: WizardVariableBinder binds font/color/number variables in URL Wizard, hides {} buttons when Variable Settings is disabled in Config Editor, and resolves updated values on overlay refresh', async () => {
    const puppeteer = (await import('puppeteer')).default;
    const dir = makeTmpDir();
    const store = createVariablesStore({ dataDir: dir });

    store.set('brand_color', { type: 'color', value: '#ff2277' });
    store.set('stream_font', { type: 'font', value: 'Oswald' });
    store.set('stream_scale', { type: 'number', value: 1.35 });
    store.set('card_title', { type: 'text', value: 'Season Finale Milestones' });

    const publicDir = path.join(__dirname, '../public');
    const server = createServer(async (req, res) => {
        const u = new URL(req.url, 'http://localhost');
        const pathname = u.pathname;

        if (pathname.startsWith('/api/variables')) {
            await store.handleApi(req, res, pathname, async request => {
                const chunks = [];
                for await (const chunk of request) chunks.push(chunk);
                return Buffer.concat(chunks).toString();
            });
            return;
        }
        if (pathname === '/api/config') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                variable_settings_enabled: store.isVariableSettingsEnabled(),
                theme: {}
            }));
            return;
        }
        if (pathname === '/api/milestones' || pathname === '/api/status') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                streak: { current: 5, longest: 12 },
                hours: { total: 120.5, thisMonth: 24.0 },
                stats: { totalStreams: 42, avgViewers: 58 },
                goals: { streams: { current: 42, target: 50 } }
            }));
            return;
        }

        // Static file resolution mirroring static-router
        let filePath = path.join(publicDir, pathname);
        if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
            const fallbacks = [
                path.join(publicDir, 'wizards', pathname),
                path.join(publicDir, 'overlays', pathname),
                path.join(publicDir, 'js', pathname),
                path.join(publicDir, 'css', pathname)
            ];
            filePath = fallbacks.find(p => fs.existsSync(p) && !fs.statSync(p).isDirectory()) || filePath;
        }

        if (fs.existsSync(filePath) && !fs.statSync(filePath).isDirectory()) {
            const ext = path.extname(filePath).toLowerCase();
            const mime = ext === '.html' ? 'text/html'
                : ext === '.js' ? 'text/javascript'
                    : ext === '.css' ? 'text/css'
                        : ext === '.svg' ? 'image/svg+xml'
                            : 'application/octet-stream';
            res.writeHead(200, { 'Content-Type': mime });
            res.end(fs.readFileSync(filePath));
            return;
        }

        res.writeHead(404);
        res.end('Not found');
    });

    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;
    const profileDir = path.join(dir, 'chrome-profile');
    fs.mkdirSync(profileDir, { recursive: true });
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: true,
            userDataDir: profileDir,
            env: { ...process.env, TMPDIR: profileDir },
            args: ['--no-sandbox']
        });
        const page = await browser.newPage();

        // 1. Load Milestone URL Wizard with Variable Settings enabled
        await page.goto(`${baseUrl}/wizards/milestone-url-wizard.html`, { waitUntil: 'networkidle0' });

        // Verify {x} variable bind buttons are visible
        const bindBtnsVisible = await page.$eval('[data-var-bind-for="accent-color"]', el => {
            const style = window.getComputedStyle(el);
            return !el.hidden && style.display !== 'none';
        });
        assert.equal(bindBtnsVisible, true, '{x} Bind Variable button is visible when Variable Settings is enabled');

        // Bind Accent Color, Font, Scale, and Title via WizardVariableBinder
        await page.evaluate(() => {
            window.WizardVariableBinder.bindControl('accent-color', 'var:brand_color|#8b5cf6');
            window.WizardVariableBinder.bindControl('wiz-font', 'var:stream_font|Inter');
            window.WizardVariableBinder.bindControl('scale', 'var:stream_scale|1.0');
            window.WizardVariableBinder.bindControl('custom-title', 'var:card_title');
        });

        const generatedUrl = await page.$eval('#url-output', el => el.textContent);
        assert.ok(generatedUrl.includes('accent=var%3Abrand_color%7C%238b5cf6'), `Generated URL contains accent variable token: ${generatedUrl}`);
        assert.ok(generatedUrl.includes('font=var%3Astream_font%7CInter'), `Generated URL contains font variable token: ${generatedUrl}`);
        assert.ok(generatedUrl.includes('fontScale=var%3Astream_scale%7C1.0'), `Generated URL contains fontScale variable token: ${generatedUrl}`);
        assert.ok(generatedUrl.includes('title=var%3Acard_title'), `Generated URL contains title variable token: ${generatedUrl}`);

        // Verify slider label and native color picker received resolved values without NaN
        const scaleLabel = await page.$eval('#scale-val', el => el.textContent);
        assert.equal(scaleLabel, '1.35x');
        const colorInputVal = await page.$eval('#accent-color', el => el.value.toLowerCase());
        assert.equal(colorInputVal, '#ff2277');

        // 2. Open the generated overlay URL and verify it resolves all variable values on load
        const overlayPage = await browser.newPage();
        await overlayPage.goto(generatedUrl, { waitUntil: 'networkidle0' });

        const resolvedInitial = await overlayPage.evaluate(() => {
            const p = new URLSearchParams(window.location.search);
            return {
                accent: p.get('accent'),
                font: p.get('font'),
                fontScale: p.get('fontScale'),
                title: p.get('title')
            };
        });
        assert.deepEqual(resolvedInitial, {
            accent: '#ff2277',
            font: 'Oswald',
            fontScale: '1.35',
            title: 'Season Finale Milestones'
        });

        // 3. Update variable values on the server and refresh the overlay -> verify new values are fetched on refresh
        store.set('brand_color', { type: 'color', value: '#00e5ff' });
        store.set('stream_font', { type: 'font', value: 'Bebas Neue' });
        store.set('stream_scale', { type: 'number', value: 1.6 });
        store.set('card_title', { type: 'text', value: 'New Season Kickoff' });

        await overlayPage.reload({ waitUntil: 'networkidle0' });
        const resolvedAfterRefresh = await overlayPage.evaluate(() => {
            const p = new URLSearchParams(window.location.search);
            return {
                accent: p.get('accent'),
                font: p.get('font'),
                fontScale: p.get('fontScale'),
                title: p.get('title')
            };
        });
        assert.deepEqual(resolvedAfterRefresh, {
            accent: '#00e5ff',
            font: 'Bebas Neue',
            fontScale: '1.6',
            title: 'New Season Kickoff'
        });

        // 4. Turn OFF Variable Settings in config and reload wizard -> verify {} buttons are hidden
        store.setVariableSettingsEnabled(false);
        await page.reload({ waitUntil: 'networkidle0' });

        const bindBtnsVisibleWhenDisabled = await page.$eval('[data-var-bind-for="accent-color"]', el => {
            const style = window.getComputedStyle(el);
            return !el.hidden && style.display !== 'none';
        });
        assert.equal(bindBtnsVisibleWhenDisabled, false, '{x} Bind Variable buttons are hidden when Variable Settings is disabled in Config Editor');
    } finally {
        await browser?.close();
        await new Promise(resolve => server.close(resolve));
        store.dispose();
        fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
});

test('Credits Overlay: stats-sourced donations display dollar amount ($XX.XX) from d.amounts instead of (×1) count, with graceful fallback when only d.days exists', () => {
    const creditsCode = fs.readFileSync(path.join(__dirname, '../public/js/credits.js'), 'utf8');
    const today = new Date().toISOString().slice(0, 10);

    // Extract mergeStatsDonations and formatDonationCurrency from credits.js
    const fakeDocument = {
        documentElement: { style: { setProperty() {} } },
        createElement() {
            return {
                _t: '',
                set textContent(v) { this._t = String(v ?? ''); },
                get innerHTML() { return this._t; }
            };
        },
        getElementById() { return null; }
    };
    const fakeWindow = {
        location: { protocol: 'http:', host: 'localhost:3000', search: '' },
        addEventListener() {},
        overlayParams: () => new URLSearchParams(),
        applyOverlayTheme() {}
    };

    const fn = new Function(
        'window',
        'document',
        'overlayParams',
        'applyOverlayTheme',
        `${creditsCode}\nreturn { setStats: (s) => { statsData = s; }, mergeStatsDonations, formatDonationCurrency };`
    );
    const harness = fn(fakeWindow, fakeDocument, fakeWindow.overlayParams, fakeWindow.applyOverlayTheme);

    harness.setStats({
        donations: {
            GenerousDonor: {
                days: { [today]: 1 },
                amounts: { [today]: 25.5 }
            },
            MultiDonor: {
                days: { [today]: 2 },
                amounts: { [today]: 40 }
            },
            LegacyCountOnlyDonor: {
                days: { [today]: 3 }
            }
        }
    });

    const list = harness.mergeStatsDonations();
    assert.equal(list.length, 3);
    // Sorted by totalAmount descending, then count descending
    assert.equal(list[0].chatname, 'MultiDonor');
    assert.equal(list[0].amount, '$40.00');
    assert.equal(list[1].chatname, 'GenerousDonor');
    assert.equal(list[1].amount, '$25.50');
    assert.equal(list[2].chatname, 'LegacyCountOnlyDonor');
    assert.equal(list[2].amount, '');
    assert.equal(list[2].count, 3);
});


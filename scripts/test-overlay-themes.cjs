'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const puppeteer = require('puppeteer');
const fs = require('fs');
const vm = require('vm');

test('OverlayThemes library: built-in presets, custom themes CRUD, and aliases', () => {
    const code = fs.readFileSync(path.resolve(__dirname, '../public/js/overlay-theme.js'), 'utf8');
    const mockStorage = {};
    const context = {
        window: {},
        document: {
            documentElement: { style: { setProperty() {} } },
            body: { classList: { add() {} } },
            head: { appendChild() {} },
            createElement() { return {}; }
        },
        localStorage: {
            getItem(key) { return mockStorage[key] || null; },
            setItem(key, val) { mockStorage[key] = String(val); },
            removeItem(key) { delete mockStorage[key]; }
        },
        console
    };
    vm.runInNewContext(code, context);

    const { OverlayThemes, OverlayFonts } = context.window;
    const BUILT_IN_THEMES = OverlayThemes.BUILT_IN_THEMES;
    assert.ok(OverlayThemes, 'OverlayThemes should be exported to window');
    assert.ok(OverlayFonts, 'OverlayFonts should be exported to window');
    assert.ok(Array.isArray(OverlayFonts.google), 'OverlayFonts.google should list Google Fonts');
    assert.ok(OverlayFonts.google.length >= 20, 'Should offer 20+ top Google Fonts');

    // 1. Built-in themes count
    const themeKeys = Object.keys(BUILT_IN_THEMES);
    assert.ok(themeKeys.length >= 18, 'Should support at least 18 built-in themes');
    ['card', 'fgc-evo', 'championship', 'cyber', 'glass', 'solid', 'transparent', 'pill', 'border', 'retro', 'ember', 'aurora', 'ocean', 'sunset', 'violet', 'forest'].forEach(k => {
        assert.ok(BUILT_IN_THEMES[k], `Built-in theme "${k}" should be defined`);
        assert.ok(BUILT_IN_THEMES[k].radius !== undefined, `Theme "${k}" should have radius`);
    });

    // 2. Aliases
    assert.equal(OverlayThemes.getTheme('gold')?.id, 'championship');
    assert.equal(OverlayThemes.getTheme('evo')?.id, 'fgc-evo');
    assert.equal(OverlayThemes.getTheme('cyberpunk')?.id, 'cyber');
    assert.equal(OverlayThemes.getTheme('neon')?.id, 'neon');
    assert.equal(OverlayThemes.getTheme('arcade')?.id, 'border');

    // 3. Hex code theme resolution
    const hexTheme = OverlayThemes.getTheme('1a202c');
    assert.ok(hexTheme, 'Hex theme should resolve');
    assert.equal(hexTheme.id, 'custom');
    assert.equal(hexTheme.isCustom, true);
    assert.equal(hexTheme.cardBg, '#1a202c');

    // 4. Custom Themes CRUD
    const saved = OverlayThemes.saveCustomTheme({
        name: 'Neo Tokyo Synth',
        font: 'Montserrat',
        weight: '700',
        textTransform: 'uppercase',
        radius: '12px',
        accent: '#ff0077',
        cardBg: '#110022',
        border: '#ff0077',
        text: '#ffffff',
        muted: '#cc99ee',
        winner: '#00ffcc'
    });
    assert.ok(saved, 'Custom theme should be saved');
    assert.equal(saved.id, 'neo-tokyo-synth');
    assert.equal(saved.font, 'Montserrat');

    const retrieved = OverlayThemes.getTheme('neo-tokyo-synth');
    assert.ok(retrieved, 'Should retrieve custom theme by slug');
    assert.equal(retrieved.name, 'Neo Tokyo Synth');
    assert.equal(retrieved.radius, '12px');

    const all = OverlayThemes.getAllThemes();
    assert.equal(all.custom.length, 1);
    assert.equal(all.custom[0].id, 'neo-tokyo-synth');

    const deleted = OverlayThemes.deleteCustomTheme('neo-tokyo-synth');
    assert.equal(deleted, true);
    assert.equal(OverlayThemes.getTheme('neo-tokyo-synth'), null);
});

test('Matchup overlay typography & color parameter overrides', async () => {
    const OVERLAY_URL = 'file://' + path.resolve(__dirname, '../public/overlays/matchup.html');
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: 'new',
            pipe: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--allow-file-access-from-files']
        });
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 720 });

        // Test custom font, weight, transform, radius, outline, cardbg, and colors
        const query = new URLSearchParams({
            preview: '1',
            layout: 'top',
            font: 'Oswald',
            weight: '900',
            transform: 'lowercase',
            radius: '16px',
            outline: 'subtle',
            cardbg: 'rgba(20, 20, 40, 0.95)',
            border: '#ff3366',
            accent: '#00ccff',
            winner: '#33ff99',
            text: '#fdfdfd',
            muted: '#a0a0c0',
            p1color: '#ff4444',
            p2color: '#44aaff'
        }).toString();

        await page.goto(`${OVERLAY_URL}?${query}`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.topbar-panel');

        const styles = await page.evaluate(() => {
            const root = document.documentElement.style;
            const csRoot = getComputedStyle(document.documentElement);
            const panel = document.querySelector('.topbar-panel');
            const csPanel = getComputedStyle(panel);
            const nameEl = document.querySelector('.topbar-competitor.c1 .competitor-name');
            const csName = getComputedStyle(nameEl);

            return {
                fontFamily: root.getPropertyValue('--matchup-font'),
                weight: root.getPropertyValue('--matchup-weight'),
                transform: root.getPropertyValue('--matchup-text-transform'),
                radius: root.getPropertyValue('--matchup-radius'),
                cardBg: root.getPropertyValue('--matchup-card-bg'),
                border: root.getPropertyValue('--matchup-border'),
                accent: root.getPropertyValue('--matchup-accent'),
                winner: root.getPropertyValue('--matchup-winner'),
                text: root.getPropertyValue('--matchup-text'),
                muted: root.getPropertyValue('--matchup-muted'),
                p1: root.getPropertyValue('--p1-color'),
                p2: root.getPropertyValue('--p2-color'),
                computedNameWeight: csName.fontWeight,
                computedNameTransform: csName.textTransform,
                computedPanelRadius: csPanel.borderRadius
            };
        });

        assert.ok(styles.fontFamily.includes('Oswald'), 'Font family should include Oswald');
        assert.equal(styles.weight, '900', 'Font weight CSS var should be 900');
        assert.equal(styles.transform, 'lowercase', 'Text transform CSS var should be lowercase');
        assert.equal(styles.radius, '16px', 'Border radius CSS var should be 16px');
        assert.equal(styles.cardBg, 'rgba(20, 20, 40, 0.95)');
        assert.equal(styles.border, '#ff3366');
        assert.equal(styles.accent, '#00ccff');
        assert.equal(styles.winner, '#33ff99');
        assert.equal(styles.text, '#fdfdfd');
        assert.equal(styles.muted, '#a0a0c0');
        assert.equal(styles.p1, '#ff4444');
        assert.equal(styles.p2, '#44aaff');
        assert.equal(styles.computedNameTransform, 'lowercase');
        assert.equal(styles.computedPanelRadius, '16px');
    } finally {
        if (browser) await browser.close();
    }
});

test('Tournament overlay typography, bracket scale & styling parameter overrides', async () => {
    const TOURNEY_URL = 'file://' + path.resolve(__dirname, '../public/overlays/tournament.html');
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: 'new',
            pipe: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--allow-file-access-from-files']
        });
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 720 });

        const query = new URLSearchParams({
            preview: '1',
            sample: '1',
            fit: '1',
            font: 'Montserrat',
            scale: '1.25',
            weight: '700',
            transform: 'uppercase',
            radius: '14px',
            outline: 'strong',
            cardbg: 'rgba(25, 20, 35, 0.9)',
            border: '#ff5588',
            accent: '#55ffee',
            winner: '#ffee55',
            text: '#ffffff',
            muted: '#a0a0b0'
        }).toString();

        await page.goto(`${TOURNEY_URL}?${query}`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.match-card');

        const styles = await page.evaluate(() => {
            const root = document.documentElement.style;
            const entrantName = document.querySelector('.entrant-name');
            const csName = getComputedStyle(entrantName);
            const card = document.querySelector('.match-card');
            const csCard = getComputedStyle(card);

            return {
                fontFamily: root.getPropertyValue('--tourney-font'),
                weight: root.getPropertyValue('--tourney-weight'),
                transform: root.getPropertyValue('--tourney-text-transform'),
                radius: root.getPropertyValue('--tourney-radius'),
                scale: root.getPropertyValue('--tourney-scale'),
                cardBg: root.getPropertyValue('--tourney-card-bg'),
                border: root.getPropertyValue('--tourney-border'),
                accent: root.getPropertyValue('--tourney-accent'),
                winner: root.getPropertyValue('--tourney-winner'),
                text: root.getPropertyValue('--tourney-text'),
                muted: root.getPropertyValue('--tourney-muted'),
                computedWeight: csName.fontWeight,
                computedTransform: csName.textTransform,
                computedCardRadius: csCard.borderRadius
            };
        });

        assert.ok(styles.fontFamily.includes('Montserrat'), 'Font family should include Montserrat');
        assert.equal(styles.weight, '700');
        assert.equal(styles.transform, 'uppercase');
        assert.equal(styles.radius, '14px');
        assert.equal(styles.scale, '1.25');
        assert.equal(styles.cardBg, 'rgba(25, 20, 35, 0.9)');
        assert.equal(styles.border, '#ff5588');
        assert.equal(styles.accent, '#55ffee');
        assert.equal(styles.winner, '#ffee55');
        assert.equal(styles.text, '#ffffff');
        assert.equal(styles.muted, '#a0a0b0');
        assert.equal(styles.computedWeight, '700');
        assert.equal(styles.computedTransform, 'uppercase');
        assert.equal(styles.computedCardRadius, '14px');
    } finally {
        if (browser) await browser.close();
    }
});

test('OverlayFonts asset library font loading and versus studio font integration', async () => {
    const code = fs.readFileSync(path.resolve(__dirname, '../public/js/overlay-theme.js'), 'utf8');
    const injectedStyles = [];
    const context = {
        window: {},
        document: {
            documentElement: { style: { setProperty() {} } },
            body: { classList: { add() {} } },
            head: {
                appendChild(el) {
                    if (el && el.textContent) injectedStyles.push(el.textContent);
                }
            },
            createElement(tag) {
                return { tagName: tag.toUpperCase(), rel: '', href: '', textContent: '' };
            }
        },
        localStorage: {
            getItem() { return null; },
            setItem() {},
            removeItem() {}
        },
        fetch: async (url) => {
            if (url === '/api/custom-overlays/assets') {
                return {
                    ok: true,
                    json: async () => [
                        { name: 'Akira-Expanded.otf', kind: 'font', family: 'Akira Expanded', label: 'Akira-Expanded', url: '/custom-overlay-assets/Akira-Expanded.otf' },
                        { name: 'ChunkyPixel.ttf', kind: 'font', family: 'Chunky Pixel', label: 'ChunkyPixel', url: '/custom-overlay-assets/ChunkyPixel.ttf' },
                        { name: 'logo.png', kind: 'image', label: 'logo', url: '/custom-overlay-assets/logo.png' }
                    ]
                };
            }
            return { ok: false };
        },
        console
    };
    vm.runInNewContext(code, context);

    const { OverlayFonts } = context.window;
    assert.ok(OverlayFonts.getAssetFonts, 'OverlayFonts should expose getAssetFonts function');

    const assets = await OverlayFonts.getAssetFonts();
    assert.equal(assets.length, 2, 'Should filter out non-font assets');
    assert.equal(assets[0].family, 'Akira Expanded');
    assert.equal(assets[1].family, 'Chunky Pixel');

    // Test loadFont with custom asset library font
    OverlayFonts.loadFont('Akira Expanded');
    // Allow async microtask resolution
    await new Promise(r => setTimeout(r, 20));

    const fontFaceStyle = injectedStyles.find(s => s.includes('Akira Expanded') && s.includes('/custom-overlay-assets/Akira-Expanded.otf'));
    assert.ok(fontFaceStyle, '@font-face style should be injected for Asset Library font');
    assert.ok(fontFaceStyle.includes("src: url('/custom-overlay-assets/Akira-Expanded.otf')"), 'Font src should match asset URL');
});

test('Poll overlay typography, custom theme & styling parameter overrides', async () => {
    const OVERLAY_URL = 'file://' + path.resolve(__dirname, '../public/overlays/poll.html');
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: 'new',
            pipe: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--allow-file-access-from-files']
        });
        const page = await browser.newPage();
        await page.setViewport({ width: 800, height: 600 });
        await page.goto(`${OVERLAY_URL}?preview=1&theme=championship&font=Cinzel&scale=1.25&weight=700&radius=18px&accent=ffaa00&winner=00ff88`, {
            waitUntil: 'domcontentloaded'
        });
        await page.waitForSelector('#poll-card');

        const styles = await page.evaluate(() => {
            const root = document.documentElement;
            const card = document.getElementById('poll-card');
            const cs = window.getComputedStyle(root);
            return {
                pollFont: cs.getPropertyValue('--poll-font').trim(),
                pollScale: cs.getPropertyValue('--poll-font-scale').trim(),
                pollRadius: cs.getPropertyValue('--poll-radius').trim(),
                pollAccent: cs.getPropertyValue('--poll-accent').trim(),
                pollWinner: cs.getPropertyValue('--poll-winner').trim(),
                cardHasTheme: card.classList.contains('theme-championship')
            };
        });

        assert.ok(styles.pollFont.includes('Cinzel'), 'Poll font should include Cinzel');
        assert.equal(styles.pollScale, '1.25', 'Poll scale should be 1.25');
        assert.equal(styles.pollRadius, '18px', 'Poll corner radius should be 18px');
        assert.equal(styles.pollAccent, '#ffaa00', 'Poll accent should be #ffaa00');
        assert.equal(styles.pollWinner, '#00ff88', 'Poll winner highlight should be #00ff88');
        assert.ok(styles.cardHasTheme, 'Poll card should have theme-championship class');
    } finally {
        if (browser) await browser.close();
    }
});

test('Poll tournament overlay styling & theme integration', async () => {
    const OVERLAY_URL = 'file://' + path.resolve(__dirname, '../public/overlays/poll-tournament.html');
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: 'new',
            pipe: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--allow-file-access-from-files']
        });
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 720 });
        await page.goto(`${OVERLAY_URL}?preview=1&theme=cyber&font=Press+Start+2P&scale=1.15&radius=4px&accent=00ffff&lines=solid`, {
            waitUntil: 'domcontentloaded'
        });
        await page.waitForSelector('#tournament-container');

        const styles = await page.evaluate(() => {
            const root = document.documentElement;
            const cs = window.getComputedStyle(root);
            return {
                tourneyFont: cs.getPropertyValue('--tourney-font').trim(),
                tourneyScale: cs.getPropertyValue('--tourney-scale').trim(),
                tourneyRadius: cs.getPropertyValue('--tourney-radius').trim(),
                tourneyAccent: cs.getPropertyValue('--tourney-accent').trim(),
                bodyHasTheme: document.body.classList.contains('theme-cyber'),
                bodyHasLines: document.body.classList.contains('lines-solid')
            };
        });

        assert.ok(styles.tourneyFont.includes('Press Start 2P'), 'Tournament font should include Press Start 2P');
        assert.equal(styles.tourneyScale, '1.15', 'Bracket scale should be 1.15');
        assert.equal(styles.tourneyRadius, '4px', 'Bracket corner radius should be 4px');
        assert.equal(styles.tourneyAccent, '#00ffff', 'Bracket accent should be #00ffff');
        assert.ok(styles.bodyHasTheme, 'Body should have theme-cyber class');
        assert.ok(styles.bodyHasLines, 'Body should have lines-solid class');
    } finally {
        if (browser) await browser.close();
    }
});

test('Poll Manager studio (polls.html) theme and font controls integration', () => {
    const html = fs.readFileSync(path.resolve(__dirname, '../public/tools/polls.html'), 'utf8');

    // Required overlay controls
    assert.ok(html.includes('id="overlay-fonts-list"'), 'Should contain datalist for overlay fonts');
    assert.ok(html.includes('id="modal-save-theme"'), 'Should contain modal to save custom themes');
    assert.ok(html.includes('id="modal-manage-themes"'), 'Should contain modal to manage custom themes');
    assert.ok(html.includes('id="modal-asset-font-picker"'), 'Should contain modal to pick asset fonts');
    assert.ok(html.includes('id="tourney-opt-font"'), 'Should contain font family input for tournament bracket');
    assert.ok(html.includes('id="tourney-opt-scale"'), 'Should contain scale selector for tournament bracket');
    assert.ok(html.includes('id="tourney-opt-weight"'), 'Should contain font weight selector for tournament bracket');
    assert.ok(html.includes('id="tourney-opt-radius"'), 'Should contain radius selector for tournament bracket');
    assert.ok(html.includes('id="tourney-opt-roundpipstyle"'), 'Should contain round pip style selector for tournament bracket');
    assert.ok(html.includes('id="poll-opt-font"'), 'Should contain font family input for poll overlay');
    assert.ok(html.includes('id="poll-opt-scale"'), 'Should contain scale selector for poll overlay');
    assert.ok(html.includes('id="poll-opt-radius"'), 'Should contain radius selector for poll overlay');
    assert.ok(html.includes('id="poll-opt-winner"'), 'Should contain winner color picker for poll overlay');
    assert.ok(html.includes('id="entrant1-color-picker"'), 'Should contain active match entrant 1 color picker in poll tournament');
    assert.ok(html.includes('id="entrant2-color-picker"'), 'Should contain active match entrant 2 color picker in poll tournament');
    assert.ok(html.includes('id="tourney-opt-p1color"'), 'Should contain tournament entrant 1 slot color input');
    assert.ok(html.includes('id="tourney-opt-p2color"'), 'Should contain tournament entrant 2 slot color input');
});

test('Tournament and Poll overlays Heading Font vs Content Font parameter separation', async () => {
    const TOURNEY_URL = 'file://' + path.resolve(__dirname, '../public/overlays/poll-tournament.html');
    const POLL_URL = 'file://' + path.resolve(__dirname, '../public/overlays/poll.html');
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: 'new',
            pipe: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--allow-file-access-from-files']
        });
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 720 });
        await page.goto(`${TOURNEY_URL}?preview=1&sample=1&font=Montserrat&headingfont=Cinzel&headingweight=800&headingtransform=uppercase`, {
            waitUntil: 'domcontentloaded'
        });
        await page.waitForSelector('#tournament-container');

        const tourneyStyles = await page.evaluate(() => {
            const root = document.documentElement;
            const cs = window.getComputedStyle(root);
            return {
                font: cs.getPropertyValue('--tourney-font').trim(),
                headingFont: cs.getPropertyValue('--tourney-heading-font').trim(),
                headingWeight: cs.getPropertyValue('--tourney-heading-weight').trim(),
                headingTransform: cs.getPropertyValue('--tourney-heading-transform').trim()
            };
        });

        assert.ok(tourneyStyles.font.includes('Montserrat'), 'Content font should be Montserrat');
        assert.ok(tourneyStyles.headingFont.includes('Cinzel'), 'Heading font should be Cinzel');
        assert.equal(tourneyStyles.headingWeight, '800', 'Heading weight should be 800');
        assert.equal(tourneyStyles.headingTransform, 'uppercase', 'Heading transform should be uppercase');

        // Test Live Poll overlay heading vs content font
        await page.goto(`${POLL_URL}?preview=1&font=Roboto&headingfont=Oswald&headingweight=900`, {
            waitUntil: 'domcontentloaded'
        });
        await page.waitForSelector('#poll-card');

        const pollStyles = await page.evaluate(() => {
            const root = document.documentElement;
            const cs = window.getComputedStyle(root);
            return {
                font: cs.getPropertyValue('--poll-font').trim(),
                headingFont: cs.getPropertyValue('--poll-heading-font').trim()
            };
        });

        assert.ok(pollStyles.font.includes('Roboto'), 'Poll content font should be Roboto');
        assert.ok(pollStyles.headingFont.includes('Oswald'), 'Poll heading font should be Oswald');
    } finally {
        if (browser) await browser.close();
    }
});

test('Tournament overlay dynamic focus layout (layout=focus) zooms on active match and glides smoothly', async () => {
    const TOURNEY_URL = 'file://' + path.resolve(__dirname, '../public/overlays/tournament.html');
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: 'new',
            pipe: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--allow-file-access-from-files']
        });
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 720 });
        await page.goto(`${TOURNEY_URL}?preview=1&sample=1&layout=focus&scale=1.15&focusbadge=1`, {
            waitUntil: 'domcontentloaded'
        });
        await page.waitForSelector('.match-card');

        const focusInfo = await page.evaluate(() => {
            const stage = document.getElementById('stage');
            const hasFocusClass = document.body.classList.contains('layout-focus');
            const transform = stage ? stage.style.transform : '';
            const targetRound = document.querySelector('.bracket-round.is-target-round');
            const badge = document.getElementById('tourney-focus-badge');

            return {
                hasFocusClass,
                transform,
                hasTargetRound: Boolean(targetRound),
                hasBadge: Boolean(badge),
                badgeText: badge ? badge.textContent.trim() : ''
            };
        });

        assert.ok(focusInfo.hasFocusClass, 'Body should have layout-focus class');
        assert.ok(focusInfo.transform.includes('translate('), 'Stage should have translated camera transform');
        assert.ok(focusInfo.transform.includes('scale('), 'Stage should have scale transform');
        assert.ok(focusInfo.hasTargetRound, 'A bracket round should be marked as target round');
        assert.ok(focusInfo.hasBadge, 'Dynamic focus badge should be rendered');
    } finally {
        if (browser) await browser.close();
    }
});

test('Tournament dynamic focus camera framing on/off (focus=0), glide on/off (glide=0), and badge on/off (focusbadge=0) parameter options', async () => {
    const TOURNEY_URL = 'file://' + path.resolve(__dirname, '../public/overlays/tournament.html');
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: 'new',
            pipe: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--allow-file-access-from-files']
        });
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 720 });

        // 1. Test glide=0 (instant snap without smooth glide transition) & focusbadge=0
        await page.goto(`${TOURNEY_URL}?preview=1&sample=1&layout=focus&glide=0&focusbadge=0`, {
            waitUntil: 'domcontentloaded'
        });
        await page.waitForSelector('.match-card');

        const snapInfo = await page.evaluate(() => {
            const stage = document.getElementById('stage');
            return {
                transition: stage ? stage.style.transition : '',
                badgePresent: Boolean(document.getElementById('tourney-focus-badge'))
            };
        });
        assert.equal(snapInfo.transition, 'none', 'Stage transition should be none when glide=0');
        assert.equal(snapInfo.badgePresent, false, 'Focus badge should be absent when focusbadge=0');

        // 2. Test focus=0 (explicitly disable camera framing even when layout=focus)
        await page.goto(`${TOURNEY_URL}?preview=1&sample=1&layout=focus&focus=0`, {
            waitUntil: 'domcontentloaded'
        });
        await page.waitForSelector('.match-card');

        const offInfo = await page.evaluate(() => {
            const stage = document.getElementById('stage');
            return {
                hasFocusClass: document.body.classList.contains('layout-focus'),
                badgePresent: Boolean(document.getElementById('tourney-focus-badge')),
                transform: stage ? stage.style.transform : ''
            };
        });
        assert.equal(offInfo.hasFocusClass, false, 'layout-focus class should not be applied when focus=0');
        assert.equal(offInfo.badgePresent, false, 'Focus badge should not be created when focus=0');
    } finally {
        if (browser) await browser.close();
    }
});

test('OverlayFonts deduplication across custom asset fonts, Google fonts, and system fonts', async () => {
    const code = fs.readFileSync(path.resolve(__dirname, '../public/js/overlay-theme.js'), 'utf8');
    const context = {
        window: {},
        document: {
            documentElement: { style: { setProperty() {} } },
            body: { classList: { add() {} } },
            head: { appendChild() {} },
            createElement() { return {}; }
        },
        localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
        fetch: async (url) => {
            if (url === '/api/custom-overlays/assets') {
                return {
                    ok: true,
                    json: async () => [
                        // Uploaded font with exact same name as Google font 'Montserrat'
                        { name: 'Montserrat-Bold.ttf', kind: 'font', family: 'Montserrat', url: '/custom-overlay-assets/Montserrat-Bold.ttf' },
                        { name: 'CustomGamer.woff2', kind: 'font', family: "'Custom Gamer'", url: '/custom-overlay-assets/CustomGamer.woff2' },
                        { name: 'image.png', kind: 'image' }
                    ]
                };
            }
            return { ok: false };
        },
        console
    };
    vm.runInNewContext(code, context);

    const { OverlayFonts } = context.window;
    assert.ok(typeof OverlayFonts.getDeduplicatedFontFamilies === 'function', 'Should expose getDeduplicatedFontFamilies');

    const list = await OverlayFonts.getDeduplicatedFontFamilies();
    const names = list.map(e => e.name);
    const lowerNames = names.map(n => n.toLowerCase());
    const uniqueLower = new Set(lowerNames);

    assert.equal(lowerNames.length, uniqueLower.size, 'Every font family should appear exactly once (no duplicates)');
    assert.ok(names.includes('Custom Gamer'), 'Quotes should be cleaned from font family names');
    assert.ok(!names.some(n => n.includes("'") || n.includes('"')), 'No quotes should remain in family names');

    // Montserrat should be listed under asset, and not repeated under google
    const montserratEntries = list.filter(e => e.name.toLowerCase() === 'montserrat');
    assert.equal(montserratEntries.length, 1, 'Montserrat should appear exactly once');
    assert.equal(montserratEntries[0].source, 'asset', 'Uploaded asset version should take precedence');
});

test('Custom overlay background pattern persistence and normalization', () => {
    const overlays = require('../server/services/overlays.js');
    const customPatternElement = {
        id: 'bg-pattern-layer',
        type: 'procedural-pattern',
        name: 'Background Pattern',
        pattern: {
            preset: 'hexagons',
            accent: '#ff0077',
            secondary: '#00ffcc',
            color: '#0d1117',
            lineWidth: 1.5,
            scale: 120,
            motion: 'drift',
            speed: 1.2,
            blendMode: 'screen'
        }
    };
    const normalized = overlays.normalizeCustomOverlay({
        id: 'overlay-with-pattern',
        name: 'Overlay With Pattern',
        elements: [customPatternElement]
    });

    const el = normalized.elements[0];
    assert.equal(el.type, 'procedural-pattern', 'Element type must remain procedural-pattern');
    assert.equal(el.pattern.preset, 'hexagons', 'Pattern preset must be preserved');
    assert.equal(el.pattern.accent, '#ff0077', 'Pattern accent must be preserved');
    assert.equal(el.pattern.secondary, '#00ffcc', 'Pattern secondary must be preserved');
    assert.equal(el.pattern.color, '#0d1117', 'Pattern color must be preserved');
    assert.equal(el.pattern.lineWidth, 1.5, 'Pattern lineWidth must be preserved');
    assert.equal(el.pattern.scale, 120, 'Pattern scale must be preserved');
    assert.equal(el.pattern.motion, 'drift', 'Pattern motion drift must be preserved');
    assert.equal(el.pattern.speed, 1.2, 'Pattern speed multiplier must be preserved');
    assert.equal(el.pattern.blendMode, 'screen', 'Pattern blendMode must be preserved');
});

test('Poll tournament entrant / versus colors customization and participant parsing', async () => {
    // 1. Backend parseEntrant unit test
    const { parseEntrant } = require('../server/services/polls.js');
    assert.ok(typeof parseEntrant === 'function', 'parseEntrant should be exported from polls service');

    const e1 = parseEntrant('Chrono Trigger #ef4444');
    assert.equal(e1.name, 'Chrono Trigger');
    assert.equal(e1.color, '#ef4444');

    const e2 = parseEntrant('Final Fantasy VII [#3b82f6]');
    assert.equal(e2.name, 'Final Fantasy VII');
    assert.equal(e2.color, '#3b82f6');

    const e3 = parseEntrant('Super Metroid [SNES] #10b981');
    assert.equal(e3.name, 'Super Metroid');
    assert.equal(e3.tag, 'SNES');
    assert.equal(e3.color, '#10b981');

    const e4 = parseEntrant({ name: 'EarthBound', tag: 'RPG', color: '#f59e0b' });
    assert.equal(e4.name, 'EarthBound');
    assert.equal(e4.tag, 'RPG');
    assert.equal(e4.color, '#f59e0b');

    // 2. Poll tournament overlay CSS variables and entrant color application via puppeteer
    const OVERLAY_URL = 'file://' + path.resolve(__dirname, '../public/overlays/poll-tournament.html');
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: 'new',
            pipe: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--allow-file-access-from-files']
        });
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 720 });
        await page.goto(`${OVERLAY_URL}?preview=1&sample=1&p1color=%23ff0055&p2color=%2300ffaa`, {
            waitUntil: 'domcontentloaded'
        });
        await page.waitForSelector('#tournament-container');

        const result = await page.evaluate(() => {
            const root = document.documentElement;
            const cs = window.getComputedStyle(root);
            return {
                tourneyP1: cs.getPropertyValue('--tourney-p1-color').trim(),
                tourneyP2: cs.getPropertyValue('--tourney-p2-color').trim(),
                activeHudPresent: Boolean(document.getElementById('active-match-hud')),
                matchCardsCount: document.querySelectorAll('.match-card').length
            };
        });

        assert.equal(result.tourneyP1, '#ff0055', '--tourney-p1-color should be set to #ff0055');
        assert.equal(result.tourneyP2, '#00ffaa', '--tourney-p2-color should be set to #00ffaa');
        assert.ok(result.matchCardsCount > 0, 'Match cards should be rendered');
    } finally {
        if (browser) await browser.close();
    }
});

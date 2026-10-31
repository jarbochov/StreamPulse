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

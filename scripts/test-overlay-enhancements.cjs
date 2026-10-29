'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { PATTERNS, PATTERN_CATEGORIES, drawProceduralPattern } = require('../public/js/patterns-shared.js');

test('Shared patterns module: exports, categories and canvas drawing', () => {
    assert.equal(Array.isArray(PATTERNS), true);
    assert.equal(PATTERNS.length, 20);
    assert.ok(PATTERNS.includes('grid'));
    assert.ok(PATTERNS.includes('hexagons'));
    assert.ok(PATTERNS.includes('circuit'));
    assert.ok(PATTERNS.includes('topography'));
    assert.ok(PATTERNS.includes('starfield'));

    assert.equal(PATTERN_CATEGORIES.length, 3);
    const allCategoryOptions = PATTERN_CATEGORIES.flatMap(cat => cat.options.map(opt => opt[0]));
    for (const pat of PATTERNS) {
        assert.ok(allCategoryOptions.includes(pat), `Pattern ${pat} must be categorized`);
    }

    // Mock canvas 2D context to verify drawProceduralPattern
    const calls = [];
    const mockCtx = {
        save: () => calls.push('save'),
        restore: () => calls.push('restore'),
        beginPath: () => calls.push('beginPath'),
        closePath: () => calls.push('closePath'),
        moveTo: (x, y) => calls.push(`moveTo(${x},${y})`),
        lineTo: (x, y) => calls.push(`lineTo(${x},${y})`),
        stroke: () => calls.push('stroke'),
        fill: () => calls.push('fill'),
        fillRect: (x, y, w, h) => calls.push(`fillRect(${x},${y},${w},${h})`),
        scale: (sx, sy) => calls.push(`scale(${sx},${sy})`),
        translate: (x, y) => calls.push(`translate(${x},${y})`),
        rotate: (r) => calls.push(`rotate(${r})`),
        arc: (x, y, r, s, e) => calls.push(`arc(${x},${y},${r})`),
        ellipse: (x, y, rx, ry, rot, s, e) => calls.push(`ellipse(${x},${y})`),
        createRadialGradient: () => ({ addColorStop: () => {} }),
        createLinearGradient: () => ({ addColorStop: () => {} })
    };

    // Verify all 20 patterns draw without throwing
    for (const pat of PATTERNS) {
        assert.doesNotThrow(() => {
            drawProceduralPattern(mockCtx, pat, 640, 360, {
                scale: 100,
                color: '#111827',
                accent: '#38bdf8',
                secondary: '#818cf8',
                time: 1.5,
                motion: 'drift'
            });
        }, `Pattern ${pat} must render cleanly`);
    }
    assert.ok(calls.length > 50, 'drawProceduralPattern executed canvas instructions');
});

test('Overlay Shared: Tier list single-column stack and shrink protection', () => {
    const code = fs.readFileSync(path.join(__dirname, '../public/js/overlay-shared.js'), 'utf8');
    assert.ok(code.includes('const maxAcross = tiers ? 1 :'), 'Tiers layout must lock maxAcross to 1');
    assert.ok(code.includes('config.periodsAcross > 0 && !kanban && !tiers'), 'periodsAcross must be ignored for tiers');
    assert.ok(code.includes('const factorW = shrink && availW > 0 && needW > availW'), 'Shrink must account for element box width');
});

test('Matchup Overlay: Player clocks support across all layouts', () => {
    const code = fs.readFileSync(path.join(__dirname, '../public/overlays/matchup.html'), 'utf8');
    assert.ok(code.includes('playerClocksParam'), 'matchup.html must parse playerclocks param');
    assert.ok(!code.includes('m.clock.mode !== \'race\''), 'renderRunnerInlineTimerHtml must not block non-race clock modes');
    assert.ok(code.includes('.runner-finish-pill.ready'), 'matchup.html must include ready pill styling');
});

test('Custom Overlay Editor: IGDB artwork import dialog and menu options', () => {
    const html = fs.readFileSync(path.join(__dirname, '../public/editors/custom-overlay-editor.html'), 'utf8');
    assert.ok(html.includes('data-add="igdb-artwork"'), 'Add element menu must contain Game Artwork (IGDB)');
    assert.ok(html.includes('id="asset-igdb-btn"'), 'Asset dialog must contain Import from IGDB button');
    assert.ok(html.includes('id="igdb-dialog"'), 'Editor must include igdb-dialog modal');

    const js = fs.readFileSync(path.join(__dirname, '../public/js/editor/editor-main.js'), 'utf8');
    assert.ok(js.includes('openIgdbDialog'), 'editor-main.js must define openIgdbDialog');
    assert.ok(js.includes('/api/promos/igdb/import'), 'editor-main.js must call promo IGDB import endpoint');
});

test('Procedural Patterns vs Repeating Pattern Tiles separation', () => {
    const html = fs.readFileSync(path.join(__dirname, '../public/editors/custom-overlay-editor.html'), 'utf8');
    assert.ok(html.includes('data-add="procedural-pattern"'), 'Must have Background Pattern in Add Layer menu');
    assert.ok(html.includes('data-add="pattern"'), 'Must retain Pattern Tile in Add Layer menu');

    const stateJs = fs.readFileSync(path.join(__dirname, '../public/js/editor/editor-state.js'), 'utf8');
    assert.ok(stateJs.includes("'procedural-pattern': { label: 'Background Pattern'"), 'TYPE_META must include procedural-pattern');
    assert.ok(stateJs.includes("type === 'procedural-pattern' ? { preset: 'hexagons'"), 'createElementData must initialize procedural-pattern properly');
    assert.ok(stateJs.includes("sourceType: 'image'"), 'Pattern Tile must default to image tiling');

    const inspectorJs = fs.readFileSync(path.join(__dirname, '../public/js/editor/editor-inspector.js'), 'utf8');
    assert.ok(inspectorJs.includes('export function proceduralPatternSection'), 'editor-inspector must export proceduralPatternSection');
    assert.ok(inspectorJs.includes("'procedural-pattern': proceduralPatternSection"), 'specific map must route procedural-pattern to its section');

    const sharedJs = fs.readFileSync(path.join(__dirname, '../public/js/overlay-shared.js'), 'utf8');
    assert.ok(sharedJs.includes("const isProcedural = curElement.type === 'procedural-pattern' || curElement.pattern?.sourceType === 'preset'"), 'mountPattern must detect procedural elements');
    assert.ok(sharedJs.includes('patternsEngine.drawProceduralPattern(ctx, presetName, cw, ch'), 'mountPattern must render procedural pattern across full canvas');
});

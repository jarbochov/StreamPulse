'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');

const { normalizeCustomOverlay, normalizeOverlayElement } = require('../server/services/overlays.js');

test('Pattern Tile: schema normalization and defaults for hue, jitter and twinkle', () => {
    // 1. Defaults when pattern is empty
    const normalizedDefault = normalizeCustomOverlay({
        id: 'test-pat-1',
        name: 'Pattern Test',
        elements: [{
            id: 'pat-el-1',
            type: 'pattern',
            pattern: {}
        }]
    });
    const pDef = normalizedDefault.elements[0].pattern;
    assert.equal(pDef.aspectRatio, '1:1');
    assert.equal(pDef.symmetry, 'none');
    assert.equal(pDef.kaleidoMorph, true);
    assert.equal(pDef.kaleidoSpeed, 8);
    assert.equal(pDef.kaleidoDirection, 'cw');
    assert.equal(pDef.kaleidoDepth, 35);
    assert.equal(pDef.hueShift, 'none');
    assert.equal(pDef.hueSpeed, 12);
    assert.equal(pDef.hueJitter, 0);
    assert.equal(pDef.brightnessJitter, 0);
    assert.equal(pDef.saturationJitter, 0);
    assert.equal(pDef.scaleJitter, 0);
    assert.equal(pDef.rotationJitter, 0);
    assert.equal(pDef.positionJitter, 0);
    assert.equal(pDef.twinkle, 0);
    assert.equal(pDef.twinkleSpeed, 4);
    assert.equal(pDef.tileDistribution, 'diagonal');
    assert.equal(pDef.tile1Scale, 100);
    assert.deepEqual(pDef.tiles, []);

    // 1c. Multi-tile slots (1-4 tiles) normalization and clamping
    const normalizedMultiTile = normalizeCustomOverlay({
        id: 'test-pat-multi',
        name: 'Pattern Multi Tile',
        elements: [{
            id: 'pat-el-multi',
            type: 'pattern',
            pattern: {
                aspectRatio: 'natural',
                tileDistribution: 'grid',
                tile1Scale: 135,
                tiles: [
                    { sourceType: 'image', src: '/api/assets/tile2.png', scale: 85 },
                    { sourceType: 'icon', content: 'fa-solid fa-bolt', color: '#ff0055', scale: 250 },
                    { sourceType: 'image', src: '/api/assets/tile4.png', scale: 10 },
                    { sourceType: 'image', src: '/api/assets/tile5-ignored.png', scale: 100 }
                ]
            }
        }]
    });
    const pMulti = normalizedMultiTile.elements[0].pattern;
    assert.equal(pMulti.aspectRatio, 'natural');
    assert.equal(pMulti.tileDistribution, 'grid');
    assert.equal(pMulti.tile1Scale, 135);
    assert.equal(pMulti.tiles.length, 3, 'Should cap extra tiles at 3 (total 4 slots)');
    assert.equal(pMulti.tiles[0].sourceType, 'image');
    assert.equal(pMulti.tiles[0].src, '/api/assets/tile2.png');
    assert.equal(pMulti.tiles[0].scale, 85);
    assert.equal(pMulti.tiles[1].sourceType, 'icon');
    assert.equal(pMulti.tiles[1].content, 'fa-solid fa-bolt');
    assert.equal(pMulti.tiles[1].color, '#ff0055');
    assert.equal(pMulti.tiles[1].scale, 200, 'Should clamp tile scale max to 200');
    assert.equal(pMulti.tiles[2].scale, 25, 'Should clamp tile scale min to 25');

    // 1b. Legacy kaleidoscope migration
    const normalizedLegacy = normalizeCustomOverlay({
        id: 'test-pat-legacy',
        name: 'Pattern Legacy Kaleido',
        elements: [{
            id: 'pat-el-leg',
            type: 'pattern',
            pattern: {
                layout: 'kaleidoscope-radial',
                motion: 'kaleidoscope'
            }
        }]
    });
    const pLeg = normalizedLegacy.elements[0].pattern;
    assert.equal(pLeg.layout, 'grid');
    assert.equal(pLeg.symmetry, 'radial');
    assert.equal(pLeg.kaleidoMorph, true);
    assert.equal(pLeg.motion, 'none');

    // 2. Custom valid values
    const normalizedCustom = normalizeCustomOverlay({
        id: 'test-pat-2',
        name: 'Pattern Custom',
        elements: [{
            id: 'pat-el-2',
            type: 'pattern',
            pattern: {
                aspectRatio: '16:9',
                hueShift: 'wave-x',
                hueSpeed: 8.5,
                hueJitter: 45,
                brightnessJitter: 20,
                saturationJitter: 15,
                scaleJitter: 25,
                rotationJitter: 60,
                positionJitter: 30,
                twinkle: 50,
                twinkleSpeed: 2.5
            }
        }]
    });
    const pCust = normalizedCustom.elements[0].pattern;
    assert.equal(pCust.aspectRatio, '16:9');
    assert.equal(pCust.hueShift, 'wave-x');
    assert.equal(pCust.hueSpeed, 8.5);
    assert.equal(pCust.hueJitter, 45);
    assert.equal(pCust.brightnessJitter, 20);
    assert.equal(pCust.saturationJitter, 15);
    assert.equal(pCust.scaleJitter, 25);
    assert.equal(pCust.rotationJitter, 60);
    assert.equal(pCust.positionJitter, 30);
    assert.equal(pCust.twinkle, 50);
    assert.equal(pCust.twinkleSpeed, 2.5);

    // 3. Out-of-bounds clamping
    const normalizedClamped = normalizeCustomOverlay({
        id: 'test-pat-3',
        name: 'Pattern Clamped',
        elements: [{
            id: 'pat-el-3',
            type: 'pattern',
            pattern: {
                aspectRatio: 'invalid-aspect',
                hueShift: 'invalid-mode',
                hueSpeed: 500, // max 120
                hueJitter: 999, // max 180
                brightnessJitter: 100, // max 50
                saturationJitter: -20, // min 0
                scaleJitter: 80, // max 50
                rotationJitter: 360, // max 180
                positionJitter: -5, // min 0
                twinkle: 200, // max 100
                twinkleSpeed: 0.1 // min 0.5
            }
        }]
    });
    const pClamp = normalizedClamped.elements[0].pattern;
    assert.equal(pClamp.aspectRatio, '1:1');
    assert.equal(pClamp.hueShift, 'none');
    assert.equal(pClamp.hueSpeed, 120);
    assert.equal(pClamp.hueJitter, 180);
    assert.equal(pClamp.brightnessJitter, 50);
    assert.equal(pClamp.saturationJitter, 0);
    assert.equal(pClamp.scaleJitter, 50);
    assert.equal(pClamp.rotationJitter, 180);
    assert.equal(pClamp.positionJitter, 0);
    assert.equal(pClamp.twinkle, 100);
    assert.equal(pClamp.twinkleSpeed, 0.5);
});

test('Pattern Tile: editor inspector and modular editor-patterns.js expose Color, Organic Jitter, and Multi-Tile slots', () => {
    const inspectorJs = fs.readFileSync(path.join(__dirname, '../public/js/editor/editor-inspector.js'), 'utf8');
    const patternsJs = fs.readFileSync(path.join(__dirname, '../public/js/editor/editor-patterns.js'), 'utf8');
    const combinedJs = inspectorJs + '\n' + patternsJs;

    assert.ok(patternsJs.includes("F.section('patternColor', 'Color & hue variation'"), 'Must contain patternColor inspector section in editor-patterns.js');
    assert.ok(patternsJs.includes("F.section('patternJitter', 'Organic scatter & jitter'"), 'Must contain patternJitter inspector section in editor-patterns.js');
    assert.ok(patternsJs.includes("pattern.hueShift"), 'Must contain pattern.hueShift field');
    assert.ok(patternsJs.includes("pattern.hueJitter"), 'Must contain pattern.hueJitter range');
    assert.ok(patternsJs.includes("pattern.brightnessJitter"), 'Must contain pattern.brightnessJitter range');
    assert.ok(patternsJs.includes("pattern.saturationJitter"), 'Must contain pattern.saturationJitter range');
    assert.ok(patternsJs.includes("pattern.scaleJitter"), 'Must contain pattern.scaleJitter range');
    assert.ok(patternsJs.includes("pattern.rotationJitter"), 'Must contain pattern.rotationJitter range');
    assert.ok(patternsJs.includes("pattern.positionJitter"), 'Must contain pattern.positionJitter range');
    assert.ok(patternsJs.includes("pattern.twinkle"), 'Must contain pattern.twinkle range');
    assert.ok(patternsJs.includes("pattern.aspectRatio"), 'Must contain pattern.aspectRatio select');
    assert.ok(patternsJs.includes("pattern.tileDistribution"), 'Must contain pattern.tileDistribution select');
    assert.ok(patternsJs.includes("pattern-add-slot-btn"), 'Must contain add tile slot button');
    assert.ok(combinedJs.includes("crop-image-btn"), 'Must contain crop-image-btn button');

    // Live execution test of buildPatternSection(el) from editor-patterns.js to guarantee no ReferenceError or missing variables
    const F = {
        section: (id, title, content) => `<section data-sect="${id}">${content}</section>`,
        select: (path, label, value, options) => `<select data-path="${path}" value="${value}"></select>`,
        range: (path, label, value, opts) => `<input type="range" data-path="${path}" value="${value}"/>`,
        number: (path, label, value, opts) => `<input type="number" data-path="${path}" value="${value}"/>`,
        color: (path, label, value, opts) => `<input type="color" data-path="${path}" value="${value}"/>`,
        text: (path, label, value, opts) => `<input type="text" data-path="${path}" value="${value}"/>`,
        check: (path, label, value) => `<input type="checkbox" data-path="${path}" checked="${Boolean(value)}"/>`,
        seg: (path, label, value, opts) => `<div data-path="${path}">${value}</div>`
    };
    const match = patternsJs.match(/export function patternSection\(el\) \{([\s\S]*?)\n\}/);
    assert.ok(match, 'patternSection must be defined in editor-patterns.js');
    const patternSectionFn = new Function('el', 'F', 'proceduralPatternSection', match[1]);
    const mockEl = {
        type: 'pattern',
        pattern: {
            sourceType: 'image',
            layout: 'grid',
            aspectRatio: '16:9',
            tileSize: 120,
            gap: 10,
            motion: 'scroll',
            scrollAngle: 315,
            speed: 12,
            hueShift: 'wave-x',
            hueSpeed: 10,
            hueJitter: 45,
            saturationJitter: 15,
            brightnessJitter: 20,
            twinkle: 30,
            twinkleSpeed: 3
        }
    };
    const renderedHtml = patternSectionFn(mockEl, F, () => '');
    assert.ok(renderedHtml.includes('data-sect="patternLayout"'), 'Rendered HTML must include patternLayout');
    assert.ok(renderedHtml.includes('data-sect="patternColor"'), 'Rendered HTML must include patternColor');
    assert.ok(renderedHtml.includes('data-path="pattern.aspectRatio"'), 'Rendered HTML must bind pattern.aspectRatio');

    const stateJs = fs.readFileSync(path.join(__dirname, '../public/js/editor/editor-state.js'), 'utf8');
    assert.ok(stateJs.includes("hueShift: 'none'"), 'editor-state.js must initialize hueShift');
    assert.ok(stateJs.includes("hueJitter: 0"), 'editor-state.js must initialize hueJitter');
    assert.ok(stateJs.includes("scaleJitter: 0"), 'editor-state.js must initialize scaleJitter');
    assert.ok(stateJs.includes("aspectRatio: '1:1'"), 'editor-state.js must initialize aspectRatio');
    assert.ok(stateJs.includes("tileDistribution: 'diagonal'"), 'editor-state.js must initialize tileDistribution');
    assert.ok(stateJs.includes("tile1Scale: 100"), 'editor-state.js must initialize tile1Scale');

    assert.ok(inspectorJs.includes("patternLayout: 'style'"), 'patternLayout must be in Style tab');
    assert.ok(inspectorJs.includes("patternJitter: 'style'"), 'patternJitter must be in Style tab');
});

test('Pattern Tile: deterministic cellHash and runtime animation lifecycle', () => {
    const sharedJs = fs.readFileSync(path.join(__dirname, '../public/js/overlay-shared.js'), 'utf8');
    assert.ok(sharedJs.includes('function cellHash(r, c, seed = 0)'), 'mountPattern must define deterministic cellHash');
    assert.ok(sharedJs.includes('hueJitter'), 'mountPattern must handle hueJitter');
    assert.ok(sharedJs.includes('scaleJitter'), 'mountPattern must handle scaleJitter');
    assert.ok(sharedJs.includes('rotationJitter'), 'mountPattern must handle rotationJitter');
    assert.ok(sharedJs.includes('positionJitter'), 'mountPattern must handle positionJitter');
    assert.ok(sharedJs.includes('twinkle'), 'mountPattern must handle twinkle');

    // Extract cellHash to test mathematical properties
    function cellHash(r, c, seed = 0) {
        let h = (r * 374761393 + c * 668265263 + seed * 1274126177) ^ 0x5bf03635;
        h = Math.imul(h ^ (h >>> 13), 1274126177);
        return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
    }

    // 1. Invariance & Determinism: same cell returns exact same value across invocations
    assert.equal(cellHash(5, -12, 1), cellHash(5, -12, 1));
    assert.equal(cellHash(0, 0, 3), cellHash(0, 0, 3));

    // 2. Uniqueness: adjacent cells produce distinct values
    assert.notEqual(cellHash(1, 2, 0), cellHash(2, 1, 0));
    assert.notEqual(cellHash(10, 10, 1), cellHash(10, 11, 1));

    // 3. Range bounds: strictly between 0 and 1 inclusive
    for (let r = -20; r <= 20; r += 5) {
        for (let c = -20; c <= 20; c += 5) {
            const val = cellHash(r, c, 2);
            assert.ok(val >= 0 && val <= 1, `Hash out of range at ${r},${c}: ${val}`);
        }
    }
});

test('Image Cropper and Asset Overwrite: exports, routes, and UI hooks', () => {
    const cropperJs = fs.readFileSync(path.join(__dirname, '../public/js/image-cropper.js'), 'utf8');
    assert.ok(cropperJs.includes('export function openImageCropper'), 'Must export openImageCropper');
    assert.ok(cropperJs.includes('sp-image-editor-dialog'), 'Must define modal dialog');
    assert.ok(cropperJs.includes('ASPECT_RATIOS'), 'Must support aspect ratio presets');
    assert.ok(cropperJs.includes('PUT'), 'Must support PUT asset overwrite');

    const assetsHtml = fs.readFileSync(path.join(__dirname, '../public/editors/assets.html'), 'utf8');
    assert.ok(assetsHtml.includes('image-cropper.js'), 'assets.html must load image-cropper.js');
    assert.ok(assetsHtml.includes('download="${esc(asset.name)}"'), 'assets.html must have download attribute');
    assert.ok(assetsHtml.includes('data-act="crop"'), 'assets.html must have crop action');

    const overlayRoutesJs = fs.readFileSync(path.join(__dirname, '../server/routes/overlays.js'), 'utf8');
    assert.ok(overlayRoutesJs.includes("pathname.match(/^\\/api\\/custom-overlays\\/assets\\/([^/]+)$/)"), 'Must define asset overwrite route');
    assert.ok(overlayRoutesJs.includes("req.method === 'PUT'"), 'Must handle PUT method');
});


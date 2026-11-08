'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const stateSource = fs.readFileSync(path.join(__dirname, '../public/js/editor/editor-state.js'), 'utf8').replace(/^export /gm, '');
const mainSource = fs.readFileSync(path.join(__dirname, '../public/js/editor/editor-main.js'), 'utf8');
const saveSource = mainSource.slice(mainSource.indexOf('function applyServerOverlay('), mainSource.indexOf('// ---- OBS WebSocket Bridge')).replace(/^export /gm, '');

test('Asset Library uploads cannot select a new picker target or overwrite a newer upload', async () => {
    const source = mainSource.slice(mainSource.indexOf("    $('asset-upload')?.addEventListener"), mainSource.indexOf("    assetGrid?.addEventListener"));
    const picks = [];
    const pending = [];
    let handler;
    const context = vm.createContext({
        picks,
        $: () => ({ addEventListener: (_type, callback) => { handler = callback; } }),
        uploadAsset: () => new Promise(resolve => pending.push(resolve)),
        toast() {},
        renderCanvas() {},
        renderProperties() {},
        changed() {}
    });
    vm.runInContext(`
        const el = { id: 'pattern', type: 'pattern' };
        const state = { overlay: { elements: [el] } };
        let pickerTarget = el.id, pickerSession = 1;
        let pickerOnPick = url => picks.push(['first', url]);
        const assetDialog = { close() { pickerSession++; pickerOnPick = null; } };
        const TEXT_TYPES = new Set();
        globalThis.selectNewPicker = () => { pickerSession++; pickerOnPick = url => picks.push(['second', url]); };
        globalThis.currentState = state;
    ` + source, context);
    const event = () => ({ target: { files: [{}], value: '' } });
    let first = handler(event());
    context.selectNewPicker();
    pending.shift()('stale.png');
    await first;
    assert.deepEqual(picks, [], 'old uploads cannot invoke the newly opened tile callback');

    first = handler(event());
    const second = handler(event());
    const oldResolve = pending.shift();
    pending.shift()('newer.png');
    await second;
    oldResolve('older.png');
    await first;
    assert.deepEqual(picks.map(pick => Array.from(pick)), [['second', 'newer.png']], 'latest upload wins within the same picker');

    context.selectNewPicker();
    const removed = handler(event());
    context.currentState.overlay = { elements: [] };
    pending.shift()('removed.png');
    await removed;
    assert.equal(picks.length, 1, 'uploads for removed documents are not selected');
});

function fixture(isNew = false) {
    const controls = new Map();
    const toasts = [];
    const obsSyncs = [];
    const urls = [];
    const context = vm.createContext({
        URLSearchParams, setTimeout, clearTimeout,
        location: { search: '?id=fixture' },
        window: {},
        localStorage: { getItem: () => null },
        document: {
            getElementById(id) {
                if (!controls.has(id)) controls.set(id, {});
                return controls.get(id);
            }
        },
        history: { replaceState: (state, title, url) => urls.push(url) },
        renderAll() {},
        syncObsState: page => obsSyncs.push(page),
        toasts
    });
    vm.runInContext(stateSource + saveSource + `
        toast = (...args) => toasts.push(args);
        state.overlay = normalizeLoaded({
            id: 'fixture', name: 'Fixture', revision: 1, updatedAt: 'before',
            canvas: { width: 640, height: 360, background: 'transparent' },
            pages: defaultPages(),
            elements: [{ id: 'shape', type: 'shape', page: 'page-1', x: 100, y: 20, width: 100, height: 50, zIndex: 0, style: {} }]
        });
        ensureCurPage();
        state.selectedIds = new Set(['shape']);
        state.savedSnapshot = snapshot();
        pushHistory();
        state.obs.connected = true;
        state.obs.sceneSyncEnabled = true;
        state.obs.syncOnSave = true;
        globalThis.editor = { state, save, snapshot, changed };
    `, context);
    context.editor.state.isNew = isNew;
    return { context, controls, toasts, obsSyncs, urls, ...context.editor };
}

test('save preserves edits made during HTTP or response parsing, acknowledges metadata and keeps dirty state', async () => {
    for (const isNew of [false, true]) {
        for (const heldPhase of ['http', 'json']) {
            const editor = fixture(isNew);
            let release;
            let submitted;
            const held = new Promise(resolve => { release = resolve; });
            editor.context.fetch = async (url, options) => {
                if (!options?.method) return { json: async () => [] };
                submitted = JSON.parse(options.body);
                if (heldPhase === 'http') await held;
                return {
                    ok: true,
                    json: async () => {
                        if (heldPhase === 'json') await held;
                        return { ...submitted, revision: 2, updatedAt: 'saved-fixture-time' };
                    }
                };
            };
            const saving = editor.save();
            await new Promise(resolve => setImmediate(resolve));
            assert.equal(submitted.elements[0].x, 100);
            assert.equal(editor.controls.get('save').disabled, true);
            editor.state.overlay.elements[0].x = 250;
            editor.state.overlay.name = 'Edited after submit';
            editor.changed(true);
            release();
            await saving;
            assert.equal(editor.state.overlay.elements[0].x, 250);
            assert.equal(editor.state.overlay.name, 'Edited after submit');
            assert.equal(editor.state.overlay.revision, 2);
            assert.equal(editor.state.overlay.updatedAt, 'saved-fixture-time');
            assert.equal(editor.state.overlay.id, submitted.id);
            assert.equal(editor.state.dirty, true);
            assert.equal(editor.state.saving, false);
            assert.equal(editor.state.isNew, false);
            assert.equal(editor.state.selectedIds.has('shape'), true);
            assert.equal(editor.controls.get('save').disabled, false);
            assert.match(editor.toasts.at(-1)[0], /Newer edits are still unsaved/);
            assert.equal(editor.obsSyncs.length, 0, 'the saved draft must not push newer unsaved edits to OBS');
            if (isNew) assert.equal(editor.urls[0], `?id=${submitted.id}`);

            editor.context.fetch = async (url, options) => ({
                ok: true,
                json: async () => ({ ...JSON.parse(options.body), revision: 3, updatedAt: 'next-fixture-time' })
            });
            await editor.save();
            assert.equal(editor.state.overlay.elements[0].x, 250);
            assert.equal(editor.state.overlay.revision, 3);
            assert.equal(editor.state.dirty, false);
            assert.equal(editor.obsSyncs.length, 1);
        }
    }
});

test('save with no newer edits still applies normalized server content and clears dirty state', async () => {
    const editor = fixture();
    editor.state.overlay.elements[0].x = 125;
    editor.changed(true);
    editor.context.fetch = async (url, options) => {
        const submitted = JSON.parse(options.body);
        submitted.elements[0].x = 126;
        return { ok: true, json: async () => ({ ...submitted, revision: 2 }) };
    };
    await editor.save();
    assert.equal(editor.state.overlay.elements[0].x, 126);
    assert.equal(editor.state.dirty, false);
    assert.equal(editor.state.savedSnapshot, editor.snapshot());
    assert.equal(editor.obsSyncs.length, 1);
});

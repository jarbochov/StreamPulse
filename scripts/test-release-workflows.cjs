'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const os = require('node:os');
const { testGroups, runGroups } = require('./release-diagnostics.cjs');
const { normalizeCustomOverlay } = require('../server/services/overlays');
const { buildTimerSnapshot } = require('../server/services/timers');

test('release diagnostics expand the existing test chain and continue after failed groups', () => {
    assert.deepEqual(testGroups({
        test: 'npm run lint && npm run regression',
        lint: 'eslint scripts/',
        regression: 'node --test a.cjs && node b.mjs'
    }), [['eslint', 'scripts/'], ['node', '--test', 'a.cjs'], ['node', 'b.mjs']]);
    assert.throws(() => testGroups({ test: 'npm run test' }), /Invalid test script/);
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'streampulse-diagnostics-'));
    const calls = [];
    try {
        const results = runGroups([['node', 'failed.cjs'], ['node', 'later.mjs']], directory, (command, args) => {
            calls.push(args[0]);
            return { status: args[0] === 'failed.cjs' ? 1 : 0 };
        });
        assert.deepEqual(calls, ['failed.cjs', 'later.mjs']);
        assert.deepEqual(results.map(result => result.exitCode), [1, 0]);
        assert.equal(fs.readdirSync(directory).length, 2, 'every group retains its own log');
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

function pageFunction(file, name) {
    const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    const start = source.search(new RegExp(`^    (?:async )?function ${name}\\(`, 'm'));
    assert.notEqual(start, -1, `Missing function ${name}`);
    const section = source.slice(start);
    return section.slice(0, section.indexOf('\n    }') + 6);
}

test('Duplicating an overlay preserves pages, transitions, cycling and layer state overrides', async () => {
    const source = normalizeCustomOverlay({
        id: 'fictional-show',
        pages: {
            enabled: true, autoAdvance: true, interval: 12, transition: 'fade',
            items: [{ id: 'intro', name: 'Intro' }, { id: 'outro', name: 'Outro' }]
        },
        elements: [
            { id: 'title', type: 'text', page: 'intro', content: 'Welcome' },
            { id: 'ending', type: 'text', page: 'outro', content: 'Thanks' },
            { id: 'shared', type: 'shape', page: '*', pageStates: { outro: { x: 250 } } }
        ]
    });
    let copy;
    const context = vm.createContext({
        uniqueId: id => `${id}-copy`, toast() {}, load: async () => {},
        api: async (url, options) => {
            if (!options) return source;
            copy = normalizeCustomOverlay(JSON.parse(options.body));
            return copy;
        }
    });
    vm.runInContext(pageFunction('public/system/custom-overlays.html', 'duplicate'), context);
    await context.duplicate(source.id);
    assert.equal(copy.id, 'fictional-show-copy');
    assert.deepEqual(copy.pages, source.pages);
    assert.deepEqual(copy.elements, source.elements);
    copy.pages.items[0].name = 'Changed copy';
    assert.equal(source.pages.items[0].name, 'Intro');
});

test('Paused date countdown snapshots keep the frozen remainder, including completed and idle states', () => {
    const start = Date.parse('2026-01-01T00:00:00Z');
    const timer = {
        id: 'fictional-break', kind: 'countdown', mode: 'date', state: 'paused',
        targetAt: new Date(start + 60000).toISOString(), startAt: new Date(start).toISOString(),
        remainingMs: 50000, startingRemainingMs: 60000
    };
    assert.equal(buildTimerSnapshot(timer, start + 40000).remainingMs, 50000);
    assert.equal(buildTimerSnapshot(timer, start + 90000).remainingMs, 50000);
    assert.equal(buildTimerSnapshot({ ...timer, state: 'idle' }, start + 40000).remainingMs, 20000);
    assert.equal(buildTimerSnapshot({ ...timer, state: 'completed', remainingMs: 0 }, start + 40000).remainingMs, 0);
    assert.equal(buildTimerSnapshot({
        ...timer, state: 'running', startedAt: start + 40000, startingRemainingMs: 50000
    }, start + 50000).remainingMs, 40000);
});

function goalsEditor(type) {
    const fields = new Map();
    const element = id => {
        if (!fields.has(id)) fields.set(id, { value: '', checked: true, textContent: '', style: {} });
        return fields.get(id);
    };
    const weights = { followers: 1, subscribers: 5, gift_subs: 5, bits_per_100: 1, donations: 1 };
    let server = {
        viewer_tracking: {}, goals: {
            items: [
                { id: 'goal', title: 'Saved title', type, tracking: 'persistent', target: 1000,
                    baseline: 0, baseline_metrics: {}, weights },
                { id: 'other', title: 'Other pending draft', type: 'followers', target: 100 }
            ]
        }
    };
    const snapshot = () => ({
        items: server.goals.items, metrics: { session: { followers: 500 } }
    });
    const context = vm.createContext({
        document: { getElementById: element }, DEFAULT_COMMUNITY_WEIGHTS: weights,
        sanitizeId: value => value, formatNumber: String, formatValue: String,
        renderGoalList() {}, showToast() {},
        fetch: async (url, options) => {
            if (url.endsWith('/reset')) {
                server.goals.items[0].baseline = 500;
                server.goals.items[0].baseline_metrics = {
                    followers: 500, subscribers: 25, gift_subs: 10, bits: 1000, donations: 30
                };
                return { ok: true, json: async () => ({ goals: snapshot() }) };
            }
            if (options?.method === 'PUT') {
                server = JSON.parse(options.body);
                return { ok: true, json: async () => server };
            }
            return { ok: true, json: async () => snapshot() };
        },
        fixture: JSON.parse(JSON.stringify(server))
    });
    const names = ['syncSelectedGoalFromDom', 'mergeGoalBaselines', 'resetSelectedGoal', 'saveGoals',
        'refreshSnapshot', 'renderMetrics', 'renderSelectedGoalMeta'];
    vm.runInContext(`
        let settingsState = fixture;
        let selectedGoalId = 'goal';
        let goalsSnapshot = JSON.parse(JSON.stringify({ items: fixture.goals.items, metrics: {} }));
        ${names.map(name => pageFunction('public/editors/goals-editor.html', name)).join('\n')}
    `, context);
    element('goal-id').value = 'goal';
    element('goal-title').value = 'Unsaved title';
    element('goal-type').value = type;
    element('goal-tracking').value = 'persistent';
    element('goal-target').value = 1000;
    element('goal-baseline-display').value = 0;
    for (const id of ['followers', 'subscribers', 'gift-subs', 'bits', 'donations']) {
        element(`baseline-${id}`).value = 0;
        element(`weight-${id}`).value = 0;
    }
    return { context, element, getServer: () => server };
}

test('Goal baseline reset survives the next save without discarding pending goal edits', async () => {
    for (const type of ['followers', 'community']) {
        const { context, element, getServer } = goalsEditor(type);
        await context.resetSelectedGoal();
        assert.equal(element('goal-title').value, 'Unsaved title');
        await context.saveGoals();
        const goal = getServer().goals.items[0];
        assert.equal(goal.title, 'Unsaved title');
        assert.equal(getServer().goals.items[1].title, 'Other pending draft');
        if (type === 'community') {
            assert.deepEqual(goal.baseline_metrics, {
                followers: 500, subscribers: 25, gift_subs: 10, bits: 1000, donations: 30
            });
            assert.deepEqual(goal.weights, { followers: 0, subscribers: 0, gift_subs: 0, bits_per_100: 0, donations: 0 });
        } else {
            assert.equal(goal.baseline, 500);
        }
    }
});

test('Live goal refresh does not overwrite a pending baseline edit and zero weights remain zero', async () => {
    const { context, element } = goalsEditor('community');
    element('baseline-followers').value = 123;
    await context.refreshSnapshot();
    assert.equal(element('baseline-followers').value, 123);
    await context.saveGoals();
    assert.equal(element('metric-community').textContent, '0');
});

test('Remote goal resets update untouched baselines while preserving manually edited fields', async () => {
    const { context, element, getServer } = goalsEditor('community');
    element('baseline-followers').value = 123;
    context.mergeGoalBaselines({
        items: [{
            id: 'goal', type: 'community',
            baseline_metrics: { followers: 500, subscribers: 25, gift_subs: 10, bits: 1000, donations: 30 }
        }]
    });
    assert.equal(element('baseline-followers').value, 123);
    assert.equal(element('baseline-subscribers').value, 25);
    await context.saveGoals();
    assert.deepEqual(getServer().goals.items[0].baseline_metrics, {
        followers: 123, subscribers: 25, gift_subs: 10, bits: 1000, donations: 30
    });
});

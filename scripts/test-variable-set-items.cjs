'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');

const { resolveSetItemToken, slugifyEntryLabel, listSetItemChoices } = require('../shared/variable-set-items.cjs');
const { normalizeNumericBindings, resolveNumericConfig } = require('../shared/numeric-bindings.cjs');
const createVariables = require('../server/services/variables');

function loadOverlayShared() {
    const code = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'overlay-shared.js'), 'utf8');
    const sandbox = { window: {}, console, Date, Intl, Math, Number, String, Array, Object, Map, Set, RegExp, JSON, URL, URLSearchParams, encodeURIComponent, decodeURIComponent, parseInt, parseFloat, isNaN, isFinite };
    sandbox.self = sandbox.window;
    sandbox.globalThis = sandbox.window;
    vm.runInNewContext(code, sandbox);
    return sandbox.window.OverlayShared;
}

function makeFixtureStatus() {
    const badgesSet = {
        id: 'badges',
        name: 'Badges',
        slotsCount: 0,
        fields: [{ key: 'title', label: 'Title', type: 'text' }],
        roster: [
            { id: 'b1', label: 'Speedrun', enabled: true, values: { title: 'Speedrun Gold' }, tiers: [{ level: 2 }] },
            { id: 'b2', label: 'No-Hit', enabled: true, values: { title: 'No-Hit Clear' }, tiers: [{ level: 1 }] }
        ]
    };

    const sponsorsSet = {
        id: 'sponsors',
        name: 'Sponsors',
        slotsCount: 1,
        slots: ['sp_a'],
        activeEntry: 'sp_a',
        fields: [
            { key: 'name', label: 'Name', type: 'text' },
            { key: 'accent', label: 'Accent', type: 'color' },
            { key: 'score', label: 'Score', type: 'number' },
            {
                key: 'tier',
                label: 'Tier',
                type: 'select',
                options: [
                    { value: 'gold', label: 'Gold Partner', color: '#f59e0b', icon: 'fa-solid fa-crown' },
                    { value: 'silver', label: 'Silver Partner', color: '#94a3b8', icon: 'fa-solid fa-star' }
                ]
            },
            {
                key: 'tags',
                label: 'Tags',
                type: 'tags',
                options: [
                    { value: 'hw', label: 'Hardware' },
                    { value: 'audio', label: 'Audio' },
                    { value: 'pc', label: 'PC' }
                ]
            },
            { key: 'bio', label: 'Bio', type: 'template' },
            { key: 'badge', label: 'Featured Badge', type: 'ref', targetSet: 'badges' },
            { key: 'progress', label: 'Checklist', type: 'checklist', targetSet: 'badges', maxTier: 1 }
        ],
        roster: [
            {
                id: 'sp_a',
                label: 'Acme Labs',
                enabled: true,
                values: {
                    name: 'Acme Labs Inc',
                    accent: '#ef4444',
                    score: '75',
                    tier: 'gold',
                    tags: ['hw', 'audio'],
                    bio: '@name — @tier',
                    badge: 'b1',
                    progress: { b1: 2, b2: 0 }
                }
            },
            {
                id: 'sp_off',
                label: 'Paused Brand',
                enabled: false,
                values: {
                    name: 'Paused Brand Co',
                    accent: '#64748b',
                    score: '10',
                    tier: 'silver',
                    tags: ['pc'],
                    bio: '@name (paused)'
                }
            },
            {
                id: 'sp_b',
                label: 'Northstar Audio',
                enabled: true,
                values: {
                    name: 'Northstar Audio',
                    accent: '#22c55e',
                    score: '1234.5',
                    tier: 'silver',
                    tags: ['audio', 'pc'],
                    bio: '@name (@badge)',
                    badge: 'b2',
                    progress: { b1: 1, b2: 1 }
                }
            }
        ]
    };

    return {
        modules: { variableSets: true, variableSettings: true },
        variableSets: [sponsorsSet, badgesSet],
        customVars: [
            { name: 'headline', type: 'template', value: '{{var.sponsors.1.name}} + {{var.sponsors.2.name}} ({{var.sponsors.count}}/{{var.sponsors.total}})' }
        ]
    };
}

test('resolveSetItemToken resolves positional, .all, counts, stable slugs, and rich field metadata', () => {
    const status = makeFixtureStatus();

    assert.equal(slugifyEntryLabel('Northstar Audio!'), 'northstar_audio');

    // Counts
    assert.equal(resolveSetItemToken('var.sponsors.count', status).value, '2');
    assert.equal(resolveSetItemToken('var.sponsors.total', status).value, '3');

    // Positional (enabled-only skips disabled index 2)
    assert.equal(resolveSetItemToken('var.sponsors.1', status).value, 'Acme Labs');
    assert.equal(resolveSetItemToken('var.sponsors.1.name', status).value, 'Acme Labs Inc');
    assert.equal(resolveSetItemToken('var.sponsors.2', status).value, 'Northstar Audio');
    assert.equal(resolveSetItemToken('var.sponsors.2.name', status).value, 'Northstar Audio');
    assert.equal(resolveSetItemToken('var.sponsors.2.enabled', status).value, 'true');

    // Out-of-range positional matches cleanly with empty value
    const missing = resolveSetItemToken('var.sponsors.5.name', status);
    assert.equal(missing.matched, true);
    assert.equal(missing.found, false);
    assert.equal(missing.value, '');

    // Positional .all includes disabled entries
    assert.equal(resolveSetItemToken('var.sponsors.all.2', status).value, 'Paused Brand');
    assert.equal(resolveSetItemToken('var.sponsors.all.2.name', status).value, 'Paused Brand Co');
    assert.equal(resolveSetItemToken('var.sponsors.all.2.enabled', status).value, 'false');
    assert.equal(resolveSetItemToken('var.sponsors.all.3.name', status).value, 'Northstar Audio');

    // Stable entry lookup by slug and exact ID (works regardless of roster order)
    assert.equal(resolveSetItemToken('var.sponsors.northstar_audio.accent', status).value, '#22c55e');
    assert.equal(resolveSetItemToken('var.sponsors.sp_b.score', status).value, '1234.5');
    assert.equal(resolveSetItemToken('var.sponsors.paused_brand.enabled', status).value, 'false');

    // Select metadata suffixes (_color, _icon, _value and dot forms)
    assert.equal(resolveSetItemToken('var.sponsors.1.tier', status).value, 'Gold Partner');
    assert.equal(resolveSetItemToken('var.sponsors.1.tier_value', status).value, 'gold');
    assert.equal(resolveSetItemToken('var.sponsors.1.tier_color', status).value, '#f59e0b');
    assert.equal(resolveSetItemToken('var.sponsors.1.tier.color', status).value, '#f59e0b');
    assert.equal(resolveSetItemToken('var.sponsors.1.tier_icon', status).value, 'fa-solid fa-crown');
    assert.equal(resolveSetItemToken('var.sponsors.1.tier.icon', status).value, 'fa-solid fa-crown');

    // Tags list + count
    const tagsRes = resolveSetItemToken('var.sponsors.1.tags', status);
    assert.equal(tagsRes.isList, true);
    assert.deepEqual(tagsRes.listItems, ['Hardware', 'Audio']);
    assert.equal(resolveSetItemToken('var.sponsors.1.tags_count', status).value, '2');
    assert.equal(resolveSetItemToken('var.sponsors.1.tags.count', status).value, '2');

    // Template, ref, and checklist linked fields
    assert.equal(resolveSetItemToken('var.sponsors.1.bio', status).value, 'Acme Labs Inc — Gold Partner');
    assert.equal(resolveSetItemToken('var.sponsors.2.bio', status).value, 'Northstar Audio (No-Hit)');
    assert.equal(resolveSetItemToken('var.sponsors.1.badge', status).value, 'Speedrun');
    assert.equal(resolveSetItemToken('var.sponsors.1.badge.title', status).value, 'Speedrun Gold');
    assert.equal(resolveSetItemToken('var.sponsors.1.progress.progress', status).value, '1/2');
    assert.equal(resolveSetItemToken('var.sponsors.2.progress.started', status).value, '2');
    assert.equal(resolveSetItemToken('var.sponsors.2.progress.completed', status).value, '1');

    // Module disabled returns unmatched
    assert.equal(resolveSetItemToken('var.sponsors.1.name', { ...status, modules: { variableSets: false } }).matched, false);

    // Picker helper
    const choices = listSetItemChoices(status.variableSets[0]);
    assert.equal(choices.enabledCount, 2);
    assert.equal(choices.totalCount, 3);
    assert.deepEqual(choices.positional.map(c => c.selector), ['1', '2']);
    assert.deepEqual(choices.pinned.map(c => c.selector), ['acme_labs', 'paused_brand', 'northstar_audio']);
});

test('OverlayShared expandVariables, color/numeric bindings, and variableSnapshot support direct set items', () => {
    const shared = loadOverlayShared();
    const status = makeFixtureStatus();

    assert.equal(
        shared.expandVariables('1st: {{var.sponsors.1.name}}, 2nd: {{var.sponsors.2.name}} ({{var.sponsors.count}} active)', status),
        '1st: Acme Labs Inc, 2nd: Northstar Audio (2 active)'
    );

    // Number formatting, list formatting, icon helpers, and fallbacks
    assert.equal(
        shared.expandVariables('{{var.sponsors.2.score|number:2:comma:$:}}', status),
        '$1,234.50'
    );
    assert.equal(
        shared.expandVariables('{{var.sponsors.1.tags|sep:\\s/\\s}}', status),
        'Hardware / Audio'
    );
    assert.equal(
        shared.expandVariables('{{var.sponsors.1.tags|bullets}}', status),
        '• Hardware\n• Audio'
    );
    assert.equal(
        shared.expandVariables('{{var.sponsors.1.tier|withIcon}}', status, { inlineIcons: true }),
        '{{icon:fa-solid fa-crown}} Gold Partner'
    );
    assert.equal(
        shared.expandVariables('{{var.sponsors.1.tier.icon}}', status, { inlineIcons: true }),
        '{{icon:fa-solid fa-crown}}'
    );
    assert.equal(
        shared.expandVariables('{{var.sponsors.9.name|Open Slot}}', status),
        'Open Slot'
    );
    assert.equal(
        shared.expandVariables('{{var.sponsors.9.name}}', status, {}, true),
        '{{var.sponsors.9.name}}'
    );

    // Template variable referencing direct set items
    assert.equal(
        shared.expandVariables('{{var.headline}}', status),
        'Acme Labs Inc + Northstar Audio (2/3)'
    );

    // Standalone grouped variable takes precedence if identically named
    const statusWithGroup = {
        ...status,
        customVars: [
            ...status.customVars,
            { name: 'acme_labs', group: 'Sponsors', type: 'text', value: 'Standalone Override' }
        ]
    };
    assert.equal(shared.expandVariables('{{var.sponsors.acme_labs}}', statusWithGroup), 'Standalone Override');

    // Color token & numeric style bindings
    assert.equal(shared.resolveColorToken('{{var.sponsors.2.accent}}', status), '#22c55e');
    assert.deepEqual(
        normalizeNumericBindings({ opacity: 'sponsors.1.score', fontSize: 'sponsors.count' }, 'style'),
        { opacity: 'sponsors.1.score', fontSize: 'sponsors.count' }
    );
    const resolvedStyle = resolveNumericConfig({ opacity: 1, numberBindings: { opacity: 'sponsors.1.score' } }, 'style', status);
    assert.equal(resolvedStyle.opacity, 0.75);

    // variableSnapshot reacts to edits on non-active roster entries
    const snapBefore = shared.variableSnapshot(status, {});
    status.variableSets[0].roster[2].values.name = 'Northstar Pro Audio';
    const snapAfter = shared.variableSnapshot(status, {});
    assert.notEqual(snapBefore, snapAfter);
});

test('Backend variables service resolves direct set item tokens inside template variables', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-var-set-items-'));
    try {
        const store = createVariables({ dataDir: tmpDir });
        store.upsertSet('lineup', {
            name: 'Lineup',
            slotsCount: 0,
            fields: [{ key: 'guest', label: 'Guest', type: 'text' }],
            roster: [
                { id: 'g1', label: 'Alex', enabled: true, values: { guest: 'Alex Rivera' } },
                { id: 'g2', label: 'Sam', enabled: true, values: { guest: 'Sam Chen' } }
            ]
        });
        store.set('marquee', { type: 'template', value: 'Up next: {{var.lineup.1.guest}} & {{var.lineup.2.guest}} ({{var.lineup.count}})' });
        const vals = store.values();
        assert.equal(vals.marquee, 'Up next: Alex Rivera & Sam Chen (2)');
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
});

test('UI additions contain zero raw Unicode emojis', () => {
    const emojiRe = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
    for (const rel of ['public/js/variables/variables-sets.js', 'public/js/placeholder-picker.js', 'public/tools/operator.html']) {
        const content = fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
        assert.equal(emojiRe.test(content), false, `Found raw emoji in ${rel}`);
    }
});

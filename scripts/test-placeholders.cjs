const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Load OverlayShared from compiled bundle
const bundlePath = path.join(__dirname, '../public/js/overlay-shared.js');
const sharedCode = fs.readFileSync(bundlePath, 'utf8');
const fakeWindow = {};
new Function('window', sharedCode)(fakeWindow);
const OverlayShared = fakeWindow.OverlayShared;

test('Placeholders: Groups registration', () => {
    assert.ok(OverlayShared, 'OverlayShared must be loaded');
    const groups = OverlayShared.variableGroups({});
    const labels = groups.map(g => g.label);

    assert.ok(labels.includes('Versus / Matchup'), 'Must include Versus / Matchup group');
    assert.ok(labels.includes('Tournament / Brackets'), 'Must include Tournament / Brackets group');
    assert.ok(labels.includes('Trivia Studio'), 'Must include Trivia Studio group');
    assert.ok(labels.includes('Tier List'), 'Must include Tier List group');
});

test('Placeholders: Matchup variable resolution and ticking', () => {
    const mockStatus = {
        matchup: {
            title: 'EVO Grand Finals',
            phase: 'Grand Finals',
            format: 'Best of 5',
            status: 'ACTIVE',
            winner: null,
            clock: { formatted: '12:34', isRunning: true },
            competitors: [
                { name: 'Daigo', score: 2, tag: 'BST', color: '#ff4444' },
                { name: 'Justin Wong', score: 1, tag: 'EG', color: '#4488ff' }
            ]
        }
    };

    const table = OverlayShared.variableTable(mockStatus, {});
    assert.equal(table['matchup.title'], 'EVO Grand Finals');
    assert.equal(table['matchup.phase'], 'Grand Finals');
    assert.equal(table['matchup.round'], 'Grand Finals');
    assert.equal(table['matchup.clock'], '12:34');
    assert.equal(table['matchup.player1.name'], 'Daigo');
    assert.equal(table['matchup.player1.score'], 2);
    assert.equal(table['matchup.player1.tag'], 'BST');
    assert.equal(table['matchup.player2.name'], 'Justin Wong');
    assert.equal(table['matchup.player2.score'], 1);

    const expanded = OverlayShared.expandVariables('{{matchup.player1.name}} ({{matchup.player1.score}}) vs {{matchup.player2.name}} ({{matchup.player2.score}})', mockStatus);
    assert.equal(expanded, 'Daigo (2) vs Justin Wong (1)');

    assert.ok(OverlayShared.hasTicking('{{matchup.clock}}'), 'Matchup clock must be recognized as ticking');
});

test('Placeholders: Tournament variable resolution', () => {
    const mockStatus = {
        tournament: {
            title: 'Summer Brawl 2026',
            format: 'singleElimination',
            status: 'ACTIVE',
            champion: null,
            activeMatch: {
                title: 'Semifinals Match 1',
                roundName: 'Semifinals',
                entrant1: { name: 'Alice', score: 3 },
                entrant2: { name: 'Bob', score: 2 },
                e1Score: 3,
                e2Score: 2
            }
        }
    };

    const table = OverlayShared.variableTable(mockStatus, {});
    assert.equal(table['tournament.title'], 'Summer Brawl 2026');
    assert.equal(table['tournament.format'], 'singleElimination');
    assert.equal(table['tournament.match.current'], 'Alice vs Bob');
    assert.equal(table['tournament.match.round'], 'Semifinals');
    assert.equal(table['tournament.match.entrant1'], 'Alice');
    assert.equal(table['tournament.match.entrant1.score'], 3);
    assert.equal(table['tournament.match.entrant2'], 'Bob');
    assert.equal(table['tournament.match.entrant2.score'], 2);

    const expanded = OverlayShared.expandVariables('Next up in {{tournament.match.round}}: {{tournament.match.current}}', mockStatus);
    assert.equal(expanded, 'Next up in Semifinals: Alice vs Bob');
});

test('Placeholders: Trivia variable resolution, choices and ticking', () => {
    const mockStatus = {
        trivia: {
            status: 'reveal',
            currentIndex: 2,
            totalQuestions: 10,
            activeCategory: 'Retro Gaming',
            activeQuestionText: 'Which console introduced the Super FX chip?',
            totalVotes: 48,
            remainingSeconds: 0,
            activeQuestion: {
                category: 'Retro Gaming',
                question: 'Which console introduced the Super FX chip?',
                choices: [
                    { text: 'Mega Drive', votes: 5, percent: 10 },
                    { text: 'SNES', votes: 38, percent: 79 },
                    { text: 'PC Engine', votes: 3, percent: 6 },
                    { text: 'Neo Geo', votes: 2, percent: 4 }
                ],
                correctIndex: 1,
                funfact: 'Star Fox was the first game powered by Super FX in 1993.',
                totalVotes: 48
            },
            leaderboard: {
                seasonLeader: { rank: 1, name: 'PixelValkyrie', points: 450, correct: 4, accuracy: 80 },
                seasonTop3: [
                    { rank: 1, name: 'PixelValkyrie', points: 450, correct: 4, accuracy: 80 },
                    { rank: 2, name: 'ArcadeKnight', points: 300, correct: 3, accuracy: 75 },
                    { rank: 3, name: 'RetroSynth', points: 200, correct: 2, accuracy: 67 }
                ]
            }
        }
    };

    const table = OverlayShared.variableTable(mockStatus, {});
    assert.equal(table['trivia.question'], 'Which console introduced the Super FX chip?');
    assert.equal(table['trivia.category'], 'Retro Gaming');
    assert.equal(table['trivia.phase'], 'reveal');
    assert.equal(table['trivia.number'], 3);
    assert.equal(table['trivia.total'], 10);
    assert.equal(table['trivia.answer'], 'SNES');
    assert.equal(table['trivia.funfact'], 'Star Fox was the first game powered by Super FX in 1993.');
    assert.equal(table['trivia.choice.1'], 'Mega Drive');
    assert.equal(table['trivia.choice.2'], 'SNES');
    assert.equal(table['trivia.choice.2.percent'], '79%');
    assert.equal(table['trivia.leader.name'], 'PixelValkyrie');
    assert.equal(table['trivia.leader.points'], 450);
    assert.equal(table['trivia.leader.correct'], 4);
    assert.equal(table['trivia.leader.accuracy'], '80%');
    assert.equal(table['trivia.leader.top3'], '#1 PixelValkyrie (450), #2 ArcadeKnight (300), #3 RetroSynth (200)');

    const expanded = OverlayShared.expandVariables('Q{{trivia.number}}/{{trivia.total}}: {{trivia.question}} Answer: {{trivia.answer}}', mockStatus);
    assert.equal(expanded, 'Q3/10: Which console introduced the Super FX chip? Answer: SNES');

    assert.ok(OverlayShared.hasTicking('{{trivia.timer}}'), 'Trivia timer must be recognized as ticking');
});

test('Placeholders: Tier List variable resolution and consensus', () => {
    const mockStatus = {
        tierList: {
            title: 'Retro Consoles Tier List',
            activeVote: {
                itemName: 'PlayStation 2',
                itemImage: '/images/ps2.png',
                status: 'ACTIVE',
                endsAt: Date.now() + 45000,
                consensus: {
                    consensusTier: { id: 'tier-god', label: 'God Tier', color: '#ff7f7f' },
                    agreementPercent: 84,
                    totalVotes: 120
                }
            }
        }
    };

    const table = OverlayShared.variableTable(mockStatus, {});
    assert.equal(table['tier_list.title'], 'Retro Consoles Tier List');
    assert.equal(table['tier_list.item'], 'PlayStation 2');
    assert.equal(table['tier_list.item_image'], '/images/ps2.png');
    assert.equal(table['tier_list.vote_status'], 'active');
    assert.equal(table['tier_list.consensus_tier'], 'God Tier');
    assert.equal(table['tier_list.consensus_percent'], '84%');
    assert.equal(table['tier_list.total_votes'], 120);

    const expanded = OverlayShared.expandVariables('Voting on {{tier_list.item}}: {{tier_list.consensus_tier}} ({{tier_list.consensus_percent}})', mockStatus);
    assert.equal(expanded, 'Voting on PlayStation 2: God Tier (84%)');

    assert.ok(OverlayShared.hasTicking('{{tier_list.vote_timer}}'), 'Tier list timer must be recognized as ticking');
});

test('Placeholders: Resilient handling of empty or missing status', () => {
    const table = OverlayShared.variableTable({}, {});
    assert.equal(table['matchup.title'], undefined);
    assert.equal(table['tournament.title'], undefined);
    assert.equal(table['trivia.phase'], undefined);
    assert.equal(table['tier_list.title'], undefined);

    const expanded = OverlayShared.expandVariables('Hello {{matchup.title}} {{tier_list.item}}', {});
    assert.equal(expanded, 'Hello  ');
});

test('Linked sets expose readable, live paths and list formatting', () => {
    const code = require('esbuild').buildSync({
        entryPoints: [path.join(__dirname, '../public/js/overlay/index.js')],
        bundle: true, format: 'iife', target: 'es2020', write: false
    }).outputFiles[0].text;
    const browser = {};
    new Function('window', code)(browser);
    const shared = browser.OverlayShared;
    const status = {
        variableSets: [
            { id: 'schedule', name: 'Schedule', slotsCount: 2, slots: ['session', ''], slotNames: ['Active event', 'Next'],
                fields: [{ key: 'player', label: 'Player 1', type: 'ref', targetSet: 'people' }, { key: 'items', label: 'Items', type: 'ref_list', targetSet: 'people' }, { key: 'tasks', label: 'Tasks', type: 'checklist', targetSet: 'people' }],
                roster: [{ id: 'session', label: 'Opening', values: { player: 'p1', items: ['p1', 'p2'], tasks: { p1: 1, p2: 2 } } }] },
            { id: 'people', name: 'People', slotsCount: 0, activeEntry: 'p1',
                fields: [{ key: 'name', label: 'Name', type: 'text' }, { key: 'team', label: 'Team', type: 'ref', targetSet: 'teams' }, { key: 'color', label: 'Color', type: 'color' }, { key: 'score', label: 'Score', type: 'number' }],
                roster: [{ id: 'p1', label: 'Alice', tiers: [{ level: 1 }, { level: 2 }, { level: 3 }], values: { name: 'Alice, A.', team: 't1', color: '#112233', score: '12' } }, { id: 'p2', label: 'Bob', tiers: [{ level: 1 }, { level: 2 }], values: { name: 'Bob', team: 't1', score: '7' } }, { id: 'p3', label: 'Disabled', enabled: false, values: { name: 'Hidden' } }] },
            { id: 'teams', name: 'Teams', fields: [{ key: 'name', label: 'Name', type: 'text' }], roster: [{ id: 't1', label: 'Red', values: { name: 'Red team' } }] }
        ],
        customVars: [{ name: 'schedule_1_items', value: '["p1","p2"]', type: 'text', setId: 'schedule' }, { name: 'schedule_items', value: '["p1","p2"]', type: 'text', setId: 'schedule' },
            { name: 'schedule_1_player_name', type: 'text', setId: 'schedule', value: 'stale' },
            { name: 'welcome', type: 'template', value: 'Next: {{var.schedule_1_player.field.name}}' },
            { name: 'roster_template', type: 'template', value: 'Roster: {{var.schedule_1_items|lines}}' }]
    };
    const original = JSON.stringify(status);
    const table = shared.variableTable(status);
    assert.equal(table['var.schedule_1_items'], 'Alice, A., Bob');
    assert.equal(table['var.schedule_items'], 'Alice, A., Bob');
    assert.equal(table['var.schedule_1_player.field.team.field.name'], 'Red team');
    assert.equal(table['var.schedule_1_player_name'], 'Alice, A.');
    assert.equal(table['var.schedule_1_items.count'], 2);
    assert.equal(table['var.schedule_1_tasks.progress'], '1/2');
    assert.equal(table['var.schedule_1_tasks.started'], 2);
    assert.equal(table['var.schedule_1_tasks.completed'], 1);
    assert.equal(table['var.schedule_2_items.count'], '');
    assert.equal(shared.expandVariables('{{var.schedule_1_items|lines}}', status), 'Alice, A.\nBob');
    assert.equal(shared.expandVariables('{{var.schedule_1_items.field.name|sep:\\s/\\s}}', status), 'Alice, A. / Bob');
    assert.equal(shared.expandVariables('{{var.schedule_1_player.field.score|number:0:comma::}}', status), '12');
    assert.equal(table['var.welcome'], 'Next: Alice, A.');
    assert.equal(shared.expandVariables('{{var.welcome}}', status), 'Next: Alice, A.');
    assert.equal(table['var.roster_template'], 'Roster: Alice, A.\nBob');
    assert.equal(shared.expandVariables('{{var.roster_template}}', status), 'Roster: Alice, A.\nBob');
    assert.equal(shared.expandVariables('{{var.schedule_2_player.field.score|number:0:comma::}}', status), '');
    const groups = shared.variableGroups(status);
    const entries = groups.flatMap(group => group.items);
    const item = entries.find(([key]) => key === 'var.schedule_1_player.field.name');
    assert.match(item[1], /Schedule → Slot 1 \/ Active event → Player 1 → Name/);
    assert.equal(item[2].preview, 'Alice, A.');
    assert.equal(entries.filter(([key]) => key === 'var.schedule_items').length, 0);
    assert.ok(!JSON.stringify(entries).includes('["p1","p2"]'));
    assert.equal(JSON.stringify(status), original, 'discovery and rendering do not mutate sets');
    status.variableSets[0].roster[0].values.player = 'missing-id';
    assert.equal(shared.expandVariables('{{var.schedule_1_player}}', status), '');
    assert.equal(shared.expandVariables('{{var.schedule_1_player.field.name}}', status), '');
    assert.equal(shared.expandVariables('{{var.schedule_1_player_name}}', status), '');
    status.variableSets[0].roster[0].values.player = 'p1';
    status.variableSets[1].roster[0].enabled = false;
    assert.equal(shared.expandVariables('{{var.schedule_1_player}}', status), '');
    assert.equal(shared.expandVariables('{{var.schedule_1_items}}', status), 'Bob');
    assert.equal(shared.expandVariables('{{var.schedule_1_tasks.progress}}', status), '1/1');
    status.variableSets[0].slots[0] = '';
    assert.equal(shared.expandVariables('{{var.schedule_1_items|lines}}', status), '');
    assert.equal(shared.expandVariables('{{var.schedule_1_tasks.progress}}', status), '');
    status.variableSets[0].slots[0] = 'session';
    status.variableSets[0].fields.find(field => field.key === 'items').targetSet = 'missing';
    assert.equal(shared.expandVariables('{{var.schedule_1_items}}', status), '');
    assert.equal(shared.expandVariables('{{var.schedule_1_items|lines}}', status), '');
    assert.equal(shared.expandVariables('{{var.schedule_1_items.count}}', status), '');
    status.variableSets.splice(1, 1);
    assert.equal(shared.expandVariables('{{var.schedule_1_player_name}}', status), '', 'missing target must not fall back to stale materialized values');
    status.modules = { variableSets: false };
    assert.equal(shared.expandVariables('{{var.schedule_1_items}}', status), '');
    assert.equal(shared.expandVariables('{{var.schedule_1_items|lines}}', status), '');
    assert.equal(shared.expandVariables('{{var.roster_template}}', status), 'Roster: ');
    delete status.modules;
    delete status.variableSets;
    assert.equal(shared.expandVariables('{{var.schedule_1_items}}', status), '');
    assert.equal(shared.expandVariables('{{var.schedule_1_items|lines}}', status), '');
});

test('Status avoids loading or publishing variable set rosters', () => {
    const { createStatusService } = require('../server/services/status');
    let reads = 0;
    for (const enabled of [true, false]) {
        const status = createStatusService({
            sessionsDir: __dirname, backupsDir: __dirname,
            getConfig: () => ({ variable_sets_enabled: enabled }),
            getVariablesStore: () => ({ list: () => [], listSets: () => { reads++; return []; } })
        }).buildStatusSnapshot();
        assert.equal(status.modules.variableSets, enabled);
        assert.equal(Object.hasOwn(status, 'variableSets'), false);
    }
    assert.equal(reads, 0);
});

test('Chatbot obtains live sets on demand without status roster payloads', async () => {
    const bundle = require('esbuild').buildSync({
        entryPoints: [path.join(__dirname, '../public/js/overlay/index.js')],
        bundle: true, format: 'iife', target: 'es2020', write: false
    }).outputFiles[0].text;
    const originalRead = fs.readFileSync, originalFetch = global.fetch;
    const bundlePath = path.join(__dirname, '../public/js/overlay-shared.js');
    fs.readFileSync = function (file, ...args) {
        return file === bundlePath ? bundle : originalRead.call(this, file, ...args);
    };
    let enabled = true, reads = 0;
    const sets = [
        { id: 'people', name: 'People', slotsCount: 2, slots: ['', 'owner'], fields: [{ key: 'items', label: 'Items', type: 'ref_list', targetSet: 'catalog' }], roster: [{ id: 'owner', label: 'Owner', values: { items: ['entry'] } }] },
        { id: 'catalog', fields: [{ key: 'name', label: 'Name', type: 'text' }], roster: [{ id: 'entry', label: 'Fictional', values: { name: 'Fictional' } }] }
    ];
    const raw = [{ name: 'people_2_items', type: 'text', setId: 'people', value: '["entry"]' },
        { name: 'roster', type: 'template', value: 'Roster: {{var.people_2_items|lines}}' }];
    global.fetch = async () => ({ ok: true, json: async () => ({ modules: { variableSets: enabled }, customVars: raw }) });
    try {
        const createChatbot = require('../server/services/chatbot');
        const bot = createChatbot({ dataDir: path.join(__dirname, 'nonexistent-chatbot-fixture'), variables: {
            listSets: () => { reads++; return sets; }, isModuleEnabled: () => enabled
        } });
        const call = () => new Promise(resolve => bot.handleApi({ method: 'GET' }, {
            writeHead() {}, end: body => resolve(JSON.parse(body))
        }, '/api/chatbot/placeholders', async () => '{}'));
        const preview = text => new Promise(resolve => bot.handleApi({ method: 'POST' }, {
            writeHead() {}, end: body => resolve(JSON.parse(body))
        }, '/api/chatbot/preview', async () => JSON.stringify({ text })));
        const first = await call();
        assert.equal(first['var.people_2_items'], 'Fictional');
        sets[1].roster[0].values.name = 'Updated';
        assert.equal((await call())['var.people_2_items'], 'Updated', 'cached status does not cache sets');
        assert.equal((await preview('{{var.roster}}')).text, 'Roster: Updated');
        assert.equal(reads, 3);
        enabled = false;
        const disabled = await call();
        assert.equal(disabled['var.people_2_items'], undefined);
        assert.equal(reads, 3, 'disabled sets are not read');
    } finally {
        fs.readFileSync = originalRead;
        global.fetch = originalFetch;
    }
});

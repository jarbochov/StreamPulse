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

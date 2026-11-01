'use strict';
/* global renderMultiMatchScoreboardGrid, renderTournamentStudio, competitiveFixture, selectMatchupQueue, stepMatchupQueue, loadMatchupPreset, restoreMatchupFromHistory, submitAddMatchupQueue, matchupSourceMode, renderMatchupStudio, activeMatchupData, stepMatchupScore, applyMatchupQuickChip, handleCreateTournament, activeTourneyData */

const test = require('node:test');
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer');
const { installCompetitiveFixture } = require('./competitive-browser-fixture.cjs');

const STUDIO_URL = 'http://competitive-fixture.test/tools/versus.html';
const exhibition = {
    id: 'fixture-exhibition', title: 'Harbor Exhibition', phase: 'Opening Set', details: 'Fictional fixture',
    format: 'points', bestOf: 0, targetScore: 0, roundsBestOf: 0, status: 'ACTIVE', competitorCount: 2,
    competitors: [{ id: 'harbor', name: 'Harbor Fox', score: 4, color: '#ef4444' }, { id: 'valley', name: 'Valley Owl', score: 2, color: '#3b82f6' }],
    presets: [], queue: [], activeQueueIndex: -1, clock: { enabled: false }
};
const tournament = {
    id: 'fixture-bracket', title: 'Comet Cup', format: 'single', status: 'IN_PROGRESS',
    scoringType: 'points', bestOf: 0, targetScore: 0, roundsBestOf: 3, activeMatchId: 'fixture-match',
    matches: [{
        id: 'fixture-match', round: 1, roundName: 'Opening Round', status: 'ACTIVE',
        bestOf: 0, targetScore: 0, roundsBestOf: 0,
        entrant1: { name: 'Nova Team', score: 4, rounds: 1 }, entrant2: { name: 'Comet Team', score: 2, rounds: 1 }
    }]
};

test('Versus Studio Free Points HUDs preserve unlimited scores and per-match rounds overrides', async () => {
    const browser = await puppeteer.launch({ headless: 'new', pipe: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    try {
        const page = await browser.newPage();
        await installCompetitiveFixture(page, { '/api/matchup': { matchup: exhibition }, '/api/tournament': { tournament } });
        await page.goto(STUDIO_URL, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => document.getElementById('t-entrant-1').textContent === 'Nova Team');
        assert.equal(await page.$eval('#t-score-plus-1', el => el.disabled), false);
        assert.equal(await page.$eval('#t-score-plus-2', el => el.disabled), false);
        assert.equal(await page.$eval('#t-score-input-1', el => el.hasAttribute('max')), false);
        assert.equal(await page.$eval('#tourney-series-label', el => el.textContent), 'Free Points');
        assert.equal(await page.$eval('#t-round-controls-1', el => el.style.display), 'none');
        assert.equal(await page.$eval('#matchup-rounds', el => el.value), '0');
        assert.equal(await page.$('button[onclick="stepMatchupRound(0, 1)"]'), null);
        assert.equal(await page.$eval('button[onclick="stepMatchupScore(0, 1)"]', el => el.disabled), false);

        await page.evaluate(t => renderMultiMatchScoreboardGrid(t, t.matches), tournament);
        assert.match(await page.$eval('#tourney-multi-match-grid', el => el.textContent), /Open/);
        assert.doesNotMatch(await page.$eval('#tourney-multi-match-grid', el => el.textContent), /FT2/);
        assert.equal(await page.$eval('button[onclick="stepMultiMatchScore(\'fixture-match\', 1, 1)"]', el => el.disabled), false);
        assert.equal(await page.$('button[onclick="stepMultiMatchRound(\'fixture-match\', 1, 1)"]'), null);

        await page.evaluate(t => {
            const match = { ...t.matches[0], roundsBestOf: 3, bestOf: 0, targetScore: 5 };
            renderTournamentStudio({ ...t, scoringType: 'firstTo', matches: [match] });
            renderMultiMatchScoreboardGrid(t, [match]);
        }, tournament);
        assert.match(await page.$eval('#tourney-series-label', el => el.textContent), /First to 5.*Bo3 Rounds/);
        assert.notEqual(await page.$('button[onclick="stepMultiMatchRound(\'fixture-match\', 1, 1)"]'), null);
        await page.evaluate(t => {
            const match = { ...t.matches[0], bestOf: 3, targetScore: 2, entrant1: { ...t.matches[0].entrant1, score: 2 } };
            renderTournamentStudio({ ...t, scoringType: 'bestOf', matches: [match] });
        }, tournament);
        assert.equal(await page.$eval('#t-score-plus-1', el => el.disabled), true, 'Bounded series still stop at their win target');
        assert.equal(await page.$eval('#t-score-plus-2', el => el.disabled), true);
    } finally {
        await browser.close();
    }
});

test('runner controls send explicit zero-based indexes for every runner', async () => {
    const browser = await puppeteer.launch({ headless: 'new', pipe: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    try {
        const page = await browser.newPage();
        const race = {
            ...exhibition, competitorCount: 4,
            competitors: ['Harbor Fox', 'Valley Owl', 'Comet Lynx', 'Nova Hare'].map((name, i) => ({
                id: `fictional-runner-${i}`, name, color: '#58a6ff', score: 0,
                timer: { elapsed: 12 + i, isRunning: true, finished: false }
            })),
            clock: { enabled: true, mode: 'race', elapsed: 15, isRunning: false }
        };
        const responses = { '/api/matchup': { matchup: race }, '/api/tournament': { tournament: null } };
        for (const action of ['finish', 'toggle', 'reset']) responses[`POST /api/matchup/clock/race/${action}`] = { status: 'ok', matchup: race };
        await installCompetitiveFixture(page, responses);
        await page.goto(STUDIO_URL, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('button[onclick="finishRunnerRace(3)"]');
        for (let index = 0; index < 4; index++) {
            for (const action of ['finish', 'toggle', 'reset']) {
                await page.$eval(`button[onclick="${action}RunnerRace(${index})"]`, el => el.click());
            }
        }
        const requests = await page.evaluate(() => competitiveFixture.requests.filter(r => /\/clock\/race\//.test(r.url)).map(r => ({ action: r.url.split('/').at(-1), body: JSON.parse(r.options.body) })));
        assert.deepEqual(requests, Array.from({ length: 4 }, (_, index) => ['finish', 'toggle', 'reset'].map(action => ({ action, body: { index } }))).flat());
    } finally {
        await browser.close();
    }
});

test('successful queue, preset, template and history loads select exhibition scoring; failures do not', async () => {
    const browser = await puppeteer.launch({ headless: 'new', pipe: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    try {
        const page = await browser.newPage();
        const queued = {
            ...exhibition, activeQueueIndex: 0,
            queue: [{ id: 'fictional-queue', title: exhibition.title, competitors: exhibition.competitors }]
        };
        const responses = { '/api/matchup': { matchup: exhibition }, '/api/tournament': { tournament }, 'POST /api/matchup/score': { status: 'ok', matchup: queued } };
        for (const endpoint of ['queue/select', 'queue/next', 'queue/prev', 'presets/load', 'history/restore', 'queue']) {
            responses[`POST /api/matchup/${endpoint}`] = { status: 'ok', matchup: queued };
        }
        await installCompetitiveFixture(page, responses);
        await page.goto(STUDIO_URL, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => document.getElementById('matchup-comp-name-0')?.value === 'Nova Team');
        const operations = [
            () => selectMatchupQueue('fictional-queue'),
            () => stepMatchupQueue(1),
            () => stepMatchupQueue(-1),
            () => loadMatchupPreset('fictional-preset'),
            () => restoreMatchupFromHistory('fictional-history'),
            () => {
                document.getElementById('queue-add-load-now').checked = true;
                return submitAddMatchupQueue();
            }
        ];
        for (const operation of operations) {
            await page.evaluate(() => {
                matchupSourceMode = 'tournament';
                renderMatchupStudio(activeMatchupData);
            });
            await page.evaluate(operation);
            assert.equal(await page.$eval('#matchup-title', el => el.value), exhibition.title);
            assert.equal(await page.$eval('#matchup-comp-name-0', el => el.value), 'Harbor Fox');
            assert.equal(await page.$eval('#matchup-tourney-banner', el => el.style.display), 'none');
            assert.equal(await page.$eval('.matchup-queue-item.active .matchup-queue-status', el => el.textContent), 'Live Now');
            await page.evaluate(() => stepMatchupScore(0, 1));
            assert.equal(await page.evaluate(() => competitiveFixture.requests.at(-1).url), '/api/matchup/score', 'Scores must target loaded exhibition, not bracket entrants');
        }
        await page.evaluate(() => {
            matchupSourceMode = 'tournament';
            renderMatchupStudio(activeMatchupData);
        });
        assert.equal(await page.$('.matchup-queue-item.active'), null, 'Queued exhibition is not Live Now while bracket controls are selected');

        await page.evaluate(async () => {
            const requestCount = competitiveFixture.requests.length;
            const load = applyMatchupQuickChip('mariokart-4p');
            competitiveFixture.requests[requestCount].respond({ status: 'ok', matchup: activeMatchupData });
            await load;
        });
        assert.equal(await page.$eval('#matchup-comp-name-0', el => el.value), 'Harbor Fox');
        assert.equal(await page.evaluate(() => matchupSourceMode), 'exhibition');

        await page.evaluate(async () => {
            matchupSourceMode = 'tournament';
            renderMatchupStudio(activeMatchupData);
            const count = competitiveFixture.requests.length;
            const load = applyMatchupQuickChip('mariokart-4p');
            competitiveFixture.requests[count].respond({ status: 'error', error: 'Fictional failure' });
            await load;
        });
        assert.equal(await page.evaluate(() => matchupSourceMode), 'tournament', 'Failed loads must not switch controls');
        assert.equal(await page.$eval('#matchup-comp-name-0', el => el.value), 'Nova Team');
    } finally {
        await browser.close();
    }
});

test('unsupported elimination sizes are rejected before POST without replacing the active bracket', async () => {
    const browser = await puppeteer.launch({ headless: 'new', pipe: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    try {
        const page = await browser.newPage();
        await installCompetitiveFixture(page, { '/api/matchup': { matchup: exhibition }, '/api/tournament': { tournament } });
        await page.goto(STUDIO_URL, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => document.getElementById('t-entrant-1').textContent === 'Nova Team');
        const result = await page.evaluate(async () => {
            const alerts = [];
            window.alert = value => alerts.push(value);
            for (const [format, count] of [['double', 17], ['single', 33]]) {
                document.getElementById('tourney-format').value = format;
                document.getElementById('tourney-entrants-text').value = Array.from({ length: count }, (_, i) => `Fictional Entrant ${i + 1}`).join('\n');
                await handleCreateTournament({ preventDefault() {} });
            }
            return { alerts, posts: competitiveFixture.requests.filter(r => r.url === '/api/tournament/create').length, activeId: activeTourneyData.id };
        });
        assert.match(result.alerts[0], /up to 16 entrants/);
        assert.match(result.alerts[1], /up to 32 entrants/);
        assert.equal(result.posts, 0);
        assert.equal(result.activeId, tournament.id);
        await page.evaluate(async () => {
            document.getElementById('tourney-format').value = 'double';
            document.getElementById('tourney-entrants-text').value = 'Harbor Fox\nValley Owl\nNova Hare';
            const count = competitiveFixture.requests.length;
            const create = handleCreateTournament({ preventDefault() {} });
            competitiveFixture.requests[count].respond({ status: 'error', error: 'Fictional server validation failure' });
            await create;
        });
        assert.equal(await page.$eval('#toast', el => el.textContent), 'Fictional server validation failure');
        assert.equal(await page.evaluate(() => activeTourneyData.id), tournament.id);
    } finally {
        await browser.close();
    }
});

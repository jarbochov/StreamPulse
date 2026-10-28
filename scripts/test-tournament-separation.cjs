'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const { createPollService } = require('../server/services/polls');

test('Tournaments: strict separation between versus and poll tournaments', async (t) => {
    const tmpDataDir = path.join(__dirname, `tmp-tourney-test-${Date.now()}`);
    fs.mkdirSync(tmpDataDir, { recursive: true });

    t.after(() => {
        try { fs.rmSync(tmpDataDir, { recursive: true, force: true }); } catch {}
    });

    const broadcasts = [];
    const pollService = createPollService({
        dataDir: tmpDataDir,
        broadcastToOverlays: (type, data) => {
            broadcasts.push({ type, data });
        }
    });

    // 1. Initial state: both are null
    assert.equal(pollService.getTournament({ isPoll: false }), null, 'Versus tournament should initially be null');
    assert.equal(pollService.getTournament({ isPoll: true }), null, 'Poll tournament should initially be null');

    // 2. Create Versus Tournament
    const versusTourney = pollService.createTournament({
        title: 'Versus Championship',
        format: 'single',
        entrants: ['Daigo', 'Tokido', 'Justin Wong', 'MenaRD'],
        scoringType: 'bestOf',
        bestOf: 3,
        targetScore: 2
    }, { isPoll: false });

    assert.ok(versusTourney, 'Versus tournament created');
    assert.equal(versusTourney.title, 'Versus Championship');
    assert.equal(pollService.getTournament({ isPoll: false })?.title, 'Versus Championship');
    assert.equal(pollService.getTournament({ isPoll: true }), null, 'Poll tournament must still be null after versus creation');

    const lastBroadcast1 = broadcasts[broadcasts.length - 1];
    assert.equal(lastBroadcast1.type, 'tournament-update', 'Versus creation broadcasts tournament-update');
    assert.equal(lastBroadcast1.data.title, 'Versus Championship');

    // 3. Create Poll Tournament
    const pollTourney = pollService.createTournament({
        title: 'Community RPG Vote',
        format: 'single',
        entrants: ['Chrono Trigger', 'EarthBound', 'Final Fantasy VI', 'Lufia II'],
        progressionMode: 'vote'
    }, { isPoll: true });

    assert.ok(pollTourney, 'Poll tournament created');
    assert.equal(pollTourney.title, 'Community RPG Vote');
    assert.equal(pollService.getTournament({ isPoll: true })?.title, 'Community RPG Vote');
    assert.equal(pollService.getTournament({ isPoll: false })?.title, 'Versus Championship', 'Versus tournament must remain unchanged');

    const lastBroadcast2 = broadcasts[broadcasts.length - 1];
    assert.equal(lastBroadcast2.type, 'poll-tournament-update', 'Poll creation broadcasts poll-tournament-update');
    assert.equal(lastBroadcast2.data.title, 'Community RPG Vote');

    // 4. Match ID isolation: both tournaments have match m_1_1
    const vMatch = versusTourney.matches.find(m => m.id === 'm_1_1');
    const pMatch = pollTourney.matches.find(m => m.id === 'm_1_1');
    assert.ok(vMatch && pMatch, 'Both tournaments contain match m_1_1');

    // Update score in Versus tournament ONLY
    pollService.updateMatchScore('m_1_1', { entrant: vMatch.entrant1.name, score: 2, isPoll: false });
    const updatedVersus = pollService.getTournament({ isPoll: false });
    const updatedPoll = pollService.getTournament({ isPoll: true });

    const updatedVMatch = updatedVersus.matches.find(m => m.id === 'm_1_1');
    const updatedPMatch = updatedPoll.matches.find(m => m.id === 'm_1_1');

    assert.equal(updatedVMatch.entrant1.score, 2, 'Versus match score updated to 2');
    assert.equal(updatedPMatch.entrant1.score, 0, 'Poll tournament match must NOT be mutated by versus update');

    // Advance match in Poll tournament ONLY
    pollService.advanceTournamentMatch('m_1_1', updatedPMatch.entrant1.name, { isPoll: true });
    const pollAfterAdv = pollService.getTournament({ isPoll: true });
    const versusAfterAdv = pollService.getTournament({ isPoll: false });

    assert.equal(pollAfterAdv.matches.find(m => m.id === 'm_1_1').status, 'COMPLETED', 'Poll match advanced to completed');
    assert.notEqual(versusAfterAdv.matches.find(m => m.id === 'm_1_1').status, 'COMPLETED', 'Versus match must NOT be advanced by poll call');

    // 5. Settings Isolation
    pollService.updateTournamentSettings({ title: 'New Versus Title' }, { isPoll: false });
    assert.equal(pollService.getTournament({ isPoll: false })?.title, 'New Versus Title');
    assert.equal(pollService.getTournament({ isPoll: true })?.title, 'Community RPG Vote', 'Poll tournament title must NOT change');

    // 6. Reset Isolation: reset versus tournament leaves poll tournament alive
    pollService.resetTournament({ isPoll: false });
    assert.equal(pollService.getTournament({ isPoll: false }), null, 'Versus tournament reset to null');
    assert.equal(pollService.getTournament({ isPoll: true })?.title, 'Community RPG Vote', 'Poll tournament must still be active after versus reset');

    // Reset poll tournament
    pollService.resetTournament({ isPoll: true });
    assert.equal(pollService.getTournament({ isPoll: true }), null, 'Poll tournament reset to null');
});

test('Overlays: /overlays/tournament.html and /overlays/poll-tournament.html structure', () => {
    const versusOverlayPath = path.resolve(__dirname, '../public/overlays/tournament.html');
    const pollOverlayPath = path.resolve(__dirname, '../public/overlays/poll-tournament.html');
    const cssPath = path.resolve(__dirname, '../public/css/tournament.css');
    const sharedJsPath = path.resolve(__dirname, '../public/js/tournament-shared.js');

    assert.ok(fs.existsSync(versusOverlayPath), 'tournament.html must exist');
    assert.ok(fs.existsSync(pollOverlayPath), 'poll-tournament.html must exist');
    assert.ok(fs.existsSync(cssPath), 'tournament.css must exist');
    assert.ok(fs.existsSync(sharedJsPath), 'tournament-shared.js must exist');

    const vContent = fs.readFileSync(versusOverlayPath, 'utf8');
    const pContent = fs.readFileSync(pollOverlayPath, 'utf8');

    assert.ok(vContent.includes('overlayType: \'versus\''), 'tournament.html configured for versus');
    assert.ok(vContent.includes('/css/tournament.css'), 'tournament.html references tournament.css');
    assert.ok(vContent.includes('/js/tournament-shared.js'), 'tournament.html references tournament-shared.js');

    assert.ok(pContent.includes('overlayType: \'poll\''), 'poll-tournament.html configured for poll');
    assert.ok(pContent.includes('/css/tournament.css'), 'poll-tournament.html references tournament.css');
    assert.ok(pContent.includes('/js/tournament-shared.js'), 'poll-tournament.html references tournament-shared.js');
});

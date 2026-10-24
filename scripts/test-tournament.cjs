'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { createPollService } = require('../server/services/polls.js');

function scoreAndAdvance(svc, id, o) {
    const r = svc.updateMatchScore(id, o);
    if (r.match.pendingWinner) svc.advanceTournamentMatch(id, r.match.pendingWinner);
    return r;
}

test('Poll Service: string payload parsing, up to 10 choices, presets, and tournaments', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'streampulse-poll-test-'));
    let lastTakeover = null;
    let lastAlert = null;
    let overlayMessages = [];

    const service = createPollService({
        dataDir: tmpDir,
        broadcastToOverlays: (type, data) => overlayMessages.push({ type, data }),
        onTakeover: (type, title, ms) => { lastTakeover = { type, title, ms }; },
        onAlert: (alert) => { lastAlert = alert; },
        log: () => {},
        error: () => {}
    });

    try {
        // 1. Test string payload parsing (resilience against unparsed JSON strings)
        const stringPayload = JSON.stringify({
            title: 'Which adventure next?',
            choices: ['Option 1', 'Option 2', 'Option 3', 'Option 4', 'Option 5', 'Option 6', 'Option 7'],
            duration: 600 // 10 minutes!
        });
        const poll = service.createPoll(stringPayload);
        assert.equal(poll.title, 'Which adventure next?');
        assert.equal(poll.choices.length, 7, 'Should allow 7 choices (up to 10)');
        assert.equal(poll.duration, 600, 'Should allow 10 min (600s)');
        assert.equal(poll.status, 'ACTIVE');

        // 2. Chat voting with numbers up to 7
        service.handleChatMessage({ user: 'Alice', message: '7' });
        let active = service.getActivePoll();
        assert.equal(active.totalVotes, 1);
        assert.equal(active.choices[6].votes, 1);

        // 3. Deduplication: user cannot vote twice
        const dupVote = service.handleChatMessage({ user: 'Alice', message: '1' });
        assert.equal(dupVote, false, 'Duplicate vote from Alice is rejected');
        active = service.getActivePoll();
        assert.equal(active.totalVotes, 1, 'Total votes should remain 1');

        // 4. Stopping / Cancelling active poll
        service.cancelPoll();
        assert.equal(service.getActivePoll(), null, 'Cancelled poll should clear activePoll');

        // 5. Presets (Templates) CRUD
        const preset = service.savePreset({
            title: 'Nightly Challenge',
            choices: ['Easy Mode', 'Hard Mode', 'Ultra Nightmare'],
            duration: 300,
            blind: true
        });
        assert.ok(preset.id);
        const presets = service.getPresets();
        assert.ok(presets.some(p => p.title === 'Nightly Challenge'));

        service.deletePreset(preset.id);
        assert.ok(!service.getPresets().some(p => p.id === preset.id));

        // 6. Tournament Bracket Generation: 4 entrants single elimination
        const tourney = service.createTournament({
            title: 'RPG Masters',
            format: 'single',
            entrants: ['Chrono Trigger', 'Final Fantasy VI', 'EarthBound', 'Secret of Mana'],
            matchDuration: 60
        });
        assert.equal(tourney.bracketSize, 4);
        assert.equal(tourney.matches.length, 3, '4 entrants should generate 3 matches (2 Semis + 1 Finals)');
        assert.equal(tourney.matches[0].roundName, 'Semifinals');
        assert.equal(tourney.matches[2].roundName, 'Grand Finals');

        // Entrants seeded properly
        assert.equal(tourney.matches[0].entrant1.name, 'Chrono Trigger');
        assert.equal(tourney.matches[0].entrant2.name, 'Secret of Mana');

        // Start Match 1
        const matchResult = service.startTournamentMatch(tourney.matches[0].id);
        assert.equal(matchResult.match.status, 'ACTIVE');
        assert.ok(service.getActivePoll(), 'Starting tournament match should launch active poll');

        // Vote in match
        service.handleChatMessage({ user: 'Bob', message: '1' }); // Votes for Chrono Trigger
        service.handleChatMessage({ user: 'Charlie', message: '1' });
        service.handleChatMessage({ user: 'Dave', message: '2' }); // Votes for Secret of Mana

        // Advance Match 1
        service.advanceTournamentMatch(tourney.matches[0].id, 'Chrono Trigger');
        assert.equal(tourney.matches[0].status, 'COMPLETED');
        assert.equal(tourney.matches[0].winner, 'Chrono Trigger');

        // Chrono Trigger should have advanced to Finals (match 3, slot 1)
        assert.equal(tourney.matches[2].entrant1.name, 'Chrono Trigger');

        // Start Match 2
        service.startTournamentMatch(tourney.matches[1].id);
        service.handleChatMessage({ user: 'Bob', message: '1' }); // FF VI
        service.advanceTournamentMatch(tourney.matches[1].id, 'Final Fantasy VI');

        // FF VI advances to Finals (match 3, slot 2)
        assert.equal(tourney.matches[2].entrant2.name, 'Final Fantasy VI');

        // Grand Finals
        service.startTournamentMatch(tourney.matches[2].id);
        service.advanceTournamentMatch(tourney.matches[2].id, 'Chrono Trigger');

        assert.equal(tourney.status, 'COMPLETED');
        assert.equal(tourney.champion, 'Chrono Trigger');
        assert.equal(lastAlert?.winner, 'Chrono Trigger');

        // 7. Double Elimination 4-entrant tournament
        const doubleTourney = service.createTournament({
            title: 'Double Trouble',
            format: 'double',
            entrants: ['A', 'B', 'C', 'D'],
            matchDuration: 60
        });
        assert.equal(doubleTourney.format, 'double');
        assert.ok(doubleTourney.matches.some(m => m.bracket === 'losers'));

    } finally {
        service.destroy();
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
});

test('Tournament Service: Variable bracket sizes, manual scoring, series best-of auto-advancement, and match controls', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'streampulse-tourney-test-'));
    let overlayMessages = [];
    let lastAlert = null;

    const service = createPollService({
        dataDir: tmpDir,
        broadcastToOverlays: (type, data) => overlayMessages.push({ type, data }),
        onAlert: (alert) => { lastAlert = alert; },
        log: () => {},
        error: () => {}
    });

    try {
        // 1. Bracket size scaling for 2 participants
        const t2 = service.createTournament({
            title: 'Head-to-Head Showdown',
            entrants: ['Player Alpha', 'Player Beta']
        });
        assert.equal(t2.bracketSize, 2);
        assert.equal(t2.roundCount, 1);
        assert.equal(t2.matches.length, 1);
        assert.equal(t2.matches[0].roundName, 'Grand Finals');

        // 2. Bracket size scaling for 3 participants (rounds up to 4 with 1 BYE)
        const t3 = service.createTournament({
            title: 'Tri-Force Clash',
            entrants: ['Link', 'Zelda', 'Ganon']
        });
        assert.equal(t3.bracketSize, 4);
        assert.equal(t3.roundCount, 2);
        // Link has BYE and auto-advances to Finals
        const t3Finals = t3.matches.find(m => m.round === 2);
        assert.equal(t3Finals.entrant1.name, 'Link', 'Seed 1 should auto-advance through BYE match');

        // 3. Bracket size scaling for 5 participants (rounds up to 8 with 3 BYEs)
        const t5 = service.createTournament({
            title: 'Five Champions',
            entrants: ['A', 'B', 'C', 'D', 'E']
        });
        assert.equal(t5.bracketSize, 8);
        assert.equal(t5.roundCount, 3);
        // Seeds 1, 2, 3 face BYE and auto-advance to Semifinals (Round 2)
        const t5Round2 = t5.matches.filter(m => m.round === 2);
        assert.ok(t5Round2.some(m => m.entrant1.name === 'A' || m.entrant2.name === 'A'));

        // 4. Bracket size scaling for 6 participants (rounds up to 8 with 2 BYEs)
        const t6 = service.createTournament({
            title: 'Hex Battle',
            entrants: ['1', '2', '3', '4', '5', '6']
        });
        assert.equal(t6.bracketSize, 8);
        assert.equal(t6.roundCount, 3);

        // 5. Manual Scored Tournament with Best-of-3 format
        const manualTourney = service.createTournament({
            title: 'FGC Championship',
            progressionMode: 'manual',
            scoringType: 'bestOf',
            bestOf: 3,
            entrants: ['Daigo', 'Justin Wong', 'Tokido', 'Punk']
        });
        assert.equal(manualTourney.progressionMode, 'manual');
        assert.equal(manualTourney.bestOf, 3);
        assert.equal(manualTourney.targetScore, 2, 'Best of 3 requires 2 wins');

        const m1 = manualTourney.matches[0];
        assert.equal(m1.entrant1.name, 'Daigo');
        assert.equal(m1.entrant2.name, 'Punk');

        // Score Game 1: Daigo wins (1 - 0)
        let res = service.updateMatchScore(m1.id, { entrant1Score: 1, entrant2Score: 0, matchDetails: 'Game 1' });
        assert.equal(res.autoAdvanced, false, 'Score 1 does not reach target 2 yet');
        assert.equal(res.match.status, 'ACTIVE');
        assert.equal(res.match.entrant1.score, 1);
        assert.equal(res.match.scores[0], 1);

        // Score Game 2: Daigo wins again (2 - 0) -> Target score 2 reached!
        res = service.updateMatchScore(m1.id, { entrant1Score: 2, entrant2Score: 0, matchDetails: 'Game 2 · Clean Sweep' });
        assert.equal(res.autoAdvanced, false, 'Reaching target does not auto-advance');
        assert.equal(res.match.pendingWinner, 'Daigo');
        assert.equal(res.match.status, 'ACTIVE');
        service.advanceTournamentMatch(m1.id, 'Daigo');
        assert.equal(res.match.status, 'COMPLETED');
        assert.equal(res.match.winner, 'Daigo');

        // Daigo should be placed in Grand Finals
        const finalsMatch = manualTourney.matches.find(m => m.roundName === 'Grand Finals');
        assert.equal(finalsMatch.entrant1.name, 'Daigo');

        // 6. Select Active Match
        const m2 = manualTourney.matches[1]; // Justin Wong vs Tokido
        const selRes = service.selectActiveMatch(m2.id);
        assert.equal(selRes.tournament.activeMatchId, m2.id);

        // Score Match 2
        service.updateMatchScore(m2.id, { entrant1Score: 1, entrant2Score: 2, matchDetails: 'Game 3 Decider' });
        assert.equal(m2.pendingWinner, 'Tokido');
        service.advanceTournamentMatch(m2.id, 'Tokido');
        assert.equal(m2.winner, 'Tokido');
        assert.equal(finalsMatch.entrant2.name, 'Tokido');

        // 7. Reset Match
        const resetRes = service.resetMatch(m2.id);
        assert.equal(resetRes.match.status, 'PENDING');
        assert.equal(resetRes.match.entrant1.score, 0);
        assert.equal(resetRes.match.winner, null);
        assert.equal(finalsMatch.entrant2.name, 'TBD', 'Resetting match clears downstream slot');

        // 8. Update Tournament Settings
        const settingsRes = service.updateTournamentSettings({
            title: 'FGC Championship 2026',
            bestOf: 5
        });
        assert.equal(settingsRes.title, 'FGC Championship 2026');
        assert.equal(settingsRes.bestOf, 5);
        assert.equal(settingsRes.targetScore, 3, 'Best of 5 requires 3 wins');

        // 9. Non-multiple of 2 (Odd count: 3 entrants) with BYE handling
        const tOdd3 = service.createTournament({
            title: 'Tri-Wizard Duel',
            entrants: ['Harry', 'Ron', 'Hermione'],
            format: 'single',
            bestOf: 3
        });
        assert.equal(tOdd3.entrantCount, 3);
        assert.equal(tOdd3.bracketSize, 4);
        assert.equal(tOdd3.matches[0].isBye, true, 'Match 1 should be flagged as BYE');
        assert.equal(tOdd3.matches[0].winner, 'Harry', 'Seed 1 (Harry) should auto-advance');
        assert.equal(tOdd3.activeMatchId, tOdd3.matches[1].id, 'Active match should default to first playable match (Ron vs Hermione)');
        assert.equal(tOdd3.matches[2].entrant1.name, 'Harry', 'Harry should already be waiting in Grand Finals');

        // Play Ron vs Hermione
        scoreAndAdvance(service, tOdd3.matches[1].id, { entrant1Score: 0, entrant2Score: 2 });
        assert.equal(tOdd3.matches[1].winner, 'Hermione');
        assert.equal(tOdd3.matches[2].entrant2.name, 'Hermione', 'Hermione advances to Finals against Harry');
        assert.equal(tOdd3.activeMatchId, tOdd3.matches[2].id, 'Active match should automatically flow to Grand Finals');

        // Play Grand Finals
        scoreAndAdvance(service, tOdd3.matches[2].id, { entrant1Score: 2, entrant2Score: 1 });
        assert.equal(tOdd3.status, 'COMPLETED');
        assert.equal(tOdd3.champion, 'Harry');

        // 10. Round Robin Format (Odd count: 3 entrants, all-play-all)
        const tRR = service.createTournament({
            title: 'Retro Trio Round Robin',
            entrants: ['Chrono Trigger', 'EarthBound', 'Final Fantasy VI'],
            format: 'roundRobin',
            bestOf: 3
        });
        assert.equal(tRR.format, 'roundRobin');
        assert.equal(tRR.matches.length, 3, '3 entrants round robin generates 3 pairwise matches');
        assert.equal(tRR.standings.length, 3);
        assert.equal(tRR.standings[0].name, 'Chrono Trigger');

        // Match 1: EarthBound vs Final Fantasy VI -> EarthBound wins
        scoreAndAdvance(service, tRR.matches[0].id, { entrant1Score: 2, entrant2Score: 0 });
        assert.equal(tRR.matches[0].winner, 'EarthBound');
        assert.equal(tRR.standings.find(s => s.name === 'EarthBound').won, 1);

        // Match 2: Chrono Trigger vs Final Fantasy VI -> Chrono Trigger wins
        scoreAndAdvance(service, tRR.matches[1].id, { entrant1Score: 2, entrant2Score: 1 });
        assert.equal(tRR.matches[1].winner, 'Chrono Trigger');

        // Match 3: Chrono Trigger vs EarthBound -> Chrono Trigger wins (2-0 overall)
        scoreAndAdvance(service, tRR.matches[2].id, { entrant1Score: 2, entrant2Score: 0 });
        assert.equal(tRR.matches[2].winner, 'Chrono Trigger');
        assert.equal(tRR.status, 'COMPLETED');
        assert.equal(tRR.champion, 'Chrono Trigger');
        assert.equal(tRR.standings[0].name, 'Chrono Trigger');
        assert.equal(tRR.standings[0].won, 2);

        // 11. Tournament History Archiving & Restoring
        const history = service.getTournamentHistory();
        assert.ok(history.length >= 1, 'Completed tournaments should be archived to tournamentHistory');
        const archivedRR = history.find(h => h.id === tRR.id);
        assert.ok(archivedRR, 'Round Robin tournament should be found in history');
        assert.equal(archivedRR.champion, 'Chrono Trigger');

        // Restore tournament from history
        const restored = service.restoreTournament(archivedRR.id);
        assert.equal(restored.title, 'Retro Trio Round Robin');
        assert.equal(restored.status, 'IN_PROGRESS');
        assert.ok(service.getTournament(), 'Restored tournament should become active tournament');

        // Delete history item
        service.deleteTournamentHistory(archivedRR.id);
        assert.equal(service.getTournamentHistory().find(h => h.id === archivedRR.id), undefined);

        // Clear history
        service.clearTournamentHistory();
        assert.equal(service.getTournamentHistory().length, 0);

        // 12. Tournament Presets Management
        const presets = service.getTournamentPresets();
        assert.ok(presets.length >= 5, 'Should include default tournament presets');
        const p8 = presets.find(p => p.id === 'tp-8p-single-bo3');
        assert.ok(p8);
        assert.equal(p8.entrants.length, 8);

        // Save custom tournament preset
        const customPreset = service.saveTournamentPreset({
            name: 'Custom 4-Player Invitational',
            title: 'Friday Night Fight Club',
            format: 'single',
            bestOf: 5,
            scoringType: 'bestOf',
            entrants: ['Player A', 'Player B', 'Player C', 'Player D']
        });
        assert.ok(customPreset.id);
        assert.ok(service.getTournamentPresets().some(p => p.id === customPreset.id));

        // Delete custom preset
        service.deleteTournamentPreset(customPreset.id);
        assert.equal(service.getTournamentPresets().find(p => p.id === customPreset.id), undefined);

        // 13. Tournament Rollback & Recursive Downstream Reset
        const tRoll = service.createTournament({
            title: 'Rollback Major',
            entrants: ['Daigo', 'Tokido', 'Justin', 'Punk'],
            format: 'single',
            bestOf: 3
        });
        assert.equal(tRoll.matches.length, 3);
        const rollM1 = tRoll.matches[0]; // Daigo vs Punk
        const rollM2 = tRoll.matches[1]; // Tokido vs Justin
        const rollFinals = tRoll.matches[2]; // Finals

        // Win M1 for Daigo
        scoreAndAdvance(service, rollM1.id, { entrant1Score: 2, entrant2Score: 0 });
        assert.equal(rollM1.winner, 'Daigo');
        assert.equal(rollFinals.entrant1.name, 'Daigo');

        // Win M2 for Tokido
        scoreAndAdvance(service, rollM2.id, { entrant1Score: 2, entrant2Score: 1 });
        assert.equal(rollM2.winner, 'Tokido');
        assert.equal(rollFinals.entrant2.name, 'Tokido');

        // Win Finals for Daigo -> tournament completes
        scoreAndAdvance(service, rollFinals.id, { entrant1Score: 2, entrant2Score: 0 });
        assert.equal(tRoll.status, 'COMPLETED');
        assert.equal(tRoll.champion, 'Daigo');

        // Broadcaster made a mistake on M1 (Punk actually won): Rollback M1!
        const rolledBack = service.rollbackTournamentMatch(rollM1.id);
        assert.ok(rolledBack);
        assert.equal(rollM1.status, 'ACTIVE');
        assert.equal(rollM1.winner, null, 'M1 winner should be cleared');
        assert.equal(rollM1.scores[0], 0, 'Scores reset to 0');
        assert.equal(rollM1.scores[1], 0);

        // Recursive Downstream Check:
        assert.equal(rollFinals.entrant1.name, 'TBD', 'Finals entrant 1 should cascade-revert to TBD');
        assert.equal(rollFinals.scores[0], 0, 'Finals score should be reset');
        assert.equal(rollFinals.winner, null, 'Finals winner should be cleared');
        assert.equal(rollFinals.status, 'PENDING', 'Finals should revert to PENDING status');
        assert.equal(tRoll.status, 'IN_PROGRESS', 'Tournament should no longer be COMPLETED');
        assert.equal(tRoll.champion, null, 'Champion should be cleared');

        // 14. In-Progress Tournament Checkpoints / Drafts
        const draft = service.saveTournamentDraft('Mid-tournament checkpoint');
        assert.ok(draft.id);
        assert.equal(draft.name, 'Mid-tournament checkpoint');
        assert.equal(draft.tournament.title, 'Rollback Major');

        const draftsList = service.getTournamentDrafts();
        assert.ok(draftsList.some(d => d.id === draft.id));

        // Advance M1 again with correct winner (Punk)
        scoreAndAdvance(service, rollM1.id, { entrant1Score: 0, entrant2Score: 2 });
        assert.equal(rollM1.winner, 'Punk');
        assert.equal(rollFinals.entrant1.name, 'Punk');

        // Restore checkpoint draft (where M1 was rolled back and P1/P2 were pending)
        const restoredTourney = service.restoreTournamentDraft(draft.id);
        assert.ok(restoredTourney);
        assert.equal(restoredTourney.matches[0].winner, null, 'Restored draft should match checkpoint state');
        assert.equal(restoredTourney.matches[2].entrant1.name, 'TBD');

        // Delete checkpoint draft
        const deleteSuccess = service.deleteTournamentDraft(draft.id);
        assert.equal(deleteSuccess.ok, true);
        assert.ok(!service.getTournamentDrafts().some(d => d.id === draft.id));

        // 15. Tournament Presets Management (Editing, Deleting, and isBuiltIn flags)
        const allPresets = service.getTournamentPresets();
        assert.ok(allPresets.length > 0, 'Should load default tournament presets');
        assert.equal(allPresets[0].isBuiltIn, true, 'Default preset should be flagged isBuiltIn');

        const newPreset = service.saveTournamentPreset({
            name: 'Speedrun Invitational',
            title: 'SGDQ Invitational',
            entrants: ['Runner A', 'Runner B', 'Runner C', 'Runner D'],
            format: 'single',
            bestOf: 3
        });
        assert.ok(newPreset.id);
        assert.equal(newPreset.name, 'Speedrun Invitational');
        assert.equal(newPreset.isCustom, true);

        // Update preset
        const updatedPreset = service.updateTournamentPreset(newPreset.id, {
            name: 'Speedrun Championship 2026',
            bestOf: 5
        });
        assert.equal(updatedPreset.name, 'Speedrun Championship 2026');
        assert.equal(updatedPreset.bestOf, 5);

        // Delete preset
        const delPresetRes = service.deleteTournamentPreset(newPreset.id);
        assert.equal(delPresetRes.ok, true);
        assert.ok(!service.getTournamentPresets().some(p => p.id === newPreset.id));
    } finally {
        service.destroy();
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
});

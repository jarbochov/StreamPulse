const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createMatchupService } = require('../server/services/matchup.js');

const TEST_DIR = path.join(__dirname, '..', '.test-matchup-data-' + Date.now());

function cleanup() {
  try {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  } catch {}
}

test('Matchup Service Unit Tests', async (t) => {
  fs.mkdirSync(TEST_DIR, { recursive: true });

  t.after(() => {
    cleanup();
  });

  await t.test('initializes with default 2-player state', () => {
    let broadcastCalls = [];
    const service = createMatchupService({
      dataDir: TEST_DIR,
      broadcastToOverlays: (msg) => broadcastCalls.push(msg)
    });

    const state = service.getMatchup();
    assert.equal(state.competitors.length, 2);
    assert.equal(state.competitors[0].id, 'c1');
    assert.equal(state.competitors[1].id, 'c2');
    assert.equal(state.format, 'bestOf');
    assert.equal(state.targetScore, 3);
    assert.equal(state.winner, null);
  });

  await t.test('updates matchup metadata and format', () => {
    const service = createMatchupService({
      dataDir: TEST_DIR
    });

    const updated = service.updateMatchup({
      title: 'EVO Grand Finals',
      phase: 'Grand Finals',
      details: 'Best of 5 · First to 3',
      format: 'bestOf',
      targetScore: 3
    });

    assert.equal(updated.title, 'EVO Grand Finals');
    assert.equal(updated.phase, 'Grand Finals');
    assert.equal(updated.format, 'bestOf');
    assert.equal(updated.targetScore, 3);
  });

  await t.test('scales competitor count up and down cleanly', () => {
    const service = createMatchupService({
      dataDir: TEST_DIR
    });

    // Expand to 3
    let res = service.setCompetitorCount(3);
    assert.equal(res.competitors.length, 3);
    assert.equal(res.competitors[2].id, 'c3');

    // Expand to 4
    res = service.setCompetitorCount(4);
    assert.equal(res.competitors.length, 4);
    assert.equal(res.competitors[3].id, 'c4');

    // Shrink back to 2
    res = service.setCompetitorCount(2);
    assert.equal(res.competitors.length, 2);
    assert.equal(res.competitors[0].id, 'c1');
    assert.equal(res.competitors[1].id, 'c2');
  });

  await t.test('updates individual competitor details', () => {
    const service = createMatchupService({
      dataDir: TEST_DIR
    });

    const res = service.updateCompetitor('c1', {
      name: 'Daigo',
      tag: 'Ryu',
      color: '#e5534b'
    });

    assert.equal(res.competitors[0].name, 'Daigo');
    assert.equal(res.competitors[0].tag, 'Ryu');
    assert.equal(res.competitors[0].color, '#e5534b');
  });

  await t.test('adjusts score by delta and absolute value, clamping at 0', () => {
    const service = createMatchupService({
      dataDir: TEST_DIR
    });

    // Increment
    let res = service.setCompetitorScore('c1', { delta: 1 });
    assert.equal(res.competitors[0].score, 1);

    // Increment again
    res = service.setCompetitorScore('c1', { delta: 1 });
    assert.equal(res.competitors[0].score, 2);

    // Decrement
    res = service.setCompetitorScore('c1', { delta: -1 });
    assert.equal(res.competitors[0].score, 1);

    // Absolute
    res = service.setCompetitorScore('c1', { score: 5 });
    assert.equal(res.competitors[0].score, 5);

    // Decrement below 0 clamps to 0
    res = service.setCompetitorScore('c1', { score: 0 });
    res = service.setCompetitorScore('c1', { delta: -1 });
    assert.equal(res.competitors[0].score, 0);
  });

  await t.test('detects set winner in best-of format and triggers alert', () => {
    let alertFired = null;
    const service = createMatchupService({
      dataDir: TEST_DIR,
      onAlert: (alert) => {
        alertFired = alert;
      }
    });

    service.updateMatchup({
      format: 'bestOf',
      bestOf: 3 // targetScore 2
    });
    service.resetScores();

    // c2 scores 1
    let res = service.setCompetitorScore('c2', { delta: 1 });
    assert.equal(res.winner, null);
    assert.equal(alertFired, null);

    // c2 scores 2 -> reaches targetScore 2
    res = service.setCompetitorScore('c2', { delta: 1 });
    assert.ok(res.winner);
    assert.equal(res.winner, res.competitors[1].name);
    assert.ok(alertFired);
    assert.equal(alertFired.type, 'poll_end');
    assert.equal(alertFired.winner, res.competitors[1].name);
  });

  await t.test('swaps sides (P1 ⇄ P2) accurately', () => {
    const service = createMatchupService({
      dataDir: TEST_DIR
    });

    service.updateCompetitor('c1', { name: 'Player One', tag: 'Alpha', color: '#111111' });
    service.setCompetitorScore('c1', { score: 4 });
    service.updateCompetitor('c2', { name: 'Player Two', tag: 'Beta', color: '#222222' });
    service.setCompetitorScore('c2', { score: 1 });

    const swapped = service.swapSides();
    assert.equal(swapped.competitors[0].name, 'Player Two');
    assert.equal(swapped.competitors[0].tag, 'Beta');
    assert.equal(swapped.competitors[0].color, '#222222');
    assert.equal(swapped.competitors[0].score, 1);

    assert.equal(swapped.competitors[1].name, 'Player One');
    assert.equal(swapped.competitors[1].tag, 'Alpha');
    assert.equal(swapped.competitors[1].color, '#111111');
    assert.equal(swapped.competitors[1].score, 4);
  });

  await t.test('resets scores to 0 while preserving names and colors', () => {
    const service = createMatchupService({
      dataDir: TEST_DIR
    });

    service.updateCompetitor('c1', { name: 'CustomChamp', color: '#ff00aa' });
    service.setCompetitorScore('c1', { score: 5 });

    const res = service.resetScores();
    assert.equal(res.competitors[0].name, 'CustomChamp');
    assert.equal(res.competitors[0].color, '#ff00aa');
    assert.equal(res.competitors[0].score, 0);
    assert.equal(res.winner, null);
  });

  await t.test('manages Matchup Queue / Fight Card and advances through matches', () => {
    const service = createMatchupService({
      dataDir: TEST_DIR
    });

    service.addToQueue({
      title: 'Fight Night Exhibition 1',
      phase: 'Undercard',
      details: 'FT3',
      format: 'firstTo',
      targetScore: 3,
      competitors: [
        { name: 'Ryu Master', tag: 'Ryu', score: 0 },
        { name: 'Ken Legend', tag: 'Ken', score: 0 }
      ]
    });

    service.addToQueue({
      title: 'Fight Night Main Event',
      phase: 'Grand Finals',
      details: 'FT5',
      format: 'firstTo',
      targetScore: 5,
      competitors: [
        { name: 'Daigo', tag: 'Guile', score: 0 },
        { name: 'Justin Wong', tag: 'Chun-Li', score: 0 }
      ]
    });

    const q = service.getQueue();
    assert.equal(q.queue.length, 2);

    // Select first match in fight card
    const m1 = service.selectQueueMatch(0);
    assert.equal(m1.title, 'Fight Night Exhibition 1');
    assert.equal(m1.competitors[0].name, 'Ryu Master');
    assert.equal(m1.targetScore, 3);

    // Score match
    service.setCompetitorScore('c1', { score: 3 });
    assert.ok(m1.winner);

    // Advance to next match in queue (Fight Night Main Event)
    const m2 = service.nextQueueMatch();
    assert.equal(m2.title, 'Fight Night Main Event');
    assert.equal(m2.competitors[0].name, 'Daigo');
    assert.equal(m2.competitors[1].name, 'Justin Wong');
    assert.equal(m2.targetScore, 5);
    assert.equal(m2.winner, null);

    // Prev match
    const backToM1 = service.prevQueueMatch();
    assert.equal(backToM1.title, 'Fight Night Exhibition 1');
  });

  await t.test('preserves competitor names and tags when adding nested match object to queue', () => {
    const service = createMatchupService({ dataDir: TEST_DIR });
    service.setQueue([]);

    // Simulate exact payload from Studio Add Match form: { match: { ... }, loadImmediately: true }
    service.addToQueue({
      match: {
        title: 'Street Fighter 6 Showcase',
        phase: 'Exhibition Set',
        details: 'First to 10',
        format: 'firstTo',
        targetScore: 10,
        competitors: [
          { name: 'Tokido', tag: 'Luke', score: 0 },
          { name: 'MenaRD', tag: 'Blanka', score: 0 }
        ]
      },
      loadImmediately: true
    });

    const active = service.getMatchup();
    assert.equal(active.title, 'Street Fighter 6 Showcase');
    assert.equal(active.competitors[0].name, 'Tokido');
    assert.equal(active.competitors[0].tag, 'Luke');
    assert.equal(active.competitors[1].name, 'MenaRD');
    assert.equal(active.competitors[1].tag, 'Blanka');
    assert.equal(active.targetScore, 10);

    const q = service.getQueue();
    assert.equal(q.queue.length, 1);
    assert.equal(q.queue[0].competitors[0].name, 'Tokido');
    assert.equal(q.queue[0].competitors[1].name, 'MenaRD');
  });

  await t.test('manages custom matchup presets and applies them', () => {
    const service = createMatchupService({ dataDir: TEST_DIR });
    const initialPresets = service.getPresets();
    assert.ok(initialPresets.length >= 4);

    // Save a new preset
    service.savePreset({
      id: 'preset-guilty-gear',
      name: 'Guilty Gear Strive — FT3 Set',
      title: 'Guilty Gear Strive',
      phase: 'Winners Finals',
      details: 'Best of 5',
      format: 'bestOf',
      bestOf: 5,
      targetScore: 3,
      competitors: [
        { name: 'Leffen', tag: 'Happy Chaos', color: '#3b82f6' },
        { name: 'SonicFox', tag: 'Leo', color: '#10b981' }
      ]
    });

    const updatedPresets = service.getPresets();
    const ggPreset = updatedPresets.find(p => p.id === 'preset-guilty-gear');
    assert.ok(ggPreset);
    assert.equal(ggPreset.name, 'Guilty Gear Strive — FT3 Set');

    // Load the preset
    const loadedMatchup = service.loadPreset('preset-guilty-gear');
    assert.equal(loadedMatchup.title, 'Guilty Gear Strive');
    assert.equal(loadedMatchup.competitors[0].name, 'Leffen');
    assert.equal(loadedMatchup.competitors[0].tag, 'Happy Chaos');
    assert.equal(loadedMatchup.competitors[1].name, 'SonicFox');
    assert.equal(loadedMatchup.competitors[1].tag, 'Leo');
    assert.equal(loadedMatchup.competitors[0].score, 0);

    // Delete preset
    const remaining = service.deletePreset('preset-guilty-gear');
    assert.equal(remaining.find(p => p.id === 'preset-guilty-gear'), undefined);
  });

  await t.test('records history on set completion and allows restoring, deleting, and clearing history', () => {
    const service = createMatchupService({ dataDir: TEST_DIR });
    service.updateMatchup({
      title: 'Tekken 8 Clash',
      phase: 'Grand Finals',
      format: 'bestOf',
      bestOf: 3,
      targetScore: 2,
      competitors: [
        { name: 'Arslan Ash', tag: 'Nina', score: 1 },
        { name: 'Knee', tag: 'Bryan', score: 1 }
      ]
    });

    // Score winning point for Knee
    service.updateScore(1, { score: 2 });
    const state = service.getMatchup();
    assert.equal(state.status, 'COMPLETED');
    assert.equal(state.winner, 'Knee');

    // Verify history recorded
    const history = service.getHistory();
    assert.ok(history.length >= 1);
    const lastItem = history[0];
    assert.equal(lastItem.winner, 'Knee');
    assert.equal(lastItem.title, 'Tekken 8 Clash');

    // Restore history item to live scoreboard
    const restored = service.restoreHistoryItem(lastItem.id);
    assert.equal(restored.title, 'Tekken 8 Clash');
    assert.equal(restored.competitors[1].name, 'Knee');
    assert.equal(restored.status, 'ACTIVE');

    // Delete single history item
    const afterDelete = service.deleteHistoryItem(lastItem.id);
    assert.equal(afterDelete.find(h => h.id === lastItem.id), undefined);

    // Clear history
    service.clearHistory();
    assert.equal(service.getHistory().length, 0);
  });

  await t.test('manages match clock (countdown, stopwatch, reset, auto-pause on win)', () => {
    const service = createMatchupService({
      dataDir: TEST_DIR
    });

    const initialClock = service.getMatchup().clock;
    assert.ok(initialClock);
    assert.equal(initialClock.mode, 'countdown');
    assert.equal(initialClock.remaining, 99);
    assert.equal(initialClock.isRunning, false);

    // Start clock
    let clock = service.startClock();
    assert.equal(clock.isRunning, true);

    // Pause clock
    clock = service.pauseClock();
    assert.equal(clock.isRunning, false);

    // Reset clock to 60s
    clock = service.resetClock(60);
    assert.equal(clock.remaining, 60);
    assert.equal(clock.duration, 60);
    assert.equal(clock.elapsed, 0);

    // Switch to stopwatch mode with speedrun estimate
    clock = service.setClockMode({ mode: 'stopwatch', estimate: '45:00' });
    assert.equal(clock.mode, 'stopwatch');
    assert.equal(clock.estimate, '45:00');

    // Auto-pause when match completes:
    service.updateMatchup({
      format: 'bestOf',
      bestOf: 3,
      targetScore: 2,
      competitors: [
        { name: 'Runner A', score: 1 },
        { name: 'Runner B', score: 0 }
      ]
    });
    service.startClock();
    assert.equal(service.getMatchup().clock.isRunning, true);

    // Award winning point to Runner A (reaches target 2)
    service.updateScore(0, { score: 2 });
    assert.equal(service.getMatchup().status, 'COMPLETED');
    assert.equal(service.getMatchup().clock.isRunning, false, 'Clock should auto-pause when set completes');
  });

  await t.test('manages GDQ-style Speedrun Battle race clocks with multi-runner splits and deltas', () => {
    const service = createMatchupService({
      dataDir: TEST_DIR
    });

    service.updateMatchup({
      competitors: [
        { name: 'Runner 1', tag: 'Mario' },
        { name: 'Runner 2', tag: 'Luigi' }
      ]
    });

    // Set estimate
    const clock = service.setTargetEstimate('35:00');
    assert.equal(clock.estimate, '35:00');

    // Start all runners in sync
    const started = service.startAllRace();
    assert.equal(started.clock.isRunning, true);
    assert.equal(started.competitors[0].timer.isRunning, true);
    assert.equal(started.competitors[1].timer.isRunning, true);

    // Simulate elapsed time on runner 1 and finish
    started.competitors[0].timer.elapsed = 120500; // 2m 0.5s
    const mAfterFinish1 = service.finishCompetitorRace(0);
    assert.equal(mAfterFinish1.competitors[0].timer.finished, true);
    assert.equal(mAfterFinish1.competitors[0].timer.isRunning, false);
    assert.equal(mAfterFinish1.competitors[0].timer.delta, 'WINNER');

    // Runner 2 finishes 1.5s later
    mAfterFinish1.competitors[1].timer.elapsed = 122000;
    const mAfterFinish2 = service.finishCompetitorRace(1);
    assert.equal(mAfterFinish2.competitors[1].timer.finished, true);
    assert.equal(mAfterFinish2.competitors[1].timer.isRunning, false);
    assert.ok(mAfterFinish2.competitors[1].timer.delta.startsWith('+'));
    assert.equal(mAfterFinish2.clock.isRunning, false, 'Clock should stop when all runners have finished');

    // Reset competitor 2
    service.resetCompetitorRace(1);
    assert.equal(service.getMatchup().competitors[1].timer.finished, false);
    assert.equal(service.getMatchup().competitors[1].timer.elapsed, 0);

    // Reset all
    service.resetAllRace();
    assert.equal(service.getMatchup().clock.elapsed, 0);
    assert.equal(service.getMatchup().clock.isRunning, false);
    assert.equal(service.getMatchup().competitors[0].timer.finished, false);
    assert.equal(service.getMatchup().competitors[1].timer.finished, false);
  });
});

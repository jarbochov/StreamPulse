'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { createAlertEngine } = require('../server/services/alerts');

function createTempAlertEngine(customConfig = {}) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-alert-fsm-'));
    const config = {
        settings: { enabled: true, gapSeconds: 0, queueCap: 50 },
        rules: [
            {
                id: 'follow-rule',
                name: 'Follow Alert',
                enabled: true,
                trigger: 'follow',
                duration: 2,
                variants: [{ id: 'v1', title: 'New follower: {{alert.user}}', weight: 1 }]
            },
            {
                id: 'sub-rule',
                name: 'Sub Alert',
                enabled: true,
                trigger: 'sub',
                duration: 2,
                variants: [{ id: 'v2', title: 'New sub: {{alert.user}}', weight: 1 }]
            }
        ],
        ...customConfig
    };
    fs.writeFileSync(path.join(tmp, 'alerts.json'), JSON.stringify(config));
    const engine = createAlertEngine({ dataDir: tmp });
    return {
        engine,
        cleanup: () => {
            try {
                engine.stop();
                fs.rmSync(tmp, { recursive: true, force: true });
            } catch {}
        }
    };
}

test('Alert Engine State Machine: initializes in IDLE state with full introspection', () => {
    const { engine, cleanup } = createTempAlertEngine();
    try {
        const qState = engine.getQueueState();
        assert.equal(qState.state, 'IDLE');
        assert.ok(qState.machine);
        assert.equal(qState.machine.id, 'alert-engine');
        assert.equal(qState.machine.state, 'IDLE');
        assert.ok(Array.isArray(qState.machine.validTransitions));
        assert.ok(qState.machine.validTransitions.includes('ENQUEUE'));
        assert.ok(qState.machine.validTransitions.includes('PAUSE'));
        assert.ok(qState.machine.validTransitions.includes('MUTE'));

        const machine = engine.getStateMachine();
        assert.ok(machine);
        assert.equal(machine.getState(), 'IDLE');
        assert.equal(machine.can('ENQUEUE'), true);
        assert.equal(machine.can('PAUSE'), true);
        assert.equal(machine.can('MUTE'), true);
    } finally {
        cleanup();
    }
});

test('Alert Engine State Machine: transitions through PLAYING and IDLE', () => {
    const { engine, cleanup } = createTempAlertEngine();
    try {
        // Enqueue alert: with empty queue and unpaused, it immediately plays
        engine.handleEvent({ type: 'follow', user: 'CoolViewer', dedupeMs: 0 });

        const playingState = engine.getQueueState();
        assert.equal(playingState.state, 'PLAYING');
        assert.ok(playingState.current);
        assert.equal(playingState.current.user, 'CoolViewer');
        assert.equal(playingState.machine.state, 'PLAYING');
        assert.ok(playingState.machine.validTransitions.includes('SKIP'));
        assert.ok(playingState.machine.validTransitions.includes('PAUSE'));
        assert.ok(playingState.machine.validTransitions.includes('CLEAR'));

        // Skip current alert
        engine.control('skip');
        const afterSkip = engine.getQueueState();
        assert.equal(afterSkip.state, 'IDLE');
        assert.equal(afterSkip.current, null);
    } finally {
        cleanup();
    }
});

test('Alert Engine State Machine: PAUSED and MUTED state transitions and guards', () => {
    const { engine, cleanup } = createTempAlertEngine();
    try {
        // Pause before alerts arrive
        engine.control('pause');
        assert.equal(engine.getQueueState().state, 'PAUSED');
        assert.equal(engine.getQueueState().paused, true);
        assert.ok(engine.getQueueState().machine.validTransitions.includes('RESUME_TO_IDLE'));

        // Enqueue while paused: stays PAUSED with pending > 0
        engine.handleEvent({ type: 'follow', user: 'PausedViewer', dedupeMs: 0 });
        const pausedQueue = engine.getQueueState();
        assert.equal(pausedQueue.state, 'PAUSED');
        assert.equal(pausedQueue.pending, 1);
        assert.equal(pausedQueue.current, null);
        assert.ok(pausedQueue.machine.validTransitions.includes('RESUME_TO_QUEUED'));

        // Resume: queue pops and transitions to PLAYING
        engine.control('resume');
        const resumed = engine.getQueueState();
        assert.equal(resumed.state, 'PLAYING');
        assert.ok(resumed.current);
        assert.equal(resumed.current.user, 'PausedViewer');

        // Mute
        engine.setMuted(true);
        assert.equal(engine.getQueueState().state, 'MUTED');
        assert.equal(engine.getQueueState().muted, true);

        // Unmute
        engine.setMuted(false);
        assert.equal(engine.getQueueState().muted, false);
    } finally {
        cleanup();
    }
});

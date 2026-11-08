'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createStateMachine } = require('../server/services/state-machine');

test('StateMachine: initialization and basic states', () => {
    const machine = createStateMachine({
        id: 'test-machine',
        initial: 'IDLE',
        states: {
            IDLE: {
                on: { START: 'RUNNING' }
            },
            RUNNING: {
                on: { STOP: 'IDLE' }
            }
        }
    });

    assert.equal(machine.getState(), 'IDLE');
    assert.deepEqual(machine.getValidTransitions(), ['START']);
    assert.equal(machine.can('START'), true);
    assert.equal(machine.can('STOP'), false);
    assert.equal(machine.matches('IDLE'), true);
    assert.equal(machine.matches('RUNNING'), false);
});

test('StateMachine: transitions, entry/exit hooks, actions', () => {
    const log = [];
    const machine = createStateMachine({
        id: 'lifecycle-machine',
        initial: 'IDLE',
        context: { count: 0 },
        states: {
            IDLE: {
                onExit: (ctx) => log.push(`exit-idle:${ctx.count}`),
                on: {
                    RUN: {
                        target: 'RUNNING',
                        action: (ctx, event) => {
                            ctx.count += event.payload?.amount || 1;
                            log.push(`action-run:${ctx.count}`);
                        }
                    }
                }
            },
            RUNNING: {
                onEntry: (ctx) => log.push(`entry-running:${ctx.count}`),
                on: {
                    PAUSE: 'PAUSED'
                }
            },
            PAUSED: {
                on: {
                    RESUME: 'RUNNING'
                }
            }
        }
    });

    const res = machine.send('RUN', { amount: 5 });
    assert.equal(res.transitioned, true);
    assert.equal(machine.getState(), 'RUNNING');
    assert.equal(machine.getContext().count, 5);
    assert.deepEqual(log, ['action-run:5', 'exit-idle:5', 'entry-running:5']);
});

test('StateMachine: guards reject invalid transitions without state change', () => {
    const machine = createStateMachine({
        id: 'guarded-machine',
        initial: 'IDLE',
        context: { isUnlocked: false },
        states: {
            IDLE: {
                on: {
                    UNLOCK: {
                        target: 'READY',
                        guard: (ctx) => ctx.isUnlocked
                    }
                }
            },
            READY: {}
        }
    });

    assert.equal(machine.can('UNLOCK'), false);
    const result = machine.send('UNLOCK');
    assert.equal(result.transitioned, false);
    assert.equal(machine.getState(), 'IDLE');

    machine.getContext().isUnlocked = true;
    assert.equal(machine.can('UNLOCK'), true);
    const success = machine.send('UNLOCK');
    assert.equal(success.transitioned, true);
    assert.equal(machine.getState(), 'READY');
});

test('StateMachine: subscriptions and snapshots for agent introspection', () => {
    const emitted = [];
    const machine = createStateMachine({
        id: 'agent-machine',
        initial: 'IDLE',
        states: {
            IDLE: { on: { TRIGGER: 'ACTIVE' } },
            ACTIVE: { on: { RESET: 'IDLE' } }
        }
    });

    const unsub = machine.subscribe((record) => {
        emitted.push(record);
    });

    machine.send('TRIGGER', { source: 'unit-test' });
    assert.equal(emitted.length, 1);
    assert.equal(emitted[0].from, 'IDLE');
    assert.equal(emitted[0].to, 'ACTIVE');
    assert.equal(emitted[0].event, 'TRIGGER');
    assert.deepEqual(emitted[0].validTransitions, ['RESET']);

    const snapshot = machine.toSnapshot();
    assert.equal(snapshot.id, 'agent-machine');
    assert.equal(snapshot.state, 'ACTIVE');
    assert.deepEqual(snapshot.validTransitions, ['RESET']);

    unsub();
    machine.send('RESET');
    assert.equal(emitted.length, 1); // unsubscribed
    assert.equal(machine.getState(), 'IDLE');
});

'use strict';
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { isDeepStrictEqual } = require('util');

const TEXT_FIELDS = new Set(['user', 'recipient', 'tier', 'tierLabel', 'message']);
const NUMBER_FIELDS = new Set(['months', 'streak', 'count', 'amount']);
const clone = value => JSON.parse(JSON.stringify(value));
function fail(message, status = 400) {
    throw Object.assign(new Error(message), { status });
}

function correctAlertHistory({ dataDir, events, rules, reason, corrections, dryRun = false }) {
    if (typeof reason !== 'string' || !reason.trim() || reason.length > 500) fail('A correction reason is required (maximum 500 characters)');
    if (!Array.isArray(corrections) || !corrections.length || corrections.length > 50) fail('Provide between 1 and 50 corrections');
    if (typeof dryRun !== 'boolean') fail('dryRun must be a boolean');
    const originals = new Map(events.map(entry => [entry.id, entry]));
    const changed = new Map();
    const at = new Date().toISOString();
    for (const change of corrections) {
        if (!change || typeof change !== 'object' || Array.isArray(change)) fail('Each correction must be an object');
        const entry = originals.get(change.id);
        if (!entry) fail('An event to correct was not found', 404);
        if (changed.has(change.id)) fail('An event can only appear once per correction');
        if (!isDeepStrictEqual(change.expected, clone(entry))) fail('Event changed; reload history before correcting it', 409);
        if ((entry.revisions || []).length >= 10) fail('Event correction limit reached');
        if (!change.event || typeof change.event !== 'object' || Array.isArray(change.event)) fail('event must contain corrected fields');
        const event = { ...entry.event };
        for (const [key, value] of Object.entries(change.event)) {
            if (TEXT_FIELDS.has(key)) {
                if (typeof value !== 'string' || value.length > 2000) fail(`Invalid corrected ${key}`);
            } else if (NUMBER_FIELDS.has(key)) {
                if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) fail(`Invalid corrected ${key}`);
            } else fail(`Cannot correct event field "${key}"`);
            event[key] = value;
        }
        if (typeof change.title !== 'string' || change.title.length > 2000) fail('A corrected title is required (maximum 2000 characters)');
        const rule = rules.find(item => item.id === change.ruleId);
        if (!rule || (rule.trigger !== event.type && !(rule.trigger === 'milestone' && event.type === 'resub'))) fail('Corrected rule must exist and match the event type');
        if (change.duplicateOf !== null && (typeof change.duplicateOf !== 'string' || !change.duplicateOf)) fail('duplicateOf must be an event ID or null');
        const { revisions, ...original } = clone(entry);
        changed.set(entry.id, {
            ...entry, event, title: change.title, ruleId: rule.id, ruleName: rule.name,
            status: change.duplicateOf ? 'duplicate' : 'corrected',
            duplicateOf: change.duplicateOf,
            revisions: [...(revisions || []), { at, reason: reason.trim(), original }]
        });
    }
    const next = events.map(entry => changed.get(entry.id) || entry);
    for (const entry of next) {
        if (!entry.duplicateOf || (!changed.has(entry.id) && !changed.has(entry.duplicateOf))) continue;
        const target = changed.get(entry.duplicateOf) || originals.get(entry.duplicateOf);
        if (!target || target.id === entry.id || target.duplicateOf || target.status === 'duplicate'
            || target.event.type !== entry.event.type
            || String(target.event.user).toLowerCase() !== String(entry.event.user).toLowerCase()) {
            fail('Duplicate must reference a different canonical event for the same viewer and type');
        }
    }
    let backup = null;
    if (!dryRun) {
        const id = randomUUID();
        backup = path.join('backups', `alert-events-before-repair-${id}.json`);
        fs.mkdirSync(path.join(dataDir, 'backups'), { recursive: true });
        fs.writeFileSync(path.join(dataDir, backup), JSON.stringify(events), { flag: 'wx' });
        const file = path.join(dataDir, 'alert-events.json');
        const temp = `${file}.${id}.tmp`;
        try {
            fs.writeFileSync(temp, JSON.stringify(next), { flag: 'wx' });
            fs.renameSync(temp, file);
        } finally {
            fs.rmSync(temp, { force: true });
        }
    }
    return { next, result: { ok: true, dryRun, replayed: false, backup, events: [...changed.values()] } };
}

module.exports = { correctAlertHistory };

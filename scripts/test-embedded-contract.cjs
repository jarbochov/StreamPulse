'use strict';
// Contract for hosts that embed StreamPulse in-process (embedded host bundle, desktop app).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');

const freePort = () => new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => { const { port } = srv.address(); srv.close(() => resolve(port)); });
    srv.on('error', reject);
});

test('embedded StreamPulse exposes a stable host contract', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-embedded-'));
    const configPath = path.join(dir, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify({ broadcaster_name: 'FictionalHost', music: { enabled: false } }));
    process.env.STREAMPULSE_EMBEDDED = 'true';
    process.env.STREAMPULSE_CONFIG_PATH = configPath;
    process.env.STREAMPULSE_DATA_DIR = path.join(dir, 'data');
    process.env.PORT = String(await freePort());
    const signalListeners = process.listenerCount('SIGTERM');

    const sp = require('../server.js');
    try {
        for (const key of ['server', 'startServer', 'stopServer', 'restartServer', 'onBroadcast', 'setExternalData', 'registerHostSource', 'getHostSources', 'ingestEvent', 'getSnapshots', 'port']) {
            assert.ok(key in sp, `missing export ${key}`);
        }
        assert.equal(sp.server.listening, false, 'embedded mode must not auto-start');
        assert.equal(process.listenerCount('SIGTERM'), signalListeners, 'embedded mode must not own signals');

        await sp.startServer();
        assert.equal(sp.server.listening, true);

        const snapshot = sp.getSnapshots();
        for (const key of ['timers', 'goals', 'viewers', 'music', 'poll', 'matchup', 'tournament', 'pollTournament']) {
            assert.ok(key in snapshot, `missing snapshot ${key}`);
        }

        const seen = [];
        const off = sp.onBroadcast((type, data) => seen.push({ type, data }));
        const res = await fetch(`http://127.0.0.1:${sp.port}/api/timers`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: 'contract-timer', name: 'Contract', type: 'countdown', durationMs: 300000 })
        });
        assert.ok(res.status < 500, `timer API responded ${res.status}`);
        await new Promise(r => setTimeout(r, 100));
        assert.ok(seen.some(e => e.type.startsWith('timer')), `expected a timer broadcast, saw ${seen.map(e => e.type).join(',') || 'none'}`);
        off();
        const count = seen.length;
        await fetch(`http://127.0.0.1:${sp.port}/api/timers/contract-timer`, { method: 'DELETE' });
        await new Promise(r => setTimeout(r, 100));
        assert.equal(seen.length, count, 'unsubscribed listener must not receive broadcasts');

        const extSeen = [];
        const offExt = sp.onBroadcast((type, data) => { if (type === 'external-update') extSeen.push(data); });
        sp.setExternalData('nodecg-tiltify.total', { amount: 1234.5, currency: 'USD' });
        offExt();
        assert.deepEqual(extSeen[0], { key: 'nodecg-tiltify.total', value: { amount: 1234.5, currency: 'USD' } });
        const status = await (await fetch(`http://127.0.0.1:${sp.port}/api/status`)).json();
        assert.equal(status.external['nodecg-tiltify.total'].amount, 1234.5);
        assert.deepEqual(status.hostSources, [], 'no host sources until registered');
        sp.registerHostSource({ id: 'tiltify', label: 'Tiltify (NodeCG)' });
        assert.throws(() => sp.registerHostSource({ id: 'any' }));
        assert.deepEqual((await (await fetch(`http://127.0.0.1:${sp.port}/api/status`)).json()).hostSources, [{ id: 'tiltify', label: 'Tiltify (NodeCG)' }]);
        assert.throws(() => sp.setExternalData('bad key', 1));
        const shared = {};
        new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../public/js/overlay-shared.js'), 'utf8'))(shared);
        const table = shared.OverlayShared.variableTable({ external: status.external });
        assert.equal(table['rep.nodecg-tiltify.total.amount'], 1234.5);

        await fetch(`http://127.0.0.1:${sp.port}/api/alerts`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rules: [{ id: 'contract-donation', trigger: 'donation', conditions: { minAmount: 20, maxAmount: 29.99 }, variants: [{ title: '{{alert.user}} donated {{alert.amount}}' }] }] })
        });
        const donationSeen = [];
        const offDonation = sp.onBroadcast((type, data) => donationSeen.push({ type, data }));
        const alert = sp.ingestEvent({ type: 'donation', id: 'tiltify-1', user: 'FictionalDonor', amount: '25.00', currency: 'USD', message: 'Hi', source: 'tiltify' });
        assert.equal(alert.ruleId, 'contract-donation');
        assert.equal(alert.title, 'FictionalDonor donated 25');
        assert.equal(sp.ingestEvent({ type: 'donation', id: 'tiltify-1', user: 'FictionalDonor', amount: 25 }), null, 'duplicate id must be ignored');
        assert.ok(sp.ingestEvent({ type: 'donation', id: 'tiltify-2', user: 'FictionalDonor', amount: 25, source: 'tiltify' }), 'same donor and amount with a new id must alert');
        assert.equal(sp.ingestEvent({ type: 'donation', id: 'tiltify-3', user: 'Small', amount: 5, source: 'tiltify' }), null, 'unmatched amount queues no alert');
        offDonation();
        const update = donationSeen.filter(e => e.type === 'update').pop();
        assert.equal(update.data.donations.filter(d => d.source === 'tiltify').length, 3, 'each new donation is counted once');
        assert.ok(donationSeen.some(e => e.type === 'goals-update'));
        assert.throws(() => sp.ingestEvent({ type: 'follow' }));
    } finally {
        await sp.stopServer();
        delete require.cache[require.resolve('../server.js')];
        delete process.env.STREAMPULSE_EMBEDDED;
        delete process.env.STREAMPULSE_CONFIG_PATH;
        delete process.env.STREAMPULSE_DATA_DIR;
        delete process.env.PORT;
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

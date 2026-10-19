const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { execFileSync } = require('node:child_process');
const { test } = require('node:test');

test('explicit and repeated desktop quits await one backend cleanup', async () => {
    const app = new EventEmitter();
    let exits = 0;
    Object.assign(app, {
        requestSingleInstanceLock: () => true,
        getPath: () => '/fixture/user-data',
        whenReady: () => ({ then() {} }),
        quit() {
            let prevented = false;
            app.emit('before-quit', { preventDefault() { prevented = true; } });
            if (!prevented) exits++;
        }
    });
    const context = vm.createContext({
        require(name) {
            if (name === 'electron') return { app, ipcMain: { handle() {} } };
            if (name === './server-manager') return { ServerManager: class {} };
            if (name === './tray') return { AppTray: class {} };
            return require(name);
        },
        __dirname: path.resolve(__dirname, '../desktop'),
        process: { env: {}, platform: process.platform },
        console,
        setTimeout
    });
    vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../desktop/main.js'), 'utf8'), context);
    let releaseStop;
    let stops = 0;
    let destroyed = 0;
    context.fixtureManager = { stop: () => {
        stops++;
        return new Promise(resolve => { releaseStop = resolve; });
    } };
    context.fixtureTray = { destroy() { destroyed++; } };
    vm.runInContext('serverManager = fixtureManager; appTray = fixtureTray;', context);
    // Existing callers may already mark the app as quitting before emitting before-quit.
    app.isQuitting = true;
    app.quit();
    app.quit();
    assert.equal(stops, 1);
    assert.equal(exits, 0);
    assert.equal(destroyed, 0);
    releaseStop();
    await vm.runInContext('quitPromise', context);
    assert.equal(exits, 1);
    assert.equal(destroyed, 1);
});

async function exerciseBackend() {
    const assert = require('node:assert/strict');
    const fs = require('node:fs');
    const os = require('node:os');
    const path = require('node:path');
    const http = require('node:http');
    const { once } = require('node:events');
    const WebSocket = require('ws');
    const { ServerManager } = require('./desktop/server-manager');
    const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'streampulse-lifecycle-'));
    const probe = http.createServer();
    await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
    const port = probe.address().port;
    await new Promise(resolve => probe.close(resolve));
    const configPath = path.join(fixture, 'config.json');
    const dataDir = path.join(fixture, 'data');
    fs.mkdirSync(dataDir);
    fs.mkdirSync(path.join(dataDir, 'sessions'));
    fs.writeFileSync(configPath, JSON.stringify({
        port, broadcaster_id: '', ssn: {}, twitch_refresh_minutes: -1,
        viewer_tracking: { enabled: false }, session_lifecycle: { auto: false },
        music: { enabled: false }, weather: { enabled: false }
    }));
    const startedAt = new Date(Date.now() - 60000).toISOString();
    fs.writeFileSync(path.join(dataDir, 'chat.json'), JSON.stringify({
        startedAt, messageCount: 1, chatters: {}, viewerStats: {}
    }));
    const intervals = new Set();
    const originalSet = global.setInterval;
    const originalClear = global.clearInterval;
    global.setInterval = (...args) => {
        const timer = originalSet(...args);
        intervals.add(timer);
        return timer;
    };
    global.clearInterval = timer => {
        intervals.delete(timer);
        originalClear(timer);
    };
    const manager = new ServerManager({ projectRoot: process.cwd(), configPath, dataDir, port });
    try {
        await manager.start();
        await manager.waitForReady();
        const initialIntervals = intervals.size;
        assert.ok(initialIntervals > 0);
        const base = `http://127.0.0.1:${port}`;
        for (let i = 0; i < 3; i++) {
            const socket = new WebSocket(`ws://127.0.0.1:${port}`);
            await once(socket, 'open');
            const closed = once(socket, 'close');
            const first = manager.restart();
            assert.equal(manager.restart(), first, 'concurrent restarts share one operation');
            await first;
            await closed;
            const status = await (await fetch(base + '/api/status')).json();
            assert.equal(status.sessionActive, true);
            assert.equal(status.startedAt, startedAt);
            assert.equal(status.ssn.messages, 1);
            assert.equal(intervals.size, initialIntervals, 'restart must not multiply background intervals');
            assert.equal(fs.readdirSync(path.join(dataDir, 'sessions')).length, 0);
        }
        // The HTTP action used by Companion must follow the same lifecycle.
        const response = await fetch(base + '/api/restart', { method: 'POST' });
        assert.equal(response.status, 200);
        await response.json();
        await new Promise(resolve => setTimeout(resolve, 200));
        await manager.waitForReady();
        assert.equal((await (await fetch(base + '/api/status')).json()).ssn.messages, 1);
        assert.equal(intervals.size, initialIntervals);
        const ended = await fetch(base + '/api/end-session', { method: 'POST' });
        assert.equal(ended.status, 200);
        assert.equal((await ended.json()).status, 'ended');
        const started = await fetch(base + '/api/start-session', { method: 'POST' });
        assert.equal(started.status, 200);
        assert.equal((await started.json()).status, 'started');
        assert.equal((await (await fetch(base + '/api/status')).json()).library.sessions, 1);
        const archiveName = fs.readdirSync(path.join(dataDir, 'sessions')).find(f => f.startsWith('chat-'));
        const deleted = await fetch(base + '/api/sessions?session=' + encodeURIComponent(archiveName), { method: 'DELETE' });
        assert.equal(deleted.status, 200);
        await deleted.json();
        assert.equal((await (await fetch(base + '/api/status')).json()).library.sessions, 0, 'deletion invalidates cached status immediately');
        const first = manager.stop();
        assert.equal(manager.stop(), first);
        await first;
        assert.equal(manager.serverInstance.server.listening, false);
        assert.equal(intervals.size, 0, 'stop must release every service interval');
        assert.equal(JSON.parse(fs.readFileSync(path.join(dataDir, 'chat.json'), 'utf8')).messageCount, 0);
        assert.equal(fs.readdirSync(path.join(dataDir, 'sessions')).filter(f => f.startsWith('chat-')).length, 0);
    } finally {
        await manager.stop();
        global.setInterval = originalSet;
        global.clearInterval = originalClear;
        fs.rmSync(fixture, { recursive: true, force: true });
    }
}

test('real backend restart preserves sessions and releases sockets and timers', () => {
    execFileSync(process.execPath, ['-e', `(${exerciseBackend.toString()})().catch(err => { console.error(err); process.exitCode = 1; });`], {
        cwd: path.resolve(__dirname, '..'),
        timeout: 20000,
        stdio: 'pipe'
    });
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const puppeteer = require('puppeteer');
const createMultiplayerBingo = require('../server/services/multiplayer-bingo');
const createRoutes = require('../server/routes/multiplayer-bingo');
const { createStaticRouter } = require('../server/static-router');
const { detectBingoLines, resolvePlayerCard, resolveStandings } = require('../shared/multiplayer-bingo.cjs');

test('multiplayer bingo prompt packs, opt-in LAN gate, lockout claims, host override, zoom, and token isolation', async t => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-mp-bingo-'));
    const broadcasts = [];
    let enabled = false;
    const service = createMultiplayerBingo({ dataDir: dir, onChange: payload => broadcasts.push(payload) });
    const route = createRoutes(service, { isMultiplayerBingoEnabled: () => enabled });
    const server = http.createServer(async (req, res) => {
        if (!await route(req, res, new URL(req.url, 'http://fixture.local'))) { res.writeHead(404); res.end(); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(async () => {
        await new Promise(resolve => server.close(resolve));
        fs.rmSync(dir, { recursive: true, force: true });
    });
    const base = `http://127.0.0.1:${server.address().port}`;

    // 1. Create a 3x3 Lockout Prompt Pack and select it
    const createPack = await (await fetch(`${base}/api/multiplayer-bingo/packs`, {
        method: 'POST',
        body: JSON.stringify({
            id: 'speedrun-3x3',
            name: 'Speedrun Mini',
            size: 3,
            claimMode: 'lockout',
            freeSpace: true,
            prompts: ['P0', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8']
        })
    })).json();
    assert.equal(createPack.ok, true);
    assert.equal(createPack.pack.id, 'speedrun-3x3');

    const sel = await (await fetch(`${base}/api/multiplayer-bingo/packs/select?id=speedrun-3x3`)).json();
    assert.equal(sel.state.activePackId, 'speedrun-3x3');

    // 2. Add two ad-hoc players with uniquely shuffled cards
    const addA = await (await fetch(`${base}/api/multiplayer-bingo/players/add`, {
        method: 'POST', body: JSON.stringify({ name: 'Nova', color: '#ef4444' })
    })).json();
    const addB = await (await fetch(`${base}/api/multiplayer-bingo/players/add`, {
        method: 'POST', body: JSON.stringify({ name: 'Echo', color: '#3b82f6' })
    })).json();
    assert.ok(addA.card.token && addB.card.token && addA.card.token !== addB.card.token);

    // Verify neither WebSocket broadcasts nor /overlay ever leak secret tokens
    assert.equal(JSON.stringify(broadcasts).includes(addA.card.token), false, 'WS broadcasts never leak player tokens');
    const overlayJson = await (await fetch(`${base}/api/multiplayer-bingo/overlay`)).json();
    assert.equal(JSON.stringify(overlayJson).includes(addA.card.token), false, 'overlay endpoint never leaks player tokens');

    // 3. Opt-in gate disabled -> /api/bingo/play/:token* returns 403
    assert.equal((await fetch(`${base}/api/bingo/play/${addA.card.token}`)).status, 403);
    assert.equal((await fetch(`${base}/api/bingo/play/${addA.card.token}/toggle`, {
        method: 'POST', body: JSON.stringify({ cell: 0 })
    })).status, 403);

    // 4. Enable Multiplayer Bingo -> player can fetch own card without seeing any tokens
    enabled = true;
    const playA = await fetch(`${base}/api/bingo/play/${addA.card.token}`);
    assert.equal(playA.status, 200);
    const playAJson = await playA.json();
    assert.equal(playAJson.cardId, addA.card.id);
    assert.equal(JSON.stringify(playAJson).includes(addA.card.token), false);
    assert.equal(JSON.stringify(playAJson).includes(addB.card.token), false);

    // 5. Lockout claim: Nova claims a prompt present on both boards; Echo gets 409; Host override succeeds
    const novaPoolIdx = addA.card.order.slice(0, 8).findIndex(p => addB.card.order.slice(0, 8).includes(p));
    const promptClaimed = addA.card.order[novaPoolIdx];
    const novaCell = novaPoolIdx >= 4 ? novaPoolIdx + 1 : novaPoolIdx;
    const echoPoolIdx = addB.card.order.slice(0, 8).indexOf(promptClaimed);
    const echoCell = echoPoolIdx >= 4 ? echoPoolIdx + 1 : echoPoolIdx;

    assert.equal((await fetch(`${base}/api/bingo/play/${addA.card.token}/toggle`, {
        method: 'POST', body: JSON.stringify({ cell: novaCell })
    })).status, 200);
    assert.equal(service.getState().session.claims[promptClaimed].cardId, addA.card.id);

    assert.equal((await fetch(`${base}/api/bingo/play/${addB.card.token}/toggle`, {
        method: 'POST', body: JSON.stringify({ cell: echoCell })
    })).status, 409, 'lockout blocks opponent from claiming an already-claimed square');

    assert.equal((await fetch(`${base}/api/multiplayer-bingo/players/toggle`, {
        method: 'POST', body: JSON.stringify({ card: addB.card.id, cell: echoCell })
    })).status, 200);
    assert.equal(service.getState().session.claims[promptClaimed].cardId, addB.card.id);

    // 6. Locked/Hidden guard + Focus/Zoom toggle
    await fetch(`${base}/api/multiplayer-bingo/flags?locked=1`);
    assert.equal((await fetch(`${base}/api/bingo/play/${addA.card.token}/toggle`, {
        method: 'POST', body: JSON.stringify({ cell: 1 })
    })).status, 403, 'locked board blocks player toggles');

    await fetch(`${base}/api/multiplayer-bingo/focus?card=${addA.card.id}&toggle=1`);
    assert.equal(service.getState().session.focusedCardId, addA.card.id);
    await fetch(`${base}/api/multiplayer-bingo/focus?card=${addA.card.id}&toggle=1`);
    assert.equal(service.getState().session.focusedCardId, '');

    // 7. Token rotation invalidates old link
    const regen = await (await fetch(`${base}/api/multiplayer-bingo/players/regen`, {
        method: 'POST', body: JSON.stringify({ card: addA.card.id })
    })).json();
    assert.equal((await fetch(`${base}/api/bingo/play/${addA.card.token}`)).status, 404);
    assert.equal((await fetch(`${base}/api/bingo/play/${regen.card.token}`)).status, 200);

    // 8. Companion status endpoint + persistence across reload
    const statusJson = await (await fetch(`${base}/api/multiplayer-bingo/status`)).json();
    assert.equal(statusJson.packName, 'Speedrun Mini');
    assert.equal(statusJson.playerCount, 2);
    assert.equal(createMultiplayerBingo({ dataDir: dir }).getState().packs.length, 2);

    // 9. Host Caller marks a prompt across ALL players' shuffled cards at once in Independent mode
    await fetch(`${base}/api/multiplayer-bingo/packs/speedrun-3x3`, {
        method: 'PUT',
        body: JSON.stringify({
            name: 'Speedrun Mini', size: 3, claimMode: 'independent', freeSpace: true,
            prompts: ['P0', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8']
        })
    });
    const stBeforeCall = service.getState().session;
    const cardA = stBeforeCall.cards.find(c => c.id === addA.card.id);
    const cardB = stBeforeCall.cards.find(c => c.id === addB.card.id);
    const sharedPrompt = cardA.order.slice(0, 8).find(p => cardB.order.slice(0, 8).includes(p));
    const callRes = await (await fetch(`${base}/api/multiplayer-bingo/call`, {
        method: 'POST', body: JSON.stringify({ prompt: sharedPrompt })
    })).json();
    assert.equal(callRes.state.session.calledPrompts.includes(sharedPrompt), true);
    const aAfter = callRes.state.session.cards.find(c => c.id === addA.card.id);
    const bAfter = callRes.state.session.cards.find(c => c.id === addB.card.id);
    const expectedCell = card => {
        const pos = card.order.slice(0, 8).indexOf(sharedPrompt);
        return pos >= 4 ? pos + 1 : pos;
    };
    assert.equal(aAfter.stamped.includes(expectedCell(cardA)), true, 'Host Caller auto-marks prompt on Player A card');
    assert.equal(bAfter.stamped.includes(expectedCell(cardB)), true, 'Host Caller auto-marks prompt on Player B card');

    // Calling again unmarks across all cards
    const uncallRes = await (await fetch(`${base}/api/multiplayer-bingo/call?prompt=${sharedPrompt}&called=0`)).json();
    assert.equal(uncallRes.state.session.calledPrompts.includes(sharedPrompt), false);
    assert.equal(uncallRes.state.session.cards.find(c => c.id === addA.card.id).stamped.includes(expectedCell(cardA)), false);
    assert.equal(uncallRes.state.session.cards.find(c => c.id === addB.card.id).stamped.includes(expectedCell(cardB)), false);

    // 10. Removing player cleans up claims
    await fetch(`${base}/api/multiplayer-bingo/players/remove`, {
        method: 'POST', body: JSON.stringify({ card: addB.card.id })
    });
    assert.equal(service.getState().session.cards.length, 1);
    assert.equal(service.getState().session.claims[promptClaimed], undefined);
});

test('multiplayer bingo overlay renders multi-card zoom, lockout, standings, and LAN player card cleanly', { timeout: 60000 }, async t => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-mp-bingo-ui-'));
    const service = createMultiplayerBingo({ dataDir: dir });
    service.savePack({ id: 'mini', name: 'Mini Pack', size: 3, claimMode: 'lockout', prompts: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'] }, 'mini');
    service.selectPack('mini');
    const a = service.addPlayer({ name: 'Nova', color: '#ef4444' }).card;
    service.addPlayer({ name: 'Echo', color: '#3b82f6' });
    service.setFlags({ focusedCardId: a.id });

    const route = createRoutes(service, { isMultiplayerBingoEnabled: () => true });
    const staticRouter = createStaticRouter({ rootDir: path.resolve(__dirname, '..'), publicDir: path.resolve(__dirname, '../public') });
    const server = http.createServer(async (req, res) => {
        const url = new URL(req.url, 'http://fixture.local');
        if (await route(req, res, url)) return;
        if (!staticRouter.handleRequest(req, res)) { res.writeHead(404); res.end(); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    t.after(async () => {
        await browser.close();
        await new Promise(resolve => server.close(resolve));
        fs.rmSync(dir, { recursive: true, force: true });
    });

    const base = `http://127.0.0.1:${server.address().port}`;
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await page.goto(`${base}/overlays/multiplayer-bingo.html?view=multi`, { waitUntil: 'networkidle0' });
    const zoomedCard = await page.evaluate(() => document.querySelector('.mp-card.is-zoomed')?.dataset.cardId);
    assert.equal(zoomedCard, a.id, 'multi-card overlay zooms into focusedCardId');

    await page.goto(`${base}/overlays/multiplayer-bingo.html?view=standings`, { waitUntil: 'networkidle0' });
    const standingPills = await page.evaluate(() => document.querySelectorAll('.mp-standing-pill').length);
    assert.equal(standingPills, 2, 'standings strip renders both players');

    await page.goto(`${base}/bingo-play.html?t=${a.token}`, { waitUntil: 'networkidle0' });
    const playerHeading = await page.evaluate(() => document.querySelector('.player-name')?.textContent);
    assert.equal(playerHeading, 'Nova', 'LAN player card renders player name');

    assert.deepEqual(errors, []);
});

test('multiplayer bingo LAN network detection, Four Corners bingo, and Confirm Mode pending calls', async t => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-mp-bingo-upg-'));
    const service = createMultiplayerBingo({ dataDir: dir });
    const mockIfaces = () => ({
        lo0: [{ address: '127.0.0.1', family: 'IPv4', internal: true }],
        en1: [
            { address: 'fe80::1', family: 'IPv6', internal: false },
            { address: '172.20.10.5', family: 'IPv4', internal: false },
            { address: '203.0.113.9', family: 'IPv4', internal: false }
        ],
        en0: [
            { address: '10.0.0.12', family: 'IPv4', internal: false },
            { address: '192.168.1.42', family: 'IPv4', internal: false }
        ]
    });
    let activeIfaces = mockIfaces;
    const route = createRoutes(service, {
        isMultiplayerBingoEnabled: () => true,
        getNetworkInterfaces: () => activeIfaces()
    });
    const server = http.createServer(async (req, res) => {
        if (!await route(req, res, new URL(req.url, 'http://fixture.local'))) { res.writeHead(404); res.end(); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(async () => {
        await new Promise(resolve => server.close(resolve));
        fs.rmSync(dir, { recursive: true, force: true });
    });
    const port = server.address().port;
    const base = `http://127.0.0.1:${port}`;

    // 1. LAN Host IP detection & prioritization (192.168.* > 10.* > 172.16-31.* > other IPv4)
    const initialGet = await (await fetch(`${base}/api/multiplayer-bingo`)).json();
    assert.deepEqual(initialGet.network.lanIps, ['192.168.1.42', '10.0.0.12', '172.20.10.5', '203.0.113.9']);
    assert.equal(initialGet.network.lanIp, '192.168.1.42');
    assert.equal(initialGet.network.port, port);
    assert.equal(initialGet.network.lanOrigin, `http://192.168.1.42:${port}`);

    // Empty network interfaces -> empty lanOrigin
    activeIfaces = () => ({ lo0: [{ address: '127.0.0.1', family: 'IPv4', internal: true }] });
    const emptyNet = await (await fetch(`${base}/api/multiplayer-bingo`)).json();
    assert.equal(emptyNet.network.lanIp, '');
    assert.deepEqual(emptyNet.network.lanIps, []);
    assert.equal(emptyNet.network.lanOrigin, '');
    activeIfaces = mockIfaces;

    // Also verify default real os.networkInterfaces() route shape
    const realRoute = createRoutes(service, { isMultiplayerBingoEnabled: () => true });
    const realServer = http.createServer(async (req, res) => {
        if (!await realRoute(req, res, new URL(req.url, 'http://fixture.local'))) { res.writeHead(404); res.end(); }
    });
    await new Promise(resolve => realServer.listen(0, '127.0.0.1', resolve));
    const realGet = await (await fetch(`http://127.0.0.1:${realServer.address().port}/api/multiplayer-bingo`)).json();
    await new Promise(resolve => realServer.close(resolve));
    assert.equal(typeof realGet.network.lanIp, 'string');
    assert.ok(Array.isArray(realGet.network.lanIps));
    assert.equal(typeof realGet.network.lanOrigin, 'string');

    // 2. Four Corners BINGO unit + API tests (5x5 independent pack with only 4 corners stamped)
    const pack5 = {
        id: 'corners-5x5',
        name: 'Corners Test',
        size: 5,
        freeSpace: false,
        claimMode: 'independent',
        prompts: Array.from({ length: 25 }, (_, i) => `Prompt ${i}`)
    };
    const cornerCard = {
        id: 'c1',
        name: 'Nova',
        color: '#ef4444',
        order: Array.from({ length: 25 }, (_, i) => i),
        stamped: [0, 4, 20, 24]
    };
    assert.equal(detectBingoLines(5, new Set([0, 4, 20, 24]), { fourCorners: false }).length, 0);
    assert.deepEqual(detectBingoLines(5, new Set([0, 4, 20, 24]), { fourCorners: true }), [[0, 4, 20, 24]]);

    const resolvedOff = resolvePlayerCard(pack5, cornerCard, {}, { c1: cornerCard }, { fourCorners: false });
    assert.equal(resolvedOff.bingoCount, 0);
    assert.equal(resolvedOff.cells[0].winning, false);

    const resolvedOn = resolvePlayerCard(pack5, cornerCard, {}, { c1: cornerCard }, { fourCorners: true });
    assert.equal(resolvedOn.bingoCount, 1);
    for (const idx of [0, 4, 20, 24]) {
        assert.equal(resolvedOn.cells[idx].winning, true, `corner cell ${idx} marked winning`);
    }
    assert.equal(resolvedOn.cells[1].winning, false);

    assert.equal(resolveStandings(pack5, [cornerCard], {}, { fourCorners: false })[0].bingoCount, 0);
    assert.equal(resolveStandings(pack5, [cornerCard], {}, { fourCorners: true })[0].bingoCount, 1);

    // Live API toggle of fourCorners via /flags and verification on /status
    await fetch(`${base}/api/multiplayer-bingo/packs`, { method: 'POST', body: JSON.stringify(pack5) });
    await fetch(`${base}/api/multiplayer-bingo/packs/select?id=corners-5x5`);
    const p1 = (await (await fetch(`${base}/api/multiplayer-bingo/players/add`, {
        method: 'POST', body: JSON.stringify({ name: 'Nova', color: '#ef4444' })
    })).json()).card;
    for (const corner of [0, 4, 20, 24]) {
        await fetch(`${base}/api/multiplayer-bingo/players/toggle`, {
            method: 'POST', body: JSON.stringify({ card: p1.id, cell: corner, stamped: true })
        });
    }
    let status = await (await fetch(`${base}/api/multiplayer-bingo/status`)).json();
    assert.equal(status.fourCorners, false);
    assert.equal(status.leaderBingos, 0);

    await fetch(`${base}/api/multiplayer-bingo/flags?fourCorners=1`);
    status = await (await fetch(`${base}/api/multiplayer-bingo/status`)).json();
    assert.equal(status.fourCorners, true);
    assert.equal(status.leaderBingos, 1);

    // Verify persistence across disk reload
    assert.equal(createMultiplayerBingo({ dataDir: dir }).getState().session.fourCorners, true);
    await fetch(`${base}/api/multiplayer-bingo/flags`, { method: 'POST', body: JSON.stringify({ fourCorners: false }) });

    // 3. Confirm Mode (confirmCalls + pendingCalls + /confirm + /dismiss) in Lockout and Independent modes
    const lockoutPack = {
        id: 'confirm-lockout',
        name: 'Confirm Lockout',
        size: 3,
        freeSpace: true,
        claimMode: 'lockout',
        prompts: ['P0', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8']
    };
    await fetch(`${base}/api/multiplayer-bingo/packs`, { method: 'POST', body: JSON.stringify(lockoutPack) });
    await fetch(`${base}/api/multiplayer-bingo/packs/select?id=confirm-lockout`);
    const p2 = (await (await fetch(`${base}/api/multiplayer-bingo/players/add`, {
        method: 'POST', body: JSON.stringify({ name: 'Echo', color: '#3b82f6' })
    })).json()).card;

    const latestCards = service.getState().session.cards;
    const novaCard = latestCards.find(c => c.id === p1.id);
    const echoCard = latestCards.find(c => c.id === p2.id);

    // Find a shared prompt present on both 3x3 boards
    const sharedPrompt = novaCard.order.slice(0, 8).find(pr => echoCard.order.slice(0, 8).includes(pr));
    const cellForPrompt = (card, promptIdx) => {
        const pos = card.order.slice(0, 8).indexOf(promptIdx);
        return pos >= 4 ? pos + 1 : pos;
    };
    const novaSharedCell = cellForPrompt(novaCard, sharedPrompt);
    const echoSharedCell = cellForPrompt(echoCard, sharedPrompt);

    // Enable Confirm Mode via GET /flags
    const flagRes = await (await fetch(`${base}/api/multiplayer-bingo/flags?confirmCalls=1`)).json();
    assert.equal(flagRes.state.session.confirmCalls, true);

    // Nova taps -> creates pending call, does NOT claim/stamp or count as bingo
    const tap1 = await (await fetch(`${base}/api/bingo/play/${novaCard.token}/toggle`, {
        method: 'POST', body: JSON.stringify({ cell: novaSharedCell })
    })).json();
    assert.equal(tap1.ok, true);
    assert.equal(tap1.session.pendingCalls.length, 1);
    assert.equal(tap1.session.pendingCalls[0].cell, novaSharedCell);
    assert.equal(tap1.session.pendingCalls[0].promptIndex, sharedPrompt);
    assert.equal(tap1.session.claims[String(sharedPrompt)], undefined, 'pending call does not claim immediately');

    status = await (await fetch(`${base}/api/multiplayer-bingo/status`)).json();
    assert.equal(status.confirmCalls, true);
    assert.equal(status.pendingCount, 1);

    // Nova re-taps the same cell -> cancels pending call
    const tapCancel = await (await fetch(`${base}/api/bingo/play/${novaCard.token}/toggle`, {
        method: 'POST', body: JSON.stringify({ cell: novaSharedCell })
    })).json();
    assert.equal(tapCancel.session.pendingCalls.length, 0);
    status = await (await fetch(`${base}/api/multiplayer-bingo/status`)).json();
    assert.equal(status.pendingCount, 0);

    // Both Nova and Echo request the same prompt in Lockout mode
    await fetch(`${base}/api/bingo/play/${novaCard.token}/toggle`, {
        method: 'POST', body: JSON.stringify({ cell: novaSharedCell })
    });
    await fetch(`${base}/api/bingo/play/${echoCard.token}/toggle`, {
        method: 'POST', body: JSON.stringify({ cell: echoSharedCell })
    });
    const pendingBoth = service.getState().session.pendingCalls;
    assert.equal(pendingBoth.length, 2);
    const novaPendingId = pendingBoth.find(p => p.cardId === novaCard.id).id;

    // Host confirms Nova's pending call -> claims for Nova AND clears Echo's conflicting pending call!
    const confirmRes = await (await fetch(`${base}/api/multiplayer-bingo/confirm`, {
        method: 'POST', body: JSON.stringify({ id: novaPendingId })
    })).json();
    assert.equal(confirmRes.ok, true);
    assert.equal(confirmRes.confirmed, 1);
    assert.equal(confirmRes.state.session.claims[String(sharedPrompt)].cardId, novaCard.id);
    assert.equal(confirmRes.state.session.pendingCalls.length, 0, 'Lockout confirm clears competing pending calls for same prompt');

    // Confirmed square in Lockout mode cannot be unstamped by player (403) and opponent gets 409
    assert.equal((await fetch(`${base}/api/bingo/play/${novaCard.token}/toggle`, {
        method: 'POST', body: JSON.stringify({ cell: novaSharedCell })
    })).status, 403);
    assert.equal((await fetch(`${base}/api/bingo/play/${echoCard.token}/toggle`, {
        method: 'POST', body: JSON.stringify({ cell: echoSharedCell })
    })).status, 409);

    // Dismiss removes pending call without stamping
    const otherPrompt = novaCard.order.slice(0, 8).find(pr => pr !== sharedPrompt);
    const novaOtherCell = cellForPrompt(novaCard, otherPrompt);
    await fetch(`${base}/api/bingo/play/${novaCard.token}/toggle`, {
        method: 'POST', body: JSON.stringify({ cell: novaOtherCell })
    });
    const pendingToDismiss = service.getState().session.pendingCalls[0];
    assert.ok(pendingToDismiss);
    const dismissRes = await (await fetch(`${base}/api/multiplayer-bingo/dismiss?id=${encodeURIComponent(pendingToDismiss.id)}`)).json();
    assert.equal(dismissRes.ok, true);
    assert.equal(dismissRes.dismissed, 1);
    assert.equal(dismissRes.state.session.pendingCalls.length, 0);
    assert.equal(dismissRes.state.session.claims[String(otherPrompt)], undefined, 'dismissed call is not stamped');

    // Independent mode (no free space): Confirm All + player can unstamp already-confirmed cell
    await fetch(`${base}/api/multiplayer-bingo/packs/confirm-lockout`, {
        method: 'PUT',
        body: JSON.stringify({ ...lockoutPack, claimMode: 'independent', freeSpace: false })
    });
    await fetch(`${base}/api/multiplayer-bingo/reset`, { method: 'POST', body: '{}' });
    const indCards = service.getState().session.cards;
    const indNova = indCards.find(c => c.id === p1.id);
    const indEcho = indCards.find(c => c.id === p2.id);

    // Request 4 corners on 3x3 (0, 2, 6, 8) without confirming -> must not count as bingo
    for (const c of [0, 2, 6, 8]) {
        await fetch(`${base}/api/bingo/play/${indNova.token}/toggle`, {
            method: 'POST', body: JSON.stringify({ cell: c })
        });
    }
    await fetch(`${base}/api/multiplayer-bingo/flags?fourCorners=1`);
    status = await (await fetch(`${base}/api/multiplayer-bingo/status`)).json();
    assert.equal(status.pendingCount, 4);
    assert.equal(status.leaderBingos, 0, 'pending corner calls do not count as bingo before confirmation');

    await fetch(`${base}/api/bingo/play/${indEcho.token}/toggle`, {
        method: 'POST', body: JSON.stringify({ cell: 0 })
    });
    const confirmAllRes = await (await fetch(`${base}/api/multiplayer-bingo/confirm?all=1`)).json();
    assert.equal(confirmAllRes.confirmed, 5);
    assert.equal(confirmAllRes.state.session.pendingCalls.length, 0);

    status = await (await fetch(`${base}/api/multiplayer-bingo/status`)).json();
    assert.equal(status.pendingCount, 0);
    assert.equal(status.leaderBingos, 1, 'confirmed 4 corners counts as bingo when fourCorners is enabled');

    // In Independent mode, player can unstamp their already-confirmed cell directly
    const unstampRes = await (await fetch(`${base}/api/bingo/play/${indNova.token}/toggle`, {
        method: 'POST', body: JSON.stringify({ cell: 0 })
    })).json();
    assert.equal(unstampRes.ok, true);
    assert.equal(service.getState().session.cards.find(c => c.id === indNova.id).stamped.includes(0), false);
});

test('multiplayer bingo UI renders LAN share URL, pending player calls, Host Caller badges, and Four Corners overlay', { timeout: 60000 }, async t => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-mp-bingo-ui2-'));
    const service = createMultiplayerBingo({ dataDir: dir });
    service.savePack({
        id: 'ui-ind',
        name: 'UI Independent',
        size: 3,
        freeSpace: false,
        claimMode: 'independent',
        prompts: ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta', 'Iota']
    }, 'ui-ind');
    service.selectPack('ui-ind');
    const nova = service.addPlayer({ name: 'Nova', color: '#ef4444' }).card;
    service.setFlags({ fourCorners: true, confirmCalls: true });
    // Stamp 3 corners and leave 4th corner pending
    service.toggleCell(nova.id, 0, { isHost: true, forceState: true });
    service.toggleCell(nova.id, 2, { isHost: true, forceState: true });
    service.toggleCell(nova.id, 6, { isHost: true, forceState: true });
    service.toggleCell(nova.id, 8, { isHost: false }); // creates pending call

    const route = createRoutes(service, {
        isMultiplayerBingoEnabled: () => true,
        getNetworkInterfaces: () => ({
            en0: [
                { address: '192.168.50.10', family: 'IPv4', internal: false },
                { address: '10.0.0.5', family: 'IPv4', internal: false }
            ]
        })
    });
    const staticRouter = createStaticRouter({ rootDir: path.resolve(__dirname, '..'), publicDir: path.resolve(__dirname, '../public') });
    const server = http.createServer(async (req, res) => {
        const url = new URL(req.url, 'http://fixture.local');
        if (await route(req, res, url)) return;
        if (!staticRouter.handleRequest(req, res)) { res.writeHead(404); res.end(); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    t.after(async () => {
        await browser.close();
        await new Promise(resolve => server.close(resolve));
        fs.rmSync(dir, { recursive: true, force: true });
    });

    const port = server.address().port;
    const base = `http://127.0.0.1:${port}`;
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    // 1. Player card shows Confirm Mode banner and Pending badge without counting as bingo
    await page.goto(`${base}/bingo-play.html?t=${nova.token}`, { waitUntil: 'networkidle0' });
    const playCheck = await page.evaluate(() => ({
        banner: document.querySelector('.status-banner')?.textContent || '',
        pendingCells: document.querySelectorAll('.cell.is-pending').length,
        pendingTags: document.querySelectorAll('.pending-tag').length,
        pillText: document.querySelector('.topbar .pill')?.textContent?.trim() || ''
    }));
    assert.match(playCheck.banner, /Confirm Mode active/i);
    assert.equal(playCheck.pendingCells, 1);
    assert.equal(playCheck.pendingTags, 1);
    assert.equal(playCheck.pillText, '3/9');

    // 2. Host Studio builds LAN share URL (192.168.50.10, not 127.0.0.1), shows pending badge & Host Caller review panel + chips
    await page.goto(`${base}/tools/bingo.html`, { waitUntil: 'networkidle0' });
    const studioCheck = await page.evaluate(() => {
        const shareUrl = document.querySelector('.mpb-url-row code')?.textContent || '';
        const pendingBadge = document.getElementById('mpb-caller-pending-badge')?.textContent?.trim() || '';
        const lanOptions = Array.from(document.querySelectorAll('#mpb-lan-ip-select option')).map(o => o.value);
        document.getElementById('btn-toggle-caller').click();
        const pendingItems = document.querySelectorAll('.mpb-pending-item').length;
        const stampedChips = document.querySelectorAll('.mpb-caller-chip.is-stamped').length;
        const pendingChips = document.querySelectorAll('.mpb-caller-chip.is-pending').length;
        return { shareUrl, pendingBadge, lanOptions, pendingItems, stampedChips, pendingChips };
    });
    assert.ok(studioCheck.shareUrl.startsWith(`http://192.168.50.10:${port}/bingo-play.html?t=`), `expected LAN share URL, got ${studioCheck.shareUrl}`);
    assert.equal(studioCheck.pendingBadge, '1');
    assert.deepEqual(studioCheck.lanOptions, ['192.168.50.10', '10.0.0.5']);
    assert.equal(studioCheck.pendingItems, 1);
    assert.equal(studioCheck.stampedChips, 3);
    assert.equal(studioCheck.pendingChips, 1);

    // 3. Confirm the 4th corner -> overlay shows BINGO banner via Four Corners
    service.confirmPendingCalls({ all: true });
    await page.goto(`${base}/overlays/multiplayer-bingo.html?view=multi`, { waitUntil: 'networkidle0' });
    const overlayBingo = await page.evaluate(() => ({
        banner: document.querySelector('.mp-bingo-banner')?.textContent || '',
        winningCells: document.querySelectorAll('.mp-cell.is-winning').length
    }));
    assert.equal(overlayBingo.banner, 'BINGO!');
    assert.equal(overlayBingo.winningCells, 4);

    assert.deepEqual(errors, []);
});

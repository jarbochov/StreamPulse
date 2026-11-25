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

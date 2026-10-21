const assert = require('node:assert/strict');
const http = require('node:http');
const { test } = require('node:test');
const { createOverlayRoutes } = require('../server/routes/overlays');

test('randomizer scale stays URL-only and Companion inherits Studio settings', async t => {
    const broadcasts = [];
    const handler = createOverlayRoutes({
        broadcastToOverlays: (type, payload) => broadcasts.push({ type, payload }),
        loadRandomizerButtonPresets: () => [{ id: 'games', phrases: ['Pick a game', 'Choose one'] }]
    });
    const server = http.createServer(async (req, res) => {
        const url = new URL(req.url, 'http://localhost');
        if (!await handler(req, res, url, url.pathname)) {
            res.writeHead(404);
            res.end();
        }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => server.close(resolve)));
    const origin = `http://127.0.0.1:${server.address().port}`;

    const invalidState = await fetch(`${origin}/api/randomizer/state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
    });
    assert.equal(invalidState.status, 400);

    const studioState = {
        preset: 'studio-state',
        choices: ['State Harbor', 'State Meadow'],
        mode: 'wheel',
        suspense: 'normal',
        duration: 7,
        autohide: 15,
        showButton: true,
        buttonPreset: 'chaos',
        buttonPhrases: ['Persisted Studio phrase']
    };
    const stateSaved = await fetch(`${origin}/api/randomizer/state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(studioState)
    });
    assert.equal(stateSaved.status, 200);

    const restored = await fetch(`${origin}/api/randomizer/spin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inheritStudioSettings: true })
    });
    assert.equal(restored.status, 200);
    assert.equal(broadcasts[0].payload.mode, 'wheel');
    assert.equal(broadcasts[0].payload.duration, 7);
    assert.equal(broadcasts[0].payload.autohide, 15);
    assert.equal(broadcasts[0].payload.showButton, true);
    assert.deepEqual(broadcasts[0].payload.buttonPhrases, ['Persisted Studio phrase']);

    const studioSettings = {
        preset: 'studio-choice',
        choices: ['Fictional Harbor', 'Fictional Meadow'],
        mode: 'deck',
        suspense: 'tricky',
        duration: 10,
        autohide: 0,
        showButton: true,
        buttonPreset: 'chaos',
        buttonPhrases: ['Studio phrase'],
        winnerHeader: 'Studio title',
        winnerSub: 'Studio phrase'
    };
    const withoutQuery = await fetch(`${origin}/api/randomizer/spin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...studioSettings, scale: '2' })
    });
    assert.equal(withoutQuery.status, 200);
    assert.equal(broadcasts[1].type, 'randomizer-spin');
    assert.equal(broadcasts[1].payload.duration, 10);
    assert.equal(broadcasts[1].payload.autohide, 0, 'zero keeps the winner visible indefinitely');
    assert.equal(broadcasts[1].payload.mode, 'deck');
    assert.equal(broadcasts[1].payload.scale, '');

    const inherited = await fetch(`${origin}/api/randomizer/spin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inheritStudioSettings: true })
    });
    assert.equal(inherited.status, 200);
    assert.equal(broadcasts[2].payload.duration, 10);
    assert.equal(broadcasts[2].payload.autohide, 0);
    assert.equal(broadcasts[2].payload.showButton, true, 'an inherited Companion spin retains Studio button visibility');
    assert.deepEqual(broadcasts[2].payload.buttonPhrases, ['Studio phrase']);
    assert.equal(broadcasts[2].payload.scale, '');
    assert.equal(broadcasts[2].payload.preset, 'studio-choice');

    const withQuery = await fetch(`${origin}/api/randomizer/spin?scale=1.25`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            inheritStudioSettings: true,
            buttonPreset: 'games',
            showButton: false,
            mode: 'wheel'
        })
    });
    assert.equal(withQuery.status, 200);
    assert.equal(broadcasts[3].payload.scale, '1.25');
    assert.equal(broadcasts[3].payload.showButton, false);
    assert.equal(broadcasts[3].payload.mode, 'wheel');
    assert.deepEqual(broadcasts[3].payload.buttonPhrases, ['Pick a game', 'Choose one']);

    const staticButton = await fetch(`${origin}/api/randomizer/spin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            inheritStudioSettings: true,
            buttonPreset: 'static',
            buttonText: 'Spin now'
        })
    });
    assert.equal(staticButton.status, 200);
    assert.equal(broadcasts[4].payload.buttonPreset, 'static');
    assert.equal(broadcasts[4].payload.buttonText, 'Spin now');
});

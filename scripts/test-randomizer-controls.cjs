const assert = require('node:assert/strict');
const http = require('node:http');
const { test } = require('node:test');
const { createOverlayRoutes } = require('../server/routes/overlays');

test('randomizer scale is accepted from URL parameters, not JSON bodies', async t => {
    const broadcasts = [];
    const handler = createOverlayRoutes({ broadcastToOverlays: (type, payload) => broadcasts.push({ type, payload }) });
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

    const body = { choices: ['Fictional Harbor', 'Fictional Meadow'], mode: 'deck', duration: 8, scale: '2' };
    const withoutQuery = await fetch(`${origin}/api/randomizer/spin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    assert.equal(withoutQuery.status, 200);
    assert.equal(broadcasts[0].type, 'randomizer-spin');
    assert.equal(broadcasts[0].payload.duration, 8);
    assert.equal(broadcasts[0].payload.mode, 'deck');
    assert.equal(broadcasts[0].payload.scale, '');

    const withQuery = await fetch(`${origin}/api/randomizer/spin?scale=1.25`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    assert.equal(withQuery.status, 200);
    assert.equal(broadcasts[1].payload.scale, '1.25');
});

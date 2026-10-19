const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { test } = require('node:test');
const { WebSocketServer } = require('ws');
const puppeteer = require('puppeteer');
const widget = require('../public/js/poll-widget');
const { normalizeCustomOverlay, normalizeOverlayPresets, generateSvgThumbnail } = require('../server/services/overlays');
const { createStaticRouter } = require('../server/static-router');

const poll = (count, status = 'ACTIVE', votes) => ({
    id: `fixture-${count}`, title: 'Which route should we explore?',
    status, duration: 120, startedAt: new Date(Date.now() - 30000).toISOString(), endedAt: new Date().toISOString(),
    choices: Array.from({ length: count }, (_, i) => ({
        id: `choice-${i}`, title: `Route ${i + 1}`, votes: votes?.[i] ?? (count - i) * 3
    }))
});

test('poll display adapts to 2-5 choices with accurate zero, tie, expiry, and preview behavior', () => {
    for (let count = 2; count <= 5; count++) {
        const data = widget.model(poll(count));
        assert.equal(data.choices.length, count);
        assert.equal(data.total, count * (count + 1) / 2 * 3);
        assert.ok(Math.abs(data.choices.reduce((sum, c) => sum + c.percent, 0) - 100) < .00001);
        assert.ok(data.choices.every(choice => !choice.winner), 'active leaders are not final winners');
    }
    const tied = widget.model(poll(3, 'COMPLETED', [10, 10, 2]));
    assert.equal(tied.label, 'Tie');
    assert.deepEqual(tied.choices.map(choice => choice.winner), [true, true, false]);
    const zero = widget.model(poll(2, 'COMPLETED', [0, 0]));
    assert.equal(zero.label, 'No votes');
    assert.ok(zero.choices.every(choice => !choice.winner && choice.percent === 0));
    const ended = poll(2, 'COMPLETED');
    const now = Date.parse(ended.endedAt);
    assert.ok(widget.model(ended, { resultsSeconds: 15 }, { now: now + 14999 }));
    assert.equal(widget.model(ended, {}, { now: now + 15000 }), null);
    assert.equal(widget.model(ended, {}, { preview: true, now: now + 15000 }).sample, true);
    assert.equal(widget.model({ ...ended, choices: [null, {}] }), null);
    assert.equal(widget.model({ ...ended, choices: [null, {}] }, {}, { preview: true }).sample, true);
    assert.equal(widget.model(ended, { resultsSeconds: 0 }, { now }), null);
    assert.equal(widget.model(poll(3, 'MODERATED')), null);
    assert.equal(widget.model(null, { previewMode: 'sample' }), null, 'production never synthesizes votes');
    assert.equal(widget.model(null, { previewMode: 'live' }, { preview: true }), null);
    assert.equal(widget.model(null, { sampleChoices: 5 }, { preview: true }).choices.length, 5);
    assert.equal(widget.model(poll(2), { previewMode: 'sample', sampleChoices: 4 }, { preview: true }).choices.length, 4);
    assert.equal(widget.model(poll(2), { previewMode: 'sample', sampleChoices: 4 }).choices.length, 2);
    const voting = poll(2);
    const start = Date.parse(voting.startedAt);
    assert.equal(widget.model(voting, {}, { now: start + 30000 }).remaining, 90);
    const closing = widget.model(voting, {}, { now: start + 120000 });
    assert.equal(closing.remaining, 0);
    assert.equal(closing.label, 'Closing');
    assert.ok(closing.choices.every(choice => !choice.winner));
});

test('poll elements and presets survive normalization and thumbnail generation', () => {
    const element = {
        id: 'fixture-poll', type: 'poll', x: 0, y: 0, width: 400, height: 150,
        style: { fontSize: 12, background: '#111827', color: '#fff' },
        poll: { sampleChoices: 5, resultsSeconds: 0, accent: '#facc15', showVotes: false, previewMode: 'sample' }
    };
    const saved = normalizeCustomOverlay({
        id: 'fixture', canvas: { width: 400, height: 150 }, elements: [element]
    });
    assert.equal(saved.elements[0].type, 'poll');
    assert.equal(saved.elements[0].poll.sampleChoices, 5);
    assert.equal(saved.elements[0].poll.resultsSeconds, 0);
    assert.equal(saved.elements[0].poll.showVotes, false);
    assert.match(generateSvgThumbnail(saved), /Poll question/);
    const presets = normalizeOverlayPresets([{ id: 'poll-preset', elements: saved.elements }]);
    assert.equal(presets[0].elements[0].poll.accent, '#facc15');
    assert.equal(widget.settings({ sampleChoices: 99, resultsSeconds: -10 }).sampleChoices, 5);
    assert.equal(widget.settings({ resultsSeconds: -10 }).resultsSeconds, 0);
});

test('real editor and runtime share adaptive poll rendering, live updates, styling, and safe samples', { timeout: 60000 }, async t => {
    const rootDir = path.resolve(__dirname, '..');
    const router = createStaticRouter({ rootDir, publicDir: path.join(rootDir, 'public') });
    let latest = null;
    const overlay = normalizeCustomOverlay({
        id: 'fixture', name: 'Fictional poll overlay', canvas: { width: 400, height: 150 },
        elements: [{
            id: 'fixture-poll', type: 'poll', x: 0, y: 0, width: 400, height: 150,
            poll: { previewMode: 'auto' }, style: { fontSize: 12, fontFamily: 'sans-serif', color: '#fff', background: '#111827' }
        }]
    });
    const server = http.createServer((req, res) => {
        const url = new URL(req.url, 'http://fixture.local');
        if (url.pathname.startsWith('/api/')) {
            res.setHeader('Content-Type', 'application/json');
            if (url.pathname === '/api/status') res.end(JSON.stringify({ poll: latest, theme: {} }));
            else if (url.pathname === '/api/custom-overlays/fixture') {
                if (req.method === 'PUT') {
                    let body = '';
                    req.on('data', chunk => { body += chunk; });
                    req.on('end', () => {
                        Object.assign(overlay, normalizeCustomOverlay(JSON.parse(body)));
                        res.end(JSON.stringify(overlay));
                    });
                } else res.end(JSON.stringify(overlay));
            } else if (url.pathname === '/api/custom-overlays/fixture/page') res.end('{"page":"page-1"}');
            else if (url.pathname === '/api/config') res.end('{"theme":{}}');
            else res.end('[]');
        } else if (!router.handleRequest(req, res)) { res.writeHead(404); res.end(); }
    });
    const wss = new WebSocketServer({ server });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    t.after(async () => {
        await browser.close();
        wss.clients.forEach(socket => socket.terminate());
        await new Promise(resolve => wss.close(resolve));
        await new Promise(resolve => server.close(resolve));
    });
    const origin = `http://127.0.0.1:${server.address().port}`;
    const errors = [];
    async function open(route) {
        const page = await browser.newPage();
        await page.setViewport({ width: 1440, height: 900 });
        page.on('pageerror', error => errors.push(error.message));
        await page.setRequestInterception(true);
        page.on('request', request => {
            if (new URL(request.url()).origin === origin) request.continue();
            else request.respond({ status: 200, body: '' });
        });
        await page.goto(origin + route);
        await page.waitForSelector('.sp-poll');
        return page;
    }
    const editor = await open('/custom-overlay-editor.html?id=fixture&select=fixture-poll');
    await editor.waitForSelector('[data-path="poll.sampleChoices"]');
    await editor.evaluate(async () => {
        const { state, prefs } = await import('/js/editor/editor-state.js');
        const { renderCanvas } = await import('/js/editor/editor-canvas.js');
        const { renderProperties } = await import('/js/editor/editor-inspector.js');
        prefs.live = true;
        window.pollFixture = { state, prefs, renderCanvas, renderProperties };
        renderCanvas();
    });
    const production = await open('/custom-overlay.html?id=fixture');
    const preview = await open('/custom-overlay.html?id=fixture&preview=true');
    assert.equal(await production.$eval('.sp-poll', node => getComputedStyle(node.parentNode).visibility), 'hidden');
    assert.equal(await production.$eval('.sp-poll', node => {
        node.parentNode.style.visibility = '';
        return getComputedStyle(node.parentNode).visibility;
    }), 'hidden', 'page transition visibility resets cannot reveal an unavailable panel');
    assert.equal(await editor.$eval('.sp-poll-content', node => node.dataset.sample), 'true');
    assert.equal(await preview.$eval('.sp-poll-content', node => node.dataset.sample), 'true');
    const push = data => {
        latest = data;
        for (const socket of wss.clients) socket.send(JSON.stringify({ type: 'poll-update', data }));
    };
    for (const count of [2, 3, 4, 5, 2]) {
        push(poll(count));
        for (const page of [editor, production, preview]) {
            await page.bringToFront();
            await page.waitForFunction(n => document.querySelectorAll('.sp-poll-choice').length === n && document.querySelector('.sp-poll-content').dataset.sample === 'false', {}, count);
            assert.equal(await page.$eval('.sp-poll', node => getComputedStyle(node.parentNode).visibility), 'visible');
            const dimensions = await page.$eval('.sp-poll', node => {
                const rect = node.getBoundingClientRect();
                return [...node.querySelectorAll('.sp-poll-choice, .sp-poll-header, .sp-poll-footer')].every(child => {
                    const box = child.getBoundingClientRect();
                    return box.top >= rect.top - 1 && box.bottom <= rect.bottom + 1 && box.right <= rect.right + 1;
                });
            });
            assert.equal(dimensions, true, `${count} choices fit inside the 400x150 element`);
            assert.equal(await page.$$eval('.sp-poll-choice', nodes => nodes.every(node => {
                const row = node.getBoundingClientRect();
                const label = node.querySelector('.sp-poll-label').getBoundingClientRect();
                const track = node.querySelector('.sp-poll-track').getBoundingClientRect();
                return label.top >= row.top - .5 && track.bottom <= row.bottom + .5 && label.bottom <= track.top;
            })), true, `${count} labels and tracks do not overlap`);
        }
        await production.bringToFront();
    }
    push(poll(3, 'COMPLETED', [5, 5, 0]));
    await production.waitForFunction(() => document.querySelectorAll('[data-winner="true"]').length === 2);
    assert.match(await production.$eval('.sp-poll-footer', node => node.textContent), /Tie/);
    push(poll(3, 'COMPLETED', [0, 0, 0]));
    await production.waitForFunction(() => document.querySelector('.sp-poll-footer').textContent.includes('No votes'));
    assert.equal(await production.$$eval('[data-winner="true"]', nodes => nodes.length), 0);
    const hostile = poll(5);
    hostile.title = '<img src=x onerror=alert(1)> A deliberately long question to test truncation';
    hostile.choices[0].title = '<script>alert(1)</script> A very long route name that should remain inside its result bar';
    push(hostile);
    await production.waitForFunction(() => document.querySelectorAll('.sp-poll-choice').length === 5);
    assert.equal(await production.$$eval('.sp-poll img, .sp-poll script', nodes => nodes.length), 0);
    await production.evaluate(() => { window.originalPollRow = document.querySelector('.sp-poll-choice'); });
    push({ ...hostile, choices: hostile.choices.map(choice => ({ ...choice, votes: choice.votes + 1 })) });
    await production.waitForFunction(() => document.querySelector('.sp-poll-metric').textContent.startsWith('16'));
    assert.equal(await production.evaluate(() => window.originalPollRow === document.querySelector('.sp-poll-choice')), true, 'live vote updates reuse row DOM');
    assert.equal(await production.evaluate(() => {
        const node = document.querySelector('.sp-poll').parentNode;
        const element = { width: 400, height: 150, style: { fontSize: 100 } };
        const data = { status: 'ACTIVE', duration: 120, startedAt: new Date(10000).toISOString(), choices: Array.from({ length: 5 }, (_, i) => ({ title: `Route ${i}`, votes: i })) };
        window.PollWidget.render(node, element, data, { now: 20000 });
        const observer = new window.MutationObserver(() => {});
        observer.observe(node, { childList: true, subtree: true });
        window.PollWidget.render(node, element, data, { now: 21000 });
        const changed = observer.takeRecords();
        observer.disconnect();
        return changed.every(record => record.target.classList.contains('sp-poll-timer'));
    }), true, 'countdown ticks do not replace unchanged row text');
    assert.equal(await production.$$eval('.sp-poll-choice', nodes => nodes.every(node => {
        const row = node.getBoundingClientRect();
        const label = node.querySelector('.sp-poll-label').getBoundingClientRect();
        const track = node.querySelector('.sp-poll-track').getBoundingClientRect();
        return label.top >= row.top - .5 && track.bottom <= row.bottom + .5 && label.bottom <= track.top;
    })), true, 'large font settings shrink enough for five rows');

    await editor.bringToFront();
    await editor.evaluate(() => {
        const input = document.querySelector('[data-path="poll.previewMode"]');
        input.value = 'sample';
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await editor.waitForFunction(() => window.pollFixture.state.overlay.elements[0].poll.previewMode === 'sample');
    await editor.evaluate(() => {
        const count = document.querySelector('[data-path="poll.sampleChoices"]');
        count.value = '5';
        count.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await editor.waitForFunction(() => document.querySelectorAll('.sp-poll-choice').length === 5 && document.querySelector('.sp-poll-content').dataset.sample === 'true');
    await editor.evaluate(() => {
        const input = document.querySelector('[data-path="poll.previewMode"]');
        input.value = 'live';
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await editor.waitForFunction(() => !document.querySelector('[data-path="poll.sampleChoices"]'));
    assert.equal(await editor.$('[data-path="poll.sampleChoices"]'), null, 'irrelevant sample controls are hidden');
    await editor.evaluate(() => {
        const fixture = window.pollFixture;
        const el = fixture.state.overlay.elements[0];
        el.width = 800; el.height = 300;
        fixture.renderCanvas();
    });
    const font = await editor.$eval('.sp-poll-name', node => parseFloat(getComputedStyle(node).fontSize));
    assert.ok(font >= 20, `resizing scales poll typography (${font}px)`);
    push(null);
    await production.bringToFront();
    await production.waitForFunction(() => getComputedStyle(document.querySelector('.sp-poll').parentNode).visibility === 'hidden');
    await editor.bringToFront();
    await editor.waitForFunction(() => document.querySelector('.sp-poll-title').textContent === 'No current poll');
    const expired = poll(2, 'COMPLETED');
    expired.endedAt = new Date(Date.now() - 16000).toISOString();
    push(expired);
    await production.bringToFront();
    await production.waitForFunction(() => getComputedStyle(document.querySelector('.sp-poll').parentNode).visibility === 'hidden');
    await editor.bringToFront();
    await editor.evaluate(async () => {
        const { state } = window.pollFixture;
        const { createElementData } = await import('/js/editor/editor-state.js');
        const { placePreset, save } = await import('/js/editor/editor-main.js');
        const preset = window.OverlayPresets.list().find(item => item.id === 'compact-poll');
        if (!preset) throw new Error('Compact poll preset missing');
        const added = createElementData('poll');
        if (added.width !== 400 || added.height !== 150) throw new Error('Wrong add-menu defaults');
        placePreset(preset);
        const element = state.overlay.elements.at(-1);
        if (element.type !== 'poll' || element.group) throw new Error('Preset must insert one editable poll element, not a group');
        await save();
    });
    assert.equal(overlay.elements.at(-1).type, 'poll');
    assert.equal(overlay.elements.at(-1).width, 400);
    assert.deepEqual(errors, []);
});

'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

async function installCompetitiveFixture(page, responses = {}) {
    await page.setRequestInterception(true);
    page.on('request', async request => {
        const url = new URL(request.url());
        if (url.protocol === 'file:') {
            await request.continue();
            return;
        }
        if (url.hostname !== 'competitive-fixture.test') {
            await request.abort();
            return;
        }
        const publicRoot = path.resolve(__dirname, '../public');
        const filename = path.resolve(publicRoot, '.' + decodeURIComponent(url.pathname));
        if (!filename.startsWith(publicRoot + path.sep)) {
            await request.abort();
            return;
        }
        try {
            const contentTypes = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
            await request.respond({ status: 200, contentType: contentTypes[path.extname(filename)] || 'application/octet-stream', body: await fs.readFile(filename) });
        } catch {
            await request.respond({ status: 404, body: '' });
        }
    });
    await page.evaluateOnNewDocument(initialResponses => {
        const fixture = window.competitiveFixture = { requests: [], sockets: [], now: Date.now(), sounds: 0 };
        Date.now = () => fixture.now;
        window.Audio = class {
            play() { fixture.sounds++; return Promise.resolve(); }
        };
        window.fetch = (url, options = {}) => {
            if (!['/api/polls/latest', '/api/matchup', '/api/tournament'].includes(String(url)) && !options.method) {
                return Promise.resolve({ ok: true, json: async () => ({}) });
            }
            const request = { url: String(url), options, settled: false };
            fixture.requests.push(request);
            return new Promise(resolve => {
                request.respond = data => {
                    request.settled = true;
                    resolve({ ok: true, json: async () => data });
                };
                if (!options.method && Object.hasOwn(initialResponses, request.url)) request.respond(initialResponses[request.url]);
                else if (options.method && Object.hasOwn(initialResponses, `${options.method} ${request.url}`)) request.respond(initialResponses[`${options.method} ${request.url}`]);
            });
        };
        window.WebSocket = class {
            constructor(url) {
                this.url = url;
                this.readyState = 1;
                this.sent = [];
                fixture.sockets.push(this);
                window.queueMicrotask(() => this.onopen?.());
            }
            send(value) { this.sent.push(JSON.parse(value)); }
            receive(type, data) { this.onmessage?.({ data: JSON.stringify({ type, data }) }); }
            close() { this.readyState = 3; this.onclose?.(); }
        };
        window.WebSocket.OPEN = 1;
        window.WebSocket.CLOSED = 3;
    }, responses);
}

module.exports = { installCompetitiveFixture };

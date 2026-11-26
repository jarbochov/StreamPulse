'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const engine = require('../shared/credit-suite-engine.cjs');
const { createCreditSuiteService } = require('../server/services/credit-suite');
const { createCreditSuiteExporter } = require('../server/services/credit-suite-exporter');
const { createCreditSuiteRoutes } = require('../server/routes/credit-suite');
const { createStaticRouter } = require('../server/static-router');

function requestRaw(port, method, reqPath, body) {
    return new Promise((resolve, reject) => {
        const payload = body !== undefined ? JSON.stringify(body) : null;
        const req = http.request({
            hostname: '127.0.0.1',
            port,
            path: reqPath,
            method,
            headers: payload ? {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            } : {}
        }, res => {
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => {
                const buf = Buffer.concat(chunks);
                const text = buf.toString('utf8');
                let json = null;
                try { json = JSON.parse(text); } catch {}
                resolve({ status: res.statusCode, headers: res.headers, body: json ?? text, buffer: buf });
            });
        });
        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

describe('Credit Suite — Independent Cinematic Credits Module', () => {
    let tmpDir;
    let service;
    let exporter;
    let server;
    let port;
    let transportEvents;

    before(async () => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-credit-suite-'));
        transportEvents = [];

        const mockVarsState = {
            variables: [
                { key: 'vip_list', label: 'VIP List', type: 'list', items: ['Alice', 'Bob', 'Charlie'] }
            ],
            sets: [
                {
                    id: 'crew-set',
                    label: 'Studio Crew',
                    fields: [{ key: 'name', label: 'Name' }, { key: 'role', label: 'Role' }],
                    entries: [
                        { id: 'e1', enabled: true, values: { name: 'Dana Sterling', role: 'Camera' } },
                        { id: 'e2', enabled: true, values: { name: 'Evan Cho', role: 'Lighting' } }
                    ]
                }
            ]
        };

        const mockSession = {
            subscribers: [{ displayName: 'SubOne' }, { displayName: 'SubTwo' }],
            moderators: [{ displayName: 'ModPrime' }],
            chatters: { ChatterA: 5, ChatterB: 2 }
        };

        service = createCreditSuiteService({
            dataDir: tmpDir,
            onTransport: snap => transportEvents.push(snap),
            getVariablesState: () => mockVarsState,
            getSessionData: () => mockSession
        });

        let baseUrl = '';
        exporter = createCreditSuiteExporter({
            exportsDir: service.exportsDir,
            getBaseUrl: () => baseUrl
        });

        const handleCreditSuiteRoutes = createCreditSuiteRoutes({
            creditSuiteService: service,
            creditSuiteExporter: exporter
        });

        const staticRouter = createStaticRouter({
            rootDir: path.resolve(__dirname, '..'),
            publicDir: path.resolve(__dirname, '../public'),
            dataDir: tmpDir
        });

        server = http.createServer(async (req, res) => {
            const url = new URL(req.url, 'http://127.0.0.1');
            if (await handleCreditSuiteRoutes(req, res, url, url.pathname)) return;
            if (url.pathname === '/api/variables') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(mockVarsState));
                return;
            }
            if (staticRouter.handleRequest(req, res)) return;
            res.writeHead(404);
            res.end('Not found');
        });

        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
    });

    after(async () => {
        if (server) await new Promise(resolve => server.close(resolve));
        if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('solves mixed Card + Crawl timelines in both speed and exact-duration modes', () => {
        const proj = engine.buildDefaultProjects()[0];
        const solvedSpeed = engine.solveTimeline(proj);
        assert.ok(solvedSpeed.segments.length >= 3, 'default project mixes opening card, crawl run, and ending card');
        assert.ok(solvedSpeed.totalDurationSec > 10);
        assert.ok(solvedSpeed.markers.some(m => m.name === 'Cast & Crew'));

        // Exact duration mode hits targetDurationSec accurately
        const exactProj = engine.normalizeProject({
            ...proj,
            timing: { ...proj.timing, mode: 'duration', targetDurationSec: 40 }
        });
        const solvedDur = engine.solveTimeline(exactProj);
        assert.ok(Math.abs(solvedDur.sequenceEndSec - 40) < 0.05, `expected ~40s, got ${solvedDur.sequenceEndSec}`);
    });

    it('auto-places sections per-column without sideways glide (and supports optional glide mode)', () => {
        // 1. Default per-section mode: block overlapping left-side clip is placed in 'right' column,
        // and the next section after side media disappears is automatically placed 'center' with vertical clearance
        const perSecProj = engine.normalizeProject({
            id: 'reflow-per-section',
            name: 'Per-Section Reflow Test',
            timing: { mode: 'speed', speedPxPerSec: 100, leadInSec: 0, leadOutSec: 0 },
            theme: { autoReflow: { enabled: true, mode: 'per-section', splitRatio: 50, gapPx: 40 } },
            blocks: [
                { id: 'b-side', type: 'section', presentation: 'crawl', title: 'Cast', content: 'A\nB\nC\nD\nE' },
                { id: 'b-next', type: 'section', presentation: 'crawl', title: 'Thanks', content: 'X\nY\nZ' }
            ],
            tracks: [
                {
                    id: 't-side',
                    name: 'Side',
                    layer: 'side',
                    visible: true,
                    clips: [
                        {
                            id: 'left-vid',
                            elementType: 'video',
                            timingMode: 'block',
                            anchorBlockId: 'b-side',
                            anchorSpanBlocks: 1,
                            x: 4,
                            y: 15,
                            width: 40,
                            height: 70,
                            pushCredits: 'auto'
                        }
                    ]
                }
            ]
        });

        const solvedPerSec = engine.solveTimeline(perSecProj);
        assert.equal(solvedPerSec.blockTimings['b-side'].zone, 'right', 'block alongside left clip is born in right column');
        assert.equal(solvedPerSec.blockTimings['b-next'].zone, 'center', 'next section after side clip returns cleanly to center');
        assert.ok(solvedPerSec.blockTimings['b-next'].clearanceTopPx > 0, 'auto-clearance prevents centered section from colliding with fading side clip');
        const midFrame = engine.evaluateFrame(solvedPerSec.blockTimings['b-side'].centerSec, solvedPerSec, perSecProj);
        assert.equal(midFrame.reflow.centerXPercent, 50, 'no jarring horizontal container shift in per-section mode');

        // 2. Optional smooth glide mode
        const glideProj = engine.normalizeProject({
            id: 'reflow-glide',
            name: 'Glide Reflow Test',
            timing: { mode: 'speed', speedPxPerSec: 100, leadInSec: 0, leadOutSec: 0 },
            theme: { autoReflow: { enabled: true, mode: 'glide', transitionSec: 1.0, splitRatio: 50, gapPx: 40 } },
            blocks: [
                { id: 'b1', type: 'section', presentation: 'crawl', title: 'Crew', content: 'A\nB\nC\nD\nE\nF\nG\nH\nI\nJ\nK\nL' }
            ],
            tracks: [
                {
                    id: 't-side',
                    name: 'Side',
                    layer: 'side',
                    visible: true,
                    clips: [
                        {
                            id: 'left-vid',
                            elementType: 'video',
                            timingMode: 'timecode',
                            startSec: 5,
                            durationSec: 5,
                            x: 4,
                            y: 15,
                            width: 40,
                            height: 70,
                            pushCredits: 'auto'
                        }
                    ]
                }
            ]
        });

        const solvedGlide = engine.solveTimeline(glideProj);
        assert.equal(engine.evaluateFrame(1.0, solvedGlide, glideProj).reflow.zone, 'center');
        assert.ok(engine.evaluateFrame(7.5, solvedGlide, glideProj).reflow.centerXPercent > 65);
        assert.equal(engine.evaluateFrame(12.0, solvedGlide, glideProj).reflow.zone, 'center');
    });

    it('keeps block-anchored side clips synced when earlier blocks are inserted', () => {
        const baseProj = engine.normalizeProject({
            id: 'anchor-test',
            blocks: [
                { id: 'intro', type: 'featured', presentation: 'card', title: 'Intro', duration: 4 },
                { id: 'cast', type: 'section', presentation: 'crawl', title: 'Cast', content: 'One\nTwo\nThree' }
            ],
            tracks: [
                {
                    id: 'side',
                    layer: 'side',
                    clips: [{ id: 'c1', timingMode: 'block', anchorBlockId: 'cast', anchorOffsetSec: 0, x: 5, width: 40 }]
                }
            ]
        });

        const s1 = engine.solveTimeline(baseProj);
        const t1 = s1.resolvedClips[0].startSec;

        // Insert a 6-second featured card before the crawl
        const shiftedProj = engine.normalizeProject({
            ...baseProj,
            blocks: [
                baseProj.blocks[0],
                { id: 'extra', type: 'featured', presentation: 'card', title: 'Extra', duration: 6 },
                baseProj.blocks[1]
            ]
        });
        const s2 = engine.solveTimeline(shiftedProj);
        const t2 = s2.resolvedClips[0].startSec;
        assert.ok(Math.abs((t2 - t1) - 6) < 0.05, `anchored clip should shift by +6s (got ${t2 - t1}s)`);
    });

    it('supports REST CRUD, Companion GET/POST transport, SRT download, and conflict-safe Data Source pulls', async () => {
        const listRes = await requestRaw(port, 'GET', '/api/credit-suite');
        assert.equal(listRes.status, 200);
        assert.ok(listRes.body.projects.length >= 2);

        const statusRes = await requestRaw(port, 'GET', '/api/credit-suite/status');
        assert.equal(statusRes.status, 200);
        assert.equal(statusRes.body.activeProjectId, 'cinematic-feature');

        // Companion GET transport triggers
        const playRes = await requestRaw(port, 'GET', '/api/credit-suite/play');
        assert.equal(playRes.status, 200);
        assert.equal(playRes.body.transport.playing, true);

        const jumpRes = await requestRaw(port, 'GET', '/api/credit-suite/jump?marker=Cast');
        assert.equal(jumpRes.status, 200);
        assert.ok(jumpRes.body.transport.timeSec > 0);

        const stopRes = await requestRaw(port, 'GET', '/api/credit-suite/stop');
        assert.equal(stopRes.status, 200);
        assert.equal(stopRes.body.transport.playing, false);
        assert.equal(stopRes.body.transport.timeSec, 0);
        assert.ok(transportEvents.length >= 3);

        // SRT download
        const srtRes = await requestRaw(port, 'GET', '/api/credit-suite/projects/cinematic-feature/srt');
        assert.equal(srtRes.status, 200);
        assert.match(String(srtRes.body), /-->/);
        assert.match(String(srtRes.body), /CAST & CREW/);

        // Data sources discovery & conflict-safe pull
        const dsRes = await requestRaw(port, 'GET', '/api/credit-suite/data-sources');
        assert.equal(dsRes.status, 200);
        assert.equal(dsRes.body.variableSets.length, 1);
        assert.equal(dsRes.body.listVariables.length, 1);

        const pullRes = await requestRaw(port, 'POST', '/api/credit-suite/data-sources/pull', {
            block: {
                type: 'roster',
                dataSource: { type: 'variable-set', sourceId: 'crew-set', field: 'name' },
                names: [
                    { id: 'n-existing', sourceKey: 'e1', name: 'Old Dana', editedName: 'Dana "Director" Sterling', checked: false }
                ]
            }
        });
        assert.equal(pullRes.status, 200);
        assert.equal(pullRes.body.count, 2);
        const dana = pullRes.body.names.find(n => n.sourceKey === 'e1');
        assert.equal(dana.checked, false, 'preserves unchecked state');
        assert.equal(dana.editedName, 'Dana "Director" Sterling', 'preserves manual edit override');
        assert.equal(pullRes.body.conflicts.length, 1, 'flags conflict when source name changed under manual edit');

        // Duplicate & delete lifecycle
        const dupRes = await requestRaw(port, 'POST', '/api/credit-suite/projects/cinematic-feature/duplicate');
        assert.equal(dupRes.status, 200);
        const copyId = dupRes.body.project.id;
        assert.notEqual(copyId, 'cinematic-feature');

        const delRes = await requestRaw(port, 'DELETE', `/api/credit-suite/projects/${encodeURIComponent(copyId)}`);
        assert.equal(delRes.status, 200);

        // Editable & deletable custom Cinema Themes CRUD + restore defaults
        const createThemeRes = await requestRaw(port, 'POST', '/api/credit-suite/themes', {
            createNew: true,
            theme: { name: 'My Noir Theme', headingFont: 'Oswald', accentColor: '#FF2A6DFF' }
        });
        assert.equal(createThemeRes.status, 200);
        const customThemeId = createThemeRes.body.theme.id;
        assert.equal(createThemeRes.body.theme.name, 'My Noir Theme');

        const updThemeRes = await requestRaw(port, 'PUT', `/api/credit-suite/themes/${encodeURIComponent(customThemeId)}`, {
            theme: { name: 'Noir v2', headingFont: 'Bebas Neue', accentColor: '#00F5D4FF' }
        });
        assert.equal(updThemeRes.status, 200);
        assert.equal(updThemeRes.body.theme.name, 'Noir v2');

        const delStarterRes = await requestRaw(port, 'DELETE', '/api/credit-suite/themes/clean-light');
        assert.equal(delStarterRes.status, 200);
        assert.equal(delStarterRes.body.themes.some(t => t.id === 'clean-light'), false);

        const resetThemesRes = await requestRaw(port, 'POST', '/api/credit-suite/themes/reset');
        assert.equal(resetThemesRes.status, 200);
        assert.equal(resetThemesRes.body.themes.some(t => t.id === 'clean-light'), true, 'restores deleted starter theme');
        assert.equal(resetThemesRes.body.themes.some(t => t.id === customThemeId), true, 'preserves custom themes on starter restore');

        const delCustomRes = await requestRaw(port, 'DELETE', `/api/credit-suite/themes/${encodeURIComponent(customThemeId)}`);
        assert.equal(delCustomRes.status, 200);
    });

    it('renders a real Full Tall PNG and a real transparent WebM VP9 Alpha video via Puppeteer + FFmpeg', async () => {
        // Create a quick 0.6s mini project for fast deterministic render verification
        const mini = service.upsertProject({
            id: 'export-smoke',
            name: 'Export Smoke',
            canvas: { preset: 'custom', width: 480, height: 270, fps: 10 },
            background: { type: 'transparent' },
            timing: { mode: 'speed', speedPxPerSec: 120, leadInSec: 0, leadOutSec: 0 },
            blocks: [
                { id: 'b-smoke', type: 'featured', presentation: 'card', title: 'CREDIT SUITE', subtitle: 'Render Test', duration: 0.6 }
            ]
        });

        // 1. Full Tall PNG export
        const pngStart = await requestRaw(port, 'POST', '/api/credit-suite/export', {
            projectId: mini.id,
            format: 'full-png',
            width: 480,
            height: 270,
            transparent: true
        });
        assert.equal(pngStart.status, 202);
        let pngJob = pngStart.body.job;
        for (let i = 0; i < 60 && (pngJob.status === 'queued' || pngJob.status === 'running'); i++) {
            await new Promise(r => setTimeout(r, 250));
            const poll = await requestRaw(port, 'GET', `/api/credit-suite/export/${encodeURIComponent(pngJob.id)}`);
            pngJob = poll.body.job;
        }
        assert.equal(pngJob.status, 'done', `PNG export failed: ${pngJob.error}`);
        assert.ok(pngJob.fileSize > 500, 'exported PNG has content');

        const pngDl = await requestRaw(port, 'GET', pngJob.downloadUrl);
        assert.equal(pngDl.status, 200);
        // PNG magic header: 89 50 4E 47
        assert.deepEqual([...pngDl.buffer.slice(0, 4)], [0x89, 0x50, 0x4e, 0x47]);

        // 2. WebM VP9 Alpha video export (if ffmpeg is installed)
        const caps = exporter.getCapabilities();
        if (caps.ffmpeg.available && caps.ffmpeg.encoders.libvpxVp9) {
            const vidStart = await requestRaw(port, 'POST', '/api/credit-suite/export', {
                projectId: mini.id,
                format: 'webm-alpha',
                width: 480,
                height: 270,
                fps: 10,
                durationSec: 0.5,
                transparent: true
            });
            assert.equal(vidStart.status, 202);
            let vidJob = vidStart.body.job;
            for (let i = 0; i < 120 && (vidJob.status === 'queued' || vidJob.status === 'running'); i++) {
                await new Promise(r => setTimeout(r, 250));
                const poll = await requestRaw(port, 'GET', `/api/credit-suite/export/${encodeURIComponent(vidJob.id)}`);
                vidJob = poll.body.job;
            }
            assert.equal(vidJob.status, 'done', `WebM alpha export failed: ${vidJob.error}`);
            assert.ok(vidJob.fileSize > 500, 'exported WebM has content');
            const vidDl = await requestRaw(port, 'GET', vidJob.downloadUrl);
            assert.equal(vidDl.status, 200);
            // EBML WebM magic header: 1A 45 DF A3
            assert.deepEqual([...vidDl.buffer.slice(0, 4)], [0x1a, 0x45, 0xdf, 0xa3]);
        }
    });

    it('ships modular Studio HTML/CSS/JS, Live Overlay, Nav links, Backup spec, and Operator card without raw emojis', () => {
        const root = path.resolve(__dirname, '..');
        const studioHtml = fs.readFileSync(path.join(root, 'public/tools/credit-suite.html'), 'utf8');
        const overlayHtml = fs.readFileSync(path.join(root, 'public/overlays/credit-suite.html'), 'utf8');
        const navJs = fs.readFileSync(path.join(root, 'public/js/nav.js'), 'utf8');
        const backupJs = fs.readFileSync(path.join(root, 'server/services/backup.js'), 'utf8');
        const opCardsJs = fs.readFileSync(path.join(root, 'public/js/operator/operator-live-cards.js'), 'utf8');

        assert.ok(studioHtml.includes('credit-suite-main.js'));
        assert.ok(studioHtml.includes('id="cs-timeline-grid"'));
        assert.ok(overlayHtml.includes('window.__creditSuiteSeek'));
        assert.ok(navJs.includes('/tools/credit-suite.html'));
        assert.ok(backupJs.includes('credit-suite'));
        assert.ok(opCardsJs.includes("type: 'credit-suite'"));

        // Verify strict no-emoji policy in Studio UI HTML
        assert.ok(!/[\u{1F300}-\u{1FAFF}]/u.test(studioHtml), 'credit-suite.html must not contain raw unicode emojis');
    });
});

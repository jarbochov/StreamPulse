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

    it('honors the credit_suite_enabled module gate (403 when disabled, status stays readable)', async () => {
        let enabled = false;
        const gated = createCreditSuiteRoutes({
            creditSuiteService: service,
            creditSuiteExporter: exporter,
            isCreditSuiteEnabled: () => enabled
        });
        const gateServer = http.createServer(async (req, res) => {
            const url = new URL(req.url, 'http://127.0.0.1');
            if (await gated(req, res, url, url.pathname)) return;
            res.writeHead(404); res.end();
        });
        await new Promise(resolve => gateServer.listen(0, '127.0.0.1', resolve));
        try {
            const gp = gateServer.address().port;
            const st = await requestRaw(gp, 'GET', '/api/credit-suite/status');
            assert.equal(st.status, 200);
            assert.equal(st.body.enabled, false);
            const root = await requestRaw(gp, 'GET', '/api/credit-suite');
            assert.equal(root.body.enabled, false);
            assert.equal((await requestRaw(gp, 'GET', '/api/credit-suite/play')).status, 403);
            assert.equal((await requestRaw(gp, 'GET', '/api/credit-suite/projects/cinematic-feature')).status, 403);
            enabled = true;
            assert.equal((await requestRaw(gp, 'GET', '/api/credit-suite/projects/cinematic-feature')).status, 200);
        } finally {
            await new Promise(resolve => gateServer.close(resolve));
        }
    });

    it('preserves custom theme IDs, block uppercase inheritance, hold closing card, pattern schema, and real chatData/roster pulls', async () => {
        // 1. Custom theme preset ID survives normalizeProject + re-normalization
        const p1 = engine.normalizeProject({
            id: 'custom-theme-test',
            name: 'Custom Theme Test',
            theme: { preset: 'my-midnight-cinema' },
            background: {
                type: 'pattern',
                patternPreset: 'hexagons',
                patternPalette: 'synthwave',
                patternMotion: 'pan',
                patternPanAngle: 45,
                patternScale: 140,
                patternDensity: 1.5,
                patternInPlace: 'pulse',
                patternSpin: 'cw',
                patternColorMode: 'diagonal',
                patternColorAnim: 'cycle',
                patternVignette: 30
            },
            timing: { leadInSec: 0, leadOutSec: 1.5, endBehavior: 'hold', loop: false },
            blocks: [
                { id: 'b1', type: 'featured', presentation: 'card', title: 'FIN', duration: 3, transitionIn: 'none', transitionOut: 'fade' }
            ]
        });
        assert.equal(p1.theme.preset, 'my-midnight-cinema');
        assert.equal(p1.background.patternPreset, 'hexagons');
        assert.equal(p1.background.patternMotion, 'pan');
        assert.equal(p1.background.patternPanAngle, 45);
        assert.equal(p1.background.patternColorAnim, 'cycle');
        assert.equal(p1.background.patternVignette, 30);

        // 2. Re-normalizing block.style.uppercase preserves '' ("inherit theme") instead of flipping to false
        assert.equal(p1.blocks[0].style.uppercase, '');
        const p2 = engine.normalizeProject(p1);
        assert.equal(p2.blocks[0].style.uppercase, '');

        // 3. transitionIn: 'none' renders opacity 1 at localT === 0, and endBehavior: 'hold' keeps closing card at opacity 1 through leadOutSec
        const solved = engine.solveTimeline(p2);
        const startFrame = engine.evaluateFrame(0, solved, p2);
        assert.equal(startFrame.activeCards[0].opacity, 1);
        const lateCardFrame = engine.evaluateFrame(2.9, solved, p2);
        assert.equal(lateCardFrame.activeCards[0].opacity, 1);
        const leadOutFrame = engine.evaluateFrame(3.8, solved, p2);
        assert.equal(leadOutFrame.activeCards.length, 1);
        assert.equal(leadOutFrame.activeCards[0].opacity, 1);

        // 4. Real StreamPulse chatData (chatname, giftSubs, raids, bits, followers, chatters) & Variable Set roster + manual preservation
        const tmpDir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'streampulse-cs-qa-'));
        try {
            const qaService = createCreditSuiteService({
                dataDir: tmpDir2,
                getVariablesState: () => ({
                    variables: [{ name: 'guests', key: 'guests', type: 'list', items: ['Alice', 'Bob'] }],
                    sets: [{ id: 'crew', name: 'Crew', fields: [{ key: 'role', label: 'Role' }], roster: [{ id: 'c1', label: 'Sam', enabled: true, values: { role: 'Producer' } }] }]
                }),
                getSessionData: () => ({
                    subscribers: [{ chatname: 'SubHero' }],
                    giftSubs: [{ chatname: 'GiftChamp' }],
                    followers: [{ chatname: 'NewFollower' }],
                    raids: [{ chatname: 'RaidBoss' }],
                    bits: [{ chatname: 'CheerStar' }],
                    chatters: { moduser: { chatname: 'ModUser', mod: true } }
                })
            });
            const srcs = qaService.listDataSources();
            assert.equal(srcs.variableSets[0].count, 1);
            assert.equal(srcs.sessionCategories.find(c => c.id === 'gifters').count, 1);
            assert.equal(srcs.sessionCategories.find(c => c.id === 'moderators').count, 1);

            const pulledSet = qaService.pullDataSourceForBlock({
                type: 'roster',
                dataSource: { type: 'variable-set', sourceId: 'crew', field: '_label' },
                names: [{ id: 'manual-1', name: 'Special Guest', editedName: '', checked: true }]
            });
            assert.equal(pulledSet.names.length, 2, 'manual entries are preserved alongside refreshed set roster');
            assert.ok(pulledSet.names.some(n => n.name === 'Sam'));
            assert.ok(pulledSet.names.some(n => n.name === 'Special Guest'));

            // 5. Companion transport status & boolean query parsing
            const st = qaService.getStatus();
            assert.equal(st.state, 'paused');
            assert.equal(typeof st.remainingSec, 'number');
            assert.equal(typeof st.progressPct, 'number');
            const seekPaused = qaService.controlTransport('seek', { t: 2, play: 'false' });
            assert.equal(seekPaused.playing, false);
            assert.throws(() => qaService.controlTransport('jump', { marker: '' }), /Marker name is required/);
        } finally {
            fs.rmSync(tmpDir2, { recursive: true, force: true });
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

    it('normalizes and deterministically evaluates inline video controls, style overrides, backdrop scrolling FX, and section-edge mascots', () => {
        const proj = engine.normalizeProject({
            id: 'fx-overrides-test',
            background: {
                type: 'image',
                mediaUrl: '/custom-overlay-assets/bg.png',
                mediaMotion: 'scroll-up',
                mediaMotionSpeed: 1.5,
                mediaTile: true,
                mediaAutoplay: true,
                mediaLoop: false,
                mediaMuted: false,
                mediaVolume: 65,
                mediaStartSec: 3,
                mediaRate: 1.25
            },
            blocks: [
                {
                    id: 'b-media',
                    type: 'media',
                    presentation: 'crawl',
                    title: 'Highlight Clip',
                    mediaKind: 'video',
                    mediaUrl: '/custom-overlay-assets/clip.mp4',
                    mediaFit: 'contain-blur',
                    mediaAutoplay: false,
                    mediaLoop: false,
                    mediaMuted: false,
                    mediaVolume: 70,
                    mediaStartSec: 4.5,
                    mediaRate: 1.5,
                    style: {
                        headingFont: 'Oswald',
                        contentFont: 'Inter',
                        headingSize: 54,
                        contentSize: 22,
                        headingWeight: '800',
                        contentWeight: '500',
                        headingColor: '#FF2A6DFF',
                        contentColor: '#E2E8F0FF',
                        subtitleColor: '#94A3B8FF',
                        maxWidth: 760,
                        opacity: 0.9,
                        bgColor: '#0F172AFF',
                        bgOpacity: 0.75,
                        bgRadius: 20,
                        bgPadding: 36,
                        borderStyle: 'neon-tube',
                        borderWidth: 3,
                        borderColor: '#FF2A6DFF',
                        borderColor2: '#38BDF8FF',
                        borderAnim: 'beam',
                        borderAnimSpeed: 2.5,
                        italic: true,
                        underline: true,
                        uppercase: false,
                        letterSpacing: 0.08,
                        textShadow: true
                    },
                    edgeAttachment: {
                        enabled: true,
                        mediaKind: 'icon',
                        iconClass: 'fa-solid fa-cat',
                        iconColor: '#F59E0BFF',
                        anchor: 'hanging-top-right',
                        anim: 'hang-swing',
                        animSpeed: 1.5,
                        size: 96,
                        offsetX: 12,
                        offsetY: -8,
                        flipX: true,
                        zLayer: 'front'
                    }
                }
            ],
            tracks: [
                {
                    id: 'trk-behind',
                    name: 'Backdrop FX',
                    layer: 'behind',
                    visible: true,
                    clips: [
                        {
                            id: 'c-scroll',
                            elementType: 'image',
                            timingMode: 'timecode',
                            startSec: 0,
                            durationSec: 10,
                            x: 10,
                            y: 10,
                            width: 30,
                            height: 30,
                            clipScrollPath: 'bottom-to-top',
                            clipScrollSpeed: 1,
                            kenBurns: 'scroll-left',
                            motionSpeed: 2,
                            motionTile: true
                        }
                    ]
                }
            ]
        });

        const blk = proj.blocks[0];
        assert.equal(blk.mediaFit, 'contain-blur');
        assert.equal(blk.mediaAutoplay, false);
        assert.equal(blk.mediaLoop, false);
        assert.equal(blk.mediaMuted, false);
        assert.equal(blk.mediaVolume, 70);
        assert.equal(blk.mediaStartSec, 4.5);
        assert.equal(blk.mediaRate, 1.5);
        assert.equal(blk.style.maxWidth, 760);
        assert.equal(blk.style.bgPadding, 36);
        assert.equal(blk.style.uppercase, false);
        assert.equal(blk.edgeAttachment.enabled, true);
        assert.equal(blk.edgeAttachment.anchor, 'hanging-top-right');

        const solved = engine.solveTimeline(proj);
        const f0 = engine.evaluateFrame(0, solved, proj);
        const f5 = engine.evaluateFrame(5, solved, proj);
        assert.ok(f5.bgMotion.tileY < f0.bgMotion.tileY, 'scroll-up tiled background advances negative Y');
        assert.ok(f5.activeClips[0].translateY < f0.activeClips[0].translateY, 'bottom-to-top clip path scrolls upward');
        assert.ok(f5.activeClips[0].tileX < f0.activeClips[0].tileX, 'scroll-left tiled clip advances negative X');

        const t0 = engine.evaluateEdgeAttachmentTransform(blk.edgeAttachment, 0);
        const t1 = engine.evaluateEdgeAttachmentTransform(blk.edgeAttachment, 0.5);
        assert.notEqual(t0, t1, 'hanging mascot animates deterministically across timestamps');
    });

    it('renders Starfield animated pattern background with visible stars and frame-to-frame motion in Puppeteer', async () => {
        service.upsertProject({
            id: 'starfield-qa',
            name: 'Starfield QA',
            canvas: { preset: '720p', width: 640, height: 360, fps: 30 },
            background: {
                type: 'pattern',
                color1: '#050712FF',
                patternPreset: 'starfield',
                patternPalette: 'galaxy',
                patternMotion: 'drift',
                patternSpeed: 1.5,
                patternDensity: 1,
                patternOpacity: 0.95
            },
            blocks: [
                {
                    id: 'sf-b1',
                    type: 'featured',
                    presentation: 'card',
                    title: 'STARFIELD QA',
                    duration: 4,
                    style: { maxWidth: 420, bgColor: '#0F172AFF', bgOpacity: 0.7, bgRadius: 16, borderStyle: 'solid', borderWidth: 2 },
                    edgeAttachment: { enabled: true, mediaKind: 'icon', iconClass: 'fa-solid fa-star', anchor: 'hanging-top-right', anim: 'hang-swing', size: 64 }
                }
            ]
        });

        const puppeteer = require('puppeteer');
        const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
        try {
            const page = await browser.newPage();
            await page.setViewport({ width: 640, height: 360, deviceScaleFactor: 1 });
            await page.goto(`http://127.0.0.1:${port}/overlays/credit-suite.html?project=starfield-qa&export=1`, { waitUntil: 'networkidle0' });
            await page.waitForFunction(() => Boolean(window.__creditSuiteReady), { timeout: 10000 });

            const metrics = await page.evaluate(async () => {
                const sampleCanvas = () => {
                    const c = document.querySelector('.cs-bg-pattern canvas');
                    if (!c) return { ok: false, nonZero: 0, hash: 0 };
                    const ctx = c.getContext('2d');
                    const data = ctx.getImageData(0, 0, c.width, c.height).data;
                    let nonZero = 0;
                    let hash = 0;
                    for (let i = 3; i < data.length; i += 4) {
                        if (data[i] > 15) {
                            nonZero++;
                            hash = (hash + ((i * 31 + data[i]) & 0xffff)) & 0xfffffff;
                        }
                    }
                    return { ok: true, nonZero, hash, w: c.width, h: c.height };
                };
                await window.__creditSuiteSeek(0.2);
                const s0 = sampleCanvas();
                await window.__creditSuiteSeek(2.2);
                const s1 = sampleCanvas();
                const mascot = document.querySelector('.cs-edge-mascot');
                return { s0, s1, hasMascot: Boolean(mascot), mascotTransform: mascot?.style.transform || '' };
            });

            assert.equal(metrics.s0.ok, true, 'starfield canvas should exist');
            assert.ok(metrics.s0.nonZero > 250, `starfield should draw hundreds of bright star pixels (got ${metrics.s0.nonZero})`);
            assert.notEqual(metrics.s0.hash, metrics.s1.hash, 'starfield pixels must animate between t=0.2s and t=2.2s');
            assert.equal(metrics.hasMascot, true, 'section edge mascot should render inside block');
            assert.match(metrics.mascotTransform, /translate3d/);
        } finally {
            await browser.close();
        }
    });
});

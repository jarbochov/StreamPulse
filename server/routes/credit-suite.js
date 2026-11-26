'use strict';

const fs = require('fs');
const { readRequestBody, sendJson, sendText, sendError } = require('./helpers');

function createCreditSuiteRoutes({ creditSuiteService, creditSuiteExporter, isCreditSuiteEnabled = () => true } = {}) {
    async function parseOptionalJson(req) {
        if (req.method === 'GET' || req.method === 'HEAD') return {};
        const raw = await readRequestBody(req, 10 * 1024 * 1024);
        if (!raw || !raw.trim()) return {};
        return JSON.parse(raw);
    }

    return async function handleCreditSuiteRoutes(req, res, url, pathname) {
        if (!pathname.startsWith('/api/credit-suite')) return false;

        try {
            const enabled = isCreditSuiteEnabled();
            // Status & root state stay readable when disabled so UIs can explain why.
            if (!enabled && pathname === '/api/credit-suite/status' && req.method === 'GET') {
                sendJson(res, { enabled: false, ...creditSuiteService.getStatus() });
                return true;
            }
            if (!enabled && pathname === '/api/credit-suite' && req.method === 'GET') {
                sendJson(res, { enabled: false, projects: [], themes: [], activeProjectId: '' });
                return true;
            }
            if (!enabled) {
                sendError(res, 'Credit Suite is disabled in System Config (Modules)', 403);
                return true;
            }

            // GET /api/credit-suite
            if (pathname === '/api/credit-suite' && req.method === 'GET') {
                const state = creditSuiteService.getState();
                const capabilities = creditSuiteExporter ? creditSuiteExporter.getCapabilities() : null;
                sendJson(res, { enabled: true, ...state, capabilities });
                return true;
            }

            // GET /api/credit-suite/status (Companion polling)
            if (pathname === '/api/credit-suite/status' && req.method === 'GET') {
                sendJson(res, creditSuiteService.getStatus());
                return true;
            }

            // GET /api/credit-suite/data-sources
            if (pathname === '/api/credit-suite/data-sources' && req.method === 'GET') {
                sendJson(res, creditSuiteService.listDataSources());
                return true;
            }

            // POST /api/credit-suite/data-sources/pull
            if (pathname === '/api/credit-suite/data-sources/pull' && req.method === 'POST') {
                const body = await parseOptionalJson(req);
                const result = creditSuiteService.pullDataSourceForBlock(body.block || body);
                sendJson(res, { ok: true, ...result });
                return true;
            }

            // GET/POST /api/credit-suite/activate?project=ID
            if (pathname === '/api/credit-suite/activate' && (req.method === 'GET' || req.method === 'POST')) {
                const body = await parseOptionalJson(req);
                const id = url.searchParams.get('project') || url.searchParams.get('id') || body.projectId || body.id;
                const project = creditSuiteService.setActiveProject(id);
                sendJson(res, { ok: true, project, state: creditSuiteService.getState() });
                return true;
            }

            // Transport shortcuts & unified transport route (GET & POST for Companion)
            const transportShortcut = pathname.match(/^\/api\/credit-suite\/(play|pause|toggle|restart|stop|seek|jump|speed)$/);
            if (transportShortcut && (req.method === 'GET' || req.method === 'POST')) {
                const action = transportShortcut[1];
                const body = await parseOptionalJson(req);
                const params = {
                    projectId: url.searchParams.get('project') || body.projectId || body.project || '',
                    t: url.searchParams.get('t') ?? url.searchParams.get('seconds') ?? body.t ?? body.timeSec ?? body.seconds,
                    marker: url.searchParams.get('marker') ?? url.searchParams.get('name') ?? body.marker ?? body.name,
                    rate: url.searchParams.get('rate') ?? url.searchParams.get('speed') ?? body.rate ?? body.speed,
                    play: url.searchParams.get('play') ?? body.play
                };
                const transport = creditSuiteService.controlTransport(action, params);
                sendJson(res, { ok: true, action, transport });
                return true;
            }

            if (pathname === '/api/credit-suite/transport' && (req.method === 'GET' || req.method === 'POST')) {
                if (req.method === 'GET' && !url.searchParams.get('action')) {
                    sendJson(res, { ok: true, transport: creditSuiteService.getTransportSnapshot() });
                    return true;
                }
                const body = await parseOptionalJson(req);
                const action = url.searchParams.get('action') || body.action || 'toggle';
                const transport = creditSuiteService.controlTransport(action, {
                    projectId: url.searchParams.get('project') || body.projectId || '',
                    t: url.searchParams.get('t') ?? body.t ?? body.timeSec,
                    marker: url.searchParams.get('marker') ?? body.marker,
                    rate: url.searchParams.get('rate') ?? body.rate,
                    play: url.searchParams.get('play') ?? body.play
                });
                sendJson(res, { ok: true, action, transport });
                return true;
            }

            // Export capabilities
            if (pathname === '/api/credit-suite/export/capabilities' && req.method === 'GET') {
                if (!creditSuiteExporter) {
                    sendJson(res, { ffmpeg: { available: false }, formats: {} });
                    return true;
                }
                sendJson(res, creditSuiteExporter.getCapabilities(url.searchParams.get('refresh') === '1'));
                return true;
            }

            // Start export job
            if (pathname === '/api/credit-suite/export' && req.method === 'POST') {
                if (!creditSuiteExporter) {
                    sendError(res, 'Export service unavailable', 503);
                    return true;
                }
                const body = await parseOptionalJson(req);
                const proj = creditSuiteService.getProject(body.projectId);
                if (!proj) {
                    sendError(res, 'Project not found', 404);
                    return true;
                }
                const job = creditSuiteExporter.startExport(proj, {
                    format: body.format || 'mp4',
                    width: body.width,
                    height: body.height,
                    fps: body.fps,
                    transparent: Boolean(body.transparent),
                    bgOverride: body.bgOverride || '',
                    chromaColor: body.chromaColor || '',
                    durationSec: body.durationSec
                });
                sendJson(res, { ok: true, job }, 202);
                return true;
            }

            // Export job download
            const downloadMatch = pathname.match(/^\/api\/credit-suite\/export\/([^/]+)\/download$/);
            if (downloadMatch && req.method === 'GET') {
                const jobId = decodeURIComponent(downloadMatch[1]);
                const info = creditSuiteExporter?.getJobFile(jobId);
                if (!info) {
                    sendError(res, 'Export file not found or not ready', 404);
                    return true;
                }
                const stat = fs.statSync(info.filePath);
                res.writeHead(200, {
                    'Content-Type': info.mime,
                    'Content-Length': stat.size,
                    'Content-Disposition': `attachment; filename="${info.fileName.replace(/"/g, '')}"`
                });
                fs.createReadStream(info.filePath).pipe(res);
                return true;
            }

            // Export job status / cancel
            const jobMatch = pathname.match(/^\/api\/credit-suite\/export\/([^/]+)$/);
            if (jobMatch) {
                const jobId = decodeURIComponent(jobMatch[1]);
                if (req.method === 'GET') {
                    const job = creditSuiteExporter?.getJob(jobId);
                    if (!job) {
                        sendError(res, 'Export job not found', 404);
                        return true;
                    }
                    sendJson(res, { ok: true, job });
                    return true;
                }
                if (req.method === 'DELETE') {
                    const cancelled = creditSuiteExporter?.cancelJob(jobId);
                    sendJson(res, { ok: Boolean(cancelled), job: creditSuiteExporter?.getJob(jobId) });
                    return true;
                }
            }

            // POST /api/credit-suite/projects (create or upsert)
            if (pathname === '/api/credit-suite/projects' && req.method === 'POST') {
                const body = await parseOptionalJson(req);
                const raw = body.project || body;
                const project = creditSuiteService.upsertProject(raw, {
                    setActive: body.setActive !== false,
                    createNew: Boolean(body.createNew)
                });
                sendJson(res, { ok: true, project, state: creditSuiteService.getState() });
                return true;
            }

            // Duplicate project
            const dupMatch = pathname.match(/^\/api\/credit-suite\/projects\/([^/]+)\/duplicate$/);
            if (dupMatch && req.method === 'POST') {
                const project = creditSuiteService.duplicateProject(decodeURIComponent(dupMatch[1]));
                sendJson(res, { ok: true, project, state: creditSuiteService.getState() });
                return true;
            }

            // Download SRT
            const srtMatch = pathname.match(/^\/api\/credit-suite\/projects\/([^/]+)\/srt$/);
            if (srtMatch && req.method === 'GET') {
                const id = decodeURIComponent(srtMatch[1]);
                const srt = creditSuiteService.generateSrt(id);
                sendText(res, srt, 200, 'text/plain; charset=utf-8', {
                    'Content-Disposition': `attachment; filename="${id.replace(/[^a-z0-9_-]/gi, '-')}.srt"`
                });
                return true;
            }

            // Single project GET / PUT / DELETE
            const projMatch = pathname.match(/^\/api\/credit-suite\/projects\/([^/]+)$/);
            if (projMatch) {
                const id = decodeURIComponent(projMatch[1]);
                if (req.method === 'GET') {
                    const project = creditSuiteService.getProject(id);
                    if (!project) {
                        sendError(res, `Credit project "${id}" not found`, 404);
                        return true;
                    }
                    sendJson(res, { ok: true, project });
                    return true;
                }
                if (req.method === 'PUT' || req.method === 'POST') {
                    const body = await parseOptionalJson(req);
                    const raw = body.project || body;
                    const project = creditSuiteService.upsertProject({ ...raw, id }, {
                        setActive: Boolean(body.setActive)
                    });
                    sendJson(res, { ok: true, project, state: creditSuiteService.getState() });
                    return true;
                }
                if (req.method === 'DELETE') {
                    const state = creditSuiteService.deleteProject(id);
                    sendJson(res, { ok: true, state });
                    return true;
                }
            }

            // Theme Library CRUD (editable & deletable cinema themes)
            if (pathname === '/api/credit-suite/themes' && req.method === 'GET') {
                sendJson(res, { ok: true, themes: creditSuiteService.getState().themes });
                return true;
            }
            if (pathname === '/api/credit-suite/themes' && req.method === 'POST') {
                const body = await parseOptionalJson(req);
                const theme = creditSuiteService.upsertTheme(body.theme || body, { createNew: Boolean(body.createNew) });
                sendJson(res, { ok: true, theme, themes: creditSuiteService.getState().themes });
                return true;
            }
            if (pathname === '/api/credit-suite/themes/reset' && (req.method === 'POST' || req.method === 'GET')) {
                const themes = creditSuiteService.resetStarterThemes();
                sendJson(res, { ok: true, themes });
                return true;
            }
            const themeMatch = pathname.match(/^\/api\/credit-suite\/themes\/([^/]+)$/);
            if (themeMatch) {
                const tid = decodeURIComponent(themeMatch[1]);
                if (req.method === 'PUT' || req.method === 'POST') {
                    const body = await parseOptionalJson(req);
                    const theme = creditSuiteService.upsertTheme({ ...(body.theme || body), id: tid });
                    sendJson(res, { ok: true, theme, themes: creditSuiteService.getState().themes });
                    return true;
                }
                if (req.method === 'DELETE') {
                    const themes = creditSuiteService.deleteTheme(tid);
                    sendJson(res, { ok: true, themes });
                    return true;
                }
            }

            // Reset defaults
            if (pathname === '/api/credit-suite/reset-defaults' && (req.method === 'POST' || req.method === 'GET')) {
                const state = creditSuiteService.resetDefaults();
                sendJson(res, { ok: true, state });
                return true;
            }

            return false;
        } catch (err) {
            sendError(res, err, 400);
            return true;
        }
    };
}

module.exports = { createCreditSuiteRoutes };

const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');
const { createBackupService } = require('../services/backup');
const { readRequestBody, readBinaryBody, sendJson, sendError } = require('./helpers');

function createBackupRoutes({
    rootDir,
    dataDir,
    configPath,
    backupsDir,
    sessionsDir,
    customOverlayAssetsDir,
    customOverlayHistoryDir,
    backupService = createBackupService({ backupsDir }),
    getBackupFileSpecs = () => [],
    listShareItems = () => ({}),
    buildShareZip = () => ({ buffer: Buffer.from(''), count: 0 }),
    openShareZip = () => ({}),
    importShareZip = () => [],
    onRestore = () => ({ restored: [], restartFields: [] }),
    getConfig = () => ({}),
    getCustomOverlays = () => ({}),
    getOverlayPresets = () => [],
    sanitizeOverlayId = (id) => id,
    shareSingles = {}
} = {}) {
    return async function handleBackupRoutes(req, res, url, pathname) {
        // List auto-backups
        if (pathname === '/api/backups' && req.method === 'GET') {
            try {
                if (!fs.existsSync(backupsDir)) {
                    sendJson(res, { backups: [] });
                    return true;
                }
                const files = fs.readdirSync(backupsDir)
                    .filter(f => f.endsWith('.zip'))
                    .sort().reverse();
                const backups = files.map(f => {
                    const stat = fs.statSync(path.join(backupsDir, f));
                    return { name: f, size: stat.size, created: stat.mtime.toISOString() };
                });
                sendJson(res, { backups });
            } catch (err) {
                sendError(res, err, 500);
            }
            return true;
        }

        // Download a specific auto-backup
        if (pathname.startsWith('/api/backups/') && req.method === 'GET') {
            const filename = decodeURIComponent(pathname.slice('/api/backups/'.length));
            if (!filename || filename.includes('..') || filename.includes('/')) {
                sendError(res, 'Invalid filename', 400);
                return true;
            }
            const filePath = path.join(backupsDir, filename);
            if (!filePath.startsWith(backupsDir) || !fs.existsSync(filePath)) {
                sendError(res, 'Backup not found', 404);
                return true;
            }
            const stat = fs.statSync(filePath);
            res.writeHead(200, {
                'Content-Type': 'application/zip',
                'Content-Disposition': `attachment; filename="${filename}"`,
                'Content-Length': stat.size
            });
            fs.createReadStream(filePath).pipe(res);
            return true;
        }

        // Generate full backup download
        if (pathname === '/api/backup' && (req.method === 'GET' || req.method === 'HEAD')) {
            const now = new Date();
            const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
            const filename = `streampulse-backup-${dateStr}.zip`;

            const controller = new AbortController();
            const abort = () => controller.abort();
            res.once('close', abort);
            try {
                await backupService.download({
                    files: getBackupFileSpecs(),
                    folders: [
                        { src: sessionsDir, dest: 'data/sessions' },
                        { src: customOverlayAssetsDir, dest: 'data/custom-overlay-assets' },
                        { src: customOverlayHistoryDir, dest: 'data/custom-overlay-history' }
                    ]
                }, async ({ path: archivePath, size }, signal) => {
                    res.writeHead(200, {
                        'Content-Type': 'application/zip',
                        'Content-Disposition': `attachment; filename="${filename}"`,
                        'Content-Length': size
                    });
                    if (req.method === 'HEAD') res.end();
                    else await pipeline(fs.createReadStream(archivePath), res, { signal });
                }, { signal: controller.signal });
            } catch (err) {
                if (!res.destroyed && !res.headersSent) sendError(res, err, err.code === 'BACKUP_BUSY' ? 503 : 500);
                else if (!res.destroyed) res.destroy(err);
            } finally {
                res.removeListener('close', abort);
            }
            return true;
        }

        // List shareable items
        if (pathname === '/api/share/items' && req.method === 'GET') {
            sendJson(res, listShareItems());
            return true;
        }

        // Export share package
        if (pathname === '/api/share/export' && req.method === 'POST') {
            try {
                const body = JSON.parse(await readRequestBody(req) || '{}');
                const selection = (Array.isArray(body.items) ? body.items : []).map(entry => {
                    const [type, ...rest] = String(entry).split(':');
                    return { type, id: rest.join(':') };
                });
                const { buffer, count } = buildShareZip(selection, !!body.includeHistory);
                if (!count) throw new Error('Nothing selected to export');
                const stamp = new Date().toISOString().slice(0, 10);
                res.writeHead(200, {
                    'Content-Type': 'application/zip',
                    'Content-Disposition': `attachment; filename="streampulse-share-${stamp}.zip"`,
                    'Content-Length': buffer.length
                });
                res.end(buffer);
            } catch (err) {
                sendError(res, err, 400);
            }
            return true;
        }

        // Inspect share package
        if (pathname === '/api/share/inspect' && req.method === 'POST') {
            try {
                const buffer = await readBinaryBody(req);
                const { manifest } = openShareZip(buffer);
                const customOverlays = typeof getCustomOverlays === 'function' ? getCustomOverlays() : getCustomOverlays;
                const overlayPresets = typeof getOverlayPresets === 'function' ? getOverlayPresets() : getOverlayPresets;
                const items = (manifest.items || []).map(item => ({
                    ...item,
                    exists: item.type === 'overlay' ? !!customOverlays[sanitizeOverlayId(item.id)]
                        : item.type === 'preset' ? overlayPresets.some(p => p.id === item.id)
                        : !!shareSingles[item.type] && fs.existsSync(shareSingles[item.type].path())
                }));
                sendJson(res, { items });
            } catch (err) {
                sendError(res, err, 400);
            }
            return true;
        }

        // Import share package
        if (pathname === '/api/share/import' && req.method === 'POST') {
            try {
                const buffer = await readBinaryBody(req);
                const selected = (url.searchParams.get('items') || '').split(',').filter(Boolean);
                const conflict = ['replace', 'copy', 'skip'].includes(url.searchParams.get('conflict')) ? url.searchParams.get('conflict') : 'copy';
                const results = importShareZip(buffer, selected, conflict);
                sendJson(res, { results });
            } catch (err) {
                sendError(res, err, 400);
            }
            return true;
        }

        // Full backup restore
        if (pathname === '/api/restore' && req.method === 'POST') {
            const controller = new AbortController();
            const abort = () => controller.abort();
            res.once('close', abort);
            try {
                let restored;
                const restoreResult = await backupService.restore({
                    dataDir: dataDir || path.join(rootDir, 'data'),
                    configPath
                }, req, async (result, previousConfig) => {
                    restored = result.restored;
                    return await onRestore({ previousConfig, ...result }) || {};
                }, {
                    signal: controller.signal,
                    beforeApply: () => JSON.parse(JSON.stringify(getConfig()))
                });
                const restartFields = restoreResult.restartFields || [];

                console.log(`[Restore] Restored ${restored.length} files`);
                sendJson(res, {
                    status: 'restored',
                    files: restored.length,
                    restored,
                    restartRequired: restartFields.length > 0,
                    restartFields,
                    message: restartFields.length > 0
                        ? 'Restore completed. Restart StreamPulse to apply restored connection and startup settings.'
                        : 'Restore completed and in-memory data reloaded.'
                });
            } catch (err) {
                console.error('[Restore] Error:', err.message);
                if (!res.destroyed && !res.headersSent) {
                    if (err.code === 'INVALID_BACKUP') sendError(res, err, 400);
                    else sendError(res, `Restore failed: ${err.message}`, err.code === 'BACKUP_BUSY' ? 503 : 500);
                }
            } finally {
                res.removeListener('close', abort);
            }
            return true;
        }

        return false;
    };
}

module.exports = {
    createBackupRoutes
};

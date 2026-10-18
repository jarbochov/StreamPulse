const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const ZipArchive = require('archiver');
const { readRequestBody, readBinaryBody, sendJson, sendError } = require('./helpers');

function createBackupRoutes({
    rootDir,
    dataDir,
    configPath,
    backupsDir,
    sessionsDir,
    customOverlayAssetsDir,
    customOverlayHistoryDir,
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

            res.writeHead(200, {
                'Content-Type': 'application/zip',
                'Content-Disposition': `attachment; filename="${filename}"`
            });

            if (req.method === 'HEAD') {
                res.end();
                return true;
            }

            const archive = new ZipArchive({ zlib: { level: 9 } });
            archive.pipe(res);

            for (const f of getBackupFileSpecs()) {
                if (fs.existsSync(f.src)) {
                    archive.file(f.src, { name: f.dest });
                }
            }

            if (sessionsDir && fs.existsSync(sessionsDir)) {
                archive.directory(sessionsDir, 'data/sessions');
            }
            if (customOverlayAssetsDir && fs.existsSync(customOverlayAssetsDir)) {
                archive.directory(customOverlayAssetsDir, 'data/custom-overlay-assets');
            }
            if (customOverlayHistoryDir && fs.existsSync(customOverlayHistoryDir)) {
                archive.directory(customOverlayHistoryDir, 'data/custom-overlay-history');
            }

            archive.finalize();
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
            try {
                const buffer = await readBinaryBody(req);
                const previousConfig = JSON.parse(JSON.stringify(getConfig()));
                const zip = new AdmZip(buffer);
                const entries = zip.getEntries();

                // Validate: must have at least stats.json
                const hasStats = entries.some(e => e.entryName === 'data/stats.json' || e.entryName === 'stats.json');
                if (!hasStats) {
                    sendError(res, 'Invalid backup: missing stats.json', 400);
                    return true;
                }

                let restored = [];
                for (const entry of entries) {
                    if (entry.isDirectory) continue;
                    const name = entry.entryName;
                    let destPath;

                    if (name === 'config.json') {
                        destPath = configPath;
                    } else if (name.startsWith('data/')) {
                        destPath = path.join(dataDir || path.join(rootDir, 'data'), name.slice(5));
                    } else {
                        continue;
                    }

                    // Security check
                    const baseAllowed = dataDir || rootDir;
                    const normalizedDest = path.normalize(destPath);
                    if (!normalizedDest.startsWith(path.normalize(baseAllowed)) && normalizedDest !== path.normalize(configPath)) continue;

                    const dir = path.dirname(destPath);
                    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
                    fs.writeFileSync(destPath, entry.getData());
                    restored.push(name);
                }

                const restoreResult = await onRestore({ previousConfig, restored, entries }) || {};
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
                sendError(res, `Restore failed: ${err.message}`, 500);
            }
            return true;
        }

        return false;
    };
}

module.exports = {
    createBackupRoutes
};

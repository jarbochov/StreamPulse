const fs = require('fs');
const path = require('path');
const os = require('os');
const { sanitizeOverlayId } = require('../services/game-plan');
const { readRequestBody, sendJson, sendText, sendError } = require('./helpers');

const ASSET_KIND_BY_EXT = {
    '.png': 'image', '.jpg': 'image', '.jpeg': 'image', '.gif': 'image', '.webp': 'image', '.svg': 'image',
    '.mp4': 'video', '.webm': 'video', '.ogg': 'video',
    '.ttf': 'font', '.otf': 'font', '.woff': 'font', '.woff2': 'font',
    '.mp3': 'audio', '.wav': 'audio', '.m4a': 'audio', '.aac': 'audio', '.oga': 'audio',
    '.txt': 'text', '.md': 'text', '.markdown': 'text', '.text': 'text'
};
const assetKind = name => ASSET_KIND_BY_EXT[path.extname(name).toLowerCase()] || 'other';
const assetLabel = name => name.replace(/^[a-z0-9]{6,}-/, '').replace(/\.[A-Za-z0-9]+$/, '').replace(/^[-_.]+|[-_.]+$/g, '');
const assetFontFamily = name => assetLabel(name).replace(/[^a-zA-Z0-9 _-]+/g, '').replace(/[-_]+/g, ' ').trim() || 'Uploaded Font';
const assetNameBoundary = '(?![A-Za-z0-9._%-])';
const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function assetReferencedIn(text, name, family) {
    if (new RegExp(`/custom-overlay-assets/${escapeRegExp(encodeURIComponent(name))}${assetNameBoundary}`).test(text) || new RegExp(`/custom-overlay-assets/${escapeRegExp(name)}${assetNameBoundary}`).test(text)) return true;
    return !!family && text.includes(`'${family}'`);
}

function rewriteAssetReferences(text, oldName, newName, oldFamily, newFamily) {
    let result = text;
    for (const [from, to] of [[encodeURIComponent(oldName), encodeURIComponent(newName)], [oldName, newName]]) {
        result = result.replace(new RegExp(`/custom-overlay-assets/${escapeRegExp(from)}${assetNameBoundary}`, 'g'), `/custom-overlay-assets/${to}`);
    }
    if (oldFamily && newFamily && oldFamily !== newFamily) result = result.split(`'${oldFamily}'`).join(`'${newFamily}'`);
    return result;
}

const historyFile = (historyDir, id) => path.join(historyDir, `${sanitizeOverlayId(id)}.json`);

function readOverlayHistory(historyDir, id) {
    try {
        const list = JSON.parse(fs.readFileSync(historyFile(historyDir, id), 'utf8'));
        return Array.isArray(list) ? list : [];
    } catch {
        return [];
    }
}

function recordOverlayRevision(historyDir, previous, limit = 50) {
    if (!previous) return;
    try {
        fs.mkdirSync(historyDir, { recursive: true });
        const list = readOverlayHistory(historyDir, previous.id).filter(entry => entry.revision !== previous.revision);
        list.push({
            revision: previous.revision,
            updatedAt: previous.updatedAt || '',
            name: previous.name,
            canvas: previous.canvas,
            pages: previous.pages,
            elements: previous.elements
        });
        fs.writeFileSync(historyFile(historyDir, previous.id), JSON.stringify(list.slice(-limit)));
    } catch (err) {
        console.warn('[Overlays] Could not record revision history:', err.message);
    }
}

function normalizeAssetTagList(input) {
    const list = Array.isArray(input) ? input : String(input || '').split(/[,\n]/);
    const seen = new Set();
    const result = [];
    for (const raw of list) {
        const clean = String(raw || '').trim().replace(/\s+/g, ' ').slice(0, 30);
        if (!clean) continue;
        const key = clean.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(clean);
    }
    return result.slice(0, 20);
}

function assetMatchesTags(name, tags, mode, assetTags = {}) {
    if (!tags || !tags.length) return true;
    const have = new Set((assetTags[name] || []).map(t => t.toLowerCase()));
    return mode === 'all' ? tags.every(t => have.has(t.toLowerCase())) : tags.some(t => have.has(t.toLowerCase()));
}

function normalizeOverlayPresets(presets = []) {
    return (Array.isArray(presets) ? presets : []).map(preset => {
        if (!preset || typeof preset !== 'object') return null;
        const id = sanitizeOverlayId(preset.id);
        const name = String(preset.name || id).trim().slice(0, 100);
        const elements = Array.isArray(preset.elements) ? preset.elements : [];
        if (!id || !elements.length) return null;
        return {
            id,
            name: name || id,
            category: String(preset.category || 'General').trim().slice(0, 50),
            description: String(preset.description || '').trim().slice(0, 200),
            canvas: preset.canvas && typeof preset.canvas === 'object'
                ? { width: Number(preset.canvas.width) || 1920, height: Number(preset.canvas.height) || 1080 }
                : { width: 1920, height: 1080 },
            elements
        };
    }).filter(Boolean);
}

function createOverlayRoutes({
    alertEngine,
    ALERT_TRIGGERS = [],
    ALERT_ANIM_IN = [],
    ALERT_ANIM_OUT = [],
    chatbot,
    getCustomOverlays = () => ({}),
    getAssetTags = () => ({}),
    getAssetCaptions = () => ({}),
    saveAssetTags = () => {},
    saveAssetCaptions = () => {},
    getOverlayPresets = () => [],
    setOverlayPresets = () => {},
    saveOverlayPresets = () => {},
    slideshowStates = new Map(),
    getOverlayClients = () => new Set(),
    isLoopbackRequest = () => true,
    customOverlayAssetsDir = '',
    customOverlayHistoryDir = '',
    customOverlayHistoryLimit = 50,
    textSourceExts = new Set(['.txt', '.md', '.markdown', '.text']),
    textSourceMaxBytes = 512 * 1024,
    timerSoundUsers = () => [],
    creditsAssetUsers = () => [],
    gamePlanAssetUsers = () => [],
    rewriteTimerSoundReferences = () => false,
    rewriteGamePlanReferences = () => false,
    rewriteCreditsReferences = () => false,
    normalizeCustomOverlay = (o) => o,
    saveCustomOverlays = () => {},
    syncOverlayPages = () => {},
    dropOverlayPages = () => {},
    setPageAuto = () => {},
    movePage = () => {},
    broadcastPage = () => {},
    pageSnapshot = () => ({}),
    broadcastToOverlays = () => {},
    loadRandomizerPresets = () => [],
    saveRandomizerPresets = () => true,
    loadRandomizerButtonPresets = () => [],
    saveRandomizerButtonPresets = () => true,
    loadRandomizerQuotePresets = () => [],
    saveRandomizerQuotePresets = () => true,
    getChatData = () => ({}),
    getStatsData = () => ({}),
    listOverlayVisibility = () => [],
    setOverlayVisibility = () => null
}) {
    return async function handleOverlayRoutes(req, res, url, pathname) {
        // --- 1. Alerts endpoints ---
        if (pathname === '/api/alerts' && req.method === 'GET') {
            sendJson(res, {
                ...alertEngine.getConfig(),
                queue: alertEngine.getQueueState(),
                meta: { triggers: ALERT_TRIGGERS, animIn: ALERT_ANIM_IN, animOut: ALERT_ANIM_OUT }
            });
            return true;
        }

        if (pathname === '/api/alerts' && req.method === 'PUT') {
            try {
                const body = await readRequestBody(req);
                const saved = alertEngine.setConfig(JSON.parse(body || '{}'));
                sendJson(res, saved);
            } catch (err) {
                sendError(res, err, 400);
            }
            return true;
        }

        if (pathname === '/api/alerts/test' && req.method === 'POST') {
            try {
                const body = JSON.parse(await readRequestBody(req) || '{}');
                const payload = alertEngine.fireRule(String(body.ruleId || ''), String(body.variantId || ''), body);
                sendJson(res, { ok: true, alert: payload });
            } catch (err) {
                sendError(res, err, 400);
            }
            return true;
        }

        if (pathname === '/api/alerts/test-event' && req.method === 'POST') {
            try {
                const body = JSON.parse(await readRequestBody(req) || '{}');
                const payload = alertEngine.handleEvent({ ...body, user: body.user || 'TestViewer', dedupeMs: 0 }, { test: true });
                if (body.type === 'raid' && body.triggerChatbot && chatbot) {
                    chatbot.handleRaid({ user: body.user || 'TestViewer', viewers: body.amount || body.viewers || 10, isTest: true }).catch(() => {});
                }
                sendJson(res, { ok: true, alert: payload });
            } catch (err) {
                sendError(res, err, 400);
            }
            return true;
        }

        if (pathname === '/api/alerts/replay' && req.method === 'POST') {
            try {
                const body = JSON.parse(await readRequestBody(req) || '{}');
                const payload = body.alertId ? alertEngine.replayAlert(String(body.alertId)) : alertEngine.replayEvent(String(body.eventId || ''));
                sendJson(res, { ok: true, alert: payload });
            } catch (err) {
                sendError(res, err, 400);
            }
            return true;
        }

        if (pathname === '/api/alerts/queue' && req.method === 'POST') {
            try {
                const body = JSON.parse(await readRequestBody(req) || '{}');
                alertEngine.control(String(body.action || ''));
                sendJson(res, { ok: true, queue: alertEngine.getQueueState() });
            } catch (err) {
                sendError(res, err, 400);
            }
            return true;
        }

        // --- 2. Custom Overlays: Text Source ---
        if (pathname === '/api/custom-overlays/text-source' && req.method === 'GET') {
            const customOverlays = getCustomOverlays();
            const mode = url.searchParams.get('mode');
            const requested = String(url.searchParams.get('path') || '').trim();
            let target;
            if (mode === 'library') {
                let name;
                try {
                    name = decodeURIComponent(requested.replace(/^\/custom-overlay-assets\//, ''));
                } catch {
                    sendError(res, 'Invalid library file', 400);
                    return true;
                }
                target = path.join(customOverlayAssetsDir, name);
                if (!name || name.includes('/') || name.includes('\\') || path.dirname(target) !== customOverlayAssetsDir) {
                    sendError(res, 'Invalid library file', 400);
                    return true;
                }
            } else if (mode === 'file') {
                target = requested.startsWith('~/') ? path.join(os.homedir(), requested.slice(2)) : requested;
                if (!path.isAbsolute(target)) {
                    sendError(res, 'Use a full path starting with /', 400);
                    return true;
                }
                const remote = !isLoopbackRequest(req);
                if (remote && !Object.values(customOverlays).some(o => (o.elements || []).some(el => el.source?.mode === 'file' && el.source.path === requested))) {
                    sendError(res, 'File is not used by any overlay', 403);
                    return true;
                }
            } else {
                sendError(res, 'Unknown source mode', 400);
                return true;
            }

            if (!textSourceExts.has(path.extname(target).toLowerCase())) {
                sendError(res, 'Only .txt and .md files can be used', 400);
                return true;
            }
            try {
                const stat = fs.statSync(target);
                if (!stat.isFile()) {
                    sendError(res, 'That is not a file', 404);
                    return true;
                }
                if (stat.size > textSourceMaxBytes) {
                    sendError(res, 'File is larger than 512 KB', 413);
                    return true;
                }
                sendJson(res, {
                    text: fs.readFileSync(target, 'utf8').replace(/^\uFEFF/, ''),
                    mtimeMs: Math.floor(stat.mtimeMs),
                    name: path.basename(target)
                });
            } catch (err) {
                sendError(res, err.code === 'ENOENT' ? 'File not found' : `Could not read file: ${err.message}`, 404);
            }
            return true;
        }

        // --- 3. Custom Overlays: Assets list & management ---
        if (pathname === '/api/custom-overlays/assets' && req.method === 'GET') {
            const customOverlays = getCustomOverlays();
            const assetTags = getAssetTags();
            const assetCaptions = getAssetCaptions();
            let files = [];
            try {
                files = fs.readdirSync(customOverlayAssetsDir).filter(name => !name.startsWith('.'));
            } catch {}
            const serialized = Object.values(customOverlays).map(overlay => ({ id: overlay.id, name: overlay.name, text: JSON.stringify(overlay) }));
            const assets = files.map(name => {
                let stat;
                try {
                    stat = fs.statSync(path.join(customOverlayAssetsDir, name));
                } catch {
                    return null;
                }
                if (!stat.isFile()) return null;
                const kind = assetKind(name);
                const family = kind === 'font' ? assetFontFamily(name) : null;
                const usedBy = [
                    ...serialized.filter(o => assetReferencedIn(o.text, name, family)).map(({ id, name: overlayName }) => ({ id, name: overlayName })),
                    ...timerSoundUsers(name),
                    ...creditsAssetUsers(name),
                    ...gamePlanAssetUsers(name)
                ];
                return {
                    name,
                    kind,
                    family,
                    label: assetLabel(name),
                    url: `/custom-overlay-assets/${encodeURIComponent(name)}`,
                    size: stat.size,
                    modifiedAt: stat.mtime.toISOString(),
                    usedBy,
                    tags: assetTags[name] || [],
                    caption: assetCaptions[name] || ''
                };
            }).filter(Boolean).sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
            sendJson(res, assets);
            return true;
        }

        const assetItemMatch = pathname.match(/^\/api\/custom-overlays\/assets\/([^/]+?)(\/rename)?$/);
        if (assetItemMatch && (req.method === 'DELETE' || (req.method === 'POST' && assetItemMatch[2]))) {
            let name;
            try {
                name = decodeURIComponent(assetItemMatch[1]);
            } catch {
                sendError(res, 'Invalid asset name', 400);
                return true;
            }
            const target = path.join(customOverlayAssetsDir, name);
            if (!name || name.includes('/') || name.includes('\\') || name.startsWith('.') || path.dirname(target) !== customOverlayAssetsDir) {
                sendError(res, 'Invalid asset name', 400);
                return true;
            }
            if (!fs.existsSync(target)) {
                sendError(res, 'Asset not found', 404);
                return true;
            }
            const family = assetKind(name) === 'font' ? assetFontFamily(name) : null;
            const customOverlays = getCustomOverlays();
            const assetTags = getAssetTags();
            const assetCaptions = getAssetCaptions();

            if (req.method === 'DELETE') {
                const usedBy = [
                    ...Object.values(customOverlays).filter(o => assetReferencedIn(JSON.stringify(o), name, family)).map(o => o.id),
                    ...timerSoundUsers(name).map(u => u.id),
                    ...creditsAssetUsers(name).map(u => u.id),
                    ...gamePlanAssetUsers(name).map(u => u.id)
                ];
                if (usedBy.length && url.searchParams.get('force') !== '1') {
                    res.writeHead(409, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Asset is used by an overlay', usedBy }));
                    return true;
                }
                try {
                    fs.unlinkSync(target);
                    if (assetTags[name]) {
                        delete assetTags[name];
                        saveAssetTags();
                    }
                    if (assetCaptions[name] !== undefined) {
                        delete assetCaptions[name];
                        saveAssetCaptions();
                    }
                    sendJson(res, { deleted: name });
                } catch (err) {
                    sendError(res, err.message, 500);
                }
                return true;
            }

            let payload;
            try {
                payload = JSON.parse(await readRequestBody(req) || '{}');
            } catch {
                sendError(res, 'Invalid JSON', 400);
                return true;
            }
            const ext = path.extname(name);
            const prefix = (name.match(/^([a-z0-9]{6,})-/) || [])[1];
            const label = String(payload.name || '').trim().replace(/\.[A-Za-z0-9]{2,5}$/, '').replace(/[^a-zA-Z0-9._ ()-]+/g, '').replace(/\s+/g, '-').replace(/^[.-]+/, '').slice(0, 100);
            if (!label) {
                sendError(res, 'Enter a name using letters, numbers, dashes or underscores', 400);
                return true;
            }
            const newName = `${prefix ? `${prefix}-` : ''}${label}${ext}`;
            if (newName === name) {
                sendJson(res, { name, renamed: false, updated: [] });
                return true;
            }
            const newTarget = path.join(customOverlayAssetsDir, newName);
            if (fs.existsSync(newTarget)) {
                sendError(res, 'An asset with that name already exists', 409);
                return true;
            }
            try {
                fs.renameSync(target, newTarget);
            } catch (err) {
                sendError(res, err.message, 500);
                return true;
            }
            if (assetTags[name]) {
                assetTags[newName] = assetTags[name];
                delete assetTags[name];
                saveAssetTags();
            }
            if (assetCaptions[name] !== undefined) {
                assetCaptions[newName] = assetCaptions[name];
                delete assetCaptions[name];
                saveAssetCaptions();
            }

            const newFamily = family ? assetFontFamily(newName) : null;
            const updated = [];
            for (const [id, overlay] of Object.entries(customOverlays)) {
                const text = JSON.stringify(overlay);
                const rewritten = rewriteAssetReferences(text, name, newName, family, newFamily);
                if (rewritten === text) continue;
                try {
                    const next = normalizeCustomOverlay({ ...JSON.parse(rewritten), id, revision: overlay.revision, createdAt: overlay.createdAt });
                    customOverlays[id] = next;
                    updated.push(id);
                } catch {}
            }
            if (rewriteTimerSoundReferences(name, newName)) updated.push('timers');
            if (rewriteGamePlanReferences(name, newName)) updated.push('game-plan');
            if (rewriteCreditsReferences(name, newName)) updated.push('credits');
            if (updated.some(id => customOverlays[id])) {
                saveCustomOverlays();
                for (const id of updated.filter(id => customOverlays[id])) {
                    broadcastToOverlays('custom-overlay-update', { id, overlay: customOverlays[id] });
                }
            }
            sendJson(res, { name: newName, url: `/custom-overlay-assets/${encodeURIComponent(newName)}`, renamed: true, updated });
            return true;
        }

        // --- 4. Custom Overlays: Asset Upload ---
        if (pathname === '/api/custom-overlays/assets' && req.method === 'POST') {
            const contentType = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
            const allowedTypes = new Set([
                'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml',
                'video/mp4', 'video/webm', 'video/ogg',
                'font/ttf', 'font/otf', 'font/woff', 'font/woff2',
                'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/ogg',
                'text/plain', 'text/markdown'
            ]);
            const declaredName = String(req.headers['x-asset-name'] || 'asset').trim();
            const safeBase = path.basename(declaredName).replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 120) || 'asset';
            const audioExts = {
                'audio/mpeg': '.mp3', 'audio/mp3': '.mp3', 'audio/wav': '.wav', 'audio/x-wav': '.wav',
                'audio/wave': '.wav', 'audio/mp4': '.m4a', 'audio/x-m4a': '.m4a', 'audio/aac': '.aac', 'audio/ogg': '.oga'
            };
            const typeExt = { 'text/plain': '.txt', 'text/markdown': '.md' }[contentType] || audioExts[contentType] || (contentType.split('/')[1] === 'jpeg' ? '.jpg' : `.${contentType.split('/')[1] || ''}`);
            const namedBase = contentType === 'audio/ogg' ? safeBase.replace(/\.ogg$/i, '') : safeBase;
            const filename = `${Date.now().toString(36)}-${namedBase.includes('.') ? namedBase : `${namedBase}${typeExt}`}`;
            const target = path.join(customOverlayAssetsDir, filename);

            if (!allowedTypes.has(contentType)) {
                sendError(res, 'Only common image, video, audio (MP3, WAV, M4A, AAC, OGG) and font (TTF, OTF, WOFF, WOFF2) and text (TXT, MD) asset types are supported', 415);
                return true;
            }
            if (Number(req.headers['content-length'] || 0) > 100 * 1024 * 1024) {
                sendError(res, 'Asset exceeds the 100 MB limit', 413);
                return true;
            }
            const chunks = [];
            let total = 0;
            req.on('data', chunk => {
                total += chunk.length;
                if (total <= 100 * 1024 * 1024) chunks.push(chunk);
            });
            req.on('end', () => {
                if (total > 100 * 1024 * 1024) {
                    sendError(res, 'Asset exceeds the 100 MB limit', 413);
                    return;
                }
                try {
                    fs.writeFileSync(target, Buffer.concat(chunks));
                    const uploadTags = normalizeAssetTagList(decodeURIComponent(String(req.headers['x-asset-tags'] || '')));
                    if (uploadTags.length) {
                        const assetTags = getAssetTags();
                        assetTags[filename] = uploadTags;
                        saveAssetTags();
                    }
                    res.writeHead(201, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ url: `/custom-overlay-assets/${encodeURIComponent(filename)}`, name: filename, type: contentType, size: total }));
                } catch (err) {
                    sendError(res, err.message, 500);
                }
            });
            req.on('error', err => {
                sendError(res, err.message, 400);
            });
            return true;
        }

        // --- 5. Custom Overlays: History ---
        const historyMatch = pathname.match(/^\/api\/custom-overlays\/([^/]+)\/history(?:\/(\d+))?$/);
        if (historyMatch && req.method === 'GET') {
            const id = sanitizeOverlayId(decodeURIComponent(historyMatch[1]));
            const list = readOverlayHistory(customOverlayHistoryDir, id);
            const customOverlays = getCustomOverlays();
            if (historyMatch[2]) {
                const entry = list.find(item => item.revision === Number(historyMatch[2]));
                if (!entry) {
                    sendError(res, 'Revision not found', 404);
                    return true;
                }
                sendJson(res, entry);
            } else {
                sendJson(res, {
                    current: customOverlays[id]?.revision || 0,
                    revisions: list.map(({ revision, updatedAt, name, elements }) => ({
                        revision, updatedAt, name, elementCount: (elements || []).length
                    })).reverse()
                });
            }
            return true;
        }

        // --- 6. Custom Overlays: CRUD & List ---
        if (pathname === '/api/custom-overlays' && req.method === 'GET') {
            const customOverlays = getCustomOverlays();
            sendJson(res, Object.values(customOverlays).map(({ id, name, revision, updatedAt, createdAt, canvas, elements, pages }) => ({
                id, name, revision, updatedAt, createdAt, canvas, elementCount: (elements || []).length, pageCount: pages?.enabled ? pages.items.length : 0
            })));
            return true;
        }

        if (pathname === '/api/custom-overlays' && req.method === 'POST') {
            try {
                const payload = JSON.parse(await readRequestBody(req) || '{}');
                const overlay = normalizeCustomOverlay(payload);
                const customOverlays = getCustomOverlays();
                if (customOverlays[overlay.id]) {
                    sendError(res, 'An overlay with that id already exists', 409);
                    return true;
                }
                customOverlays[overlay.id] = overlay;
                saveCustomOverlays();
                syncOverlayPages(overlay);
                broadcastToOverlays('custom-overlay-update', { id: overlay.id, overlay });
                res.writeHead(201, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(overlay));
            } catch (err) {
                sendError(res, err.message, 400);
            }
            return true;
        }

        // --- 7. Custom Overlays: Pages & Slideshows ---
        const overlayPageMatch = pathname.match(/^\/api\/custom-overlays\/([^/]+)\/page$/);
        if (overlayPageMatch && (req.method === 'GET' || req.method === 'POST')) {
            const customOverlays = getCustomOverlays();
            const overlay = customOverlays[sanitizeOverlayId(decodeURIComponent(overlayPageMatch[1]))];
            if (!overlay) {
                sendError(res, 'Overlay not found', 404);
                return true;
            }
            if (req.method === 'POST') {
                try {
                    const body = JSON.parse(await readRequestBody(req) || '{}');
                    const action = String(body.action || '');
                    if (!overlay.pages?.enabled) {
                        sendError(res, 'Pages are not enabled for this overlay', 400);
                        return true;
                    }
                    if (action === 'auto') {
                        setPageAuto(overlay, typeof body.auto === 'boolean' ? body.auto : undefined);
                    } else if (['enable', 'disable', 'toggle'].includes(action)) {
                        const targets = (Array.isArray(body.page) ? body.page : [body.page]).map(value => String(value ?? '').trim().toLowerCase());
                        const items = overlay.pages.items;
                        const found = targets.map(key => items.find((item, i) => item.id === key || item.name.toLowerCase() === key || (/^\d+$/.test(key) && i === Number(key) - 1)));
                        if (!targets.length || found.some(item => !item)) {
                            sendError(res, 'Page not found', 404);
                            return true;
                        }
                        const wanted = found.map(item => action === 'toggle' ? !item.enabled : action === 'enable');
                        const after = items.map(item => { const at = found.indexOf(item); return at >= 0 ? wanted[at] : item.enabled; });
                        if (!after.some(Boolean)) {
                            sendError(res, 'At least one page must stay enabled', 400);
                            return true;
                        }
                        found.forEach((item, at) => { item.enabled = wanted[at]; });
                        saveCustomOverlays();
                        syncOverlayPages(overlay, overlay);
                        broadcastToOverlays('custom-overlay-update', { id: overlay.id, overlay });
                        broadcastPage(overlay);
                    } else if (['next', 'prev', 'first', 'last', 'goto'].includes(action)) {
                        if (!movePage(overlay, action, { target: body.page }) && action === 'goto') {
                            sendError(res, 'Page not found', 404);
                            return true;
                        }
                    } else {
                        sendError(res, 'action must be next, prev, first, last, goto, auto, enable, disable or toggle', 400);
                        return true;
                    }
                } catch (err) {
                    sendError(res, err.message, 400);
                    return true;
                }
            }
            sendJson(res, pageSnapshot(overlay));
            return true;
        }

        if (pathname === '/api/slideshows' && req.method === 'GET') {
            const customOverlays = getCustomOverlays();
            const slideshows = [];
            for (const overlay of Object.values(customOverlays)) {
                for (const element of overlay.elements || []) {
                    if (element.type !== 'slideshow') continue;
                    const live = slideshowStates.get(`${overlay.id}::${element.id}`);
                    slideshows.push({
                        overlayId: overlay.id,
                        overlayName: overlay.name,
                        elementId: element.id,
                        name: element.name || element.id,
                        live: !!live,
                        paused: live ? live.paused : null,
                        position: live ? live.position : 0,
                        count: live ? live.count : 0
                    });
                }
            }
            sendJson(res, { slideshows });
            return true;
        }

        const slideshowControlMatch = pathname.match(/^\/api\/custom-overlays\/([^/]+)\/slideshow$/);
        if (slideshowControlMatch && req.method === 'POST') {
            const customOverlays = getCustomOverlays();
            const overlay = customOverlays[sanitizeOverlayId(decodeURIComponent(slideshowControlMatch[1]))];
            if (!overlay) {
                sendError(res, 'Overlay not found', 404);
                return true;
            }
            try {
                const body = JSON.parse(await readRequestBody(req) || '{}');
                const action = String(body.action || '');
                if (!['next', 'prev', 'pause', 'play', 'toggle'].includes(action)) {
                    sendError(res, 'action must be next, prev, pause, play or toggle', 400);
                    return true;
                }
                const element = body.element ? String(body.element) : '';
                broadcastToOverlays('custom-overlay-slideshow', { id: overlay.id, action, element });
                sendJson(res, { ok: true, action, element: element || 'all', listeners: getOverlayClients().size });
            } catch (err) {
                sendError(res, err.message, 400);
            }
            return true;
        }

        const overlayIdRenameMatch = pathname.match(/^\/api\/custom-overlays\/([^/]+)\/rename-id$/);
        if (overlayIdRenameMatch && req.method === 'POST') {
            try {
                const oldId = sanitizeOverlayId(decodeURIComponent(overlayIdRenameMatch[1]));
                const { newId: requested } = JSON.parse(await readRequestBody(req) || '{}');
                const newId = sanitizeOverlayId(requested);
                const customOverlays = getCustomOverlays();
                if (!customOverlays[oldId]) {
                    sendError(res, 'Overlay not found', 404);
                    return true;
                }
                if (!newId) {
                    sendError(res, 'Enter an id using letters, numbers, - or _', 400);
                    return true;
                }
                if (newId === oldId) {
                    sendJson(res, customOverlays[oldId]);
                    return true;
                }
                if (customOverlays[newId]) {
                    sendError(res, 'An overlay with that id already exists', 409);
                    return true;
                }
                const overlay = { ...customOverlays[oldId], id: newId, updatedAt: new Date().toISOString() };
                delete customOverlays[oldId];
                customOverlays[newId] = overlay;
                saveCustomOverlays();
                try {
                    const oldHist = historyFile(customOverlayHistoryDir, oldId);
                    const newHist = historyFile(customOverlayHistoryDir, newId);
                    if (fs.existsSync(oldHist)) fs.renameSync(oldHist, newHist);
                } catch {}
                broadcastToOverlays('custom-overlay-update', { id: oldId, overlay: null });
                broadcastToOverlays('custom-overlay-update', { id: newId, overlay });
                sendJson(res, overlay);
            } catch (err) {
                sendError(res, err.message, 400);
            }
            return true;
        }

        const customOverlayMatch = pathname.match(/^\/api\/custom-overlays\/([^/]+)$/);
        if (customOverlayMatch) {
            const id = sanitizeOverlayId(decodeURIComponent(customOverlayMatch[1]));
            const customOverlays = getCustomOverlays();

            if (req.method === 'GET') {
                const overlay = customOverlays[id];
                if (!overlay) {
                    sendError(res, 'Overlay not found', 404);
                    return true;
                }
                sendJson(res, overlay);
                return true;
            }

            if (req.method === 'PUT') {
                try {
                    if (!customOverlays[id]) {
                        sendError(res, 'Overlay not found', 404);
                        return true;
                    }
                    const payload = JSON.parse(await readRequestBody(req) || '{}');
                    const overlay = normalizeCustomOverlay({
                        ...payload,
                        id,
                        revision: customOverlays[id].revision + 1,
                        updatedAt: new Date().toISOString()
                    }, id);
                    recordOverlayRevision(customOverlayHistoryDir, customOverlays[id], customOverlayHistoryLimit);
                    const previous = customOverlays[id];
                    customOverlays[id] = overlay;
                    saveCustomOverlays();
                    syncOverlayPages(overlay, previous);
                    broadcastToOverlays('custom-overlay-update', { id, overlay });
                    broadcastPage(overlay);
                    sendJson(res, overlay);
                } catch (err) {
                    sendError(res, err.message, 400);
                }
                return true;
            }

            if (req.method === 'DELETE') {
                if (!customOverlays[id]) {
                    sendError(res, 'Overlay not found', 404);
                    return true;
                }
                delete customOverlays[id];
                dropOverlayPages(id);
                saveCustomOverlays();
                try {
                    fs.unlinkSync(historyFile(customOverlayHistoryDir, id));
                } catch {}
                broadcastToOverlays('custom-overlay-update', { id, overlay: null });
                res.writeHead(204);
                res.end();
                return true;
            }
        }

        // --- 8. Asset Tags & Captions ---
        if (pathname === '/api/asset-tags' && req.method === 'POST') {
            try {
                const body = JSON.parse(await readRequestBody(req) || '{}');
                const names = (Array.isArray(body.names) ? body.names : []).map(String).filter(name => name && !/[\\/]/.test(name) && fs.existsSync(path.join(customOverlayAssetsDir, name)));
                if (!names.length) throw new Error('No matching assets');
                const add = normalizeAssetTagList(body.add);
                const remove = new Set(normalizeAssetTagList(body.remove).map(tag => tag.toLowerCase()));
                const assetTags = getAssetTags();
                for (const name of names) {
                    const current = (assetTags[name] || []).filter(tag => !remove.has(tag.toLowerCase()));
                    assetTags[name] = body.set ? normalizeAssetTagList(body.set) : [...current, ...add];
                }
                saveAssetTags();
                sendJson(res, { ok: true, updated: names.length });
            } catch (err) {
                sendError(res, err.message, 400);
            }
            return true;
        }

        if (pathname === '/api/asset-captions' && req.method === 'POST') {
            try {
                const body = JSON.parse(await readRequestBody(req) || '{}');
                const name = String(body.name || '');
                if (!name || /[\\/]/.test(name) || !fs.existsSync(path.join(customOverlayAssetsDir, name))) throw new Error('Unknown asset');
                const caption = String(body.caption || '').trim().slice(0, 300);
                const assetCaptions = getAssetCaptions();
                if (caption) assetCaptions[name] = caption; else delete assetCaptions[name];
                saveAssetCaptions();
                sendJson(res, { ok: true });
            } catch (err) {
                sendError(res, err.message, 400);
            }
            return true;
        }

        if (pathname === '/api/asset-tags/manage' && req.method === 'POST') {
            try {
                const body = JSON.parse(await readRequestBody(req) || '{}');
                const tag = normalizeAssetTagList([body.tag])[0];
                if (!tag) throw new Error('Missing tag');
                const key = tag.toLowerCase();
                const to = body.action === 'rename' ? normalizeAssetTagList([body.to])[0] : null;
                if (body.action === 'rename' && !to) throw new Error('Missing new name');
                if (body.action !== 'rename' && body.action !== 'delete') throw new Error('Unknown action');
                const assetTags = getAssetTags();
                let touched = 0;
                for (const name of Object.keys(assetTags)) {
                    if (!assetTags[name].some(item => item.toLowerCase() === key)) continue;
                    assetTags[name] = normalizeAssetTagList(assetTags[name].flatMap(item => item.toLowerCase() === key ? (to ? [to] : []) : [item]));
                    touched++;
                }
                saveAssetTags();
                const updated = [];
                const customOverlays = getCustomOverlays();
                for (const [id, overlay] of Object.entries(customOverlays)) {
                    let changed = false;
                    for (const element of overlay.elements || []) {
                        if (element.type !== 'slideshow' || !(element.slideshow?.tags || []).some(item => item.toLowerCase() === key)) continue;
                        element.slideshow.tags = normalizeAssetTagList(element.slideshow.tags.flatMap(item => item.toLowerCase() === key ? (to ? [to] : []) : [item]));
                        changed = true;
                    }
                    if (changed) updated.push(id);
                }
                if (updated.length) {
                    saveCustomOverlays();
                    for (const id of updated) broadcastToOverlays('custom-overlay-update', { id, overlay: customOverlays[id] });
                }
                sendJson(res, { ok: true, assets: touched, overlays: updated });
            } catch (err) {
                sendError(res, err.message, 400);
            }
            return true;
        }

        if (pathname === '/api/asset-library' && req.method === 'GET') {
            const tags = normalizeAssetTagList(url.searchParams.get('tags'));
            const mode = url.searchParams.get('mode') === 'all' ? 'all' : 'any';
            const kinds = url.searchParams.get('kinds') === 'both' ? ['image', 'video'] : [url.searchParams.get('kinds') === 'video' ? 'video' : 'image'];
            let files = [];
            try { files = fs.readdirSync(customOverlayAssetsDir).filter(name => !name.startsWith('.')); } catch {}
            const wantedNames = url.searchParams.get('names');
            const pick = wantedNames !== null ? new Set(wantedNames.split('\n').filter(Boolean)) : null;
            const assetCaptions = getAssetCaptions();
            const assetTags = getAssetTags();
            const describe = name => ({
                name,
                kind: assetKind(name),
                label: assetLabel(name),
                caption: assetCaptions[name] || '',
                url: `/custom-overlay-assets/${encodeURIComponent(name)}`
            });
            const out = pick
                ? [...pick].filter(name => files.includes(name) && kinds.includes(assetKind(name))).map(describe)
                : files.filter(name => kinds.includes(assetKind(name)) && assetMatchesTags(name, tags, mode, assetTags)).sort().reverse().map(describe);
            sendJson(res, out);
            return true;
        }

        // --- 9. Overlay Presets ---
        if (pathname === '/api/overlay-presets' && req.method === 'GET') {
            sendJson(res, getOverlayPresets());
            return true;
        }

        if (pathname === '/api/overlay-presets' && req.method === 'POST') {
            try {
                const overlayPresets = getOverlayPresets();
                const [preset] = normalizeOverlayPresets([JSON.parse(await readRequestBody(req) || '{}')]);
                if (!preset) throw new Error('A preset needs an id and at least one element');
                const index = overlayPresets.findIndex(item => item.id === preset.id);
                if (index >= 0) overlayPresets[index] = preset;
                else if (overlayPresets.length >= 100) throw new Error('Preset limit reached (100). Delete some first.');
                else overlayPresets.push(preset);
                saveOverlayPresets();
                sendJson(res, preset);
            } catch (err) {
                sendError(res, err.message, 400);
            }
            return true;
        }

        const presetMatch = pathname.match(/^\/api\/overlay-presets\/([^/]+)$/);
        if (presetMatch && req.method === 'DELETE') {
            const id = sanitizeOverlayId(decodeURIComponent(presetMatch[1]));
            let overlayPresets = getOverlayPresets();
            const before = overlayPresets.length;
            overlayPresets = overlayPresets.filter(item => item.id !== id);
            setOverlayPresets(overlayPresets);
            if (overlayPresets.length !== before) saveOverlayPresets();
            if (overlayPresets.length !== before) {
                sendJson(res, { ok: true });
            } else {
                sendError(res, 'Preset not found', 404);
            }
            return true;
        }

        // --- 10. Randomizer endpoints ---
        if (pathname === '/api/randomizer/presets' && req.method === 'GET') {
            sendJson(res, { ok: true, presets: loadRandomizerPresets() });
            return true;
        }

        if (pathname === '/api/randomizer/presets' && req.method === 'POST') {
            try {
                const raw = await readRequestBody(req);
                const body = JSON.parse(raw || '{}');
                const name = String(body.name || '').trim();
                if (!name) {
                    sendError(res, 'Preset name is required', 400);
                    return true;
                }
                const choices = Array.isArray(body.choices)
                    ? body.choices.map(c => String(c).trim()).filter(Boolean)
                    : String(body.choices || '').split('\n').map(c => c.trim()).filter(Boolean);
                if (!choices.length) {
                    sendError(res, 'Preset choices cannot be empty', 400);
                    return true;
                }

                const presets = loadRandomizerPresets();
                let presetId = body.id ? String(body.id).trim() : null;
                const winnerHeader = body.winnerHeader !== undefined ? String(body.winnerHeader).trim() : undefined;
                const winnerSub = body.winnerSub !== undefined ? String(body.winnerSub).trim() : undefined;
                const buttonPreset = body.buttonPreset !== undefined ? String(body.buttonPreset).trim() : undefined;
                const buttonPhrases = Array.isArray(body.buttonPhrases)
                    ? body.buttonPhrases.map(s => String(s).trim()).filter(Boolean)
                    : (typeof body.buttonPhrases === 'string' ? body.buttonPhrases.split('\n').map(s => s.trim()).filter(Boolean) : undefined);
                let updatedPreset;
                if (presetId) {
                    const idx = presets.findIndex(p => p.id === presetId);
                    if (idx !== -1) {
                        presets[idx] = {
                            ...presets[idx],
                            name,
                            choices,
                            ...(winnerHeader !== undefined ? { winnerHeader } : {}),
                            ...(winnerSub !== undefined ? { winnerSub } : {}),
                            ...(buttonPreset !== undefined ? { buttonPreset } : {}),
                            ...(buttonPhrases !== undefined ? { buttonPhrases } : {}),
                            updatedAt: Date.now()
                        };
                        updatedPreset = presets[idx];
                    }
                }
                if (!updatedPreset) {
                    presetId = presetId || 'preset_' + Date.now();
                    updatedPreset = {
                        id: presetId,
                        name,
                        choices,
                        winnerHeader: winnerHeader || '',
                        winnerSub: winnerSub || '',
                        buttonPreset: buttonPreset || 'chaos',
                        buttonPhrases: buttonPhrases || [],
                        createdAt: Date.now()
                    };
                    presets.push(updatedPreset);
                }
                saveRandomizerPresets(presets);
                sendJson(res, { ok: true, preset: updatedPreset, presets });
            } catch (err) {
                sendError(res, err.message, 400);
            }
            return true;
        }

        if ((pathname.startsWith('/api/randomizer/presets/') && req.method === 'DELETE') ||
            (pathname === '/api/randomizer/presets/delete' && req.method === 'POST')) {
            try {
                let idToDelete = '';
                if (pathname.startsWith('/api/randomizer/presets/')) {
                    idToDelete = decodeURIComponent(pathname.slice('/api/randomizer/presets/'.length));
                } else {
                    const raw = await readRequestBody(req);
                    const body = JSON.parse(raw || '{}');
                    idToDelete = body.id;
                }
                let presets = loadRandomizerPresets();
                presets = presets.filter(p => p.id !== idToDelete);
                saveRandomizerPresets(presets);
                sendJson(res, { ok: true, presets });
            } catch (err) {
                sendError(res, err.message, 400);
            }
            return true;
        }

        if (pathname === '/api/randomizer/button-presets' && req.method === 'GET') {
            sendJson(res, { ok: true, presets: loadRandomizerButtonPresets() });
            return true;
        }

        if (pathname === '/api/randomizer/button-presets' && req.method === 'POST') {
            try {
                const raw = await readRequestBody(req);
                const body = JSON.parse(raw || '{}');
                const name = String(body.name || '').trim();
                if (!name) {
                    sendError(res, 'Preset name is required', 400);
                    return true;
                }
                const phrases = Array.isArray(body.phrases)
                    ? body.phrases.map(s => String(s).trim()).filter(Boolean)
                    : String(body.phrases || '').split('\n').map(s => s.trim()).filter(Boolean);
                if (!phrases.length) {
                    sendError(res, 'Button phrases cannot be empty', 400);
                    return true;
                }

                const presets = loadRandomizerButtonPresets();
                let presetId = body.id ? String(body.id).trim() : null;
                let updatedPreset;
                if (presetId) {
                    const idx = presets.findIndex(p => p.id === presetId);
                    if (idx !== -1) {
                        presets[idx] = {
                            ...presets[idx],
                            name,
                            phrases,
                            updatedAt: Date.now()
                        };
                        updatedPreset = presets[idx];
                    }
                }
                if (!updatedPreset) {
                    presetId = presetId || 'btn_' + Date.now();
                    updatedPreset = {
                        id: presetId,
                        name,
                        phrases,
                        createdAt: Date.now()
                    };
                    presets.push(updatedPreset);
                }
                saveRandomizerButtonPresets(presets);
                sendJson(res, { ok: true, preset: updatedPreset, presets });
            } catch (err) {
                sendError(res, err.message, 400);
            }
            return true;
        }

        if ((pathname.startsWith('/api/randomizer/button-presets/') && req.method === 'DELETE') ||
            (pathname === '/api/randomizer/button-presets/delete' && req.method === 'POST')) {
            try {
                let idToDelete = '';
                if (pathname.startsWith('/api/randomizer/button-presets/')) {
                    idToDelete = decodeURIComponent(pathname.slice('/api/randomizer/button-presets/'.length));
                } else {
                    const raw = await readRequestBody(req);
                    const body = JSON.parse(raw || '{}');
                    idToDelete = body.id;
                }
                let presets = loadRandomizerButtonPresets();
                presets = presets.filter(p => p.id !== idToDelete);
                saveRandomizerButtonPresets(presets);
                sendJson(res, { ok: true, presets });
            } catch (err) {
                sendError(res, err.message, 400);
            }
            return true;
        }

        if (pathname === '/api/randomizer/quote-presets' && req.method === 'GET') {
            sendJson(res, { ok: true, presets: loadRandomizerQuotePresets() });
            return true;
        }

        if (pathname === '/api/randomizer/quote-presets' && req.method === 'POST') {
            try {
                const raw = await readRequestBody(req);
                const body = JSON.parse(raw || '{}');
                const name = String(body.name || '').trim();
                if (!name) {
                    sendError(res, 'Preset name is required', 400);
                    return true;
                }
                const quotes = Array.isArray(body.quotes)
                    ? body.quotes.map(s => String(s).trim()).filter(Boolean)
                    : String(body.quotes || '').split('\n').map(s => s.trim()).filter(Boolean);
                if (!quotes.length) {
                    sendError(res, 'Quotes cannot be empty', 400);
                    return true;
                }

                const presets = loadRandomizerQuotePresets();
                let presetId = body.id ? String(body.id).trim() : null;
                let updatedPreset;
                if (presetId) {
                    const idx = presets.findIndex(p => p.id === presetId);
                    if (idx !== -1) {
                        presets[idx] = {
                            ...presets[idx],
                            name,
                            quotes,
                            updatedAt: Date.now()
                        };
                        updatedPreset = presets[idx];
                    }
                }
                if (!updatedPreset) {
                    presetId = presetId || 'quote_' + Date.now();
                    updatedPreset = {
                        id: presetId,
                        name,
                        quotes,
                        createdAt: Date.now()
                    };
                    presets.push(updatedPreset);
                }
                saveRandomizerQuotePresets(presets);
                sendJson(res, { ok: true, preset: updatedPreset, presets });
            } catch (err) {
                sendError(res, err.message, 400);
            }
            return true;
        }

        if ((pathname.startsWith('/api/randomizer/quote-presets/') && req.method === 'DELETE') ||
            (pathname === '/api/randomizer/quote-presets/delete' && req.method === 'POST')) {
            try {
                let idToDelete = '';
                if (pathname.startsWith('/api/randomizer/quote-presets/')) {
                    idToDelete = decodeURIComponent(pathname.slice('/api/randomizer/quote-presets/'.length));
                } else {
                    const raw = await readRequestBody(req);
                    const body = JSON.parse(raw || '{}');
                    idToDelete = body.id;
                }
                let presets = loadRandomizerQuotePresets();
                presets = presets.filter(p => p.id !== idToDelete);
                saveRandomizerQuotePresets(presets);
                sendJson(res, { ok: true, presets });
            } catch (err) {
                sendError(res, err.message, 400);
            }
            return true;
        }

        if (pathname === '/api/randomizer/spin' && (req.method === 'POST' || req.method === 'GET')) {
            try {
                let body = {};
                if (req.method === 'POST') {
                    const raw = await readRequestBody(req);
                    body = JSON.parse(raw || '{}');
                }
                const query = Object.fromEntries(url.searchParams.entries());
                const presetId = body.preset || query.preset || null;
                let choices = Array.isArray(body.choices) ? body.choices.map(c => String(c).trim()).filter(Boolean) : [];
                let winnerHeader = body.winnerHeader || query.winHeader || query.winnerHeader || '';
                let winnerSub = body.winnerSub || query.winSub || query.winnerSub || '';
                let buttonPhrases = Array.isArray(body.buttonPhrases) ? body.buttonPhrases : [];

                if (!choices.length) {
                    const presets = loadRandomizerPresets();
                    const matched = (presetId ? presets.find(p => p.id === presetId) : null) || presets[0];
                    if (matched) {
                        choices = matched.choices || [];
                        if (!winnerHeader && matched.winnerHeader) winnerHeader = matched.winnerHeader;
                        if (!winnerSub && matched.winnerSub) winnerSub = matched.winnerSub;
                        if (!buttonPhrases.length && matched.buttonPhrases) buttonPhrases = matched.buttonPhrases;
                    }
                }

                const winner = body.winner || query.winner || (choices.length ? choices[Math.floor(Math.random() * choices.length)] : 'Winner');
                const mode = body.mode || query.mode || 'roller';
                const suspense = body.suspense || query.suspense || 'normal';
                const duration = Number(body.duration || query.duration) || 6;
                const autohide = body.autohide !== undefined ? Number(body.autohide) : (query.autohide !== undefined ? Number(query.autohide) : 8);
                const theme = body.theme || query.theme || '';
                const accent = body.accent || query.accent || '';
                const font = body.font || query.font || '';

                const payload = {
                    preset: presetId,
                    choices,
                    winner,
                    winnerHeader,
                    winnerSub,
                    mode,
                    suspense,
                    theme,
                    duration,
                    autohide,
                    accent,
                    font,
                    weight: body.weight || query.weight || '',
                    text: body.text || query.text || '',
                    outline: body.outline || query.outline || '',
                    bg: body.bg || query.bg || '',
                    scale: body.scale || query.scale || '',
                    buttonPhrases,
                    showButton: body.showButton !== undefined ? !!body.showButton : (query.button === '1'),
                    buttonText: body.buttonText || query.btnText || '',
                    at: Date.now()
                };
                broadcastToOverlays('randomizer-spin', payload);
                sendJson(res, { ok: true, winner, preset: presetId, mode, theme, payload });
            } catch (err) {
                sendError(res, err.message, 400);
            }
            return true;
        }

        if (pathname === '/api/randomizer/chatters' && req.method === 'GET') {
            const chatData = getChatData();
            const statsData = getStatsData();
            const chatters = Object.keys(chatData?.chatters || {}).concat(Object.keys(statsData?.chatters || {}));
            const unique = [...new Set(chatters.map(c => c.trim()).filter(Boolean))];
            sendJson(res, { chatters: unique });
            return true;
        }

        // --- 11. Overlay Visibility ---
        if (pathname === '/api/overlay-visibility' && req.method === 'GET') {
            sendJson(res, { overlays: listOverlayVisibility() });
            return true;
        }

        const visibilityMatch = pathname.match(/^\/api\/overlay-visibility\/(.+)$/);
        if (visibilityMatch && req.method === 'POST') {
            let key = '';
            try { key = decodeURIComponent(visibilityMatch[1]); } catch { key = visibilityMatch[1]; }
            let action = url.searchParams.get('action') || '';
            if (!action) {
                try { action = JSON.parse(await readRequestBody(req) || '{}').action || ''; } catch {}
            }
            action = ['on', 'off', 'toggle'].includes(action) ? action : 'toggle';
            const result = setOverlayVisibility(key, action);
            if (result) {
                sendJson(res, result);
            } else {
                sendError(res, `Unknown overlay "${key}"`, 404);
            }
            return true;
        }

        // --- 12. QR Code ---
        if (pathname === '/api/qr') {
            const text = (url.searchParams.get('text') || '').slice(0, 1000);
            const color = (value, fallback) => /^#[0-9a-f]{6}$/i.test(value || '') ? value : fallback;
            if (!text) {
                sendText(res, 'Missing text', 400);
                return true;
            }
            try {
                const qrcode = require('qrcode');
                const svg = await qrcode.toString(text, {
                    type: 'svg',
                    errorCorrectionLevel: ['L', 'M', 'Q', 'H'].includes(url.searchParams.get('ecc')) ? url.searchParams.get('ecc') : 'M',
                    margin: Math.max(0, Math.min(8, Math.round(Number(url.searchParams.get('margin') ?? 2)))),
                    color: {
                        dark: color(url.searchParams.get('fg'), '#000000'),
                        light: url.searchParams.get('bg') === 'transparent' ? '#00000000' : color(url.searchParams.get('bg'), '#ffffff')
                    }
                });
                res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=3600' });
                res.end(svg);
            } catch (err) {
                sendText(res, err.message, 400);
            }
            return true;
        }

        return false;
    };
}

module.exports = {
    createOverlayRoutes,
    assetKind,
    assetLabel,
    assetFontFamily,
    assetReferencedIn,
    rewriteAssetReferences,
    historyFile,
    readOverlayHistory,
    recordOverlayRevision,
    normalizeAssetTagList,
    assetMatchesTags,
    normalizeOverlayPresets
};

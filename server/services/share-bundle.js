const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const SHARE_FORMAT = 'streampulse-share';
const SHARE_MAX_BYTES = 600 * 1024 * 1024;

function freeId(base, taken) {
    let n = 2;
    while (taken(`${base}-${n}`)) n++;
    return `${base}-${n}`.slice(0, 60);
}

function createShareBundleService({
    assetsDir,
    historyDir,
    shareAssetCodec,
    getCustomOverlays = () => ({}),
    saveCustomOverlays = () => {},
    normalizeCustomOverlay = (o, id) => o,
    syncOverlayPages = () => {},
    recordOverlayRevision = () => {},
    broadcastToOverlays = () => {},
    broadcastPage = () => {},
    overlayService,
    saveOverlayPresets = () => {},
    normalizeOverlayPresets = p => p,
    promoShareService,
    getPromoShareService,
    gamePlanPath,
    timersPath,
    alertsPath,
    loadTimers = () => {},
    buildTimersSnapshot = () => ({}),
    getAlertEngine = () => null,
    sanitizeOverlayId = id => String(id || '').replace(/[^a-zA-Z0-9_-]/g, '')
} = {}) {
    const getPromoShare = () => (typeof getPromoShareService === 'function' ? getPromoShareService() : promoShareService);
    const historyFile = id => path.join(historyDir, `${sanitizeOverlayId(id)}.json`);

    const shareSingles = {
        gameplan: { label: 'Game Plan', path: () => gamePlanPath, entry: 'game-plan.json' },
        timers: { label: 'Timers', path: () => timersPath, entry: 'timers.json' },
        alerts: { label: 'Alerts', path: () => alertsPath, entry: 'alerts.json' }
    };

    function readBinaryBody(req, limit = SHARE_MAX_BYTES) {
        return new Promise((resolve, reject) => {
            const chunks = [];
            let size = 0;
            req.on('data', chunk => {
                size += chunk.length;
                if (size > limit) { reject(new Error('File is too large')); req.destroy(); return; }
                chunks.push(chunk);
            });
            req.on('end', () => resolve(Buffer.concat(chunks)));
            req.on('error', reject);
        });
    }

    function listShareItems() {
        const singles = Object.entries(shareSingles)
            .filter(([, def]) => fs.existsSync(def.path()))
            .map(([type, def]) => ({ type, name: def.label }));
        const customOverlays = getCustomOverlays();
        const promoShare = getPromoShare();
        return {
            overlays: Object.values(customOverlays).map(o => ({ type: 'overlay', id: o.id, name: o.name })),
            presets: overlayService.getOverlayPresets().map(p => ({ type: 'preset', id: p.id, name: p.name, category: p.category })),
            promos: promoShare ? promoShare.listItems() : [],
            singles
        };
    }

    function buildShareZip(selection, includeHistory) {
        const zip = new AdmZip();
        const manifest = { format: SHARE_FORMAT, version: 1, createdAt: new Date().toISOString(), items: [] };
        const assets = new Set();
        const presetsOut = [];
        const customOverlays = getCustomOverlays();
        const promoShare = getPromoShare();

        for (const { type, id } of selection) {
            if (type === 'overlay') {
                const overlay = customOverlays[sanitizeOverlayId(id)];
                if (!overlay) continue;
                const text = JSON.stringify(overlay, null, 2);
                zip.addFile(`overlays/${overlay.id}.json`, Buffer.from(text));
                manifest.items.push({ type, id: overlay.id, name: overlay.name });
                shareAssetCodec.referencedNames(text).forEach(n => assets.add(n));
                if (includeHistory && fs.existsSync(historyFile(overlay.id))) {
                    zip.addLocalFile(historyFile(overlay.id), 'overlays', `${overlay.id}.history.json`);
                }
            } else if (type === 'preset') {
                const preset = overlayService.getOverlayPresets().find(p => p.id === id);
                if (!preset) continue;
                presetsOut.push(preset);
                manifest.items.push({ type, id: preset.id, name: preset.name });
                shareAssetCodec.referencedNames(JSON.stringify(preset)).forEach(n => assets.add(n));
            } else if (type === 'promo') {
                if (!promoShare) continue;
                const promo = promoShare.get(id);
                if (!promo) continue;
                promoShare.addToArchive(zip, manifest, promo, assets);
            } else if (shareSingles[type] && fs.existsSync(shareSingles[type].path())) {
                zip.addLocalFile(shareSingles[type].path(), '', shareSingles[type].entry);
                manifest.items.push({ type, name: shareSingles[type].label });
            }
        }
        if (presetsOut.length) zip.addFile('presets.json', Buffer.from(JSON.stringify(presetsOut, null, 2)));
        for (const name of assets) {
            const assetPath = path.join(assetsDir, name);
            if (fs.existsSync(assetPath)) zip.addLocalFile(assetPath, 'assets', name);
        }
        zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2)));
        return { buffer: zip.toBuffer(), count: manifest.items.length };
    }

    function openShareZip(buffer) {
        const zip = new AdmZip(buffer);
        const manifestEntry = zip.getEntry('manifest.json');
        if (!manifestEntry) throw new Error('Not a StreamPulse share file (manifest.json is missing)');
        const manifest = JSON.parse(manifestEntry.getData().toString('utf8'));
        if (manifest.format !== SHARE_FORMAT) throw new Error('Not a StreamPulse share file');
        return { zip, manifest };
    }

    function importShareZip(buffer, selected, conflict) {
        const { zip, manifest } = openShareZip(buffer);
        const wanted = new Set(selected);
        const results = [];
        const entryText = name => { const e = zip.getEntry(name); return e ? e.getData().toString('utf8') : null; };
        const importAssets = shareAssetCodec.createImporter(zip);
        const customOverlays = getCustomOverlays();

        for (const item of manifest.items || []) {
            const key = item.id ? `${item.type}:${item.id}` : item.type;
            if (!wanted.has(key)) continue;
            try {
                if (item.type === 'overlay') {
                    const sourceId = sanitizeOverlayId(item.id);
                    const raw = entryText(`overlays/${sourceId}.json`);
                    if (!raw) throw new Error('missing from file');
                    const exists = !!customOverlays[sourceId];
                    if (exists && conflict === 'skip') { results.push({ key, status: 'skipped' }); continue; }
                    const targetId = exists && conflict === 'copy' ? freeId(sourceId, id => !!customOverlays[id]) : sourceId;
                    const parsed = JSON.parse(importAssets(raw));
                    if (exists && conflict === 'copy') parsed.name = `${parsed.name || sourceId} (imported)`;
                    const previous = customOverlays[targetId];
                    if (previous) recordOverlayRevision(previous);
                    const overlay = normalizeCustomOverlay({ ...parsed, revision: previous ? previous.revision + 1 : 1, updatedAt: new Date().toISOString() }, targetId);
                    customOverlays[targetId] = overlay;
                    saveCustomOverlays();
                    syncOverlayPages(overlay, previous);
                    const history = !previous && entryText(`overlays/${sourceId}.history.json`);
                    if (history) { fs.mkdirSync(historyDir, { recursive: true }); fs.writeFileSync(historyFile(targetId), history); }
                    broadcastToOverlays('custom-overlay-update', { id: targetId, overlay });
                    broadcastPage(overlay);
                    results.push({ key, status: targetId === sourceId ? (previous ? 'replaced' : 'added') : 'copied', id: targetId });
                } else if (item.type === 'preset') {
                    const raw = entryText('presets.json');
                    const source = raw && JSON.parse(raw).find(p => p.id === item.id);
                    if (!source) throw new Error('missing from file');
                    const presetsList = overlayService.getOverlayPresets();
                    const exists = presetsList.some(p => p.id === source.id);
                    if (exists && conflict === 'skip') { results.push({ key, status: 'skipped' }); continue; }
                    const targetId = exists && conflict === 'copy' ? freeId(source.id, id => presetsList.some(p => p.id === id)) : source.id;
                    const [preset] = normalizeOverlayPresets([{ ...JSON.parse(importAssets(JSON.stringify(source))), id: targetId }]);
                    if (!preset) throw new Error('invalid preset');
                    overlayService.setOverlayPresets([...presetsList.filter(p => p.id !== targetId), preset]);
                    saveOverlayPresets();
                    results.push({ key, status: exists ? (targetId === source.id ? 'replaced' : 'copied') : 'added', id: targetId });
                } else if (item.type === 'promo') {
                    const promoShare = getPromoShare();
                    if (!promoShare) throw new Error('Promo service unavailable');
                    const raw = entryText(`promos/${item.id}.json`);
                    results.push(promoShare.importItem(item, raw, conflict, importAssets, freeId));
                } else if (shareSingles[item.type]) {
                    const def = shareSingles[item.type];
                    const raw = entryText(def.entry);
                    if (!raw) throw new Error('missing from file');
                    JSON.parse(raw);
                    if (conflict === 'skip' && fs.existsSync(def.path())) { results.push({ key, status: 'skipped' }); continue; }
                    if (fs.existsSync(def.path())) fs.copyFileSync(def.path(), `${def.path()}.pre-import.bak`);
                    fs.writeFileSync(def.path(), raw);
                    if (item.type === 'timers') { loadTimers(); broadcastToOverlays('timers-snapshot', buildTimersSnapshot()); }
                    if (item.type === 'alerts') {
                        const alertEngine = getAlertEngine();
                        if (alertEngine) alertEngine.setConfig(JSON.parse(raw));
                    }
                    results.push({ key, status: 'replaced' });
                }
            } catch (err) {
                results.push({ key, status: 'failed', error: err.message });
            }
        }
        return results;
    }

    return {
        readBinaryBody,
        listShareItems,
        buildShareZip,
        openShareZip,
        importShareZip,
        shareSingles
    };
}

module.exports = {
    createShareBundleService,
    SHARE_FORMAT,
    SHARE_MAX_BYTES
};

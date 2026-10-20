const PROMO_ID = /^[a-zA-Z0-9-]{1,80}$/;

function createPromoShareService({ promoService, shareAssets }) {
    const get = id => PROMO_ID.test(id || '') ? promoService.list().find(promo => promo.id === id) || null : null;

    return {
        listItems() {
            return promoService.list().map(promo => ({ type: 'promo', id: promo.id, name: promo.name }));
        },
        get,
        exists(id) {
            return !!get(id);
        },
        addToArchive(zip, manifest, promo, includedAssets) {
            if (!get(promo.id)) throw new Error('Promo not found');
            const text = JSON.stringify(promo, null, 2);
            zip.addFile(`promos/${promo.id}.json`, Buffer.from(text));
            manifest.items.push({ type: 'promo', id: promo.id, name: promo.name });
            shareAssets.referencedNames(text).forEach(name => includedAssets.add(name));
        },
        importItem(item, raw, conflict, importAssets, freeId) {
            if (!PROMO_ID.test(item.id || '')) throw new Error('Invalid promo id in share file');
            if (!raw) throw new Error('Promo scene is missing from the share file');
            const existing = get(item.id);
            const key = `promo:${item.id}`;
            if (existing && conflict === 'skip') return { key, status: 'skipped' };
            const targetId = existing && conflict === 'copy'
                ? freeId(item.id, id => !!get(id))
                : item.id;
            const promo = JSON.parse(importAssets(raw));
            if (!promo || typeof promo !== 'object' || Array.isArray(promo)) throw new Error('Invalid promo scene');
            if (existing && conflict === 'copy') promo.name = `${String(promo.name || item.name || 'Promo').slice(0, 68)} (imported)`;
            if (!promoService.saveImported(promo, targetId)) throw new Error('Could not save imported promo scene');
            return { key, status: existing ? (targetId === item.id ? 'replaced' : 'copied') : 'added', id: targetId };
        }
    };
}

module.exports = { createPromoShareService };

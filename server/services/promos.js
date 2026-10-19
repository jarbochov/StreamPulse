const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { normalize } = require('../../public/js/promo-model');
const { safeWriteFileSync } = require('../routes/helpers');

function createPromoService({ dataDir }) {
    const file = path.join(dataDir, 'promos.json');
    const read = () => {
        if (!fs.existsSync(file)) return [];
        const designs = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (!Array.isArray(designs)) throw new Error('Invalid promo library file.');
        return designs;
    };
    const write = designs => safeWriteFileSync(file, JSON.stringify(designs, null, 2));
    return {
        list: read,
        save(input, id) {
            const designs = read();
            const at = id ? designs.findIndex(design => design.id === id) : -1;
            if (id && at < 0) return null;
            if (at < 0 && designs.length >= 200) throw new Error('Promo library is full (200 designs). Remove an unused design first.');
            const design = { ...normalize(input), id: id || randomUUID(), updatedAt: new Date().toISOString() };
            if (at < 0) designs.push(design);
            else designs[at] = design;
            write(designs);
            return design;
        },
        remove(id) {
            const designs = read(), next = designs.filter(design => design.id !== id);
            if (next.length === designs.length) return false;
            write(next);
            return true;
        },
        assetUsers(name) {
            const url = `/custom-overlay-assets/${encodeURIComponent(name)}`;
            return read().filter(design => [design.photo, design.artwork].includes(url))
                .map(design => ({ id: `promo:${design.id}`, name: `Promo: ${design.name}` }));
        },
        renameAsset(oldName, newName) {
            const url = `/custom-overlay-assets/${encodeURIComponent(oldName)}`;
            const designs = read();
            let changed = false;
            for (const design of designs) for (const key of ['photo', 'artwork']) if (design[key] === url) {
                design[key] = `/custom-overlay-assets/${encodeURIComponent(newName)}`;
                changed = true;
            }
            if (changed) write(designs);
            return changed;
        }
    };
}

module.exports = { createPromoService };

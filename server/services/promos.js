const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { normalize, normalizeTheme } = require('../../public/js/promo-model');
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
    const themeFile = path.join(dataDir, 'promo-themes.json');
    const readThemes = () => {
        if (!fs.existsSync(themeFile)) return [];
        const themes = JSON.parse(fs.readFileSync(themeFile, 'utf8'));
        if (!Array.isArray(themes)) throw new Error('Invalid promo theme library file.');
        return themes;
    };
    const writeThemes = themes => safeWriteFileSync(themeFile, JSON.stringify(themes, null, 2));
    const imageRefs = design => [design.photo, design.artwork, ...Object.values(design.layouts || {}).map(layout => layout.background?.image), design.background?.image];
    return {
        list: read,
        listThemes: readThemes,
        saveTheme(input, id) {
            const themes = readThemes();
            const at = id ? themes.findIndex(theme => theme.id === id) : -1;
            if (id && at < 0) return null;
            if (at < 0 && themes.length >= 100) throw new Error('Custom theme library is full (100 themes). Remove an unused theme first.');
            const theme = { ...normalizeTheme(input), id: id || randomUUID(), updatedAt: new Date().toISOString() };
            if (at < 0) themes.push(theme);
            else themes[at] = theme;
            writeThemes(themes);
            return theme;
        },
        removeTheme(id) {
            const themes = readThemes(), next = themes.filter(theme => theme.id !== id);
            if (next.length === themes.length) return false;
            writeThemes(next);
            return true;
        },
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
        saveImported(input, id) {
            const designs = read();
            const at = designs.findIndex(design => design.id === id);
            if (at < 0 && designs.length >= 200) throw new Error('Promo library is full (200 designs). Remove an unused design first.');
            const design = { ...normalize(input), id, updatedAt: new Date().toISOString() };
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
            return [
                ...read().filter(design => imageRefs(design).includes(url)).map(design => ({ id: `promo:${design.id}`, name: `Promo: ${design.name}` })),
                ...readThemes().filter(theme => imageRefs(theme).includes(url)).map(theme => ({ id: `promo-theme:${theme.id}`, name: `Promo theme: ${theme.name}` }))
            ];
        },
        renameAsset(oldName, newName) {
            const url = `/custom-overlay-assets/${encodeURIComponent(oldName)}`;
            const designs = read(), themes = readThemes();
            let changed = false;
            for (const design of [...designs, ...themes]) {
                const refs = [[design, 'photo'], [design, 'artwork'], ...Object.values(design.layouts || {}).filter(layout => layout.background).map(layout => [layout.background, 'image'])];
                if (design.background) refs.push([design.background, 'image']);
                for (const [object, key] of refs) if (object[key] === url) {
                    object[key] = `/custom-overlay-assets/${encodeURIComponent(newName)}`;
                    changed = true;
                }
            }
            if (changed) { write(designs); writeThemes(themes); }
            return changed;
        }
    };
}

module.exports = { createPromoService };

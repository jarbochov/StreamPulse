const fs = require('fs');
const path = require('path');
const { assetReferencedIn, rewriteAssetReferences, assetFontFamily } = require('./overlays');

const FONT_EXTENSIONS = new Set(['.ttf', '.otf', '.woff', '.woff2']);

function createShareAssetCodec({ assetsDir }) {
    const referencedNames = text => {
        if (!fs.existsSync(assetsDir)) return [];
        return fs.readdirSync(assetsDir).filter(name => {
            const family = FONT_EXTENSIONS.has(path.extname(name).toLowerCase()) ? assetFontFamily(name) : '';
            return assetReferencedIn(text, name, family);
        });
    };

    function createImporter(zip) {
        const assetMap = new Map();
        return text => {
            let output = text;
            for (const entry of zip.getEntries()) {
                if (!entry.entryName.startsWith('assets/') || entry.isDirectory) continue;
                const name = path.basename(entry.entryName);
                if (name !== entry.entryName.slice('assets/'.length)) continue;
                const family = FONT_EXTENSIONS.has(path.extname(name).toLowerCase()) ? assetFontFamily(name) : '';
                if (!assetReferencedIn(text, name, family)) continue;
                if (!assetMap.has(name)) {
                    const data = entry.getData();
                    const destination = path.join(assetsDir, name);
                    fs.mkdirSync(assetsDir, { recursive: true });
                    if (!fs.existsSync(destination)) {
                        fs.writeFileSync(destination, data);
                        assetMap.set(name, name);
                    } else if (fs.readFileSync(destination).equals(data)) {
                        assetMap.set(name, name);
                    } else {
                        const renamed = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 4)}-${name.replace(/^[a-z0-9]{6,}-/, '')}`;
                        fs.writeFileSync(path.join(assetsDir, renamed), data);
                        assetMap.set(name, renamed);
                    }
                }
                const importedName = assetMap.get(name);
                if (importedName !== name) {
                    const importedFamily = FONT_EXTENSIONS.has(path.extname(name).toLowerCase()) ? assetFontFamily(importedName) : '';
                    output = rewriteAssetReferences(output, name, importedName, family, importedFamily);
                }
            }
            return output;
        };
    }

    return { referencedNames, createImporter };
}

module.exports = { createShareAssetCodec };

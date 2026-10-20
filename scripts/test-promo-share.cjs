const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const AdmZip = require('adm-zip');
const { createPromoService } = require('../server/services/promos');
const { createPromoShareService } = require('../server/services/promo-share');
const { createShareAssetCodec } = require('../server/services/share-assets');

function freeId(base, taken) {
    let suffix = 2;
    while (taken(`${base}-${suffix}`)) suffix++;
    return `${base}-${suffix}`;
}

test('promo scene share bundles include referenced assets and import with copy, replace, and skip conflicts', t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-promo-share-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const sourceData = path.join(root, 'source');
    const sourceAssets = path.join(sourceData, 'custom-overlay-assets');
    fs.mkdirSync(sourceAssets, { recursive: true });
    const image = Buffer.from('source-image');
    const font = Buffer.from('source-font');
    fs.writeFileSync(path.join(sourceAssets, 'scene.png'), image);
    fs.writeFileSync(path.join(sourceAssets, 'abcdef-sample-font.woff2'), font);

    const sourceService = createPromoService({ dataDir: sourceData });
    const sourceCodec = createShareAssetCodec({ assetsDir: sourceAssets });
    const sourceShare = createPromoShareService({ promoService: sourceService, shareAssets: sourceCodec });
    const promo = sourceService.save({
        name: 'Launch scene',
        title: 'Going live',
        font: 'sample font',
        photo: '/custom-overlay-assets/scene.png'
    });
    const manifest = { format: 'streampulse-share', version: 1, items: [] };
    const archive = new AdmZip();
    const assets = new Set();
    sourceShare.addToArchive(archive, manifest, promo, assets);
    for (const name of assets) archive.addLocalFile(path.join(sourceAssets, name), 'assets', name);
    archive.addFile('manifest.json', Buffer.from(JSON.stringify(manifest)));
    const bundle = new AdmZip(archive.toBuffer());
    assert.deepEqual(
        bundle.getEntries().map(entry => entry.entryName).sort(),
        ['assets/abcdef-sample-font.woff2', 'assets/scene.png', `manifest.json`, `promos/${promo.id}.json`].sort()
    );

    const destinationData = path.join(root, 'destination');
    const destinationAssets = path.join(destinationData, 'custom-overlay-assets');
    fs.mkdirSync(destinationAssets, { recursive: true });
    const destinationService = createPromoService({ dataDir: destinationData });
    const destinationCodec = createShareAssetCodec({ assetsDir: destinationAssets });
    const destinationShare = createPromoShareService({ promoService: destinationService, shareAssets: destinationCodec });
    const item = manifest.items[0];
    const raw = bundle.getEntry(`promos/${promo.id}.json`).getData().toString('utf8');
    const importAssets = destinationCodec.createImporter(bundle);

    assert.deepEqual(destinationShare.importItem(item, raw, 'copy', importAssets, freeId), {
        key: `promo:${promo.id}`, status: 'added', id: promo.id
    });
    assert.equal(destinationService.list()[0].photo, '/custom-overlay-assets/scene.png');
    assert.equal(destinationService.list()[0].font, 'sample font');
    assert.deepEqual(fs.readFileSync(path.join(destinationAssets, 'scene.png')), image);
    assert.deepEqual(fs.readFileSync(path.join(destinationAssets, 'abcdef-sample-font.woff2')), font);

    fs.writeFileSync(path.join(destinationAssets, 'scene.png'), Buffer.from('different-image'));
    fs.writeFileSync(path.join(destinationAssets, 'abcdef-sample-font.woff2'), Buffer.from('different-font'));
    const copied = destinationShare.importItem(item, raw, 'copy', destinationCodec.createImporter(bundle), freeId);
    assert.equal(copied.status, 'copied');
    assert.equal(copied.id, `${promo.id}-2`);
    const copy = destinationService.list().find(design => design.id === copied.id);
    assert.equal(copy.name, 'Launch scene (imported)');
    assert.notEqual(copy.photo, '/custom-overlay-assets/scene.png');
    assert.equal(copy.font, 'sample font');
    assert.ok(fs.existsSync(path.join(destinationAssets, decodeURIComponent(copy.photo.split('/').pop()))));
    assert.ok(fs.readdirSync(destinationAssets).some(name =>
        name !== 'abcdef-sample-font.woff2' && name.endsWith('-sample-font.woff2') &&
        fs.readFileSync(path.join(destinationAssets, name)).equals(font)
    ));

    assert.deepEqual(destinationShare.importItem(item, raw, 'skip', () => {
        throw new Error('skip must not import assets');
    }, freeId), { key: `promo:${promo.id}`, status: 'skipped' });
    assert.equal(destinationService.list().length, 2);

    const replaced = destinationShare.importItem(item, raw.replace('Going live', 'Updated headline'), 'replace', destinationCodec.createImporter(bundle), freeId);
    assert.equal(replaced.status, 'replaced');
    assert.equal(replaced.id, promo.id);
    assert.equal(destinationService.list().find(design => design.id === promo.id).title, 'Updated headline');
});

import { renderPromo } from './promo-renderer.js';

const crcTable = Array.from({ length: 256 }, (_, value) => {
    for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    return value >>> 0;
});

// PNGs are already compressed; store them in a standard ZIP without recompression.
function archive(files) {
    const parts = [], directory = [];
    let offset = 0, directorySize = 0;
    for (const { name, data } of files) {
        const filename = new TextEncoder().encode(name);
        let crc = 0xffffffff;
        for (const byte of data) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
        crc = (crc ^ 0xffffffff) >>> 0;
        const local = new Uint8Array(30 + filename.length), l = new DataView(local.buffer);
        l.setUint32(0, 0x04034b50, true); l.setUint16(4, 20, true); l.setUint16(12, 33, true);
        l.setUint32(14, crc, true); l.setUint32(18, data.length, true); l.setUint32(22, data.length, true);
        l.setUint16(26, filename.length, true); local.set(filename, 30);
        const central = new Uint8Array(46 + filename.length), c = new DataView(central.buffer);
        c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true);
        c.setUint16(14, 33, true); c.setUint32(16, crc, true);
        c.setUint32(20, data.length, true); c.setUint32(24, data.length, true);
        c.setUint16(28, filename.length, true); c.setUint32(42, offset, true); central.set(filename, 46);
        parts.push(local, data); directory.push(central);
        offset += local.length + data.length; directorySize += central.length;
    }
    const end = new Uint8Array(22), e = new DataView(end.buffer);
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
    e.setUint32(12, directorySize, true); e.setUint32(16, offset, true);
    return new Blob([...parts, ...directory, end], { type: 'application/zip' });
}

export async function exportPromos(design) {
    const name = design.name.replace(/[^a-z0-9_-]/gi, '-').slice(0, 80) || 'promo', files = [];
    for (const ratio of Object.keys(window.PromoModel.SIZES)) {
        const canvas = document.createElement('canvas');
        await renderPromo(canvas, design, ratio, { preview: false });
        const blob = await new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error(`PNG export failed for ${ratio}.`)), 'image/png'));
        files.push({ name: `${name}-${ratio}.png`, data: new Uint8Array(await blob.arrayBuffer()) });
        canvas.width = 1; canvas.height = 1;
    }
    return { name: `${name}-all-formats.zip`, blob: archive(files) };
}

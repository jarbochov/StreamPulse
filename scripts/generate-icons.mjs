import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');
const buildDir = path.join(rootDir, 'build');
const desktopDir = path.join(rootDir, 'desktop');

if (!fs.existsSync(buildDir)) {
    fs.mkdirSync(buildDir, { recursive: true });
}

// Convert an array of PNG buffers to a valid Windows .ico file
function createIcoFile(pngBuffers) {
    const numImages = pngBuffers.length;
    const header = Buffer.alloc(6);
    header.writeUInt16LE(0, 0); // reserved
    header.writeUInt16LE(1, 2); // icon type
    header.writeUInt16LE(numImages, 4);

    let offset = 6 + (16 * numImages);
    const directoryEntries = [];
    const imageDataBuffers = [];

    for (const { size, buffer } of pngBuffers) {
        const entry = Buffer.alloc(16);
        entry.writeUInt8(size >= 256 ? 0 : size, 0); // width
        entry.writeUInt8(size >= 256 ? 0 : size, 1); // height
        entry.writeUInt8(0, 2); // color palette count
        entry.writeUInt8(0, 3); // reserved
        entry.writeUInt16LE(1, 4); // color planes
        entry.writeUInt16LE(32, 6); // bits per pixel
        entry.writeUInt32LE(buffer.length, 8); // image byte size
        entry.writeUInt32LE(offset, 12); // file offset

        directoryEntries.push(entry);
        imageDataBuffers.push(buffer);
        offset += buffer.length;
    }

    return Buffer.concat([header, ...directoryEntries, ...imageDataBuffers]);
}

async function generate() {
    console.log('Rendering StreamPulse favicon icon assets...');
    const svgContent = fs.readFileSync(path.join(rootDir, 'public', 'favicon.svg'), 'utf8');

    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    // Render HTML with exact SVG centered and scaled
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            html, body { width: 100%; height: 100%; background: transparent; overflow: hidden; display: flex; align-items: center; justify-content: center; }
            svg { width: 100%; height: 100%; display: block; }
        </style>
    </head>
    <body>
        ${svgContent}
    </body>
    </html>
    `;

    await page.setContent(html);

    // 1. Render 1024x1024 master icon
    await page.setViewport({ width: 1024, height: 1024, deviceScaleFactor: 1 });
    const buf1024 = await page.screenshot({ omitBackground: true, type: 'png' });
    fs.writeFileSync(path.join(buildDir, 'icon.png'), buf1024);
    console.log('Generated build/icon.png (1024x1024)');

    // 2. Render 512x512 desktop icon
    await page.setViewport({ width: 512, height: 512, deviceScaleFactor: 1 });
    const buf512 = await page.screenshot({ omitBackground: true, type: 'png' });
    fs.writeFileSync(path.join(desktopDir, 'icon.png'), buf512);
    console.log('Generated desktop/icon.png (512x512)');

    // 3. Render 32x32 & 64x64 tray icons
    await page.setViewport({ width: 32, height: 32, deviceScaleFactor: 1 });
    const buf32 = await page.screenshot({ omitBackground: true, type: 'png' });
    fs.writeFileSync(path.join(desktopDir, 'tray-icon.png'), buf32);

    await page.setViewport({ width: 64, height: 64, deviceScaleFactor: 1 });
    const buf64 = await page.screenshot({ omitBackground: true, type: 'png' });
    fs.writeFileSync(path.join(desktopDir, 'tray-icon@2x.png'), buf64);
    console.log('Generated desktop/tray-icon.png & tray-icon@2x.png');

    // 4. Generate multi-resolution Windows .ico
    const icoSizes = [16, 24, 32, 48, 64, 128, 256];
    const icoBuffers = [];
    for (const size of icoSizes) {
        await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
        const buf = await page.screenshot({ omitBackground: true, type: 'png' });
        icoBuffers.push({ size, buffer: buf });
    }
    const icoData = createIcoFile(icoBuffers);
    fs.writeFileSync(path.join(buildDir, 'icon.ico'), icoData);
    console.log('Generated build/icon.ico (multi-resolution 16-256px)');

    await browser.close();

    // 5. Generate macOS .icns using iconutil
    const iconsetDir = path.join(buildDir, 'icon.iconset');
    if (fs.existsSync(iconsetDir)) {
        fs.rmSync(iconsetDir, { recursive: true, force: true });
    }
    fs.mkdirSync(iconsetDir, { recursive: true });

    const icnsMap = [
        { name: 'icon_16x16.png', size: 16 },
        { name: 'icon_16x16@2x.png', size: 32 },
        { name: 'icon_32x32.png', size: 32 },
        { name: 'icon_32x32@2x.png', size: 64 },
        { name: 'icon_128x128.png', size: 128 },
        { name: 'icon_128x128@2x.png', size: 256 },
        { name: 'icon_256x256.png', size: 256 },
        { name: 'icon_256x256@2x.png', size: 512 },
        { name: 'icon_512x512.png', size: 512 },
        { name: 'icon_512x512@2x.png', size: 1024 }
    ];

    for (const { name, size } of icnsMap) {
        const dest = path.join(iconsetDir, name);
        execSync(`sips -z ${size} ${size} "${path.join(buildDir, 'icon.png')}" --out "${dest}"`, { stdio: 'pipe' });
    }

    try {
        execSync(`iconutil -c icns "${iconsetDir}" -o "${path.join(buildDir, 'icon.icns')}"`, { stdio: 'pipe' });
        console.log('Generated build/icon.icns via iconutil');
    } finally {
        fs.rmSync(iconsetDir, { recursive: true, force: true });
    }

    console.log('All desktop app icons generated successfully!');
}

generate().catch(err => {
    console.error('Failed to generate icons:', err);
    process.exit(1);
});

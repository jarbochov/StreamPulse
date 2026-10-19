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
const docsDir = path.join(rootDir, 'docs');
const docsImagesDir = path.join(docsDir, 'images');

const DRIVE_LOGO = '/Users/jaredacherup/Library/CloudStorage/GoogleDrive-jared.cherup@gmail.com/My Drive/Creative Cloud Files/StreamPulse/StreamPulseLogo.png';
const DRIVE_ICON = '/Users/jaredacherup/Library/CloudStorage/GoogleDrive-jared.cherup@gmail.com/My Drive/Creative Cloud Files/StreamPulse/StreamPulseIcon.png';

const SOURCE_LOGO = fs.existsSync(DRIVE_LOGO) ? DRIVE_LOGO : path.join(docsImagesDir, 'logo.png');
const SOURCE_ICON = fs.existsSync(DRIVE_ICON) ? DRIVE_ICON : path.join(buildDir, 'icon-emblem.png');

if (!fs.existsSync(SOURCE_LOGO)) {
    throw new Error(`Source logo not found at: ${SOURCE_LOGO}`);
}
if (!fs.existsSync(SOURCE_ICON)) {
    throw new Error(`Source icon not found at: ${SOURCE_ICON}`);
}

if (!fs.existsSync(buildDir)) fs.mkdirSync(buildDir, { recursive: true });
if (!fs.existsSync(desktopDir)) fs.mkdirSync(desktopDir, { recursive: true });
if (!fs.existsSync(docsImagesDir)) fs.mkdirSync(docsImagesDir, { recursive: true });

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

async function run() {
    console.log('Starting StreamPulse brand asset generation...');

    const logoRawBase64 = fs.readFileSync(SOURCE_LOGO).toString('base64');

    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    // 1. Ensure master logo in docs/images/logo.png
    if (SOURCE_LOGO !== path.join(docsImagesDir, 'logo.png')) {
        fs.copyFileSync(SOURCE_LOGO, path.join(docsImagesDir, 'logo.png'));
        console.log('Copied master logo to docs/images/logo.png');
    }

    // 2. Render rounded tile icons using Puppeteer
    const renderRoundedTile = async (size) => {
        const radius = Math.round(size * 0.22);
        const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                html, body {
                    width: ${size}px;
                    height: ${size}px;
                    background: transparent;
                    overflow: hidden;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .tile {
                    width: ${size}px;
                    height: ${size}px;
                    border-radius: ${radius}px;
                    overflow: hidden;
                    background: transparent;
                }
                .tile img {
                    width: 100%;
                    height: 100%;
                    display: block;
                }
            </style>
        </head>
        <body>
            <div class="tile">
                <img src="data:image/png;base64,${logoRawBase64}" />
            </div>
        </body>
        </html>
        `;
        await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
        await page.setContent(html);
        const buf = await page.screenshot({ omitBackground: true, type: 'png' });
        return Buffer.from(buf);
    };

    console.log('Rendering rounded tiles...');
    const buf1024 = await renderRoundedTile(1024);
    fs.writeFileSync(path.join(buildDir, 'icon.png'), buf1024);
    console.log('Generated build/icon.png (1024x1024 rounded tile)');

    const buf512 = await renderRoundedTile(512);
    fs.writeFileSync(path.join(desktopDir, 'icon.png'), buf512);
    console.log('Generated desktop/icon.png (512x512 rounded tile)');

    const buf180 = await renderRoundedTile(180);
    fs.writeFileSync(path.join(docsImagesDir, 'apple-touch-icon.png'), buf180);
    console.log('Generated docs/images/apple-touch-icon.png (180x180)');

    // 3. Render Favicons (public/favicon.svg and docs/favicon.svg)
    const buf128 = await renderRoundedTile(128);
    const faviconBase64 = buf128.toString('base64');
    const svgFavicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <image width="128" height="128" href="data:image/png;base64,${faviconBase64}" />
</svg>
`;
    fs.writeFileSync(path.join(rootDir, 'public', 'favicon.svg'), svgFavicon);
    fs.writeFileSync(path.join(rootDir, 'docs', 'favicon.svg'), svgFavicon);
    console.log('Generated public/favicon.svg and docs/favicon.svg');

    // 4. Multi-resolution Windows .ico
    console.log('Generating Windows build/icon.ico...');
    const icoSizes = [16, 24, 32, 48, 64, 128, 256];
    const icoBuffers = [];
    for (const size of icoSizes) {
        const buf = await renderRoundedTile(size);
        icoBuffers.push({ size, buffer: buf });
    }
    const icoData = createIcoFile(icoBuffers);
    fs.writeFileSync(path.join(buildDir, 'icon.ico'), icoData);
    console.log('Generated build/icon.ico');

    // 5. Tray Icons (macOS Black Template and Inverted White for Dark Themes)
    console.log('Generating Tray icons...');
    execSync(`sips -z 18 18 "${SOURCE_ICON}" --out "${path.join(desktopDir, 'tray-icon.png')}"`, { stdio: 'pipe' });
    execSync(`sips -z 36 36 "${SOURCE_ICON}" --out "${path.join(desktopDir, 'tray-icon@2x.png')}"`, { stdio: 'pipe' });
    fs.copyFileSync(path.join(desktopDir, 'tray-icon.png'), path.join(desktopDir, 'tray-iconTemplate.png'));
    fs.copyFileSync(path.join(desktopDir, 'tray-icon@2x.png'), path.join(desktopDir, 'tray-iconTemplate@2x.png'));
    console.log('Generated desktop/tray-icon.png and tray-iconTemplate.png (18x18, 36x36 macOS templates)');

    // Inverted White Tray Icons (for Windows/Linux dark taskbars)
    const renderInvertedTray = async (size, srcFile) => {
        const b64 = fs.readFileSync(srcFile).toString('base64');
        const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>* { margin: 0; padding: 0; box-sizing: border-box; } body { background: transparent; overflow: hidden; }</style>
        </head>
        <body>
            <canvas id="c" width="${size}" height="${size}"></canvas>
            <img id="img" src="data:image/png;base64,${b64}">
            <script>
                window.ready = new Promise(resolve => {
                    const img = document.getElementById('img');
                    img.onload = () => {
                        const c = document.getElementById('c');
                        const ctx = c.getContext('2d');
                        ctx.drawImage(img, 0, 0);
                        const imgData = ctx.getImageData(0, 0, ${size}, ${size});
                        const d = imgData.data;
                        for (let i = 0; i < d.length; i += 4) {
                            if (d[i + 3] > 0) {
                                d[i] = 255;
                                d[i + 1] = 255;
                                d[i + 2] = 255;
                            }
                        }
                        ctx.putImageData(imgData, 0, 0);
                        img.style.display = 'none';
                        resolve();
                    };
                });
            </script>
        </body>
        </html>
        `;
        await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
        await page.setContent(html);
        await page.evaluate(() => window.ready);
        const canvasHandle = await page.$('#c');
        const buf = await canvasHandle.screenshot({ omitBackground: true, type: 'png' });
        return Buffer.from(buf);
    };

    const white18 = await renderInvertedTray(18, path.join(desktopDir, 'tray-icon.png'));
    fs.writeFileSync(path.join(desktopDir, 'tray-icon-white.png'), white18);
    const white36 = await renderInvertedTray(36, path.join(desktopDir, 'tray-icon@2x.png'));
    fs.writeFileSync(path.join(desktopDir, 'tray-icon-white@2x.png'), white36);
    console.log('Generated desktop/tray-icon-white.png and tray-icon-white@2x.png');

    await browser.close();

    // 6. Generate macOS .icns using iconutil
    console.log('Generating macOS build/icon.icns...');
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

    console.log('All brand assets successfully generated!');
}

run().catch(err => {
    console.error('Asset generation failed:', err);
    process.exit(1);
});

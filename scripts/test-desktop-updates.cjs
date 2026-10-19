const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const puppeteer = require('puppeteer');
const AdmZip = require('adm-zip');
const { createUpdateService } = require('../server/services/updates');
const { createSystemRoutes } = require('../server/routes/system');
const { createStaticRouter } = require('../server/static-router');

const release = {
    tag_name: '0.13.2', html_url: 'https://github.com/jarbochov/StreamPulse/releases/tag/0.13.2',
    zipball_url: 'https://fixture.invalid/source.zip',
    assets: [{ name: 'StreamPulse-0.13.2-arm64.dmg', browser_download_url: 'https://fixture.invalid/desktop.dmg' }]
};
const noSideEffect = () => assert.fail('Desktop updater must not execute commands, download, back up, or restart');

test('packaged and ASAR installations block source updates before any side effects', async t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-desktop-update-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    for (const packaged of [true, false]) {
        const rootDir = packaged ? root : path.join(root, 'app.asar');
        fs.mkdirSync(rootDir, { recursive: true });
        fs.writeFileSync(path.join(rootDir, 'package.json'), JSON.stringify({ version: '0.13.1' }));
        const service = createUpdateService({
            rootDir, packaged, execFileAsync: noSideEffect, getJson: async () => release,
            downloadFile: noSideEffect, performAutoBackup: noSideEffect,
            runNpmCi: noSideEffect, restartServer: noSideEffect
        });
        const info = await service.getUpdateInfo();
        assert.equal(info.installation, 'desktop');
        assert.equal(info.supportsNightly, false);
        assert.equal(info.canApply, false);
        const status = await service.getUpdateStatus();
        assert.equal(status.currentLabel, '0.13.1');
        assert.equal(status.latestLabel, '0.13.2');
        assert.equal(status.updateAvailable, true);
        assert.equal(status.releaseUrl, release.html_url);
        assert.equal(status.downloadUrl, undefined, 'never advertise a source archive for desktop installation');
        assert.deepEqual(status.installers, [{ name: release.assets[0].name, url: release.assets[0].browser_download_url }]);
        await assert.rejects(service.applyUpdate('release'), /Desktop apps must be updated using the desktop installer/);
        await assert.rejects(service.applyUpdate('nightly'), /Desktop apps must be updated using the desktop installer/);
        await assert.rejects(service.getUpdateStatus('nightly'), /not supported by packaged desktop apps/);
        fs.writeFileSync(path.join(rootDir, 'package.json'), JSON.stringify({ version: '0.13.2' }));
        assert.equal((await service.getUpdateStatus()).updateAvailable, false);
    }
});

test('source folders and Git checkouts retain their update channels', async t => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-source-update-'));
    t.after(() => fs.rmSync(rootDir, { recursive: true, force: true }));
    fs.writeFileSync(path.join(rootDir, 'package.json'), JSON.stringify({ version: '0.13.1' }));
    let git = false;
    const service = createUpdateService({
        rootDir, getJson: async url => url.endsWith('/commits/main') ? { sha: 'newsha123' } : release,
        execFileAsync: async (_command, args) => {
            if (!git) throw new Error('Not a Git checkout');
            return { stdout: args[0] === 'rev-parse' ? 'oldsha456\n' : '0.13.1\n' };
        }
    });
    assert.equal((await service.getUpdateInfo()).installation, 'release-folder');
    const folder = await service.getUpdateStatus();
    assert.equal(folder.downloadUrl, release.zipball_url);
    assert.equal(folder.updateAvailable, true);
    await assert.rejects(service.getUpdateStatus('nightly'), /require a Git checkout/);
    git = true;
    assert.equal((await service.getUpdateInfo()).supportsNightly, true);
    const checkout = await service.getUpdateStatus();
    assert.equal(checkout.installation, 'git');
    assert.equal(checkout.currentSha, 'oldsha456');
    assert.equal(checkout.currentLabel, '0.13.1');
    assert.equal(checkout.updateAvailable, true);
    assert.equal((await service.getUpdateStatus('nightly')).latestSha, 'newsha123');
});

test('source-folder updates still preserve configuration, data, and installed dependencies', async t => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-folder-update-'));
    t.after(() => fs.rmSync(rootDir, { recursive: true, force: true }));
    fs.writeFileSync(path.join(rootDir, 'package.json'), JSON.stringify({ version: '0.13.1' }));
    for (const name of ['config.json', 'data/fixture.json', 'node_modules/fixture.json']) {
        fs.mkdirSync(path.dirname(path.join(rootDir, name)), { recursive: true });
        fs.writeFileSync(path.join(rootDir, name), 'preserved');
    }
    const archive = new AdmZip();
    archive.addFile('release/server.js', Buffer.from('updated application'));
    for (const name of ['config.json', 'data/fixture.json', 'node_modules/fixture.json']) {
        archive.addFile(`release/${name}`, Buffer.from('must not replace user files'));
    }
    const steps = [];
    let restarted;
    const restart = new Promise(resolve => { restarted = resolve; });
    const service = createUpdateService({
        rootDir, getJson: async () => release,
        execFileAsync: async () => { throw new Error('No Git checkout'); },
        performAutoBackup: async () => { steps.push('backup'); },
        downloadFile: async (_url, destination) => { steps.push('download'); archive.writeZip(destination); },
        runNpmCi: async () => { steps.push('dependencies'); },
        restartServer: async () => { steps.push('restart'); restarted(); }
    });
    assert.equal((await service.applyUpdate('release')).updated, true);
    await restart;
    assert.deepEqual(steps, ['backup', 'download', 'dependencies', 'restart']);
    assert.equal(fs.readFileSync(path.join(rootDir, 'server.js'), 'utf8'), 'updated application');
    for (const name of ['config.json', 'data/fixture.json', 'node_modules/fixture.json']) {
        assert.equal(fs.readFileSync(path.join(rootDir, name), 'utf8'), 'preserved');
    }
});

test('desktop update page hides nightly and source install controls before checking releases', { timeout: 30000 }, async t => {
    const rootDir = path.resolve(__dirname, '..');
    let packaged = true;
    const service = () => createUpdateService({
        rootDir, packaged, getJson: async () => release,
        execFileAsync: async () => ({ stdout: 'fixture-sha' }),
        downloadFile: noSideEffect, performAutoBackup: noSideEffect,
        runNpmCi: noSideEffect, restartServer: noSideEffect
    });
    const system = createSystemRoutes({
        getUpdateInfo: () => service().getUpdateInfo(),
        getUpdateStatus: mode => service().getUpdateStatus(mode),
        applyUpdate: mode => service().applyUpdate(mode)
    });
    const router = createStaticRouter({ rootDir, publicDir: path.join(rootDir, 'public') });
    const server = http.createServer(async (req, res) => {
        const url = new URL(req.url, 'http://fixture.local');
        if (await system(req, res, url, url.pathname)) return;
        if (url.pathname.startsWith('/api/')) {
            res.setHeader('Content-Type', 'application/json');
            res.end('{}');
        } else if (!router.handleRequest(req, res)) { res.writeHead(404); res.end(); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    t.after(async () => {
        await browser.close();
        await new Promise(resolve => server.close(resolve));
    });
    const origin = `http://127.0.0.1:${server.address().port}`;
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setRequestInterception(true);
    page.on('request', req => {
        if (new URL(req.url()).origin === origin) req.continue();
        else req.respond({ status: 200, body: '' });
    });
    await page.goto(`${origin}/update.html`);
    await page.waitForFunction(() => !document.getElementById('desktop-download').hidden);
    assert.equal(await page.$eval('#nightly-panel', el => el.hidden), true);
    assert.equal(await page.$eval('#apply-release', el => el.hidden), true);
    await page.evaluate(() => window.check('release'));
    assert.equal(await page.$eval('#apply-release', el => el.disabled), true);
    assert.equal(await page.$eval('#desktop-download', el => el.href), release.html_url);
    assert.match(await page.$eval('#result', el => el.textContent), /desktop installer/);
    const response = await fetch(`${origin}/api/update/apply`, {
        method: 'POST', body: JSON.stringify({ mode: 'release' })
    });
    assert.equal(response.status, 409);
    assert.match((await response.json()).error, /desktop installer/);
    packaged = false;
    await page.reload();
    await page.waitForFunction(() => !document.getElementById('nightly-panel').hidden);
    assert.equal(await page.$eval('#apply-release', el => el.hidden), false);
    assert.equal(await page.$eval('#desktop-download', el => el.hidden), true);
    assert.deepEqual(errors, []);
});

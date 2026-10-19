const fs = require('fs');
const os = require('os');
const path = require('path');
const AdmZip = require('adm-zip');

const REPOSITORY = 'jarbochov/StreamPulse';
const RELEASE_URL = `https://github.com/${REPOSITORY}/releases/latest`;
const DESKTOP_UPDATE_MESSAGE = 'Desktop apps must be updated using the desktop installer. Back up, quit StreamPulse fully, install the new version, then reopen it. Your configuration and data are stored separately from the app.';

// Older releases used "0.8" for package version "0.8.0".
function sameVersion(a, b) {
    const parts = v => String(v).replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0);
    const x = parts(a), y = parts(b);
    for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] || 0) !== (y[i] || 0)) return false;
    return true;
}

function createUpdateService({ rootDir, packaged = false, execFileAsync, getJson, downloadFile, performAutoBackup, runNpmCi, restartServer }) {
    const desktop = packaged || /(?:^|[/\\])[^/\\]+\.asar(?:[/\\]|$)/i.test(rootDir);
    const installedVersion = () => String(JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8')).version || '');

    async function getUpdateInfo() {
        if (desktop) {
            return {
                installation: 'desktop', canApply: false, supportsNightly: false,
                currentSha: null, currentLabel: installedVersion(), releaseUrl: RELEASE_URL,
                message: DESKTOP_UPDATE_MESSAGE
            };
        }
        let currentSha = null;
        try {
            const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: rootDir });
            currentSha = stdout.trim();
        } catch { /* source archive without Git metadata */ }
        return { installation: currentSha ? 'git' : 'release-folder', canApply: true, supportsNightly: !!currentSha, currentSha };
    }

    async function getUpdateStatus(mode = 'release') {
        const info = await getUpdateInfo();
        if (desktop) {
            if (mode === 'nightly') throw new Error('Nightly source updates are not supported by packaged desktop apps. Install a published desktop release instead.');
            const release = await getJson(`https://api.github.com/repos/${REPOSITORY}/releases/latest`);
            const assets = (release.assets || []).filter(asset => /\.(dmg|zip|exe)$/i.test(asset.name) && asset.name.startsWith('StreamPulse'));
            return {
                ...info, mode, latestLabel: release.tag_name, releaseName: release.name || release.tag_name,
                releaseUrl: release.html_url || RELEASE_URL,
                installers: assets.map(asset => ({ name: asset.name, url: asset.browser_download_url })),
                updateAvailable: !sameVersion(info.currentLabel, release.tag_name)
            };
        }
        const { currentSha } = info;
        if (mode === 'nightly') {
            if (!currentSha) throw new Error('Nightly updates require a Git checkout. Downloaded release folders support stable releases only.');
            const remote = await getJson(`https://api.github.com/repos/${REPOSITORY}/commits/main`);
            return { mode, installation: 'git', currentSha, latestSha: remote.sha, latestLabel: remote.sha.slice(0, 7), updateAvailable: remote.sha !== currentSha };
        }
        const release = await getJson(`https://api.github.com/repos/${REPOSITORY}/releases/latest`);
        if (!currentSha) {
            const version = installedVersion();
            return { mode, installation: 'release-folder', currentSha: null, currentLabel: version || 'Downloaded release folder', latestSha: release.target_commitish, latestLabel: release.tag_name, releaseName: release.name || release.tag_name, releaseUrl: release.html_url, downloadUrl: release.zipball_url, updateAvailable: !version || !sameVersion(version, release.tag_name) };
        }
        let currentLabel = '';
        try {
            const result = await execFileAsync('git', ['describe', '--tags', '--exact-match', 'HEAD'], { cwd: rootDir });
            currentLabel = result.stdout.trim();
        } catch { /* checkout is between release tags */ }
        return { mode, installation: 'git', currentSha, currentLabel, latestLabel: release.tag_name, updateAvailable: release.tag_name !== currentLabel, releaseName: release.name || release.tag_name, releaseUrl: release.html_url, downloadUrl: release.zipball_url };
    }

    async function applyUpdate(mode) {
        if (!['release', 'nightly'].includes(mode)) throw new Error('Invalid update mode');
        if (desktop) throw new Error(`${DESKTOP_UPDATE_MESSAGE} Download: ${RELEASE_URL}`);
        const status = await getUpdateStatus(mode);
        if (!status.updateAvailable) return { ...status, updated: false, message: 'Already up to date.' };
        if (status.installation === 'release-folder') {
            const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'streampulse-update-'));
            const archivePath = path.join(tempDir, 'release.zip');
            const extractDir = path.join(tempDir, 'extract');
            try {
                await performAutoBackup(true);
                await downloadFile(status.downloadUrl, archivePath);
                fs.mkdirSync(extractDir);
                new AdmZip(archivePath).extractAllTo(extractDir, true);
                const root = fs.readdirSync(extractDir, { withFileTypes: true }).find(entry => entry.isDirectory());
                if (!root) throw new Error('Release archive did not contain an application folder.');
                for (const entry of fs.readdirSync(path.join(extractDir, root.name))) {
                    if (['config.json', 'data', 'node_modules'].includes(entry)) continue;
                    fs.cpSync(path.join(extractDir, root.name, entry), path.join(rootDir, entry), { recursive: true, force: true });
                }
                await runNpmCi();
            } finally {
                fs.rmSync(tempDir, { recursive: true, force: true });
            }
            setTimeout(() => restartServer().catch(err => console.error('[Update] Restart failed:', err)), 500);
            return { ...status, updated: true, message: 'Release installed. StreamPulse is restarting.' };
        }
        const { stdout: changes } = await execFileAsync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: rootDir });
        if (changes.trim()) throw new Error('Update blocked: tracked local changes must be committed or stashed first.');
        await performAutoBackup(true);
        try {
            await execFileAsync('git', ['fetch', '--tags', '--force', 'origin'], { cwd: rootDir });
        } catch {
            await execFileAsync('git', ['fetch', '--force', 'origin'], { cwd: rootDir });
        }
        if (mode === 'nightly') {
            await execFileAsync('git', ['checkout', 'main'], { cwd: rootDir });
            await execFileAsync('git', ['reset', '--hard', 'origin/main'], { cwd: rootDir });
        } else {
            await execFileAsync('git', ['checkout', status.latestLabel], { cwd: rootDir });
        }
        try {
            await runNpmCi();
        } catch (err) {
            throw new Error(`Dependencies failed to install: ${err.message}`);
        }
        setTimeout(() => restartServer().catch(err => console.error('[Update] Restart failed:', err)), 500);
        return { ...status, updated: true, message: 'Update installed. StreamPulse is restarting.' };
    }

    return { getUpdateInfo, getUpdateStatus, applyUpdate };
}

module.exports = { createUpdateService };

const fs = require('fs');
const path = require('path');
const { parentPort, workerData } = require('worker_threads');
const AdmZip = require('adm-zip');

function addBackupFiles(zip, { files = [], folders = [] }) {
    for (const file of files) {
        if (fs.existsSync(file.src)) {
            if (!fs.statSync(file.src).isFile()) throw new Error(`Backup source is not a file: ${file.src}`);
            const dir = path.posix.dirname(file.dest);
            zip.addLocalFile(file.src, dir === '.' ? '' : dir, path.posix.basename(file.dest));
        }
    }
    for (const folder of folders) {
        if (folder.src && fs.existsSync(folder.src)) {
            if (!fs.statSync(folder.src).isDirectory()) throw new Error(`Backup source is not a folder: ${folder.src}`);
            zip.addLocalFolder(folder.src, folder.dest);
        }
    }
}

function createArchive(options) {
    const zip = new AdmZip();
    addBackupFiles(zip, options);
    const output = path.join(options.workDir, 'backup.zip');
    // writeZip can report failures via its callback; a synchronous write throws reliably.
    fs.writeFileSync(output, zip.toBuffer());
    if (!options.backupPath) return { path: output, size: fs.statSync(output).size };

    fs.renameSync(output, options.backupPath);
    const backups = fs.readdirSync(path.dirname(options.backupPath))
        .filter(name => name.startsWith('backup-') && name.endsWith('.zip'))
        .sort();
    const removed = [];
    while (backups.length > 10) {
        const oldest = backups.shift();
        fs.unlinkSync(path.join(path.dirname(options.backupPath), oldest));
        removed.push(oldest);
    }
    return { path: options.backupPath, removed };
}

function safeDestination(name, options) {
    if (name.includes('\\') || name.includes('\0') || name.split('/').includes('..')) return null;
    if (name === 'config.json') return path.resolve(options.configPath);
    if (!name.startsWith('data/')) return null;
    const base = path.resolve(options.dataDir);
    const target = path.resolve(base, name.slice(5));
    const relative = path.relative(base, target);
    if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return null;
    return target;
}

function validateDestination(target, options) {
    const base = target === path.resolve(options.configPath)
        ? path.dirname(target) : path.resolve(options.dataDir);
    // The configured root is trusted; archive-controlled children must not follow symlinks.
    let current = base;
    for (const part of path.relative(base, target).split(path.sep)) {
        current = path.join(current, part);
        try {
            if (fs.lstatSync(current).isSymbolicLink()) {
                throw new Error(`Restore destination contains a symbolic link: ${current}`);
            }
        } catch (err) {
            if (err.code !== 'ENOENT') throw err;
        }
    }
}

function restoreArchive(options) {
    const zip = new AdmZip(options.inputPath);
    const entries = zip.getEntries();
    if (!entries.some(entry => entry.entryName === 'data/stats.json' || entry.entryName === 'stats.json')) {
        const error = new Error('Invalid backup: missing stats.json');
        error.code = 'INVALID_BACKUP';
        throw error;
    }
    const staged = [];
    for (const entry of entries) {
        if (entry.isDirectory) continue;
        const target = safeDestination(entry.entryName, options);
        if (!target) continue;
        validateDestination(target, options);
        const stagedPath = path.join(options.workDir, `restore-${staged.length}`);
        // Decompress/CRC-check every selected entry before modifying live files.
        fs.writeFileSync(stagedPath, entry.getData());
        staged.push({ name: entry.entryName, target, stagedPath });
    }
    return { staged, entries: entries.map(entry => ({ entryName: entry.entryName, isDirectory: entry.isDirectory })) };
}

try {
    const result = workerData.operation === 'restore'
        ? restoreArchive(workerData) : createArchive(workerData);
    parentPort.postMessage({ result });
} catch (err) {
    parentPort.postMessage({ error: { message: err.message, code: err.code } });
}

const fs = require('fs');
const path = require('path');
const { Worker } = require('worker_threads');
const { pipeline } = require('stream/promises');

function backupError(message, code) {
    return Object.assign(new Error(message), { code });
}

function createBackupService({
    backupsDir,
    workerPath = path.join(__dirname, 'backup-worker.js'),
    maxPending = 2,
    workerTimeoutMs = 0
}) {
    const pending = [];
    let active = null;
    let closed = false;
    let closePromise;

    async function applyRestore({ staged, entries }, options, workDir) {
        const restored = [];
        for (const file of staged) {
            const base = file.target === path.resolve(options.configPath)
                ? path.dirname(file.target) : path.resolve(options.dataDir);
            let current = base;
            for (const part of path.relative(base, file.target).split(path.sep)) {
                current = path.join(current, part);
                try {
                    if ((await fs.promises.lstat(current)).isSymbolicLink()) {
                        throw new Error(`Restore destination contains a symbolic link: ${current}`);
                    }
                } catch (err) {
                    if (err.code !== 'ENOENT') throw err;
                }
            }
            await fs.promises.mkdir(path.dirname(file.target), { recursive: true });
            const pendingPath = path.join(path.dirname(file.target), `.restore-${path.basename(workDir)}-${restored.length}`);
            try {
                await fs.promises.copyFile(file.stagedPath, pendingPath, fs.constants.COPYFILE_EXCL);
                await fs.promises.rename(pendingPath, file.target);
            } finally {
                await fs.promises.rm(pendingPath, { force: true });
            }
            restored.push(file.name);
        }
        return { restored, entries };
    }

    function runWorker(options, signal) {
        return new Promise((resolve, reject) => {
            const worker = new Worker(workerPath, {
                workerData: options
            });
            let reply;
            let failure;
            const abort = () => {
                failure = backupError('Backup operation cancelled', 'ABORT_ERR');
                void worker.terminate();
            };
            const timer = workerTimeoutMs > 0 ? setTimeout(() => {
                failure = backupError('Backup worker timed out', 'BACKUP_TIMEOUT');
                void worker.terminate();
            }, workerTimeoutMs) : null;
            signal.addEventListener('abort', abort, { once: true });
            if (signal.aborted) abort();
            worker.once('message', message => { reply = message; });
            worker.once('error', err => { failure = err; });
            worker.once('exit', code => {
                clearTimeout(timer);
                signal.removeEventListener('abort', abort);
                if (failure) reject(failure);
                else if (code !== 0 || !reply) reject(new Error(`Backup worker exited without a result (code ${code})`));
                else if (reply.error) reject(backupError(reply.error.message, reply.error.code));
                else resolve(reply.result);
            });
        });
    }

    function pump() {
        if (active || !pending.length) return;
        const job = pending.shift();
        active = job;
        job.done = (async () => {
            let workDir;
            let result;
            let failure;
            try {
                await fs.promises.mkdir(backupsDir, { recursive: true });
                workDir = await fs.promises.mkdtemp(path.join(backupsDir, '.backup-work-'));
                if (job.controller.signal.aborted) throw backupError('Backup operation cancelled', 'ABORT_ERR');
                result = await job.task(workDir, job.controller.signal);
            } catch (err) {
                failure = err;
            } finally {
                try {
                    if (workDir) await fs.promises.rm(workDir, { recursive: true, force: true });
                } catch (err) { failure ||= err; }
                job.signal?.removeEventListener('abort', job.abort);
                active = null;
                pump();
            }
            if (failure) job.reject(failure);
            else job.resolve(result);
        })();
    }

    function enqueue(task, signal) {
        if (closed) return Promise.reject(backupError('Backup service is closed', 'BACKUP_CLOSED'));
        if (signal?.aborted) return Promise.reject(backupError('Backup operation cancelled', 'ABORT_ERR'));
        if (active && pending.length >= maxPending) {
            return Promise.reject(backupError('Backup service is busy; try again when the current backups finish', 'BACKUP_BUSY'));
        }
        return new Promise((resolve, reject) => {
            const job = { task, resolve, reject, signal, controller: new AbortController() };
            job.abort = () => {
                job.controller.abort();
                const index = pending.indexOf(job);
                if (index !== -1) {
                    pending.splice(index, 1);
                    signal?.removeEventListener('abort', job.abort);
                    reject(backupError('Backup operation cancelled', 'ABORT_ERR'));
                }
            };
            signal?.addEventListener('abort', job.abort, { once: true });
            pending.push(job);
            pump();
        });
    }

    return {
        download(options, consume, { signal } = {}) {
            return enqueue(async (workDir, workerSignal) => {
                const result = await runWorker({ ...options, operation: 'create', workDir }, workerSignal);
                return await consume(result, workerSignal);
            }, signal);
        },
        autoBackup(options) {
            return enqueue((workDir, signal) => runWorker({ ...options, operation: 'create', workDir }, signal));
        },
        restore(options, source, reload, { signal, beforeApply = () => {} } = {}) {
            return enqueue(async (workDir, workerSignal) => {
                const inputPath = path.join(workDir, 'upload.zip');
                let bytes = 0;
                async function* limited(chunks) {
                    for await (const chunk of chunks) {
                        bytes += chunk.length;
                        if (bytes > 600 * 1024 * 1024) throw new Error('Payload too large');
                        yield chunk;
                    }
                }
                await pipeline(source, limited, fs.createWriteStream(inputPath), { signal: workerSignal });
                const result = await runWorker({ ...options, inputPath, operation: 'restore', workDir }, workerSignal);
                if (workerSignal.aborted) throw backupError('Backup operation cancelled', 'ABORT_ERR');
                // Once publishing starts, finish and reload even if the HTTP client disconnects.
                const context = await beforeApply();
                if (workerSignal.aborted) throw backupError('Backup operation cancelled', 'ABORT_ERR');
                return await reload(await applyRestore(result, options, workDir), context);
            }, signal);
        },
        close() {
            if (closePromise) return closePromise;
            closed = true;
            for (const job of pending.splice(0)) {
                job.signal?.removeEventListener('abort', job.abort);
                job.reject(backupError('Backup service is closed', 'BACKUP_CLOSED'));
            }
            active?.controller.abort();
            closePromise = active?.done || Promise.resolve();
            return closePromise;
        },
        async waitForIdle() {
            while (active) await active.done;
        }
    };
}

function buildBackupFileSpecs({
    dataDir = path.join(process.cwd(), 'data'),
    configPath = path.join(process.cwd(), 'config.json'),
    liveChatPath = path.join(dataDir, 'chat.json'),
    chatLogPath = path.join(dataDir, 'chat-log.jsonl'),
    statsPath = path.join(dataDir, 'stats.json'),
    bannedHashtagsPath = path.join(dataDir, '.banned-hashtags.json'),
    timersPath = path.join(dataDir, 'timers.json'),
    highlightsPath = path.join(dataDir, 'highlights.jsonl'),
    clipCandidatesPath = path.join(dataDir, 'clip-candidates.json'),
    customOverlaysPath = path.join(dataDir, 'custom-overlays.json'),
    overlayPresetsPath = path.join(dataDir, 'overlay-presets.json'),
    assetTagsPath = path.join(dataDir, 'asset-tags.json'),
    assetCaptionsPath = path.join(dataDir, 'asset-captions.json'),
    gamePlanPath = path.join(dataDir, 'game-plan.json'),
    randomizerPresetsPath = path.join(dataDir, 'randomizer-presets.json'),
    randomizerButtonPresetsPath = path.join(dataDir, 'randomizer-button-presets.json'),
    randomizerQuotePresetsPath = path.join(dataDir, 'randomizer-quote-presets.json')
} = {}) {
    const knownFiles = [
        { src: configPath, dest: 'config.json' },
        { src: liveChatPath, dest: 'data/chat.json' },
        { src: chatLogPath, dest: 'data/chat-log.jsonl' },
        { src: statsPath, dest: 'data/stats.json' },
        { src: bannedHashtagsPath, dest: 'data/.banned-hashtags.json' },
        { src: timersPath, dest: 'data/timers.json' },
        { src: path.join(dataDir, 'subs.json'), dest: 'data/subs.json' },
        { src: path.join(dataDir, 'bits.json'), dest: 'data/bits.json' },
        { src: path.join(dataDir, 'followers.json'), dest: 'data/followers.json' },
        { src: highlightsPath, dest: 'data/highlights.jsonl' },
        { src: clipCandidatesPath, dest: 'data/clip-candidates.json' },
        { src: customOverlaysPath, dest: 'data/custom-overlays.json' },
        { src: overlayPresetsPath, dest: 'data/overlay-presets.json' },
        { src: assetTagsPath, dest: 'data/asset-tags.json' },
        { src: assetCaptionsPath, dest: 'data/asset-captions.json' },
        { src: gamePlanPath, dest: 'data/game-plan.json' },
        { src: path.join(dataDir, 'promos.json'), dest: 'data/promos.json' },
        { src: path.join(dataDir, 'promo-themes.json'), dest: 'data/promo-themes.json' },
        { src: path.join(dataDir, 'alerts.json'), dest: 'data/alerts.json' },
        { src: path.join(dataDir, 'alert-events.json'), dest: 'data/alert-events.json' },
        { src: path.join(dataDir, 'polls.json'), dest: 'data/polls.json' },
        { src: path.join(dataDir, 'matchup.json'), dest: 'data/matchup.json' },
        { src: path.join(dataDir, 'tier-list.json'), dest: 'data/tier-list.json' },
        { src: path.join(dataDir, 'chatbot.json'), dest: 'data/chatbot.json' },
        { src: path.join(dataDir, 'chatbot-usage.json'), dest: 'data/chatbot-usage.json' },
        { src: path.join(dataDir, 'quotes.json'), dest: 'data/quotes.json' },
        { src: path.join(dataDir, 'variables.json'), dest: 'data/variables.json' },
        { src: randomizerPresetsPath, dest: 'data/randomizer-presets.json' },
        { src: randomizerButtonPresetsPath, dest: 'data/randomizer-button-presets.json' },
        { src: randomizerQuotePresetsPath, dest: 'data/randomizer-quote-presets.json' },
        { src: path.join(dataDir, 'chatter-notes.json'), dest: 'data/chatter-notes.json' },
        { src: path.join(dataDir, 'moderators.json'), dest: 'data/moderators.json' },
        { src: path.join(dataDir, 'vips.json'), dest: 'data/vips.json' },
        { src: path.join(dataDir, 'follower-history.json'), dest: 'data/follower-history.json' },
        { src: path.join(dataDir, 'sub-history.json'), dest: 'data/sub-history.json' },
        { src: path.join(dataDir, 'session-lifecycle.json'), dest: 'data/session-lifecycle.json' },
        { src: path.join(dataDir, 'game-info-cache.json'), dest: 'data/game-info-cache.json' },
        { src: path.join(dataDir, 'music-artwork.png'), dest: 'data/music-artwork.png' },
        { src: path.join(dataDir, 'music-fallback.png'), dest: 'data/music-fallback.png' }
    ];

    const seenDests = new Set(knownFiles.map(f => f.dest));
    const dynamicFiles = [];
    try {
        if (fs.existsSync(dataDir)) {
            const entries = fs.readdirSync(dataDir, { withFileTypes: true });
            for (const entry of entries) {
                if (!entry.isFile()) continue;
                const name = entry.name;
                if (
                    name.startsWith('.twitch-token') ||
                    name.startsWith('twitch-token') ||
                    name.startsWith('.stats-backup-') ||
                    name.startsWith('.backup-work-') ||
                    name.startsWith('.restore-') ||
                    name.startsWith('.chat.json.tmp') ||
                    name.endsWith('.tmp') ||
                    name === '.DS_Store' ||
                    name === '.gitkeep' ||
                    name === 'ssn-debug.log'
                ) {
                    continue;
                }
                const dest = `data/${name}`;
                if (!seenDests.has(dest)) {
                    seenDests.add(dest);
                    dynamicFiles.push({ src: path.join(dataDir, name), dest });
                }
            }
        }
    } catch { /* ignore dynamic discovery error */ }

    return [...knownFiles, ...dynamicFiles];
}

module.exports = {
    createBackupService,
    buildBackupFileSpecs
};

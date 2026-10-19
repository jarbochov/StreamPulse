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

module.exports = { createBackupService };

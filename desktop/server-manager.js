const { fork } = require('child_process');
const path = require('path');
const http = require('http');
const fs = require('fs');

class ServerManager {
    constructor(options = {}) {
        this.projectRoot = options.projectRoot || path.join(__dirname, '..');
        this.serverPath = path.join(this.projectRoot, 'server.js');
        this.dataDir = options.dataDir || null;
        this.configPath = options.configPath || null;
        this.port = options.port || this.getConfiguredPort();
        this.process = null;
        this.logs = [];
        this.maxLogs = 500;
        this.isStopping = false;
    }

    getConfiguredPort() {
        try {
            const configPath = this.configPath || path.join(this.projectRoot, 'config.json');
            if (fs.existsSync(configPath)) {
                const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                if (config.port && Number.isInteger(config.port)) {
                    return config.port;
                }
            }
        } catch {
            // Fall back to default
        }
        return 3000;
    }

    appendLog(data, isErr = false) {
        const text = data.toString();
        const lines = text.split('\n').filter(Boolean);
        const timestamp = new Date().toLocaleTimeString();
        for (const line of lines) {
            this.logs.push({ timestamp, text: line, isErr });
            if (this.logs.length > this.maxLogs) {
                this.logs.shift();
            }
        }
    }

    getLogs() {
        return this.logs;
    }

    start() {
        if (this.process) return;
        this.isStopping = false;

        const env = {
            ...process.env,
            PORT: String(this.port),
            STREAMPULSE_DESKTOP: 'true'
        };
        if (this.dataDir) {
            env.STREAMPULSE_DATA_DIR = this.dataDir;
        }
        if (this.configPath) {
            env.STREAMPULSE_CONFIG_PATH = this.configPath;
        }

        this.process = fork(this.serverPath, [], {
            cwd: this.projectRoot,
            env,
            stdio: ['pipe', 'pipe', 'pipe', 'ipc']
        });

        this.process.stdout.on('data', data => this.appendLog(data, false));
        this.process.stderr.on('data', data => this.appendLog(data, true));

        this.process.on('exit', (code, signal) => {
            this.appendLog(`[Server Process] Exited with code ${code}, signal ${signal}`, code !== 0);
            this.process = null;
        });

        this.process.on('error', err => {
            this.appendLog(`[Server Process Error] ${err.message}`, true);
        });
    }

    async waitForReady(timeoutMs = 15000) {
        const start = Date.now();
        const checkUrl = `http://127.0.0.1:${this.port}/api/session`;

        while (Date.now() - start < timeoutMs) {
            try {
                const isReady = await new Promise(resolve => {
                    const req = http.get(checkUrl, { timeout: 1000 }, res => {
                        resolve(res.statusCode >= 200 && res.statusCode < 400);
                    });
                    req.on('error', () => resolve(false));
                    req.on('timeout', () => { req.destroy(); resolve(false); });
                });

                if (isReady) return true;
            } catch {
                // Continue polling
            }
            await new Promise(r => setTimeout(r, 250));
        }

        throw new Error(`StreamPulse backend server timed out after ${timeoutMs}ms on port ${this.port}`);
    }

    async stop() {
        if (!this.process || this.isStopping) return;
        this.isStopping = true;

        const child = this.process;
        return new Promise(resolve => {
            const forceKillTimer = setTimeout(() => {
                if (this.process) {
                    try { this.process.kill('SIGKILL'); } catch { /* ignore */ }
                    this.process = null;
                }
                resolve();
            }, 5000);

            child.once('exit', () => {
                clearTimeout(forceKillTimer);
                this.process = null;
                resolve();
            });

            try {
                child.kill('SIGTERM');
            } catch {
                clearTimeout(forceKillTimer);
                this.process = null;
                resolve();
            }
        });
    }

    async restart() {
        await this.stop();
        this.start();
        return this.waitForReady();
    }
}

module.exports = { ServerManager };

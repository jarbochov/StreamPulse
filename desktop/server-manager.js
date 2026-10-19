const path = require('path');
const http = require('http');
const fs = require('fs');

/**
 * ServerManager runs the StreamPulse HTTP and WebSocket backend in-process
 * within the Electron main process. The backend owns its timers and connections;
 * stop/restart must await its lifecycle methods rather than only rebinding HTTP.
 */
class ServerManager {
    constructor(options = {}) {
        this.projectRoot = options.projectRoot || path.join(__dirname, '..');
        this.serverPath = path.join(this.projectRoot, 'server.js');
        this.dataDir = options.dataDir || null;
        this.configPath = options.configPath || null;
        this.port = options.port || this.getConfiguredPort();
        this.serverInstance = null;
        this.logs = [];
        this.maxLogs = 500;
        this.isStopping = false;
        this.stopPromise = null;
        this.restartPromise = null;
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

    async start() {
        if (this.stopPromise) await this.stopPromise;
        this.isStopping = false;
        this.stopPromise = null;

        process.env.PORT = String(this.port);
        process.env.STREAMPULSE_DESKTOP = 'true';
        if (this.dataDir) {
            process.env.STREAMPULSE_DATA_DIR = this.dataDir;
        }
        if (this.configPath) {
            process.env.STREAMPULSE_CONFIG_PATH = this.configPath;
        }

        console.log(`[ServerManager] Initializing in-process StreamPulse server on port ${this.port}...`);
        try {
            this.serverInstance = require(this.serverPath);
            await this.serverInstance.startServer();
            this.appendLog(`[ServerManager] In-process server initialized on port ${this.port}`);
            return true;
        } catch (err) {
            this.appendLog(`[ServerManager Error] ${err.message}`, true);
            console.error('[ServerManager Error]', err);
            throw err;
        }
    }

    async waitForReady(timeoutMs = 15000) {
        const start = Date.now();

        // 1. Direct in-process check: if HTTP server instance is already listening, ready immediately!
        if (this.serverInstance && this.serverInstance.server && this.serverInstance.server.listening) {
            return true;
        }

        const checkUrl = `http://127.0.0.1:${this.port}/api/sessions`;

        while (Date.now() - start < timeoutMs) {
            if (this.serverInstance && this.serverInstance.server && this.serverInstance.server.listening) {
                return true;
            }
            try {
                const isReady = await new Promise(resolve => {
                    const req = http.get(checkUrl, { timeout: 1000 }, res => {
                        res.resume();
                        resolve(res.statusCode >= 200 && res.statusCode < 500);
                    });
                    req.on('error', () => resolve(false));
                    req.on('timeout', () => { req.destroy(); resolve(false); });
                });

                if (isReady) return true;
            } catch {
                // Continue polling
            }
            await new Promise(r => setTimeout(r, 100));
        }

        throw new Error(`StreamPulse backend server timed out after ${timeoutMs}ms on port ${this.port}`);
    }

    stop() {
        if (this.stopPromise) return this.stopPromise;
        this.isStopping = true;
        this.stopPromise = (async () => {
            if (this.restartPromise) await this.restartPromise;
            if (this.serverInstance) {
                console.log('[ServerManager] Stopping in-process server...');
                await this.serverInstance.stopServer();
            }
        })();
        return this.stopPromise;
    }

    restart() {
        if (this.isStopping) return Promise.reject(new Error('Cannot restart while StreamPulse is quitting'));
        if (this.restartPromise) return this.restartPromise;
        this.restartPromise = (async () => {
            if (!this.serverInstance) throw new Error('StreamPulse server has not started');
            await this.serverInstance.restartServer();
            await this.waitForReady();
        })().finally(() => { this.restartPromise = null; });
        return this.restartPromise;
    }
}

module.exports = { ServerManager };

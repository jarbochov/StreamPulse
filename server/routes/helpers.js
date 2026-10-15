const fs = require('fs');
const path = require('path');

async function readRequestBody(req, maxBytes = 25 * 1024 * 1024) {
    return await new Promise((resolve, reject) => {
        let body = '';
        let size = 0;
        req.on('data', chunk => {
            size += chunk.length;
            if (size > maxBytes) {
                req.destroy();
                reject(new Error('Payload too large'));
                return;
            }
            body += chunk;
        });
        req.on('end', () => resolve(body));
        req.on('error', reject);
    });
}

function sendJson(res, data, statusCode = 200, extraHeaders = {}) {
    res.writeHead(statusCode, {
        'Content-Type': 'application/json',
        ...extraHeaders
    });
    res.end(JSON.stringify(data));
}

function sendText(res, text, statusCode = 200, contentType = 'text/plain; charset=utf-8', extraHeaders = {}) {
    res.writeHead(statusCode, {
        'Content-Type': contentType,
        ...extraHeaders
    });
    res.end(text);
}

function sendError(res, error, statusCode = 400) {
    const message = error instanceof Error ? error.message : String(error || 'Internal error');
    sendJson(res, { error: message }, statusCode);
}

function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

async function readBinaryBody(req, limit = 600 * 1024 * 1024) {
    return await new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        req.on('data', chunk => {
            size += chunk.length;
            if (size > limit) {
                req.destroy();
                reject(new Error('Payload too large'));
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', reject);
    });
}

function safeWriteFileSync(targetPath, data) {
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tempPath = path.join(dir, `.${path.basename(targetPath)}.tmp.${process.pid}.${Date.now()}`);
    fs.writeFileSync(tempPath, data);
    fs.renameSync(tempPath, targetPath);
}

module.exports = {
    readRequestBody,
    readBinaryBody,
    sendJson,
    sendText,
    sendError,
    escapeHtml,
    safeWriteFileSync
};


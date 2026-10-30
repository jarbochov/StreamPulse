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
    if (typeof error === 'number') {
        const temp = error;
        error = statusCode;
        statusCode = temp;
    }
    const status = (typeof statusCode === 'number' && statusCode >= 400 && statusCode < 600) ? statusCode : 400;
    const message = error instanceof Error ? error.message : String(error || 'Internal error');
    sendJson(res, { error: message }, status);
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

async function parseJsonOrQuery(req, url) {
    let data = {};
    if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
        try {
            const raw = await readRequestBody(req);
            if (raw && raw.trim()) {
                data = JSON.parse(raw);
            }
        } catch (_) {}
    }
    if (url && url.searchParams) {
        for (const [key, value] of url.searchParams.entries()) {
            if (data[key] === undefined) {
                if (value === 'true') data[key] = true;
                else if (value === 'false') data[key] = false;
                else if (!isNaN(value) && value.trim() !== '') data[key] = Number(value);
                else data[key] = value;
            }
        }
    }
    return data;
}

module.exports = {
    readRequestBody,
    readBinaryBody,
    sendJson,
    sendText,
    sendError,
    escapeHtml,
    safeWriteFileSync,
    parseJsonOrQuery
};


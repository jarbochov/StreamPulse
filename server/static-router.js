/**
 * StreamPulse Static File Router & Cascading Path Resolver
 * 
 * ARCHITECTURE GUIDE FOR DEVELOPERS & AGENTS:
 * -------------------------------------------
 * To maintain pristine project organization while guaranteeing 100% backward
 * compatibility for existing OBS browser sources, Stream Deck / Companion modules,
 * and user bookmarks, static files are organized into semantic subdirectories
 * under `public/`:
 * 
 *   public/
 *     ├── overlays/   - OBS browser sources (credits, randomizer, goal, music, etc.)
 *     ├── editors/    - Interactive studio controllers and configuration panels
 *     ├── wizards/    - URL generation wizards with parameter customization
 *     ├── tools/      - Stream automation & bot tools (chatbot, alerts, placeholders)
 *     ├── library/    - Sessions, clips, highlights, and analytics
 *     ├── system/     - System configuration, twitch connect, backup, update
 *     ├── css/        - Global stylesheets (admin.css)
 *     ├── js/         - Client-side shared scripts (nav.js, overlay-shared.js, etc.)
 *     └── *.html      - Top-level hubs (dashboard.html, api.html, docs.html)
 * 
 * RESOLUTION ORDER:
 * 1. Direct path in `public/` (e.g. `/overlays/music.html` or `/dashboard.html`)
 * 2. Cascading lookup across categorized subfolders (e.g. `/music.html` -> `public/overlays/music.html`)
 * 3. Fallback to project root (e.g. `/vendor/Sortable.min.js`)
 * 
 * This ensures that EVERY legacy URL (e.g. `http://localhost:3000/music.html` or `/randomizer.html`)
 * works with ZERO latency overhead, no redirects, and full query parameter preservation.
 */

const fs = require('fs');
const path = require('path');

const MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.avif': 'image/avif',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.ogg': 'video/ogg',
    '.oga': 'audio/ogg',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.m4a': 'audio/mp4',
    '.aac': 'audio/aac',
    '.ttf': 'font/ttf',
    '.otf': 'font/otf',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

const ASSET_KIND_BY_EXT = {
    '.png': 'image', '.jpg': 'image', '.jpeg': 'image', '.gif': 'image', '.webp': 'image', '.avif': 'image', '.svg': 'image',
    '.mp4': 'video', '.webm': 'video', '.ogg': 'video',
    '.ttf': 'font', '.otf': 'font', '.woff': 'font', '.woff2': 'font',
    '.mp3': 'audio', '.wav': 'audio', '.m4a': 'audio', '.aac': 'audio', '.oga': 'audio',
    '.txt': 'text', '.md': 'text', '.markdown': 'text', '.text': 'text'
};

// Categorized search directories within public/
const SUB_DIRECTORIES = [
    'overlays',
    'editors',
    'wizards',
    'tools',
    'library',
    'system',
    'css',
    'js'
];

/**
 * Creates the static file router
 * @param {Object} options
 * @param {string} options.rootDir - Project root directory
 * @param {string} options.publicDir - Public frontend directory
 * @param {string} options.customOverlayAssetsDir - Data directory for user uploaded assets
 * @param {Function} options.isLoopbackRequest - Check if request is local loopback
 * @param {Function} options.getCustomOverlays - Get current custom overlays state
 */
function createStaticRouter(options) {
    const rootDir = options.rootDir || path.resolve(__dirname, '..');
    const publicDir = options.publicDir || path.join(rootDir, 'public');
    const customOverlayAssetsDir = options.customOverlayAssetsDir || path.join(rootDir, 'data', 'custom-overlay-assets');
    const emoteCacheDir = options.emoteCacheDir || path.join(rootDir, 'data', 'emote-cache');
    const isLoopbackRequest = options.isLoopbackRequest || (() => true);
    const getCustomOverlays = options.getCustomOverlays || (() => ({}));

    // Cache to accelerate repeated lookups for flat root filenames -> resolved path
    const pathCache = new Map();

    /**
     * Resolves a URL pathname to an absolute disk file path
     * @param {string} pathname
     * @returns {string|null} Resolved file path or null if not found
     */
    function resolveFilePath(pathname) {
        // Handle root /
        if (pathname === '/') {
            return path.join(publicDir, 'dashboard.html');
        }

        const cached = pathCache.get(pathname);
        if (cached && fs.existsSync(cached)) {
            return cached;
        }

        // Clean relative path without traversal
        const cleanRel = path.normalize(decodeURI(pathname)).replace(/^(\.\.[\/\\])+/, '');
        const rel = cleanRel.startsWith(path.sep) ? cleanRel.slice(1) : cleanRel;

        // 1. Direct match in public/
        const directPublic = path.join(publicDir, rel);
        if (fs.existsSync(directPublic) && fs.statSync(directPublic).isFile()) {
            pathCache.set(pathname, directPublic);
            return directPublic;
        }

        // 2. Cascading lookup across categorized subfolders (for flat requests like /music.html or /admin.css)
        if (!rel.includes('/') && !rel.includes('\\')) {
            for (const sub of SUB_DIRECTORIES) {
                const candidate = path.join(publicDir, sub, rel);
                if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
                    pathCache.set(pathname, candidate);
                    return candidate;
                }
            }
        }

        // 3. Fallback to project root (e.g. /vendor/*, /docs/*, or backward compatibility)
        const rootCandidate = path.join(rootDir, rel);
        if (fs.existsSync(rootCandidate)) {
            if (fs.statSync(rootCandidate).isFile()) {
                pathCache.set(pathname, rootCandidate);
                return rootCandidate;
            }
            const indexCandidate = path.join(rootCandidate, 'index.html');
            if (fs.existsSync(indexCandidate) && fs.statSync(indexCandidate).isFile()) {
                pathCache.set(pathname, indexCandidate);
                return indexCandidate;
            }
        }

        return null;
    }

    /**
     * Handles incoming static file request
     * @param {import('http').IncomingMessage} req
     * @param {import('http').ServerResponse} res
     * @returns {boolean} True if handled (or responded with error), false if not static
     */
    function handleRequest(req, res) {
        const url = new URL(req.url, 'http://localhost');
        let pathname = url.pathname;

        // Bare / opens dashboard, but with query parameters serves credits for OBS backward compatibility
        if (pathname === '/') {
            pathname = url.search ? '/credits.html' : '/dashboard.html';
        } else if (pathname === '/tournaments.html' || pathname === '/competitions.html') {
            pathname = '/versus.html';
        } else if (pathname === '/overlays/versus.html') {
            pathname = '/overlays/matchup.html';
        }

        let filePath = null;
        let isLocalMedia = false;

        // Local file handler for custom overlays
        if (pathname === '/local-file') {
            const requested = String(url.searchParams.get('path') || '');
            const ext = path.extname(requested).toLowerCase();
            const kind = ASSET_KIND_BY_EXT[ext];
            const overlays = getCustomOverlays();
            const referenced = () => JSON.stringify(Object.values(overlays)).includes(`/local-file?path=${encodeURIComponent(requested)}`);

            if (!path.isAbsolute(requested) || !['image', 'video'].includes(kind) || ext === '.oga') {
                res.writeHead(400, { 'Content-Type': 'text/plain' });
                res.end('Only local image and video files can be used');
                return true;
            }
            if (!isLoopbackRequest(req) && !referenced()) {
                res.writeHead(403, { 'Content-Type': 'text/plain' });
                res.end('Forbidden');
                return true;
            }
            filePath = requested;
            isLocalMedia = true;
        } else if (pathname.startsWith('/custom-overlay-assets/')) {
            let assetName = '';
            try {
                assetName = decodeURIComponent(pathname.slice('/custom-overlay-assets/'.length));
            } catch {
                res.writeHead(400, { 'Content-Type': 'text/plain' });
                res.end('Bad Request');
                return true;
            }
            if (!assetName || assetName.includes('/') || assetName.includes('\\')) {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('Not Found');
                return true;
            }
            filePath = path.join(customOverlayAssetsDir, assetName);
        } else if (pathname.startsWith('/emote-cache/')) {
            let emoteFile = '';
            try {
                emoteFile = decodeURIComponent(pathname.slice('/emote-cache/'.length));
            } catch {
                res.writeHead(400, { 'Content-Type': 'text/plain' });
                res.end('Bad Request');
                return true;
            }
            if (!emoteFile || emoteFile.includes('/') || emoteFile.includes('\\')) {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('Not Found');
                return true;
            }
            if (!path.extname(emoteFile) && fs.existsSync(emoteCacheDir)) {
                const safeName = emoteFile.replace(/[^a-zA-Z0-9]/g, '_');
                const matched = fs.readdirSync(emoteCacheDir).find(f => f.startsWith(`${safeName}.`) || f.startsWith(`${emoteFile}.`));
                if (matched) emoteFile = matched;
            }
            filePath = path.join(emoteCacheDir, emoteFile);
        } else {
            filePath = resolveFilePath(pathname);
        }

        if (!filePath) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not Found');
            return true;
        }

        // Security traversal check
        if (!isLocalMedia) {
            const allowedRoots = [publicDir, rootDir, customOverlayAssetsDir];
            const isInsideAllowed = allowedRoots.some(allowed => {
                const prefix = allowed.endsWith(path.sep) ? allowed : allowed + path.sep;
                return filePath.startsWith(prefix) || filePath === allowed;
            });

            if (!isInsideAllowed) {
                res.writeHead(403, { 'Content-Type': 'text/plain' });
                res.end('Forbidden');
                return true;
            }

            // Block sensitive files
            const lowerFile = filePath.toLowerCase();
            const blocked = ['.git', 'config.json', 'token.json', '.env', 'package.json', 'package-lock.json', 'server.js'];
            if (blocked.some(b => lowerFile.endsWith(path.sep + b) || lowerFile === b)) {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('Not Found');
                return true;
            }
        }

        try {
            const stat = fs.statSync(filePath);
            if (!stat.isFile()) {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('Not Found');
                return true;
            }

            const contentType = MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
            const etag = `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
            const headers = {
                'Content-Type': contentType,
                'Accept-Ranges': 'bytes',
                'ETag': etag,
                'Last-Modified': stat.mtime.toUTCString(),
                'Cache-Control': pathname.startsWith('/custom-overlay-assets/') ? 'public, max-age=86400' : 'no-cache'
            };

            if (req.headers['if-none-match'] === etag) {
                res.writeHead(304, headers);
                res.end();
                return true;
            }

            let start = 0;
            let end = stat.size - 1;
            let status = 200;
            const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
            if (range && (range[1] || range[2])) {
                if (range[1]) {
                    start = Number(range[1]);
                    if (range[2]) end = Math.min(Number(range[2]), end);
                } else {
                    start = Math.max(0, stat.size - Number(range[2]));
                }
                if (start > end || start >= stat.size) {
                    res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
                    res.end();
                    return true;
                }
                status = 206;
                headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
            }

            headers['Content-Length'] = stat.size === 0 ? 0 : end - start + 1;
            res.writeHead(status, headers);

            if (req.method === 'HEAD' || stat.size === 0) {
                res.end();
                return true;
            }

            const stream = fs.createReadStream(filePath, { start, end });
            stream.on('error', () => res.destroy());
            res.on('close', () => stream.destroy());
            stream.pipe(res);
            return true;
        } catch {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not Found');
            return true;
        }
    }

    return {
        resolveFilePath,
        handleRequest,
        MIME_TYPES,
        SUB_DIRECTORIES
    };
}

module.exports = {
    createStaticRouter,
    MIME_TYPES,
    ASSET_KIND_BY_EXT,
    SUB_DIRECTORIES
};

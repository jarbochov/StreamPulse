const { sendJson, sendText } = require('./helpers');

function createMusicRoutes({
    musicService,
    getOverlayVisible = () => true,
    setOverlayVisibility = () => {}
}) {
    return async function handleMusicRoutes(req, res, pathname) {
        if (!pathname.startsWith('/api/music/')) {
            return false;
        }

        // Music now-playing API
        if (pathname === '/api/music/now-playing') {
            sendJson(res, musicService.getState());
            return true;
        }

        // Individual music field endpoints — plain text for easy integration
        if (pathname.startsWith('/api/music/field/')) {
            const field = pathname.split('/api/music/field/')[1];
            const val = musicService.getField(field);
            if (val !== null) {
                sendText(res, val, 200, 'text/plain');
            } else {
                sendText(res, `Unknown field: ${field}. Available: state, track, artist, album, year, duration, position, artwork`, 404, 'text/plain');
            }
            return true;
        }

        // Overlay visibility control: POST or GET /api/music/overlay?action=on|off|toggle
        if (pathname === '/api/music/overlay') {
            if (req.method === 'POST') {
                let body = '';
                req.on('data', c => { body += c; });
                req.on('end', () => {
                    let action = 'toggle';
                    try { action = JSON.parse(body).action || 'toggle'; } catch {}
                    const qAction = new URL(req.url, `http://${req.headers.host}`).searchParams.get('action');
                    if (qAction) action = qAction;

                    setOverlayVisibility('music', action);
                    sendJson(res, { visible: getOverlayVisible() });
                });
                return true;
            }
            if (req.method === 'GET') {
                const qAction = new URL(req.url, `http://${req.headers.host}`).searchParams.get('action');
                if (qAction) {
                    setOverlayVisibility('music', qAction);
                }
                sendJson(res, { visible: getOverlayVisible() });
                return true;
            }
        }

        if (pathname === '/api/music/vlc-test') {
            const params = new URL(req.url, `http://${req.headers.host}`).searchParams;
            const host = params.get('host') || 'localhost';
            const port = parseInt(params.get('port'), 10) || 8080;
            const password = params.get('password') || '';
            const result = await musicService.testVLC(host, port, password);
            sendJson(res, result);
            return true;
        }

        if (pathname === '/api/music/artwork') {
            try {
                const art = musicService.getArtwork();
                if (art) {
                    res.writeHead(200, {
                        'Content-Type': 'image/png',
                        'Cache-Control': 'no-store',
                        'Content-Length': art.length
                    });
                    res.end(art);
                } else {
                    res.writeHead(404);
                    res.end('No artwork');
                }
            } catch {
                res.writeHead(500);
                res.end('Artwork read error');
            }
            return true;
        }

        if (pathname === '/api/music/fallback-art') {
            if (req.method === 'GET' || req.method === 'HEAD') {
                const art = musicService.getFallbackArt();
                if (art) {
                    res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store', 'Content-Length': art.length });
                    res.end(req.method === 'HEAD' ? undefined : art);
                } else {
                    res.writeHead(404);
                    res.end(req.method === 'HEAD' ? undefined : 'No fallback art');
                }
                return true;
            }
            if (req.method === 'POST') {
                const chunks = [];
                req.on('data', c => chunks.push(c));
                req.on('end', () => {
                    const buf = Buffer.concat(chunks);
                    if (buf.length > 2 * 1024 * 1024) {
                        sendJson(res, { error: 'File too large (max 2MB)' }, 413);
                        return;
                    }
                    musicService.saveFallbackArt(buf);
                    sendJson(res, { ok: true });
                });
                return true;
            }
            if (req.method === 'DELETE') {
                musicService.deleteFallbackArt();
                sendJson(res, { ok: true });
                return true;
            }
        }

        return false;
    };
}

module.exports = {
    createMusicRoutes
};

const fs = require('fs');
const path = require('path');
const http = require('http');
const { exec } = require('child_process');

function createMusicService({ dataDir, getConfig, broadcastToOverlays }) {
    const MUSIC_ART_PATH = path.join(dataDir, 'music-artwork.png');
    const MUSIC_FALLBACK_ART_PATH = path.join(dataDir, 'music-fallback.png');

    let musicState = { track: '', artist: '', album: '', year: '', duration: 0, position: 0, state: 'stopped', artworkUrl: '' };
    let musicPolledAt = 0;
    let musicPollTimer = null;

    function getMusicConfig() {
        const cfg = typeof getConfig === 'function' ? getConfig() : {};
        return cfg.music || { enabled: false, source: 'apple_music', poll_seconds: 5 };
    }

    function getState() {
        return { ...musicState };
    }

    function getPolledAt() {
        return musicPolledAt;
    }

    function resetState() {
        musicState = { track: '', artist: '', album: '', year: '', duration: 0, position: 0, state: 'stopped', artworkUrl: '' };
        if (typeof broadcastToOverlays === 'function') {
            broadcastToOverlays('music', musicState);
        }
    }

    // --- Apple Music (macOS only, via osascript) ---
    function runOsascript(lines, cb) {
        const args = lines.map(l => `-e '${l.replace(/'/g, "'\\''")}'`).join(' ');
        exec(`osascript ${args}`, cb);
    }

    function pollAppleMusic() {
        runOsascript([
            'if application "Music" is running then',
            '  tell application "Music"',
            '    set pState to player state as string',
            '    if pState is "playing" or pState is "paused" then',
            '      set tName to name of current track',
            '      set tArtist to artist of current track',
            '      set tAlbum to album of current track',
            '      set tYear to year of current track',
            '      set tDur to duration of current track',
            '      set tPos to player position',
            '      return pState & "|||" & tName & "|||" & tArtist & "|||" & tAlbum & "|||" & tYear & "|||" & tDur & "|||" & tPos',
            '    else',
            '      return "stopped|||||||||||"',
            '    end if',
            '  end tell',
            'else',
            '  return "stopped|||||||||||"',
            'end if'
        ], (err, stdout) => {
            musicPolledAt = Date.now();
            if (err) {
                if (musicState.state !== 'stopped') {
                    resetState();
                }
                return;
            }

            const parts = stdout.trim().split('|||');
            const newState = {
                state: parts[0] || 'stopped',
                track: parts[1] || '',
                artist: parts[2] || '',
                album: parts[3] || '',
                year: parts[4] || '',
                duration: parseFloat(parts[5]) || 0,
                position: parseFloat(parts[6]) || 0,
                artworkUrl: ''
            };

            if (newState.state === 'stopped') {
                if (musicState.state !== 'stopped') {
                    musicState = newState;
                    if (typeof broadcastToOverlays === 'function') broadcastToOverlays('music', musicState);
                }
                return;
            }

            const trackChanged = newState.track !== musicState.track
                || newState.artist !== musicState.artist
                || newState.album !== musicState.album;
            const stateChanged = newState.state !== musicState.state;

            if (trackChanged) {
                runOsascript([
                    'tell application "Music"',
                    '  set artData to raw data of artwork 1 of current track',
                    'end tell',
                    `set fRef to open for access (POSIX file "${MUSIC_ART_PATH}") with write permission`,
                    'set eof fRef to 0',
                    'write artData to fRef',
                    'close access fRef'
                ], (artErr) => {
                    newState.artworkUrl = artErr ? '' : '/api/music/artwork?t=' + Date.now();
                    musicState = newState;
                    if (typeof broadcastToOverlays === 'function') broadcastToOverlays('music', musicState);
                    console.log(`[Music] Now playing: ${musicState.track} — ${musicState.artist}`);
                });
            } else if (stateChanged) {
                newState.artworkUrl = musicState.artworkUrl;
                musicState = newState;
                if (typeof broadcastToOverlays === 'function') broadcastToOverlays('music', musicState);
                console.log(`[Music] State: ${musicState.state}`);
            } else {
                // Update position/duration silently (for progress bar)
                musicState.position = newState.position;
                musicState.duration = newState.duration;
            }
        });
    }

    // --- VLC (cross-platform, via HTTP interface) ---
    function pollVLC() {
        const musicCfg = getMusicConfig();
        const vlcCfg = musicCfg.vlc || {};
        const host = vlcCfg.host || 'localhost';
        const port = vlcCfg.port || 8080;
        const password = vlcCfg.password || '';
        const auth = Buffer.from(`:${password}`).toString('base64');
        const url = `http://${host}:${port}/requests/status.json`;

        const req = http.request(url, {
            headers: { 'Authorization': `Basic ${auth}` },
            timeout: 3000,
            insecureHTTPParser: true
        }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    const data = JSON.parse(body);
                    processVLCStatus(data);
                } catch {
                    if (musicState.state !== 'stopped') {
                        resetState();
                    }
                }
            });
        });

        req.on('error', () => {
            if (musicState.state !== 'stopped') {
                resetState();
            }
        });

        req.on('timeout', () => req.destroy());
        req.end();
    }

    function processVLCStatus(data) {
        musicPolledAt = Date.now();
        const vlcState = data.state || 'stopped';
        const state = vlcState === 'playing' ? 'playing' : vlcState === 'paused' ? 'paused' : 'stopped';

        if (state === 'stopped') {
            if (musicState.state !== 'stopped') {
                resetState();
            }
            return;
        }

        const meta = (data.information && data.information.category && data.information.category.meta) || {};
        const newState = {
            state,
            track: meta.title || meta.filename || data.information?.category?.meta?.title || '',
            artist: meta.artist || '',
            album: meta.album || '',
            year: meta.date || '',
            duration: data.length || 0,
            position: Math.round((data.position || 0) * (data.length || 0)),
            artworkUrl: ''
        };

        if (!newState.track && meta.filename) {
            newState.track = meta.filename.replace(/\.[^.]+$/, '').replace(/_/g, ' ');
        }

        const trackChanged = newState.track !== musicState.track
            || newState.artist !== musicState.artist
            || newState.album !== musicState.album;
        const stateChanged = newState.state !== musicState.state;

        if (trackChanged) {
            fetchVLCArtwork((artUrl) => {
                newState.artworkUrl = artUrl;
                musicState = newState;
                if (typeof broadcastToOverlays === 'function') broadcastToOverlays('music', musicState);
                console.log(`[Music/VLC] Now playing: ${musicState.track} — ${musicState.artist}`);
            });
        } else if (stateChanged) {
            newState.artworkUrl = musicState.artworkUrl;
            musicState = newState;
            if (typeof broadcastToOverlays === 'function') broadcastToOverlays('music', musicState);
            console.log(`[Music/VLC] State: ${musicState.state}`);
        } else {
            musicState.position = newState.position;
            musicState.duration = newState.duration;
        }
    }

    function fetchVLCArtwork(cb) {
        const musicCfg = getMusicConfig();
        const vlcCfg = musicCfg.vlc || {};
        const host = vlcCfg.host || 'localhost';
        const port = vlcCfg.port || 8080;
        const password = vlcCfg.password || '';
        const auth = Buffer.from(`:${password}`).toString('base64');
        const url = `http://${host}:${port}/art`;

        const req = http.request(url, {
            headers: { 'Authorization': `Basic ${auth}` },
            timeout: 3000,
            insecureHTTPParser: true
        }, (res) => {
            if (res.statusCode !== 200) {
                cb('');
                return;
            }
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => {
                try {
                    const artBuffer = Buffer.concat(chunks);
                    if (artBuffer.length > 0) {
                        fs.writeFileSync(MUSIC_ART_PATH, artBuffer);
                        cb('/api/music/artwork?t=' + Date.now());
                    } else {
                        cb('');
                    }
                } catch {
                    cb('');
                }
            });
        });

        req.on('error', () => cb(''));
        req.on('timeout', () => { req.destroy(); cb(''); });
        req.end();
    }

    function currentPollFn() {
        const musicCfg = getMusicConfig();
        const source = musicCfg.source || 'apple_music';
        return source === 'vlc' ? pollVLC : pollAppleMusic;
    }

    function startMusicPolling() {
        if (musicPollTimer) return;
        const musicCfg = getMusicConfig();
        const interval = (musicCfg.poll_seconds || 5) * 1000;
        const pollFn = currentPollFn();
        const source = musicCfg.source || 'apple_music';
        pollFn();
        musicPollTimer = setInterval(pollFn, interval);
        console.log(`[Music] Polling ${source === 'vlc' ? 'VLC' : 'Apple Music'} every ${musicCfg.poll_seconds || 5}s`);
    }

    function stopMusicPolling() {
        if (musicPollTimer) {
            clearInterval(musicPollTimer);
            musicPollTimer = null;
            console.log('[Music] Polling stopped');
        }
    }

    function handleConfigChange(prevMusicConfig, nextMusicConfig) {
        const prevEnabled = !!prevMusicConfig?.enabled;
        const prevSource = prevMusicConfig?.source || 'apple_music';
        const nextEnabled = !!nextMusicConfig?.enabled;
        const nextSource = nextMusicConfig?.source || 'apple_music';

        if (nextEnabled && !prevEnabled) {
            startMusicPolling();
        } else if (!nextEnabled && prevEnabled) {
            stopMusicPolling();
            resetState();
        } else if (nextEnabled && nextSource !== prevSource) {
            stopMusicPolling();
            resetState();
            startMusicPolling();
        }
    }

    function getField(field) {
        const fields = {
            state: musicState.state,
            track: musicState.track,
            artist: musicState.artist,
            album: musicState.album,
            year: musicState.year,
            duration: String(musicState.duration),
            position: String(musicState.position),
            artwork: musicState.artworkUrl
        };
        return Object.prototype.hasOwnProperty.call(fields, field) ? fields[field] : null;
    }

    function testVLC(host, port, password) {
        return new Promise((resolve) => {
            const auth = Buffer.from(`:${password || ''}`).toString('base64');
            const testUrl = `http://${host || 'localhost'}:${port || 8080}/requests/status.json`;

            const testReq = http.request(testUrl, {
                headers: { 'Authorization': `Basic ${auth}` },
                timeout: 3000,
                insecureHTTPParser: true
            }, (testRes) => {
                let body = '';
                testRes.on('data', chunk => body += chunk);
                testRes.on('end', () => {
                    try {
                        const data = JSON.parse(body);
                        const meta = data.information?.category?.meta || {};
                        resolve({ ok: true, state: data.state, track: meta.title || '', artist: meta.artist || '' });
                    } catch {
                        resolve({ ok: false, error: 'Invalid response from VLC' });
                    }
                });
            });

            testReq.on('error', (err) => {
                resolve({ ok: false, error: err.code === 'ECONNREFUSED' ? 'Connection refused — is VLC running with HTTP interface enabled?' : err.message });
            });

            testReq.on('timeout', () => {
                testReq.destroy();
                resolve({ ok: false, error: 'Connection timed out' });
            });

            testReq.end();
        });
    }

    function getArtwork() {
        if (fs.existsSync(MUSIC_ART_PATH)) {
            return fs.readFileSync(MUSIC_ART_PATH);
        }
        return null;
    }

    function getFallbackArt() {
        if (fs.existsSync(MUSIC_FALLBACK_ART_PATH)) {
            return fs.readFileSync(MUSIC_FALLBACK_ART_PATH);
        }
        return null;
    }

    function saveFallbackArt(buf) {
        fs.writeFileSync(MUSIC_FALLBACK_ART_PATH, buf);
    }

    function deleteFallbackArt() {
        if (fs.existsSync(MUSIC_FALLBACK_ART_PATH)) {
            fs.unlinkSync(MUSIC_FALLBACK_ART_PATH);
        }
    }

    return {
        getState,
        getPolledAt,
        resetState,
        startPolling: startMusicPolling,
        stopPolling: stopMusicPolling,
        handleConfigChange,
        getField,
        testVLC,
        getArtwork,
        getFallbackArt,
        saveFallbackArt,
        deleteFallbackArt,
        get artworkPath() { return MUSIC_ART_PATH; },
        get fallbackArtPath() { return MUSIC_FALLBACK_ART_PATH; }
    };
}

module.exports = {
    createMusicService
};

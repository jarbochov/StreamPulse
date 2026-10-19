const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { readRequestBody, sendJson, sendError } = require('./helpers');
const { normalizeSsnSessionId } = require('../ssn-config');

function createSystemRoutes({
    rootDir,
    configPath,
    getConfig = () => ({}),
    safeWriteFileSync = () => {},
    applyRuntimeConfig = () => {},
    getRestartRequiredConfigChanges = () => [],
    normalizeViewerTrackingConfig = (cfg) => cfg,
    normalizeWeatherConfig = (cfg) => cfg,
    normalizeGoalsConfig = (cfg) => cfg,
    normalizeClipCandidateConfig = (cfg) => cfg,
    defaultGoalsConfig = {},
    getBroadcasterName = () => '',
    port = 3000,
    getTwitchClientId = () => '',
    getTwitchClientSecret = () => '',
    refreshMinutes = 10,
    streamInfoPollSeconds = 30,
    isLoopbackRequest = () => false,
    getStatus = () => ({}),
    onShutdown = async () => ({}),
    onRestart = () => ({}),
    getUpdateInfo = async () => ({}),
    getUpdateStatus = async () => ({}),
    applyUpdate = async () => ({})
} = {}) {
    return async function handleSystemRoutes(req, res, url, pathname) {
        if (pathname === '/api/system/choose-file' && req.method === 'POST') {
            if (!isLoopbackRequest(req)) {
                sendError(res, 'The file chooser only opens on the StreamPulse computer', 403);
                return true;
            }
            if (process.platform !== 'darwin') {
                sendError(res, 'The file chooser is only available on macOS. Paste the full path instead.', 501);
                return true;
            }
            let wanted = 'text';
            try {
                wanted = JSON.parse(await readRequestBody(req) || '{}').kind === 'media' ? 'media' : 'text';
            } catch {
                /* default to text */
            }
            const chooser = wanted === 'media'
                ? { prompt: 'Choose an image or video', types: '"public.image", "public.movie", "png", "jpg", "jpeg", "gif", "webp", "svg", "mp4", "webm", "ogg"' }
                : { prompt: 'Choose a text or Markdown file', types: '"public.plain-text", "net.daringfireball.markdown", "txt", "md", "markdown"' };
            const script = `tell application "System Events"\n activate\n set chosen to choose file with prompt "${chooser.prompt}" of type {${chooser.types}}\n return POSIX path of chosen\nend tell`;

            return new Promise(resolve => {
                execFile('osascript', ['-e', script], { timeout: 5 * 60 * 1000 }, (error, stdout, stderr) => {
                    if (error) {
                        if (/-128|User canceled/i.test(`${stderr} ${error.message}`)) {
                            sendJson(res, { cancelled: true });
                        } else {
                            sendError(res, 'Could not open the file chooser', 500);
                        }
                    } else {
                        sendJson(res, { path: stdout.trim() });
                    }
                    resolve(true);
                });
            });
        }

        if (pathname === '/api/config') {
            if (req.method === 'PUT') {
                try {
                    const body = await readRequestBody(req);
                    const updates = JSON.parse(body || '{}');
                    const current = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                    const previous = JSON.parse(JSON.stringify(current));

                    if (typeof updates.ssn_session_id === 'string') {
                        const id = updates.ssn_session_id.trim();
                        if (id) {
                            if (!/^[\w-]{1,100}$/.test(id)) throw new Error('SocialStream session ID can only contain letters, numbers, - and _');
                            if (!normalizeSsnSessionId(id)) throw new Error('Replace the example SocialStream session ID with your own, or leave it blank to disable chat collection');
                        }
                        current.ssn = { ...(current.ssn || {}), session_id: id };
                    }
                    const setInterval_ = (key, min, max, fallback) => {
                        if (updates[key] === undefined) return;
                        const value = Math.max(min, Math.min(max, Math.round(Number(updates[key])) || fallback));
                        if (value !== (previous[key] || fallback)) current[key] = value;
                    };
                    setInterval_('twitch_refresh_minutes', 1, 1440, 10);
                    setInterval_('twitch_stream_info_seconds', 10, 3600, 30);

                    const safeFields = ['days_filter', 'active_subs_only', 'exclude_users', 'banned_users', 'hashtags_enabled', 'hashtag_max_length', 'chat_log_enabled', 'chatbot_enabled', 'credits', 'auto_backup_on_session_end', 'rate_limit', 'theme', 'music', 'viewer_tracking', 'weather', 'goals', 'clip_candidates', 'session_lifecycle'];
                    for (const key of safeFields) {
                        if (updates[key] !== undefined) {
                            if (key === 'hashtag_max_length') {
                                current[key] = Math.max(10, Math.min(100, Math.round(Number(updates[key])) || 50));
                            } else if (key === 'clip_candidates') {
                                current[key] = normalizeClipCandidateConfig({ ...(current.clip_candidates || {}), ...(updates[key] || {}) });
                            } else if (key === 'music' && updates[key] && typeof updates[key] === 'object') {
                                current[key] = { ...(current.music || {}), ...updates[key] };
                            } else if (key === 'session_lifecycle' && updates[key] && typeof updates[key] === 'object') {
                                current[key] = { ...(current.session_lifecycle || {}), ...updates[key] };
                            } else {
                                current[key] = updates[key];
                            }
                        }
                    }

                    safeWriteFileSync(configPath, JSON.stringify(current, null, 2));
                    applyRuntimeConfig(current);

                    console.log('[Config] Updated and hot-reloaded');
                    const restartFields = getRestartRequiredConfigChanges(previous, current);
                    sendJson(res, { status: 'saved', message: 'Config updated and applied', restartRequired: restartFields.length > 0, restartFields });
                } catch (err) {
                    sendError(res, err, 400);
                }
                return true;
            }

            if (req.method === 'GET') {
                const config = getConfig();
                const broadcasterName = typeof getBroadcasterName === 'function' ? getBroadcasterName() : getBroadcasterName;
                const clientId = typeof getTwitchClientId === 'function' ? getTwitchClientId() : getTwitchClientId;
                const clientSecret = typeof getTwitchClientSecret === 'function' ? getTwitchClientSecret() : getTwitchClientSecret;

                sendJson(res, {
                    active_subs_only: config.active_subs_only || false,
                    hashtags_enabled: config.hashtags_enabled !== false,
                    hashtag_max_length: Number(config.hashtag_max_length) || 50,
                    chatbot_enabled: config.chatbot_enabled !== false,
                    chat_log_enabled: config.chat_log_enabled !== false,
                    broadcaster_name: broadcasterName,
                    connection: {
                        port,
                        broadcaster_name: broadcasterName,
                        broadcaster_id: config.broadcaster_id || null,
                        ssn_server: config.ssn?.server || null,
                        ssn_session_configured: !!normalizeSsnSessionId(config.ssn?.session_id),
                        ssn_session_id: normalizeSsnSessionId(config.ssn?.session_id),
                        twitch_client_configured: !!clientId,
                        twitch_auth_mode: clientSecret ? 'own_app' : 'shared_device',
                        subs_source: config.subs_source || 'twitch',
                        twitch_refresh_minutes: refreshMinutes,
                        twitch_stream_info_seconds: streamInfoPollSeconds
                    },
                    exclude_users: config.exclude_users || [],
                    banned_users: config.banned_users || [],
                    days_filter: config.days_filter || 30,
                    credits: config.credits || {},
                    auto_backup_on_session_end: config.auto_backup_on_session_end || false,
                    rate_limit: config.rate_limit || { enabled: false, requests_per_minute: 120, mutation_per_minute: 30 },
                    theme: config.theme || {},
                    music: config.music || { enabled: false, source: 'apple_music', poll_seconds: 5 },
                    viewer_tracking: normalizeViewerTrackingConfig(config.viewer_tracking),
                    weather: normalizeWeatherConfig(config.weather),
                    goals: normalizeGoalsConfig(config.goals || defaultGoalsConfig),
                    clip_candidates: normalizeClipCandidateConfig(config.clip_candidates),
                    session_lifecycle: config.session_lifecycle || {}
                });
                return true;
            }
        }

        if (pathname === '/favicon.ico' && req.method === 'GET') {
            try {
                const favPath = fs.existsSync(path.join(rootDir, 'public', 'favicon.svg'))
                    ? path.join(rootDir, 'public', 'favicon.svg')
                    : path.join(rootDir, 'favicon.svg');
                const icon = fs.readFileSync(favPath);
                res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400' });
                res.end(icon);
            } catch {
                res.writeHead(404);
                res.end();
            }
            return true;
        }

        if (pathname === '/api/status' && req.method === 'GET') {
            const status = await getStatus();
            sendJson(res, status);
            return true;
        }

        if (pathname === '/api/shutdown') {
            const result = await onShutdown();
            sendJson(res, result);
            return true;
        }

        if (pathname === '/api/restart') {
            const result = await onRestart();
            sendJson(res, result);
            return true;
        }

        if (pathname === '/api/update/info' && req.method === 'GET') {
            try {
                sendJson(res, await getUpdateInfo());
            } catch (err) {
                sendError(res, err, 500);
            }
            return true;
        }

        if (pathname === '/api/update/check' && req.method === 'GET') {
            try {
                const mode = url.searchParams.get('mode') === 'nightly' ? 'nightly' : 'release';
                const update = await getUpdateStatus(mode);
                sendJson(res, update);
            } catch (err) {
                sendError(res, err, 502);
            }
            return true;
        }

        if (pathname === '/api/update/apply' && req.method === 'POST') {
            try {
                const body = JSON.parse(await readRequestBody(req) || '{}');
                const result = await applyUpdate(body.mode === 'nightly' ? 'nightly' : 'release');
                sendJson(res, result);
            } catch (err) {
                sendError(res, err, 409);
            }
            return true;
        }

        return false;
    };
}

module.exports = {
    createSystemRoutes
};

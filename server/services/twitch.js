const https = require('https');
const fs = require('fs');
const path = require('path');

const DEFAULT_TWITCH_CLIENT_ID = 'gbe0673k90le0942bfhw7f7ko6t865';
const TWITCH_REQUEST_TIMEOUT_MS = 15000;
const DEFAULT_TWITCH_SCOPES = 'channel:read:subscriptions bits:read moderator:read:followers clips:edit channel:manage:clips channel:read:polls channel:read:vips moderation:read channel:manage:schedule channel:manage:broadcast';

function safeReturnPath(value) {
    const v = String(value || '');
    return /^\/(?!\/)[\w\-./?=&%]*$/.test(v) ? v : '/';
}

function twitchFormPost(url, body) {
    return fetch(url, {
        signal: AbortSignal.timeout(TWITCH_REQUEST_TIMEOUT_MS),
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(body)
    }).then(async r => ({ ok: r.ok, status: r.status, data: await r.json() }));
}

function createTwitchService(options = {}) {
    const {
        dataDir = process.cwd(),
        tokenPath = null,
        getClientId = () => DEFAULT_TWITCH_CLIENT_ID,
        getClientSecret = () => null,
        getBroadcasterId = () => '',
        getBroadcasterName = () => '',
        getRedirectUri = () => '',
        getChatData = () => ({ streamInfo: [] }),
        readJsonFileSafe = (p, fallback) => fallback,
        safeWriteFileSync = (p, content) => fs.writeFileSync(p, content),
        onBroadcasterSynced = async () => {},
        onStreamInfoChange = () => {},
        onPollUpdate = () => {},
        onTakeover = () => {},
        onViewerCountUpdate = () => {},
        log = console.log,
        warn = console.warn,
        error = console.error
    } = options;

    const resolvedTokenPath = tokenPath || path.join(dataDir, '.twitch-token.json');
    const followerHistoryPath = path.join(dataDir, 'follower-history.json');
    const subHistoryPath = path.join(dataDir, 'sub-history.json');

    let twitchAccessToken = null;
    let twitchRefreshToken = null;
    let twitchTokenExpiry = 0;
    let twitchTokenScopes = [];
    let refreshInFlight = null;
    let deviceAuth = null;
    let broadcasterSyncedFromToken = false;
    let twitchAuthenticatedUserId = null;

    let latestPoll = null;
    let previousPollState = null;
    let pollScopeWarningLogged = false;
    let lastBroadcastedPollJson = '';

    function loadStoredToken() {
        try {
            if (fs.existsSync(resolvedTokenPath)) {
                const stored = JSON.parse(fs.readFileSync(resolvedTokenPath, 'utf8'));
                twitchAccessToken = stored.access_token;
                twitchRefreshToken = stored.refresh_token;
                twitchTokenExpiry = stored.expires_at || 0;
                twitchTokenScopes = Array.isArray(stored.scope) ? stored.scope : [];
                const clientId = getClientId();
                if (stored.client_id && stored.client_id !== clientId) {
                    warn('[Twitch] Stored token belongs to a different Twitch app — reconnect required');
                    twitchAccessToken = null;
                    twitchRefreshToken = null;
                    twitchTokenExpiry = 0;
                    twitchTokenScopes = [];
                    return false;
                }
                log('[Twitch] Loaded stored token');
                return true;
            }
        } catch { /* ignore */ }
        return false;
    }

    function saveToken(tokenData) {
        twitchAccessToken = tokenData.access_token;
        twitchRefreshToken = tokenData.refresh_token;
        twitchTokenExpiry = Date.now() + (tokenData.expires_in * 1000) - 60000;
        if (Array.isArray(tokenData.scope)) twitchTokenScopes = tokenData.scope;
        safeWriteFileSync(resolvedTokenPath, JSON.stringify({
            access_token: twitchAccessToken,
            refresh_token: twitchRefreshToken,
            expires_at: twitchTokenExpiry,
            scope: twitchTokenScopes,
            client_id: getClientId()
        }));
    }

    function clearToken() {
        twitchAccessToken = null;
        twitchRefreshToken = null;
        twitchTokenExpiry = 0;
        twitchTokenScopes = [];
        twitchAuthenticatedUserId = null;
        try { fs.unlinkSync(resolvedTokenPath); } catch { /* ignore */ }
    }

    function twitchTokenRequest(body) {
        return new Promise((resolve, reject) => {
            const postData = new URLSearchParams(body).toString();
            const req = https.request('https://id.twitch.tv/oauth2/token', {
                signal: AbortSignal.timeout(TWITCH_REQUEST_TIMEOUT_MS),
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Content-Length': Buffer.byteLength(postData)
                }
            }, (res) => {
                res.on('error', reject);
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const json = JSON.parse(data);
                        if (json.access_token) {
                            resolve(json);
                        } else {
                            reject(new Error(`Token error: ${data}`));
                        }
                    } catch {
                        reject(new Error(`Token parse error: ${data.substring(0, 200)}`));
                    }
                });
            });
            req.on('error', reject);
            req.write(postData);
            req.end();
        });
    }

    function refreshTwitchToken() {
        if (!twitchRefreshToken) return Promise.resolve(false);
        if (!refreshInFlight) refreshInFlight = doRefreshTwitchToken().finally(() => { refreshInFlight = null; });
        return refreshInFlight;
    }

    async function doRefreshTwitchToken() {
        const used = twitchRefreshToken;
        try {
            const refreshBody = { client_id: getClientId(), grant_type: 'refresh_token', refresh_token: used };
            const clientSecret = getClientSecret();
            if (clientSecret) refreshBody.client_secret = clientSecret;
            const tokenData = await twitchTokenRequest(refreshBody);
            saveToken(tokenData);
            log('[Twitch] Token refreshed, expires in', Math.round(tokenData.expires_in / 60), 'minutes');
            return true;
        } catch (err) {
            error('[Twitch] Token refresh failed:', err.message);
            if (twitchRefreshToken === used && /invalid refresh token|invalid_grant|Invalid refresh|"status":40[01]/i.test(err.message)) {
                clearToken();
            }
            return false;
        }
    }

    async function ensureToken() {
        if (twitchAccessToken && Date.now() < twitchTokenExpiry) return true;
        if (twitchRefreshToken) return await refreshTwitchToken();
        return false;
    }

    async function startDeviceAuth() {
        const clientId = getClientId();
        const r = await twitchFormPost('https://id.twitch.tv/oauth2/device', { client_id: clientId, scopes: DEFAULT_TWITCH_SCOPES });
        if (!r.ok || !r.data.device_code) throw new Error(r.data.message || `Twitch device request failed (${r.status})`);
        deviceAuth = {
            deviceCode: r.data.device_code,
            userCode: r.data.user_code,
            verificationUri: r.data.verification_uri,
            interval: Math.max(1, r.data.interval || 5),
            expiresAt: Date.now() + (r.data.expires_in || 1800) * 1000,
            nextPollAt: Date.now() + Math.max(1, r.data.interval || 5) * 1000,
            status: 'pending',
            error: ''
        };
        return deviceAuth;
    }

    async function pollDeviceAuth() {
        if (!deviceAuth) return { status: 'idle' };
        if (deviceAuth.status !== 'pending') return deviceAuth;
        if (Date.now() > deviceAuth.expiresAt) { deviceAuth.status = 'expired'; return deviceAuth; }
        if (Date.now() < deviceAuth.nextPollAt) return deviceAuth;
        deviceAuth.nextPollAt = Date.now() + deviceAuth.interval * 1000;
        const r = await twitchFormPost('https://id.twitch.tv/oauth2/token', {
            client_id: getClientId(),
            scopes: DEFAULT_TWITCH_SCOPES,
            device_code: deviceAuth.deviceCode,
            grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
        });
        if (r.ok && r.data.access_token) {
            saveToken(r.data);
            deviceAuth.status = 'authorized';
            await syncBroadcasterFromToken();
            fetchTwitchData();
            fetchStreamInfo();
            onViewerCountUpdate();
            fetchTwitchPoll();
        } else if (/authorization_pending/i.test(r.data.message || '')) {
            // waiting for user approval
        } else if (/slow_down/i.test(r.data.message || '')) {
            deviceAuth.interval += 5;
            deviceAuth.nextPollAt = Date.now() + deviceAuth.interval * 1000;
        } else {
            deviceAuth.status = /expired|invalid device/i.test(r.data.message || '') ? 'expired' : 'error';
            deviceAuth.error = r.data.message || `Twitch error (${r.status})`;
        }
        return deviceAuth;
    }

    async function syncBroadcasterFromToken() {
        try {
            const r = await fetch('https://api.twitch.tv/helix/users', {
                signal: AbortSignal.timeout(TWITCH_REQUEST_TIMEOUT_MS),
                headers: { 'Client-ID': getClientId(), Authorization: `Bearer ${twitchAccessToken}` }
            });
            const user = (await r.json()).data?.[0];
            if (!user) return null;
            if (!getBroadcasterId()) {
                await onBroadcasterSynced(user);
                broadcasterSyncedFromToken = true;
                log(`[Twitch] Saved broadcaster ${user.login} (${user.id}) to config.json`);
            }
            return user;
        } catch (err) {
            warn('[Twitch] Could not look up broadcaster:', err.message);
            return null;
        }
    }

    function twitchApiRequestOnce(endpoint, params = {}) {
        return new Promise((resolve, reject) => {
            const query = new URLSearchParams(params).toString();
            const url = `https://api.twitch.tv/helix${endpoint}${query ? '?' + query : ''}`;

            const req = https.request(url, {
                signal: AbortSignal.timeout(TWITCH_REQUEST_TIMEOUT_MS),
                headers: {
                    'Client-ID': getClientId(),
                    'Authorization': `Bearer ${twitchAccessToken}`
                }
            }, (res) => {
                res.on('error', reject);
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        resolve({ status: res.statusCode, body: JSON.parse(data) });
                    } catch {
                        reject(new Error(`Twitch API parse error: ${data.substring(0, 200)}`));
                    }
                });
            });
            req.on('error', reject);
            req.end();
        });
    }

    async function twitchApiRequest(endpoint, params = {}) {
        const result = await twitchApiRequestOnce(endpoint, params);
        const isMissingScope = /missing scope|scope/i.test(result.body?.message || '');
        if (result.status === 401 && !isMissingScope && twitchRefreshToken && await refreshTwitchToken()) {
            return twitchApiRequestOnce(endpoint, params);
        }
        return result;
    }

    function twitchHelixRequestOnce(endpoint, { method = 'GET', params = {}, body = null } = {}) {
        return new Promise((resolve, reject) => {
            const query = params && Object.keys(params).length ? '?' + new URLSearchParams(params).toString() : '';
            const url = `https://api.twitch.tv/helix${endpoint}${query}`;

            const headers = {
                'Client-ID': getClientId(),
                'Authorization': `Bearer ${twitchAccessToken}`
            };
            let payload = null;
            if (body !== null && body !== undefined) {
                payload = typeof body === 'string' ? body : JSON.stringify(body);
                headers['Content-Type'] = 'application/json';
                headers['Content-Length'] = Buffer.byteLength(payload);
            }

            const req = https.request(url, { method, headers, signal: AbortSignal.timeout(TWITCH_REQUEST_TIMEOUT_MS) }, (res) => {
                res.on('error', reject);
                let data = '';
                res.on('data', chunk => { data += chunk; });
                res.on('end', () => {
                    try {
                        resolve({ status: res.statusCode, body: data ? JSON.parse(data) : {} });
                    } catch {
                        resolve({ status: res.statusCode, body: { raw: data } });
                    }
                });
            });
            req.on('error', reject);
            if (payload) req.write(payload);
            req.end();
        });
    }

    async function twitchHelixRequest(endpoint, options = {}) {
        const result = await twitchHelixRequestOnce(endpoint, options);
        const isMissingScope = /missing scope|scope/i.test(result.body?.message || '');
        if (result.status === 401 && !isMissingScope && twitchRefreshToken && await refreshTwitchToken()) {
            return twitchHelixRequestOnce(endpoint, options);
        }
        return result;
    }

    async function createScheduleSegment({ startTime, timezone = 'UTC', durationMinutes = 180, title = '', categoryId = '', isRecurring = false } = {}) {
        const broadcasterId = getBroadcasterId();
        if (!twitchAccessToken || !broadcasterId) {
            return { ok: false, error: 'Twitch is not connected or broadcaster ID is missing' };
        }
        const body = {
            start_time: startTime,
            timezone: timezone || 'UTC',
            is_recurring: isRecurring === true,
            duration: String(Math.min(1380, Math.max(30, Number(durationMinutes) || 180)))
        };
        if (title) body.title = String(title).slice(0, 140);
        if (categoryId) body.category_id = String(categoryId);

        try {
            const res = await twitchHelixRequest('/schedule/segment', {
                method: 'POST',
                params: { broadcaster_id: broadcasterId },
                body
            });
            if (res.status >= 200 && res.status < 300) {
                const segment = res.body?.data?.segments?.[0] || null;
                return { ok: true, segment };
            }
            const errMsg = res.body?.message || `Twitch schedule API error (HTTP ${res.status})`;
            return { ok: false, error: errMsg, status: res.status };
        } catch (err) {
            return { ok: false, error: err.message };
        }
    }

    async function deleteScheduleSegment(segmentId) {
        const broadcasterId = getBroadcasterId();
        if (!twitchAccessToken || !broadcasterId) {
            return { ok: false, error: 'Twitch is not connected or broadcaster ID is missing' };
        }
        if (!segmentId) {
            return { ok: false, error: 'Segment ID is required' };
        }
        try {
            const res = await twitchHelixRequest('/schedule/segment', {
                method: 'DELETE',
                params: { broadcaster_id: broadcasterId, id: segmentId }
            });
            if (res.status >= 200 && res.status < 300) {
                return { ok: true };
            }
            return { ok: false, error: res.body?.message || `Failed to delete segment (HTTP ${res.status})` };
        } catch (err) {
            return { ok: false, error: err.message };
        }
    }

    async function getSchedule(params = {}) {
        const broadcasterId = getBroadcasterId();
        if (!twitchAccessToken || !broadcasterId) {
            return { ok: false, error: 'Twitch is not connected' };
        }
        try {
            const res = await twitchHelixRequest('/schedule', {
                method: 'GET',
                params: { broadcaster_id: broadcasterId, ...params }
            });
            if (res.status >= 200 && res.status < 300) {
                return { ok: true, schedule: res.body?.data || null };
            }
            return { ok: false, error: res.body?.message || `HTTP ${res.status}` };
        } catch (err) {
            return { ok: false, error: err.message };
        }
    }

    async function getGameCategoryByName(name) {
        if (!name) return null;
        const cleanName = String(name).trim();
        if (!cleanName) return null;

        // Try exact match first via /games?name=...
        try {
            const exact = await twitchHelixRequest('/games', {
                method: 'GET',
                params: { name: cleanName }
            });
            if (exact.status >= 200 && exact.status < 300 && Array.isArray(exact.body?.data) && exact.body.data.length > 0) {
                return exact.body.data[0];
            }
        } catch (err) {
            warn('[Twitch] /games lookup error:', err.message);
        }

        // Fall back to category search: /search/categories?query=...
        try {
            const search = await twitchHelixRequest('/search/categories', {
                method: 'GET',
                params: { query: cleanName }
            });
            if (search.status >= 200 && search.status < 300 && Array.isArray(search.body?.data) && search.body.data.length > 0) {
                const lower = cleanName.toLowerCase();
                const match = search.body.data.find(c => (c.name || '').toLowerCase() === lower) || search.body.data[0];
                return match;
            }
        } catch (err) {
            warn('[Twitch] /search/categories lookup error:', err.message);
        }
        return null;
    }

    async function updateChannelCategory(categoryName, gameId = null) {
        const broadcasterId = getBroadcasterId();
        if (!twitchAccessToken || !broadcasterId) {
            return { ok: false, error: 'Twitch is not connected or broadcaster ID is missing' };
        }

        let resolvedGameId = gameId;
        let resolvedName = categoryName;

        if (!resolvedGameId && categoryName) {
            const category = await getGameCategoryByName(categoryName);
            if (category) {
                resolvedGameId = category.id;
                resolvedName = category.name;
            }
        }

        if (!resolvedGameId && categoryName) {
            return { ok: false, error: `Could not find Twitch category for "${categoryName}"` };
        }

        try {
            const res = await twitchHelixRequest('/channels', {
                method: 'PATCH',
                params: { broadcaster_id: broadcasterId },
                body: { game_id: resolvedGameId || '' }
            });
            if (res.status >= 200 && res.status < 300) {
                log(`[Twitch] Updated channel category to "${resolvedName || 'None'}" (ID: ${resolvedGameId || 'none'})`);
                return { ok: true, gameId: resolvedGameId || '', categoryName: resolvedName || '' };
            }
            const errMsg = res.body?.message || `Failed to update Twitch category (HTTP ${res.status})`;
            warn('[Twitch] Update channel error:', errMsg);
            return { ok: false, error: errMsg, status: res.status };
        } catch (err) {
            error('[Twitch] Update channel exception:', err.message);
            return { ok: false, error: err.message };
        }
    }

    function twitchCreateClip() {
        return new Promise((resolve, reject) => {
            const query = new URLSearchParams({ broadcaster_id: getBroadcasterId() }).toString();
            const req = https.request(`https://api.twitch.tv/helix/clips?${query}`, {
                signal: AbortSignal.timeout(TWITCH_REQUEST_TIMEOUT_MS),
                method: 'POST',
                headers: {
                    'Client-ID': getClientId(),
                    'Authorization': `Bearer ${twitchAccessToken}`
                }
            }, (res) => {
                res.on('error', reject);
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        resolve({ status: res.statusCode, body: JSON.parse(data || '{}') });
                    } catch {
                        reject(new Error(`Twitch clip API parse error: ${data.substring(0, 200)}`));
                    }
                });
            });
            req.on('error', reject);
            req.end();
        });
    }

    function twitchCreateClipFromVod(editorId, vodId, vodOffset, duration = 30, title = 'StreamPulse highlight') {
        return new Promise((resolve, reject) => {
            const clipDuration = Math.min(60, Math.max(5, Math.round(Number(duration) || 30)));
            const offset = Math.max(clipDuration, Math.round(Number(vodOffset) || 0));
            const query = new URLSearchParams({
                editor_id: editorId,
                broadcaster_id: getBroadcasterId(),
                vod_id: vodId,
                vod_offset: String(offset),
                duration: String(clipDuration),
                title: String(title || 'StreamPulse highlight').slice(0, 140)
            }).toString();
            const req = https.request(`https://api.twitch.tv/helix/videos/clips?${query}`, {
                signal: AbortSignal.timeout(TWITCH_REQUEST_TIMEOUT_MS),
                method: 'POST',
                headers: {
                    'Client-ID': getClientId(),
                    'Authorization': `Bearer ${twitchAccessToken}`,
                }
            }, (res) => {
                res.on('error', reject);
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        resolve({ status: res.statusCode, body: JSON.parse(data || '{}') });
                    } catch {
                        reject(new Error(`Twitch VOD clip API parse error: ${data.substring(0, 200)}`));
                    }
                });
            });
            req.on('error', reject);
            req.end();
        });
    }

    async function getTwitchAuthenticatedUserId() {
        if (twitchAuthenticatedUserId) return twitchAuthenticatedUserId;
        const result = await twitchApiRequest('/users');
        twitchAuthenticatedUserId = result.status === 200 ? result.body.data?.[0]?.id || null : null;
        return twitchAuthenticatedUserId;
    }

    async function fetchAllPages(endpoint, params, dataKey = 'data', strict = false) {
        const allData = [];
        let cursor = null;

        do {
            const queryParams = { ...params, first: '100' };
            if (cursor) queryParams.after = cursor;

            const result = await twitchApiRequest(endpoint, queryParams);
            if (result.status !== 200) {
                error(`[Twitch] ${endpoint} returned ${result.status}:`, JSON.stringify(result.body).substring(0, 200));
                if (strict) throw new Error(`${endpoint} returned ${result.status}`);
                break;
            }

            const pageData = result.body[dataKey] || [];
            allData.push(...pageData);
            cursor = result.body.pagination?.cursor || null;
        } while (cursor);

        return allData;
    }

    function recordFollowerSnapshot(followers) {
        try {
            const history = readJsonFileSafe(followerHistoryPath, { snapshots: [], ids: [] }) || { snapshots: [], ids: [] };
            const snapshots = Array.isArray(history.snapshots) ? history.snapshots : [];
            const previous = new Set(Array.isArray(history.ids) ? history.ids : []);
            const ids = [...new Set(followers.map(f => String(f.user_id || f.user_login || '')).filter(Boolean))];
            const idSet = new Set(ids);
            const now = new Date();
            const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
            const had = previous.size > 0;
            const entry = { date, total: ids.length, joined: had ? ids.filter(id => !previous.has(id)).length : 0, left: had ? [...previous].filter(id => !idSet.has(id)).length : 0 };
            const last = snapshots[snapshots.length - 1];
            if (last && last.date === date) { entry.joined += last.joined || 0; entry.left += last.left || 0; snapshots[snapshots.length - 1] = entry; }
            else snapshots.push(entry);
            fs.writeFileSync(followerHistoryPath, JSON.stringify({ snapshots: snapshots.slice(-730), ids }));
        } catch (err) { warn('[Twitch] Could not record follower snapshot:', err.message); }
    }

    function recordSubSnapshot(subs) {
        try {
            const history = readJsonFileSafe(subHistoryPath, { snapshots: [], ids: [] }) || { snapshots: [], ids: [] };
            const snapshots = Array.isArray(history.snapshots) ? history.snapshots : [];
            const previousIds = new Set(Array.isArray(history.ids) ? history.ids : []);
            const ids = [...new Set(subs.map(sub => String(sub.user_id || sub.user_login || '')).filter(Boolean))];
            const now = new Date();
            const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
            const tiers = tier => subs.filter(sub => String(sub.tier) === tier).length;
            const hadHistory = previousIds.size > 0;
            const joined = hadHistory ? ids.filter(id => !previousIds.has(id)).length : 0;
            const left = hadHistory ? [...previousIds].filter(id => !ids.includes(id)).length : 0;
            const entry = { date, total: subs.length, unique: ids.length, t1: tiers('1000'), t2: tiers('2000'), t3: tiers('3000'), gifted: subs.filter(sub => sub.is_gift).length, joined, left };
            const last = snapshots[snapshots.length - 1];
            if (last && last.date === date) {
                entry.joined += last.joined || 0;
                entry.left += last.left || 0;
                snapshots[snapshots.length - 1] = entry;
            } else {
                snapshots.push(entry);
            }
            fs.writeFileSync(subHistoryPath, JSON.stringify({ snapshots: snapshots.slice(-730), ids }));
        } catch (err) {
            warn('[Twitch] Could not record subscriber snapshot:', err.message);
        }
    }

    async function fetchTwitchData() {
        const clientId = getClientId();
        const broadcasterId = getBroadcasterId();
        if (!clientId || !broadcasterId) {
            warn('[Twitch] Missing credentials or broadcaster_id in config.json — skipping Twitch fetch');
            return { error: 'Missing Twitch credentials' };
        }

        const hasToken = await ensureToken();
        if (!hasToken) {
            warn('[Twitch] No user token — reconnect Twitch to authorize');
            return { error: 'Twitch is not connected. Reconnect it.' };
        }
        const result = {};

        log('[Twitch] Fetching data for broadcaster:', broadcasterId);

        try {
            // Subscribers
            log('[Twitch] Fetching subscribers...');
            try {
                const subs = await fetchAllPages('/subscriptions', { broadcaster_id: broadcasterId }, 'data', true);
                fs.writeFileSync(path.join(dataDir, 'subs.json'), JSON.stringify({ data: subs }, null, 2));
                log(`[Twitch] Saved ${subs.length} subscribers`);
                recordSubSnapshot(subs);
                result.subs = subs.length;
            } catch (err) { result.error = err.message; }

            // Bits
            log('[Twitch] Fetching bits leaderboard...');
            const bitsResult = await twitchApiRequest('/bits/leaderboard', { count: '100', period: 'month', started_at: new Date().toISOString() });
            if (bitsResult.status === 200) {
                fs.writeFileSync(path.join(dataDir, 'bits.json'), JSON.stringify(bitsResult.body, null, 2));
                log(`[Twitch] Saved ${bitsResult.body.data?.length || 0} bits leaders`);
            } else {
                warn('[Twitch] Bits leaderboard not available:', bitsResult.status);
                fs.writeFileSync(path.join(dataDir, 'bits.json'), JSON.stringify({ data: [] }));
            }

            // Followers
            log('[Twitch] Fetching followers...');
            try {
                const followers = await fetchAllPages('/channels/followers', { broadcaster_id: broadcasterId }, 'data', true);
                fs.writeFileSync(path.join(dataDir, 'followers.json'), JSON.stringify({ data: followers }, null, 2));
                log(`[Twitch] Saved ${followers.length} followers`);
                recordFollowerSnapshot(followers);
                result.followers = followers.length;
            } catch (err) { result.error = result.error || err.message; }

            // VIPs
            log('[Twitch] Fetching VIPs...');
            try {
                const vips = await fetchAllPages('/channels/vips', { broadcaster_id: broadcasterId }, 'data', true);
                fs.writeFileSync(path.join(dataDir, 'vips.json'), JSON.stringify({ data: vips }, null, 2));
                log(`[Twitch] Saved ${vips.length} VIPs`);
                result.vips = vips.length;
            } catch (err) {
                warn('[Twitch] VIPs fetch skipped or not authorized (reconnect Twitch to grant channel:read:vips):', err.message);
            }

            // Moderators
            log('[Twitch] Fetching moderators...');
            try {
                const mods = await fetchAllPages('/moderation/moderators', { broadcaster_id: broadcasterId }, 'data', true);
                fs.writeFileSync(path.join(dataDir, 'moderators.json'), JSON.stringify({ data: mods }, null, 2));
                log(`[Twitch] Saved ${mods.length} moderators`);
                result.moderators = mods.length;
            } catch (err) {
                warn('[Twitch] Moderators fetch skipped or not authorized (reconnect Twitch to grant moderation:read):', err.message);
            }

            log('[Twitch] Data fetch complete!');
        } catch (err) {
            error('[Twitch] Fetch error:', err.message);
            result.error = result.error || err.message;
        }
        return result;
    }

    async function fetchStreamInfo() {
        const clientId = getClientId();
        const broadcasterId = getBroadcasterId();
        if (!clientId || !broadcasterId) return;
        const hasToken = await ensureToken();
        if (!hasToken) return;

        try {
            const result = await twitchApiRequest('/channels', { broadcaster_id: broadcasterId });
            if (result.status !== 200 || !result.body.data?.[0]) return;

            const ch = result.body.data[0];
            const title = ch.title || '';
            const category = ch.game_name || '';
            const now = new Date().toISOString();

            const chatData = getChatData();
            if (chatData && Array.isArray(chatData.streamInfo)) {
                const last = chatData.streamInfo[chatData.streamInfo.length - 1];
                if (!last || last.title !== title || last.category !== category) {
                    chatData.streamInfo.push({ title, category, changedAt: now });
                    if (chatData.streamInfo.length > 50) chatData.streamInfo.splice(0, chatData.streamInfo.length - 50);
                    log(`[Twitch] Stream info: "${title}" — ${category || '(no category)'}`);
                }
            }
            onStreamInfoChange(category);
        } catch (err) {
            error('[Twitch] Stream info fetch error:', err.message);
        }
    }

    async function fetchTwitchPoll() {
        const clientId = getClientId();
        const broadcasterId = getBroadcasterId();
        if (!clientId || !broadcasterId) return;
        if (!twitchTokenScopes.includes('channel:read:polls')) {
            if (!pollScopeWarningLogged) {
                pollScopeWarningLogged = true;
                log('[Twitch] Poll tracking requires channel:read:polls scope. Reconnect Twitch on /twitch-connect.html to enable poll tracking.');
            }
            return;
        }
        const hasToken = await ensureToken();
        if (!hasToken) return;

        try {
            const result = await twitchApiRequest('/polls', { broadcaster_id: broadcasterId, first: 1 });
            if (result.status === 401 || result.status === 403) {
                if (!pollScopeWarningLogged) {
                    pollScopeWarningLogged = true;
                    log('[Twitch] Poll access requires channel:read:polls scope. Reconnect Twitch on /twitch-connect.html to enable poll tracking.');
                }
                return;
            }
            if (result.status !== 200 || !result.body?.data) return;
            pollScopeWarningLogged = false;

            const poll = result.body.data[0];
            if (!poll) return;

            const choices = (poll.choices || []).map(c => ({
                id: c.id,
                title: c.title,
                votes: Number(c.votes) || 0,
                channel_points_votes: Number(c.channel_points_votes) || 0,
                bits_votes: Number(c.bits_votes) || 0
            }));
            const totalVotes = choices.reduce((sum, c) => sum + c.votes, 0);
            const sorted = [...choices].sort((a, b) => b.votes - a.votes);
            const winner = sorted[0];
            const winningVotes = winner?.votes || 0;
            const winningPercent = totalVotes > 0 ? Math.round((winningVotes / totalVotes) * 100) : 0;

            const choicesWithPercent = choices.map(c => ({
                ...c,
                percent: totalVotes > 0 ? Math.round((c.votes / totalVotes) * 100) : 0
            }));

            const pollData = {
                id: poll.id,
                title: poll.title,
                status: poll.status,
                winner: winner?.title || '',
                winningVotes,
                winningPercent,
                totalVotes,
                choices: choicesWithPercent,
                duration: poll.duration,
                startedAt: poll.started_at,
                endedAt: poll.ended_at
            };

            const prev = previousPollState;
            const isNewPoll = !prev || prev.id !== poll.id;
            const statusChanged = prev && prev.status !== poll.status;

            if (isNewPoll) {
                if (poll.status === 'ACTIVE') {
                    const durationMs = poll.duration ? poll.duration * 1000 : 60000;
                    const elapsedMs = poll.started_at ? Math.max(0, Date.now() - Date.parse(poll.started_at)) : 0;
                    const remainingMs = Math.max(5000, durationMs - elapsedMs);
                    log(`[Twitch] Poll started: "${poll.title}" (duration: ${poll.duration}s, remaining: ${Math.round(remainingMs / 1000)}s)`);
                    onTakeover('poll-active', poll.title, remainingMs);
                } else if ((poll.status === 'COMPLETED' || poll.status === 'TERMINATED') && poll.ended_at && Date.now() - Date.parse(poll.ended_at) < 30000) {
                    log(`[Twitch] Poll ended: "${poll.title}" — Winner: "${winner?.title || '(none)'}" (${winningPercent}%)`);
                    onTakeover('poll-end', poll.title, 15000, pollData);
                }
            } else if (statusChanged) {
                if (poll.status === 'COMPLETED' || poll.status === 'TERMINATED') {
                    log(`[Twitch] Poll ended: "${poll.title}" — Winner: "${winner?.title || '(none)'}" (${winningPercent}%)`);
                    onTakeover('poll-end', poll.title, 15000, pollData);
                }
            }

            latestPoll = pollData;
            previousPollState = { id: poll.id, status: poll.status };

            const pollJson = JSON.stringify(pollData);
            if (pollJson !== lastBroadcastedPollJson) {
                lastBroadcastedPollJson = pollJson;
                onPollUpdate(pollData);
            }
        } catch (err) {
            error('[Twitch] Poll fetch error:', err.message);
        }
    }

    let cachedEmotes = null;
    let cachedEmotesAt = 0;

    async function getChannelEmotes() {
        const clientId = getClientId();
        const broadcasterId = getBroadcasterId();
        if (!clientId || !broadcasterId) return [];
        const now = Date.now();
        if (cachedEmotes && now - cachedEmotesAt < 300000) return cachedEmotes;
        const hasToken = await ensureToken();
        if (!hasToken) return [];
        try {
            const result = await twitchApiRequest('/chat/emotes', { broadcaster_id: broadcasterId });
            if (result.status === 200 && Array.isArray(result.body?.data)) {
                cachedEmotes = result.body.data.map(e => ({
                    id: e.id,
                    name: e.name,
                    url: e.images?.url_4x || e.images?.url_2x || e.images?.url_1x || `https://static-cdn.jtvnw.net/emoticons/v2/${e.id}/default/dark/3.0`,
                    tier: e.tier || '',
                    type: e.emote_type || 'channel'
                }));
                cachedEmotesAt = now;
                return cachedEmotes;
            }
        } catch (err) {
            warn('[Twitch] Could not fetch channel emotes:', err.message);
        }
        return cachedEmotes || [];
    }

    return {
        loadStoredToken,
        saveToken,
        clearToken,
        refreshTwitchToken,
        ensureToken,
        startDeviceAuth,
        pollDeviceAuth,
        syncBroadcasterFromToken,
        twitchTokenRequest,
        twitchApiRequest,
        twitchApiRequestOnce,
        twitchHelixRequest,
        createScheduleSegment,
        deleteScheduleSegment,
        getSchedule,
        getGameCategoryByName,
        updateChannelCategory,
        twitchCreateClip,
        twitchCreateClipFromVod,
        getTwitchAuthenticatedUserId,
        fetchAllPages,
        fetchTwitchData,
        fetchStreamInfo,
        fetchTwitchPoll,
        getChannelEmotes,
        recordFollowerSnapshot,
        recordSubSnapshot,
        getAccessToken: () => twitchAccessToken,
        getRefreshToken: () => twitchRefreshToken,
        getTokenExpiry: () => twitchTokenExpiry,
        getTokenScopes: () => twitchTokenScopes,
        getDeviceAuth: () => deviceAuth,
        isBroadcasterSynced: () => broadcasterSyncedFromToken,
        getLatestPoll: () => latestPoll,
        setLatestPoll: (poll) => { latestPoll = poll; }
    };
}

module.exports = {
    createTwitchService,
    DEFAULT_TWITCH_CLIENT_ID,
    DEFAULT_TWITCH_SCOPES,
    safeReturnPath
};

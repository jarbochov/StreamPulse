const fs = require('fs');
const path = require('path');

const GAME_INFO_TTL_MS = 30 * 86400000;
const GAME_INFO_RETRY_MS = 10 * 60000;
const GAME_INFO_VERSION = 2;
const infoKey = (name, igdbId) => igdbId ? `igdb:${igdbId}` : String(name || '').toLowerCase();

function createGameInfoService({
    dataDir = process.cwd(),
    getTwitchClientId = () => '',
    getTwitchClientSecret = () => null,
    ensureTwitchToken = async () => false,
    getTwitchAccessToken = () => null,
    error = console.error
} = {}) {
    const cachePath = path.join(dataDir, 'game-info-cache.json');
    let gameInfoCache = {};
    try {
        gameInfoCache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    } catch { /* first run */ }

    const gameInfoPending = new Map();
    let appTokenCache = { token: '', expiresAt: 0 };

    async function getAppToken() {
        const clientSecret = getTwitchClientSecret();
        const clientId = getTwitchClientId();
        // Public apps have no secret for client-credentials, so use the authorized user token instead
        if (!clientSecret) {
            if (!(await ensureTwitchToken())) throw new Error('Connect Twitch to look up game info');
            return getTwitchAccessToken();
        }
        if (appTokenCache.token && Date.now() < appTokenCache.expiresAt) return appTokenCache.token;
        const body = new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'client_credentials' });
        const response = await fetch('https://id.twitch.tv/oauth2/token', { method: 'POST', body });
        const data = await response.json();
        if (!response.ok || !data.access_token) throw new Error(data.message || `token request failed (${response.status})`);
        appTokenCache = { token: data.access_token, expiresAt: Date.now() + Math.max(60, (data.expires_in || 3600) - 300) * 1000 };
        return appTokenCache.token;
    }

    async function fetchGameInfo(name, pinnedIgdbId = '') {
        const clientId = getTwitchClientId();
        const token = await getAppToken();
        const headers = { 'Client-ID': clientId, Authorization: `Bearer ${token}` };
        const info = { name, fetchedAt: Date.now(), source: 'twitch' };

        // A pinned IGDB id (chosen in the Game Plan editor) skips the by-name guess entirely.
        const helix = pinnedIgdbId ? null : await fetch(`https://api.twitch.tv/helix/games?name=${encodeURIComponent(name)}`, { headers });
        const game = helix ? (await helix.json()).data?.[0] : null;
        if (pinnedIgdbId) info.igdbId = pinnedIgdbId;
        if (game) {
            info.twitchId = game.id;
            info.boxArt = String(game.box_art_url || '').replace('{width}', '285').replace('{height}', '380');
            info.igdbId = game.igdb_id || '';
        }
        info.v = GAME_INFO_VERSION;

        // A Twitch category with no IGDB id (Just Chatting, Music, ...) is not a game, and a name search would match an unrelated one.
        if (game && !info.igdbId) return info;

        // IGDB shares the Twitch app credentials; Twitch box art remains the fallback if it is unavailable.
        try {
            const where = info.igdbId ? `where id = ${Number(info.igdbId)}` : `search "${name.replace(/["\\]/g, '')}"`;
            const query = `fields name,url,summary,first_release_date,total_rating,cover.image_id,genres.name,platforms.abbreviation,involved_companies.developer,involved_companies.company.name; ${where}; limit 5;`;
            const igdb = await fetch('https://api.igdb.com/v4/games', { method: 'POST', headers, body: query });
            const results = await igdb.json();
            if (Array.isArray(results) && results.length) {
                const match = results.find(item => String(item.name).toLowerCase() === name.toLowerCase()) || results[0];
                info.source = 'igdb';
                info.igdbId = match.id;
                info.igdbName = match.name || '';
                info.igdbUrl = match.url || '';
                info.summary = match.summary || '';
                info.releaseTs = match.first_release_date ? match.first_release_date * 1000 : null;
                info.rating = match.total_rating ? Math.round(match.total_rating) : null;
                info.genres = (match.genres || []).map(g => g.name);
                info.platforms = (match.platforms || []).map(p => p.abbreviation).filter(Boolean);
                info.developers = (match.involved_companies || []).filter(c => c.developer).map(c => c.company?.name).filter(Boolean);
                if (match.cover?.image_id) info.cover = `https://images.igdb.com/igdb/image/upload/t_cover_big/${match.cover.image_id}.jpg`;
            }
        } catch (err) {
            error('[Game] IGDB lookup failed:', err.message);
        }
        return info;
    }

    function refreshGameInfo(name, igdbId = '') {
        const clientId = getTwitchClientId();
        if (!name || !clientId) return Promise.resolve(null);
        const key = infoKey(name, igdbId);
        const cached = gameInfoCache[key];
        const maxAge = cached?.failed || cached?.v !== GAME_INFO_VERSION ? (cached?.failed ? GAME_INFO_RETRY_MS : 0) : GAME_INFO_TTL_MS;
        const needsUrl = cached?.source === 'igdb' && !cached.igdbUrl && !cached.urlTried;
        if (needsUrl) cached.urlTried = true;
        if (cached && !needsUrl && Date.now() - cached.fetchedAt < maxAge) return Promise.resolve(cached);
        if (gameInfoPending.has(key)) return gameInfoPending.get(key);
        const job = fetchGameInfo(name, igdbId).catch(err => {
            error('[Game] Lookup failed:', err.message);
            return { name, fetchedAt: Date.now(), failed: true };
        }).then(info => {
            gameInfoCache[key] = info;
            try { fs.writeFileSync(cachePath, JSON.stringify(gameInfoCache)); } catch { /* cache is best-effort */ }
            gameInfoPending.delete(key);
            return info;
        });
        gameInfoPending.set(key, job);
        return job;
    }

    function publicGameInfo(name, igdbId = '') {
        const info = name ? gameInfoCache[infoKey(name, igdbId)] : null;
        if (!info || info.failed) return { name: name || '' };
        return {
            name: info.name,
            igdbName: info.igdbName || '',
            igdbUrl: info.igdbUrl || '',
            cover: info.cover || info.boxArt || '',
            boxArt: info.boxArt || '',
            summary: info.summary || '',
            releaseDate: info.releaseTs ? new Date(info.releaseTs).toISOString().slice(0, 10) : '',
            releaseYear: info.releaseTs ? new Date(info.releaseTs).getUTCFullYear() : '',
            rating: info.rating ?? '',
            genres: info.genres || [],
            platforms: info.platforms || [],
            developers: info.developers || [],
            source: info.source
        };
    }

    return {
        getAppToken,
        fetchGameInfo,
        refreshGameInfo,
        publicGameInfo,
        getCache: () => gameInfoCache
    };
}

module.exports = {
    createGameInfoService,
    infoKey,
    GAME_INFO_TTL_MS,
    GAME_INFO_VERSION
};

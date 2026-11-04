const WebSocket = require('ws');

const DEFAULT_EVENTSUB_WS_URL = 'wss://eventsub.wss.twitch.tv/ws';
const HELIX_SUBSCRIPTIONS_URL = 'https://api.twitch.tv/helix/eventsub/subscriptions';
const RECONNECT_DELAY_INITIAL_MS = 1000;
const RECONNECT_DELAY_MAX_MS = 30000;
const KEEPALIVE_GRACE_PERIOD_MS = 3000;

function createTwitchEventSubService(options = {}) {
    const {
        getAccessToken = () => null,
        getClientId = () => '',
        getBroadcasterId = () => '',
        getTokenScopes = () => [],
        onPollBegin = () => {},
        onPollProgress = () => {},
        onPollEnd = () => {},
        onChannelUpdate = () => {},
        onFollow = () => {},
        onSubscribe = () => {},
        onGiftSub = () => {},
        onCheer = () => {},
        onRedemption = () => {},
        onHypeTrain = () => {},
        onModerationEvent = () => {},
        onStreamOnline = () => {},
        onStreamOffline = () => {},
        log = console.log,
        warn = console.warn,
        error = console.error,
        eventsubUrl = DEFAULT_EVENTSUB_WS_URL,
        subscriptionsUrl = HELIX_SUBSCRIPTIONS_URL,
        fetchImpl = globalThis.fetch,
        WebSocketImpl = WebSocket
    } = options;

    let ws = null;
    let migratingWs = null;
    let sessionId = null;
    let status = 'disconnected'; // 'disconnected' | 'connecting' | 'connected'
    let activeSubscriptions = [];
    let watchdogTimer = null;
    let reconnectTimer = null;
    let reconnectDelay = RECONNECT_DELAY_INITIAL_MS;
    let isExplicitlyStopped = false;
    let lastKeepaliveAt = null;
    let connectedAt = null;

    function resetWatchdog(keepaliveSeconds = 10) {
        if (watchdogTimer) {
            clearTimeout(watchdogTimer);
            watchdogTimer = null;
        }
        const timeoutMs = (keepaliveSeconds * 1000) + KEEPALIVE_GRACE_PERIOD_MS;
        watchdogTimer = setTimeout(() => {
            warn(`[Twitch EventSub] Watchdog timeout: no message in ${timeoutMs}ms, reconnecting...`);
            if (ws) {
                try { ws.terminate(); } catch { /* ignore */ }
            }
        }, timeoutMs);
        if (watchdogTimer.unref) watchdogTimer.unref();
    }

    function clearTimers() {
        if (watchdogTimer) {
            clearTimeout(watchdogTimer);
            watchdogTimer = null;
        }
        if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
        }
    }

    function scheduleReconnect(immediate = false) {
        if (isExplicitlyStopped) return;
        clearTimers();
        status = 'disconnected';
        const delay = immediate ? 0 : reconnectDelay;
        if (!immediate) {
            reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_DELAY_MAX_MS);
        }
        reconnectTimer = setTimeout(() => {
            reconnectTimer = null;
            connect();
        }, delay);
        if (reconnectTimer.unref) reconnectTimer.unref();
    }

    async function subscribe(type, version, condition, targetSessionId) {
        const token = getAccessToken();
        const clientId = getClientId();
        if (!token || !clientId) return false;

        try {
            const res = await fetchImpl(subscriptionsUrl, {
                method: 'POST',
                headers: {
                    'Client-Id': clientId,
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    type,
                    version,
                    condition,
                    transport: {
                        method: 'websocket',
                        session_id: targetSessionId
                    }
                })
            });

            if (res.status === 200 || res.status === 202) {
                return true;
            }
            if (res.status === 409) {
                // Subscription already active
                return true;
            }
            // 400 or 403 usually means missing scope or broadcaster is not affiliate/partner
            const body = await res.json().catch(() => ({}));
            warn(`[Twitch EventSub] Subscription for "${type}" returned status ${res.status}: ${body.message || res.statusText}`);
            return false;
        } catch (err) {
            warn(`[Twitch EventSub] Subscription request for "${type}" failed: ${err.message}`);
            return false;
        }
    }

    async function registerAllSubscriptions(targetSessionId) {
        const broadcasterId = getBroadcasterId();
        const scopes = getTokenScopes();
        if (!broadcasterId) {
            warn('[Twitch EventSub] Cannot subscribe: broadcaster ID is unknown');
            return;
        }

        const candidateSubscriptions = [];

        // Polls: requires channel:read:polls
        if (scopes.includes('channel:read:polls')) {
            candidateSubscriptions.push(
                { type: 'channel.poll.begin', version: '1', condition: { broadcaster_user_id: broadcasterId } },
                { type: 'channel.poll.progress', version: '1', condition: { broadcaster_user_id: broadcasterId } },
                { type: 'channel.poll.end', version: '1', condition: { broadcaster_user_id: broadcasterId } }
            );
        }

        // Channel Category / Title Updates: standard channel condition
        candidateSubscriptions.push(
            { type: 'channel.update', version: '2', condition: { broadcaster_user_id: broadcasterId } }
        );

        // Followers: requires moderator:read:followers
        if (scopes.includes('moderator:read:followers')) {
            candidateSubscriptions.push(
                { type: 'channel.follow', version: '2', condition: { broadcaster_user_id: broadcasterId, moderator_user_id: broadcasterId } }
            );
        }

        // Subscriptions: requires channel:read:subscriptions
        if (scopes.includes('channel:read:subscriptions')) {
            candidateSubscriptions.push(
                { type: 'channel.subscribe', version: '1', condition: { broadcaster_user_id: broadcasterId } },
                { type: 'channel.subscription.gift', version: '1', condition: { broadcaster_user_id: broadcasterId } },
                { type: 'channel.subscription.message', version: '1', condition: { broadcaster_user_id: broadcasterId } }
            );
        }

        // Bits: requires bits:read
        if (scopes.includes('bits:read')) {
            candidateSubscriptions.push(
                { type: 'channel.cheer', version: '1', condition: { broadcaster_user_id: broadcasterId } }
            );
        }

        // Channel Point Redemptions: requires channel:read:redemptions
        if (scopes.includes('channel:read:redemptions')) {
            candidateSubscriptions.push(
                { type: 'channel.channel_points_custom_reward_redemption.add', version: '1', condition: { broadcaster_user_id: broadcasterId } }
            );
        }

        // Hype Train: requires channel:read:hype_train
        if (scopes.includes('channel:read:hype_train')) {
            candidateSubscriptions.push(
                { type: 'channel.hype_train.begin', version: '2', condition: { broadcaster_user_id: broadcasterId } },
                { type: 'channel.hype_train.progress', version: '2', condition: { broadcaster_user_id: broadcasterId } },
                { type: 'channel.hype_train.end', version: '2', condition: { broadcaster_user_id: broadcasterId } }
            );
        }

        if (scopes.includes('channel:moderate')) {
            candidateSubscriptions.push(
                { type: 'channel.ban', version: '1', condition: { broadcaster_user_id: broadcasterId } },
                { type: 'channel.unban', version: '1', condition: { broadcaster_user_id: broadcasterId } }
            );
        }

        // Stream Online / Offline
        candidateSubscriptions.push(
            { type: 'stream.online', version: '1', condition: { broadcaster_user_id: broadcasterId } },
            { type: 'stream.offline', version: '1', condition: { broadcaster_user_id: broadcasterId } }
        );

        const successful = [];
        for (const sub of candidateSubscriptions) {
            const ok = await subscribe(sub.type, sub.version, sub.condition, targetSessionId);
            if (ok) successful.push(sub.type);
        }
        activeSubscriptions = successful;
        log(`[Twitch EventSub] Registered ${successful.length}/${candidateSubscriptions.length} subscriptions`);
    }

    function normalizePollEvent(event) {
        const choices = (event.choices || []).map(c => ({
            id: c.id,
            title: c.title,
            votes: Number(c.votes || 0),
            channelPointsVotes: Number(c.channel_points_votes || 0),
            bitsVotes: Number(c.bits_votes || 0)
        }));

        const startedAt = event.started_at || new Date().toISOString();
        const endedAt = event.ends_at || event.ended_at || null;
        let duration = event.duration || 60;
        if (!event.duration && startedAt && endedAt) {
            const diffSec = Math.round((Date.parse(endedAt) - Date.parse(startedAt)) / 1000);
            if (diffSec > 0) duration = diffSec;
        }

        return {
            id: event.id,
            title: event.title,
            status: (event.status || 'ACTIVE').toUpperCase(),
            choices,
            totalVotes: choices.reduce((sum, c) => sum + c.votes, 0),
            duration,
            startedAt,
            endedAt
        };
    }

    function handleNotification(metadata, payload) {
        const type = metadata.subscription_type;
        const ev = payload.event;
        if (!ev) return;

        switch (type) {
            case 'channel.ban':
            case 'channel.unban': {
                if (type === 'channel.ban' && ev.is_permanent !== true) break;
                onModerationEvent({
                    id: ev.user_id, login: ev.user_login, name: ev.user_name,
                    broadcasterId: ev.broadcaster_user_id,
                    permanent: type === 'channel.ban' && ev.is_permanent === true
                });
                break;
            }
            case 'channel.poll.begin': {
                const pollData = normalizePollEvent(ev);
                pollData.status = 'ACTIVE';
                onPollBegin(pollData);
                break;
            }
            case 'channel.poll.progress': {
                const pollData = normalizePollEvent(ev);
                pollData.status = 'ACTIVE';
                onPollProgress(pollData);
                break;
            }
            case 'channel.poll.end': {
                const pollData = normalizePollEvent(ev);
                pollData.status = (ev.status || 'COMPLETED').toUpperCase();
                let winner = null;
                for (const c of pollData.choices) {
                    if (!winner || c.votes > winner.votes) winner = c;
                }
                onPollEnd(pollData, winner);
                break;
            }
            case 'channel.update': {
                onChannelUpdate({
                    categoryId: ev.category_id || '',
                    categoryName: ev.category_name || '',
                    title: ev.title || '',
                    language: ev.language || ''
                });
                break;
            }
            case 'channel.follow': {
                onFollow({
                    userId: ev.user_id,
                    user: ev.user_name || ev.user_login,
                    followedAt: ev.followed_at || new Date().toISOString()
                });
                break;
            }
            case 'channel.subscribe': {
                onSubscribe({
                    userId: ev.user_id,
                    user: ev.user_name || ev.user_login,
                    tier: ev.tier || '1000',
                    isGift: Boolean(ev.is_gift)
                });
                break;
            }
            case 'channel.subscription.gift': {
                onGiftSub({
                    userId: ev.user_id,
                    user: ev.is_anonymous ? 'An Anonymous Gifter' : (ev.user_name || ev.user_login),
                    total: Number(ev.total || 1),
                    tier: ev.tier || '1000',
                    cumulativeTotal: ev.cumulative_total
                });
                break;
            }
            case 'channel.subscription.message': {
                onSubscribe({
                    userId: ev.user_id,
                    user: ev.user_name || ev.user_login,
                    tier: ev.tier || '1000',
                    months: Number(ev.cumulative_months || 1),
                    streak: Number(ev.streak_months || 0),
                    message: ev.message?.text || '',
                    emotes: ev.message?.emotes || []
                });
                break;
            }
            case 'channel.cheer': {
                onCheer({
                    userId: ev.user_id,
                    user: ev.is_anonymous ? 'An Anonymous Cheerer' : (ev.user_name || ev.user_login),
                    bits: Number(ev.bits || 0),
                    message: ev.message || ''
                });
                break;
            }
            case 'channel.channel_points_custom_reward_redemption.add': {
                onRedemption({
                    id: ev.id,
                    userId: ev.user_id,
                    user: ev.user_name || ev.user_login,
                    rewardId: ev.reward?.id,
                    rewardTitle: ev.reward?.title || 'Reward',
                    cost: Number(ev.reward?.cost || 0),
                    userInput: ev.user_input || '',
                    redeemedAt: ev.redeemed_at || new Date().toISOString()
                });
                break;
            }
            case 'channel.hype_train.begin':
            case 'channel.hype_train.progress':
            case 'channel.hype_train.end': {
                const top = Array.isArray(ev.top_contributions) ? [...ev.top_contributions].sort((a, b) => Number(b.total || 0) - Number(a.total || 0))[0] : null;
                onHypeTrain({
                    phase: type.endsWith('.begin') ? 'start' : type.endsWith('.end') ? 'end' : 'progress',
                    id: ev.id,
                    level: Number(ev.level || 1),
                    total: Number(ev.total || 0),
                    progress: Number(ev.progress || 0),
                    goal: Number(ev.goal || 0),
                    isGolden: ev.type === 'golden_kappa',
                    topUser: top?.user_name || top?.user_login || '',
                    startedAt: ev.started_at || '',
                    endedAt: ev.ended_at || '',
                    expiresAt: ev.expires_at || ''
                });
                break;
            }
            case 'stream.online': {
                onStreamOnline({
                    id: ev.id,
                    broadcasterId: ev.broadcaster_user_id,
                    startedAt: ev.started_at || new Date().toISOString()
                });
                break;
            }
            case 'stream.offline': {
                onStreamOffline({
                    broadcasterId: ev.broadcaster_user_id
                });
                break;
            }
            default:
                break;
        }
    }

    function connect(url = eventsubUrl, isMigration = false) {
        if (isExplicitlyStopped) return;
        const token = getAccessToken();
        const clientId = getClientId();
        const broadcasterId = getBroadcasterId();

        if (!token || !clientId || !broadcasterId) {
            // Credentials not ready yet; wait without error
            return;
        }

        status = 'connecting';
        let socket;
        try {
            socket = new WebSocketImpl(url);
        } catch (err) {
            warn(`[Twitch EventSub] Failed to create WebSocket connection: ${err.message}`);
            scheduleReconnect();
            return;
        }

        if (isMigration) {
            migratingWs = socket;
        } else {
            ws = socket;
        }

        socket.on('open', () => {
            log(`[Twitch EventSub] WebSocket connection opened (${url})`);
        });

        socket.on('message', (data) => {
            let msg;
            try {
                msg = JSON.parse(data.toString());
            } catch {
                return;
            }

            const messageType = msg.metadata?.message_type;
            const payload = msg.payload || {};

            switch (messageType) {
                case 'session_welcome': {
                    sessionId = payload.session?.id;
                    const keepaliveSec = payload.session?.keepalive_timeout_seconds || 10;
                    resetWatchdog(keepaliveSec);
                    status = 'connected';
                    connectedAt = new Date().toISOString();
                    lastKeepaliveAt = connectedAt;
                    reconnectDelay = RECONNECT_DELAY_INITIAL_MS;
                    log(`[Twitch EventSub] Welcome received, session ID: ${sessionId}`);

                    if (isMigration) {
                        // Migration complete: replace old socket with the migrated one
                        if (ws) {
                            try { ws.close(); } catch { /* ignore */ }
                        }
                        ws = migratingWs;
                        migratingWs = null;
                    } else {
                        registerAllSubscriptions(sessionId);
                    }
                    break;
                }
                case 'session_keepalive': {
                    lastKeepaliveAt = new Date().toISOString();
                    resetWatchdog();
                    break;
                }
                case 'session_reconnect': {
                    const reconnectUrl = payload.session?.reconnect_url;
                    if (reconnectUrl) {
                        log(`[Twitch EventSub] Twitch requested reconnect to migration URL: ${reconnectUrl}`);
                        connect(reconnectUrl, true);
                    }
                    break;
                }
                case 'notification': {
                    lastKeepaliveAt = new Date().toISOString();
                    resetWatchdog();
                    handleNotification(msg.metadata, payload);
                    break;
                }
                case 'revocation': {
                    const subType = payload.subscription?.type;
                    warn(`[Twitch EventSub] Subscription revoked for ${subType}: ${payload.subscription?.status}`);
                    activeSubscriptions = activeSubscriptions.filter(s => s !== subType);
                    break;
                }
                default:
                    break;
            }
        });

        socket.on('error', (err) => {
            warn(`[Twitch EventSub] WebSocket error: ${err.message}`);
        });

        socket.on('close', (code, reason) => {
            log(`[Twitch EventSub] WebSocket closed (code: ${code}, reason: ${reason || 'none'})`);
            if (socket === ws) {
                ws = null;
                sessionId = null;
                clearTimers();
                scheduleReconnect();
            } else if (socket === migratingWs) {
                migratingWs = null;
            }
        });
    }

    function start() {
        isExplicitlyStopped = false;
        if (status === 'connected' || status === 'connecting') return;
        connect();
    }

    function stop() {
        isExplicitlyStopped = true;
        clearTimers();
        if (ws) {
            try { ws.close(); } catch { /* ignore */ }
            ws = null;
        }
        if (migratingWs) {
            try { migratingWs.close(); } catch { /* ignore */ }
            migratingWs = null;
        }
        sessionId = null;
        status = 'disconnected';
        activeSubscriptions = [];
    }

    function getStatus() {
        return {
            status,
            connected: status === 'connected',
            sessionId,
            connectedAt,
            lastKeepaliveAt,
            activeSubscriptions: [...activeSubscriptions]
        };
    }

    return {
        start,
        stop,
        connect,
        getStatus,
        // Exposed for testing & direct triggering
        handleNotification,
        normalizePollEvent
    };
}

module.exports = {
    createTwitchEventSubService,
    DEFAULT_EVENTSUB_WS_URL,
    HELIX_SUBSCRIPTIONS_URL
};

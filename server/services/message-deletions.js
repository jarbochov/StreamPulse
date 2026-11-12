const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');

const textId = value => value === undefined || value === null ? '' : String(value).trim();
const nameId = value => textId(value).toLowerCase();
const roomId = value => createHash('sha256').update(textId(value)).digest('hex');
const plain = value => String(value || '').replace(/<img\b[^>]*alt="([^"]*)"[^>]*>/gi, '$1')
    .replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

function createMessageDeletionService({
    dataDir, getConfig = () => ({}), getBroadcasterId = () => '',
    getSsnSessionId = () => '', getSessionStartedAt = () => '',
    getSessionName = () => '',
    getCurrentMessages = () => [], safeWriteFileSync = fs.writeFileSync,
    onChange = () => {}, warn = console.warn
}) {
    const file = path.join(dataDir, 'message-deletions.json');
    let rules = [];
    let error = '';
    let lastEventAt = null;
    const twitchMessages = new Map();
    const keyIndexes = new WeakMap();
    function reload() {
        twitchMessages.clear();
        try {
            const stored = JSON.parse(fs.readFileSync(file, 'utf8'));
            if (!Array.isArray(stored.rules)) throw new Error('Invalid deletion ledger');
            rules = stored.rules;
            lastEventAt = rules.length ? new Date(rules.reduce((latest, rule) => Math.max(latest, rule.receivedAt), 0)).toISOString() : null;
            error = '';
        } catch (err) {
            if (err.code === 'ENOENT') { rules = []; lastEventAt = null; error = ''; }
            else { error = err.message; warn(`[Message moderation] Could not reload deletion ledger: ${err.message}`); }
        }
    }
    reload();
    const enabled = () => getConfig().message_deletion_sync?.enabled !== false;
    const currentSession = () => textId(getSessionStartedAt());

    function identity(message) {
        return {
            sessionStartedAt: currentSession(),
            platform: nameId(message.type),
            ssnRoom: roomId(getSsnSessionId()),
            ssnId: textId(message.id ?? message.mid),
            nativeId: textId(message.meta?.messageId),
            broadcasterId: nameId(message.type) === 'twitch' ? textId(getBroadcasterId()) : '',
            userId: textId(message.userid ?? message.userId),
            userLogin: nameId(message.username || message.chatname),
            sourceName: textId(message.meta?.sourceDisplayName || message.meta?.twitchDisplayName || message.chatname),
            sourceChannel: nameId(message.meta?.streamUsername)
        };
    }

    function localKey(record) {
        return {
            ts: Number(record.ts), user: textId(record.user),
            sessionStartedAt: record.moderation?.sessionStartedAt || currentSession(),
            session: record.session || getSessionName(),
            platform: record.moderation?.platform, ssnId: record.moderation?.ssnId, nativeId: record.moderation?.nativeId,
            broadcasterId: record.moderation?.broadcasterId, ssnRoom: record.moderation?.ssnRoom, sourceChannel: record.moderation?.sourceChannel
        };
    }

    const keySignature = key => JSON.stringify([key.ts, key.user, key.sessionStartedAt, key.platform, key.ssnId, key.nativeId, key.broadcasterId, key.ssnRoom, key.sourceChannel]);
    function matchesKeys(record, rule) {
        if (!rule.keys?.length || !record.ts || !record.user) return false;
        if (!keyIndexes.has(rule)) {
            keyIndexes.set(rule, {
                identified: new Set(rule.keys.map(keySignature)),
                legacy: new Set(rule.keys.filter(key => key.session).map(key => JSON.stringify([key.ts, key.user, key.session])))
            });
        }
        const index = keyIndexes.get(rule);
        return record.moderation?.sessionStartedAt ? index.identified.has(keySignature(localKey(record)))
            : !!record.session && index.legacy.has(JSON.stringify([Number(record.ts), textId(record.user), record.session]));
    }

    function matchesRule(record, rule) {
        if (matchesKeys(record, rule)) return true;
        const id = record.moderation;
        if (!id) return false;
        if (rule.source === 'twitch') {
            if (id.platform !== 'twitch' || id.broadcasterId !== rule.broadcasterId) return false;
            if (rule.kind === 'message') return !!id.nativeId && id.nativeId === rule.nativeId;
        } else {
            if (id.ssnRoom !== rule.ssnRoom || rule.platform && id.platform !== rule.platform) return false;
            if (rule.sourceChannel && id.sourceChannel !== rule.sourceChannel) return false;
            if (rule.kind === 'message' && rule.nativeId) return id.nativeId === rule.nativeId;
            if (rule.kind === 'message' && rule.ssnId) {
                return false;
            }
        }
        if (rule.kind === 'keys') return false;
        if (id.sessionStartedAt !== rule.sessionStartedAt || Number(record.ts) > rule.throughTs) return false;
        if (rule.source === 'twitch' && (record.event || record.donation)) return false;
        if (rule.kind === 'user') {
            if (rule.userId) return id.userId === rule.userId || !id.userId && id.userLogin === rule.userLogin;
            if (rule.userLogin) return id.userLogin === rule.userLogin;
            return textId(record.user) === rule.user || id.sourceName === rule.user;
        }
        return rule.kind === 'clear';
    }

    const isDeleted = record => !!record && typeof record === 'object' && rules.some(rule => matchesRule(record, rule));
    const filterRecords = records => records.filter(record => !isDeleted(record));

    function saveRule(rule) {
        const signature = JSON.stringify({ ...rule, receivedAt: undefined });
        if (rules.some(existing => JSON.stringify({ ...existing, receivedAt: undefined }) === signature)) return true;
        try {
            const next = [...rules, rule];
            const previous = rules.findIndex(existing => existing.source === rule.source
                && (rule.nativeId ? existing.nativeId === rule.nativeId && existing.broadcasterId === rule.broadcasterId
                    && existing.ssnRoom === rule.ssnRoom && existing.platform === rule.platform && existing.sourceChannel === rule.sourceChannel
                    : rule.ssnId && existing.ssnId === rule.ssnId && existing.receivedAt === rule.receivedAt
                        && existing.ssnRoom === rule.ssnRoom && existing.sessionStartedAt === rule.sessionStartedAt));
            if (previous !== -1) {
                next.pop();
                next[previous] = { ...rules[previous], keys: [...(rules[previous].keys || []), ...(rule.keys || [])], kind: rule.kind };
            }
            safeWriteFileSync(file, JSON.stringify({ rules: next }, null, 2));
            rules = next;
            error = '';
            lastEventAt = new Date().toISOString();
            onChange();
            return true;
        } catch (err) {
            error = err.message;
            warn(`[Message moderation] Could not persist deletion: ${err.message}`);
            return false;
        }
    }

    function observeTwitch(message) {
        if (!enabled() || !message.id || message.broadcasterId !== getBroadcasterId()) return;
        const now = Date.now();
        twitchMessages.set(message.id, { ...message, receivedAt: now, sessionStartedAt: currentSession() });
        for (const [id, entry] of twitchMessages) {
            if (now - entry.receivedAt > 30 * 60 * 1000 || twitchMessages.size > 5000) twitchMessages.delete(id);
            else break;
        }
        for (const rule of [...rules]) {
            if (rule.source === 'twitch' && rule.kind === 'message' && rule.nativeId === message.id && !rule.keys?.length
                && Date.now() - rule.receivedAt <= 30000) {
                const keys = bridgeTwitch(rule.nativeId, getCurrentMessages());
                if (keys.length) saveRule({ ...rule, keys });
            }
        }
    }

    // DOM captures may only have an SSN MID. Bridge only a unique exact user/text pair near the native event.
    function bridgeTwitch(nativeId, records) {
        const native = twitchMessages.get(nativeId);
        if (!native || Date.now() - native.receivedAt > 30 * 60 * 1000) return [];
        const same = [...twitchMessages.values()].filter(message => message.broadcasterId === native.broadcasterId
            && message.userLogin === native.userLogin && message.text === native.text && Math.abs(message.receivedAt - native.receivedAt) <= 30000);
        if (same.length !== 1) return [];
        const candidates = records.filter(record => record.moderation?.platform === 'twitch'
            && record.moderation?.broadcasterId === native.broadcasterId && !record.moderation.nativeId
            && record.moderation.sessionStartedAt === native.sessionStartedAt
            && record.moderation.userLogin === native.userLogin && plain(record.messageHtml || record.message).trim() === native.text.trim()
            && Math.abs(Number(record.ts) - native.receivedAt) <= 30000);
        return candidates.length === 1 ? candidates.map(localKey) : [];
    }

    function handleTwitch(event) {
        if (!enabled() || event.broadcasterId !== getBroadcasterId()) return;
        const now = Date.now();
        const rule = {
            source: 'twitch', kind: event.kind, broadcasterId: event.broadcasterId,
            sessionStartedAt: currentSession(), throughTs: now, receivedAt: now
        };
        if (event.kind === 'message') {
            if (!event.messageId) return;
            rule.nativeId = event.messageId;
        } else if (event.kind === 'user') {
            rule.userId = textId(event.userId);
            rule.userLogin = nameId(event.userLogin);
            if (!rule.userId && !rule.userLogin) return;
        } else if (event.kind !== 'clear') return;
        const records = getCurrentMessages();
        rule.keys = records.filter(record => matchesRule(record, rule)).map(localKey);
        if (rule.kind === 'message' && !rule.keys.length) {
            rule.keys = bridgeTwitch(rule.nativeId, records);
            if (!rule.keys.length) warn('[Message moderation] Twitch deletion recorded; no unambiguous local message match yet.');
        }
        saveRule(rule);
    }

    function handleSsn(message) {
        if (!message || !message.delete || typeof message.delete !== 'object') return false;
        if (!enabled()) return true;
        const deletion = message.delete;
        const now = Date.now();
        const rule = {
            source: 'ssn', ssnRoom: roomId(getSsnSessionId()), platform: nameId(deletion.type),
            sourceChannel: nameId(deletion.meta?.streamUsername),
            sessionStartedAt: currentSession(), throughTs: now, receivedAt: now
        };
        if (deletion.meta?.messageId) {
            rule.kind = 'message';
            rule.nativeId = textId(deletion.meta.messageId);
        } else if (deletion.id !== undefined && deletion.id !== null) {
            rule.kind = 'message';
            rule.ssnId = textId(deletion.id);
        } else if (deletion.userid || deletion.chatname || deletion.username) {
            rule.kind = 'user';
            rule.userId = textId(deletion.userid);
            rule.userLogin = deletion.meta?.pluralmind ? nameId(deletion.username) : '';
            rule.user = textId(deletion.meta?.sourceDisplayName || deletion.meta?.twitchDisplayName || deletion.chatname);
        } else if (rule.platform) rule.kind = 'clear';
        else return true;
        let matches = getCurrentMessages().filter(record => rule.ssnId
            ? record.moderation?.ssnRoom === rule.ssnRoom && record.moderation?.sessionStartedAt === rule.sessionStartedAt
                && (!rule.platform || record.moderation.platform === rule.platform)
                && (!rule.sourceChannel || record.moderation.sourceChannel === rule.sourceChannel)
                && record.moderation.ssnId === rule.ssnId && Number(record.ts) <= rule.throughTs
            : matchesRule(record, rule));
        if (rule.kind === 'message' && rule.ssnId && matches.length) {
            if (matches.length > 1) {
                warn('[Message moderation] Ambiguous reused SocialStream message ID; no messages hidden.');
                return true;
            }
            rule.kind = 'keys';
        }
        if (deletion.onlyLast && !rule.nativeId && rule.kind !== 'message') {
            matches = matches.sort((a, b) => Number(b.ts) - Number(a.ts)).slice(0, 1);
            rule.kind = 'keys';
        }
        rule.keys = matches.map(localKey);
        saveRule(rule);
        return true;
    }

    function observeRecord(record) {
        if (!enabled() || !rules.some(rule => rule.kind === 'message' && !rule.keys?.length && Date.now() - rule.receivedAt <= 30000)) return;
        const records = [...getCurrentMessages(), record];
        for (const rule of [...rules]) {
            if (rule.kind !== 'message' || rule.keys?.length || Date.now() - rule.receivedAt > 30000) continue;
            let keys = [];
            if (rule.source === 'twitch') keys = bridgeTwitch(rule.nativeId, records);
            else if (record.moderation?.ssnRoom === rule.ssnRoom && record.moderation?.sessionStartedAt === rule.sessionStartedAt
                && (!rule.platform || record.moderation.platform === rule.platform)
                && (!rule.sourceChannel || record.moderation.sourceChannel === rule.sourceChannel)
                && (rule.nativeId ? record.moderation.nativeId === rule.nativeId : record.moderation.ssnId === rule.ssnId)) keys = [localKey(record)];
            if (keys.length) saveRule({ ...rule, kind: rule.ssnId ? 'keys' : rule.kind, keys });
        }
    }

    return {
        identity, isDeleted, filterRecords, handleSsn, handleTwitch, observeTwitch, observeRecord, reload,
        status: () => ({ enabled: enabled(), events: rules.length, lastEventAt, error }),
        fingerprint: () => createHash('sha256').update(JSON.stringify(rules)).digest('hex')
    };
}

module.exports = { createMessageDeletionService };

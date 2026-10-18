const fs = require('fs');
const path = require('path');

function createCrmService({
    dataDir,
    sessionsDir,
    getStatsData = () => ({}),
    getChatData = () => ({}),
    getBroadcasterName = () => 'jarbochov',
    readJsonFileSafe = (filePath, fallback) => fallback
} = {}) {
    const CHATTER_NOTES_FILE = path.join(dataDir, 'chatter-notes.json');
    let chatterNotes = {};
    try {
        if (fs.existsSync(CHATTER_NOTES_FILE)) {
            chatterNotes = JSON.parse(fs.readFileSync(CHATTER_NOTES_FILE, 'utf8')) || {};
        }
    } catch (e) {
        console.warn('[Chatter Notes] Failed to load:', e.message);
    }

    function saveChatterNotes() {
        try {
            fs.mkdirSync(dataDir, { recursive: true });
            fs.writeFileSync(`${CHATTER_NOTES_FILE}.tmp`, JSON.stringify(chatterNotes, null, 2), 'utf8');
            fs.renameSync(`${CHATTER_NOTES_FILE}.tmp`, CHATTER_NOTES_FILE);
        } catch (e) {
            console.error('[Chatter Notes] Save error:', e);
        }
    }

    function getChatterDossier(username) {
        if (!username) return null;
        const key = String(username).toLowerCase().trim();
        const statsData = getStatsData() || {};
        const chatData = getChatData() || {};

        let chatter = null;
        let displayName = username;
        for (const [k, c] of Object.entries(statsData.chatters || {})) {
            if (k.toLowerCase() === key) {
                chatter = c;
                displayName = c.chatname || k;
                break;
            }
        }
        if (!chatter && chatData.chatters) {
            for (const [k, c] of Object.entries(chatData.chatters)) {
                if (k.toLowerCase() === key) {
                    chatter = {
                        chatimg: c.chatimg,
                        type: c.type,
                        firstSeen: chatData.startedAt,
                        lastSeen: chatData.startedAt,
                        days: { [chatData.startedAt?.slice(0, 10) || 'today']: c.messageCount || 1 }
                    };
                    displayName = c.chatname || k;
                    break;
                }
            }
        }

        const days = chatter?.days || {};
        const totalMessages = Object.values(days).reduce((sum, n) => sum + (Number(n) || 0), 0);
        const sessionsAttended = Object.keys(days).length;

        const subTenure = statsData.subTenure?.[key] || statsData.subTenure?.[displayName];
        const subMonths = subTenure?.months || 0;
        const subscriber = statsData.subscribers?.[displayName] || statsData.subscribers?.[key];
        const isSubscriber = Boolean(subMonths > 0 || subscriber);

        const bitsRecord = statsData.bits?.[displayName] || statsData.bits?.[key];
        const bitsTotal = bitsRecord ? Object.values(bitsRecord.days || {}).reduce((sum, n) => sum + (Number(n) || 0), 0) : 0;

        const giftSubsRecord = statsData.giftSubs?.[displayName] || statsData.giftSubs?.[key];
        const giftSubsTotal = giftSubsRecord ? Object.values(giftSubsRecord.days || {}).reduce((sum, n) => sum + (Number(n) || 0), 0) : 0;

        const raidsRecord = statsData.raids?.[displayName] || statsData.raids?.[key];
        const raidsCount = raidsRecord ? Object.keys(raidsRecord.days || {}).length : 0;

        const categoriesMap = {};
        if (sessionsDir && fs.existsSync(sessionsDir)) {
            for (const file of fs.readdirSync(sessionsDir).filter(f => f.startsWith('chat-') && f.endsWith('.json'))) {
                try {
                    const sData = JSON.parse(fs.readFileSync(path.join(sessionsDir, file), 'utf8'));
                    const chatterEntry = Object.entries(sData.chatters || {}).find(([k]) => k.toLowerCase() === key);
                    if (chatterEntry) {
                        const count = chatterEntry[1]?.messageCount || 1;
                        const cats = (sData.streamInfo || []).map(s => s.category).filter(Boolean);
                        const uniqueCats = [...new Set(cats)];
                        if (!uniqueCats.length && sData.category) uniqueCats.push(sData.category);
                        for (const cat of uniqueCats) {
                            if (!categoriesMap[cat]) categoriesMap[cat] = { category: cat, sessions: 0, messages: 0 };
                            categoriesMap[cat].sessions++;
                            categoriesMap[cat].messages += count;
                        }
                    }
                } catch {}
            }
        }
        const favoriteGames = Object.values(categoriesMap).sort((a, b) => b.messages - a.messages).slice(0, 8);

        const recentActivity = Object.entries(days)
            .map(([date, msgs]) => ({ date, messages: msgs }))
            .sort((a, b) => b.date.localeCompare(a.date))
            .slice(0, 10);

        const noteEntry = chatterNotes[key] || {};
        const vipsList = readJsonFileSafe(path.join(dataDir, 'vips.json'), { data: [] })?.data || [];
        const modsList = readJsonFileSafe(path.join(dataDir, 'moderators.json'), { data: [] })?.data || [];
        const isTwitchVip = vipsList.some(v => (v.user_login || v.user_name || '').toLowerCase() === key) || Boolean(chatter?.isVip);
        const isTwitchMod = modsList.some(m => (m.user_login || m.user_name || '').toLowerCase() === key) || Boolean(chatter?.isMod);
        const isVip = Boolean(noteEntry.isVip || isTwitchVip);
        const isMod = Boolean(isTwitchMod || (noteEntry.tags || []).some(t => t.toLowerCase() === 'mod'));
        const broadcaster = (typeof getBroadcasterName === 'function' ? getBroadcasterName() : getBroadcasterName) || 'jarbochov';

        return {
            username: displayName,
            broadcaster,
            chatimg: chatter?.chatimg || '',
            type: chatter?.type || 'twitch',
            firstSeen: chatter?.firstSeen || null,
            lastSeen: chatter?.lastSeen || null,
            totalMessages,
            sessionsAttended,
            isSubscriber,
            subMonths,
            bitsTotal,
            giftSubsTotal,
            raidsCount,
            favoriteGames,
            recentActivity,
            pronouns: noteEntry.pronouns || '',
            notes: noteEntry.notes || '',
            tags: noteEntry.tags || [],
            isVip,
            isMod,
            updatedAt: noteEntry.updatedAt || null
        };
    }

    function getChattersList({ query = '', tagFilter = '', segmentFilter = '', limit = 200 } = {}) {
        const q = String(query || '').toLowerCase().trim();
        const tag = String(tagFilter || '').toLowerCase().trim();
        const seg = String(segmentFilter || '').toLowerCase().trim();
        const statsData = getStatsData() || {};
        const chatData = getChatData() || {};
        const currentChatters = chatData.chatters || {};
        const vipsList = readJsonFileSafe(path.join(dataDir, 'vips.json'), { data: [] })?.data || [];
        const modsList = readJsonFileSafe(path.join(dataDir, 'moderators.json'), { data: [] })?.data || [];
        const vipSet = new Set(vipsList.map(v => (v.user_login || v.user_name || '').toLowerCase()));
        const modSet = new Set(modsList.map(m => (m.user_login || m.user_name || '').toLowerCase()));

        const now = Date.now();
        const fourteenDaysAgo = new Date(now - 14 * 86400000).toISOString().slice(0, 10);
        const thirtyDaysAgo = new Date(now - 30 * 86400000).toISOString().slice(0, 10);
        const ninetyDaysAgo = new Date(now - 90 * 86400000).toISOString().slice(0, 10);

        const chattersList = Object.entries(statsData.chatters || {}).map(([username, d]) => {
            const days = d.days || {};
            const totalMsgs = Object.values(days).reduce((s, c) => s + (Number(c) || 0), 0);
            const notes = chatterNotes[username.toLowerCase()] || {};
            const subTenure = statsData.subTenure?.[username.toLowerCase()] || statsData.subTenure?.[username];
            const subMonths = subTenure?.months || 0;
            const isSubscriber = Boolean(subMonths > 0 || statsData.subscribers?.[username] || statsData.subscribers?.[username.toLowerCase()]);
            const isTwitchVip = vipSet.has(username.toLowerCase()) || Boolean(d.isVip);
            const isTwitchMod = modSet.has(username.toLowerCase()) || Boolean(d.isMod);
            const isVip = Boolean(notes.isVip || isTwitchVip);
            const isMod = Boolean(isTwitchMod || (notes.tags || []).some(t => t.toLowerCase() === 'mod'));
            const isTonight = Boolean(currentChatters[username.toLowerCase()] || currentChatters[username] || (d.chatname && currentChatters[d.chatname]));
            const sessionsAttended = Object.keys(days).length;
            const isRecent = isTonight || Boolean(d.lastSeen && String(d.lastSeen).slice(0, 10) >= thirtyDaysAgo);
            const isRegular = sessionsAttended >= 3 && isRecent;
            // Lapsed: attended 3+ streams in the past, last seen between 30 and 90 days ago (actionable recent drop-off, not ancient history)
            const isLapsed = sessionsAttended >= 3 && !isRecent && Boolean(d.lastSeen && String(d.lastSeen).slice(0, 10) >= ninetyDaysAgo);
            const isNew = Boolean(d.firstSeen && String(d.firstSeen).slice(0, 10) >= fourteenDaysAgo) || (sessionsAttended <= 1 && isRecent);
            const hasNotes = Boolean(notes.notes && notes.notes.trim());

            return {
                username,
                chatname: d.chatname || username,
                chatimg: d.chatimg || '',
                totalMessages: totalMsgs,
                sessionsAttended,
                firstSeen: d.firstSeen || null,
                lastSeen: d.lastSeen || null,
                isVip,
                isMod,
                isSubscriber,
                subMonths,
                pronouns: notes.pronouns || '',
                notes: notes.notes || '',
                tags: notes.tags || [],
                isTonight,
                isRegular,
                isLapsed,
                isNew,
                hasNotes
            };
        });

        const summary = {
            totalMembers: chattersList.length,
            activeTonight: chattersList.filter(c => c.isTonight).length,
            regularsCount: chattersList.filter(c => c.isRegular).length,
            lapsedCount: chattersList.filter(c => c.isLapsed).length,
            modsCount: chattersList.filter(c => c.isMod).length,
            vipsCount: chattersList.filter(c => c.isVip).length,
            vipsAndModsCount: chattersList.filter(c => c.isVip || c.isMod).length,
            subscribersCount: chattersList.filter(c => c.isSubscriber).length,
            withNotesCount: chattersList.filter(c => c.hasNotes).length
        };

        let filtered = chattersList;
        if (seg === 'tonight') {
            filtered = filtered.filter(c => c.isTonight);
        } else if (seg === 'regulars') {
            filtered = filtered.filter(c => c.isRegular);
        } else if (seg === 'lapsed') {
            filtered = filtered.filter(c => c.isLapsed);
        } else if (seg === 'mods' || seg === 'moderators') {
            filtered = filtered.filter(c => c.isMod);
        } else if (seg === 'vips' || seg === 'vip') {
            filtered = filtered.filter(c => c.isVip);
        } else if (seg === 'vips-mods') {
            filtered = filtered.filter(c => c.isVip || c.isMod);
        } else if (seg === 'subs' || seg === 'subscribers') {
            filtered = filtered.filter(c => c.isSubscriber);
        } else if (seg === 'new' || seg === 'newcomers') {
            filtered = filtered.filter(c => c.isNew);
        } else if (seg === 'notes' || seg === 'has-notes') {
            filtered = filtered.filter(c => c.hasNotes);
        }

        if (tag) {
            if (tag === 'vip') {
                filtered = filtered.filter(c => c.isVip);
            } else if (tag === 'mod' || tag === 'moderator') {
                filtered = filtered.filter(c => c.isMod);
            } else if (tag === 'sub' || tag === 'subscriber') {
                filtered = filtered.filter(c => c.isSubscriber);
            } else {
                filtered = filtered.filter(c => (c.tags || []).some(t => t.toLowerCase() === tag));
            }
        }

        if (q) {
            filtered = filtered.filter(c =>
                c.username.toLowerCase().includes(q)
                || (c.chatname && c.chatname.toLowerCase().includes(q))
                || (c.pronouns && c.pronouns.toLowerCase().includes(q))
                || (c.notes && c.notes.toLowerCase().includes(q))
                || (c.tags || []).some(t => t.toLowerCase().includes(q))
            );
        }

        filtered.sort((a, b) => b.totalMessages - a.totalMessages);

        // Tags are exclusively for custom user-defined streamer labels (e.g. artist, collab, friend)
        const systemRoleTags = new Set(['vip', 'mod', 'moderator', 'sub', 'subscriber', 'regular']);
        const allTagsSet = new Set();
        for (const note of Object.values(chatterNotes)) {
            if (Array.isArray(note.tags)) {
                for (const t of note.tags) {
                    const trimmed = (t || '').trim();
                    if (trimmed && !systemRoleTags.has(trimmed.toLowerCase())) {
                        allTagsSet.add(trimmed);
                    }
                }
            }
        }

        return {
            chatters: filtered.slice(0, Math.max(50, limit)),
            total: filtered.length,
            tags: Array.from(allTagsSet),
            summary
        };
    }

    function updateChatterNotes(username, data = {}) {
        const key = String(username || '').toLowerCase().trim();
        chatterNotes[key] = {
            notes: String(data.notes || '').slice(0, 3000),
            pronouns: String(data.pronouns || '').trim().slice(0, 50),
            tags: Array.isArray(data.tags)
                ? data.tags.slice(0, 15).map(t => String(t).trim().slice(0, 30)).filter(Boolean)
                : (chatterNotes[key]?.tags || []),
            isVip: Boolean(data.isVip),
            updatedAt: new Date().toISOString()
        };
        saveChatterNotes();
        return getChatterDossier(username);
    }

    return {
        getChattersList,
        getChatterDossier,
        updateChatterNotes,
        saveChatterNotes,
        getChatterNotes: () => chatterNotes
    };
}

module.exports = {
    createCrmService
};

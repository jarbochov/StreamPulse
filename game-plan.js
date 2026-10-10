// Pure Game Plan helpers (no server state), kept apart from server.js.
'use strict';

function sanitizeOverlayId(value) {
    return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

const GAME_PLAN_STATUSES = ['scheduled', 'backlog', 'played'];
const DEFAULT_TIERS = [['S', '#ff7f7f'], ['A', '#ffbf7f'], ['B', '#ffdf7f'], ['C', '#bfff7f'], ['D', '#7fbfff'], ['F', '#bf9fff']].map(([id, color]) => ({ id, label: id, color }));

function normalizeGamePlan(input) {
    const lists = [];
    for (const entry of (Array.isArray(input?.lists) ? input.lists : []).slice(0, 20)) {
        const id = /^list-[a-z0-9-]{1,40}$/.test(entry?.id || '') ? entry.id : '';
        const name = String(entry?.name || '').trim().slice(0, 40);
        if (id && name && !lists.some(list => list.id === id)) lists.push({ id, name });
    }
    const cleanTiers = value => {
        const out = [];
        for (const entry of (Array.isArray(value) ? value : []).slice(0, 12)) {
            const id = /^[A-Za-z0-9-]{1,24}$/.test(entry?.id || '') ? entry.id : '';
            const label = String(entry?.label || '').trim().slice(0, 24);
            const color = /^#[0-9a-f]{6}$/i.test(entry?.color || '') ? entry.color : '#b0b0b0';
            if (id && label && !out.some(tier => tier.id === id)) out.push({ id, label, color });
        }
        return out;
    };
    // `tiers` is the default tier set; each list can have its own in `tierSets`.
    let tiers = cleanTiers(input?.tiers);
    if (!tiers.length && !Array.isArray(input?.tiers)) tiers = DEFAULT_TIERS.map(tier => ({ ...tier }));
    const validStatus = status => GAME_PLAN_STATUSES.includes(status) || lists.some(list => list.id === status);
    const tierSets = {};
    for (const [key, value] of Object.entries(input?.tierSets && typeof input.tierSets === 'object' ? input.tierSets : {})) {
        if (validStatus(key) && Array.isArray(value)) tierSets[key] = cleanTiers(value);
    }
    const tiersFor = status => tierSets[status] || tiers;
    const items = (Array.isArray(input?.items) ? input.items : []).slice(0, 300).map((item, index) => ({
        id: sanitizeOverlayId(item?.id) || `game-${Date.now().toString(36)}-${index}`,
        name: String(item?.name || '').trim().slice(0, 120),
        status: validStatus(item?.status) ? item.status : 'backlog',
        period: String(item?.period || '').trim().slice(0, 40),
        note: String(item?.note || '').trim().slice(0, 200),
        twitchCategory: String(item?.twitchCategory || '').trim().slice(0, 120),
        igdbId: /^\d{1,9}$/.test(String(item?.igdbId || '')) ? String(item.igdbId) : '',
        custom: item?.custom === true,
        customCover: /^(https?:\/\/|\/custom-overlay-assets\/)[^\s"'<>]{1,500}$/i.test(String(item?.customCover || '').trim()) ? String(item.customCover).trim() : '',
        rating: Math.max(0, Math.min(5, Math.round((Number(item?.rating) || 0) * 2) / 2)),
        tier: tiersFor(validStatus(item?.status) ? item.status : 'backlog').some(tier => tier.id === item?.tier) ? item.tier : '',
        tags: [...new Set((Array.isArray(item?.tags) ? item.tags : []).map(tag => String(tag || '').trim().slice(0, 24)).filter(Boolean))].slice(0, 8),
        finished: /^\d{4}-\d{2}-\d{2}$/.test(String(item?.finished || '')) ? item.finished : '',
        played: [...new Set((Array.isArray(item?.played) ? item.played : []).map(String).filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date)))].sort().slice(-400),
        autoAdded: item?.autoAdded === true,
        system: String(item?.system || '').trim().slice(0, 40),
        // Custom lists are not exclusive: a game can also belong to others besides its main list.
        extraLists: [...new Set((Array.isArray(item?.extraLists) ? item.extraLists : []).filter(id => lists.some(list => list.id === id) && id !== item?.status))]
    })).filter(item => item.name);
    const used = [...new Set(items.map(item => item.period).filter(Boolean))];
    const saved = (Array.isArray(input?.periods) ? input.periods : []).map(value => String(value || '').trim().slice(0, 40)).filter(value => used.includes(value));
    const periods = [...new Set([...saved, ...used])].slice(0, 40);
    return { lists, tiers, tierSets, items, periods };
}

const gameKey = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

module.exports = { GAME_PLAN_STATUSES, DEFAULT_TIERS, normalizeGamePlan, gameKey, sanitizeOverlayId };

'use strict';

/**
 * StreamPulse Standalone Tier List Service
 * 
 * Provides customizable tier lists with:
 * - Dynamic tiers (add, delete, reorder, customize label & color)
 * - Ranked and unranked items with captions & artwork
 * - Live audience chat voting with prefix commands (!tier <name>, !rank <name>)
 * - Vote consensus math: weighted mean (A+C=B), median, plurality
 * - Single item voting at a time with vote updating
 * - Presets and templates management
 * - Real-time WebSocket broadcasting for animated OBS overlays
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_TIERS = [
    { id: 'tier-s', label: 'S', color: '#ff7f7f', description: 'Top Tier' },
    { id: 'tier-a', label: 'A', color: '#ffbf7f', description: 'Great' },
    { id: 'tier-b', label: 'B', color: '#ffdf7f', description: 'Good' },
    { id: 'tier-c', label: 'C', color: '#ffff7f', description: 'Average' },
    { id: 'tier-d', label: 'D', color: '#bfff7f', description: 'Below Average' },
    { id: 'tier-f', label: 'F', color: '#7fff7f', description: 'Bottom Tier' }
];

const BUILTIN_PRESETS = [
    {
        id: 'preset-standard',
        name: 'Standard (S - F)',
        description: 'Classic 6-tier ranking from S to F',
        tiers: [
            { id: 'tier-s', label: 'S', color: '#ff7f7f' },
            { id: 'tier-a', label: 'A', color: '#ffbf7f' },
            { id: 'tier-b', label: 'B', color: '#ffdf7f' },
            { id: 'tier-c', label: 'C', color: '#ffff7f' },
            { id: 'tier-d', label: 'D', color: '#bfff7f' },
            { id: 'tier-f', label: 'F', color: '#7fff7f' }
        ]
    },
    {
        id: 'preset-extended',
        name: 'Extended Gaming (S+ to Trash)',
        description: 'Extended 8-tier ranking with S+ and Trash / DNF',
        tiers: [
            { id: 'tier-sp', label: 'S+', color: '#ff4b4b' },
            { id: 'tier-s', label: 'S', color: '#ff7f7f' },
            { id: 'tier-a', label: 'A', color: '#ffbf7f' },
            { id: 'tier-b', label: 'B', color: '#ffdf7f' },
            { id: 'tier-c', label: 'C', color: '#ffff7f' },
            { id: 'tier-d', label: 'D', color: '#bfff7f' },
            { id: 'tier-f', label: 'F', color: '#7fff7f' },
            { id: 'tier-trash', label: 'Trash', color: '#8b949e' }
        ]
    },
    {
        id: 'preset-movies',
        name: 'Movie & Media Reviews',
        description: 'Qualitative film & media critique tiers',
        tiers: [
            { id: 'tier-masterpiece', label: 'Masterpiece', color: '#ff7f7f' },
            { id: 'tier-great', label: 'Great', color: '#ffbf7f' },
            { id: 'tier-good', label: 'Good', color: '#ffdf7f' },
            { id: 'tier-meh', label: 'Meh', color: '#ffff7f' },
            { id: 'tier-terrible', label: 'Terrible', color: '#7fff7f' }
        ]
    },
    {
        id: 'preset-food',
        name: 'Food & Snacks',
        description: 'Taste and snack rankings',
        tiers: [
            { id: 'tier-god', label: 'God Tier', color: '#ff7f7f' },
            { id: 'tier-delicious', label: 'Delicious', color: '#ffbf7f' },
            { id: 'tier-decent', label: 'Decent', color: '#ffff7f' },
            { id: 'tier-mid', label: 'Mid', color: '#bfff7f' },
            { id: 'tier-bin', label: 'In The Bin', color: '#8b949e' }
        ]
    }
];

function generateId(prefix = 'tier') {
    return `${prefix}-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`;
}

function calculateConsensus(vote, tiers) {
    if (!vote || !tiers || tiers.length === 0) return null;
    const tierMap = new Map();
    tiers.forEach((t, i) => tierMap.set(t.id, { tier: t, index: i, count: 0, weightedCount: 0 }));

    const voterEntries = Object.values(vote.votes || {});
    let totalWeight = 0;
    let weightedIndexSum = 0;
    const weightedVoterIndices = [];

    for (const v of voterEntries) {
        const tData = tierMap.get(v.tierId);
        if (!tData) continue;
        const weight = Math.max(1, Number(v.weight) || 1);
        tData.count += 1;
        tData.weightedCount += weight;
        totalWeight += weight;
        weightedIndexSum += tData.index * weight;
        for (let w = 0; w < weight; w++) {
            weightedVoterIndices.push(tData.index);
        }
    }

    const distribution = tiers.map(t => {
        const d = tierMap.get(t.id);
        const pct = totalWeight > 0 ? Math.round((d.weightedCount / totalWeight) * 100) : 0;
        return {
            tierId: t.id,
            label: t.label,
            color: t.color,
            count: d.count,
            weightedCount: d.weightedCount,
            percentage: pct
        };
    });

    if (totalWeight === 0) {
        return {
            mode: vote.consensusMode || 'weighted_mean',
            totalVotes: 0,
            totalWeight: 0,
            distribution,
            consensusTier: null,
            consensusIndex: null
        };
    }

    let consensusIndex = 0;
    const mode = vote.consensusMode || 'weighted_mean';

    if (mode === 'weighted_mean') {
        // Continuous mean index rounded to nearest integer tier index
        // e.g. A (index 1) + C (index 3) = 4 / 2 = 2 => B
        const mean = weightedIndexSum / totalWeight;
        consensusIndex = Math.min(tiers.length - 1, Math.max(0, Math.round(mean)));
    } else if (mode === 'median') {
        // 50th percentile of voters
        weightedVoterIndices.sort((a, b) => a - b);
        const mid = Math.floor(weightedVoterIndices.length / 2);
        consensusIndex = weightedVoterIndices[mid];
    } else if (mode === 'plurality') {
        // Highest weighted count (mode)
        let maxWeight = -1;
        tiers.forEach((t, i) => {
            const wc = tierMap.get(t.id).weightedCount;
            if (wc > maxWeight) {
                maxWeight = wc;
                consensusIndex = i;
            }
        });
    }

    const consensusTier = tiers[consensusIndex] || tiers[0];
    return {
        mode,
        totalVotes: voterEntries.length,
        totalWeight,
        distribution,
        consensusTier,
        consensusIndex
    };
}

function createTierListService({
    dataDir,
    tierListPath = path.join(dataDir, 'tier-list.json'),
    broadcastToOverlays = () => {},
    chatbotAnnouncer = null,
    log = console.log
} = {}) {
    let state = {
        id: 'default',
        title: 'Community Tier List',
        description: '',
        theme: {
            backgroundColor: 'rgba(13, 17, 23, 0.92)',
            textColor: '#f0f6fc',
            accentColor: '#3b82f6',
            cardAspect: '1/1',
            cardFit: 'cover',
            fontSize: 'medium'
        },
        tiers: JSON.parse(JSON.stringify(DEFAULT_TIERS)),
        items: [],
        activeVote: null,
        presets: JSON.parse(JSON.stringify(BUILTIN_PRESETS)),
        settings: {
            consensusMode: 'weighted_mean',
            subMultiplier: 1,
            allowVoteChange: true,
            defaultDuration: 60,
            announceChat: true
        }
    };

    let voteTimer = null;

    function load() {
        try {
            if (fs.existsSync(tierListPath)) {
                const raw = fs.readFileSync(tierListPath, 'utf8');
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === 'object') {
                    if (Array.isArray(parsed.tiers) && parsed.tiers.length > 0) {
                        state.tiers = parsed.tiers;
                    }
                    if (Array.isArray(parsed.items)) {
                        state.items = parsed.items;
                    }
                    if (parsed.title) state.title = parsed.title;
                    if (parsed.description !== undefined) state.description = parsed.description;
                    if (parsed.theme && typeof parsed.theme === 'object') {
                        state.theme = Object.assign({}, state.theme, parsed.theme);
                    }
                    if (parsed.settings && typeof parsed.settings === 'object') {
                        state.settings = Object.assign({}, state.settings, parsed.settings);
                    }
                    if (Array.isArray(parsed.presets)) {
                        state.presets = parsed.presets;
                    }
                }
            }
        } catch (err) {
            log(`[TierList] Failed to read ${tierListPath}: ${err.message}`);
        }
    }

    function save() {
        try {
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir, { recursive: true });
            }
            const tmpPath = `${tierListPath}.tmp-${Date.now()}`;
            const toPersist = {
                id: state.id,
                title: state.title,
                description: state.description,
                theme: state.theme,
                tiers: state.tiers,
                items: state.items,
                presets: state.presets,
                settings: state.settings,
                updatedAt: new Date().toISOString()
            };
            fs.writeFileSync(tmpPath, JSON.stringify(toPersist, null, 2), 'utf8');
            fs.renameSync(tmpPath, tierListPath);
        } catch (err) {
            log(`[TierList] Failed to save ${tierListPath}: ${err.message}`);
        }
    }

    function broadcastState(eventType = 'tier-list:update', extra = {}) {
        const publicPayload = getPublicState();
        broadcastToOverlays(eventType, Object.assign({}, publicPayload, extra));
    }

    function getPublicState() {
        const vote = state.activeVote ? Object.assign({}, state.activeVote, {
            consensus: calculateConsensus(state.activeVote, state.tiers)
        }) : null;

        return {
            id: state.id,
            title: state.title,
            description: state.description,
            theme: state.theme,
            tiers: state.tiers,
            items: state.items,
            activeVote: vote,
            presets: state.presets,
            settings: state.settings
        };
    }

    // ------------------------------------------------------------------------
    // CRUD: Tier List Configuration
    // ------------------------------------------------------------------------

    function updateConfig(updates = {}) {
        if (updates.title !== undefined) state.title = String(updates.title).trim();
        if (updates.description !== undefined) state.description = String(updates.description);
        if (updates.theme && typeof updates.theme === 'object') {
            state.theme = Object.assign({}, state.theme, updates.theme);
        }
        if (updates.settings && typeof updates.settings === 'object') {
            state.settings = Object.assign({}, state.settings, updates.settings);
        }
        if (Array.isArray(updates.tiers)) {
            state.tiers = updates.tiers.map((t, idx) => ({
                id: t.id || `tier-${idx}`,
                label: String(t.label || `Tier ${idx + 1}`).trim(),
                color: String(t.color || '#ff7f7f').trim(),
                description: String(t.description || '')
            }));
            // Remove tier references from items placed in deleted tiers
            const tierIds = new Set(state.tiers.map(t => t.id));
            state.items.forEach(it => {
                if (it.tierId && !tierIds.has(it.tierId)) {
                    it.tierId = null;
                }
            });
        }
        save();
        broadcastState('tier-list:update');
        return getPublicState();
    }

    // ------------------------------------------------------------------------
    // CRUD: Items
    // ------------------------------------------------------------------------

    function addItem(input = {}) {
        const item = {
            id: input.id || generateId('item'),
            name: String(input.name || 'Untitled').trim(),
            imageUrl: String(input.imageUrl || input.url || '').trim(),
            tierId: input.tierId ? String(input.tierId) : null,
            order: Number(input.order) || state.items.filter(i => i.tierId === (input.tierId || null)).length,
            note: String(input.note || '').trim(),
            createdAt: new Date().toISOString()
        };
        state.items.push(item);
        save();
        broadcastState('tier-list:update', { addedItem: item });
        return item;
    }

    function batchAddItems(itemsList = []) {
        if (!Array.isArray(itemsList)) return [];
        const added = [];
        const unrankedCount = state.items.filter(i => !i.tierId).length;

        itemsList.forEach((input, idx) => {
            const item = {
                id: input.id || generateId('item'),
                name: String(input.name || input.caption || input.filename || 'Item').trim(),
                imageUrl: String(input.imageUrl || input.url || '').trim(),
                tierId: input.tierId ? String(input.tierId) : null,
                order: unrankedCount + idx,
                note: String(input.note || '').trim(),
                createdAt: new Date().toISOString()
            };
            state.items.push(item);
            added.push(item);
        });

        save();
        broadcastState('tier-list:update', { addedItems: added });
        return added;
    }

    function updateItem(itemId, updates = {}) {
        const item = state.items.find(i => i.id === itemId);
        if (!item) return null;

        if (updates.name !== undefined) item.name = String(updates.name).trim();
        if (updates.imageUrl !== undefined) item.imageUrl = String(updates.imageUrl).trim();
        if (updates.note !== undefined) item.note = String(updates.note).trim();
        if (updates.tierId !== undefined) {
            item.tierId = updates.tierId ? String(updates.tierId) : null;
        }
        if (updates.order !== undefined) item.order = Number(updates.order) || 0;

        save();
        broadcastState('tier-list:update', { updatedItem: item });
        return item;
    }

    function deleteItem(itemId) {
        const index = state.items.findIndex(i => i.id === itemId);
        if (index === -1) return false;

        const [removed] = state.items.splice(index, 1);
        if (state.activeVote && state.activeVote.itemId === itemId) {
            cancelVote();
        }
        save();
        broadcastState('tier-list:update', { deletedItemId: itemId });
        return removed;
    }

    function moveItem({ itemId, toTier = null, toIndex = -1 }) {
        const item = state.items.find(i => i.id === itemId);
        if (!item) return null;

        const fromTier = item.tierId;
        const normalizedToTier = toTier ? String(toTier) : null;
        item.tierId = normalizedToTier;

        // Reorder items within the target tier
        const targetItems = state.items
            .filter(i => i.tierId === normalizedToTier && i.id !== itemId)
            .sort((a, b) => (a.order || 0) - (b.order || 0));

        if (toIndex >= 0 && toIndex <= targetItems.length) {
            targetItems.splice(toIndex, 0, item);
        } else {
            targetItems.push(item);
        }

        targetItems.forEach((it, idx) => {
            it.order = idx;
        });

        save();
        broadcastState('tier-list:move', {
            itemId,
            fromTier,
            toTier: normalizedToTier,
            order: item.order
        });
        return item;
    }

    function resetPlacements() {
        state.items.forEach((item, idx) => {
            item.tierId = null;
            item.order = idx;
        });
        if (state.activeVote) cancelVote();
        save();
        broadcastState('tier-list:update');
        return getPublicState();
    }

    function clearItems() {
        state.items = [];
        if (state.activeVote) cancelVote();
        save();
        broadcastState('tier-list:update');
        return getPublicState();
    }

    // ------------------------------------------------------------------------
    // Chat Voting & Consensus Engine
    // ------------------------------------------------------------------------

    function startVote({
        itemId,
        duration = 60,
        consensusMode = null,
        subMultiplier = null
    } = {}) {
        const item = state.items.find(i => i.id === itemId);
        if (!item) throw new Error('Item not found');

        if (voteTimer) {
            clearTimeout(voteTimer);
            voteTimer = null;
        }

        const effectiveDuration = Math.max(0, duration !== undefined ? Number(duration) : (state.settings.defaultDuration || 60));
        const effectiveMode = consensusMode || state.settings.consensusMode || 'weighted_mean';
        const effectiveSubMult = subMultiplier !== undefined ? Number(subMultiplier) : (state.settings.subMultiplier || 1);

        state.activeVote = {
            id: generateId('vote'),
            itemId: item.id,
            itemName: item.name,
            itemImage: item.imageUrl,
            duration: effectiveDuration,
            startedAt: Date.now(),
            endsAt: effectiveDuration > 0 ? Date.now() + (effectiveDuration * 1000) : null,
            consensusMode: effectiveMode,
            subMultiplier: effectiveSubMult,
            allowVoteChange: state.settings.allowVoteChange !== false,
            votes: {},
            status: 'ACTIVE'
        };

        if (effectiveDuration > 0) {
            voteTimer = setTimeout(() => {
                try {
                    endVote({ applyConsensus: true });
                } catch (e) {
                    log(`[TierList] Auto-end vote error: ${e.message}`);
                }
            }, effectiveDuration * 1000);
        }

        broadcastState('tier-list:vote-start', {
            vote: Object.assign({}, state.activeVote, {
                consensus: calculateConsensus(state.activeVote, state.tiers)
            })
        });

        if (state.settings.announceChat && chatbotAnnouncer && typeof chatbotAnnouncer.announceTierVoteStart === 'function') {
            Promise.resolve().then(() => chatbotAnnouncer.announceTierVoteStart({
                item,
                tiers: state.tiers,
                duration: effectiveDuration
            })).catch(() => {});
        }

        log(`[TierList] Started chat vote for "${item.name}" (duration: ${effectiveDuration}s, mode: ${effectiveMode})`);
        return getPublicState();
    }

    function castVote({
        user = '',
        userId = '',
        tierId = '',
        isSub = false
    } = {}) {
        if (!state.activeVote || state.activeVote.status !== 'ACTIVE') return false;
        const normalizedUserId = String(userId || user).trim().toLowerCase();
        if (!normalizedUserId) return false;

        // Verify tier exists
        const tier = state.tiers.find(t => t.id === tierId);
        if (!tier) return false;

        // Check vote changing rule
        const existing = state.activeVote.votes[normalizedUserId];
        if (existing && !state.activeVote.allowVoteChange) {
            return false;
        }

        const weight = (isSub && state.activeVote.subMultiplier > 1) ? state.activeVote.subMultiplier : 1;

        state.activeVote.votes[normalizedUserId] = {
            user: String(user || 'Anonymous').trim(),
            userId: normalizedUserId,
            tierId: tier.id,
            isSub: Boolean(isSub),
            weight,
            timestamp: Date.now()
        };

        const consensus = calculateConsensus(state.activeVote, state.tiers);

        broadcastToOverlays('tier-list:vote-update', {
            voteId: state.activeVote.id,
            itemId: state.activeVote.itemId,
            totalVotes: Object.keys(state.activeVote.votes).length,
            consensus
        });

        return true;
    }

    function handleChatMessage(msg = {}) {
        if (!state.activeVote || state.activeVote.status !== 'ACTIVE') return false;

        const user = msg.chatname || msg.username || msg.user || '';
        const userId = msg.userId || msg.id || user.toLowerCase();
        if (!userId) return false;

        const text = String(msg.message || msg.text || '').trim();
        if (!text) return false;

        // Ignore bot / announcement messages
        if (/^\[(?:bot|poll|tournament|tier)/i.test(text)) return false;
        if (chatbotAnnouncer?.isBotMessage?.(text)) return false;

        // Pattern: !tier <arg> or !rank <arg>
        const match = text.match(/^(?:!tier|!rank)\s+(.+)$/i);
        if (!match) return false;

        const rawArg = match[1].trim().toLowerCase();
        if (!rawArg) return false;

        // Match against tier labels (exact, alias, or index)
        let matchedTier = null;

        // 1. Check numeric index (1-based: e.g. !tier 1 => Tier S)
        if (/^\d+$/.test(rawArg)) {
            const idx = parseInt(rawArg, 10) - 1;
            if (idx >= 0 && idx < state.tiers.length) {
                matchedTier = state.tiers[idx];
            }
        }

        // 2. Check exact or lowercased label match (e.g. "s", "a", "trash")
        if (!matchedTier) {
            matchedTier = state.tiers.find(t => t.label.trim().toLowerCase() === rawArg);
        }

        // 3. Check partial label prefix if unambiguous (e.g. "mast" => "Masterpiece")
        if (!matchedTier && rawArg.length >= 3) {
            matchedTier = state.tiers.find(t => t.label.trim().toLowerCase().startsWith(rawArg));
        }

        if (!matchedTier) return false;

        return castVote({
            user,
            userId,
            tierId: matchedTier.id,
            isSub: Boolean(msg.subscriber || msg.isSub || msg.hasMembership)
        });
    }

    function endVote({ applyConsensus = true } = {}) {
        if (!state.activeVote) return null;

        if (voteTimer) {
            clearTimeout(voteTimer);
            voteTimer = null;
        }

        const vote = state.activeVote;
        vote.status = 'COMPLETED';
        const consensus = calculateConsensus(vote, state.tiers);
        const item = state.items.find(i => i.id === vote.itemId);

        let placedInTier = null;

        if (applyConsensus && item && consensus && consensus.consensusTier) {
            placedInTier = consensus.consensusTier;
            moveItem({
                itemId: item.id,
                toTier: placedInTier.id
            });
        }

        state.activeVote = null;

        broadcastState('tier-list:vote-end', {
            itemId: item ? item.id : null,
            consensusTier: placedInTier,
            consensus
        });

        if (state.settings.announceChat && chatbotAnnouncer && typeof chatbotAnnouncer.announceTierVoteEnd === 'function') {
            Promise.resolve().then(() => chatbotAnnouncer.announceTierVoteEnd({
                item,
                consensusTier: placedInTier,
                consensus
            })).catch(() => {});
        }

        log(`[TierList] Vote completed for "${vote.itemName}". Consensus placed in: ${placedInTier ? placedInTier.label : 'None'}`);
        return getPublicState();
    }

    function cancelVote() {
        if (!state.activeVote) return null;

        if (voteTimer) {
            clearTimeout(voteTimer);
            voteTimer = null;
        }

        state.activeVote = null;
        broadcastState('tier-list:vote-cancel');
        return getPublicState();
    }

    // ------------------------------------------------------------------------
    // Presets Management
    // ------------------------------------------------------------------------

    function savePreset({ name, description = '', includeItems = false }) {
        const cleanName = String(name || 'Custom Preset').trim();
        const preset = {
            id: generateId('preset'),
            name: cleanName,
            description: String(description || '').trim(),
            tiers: JSON.parse(JSON.stringify(state.tiers)),
            theme: JSON.parse(JSON.stringify(state.theme)),
            items: includeItems ? JSON.parse(JSON.stringify(state.items)) : undefined,
            createdAt: new Date().toISOString()
        };
        state.presets.push(preset);
        save();
        broadcastState('tier-list:update');
        return preset;
    }

    function loadPreset(presetId) {
        const preset = state.presets.find(p => p.id === presetId);
        if (!preset) throw new Error('Preset not found');

        state.tiers = JSON.parse(JSON.stringify(preset.tiers || DEFAULT_TIERS));
        if (preset.theme) {
            state.theme = Object.assign({}, state.theme, preset.theme);
        }
        if (Array.isArray(preset.items) && preset.items.length > 0) {
            state.items = JSON.parse(JSON.stringify(preset.items));
        } else {
            // Retain existing items but reset placement if tiers changed
            const tierIds = new Set(state.tiers.map(t => t.id));
            state.items.forEach(it => {
                if (it.tierId && !tierIds.has(it.tierId)) it.tierId = null;
            });
        }

        if (state.activeVote) cancelVote();
        save();
        broadcastState('tier-list:update');
        return getPublicState();
    }

    function deletePreset(presetId) {
        const idx = state.presets.findIndex(p => p.id === presetId);
        if (idx === -1) return false;
        state.presets.splice(idx, 1);
        save();
        broadcastState('tier-list:update');
        return true;
    }

    function resetPresets() {
        state.presets = JSON.parse(JSON.stringify(BUILTIN_PRESETS));
        save();
        broadcastState('tier-list:update');
        return state.presets;
    }

    // Initialize on load
    load();

    return {
        getState: getPublicState,
        updateConfig,
        addItem,
        batchAddItems,
        updateItem,
        deleteItem,
        moveItem,
        resetPlacements,
        clearItems,
        startVote,
        castVote,
        handleChatMessage,
        endVote,
        cancelVote,
        calculateConsensus: (v, t) => calculateConsensus(v, t || state.tiers),
        savePreset,
        loadPreset,
        deletePreset,
        resetPresets
    };
}

module.exports = {
    createTierListService,
    calculateConsensus,
    DEFAULT_TIERS,
    BUILTIN_PRESETS
};

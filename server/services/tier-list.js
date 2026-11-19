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
    let subVotes = 0;

    for (const v of voterEntries) {
        if (v.isSub) subVotes++;
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

    const recentVoters = voterEntries
        .slice()
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
        .slice(0, 8)
        .map(v => {
            const tData = tierMap.get(v.tierId);
            return {
                user: v.user,
                tierLabel: tData ? tData.tier.label : '?',
                tierColor: tData ? tData.tier.color : '#888',
                isSub: Boolean(v.isSub)
            };
        });

    if (totalWeight === 0) {
        return {
            mode: vote.consensusMode || 'weighted_mean',
            totalVotes: 0,
            totalWeight: 0,
            subVotes: 0,
            agreementPercent: 0,
            recentVoters: [],
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
    const winningData = tierMap.get(consensusTier.id);
    const agreementPercent = voterEntries.length > 0 ? Math.round(((winningData?.count || 0) / voterEntries.length) * 100) : 0;

    return {
        mode,
        totalVotes: voterEntries.length,
        totalWeight,
        subVotes,
        agreementPercent,
        recentVoters,
        distribution,
        consensusTier,
        consensusIndex
    };
}

const VALID_THEME_STYLES = new Set([
    'dark', 'transparent', 'light',
    'card', 'glass', 'solid', 'neon', 'retro', 'cyber',
    'fgc-evo', 'championship', 'clean-light', 'minimal-dark',
    'ember', 'aurora', 'ocean', 'sunset', 'violet', 'forest',
    'border', 'pill', 'custom'
]);

const DEFAULT_THEME = {
    backgroundColor: '',
    rowBackgroundColor: '',
    borderColor: '',
    textColor: '',
    mutedColor: '',
    accentColor: '',
    borderRadius: '',
    backdropBlur: '',
    headingFont: '',
    fontFamily: '',
    fontWeight: '',
    fontScale: 1,
    textTransform: '',
    textOutline: '',
    layout: 'board',
    style: 'dark',
    customThemeId: '',
    hideUnranked: false,
    cardSize: 'medium',
    cardAspect: '1/1',
    cardFit: 'cover',
    fontSize: 'medium',
    bannerUrl: '',
    bannerMode: 'replace',
    bannerHeight: 110,
    bannerFit: 'cover',
    showCaptions: true,
    fitCaptions: false,
    autoFit: false,
    howToVote: 'auto',
    hintScale: '1',
    sfx: true,
    focusEnlarge: false,
    followZoom: false
};

function sanitizeBannerUrl(raw) {
    const val = String(raw ?? '').trim();
    if (!val) return '';
    if (val.startsWith('/') && !val.startsWith('//')) return val;
    if (/^https?:\/\//i.test(val)) return val;
    if (/^data:image\/[a-z0-9.+-]+;/i.test(val)) return val;
    return '';
}

function sanitizeAudioUrl(raw) {
    const val = String(raw ?? '').trim();
    if (!val) return '';
    if (val.startsWith('/') && !val.startsWith('//')) return val;
    if (/^https?:\/\//i.test(val)) return val;
    if (/^data:audio\/[a-z0-9.+-]+;/i.test(val)) return val;
    return '';
}

function sanitizeCssColor(raw) {
    const val = String(raw ?? '').trim();
    if (!val || val.length > 160) return '';
    if (/[;{}<>]|url\s*\(|expression/i.test(val)) return '';
    if (/^[0-9a-f]{3}([0-9a-f]{3}([0-9a-f]{2})?)?$/i.test(val)) return `#${val}`;
    if (/^(#[0-9a-f]{3,8}|(rgb|hsl)a?\([0-9.,%\s/+-]+\)|transparent|[a-z]{3,20})$/i.test(val)) return val;
    if (/^linear-gradient\(\s*[a-z0-9#(),.%\s+-]+\)$/i.test(val)) return val;
    return '';
}

function sanitizeFontName(raw) {
    return String(raw ?? '').replace(/["'<>;{}\\]/g, '').trim().slice(0, 80);
}

function sanitizeFontWeight(raw) {
    const w = String(raw ?? '').trim().toLowerCase();
    if (!w) return '';
    if (w === 'normal') return '400';
    if (w === 'bold') return '700';
    return /^[1-9]00$/.test(w) ? w : '';
}

function sanitizeTextTransform(raw) {
    const t = String(raw ?? '').trim().toLowerCase();
    return ['none', 'uppercase', 'capitalize', 'lowercase'].includes(t) ? t : '';
}

function sanitizeTextOutline(raw) {
    const o = String(raw ?? '').trim().toLowerCase();
    if (!o) return '';
    if (['none', 'subtle', 'strong'].includes(o)) return o;
    return sanitizeCssColor(raw);
}

function sanitizeBorderRadius(raw) {
    const v = String(raw ?? '').trim().toLowerCase();
    if (!v) return '';
    if (/^\d+$/.test(v)) return `${Math.min(999, Math.max(0, Number(v)))}px`;
    if (/^\d+(\.\d+)?(px|rem|em|%)$/.test(v)) return v;
    if (v === 'pill' || v === 'full') return '999px';
    if (v === 'sharp' || v === 'none' || v === 'square') return '0px';
    return '';
}

function sanitizeBackdropBlur(raw) {
    const v = String(raw ?? '').trim().toLowerCase();
    if (!v) return '';
    if (v === 'none') return '0px';
    if (/^\d+(\.\d+)?$/.test(v)) {
        const clamped = Math.min(24, Math.max(0, Math.round(Number(v))));
        return `${clamped}px`;
    }
    if (/^\d+(\.\d+)?px$/.test(v)) {
        const clamped = Math.min(24, Math.max(0, Math.round(parseFloat(v))));
        return `${clamped}px`;
    }
    if (/^blur\(\d+(\.\d+)?px\)(\s+saturate\(\d+%\))?$/i.test(v)) return v;
    return '';
}

function sanitizeCustomThemeId(raw) {
    const v = String(raw ?? '').trim().toLowerCase();
    return /^[a-z0-9-_]{1,40}$/.test(v) ? v : '';
}

function normalizeBool(raw, fallback) {
    if (typeof raw === 'boolean') return raw;
    if (raw === 1 || raw === '1' || raw === 'true') return true;
    if (raw === 0 || raw === '0' || raw === 'false') return false;
    return fallback;
}

function normalizeTheme(patch = {}, current = DEFAULT_THEME) {
    const base = Object.assign({}, DEFAULT_THEME, current && typeof current === 'object' ? current : {});
    const src = patch && typeof patch === 'object' ? patch : {};
    const merged = Object.assign({}, base, src);

    merged.layout = ['board', 'sidebar'].includes(merged.layout) ? merged.layout : base.layout;
    const rawStyle = src.style !== undefined ? String(src.style || '').trim().toLowerCase() : String(merged.style || '').trim().toLowerCase();
    merged.style = VALID_THEME_STYLES.has(rawStyle) ? rawStyle : base.style;
    merged.customThemeId = sanitizeCustomThemeId(src.customThemeId !== undefined ? src.customThemeId : merged.customThemeId);

    merged.headingFont = sanitizeFontName(src.headingFont !== undefined ? src.headingFont : merged.headingFont);
    merged.fontFamily = sanitizeFontName(src.fontFamily !== undefined ? src.fontFamily : merged.fontFamily);
    merged.fontWeight = sanitizeFontWeight(src.fontWeight !== undefined ? src.fontWeight : merged.fontWeight);
    const parsedFontScale = Number(src.fontScale !== undefined ? src.fontScale : merged.fontScale);
    merged.fontScale = (Number.isFinite(parsedFontScale) && parsedFontScale > 0)
        ? Math.round(Math.min(2.5, Math.max(0.5, parsedFontScale)) * 100) / 100
        : 1;
    merged.textTransform = sanitizeTextTransform(src.textTransform !== undefined ? src.textTransform : merged.textTransform);
    merged.textOutline = sanitizeTextOutline(src.textOutline !== undefined ? src.textOutline : merged.textOutline);

    merged.backgroundColor = sanitizeCssColor(src.backgroundColor !== undefined ? src.backgroundColor : merged.backgroundColor);
    merged.rowBackgroundColor = sanitizeCssColor(src.rowBackgroundColor !== undefined ? src.rowBackgroundColor : merged.rowBackgroundColor);
    merged.borderColor = sanitizeCssColor(src.borderColor !== undefined ? src.borderColor : merged.borderColor);
    merged.textColor = sanitizeCssColor(src.textColor !== undefined ? src.textColor : merged.textColor);
    merged.mutedColor = sanitizeCssColor(src.mutedColor !== undefined ? src.mutedColor : merged.mutedColor);
    merged.accentColor = sanitizeCssColor(src.accentColor !== undefined ? src.accentColor : merged.accentColor);
    merged.borderRadius = sanitizeBorderRadius(src.borderRadius !== undefined ? src.borderRadius : merged.borderRadius);
    merged.backdropBlur = sanitizeBackdropBlur(src.backdropBlur !== undefined ? src.backdropBlur : merged.backdropBlur);

    merged.hideUnranked = normalizeBool(src.hideUnranked !== undefined ? src.hideUnranked : merged.hideUnranked, Boolean(base.hideUnranked));
    merged.cardSize = ['compact', 'medium', 'large'].includes(merged.cardSize) ? merged.cardSize : base.cardSize;
    merged.cardAspect = ['1/1', '3/4', '16/9'].includes(merged.cardAspect) ? merged.cardAspect : base.cardAspect;
    merged.cardFit = ['cover', 'contain', 'fill', 'natural'].includes(merged.cardFit) ? merged.cardFit : base.cardFit;

    if (src.bannerUrl !== undefined) {
        merged.bannerUrl = sanitizeBannerUrl(src.bannerUrl);
    } else {
        merged.bannerUrl = sanitizeBannerUrl(merged.bannerUrl);
    }
    merged.bannerMode = ['replace', 'behind'].includes(merged.bannerMode) ? merged.bannerMode : base.bannerMode;
    merged.bannerFit = ['cover', 'contain'].includes(merged.bannerFit) ? merged.bannerFit : base.bannerFit;
    const parsedHeight = Math.round(Number(merged.bannerHeight));
    merged.bannerHeight = Number.isFinite(parsedHeight) ? Math.min(240, Math.max(48, parsedHeight)) : 110;

    merged.showCaptions = normalizeBool(src.showCaptions !== undefined ? src.showCaptions : merged.showCaptions, true);
    merged.fitCaptions = normalizeBool(src.fitCaptions !== undefined ? src.fitCaptions : merged.fitCaptions, false);
    merged.autoFit = normalizeBool(src.autoFit !== undefined ? src.autoFit : merged.autoFit, false);

    const rawHowToVote = String(merged.howToVote ?? 'auto').toLowerCase();
    if (rawHowToVote === 'always' || rawHowToVote === 'auto') {
        merged.howToVote = rawHowToVote;
    } else if (['0', 'false', 'none', 'hide'].includes(rawHowToVote)) {
        merged.howToVote = '0';
    } else {
        merged.howToVote = 'auto';
    }

    const rawHintScale = String(merged.hintScale ?? '1').trim();
    const parsedHintScale = parseFloat(rawHintScale);
    if (['0.85', '1', '1.25', '1.5'].includes(rawHintScale)) {
        merged.hintScale = rawHintScale;
    } else if (Number.isFinite(parsedHintScale) && parsedHintScale > 0 && parsedHintScale <= 5) {
        merged.hintScale = String(parsedHintScale);
    } else {
        merged.hintScale = '1';
    }

    merged.sfx = normalizeBool(src.sfx !== undefined ? src.sfx : merged.sfx, true);
    merged.focusEnlarge = normalizeBool(src.focusEnlarge !== undefined ? src.focusEnlarge : merged.focusEnlarge, false);
    merged.followZoom = normalizeBool(src.followZoom !== undefined ? src.followZoom : merged.followZoom, false);
    return merged;
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
        theme: Object.assign({}, DEFAULT_THEME),
        tiers: JSON.parse(JSON.stringify(DEFAULT_TIERS)),
        items: [],
        focusedItemId: null,
        activeVote: null,
        presets: JSON.parse(JSON.stringify(BUILTIN_PRESETS)),
        settings: {
            chatVotingEnabled: true,
            consensusMode: 'weighted_mean',
            subMultiplier: 1,
            allowVoteChange: true,
            autoLockIn: true,
            defaultDuration: 60,
            announceChat: true,
            soundEnabled: true,
            soundVolume: 75,
            showVoteHint: true
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
                        let loadedTheme = parsed.theme;
                        if (
                            loadedTheme.backgroundColor === 'rgba(13, 17, 23, 0.92)' &&
                            loadedTheme.textColor === '#f0f6fc' &&
                            loadedTheme.accentColor === '#3b82f6' &&
                            !loadedTheme.rowBackgroundColor &&
                            !loadedTheme.borderColor &&
                            !loadedTheme.mutedColor &&
                            !loadedTheme.headingFont &&
                            !loadedTheme.fontFamily &&
                            loadedTheme.borderRadius === undefined
                        ) {
                            loadedTheme = Object.assign({}, loadedTheme);
                            delete loadedTheme.backgroundColor;
                            delete loadedTheme.textColor;
                            delete loadedTheme.accentColor;
                        }
                        state.theme = normalizeTheme(loadedTheme, state.theme);
                    }
                    if (parsed.settings && typeof parsed.settings === 'object') {
                        state.settings = Object.assign({}, state.settings, parsed.settings);
                        state.settings.chatVotingEnabled = normalizeBool(parsed.settings.chatVotingEnabled, true);
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
            focusedItemId: state.focusedItemId || null,
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
            state.theme = normalizeTheme(updates.theme, state.theme);
        }
        if (updates.settings && typeof updates.settings === 'object') {
            state.settings = Object.assign({}, state.settings, updates.settings);
            if (updates.settings.chatVotingEnabled !== undefined) {
                state.settings.chatVotingEnabled = normalizeBool(updates.settings.chatVotingEnabled, state.settings.chatVotingEnabled !== false);
            }
            if (updates.settings.soundEnabled !== undefined) {
                state.settings.soundEnabled = normalizeBool(updates.settings.soundEnabled, state.settings.soundEnabled !== false);
                if (updates.theme?.sfx === undefined) {
                    state.theme.sfx = Boolean(state.settings.soundEnabled);
                }
            }
            if (updates.settings.soundVolume !== undefined) {
                const v = Number(updates.settings.soundVolume);
                state.settings.soundVolume = Number.isFinite(v)
                    ? Math.min(100, Math.max(0, Math.round(v)))
                    : 75;
            }
            if (updates.settings.showVoteHint !== undefined) {
                state.settings.showVoteHint = normalizeBool(updates.settings.showVoteHint, state.settings.showVoteHint !== false);
                if (updates.theme?.howToVote === undefined) {
                    if (state.settings.showVoteHint === false) {
                        state.theme.howToVote = '0';
                    } else if (state.theme.howToVote === '0') {
                        state.theme.howToVote = 'auto';
                    }
                }
            }
            if (state.settings.chatVotingEnabled === false && state.activeVote) {
                if (voteTimer) {
                    clearTimeout(voteTimer);
                    voteTimer = null;
                }
                state.activeVote = null;
            }
        }
        if (Array.isArray(updates.tiers)) {
            state.tiers = updates.tiers.map((t, idx) => {
                const entry = {
                    id: t.id || `tier-${idx}`,
                    label: String(t.label || `Tier ${idx + 1}`).trim(),
                    color: String(t.color || '#ff7f7f').trim(),
                    description: String(t.description || '')
                };
                const cleanSound = sanitizeAudioUrl(t.soundUrl);
                if (cleanSound) entry.soundUrl = cleanSound;
                return entry;
            });
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
        if (state.focusedItemId === itemId) {
            state.focusedItemId = null;
        }
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

        if (state.focusedItemId === itemId) {
            state.focusedItemId = null;
        }

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
        state.focusedItemId = null;
        if (state.activeVote) cancelVote();
        save();
        broadcastState('tier-list:update');
        return getPublicState();
    }

    function clearItems() {
        state.items = [];
        state.focusedItemId = null;
        if (state.activeVote) cancelVote();
        save();
        broadcastState('tier-list:update');
        return getPublicState();
    }

    function resetTiers() {
        state.tiers = JSON.parse(JSON.stringify(DEFAULT_TIERS));
        const tierIds = new Set(state.tiers.map(t => t.id));
        state.items.forEach(it => {
            if (it.tierId && !tierIds.has(it.tierId)) {
                it.tierId = null;
            }
        });
        if (state.activeVote) cancelVote();
        save();
        broadcastState('tier-list:update');
        return getPublicState();
    }

    function focusItem(itemId = null) {
        if (!itemId) {
            state.focusedItemId = null;
            broadcastState('tier-list:update');
            return getPublicState();
        }
        const item = state.items.find(i => i.id === itemId);
        if (!item) return null;
        state.focusedItemId = item.id;
        broadcastState('tier-list:update');
        return getPublicState();
    }

    function clearFocus() {
        state.focusedItemId = null;
        broadcastState('tier-list:update');
        return getPublicState();
    }

    // ------------------------------------------------------------------------
    // Chat Voting & Consensus Engine
    // ------------------------------------------------------------------------

    function startVote({
        itemId = null,
        duration = 60,
        consensusMode = null,
        subMultiplier = null
    } = {}) {
        if (state.settings.chatVotingEnabled === false) {
            const err = new Error('Chat voting is disabled in Tier List settings');
            err.statusCode = 409;
            throw err;
        }
        let item = null;
        if (itemId) {
            item = state.items.find(i => i.id === itemId);
        } else {
            // Auto-select first unranked item
            item = state.items.find(i => !i.tierId);
        }
        if (!item) throw new Error('Item not found or no unranked items available');

        if (voteTimer) {
            clearTimeout(voteTimer);
            voteTimer = null;
        }
        state.focusedItemId = null;

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
            autoLockIn: state.settings.autoLockIn !== false,
            votes: {},
            status: 'ACTIVE'
        };

        if (effectiveDuration > 0) {
            voteTimer = setTimeout(() => {
                try {
                    if (state.settings.autoLockIn !== false) {
                        endVote({ applyConsensus: true });
                    } else {
                        lockVote();
                    }
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
        if (state.settings.chatVotingEnabled === false) return false;
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
        if (state.settings.chatVotingEnabled === false) return false;
        if (!state.activeVote || state.activeVote.status !== 'ACTIVE') return false;

        const user = msg.chatname || msg.username || msg.user || '';
        const userId = msg.userId || msg.id || user.toLowerCase();
        if (!userId) return false;

        const text = String(msg.message || msg.text || '').trim();
        if (!text) return false;

        // Ignore bot / announcement messages
        if (/^\[(?:bot|poll|tournament|tier)/i.test(text)) return false;
        if (chatbotAnnouncer?.isBotMessage?.(text)) return false;

        // Support configured chatbot prefix (e.g. '!') or default '!'
        const botPrefix = (chatbotAnnouncer && typeof chatbotAnnouncer.getPrefix === 'function' ? chatbotAnnouncer.getPrefix() : '!') || '!';
        const pfxEscaped = botPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const match = text.match(new RegExp(`^(?:${pfxEscaped}|!)(?:tier|rank)\\s+(.+)$`, 'i'));
        if (!match) return false;

        const rawArg = match[1].trim().toLowerCase();
        if (!rawArg) return false;

        // Clean first token to be resilient against punctuation and extra words (e.g. "S!", "S+!", "S tier", "S - great game")
        const rawFirstWord = rawArg.split(/\s+/)[0].replace(/^[!?,.;:]+|[!?,.;:]+$/g, '');
        const firstToken = rawFirstWord.replace(/[^a-z0-9_-]/gi, '').toLowerCase();

        // Match against tier labels (exact, alias, or index)
        let matchedTier = null;

        // 1. Check numeric index (1-based: e.g. !tier 1 => Tier S)
        const numCandidate = /^\d+$/.test(firstToken) ? firstToken : (/^\d+$/.test(rawArg) ? rawArg : null);
        if (numCandidate) {
            const idx = parseInt(numCandidate, 10) - 1;
            if (idx >= 0 && idx < state.tiers.length) {
                matchedTier = state.tiers[idx];
            }
        }

        // 2. Check exact lowercased label match (full rawArg first, then punctuation-trimmed first word so "S+" / "God Tier" win over stripped "S")
        if (!matchedTier) {
            matchedTier = state.tiers.find(t => t.label.trim().toLowerCase() === rawArg);
        }
        if (!matchedTier && rawFirstWord) {
            matchedTier = state.tiers.find(t => t.label.trim().toLowerCase() === rawFirstWord);
        }
        if (!matchedTier && firstToken) {
            matchedTier = state.tiers.find(t => t.label.trim().toLowerCase() === firstToken);
        }

        // 3. Check partial label prefix if unambiguous (e.g. "mast" => "Masterpiece")
        if (!matchedTier && firstToken && firstToken.length >= 3) {
            matchedTier = state.tiers.find(t => t.label.trim().toLowerCase().startsWith(firstToken));
        }
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

    function lockVote() {
        if (!state.activeVote) return null;
        if (state.activeVote.status === 'LOCKED') return getPublicState();
        if (state.activeVote.status !== 'ACTIVE') return null;

        if (voteTimer) {
            clearTimeout(voteTimer);
            voteTimer = null;
        }
        state.focusedItemId = null;

        state.activeVote.status = 'LOCKED';
        state.activeVote.endsAt = Date.now();
        const consensus = calculateConsensus(state.activeVote, state.tiers);

        broadcastState('tier-list:vote-locked', {
            vote: Object.assign({}, state.activeVote, { consensus })
        });

        log(`[TierList] Voting locked for "${state.activeVote.itemName}". Voting closed, awaiting streamer Lock & Place.`);
        return getPublicState();
    }

    function endVote({ applyConsensus = true } = {}) {
        if (!state.activeVote) return null;

        if (voteTimer) {
            clearTimeout(voteTimer);
            voteTimer = null;
        }
        state.focusedItemId = null;

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
                consensusTier: placedInTier || consensus?.consensusTier,
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
        state.focusedItemId = null;

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
            state.theme = normalizeTheme(preset.theme, state.theme);
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

    function tierListAssetUsers(name, assetReferencedIn) {
        const users = [];
        const isRef = (val) => {
            if (!val || typeof val !== 'string') return false;
            if (typeof assetReferencedIn === 'function') {
                if (assetReferencedIn(val, name, null)) return true;
            }
            const clean = val.split('?')[0];
            const decodedName = decodeURIComponent(name);
            const encodedName = encodeURIComponent(name);
            if (clean.includes(`/custom-overlay-assets/${encodedName}`) || clean.includes(`/custom-overlay-assets/${name}`) || clean.includes(`/custom-overlay-assets/${decodedName}`)) return true;
            if (clean === name || clean === decodedName || clean.endsWith(`/${name}`) || clean.endsWith(`/${decodedName}`)) return true;
            return false;
        };
        if (state.theme?.bannerUrl && isRef(state.theme.bannerUrl)) {
            users.push({
                id: 'tier-list:banner',
                name: 'Tier List: Custom Banner'
            });
        }
        const isFontFile = /\.(ttf|otf|woff2?)$/i.test(String(name || ''));
        const matchesFont = (fontVal) => {
            if (!isFontFile || !fontVal || typeof fontVal !== 'string') return false;
            const norm = fontVal.trim().toLowerCase();
            if (!norm) return false;
            const baseNoExt = decodeURIComponent(String(name || '')).replace(/\.[a-z0-9]+$/i, '').trim();
            const familySpace = baseNoExt.replace(/[^a-zA-Z0-9 _-]+/g, '').replace(/[-_]+/g, ' ').trim().toLowerCase();
            const rawLower = baseNoExt.toLowerCase();
            return norm === rawLower || (familySpace && norm === familySpace);
        };
        if (matchesFont(state.theme?.headingFont) || matchesFont(state.theme?.fontFamily)) {
            users.push({
                id: 'tier-list:font',
                name: 'Tier List: Custom Font'
            });
        }
        for (const tier of state.tiers || []) {
            if (tier.soundUrl && isRef(tier.soundUrl)) {
                users.push({
                    id: `tier-list:tier-sound:${tier.id}`,
                    name: `Tier List (${tier.label || 'Tier'}): Sound`
                });
            }
        }
        for (const item of state.items || []) {
            if (isRef(item.imageUrl)) {
                users.push({
                    id: `tier-list:item:${item.id}`,
                    name: `Tier List: ${item.name || 'Item'}`
                });
            }
        }
        for (const preset of state.presets || []) {
            if (preset.theme?.bannerUrl && isRef(preset.theme.bannerUrl)) {
                users.push({
                    id: `tier-list:preset-banner:${preset.id}`,
                    name: `Tier List (${preset.name || 'Preset'}): Banner`
                });
            }
            if (matchesFont(preset.theme?.headingFont) || matchesFont(preset.theme?.fontFamily)) {
                users.push({
                    id: `tier-list:preset-font:${preset.id}`,
                    name: `Tier List (${preset.name || 'Preset'}): Custom Font`
                });
            }
            for (const tier of preset.tiers || []) {
                if (tier.soundUrl && isRef(tier.soundUrl)) {
                    users.push({
                        id: `tier-list:preset-sound:${preset.id}:${tier.id || tier.label}`,
                        name: `Tier List (${preset.name || 'Preset'} ${tier.label || 'Tier'}): Sound`
                    });
                }
            }
            for (const item of preset.items || []) {
                if (isRef(item.imageUrl)) {
                    users.push({
                        id: `tier-list:preset:${preset.id}:${item.id || item.name}`,
                        name: `Tier List (${preset.name || 'Preset'}): ${item.name || 'Item'}`
                    });
                }
            }
        }
        return users;
    }

    function rewriteTierListReferences(oldName, newName, rewriteAssetReferences) {
        let changed = false;
        const rewriteStr = (val) => {
            if (!val || typeof val !== 'string') return val;
            let next = val;
            if (typeof rewriteAssetReferences === 'function') {
                next = rewriteAssetReferences(val, oldName, newName, null, null);
            }
            if (next === val) {
                for (const [from, to] of [
                    [encodeURIComponent(oldName), encodeURIComponent(newName)],
                    [oldName, newName],
                    [decodeURIComponent(oldName), decodeURIComponent(newName)]
                ]) {
                    if (next.includes(from)) {
                        next = next.split(from).join(to);
                    }
                }
            }
            return next;
        };

        if (state.theme?.bannerUrl) {
            const next = rewriteStr(state.theme.bannerUrl);
            if (next !== state.theme.bannerUrl) {
                state.theme.bannerUrl = next;
                changed = true;
            }
        }
        for (const tier of state.tiers || []) {
            if (!tier.soundUrl) continue;
            const next = rewriteStr(tier.soundUrl);
            if (next !== tier.soundUrl) {
                tier.soundUrl = next;
                changed = true;
            }
        }
        for (const item of state.items || []) {
            if (!item.imageUrl) continue;
            const next = rewriteStr(item.imageUrl);
            if (next !== item.imageUrl) {
                item.imageUrl = next;
                changed = true;
            }
        }
        if (state.activeVote && state.activeVote.itemImage) {
            const next = rewriteStr(state.activeVote.itemImage);
            if (next !== state.activeVote.itemImage) {
                state.activeVote.itemImage = next;
                changed = true;
            }
        }
        for (const preset of state.presets || []) {
            if (preset.theme?.bannerUrl) {
                const next = rewriteStr(preset.theme.bannerUrl);
                if (next !== preset.theme.bannerUrl) {
                    preset.theme.bannerUrl = next;
                    changed = true;
                }
            }
            for (const tier of preset.tiers || []) {
                if (!tier.soundUrl) continue;
                const next = rewriteStr(tier.soundUrl);
                if (next !== tier.soundUrl) {
                    tier.soundUrl = next;
                    changed = true;
                }
            }
            for (const item of preset.items || []) {
                if (!item.imageUrl) continue;
                const next = rewriteStr(item.imageUrl);
                if (next !== item.imageUrl) {
                    item.imageUrl = next;
                    changed = true;
                }
            }
        }
        if (changed) {
            save();
            broadcastState('tier-list:update');
        }
        return changed;
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
        resetTiers,
        focusItem,
        clearFocus,
        startVote,
        castVote,
        handleChatMessage,
        endVote,
        lockVote,
        cancelVote,
        calculateConsensus: (v, t) => calculateConsensus(v, t || state.tiers),
        savePreset,
        loadPreset,
        deletePreset,
        resetPresets,
        tierListAssetUsers,
        rewriteTierListReferences
    };
}

module.exports = {
    createTierListService,
    calculateConsensus,
    DEFAULT_TIERS,
    BUILTIN_PRESETS
};

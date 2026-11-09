/**
 * StreamPulse — Alerts Studio State & Utilities
 */

export const $ = id => document.getElementById(id);
export const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const ICONS = {
    save: '<svg class="ico" viewBox="0 0 24 24"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>',
    plus: '<svg class="ico" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
    stop: '<svg class="ico" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>',
    play: '<svg class="ico" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>',
    pause: '<svg class="ico" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>',
    skip: '<svg class="ico" viewBox="0 0 24 24"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/></svg>',
    refresh: '<svg class="ico" viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>',
    trash: '<svg class="ico" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
    copy: '<svg class="ico" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
    search: '<svg class="ico" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
    check: '<svg class="ico" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>',
    close: '<svg class="ico" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    external: '<svg class="ico" viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>',
    sliders: '<svg class="ico" viewBox="0 0 24 24"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>',
    list: '<svg class="ico" viewBox="0 0 24 24"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>',
    zap: '<svg class="ico" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
    info: '<svg class="ico" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
    upload: '<svg class="ico" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
    folder: '<svg class="ico" viewBox="0 0 24 24"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
    volume: '<svg class="ico" viewBox="0 0 24 24"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>',
    image: '<svg class="ico" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>',
    video: '<svg class="ico" viewBox="0 0 24 24"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>',
    type: '<svg class="ico" viewBox="0 0 24 24"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>',
    clock: '<svg class="ico" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
    smile: '<svg class="ico" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>',
    heart: '<svg class="ico" viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>',
    star: '<svg class="ico" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
    gift: '<svg class="ico" viewBox="0 0 24 24"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>',
    diamond: '<svg class="ico" viewBox="0 0 24 24"><polygon points="6 3 18 3 22 9 12 22 2 9"/></svg>',
    dollar: '<svg class="ico" viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
    users: '<svg class="ico" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    tag: '<svg class="ico" viewBox="0 0 24 24"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>',
    trophy: '<svg class="ico" viewBox="0 0 24 24"><path d="M6 9H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h2"/><path d="M18 9h2a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-2"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.45 1-1 1H7v4h10v-4h-2c-.55 0-1-.45-1-1v-2.34"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2z"/></svg>',
    message: '<svg class="ico" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
    sparkles: '<svg class="ico" viewBox="0 0 24 24"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>',
    command: '<svg class="ico" viewBox="0 0 24 24"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>',
    poll: '<svg class="ico" viewBox="0 0 24 24"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
    chevronDown: '<svg class="ico" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>',
    arrowRight: '<svg class="ico" viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>',
    flag: '<svg class="ico" viewBox="0 0 24 24"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>',
    layers: '<svg class="ico" viewBox="0 0 24 24"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>',
    warn: '<svg class="ico" viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
};

export const TRIGGERS = {
    follow: 'Follow',
    sub: 'New subscriber',
    resub: 'Resub',
    milestone: 'Sub milestone / anniversary',
    gift: 'Gifted subs',
    bits: 'Bits',
    donation: 'Donation',
    raid: 'Raid',
    redeem: 'Channel point redeem',
    timer: 'Timer finished',
    goal: 'Goal reached',
    chat_word: 'Chat word or hashtag',
    chat_command: 'Chat bot command',
    poll_end: 'Poll completed / winner',
    hype_train: 'Hype train',
    announcement: 'Announcement (manual only)'
};

export const TRIGGER_META = {
    follow: { label: 'Follow', icon: ICONS.heart, color: '#f43f5e' },
    sub: { label: 'New Subscriber', icon: ICONS.star, color: '#a855f7' },
    resub: { label: 'Resub', icon: ICONS.sparkles, color: '#c084fc' },
    milestone: { label: 'Sub Anniversary', icon: ICONS.trophy, color: '#eab308' },
    gift: { label: 'Gifted Subs', icon: ICONS.gift, color: '#ec4899' },
    bits: { label: 'Cheer / Bits', icon: ICONS.diamond, color: '#06b6d4' },
    donation: { label: 'Donation', icon: ICONS.dollar, color: '#10b981' },
    raid: { label: 'Raid', icon: ICONS.users, color: '#f97316' },
    redeem: { label: 'Channel Points', icon: ICONS.tag, color: '#8b5cf6' },
    timer: { label: 'Timer Finished', icon: ICONS.clock, color: '#38bdf8' },
    goal: { label: 'Goal Reached', icon: ICONS.trophy, color: '#fbbf24' },
    chat_word: { label: 'Chat Word / #Tag', icon: ICONS.message, color: '#a3e635' },
    chat_command: { label: 'Chat Command', icon: ICONS.command, color: '#0ea5e9' },
    announcement: { label: 'Announcement', icon: ICONS.flag, color: '#f59e0b' },
    poll_end: { label: 'Poll Winner', icon: ICONS.poll, color: '#10b981' },
    hype_train: { label: 'Hype Train', icon: ICONS.zap, color: '#f59e0b' }
};

export const ANIM_IN = ['pop', 'fade', 'zoom', 'bounce', 'flip', 'spin', 'slide-left', 'slide-right', 'slide-up', 'slide-down', 'none'];
export const ANIM_OUT = ['fade', 'pop', 'zoom', 'slide-left', 'slide-right', 'slide-up', 'slide-down', 'none'];
export const AMOUNT_LABEL = { bits: 'Bits', donation: 'Amount', raid: 'Viewers', gift: 'Number of gifts', sub: 'Months', resub: 'Months', poll_end: 'Winning votes', hype_train: 'Hype train level' };
export const HAS_METRIC = ['sub', 'resub', 'gift', 'bits', 'donation', 'raid', 'milestone', 'hype_train'];

export const TOKENS = {
    follow: ['user'], sub: ['user', 'tier'], resub: ['user', 'months', 'streak', 'tier', 'message'], milestone: ['user', 'months', 'streak', 'tier'],
    gift: ['user', 'count', 'recipient', 'tier'], bits: ['user', 'amount', 'message'], donation: ['user', 'amount', 'currency', 'source', 'message'], raid: ['user', 'viewers'],
    redeem: ['user', 'reward', 'amount'], timer: ['name'], goal: ['name', 'amount'], chat_word: ['user', 'keyword', 'message'],
    chat_command: ['user', 'command', 'target', 'args', 'message'],
    poll_end: ['winner', 'poll_title', 'votes', 'percent', 'total_votes', 'user'],
    hype_train: ['level', 'user', 'total', 'goal', 'minutes']
};

export const DEFAULT_TITLE = {
    follow: '{{alert.user}} just followed!', sub: '{{alert.user}} subscribed!', resub: '{{alert.user}} resubscribed for {{alert.months}} months!',
    milestone: '{{alert.user}} — {{alert.months}} months!', gift: '{{alert.user}} gifted {{alert.count}} subs!', bits: '{{alert.user}} cheered {{alert.amount}} bits!',
    donation: '{{alert.user}} donated {{alert.amount}}!', raid: '{{alert.user}} is raiding with {{alert.viewers}}!', redeem: '{{alert.user}} redeemed {{alert.reward}}',
    timer: '{{alert.name}} is done!', goal: 'Goal reached: {{alert.name}}', chat_word: '{{alert.user}} said {{alert.keyword}}',
    chat_command: '!{{alert.command}} used by {{alert.user}}!',
    poll_end: 'Poll Winner: {{alert.winner}}!',
    hype_train: 'Hype train level {{alert.level}}!'
};

export const DEFAULT_CHEERMOTES = [
    { min: 1, name: 'Cheer1', url: 'https://d3aqoihi2n8ty8.cloudfront.net/actions/cheer/dark/animated/1/4.gif', color: '#979797' },
    { min: 100, name: 'Cheer100', url: 'https://d3aqoihi2n8ty8.cloudfront.net/actions/cheer/dark/animated/100/4.gif', color: '#9c3ee8' },
    { min: 500, name: 'Cheer500', url: 'https://d3aqoihi2n8ty8.cloudfront.net/actions/cheer/dark/animated/500/4.gif', color: '#1db2a5' },
    { min: 1000, name: 'Cheer1000', url: 'https://d3aqoihi2n8ty8.cloudfront.net/actions/cheer/dark/animated/1000/4.gif', color: '#0099fe' },
    { min: 5000, name: 'Cheer5000', url: 'https://d3aqoihi2n8ty8.cloudfront.net/actions/cheer/dark/animated/5000/4.gif', color: '#f430ff' },
    { min: 10000, name: 'Cheer10000', url: 'https://d3aqoihi2n8ty8.cloudfront.net/actions/cheer/dark/animated/10000/4.gif', color: '#e005b9' },
    { min: 100000, name: 'Cheer100000', url: 'https://d3aqoihi2n8ty8.cloudfront.net/actions/cheer/dark/animated/100000/4.gif', color: '#f64747' }
];

export const SAMPLE_TOKENS = {
    user: 'TestViewer', amount: 500, months: 12, streak: 6, tier: 'Tier 1', count: 5, recipient: 'LuckyViewer',
    viewers: 42, reward: 'Hydrate', message: 'Thanks for the stream!', currency: 'USD', source: 'tiltify', name: 'Goal',
    keyword: 'gg', command: 'hype', target: 'Friend', args: '', winner: 'Option A', level: 3, total: 1800, goal: 2400,
    minutes: 5, poll_title: 'Poll', votes: 120, percent: 60, total_votes: 200
};

export const SND_GROUPS = ['Celebration', 'Hype', 'Impact', 'Cheer/Crowd', 'Chime/Bell', 'Retro', 'Synth'];
export const SND_MAP = { Arcade: 'Retro', Chimes: 'Chime/Bell', 'Modern UI': 'Synth', Other: 'Synth' };
export const SFX_MAP = { celebration: 'Celebration', hype: 'Hype', impact: 'Impact', chime: 'Chime/Bell', retro: 'Retro', cheer: 'Cheer/Crowd', crowd: 'Cheer/Crowd', synth: 'Synth' };

export const ANN_DEFAULTS = [
    ['BRB in 5 minutes', 'Be right back in 5 minutes'],
    ['Starting soon', 'Stream starting soon'],
    ['Back from break', 'We are back!'],
    ['Technical difficulties', 'Technical difficulties, please stand by'],
    ['Thanks for watching', 'Thanks for watching, see you next time!']
];

export const SIM_PRESETS = {
    'follow': { type: 'follow', user: 'AlexStreams', amount: 0, text: '' },
    'sub': { type: 'sub', user: 'SamGamer', amount: 1, tier: '1000', text: 'Hype stream!' },
    'resub-prime': { type: 'resub', user: 'Jordan', amount: 6, tier: 'prime', text: '6 months strong with Prime!' },
    'bits-100': { type: 'bits', user: 'CheerMaster', amount: 100, text: 'cheer100 great gameplay!' },
    'bits-1000': { type: 'bits', user: 'BigSpender', amount: 1000, text: 'cheer1000 GG!' },
    'raid': { type: 'raid', user: 'RaidLeader', amount: 42, text: '' },
    'gift': { type: 'gift', user: 'GenerousDonor', recipient: 'LuckyViewer', amount: 5, tier: '1000', text: '' },
    'chat-command': { type: 'chat_command', user: 'CoolChatter', amount: 0, text: '!hype let\'s go team!' }
};

// State
export let cfg = { settings: { enabled: true, gapSeconds: 2 }, rules: [] };
export const setCfg = newCfg => { cfg = newCfg; };

export let sel = null;
export const setSel = newSel => { sel = newSel; };

export let dirty = false;
export const setDirty = value => {
    dirty = value;
    const saveState = $('save-state');
    if (saveState) {
        saveState.textContent = dirty ? 'Unsaved changes' : 'Saved';
        saveState.classList.toggle('dirty', dirty);
        saveState.classList.toggle('ok', !dirty);
    }
};

let openVid = localStorage.getItem('alerts.openVariant') || '';
export const openVariants = {
    has: id => id === openVid,
    add: id => { openVid = id; localStorage.setItem('alerts.openVariant', id); },
    delete: id => { if (openVid === id) { openVid = ''; localStorage.setItem('alerts.openVariant', ''); } }
};

export const showThumbs = () => localStorage.getItem('alerts.thumbs') !== '0';
export let hideUnmatched = localStorage.getItem('alerts.hideUnmatched') === '1';
export const setHideUnmatched = val => { hideUnmatched = val; };

export let assets = [];
export const setAssets = a => { assets = a; };

export let timers = [];
export const setTimers = t => { timers = t; };

export let goals = [];
export const setGoals = g => { goals = g; };

export let queue = {};
export const setQueue = q => { queue = q; };

export let ruleSearchQuery = localStorage.getItem('alerts.search') || '';
export const setRuleSearchQuery = q => { ruleSearchQuery = q; };

export let activeTriggerFilter = localStorage.getItem('alerts.filterTrigger') || '';
export const setActiveTriggerFilter = f => { activeTriggerFilter = f; };

export let activeStateFilter = localStorage.getItem('alerts.filterState') || '';
export const setActiveStateFilter = f => { activeStateFilter = f; };

export const filtering = () => !!(ruleSearchQuery.trim() || activeTriggerFilter || activeStateFilter);

export let lastFocusedInput = null;
export const setLastFocusedInput = el => { lastFocusedInput = el; };

export let channelEmotes = [];
export let twitchCheermotes = [];
export let cheermoteFamilies = {};
export let customCheermotes = [];
export let hostSources = [];
export let liveStatus = {};
export const setLiveStatus = s => { liveStatus = s; };

export const lookByRule = {};
export const rewardList = { rewards: [], loading: false, error: '', loaded: false };
export let SFX_GROUPS = [];
export const setSfxGroups = g => { SFX_GROUPS = g; };

export let testAmount = 0;
export const setTestAmount = a => { testAmount = a; };

export const variantTab = new Map();
export const variantMedia = new Map();

export const loadPresets = () => {
    try {
        const v = JSON.parse(localStorage.getItem('alerts.annPresets'));
        if (Array.isArray(v)) return v;
    } catch {}
    return ANN_DEFAULTS.slice();
};
export let ANN_PRESETS = loadPresets();
export const setAnnPresets = p => { ANN_PRESETS = p; };

// Helper functions
export const toast = (message, err) => {
    const t = $('toast');
    if (!t) return;
    t.textContent = message;
    t.className = err ? 'err' : '';
    t.style.display = 'block';
    clearTimeout(toast.t);
    toast.t = setTimeout(() => { t.style.display = 'none'; }, 2600);
};

export const rule = () => cfg.rules.find(r => r.id === sel);

export const newVariant = (trigger, role = 'weighted', defaultMin = 0) => ({
    id: `v${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
    variantType: role === 'milestone' || defaultMin > 0 ? 'gated' : 'weighted',
    gateMin: defaultMin,
    gateMinOp: 'gte',
    gateMax: 0,
    gateMaxOp: 'lte',
    title: DEFAULT_TITLE[trigger] || '',
    message: '',
    image: '',
    video: '',
    videoSound: false,
    videoVolume: 70,
    videoLoop: true,
    emoji: '',
    emojiUrl: '',
    emoteEffect: 'showcase',
    emoteDensity: 30,
    emoteScale: 100,
    emojiLadder: [],
    emojiEvery: 0,
    emojiMax: 8,
    ...(trigger === 'bits' ? { emoteSource: 'viewer', cheermoteFamily: 'auto' } : {}),
    sound: '',
    volume: 70,
    animIn: 'pop',
    animOut: 'fade',
    duration: 6,
    weight: 1
});

export const blankRule = (trigger, id) => ({
    id: id || `rule-${Date.now().toString(36)}`,
    name: TRIGGERS[trigger] || 'New alert',
    trigger,
    enabled: true,
    priority: 'normal',
    conditions: { minAmount: 0, maxAmount: 0, exactAmount: 0, amountMode: 'min', tier: '', tiers: [], rewardName: '', rewardIds: [], source: 'any', cooldownSeconds: 0, command: '', permission: 'everyone' },
    actions: { timer: { enabled: false, action: 'start', timerId: '' }, http: { enabled: false, url: '', method: 'POST', delaySeconds: 0 }, chat: { enabled: false, message: '', cooldownSeconds: 30 }, companion: { enabled: false, page: 1, row: 0, col: 0 } },
    variants: [newVariant(trigger)]
});

export const setPath = (obj, path, value) => {
    const keys = path.split('.');
    const last = keys.pop();
    keys.reduce((o, k) => o[k], obj)[last] = value;
};

export async function api(url, options) {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
    return data;
}

export const guard = fn => async (...args) => {
    try {
        await fn(...args);
    } catch (err) {
        toast(err.message, true);
    }
};

export const persistFilters = () => {
    localStorage.setItem('alerts.search', ruleSearchQuery);
    localStorage.setItem('alerts.filterTrigger', activeTriggerFilter);
    localStorage.setItem('alerts.filterState', activeStateFilter);
};

export function sourceOptions(current) {
    const list = [['any', 'Any source'], ['socialstream', 'SocialStream'], ...hostSources.map(s => [s.id, s.label])];
    if (current && !list.some(([id]) => id === current)) list.push([current, current === 'external' ? 'Other integrations' : `${current} (not connected)`]);
    return list;
}

export const isSfx = v => /^sfx:/.test(String(v.sound || ''));
export const builtinName = v => (String(v.sound || '').startsWith('builtin:') ? v.sound.slice(8) : '');

export function soundCatalog() {
    const out = [];
    for (const g of SFX_GROUPS) {
        for (const s of g.sounds) {
            out.push({ value: `sfx:${g.id}/${s.id}`, label: s.label, group: SFX_MAP[g.id] || g.label });
        }
    }
    const BUILTIN = window.OverlayShared?.BUILTIN_SOUNDS || {};
    for (const [key, def] of Object.entries(BUILTIN)) {
        out.push({ value: `builtin:${key}`, label: def.label, group: SND_MAP[def.group] || def.group || 'Synth' });
    }
    return out;
}

export const sndName = val => (soundCatalog().find(s => s.value === val) || {}).label || String(val).replace(/^(builtin:|sfx:)/, '').replace(/^[^/]*\//, '').replace(/_/g, ' ');

export function amountMode(c) {
    if (c.amountMode) return c.amountMode;
    if (c.exactAmount) return 'exact';
    if (c.minAmount && c.maxAmount && c.minAmount === c.maxAmount) return 'exact';
    if (c.minAmount && c.maxAmount) return 'range';
    return 'min';
}

export function amountText(c) {
    const mode = amountMode(c);
    if (mode === 'exact') return `= ${c.exactAmount ?? c.minAmount ?? 0}`;
    if (mode === 'range') return `${c.minAmount || 0} - ${c.maxAmount || 0}`;
    return c.minAmount ? `&ge; ${c.minAmount}` : '';
}

export function variantGateMode(v) {
    if (v.gateMode) return v.gateMode;
    if (v.gateMin && v.gateMax && v.gateMin === v.gateMax) return 'exact';
    if (v.gateMin && v.gateMax) return 'range';
    return 'min';
}

export const mediaKind = v => v.video ? 'Video' : v.image ? 'Image' : (v.emoji || v.emojiUrl || v.emojiLadder?.length) ? 'Emote' : '';

export const soundLabel = v => {
    const n = builtinName(v);
    if (isSfx(v)) {
        const [g, id] = v.sound.slice(4).split('/');
        return SFX_GROUPS.find(x => x.id === g)?.sounds.find(x => x.id === id)?.label || id;
    }
    const BUILTIN = window.OverlayShared?.BUILTIN_SOUNDS;
    return n ? (BUILTIN?.[n]?.label || n) : v.sound ? decodeURIComponent(String(v.sound).split('/').pop()) : '';
};

export const normRule = (raw, newIds) => {
    const trigger = TRIGGERS[raw.trigger] ? raw.trigger : 'follow';
    const base = blankRule(trigger, newIds ? `rule-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}` : String(raw.id || `rule-${Date.now().toString(36)}`));
    const out = { ...base, ...raw, trigger, id: base.id, name: String(raw.name || base.name).slice(0, 80) };
    out.conditions = { ...base.conditions, ...(raw.conditions || {}) };
    out.actions = { timer: { ...base.actions.timer, ...(raw.actions?.timer || {}) }, http: { ...base.actions.http, ...(raw.actions?.http || {}) }, chat: { ...base.actions.chat, ...(raw.actions?.chat || {}) }, companion: { ...base.actions.companion, ...(raw.actions?.companion || {}) } };
    out.variants = (Array.isArray(raw.variants) && raw.variants.length ? raw.variants : [{}]).map(v => {
        const nv = { ...newVariant(trigger), ...v };
        if (newIds || !v.id) nv.id = `v${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        return nv;
    });
    return out;
};

// Async data loaders
export async function loadChannelEmotes() {
    try {
        const data = await api('/api/channel-emotes');
        channelEmotes = Array.isArray(data.emotes) ? data.emotes : [];
        twitchCheermotes = Array.isArray(data.cheermotes) ? data.cheermotes : DEFAULT_CHEERMOTES;
        cheermoteFamilies = (data.families && typeof data.families === 'object') ? data.families : {};
        customCheermotes = Array.isArray(data.customCheermotes) ? data.customCheermotes : [];
    } catch {
        channelEmotes = [];
        twitchCheermotes = DEFAULT_CHEERMOTES;
        cheermoteFamilies = {};
        customCheermotes = [];
    }
}

export async function loadAssets() {
    try {
        assets = await api('/api/custom-overlays/assets');
    } catch {
        assets = [];
    }
}

export function loadRewards(onDone) {
    if (rewardList.loaded || rewardList.loading) return;
    rewardList.loading = true;
    fetch('/api/twitch/rewards')
        .then(x => x.json())
        .then(d => { rewardList.rewards = d.rewards || []; rewardList.error = d.error || ''; })
        .catch(err => { rewardList.error = err.message; })
        .finally(() => {
            rewardList.loading = false;
            rewardList.loaded = true;
            if (onDone) onDone();
        });
}

export async function testRewardOverrides(r) {
    if (r.trigger !== 'redeem') return {};
    if (!rewardList.loaded && !rewardList.loading) {
        await new Promise(resolve => {
            loadRewards(() => resolve());
            const timer = setInterval(() => {
                if (rewardList.loaded) { clearInterval(timer); resolve(); }
            }, 50);
        });
    }
    const rewardId = r.conditions.rewardIds?.[0];
    const reward = rewardList.rewards.find(item => item.id === rewardId);
    return { rewardId, reward: reward?.title || r.conditions.rewardName || 'Test reward' };
}

export const pollStatus = () => fetch('/api/status').then(r => r.json()).then(d => { liveStatus = d; }).catch(() => {});

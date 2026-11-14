/**
 * StreamPulse — Game Plan State & Helpers Module
 */

export const $ = id => document.getElementById(id);

export const ICONS = {
    play: '<svg class="ico" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="6 4 20 12 6 20 6 4"/></svg>',
    stop: '<svg class="ico" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="6" y="6" width="12" height="12" rx="1.5"/></svg>',
    next: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 4 15 12 5 20 5 4" fill="currentColor"/><line x1="19" y1="5" x2="19" y2="19"/></svg>',
    calendar: '<svg class="ico" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
    clock: '<svg class="ico" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 15"/></svg>',
    star: '<svg class="ico" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
    edit: '<svg class="ico" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>',
    sync: '<svg class="ico" viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>',
    check: '<svg class="ico" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>',
    game: '<svg class="ico" viewBox="0 0 24 24"><rect x="2" y="6" width="20" height="12" rx="3"/><path d="M6 12h4m-2-2v4"/><circle cx="15" cy="11" r="1" fill="currentColor"/><circle cx="18" cy="13" r="1" fill="currentColor"/></svg>',
    image: '<svg class="ico" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>',
    tv: '<svg class="ico" viewBox="0 0 24 24"><rect x="2" y="7" width="20" height="15" rx="2"/><polyline points="17 2 12 7 7 2"/></svg>',
    search: '<svg class="ico" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
    undo: '<svg class="ico" viewBox="0 0 24 24"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>',
    folder: '<svg class="ico" viewBox="0 0 24 24"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
    tag: '<svg class="ico" viewBox="0 0 24 24"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>',
    copy: '<svg class="ico" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
    trash: '<svg class="ico" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
    more: '<svg class="ico" viewBox="0 0 24 24"><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="19" cy="12" r="1.5" fill="currentColor"/><circle cx="5" cy="12" r="1.5" fill="currentColor"/></svg>',
    chevronDown: '<svg class="ico" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>',
    chevronUp: '<svg class="ico" viewBox="0 0 24 24"><polyline points="18 15 12 9 6 15"/></svg>',
    close: '<svg class="ico" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
};

export const BUILTIN = [
    { id: 'tonight', name: "Tonight's Lineup", empty: "No games on tonight's lineup. Drag games here or click 'Tonight' from Schedule or Up Next." },
    { id: 'scheduled', name: 'Schedule', empty: "No upcoming games scheduled. Plan dates and games here, or sync them to Twitch." },
    { id: 'up-next', name: 'Up Next', empty: "Games you are looking forward to playing soon." },
    { id: 'backlog', name: 'Backlog', empty: 'Games in your backlog, to play eventually.' },
    { id: 'played', name: 'Played', empty: 'Finished & streamed games archive.' }
];

export const UI_STORAGE_KEY = 'sp_game_plan_ui';

export const TIER_COLORS = ['#ff7f7f', '#ffbf7f', '#ffdf7f', '#bfff7f', '#7fbfff', '#bf9fff', '#ff9fd0', '#7fffd4'];
export const DEFAULT_TIERS = ['S', 'A', 'B', 'C', 'D', 'F'].map((id, index) => ({ id, label: id, color: TIER_COLORS[index] }));
export const HORIZON_PERIODS = ['This Week', 'Next Week', 'This Month', 'Next Month', 'Future', 'Distant Future'];

// Reactive State Container
export const state = {
    customLists: [],
    tiers: [],
    tierSets: {},
    view: 'list',
    calMode: 'month',
    filtersOpen: false,
    collectionsOpen: false,
    collectionSearch: '',
    calMonthOffset: 0,
    calWeekOffset: 0,
    calPickDate: '',
    calDuplicateSource: null,
    boardSortables: [],
    periodOrder: [],
    periodSortable: null,
    items: [],
    selectedIds: new Set(),
    active: 'tonight',
    editing: null,
    saveTimer: null,
    polls: 0,
    sortable: null,
    viewState: { sort: 'manual', when: '', system: '', month: '', from: '', to: '', search: '', period: '' }
};

export const isTonightItem = item => Boolean(item?.tonight || item?.status === 'tonight');
export const homeListId = item => {
    if (!item) return 'up-next';
    if (item.status && item.status !== 'tonight') return item.status;
    return (item.streamDate || (Array.isArray(item.streamDates) && item.streamDates.some(d => d && d.date))) ? 'scheduled' : 'up-next';
};
export const inList = (item, id) => (id === 'tonight' ? isTonightItem(item) : (item.status === id || (item.extraLists || []).includes(id)));
export const tiersOf = listId => state.tierSets[listId] || state.tiers;
export const ownTiers = listId => (state.tierSets[listId] ||= state.tiers.map(entry => ({ ...entry })));
export const allLists = () => [...BUILTIN, ...state.customLists.map(list => ({ ...list, custom: true, empty: 'Drag games here, or add one above' }))];
export const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
export const uid = () => `game-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
export const setStatus = text => { const s = $('status'); if (s) s.textContent = text; };
export const listName = id => allLists().find(list => list.id === id)?.name || id;
const STAR_SVG = `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" stroke="none" style="pointer-events:none;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`;
export const starsHtml = (value, attr) => [1, 2, 3, 4, 5].map(n => `<button type="button" ${attr}="${n}" class="${n <= value ? 'on' : value === n - 0.5 ? 'half' : ''}" aria-label="${n} stars (click the left half for ${n - 0.5})">${STAR_SVG}</button>`).join('');
export const starValue = (event, star, attr) => { const n = Number(star.dataset[attr]); const box = star.getBoundingClientRect(); return event.clientX - box.left < box.width / 2 ? n - 0.5 : n; };
export const prettyDate = value => new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

export function seenLine(item) {
    const dates = item.played || [];
    const mins = item.minutesPlayed || 0;
    const time = mins > 0 ? `${mins >= 60 ? `${Math.floor(mins / 60)}h ` : ''}${mins % 60 ? `${mins % 60}m ` : ''}streamed`.trim() : '';
    if (!dates.length) return time;
    const first = prettyDate(dates[0]), last = prettyDate(dates[dates.length - 1]);
    return [first === last ? `Streamed ${first}` : `First ${first} · Last ${last}`, time].filter(Boolean).join(' · ');
}

export const systemsOf = item => (item.system ? [item.system] : (item.platforms || []));
export const localDay = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export const itemBlock = item => (item.period && item.period !== 'Tonight') ? item.period : '';

export const orderedPeriods = () => {
    const used = [...new Set(state.items.map(itemBlock).filter(Boolean))];
    const cleanOrder = state.periodOrder.filter(name => name && name !== 'Tonight');
    return [...new Set([...cleanOrder, ...used])];
};

export function matchesSearch(item, q) {
    if (!q) return true;
    const needle = q.toLowerCase();
    return (item.name || '').toLowerCase().includes(needle)
        || itemBlock(item).toLowerCase().includes(needle)
        || (item.note || '').toLowerCase().includes(needle)
        || (item.twitchCategory || '').toLowerCase().includes(needle)
        || (item.system || '').toLowerCase().includes(needle)
        || (item.tags || []).some(t => t.toLowerCase().includes(needle))
        || (item.platforms || []).some(p => p.toLowerCase().includes(needle));
}

export function visibleItems() {
    let list = state.items.filter(item => inList(item, state.active));
    if (state.viewState.search) list = list.filter(item => matchesSearch(item, state.viewState.search));
    if (state.viewState.period === '__unassigned__') list = list.filter(item => !itemBlock(item));
    else if (state.viewState.period) list = list.filter(item => itemBlock(item) === state.viewState.period);
    const now = new Date();
    const cutoff = state.viewState.when === 'month' ? localDay(new Date(now.getFullYear(), now.getMonth(), 1))
        : state.viewState.when === 'year' ? `${now.getFullYear()}-01-01`
        : /^\d+$/.test(state.viewState.when) ? localDay(new Date(now.getTime() - Number(state.viewState.when) * 86400000)) : '';
    if (state.viewState.when === 'pick-month' && state.viewState.month) list = list.filter(item => (item.played || []).some(day => day.startsWith(state.viewState.month)));
    else if (state.viewState.when === 'range' && (state.viewState.from || state.viewState.to)) list = list.filter(item => (item.played || []).some(day => (!state.viewState.from || day >= state.viewState.from) && (!state.viewState.to || day <= state.viewState.to)));
    else if (state.viewState.when === 'never') list = list.filter(item => !(item.played || []).length);
    else if (cutoff) list = list.filter(item => (item.played || []).some(day => day >= cutoff));
    if (state.viewState.system) list = list.filter(item => systemsOf(item).includes(state.viewState.system));
    const played = item => item.played || [];
    const last = item => played(item)[played(item).length - 1] || '';
    const first = item => played(item)[0] || '';
    const by = {
        name: (a, b) => a.name.localeCompare(b.name),
        last: (a, b) => last(b).localeCompare(last(a)),
        first: (a, b) => (first(a) || '9').localeCompare(first(b) || '9'),
        time: (a, b) => (b.minutesPlayed || 0) - (a.minutesPlayed || 0),
        rating: (a, b) => (b.rating || 0) - (a.rating || 0),
        year: (a, b) => String(b.releaseYear || 0).localeCompare(String(a.releaseYear || 0)),
        system: (a, b) => (systemsOf(a)[0] || '~').localeCompare(systemsOf(b)[0] || '~')
    }[state.viewState.sort];
    return by ? [...list].sort(by) : list;
}

export function saveUiState() {
    try {
        localStorage.setItem(UI_STORAGE_KEY, JSON.stringify({
            active: state.active,
            view: state.view,
            calMode: state.calMode,
            period: state.viewState.period || ''
        }));
        const hashParts = [`tab=${encodeURIComponent(state.active)}`];
        if (state.view !== 'list') hashParts.push(`view=${encodeURIComponent(state.view)}`);
        if (state.view === 'calendar' && state.calMode !== 'month') hashParts.push(`cal=${encodeURIComponent(state.calMode)}`);
        if (state.viewState.period) hashParts.push(`block=${encodeURIComponent(state.viewState.period)}`);
        history.replaceState(null, '', `#${hashParts.join('&')}`);
    } catch {}
}

export function loadUiState() {
    try {
        const saved = JSON.parse(localStorage.getItem(UI_STORAGE_KEY) || '{}');
        if (saved.active) state.active = saved.active;
        if (saved.view && ['list', 'calendar', 'tiers'].includes(saved.view)) state.view = saved.view;
        if (saved.calMode && ['month', 'week'].includes(saved.calMode)) state.calMode = saved.calMode;
        if (saved.period) state.viewState.period = saved.period;
    } catch {}
    try {
        const rawHash = (location.hash || '').replace(/^#/, '');
        if (rawHash) {
            const params = new URLSearchParams(rawHash);
            if (params.get('tab')) state.active = params.get('tab');
            if (params.get('view') && ['list', 'calendar', 'tiers'].includes(params.get('view'))) state.view = params.get('view');
            if (params.get('cal') && ['month', 'week'].includes(params.get('cal'))) state.calMode = params.get('cal');
            if (params.has('block')) state.viewState.period = params.get('block') || '';
        }
    } catch {}
}

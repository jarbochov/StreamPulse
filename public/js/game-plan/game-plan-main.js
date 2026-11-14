/**
 * StreamPulse — Game Plan Main Controller
 */

import {
    $,
    ICONS,
    BUILTIN,
    HORIZON_PERIODS,
    state,
    inList,
    isTonightItem,
    homeListId,
    tiersOf,
    allLists,
    esc,
    uid,
    setStatus,
    listName,
    starsHtml,
    starValue,
    seenLine,
    systemsOf,
    localDay,
    itemBlock,
    orderedPeriods,
    matchesSearch,
    visibleItems,
    saveUiState,
    loadUiState
} from './game-plan-state.js';

import {
    renderCalendar,
    renderBoard,
    initCalendarHandlers,
    closeCalCtxMenu
} from './game-plan-calendar.js';

import {
    openDialog,
    paintDialog,
    syncEditingFromDom,
    initDialogHandlers
} from './game-plan-dialog.js';

let periodPopItem = null;
let rowCtxItem = null;
let pickedId = '';
let searchTimer = null;
let searchSeq = 0;

export function closeRowCtxMenu() {
    rowCtxItem = null;
    const menu = $('row-ctx-menu');
    if (menu) menu.hidden = true;
}

export function openRowCtxMenu(item, anchorEl) {
    if (!item) return;
    rowCtxItem = item;
    const menu = $('row-ctx-menu');
    if (!menu) return;
    const curStatus = item.status || 'up-next';
    const pinned = isTonightItem(item);
    menu.innerHTML = `
        <div class="ctx-head">${esc(item.name)}</div>
        <button type="button" class="ctx-btn" data-row-act="play-now">${ICONS.play} <span>Play Now</span></button>
        <button type="button" class="ctx-btn" data-row-act="toggle-tonight">${ICONS.tv} <span>${pinned ? "Remove from Tonight's Lineup" : "Pin to Tonight's Lineup"}</span></button>
        <button type="button" class="ctx-btn" data-row-act="edit">${ICONS.edit} <span>Edit Details &amp; Dates…</span></button>
        <div class="ctx-sep"></div>
        ${curStatus !== 'scheduled' ? `<button type="button" class="ctx-btn" data-row-act="move" data-target="scheduled">${ICONS.calendar} <span>Move to Schedule</span></button>` : ''}
        ${curStatus !== 'up-next' ? `<button type="button" class="ctx-btn" data-row-act="move" data-target="up-next">${ICONS.undo} <span>Move to Up Next</span></button>` : ''}
        ${curStatus !== 'backlog' ? `<button type="button" class="ctx-btn" data-row-act="move" data-target="backlog">${ICONS.folder} <span>Move to Backlog</span></button>` : ''}
        ${curStatus !== 'played' ? `<button type="button" class="ctx-btn" data-row-act="move" data-target="played">${ICONS.check} <span>Mark as Played</span></button>` : ''}
        <div class="ctx-sep"></div>
        <button type="button" class="ctx-btn danger" data-row-act="delete">${ICONS.trash} <span>Remove from Plan</span></button>
    `;
    menu.hidden = false;
    const rect = anchorEl.getBoundingClientRect();
    const top = Math.min(window.innerHeight - menu.offsetHeight - 10, rect.bottom + 4);
    const left = Math.min(window.innerWidth - menu.offsetWidth - 10, Math.max(10, rect.right - menu.offsetWidth));
    menu.style.top = `${Math.max(10, top)}px`;
    menu.style.left = `${left}px`;
}

export function coverTag(item) {
    return item.cover ? `<img class="cover" src="${esc(item.cover)}" alt="" loading="lazy" data-edit>` : `<div class="cover" data-edit>${item.custom ? ICONS.image : ICONS.game}</div>`;
}

export function subLine(item) {
    const parts = [];
    if (item.custom) {
        parts.push(item.twitchCategory === '__none__' ? 'Custom · No category change' : `Custom · ${item.twitchCategory || 'Just Chatting'}`);
    } else {
        const meta = [item.releaseYear, (item.genres || []).slice(0, 2).join(', ')].filter(Boolean).join(' · ');
        if (meta) parts.push(meta);
    }
    const seen = seenLine(item);
    if (seen) parts.push(seen);
    if (item.note) parts.push(`“${item.note}”`);
    return parts.join('  ·  ');
}

export function buildTabs() {
    const validIds = new Set(allLists().map(l => l.id));
    if (!validIds.has(state.active)) state.active = 'tonight';

    const streamTabs = BUILTIN.map(list => {
        const count = state.items.filter(item => inList(item, list.id)).length;
        return `<button type="button" class="tab${list.id === state.active ? ' active' : ''}" data-tab="${esc(list.id)}">${esc(list.name)}${count ? `<span class="n">${count}</span>` : ''}</button>`;
    }).join('');

    const activeCustom = state.customLists.find(list => list.id === state.active);
    const activeCustomCount = activeCustom ? state.items.filter(item => inList(item, activeCustom.id)).length : 0;
    const filteredCols = state.customLists.filter(list => !state.collectionSearch || list.name.toLowerCase().includes(state.collectionSearch.toLowerCase()));

    const collectionsHtml = `
        <div class="collections-right">
            ${activeCustom ? `
                <button type="button" class="tab active" data-tab="${esc(activeCustom.id)}" title="Active Custom Collection">
                    ${ICONS.folder}
                    <span>${esc(activeCustom.name)}</span>
                    ${activeCustomCount ? `<span class="n">${activeCustomCount}</span>` : ''}
                </button>
            ` : ''}
            <button type="button" class="tab${state.collectionsOpen ? ' active' : ''}" id="collections-btn" title="Browse or manage custom collections">
                ${ICONS.folder}
                <span>Collections</span>
                ${state.customLists.length ? `<span class="n">${state.customLists.length}</span>` : ''}
                ${ICONS.chevronDown}
            </button>
            <div class="collections-pop" id="collections-pop" ${state.collectionsOpen ? '' : 'hidden'}>
                <div class="collections-pop-head">
                    <span>Custom Collections (${state.customLists.length})</span>
                    <button type="button" class="col-tool-btn" id="collections-close" title="Close"><svg class="ico" viewBox="0 0 24 24" style="width:12px;height:12px;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
                </div>
                ${state.customLists.length > 3 ? `
                    <input type="search" id="col-search" placeholder="Filter collections…" value="${esc(state.collectionSearch)}" style="width:100%;padding:0.3rem 0.5rem;font-size:0.76rem;">
                ` : ''}
                <div class="collections-list" id="collections-list">
                    ${filteredCols.length ? filteredCols.map(list => {
                        const count = state.items.filter(item => inList(item, list.id)).length;
                        const isCurrent = list.id === state.active;
                        return `
                            <div class="col-item${isCurrent ? ' active' : ''}" data-tab="${esc(list.id)}">
                                <span class="col-name">${ICONS.folder} ${esc(list.name)}</span>
                                <span class="col-count">${count}</span>
                                <span class="col-tools">
                                    <button type="button" class="col-tool-btn" data-col-rename="${esc(list.id)}" title="Rename collection">${ICONS.edit}</button>
                                    <button type="button" class="col-tool-btn danger" data-col-delete="${esc(list.id)}" title="Delete collection">${ICONS.trash}</button>
                                </span>
                            </div>
                        `;
                    }).join('') : `<div style="font-size:0.75rem;color:var(--text-muted);padding:0.45rem;text-align:center;">${state.customLists.length ? 'No matching collections.' : 'No custom collections yet. Create one below!'}</div>`}
                </div>
                <div class="col-add-row">
                    <input type="text" id="new-list-name" placeholder="New collection name…" maxlength="40">
                    <button type="button" class="btn primary" id="col-add-btn" style="padding:0.28rem 0.6rem;font-size:0.75rem;"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:2px;"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg> Add</button>
                </div>
            </div>
        </div>
    `;

    const tabsEl = $('tabs');
    if (tabsEl) tabsEl.innerHTML = `${streamTabs}${collectionsHtml}`;
}

export function buildViewBar() {
    const hasActiveFilter = state.viewState.sort !== 'manual' || Boolean(state.viewState.when || state.viewState.system);
    $('toggle-filters')?.classList.toggle('primary', state.filtersOpen || hasActiveFilter);
    const viewBar = $('view-bar');
    if (viewBar) viewBar.hidden = !state.filtersOpen && !hasActiveFilter;
    const total = state.items.filter(item => inList(item, state.active)).length, shown = visibleItems().length;
    if ($('v-count')) $('v-count').textContent = shown === total ? '' : `Showing ${shown} of ${total}`;
    if (!viewBar || viewBar.hidden) return;
    const systems = [...new Set(state.items.filter(item => inList(item, state.active)).flatMap(systemsOf))].sort();
    if (state.viewState.system && !systems.includes(state.viewState.system)) state.viewState.system = '';
    $('v-system').innerHTML = '<option value="">All</option>' + systems.map(name => `<option value="${esc(name)}"${name === state.viewState.system ? ' selected' : ''}>${esc(name)}</option>`).join('');
    $('v-sort').value = state.viewState.sort; $('v-when').value = state.viewState.when;
    $('v-month-wrap').hidden = state.viewState.when !== 'pick-month'; $('v-range').hidden = state.viewState.when !== 'range';
    const thisYear = new Date().getFullYear();
    const years = [...new Set([thisYear, ...state.items.flatMap(item => (item.played || []).map(day => Number(day.slice(0, 4))))])].sort((a, b) => b - a);
    const [yy, mm] = (state.viewState.month || `${thisYear}-${String(new Date().getMonth() + 1).padStart(2, '0')}`).split('-');
    $('v-mon').innerHTML = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map((name, index) => `<option value="${String(index + 1).padStart(2, '0')}"${String(index + 1).padStart(2, '0') === mm ? ' selected' : ''}>${name}</option>`).join('');
    $('v-year').innerHTML = [...new Set([...years, Number(yy)])].sort((a, b) => b - a).map(year => `<option${String(year) === yy ? ' selected' : ''}>${year}</option>`).join('');
    $('v-from').value = state.viewState.from; $('v-to').value = state.viewState.to;
}

export function buildPeriodBar() {
    const bar = $('period-bar');
    if (!bar) return;
    const names = orderedPeriods();
    const tabItems = state.items.filter(item => inList(item, state.active));
    const showBar = state.view === 'list' && (names.length > 0 || state.active === 'scheduled' || state.active === 'up-next' || state.active === 'backlog' || Boolean(state.viewState.period));
    bar.hidden = !showBar;
    state.periodSortable?.destroy();
    state.periodSortable = null;
    if (bar.hidden) return;
    if (state.viewState.period && state.viewState.period !== '__unassigned__' && !names.includes(state.viewState.period)) {
        state.viewState.period = '';
    }
    const unassignedCount = tabItems.filter(item => !itemBlock(item)).length;
    bar.innerHTML = `
        <span class="period-bar-label">${ICONS.tag} Blocks / Groups:</span>
        <button type="button" class="pchip${!state.viewState.period ? ' active' : ''}" data-filter-period="">All <span class="pcount">${tabItems.length}</span></button>
        <span id="period-chips-sortable" style="display:inline-flex;align-items:center;gap:0.35rem;flex-wrap:wrap;">
            ${names.map((name, index) => {
                const cnt = tabItems.filter(item => itemBlock(item) === name).length;
                const totalCnt = state.items.filter(item => itemBlock(item) === name).length;
                return `<button type="button" class="pchip${state.viewState.period === name ? ' active' : ''}" data-period="${esc(name)}" data-filter-period="${esc(name)}" title="Click to filter by ${esc(name)} · Drag to reorder overlay group order"><span class="num">${index + 1}</span>${esc(name)}<span class="pcount">${cnt || totalCnt}</span></button>`;
            }).join('')}
        </span>
        ${names.length ? `<button type="button" class="pchip${state.viewState.period === '__unassigned__' ? ' active' : ''}" data-filter-period="__unassigned__">Unassigned <span class="pcount">${unassignedCount}</span></button>` : ''}
        <button type="button" class="pchip pchip-add" id="add-period-btn" title="Create a new Block / Group (e.g. October, November)">+ Block / Group</button>
    `;
    const sortZone = document.getElementById('period-chips-sortable');
    if (sortZone && names.length > 1 && window.Sortable) {
        state.periodSortable = new window.Sortable(sortZone, {
            animation: 150, draggable: '.pchip',
            onEnd() {
                state.periodOrder = [...sortZone.querySelectorAll('.pchip')].map(chip => chip.dataset.period).filter(Boolean);
                buildPeriodBar();
                scheduleSave();
            }
        });
    }
}

export function renderItemRow(item, index, isCrossList = false) {
    const effectiveList = isCrossList ? item.status : state.active;
    const isTonight = !isCrossList && effectiveList === 'tonight';
    const isScheduled = !isCrossList && effectiveList === 'scheduled';
    const isPlayed = !isCrossList && effectiveList === 'played';
    const isPlaying = Boolean(item.playingNow);
    const pinnedTonight = isTonightItem(item);
    const isSelected = state.selectedIds.has(item.id);
    const hasAnyDate = Boolean(item.streamDate || (Array.isArray(item.streamDates) && item.streamDates.some(d => d && d.date)));

    let scheduleActions = '';
    if (isCrossList) {
        scheduleActions = `
            <button type="button" class="btn ${pinnedTonight ? 'tonight-active' : 'play-btn'}" data-action="toggle-tonight" title="${pinnedTonight ? "Remove from Tonight's lineup" : "Pin to Tonight's lineup"}">${ICONS.tv} ${pinnedTonight ? 'In Tonight' : 'Tonight'}</button>
            ${item.status !== 'scheduled' ? `<button type="button" class="btn schedule-btn" data-action="move-to-schedule" title="Move to Schedule">${ICONS.calendar} Schedule</button>` : ''}
        `;
    } else if (isTonight) {
        if (isPlaying) {
            scheduleActions = `
                <button type="button" class="btn stop-btn" data-action="stop-now" title="Stop playing on stream">${ICONS.stop} Stop</button>
                <button type="button" class="btn advance-btn" data-action="advance-item" title="Finish current session and advance to next game in rundown">${ICONS.next} Next</button>
            `;
        } else {
            scheduleActions = `
                <button type="button" class="btn play-btn" data-action="play-now" title="Set as Currently Playing on stream">${ICONS.play} Play Now</button>
                <button type="button" class="btn schedule-btn" data-action="unpin-tonight" title="Remove from Tonight's lineup (keeps Home List)">Unpin</button>
            `;
        }
    } else if (isScheduled) {
        scheduleActions = `
            <button type="button" class="btn ${pinnedTonight ? 'tonight-active' : 'play-btn'}" data-action="toggle-tonight" title="${pinnedTonight ? "Pinned to Tonight's lineup (click to unpin)" : "Pin to Tonight's stream lineup"}">${ICONS.tv} ${pinnedTonight ? 'In Tonight' : 'Tonight'}</button>
            ${hasAnyDate ? `<button type="button" class="btn" data-action="push-twitch" title="${item.twitchSegmentId ? 'Twitch Schedule synced (click to re-sync)' : 'Push stream dates to Twitch Schedule'}">${ICONS.sync} ${item.twitchSegmentId ? 'Synced' : 'Sync'}</button>` : `<button type="button" class="btn schedule-btn" data-edit-tab="schedule" title="Pick stream dates">${ICONS.calendar} Dates</button>`}
        `;
    } else {
        scheduleActions = `
            <button type="button" class="btn ${pinnedTonight ? 'tonight-active' : 'play-btn'}" data-action="toggle-tonight" title="${pinnedTonight ? "Pinned to Tonight's lineup (click to unpin)" : "Pin to Tonight's stream lineup"}">${ICONS.tv} ${pinnedTonight ? 'In Tonight' : 'Tonight'}</button>
            <button type="button" class="btn" data-action="play-now" title="Pin to Tonight and Play Now">${ICONS.play} Play</button>
        `;
    }

    const playstyleBadge = item.gameType === 'one-off'
        ? '<span class="badge oneoff-badge" title="One-off session or variety segment">One-off</span>'
        : '';
    const twitchBadge = item.twitchSegmentId ? `<span class="badge twitch-badge" title="Synced to Twitch Schedule">${ICONS.check} Synced</span>` : '';
    const catBadge = (item.twitchCategory && item.twitchCategory !== item.name && item.twitchCategory !== 'Just Chatting')
        ? `<span class="badge cat-badge" title="Twitch Category">${item.twitchCategory === '__none__' ? 'No Category' : esc(item.twitchCategory)}</span>`
        : '';
    const homeId = homeListId(item);
    const crossBadge = isCrossList
        ? `<span class="badge list-pill" title="Home list: ${esc(listName(homeId))}">${esc(listName(homeId))}</span>`
        : (isTonight && item.status && item.status !== 'tonight'
            ? `<span class="badge list-pill" title="Home list: ${esc(listName(item.status))}">${esc(listName(item.status))}</span>`
            : '');
    const blockName = itemBlock(item);
    const periodBadge = blockName
        ? `<button type="button" class="badge period-pill" data-period-btn="${esc(item.id)}" title="Block / Horizon: ${esc(blockName)} — click to change or filter">${ICONS.tag} ${esc(blockName)}</button>`
        : `<button type="button" class="badge period-pill empty-pill" data-period-btn="${esc(item.id)}" title="Assign a Block / Horizon (e.g. Next Week, October, Future)">+ Block</button>`;
    const extraDatesCount = Array.isArray(item.streamDates) ? item.streamDates.filter(d => Boolean(d && (d.date || (typeof d === 'string' && d)))).length : 0;
    const recurringSuffix = item.streamRecurring ? ' · Weekly' : '';
    const dateBadge = item.streamDate
        ? `<span class="date-badge" title="Scheduled Stream Date (click to edit)" data-edit-tab="schedule">${ICONS.calendar} ${esc(item.streamDate)}${item.streamTime ? ` ${esc(item.streamTime)}` : ''}${extraDatesCount > 0 ? ` +${extraDatesCount}d` : ''}${recurringSuffix}</span>`
        : (extraDatesCount > 0 ? `<span class="date-badge" title="Scheduled Stream Dates (click to edit)" data-edit-tab="schedule">${ICONS.calendar} ${extraDatesCount} day${extraDatesCount === 1 ? '' : 's'}${recurringSuffix}</span>` : '');

    const showStars = isPlayed || (item.rating > 0);
    const starsPart = showStars ? `<span class="stars" data-stars>${starsHtml(item.rating || 0, 'data-star')}</span>` : '';
    const subText = subLine(item);

    return `
    <div class="item${isPlaying ? ' now' : ''}${isCrossList ? ' cross-item' : ''}${isSelected ? ' selected' : ''}" data-id="${esc(item.id)}">
        <input type="checkbox" class="item-select" data-select-id="${esc(item.id)}"${isSelected ? ' checked' : ''} aria-label="Select ${esc(item.name)}">
        ${isCrossList ? `<span class="grip" style="opacity:0.4">${ICONS.search}</span>` : (isTonight ? `<span class="order-num" title="Drag to reorder or drop onto another tab to move"><span class="grip-dots">⋮⋮</span>${index + 1}</span>` : '<span class="grip" title="Drag to reorder, or drop on a tab to move">⋮⋮</span>')}
        ${coverTag(item)}
        <div class="main">
            <div class="main-top">
                <span class="name" data-edit title="${esc(item.name)}">${esc(item.name)}</span>
                ${crossBadge}
                ${isPlaying ? '<span class="badge now-badge">LIVE NOW</span>' : ''}
                ${periodBadge}
                ${playstyleBadge}
                ${catBadge}
                ${twitchBadge}
                ${dateBadge}
                ${(item.tags || []).slice(0, 3).map(tag => `<span class="chip">${esc(tag)}</span>`).join('')}
            </div>
            ${(subText || starsPart) ? `
            <div class="main-sub">
                ${subText ? `<span class="sub">${esc(subText)}</span>` : ''}
                ${starsPart}
            </div>` : ''}
        </div>
        <div class="item-actions">
            ${scheduleActions}
            <button class="btn icon" data-edit title="Edit Details, Dates &amp; Artwork">${ICONS.edit}</button>
            <button class="btn icon" data-row-menu="${esc(item.id)}" title="More Actions">${ICONS.more}</button>
        </div>
    </div>`;
}

export function unpinTonight(item) {
    if (!item) return;
    item.tonight = false;
    if (item.status === 'tonight') item.status = homeListId(item);
    if (item.playingNow) {
        item.playingNow = false;
        fetch('/api/game-plan/now', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clear: true })
        }).catch(() => {});
    }
}

export function moveTo(item, status) {
    if (status === 'tonight') {
        item.tonight = true;
        if (!item.status || item.status === 'tonight') item.status = 'up-next';
        state.items = [...state.items.filter(entry => entry !== item), item];
        return;
    }
    item.status = status;
    item.extraLists = (item.extraLists || []).filter(id => id !== status);
    if (!tiersOf(status).some(entry => entry.id === item.tier)) item.tier = '';
    if (item.period === 'Tonight') item.period = '';
    if (status === 'played') {
        if (!item.finished) item.finished = new Date().toISOString().slice(0, 10);
        if (isTonightItem(item)) unpinTonight(item);
    }
    state.items = [...state.items.filter(entry => entry !== item), item];
}

export function scheduleSave() {
    setStatus('Saving…');
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(save, 500);
}

export function commit(redraw) {
    scheduleSave();
    if (redraw) render();
}

export async function save() {
    try {
        syncEditingFromDom();
        const response = await fetch('/api/game-plan', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                lists: state.customLists,
                tiers: state.tiers,
                tierSets: state.tierSets,
                periods: orderedPeriods(),
                items: state.items.map(({ id, name, status, tonight, gameType, streamDate, streamTime, streamDuration, streamRecurring, streamDates, twitchSegmentId, twitchSegmentIds, period, note, twitchCategory, igdbId, custom, customCover, rating, tier, tags, finished, played, autoAdded, system, extraLists }) => ({ id, name, status, tonight: Boolean(tonight || status === 'tonight'), gameType, streamDate, streamTime, streamDuration: Number(streamDuration) || 180, streamRecurring, streamDates: Array.isArray(streamDates) ? streamDates : [], twitchSegmentId, twitchSegmentIds, period, note, twitchCategory, igdbId, custom, customCover, rating, tier, tags, finished, played, autoAdded, system, extraLists }))
            })
        });
        if (!response.ok) throw new Error((await response.json()).error || response.statusText);
        setStatus('Saved. Overlays update within a few seconds.');
        state.polls = 0;
        setTimeout(refreshMeta, 1500);
    } catch (error) { setStatus(`Could not save: ${error.message}`); }
}

export async function refreshMeta() {
    try {
        const data = await (await fetch('/api/game-plan', { cache: 'no-store' })).json();
        let missing = false, changed = false;
        for (const fresh of data.items) {
            const item = state.items.find(entry => entry.id === fresh.id);
            if (!item) continue;
            if (state.editing && item.id === state.editing.id && $('dlg')?.open) continue;
            if (item.cover !== fresh.cover || item.playingNow !== fresh.playingNow || item.releaseYear !== fresh.releaseYear) changed = true;
            Object.assign(item, {
                cover: fresh.cover,
                releaseYear: fresh.releaseYear,
                genres: fresh.genres,
                playingNow: fresh.playingNow,
                minutesPlayed: fresh.minutesPlayed,
                platforms: fresh.platforms,
                gameType: fresh.gameType || item.gameType,
                streamDate: fresh.streamDate || item.streamDate,
                streamTime: fresh.streamTime || item.streamTime,
                streamDuration: fresh.streamDuration || item.streamDuration || 180,
                streamRecurring: fresh.streamRecurring !== undefined ? fresh.streamRecurring : item.streamRecurring,
                streamDates: Array.isArray(fresh.streamDates) ? fresh.streamDates : (item.streamDates || []),
                twitchSegmentId: fresh.twitchSegmentId || item.twitchSegmentId,
                twitchSegmentIds: fresh.twitchSegmentIds || item.twitchSegmentIds
            });
            if (!fresh.cover && !item.custom) missing = true;
        }
        if (changed && !$('items')?.contains(document.activeElement) && !$('dlg')?.open) render();
        if (missing && state.polls++ < 8) setTimeout(refreshMeta, 3000);
    } catch { /* try again on next change */ }
}

export function renderBulkBar() {
    const bar = $('bulk-bar');
    if (!bar) return;
    if (state.view !== 'list' || state.selectedIds.size === 0) {
        bar.hidden = true;
        bar.innerHTML = '';
        return;
    }
    const visibleIds = visibleItems().map(i => i.id);
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => state.selectedIds.has(id));
    const listOptions = allLists().filter(l => l.id !== 'tonight').map(l => `<option value="${esc(l.id)}">${esc(l.name)}</option>`).join('');
    const periodOptions = [...new Set([...orderedPeriods(), ...HORIZON_PERIODS])].map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join('');

    bar.hidden = false;
    bar.innerHTML = `
        <div class="bulk-bar-group">
            <strong>${state.selectedIds.size} selected</strong>
            <button type="button" class="btn ghost" id="bulk-select-all">${allVisibleSelected ? 'Deselect visible' : 'Select all visible'}</button>
            <button type="button" class="btn ghost" id="bulk-clear">Clear</button>
        </div>
        <div class="bulk-bar-group">
            <button type="button" class="btn play-btn" id="bulk-pin-tonight">${ICONS.tv} Pin Tonight</button>
            <button type="button" class="btn" id="bulk-unpin-tonight">Unpin Tonight</button>
            <select id="bulk-move-list" aria-label="Move selected to list">
                <option value="">Move to list…</option>
                ${listOptions}
            </select>
            <select id="bulk-set-period" aria-label="Set block or horizon for selected">
                <option value="">Set block…</option>
                <option value="__clear__">Clear block</option>
                ${periodOptions}
            </select>
            <button type="button" class="btn danger" id="bulk-remove">${ICONS.trash} Remove</button>
        </div>
    `;
}

export function render() {
    saveUiState();
    document.querySelectorAll('[data-view]').forEach(button => button.classList.toggle('active', button.dataset.view === state.view));
    if ($('board')) $('board').hidden = state.view !== 'tiers';
    if ($('cal-view')) $('cal-view').hidden = state.view !== 'calendar';
    if ($('items')) $('items').hidden = state.view !== 'list';
    if ($('tabs')) $('tabs').hidden = state.view === 'calendar';
    if ($('toggle-filters')) $('toggle-filters').hidden = state.view !== 'list';
    if (state.view === 'tiers') {
        buildTabs();
        if ($('period-bar')) $('period-bar').hidden = true;
        if ($('view-bar')) $('view-bar').hidden = true;
        if ($('bulk-bar')) $('bulk-bar').hidden = true;
        renderBoard(scheduleSave, openDialog);
        return;
    }
    if (state.view === 'calendar') {
        if ($('period-bar')) $('period-bar').hidden = true;
        if ($('view-bar')) $('view-bar').hidden = true;
        if ($('bulk-bar')) $('bulk-bar').hidden = true;
        renderCalendar();
        return;
    }
    buildTabs();
    const list = allLists().find(entry => entry.id === state.active) || BUILTIN[0];
    const holder = $('items');
    if (!holder) return;
    holder.dataset.empty = (state.viewState.search || state.viewState.period) ? `No matching games in ${list.name}.` : list.empty;

    let bannerHtml = '';
    if (state.active === 'tonight') {
        const tonightItems = state.items.filter(i => inList(i, 'tonight'));
        const playingNow = state.items.find(i => Boolean(i.playingNow));
        const todayIso = localDay(new Date());
        const todayScheduledCount = state.items.filter(i => !isTonightItem(i) && (i.streamDate === todayIso || (i.streamDates || []).some(d => d && d.date === todayIso))).length;
        bannerHtml = `
            <div class="tonight-banner">
                <div>
                    <div style="font-weight:700;font-size:0.88rem;display:flex;align-items:center;gap:0.45rem;">
                        ${ICONS.tv}
                        <span>Tonight's Stream Rundown</span>
                        <span class="badge" style="background:var(--accent);color:#fff;border:none;">${tonightItems.length}</span>
                    </div>
                    <div style="font-size:0.74rem;color:var(--text-muted);margin-top:0.15rem;">
                        ${playingNow ? `Currently Active: <b style="color:var(--success)">${esc(playingNow.name)}</b>` : 'Pinned games stay in their Home List (Schedule, Up Next, or Collections).'}
                    </div>
                </div>
                <div style="display:flex;gap:0.4rem;align-items:center;flex-wrap:wrap;">
                    ${todayScheduledCount > 0 ? `<button type="button" class="btn" id="btn-pull-today" title="Pin games scheduled for today (${todayIso}) onto Tonight's Lineup">${ICONS.calendar} Pull Today's Scheduled (${todayScheduledCount})</button>` : ''}
                    ${tonightItems.length > 0 ? `<button type="button" class="btn ghost" id="btn-clear-tonight" title="Unpin all items from Tonight (keeps them in their Home Lists)">Clear Tonight</button>` : ''}
                    ${playingNow ? `<button type="button" class="btn advance-btn" data-action="advance-item" data-banner-id="${esc(playingNow.id)}" style="font-weight:600;">${ICONS.next} Finish &amp; Next</button>` : ''}
                </div>
            </div>
        `;
    } else if (state.active === 'scheduled') {
        const unsynced = state.items.filter(i => inList(i, 'scheduled') && !i.twitchSegmentId && (i.streamDate || (i.streamDates || []).some(d => d && d.date)));
        if (unsynced.length > 0) {
            bannerHtml = `
                <div class="tonight-banner">
                    <div style="font-size:0.78rem;color:var(--text-muted);">
                        <b style="color:var(--text);">${unsynced.length}</b> scheduled game${unsynced.length === 1 ? '' : 's'} with dates not yet synced to Twitch Schedule.
                    </div>
                    <button type="button" class="btn primary" id="btn-sync-all-twitch" style="padding:0.32rem 0.7rem;font-size:0.76rem;">${ICONS.sync} Sync All Unsynced (${unsynced.length})</button>
                </div>
            `;
        }
    }

    const visible = visibleItems();
    const itemsHtml = visible.map((item, index) => renderItemRow(item, index, false)).join('');

    let crossListHtml = '';
    if (state.viewState.search || (state.viewState.period && state.viewState.period !== '__unassigned__')) {
        const otherMatches = state.items.filter(item => !inList(item, state.active) && matchesSearch(item, state.viewState.search) && (!state.viewState.period || itemBlock(item) === state.viewState.period));
        if (otherMatches.length) {
            crossListHtml = `
                <div class="cross-search-box">
                    <div class="cross-search-head">
                        <span>Found in Other Lists (${otherMatches.length})</span>
                        <span style="font-weight:400;text-transform:none;">Click any action to move or edit</span>
                    </div>
                    ${otherMatches.map((item, idx) => renderItemRow(item, idx, true)).join('')}
                </div>
            `;
        }
    }

    holder.innerHTML = bannerHtml + itemsHtml + crossListHtml;
    buildViewBar();
    buildPeriodBar();
    renderBulkBar();
    if ($('periods')) $('periods').innerHTML = orderedPeriods().map(value => `<option value="${esc(value)}">`).join('');
    
    state.sortable?.destroy();
    if (window.Sortable) {
        state.sortable = new window.Sortable(holder, {
            disabled: state.viewState.sort !== 'manual' || !!state.viewState.when || !!state.viewState.system || !!state.viewState.search || !!state.viewState.period,
            group: 'games', animation: 150, handle: '.grip, .order-num', ghostClass: 'sortable-ghost',
            filter: '.tonight-banner, .cross-search-box',
            onEnd(event) {
                const point = event.originalEvent;
                const tab = point && document.elementFromPoint(point.clientX, point.clientY)?.closest('[data-tab]');
                const id = event.item.dataset.id;
                if (tab && tab.dataset.tab !== state.active) {
                    const item = state.items.find(entry => entry.id === id);
                    if (item) {
                        if (state.customLists.some(entry => entry.id === tab.dataset.tab) && item.status !== tab.dataset.tab) {
                            item.extraLists = [...new Set([...(item.extraLists || []), tab.dataset.tab])];
                        } else {
                            moveTo(item, tab.dataset.tab);
                        }
                    }
                    render();
                    scheduleSave();
                    return;
                }
                const order = [...holder.querySelectorAll('.item:not(.cross-item)')].map(row => state.items.find(entry => entry.id === row.dataset.id)).filter(Boolean);
                const slots = state.items.map((item, index) => (inList(item, state.active) ? index : -1)).filter(index => index >= 0);
                slots.forEach((slot, index) => { state.items[slot] = order[index]; });
                scheduleSave();
            }
        });
    }
}

export function closePeriodPop() {
    periodPopItem = null;
    const pop = $('period-pop');
    if (pop) pop.hidden = true;
}

export function openPeriodPop(item, anchorEl) {
    periodPopItem = item;
    const pop = $('period-pop');
    if (!pop) return;
    const cur = itemBlock(item);
    const now = new Date();
    const curMonthName = now.toLocaleDateString(undefined, { month: 'long' });
    const nextMonthName = new Date(now.getFullYear(), now.getMonth() + 1, 1).toLocaleDateString(undefined, { month: 'long' });
    const suggestions = [...new Set([...orderedPeriods(), curMonthName, nextMonthName, ...HORIZON_PERIODS])];
    $('period-pop-chips').innerHTML = suggestions.map(name => `
        <button type="button" class="pchip${cur === name ? ' active' : ''}" data-pick-period="${esc(name)}">${ICONS.tag} ${esc(name)}</button>
    `).join('');
    $('period-pop-input').value = cur;
    $('period-pop-clear').hidden = !cur;
    pop.hidden = false;
    const rect = anchorEl.getBoundingClientRect();
    const top = Math.min(window.innerHeight - pop.offsetHeight - 12, rect.bottom + 6);
    const left = Math.min(window.innerWidth - pop.offsetWidth - 12, Math.max(12, rect.left));
    pop.style.top = `${Math.max(12, top)}px`;
    pop.style.left = `${left}px`;
    setTimeout(() => $('period-pop-input')?.focus(), 20);
}

export function applyItemPeriod(item, newPeriod) {
    if (!item) return;
    const clean = (newPeriod || '').trim().slice(0, 40);
    item.period = clean;
    if (clean && !state.periodOrder.includes(clean)) {
        state.periodOrder.push(clean);
    }
    closePeriodPop();
    render();
    scheduleSave();
    setStatus(clean ? `Assigned "${item.name}" to block "${clean}"` : `Cleared block on "${item.name}"`);
}

export function renderExistingSuggestions(query) {
    const matches = state.items.filter(item => matchesSearch(item, query)).slice(0, 5);
    if (!matches.length) return '';
    return `<div class="suggest-head">Already in Your Game Plan (click to move to ${esc(listName(state.active))} or edit)</div>` +
        matches.map(item => `
            <button type="button" data-existing-id="${esc(item.id)}">
                ${item.cover ? `<img src="${esc(item.cover)}" alt="">` : `<span class="nocover">${item.custom ? ICONS.image : ICONS.game}</span>`}
                <span>
                    ${esc(item.name)}
                    <small>Currently in <b>${esc(listName(item.status))}</b>${item.streamDate ? ` · ${esc(item.streamDate)}` : ''}</small>
                </span>
                <span class="badge list-pill" style="margin:0;">${item.status === state.active ? 'Edit' : `Move to ${esc(listName(state.active))}`}</span>
            </button>
        `).join('');
}

export function createCustomCollection(rawName) {
    const name = (rawName || '').trim().slice(0, 40);
    if (!name) return;
    const id = `list-${Date.now().toString(36)}`;
    state.customLists.push({ id, name });
    state.active = id;
    state.collectionsOpen = false;
    state.collectionSearch = '';
    render();
    scheduleSave();
    setStatus(`Created collection "${name}"`);
}

export function addItem(custom) {
    const name = $('add-name')?.value.trim();
    if (!name) {
        if (custom && $('add-name')) {
            $('add-name').placeholder = 'Type a name for your custom segment (e.g. Just Chatting, Tier List), then click Add Custom';
        }
        $('add-name')?.focus();
        return;
    }
    const item = {
        id: uid(),
        name,
        igdbId: custom ? '' : pickedId,
        custom,
        status: state.active,
        gameType: custom ? 'one-off' : 'playthrough',
        twitchCategory: custom ? 'Just Chatting' : '',
        streamDate: '',
        streamTime: '19:00',
        streamDuration: 180,
        streamRecurring: false,
        streamDates: [],
        twitchSegmentId: '',
        twitchSegmentIds: [],
        period: (state.viewState.period && state.viewState.period !== '__unassigned__') ? state.viewState.period : '',
        note: '',
        cover: '',
        customCover: '',
        rating: 0,
        tags: [],
        finished: '',
        genres: [],
        playingNow: false
    };
    if (state.active === 'played') item.finished = new Date().toISOString().slice(0, 10);
    state.items.push(item);
    $('add-name').value = '';
    pickedId = '';
    const suggest = $('suggest');
    if (suggest) { suggest.hidden = true; suggest.innerHTML = ''; }
    render();
    scheduleSave();
    if (custom) openDialog(item);
    else $('add-name')?.focus();
}

function initEventHandlers() {
    initCalendarHandlers(render, scheduleSave, openDialog, moveTo, setStatus);
    initDialogHandlers(commit, render, scheduleSave, refreshMeta, moveTo);

    $('toggle-filters')?.addEventListener('click', () => {
        state.filtersOpen = !state.filtersOpen;
        buildViewBar();
    });

    for (const id of ['v-mon', 'v-year']) {
        $(id)?.addEventListener('change', () => {
            state.viewState.month = `${$('v-year').value}-${$('v-mon').value}`;
            render();
        });
    }

    for (const [id, key] of [['v-sort', 'sort'], ['v-when', 'when'], ['v-system', 'system'], ['v-from', 'from'], ['v-to', 'to']]) {
        $(id)?.addEventListener('change', () => {
            state.viewState[key] = $(id).value;
            if (key === 'when' && state.viewState.when === 'pick-month' && !state.viewState.month) {
                const now = new Date();
                state.viewState.month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            }
            render();
        });
    }

    $('v-search')?.addEventListener('input', () => {
        state.viewState.search = $('v-search').value.trim();
        if ($('v-search-clear')) $('v-search-clear').hidden = !state.viewState.search;
        render();
    });

    $('v-search-clear')?.addEventListener('click', () => {
        $('v-search').value = '';
        state.viewState.search = '';
        $('v-search-clear').hidden = true;
        render();
    });

    $('add-form')?.addEventListener('submit', event => {
        event.preventDefault();
        addItem(false);
    });

    $('add-custom')?.addEventListener('click', () => addItem(true));

    const suggest = $('suggest');
    const hideSuggest = () => { if (suggest) { suggest.hidden = true; suggest.innerHTML = ''; } };

    $('add-name')?.addEventListener('input', () => {
        pickedId = '';
        clearTimeout(searchTimer);
        const query = $('add-name').value.trim();
        if (query.length < 2) { hideSuggest(); return; }
        const existingHtml = renderExistingSuggestions(query);
        if (existingHtml && suggest) {
            suggest.innerHTML = existingHtml;
            suggest.hidden = false;
        }
        searchTimer = setTimeout(async () => {
            const seq = ++searchSeq;
            try {
                const { results } = await (await fetch(`/api/game-search?q=${encodeURIComponent(query)}`)).json();
                if (seq !== searchSeq || !suggest) return;
                const currentExisting = renderExistingSuggestions(query);
                const igdbHtml = results.length
                    ? `<div class="suggest-head">Add New from IGDB</div>` + results.map(game => `<button type="button" data-id="${esc(game.id)}" data-name="${esc(game.name)}">${game.cover ? `<img src="${esc(game.cover)}" alt="">` : `<span class="nocover">${ICONS.game}</span>`}<span>${esc(game.name)}<small>${esc([game.year, (game.platforms || []).join(', ')].filter(Boolean).join(' · '))}</small></span><span></span></button>`).join('')
                    : '';
                const customFallback = `<button type="button" class="plain" data-id="" data-name="">Use “${esc(query)}” as typed (or click "Add Custom / Segment" for non-games)</button>`;
                suggest.innerHTML = currentExisting + igdbHtml + customFallback;
                suggest.hidden = false;
            } catch {
                if (!existingHtml) hideSuggest();
            }
        }, 280);
    });

    suggest?.addEventListener('mousedown', event => {
        const option = event.target.closest('button');
        if (!option) return;
        event.preventDefault();
        if (option.dataset.existingId) {
            const existing = state.items.find(entry => entry.id === option.dataset.existingId);
            $('add-name').value = '';
            pickedId = '';
            hideSuggest();
            if (existing) {
                if (existing.status !== state.active) {
                    moveTo(existing, state.active);
                    render();
                    scheduleSave();
                    setStatus(`Moved "${existing.name}" to ${listName(state.active)}`);
                } else {
                    openDialog(existing);
                }
            }
            return;
        }
        if (option.dataset.name) {
            $('add-name').value = option.dataset.name;
            pickedId = option.dataset.id;
        }
        hideSuggest();
    });

    $('add-name')?.addEventListener('blur', () => setTimeout(hideSuggest, 150));
    $('add-name')?.addEventListener('keydown', event => { if (event.key === 'Escape') hideSuggest(); });

    $('tabs')?.addEventListener('click', async event => {
        if (event.target.closest('#collections-btn')) {
            event.stopPropagation();
            state.collectionsOpen = !state.collectionsOpen;
            buildTabs();
            if (state.collectionsOpen) {
                setTimeout(() => ($('col-search') || $('new-list-name'))?.focus(), 20);
            }
            return;
        }
        if (event.target.closest('#collections-close')) {
            event.stopPropagation();
            state.collectionsOpen = false;
            buildTabs();
            return;
        }
        const renameBtn = event.target.closest('[data-col-rename]');
        if (renameBtn) {
            event.stopPropagation();
            const colId = renameBtn.dataset.colRename;
            const list = state.customLists.find(entry => entry.id === colId);
            const promptFn = window.StreamPulse?.prompt || window.prompt;
            const name = list && await promptFn('Rename Collection', 'Enter a new name for this collection:', list.name);
            if (name && name.trim()) {
                list.name = name.trim().slice(0, 40);
                render();
                scheduleSave();
            }
            return;
        }
        const deleteBtn = event.target.closest('[data-col-delete]');
        if (deleteBtn) {
            event.stopPropagation();
            const colId = deleteBtn.dataset.colDelete;
            const list = state.customLists.find(entry => entry.id === colId);
            const confirmFn = window.StreamPulse?.confirm || window.confirm;
            if (!list || !await confirmFn('Delete Collection', `Delete the collection “${list.name}”? Games only in this collection move to Backlog.`, { danger: true, confirmText: 'Delete' })) return;
            for (const item of state.items) {
                if (item.status === colId) item.status = 'backlog';
                item.extraLists = (item.extraLists || []).filter(id => id !== colId);
            }
            state.customLists = state.customLists.filter(entry => entry.id !== colId);
            if (state.active === colId) state.active = 'backlog';
            render();
            scheduleSave();
            return;
        }
        if (event.target.closest('#col-add-btn')) {
            event.stopPropagation();
            const input = $('new-list-name');
            if (input && input.value.trim()) {
                createCustomCollection(input.value);
            } else {
                input?.focus();
            }
            return;
        }
        if (event.target.closest('#collections-pop') && !event.target.closest('[data-tab]')) {
            event.stopPropagation();
            return;
        }
        const tab = event.target.closest('[data-tab]');
        if (tab) {
            state.active = tab.dataset.tab;
            state.collectionsOpen = false;
            render();
        }
    });

    $('tabs')?.addEventListener('input', event => {
        if (event.target.matches('#col-search')) {
            state.collectionSearch = event.target.value;
            buildTabs();
            const input = $('col-search');
            if (input) {
                input.focus();
                input.setSelectionRange(state.collectionSearch.length, state.collectionSearch.length);
            }
        }
    });

    $('tabs')?.addEventListener('keydown', event => {
        if (event.target.matches('#new-list-name')) {
            if (event.key === 'Escape') { state.collectionsOpen = false; buildTabs(); return; }
            if (event.key === 'Enter') {
                event.preventDefault();
                createCustomCollection(event.target.value);
            }
        } else if (event.target.matches('#col-search') && event.key === 'Escape') {
            state.collectionsOpen = false;
            buildTabs();
        }
    });

    $('period-pop-close')?.addEventListener('click', closePeriodPop);
    $('period-pop-chips')?.addEventListener('click', event => {
        const btn = event.target.closest('[data-pick-period]');
        if (!btn || !periodPopItem) return;
        applyItemPeriod(periodPopItem, btn.dataset.pickPeriod);
    });
    $('period-pop-form')?.addEventListener('submit', event => {
        event.preventDefault();
        if (!periodPopItem) return;
        applyItemPeriod(periodPopItem, $('period-pop-input').value);
    });
    $('period-pop-clear')?.addEventListener('click', () => {
        if (!periodPopItem) return;
        applyItemPeriod(periodPopItem, '');
    });

    $('period-bar')?.addEventListener('click', async event => {
        if (event.target.closest('#add-period-btn')) {
            const promptFn = window.StreamPulse?.prompt || window.prompt;
            const name = await promptFn('New Block / Group', 'Enter a name for the block or group (e.g. October, November, Spooky Month):', '');
            if (name && name.trim()) {
                const clean = name.trim().slice(0, 40);
                if (!state.periodOrder.includes(clean)) state.periodOrder.push(clean);
                state.viewState.period = clean;
                render();
                scheduleSave();
                setStatus(`Created block "${clean}" — assign games using the "+ Block" pill on any item.`);
            }
            return;
        }
        const chip = event.target.closest('[data-filter-period]');
        if (chip) {
            const target = chip.dataset.filterPeriod;
            state.viewState.period = (state.viewState.period === target && target !== '') ? '' : target;
            render();
        }
    });

    $('items')?.addEventListener('change', event => {
        const cb = event.target.closest('[data-select-id]');
        if (!cb) return;
        const id = cb.dataset.selectId;
        if (cb.checked) state.selectedIds.add(id);
        else state.selectedIds.delete(id);
        cb.closest('.item')?.classList.toggle('selected', cb.checked);
        renderBulkBar();
    });

    $('items')?.addEventListener('click', async event => {
        if (event.target.closest('[data-select-id]')) return;
        if (event.target.closest('#btn-pull-today')) {
            const todayIso = localDay(new Date());
            let count = 0;
            for (const item of state.items) {
                if (!isTonightItem(item) && (item.streamDate === todayIso || (item.streamDates || []).some(d => d && d.date === todayIso))) {
                    item.tonight = true;
                    count++;
                }
            }
            if (count > 0) {
                render();
                scheduleSave();
                setStatus(`Pinned ${count} game${count === 1 ? '' : 's'} scheduled for today to Tonight's Lineup.`);
            }
            return;
        }
        if (event.target.closest('#btn-clear-tonight')) {
            const tonightItems = state.items.filter(i => isTonightItem(i));
            if (!tonightItems.length) return;
            tonightItems.forEach(item => unpinTonight(item));
            render();
            scheduleSave();
            setStatus(`Cleared ${tonightItems.length} item${tonightItems.length === 1 ? '' : 's'} from Tonight's Lineup (Home Lists preserved).`);
            return;
        }
        if (event.target.closest('#btn-sync-all-twitch')) {
            const unsynced = state.items.filter(i => inList(i, 'scheduled') && !i.twitchSegmentId && (i.streamDate || (i.streamDates || []).some(d => d && d.date)));
            if (!unsynced.length) return;
            let synced = 0;
            let failed = 0;
            for (const item of unsynced) {
                setStatus(`Syncing ${synced + 1}/${unsynced.length}: "${item.name}"…`);
                try {
                    const res = await fetch('/api/game-plan/twitch-schedule', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            itemId: item.id,
                            streamDate: item.streamDate,
                            streamTime: item.streamTime || '19:00',
                            streamDuration: item.streamDuration || 180,
                            streamRecurring: Boolean(item.streamRecurring),
                            streamDates: Array.isArray(item.streamDates) ? item.streamDates : [],
                            twitchCategory: item.twitchCategory || ''
                        })
                    });
                    const data = await res.json();
                    if (res.ok && data.ok) {
                        item.twitchSegmentId = data.segment?.id || 'synced';
                        item.twitchSegmentIds = (data.segments || []).map(s => s.id);
                        synced++;
                    } else {
                        failed++;
                    }
                } catch {
                    failed++;
                }
            }
            render();
            scheduleSave();
            setStatus(failed ? `Synced ${synced} game(s) to Twitch Schedule (${failed} failed).` : `Synced ${synced} game(s) to Twitch Schedule.`);
            return;
        }
        const menuBtn = event.target.closest('[data-row-menu]');
        if (menuBtn) {
            event.stopPropagation();
            const item = state.items.find(entry => entry.id === menuBtn.dataset.rowMenu);
            if (item) openRowCtxMenu(item, menuBtn);
            return;
        }
        const periodBtn = event.target.closest('[data-period-btn]');
        if (periodBtn) {
            event.stopPropagation();
            const item = state.items.find(entry => entry.id === periodBtn.dataset.periodBtn);
            if (item) openPeriodPop(item, periodBtn);
            return;
        }
        const bannerBtn = event.target.closest('[data-banner-id]');
        const row = event.target.closest('.item');
        const itemId = bannerBtn ? bannerBtn.dataset.bannerId : row?.dataset.id;
        if (!itemId) return;
        const item = state.items.find(entry => entry.id === itemId);
        if (!item) return;

        const actionBtn = event.target.closest('[data-action]');
        if (actionBtn) {
            const action = actionBtn.dataset.action;
            if (action === 'play-now') {
                if (!isTonightItem(item)) moveTo(item, 'tonight');
                state.items.forEach(g => { g.playingNow = (g.id === item.id); });
                render();
                try {
                    const res = await fetch('/api/game-plan/now', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id: item.id })
                    });
                    const data = await res.json();
                    if (data.twitchResult?.ok) {
                        setStatus(`Now playing on stream: ${item.name} · Twitch category set to "${data.twitchResult.categoryName}"`);
                    } else if (data.twitchResult?.skipped) {
                        setStatus(`Now playing on stream: ${item.name} (Twitch category unchanged)`);
                    } else if (data.twitchResult && !data.twitchResult.ok) {
                        setStatus(`Now playing on stream: ${item.name} · (Twitch: ${data.twitchResult.error})`);
                    } else {
                        setStatus(`Now playing on stream: ${item.name}`);
                    }
                } catch (e) { setStatus(`Failed to set playing: ${e.message}`); }
                scheduleSave();
                return;
            }
            if (action === 'stop-now') {
                item.playingNow = false;
                render();
                try {
                    await fetch('/api/game-plan/now', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ clear: true })
                    });
                    setStatus('Stopped active game on stream');
                } catch (e) { setStatus(`Failed to stop: ${e.message}`); }
                scheduleSave();
                return;
            }
            if (action === 'advance-item') {
                setStatus(`Advancing stream rundown…`);
                try {
                    const res = await fetch('/api/game-plan/advance', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id: item.id })
                    });
                    const data = await res.json();
                    if (data.error) throw new Error(data.error);
                    const planRes = await fetch('/api/game-plan', { cache: 'no-store' });
                    const freshPlan = await planRes.json();
                    state.items = freshPlan.items;
                    render();
                    if (data.current) {
                        if (data.twitchResult?.ok) {
                            setStatus(`Advanced stream rundown! Now playing: ${data.current} · Twitch category set to "${data.twitchResult.categoryName}"`);
                        } else if (data.twitchResult && !data.twitchResult.ok) {
                            setStatus(`Advanced stream rundown! Now playing: ${data.current} · (Twitch: ${data.twitchResult.error})`);
                        } else {
                            setStatus(`Advanced stream rundown! Now playing: ${data.current}`);
                        }
                    } else {
                        setStatus(`Stream rundown completed!`);
                    }
                } catch (e) { setStatus(`Failed to advance: ${e.message}`); }
                return;
            }
            if (action === 'toggle-tonight') {
                if (isTonightItem(item)) {
                    unpinTonight(item);
                    setStatus(`Removed "${item.name}" from Tonight's Lineup`);
                } else {
                    moveTo(item, 'tonight');
                    setStatus(`Pinned "${item.name}" to Tonight's Lineup`);
                }
                render();
                scheduleSave();
                return;
            }
            if (action === 'unpin-tonight') {
                unpinTonight(item);
                render();
                scheduleSave();
                setStatus(`Removed "${item.name}" from Tonight's Lineup`);
                return;
            }
            if (action === 'add-to-tonight') {
                moveTo(item, 'tonight');
                render();
                scheduleSave();
                setStatus(`Pinned "${item.name}" to Tonight's stream lineup`);
                return;
            }
            if (action === 'move-to-schedule' || action === 'schedule-item') {
                moveTo(item, 'scheduled');
                render();
                scheduleSave();
                setStatus(`Moved "${item.name}" to Schedule`);
                return;
            }
            if (action === 'move-up-next') {
                moveTo(item, 'up-next');
                render();
                scheduleSave();
                setStatus(`Moved "${item.name}" to Up Next`);
                return;
            }
            if (action === 'play-backlog') {
                moveTo(item, 'tonight');
                state.items.forEach(g => { g.playingNow = (g.id === item.id); });
                render();
                try {
                    const res = await fetch('/api/game-plan/now', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id: item.id })
                    });
                    const data = await res.json();
                    if (data.twitchResult?.ok) {
                        setStatus(`Now playing on stream: ${item.name} · Twitch category set to "${data.twitchResult.categoryName}"`);
                    } else if (data.twitchResult && !data.twitchResult.ok) {
                        setStatus(`Now playing on stream: ${item.name} · (Twitch: ${data.twitchResult.error})`);
                    } else {
                        setStatus(`Now playing on stream: ${item.name}`);
                    }
                } catch (e) { setStatus(`Failed to set playing: ${e.message}`); }
                scheduleSave();
                return;
            }
            if (action === 'push-twitch') {
                const hasAnyDate = Boolean(item.streamDate || (Array.isArray(item.streamDates) && item.streamDates.some(d => d && d.date)));
                if (!hasAnyDate) {
                    openDialog(item);
                    if ($('f-twitch-status')) $('f-twitch-status').textContent = 'Please click one or more days above first';
                    return;
                }
                setStatus(`Syncing "${item.name}" to Twitch Schedule…`);
                try {
                    const res = await fetch('/api/game-plan/twitch-schedule', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            itemId: item.id,
                            streamDate: item.streamDate,
                            streamTime: item.streamTime || '19:00',
                            streamDuration: item.streamDuration || 180,
                            streamRecurring: Boolean(item.streamRecurring),
                            streamDates: Array.isArray(item.streamDates) ? item.streamDates : [],
                            twitchCategory: item.twitchCategory || ''
                        })
                    });
                    const data = await res.json();
                    if (!res.ok || !data.ok) throw new Error(data.error || 'Sync failed');
                    item.twitchSegmentId = data.segment?.id || 'synced';
                    item.twitchSegmentIds = (data.segments || []).map(s => s.id);
                    render();
                    scheduleSave();
                    setStatus(`Synced "${item.name}" (${data.segments?.length || 1} slot${(data.segments?.length || 1) === 1 ? '' : 's'}) with Twitch Schedule.`);
                } catch (e) {
                    setStatus(`Failed to sync Twitch: ${e.message}`);
                }
                return;
            }
        }

        const star = event.target.closest('[data-star]');
        if (star && row) {
            const value = starValue(event, star, 'star');
            item.rating = item.rating === value ? 0 : value;
            row.querySelector('[data-stars]').innerHTML = starsHtml(item.rating, 'data-star');
            scheduleSave();
            return;
        }
        const editTabEl = event.target.closest('[data-edit-tab]');
        if (editTabEl) {
            openDialog(item, editTabEl.dataset.editTab);
            return;
        }
        if (event.target.closest('[data-edit]')) openDialog(item);
    });

    $('row-ctx-menu')?.addEventListener('click', async event => {
        const btn = event.target.closest('[data-row-act]');
        if (!btn || !rowCtxItem) return;
        const item = rowCtxItem;
        const act = btn.dataset.rowAct;
        closeRowCtxMenu();
        if (act === 'play-now') {
            if (!isTonightItem(item)) moveTo(item, 'tonight');
            state.items.forEach(g => { g.playingNow = (g.id === item.id); });
            render();
            try {
                await fetch('/api/game-plan/now', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: item.id })
                });
                setStatus(`Now playing on stream: ${item.name}`);
            } catch (e) { setStatus(`Failed to set playing: ${e.message}`); }
            scheduleSave();
            return;
        }
        if (act === 'toggle-tonight') {
            if (isTonightItem(item)) {
                unpinTonight(item);
                setStatus(`Removed "${item.name}" from Tonight's Lineup`);
            } else {
                moveTo(item, 'tonight');
                setStatus(`Pinned "${item.name}" to Tonight's Lineup`);
            }
            render();
            scheduleSave();
            return;
        }
        if (act === 'edit') {
            openDialog(item);
            return;
        }
        if (act === 'move') {
            const target = btn.dataset.target;
            if (target) {
                moveTo(item, target);
                render();
                scheduleSave();
                setStatus(`Moved "${item.name}" to ${listName(target)}`);
            }
            return;
        }
        if (act === 'delete') {
            const confirmFn = window.StreamPulse?.confirm || window.confirm;
            if (!await confirmFn('Remove Game', `Remove “${item.name}” from the plan?`, { danger: true, confirmText: 'Remove' })) return;
            state.items = state.items.filter(entry => entry !== item);
            state.selectedIds.delete(item.id);
            render();
            scheduleSave();
            setStatus(`Removed "${item.name}" from plan`);
        }
    });

    $('bulk-bar')?.addEventListener('click', async event => {
        if (event.target.closest('#bulk-select-all')) {
            const visibleIds = visibleItems().map(i => i.id);
            const allSelected = visibleIds.length > 0 && visibleIds.every(id => state.selectedIds.has(id));
            if (allSelected) visibleIds.forEach(id => state.selectedIds.delete(id));
            else visibleIds.forEach(id => state.selectedIds.add(id));
            render();
            return;
        }
        if (event.target.closest('#bulk-clear')) {
            state.selectedIds.clear();
            render();
            return;
        }
        if (event.target.closest('#bulk-pin-tonight')) {
            const selected = state.items.filter(i => state.selectedIds.has(i.id));
            selected.forEach(i => moveTo(i, 'tonight'));
            state.selectedIds.clear();
            render();
            scheduleSave();
            setStatus(`Pinned ${selected.length} item(s) to Tonight's Lineup`);
            return;
        }
        if (event.target.closest('#bulk-unpin-tonight')) {
            const selected = state.items.filter(i => state.selectedIds.has(i.id));
            selected.forEach(i => unpinTonight(i));
            state.selectedIds.clear();
            render();
            scheduleSave();
            setStatus(`Unpinned ${selected.length} item(s) from Tonight's Lineup`);
            return;
        }
        if (event.target.closest('#bulk-remove')) {
            const count = state.selectedIds.size;
            const confirmFn = window.StreamPulse?.confirm || window.confirm;
            if (!count || !await confirmFn('Remove Selected Games', `Remove ${count} selected game(s) from the plan?`, { danger: true, confirmText: 'Remove' })) return;
            state.items = state.items.filter(i => !state.selectedIds.has(i.id));
            state.selectedIds.clear();
            render();
            scheduleSave();
            setStatus(`Removed ${count} item(s) from plan`);
        }
    });

    $('bulk-bar')?.addEventListener('change', event => {
        if (event.target.id === 'bulk-move-list' && event.target.value) {
            const target = event.target.value;
            const selected = state.items.filter(i => state.selectedIds.has(i.id));
            selected.forEach(i => moveTo(i, target));
            state.selectedIds.clear();
            render();
            scheduleSave();
            setStatus(`Moved ${selected.length} item(s) to ${listName(target)}`);
            return;
        }
        if (event.target.id === 'bulk-set-period' && event.target.value) {
            const val = event.target.value === '__clear__' ? '' : event.target.value;
            const selected = state.items.filter(i => state.selectedIds.has(i.id));
            selected.forEach(i => { i.period = val; });
            if (val && !state.periodOrder.includes(val)) state.periodOrder.push(val);
            state.selectedIds.clear();
            render();
            scheduleSave();
            setStatus(val ? `Assigned "${val}" to ${selected.length} item(s)` : `Cleared block on ${selected.length} item(s)`);
        }
    });

    document.querySelector('.view-toggle')?.addEventListener('click', event => {
        const button = event.target.closest('[data-view]');
        if (!button) return;
        state.view = button.dataset.view;
        render();
    });

    document.addEventListener('click', event => {
        if (!$('cal-ctx-menu')?.hidden && !event.target.closest('#cal-ctx-menu') && !event.target.closest('[data-cal-menu]')) {
            closeCalCtxMenu();
        }
        if (!$('row-ctx-menu')?.hidden && !event.target.closest('#row-ctx-menu') && !event.target.closest('[data-row-menu]')) {
            closeRowCtxMenu();
        }
        if (!$('period-pop')?.hidden && !event.target.closest('#period-pop') && !event.target.closest('[data-period-btn]')) {
            closePeriodPop();
        }
        if (state.collectionsOpen && !event.target.closest('.collections-right')) {
            state.collectionsOpen = false;
            buildTabs();
        }
    });

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            if (!$('cal-ctx-menu')?.hidden) closeCalCtxMenu();
            if (!$('row-ctx-menu')?.hidden) closeRowCtxMenu();
            if (!$('period-pop')?.hidden) closePeriodPop();
            if (state.collectionsOpen) { state.collectionsOpen = false; buildTabs(); }
        }
    });

    $('export-plan')?.addEventListener('click', () => {
        const payload = {
            version: 1,
            exportedAt: new Date().toISOString(),
            lists: state.customLists,
            periods: orderedPeriods(),
            tiers: state.tiers,
            tierSets: state.tierSets,
            items: state.items
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'streampulse-game-plan-backup.json';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setStatus(`Exported ${state.items.length} game(s) to JSON.`);
    });

    $('import-plan')?.addEventListener('click', () => $('import-plan-file')?.click());

    $('import-plan-file')?.addEventListener('change', async event => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        try {
            const parsed = JSON.parse(await file.text());
            const importedItems = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.items) ? parsed.items : null);
            if (!Array.isArray(importedItems)) throw new Error('Missing items array');
            const confirmFn = window.StreamPulse?.confirm || window.confirm;
            if (!await confirmFn('Import Game Plan', `Replace or merge ${importedItems.length} game(s) from this backup? Click Import to merge new items by ID and update matches.`, { confirmText: 'Import & Merge' })) return;
            if (Array.isArray(parsed?.lists)) {
                const knownLists = new Map(state.customLists.map(l => [l.id, l]));
                parsed.lists.forEach(l => { if (l?.id && l?.name) knownLists.set(l.id, l); });
                state.customLists = [...knownLists.values()];
            }
            if (Array.isArray(parsed?.periods)) {
                state.periodOrder = [...new Set([...state.periodOrder, ...parsed.periods])];
            }
            const byId = new Map(state.items.map(i => [i.id, i]));
            importedItems.forEach(item => { if (item?.name) byId.set(item.id || uid(), item); });
            state.items = [...byId.values()];
            await save();
            const refreshed = await (await fetch('/api/game-plan', { cache: 'no-store' })).json();
            state.items = refreshed.items || state.items;
            state.customLists = refreshed.lists || state.customLists;
            state.periodOrder = refreshed.periods || state.periodOrder;
            render();
            setStatus(`Imported ${importedItems.length} game(s) from backup.`);
        } catch (err) {
            setStatus(`Import failed: ${err?.message || 'Invalid JSON'}`);
        }
    });

    $('backfill')?.addEventListener('click', async () => {
        const confirmFn = window.StreamPulse?.confirm || window.confirm;
        if (!await confirmFn('Import Past Games', 'Add games from past sessions that are not on any list yet to Played? Games already on a list stay where they are.', { confirmText: 'Import Games' })) return;
        setStatus('Importing past games...');
        try {
            const result = await (await fetch('/api/game-plan/backfill', { method: 'POST' })).json();
            if (result.error) throw new Error(result.error);
            const data = await (await fetch('/api/game-plan', { cache: 'no-store' })).json();
            state.items = data.items;
            state.periodOrder = data.periods || [];
            render();
            setStatus(`Added ${result.added.length} game${result.added.length === 1 ? '' : 's'}; updated dates on ${result.updated} more.`);
        } catch (error) { setStatus(`Could not import: ${error.message}`); }
    });

    $('f-done')?.addEventListener('click', () => {
        syncEditingFromDom();
        save();
        $('dlg')?.close();
    });

    $('dlg')?.addEventListener('close', () => {
        if (state.editing) {
            syncEditingFromDom();
            save();
        }
        state.editing = null;
        render();
    });

    window.addEventListener('hashchange', () => {
        loadUiState();
        render();
    });

    window.addEventListener('beforeunload', () => {
        if (state.saveTimer) save();
    });
}

export async function initGamePlanApp() {
    initEventHandlers();
    try {
        const data = await (await fetch('/api/game-plan', { cache: 'no-store' })).json();
        state.items = data.items || [];
        state.customLists = data.lists || [];
        state.periodOrder = data.periods || [];
        state.tiers = data.tiers || [];
        state.tierSets = data.tierSets || {};
        loadUiState();
        render();
        refreshMeta();
    } catch {
        setStatus('Could not load the game plan.');
    }
}

// Export onto window for test fixture or external access
window.gamePlanApp = {
    state,
    render,
    save,
    scheduleSave,
    commit,
    moveTo,
    addItem,
    createCustomCollection,
    openDialog,
    paintDialog,
    initGamePlanApp
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGamePlanApp);
} else {
    initGamePlanApp();
}

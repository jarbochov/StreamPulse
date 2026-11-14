/**
 * StreamPulse — Game Plan Calendar & Tier Board Module
 */

import {
    $,
    ICONS,
    TIER_COLORS,
    DEFAULT_TIERS,
    state,
    esc,
    localDay,
    itemBlock,
    matchesSearch,
    listName,
    saveUiState,
    tiersOf,
    ownTiers
} from './game-plan-state.js';

let calCtxTarget = null;

export function closeCalCtxMenu() {
    calCtxTarget = null;
    const menu = $('cal-ctx-menu');
    if (menu) menu.hidden = true;
}

export function addDateToItem(item, isoDate) {
    if (!item || !isoDate) return;
    if (!item.streamDate) {
        item.streamDate = isoDate;
    } else if (item.streamDate !== isoDate) {
        if (!Array.isArray(item.streamDates)) item.streamDates = [];
        if (!item.streamDates.some(d => d && d.date === isoDate)) {
            item.streamDates.push({ date: isoDate, time: item.streamTime || '19:00', segmentId: '' });
        }
    }
    if (item.status === 'backlog' || item.status === 'up-next') {
        item.status = 'scheduled';
    }
}

export function removeDateFromItem(item, isoDate) {
    if (!item || !isoDate) return;
    if (Array.isArray(item.streamDates)) {
        item.streamDates = item.streamDates.filter(d => d && d.date && d.date !== isoDate);
    }
    if (item.streamDate === isoDate) {
        const nextSlot = (item.streamDates || []).shift();
        item.streamDate = nextSlot ? nextSlot.date : '';
        if (nextSlot && nextSlot.time) item.streamTime = nextSlot.time;
    }
}

export function openCalCtxMenu(item, isoDate, kind, x, y) {
    if (!item) return;
    calCtxTarget = { item, isoDate, kind };
    const menu = $('cal-ctx-menu');
    if (!menu) return;
    const baseDate = isoDate ? new Date(`${isoDate}T00:00:00`) : new Date();
    const tmrwIso = localDay(new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate() + 1));
    const nextWeekIso = localDay(new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate() + 7));
    const canRemoveDate = kind === 'scheduled' || kind === 'twitch';

    menu.innerHTML = `
        <div class="ctx-head">${esc(item.name)} ${isoDate ? `<span style="font-weight:400;">(${esc(isoDate)})</span>` : ''}</div>
        <button type="button" class="ctx-item" data-ctx-action="edit">${ICONS.edit} <span>Edit Details &amp; Dates…</span></button>
        <button type="button" class="ctx-item" data-ctx-action="dup-tmrw" data-target-date="${tmrwIso}">${ICONS.copy} <span>Duplicate to Tomorrow (${tmrwIso.slice(5)})</span></button>
        <button type="button" class="ctx-item" data-ctx-action="dup-week" data-target-date="${nextWeekIso}">${ICONS.copy} <span>Duplicate to Next Week (+7d)</span></button>
        <button type="button" class="ctx-item" data-ctx-action="dup-pick">${ICONS.calendar} <span>Duplicate to Specific Date…</span></button>
        <div class="ctx-sep"></div>
        <button type="button" class="ctx-item" data-ctx-action="play-now">${ICONS.play} <span>Set as Playing Now</span></button>
        ${item.status !== 'tonight' ? `<button type="button" class="ctx-item" data-ctx-action="move-tonight">${ICONS.tv} <span>Move to Tonight's Lineup</span></button>` : ''}
        ${item.status !== 'up-next' ? `<button type="button" class="ctx-item" data-ctx-action="move-up-next">${ICONS.undo} <span>Move to Up Next</span></button>` : ''}
        <div class="ctx-sep"></div>
        ${canRemoveDate ? `<button type="button" class="ctx-item danger" data-ctx-action="remove-date">${ICONS.trash} <span>Remove from ${esc(isoDate)}</span></button>` : ''}
        <button type="button" class="ctx-item danger" data-ctx-action="delete-game">${ICONS.trash} <span>Remove Game from Plan</span></button>
    `;
    menu.hidden = false;
    const top = Math.min(window.innerHeight - menu.offsetHeight - 10, Math.max(10, y));
    const left = Math.min(window.innerWidth - menu.offsetWidth - 10, Math.max(10, x));
    menu.style.top = `${top}px`;
    menu.style.left = `${left}px`;
}

export function renderCalPickList() {
    const q = ($('cal-pick-search')?.value || '').trim().toLowerCase();
    const candidates = state.items.filter(item => !q || (item.name || '').toLowerCase().includes(q));
    const box = $('cal-pick-list');
    if (!box) return;
    if (!candidates.length) {
        box.innerHTML = '<div style="font-size:0.78rem;color:var(--text-muted);padding:0.5rem;">No matching games in your plan. Add one using the search bar at the top first.</div>';
        return;
    }
    box.innerHTML = candidates.map(item => `
        <button type="button" class="btn" data-pick-game="${esc(item.id)}" style="justify-content:space-between;text-align:left;padding:0.4rem 0.65rem;">
            <span style="display:inline-flex;align-items:center;gap:0.45rem;min-width:0;">
                ${item.cover ? `<img src="${esc(item.cover)}" alt="" style="width:20px;height:26px;object-fit:cover;border-radius:3px;">` : ICONS.game}
                <b style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(item.name)}</b>
            </span>
            <span class="badge list-pill">${esc(listName(item.status))}</span>
        </button>
    `).join('');
}

export function renderBoard(scheduleSaveCallback, openDialogCallback) {
    const board = $('board');
    if (!board) return;
    const shown = state.items.filter(item => item.status === state.active && matchesSearch(item, state.viewState.search));
    const current = tiersOf(state.active);
    const rows = [...current.map(tier => ({ ...tier, real: true })), { id: '', label: 'Unranked', color: '#8b949e', real: false }];
    board.innerHTML = rows.map((row, index) => `
        <div class="trow" data-tier-row="${esc(row.id)}">
            <div class="tlabel" style="background:${esc(row.color)}">
                ${row.real ? `<input type="text" data-tier-label="${esc(row.id)}" value="${esc(row.label)}" maxlength="24" aria-label="Tier name">
                <div class="tools"><input type="color" data-tier-color="${esc(row.id)}" value="${esc(row.color)}" title="Colour"><button type="button" data-tier-up="${esc(row.id)}" title="Move up"${index === 0 ? ' disabled' : ''}>${ICONS.chevronUp}</button><button type="button" data-tier-down="${esc(row.id)}" title="Move down"${index === current.length - 1 ? ' disabled' : ''}>${ICONS.chevronDown}</button><button type="button" data-tier-del="${esc(row.id)}" title="Delete tier (games become unranked)">${ICONS.close}</button></div>` : '<b style="text-align:center">Unranked</b>'}
            </div>
            <div class="tbody" data-tier-body="${esc(row.id)}">${shown.filter(item => (current.some(tier => tier.id === item.tier) ? item.tier : '') === row.id).map(item => `<div class="tile" data-id="${esc(item.id)}" title="${esc(item.name)}">${item.cover ? `<img class="cover" src="${esc(item.cover)}" alt="" loading="lazy" data-edit>` : `<div class="cover" data-edit>${item.custom ? ICONS.image : ICONS.game}</div>`}<div class="nm">${esc(item.name)}</div></div>`).join('')}</div>
        </div>`).join('') + '<div class="board-tools"><button class="btn" type="button" id="tier-add">+ Add tier</button><button class="btn" type="button" id="tier-reset" title="Back to S A B C D F (games keep matching letters)">Reset to S–F</button></div>';
    
    state.boardSortables.forEach(entry => entry.destroy());
    if (window.Sortable) {
        state.boardSortables = [...board.querySelectorAll('.tbody')].map(body => new window.Sortable(body, {
            group: 'tierboard', animation: 150, ghostClass: 'sortable-ghost',
            onEnd() {
                const order = [];
                board.querySelectorAll('.tbody').forEach(zone => zone.querySelectorAll('.tile').forEach(tile => {
                    const item = state.items.find(entry => entry.id === tile.dataset.id);
                    if (item) { item.tier = zone.dataset.tierBody; order.push(item); }
                }));
                const slots = state.items.map((item, index) => (item.status === state.active ? index : -1)).filter(index => index >= 0);
                slots.forEach((slot, index) => { state.items[slot] = order[index]; });
                if (scheduleSaveCallback) scheduleSaveCallback();
            }
        }));
    }
}

function parseTimeToMinutes(t) {
    if (!t) return 9999;
    const str = String(t).trim();
    if (str.toLowerCase() === 'played') return -1;
    const m24 = str.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (m24) return parseInt(m24[1], 10) * 60 + parseInt(m24[2], 10);
    const m12 = str.match(/^(\d{1,2})(?::(\d{2}))?(?::\d{2})?\s*(am|pm)$/i);
    if (m12) {
        let hrs = parseInt(m12[1], 10);
        const mins = m12[2] ? parseInt(m12[2], 10) : 0;
        const isPm = m12[3].toLowerCase() === 'pm';
        if (isPm && hrs < 12) hrs += 12;
        if (!isPm && hrs === 12) hrs = 0;
        return hrs * 60 + mins;
    }
    if (str.toLowerCase() === 'tonight') return 20 * 60; // default 8 PM
    return 9999;
}

function formatEvTime(t) {
    if (!t) return '';
    const str = String(t).trim();
    if (['tonight', 'played'].includes(str.toLowerCase())) return str;
    const m24 = str.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (m24) {
        let hrs = parseInt(m24[1], 10);
        const mins = m24[2];
        const ampm = hrs >= 12 ? 'PM' : 'AM';
        hrs = hrs % 12 || 12;
        return `${hrs}:${mins} ${ampm}`;
    }
    const m12 = str.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
    if (m12) {
        let hrs = parseInt(m12[1], 10);
        const mins = m12[2] || '00';
        const ampm = m12[3].toUpperCase();
        return `${hrs}:${mins} ${ampm}`;
    }
    return str;
}

export function renderCalendar() {
    const cal = $('cal-view');
    if (!cal) return;
    const now = new Date();
    const todayIso = localDay(now);

    // Build event map by ISO date across all games/events
    const eventsByDate = new Map();
    const pushEvent = (iso, ev) => {
        if (!iso) return;
        if (!eventsByDate.has(iso)) eventsByDate.set(iso, []);
        const arr = eventsByDate.get(iso);
        const sameItemIdx = arr.findIndex(x => x.id === ev.id);
        if (sameItemIdx >= 0) {
            const existing = arr[sameItemIdx];
            if (existing.time === 'Tonight' && ev.time && ev.time !== 'Tonight') {
                arr[sameItemIdx] = { ...ev, kind: existing.kind === 'tonight' ? 'tonight' : ev.kind };
                return;
            }
            if (ev.time === 'Tonight' && existing.time && existing.time !== 'Tonight') {
                if (ev.kind === 'tonight') existing.kind = 'tonight';
                return;
            }
            if (existing.time === ev.time) {
                if (ev.kind === 'tonight') existing.kind = 'tonight';
                return;
            }
        }
        arr.push(ev);
    };

    const filteredItems = state.items.filter(item => matchesSearch(item, state.viewState.search));
    for (const item of filteredItems) {
        if (item.tonight || item.status === 'tonight') {
            pushEvent(todayIso, { id: item.id, item, time: item.streamTime || 'Tonight', kind: 'tonight' });
        }
        if (item.streamDate) {
            pushEvent(item.streamDate, { id: item.id, item, time: item.streamTime || '19:00', kind: item.twitchSegmentId ? 'twitch' : 'scheduled' });
            if (item.streamRecurring) {
                const base = new Date(`${item.streamDate}T00:00:00`);
                if (!isNaN(base)) {
                    for (let w = 1; w <= 8; w++) {
                        const nextD = new Date(base.getFullYear(), base.getMonth(), base.getDate() + w * 7);
                        pushEvent(localDay(nextD), { id: item.id, item, time: item.streamTime || '19:00', kind: item.twitchSegmentId ? 'twitch' : 'scheduled' });
                    }
                }
            }
        }
        for (const slot of (item.streamDates || [])) {
            if (slot && slot.date) {
                pushEvent(slot.date, { id: item.id, item, time: slot.time || item.streamTime || '19:00', kind: (slot.segmentId || item.twitchSegmentId) ? 'twitch' : 'scheduled' });
            }
        }
        for (const playedDay of (item.played || [])) {
            pushEvent(playedDay, { id: item.id, item, time: 'Played', kind: 'played' });
        }
    }

    // Always sort events on every day chronologically by time
    for (const arr of eventsByDate.values()) {
        arr.sort((a, b) => parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time));
    }

    let titleLabel = '';
    let activeYear = now.getFullYear();
    let activeMonth = now.getMonth(); // 0-11
    let activeIso = todayIso;
    const cells = [];

    if (state.calMode === 'week') {
        const startOfThisWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay() + (state.calWeekOffset * 7));
        const endOfThisWeek = new Date(startOfThisWeek.getFullYear(), startOfThisWeek.getMonth(), startOfThisWeek.getDate() + 6);
        const fmtShort = d => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        titleLabel = `${fmtShort(startOfThisWeek)} – ${fmtShort(endOfThisWeek)}, ${endOfThisWeek.getFullYear()}`;
        activeYear = startOfThisWeek.getFullYear();
        activeMonth = startOfThisWeek.getMonth();
        const nowInRange = now >= startOfThisWeek && now <= endOfThisWeek;
        activeIso = nowInRange ? todayIso : localDay(startOfThisWeek);
        const dowNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        for (let i = 0; i < 7; i++) {
            const d = new Date(startOfThisWeek.getFullYear(), startOfThisWeek.getMonth(), startOfThisWeek.getDate() + i);
            const iso = localDay(d);
            const isToday = iso === todayIso;
            const dayEvents = eventsByDate.get(iso) || [];
            cells.push(`
                <div class="cal-cell week-cell${isToday ? ' today' : ''}" data-cal-date="${iso}">
                    <div class="cal-day-num">
                        <span>${dowNames[d.getDay()]} ${d.getMonth() + 1}/${d.getDate()}${isToday ? ' · Today' : ''}</span>
                        <button type="button" class="cal-add-btn" data-cal-add="${iso}" title="Schedule a game on ${iso}">+</button>
                    </div>
                    ${dayEvents.length ? dayEvents.map(ev => {
                        const block = itemBlock(ev.item);
                        const subMeta = [block, ev.item.note || (ev.item.custom ? (ev.item.twitchCategory || 'Custom') : '')].filter(Boolean).join(' · ');
                        return `
                        <div class="cal-event week-ev ${ev.kind === 'twitch' ? 'twitch-synced' : ev.kind === 'tonight' ? 'tonight-ev' : ev.kind === 'played' ? 'played-ev' : ''}" data-cal-item="${esc(ev.id)}" data-cal-ev-date="${iso}" data-cal-ev-kind="${ev.kind}" title="Click to edit · Right-click or click ⋯ for actions">
                            <div class="week-ev-top">
                                <span class="ev-time">${esc(formatEvTime(ev.time))}</span>
                                <button type="button" class="ev-menu-btn" data-cal-menu="${esc(ev.id)}" data-cal-menu-date="${iso}" data-cal-menu-kind="${ev.kind}" title="Actions (Duplicate, Delete, Move…)">${ICONS.more}</button>
                            </div>
                            <div class="ev-name" title="${esc(ev.item.name)}">${esc(ev.item.name)}</div>
                            ${(ev.item.cover || subMeta) ? `
                            <div class="week-ev-bottom">
                                ${ev.item.cover ? `<img src="${esc(ev.item.cover)}" alt="">` : ''}
                                ${subMeta ? `<span class="week-ev-sub">${esc(subMeta)}</span>` : ''}
                            </div>` : ''}
                        </div>`;
                    }).join('') : `<div style="font-size:0.72rem;color:var(--text-muted);opacity:0.5;padding:0.4rem 0.2rem;">No streams</div>`}
                </div>
            `);
        }
    } else {
        const firstOfMonth = new Date(now.getFullYear(), now.getMonth() + state.calMonthOffset, 1);
        const year = firstOfMonth.getFullYear();
        const month = firstOfMonth.getMonth();
        titleLabel = firstOfMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
        activeYear = year;
        activeMonth = month;
        const nowInMonth = now.getFullYear() === year && now.getMonth() === month;
        activeIso = nowInMonth ? todayIso : `${year}-${String(month + 1).padStart(2, '0')}-01`;
        const startDow = firstOfMonth.getDay();
        const startCell = new Date(year, month, 1 - startDow);
        for (let i = 0; i < 42; i++) {
            const d = new Date(startCell.getFullYear(), startCell.getMonth(), startCell.getDate() + i);
            const iso = localDay(d);
            const isOther = d.getMonth() !== month;
            const isToday = iso === todayIso;
            const dayEvents = eventsByDate.get(iso) || [];
            cells.push(`
                <div class="cal-cell${isOther ? ' other-month' : ''}${isToday ? ' today' : ''}" data-cal-date="${iso}">
                    <div class="cal-day-num">
                        <span>${d.getDate()}${isToday ? ' · Today' : ''}</span>
                        <button type="button" class="cal-add-btn" data-cal-add="${iso}" title="Schedule a game on ${iso}">+</button>
                    </div>
                    ${dayEvents.map(ev => `
                        <div class="cal-event ${ev.kind === 'twitch' ? 'twitch-synced' : ev.kind === 'tonight' ? 'tonight-ev' : ev.kind === 'played' ? 'played-ev' : ''}" data-cal-item="${esc(ev.id)}" data-cal-ev-date="${iso}" data-cal-ev-kind="${ev.kind}" title="${esc(ev.item.name)} (${esc(ev.time)}) — click to edit, right-click for actions">
                            <div class="cal-ev-header">
                                <span class="ev-time">${esc(formatEvTime(ev.time))}</span>
                                <button type="button" class="ev-menu-btn" data-cal-menu="${esc(ev.id)}" data-cal-menu-date="${iso}" data-cal-menu-kind="${ev.kind}" title="Actions">${ICONS.more}</button>
                            </div>
                            <div class="ev-name" title="${esc(ev.item.name)}">${esc(ev.item.name)}</div>
                        </div>
                    `).join('')}
                </div>
            `);
        }
    }

    const currentYear = now.getFullYear();
    const allStreamYears = state.items.flatMap(item => [
        item.streamDate,
        ...(item.streamDates || []).map(d => d && d.date),
        ...(item.played || [])
    ]).filter(Boolean).map(d => Number(String(d).slice(0, 4))).filter(n => Number.isFinite(n) && n > 2000 && n < 2100);
    const minYear = Math.min(currentYear - 3, ...allStreamYears, activeYear);
    const maxYear = Math.max(currentYear + 5, ...allStreamYears, activeYear);
    const yearsList = [];
    for (let y = minYear; y <= maxYear; y++) yearsList.push(y);

    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    if (state.viewState.search) {
        const matchCount = filteredItems.length;
        if ($('v-count')) $('v-count').textContent = `${matchCount} game${matchCount === 1 ? '' : 's'} found`;
    } else {
        if ($('v-count')) $('v-count').textContent = '';
    }

    cal.innerHTML = `
        <div class="cal-bar">
            <div class="cal-bar-left">
                <div class="cal-title">
                    ${ICONS.calendar}
                    <span>${esc(titleLabel)}</span>
                </div>
                <div class="view-toggle" id="cal-mode-toggle">
                    <button type="button" class="tab${state.calMode === 'month' ? ' active' : ''}" data-cal-mode="month">Month</button>
                    <button type="button" class="tab${state.calMode === 'week' ? ' active' : ''}" data-cal-mode="week">Week</button>
                </div>
            </div>
            <div class="cal-legend">
                <span><i class="cal-dot" style="background:var(--accent)"></i>Scheduled</span>
                <span><i class="cal-dot" style="background:#9146ff"></i>Twitch Synced</span>
                <span><i class="cal-dot" style="background:var(--success)"></i>Tonight</span>
                <span><i class="cal-dot" style="background:var(--text-muted)"></i>Streamed</span>
                <span style="opacity:0.8;">· Right-click event for options</span>
            </div>
            <div class="cal-nav-wrap">
                <div class="cal-jump-group" title="Go to a specific month, year, or date">
                    <span class="cal-jump-label">Go to</span>
                    <select id="cal-jump-month" class="cal-jump-select" title="Go to month" aria-label="Go to month">
                        ${monthNames.map((name, idx) => `<option value="${idx}"${idx === activeMonth ? ' selected' : ''}>${name}</option>`).join('')}
                    </select>
                    <select id="cal-jump-year" class="cal-jump-select" title="Go to year" aria-label="Go to year">
                        ${yearsList.map(y => `<option value="${y}"${y === activeYear ? ' selected' : ''}>${y}</option>`).join('')}
                    </select>
                    <input type="date" id="cal-jump-date" class="cal-jump-date" value="${esc(activeIso)}" title="Go to specific date or week" aria-label="Go to specific date or week">
                </div>
                <div class="cal-nav-btns">
                    <button type="button" class="btn" id="cal-prev" title="Previous ${state.calMode === 'week' ? 'week' : 'month'}">‹ Prev</button>
                    <button type="button" class="btn" id="cal-today" title="Go to current ${state.calMode === 'week' ? 'week' : 'month'}">Today</button>
                    <button type="button" class="btn" id="cal-next" title="Next ${state.calMode === 'week' ? 'week' : 'month'}">Next ›</button>
                </div>
            </div>
        </div>
        <div class="cal-grid">
            ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => `<div class="cal-dow">${d}</div>`).join('')}
            ${cells.join('')}
        </div>
    `;
}

export function initCalendarHandlers(renderCallback, scheduleSaveCallback, openDialogCallback, moveToCallback, setStatusCallback) {
    $('cal-view')?.addEventListener('click', event => {
        const modeBtn = event.target.closest('[data-cal-mode]');
        if (modeBtn) {
            const nextMode = modeBtn.dataset.calMode;
            if (nextMode !== state.calMode) {
                const now = new Date();
                if (nextMode === 'week') {
                    const targetMonth = new Date(now.getFullYear(), now.getMonth() + state.calMonthOffset, 1);
                    const isThisMonth = targetMonth.getFullYear() === now.getFullYear() && targetMonth.getMonth() === now.getMonth();
                    if (isThisMonth) {
                        state.calWeekOffset = 0;
                    } else {
                        const nowSun = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
                        const targetSun = new Date(targetMonth.getFullYear(), targetMonth.getMonth(), targetMonth.getDate() - targetMonth.getDay());
                        state.calWeekOffset = Math.round((targetSun - nowSun) / (7 * 86400000));
                    }
                } else if (nextMode === 'month') {
                    const currentWeekSun = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay() + (state.calWeekOffset * 7));
                    state.calMonthOffset = (currentWeekSun.getFullYear() - now.getFullYear()) * 12 + (currentWeekSun.getMonth() - now.getMonth());
                }
                state.calMode = nextMode;
                saveUiState();
                renderCalendar();
            }
            return;
        }
        if (event.target.closest('#cal-prev')) {
            if (state.calMode === 'week') state.calWeekOffset--;
            else state.calMonthOffset--;
            renderCalendar();
            return;
        }
        if (event.target.closest('#cal-today')) {
            state.calWeekOffset = 0;
            state.calMonthOffset = 0;
            renderCalendar();
            return;
        }
        if (event.target.closest('#cal-next')) {
            if (state.calMode === 'week') state.calWeekOffset++;
            else state.calMonthOffset++;
            renderCalendar();
            return;
        }
        const menuBtn = event.target.closest('[data-cal-menu]');
        if (menuBtn) {
            event.stopPropagation();
            const item = state.items.find(entry => entry.id === menuBtn.dataset.calMenu);
            const rect = menuBtn.getBoundingClientRect();
            openCalCtxMenu(item, menuBtn.dataset.calMenuDate, menuBtn.dataset.calMenuKind, rect.left, rect.bottom + 4);
            return;
        }
        const evEl = event.target.closest('[data-cal-item]');
        if (evEl) {
            const item = state.items.find(entry => entry.id === evEl.dataset.calItem);
            if (item && openDialogCallback) openDialogCallback(item);
            return;
        }
        const addBtn = event.target.closest('[data-cal-add]');
        if (addBtn) {
            state.calPickDate = addBtn.dataset.calAdd;
            $('cal-pick-title').textContent = `Schedule Game on ${state.calPickDate}`;
            $('cal-pick-search').value = '';
            renderCalPickList();
            if (!$('cal-pick-dlg').open) $('cal-pick-dlg').showModal();
        }
    });

    $('cal-view')?.addEventListener('contextmenu', event => {
        const evEl = event.target.closest('[data-cal-item]');
        if (!evEl) return;
        event.preventDefault();
        const item = state.items.find(entry => entry.id === evEl.dataset.calItem);
        if (item) {
            openCalCtxMenu(item, evEl.dataset.calEvDate, evEl.dataset.calEvKind, event.clientX, event.clientY);
        }
    });

    $('cal-view')?.addEventListener('change', event => {
        const now = new Date();
        if (event.target.id === 'cal-jump-month' || event.target.id === 'cal-jump-year') {
            const monthSel = document.getElementById('cal-jump-month');
            const yearSel = document.getElementById('cal-jump-year');
            if (!monthSel || !yearSel) return;
            const newMonth = parseInt(monthSel.value, 10);
            const newYear = parseInt(yearSel.value, 10);
            if (state.calMode === 'month') {
                state.calMonthOffset = (newYear - now.getFullYear()) * 12 + (newMonth - now.getMonth());
            } else {
                const targetDate = new Date(newYear, newMonth, 1);
                const nowSun = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
                const targetSun = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate() - targetDate.getDay());
                state.calWeekOffset = Math.round((targetSun - nowSun) / (7 * 86400000));
            }
            renderCalendar();
            return;
        }
        if (event.target.id === 'cal-jump-date') {
            const val = event.target.value;
            if (!val) return;
            const [y, m, d] = val.split('-').map(Number);
            const targetDate = new Date(y, m - 1, d);
            if (isNaN(targetDate.getTime())) return;
            if (state.calMode === 'week') {
                const nowSun = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
                const targetSun = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate() - targetDate.getDay());
                state.calWeekOffset = Math.round((targetSun - nowSun) / (7 * 86400000));
            } else {
                state.calMonthOffset = (y - now.getFullYear()) * 12 + ((m - 1) - now.getMonth());
            }
            renderCalendar();
            return;
        }
    });

    $('cal-pick-search')?.addEventListener('input', renderCalPickList);
    $('cal-pick-close')?.addEventListener('click', () => $('cal-pick-dlg')?.close());
    $('cal-pick-list')?.addEventListener('click', event => {
        const btn = event.target.closest('[data-pick-game]');
        if (!btn || !state.calPickDate) return;
        const item = state.items.find(entry => entry.id === btn.dataset.pickGame);
        if (!item) return;
        addDateToItem(item, state.calPickDate);
        $('cal-pick-dlg')?.close();
        if (renderCallback) renderCallback();
        if (scheduleSaveCallback) scheduleSaveCallback();
        if (setStatusCallback) setStatusCallback(`Scheduled "${item.name}" on ${state.calPickDate}`);
    });

    $('cal-ctx-menu')?.addEventListener('click', async event => {
        const btn = event.target.closest('[data-ctx-action]');
        if (!btn || !calCtxTarget) return;
        const { item, isoDate } = calCtxTarget;
        const action = btn.dataset.ctxAction;
        closeCalCtxMenu();

        if (action === 'edit') {
            if (openDialogCallback) openDialogCallback(item);
            return;
        }
        if (action === 'dup-tmrw' || action === 'dup-week') {
            const targetDate = btn.dataset.targetDate;
            addDateToItem(item, targetDate);
            if (renderCallback) renderCallback();
            if (scheduleSaveCallback) scheduleSaveCallback();
            if (setStatusCallback) setStatusCallback(`Duplicated "${item.name}" onto ${targetDate}`);
            return;
        }
        if (action === 'dup-pick') {
            const promptFn = window.StreamPulse?.prompt || window.prompt;
            const picked = await promptFn('Duplicate to Date', `Enter a date (YYYY-MM-DD) to also schedule "${item.name}":`, isoDate || localDay(new Date()));
            if (picked && /^\d{4}-\d{2}-\d{2}$/.test(picked.trim())) {
                addDateToItem(item, picked.trim());
                if (renderCallback) renderCallback();
                if (scheduleSaveCallback) scheduleSaveCallback();
                if (setStatusCallback) setStatusCallback(`Duplicated "${item.name}" onto ${picked.trim()}`);
            }
            return;
        }
        if (action === 'play-now') {
            if (item.status !== 'tonight' && moveToCallback) moveToCallback(item, 'tonight');
            state.items.forEach(g => { g.playingNow = (g.id === item.id); });
            if (renderCallback) renderCallback();
            fetch('/api/game-plan/now', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: item.id })
            }).catch(() => {});
            if (scheduleSaveCallback) scheduleSaveCallback();
            if (setStatusCallback) setStatusCallback(`Now playing on stream: ${item.name}`);
            return;
        }
        if (action === 'move-tonight') {
            if (moveToCallback) moveToCallback(item, 'tonight');
            if (renderCallback) renderCallback();
            if (scheduleSaveCallback) scheduleSaveCallback();
            if (setStatusCallback) setStatusCallback(`Moved "${item.name}" to Tonight's Lineup`);
            return;
        }
        if (action === 'move-up-next') {
            if (moveToCallback) moveToCallback(item, 'up-next');
            if (renderCallback) renderCallback();
            if (scheduleSaveCallback) scheduleSaveCallback();
            if (setStatusCallback) setStatusCallback(`Moved "${item.name}" to Up Next`);
            return;
        }
        if (action === 'remove-date') {
            removeDateFromItem(item, isoDate);
            if (renderCallback) renderCallback();
            if (scheduleSaveCallback) scheduleSaveCallback();
            if (setStatusCallback) setStatusCallback(`Removed "${item.name}" from ${isoDate}`);
            return;
        }
        if (action === 'delete-game') {
            const confirmFn = window.StreamPulse?.confirm || window.confirm;
            if (!await confirmFn('Remove Game', `Remove “${item.name}” from the plan?`, { danger: true, confirmText: 'Remove' })) return;
            state.items = state.items.filter(entry => entry !== item);
            if (renderCallback) renderCallback();
            if (scheduleSaveCallback) scheduleSaveCallback();
            if (setStatusCallback) setStatusCallback(`Removed "${item.name}" from the plan`);
        }
    });

    $('board')?.addEventListener('input', event => {
        const label = event.target.closest('[data-tier-label]');
        const color = event.target.closest('[data-tier-color]');
        if (label) { const tier = ownTiers(state.active).find(entry => entry.id === label.dataset.tierLabel); if (tier && label.value.trim()) { tier.label = label.value.trim(); if (scheduleSaveCallback) scheduleSaveCallback(); } }
        if (color) { const tier = ownTiers(state.active).find(entry => entry.id === color.dataset.tierColor); if (tier) { tier.color = color.value; color.closest('.tlabel').style.background = color.value; if (scheduleSaveCallback) scheduleSaveCallback(); } }
    });

    $('board')?.addEventListener('click', event => {
        const button = event.target.closest('button');
        const tile = event.target.closest('.tile');
        if (tile && !button) { const item = state.items.find(entry => entry.id === tile.dataset.id); if (item && openDialogCallback) openDialogCallback(item); return; }
        if (!button) return;
        const mine = ownTiers(state.active);
        const swap = (id, step) => { const index = mine.findIndex(entry => entry.id === id); const other = index + step; if (index < 0 || other < 0 || other >= mine.length) return; [mine[index], mine[other]] = [mine[other], mine[index]]; };
        if (button.dataset.tierUp) swap(button.dataset.tierUp, -1);
        else if (button.dataset.tierDown) swap(button.dataset.tierDown, 1);
        else if (button.dataset.tierDel) { const id = button.dataset.tierDel; state.tierSets[state.active] = mine.filter(entry => entry.id !== id); state.items.forEach(item => { if (item.status === state.active && item.tier === id) item.tier = ''; }); }
        else if (button.id === 'tier-add') { if (mine.length >= 12) return setStatusCallback ? setStatusCallback('Up to 12 tiers.') : null; mine.push({ id: `t-${Math.random().toString(36).slice(2, 7)}`, label: 'New tier', color: TIER_COLORS[mine.length % TIER_COLORS.length] }); }
        else if (button.id === 'tier-reset') { state.tierSets[state.active] = DEFAULT_TIERS.map(entry => ({ ...entry })); state.items.forEach(item => { if (item.status === state.active && !state.tierSets[state.active].some(entry => entry.id === item.tier)) item.tier = ''; }); }
        else return;
        if (renderCallback) renderCallback();
        if (scheduleSaveCallback) scheduleSaveCallback();
    });
}

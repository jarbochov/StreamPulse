/**
 * StreamPulse — Game Plan Details Dialog & Asset Library Module
 */

import {
    $,
    ICONS,
    state,
    esc,
    localDay,
    allLists,
    homeListId,
    isTonightItem,
    starsHtml,
    starValue,
    setStatus,
    tiersOf
} from './game-plan-state.js';

let cachedAssets = [];
let catTimer = null;

export function readExtraDatesFromDom() {
    if (!state.editing) return [];
    const list = $('f-stream-dates-list');
    if (!list) return Array.isArray(state.editing.streamDates) ? state.editing.streamDates : [];
    const rows = list.querySelectorAll('[data-date-idx]');
    const out = [];
    rows.forEach((row, idx) => {
        const dateInput = row.querySelector('[data-extra-date]');
        const timeInput = row.querySelector('[data-extra-time]');
        const date = (dateInput?.value || '').trim();
        const time = (timeInput?.value || '').trim();
        const prev = (Array.isArray(state.editing.streamDates) && state.editing.streamDates[idx]) || {};
        out.push({
            date,
            time: time || state.editing.streamTime || '19:00',
            segmentId: prev.segmentId || ''
        });
    });
    return out;
}

export function syncEditingFromDom() {
    if (!state.editing) return;
    const name = $('f-name')?.value.trim();
    if (name) state.editing.name = name;
    if ($('f-tier')) state.editing.tier = $('f-tier').value;
    if ($('f-game-type')) state.editing.gameType = $('f-game-type').value;
    if ($('f-status')) state.editing.status = $('f-status').value;
    if ($('f-tonight')) {
        state.editing.tonight = $('f-tonight').checked;
        if (!state.editing.tonight && state.editing.status === 'tonight') {
            state.editing.status = homeListId(state.editing);
        }
    }
    if ($('f-twitch-category')) state.editing.twitchCategory = $('f-twitch-category').value.trim();
    if ($('f-stream-date')) state.editing.streamDate = $('f-stream-date').value;
    if ($('f-stream-time')) state.editing.streamTime = $('f-stream-time').value;
    if ($('f-stream-duration')) state.editing.streamDuration = Number($('f-stream-duration').value) || 180;
    if ($('f-stream-recurring')) state.editing.streamRecurring = $('f-stream-recurring').checked;
    if ($('f-period')) state.editing.period = $('f-period').value.trim();
    if ($('f-finished')) state.editing.finished = $('f-finished').value;
    if ($('f-note')) state.editing.note = $('f-note').value.trim();
    if ($('f-system')) state.editing.system = $('f-system').value.trim().slice(0, 40);
    state.editing.streamDates = readExtraDatesFromDom();
}

export function paintDialog() {
    const item = state.editing;
    if (!item) return;
    $('dlg-title').textContent = item.name;
    $('dlg-badges').innerHTML = `
        ${item.custom ? '<span class="badge custom-badge">Custom</span>' : '<span class="badge playthrough-badge">IGDB</span>'}
        ${item.twitchSegmentId ? '<span class="badge twitch-badge">Twitch Synced</span>' : ''}
    `;
    $('dlg-cover').innerHTML = item.cover ? `<img src="${esc(item.cover)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:8px">` : (item.custom ? ICONS.image : ICONS.game);
    $('f-rating').innerHTML = starsHtml(item.rating || 0, 'data-dstar');
    $('f-cover').value = item.customCover || '';
    paintCategoryChips();
}

export function paintCategoryChips() {
    if (!state.editing) return;
    const currentCat = ($('f-twitch-category')?.value || '').trim();
    document.querySelectorAll('#f-cat-chips [data-cat]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.cat === currentCat);
    });
}

export function paintExtra() {
    const choices = state.customLists.filter(list => list.id !== state.editing.status);
    $('f-extra-wrap').hidden = !choices.length;
    $('f-extra').innerHTML = choices.map(list => `<label><input type="checkbox" data-extra="${esc(list.id)}"${(state.editing.extraLists || []).includes(list.id) ? ' checked' : ''}>${esc(list.name)}</label>`).join('');
}

export function getAllSelectedDates() {
    if (!state.editing) return [];
    const primary = ($('f-stream-date')?.value || state.editing.streamDate || '').trim();
    const extras = (Array.isArray(state.editing.streamDates) ? state.editing.streamDates : []).map(d => (d?.date || '').trim()).filter(Boolean);
    return [...new Set([primary, ...extras].filter(Boolean))].sort();
}

export function setAllSelectedDates(dates) {
    if (!state.editing) return;
    const unique = [...new Set(dates.filter(Boolean))].sort();
    const defaultTime = $('f-stream-time')?.value || state.editing.streamTime || '19:00';
    const existingMap = new Map();
    if (state.editing.streamDate) existingMap.set(state.editing.streamDate, { time: state.editing.streamTime || defaultTime, segmentId: state.editing.twitchSegmentId || '' });
    (state.editing.streamDates || []).forEach(slot => {
        if (slot && slot.date) existingMap.set(slot.date, { time: slot.time || defaultTime, segmentId: slot.segmentId || '' });
    });
    state.editing.streamDate = unique[0] || '';
    $('f-stream-date').value = state.editing.streamDate;
    state.editing.streamDates = unique.slice(1).map(d => ({
        date: d,
        time: existingMap.get(d)?.time || defaultTime,
        segmentId: existingMap.get(d)?.segmentId || ''
    }));
    paintStreamDates();
    paintQuickDays();
    updateTwitchStatusHint();
}

export function paintQuickDays() {
    const strip = $('f-quick-days');
    const chipsBox = $('f-selected-dates-chips');
    if (!strip || !state.editing) return;
    const selected = new Set(getAllSelectedDates());
    const now = new Date();
    const days = [];
    const dowNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    for (let i = 0; i < 14; i++) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
        const iso = localDay(d);
        const label = i === 0 ? 'Today' : i === 1 ? 'Tmrw' : dowNames[d.getDay()];
        const md = `${d.getMonth() + 1}/${d.getDate()}`;
        days.push({ iso, label, md, active: selected.has(iso) });
    }
    strip.innerHTML = days.map(day => `
        <button type="button" class="day-pill${day.active ? ' active' : ''}" data-quick-date="${day.iso}" title="Toggle ${day.iso}">
            <span class="dow">${day.label}</span>
            <span class="md">${day.md}</span>
        </button>
    `).join('');

    const allDates = [...selected];
    if (!allDates.length) {
        chipsBox.hidden = true;
        chipsBox.innerHTML = '';
    } else {
        chipsBox.hidden = false;
        chipsBox.innerHTML = `<span style="font-size:0.72rem;color:var(--text-muted);font-weight:600;">Selected (${allDates.length} day${allDates.length === 1 ? '' : 's'}):</span>` +
            allDates.map(d => {
                const dt = new Date(`${d}T00:00:00`);
                const nice = isNaN(dt) ? d : dt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
                return `<span class="sdate-chip">${ICONS.calendar} ${esc(nice)} <button type="button" data-unpick-date="${esc(d)}" title="Remove ${esc(d)}">${ICONS.close}</button></span>`;
            }).join('');
    }
}

export function updateTwitchStatusHint() {
    if (!state.editing) return;
    const allDates = getAllSelectedDates();
    const segCount = (state.editing.twitchSegmentIds?.length || (state.editing.twitchSegmentId ? 1 : 0));
    if (segCount > 0) {
        $('f-twitch-status').textContent = `Synced (${segCount} slot${segCount === 1 ? '' : 's'}) · Click Save & Sync to update`;
    } else if (allDates.length > 0) {
        $('f-twitch-status').textContent = `${allDates.length} day${allDates.length === 1 ? '' : 's'} ready to sync to Twitch`;
    } else {
        $('f-twitch-status').textContent = 'Click one or more days above to schedule';
    }
}

export function paintStreamDates() {
    const list = $('f-stream-dates-list');
    if (!state.editing || !list) return;
    if (!Array.isArray(state.editing.streamDates)) state.editing.streamDates = [];
    if (!state.editing.streamDates.length) {
        list.innerHTML = '<span style="font-size:0.73rem;color:var(--text-muted);font-style:italic;">Click multiple days in the calendar strip above, or click "+ Add Date" for custom per-day times.</span>';
        return;
    }
    list.innerHTML = state.editing.streamDates.map((slot, idx) => `
        <div style="display:flex;gap:0.4rem;align-items:center;" data-date-idx="${idx}">
            <input type="date" value="${esc(slot.date || '')}" style="flex:1;" data-extra-date>
            <input type="time" value="${esc(slot.time || state.editing.streamTime || '19:00')}" style="width:115px;" data-extra-time>
            <button type="button" class="btn ghost danger" style="padding:0.2rem 0.5rem;" title="Remove this date" data-remove-date>${ICONS.close}</button>
        </div>
    `).join('');
}

export function switchDialogTab(tabName = 'details') {
    const valid = ['details', 'schedule', 'notes'].includes(tabName) ? tabName : 'details';
    document.querySelectorAll('.dlg-tab[data-dlg-tab]').forEach(btn => {
        const active = btn.dataset.dlgTab === valid;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    document.querySelectorAll('.dlg-panel[data-dlg-panel]').forEach(panel => {
        panel.hidden = panel.dataset.dlgPanel !== valid;
    });
}

export function openDialog(item, initialTab = 'details') {
    state.editing = item;
    if (!Array.isArray(state.editing.streamDates)) state.editing.streamDates = [];
    if (!Array.isArray(state.editing.twitchSegmentIds)) state.editing.twitchSegmentIds = state.editing.twitchSegmentId ? [state.editing.twitchSegmentId] : [];
    const effectiveHome = homeListId(item);
    $('f-name').value = item.name;
    $('f-name').disabled = false;
    $('f-tier').innerHTML = '<option value="">Unranked</option>' + tiersOf(effectiveHome).map(tier => `<option value="${esc(tier.id)}">${esc(tier.label)}</option>`).join('');
    $('f-tier').value = item.tier || '';
    $('f-game-type').value = item.gameType || 'playthrough';
    $('f-status').innerHTML = allLists()
        .filter(list => list.id !== 'tonight')
        .map(list => `<option value="${esc(list.id)}"${list.id === effectiveHome ? ' selected' : ''}>${esc(list.name)}</option>`)
        .join('');
    if ($('f-tonight')) $('f-tonight').checked = isTonightItem(item);
    $('f-twitch-category').value = item.twitchCategory || (item.custom ? 'Just Chatting' : '');
    paintExtra();
    $('f-stream-date').value = item.streamDate || '';
    $('f-stream-time').value = item.streamTime || '19:00';
    $('f-stream-duration').value = String(item.streamDuration || 180);
    $('f-stream-recurring').checked = item.streamRecurring === true;
    paintStreamDates();
    paintQuickDays();
    const segCount = (state.editing.twitchSegmentIds?.length || (state.editing.twitchSegmentId ? 1 : 0));
    const hasTwitch = segCount > 0;
    $('f-del-twitch').hidden = !hasTwitch;
    $('f-push-twitch').textContent = hasTwitch ? 'Save & Re-sync Twitch' : 'Save & Sync to Twitch Schedule';
    updateTwitchStatusHint();
    $('f-period').value = item.period || '';
    $('f-finished').value = item.finished || '';
    $('f-tags').value = (item.tags || []).join(', ');
    $('f-note').value = item.note || '';
    $('f-system').value = item.system || '';
    paintDialog();
    switchDialogTab(initialTab);
    if (!$('dlg').open) $('dlg').showModal();
}

export function renderAssetGrid() {
    const grid = $('asset-grid');
    const status = $('asset-status');
    if (!grid || !status) return;
    const q = ($('asset-search')?.value || '').trim().toLowerCase();
    const tag = $('asset-tag-filter')?.value || '';
    const filtered = cachedAssets.filter(asset => {
        if (tag && !(asset.tags || []).includes(tag)) return false;
        if (q && !(asset.label || asset.name || '').toLowerCase().includes(q) && !(asset.name || '').toLowerCase().includes(q) && !(asset.tags || []).some(t => t.toLowerCase().includes(q))) return false;
        return true;
    });
    if (!filtered.length) {
        grid.innerHTML = '';
        status.textContent = cachedAssets.length ? 'No matching image assets found.' : 'No images in your Asset Library yet. Upload one with the Upload button!';
        return;
    }
    status.textContent = `Showing ${filtered.length} image asset${filtered.length === 1 ? '' : 's'} — click one to use as cover artwork.`;
    grid.innerHTML = filtered.map(asset => `
        <button type="button" class="asset-card" data-asset-url="${esc(asset.url)}" title="${esc(asset.label || asset.name)}">
            <img src="${esc(asset.url)}" alt="${esc(asset.label || asset.name)}" loading="lazy">
            <span class="asset-name">${esc(asset.label || asset.name)}</span>
        </button>
    `).join('');
}

export async function uploadCover(file, commitCallback) {
    const types = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml' };
    const type = file.type && file.type.startsWith('image/') ? file.type : types[(file.name.split('.').pop() || '').toLowerCase()];
    if (!type) { setStatus('Choose a PNG, JPEG, GIF, WebP or SVG image.'); return; }
    try {
        const response = await fetch('/api/custom-overlays/assets', { method: 'POST', headers: { 'Content-Type': type, 'X-Asset-Name': (file.name || 'cover.png').replace(/[^\x20-\x7e]+/g, '-') }, body: file });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Upload failed');
        state.editing.customCover = data.url;
        state.editing.cover = data.url;
        paintDialog();
        if (commitCallback) commitCallback(true);
    } catch (error) { setStatus(`Upload failed: ${error.message}`); }
}

export function initDialogHandlers(commitCallback, renderCallback, scheduleSaveCallback, refreshMetaCallback, moveToCallback) {
    $('f-extra')?.addEventListener('change', () => {
        if (!state.editing) return;
        state.editing.extraLists = [...$('f-extra').querySelectorAll('input:checked')].map(box => box.dataset.extra);
        if (commitCallback) commitCallback(true);
    });

    $('f-rating')?.addEventListener('click', event => {
        const star = event.target.closest('[data-dstar]');
        if (!star || !state.editing) return;
        const value = starValue(event, star, 'dstar');
        state.editing.rating = state.editing.rating === value ? 0 : value;
        paintDialog();
        if (commitCallback) commitCallback(true);
    });

    $('f-tier')?.addEventListener('change', () => {
        if (state.editing) {
            state.editing.tier = $('f-tier').value;
            if (commitCallback) commitCallback(false);
        }
    });

    $('f-game-type')?.addEventListener('change', () => {
        if (state.editing) {
            state.editing.gameType = $('f-game-type').value;
            if (commitCallback) commitCallback(true);
        }
    });

    $('f-cat-chips')?.addEventListener('click', event => {
        const chip = event.target.closest('[data-cat]');
        if (!chip || !state.editing) return;
        $('f-twitch-category').value = chip.dataset.cat;
        state.editing.twitchCategory = chip.dataset.cat;
        paintCategoryChips();
        if (commitCallback) commitCallback(true);
    });

    $('f-twitch-category')?.addEventListener('input', () => {
        if (!state.editing) return;
        state.editing.twitchCategory = $('f-twitch-category').value.trim();
        paintCategoryChips();
        clearTimeout(catTimer);
        const q = state.editing.twitchCategory;
        if (!q || q === '__none__' || q.length < 2) return;
        catTimer = setTimeout(async () => {
            try {
                const { results } = await (await fetch(`/api/twitch-categories?q=${encodeURIComponent(q)}`)).json();
                if (Array.isArray(results) && $('twitch-cat-list')) {
                    $('twitch-cat-list').innerHTML = results.map(r => `<option value="${esc(r.name)}">`).join('');
                }
            } catch {}
        }, 250);
    });

    $('f-twitch-category')?.addEventListener('change', () => {
        if (!state.editing) return;
        state.editing.twitchCategory = $('f-twitch-category').value.trim();
        paintCategoryChips();
        if (commitCallback) commitCallback(true);
    });

    $('f-quick-days')?.addEventListener('click', event => {
        const pill = event.target.closest('[data-quick-date]');
        if (!pill || !state.editing) return;
        const targetDate = pill.dataset.quickDate;
        const current = getAllSelectedDates();
        const next = current.includes(targetDate)
            ? current.filter(d => d !== targetDate)
            : [...current, targetDate];
        setAllSelectedDates(next);
        if (commitCallback) commitCallback(true);
    });

    $('f-selected-dates-chips')?.addEventListener('click', event => {
        const btn = event.target.closest('[data-unpick-date]');
        if (!btn || !state.editing) return;
        const targetDate = btn.dataset.unpickDate;
        setAllSelectedDates(getAllSelectedDates().filter(d => d !== targetDate));
        if (commitCallback) commitCallback(true);
    });

    $('f-clear-dates')?.addEventListener('click', () => {
        if (!state.editing) return;
        setAllSelectedDates([]);
        if (commitCallback) commitCallback(true);
    });

    $('f-stream-date')?.addEventListener('change', () => {
        if (state.editing) {
            state.editing.streamDate = $('f-stream-date').value;
            paintQuickDays();
            updateTwitchStatusHint();
            if (commitCallback) commitCallback(true);
        }
    });

    ['change', 'input'].forEach(evt => $('f-stream-time')?.addEventListener(evt, () => {
        if (state.editing) {
            state.editing.streamTime = $('f-stream-time').value;
            if (commitCallback) commitCallback(true);
        }
    }));

    $('f-stream-duration')?.addEventListener('change', () => {
        if (state.editing) {
            state.editing.streamDuration = Number($('f-stream-duration').value) || 180;
            if (commitCallback) commitCallback(false);
        }
    });

    $('f-stream-recurring')?.addEventListener('change', () => {
        if (state.editing) {
            state.editing.streamRecurring = $('f-stream-recurring').checked;
            if (commitCallback) commitCallback(true);
        }
    });

    $('f-add-date')?.addEventListener('click', () => {
        if (!state.editing) return;
        state.editing.streamDates = readExtraDatesFromDom();
        state.editing.streamDates.push({ date: '', time: state.editing.streamTime || '19:00', segmentId: '' });
        paintStreamDates();
        paintQuickDays();
        if (scheduleSaveCallback) scheduleSaveCallback();
        const list = $('f-stream-dates-list');
        const newInputs = list?.querySelectorAll('[data-extra-date]');
        if (newInputs && newInputs.length) newInputs[newInputs.length - 1].focus();
    });

    function onStreamDatesChange() {
        if (!state.editing) return;
        state.editing.streamDates = readExtraDatesFromDom();
        paintQuickDays();
        updateTwitchStatusHint();
        if (scheduleSaveCallback) scheduleSaveCallback();
    }
    $('f-stream-dates-list')?.addEventListener('input', onStreamDatesChange);
    $('f-stream-dates-list')?.addEventListener('change', onStreamDatesChange);
    $('f-stream-dates-list')?.addEventListener('click', event => {
        if (!state.editing) return;
        const btn = event.target.closest('[data-remove-date]');
        if (!btn) return;
        const row = btn.closest('[data-date-idx]');
        if (!row) return;
        const idx = parseInt(row.dataset.dateIdx, 10);
        if (isNaN(idx)) return;
        state.editing.streamDates = readExtraDatesFromDom();
        state.editing.streamDates.splice(idx, 1);
        paintStreamDates();
        paintQuickDays();
        updateTwitchStatusHint();
        if (scheduleSaveCallback) scheduleSaveCallback();
    });

    $('f-push-twitch')?.addEventListener('click', async () => {
        if (!state.editing) return;
        syncEditingFromDom();
        const hasMainDate = Boolean(state.editing.streamDate);
        const hasExtraDates = Array.isArray(state.editing.streamDates) && state.editing.streamDates.some(d => Boolean(d.date));
        if (!hasMainDate && !hasExtraDates) {
            $('f-twitch-status').textContent = 'Click at least one day in the calendar strip above first';
            return;
        }
        $('f-twitch-status').textContent = 'Saving & syncing to Twitch Schedule…';
        try {
            const res = await fetch('/api/game-plan/twitch-schedule', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    itemId: state.editing.id,
                    streamDate: state.editing.streamDate,
                    streamTime: state.editing.streamTime || '19:00',
                    streamDuration: state.editing.streamDuration || 180,
                    streamRecurring: Boolean(state.editing.streamRecurring),
                    streamDates: state.editing.streamDates,
                    twitchCategory: state.editing.twitchCategory || ''
                })
            });
            const data = await res.json();
            if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to sync');
            state.editing.twitchSegmentId = data.segment?.id || 'synced';
            state.editing.twitchSegmentIds = (data.segments || []).map(s => s.id);
            $('f-del-twitch').hidden = false;
            $('f-push-twitch').textContent = 'Save & Re-sync Twitch';
            const count = (data.segments?.length || 1);
            $('f-twitch-status').textContent = `Synced ${count} slot${count === 1 ? '' : 's'} to Twitch Schedule!`;
            paintDialog();
            paintStreamDates();
            if (commitCallback) commitCallback(true);
        } catch (e) {
            $('f-twitch-status').textContent = `Error: ${e.message}`;
        }
    });

    $('f-del-twitch')?.addEventListener('click', async () => {
        if (!state.editing) return;
        $('f-twitch-status').textContent = 'Removing…';
        try {
            const res = await fetch('/api/game-plan/twitch-schedule', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ itemId: state.editing.id })
            });
            const data = await res.json();
            if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to delete');
            state.editing.twitchSegmentId = '';
            state.editing.twitchSegmentIds = [];
            if (Array.isArray(state.editing.streamDates)) {
                state.editing.streamDates.forEach(d => { d.segmentId = ''; });
            }
            $('f-del-twitch').hidden = true;
            $('f-push-twitch').textContent = 'Save & Sync to Twitch Schedule';
            $('f-twitch-status').textContent = 'Removed from Twitch schedule.';
            paintDialog();
            paintStreamDates();
            if (commitCallback) commitCallback(true);
        } catch (e) {
            $('f-twitch-status').textContent = `Error: ${e.message}`;
        }
    });

    $('f-name')?.addEventListener('change', () => {
        const name = $('f-name').value.trim();
        if (state.editing && name) {
            state.editing.name = name;
            paintDialog();
            if (commitCallback) commitCallback(true);
        }
    });

    $('f-note')?.addEventListener('change', () => {
        if (state.editing) {
            state.editing.note = $('f-note').value.trim();
            if (commitCallback) commitCallback(true);
        }
    });

    $('f-period')?.addEventListener('change', () => {
        if (state.editing) {
            state.editing.period = $('f-period').value.trim();
            if (commitCallback) commitCallback(true);
        }
    });

    $('f-finished')?.addEventListener('change', () => {
        if (state.editing) {
            state.editing.finished = $('f-finished').value;
            if (commitCallback) commitCallback(false);
        }
    });

    $('f-system')?.addEventListener('change', () => {
        if (state.editing) {
            state.editing.system = $('f-system').value.trim().slice(0, 40);
            if (commitCallback) commitCallback(true);
        }
    });

    $('f-tags')?.addEventListener('change', () => {
        if (state.editing) {
            state.editing.tags = [...new Set($('f-tags').value.split(',').map(tag => tag.trim().slice(0, 24)).filter(Boolean))].slice(0, 8);
            $('f-tags').value = state.editing.tags.join(', ');
            if (commitCallback) commitCallback(true);
        }
    });

    document.querySelectorAll('.dlg-tab[data-dlg-tab]').forEach(btn => {
        btn.addEventListener('click', () => switchDialogTab(btn.dataset.dlgTab));
    });

    $('f-tonight')?.addEventListener('change', () => {
        if (!state.editing) return;
        state.editing.tonight = $('f-tonight').checked;
        if (!state.editing.tonight && state.editing.status === 'tonight') {
            state.editing.status = homeListId(state.editing);
        }
        if (commitCallback) commitCallback(true);
    });

    $('f-status')?.addEventListener('change', () => {
        if (state.editing && moveToCallback) {
            moveToCallback(state.editing, $('f-status').value);
            paintExtra();
            $('f-finished').value = state.editing.finished || '';
            if (commitCallback) commitCallback(true);
        }
    });

    $('f-cover')?.addEventListener('change', () => {
        if (!state.editing) return;
        const value = $('f-cover').value.trim();
        state.editing.customCover = value;
        state.editing.cover = value;
        paintDialog();
        if (commitCallback) commitCallback(true);
        if (refreshMetaCallback) setTimeout(refreshMetaCallback, 1500);
    });

    $('cover-clear')?.addEventListener('click', () => {
        if (!state.editing) return;
        state.editing.customCover = '';
        state.editing.cover = '';
        paintDialog();
        if (commitCallback) commitCallback(true);
        if (refreshMetaCallback) setTimeout(refreshMetaCallback, 1500);
    });

    $('cover-upload')?.addEventListener('click', () => $('cover-file')?.click());

    $('cover-library')?.addEventListener('click', async () => {
        if (!state.editing) return;
        cachedAssets = [];
        $('asset-search').value = '';
        $('asset-tag-filter').innerHTML = '<option value="">All tags</option>';
        $('asset-status').textContent = 'Loading Asset Library…';
        $('asset-grid').innerHTML = '';
        if (!$('asset-dlg').open) $('asset-dlg').showModal();
        try {
            const response = await fetch('/api/custom-overlays/assets', { cache: 'no-store' });
            if (!response.ok) throw new Error(`Asset Library request failed (${response.status})`);
            const data = await response.json();
            if (!Array.isArray(data)) throw new Error('Invalid Asset Library response');
            cachedAssets = data.filter(asset => asset.kind === 'image');
            const allTags = [...new Set(cachedAssets.flatMap(a => a.tags || []))].sort();
            $('asset-tag-filter').innerHTML = '<option value="">All tags</option>' + allTags.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('');
            renderAssetGrid();
        } catch (e) {
            $('asset-status').textContent = `Could not load assets: ${e.message}`;
        }
    });

    $('asset-search')?.addEventListener('input', renderAssetGrid);
    $('asset-tag-filter')?.addEventListener('change', renderAssetGrid);
    $('asset-dlg-close')?.addEventListener('click', () => $('asset-dlg')?.close());
    $('asset-grid')?.addEventListener('click', event => {
        const card = event.target.closest('[data-asset-url]');
        if (!card || !state.editing) return;
        const url = card.dataset.assetUrl;
        state.editing.customCover = url;
        state.editing.cover = url;
        $('f-cover').value = url;
        paintDialog();
        if (commitCallback) commitCallback(true);
        $('asset-dlg')?.close();
    });

    $('cover-file')?.addEventListener('change', event => {
        const file = event.target.files[0];
        event.target.value = '';
        if (file && state.editing) uploadCover(file, commitCallback);
    });

    $('dlg')?.addEventListener('paste', event => {
        const file = [...(event.clipboardData?.files || [])].find(entry => entry.type.startsWith('image/'));
        if (file && state.editing) {
            event.preventDefault();
            uploadCover(file, commitCallback);
        }
    });

    $('f-remove')?.addEventListener('click', async () => {
        const confirmFn = window.StreamPulse?.confirm || window.confirm;
        if (!state.editing || !await confirmFn('Remove Game', `Remove “${state.editing.name}” from the plan?`, { danger: true, confirmText: 'Remove' })) return;
        state.items = state.items.filter(entry => entry !== state.editing);
        state.editing = null;
        $('dlg')?.close();
        if (renderCallback) renderCallback();
        if (scheduleSaveCallback) scheduleSaveCallback();
    });
}

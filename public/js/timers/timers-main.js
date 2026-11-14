/**
 * Main entry point for the Timers & Subathon Studio.
 */

import {
    TIMER_EVENTS,
    state,
    $,
    esc,
    escapeAttr,
    slugify,
    toLocalInput,
    toast,
    api,
    jsonBody,
    formatMs,
    getLiveTimer,
    displayMs,
    parseDuration,
    hasDuration,
    fillDuration,
    setDirty,
    confirmDiscard
} from './timers-state.js';

import {
    switchTimersTab,
    loadSubathon,
    renderTargetMonitor,
    switchSubathonView,
    toggleSubathonBackdrop,
    toggleSubathonSample,
    initSubathon
} from './timers-subathon.js';

// ---- List ------------------------------------------------------------------
function sortedTimers() {
    return Object.values(state.timersData)
        .map(getLiveTimer)
        .sort((a, b) => (a.label || a.id).localeCompare(b.label || b.id));
}

function renderTimerList(force = false) {
    const list = $('timer-list');
    const entries = sortedTimers();
    const signature = JSON.stringify([state.selectedId, entries.map(t => [t.id, t.label, t.kind, t.state, t.visible])]);
    if (force || signature !== state.listSignature) {
        state.listSignature = signature;
        list.innerHTML = entries.length ? entries.map(timer => `
            <div class="timer-item${timer.id === state.selectedId ? ' active' : ''}${timer.visible === false ? ' hidden-timer' : ''}" data-select="${esc(timer.id)}">
                <div class="name">${esc(timer.label || timer.id)}</div>
                <div class="live-time" data-time="${esc(timer.id)}"></div>
                <div class="meta">
                    <span class="pill ${esc(timer.kind)}">${esc(timer.kind)}</span>
                    <span class="pill ${esc(timer.state)}">${esc(timer.state)}</span>
                    ${timer.visible === false ? '<span class="pill">hidden</span>' : ''}
                    <span style="flex:1"></span>
                    <span class="quick">
                        <button class="btn sm" data-quick="${timer.state === 'running' ? 'pause' : timer.state === 'paused' ? 'resume' : 'start'}" data-id="${esc(timer.id)}" title="${timer.state === 'running' ? 'Pause' : timer.state === 'paused' ? 'Resume' : 'Start'}">${timer.state === 'running' ? '<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>' : '<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>'}</button>
                        <button class="btn sm" data-quick="reset" data-id="${esc(timer.id)}" title="Reset"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><polyline points="3 3 3 8 8 8"/></svg></button>
                    </span>
                </div>
            </div>`).join('')
            : '<div class="empty-note">No timers yet. Create a countdown or stopwatch to get started.</div>';
    }
    list.querySelectorAll('[data-time]').forEach(el => {
        const timer = entries.find(t => t.id === el.dataset.time);
        if (timer) el.textContent = formatMs(displayMs(timer));
    });
}

function renderLive() {
    const timer = state.selectedId && state.timersData[state.selectedId]
        ? getLiveTimer(state.timersData[state.selectedId])
        : null;
    $('controls-empty').hidden = !!timer;
    $('controls-body').hidden = !timer;
    $('urls-card').hidden = !timer;
    const pill = $('state-pill');
    pill.hidden = !timer;
    if (!timer) return;
    pill.textContent = timer.state;
    pill.className = `pill ${timer.state}`;
    $('readout-time').textContent = formatMs(displayMs(timer));
    $('readout-who').textContent = `${timer.label || timer.id} · ${timer.kind}${timer.visible === false ? ' · hidden' : ''}`;
    const running = timer.state === 'running';
    document.querySelector('[data-control="pause"]').disabled = !running;
    document.querySelector('[data-control="resume"]').disabled = timer.state !== 'paused';
    document.querySelector('[data-control="start"]').disabled = running;
    $('toggle-visibility').textContent = timer.visible === false ? 'Show overlay' : 'Hide overlay';
    $('set-stopwatch-row').hidden = timer.kind !== 'stopwatch';
}

// ---- Form ------------------------------------------------------------------
function toggleKindSections() {
    const kind = $('timer-kind').value;
    $('countdown-section').classList.toggle('active', kind === 'countdown');
    $('stopwatch-section').classList.toggle('active', kind === 'stopwatch');
    document.querySelectorAll('.http-grid').forEach(row => { row.hidden = row.dataset.kind !== kind; });
}

function toggleCountdownMode() {
    const mode = $('countdown-mode').value;
    $('duration-fields').style.display = mode === 'duration' ? '' : 'none';
    $('date-fields').style.display = mode === 'date' ? '' : 'none';
}

function toggleEndMessage() {
    $('end-message-row').hidden = $('countdown-show-on-end').value !== 'message';
}

function lockIdentity(locked) {
    $('timer-id').readOnly = locked;
    $('timer-kind').disabled = locked;
    $('id-hint').hidden = !locked;
}

function updateHttpCount() {
    const count = TIMER_EVENTS.filter(event => $(`http-${event.replaceAll('_', '-')}-enabled`).checked).length;
    $('http-count').textContent = count ? `${count} enabled` : '';
    $('http-count').hidden = !count;
}

function populateHttpActions(actions = {}) {
    TIMER_EVENTS.forEach(event => {
        const action = actions[event] || {};
        const prefix = `http-${event.replaceAll('_', '-')}`;
        $(`${prefix}-enabled`).checked = !!action.enabled;
        $(`${prefix}-method`).value = action.method || 'POST';
        $(`${prefix}-url`).value = action.url || '';
    });
    updateHttpCount();
}

function collectHttpActions() {
    return Object.fromEntries(TIMER_EVENTS.map(event => {
        const prefix = `http-${event.replaceAll('_', '-')}`;
        return [
            event,
            {
                enabled: $(`${prefix}-enabled`).checked,
                method: $(`${prefix}-method`).value,
                url: $(`${prefix}-url`).value.trim()
            }
        ];
    }));
}

function seedNewTimer(kind, base = null) {
    state.selectedId = '';
    state.idTouched = !!base;
    const blank = base || {};
    $('definition-title').textContent = 'New Timer';
    $('timer-id').value = blank.id || '';
    $('timer-label').value = blank.label || (kind === 'stopwatch' ? 'New Stopwatch' : 'New Countdown');
    $('timer-kind').value = kind;
    $('timer-visible').checked = blank.visible !== false;
    $('countdown-mode').value = blank.mode || 'duration';
    $('countdown-progress').checked = blank.progress !== false;
    $('countdown-show-on-end').value = blank.showOnEnd || 'message';
    $('countdown-end-message').value = blank.endMessage || "Time's Up!";
    setSound('timer', blank.soundUrl || '');
    fillDuration('dur', blank.durationMs ?? (kind === 'countdown' ? 600000 : 0));
    $('target-at').value = toLocalInput(blank.targetAt);
    $('start-at').value = toLocalInput(blank.startAt);
    $('target-timezone').value = blank.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    fillDuration('sw', blank.initialMs || 0);
    populateHttpActions(blank.httpActions || {});
    lockIdentity(false);
    toggleKindSections();
    toggleCountdownMode();
    toggleEndMessage();
    renderTimerList(true);
    renderLive();
    updateUrls();
    setDirty(true);
    $('timer-label').focus();
    $('timer-label').select();
}

function populateForm(timer) {
    $('definition-title').textContent = 'Timer Definition';
    $('timer-id').value = timer.id || '';
    $('timer-label').value = timer.label || timer.id || '';
    $('timer-kind').value = timer.kind || 'countdown';
    $('timer-visible').checked = timer.visible !== false;
    $('countdown-mode').value = timer.mode || 'duration';
    $('countdown-progress').checked = timer.progress !== false;
    $('countdown-show-on-end').value = timer.showOnEnd || 'message';
    $('countdown-end-message').value = timer.endMessage || "Time's Up!";
    setSound('timer', timer.soundUrl || '');
    fillDuration('dur', timer.durationMs);
    $('target-at').value = toLocalInput(timer.targetAt);
    $('start-at').value = toLocalInput(timer.startAt);
    $('target-timezone').value = timer.timezone || '';
    fillDuration('sw', timer.initialMs);
    populateHttpActions(timer.httpActions || {});
    lockIdentity(true);
    toggleKindSections();
    toggleCountdownMode();
    toggleEndMessage();
    updateUrls();
    setDirty(false);
}

function collectTimerPayload() {
    const label = $('timer-label').value.trim();
    const id = slugify($('timer-id').value || label);
    if (!id) throw new Error('Give the timer a label or ID');
    $('timer-id').value = id;
    const kind = $('timer-kind').value;
    const payload = {
        id,
        label: label || id,
        kind,
        visible: $('timer-visible').checked,
        httpActions: collectHttpActions()
    };
    for (const action of Object.values(payload.httpActions)) {
        if (action.enabled && action.url) {
            try { new URL(action.url); } catch { throw new Error(`Invalid callback URL: ${action.url}`); }
        }
    }
    if (kind === 'countdown') {
        payload.mode = $('countdown-mode').value;
        payload.progress = $('countdown-progress').checked;
        payload.showOnEnd = $('countdown-show-on-end').value;
        payload.endMessage = $('countdown-end-message').value || "Time's Up!";
        payload.soundUrl = state.soundValues.timer;
        if (payload.mode === 'duration') {
            const duration = parseDuration('dur');
            if (!hasDuration(duration)) throw new Error('Enter a countdown duration');
            Object.assign(payload, duration);
        } else {
            payload.targetAt = $('target-at').value;
            payload.startAt = $('start-at').value;
            payload.timezone = $('target-timezone').value.trim();
            if (!payload.targetAt) throw new Error('Choose a target date and time');
        }
    } else {
        Object.assign(payload, parseDuration('sw'));
    }
    return payload;
}

// ---- URLs ------------------------------------------------------------------
function updateUrls() {
    const timer = state.timersData[state.selectedId];
    if (!timer) return;
    const kind = timer.kind === 'stopwatch' ? 'stopwatch' : 'countdown';
    const path = `/${kind}.html?timer=${encodeURIComponent(timer.id)}`;
    $('overlay-url-label').textContent = `${kind === 'stopwatch' ? 'Stopwatch' : 'Countdown'} browser source`;
    $('overlay-url').textContent = location.origin + path;
    $('preview-link').href = path;
    $('wizard-link').href = `/timer-url-wizard.html?timer=${encodeURIComponent(timer.id)}&overlay=${kind}`;
}

// ---- Actions ---------------------------------------------------------------
async function loadTimers() {
    const data = await api('/api/timers', { cache: 'no-store' });
    state.timersData = data.timers || {};
    state.timerSettings = data.settings || {};
    loadSettingsForm();
    if (state.selectedId && !state.timersData[state.selectedId]) state.selectedId = '';
    if (!state.selectedId && !state.dirty) state.selectedId = sortedTimers()[0]?.id || '';
    if (state.selectedId) { populateForm(state.timersData[state.selectedId]); }
    else if (!state.dirty) seedNewTimer('countdown');
    renderTimerList(true);
    renderLive();
    updateUrls();
}

async function selectTimer(id) {
    if (id === state.selectedId || !state.timersData[id] || !await confirmDiscard()) return;
    state.selectedId = id;
    populateForm(state.timersData[id]);
    renderTimerList(true);
    renderLive();
}

async function saveTimer() {
    let payload;
    try { payload = collectTimerPayload(); } catch (error) { toast(error.message, 'error'); return; }
    if (
        !state.selectedId &&
        state.timersData[payload.id] &&
        !await StreamPulse.confirm('Overwrite Timer', `A timer with ID "${payload.id}" already exists. Overwrite it?`, { confirmText: 'Overwrite' })
    ) return;
    try {
        const data = await api('/api/timers', jsonBody('POST', payload));
        state.timersData[data.timer.id] = data.timer;
        state.selectedId = data.timer.id;
        populateForm(data.timer);
        renderTimerList(true);
        renderLive();
        toast(`Saved "${data.timer.label || data.timer.id}"`);
    } catch (error) { toast(error.message, 'error'); }
}

async function deleteTimer() {
    const id = state.selectedId;
    if (!id) { state.selectedId = ''; setDirty(false); await loadTimers(); return; }
    if (!await StreamPulse.confirm('Delete Timer', `Delete timer "${id}"? Overlays using it will stop updating.`, { danger: true, confirmText: 'Delete' })) return;
    try {
        await api(`/api/timers/${encodeURIComponent(id)}`, { method: 'DELETE' });
        delete state.timersData[id];
        state.selectedId = '';
        setDirty(false);
        await loadTimers();
        toast(`Deleted "${id}"`);
    } catch (error) { toast(error.message, 'error'); }
}

async function duplicateTimer() {
    if (!await confirmDiscard()) return;
    const source = state.timersData[state.selectedId] || {};
    let id = `${source.id || slugify($('timer-label').value) || 'timer'}-copy`;
    for (let n = 2; state.timersData[id]; n++) id = `${source.id || 'timer'}-copy-${n}`;
    seedNewTimer(source.kind || $('timer-kind').value, { ...source, id, label: `${source.label || source.id || 'Timer'} copy` });
}

async function control(id, action, value = '', extra = {}) {
    if (!id) return toast('Save the timer first', 'error');
    try {
        const data = await api(`/api/timers/${encodeURIComponent(id)}/control`, jsonBody('POST', { action, ...(value ? { value } : {}), ...extra }));
        if (data.timer?.id) {
            state.timersData[data.timer.id] = data.timer;
            renderTimerList();
            renderLive();
        }
        return data;
    } catch (error) { toast(error.message, 'error'); }
}

async function adjustTime(action) {
    const duration = parseDuration('adjust');
    if (!hasDuration(duration)) return toast('Enter a time to adjust', 'error');
    if (await control(state.selectedId, action, '', duration)) {
        toast(action === 'add_time' ? 'Time added' : 'Time subtracted');
        ['days', 'hours', 'minutes', 'seconds'].forEach(unit => { $(`adjust-${unit}`).value = ''; });
    }
}

async function quickAdjust(amount, unit) {
    if (!state.selectedId) return toast('Select a saved timer first', 'error');
    const isNegative = amount < 0;
    const action = isNegative ? 'subtract_time' : 'add_time';
    const payload = { [unit]: Math.abs(amount) };
    if (await control(state.selectedId, action, '', payload)) {
        toast(`${isNegative ? 'Subtracted' : 'Added'} ${Math.abs(amount)} ${unit === 'seconds' ? 'sec' : 'min'}`);
    }
}

function loadSettingsForm() {
    $('sound-enabled').checked = !!state.timerSettings.sound_enabled;
    $('sound-volume').value = state.timerSettings.sound_volume ?? 0.35;
    $('sound-volume-label').textContent = Math.round((parseFloat($('sound-volume').value) || 0) * 100) + '%';
    setSound('global', state.timerSettings.sound_url || '');
}

async function saveSettings() {
    try {
        const data = await api('/api/timers/settings', jsonBody('PUT', {
            sound_enabled: $('sound-enabled').checked,
            sound_volume: parseFloat($('sound-volume').value) || 0,
            sound_url: state.soundValues.global
        }));
        state.timerSettings = data.settings;
        toast('Global settings saved');
    } catch (error) { toast(error.message, 'error'); }
}

// ---- Sounds ----------------------------------------------------------------
const soundLabel = url => decodeURIComponent(url.split('/').pop() || '').replace(/^[a-z0-9]{6,}-/, '');

function setSound(target, url, markDirty = false) {
    state.soundValues[target] = url || '';
    const name = $(`sound-name-${target}`);
    name.textContent = url ? soundLabel(url) : (target === 'global' ? 'Built-in beep' : 'Use global setting');
    name.classList.toggle('is-default', !url);
    document.querySelector(`[data-sound-clear="${target}"]`).hidden = !url;
    if (markDirty && target === 'timer') setDirty(true);
}

function stopPreview() {
    if (state.previewAudio) {
        state.previewAudio.pause();
        state.previewAudio = null;
    }
}

function previewSound(url) {
    stopPreview();
    state.previewAudio = new Audio(url);
    state.previewAudio.volume = Math.max(0, Math.min(1, parseFloat($('sound-volume').value) || 0.35));
    state.previewAudio.play().catch(() => toast('Could not play that file', 'error'));
}

function renderSoundList() {
    const query = $('sound-search').value.trim().toLowerCase();
    const matches = state.soundLibrary.filter(asset => asset.label.toLowerCase().includes(query));
    $('sound-list').innerHTML = matches.length ? matches.map(asset => `
        <div class="sound-row" ${asset.url === state.soundValues[state.soundTarget] ? 'aria-current="true"' : ''}>
            <button class="btn sm" type="button" data-play="${escapeAttr(asset.url)}" title="Preview" aria-label="Play sound preview"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg></button>
            <span class="label" title="${escapeAttr(asset.label)}">${escapeAttr(asset.label)}</span>
            <span class="meta">${Math.max(1, Math.round(asset.size / 1024))} KB</span>
            <button class="btn sm primary" type="button" data-use="${escapeAttr(asset.url)}">Use</button>
        </div>`).join('') : `<div class="empty-note">No sounds${query ? ' match your filter' : ' yet — upload an MP3, WAV, M4A, AAC or OGG file'}.</div>`;
}

async function openSoundPicker(target) {
    state.soundTarget = target;
    $('sound-search').value = '';
    $('sound-list').innerHTML = '<div class="empty-note">Loading…</div>';
    $('sound-dialog').showModal();
    try {
        const assets = await api('/api/custom-overlays/assets', { cache: 'no-store' });
        state.soundLibrary = assets.filter(asset => asset.kind === 'audio');
        renderSoundList();
    } catch (error) { $('sound-list').innerHTML = `<div class="empty-note">${escapeAttr(error.message)}</div>`; }
}

async function uploadSound(file) {
    const type = file.type || ({
        mp3: 'audio/mpeg',
        wav: 'audio/wav',
        m4a: 'audio/mp4',
        aac: 'audio/aac',
        ogg: 'audio/ogg'
    })[file.name.split('.').pop().toLowerCase()];
    if (!type || !type.startsWith('audio/')) throw new Error('Choose an audio file (MP3, WAV, M4A, AAC or OGG)');
    const response = await fetch('/api/custom-overlays/assets', {
        method: 'POST',
        headers: { 'Content-Type': type, 'X-Asset-Name': file.name.replace(/[^\x20-\x7e]+/g, '-') },
        body: file
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Upload failed');
    return data.url;
}

function testSound() {
    const url = state.soundValues.timer || state.soundValues.global;
    if (url) return previewSound(url);
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return toast('Audio not supported in this browser', 'error');
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    gain.gain.value = Math.max(0.001, parseFloat($('sound-volume').value) || 0.001);
    osc.frequency.value = 880;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
    osc.onended = () => ctx.close();
}

// ---- Export / Import -------------------------------------------------------
function exportTimersJson() {
    const list = Object.values(state.timersData || {});
    if (!list.length) {
        toast('No saved timers to export', 'error');
        return;
    }
    const payload = {
        version: 1,
        exportedAt: new Date().toISOString(),
        settings: state.timerSettings || {},
        timers: state.timersData || {}
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'streampulse-timers-backup.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(`Exported ${list.length} timer(s)`);
}

async function importTimersJson(event) {
    const input = event?.target;
    const file = input?.files?.[0];
    if (!file) return;
    try {
        const parsed = JSON.parse(await file.text());
        let entries = [];
        if (Array.isArray(parsed)) {
            entries = parsed;
        } else if (Array.isArray(parsed?.timers)) {
            entries = parsed.timers;
        } else if (parsed?.timers && typeof parsed.timers === 'object') {
            entries = Object.entries(parsed.timers).map(([id, timer]) => ({ id, ...(timer || {}) }));
        }
        if (!entries.length) {
            toast('Invalid timers JSON: no timers found', 'error');
            return;
        }
        let imported = 0;
        for (const item of entries) {
            if (!item || typeof item !== 'object') continue;
            const id = slugify(item.id || item.label || '');
            if (!id) continue;
            const payload = {
                ...item,
                id,
                durationMs: item.kind === 'stopwatch'
                    ? (item.initialMs ?? item.durationMs ?? 0)
                    : item.durationMs
            };
            try {
                const data = await api('/api/timers', jsonBody('POST', payload));
                if (data?.timer?.id) imported++;
            } catch {}
        }
        if (parsed?.settings && typeof parsed.settings === 'object') {
            try {
                await api('/api/timers/settings', jsonBody('PUT', {
                    sound_enabled: !!parsed.settings.sound_enabled,
                    sound_volume: Number.isFinite(Number(parsed.settings.sound_volume)) ? Number(parsed.settings.sound_volume) : 0.35,
                    sound_url: String(parsed.settings.sound_url || '')
                }));
            } catch {}
        }
        setDirty(false);
        await loadTimers();
        toast(imported > 0 ? `Imported ${imported} timer(s)` : 'No valid timers could be imported', imported > 0 ? 'ok' : 'error');
    } catch (error) {
        toast(`Import failed: ${error?.message || 'Invalid JSON'}`, 'error');
    } finally {
        if (input) input.value = '';
    }
}

// ---- WebSocket -------------------------------------------------------------
function connectTimerSocket() {
    const socket = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}`);
    const syncForm = () => {
        if (!state.dirty && state.selectedId && state.timersData[state.selectedId]) {
            populateForm(state.timersData[state.selectedId]);
        }
    };
    socket.onmessage = event => {
        let message;
        try { message = JSON.parse(event.data); } catch { return; }
        if (message.type === 'timers-snapshot') {
            state.timersData = message.data?.timers || state.timersData;
            state.timerSettings = message.data?.settings || state.timerSettings;
            if (state.selectedId && !state.timersData[state.selectedId]) state.selectedId = '';
            loadSettingsForm();
            syncForm();
            renderTimerList();
            renderLive();
        } else if (message.type === 'timer-update') {
            const timer = message.data?.timer;
            if (!timer?.id) return;
            state.timersData[timer.id] = timer;
            if (timer.id === state.selectedId) syncForm();
            renderTimerList();
            renderLive();
        } else if (message.type === 'timer-delete') {
            delete state.timersData[message.data?.id];
            if (state.selectedId === message.data?.id) {
                state.selectedId = '';
                setDirty(false);
                loadTimers();
                return;
            }
            renderTimerList();
        } else if (message.type === 'timer-settings') {
            state.timerSettings = message.data || state.timerSettings;
            loadSettingsForm();
        } else if (message.type === 'subathon-update' || message.type === 'subathon-event') {
            loadSubathon();
        }
    };
    socket.onclose = () => setTimeout(connectTimerSocket, 3000);
}

// ---- Wiring & Initialization -----------------------------------------------
document.addEventListener('click', async event => {
    const choose = event.target.closest('[data-sound-choose]');
    if (choose) return openSoundPicker(choose.dataset.soundChoose);
    const clear = event.target.closest('[data-sound-clear]');
    if (clear) return setSound(clear.dataset.soundClear, '', true);
    const play = event.target.closest('[data-play]');
    if (play) return previewSound(play.dataset.play);
    const use = event.target.closest('[data-use]');
    if (use) { stopPreview(); setSound(state.soundTarget, use.dataset.use, true); $('sound-dialog').close(); return; }

    const target = event.target.closest('button, [data-select]');
    if (!target) return;
    if (target.dataset.quick) { event.stopPropagation(); control(target.dataset.id, target.dataset.quick); return; }
    if (target.dataset.select) { await selectTimer(target.dataset.select); return; }
    if (target.dataset.new) { if (await confirmDiscard()) { seedNewTimer(target.dataset.new); } return; }
    if (target.dataset.control) { control(state.selectedId, target.dataset.control, target.dataset.value || ''); return; }
    if (target.dataset.adjust) { adjustTime(target.dataset.adjust); return; }
    if (target.dataset.quickAdjust) { quickAdjust(parseInt(target.dataset.quickAdjust, 10), target.dataset.adjustUnit || 'minutes'); return; }
});

$('sound-close').addEventListener('click', () => $('sound-dialog').close());
$('sound-dialog').addEventListener('close', stopPreview);
$('sound-search').addEventListener('input', renderSoundList);
$('sound-upload').addEventListener('change', async event => {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    try {
        toast('Uploading…');
        const url = await uploadSound(file);
        setSound(state.soundTarget, url, true);
        $('sound-dialog').close();
        toast('Sound uploaded');
    } catch (error) { toast(error.message, 'error'); }
});

$('export-timers').addEventListener('click', exportTimersJson);
$('import-timers').addEventListener('click', () => $('import-timers-file').click());
$('import-timers-file').addEventListener('change', importTimersJson);
$('save-timer').addEventListener('click', saveTimer);
$('delete-timer').addEventListener('click', deleteTimer);
$('duplicate-timer').addEventListener('click', duplicateTimer);
$('revert-timer').addEventListener('click', () => {
    if (state.selectedId && state.timersData[state.selectedId]) populateForm(state.timersData[state.selectedId]);
    else seedNewTimer($('timer-kind').value);
});
$('save-settings').addEventListener('click', saveSettings);
$('test-sound').addEventListener('click', testSound);
$('set-base').addEventListener('click', async () => {
    if (await control(state.selectedId, 'set_time', '', parseDuration('set'))) toast('Stopwatch base updated');
});
$('copy-url').addEventListener('click', async () => {
    const text = $('overlay-url').textContent;
    try { await navigator.clipboard.writeText(text); } catch {
        const range = document.createRange();
        range.selectNodeContents($('overlay-url'));
        getSelection().removeAllRanges();
        getSelection().addRange(range);
        document.execCommand('copy');
    }
    toast('URL copied');
});
$('sound-volume').addEventListener('input', event => {
    $('sound-volume-label').textContent = Math.round((parseFloat(event.target.value) || 0) * 100) + '%';
});

const definition = $('definition-card');
definition.addEventListener('input', event => {
    if (event.target.id === 'timer-id') state.idTouched = true;
    if (event.target.id === 'timer-label' && !state.selectedId && !state.idTouched) {
        $('timer-id').value = slugify(event.target.value);
    }
    setDirty(true);
});
definition.addEventListener('change', event => {
    if (event.target.id === 'timer-kind') toggleKindSections();
    if (event.target.id === 'countdown-mode') toggleCountdownMode();
    if (event.target.id === 'countdown-show-on-end') toggleEndMessage();
    if (event.target.id?.startsWith('http-')) updateHttpCount();
    setDirty(true);
});
document.addEventListener('keydown', event => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        saveTimer();
    }
});
window.addEventListener('beforeunload', event => {
    if (state.dirty) {
        event.preventDefault();
        event.returnValue = '';
    }
});

try {
    const zones = Intl.supportedValuesOf ? Intl.supportedValuesOf('timeZone') : [];
    $('timezone-list').innerHTML = zones.map(zone => `<option value="${esc(zone)}"></option>`).join('');
} catch { /* datalist is optional */ }

Object.assign(window, {
    switchTimersTab,
    switchSubathonView,
    toggleSubathonBackdrop,
    toggleSubathonSample,
    exportTimersJson,
    importTimersJson
});

initSubathon();
loadTimers().catch(error => toast(error.message, 'error'));
loadSubathon();
connectTimerSocket();
setInterval(() => {
    renderTimerList();
    renderLive();
    if (document.getElementById('pane-subathon') && !document.getElementById('pane-subathon').hidden) {
        renderTargetMonitor();
    }
}, 250);

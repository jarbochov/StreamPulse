const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const DEFAULT_TIMER_SETTINGS = {
    sound_enabled: false,
    sound_volume: 0.35,
    sound_url: ''
};

const TIMER_EVENT_TYPES = ['countdown_started', 'countdown_complete', 'stopwatch_started', 'stopwatch_paused'];

function createDefaultTimerHttpActions() {
    return Object.fromEntries(TIMER_EVENT_TYPES.map(event => [event, { enabled: false, url: '', method: 'POST' }]));
}

function cloneJson(value) {
    return JSON.parse(JSON.stringify(value));
}

function sanitizeTimerId(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60);
}

function clampNumber(value, min, max, fallback) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.min(max, Math.max(min, num));
}

function parseDurationMs(input = {}) {
    if (input.durationMs !== undefined && input.durationMs !== null && input.durationMs !== '') {
        return Math.max(0, Math.round(Number(input.durationMs) || 0));
    }
    const days = Math.max(0, Number(input.days) || 0);
    const hours = Math.max(0, Number(input.hours) || 0);
    const minutes = Math.max(0, Number(input.minutes) || 0);
    const seconds = Math.max(0, Number(input.seconds) || 0);
    return Math.round((((days * 24 + hours) * 60 + minutes) * 60 + seconds) * 1000);
}

function formatTimerClock(ms, opts = {}) {
    const includeDays = !!opts.includeDays;
    const total = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
    const days = Math.floor(total / 86400);
    const hours = Math.floor((total % 86400) / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    const pad = n => String(n).padStart(2, '0');
    if (includeDays || days > 0) return `${pad(days)}:${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

// Only library assets may be used as custom timer sounds.
function normalizeSoundUrl(value) {
    const url = String(value || '').trim();
    return url.startsWith('/custom-overlay-assets/') && url.length <= 300 && !url.includes('..') ? url : '';
}

function normalizeTimerSettings(raw = {}) {
    const settings = cloneJson(DEFAULT_TIMER_SETTINGS);
    if (raw.sound_enabled !== undefined) settings.sound_enabled = !!raw.sound_enabled;
    settings.sound_volume = clampNumber(raw.sound_volume, 0, 1, DEFAULT_TIMER_SETTINGS.sound_volume);
    settings.sound_url = normalizeSoundUrl(raw.sound_url);
    return settings;
}

function normalizeTimerHttpActions(raw = {}) {
    const actions = createDefaultTimerHttpActions();
    for (const eventType of TIMER_EVENT_TYPES) {
        const src = raw[eventType] || {};
        actions[eventType] = {
            enabled: !!src.enabled,
            url: String(src.url || '').trim(),
            method: String(src.method || 'POST').toUpperCase() === 'GET' ? 'GET' : 'POST'
        };
    }
    return actions;
}

function computeCountdownRemaining(timer, now = Date.now()) {
    if (timer.state !== 'running') {
        if (timer.mode === 'date') {
            const targetMs = Date.parse(timer.targetAt || '');
            return Number.isFinite(targetMs) ? Math.max(0, targetMs - now) : 0;
        }
        return Math.max(0, timer.remainingMs || 0);
    }
    const anchor = Number(timer.startedAt) || now;
    return Math.max(0, (timer.startingRemainingMs || 0) - Math.max(0, now - anchor));
}

function computeStopwatchElapsed(timer, now = Date.now()) {
    const base = Math.max(0, timer.accumulatedMs || 0);
    if (timer.state !== 'running') return base;
    const anchor = Number(timer.startedAt) || now;
    return Math.max(0, base + Math.max(0, now - anchor));
}

function buildTimerSnapshot(timer, now = Date.now()) {
    const base = {
        id: timer.id,
        label: timer.label,
        kind: timer.kind,
        visible: timer.visible !== false,
        state: timer.state || 'idle',
        startedAt: timer.startedAt || null,
        updatedAt: timer.updatedAt || null,
        completedAt: timer.completedAt || null
    };

    if (timer.kind === 'countdown') {
        const startMs = timer.mode === 'date' ? Date.parse(timer.startAt || '') : NaN;
        const totalMs = Math.max(0, timer.mode === 'duration'
            ? (timer.durationMs || 0)
            : Number.isFinite(startMs) && Date.parse(timer.targetAt || '') > startMs
                ? Date.parse(timer.targetAt) - startMs
                : (timer.startingRemainingMs || computeCountdownRemaining(timer, now)));
        const remainingMs = computeCountdownRemaining(timer, now);
        const percentComplete = totalMs > 0 ? Math.min(1, Math.max(0, (totalMs - remainingMs) / totalMs)) : 0;
        return {
            ...base,
            mode: timer.mode || 'duration',
            timezone: timer.timezone || '',
            progress: timer.progress !== false,
            showOnEnd: timer.showOnEnd || 'message',
            endMessage: timer.endMessage || '⌛️',
            soundUrl: normalizeSoundUrl(timer.soundUrl),
            durationMs: Math.max(0, timer.durationMs || 0),
            targetAt: timer.targetAt || null,
            startAt: timer.startAt || null,
            startingRemainingMs: Math.max(0, timer.startingRemainingMs || 0),
            httpActions: normalizeTimerHttpActions(timer.httpActions || {}),
            remainingMs,
            totalMs,
            percentComplete,
            percentRemaining: 1 - percentComplete,
            formattedRemaining: formatTimerClock(remainingMs, { includeDays: remainingMs >= 86400000 }),
            displayTitle: timer.label
        };
    }

    const elapsedMs = computeStopwatchElapsed(timer, now);
    return {
        ...base,
        initialMs: Math.max(0, timer.initialMs || 0),
        accumulatedMs: Math.max(0, timer.accumulatedMs || 0),
        httpActions: normalizeTimerHttpActions(timer.httpActions || {}),
        elapsedMs,
        formattedElapsed: formatTimerClock(elapsedMs, { includeDays: elapsedMs >= 86400000 }),
        displayTitle: timer.label
    };
}

function buildTimerRecord(input) {
    const id = sanitizeTimerId(input.id);
    if (!id) throw new Error('Timer ID is required and must be slug-safe');

    const kind = input.kind === 'stopwatch' ? 'stopwatch' : 'countdown';
    const label = String(input.label || id).trim().slice(0, 80) || id;
    const nowISO = new Date().toISOString();

    if (kind === 'countdown') {
        const mode = input.mode === 'date' ? 'date' : 'duration';
        const durationMs = mode === 'duration'
            ? Math.max(0, parseDurationMs(input))
            : 0;
        const targetAt = mode === 'date' && input.targetAt ? new Date(input.targetAt).toISOString() : null;
        const startAtDate = mode === 'date' && input.startAt ? new Date(input.startAt) : null;
        const startAt = startAtDate && !Number.isNaN(startAtDate.getTime()) ? startAtDate.toISOString() : null;
        if (startAt && targetAt && Date.parse(startAt) >= Date.parse(targetAt)) throw new Error('Start must be before the target date');
        if (mode === 'duration' && durationMs <= 0) throw new Error('Countdown duration must be greater than 0');
        if (mode === 'date' && !targetAt) throw new Error('Countdown target date is required');
        const initialRemainingMs = mode === 'duration'
            ? durationMs
            : Math.max(0, Date.parse(targetAt) - Date.now());
        return {
            id,
            label,
            kind,
            visible: input.visible !== false,
            state: 'idle',
            startedAt: null,
            updatedAt: nowISO,
            completedAt: null,
            mode,
            durationMs,
            targetAt,
            startAt,
            timezone: String(input.timezone || '').trim(),
            progress: input.progress !== false,
            endMessage: String(input.endMessage || '⌛️').slice(0, 120),
            soundUrl: normalizeSoundUrl(input.soundUrl),
            showOnEnd: ['message', 'zero', 'none'].includes(input.showOnEnd) ? input.showOnEnd : 'message',
            remainingMs: initialRemainingMs,
            startingRemainingMs: initialRemainingMs,
            httpActions: normalizeTimerHttpActions(input.httpActions || {})
        };
    }

    const initialMs = Math.max(0, parseDurationMs(input));
    return {
        id,
        label,
        kind,
        visible: input.visible !== false,
        state: 'idle',
        startedAt: null,
        updatedAt: nowISO,
        completedAt: null,
        initialMs,
        accumulatedMs: initialMs,
        httpActions: normalizeTimerHttpActions(input.httpActions || {})
    };
}

function fireTimerHttpAction(eventType, timer) {
    const action = normalizeTimerHttpActions(timer.httpActions || {})[eventType];
    if (!action || !action.enabled || !action.url) return;
    const snapshot = buildTimerSnapshot(timer);
    const payloadObject = {
        event: eventType,
        timestamp: new Date().toISOString(),
        timer: snapshot
    };

    try {
        const urlObj = new URL(action.url);
        if (action.method === 'GET') {
            Object.entries({
                event: eventType,
                timer_id: snapshot.id,
                timer_label: snapshot.label,
                timer_kind: snapshot.kind,
                timer_state: snapshot.state
            }).forEach(([key, value]) => {
                if (value !== undefined && value !== null) urlObj.searchParams.set(key, String(value));
            });
        }
        const requestLib = urlObj.protocol === 'https:' ? https : http;
        const payload = JSON.stringify(payloadObject);
        const req = requestLib.request(urlObj, {
            method: action.method || 'POST',
            headers: action.method === 'POST'
                ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
                : undefined
        }, (res) => res.resume());
        req.on('error', (err) => console.warn(`[Timer HTTP] Error: ${err.message}`));
        if ((action.method || 'POST') === 'POST') req.write(payload);
        req.end();
    } catch (err) {
        console.warn(`[Timer HTTP] Invalid URL: ${err.message}`);
    }
}

function completeCountdownTimer(timer, now = Date.now()) {
    timer.state = 'completed';
    timer.startedAt = null;
    timer.remainingMs = 0;
    timer.startingRemainingMs = 0;
    if (timer.mode === 'date') {
        timer.targetAt = new Date(now).toISOString();
    }
    timer.completedAt = new Date(now).toISOString();
}

function adjustCountdownTime(timer, deltaMs, now = Date.now()) {
    const currentRemainingMs = computeCountdownRemaining(timer, now);
    const nextRemainingMs = Math.max(0, currentRemainingMs + deltaMs);

    if (timer.mode === 'date') {
        timer.targetAt = new Date(now + nextRemainingMs).toISOString();
    }

    if (nextRemainingMs === 0) {
        completeCountdownTimer(timer, now);
        return { completed: currentRemainingMs > 0 };
    }

    timer.remainingMs = nextRemainingMs;
    timer.startingRemainingMs = nextRemainingMs;
    timer.completedAt = null;

    if (timer.state === 'running') {
        timer.startedAt = now;
    } else {
        timer.startedAt = null;
        timer.state = 'idle';
    }

    return { completed: false };
}

function pauseCountdownTimer(timer, now = Date.now()) {
    if (timer.state !== 'running') throw new Error('Countdown is not running');
    const remainingMs = computeCountdownRemaining(timer, now);
    timer.remainingMs = remainingMs;
    timer.startingRemainingMs = remainingMs;
    timer.startedAt = null;
    timer.state = remainingMs > 0 ? 'paused' : 'completed';
    if (timer.mode === 'date') {
        timer.targetAt = new Date(now + remainingMs).toISOString();
    }
    if (remainingMs <= 0) completeCountdownTimer(timer, now);
}

function resumeCountdownTimer(timer, now = Date.now()) {
    if (timer.state !== 'paused' && timer.state !== 'idle') throw new Error('Countdown cannot resume from current state');
    const remainingMs = timer.state === 'paused'
        ? Math.max(0, timer.remainingMs || timer.startingRemainingMs || 0)
        : (timer.mode === 'date'
            ? Math.max(0, Date.parse(timer.targetAt || '') - now)
            : Math.max(0, timer.remainingMs || timer.durationMs || 0));
    if (remainingMs <= 0) {
        completeCountdownTimer(timer, now);
        return false;
    }
    timer.remainingMs = remainingMs;
    timer.startingRemainingMs = remainingMs;
    timer.startedAt = now;
    timer.state = 'running';
    timer.completedAt = null;
    if (timer.mode === 'date') {
        timer.targetAt = new Date(now + remainingMs).toISOString();
    }
    return true;
}

function adjustStopwatchTime(timer, deltaMs, now = Date.now()) {
    const currentElapsedMs = computeStopwatchElapsed(timer, now);
    const nextElapsedMs = Math.max(0, currentElapsedMs + deltaMs);
    timer.accumulatedMs = nextElapsedMs;
    timer.completedAt = null;
    if (timer.state === 'running') {
        timer.startedAt = now;
    } else {
        timer.startedAt = null;
    }
}

function markTimerUpdated(timer) {
    timer.updatedAt = new Date().toISOString();
}

function createTimerService({
    dataDir,
    safeWriteFileSync = (filePath, content) => fs.writeFileSync(filePath, content, 'utf8'),
    broadcastToOverlays = () => {},
    onTimerEvent = () => {}
}) {
    const TIMERS_PATH = path.join(dataDir, 'timers.json');

    let timerStore = {
        settings: cloneJson(DEFAULT_TIMER_SETTINGS),
        timers: {}
    };

    let timerTickHandle = null;

    function saveTimers() {
        safeWriteFileSync(TIMERS_PATH, JSON.stringify(timerStore, null, 2));
    }

    function loadTimers() {
        try {
            if (!fs.existsSync(TIMERS_PATH)) return;
            const parsed = JSON.parse(fs.readFileSync(TIMERS_PATH, 'utf8'));
            timerStore = {
                settings: normalizeTimerSettings(parsed.settings || {}),
                timers: {}
            };
            for (const [rawId, rawTimer] of Object.entries(parsed.timers || {})) {
                const id = sanitizeTimerId(rawId || rawTimer.id);
                if (!id) continue;
                const kind = rawTimer.kind === 'stopwatch' ? 'stopwatch' : 'countdown';
                const timer = {
                    id,
                    label: String(rawTimer.label || id),
                    kind,
                    visible: rawTimer.visible !== false,
                    state: typeof rawTimer.state === 'string' ? rawTimer.state : 'idle',
                    startedAt: rawTimer.startedAt ? Number(rawTimer.startedAt) || null : null,
                    updatedAt: rawTimer.updatedAt || null,
                    completedAt: rawTimer.completedAt || null
                };
                if (kind === 'countdown') {
                    timer.mode = rawTimer.mode === 'date' ? 'date' : 'duration';
                    timer.durationMs = Math.max(0, Number(rawTimer.durationMs) || 0);
                    timer.targetAt = rawTimer.targetAt || null;
                    timer.startAt = rawTimer.startAt || null;
                    timer.timezone = String(rawTimer.timezone || '');
                    timer.progress = rawTimer.progress !== false;
                    timer.endMessage = String(rawTimer.endMessage || '⌛️');
                    timer.soundUrl = normalizeSoundUrl(rawTimer.soundUrl);
                    timer.showOnEnd = ['message', 'zero', 'none'].includes(rawTimer.showOnEnd) ? rawTimer.showOnEnd : 'message';
                    timer.remainingMs = Math.max(0, Number(rawTimer.remainingMs) || 0);
                    timer.startingRemainingMs = Math.max(0, Number(rawTimer.startingRemainingMs) || timer.remainingMs || timer.durationMs);
                } else {
                    timer.initialMs = Math.max(0, Number(rawTimer.initialMs) || 0);
                    timer.accumulatedMs = Math.max(0, Number(rawTimer.accumulatedMs) || timer.initialMs);
                }
                timer.httpActions = normalizeTimerHttpActions(rawTimer.httpActions || {});
                timerStore.timers[id] = timer;
            }
            console.log(`[Timers] Loaded ${Object.keys(timerStore.timers).length} timers`);
        } catch (err) {
            console.warn(`[Timers] Failed to load timers: ${err.message}`);
            timerStore = { settings: cloneJson(DEFAULT_TIMER_SETTINGS), timers: {} };
        }
    }

    function buildTimersSnapshot() {
        const now = Date.now();
        return {
            settings: timerStore.settings,
            timers: Object.fromEntries(Object.entries(timerStore.timers).map(([id, timer]) => [id, buildTimerSnapshot(timer, now)]))
        };
    }

    function getStore() {
        return timerStore;
    }

    function getSettings() {
        return timerStore.settings;
    }

    function updateSettings(raw = {}) {
        timerStore.settings = normalizeTimerSettings(raw);
        saveTimers();
        broadcastToOverlays('timer-settings', timerStore.settings);
        return timerStore.settings;
    }

    function getTimer(id) {
        return timerStore.timers[sanitizeTimerId(id)] || null;
    }

    function getTimerOrThrow(id) {
        const timer = getTimer(id);
        if (!timer) throw new Error('Timer not found');
        return timer;
    }

    function upsertTimer(input) {
        const timer = buildTimerRecord(input);
        timerStore.timers[timer.id] = timer;
        saveTimers();
        broadcastToOverlays('timer-update', { timer: buildTimerSnapshot(timer), settings: timerStore.settings });
        return timer;
    }

    function deleteTimer(id) {
        const safeId = sanitizeTimerId(id);
        getTimerOrThrow(safeId);
        delete timerStore.timers[safeId];
        saveTimers();
        broadcastToOverlays('timer-delete', { id: safeId });
        return safeId;
    }

    function applyTimerControl(idOrTimer, action, params = {}) {
        const timer = typeof idOrTimer === 'string' ? getTimerOrThrow(idOrTimer) : idOrTimer;
        const now = Date.now();
        const eventType = { value: null };
        const adjustmentMs = parseDurationMs(params);

        if (timer.kind === 'countdown') {
            if (action === 'start') {
                const remainingMs = timer.mode === 'date'
                    ? Math.max(0, Date.parse(timer.targetAt || '') - now)
                    : Math.max(0, timer.durationMs || 0);
                timer.state = remainingMs > 0 ? 'running' : 'completed';
                timer.startedAt = remainingMs > 0 ? now : null;
                timer.remainingMs = remainingMs;
                timer.startingRemainingMs = remainingMs;
                timer.completedAt = remainingMs > 0 ? null : new Date().toISOString();
                eventType.value = remainingMs > 0 ? 'countdown_started' : 'countdown_complete';
            } else if (action === 'pause') {
                pauseCountdownTimer(timer, now);
            } else if (action === 'resume') {
                const resumed = resumeCountdownTimer(timer, now);
                if (resumed) eventType.value = 'countdown_started';
                else eventType.value = 'countdown_complete';
            } else if (action === 'reset') {
                timer.state = 'idle';
                timer.startedAt = null;
                timer.completedAt = null;
                timer.remainingMs = timer.mode === 'date'
                    ? Math.max(0, Date.parse(timer.targetAt || '') - now)
                    : Math.max(0, timer.durationMs || 0);
                timer.startingRemainingMs = timer.remainingMs;
            } else if (action === 'add_time' || action === 'subtract_time') {
                if (adjustmentMs <= 0) throw new Error('Adjustment duration must be greater than 0');
                const result = adjustCountdownTime(timer, action === 'subtract_time' ? -adjustmentMs : adjustmentMs, now);
                if (result.completed) eventType.value = 'countdown_complete';
            } else if (action === 'visibility') {
                const mode = String(params.mode || params.actionMode || params.value || 'toggle').toLowerCase();
                if (mode === 'on' || mode === 'show' || mode === 'true') timer.visible = true;
                else if (mode === 'off' || mode === 'hide' || mode === 'false') timer.visible = false;
                else timer.visible = !timer.visible;
            } else {
                throw new Error(`Unsupported action for countdown: ${action}`);
            }
        } else {
            if (action === 'start') {
                timer.state = 'running';
                timer.startedAt = now;
                timer.accumulatedMs = Math.max(0, timer.accumulatedMs ?? timer.initialMs ?? 0);
                timer.completedAt = null;
                eventType.value = 'stopwatch_started';
            } else if (action === 'pause') {
                if (timer.state !== 'running') throw new Error('Stopwatch is not running');
                timer.accumulatedMs = computeStopwatchElapsed(timer, now);
                timer.startedAt = null;
                timer.state = 'paused';
                eventType.value = 'stopwatch_paused';
            } else if (action === 'resume') {
                if (timer.state !== 'paused' && timer.state !== 'idle') throw new Error('Stopwatch cannot resume from current state');
                timer.startedAt = now;
                timer.state = 'running';
                eventType.value = 'stopwatch_started';
            } else if (action === 'reset') {
                timer.accumulatedMs = Math.max(0, timer.initialMs || 0);
                timer.startedAt = null;
                timer.state = 'idle';
                timer.completedAt = null;
            } else if (action === 'set_time') {
                const nextMs = Math.max(0, parseDurationMs(params));
                timer.initialMs = nextMs;
                timer.accumulatedMs = nextMs;
                timer.startedAt = timer.state === 'running' ? now : null;
                if (timer.state === 'running') timer.state = 'running';
            } else if (action === 'add_time' || action === 'subtract_time') {
                if (adjustmentMs <= 0) throw new Error('Adjustment duration must be greater than 0');
                adjustStopwatchTime(timer, action === 'subtract_time' ? -adjustmentMs : adjustmentMs, now);
            } else if (action === 'visibility') {
                const mode = String(params.mode || params.actionMode || params.value || 'toggle').toLowerCase();
                if (mode === 'on' || mode === 'show' || mode === 'true') timer.visible = true;
                else if (mode === 'off' || mode === 'hide' || mode === 'false') timer.visible = false;
                else timer.visible = !timer.visible;
            } else {
                throw new Error(`Unsupported action for stopwatch: ${action}`);
            }
        }

        markTimerUpdated(timer);
        saveTimers();
        const snapshot = buildTimerSnapshot(timer);
        broadcastToOverlays('timer-update', { timer: snapshot, settings: timerStore.settings });
        if (eventType.value) fireTimerHttpAction(eventType.value, timer);
        return snapshot;
    }

    function startTimerTicker() {
        if (timerTickHandle) return;
        timerTickHandle = setInterval(() => {
            const now = Date.now();
            let changed = false;
            for (const timer of Object.values(timerStore.timers)) {
                if (timer.kind !== 'countdown' || timer.state !== 'running') continue;
                const remainingMs = computeCountdownRemaining(timer, now);
                if (remainingMs > 0) continue;
                timer.state = 'completed';
                timer.startedAt = null;
                timer.remainingMs = 0;
                timer.startingRemainingMs = 0;
                timer.completedAt = new Date().toISOString();
                markTimerUpdated(timer);
                broadcastToOverlays('timer-update', { timer: buildTimerSnapshot(timer, now), settings: timerStore.settings });
                fireTimerHttpAction('countdown_complete', timer);
                if (typeof onTimerEvent === 'function') {
                    onTimerEvent({ type: 'timer', timerId: timer.id, name: timer.label || timer.id, user: timer.label || timer.id, dedupeMs: 0 });
                }
                changed = true;
            }
            if (changed) saveTimers();
        }, 250);
    }

    function stopTimerTicker() {
        if (timerTickHandle) {
            clearInterval(timerTickHandle);
            timerTickHandle = null;
        }
    }

    function timerSoundUsers(name, assetReferencedIn) {
        const users = [];
        const matches = url => url && assetReferencedIn(url, name, null);
        if (matches(timerStore.settings?.sound_url)) users.push({ id: 'timer-settings', name: 'Timer sound (global)' });
        for (const timer of Object.values(timerStore.timers || {})) {
            if (matches(timer.soundUrl)) users.push({ id: `timer:${timer.id}`, name: `Timer: ${timer.label || timer.id}` });
        }
        return users;
    }

    function rewriteTimerSoundReferences(oldName, newName, rewriteAssetReferences) {
        let changed = false;
        const fix = url => {
            const next = rewriteAssetReferences(url || '', oldName, newName, null, null);
            if (next !== url) changed = true;
            return next;
        };
        if (timerStore.settings?.sound_url) timerStore.settings.sound_url = fix(timerStore.settings.sound_url);
        for (const timer of Object.values(timerStore.timers || {})) {
            if (timer.soundUrl) timer.soundUrl = fix(timer.soundUrl);
        }
        if (!changed) return false;
        saveTimers();
        broadcastToOverlays('timers-snapshot', buildTimersSnapshot());
        return true;
    }

    function getStats() {
        const timersList = Object.values(timerStore.timers);
        return {
            total: timersList.length,
            countdowns: timersList.filter(t => t.kind === 'countdown').length,
            stopwatches: timersList.filter(t => t.kind === 'stopwatch').length,
            running: timersList.filter(t => t.state === 'running').length
        };
    }

    return {
        loadTimers,
        saveTimers,
        getStore,
        getSettings,
        updateSettings,
        getTimer,
        getTimerOrThrow,
        upsertTimer,
        deleteTimer,
        applyTimerControl,
        buildTimersSnapshot,
        buildTimerSnapshot,
        startTimerTicker,
        stopTimerTicker,
        timerSoundUsers,
        rewriteTimerSoundReferences,
        getStats,
        get filePath() { return TIMERS_PATH; },
        get timers() { return timerStore.timers; },
        get settings() { return timerStore.settings; }
    };
}

module.exports = {
    createTimerService,
    DEFAULT_TIMER_SETTINGS,
    TIMER_EVENT_TYPES,
    formatTimerClock,
    parseDurationMs,
    sanitizeTimerId,
    normalizeTimerSettings,
    normalizeTimerHttpActions,
    buildTimerSnapshot
};

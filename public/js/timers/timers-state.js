/**
 * Shared state container and utility helpers for the Timers & Subathon Studio.
 */

export const TIMER_EVENTS = [
    'countdown_started',
    'countdown_complete',
    'stopwatch_started',
    'stopwatch_paused'
];

export const state = {
    timersData: {},
    timerSettings: {},
    selectedId: '', // '' means the form holds a not-yet-saved timer
    dirty: false,
    idTouched: false,
    listSignature: '',
    soundValues: { global: '', timer: '' },
    soundTarget: null,
    soundLibrary: [],
    previewAudio: null,
    subathonData: null,
    sbPreviewWidth: 1920,
    sbPreviewHeight: 1080,
    sbPreviewBackdrop: 'dark',
    sbPreviewSample: true,
    sbFontsPopulated: false
};

export const $ = id => document.getElementById(id);

export const esc = value => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export function escapeAttr(value) {
    return String(value).replace(/[&<>"']/g, ch => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[ch]));
}

export const slugify = value => String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

export const pad = n => String(n).padStart(2, '0');

export function toLocalInput(iso) {
    const d = iso ? new Date(iso) : null;
    if (!d || Number.isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

let toastTimer;
export function toast(message, kind = 'ok') {
    const el = $('toast');
    if (!el) return;
    el.textContent = message;
    el.className = `show${kind === 'error' ? ' error' : ''}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.className = ''; }, kind === 'error' ? 4500 : 2000);
}

export async function api(url, options = {}) {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
    return data;
}

export const jsonBody = (method, body) => ({
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
});

export function formatMs(ms) {
    let total = Math.max(0, Math.floor((ms || 0) / 1000));
    const days = Math.floor(total / 86400); total %= 86400;
    const hours = Math.floor(total / 3600); total %= 3600;
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return days > 0
        ? `${pad(days)}:${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
        : `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

export function getLiveTimer(timer) {
    if (!timer || timer.state !== 'running' || !timer.startedAt) return timer;
    const now = Date.now();
    if (timer.kind === 'countdown') {
        return {
            ...timer,
            remainingMs: Math.max(0, (timer.startingRemainingMs || timer.remainingMs || 0) - (now - timer.startedAt))
        };
    }
    if (timer.kind === 'stopwatch') {
        return {
            ...timer,
            elapsedMs: Math.max(0, (timer.accumulatedMs || 0) + (now - timer.startedAt))
        };
    }
    return timer;
}

export const displayMs = timer => (timer.kind === 'countdown' ? timer.remainingMs : timer.elapsedMs) || 0;

export function parseDuration(prefix) {
    const read = unit => Math.max(0, parseInt($(`${prefix}-${unit}`)?.value || '0', 10) || 0);
    return { days: read('days'), hours: read('hours'), minutes: read('minutes'), seconds: read('seconds') };
}

export const hasDuration = d => d.days || d.hours || d.minutes || d.seconds;

export function fillDuration(prefix, ms) {
    let seconds = Math.floor((ms || 0) / 1000);
    const parts = { days: Math.floor(seconds / 86400) }; seconds %= 86400;
    parts.hours = Math.floor(seconds / 3600); seconds %= 3600;
    parts.minutes = Math.floor(seconds / 60);
    parts.seconds = seconds % 60;
    for (const [unit, value] of Object.entries(parts)) $(`${prefix}-${unit}`).value = value || '';
}

export function setDirty(value) {
    state.dirty = value;
    $('dirty-pill').hidden = !state.dirty;
    $('revert-timer').disabled = !state.dirty;
}

export async function confirmDiscard() {
    return !state.dirty || await StreamPulse.confirm(
        'Discard Changes',
        'You have unsaved changes to this timer. Discard them?'
    );
}

export function secToMinSec(sec) {
    const s = Math.max(0, Math.round(Number(sec) || 0));
    return { min: Math.floor(s / 60), sec: s % 60 };
}

export function fromMinSec(minEl, secEl, defaultSec = 0) {
    const m = parseInt(minEl?.value, 10);
    const s = parseInt(secEl?.value, 10);
    if (isNaN(m) && isNaN(s)) return defaultSec;
    return (Math.max(0, m || 0) * 60) + Math.max(0, s || 0);
}

export function secToHrMin(sec) {
    const s = Math.max(0, Math.round(Number(sec) || 0));
    return { hr: Math.floor(s / 3600), min: Math.floor((s % 3600) / 60) };
}

export function fromHrMin(hrEl, minEl) {
    const h = Math.max(0, parseInt(hrEl?.value, 10) || 0);
    const m = Math.max(0, parseInt(minEl?.value, 10) || 0);
    return (h * 3600) + (m * 60);
}

export function formatDuration(sec) {
    sec = Math.max(0, Math.round(Number(sec) || 0));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
    return `${m}m ${String(s).padStart(2, '0')}s`;
}

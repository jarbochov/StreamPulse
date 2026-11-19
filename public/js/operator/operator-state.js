'use strict';

import { api } from '../shared/client-core.js';

const TAB_STORAGE_KEY = 'streampulse_operator_active_tab';
const LOCK_STORAGE_KEY = 'streampulse_operator_lock_mode';
const DENSE_STORAGE_KEY = 'streampulse_operator_dense_mode';
const FOCUS_STORAGE_KEY = 'streampulse_operator_focus_panel';
const FOCUSED_ID_PREFIX = 'streampulse_operator_focused_id_';
const COLLAPSED_PREFIX = 'streampulse_operator_collapsed_';

const params = new URLSearchParams(location.search);
const LOCKED_PROFILE_ID = (params.get('profile') || '').trim();
const DOCK_MODE = params.get('dock') === '1' || params.get('embed') === '1';
const BARE_MODE = params.get('bare') === '1' || params.get('tabs') === '0';
const URL_DENSE_PARAM = params.get('dense');
const SAVED_DENSE = localStorage.getItem(DENSE_STORAGE_KEY);
const INITIAL_DENSE = URL_DENSE_PARAM === '1'
    ? true
    : URL_DENSE_PARAM === '0'
        ? false
        : (SAVED_DENSE !== null ? SAVED_DENSE === '1' : DOCK_MODE);
const URL_FOCUS_PARAM = params.get('focus') ?? params.get('accordion');
const INITIAL_FOCUS = URL_FOCUS_PARAM === '1'
    ? true
    : URL_FOCUS_PARAM === '0'
        ? false
        : localStorage.getItem(FOCUS_STORAGE_KEY) === '1';
const URL_LOCK_PARAM = (params.get('lock') || '').trim().toLowerCase();
const VALID_LOCKS = new Set(['none', 'layout', 'show']);
const INITIAL_LOCK = VALID_LOCKS.has(URL_LOCK_PARAM)
    ? URL_LOCK_PARAM
    : (VALID_LOCKS.has(localStorage.getItem(LOCK_STORAGE_KEY)) ? localStorage.getItem(LOCK_STORAGE_KEY) : 'none');

if (DOCK_MODE) {
    document.documentElement.dataset.operatorDock = '1';
}
if (BARE_MODE) {
    document.documentElement.dataset.operatorBare = '1';
}
document.documentElement.dataset.operatorDense = INITIAL_DENSE ? '1' : '0';
document.documentElement.dataset.operatorLock = INITIAL_LOCK;

const listeners = new Set();

export const operatorState = {
    status: { modules: {}, alerts: { enabled: true } },
    version: 1,
    activeProfileId: 'default',
    profiles: [],
    lockedProfileId: LOCKED_PROFILE_ID,
    dockMode: DOCK_MODE,
    bareMode: BARE_MODE,
    denseMode: INITIAL_DENSE,
    focusPanelMode: INITIAL_FOCUS,
    lockMode: INITIAL_LOCK,
    urlLockPinned: VALID_LOCKS.has(URL_LOCK_PARAM),
    activeTab: localStorage.getItem(TAB_STORAGE_KEY) || 'board',
    saving: false
};

export function isFocusPanelMode() {
    return Boolean(operatorState.focusPanelMode);
}

export function setFocusPanelMode(enabled) {
    operatorState.focusPanelMode = Boolean(enabled);
    if (URL_FOCUS_PARAM === null) {
        localStorage.setItem(FOCUS_STORAGE_KEY, operatorState.focusPanelMode ? '1' : '0');
    }
    notify('focus-panel');
    return operatorState.focusPanelMode;
}

export function getCollapsedPanelIds(scopeKey) {
    try {
        const raw = JSON.parse(localStorage.getItem(`${COLLAPSED_PREFIX}${scopeKey}`) || '[]');
        return new Set(Array.isArray(raw) ? raw : []);
    } catch {
        return new Set();
    }
}

export function saveCollapsedPanelIds(scopeKey, set) {
    localStorage.setItem(`${COLLAPSED_PREFIX}${scopeKey}`, JSON.stringify([...set]));
}

export function getFocusedPanelId(scopeKey) {
    return localStorage.getItem(`${FOCUSED_ID_PREFIX}${scopeKey}`) || '';
}

export function saveFocusedPanelId(scopeKey, id) {
    localStorage.setItem(`${FOCUSED_ID_PREFIX}${scopeKey}`, id || '');
}

export function isDenseMode() {
    return Boolean(operatorState.denseMode);
}

export function setDenseMode(enabled) {
    operatorState.denseMode = Boolean(enabled);
    document.documentElement.dataset.operatorDense = operatorState.denseMode ? '1' : '0';
    if (URL_DENSE_PARAM === null) {
        localStorage.setItem(DENSE_STORAGE_KEY, operatorState.denseMode ? '1' : '0');
    }
    notify('dense');
    return operatorState.denseMode;
}

export function getLockMode() {
    return operatorState.lockMode || 'none';
}

export function isLayoutLocked() {
    return operatorState.lockMode === 'layout' || operatorState.lockMode === 'show';
}

export function isEditLocked() {
    return operatorState.lockMode === 'show';
}

export function setLockMode(nextMode) {
    const clean = VALID_LOCKS.has(nextMode) ? nextMode : 'none';
    operatorState.lockMode = clean;
    document.documentElement.dataset.operatorLock = clean;
    if (!operatorState.urlLockPinned) {
        localStorage.setItem(LOCK_STORAGE_KEY, clean);
    }
    notify('lock');
    return clean;
}

export function subscribeOperatorState(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
}

function notify(reason = 'change') {
    for (const fn of listeners) {
        try {
            fn(operatorState, reason);
        } catch (err) {
            console.error('[Operator] State listener error:', err);
        }
    }
}

export function getCurrentProfileId() {
    if (LOCKED_PROFILE_ID && operatorState.profiles.some(p => p.id === LOCKED_PROFILE_ID)) {
        return LOCKED_PROFILE_ID;
    }
    return operatorState.activeProfileId || operatorState.profiles[0]?.id || 'default';
}

export function getCurrentProfile() {
    const id = getCurrentProfileId();
    return operatorState.profiles.find(p => p.id === id) || operatorState.profiles[0] || null;
}

export function isProfileLocked() {
    return Boolean(LOCKED_PROFILE_ID);
}

export function setActiveTabState(tabId) {
    operatorState.activeTab = tabId;
    localStorage.setItem(TAB_STORAGE_KEY, tabId);
    document.body.dataset.operatorTab = tabId;
}

export async function refreshStatus() {
    const status = await api('/api/status');
    operatorState.status = status || { modules: {} };
    notify('status');
    return operatorState.status;
}

export async function refreshOperatorProfiles() {
    const res = await api('/api/operator');
    operatorState.version = res.version || 1;
    operatorState.activeProfileId = res.activeProfileId || 'default';
    operatorState.profiles = Array.isArray(res.profiles) ? res.profiles : [];
    notify('profiles');
    return operatorState;
}

export async function saveProfileToServer(profile, { activate = false } = {}) {
    operatorState.saving = true;
    notify('saving');
    try {
        const res = await api(
            `/api/operator/profiles/${encodeURIComponent(profile.id)}${activate ? '?select=1' : ''}`,
            'PUT',
            profile
        );
        const idx = operatorState.profiles.findIndex(p => p.id === res.profile.id);
        if (idx !== -1) operatorState.profiles[idx] = res.profile;
        else operatorState.profiles.push(res.profile);
        if (res.activeProfileId) operatorState.activeProfileId = res.activeProfileId;
        notify('profiles');
        return res.profile;
    } finally {
        operatorState.saving = false;
        notify('saved');
    }
}

export async function createProfileOnServer(payload, { activate = true } = {}) {
    const res = await api(`/api/operator/profiles${activate ? '?select=1' : ''}`, 'POST', payload);
    const idx = operatorState.profiles.findIndex(p => p.id === res.profile.id);
    if (idx !== -1) operatorState.profiles[idx] = res.profile;
    else operatorState.profiles.push(res.profile);
    if (res.activeProfileId) operatorState.activeProfileId = res.activeProfileId;
    notify('profiles');
    return res.profile;
}

export async function deleteProfileOnServer(id) {
    const res = await api(`/api/operator/profiles/${encodeURIComponent(id)}`, 'DELETE');
    operatorState.profiles = operatorState.profiles.filter(p => p.id !== id);
    if (res.activeProfileId) operatorState.activeProfileId = res.activeProfileId;
    notify('profiles');
    return res;
}

export async function activateProfileOnServer(id) {
    if (LOCKED_PROFILE_ID) {
        // Explicit ?profile=... URL stays pinned unless the user clears the query param
        return getCurrentProfile();
    }
    const res = await api(`/api/operator/profiles/${encodeURIComponent(id)}/activate`, 'POST', {});
    operatorState.activeProfileId = res.activeProfileId || id;
    notify('active-profile');
    return res.profile;
}

export async function importProfilesOnServer(payload, mode = 'merge') {
    const res = await api(`/api/operator/import?mode=${encodeURIComponent(mode)}`, 'POST', payload);
    if (res.state) {
        operatorState.activeProfileId = res.state.activeProfileId || operatorState.activeProfileId;
        operatorState.profiles = Array.isArray(res.state.profiles) ? res.state.profiles : operatorState.profiles;
    }
    notify('profiles');
    return res;
}

export function applyRemoteOperatorState(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return false;
    const prevJson = JSON.stringify({
        activeProfileId: operatorState.activeProfileId,
        profiles: operatorState.profiles
    });
    if (Array.isArray(snapshot.profiles)) {
        operatorState.profiles = snapshot.profiles;
    }
    if (!LOCKED_PROFILE_ID && snapshot.activeProfileId) {
        operatorState.activeProfileId = snapshot.activeProfileId;
    }
    const nextJson = JSON.stringify({
        activeProfileId: operatorState.activeProfileId,
        profiles: operatorState.profiles
    });
    notify('remote-profiles');
    return prevJson !== nextJson;
}

export function applyRemoteActiveProfile(payload) {
    if (LOCKED_PROFILE_ID) return false;
    if (payload?.activeProfileId) {
        operatorState.activeProfileId = payload.activeProfileId;
        notify('remote-active-profile');
        return true;
    }
    return false;
}

/**
 * StreamPulse Tier List Maker — State & API Service
 * Centralized state tracking, REST API methods, and WebSocket synchronization.
 */

import { $, connectLiveSocket, esc } from '../shared/client-core.js';

export { $, esc };

let state = {
    title: 'Community Tier List',
    theme: {},
    tiers: [],
    items: [],
    activeVote: null,
    presets: [],
    settings: {}
};

const stateListeners = new Set();

export function getState() {
    return state;
}

export function setState(newState) {
    state = newState;
    stateListeners.forEach(fn => {
        try { fn(state); } catch (err) { console.error('State listener error:', err); }
    });
}

export function onStateChange(fn) {
    stateListeners.add(fn);
    return () => stateListeners.delete(fn);
}

export function showToast(msg) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.style.display = 'flex';
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => { toast.style.display = 'none'; }, 2800);
}

export async function fetchState() {
    try {
        const res = await fetch('/api/tier-list');
        if (res.ok) {
            const data = await res.json();
            setState(data);
            return data;
        }
    } catch (err) {
        console.error('Failed to fetch tier list state:', err);
    }
    return state;
}

let lastVoteCancelled = false;

export function consumeLastVoteCancelled() {
    const cancelled = lastVoteCancelled;
    lastVoteCancelled = false;
    return cancelled;
}

export function setupWebSocket(onVoteUpdate) {
    return connectLiveSocket({
        onMessage: msg => {
            if (msg.type === 'tier-list:vote-cancel') {
                lastVoteCancelled = true;
            } else if (msg.type === 'tier-list:vote-start' || msg.type === 'tier-list:vote-end' || msg.type === 'tier-list:vote-locked') {
                lastVoteCancelled = false;
            }
            if (msg.type === 'tier-list:update' || msg.type === 'tier-list:move' ||
                msg.type === 'tier-list:vote-start' || msg.type === 'tier-list:vote-locked' ||
                msg.type === 'tier-list:vote-end' || msg.type === 'tier-list:vote-cancel') {
                fetchState();
            } else if (msg.type === 'tier-list:vote-update') {
                if (state.activeVote) {
                    state.activeVote.consensus = msg.data.consensus;
                    if (onVoteUpdate) onVoteUpdate(msg.data.consensus);
                }
            }
        }
    }).socket;
}

// ── Item Placement & Manipulation ────────────────────────────────────────────

export async function moveItem(itemId, toTier, toIndex) {
    try {
        await fetch('/api/tier-list/move', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ itemId, toTier, toIndex })
        });
        await fetchState();
    } catch (err) {
        console.error('Failed to sync item move:', err);
    }
}

export async function saveItem(payload, editId = null) {
    try {
        if (editId) {
            await fetch(`/api/tier-list/item/${encodeURIComponent(editId)}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            showToast('Item updated');
        } else {
            await fetch('/api/tier-list/item', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            showToast('Item added to pool');
        }
        await fetchState();
        return true;
    } catch (err) {
        showToast('Failed to save item');
        return false;
    }
}

export async function deleteItem(itemId) {
    if (!confirm('Delete this item?')) return false;
    try {
        await fetch(`/api/tier-list/item/${encodeURIComponent(itemId)}`, { method: 'DELETE' });
        showToast('Item deleted');
        await fetchState();
        return true;
    } catch {
        showToast('Failed to delete item');
        return false;
    }
}

export async function batchAddItems(items) {
    try {
        await fetch('/api/tier-list/items/batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items })
        });
        await fetchState();
        return true;
    } catch {
        return false;
    }
}

// ── Tier Management ──────────────────────────────────────────────────────────

export async function updateTiers(updatedTiers) {
    try {
        await fetch('/api/tier-list', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tiers: updatedTiers })
        });
        await fetchState();
        return true;
    } catch {
        return false;
    }
}

// ── Voting Controls ──────────────────────────────────────────────────────────

export async function startVote(itemId) {
    try {
        const res = await fetch('/api/tier-list/vote/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ itemId })
        });
        if (res.ok) {
            showToast('Chat vote started!');
            await fetchState();
            return true;
        }
        const errData = await res.json().catch(() => null);
        showToast(errData?.error || 'Failed to start vote');
    } catch (err) {
        showToast('Failed to start vote');
    }
    return false;
}

export async function lockVote() {
    try {
        await fetch('/api/tier-list/vote/end', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ applyConsensus: true })
        });
        showToast('Vote locked & placed!');
        await fetchState();
        return true;
    } catch {
        showToast('Failed to lock vote');
        return false;
    }
}

export async function cancelVote() {
    try {
        lastVoteCancelled = true;
        await fetch('/api/tier-list/vote/cancel', { method: 'POST' });
        showToast('Vote cancelled');
        await fetchState();
        return true;
    } catch {
        lastVoteCancelled = false;
        showToast('Failed to cancel vote');
        return false;
    }
}

export async function focusItem(itemId) {
    try {
        const res = await fetch('/api/tier-list/focus', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ itemId })
        });
        if (res.ok) {
            await fetchState();
            return true;
        }
    } catch {}
    showToast('Failed to focus item');
    return false;
}

export async function clearFocus() {
    try {
        const res = await fetch('/api/tier-list/focus/clear', { method: 'POST' });
        if (res.ok) {
            await fetchState();
            return true;
        }
    } catch {}
    return false;
}

// ── Board Reset & Item Clearing ──────────────────────────────────────────────

export async function resetPlacements() {
    if (!confirm('Move all ranked items back to the unranked pool?')) return false;
    await fetch('/api/tier-list/reset', { method: 'POST' });
    showToast('All items returned to pool');
    await fetchState();
    return true;
}

export async function clearAllItems() {
    if (!confirm('Delete all items from the tier list?')) return false;
    await fetch('/api/tier-list/clear', { method: 'POST' });
    showToast('All items cleared');
    await fetchState();
    return true;
}

export async function resetTiersToDefault() {
    if (!confirm('Restore the default S–F tiers? Items in removed custom tiers will return to the unranked pool.')) return false;
    const res = await fetch('/api/tier-list/tiers/reset', { method: 'POST' });
    if (res.ok) {
        showToast('Default tiers restored');
        await fetchState();
        return true;
    }
    showToast('Failed to restore default tiers');
    return false;
}

// ── Presets ──────────────────────────────────────────────────────────────────

export async function loadPreset(presetId) {
    await fetch(`/api/tier-list/presets/${encodeURIComponent(presetId)}/load`, { method: 'POST' });
    showToast('Preset loaded');
    await fetchState();
    return true;
}

export async function deletePreset(presetId) {
    const res = await fetch(`/api/tier-list/presets/${encodeURIComponent(presetId)}`, { method: 'DELETE' });
    if (res.ok) {
        showToast('Preset deleted');
        await fetchState();
        return true;
    }
    showToast('Failed to delete preset');
    return false;
}

export async function restoreDefaultPresets() {
    if (!confirm('Restore built-in default presets?')) return false;
    const res = await fetch('/api/tier-list/presets/reset', { method: 'POST' });
    if (res.ok) {
        showToast('Default presets restored');
        await fetchState();
        return true;
    }
    return false;
}

export async function savePreset(name, description, includeItems) {
    const res = await fetch('/api/tier-list/presets/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, includeItems })
    });
    if (res.ok) {
        showToast('Preset saved');
        await fetchState();
        return true;
    }
    showToast('Failed to save preset');
    return false;
}

// ── Settings & Theme ─────────────────────────────────────────────────────────

export async function saveTheme(themePatch, title = undefined, settingsPatch = undefined) {
    try {
        const body = { theme: themePatch };
        if (title !== undefined) body.title = title;
        if (settingsPatch && typeof settingsPatch === 'object') body.settings = settingsPatch;
        const res = await fetch('/api/tier-list', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (!res.ok) return false;
        const updated = await res.json();
        if (updated && typeof updated === 'object') {
            if (updated.theme) state.theme = updated.theme;
            if (updated.title !== undefined) state.title = updated.title;
            if (updated.settings) state.settings = updated.settings;
        }
        return updated || true;
    } catch {
        return false;
    }
}

export async function saveSettings(title, settings) {
    await fetch('/api/tier-list', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, settings })
    });
    showToast('Settings saved');
    await fetchState();
    return true;
}

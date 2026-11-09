/**
 * StreamPulse Tier List Maker — State & API Service
 * Centralized state tracking, REST API methods, and WebSocket synchronization.
 */

let state = {
    title: 'Community Tier List',
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

export function esc(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export const $ = id => document.getElementById(id);

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

export function setupWebSocket(onVoteUpdate) {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${location.host}/ws`);

    ws.onmessage = (event) => {
        try {
            const msg = JSON.parse(event.data);
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
        } catch {}
    };

    ws.onclose = () => setTimeout(() => setupWebSocket(onVoteUpdate), 3000);
    return ws;
}

// ── Item Placement & Manipulation ────────────────────────────────────────────

export async function moveItem(itemId, toTier, toIndex) {
    try {
        await fetch('/api/tier-list/move', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ itemId, toTier, toIndex })
        });
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
        await fetch('/api/tier-list/vote/cancel', { method: 'POST' });
        showToast('Vote cancelled');
        await fetchState();
        return true;
    } catch {
        showToast('Failed to cancel vote');
        return false;
    }
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

// ── Settings ─────────────────────────────────────────────────────────────────

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

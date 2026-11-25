const TAB_STORAGE_KEY = 'sp_mp_bingo_tab';
const PLAYER_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#06b6d4', '#ec4899', '#84cc16'];

let state = null;
let selectedPackId = '';
let previewView = 'multi';
let showCallerPanel = false;
const expandedOverrides = new Set();

const $ = id => document.getElementById(id);

function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function api(url, opts = {}) {
    const res = await fetch(url, {
        headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
        ...opts
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
}

function showNotice(msg) {
    const existing = document.getElementById('mpb-toast');
    if (existing) existing.remove();
    const el = document.createElement('div');
    el.id = 'mpb-toast';
    el.textContent = msg;
    Object.assign(el.style, {
        position: 'fixed', right: '20px', bottom: '20px', zIndex: '999',
        padding: '10px 16px', borderRadius: '10px', background: 'var(--bg-card)',
        border: '1px solid var(--accent)', color: 'var(--text-main)',
        fontSize: '13px', fontWeight: '600', boxShadow: '0 10px 28px rgba(0,0,0,0.4)'
    });
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2500);
}

function switchTab(tabName) {
    const valid = ['live', 'packs', 'overlay'].includes(tabName) ? tabName : 'live';
    try { localStorage.setItem(TAB_STORAGE_KEY, valid); } catch { /* ignore */ }
    document.querySelectorAll('.tab-btn[data-tab]').forEach(btn => {
        const active = btn.dataset.tab === valid;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-selected', String(active));
    });
    document.querySelectorAll('section[data-pane]').forEach(sec => {
        sec.hidden = sec.dataset.pane !== valid;
    });
    if (valid === 'overlay') syncPreview();
}

function playerUrl(token) {
    return `${location.origin}/bingo-play.html?t=${encodeURIComponent(token)}`;
}

function obsUrl() {
    const params = new URLSearchParams();
    if (previewView) params.set('view', previewView);
    const theme = $('app-theme')?.value;
    if (theme) params.set('theme', theme);
    return `${location.origin}/overlays/multiplayer-bingo.html?${params.toString()}`;
}

function computeCardCells(pack, card, claims) {
    const size = pack.size || 5;
    const total = size * size;
    const centerIdx = size % 2 === 1 ? Math.floor(total / 2) : -1;
    const hasFree = pack.freeSpace !== false && centerIdx >= 0;
    const isLockout = pack.claimMode === 'lockout';
    const stampedSet = new Set(Array.isArray(card.stamped) ? card.stamped : []);
    if (hasFree) stampedSet.add(centerIdx);
    const order = Array.isArray(card.order) ? card.order : [];
    const cells = [];
    let cursor = 0;
    for (let i = 0; i < total; i++) {
        if (hasFree && i === centerIdx) {
            cells.push({ index: i, label: pack.freeSpaceLabel || 'FREE', stamped: true, lockedByOther: false });
            continue;
        }
        const promptIndex = order[cursor] !== undefined ? Number(order[cursor]) : cursor;
        cursor++;
        const label = (pack.prompts && pack.prompts[promptIndex]) || `Square ${i + 1}`;
        let stamped = stampedSet.has(i);
        let lockedByOther = false;
        if (isLockout) {
            const cl = claims && claims[String(promptIndex)];
            if (cl) {
                stamped = cl.cardId === card.id;
                lockedByOther = cl.cardId !== card.id;
            } else {
                stamped = false;
            }
        }
        cells.push({ index: i, label, stamped, lockedByOther });
    }
    return cells;
}

function renderLiveTab() {
    if (!state) return;
    $('mpb-disabled-banner').hidden = state.enabled === true;

    const packSelect = $('mpb-active-pack');
    packSelect.innerHTML = (state.packs || []).map(p =>
        `<option value="${esc(p.id)}" ${p.id === state.activePackId ? 'selected' : ''}>${esc(p.name)}</option>`
    ).join('');

    const pack = state.activePack || state.packs[0];
    const session = state.session || { cards: [], claims: {} };
    $('mpb-pack-meta').textContent = `${pack.size}×${pack.size} · ${pack.claimMode === 'lockout' ? 'Lockout' : 'Independent'} · ${session.cards.length} player${session.cards.length === 1 ? '' : 's'}`;

    const hiddenBtn = $('btn-toggle-hidden');
    hiddenBtn.textContent = session.hidden ? 'Reveal Cards' : 'Hide Cards';
    hiddenBtn.classList.toggle('btn-primary', session.hidden);
    hiddenBtn.classList.toggle('btn-secondary', !session.hidden);

    const lockedBtn = $('btn-toggle-locked');
    lockedBtn.textContent = session.locked ? 'Unlock Board' : 'Lock Board';
    lockedBtn.classList.toggle('btn-primary', session.locked);
    lockedBtn.classList.toggle('btn-secondary', !session.locked);

    $('btn-clear-zoom').hidden = !session.focusedCardId;

    // Host Caller Board (mark/unmark a prompt across all player cards)
    const callerBtn = $('btn-toggle-caller');
    callerBtn.classList.toggle('btn-primary', showCallerPanel);
    callerBtn.classList.toggle('btn-secondary', !showCallerPanel);
    const callerPanel = $('mpb-caller-panel');
    callerPanel.hidden = !showCallerPanel;
    if (showCallerPanel) {
        const calledSet = new Set(Array.isArray(session.calledPrompts) ? session.calledPrompts : []);
        const isLockout = pack.claimMode === 'lockout';
        $('mpb-caller-hint').textContent = isLockout
            ? 'Pack is in Lockout mode (one owner per square). Switch pack to Independent mode to auto-mark all players at once, or click a called prompt to clear it.'
            : 'Click any prompt below to automatically stamp or unstamp it on every player card that has it.';
        $('mpb-caller-count').textContent = `${calledSet.size} / ${(pack.prompts || []).length} called`;
        const size = pack.size || 5;
        const playableSlots = pack.freeSpace !== false && size % 2 === 1 ? size * size - 1 : size * size;
        $('mpb-caller-grid').innerHTML = (pack.prompts || []).map((label, idx) => {
            const isCalled = calledSet.has(idx);
            const onCards = session.cards.filter(c => (c.order || []).slice(0, playableSlots).includes(idx)).length;
            return `<button type="button" class="mpb-caller-btn${isCalled ? ' is-called' : ''}" data-call-prompt="${idx}">
                <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${esc(label)}">${esc(label)}</span>
                <span class="mpb-caller-badge">${isCalled ? 'Called' : `${onCards}p`}</span>
            </button>`;
        }).join('');
    }

    // Suggest next distinct player color
    const nextColor = PLAYER_COLORS[session.cards.length % PLAYER_COLORS.length];
    if (!$('mpb-player-name').value) $('mpb-player-color').value = nextColor;

    const container = $('mpb-players-container');
    if (!session.cards.length) {
        container.innerHTML = '<div class="mpb-empty">No players added yet. Add a player above to generate their uniquely shuffled LAN Bingo card URL.</div>';
        return;
    }

    container.innerHTML = `<div class="mpb-players-grid">${session.cards.map(card => {
        const isFocused = session.focusedCardId === card.id;
        const cells = computeCardCells(pack, card, session.claims);
        const stampedCount = cells.filter(c => c.stamped).length;
        const url = playerUrl(card.token);
        const isOpen = expandedOverrides.has(card.id);
        return `
        <div class="mpb-player-card${isFocused ? ' is-focused' : ''}" data-card-id="${esc(card.id)}">
            <div class="mpb-player-head">
                <div class="mpb-player-id">
                    <span class="mpb-dot" style="background:${esc(card.color)};"></span>
                    <span class="mpb-player-name">${esc(card.name)}</span>
                </div>
                <span class="pill">${stampedCount}/${cells.length}</span>
            </div>
            <div class="mpb-url-row">
                <code title="${esc(url)}">${esc(url)}</code>
                <button type="button" class="btn btn-secondary btn-sm" data-act="copy" data-url="${esc(url)}">Copy</button>
                <a class="btn btn-secondary btn-sm" href="${esc(url)}" target="_blank" rel="noopener">Open</a>
            </div>
            <div class="mpb-player-actions">
                <button type="button" class="btn btn-sm ${isFocused ? 'btn-primary' : 'btn-secondary'}" data-act="zoom" data-card="${esc(card.id)}">${isFocused ? 'Unzoom' : 'Zoom Card'}</button>
                <button type="button" class="btn btn-sm btn-secondary" data-act="override" data-card="${esc(card.id)}">${isOpen ? 'Hide Override' : 'Host Override'}</button>
                <button type="button" class="btn btn-sm btn-secondary" data-act="regen" data-card="${esc(card.id)}">Regen Link</button>
                <button type="button" class="btn btn-sm btn-danger" data-act="remove" data-card="${esc(card.id)}">Remove</button>
            </div>
            ${isOpen ? `
            <div class="mpb-override-grid" style="grid-template-columns:repeat(${pack.size}, minmax(0, 1fr));">
                ${cells.map(c => `
                    <button type="button" class="mpb-override-cell${c.stamped ? ' is-stamped' : ''}${c.lockedByOther ? ' is-locked-other' : ''}"
                        data-act="toggle-cell" data-card="${esc(card.id)}" data-cell="${c.index}" title="${esc(c.label)}">
                        ${esc(c.label)}
                    </button>
                `).join('')}
            </div>` : ''}
        </div>`;
    }).join('')}</div>`;
}

function renderPacksTab() {
    if (!state) return;
    const packs = state.packs || [];
    if (!selectedPackId || !packs.some(p => p.id === selectedPackId)) {
        selectedPackId = state.activePackId || (packs[0] && packs[0].id) || '';
    }
    $('mpb-pack-list-items').innerHTML = packs.map(p => `
        <button type="button" class="mpb-pack-item${p.id === selectedPackId ? ' is-selected' : ''}" data-select-pack="${esc(p.id)}">
            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:650;">${esc(p.name)}</span>
            <span class="pill" style="font-size:10px;">${p.id === state.activePackId ? 'Live' : `${p.size}×${p.size}`}</span>
        </button>
    `).join('');

    const pack = packs.find(p => p.id === selectedPackId) || packs[0];
    if (!pack) return;
    $('mpb-pack-editor-title').textContent = `Edit Pack: ${pack.name}`;
    $('pack-name').value = pack.name;
    $('pack-size').value = String(pack.size || 5);
    $('pack-claim-mode').value = pack.claimMode || 'lockout';
    $('pack-header').value = pack.headerText || '';
    $('pack-free-space').checked = pack.freeSpace !== false;
    $('pack-free-label').value = pack.freeSpaceLabel || 'FREE';
    $('pack-prompts').value = (pack.prompts || []).join('\n');
    updatePromptCount();
    $('btn-del-pack').disabled = packs.length <= 1;
}

function updatePromptCount() {
    const lines = ($('pack-prompts').value || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const size = Number($('pack-size').value) || 5;
    const needed = $('pack-free-space').checked && size % 2 === 1 ? size * size - 1 : size * size;
    $('pack-prompt-count').textContent = `${lines.length} prompts (${needed} needed for ${size}×${size})`;
}

function renderAppearanceTab() {
    if (!state) return;
    const app = state.appearance || {};
    $('app-theme').value = app.theme || 'modern';
    $('app-stamp').value = app.stampStyle || 'dauber';
    $('app-default-view').value = app.defaultView || 'multi';
    $('app-font-size').value = String(app.fontSize || 13);
    $('app-radius').value = String(app.radius || 10);
    if (app.bingoColor && app.bingoColor.startsWith('#')) {
        $('app-bingo-color').value = app.bingoColor.slice(0, 7);
    }
    $('mpb-obs-url').textContent = obsUrl();
    syncPreview();
}

function syncPreview() {
    if (!state) return;
    const frame = $('mpb-preview-frame');
    $('mpb-obs-url').textContent = obsUrl();
    if (!frame || !frame.contentWindow) return;
    const previewState = {
        activePack: state.activePack,
        session: state.session,
        appearance: {
            ...state.appearance,
            theme: $('app-theme').value,
            stampStyle: $('app-stamp').value,
            defaultView: previewView,
            fontSize: Number($('app-font-size').value) || 13,
            radius: Number($('app-radius').value) || 10,
            bingoColor: $('app-bingo-color').value
        }
    };
    frame.contentWindow.postMessage({ type: 'mp-bingo-preview', state: previewState }, location.origin);
}

async function loadState() {
    state = await api('/api/multiplayer-bingo');
    renderLiveTab();
    renderPacksTab();
    renderAppearanceTab();
}

function bindEvents() {
    document.querySelectorAll('.tab-btn[data-tab]').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    $('mpb-active-pack').addEventListener('change', async e => {
        const res = await api('/api/multiplayer-bingo/packs/select', {
            method: 'POST',
            body: JSON.stringify({ id: e.target.value })
        });
        state = { ...res.state, enabled: state.enabled };
        renderLiveTab();
        renderPacksTab();
        syncPreview();
        showNotice('Switched active prompt pack & shuffled cards');
    });

    $('btn-toggle-caller').addEventListener('click', () => {
        showCallerPanel = !showCallerPanel;
        renderLiveTab();
    });

    $('mpb-caller-grid').addEventListener('click', async e => {
        const btn = e.target.closest('[data-call-prompt]');
        if (!btn) return;
        const promptIndex = Number(btn.dataset.callPrompt);
        const res = await api('/api/multiplayer-bingo/call', {
            method: 'POST',
            body: JSON.stringify({ prompt: promptIndex })
        });
        state = { ...res.state, enabled: state.enabled };
        renderLiveTab();
        syncPreview();
    });

    $('btn-toggle-hidden').addEventListener('click', async () => {
        const res = await api('/api/multiplayer-bingo/flags', {
            method: 'POST',
            body: JSON.stringify({ hidden: !state.session.hidden })
        });
        state = { ...res.state, enabled: state.enabled };
        renderLiveTab();
        syncPreview();
    });

    $('btn-toggle-locked').addEventListener('click', async () => {
        const res = await api('/api/multiplayer-bingo/flags', {
            method: 'POST',
            body: JSON.stringify({ locked: !state.session.locked })
        });
        state = { ...res.state, enabled: state.enabled };
        renderLiveTab();
        syncPreview();
    });

    $('btn-shuffle-all').addEventListener('click', async () => {
        const res = await api('/api/multiplayer-bingo/shuffle', { method: 'POST', body: '{}' });
        state = { ...res.state, enabled: state.enabled };
        renderLiveTab();
        syncPreview();
        showNotice('Shuffled all player cards');
    });

    $('btn-reset-board').addEventListener('click', async () => {
        const res = await api('/api/multiplayer-bingo/reset', { method: 'POST', body: '{}' });
        state = { ...res.state, enabled: state.enabled };
        renderLiveTab();
        syncPreview();
        showNotice('Cleared all stamps');
    });

    $('btn-clear-zoom').addEventListener('click', async () => {
        const res = await api('/api/multiplayer-bingo/focus', { method: 'POST', body: JSON.stringify({ card: '' }) });
        state = { ...res.state, enabled: state.enabled };
        renderLiveTab();
        syncPreview();
    });

    $('mpb-add-player-form').addEventListener('submit', async e => {
        e.preventDefault();
        const name = $('mpb-player-name').value.trim();
        if (!name) return;
        const color = $('mpb-player-color').value;
        const res = await api('/api/multiplayer-bingo/players/add', {
            method: 'POST',
            body: JSON.stringify({ name, color })
        });
        $('mpb-player-name').value = '';
        state = { ...res.state, enabled: state.enabled };
        renderLiveTab();
        syncPreview();
        showNotice(`Added ${res.card.name}`);
    });

    $('mpb-players-container').addEventListener('click', async e => {
        const btn = e.target.closest('[data-act]');
        if (!btn) return;
        const act = btn.dataset.act;
        const cardId = btn.dataset.card;
        if (act === 'copy') {
            await navigator.clipboard?.writeText(btn.dataset.url || '');
            showNotice('Copied player LAN URL');
        } else if (act === 'zoom') {
            const res = await api('/api/multiplayer-bingo/focus', {
                method: 'POST',
                body: JSON.stringify({ card: cardId, toggle: true })
            });
            state = { ...res.state, enabled: state.enabled };
            renderLiveTab();
            syncPreview();
        } else if (act === 'override') {
            if (expandedOverrides.has(cardId)) expandedOverrides.delete(cardId);
            else expandedOverrides.add(cardId);
            renderLiveTab();
        } else if (act === 'toggle-cell') {
            const res = await api('/api/multiplayer-bingo/players/toggle', {
                method: 'POST',
                body: JSON.stringify({ card: cardId, cell: Number(btn.dataset.cell) })
            });
            state = { ...res.state, enabled: state.enabled };
            renderLiveTab();
            syncPreview();
        } else if (act === 'regen') {
            const res = await api('/api/multiplayer-bingo/players/regen', {
                method: 'POST',
                body: JSON.stringify({ card: cardId })
            });
            state = { ...res.state, enabled: state.enabled };
            renderLiveTab();
            showNotice('Generated a fresh player link');
        } else if (act === 'remove') {
            const res = await api('/api/multiplayer-bingo/players/remove', {
                method: 'POST',
                body: JSON.stringify({ card: cardId })
            });
            expandedOverrides.delete(cardId);
            state = { ...res.state, enabled: state.enabled };
            renderLiveTab();
            syncPreview();
            showNotice('Removed player card');
        }
    });

    // Prompt Packs tab
    $('mpb-pack-list-items').addEventListener('click', e => {
        const item = e.target.closest('[data-select-pack]');
        if (!item) return;
        selectedPackId = item.dataset.selectPack;
        renderPacksTab();
    });

    $('btn-new-pack').addEventListener('click', async () => {
        const res = await api('/api/multiplayer-bingo/packs', {
            method: 'POST',
            body: JSON.stringify({ name: `Bingo Pack ${(state.packs?.length || 0) + 1}`, size: 5, claimMode: 'lockout' })
        });
        state = { ...res.state, enabled: state.enabled };
        selectedPackId = res.pack.id;
        renderLiveTab();
        renderPacksTab();
        showNotice('Created new prompt pack');
    });

    $('pack-prompts').addEventListener('input', updatePromptCount);
    $('pack-size').addEventListener('change', updatePromptCount);
    $('pack-free-space').addEventListener('change', updatePromptCount);

    $('mpb-pack-form').addEventListener('submit', async e => {
        e.preventDefault();
        if (!selectedPackId) return;
        const body = {
            name: $('pack-name').value.trim(),
            size: Number($('pack-size').value),
            claimMode: $('pack-claim-mode').value,
            headerText: $('pack-header').value.trim(),
            freeSpace: $('pack-free-space').checked,
            freeSpaceLabel: $('pack-free-label').value.trim() || 'FREE',
            prompts: $('pack-prompts').value.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
        };
        const res = await api(`/api/multiplayer-bingo/packs/${encodeURIComponent(selectedPackId)}`, {
            method: 'PUT',
            body: JSON.stringify(body)
        });
        state = { ...res.state, enabled: state.enabled };
        renderLiveTab();
        renderPacksTab();
        syncPreview();
        showNotice('Saved prompt pack');
    });

    $('btn-use-pack').addEventListener('click', async () => {
        if (!selectedPackId) return;
        const res = await api('/api/multiplayer-bingo/packs/select', {
            method: 'POST',
            body: JSON.stringify({ id: selectedPackId })
        });
        state = { ...res.state, enabled: state.enabled };
        renderLiveTab();
        renderPacksTab();
        syncPreview();
        showNotice('Activated prompt pack for live game');
    });

    $('btn-dup-pack').addEventListener('click', async () => {
        const src = (state.packs || []).find(p => p.id === selectedPackId);
        if (!src) return;
        const res = await api('/api/multiplayer-bingo/packs', {
            method: 'POST',
            body: JSON.stringify({ ...src, id: undefined, name: `${src.name} (Copy)` })
        });
        state = { ...res.state, enabled: state.enabled };
        selectedPackId = res.pack.id;
        renderPacksTab();
        showNotice('Duplicated prompt pack');
    });

    $('btn-del-pack').addEventListener('click', async () => {
        if (!selectedPackId || (state.packs?.length || 0) <= 1) return;
        const res = await api(`/api/multiplayer-bingo/packs/${encodeURIComponent(selectedPackId)}`, { method: 'DELETE' });
        state = { ...res.state, enabled: state.enabled };
        selectedPackId = state.activePackId;
        renderLiveTab();
        renderPacksTab();
        showNotice('Deleted prompt pack');
    });

    // Appearance tab + zero-reload postMessage preview
    ['app-theme', 'app-stamp', 'app-default-view', 'app-font-size', 'app-radius', 'app-bingo-color'].forEach(id => {
        $(id).addEventListener('input', syncPreview);
        $(id).addEventListener('change', syncPreview);
    });

    $('btn-save-appearance').addEventListener('click', async () => {
        const res = await api('/api/multiplayer-bingo/appearance', {
            method: 'POST',
            body: JSON.stringify({
                theme: $('app-theme').value,
                stampStyle: $('app-stamp').value,
                defaultView: $('app-default-view').value,
                fontSize: Number($('app-font-size').value) || 13,
                radius: Number($('app-radius').value) || 10,
                bingoColor: $('app-bingo-color').value
            })
        });
        state = { ...res.state, enabled: state.enabled };
        syncPreview();
        showNotice('Saved overlay appearance');
    });

    $('mpb-preview-view-chips').addEventListener('click', e => {
        const btn = e.target.closest('[data-preview-view]');
        if (!btn) return;
        previewView = btn.dataset.previewView;
        $('mpb-preview-view-chips').querySelectorAll('button').forEach(b => {
            b.classList.toggle('btn-primary', b === btn);
            b.classList.toggle('btn-secondary', b !== btn);
        });
        syncPreview();
    });

    $('btn-copy-obs-url').addEventListener('click', async () => {
        await navigator.clipboard?.writeText(obsUrl());
        showNotice('Copied OBS Overlay URL');
    });

    $('mpb-preview-frame').addEventListener('load', syncPreview);
}

function connectWs() {
    try {
        const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
        const ws = new WebSocket(`${proto}//${location.host}`);
        ws.onmessage = ev => {
            try {
                const msg = JSON.parse(ev.data);
                if (msg.type === 'multiplayer-bingo-update') loadState();
            } catch { /* ignore */ }
        };
        ws.onclose = () => setTimeout(connectWs, 3000);
    } catch { /* ignore */ }
}

bindEvents();
const savedTab = (() => { try { return localStorage.getItem(TAB_STORAGE_KEY); } catch { return null; } })();
switchTab(savedTab || 'live');
loadState();
connectWs();

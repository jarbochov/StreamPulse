const TAB_STORAGE_KEY = 'sp_mp_bingo_tab';
const LAN_IP_STORAGE_KEY = 'sp_mp_bingo_lan_ip';
const PLAYER_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#06b6d4', '#ec4899', '#84cc16'];

let state = null;
let selectedPackId = '';
let selectedLanIp = (() => { try { return localStorage.getItem(LAN_IP_STORAGE_KEY) || ''; } catch { return ''; } })();
let previewView = 'multi';
let previewRes = { w: 1920, h: 1080 };
let previewObserver = null;
let showCallerPanel = false;
let dismissedBingoSig = '';
let hasInitialLoaded = false;
const prevBingoCounts = new Map();
const expandedOverrides = new Set();

function applyStateUpdate(nextState) {
    if (!nextState) return;
    state = {
        ...nextState,
        enabled: nextState.enabled !== undefined ? nextState.enabled : state?.enabled,
        network: nextState.network !== undefined ? nextState.network : state?.network
    };
}

function playBingoChime() {
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        const notes = [523.25, 659.25, 783.99, 1046.5];
        notes.forEach((freq, idx) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.value = freq;
            const start = ctx.currentTime + idx * 0.08;
            gain.gain.setValueAtTime(0.0001, start);
            gain.gain.exponentialRampToValueAtTime(0.14, start + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.28);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(start);
            osc.stop(start + 0.3);
        });
        setTimeout(() => ctx.close().catch(() => {}), 900);
    } catch { /* autoplay or unsupported */ }
}

function detectLines(size, stampedSet, { fourCorners = false } = {}) {
    const lines = [];
    for (let r = 0; r < size; r++) {
        const row = [];
        for (let c = 0; c < size; c++) row.push(r * size + c);
        if (row.every(i => stampedSet.has(i))) lines.push(row);
    }
    for (let c = 0; c < size; c++) {
        const col = [];
        for (let r = 0; r < size; r++) col.push(r * size + c);
        if (col.every(i => stampedSet.has(i))) lines.push(col);
    }
    const d1 = [];
    const d2 = [];
    for (let i = 0; i < size; i++) {
        d1.push(i * size + i);
        d2.push(i * size + (size - 1 - i));
    }
    if (d1.every(i => stampedSet.has(i))) lines.push(d1);
    if (d2.every(i => stampedSet.has(i))) lines.push(d2);
    if (fourCorners && size >= 2) {
        const corners = [0, size - 1, size * (size - 1), size * size - 1];
        if (corners.every(i => stampedSet.has(i))) lines.push(corners);
    }
    return lines;
}

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
    if (valid === 'overlay') {
        layoutPreviewStage();
        syncPreview();
    }
}

function isLoopbackHost(hostname) {
    const h = String(hostname || '').toLowerCase();
    return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '[::1]';
}

function originForIp(ip, port) {
    const p = Number(port) || 0;
    return `http://${ip}${p && p !== 80 ? `:${p}` : ''}`;
}

function getShareOrigin() {
    const net = state?.network || {};
    const lanIps = Array.isArray(net.lanIps) ? net.lanIps : [];
    const port = Number(net.port) || (location.port ? Number(location.port) : 0);
    if (selectedLanIp && lanIps.includes(selectedLanIp)) {
        return originForIp(selectedLanIp, port);
    }
    if (isLoopbackHost(location.hostname)) {
        if (net.lanOrigin) return net.lanOrigin;
        if (lanIps.length) return originForIp(lanIps[0], port);
    }
    return location.origin;
}

function renderShareHostControl() {
    const wrap = $('mpb-share-host-wrap');
    if (!wrap) return;
    const net = state?.network || {};
    const lanIps = Array.isArray(net.lanIps) ? net.lanIps : [];
    const port = Number(net.port) || (location.port ? Number(location.port) : 0);
    const activeOrigin = getShareOrigin();
    const activeHost = activeOrigin.replace(/^https?:\/\//i, '');
    const icon = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>';
    wrap.hidden = false;
    if (lanIps.length > 1) {
        const currentNonLoopback = !isLoopbackHost(location.hostname) && !lanIps.includes(location.hostname);
        const activeVal = selectedLanIp && lanIps.includes(selectedLanIp)
            ? selectedLanIp
            : (isLoopbackHost(location.hostname) ? (net.lanIp || lanIps[0]) : (lanIps.includes(location.hostname) ? location.hostname : '__current__'));
        const options = [
            ...(currentNonLoopback ? [`<option value="__current__" ${activeVal === '__current__' ? 'selected' : ''}>${esc(location.host)}</option>`] : []),
            ...lanIps.map(ip => {
                const label = `${ip}${port && port !== 80 ? `:${port}` : ''}`;
                return `<option value="${esc(ip)}" ${activeVal === ip ? 'selected' : ''}>${esc(label)}</option>`;
            })
        ].join('');
        wrap.innerHTML = `${icon}<span class="mpb-share-host-label">LAN Host</span><select id="mpb-lan-ip-select" aria-label="Select LAN Host IP">${options}</select>`;
    } else {
        const lbl = lanIps.length ? 'LAN' : 'Host';
        wrap.innerHTML = `${icon}<span class="mpb-share-host-label">${lbl}</span><code title="${esc(activeOrigin)}">${esc(activeHost)}</code>`;
    }
}

function playerUrl(token) {
    return `${getShareOrigin()}/bingo-play.html?t=${encodeURIComponent(token)}`;
}

function obsUrl() {
    const params = new URLSearchParams();
    if (previewView) params.set('view', previewView);
    if (previewView === 'single' && $('mpb-preview-card-select')?.value) {
        params.set('card', $('mpb-preview-card-select').value);
    }
    const theme = $('app-theme')?.value;
    if (theme) params.set('theme', theme);
    const scale = Number($('app-scale')?.value);
    if (scale && scale !== 1) params.set('scale', String(scale));
    if (previewView === 'multi' && $('app-show-multi-labels')?.checked) params.set('labels', '1');
    return `${location.origin}/overlays/multiplayer-bingo.html?${params.toString()}`;
}

function computeCardCells(pack, card, claims, { fourCorners = false } = {}) {
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
        cells.push({ index: i, label, stamped, lockedByOther, winning: false });
    }
    const finalStamped = new Set(cells.filter(c => c.stamped).map(c => c.index));
    const lines = detectLines(size, finalStamped, { fourCorners });
    const winSet = new Set(lines.flat());
    for (const c of cells) c.winning = winSet.has(c.index);
    return { cells, bingoCount: lines.length };
}

function renderLiveTab() {
    if (!state) return;
    $('mpb-disabled-banner').hidden = state.enabled === true;
    renderShareHostControl();

    const packSelect = $('mpb-active-pack');
    packSelect.innerHTML = (state.packs || []).map(p =>
        `<option value="${esc(p.id)}" ${p.id === state.activePackId ? 'selected' : ''}>${esc(p.name)}</option>`
    ).join('');

    const pack = state.activePack || state.packs[0];
    const session = state.session || { cards: [], claims: {}, pendingCalls: [] };
    const fourCorners = Boolean(session.fourCorners);
    const confirmCalls = Boolean(session.confirmCalls);
    const pendingCalls = Array.isArray(session.pendingCalls) ? session.pendingCalls : [];
    const cardsById = Object.fromEntries(session.cards.map(c => [c.id, c]));

    $('mpb-pack-meta').textContent = `${pack.size}×${pack.size} · ${pack.claimMode === 'lockout' ? 'Lockout' : 'Independent'}${fourCorners ? ' · Four Corners' : ''} · ${session.cards.length} player${session.cards.length === 1 ? '' : 's'}`;

    const fourCornersBtn = $('btn-toggle-four-corners');
    if (fourCornersBtn) {
        fourCornersBtn.classList.toggle('btn-primary', fourCorners);
        fourCornersBtn.classList.toggle('btn-secondary', !fourCorners);
        fourCornersBtn.setAttribute('aria-pressed', String(fourCorners));
    }

    const hiddenBtn = $('btn-toggle-hidden');
    hiddenBtn.textContent = session.hidden ? 'Reveal Cards' : 'Hide Cards';
    hiddenBtn.classList.toggle('btn-primary', session.hidden);
    hiddenBtn.classList.toggle('btn-secondary', !session.hidden);

    const lockedBtn = $('btn-toggle-locked');
    lockedBtn.textContent = session.locked ? 'Unlock Board' : 'Lock Board';
    lockedBtn.classList.toggle('btn-primary', session.locked);
    lockedBtn.classList.toggle('btn-secondary', !session.locked);

    $('btn-clear-zoom').hidden = !session.focusedCardId;

    // Host Caller Board (mark/unmark a prompt across all player cards + show player calls & pending confirmations)
    const callerBtn = $('btn-toggle-caller');
    callerBtn.classList.toggle('btn-primary', showCallerPanel);
    callerBtn.classList.toggle('btn-secondary', !showCallerPanel);
    const pendingBadge = $('mpb-caller-pending-badge');
    if (pendingBadge) {
        pendingBadge.hidden = pendingCalls.length === 0;
        pendingBadge.textContent = String(pendingCalls.length);
    }

    const callerPanel = $('mpb-caller-panel');
    callerPanel.hidden = !showCallerPanel;
    if (showCallerPanel) {
        const calledSet = new Set(Array.isArray(session.calledPrompts) ? session.calledPrompts : []);
        const isLockout = pack.claimMode === 'lockout';
        const confirmBtn = $('btn-toggle-confirm-calls');
        if (confirmBtn) {
            confirmBtn.classList.toggle('btn-primary', confirmCalls);
            confirmBtn.classList.toggle('btn-secondary', !confirmCalls);
            confirmBtn.setAttribute('aria-pressed', String(confirmCalls));
            const lblSpan = confirmBtn.querySelector('span');
            if (lblSpan) lblSpan.textContent = confirmCalls ? 'Confirm Calls: On' : 'Confirm Calls';
        }
        $('mpb-caller-hint').textContent = confirmCalls
            ? 'Confirm Mode is active — player taps queue below for host approval before stamping.'
            : isLockout
                ? 'Pack is in Lockout mode (one owner per square). Player claims appear on each prompt tile; click a called prompt to clear it.'
                : 'Click any prompt below to automatically stamp or unstamp it on every player card that has it.';
        $('mpb-caller-count').textContent = `${calledSet.size} / ${(pack.prompts || []).length} called`;

        // Dedicated Pending Player Calls review panel
        const pendingPanel = $('mpb-pending-panel');
        if (pendingPanel) {
            if (!pendingCalls.length) {
                pendingPanel.hidden = true;
                pendingPanel.innerHTML = '';
            } else {
                pendingPanel.hidden = false;
                const bulkActions = pendingCalls.length >= 2
                    ? `<div class="mpb-pending-actions">
                        <button type="button" class="btn btn-primary btn-sm" data-pending-act="confirm-all">Confirm All</button>
                        <button type="button" class="btn btn-secondary btn-sm" data-pending-act="dismiss-all">Dismiss All</button>
                    </div>`
                    : '';
                pendingPanel.innerHTML = `
                    <div class="mpb-pending-head">
                        <span class="mpb-pending-title">
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                            Pending Player Calls (${pendingCalls.length})
                        </span>
                        ${bulkActions}
                    </div>
                    <div class="mpb-pending-list">
                        ${pendingCalls.map(p => {
                            const player = cardsById[p.cardId] || { name: 'Player', color: '#94a3b8' };
                            const promptLabel = (pack.prompts && pack.prompts[p.promptIndex]) || `Square ${p.cell + 1}`;
                            return `<div class="mpb-pending-item">
                                <div class="mpb-pending-who">
                                    <span class="mpb-dot" style="width:10px;height:10px;background:${esc(player.color)};"></span>
                                    <span class="mpb-pending-player">${esc(player.name)}</span>
                                    <span class="mpb-pending-sep" aria-hidden="true">/</span>
                                    <span class="mpb-pending-prompt" title="${esc(promptLabel)}">${esc(promptLabel)}</span>
                                </div>
                                <div class="mpb-pending-actions">
                                    <button type="button" class="btn btn-primary btn-sm" data-pending-act="confirm" data-pending-id="${esc(p.id)}">Confirm</button>
                                    <button type="button" class="btn btn-secondary btn-sm" data-pending-act="dismiss" data-pending-id="${esc(p.id)}">Dismiss</button>
                                </div>
                            </div>`;
                        }).join('')}
                    </div>`;
            }
        }

        const size = pack.size || 5;
        const total = size * size;
        const centerIdx = size % 2 === 1 ? Math.floor(total / 2) : -1;
        const hasFree = pack.freeSpace !== false && centerIdx >= 0;
        const playableSlots = hasFree ? total - 1 : total;

        const pendingByPrompt = new Map();
        for (const p of pendingCalls) {
            const player = cardsById[p.cardId];
            if (!player) continue;
            if (!pendingByPrompt.has(p.promptIndex)) pendingByPrompt.set(p.promptIndex, []);
            const list = pendingByPrompt.get(p.promptIndex);
            if (!list.some(item => item.id === player.id)) list.push(player);
        }

        $('mpb-caller-grid').innerHTML = (pack.prompts || []).map((label, idx) => {
            const isCalled = calledSet.has(idx);
            const onCards = session.cards.filter(c => (c.order || []).slice(0, playableSlots).includes(idx)).length;
            const stampedPlayers = [];
            if (isLockout) {
                const cl = session.claims && session.claims[String(idx)];
                if (cl && cardsById[cl.cardId]) stampedPlayers.push(cardsById[cl.cardId]);
            } else {
                for (const c of session.cards) {
                    const pos = (c.order || []).slice(0, playableSlots).indexOf(idx);
                    if (pos < 0) continue;
                    const cellIdx = hasFree && pos >= centerIdx ? pos + 1 : pos;
                    if ((c.stamped || []).includes(cellIdx)) stampedPlayers.push(c);
                }
            }
            const pendingPlayers = pendingByPrompt.get(idx) || [];
            const chipsHtml = (stampedPlayers.length || pendingPlayers.length)
                ? `<span class="mpb-caller-players">
                    ${stampedPlayers.map(p => `<span class="mpb-caller-chip is-stamped" title="${esc(p.name)} — Stamped"><span class="mpb-caller-chip-dot" style="background:${esc(p.color)};"></span><span class="mpb-caller-chip-name">${esc(p.name)}</span></span>`).join('')}
                    ${pendingPlayers.map(p => `<span class="mpb-caller-chip is-pending" title="${esc(p.name)} — Pending confirmation"><span class="mpb-caller-chip-dot" style="background:${esc(p.color)};"></span><span class="mpb-caller-chip-name">${esc(p.name)}</span><span class="mpb-caller-chip-tag">Pending</span></span>`).join('')}
                </span>`
                : '';
            return `<button type="button" class="mpb-caller-btn${isCalled ? ' is-called' : ''}${pendingPlayers.length ? ' has-pending' : ''}" data-call-prompt="${idx}">
                <span class="mpb-caller-btn-top">
                    <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${esc(label)}">${esc(label)}</span>
                    <span class="mpb-caller-badge">${isCalled ? 'Called' : `${onCards}p`}</span>
                </span>
                ${chipsHtml}
            </button>`;
        }).join('');
    }

    // Suggest next distinct player color
    const nextColor = PLAYER_COLORS[session.cards.length % PLAYER_COLORS.length];
    if (!$('mpb-player-name').value) $('mpb-player-color').value = nextColor;

    // Compute winners across all cards & notify host when someone hits BINGO
    const cardSummaries = session.cards.map(card => ({
        card,
        ...computeCardCells(pack, card, session.claims, { fourCorners })
    }));
    const winners = cardSummaries.filter(s => s.bingoCount > 0);
    const newlyWon = [];
    for (const s of cardSummaries) {
        const prev = prevBingoCounts.get(s.card.id) || 0;
        if (hasInitialLoaded && s.bingoCount > prev) newlyWon.push(s);
        prevBingoCounts.set(s.card.id, s.bingoCount);
    }
    for (const id of [...prevBingoCounts.keys()]) {
        if (!session.cards.some(c => c.id === id)) prevBingoCounts.delete(id);
    }
    hasInitialLoaded = true;

    const winnerSig = winners.map(w => `${w.card.id}:${w.bingoCount}`).join('|');
    if (newlyWon.length) {
        dismissedBingoSig = '';
        playBingoChime();
        const names = newlyWon.map(w => w.card.name).join(', ');
        showNotice(`BINGO! ${names} completed a line!`);
    }
    const alertEl = $('mpb-bingo-alert');
    if (winners.length && winnerSig !== dismissedBingoSig) {
        alertEl.hidden = false;
        $('mpb-bingo-alert-text').innerHTML = `
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#22c55e" stroke-width="2.2" aria-hidden="true"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            <strong>BINGO!</strong>
            ${winners.map(w => `
                <span class="pill mpb-pill-win">
                    <span class="mpb-dot" style="width:9px;height:9px;background:${esc(w.card.color)};"></span>
                    ${esc(w.card.name)}${w.bingoCount > 1 ? ` ×${w.bingoCount}` : ''}
                </span>
            `).join('')}
        `;
        const primaryWinner = winners[0].card;
        $('mpb-bingo-alert-actions').innerHTML = `
            <button type="button" class="btn btn-primary btn-sm" data-alert-act="zoom" data-card="${esc(primaryWinner.id)}">Zoom ${esc(primaryWinner.name)}</button>
            ${!session.locked ? '<button type="button" class="btn btn-secondary btn-sm" data-alert-act="lock">Lock Board</button>' : ''}
            <button type="button" class="btn btn-secondary btn-sm" data-alert-act="dismiss">Dismiss</button>
        `;
    } else {
        alertEl.hidden = true;
    }

    const container = $('mpb-players-container');
    if (!session.cards.length) {
        container.innerHTML = '<div class="mpb-empty">No players added yet. Add a player above to generate their uniquely shuffled LAN Bingo card URL.</div>';
        return;
    }

    const pendingByCard = new Map();
    for (const p of pendingCalls) {
        if (!pendingByCard.has(p.cardId)) pendingByCard.set(p.cardId, new Set());
        pendingByCard.get(p.cardId).add(Number(p.cell));
    }

    container.innerHTML = `<div class="mpb-players-grid">${cardSummaries.map(({ card, cells, bingoCount }) => {
        const isFocused = session.focusedCardId === card.id;
        const stampedCount = cells.filter(c => c.stamped).length;
        const url = playerUrl(card.token);
        const isOpen = expandedOverrides.has(card.id);
        const cardPendingCells = pendingByCard.get(card.id);
        return `
        <div class="mpb-player-card${isFocused ? ' is-focused' : ''}${bingoCount > 0 ? ' is-winner' : ''}" data-card-id="${esc(card.id)}">
            <div class="mpb-player-head">
                <div class="mpb-player-id">
                    <span class="mpb-dot" style="background:${esc(card.color)};"></span>
                    <span class="mpb-player-name">${esc(card.name)}</span>
                </div>
                <span class="pill${bingoCount > 0 ? ' mpb-pill-win' : ''}">${bingoCount > 0 ? `BINGO${bingoCount > 1 ? ` ×${bingoCount}` : ''} · ${stampedCount}/${cells.length}` : `${stampedCount}/${cells.length}`}</span>
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
                ${cells.map(c => {
                    const isPending = Boolean(cardPendingCells && !c.stamped && !c.lockedByOther && cardPendingCells.has(c.index));
                    return `
                    <button type="button" class="mpb-override-cell${c.stamped ? ' is-stamped' : ''}${isPending ? ' is-pending' : ''}${c.winning ? ' is-winning' : ''}${c.lockedByOther ? ' is-locked-other' : ''}"
                        data-act="toggle-cell" data-card="${esc(card.id)}" data-cell="${c.index}" title="${esc(c.label)}${isPending ? ' (Pending confirmation)' : ''}">
                        ${esc(c.label)}
                    </button>`;
                }).join('')}
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

const THEME_PRESETS = {
    modern: { boardBackground: '#0f172ad9', cellBackground: '#1e293bcc', textColor: '#f8fafc', borderColor: '#ffffff26', bingoColor: '#22c55e', shadow: 'soft', backdropBlur: 8 },
    esports: { boardBackground: '#090d16eb', cellBackground: '#111827e6', textColor: '#f8fafc', borderColor: '#38bdf844', bingoColor: '#38bdf8', shadow: 'heavy', backdropBlur: 4 },
    sports: { boardBackground: '#0b192ce8', cellBackground: '#152a45d9', textColor: '#ffffff', borderColor: '#fbbf2466', bingoColor: '#fbbf24', shadow: 'medium', backdropBlur: 0 },
    arcade: { boardBackground: '#120724eb', cellBackground: '#1f0d3dd9', textColor: '#fdf4ff', borderColor: '#e879f955', bingoColor: '#facc15', shadow: 'neon', backdropBlur: 4 },
    minimal: { boardBackground: '#00000000', cellBackground: '#0f172aa6', textColor: '#ffffff', borderColor: '#ffffff33', bingoColor: '#4ade80', shadow: 'none', backdropBlur: 0 },
    cozy: { boardBackground: '#29201be6', cellBackground: '#3b2e26d9', textColor: '#fef3c7', borderColor: '#f59e0b44', bingoColor: '#84cc16', shadow: 'soft', backdropBlur: 6 },
    synthwave: { boardBackground: '#16082be8', cellBackground: '#261147d9', textColor: '#f0abfc', borderColor: '#22d3ee66', bingoColor: '#22d3ee', shadow: 'neon', backdropBlur: 8 }
};

function splitHexAlpha(hex8, fallbackHex = '#0f172a', fallbackAlpha = 85) {
    const s = String(hex8 || '').trim();
    if (/^#[0-9a-f]{8}$/i.test(s)) {
        return { hex: s.slice(0, 7), alpha: Math.round((parseInt(s.slice(7, 9), 16) / 255) * 100) };
    }
    if (/^#[0-9a-f]{6}$/i.test(s)) {
        return { hex: s, alpha: 100 };
    }
    return { hex: fallbackHex, alpha: fallbackAlpha };
}

function joinHexAlpha(hex, alphaPct) {
    const clean = /^#[0-9a-f]{6}$/i.test(hex) ? hex : '#0f172a';
    const byte = Math.max(0, Math.min(255, Math.round((Number(alphaPct) / 100) * 255)));
    return `${clean}${byte.toString(16).padStart(2, '0')}`;
}

function readAppearanceForm() {
    return {
        theme: $('app-theme').value,
        stampStyle: $('app-stamp').value,
        defaultView: $('app-default-view').value,
        scale: Number($('app-scale').value) || 1,
        boardBackground: joinHexAlpha($('app-board-bg').value, $('app-board-bg-alpha').value),
        cellBackground: joinHexAlpha($('app-cell-bg').value, $('app-cell-bg-alpha').value),
        borderColor: joinHexAlpha($('app-border-color').value, $('app-border-alpha').value),
        textColor: $('app-text-color').value,
        bingoColor: $('app-bingo-color').value,
        fontFamily: $('app-font-family').value,
        fontWeight: Number($('app-font-weight').value) || 700,
        fontSize: Number($('app-font-size').value) || 13,
        uppercaseHeaders: $('app-uppercase-headers').checked,
        radius: Number($('app-radius').value) || 0,
        borderWidth: Number($('app-border-width').value) || 0,
        cellGap: Number($('app-cell-gap').value) || 6,
        padding: Number($('app-padding').value) || 12,
        outerMargin: Number($('app-outer-margin').value) || 0,
        backdropBlur: Number($('app-backdrop-blur').value) || 0,
        shadow: $('app-shadow').value,
        showPlayerNames: $('app-show-player-names').checked,
        showScores: $('app-show-scores').checked,
        showBingoBanner: $('app-show-bingo-banner').checked,
        showMultiLabels: $('app-show-multi-labels').checked,
        showFreeMarker: $('app-show-free-marker').checked,
        animate: $('app-animate').checked,
        bingoBannerText: $('app-bingo-banner-text').value.trim() || 'BINGO!'
    };
}

function writeAppearanceForm(app) {
    $('app-theme').value = app.theme || 'modern';
    $('app-stamp').value = app.stampStyle || 'dauber';
    $('app-default-view').value = app.defaultView || 'multi';
    $('app-scale').value = String(app.scale ?? 1);
    $('app-scale-val').textContent = `${Math.round((app.scale ?? 1) * 100)}%`;

    const bbg = splitHexAlpha(app.boardBackground, '#0f172a', 85);
    $('app-board-bg').value = bbg.hex;
    $('app-board-bg-alpha').value = String(bbg.alpha);
    $('app-board-bg-alpha-val').textContent = `${bbg.alpha}%`;

    const cbg = splitHexAlpha(app.cellBackground, '#1e293b', 80);
    $('app-cell-bg').value = cbg.hex;
    $('app-cell-bg-alpha').value = String(cbg.alpha);
    $('app-cell-bg-alpha-val').textContent = `${cbg.alpha}%`;

    const brd = splitHexAlpha(app.borderColor, '#ffffff', 15);
    $('app-border-color').value = brd.hex;
    $('app-border-alpha').value = String(brd.alpha);
    $('app-border-alpha-val').textContent = `${brd.alpha}%`;

    $('app-text-color').value = (app.textColor || '#f8fafc').slice(0, 7);
    $('app-bingo-color').value = (app.bingoColor || '#22c55e').slice(0, 7);
    $('app-font-family').value = app.fontFamily || 'system-ui';
    $('app-font-weight').value = String(app.fontWeight || 700);
    $('app-font-size').value = String(app.fontSize || 13);
    $('app-uppercase-headers').checked = Boolean(app.uppercaseHeaders);
    $('app-radius').value = String(app.radius ?? 10);
    $('app-border-width').value = String(app.borderWidth ?? 2);
    $('app-cell-gap').value = String(app.cellGap ?? 6);
    $('app-padding').value = String(app.padding ?? 12);
    $('app-outer-margin').value = String(app.outerMargin ?? 16);
    $('app-backdrop-blur').value = String(app.backdropBlur ?? 8);
    $('app-shadow').value = app.shadow || 'soft';
    $('app-show-player-names').checked = app.showPlayerNames !== false;
    $('app-show-scores').checked = app.showScores !== false;
    $('app-show-bingo-banner').checked = app.showBingoBanner !== false;
    $('app-show-multi-labels').checked = Boolean(app.showMultiLabels);
    $('app-show-free-marker').checked = app.showFreeMarker !== false;
    $('app-animate').checked = app.animate !== false;
    $('app-bingo-banner-text').value = app.bingoBannerText || 'BINGO!';
}

function renderAppearanceTab() {
    if (!state) return;
    writeAppearanceForm(state.appearance || {});
    const cards = state.session?.cards || [];
    const sel = $('mpb-preview-card-select');
    if (sel) {
        const prevVal = sel.value;
        sel.innerHTML = cards.length
            ? cards.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')
            : '<option value="">No players yet</option>';
        if (prevVal && cards.some(c => c.id === prevVal)) sel.value = prevVal;
    }
    $('mpb-single-card-picker').hidden = previewView !== 'single';
    const url = obsUrl();
    $('mpb-obs-url').textContent = url;
    if ($('btn-open-obs-url')) $('btn-open-obs-url').href = url;
    layoutPreviewStage();
    syncPreview();
}

function layoutPreviewStage() {
    const wrap = $('mpb-preview-wrap');
    const stage = $('mpb-preview-stage');
    const frame = $('mpb-preview-frame');
    if (!wrap || !stage || !frame) return;
    const availW = Math.max(240, wrap.clientWidth - 20);
    const availH = Math.max(220, wrap.clientHeight - 20);
    const scale = Math.min(availW / previewRes.w, availH / previewRes.h, 1);
    stage.style.width = `${Math.round(previewRes.w * scale)}px`;
    stage.style.height = `${Math.round(previewRes.h * scale)}px`;
    frame.style.width = `${previewRes.w}px`;
    frame.style.height = `${previewRes.h}px`;
    frame.style.transform = `scale(${scale})`;
    const lbl = $('mpb-preview-res-label');
    if (lbl) lbl.textContent = `${previewRes.w}×${previewRes.h} (${Math.round(scale * 100)}%)`;
}

function syncPreview() {
    if (!state) return;
    $('app-scale-val').textContent = `${Math.round((Number($('app-scale').value) || 1) * 100)}%`;
    $('app-board-bg-alpha-val').textContent = `${$('app-board-bg-alpha').value}%`;
    $('app-cell-bg-alpha-val').textContent = `${$('app-cell-bg-alpha').value}%`;
    $('app-border-alpha-val').textContent = `${$('app-border-alpha').value}%`;
    $('mpb-single-card-picker').hidden = previewView !== 'single';

    const url = obsUrl();
    $('mpb-obs-url').textContent = url;
    if ($('btn-open-obs-url')) $('btn-open-obs-url').href = url;

    const frame = $('mpb-preview-frame');
    if (!frame || !frame.contentWindow) return;
    const formApp = readAppearanceForm();
    const previewSession = previewView === 'single' && $('mpb-preview-card-select')?.value
        ? { ...state.session, focusedCardId: $('mpb-preview-card-select').value }
        : state.session;
    const previewState = {
        activePack: state.activePack,
        session: previewSession,
        appearance: { ...formApp, defaultView: previewView }
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
        applyStateUpdate(res.state);
        renderLiveTab();
        renderPacksTab();
        syncPreview();
        showNotice('Switched active prompt pack & shuffled cards');
    });

    $('mpb-share-host-wrap').addEventListener('change', e => {
        const sel = e.target.closest('#mpb-lan-ip-select');
        if (!sel) return;
        selectedLanIp = sel.value === '__current__' ? '' : sel.value;
        try {
            if (selectedLanIp) localStorage.setItem(LAN_IP_STORAGE_KEY, selectedLanIp);
            else localStorage.removeItem(LAN_IP_STORAGE_KEY);
        } catch { /* ignore */ }
        renderLiveTab();
        showNotice(`Player share links now use ${getShareOrigin().replace(/^https?:\/\//i, '')}`);
    });

    $('btn-toggle-caller').addEventListener('click', () => {
        showCallerPanel = !showCallerPanel;
        renderLiveTab();
    });

    $('btn-toggle-four-corners').addEventListener('click', async () => {
        const nextVal = !state.session.fourCorners;
        const res = await api('/api/multiplayer-bingo/flags', {
            method: 'POST',
            body: JSON.stringify({ fourCorners: nextVal })
        });
        applyStateUpdate(res.state);
        renderLiveTab();
        syncPreview();
        showNotice(nextVal ? 'Four Corners Bingo enabled' : 'Four Corners Bingo disabled');
    });

    $('btn-toggle-confirm-calls').addEventListener('click', async () => {
        const nextVal = !state.session.confirmCalls;
        const res = await api('/api/multiplayer-bingo/flags', {
            method: 'POST',
            body: JSON.stringify({ confirmCalls: nextVal })
        });
        applyStateUpdate(res.state);
        renderLiveTab();
        syncPreview();
        showNotice(nextVal ? 'Confirm Mode enabled — player calls wait for approval' : 'Confirm Mode disabled');
    });

    $('mpb-pending-panel').addEventListener('click', async e => {
        const btn = e.target.closest('[data-pending-act]');
        if (!btn) return;
        const act = btn.dataset.pendingAct;
        if (act === 'confirm') {
            const res = await api('/api/multiplayer-bingo/confirm', {
                method: 'POST',
                body: JSON.stringify({ id: btn.dataset.pendingId })
            });
            applyStateUpdate(res.state);
            renderLiveTab();
            syncPreview();
            showNotice('Confirmed player call');
        } else if (act === 'dismiss') {
            const res = await api('/api/multiplayer-bingo/dismiss', {
                method: 'POST',
                body: JSON.stringify({ id: btn.dataset.pendingId })
            });
            applyStateUpdate(res.state);
            renderLiveTab();
            syncPreview();
            showNotice('Dismissed player call');
        } else if (act === 'confirm-all') {
            const res = await api('/api/multiplayer-bingo/confirm', {
                method: 'POST',
                body: JSON.stringify({ all: true })
            });
            applyStateUpdate(res.state);
            renderLiveTab();
            syncPreview();
            showNotice(`Confirmed ${res.confirmed || 0} pending call${res.confirmed === 1 ? '' : 's'}`);
        } else if (act === 'dismiss-all') {
            const res = await api('/api/multiplayer-bingo/dismiss', {
                method: 'POST',
                body: JSON.stringify({ all: true })
            });
            applyStateUpdate(res.state);
            renderLiveTab();
            syncPreview();
            showNotice('Dismissed all pending calls');
        }
    });

    $('mpb-bingo-alert-actions').addEventListener('click', async e => {
        const btn = e.target.closest('[data-alert-act]');
        if (!btn) return;
        const act = btn.dataset.alertAct;
        if (act === 'zoom') {
            const res = await api('/api/multiplayer-bingo/focus', {
                method: 'POST',
                body: JSON.stringify({ card: btn.dataset.card })
            });
            applyStateUpdate(res.state);
            renderLiveTab();
            syncPreview();
        } else if (act === 'lock') {
            const res = await api('/api/multiplayer-bingo/flags', {
                method: 'POST',
                body: JSON.stringify({ locked: true })
            });
            applyStateUpdate(res.state);
            renderLiveTab();
            syncPreview();
        } else if (act === 'dismiss') {
            const pack = state.activePack || state.packs[0];
            const session = state.session || { cards: [], claims: {} };
            dismissedBingoSig = session.cards
                .map(c => ({ id: c.id, n: computeCardCells(pack, c, session.claims, { fourCorners: Boolean(session.fourCorners) }).bingoCount }))
                .filter(w => w.n > 0)
                .map(w => `${w.id}:${w.n}`)
                .join('|');
            $('mpb-bingo-alert').hidden = true;
        }
    });

    $('mpb-caller-grid').addEventListener('click', async e => {
        const btn = e.target.closest('[data-call-prompt]');
        if (!btn) return;
        const promptIndex = Number(btn.dataset.callPrompt);
        const res = await api('/api/multiplayer-bingo/call', {
            method: 'POST',
            body: JSON.stringify({ prompt: promptIndex })
        });
        applyStateUpdate(res.state);
        renderLiveTab();
        syncPreview();
    });

    $('btn-toggle-hidden').addEventListener('click', async () => {
        const res = await api('/api/multiplayer-bingo/flags', {
            method: 'POST',
            body: JSON.stringify({ hidden: !state.session.hidden })
        });
        applyStateUpdate(res.state);
        renderLiveTab();
        syncPreview();
    });

    $('btn-toggle-locked').addEventListener('click', async () => {
        const res = await api('/api/multiplayer-bingo/flags', {
            method: 'POST',
            body: JSON.stringify({ locked: !state.session.locked })
        });
        applyStateUpdate(res.state);
        renderLiveTab();
        syncPreview();
    });

    $('btn-shuffle-all').addEventListener('click', async () => {
        const res = await api('/api/multiplayer-bingo/shuffle', { method: 'POST', body: '{}' });
        applyStateUpdate(res.state);
        renderLiveTab();
        syncPreview();
        showNotice('Shuffled all player cards');
    });

    $('btn-reset-board').addEventListener('click', async () => {
        const res = await api('/api/multiplayer-bingo/reset', { method: 'POST', body: '{}' });
        applyStateUpdate(res.state);
        renderLiveTab();
        syncPreview();
        showNotice('Cleared all stamps');
    });

    $('btn-clear-zoom').addEventListener('click', async () => {
        const res = await api('/api/multiplayer-bingo/focus', { method: 'POST', body: JSON.stringify({ card: '' }) });
        applyStateUpdate(res.state);
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
        applyStateUpdate(res.state);
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
            applyStateUpdate(res.state);
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
            applyStateUpdate(res.state);
            renderLiveTab();
            syncPreview();
        } else if (act === 'regen') {
            const res = await api('/api/multiplayer-bingo/players/regen', {
                method: 'POST',
                body: JSON.stringify({ card: cardId })
            });
            applyStateUpdate(res.state);
            renderLiveTab();
            showNotice('Generated a fresh player link');
        } else if (act === 'remove') {
            const res = await api('/api/multiplayer-bingo/players/remove', {
                method: 'POST',
                body: JSON.stringify({ card: cardId })
            });
            expandedOverrides.delete(cardId);
            applyStateUpdate(res.state);
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
        applyStateUpdate(res.state);
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
        applyStateUpdate(res.state);
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
        applyStateUpdate(res.state);
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
        applyStateUpdate(res.state);
        selectedPackId = res.pack.id;
        renderPacksTab();
        showNotice('Duplicated prompt pack');
    });

    $('btn-del-pack').addEventListener('click', async () => {
        if (!selectedPackId || (state.packs?.length || 0) <= 1) return;
        const res = await api(`/api/multiplayer-bingo/packs/${encodeURIComponent(selectedPackId)}`, { method: 'DELETE' });
        applyStateUpdate(res.state);
        selectedPackId = state.activePackId;
        renderLiveTab();
        renderPacksTab();
        showNotice('Deleted prompt pack');
    });

    // Appearance tab + zero-reload postMessage preview
    $('app-theme').addEventListener('change', () => {
        const preset = THEME_PRESETS[$('app-theme').value];
        if (preset) {
            writeAppearanceForm({ ...readAppearanceForm(), ...preset, theme: $('app-theme').value });
        }
        syncPreview();
    });

    [
        'app-stamp', 'app-default-view', 'app-scale',
        'app-board-bg', 'app-board-bg-alpha', 'app-cell-bg', 'app-cell-bg-alpha',
        'app-border-color', 'app-border-alpha', 'app-text-color', 'app-bingo-color',
        'app-font-family', 'app-font-weight', 'app-font-size', 'app-uppercase-headers',
        'app-radius', 'app-border-width', 'app-cell-gap', 'app-padding', 'app-outer-margin',
        'app-backdrop-blur', 'app-shadow',
        'app-show-player-names', 'app-show-scores', 'app-show-bingo-banner',
        'app-show-multi-labels', 'app-show-free-marker', 'app-animate', 'app-bingo-banner-text',
        'mpb-preview-card-select'
    ].forEach(id => {
        const el = $(id);
        if (!el) return;
        el.addEventListener('input', syncPreview);
        el.addEventListener('change', syncPreview);
    });

    $('btn-reset-appearance').addEventListener('click', () => {
        writeAppearanceForm({
            theme: 'modern', stampStyle: 'dauber', defaultView: 'multi', scale: 1,
            ...THEME_PRESETS.modern,
            fontFamily: 'system-ui', fontWeight: 700, fontSize: 13, uppercaseHeaders: false,
            radius: 10, borderWidth: 2, cellGap: 6, padding: 12, outerMargin: 16,
            showPlayerNames: true, showScores: true, showBingoBanner: true,
            showMultiLabels: false, showFreeMarker: true, animate: true, bingoBannerText: 'BINGO!'
        });
        syncPreview();
        showNotice('Reset appearance to defaults (click Save to persist)');
    });

    $('btn-save-appearance').addEventListener('click', async () => {
        const res = await api('/api/multiplayer-bingo/appearance', {
            method: 'POST',
            body: JSON.stringify(readAppearanceForm())
        });
        applyStateUpdate(res.state);
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

    $('mpb-preview-bg-chips').addEventListener('click', e => {
        const btn = e.target.closest('[data-bg]');
        if (!btn) return;
        $('mpb-preview-wrap').dataset.backdrop = btn.dataset.bg;
        $('mpb-preview-bg-chips').querySelectorAll('button').forEach(b => {
            b.classList.toggle('btn-primary', b === btn);
            b.classList.toggle('btn-secondary', b !== btn);
        });
    });

    $('mpb-preview-res-chips').addEventListener('click', e => {
        const btn = e.target.closest('[data-res]');
        if (!btn) return;
        const [w, h] = btn.dataset.res.split('x').map(Number);
        if (!w || !h) return;
        previewRes = { w, h };
        $('mpb-preview-res-chips').querySelectorAll('button').forEach(b => {
            b.classList.toggle('btn-primary', b === btn);
            b.classList.toggle('btn-secondary', b !== btn);
        });
        layoutPreviewStage();
        syncPreview();
    });

    if (typeof ResizeObserver === 'function' && $('mpb-preview-wrap')) {
        previewObserver = new ResizeObserver(() => layoutPreviewStage());
        previewObserver.observe($('mpb-preview-wrap'));
        window.addEventListener('beforeunload', () => previewObserver?.disconnect(), { once: true });
    }

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

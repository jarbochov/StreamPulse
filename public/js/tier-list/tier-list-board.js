/**
 * StreamPulse Tier List Maker — Board & Voting HUD Rendering
 * Renders the tier board, row headers, draggable cards, live chat voting banner,
 * and handles SortableJS integration.
 */

import { esc, $ } from './tier-list-state.js';
import { TierAudio } from './tier-list-audio.js';

let sortableInstances = [];
let unrankedSortable = null;
let hudTimerInterval = null;
let lastVoteId = null;
let lastTickedSecond = null;

export function renderBoard(state, onDrop) {
    // Destroy previous sortable instances to prevent memory leaks
    sortableInstances.forEach(s => s.destroy());
    sortableInstances = [];
    if (unrankedSortable) {
        unrankedSortable.destroy();
        unrankedSortable = null;
    }

    const boardEl = $('tier-board');
    if (!boardEl) return;
    boardEl.innerHTML = '';

    // Populate initial tier select options for item modal
    const tierSelect = $('item-initial-tier');
    if (tierSelect) {
        tierSelect.innerHTML = '<option value="">Unranked (Pool)</option>' +
            state.tiers.map(t => `<option value="${esc(t.id)}">${esc(t.label)}</option>`).join('');
    }

    // Render each tier row
    state.tiers.forEach((tier) => {
        const row = document.createElement('div');
        row.className = 'tier-row';
        row.dataset.tierId = tier.id;

        const tierItems = state.items
            .filter(i => i.tierId === tier.id)
            .sort((a, b) => (a.order || 0) - (b.order || 0));

        row.innerHTML = `
            <div class="tier-header" style="background-color: ${esc(tier.color)};" data-tier-id="${esc(tier.id)}" title="Click to edit tier">
                <div>${esc(tier.label)}</div>
                ${tier.description ? `<div class="tier-header-sub">${esc(tier.description)}</div>` : ''}
            </div>
            <div class="tier-content" data-tier-id="${esc(tier.id)}">
                ${tierItems.map(item => renderItemCard(item, state)).join('')}
            </div>
            <div class="tier-row-actions">
                <button class="tier-action-btn" data-action="tier-up" data-tier-id="${esc(tier.id)}" title="Move tier up"><svg class="ico" viewBox="0 0 24 24"><polyline points="18 15 12 9 6 15"/></svg></button>
                <button class="tier-action-btn" data-action="tier-down" data-tier-id="${esc(tier.id)}" title="Move tier down"><svg class="ico" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg></button>
                <button class="tier-action-btn" data-action="tier-edit" data-tier-id="${esc(tier.id)}" title="Edit tier settings"><svg class="ico" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></button>
            </div>
        `;

        boardEl.appendChild(row);

        // Attach SortableJS to tier content
        if (window.Sortable) {
            const contentEl = row.querySelector('.tier-content');
            const sortable = new window.Sortable(contentEl, {
                group: 'tier-items',
                animation: 180,
                ghostClass: 'sortable-ghost',
                onEnd: onDrop
            });
            sortableInstances.push(sortable);
        }
    });

    // Render Unranked Pool
    const unrankedEl = $('unranked-pool');
    if (!unrankedEl) return;
    const unrankedItems = state.items
        .filter(i => !i.tierId)
        .sort((a, b) => (a.order || 0) - (b.order || 0));

    const countEl = $('unranked-count');
    if (countEl) countEl.textContent = unrankedItems.length;

    unrankedEl.innerHTML = unrankedItems.map(item => renderItemCard(item, state)).join('') +
        `<div id="pool-empty-hint" class="pool-empty-hint" style="display: ${unrankedItems.length === 0 ? 'flex' : 'none'};">
            <svg class="ico" style="width:24px;height:24px;" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            <span>Drag &amp; drop, paste images (Ctrl+V / &#8984;V), or add from Asset Library</span>
        </div>`;

    if (window.Sortable) {
        unrankedSortable = new window.Sortable(unrankedEl, {
            group: 'tier-items',
            animation: 180,
            ghostClass: 'sortable-ghost',
            onEnd: onDrop
        });
    }
}

export function renderItemCard(item, state) {
    const isVoting = state.activeVote && state.activeVote.itemId === item.id;
    const defaultThumb = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' fill='%2321262d'><rect width='100' height='100'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' fill='%238b949e' font-size='11' font-family='sans-serif'>No Image</text></svg>";
    const imgSrc = item.imageUrl || defaultThumb;

    return `
        <div class="item-card${isVoting ? ' is-voting' : ''}" data-item-id="${esc(item.id)}" title="${esc(item.name)}${item.note ? ' - ' + esc(item.note) : ''}">
            <img src="${esc(imgSrc)}" alt="${esc(item.name)}" onerror="this.src='${defaultThumb}'">
            <div class="item-card-caption">${esc(item.name)}</div>
            <div class="item-card-menu">
                <button class="card-menu-btn" data-action="start-vote" data-item-id="${esc(item.id)}" title="Start Chat Vote">Vote</button>
                <button class="card-menu-btn" data-action="edit-item" data-item-id="${esc(item.id)}" title="Edit"><svg class="ico" style="width:10px;height:10px;" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
                <button class="card-menu-btn" data-action="delete-item" data-item-id="${esc(item.id)}" title="Delete"><svg class="ico" style="width:10px;height:10px;" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
            </div>
        </div>
    `;
}

export function renderHUD(state) {
    const hud = $('voting-hud');
    if (!hud) return;
    const vote = state.activeVote;

    if (!vote || (vote.status !== 'ACTIVE' && vote.status !== 'LOCKED')) {
        if (lastVoteId) {
            TierAudio.voteLock();
        }
        lastVoteId = null;
        lastTickedSecond = null;
        hud.classList.remove('active');
        if (hudTimerInterval) {
            clearInterval(hudTimerInterval);
            hudTimerInterval = null;
        }
        return;
    }

    if (vote.id !== lastVoteId) {
        lastVoteId = vote.id;
        lastTickedSecond = null;
        TierAudio.voteStart();
    }

    hud.classList.add('active');
    const titleEl = $('hud-item-title');
    if (titleEl) titleEl.textContent = vote.itemName;
    const imgEl = $('hud-item-img');
    if (imgEl) imgEl.src = vote.itemImage || '';

    updateHudMeters(vote.consensus, state);

    // Setup countdown timer
    if (hudTimerInterval) clearInterval(hudTimerInterval);
    const updateCountdown = () => {
        const timerEl = $('hud-timer');
        const lockBtn = $('btn-lock-vote');
        if (!timerEl) return;

        if (vote.status === 'LOCKED') {
            timerEl.textContent = 'Voting Closed';
            if (lockBtn) lockBtn.classList.add('pulse');
            return;
        }
        if (lockBtn) lockBtn.classList.remove('pulse');

        if (!vote.endsAt) {
            timerEl.textContent = 'Open';
            return;
        }
        const remaining = Math.max(0, Math.round((vote.endsAt - Date.now()) / 1000));
        timerEl.textContent = remaining > 0 ? `${remaining}s` : 'Voting Closed';
        if (remaining <= 5 && remaining > 0 && remaining !== lastTickedSecond) {
            lastTickedSecond = remaining;
            TierAudio.countdownTick(remaining <= 3);
        }
        if (remaining <= 0) {
            clearInterval(hudTimerInterval);
            hudTimerInterval = null;
        }
    };
    updateCountdown();
    hudTimerInterval = setInterval(updateCountdown, 1000);
}

export function updateHudMeters(consensus, state) {
    if (!consensus) return;
    const countEl = $('hud-vote-count');
    if (countEl) countEl.textContent = consensus.totalVotes || 0;

    // Sub multiplier / count badge
    const subBadge = $('hud-sub-badge');
    if (subBadge) {
        if (state && state.activeVote && state.activeVote.subMultiplier > 1) {
            subBadge.textContent = `Subs ${state.activeVote.subMultiplier}x`;
            subBadge.style.display = 'inline-block';
        } else if (consensus.subVotes > 0) {
            subBadge.textContent = `${consensus.subVotes} sub votes`;
            subBadge.style.display = 'inline-block';
        } else {
            subBadge.style.display = 'none';
        }
    }

    // Consensus agreement pill
    const agreePill = $('hud-agreement-pill');
    if (agreePill) {
        if (consensus.totalVotes > 0 && consensus.agreementPercent > 0) {
            agreePill.textContent = `${consensus.agreementPercent}% agree`;
            agreePill.style.display = 'inline-block';
        } else {
            agreePill.style.display = 'none';
        }
    }

    const meterBar = $('hud-meter-bar');
    if (meterBar) {
        meterBar.innerHTML = '';
        (consensus.distribution || []).forEach(d => {
            if (d.percentage > 0) {
                const seg = document.createElement('div');
                seg.className = 'hud-meter-seg';
                seg.style.width = `${d.percentage}%`;
                seg.style.backgroundColor = d.color;
                seg.title = `${d.label}: ${d.count} votes (${d.percentage}%)`;
                meterBar.appendChild(seg);
            }
        });
    }

    // Recent voters ticker
    const tickerEl = $('hud-voters-ticker');
    if (tickerEl) {
        if (consensus.recentVoters && consensus.recentVoters.length > 0) {
            tickerEl.innerHTML = '<span style="opacity:0.75;">Recent:</span>' + consensus.recentVoters.map(v => `
                <span class="voter-chip">
                    ${v.isSub ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style="color:#a371f7;display:inline-block;vertical-align:-1px;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>' : ''}
                    ${esc(v.user)}:
                    <span class="voter-tier" style="background-color:${esc(v.tierColor)};">${esc(v.tierLabel)}</span>
                </span>
            `).join('');
            tickerEl.style.display = 'flex';
        } else {
            tickerEl.style.display = 'none';
        }
    }

    const consensusLabel = $('hud-consensus-label');
    const pill = $('hud-result-pill');
    if (consensus.consensusTier) {
        if (consensusLabel) consensusLabel.textContent = `${consensus.consensusTier.label} (${consensus.totalVotes} votes)`;
        if (pill) {
            pill.textContent = `Tier ${consensus.consensusTier.label}`;
            pill.style.backgroundColor = consensus.consensusTier.color;
            pill.style.display = 'inline-flex';
        }
    } else {
        if (consensusLabel) consensusLabel.textContent = 'Waiting for votes…';
        if (pill) pill.style.display = 'none';
    }
}

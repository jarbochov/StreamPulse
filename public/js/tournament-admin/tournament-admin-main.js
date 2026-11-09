/**
 * StreamPulse — Tournament Multi-Match Admin Main Controller
 */

import {
    $,
    esc,
    toast,
    tournamentData,
    setTournamentData,
    currentFilter,
    setCurrentFilter,
    currentRoundFilter,
    setCurrentRoundFilter,
    currentGroupMode,
    setCurrentGroupMode,
    focusedMatchId,
    setFocusedMatchId,
    isPopoutWindow,
    classifyMatch,
    setFocusedMatch,
    focusNextPlayableMatch,
    popOutMatchWindow,
    setMatchFilter,
    setRoundFilter,
    setGroupMode
} from './tournament-admin-state.js';

import { buildMatchCardHtml } from './tournament-admin-match.js';

import {
    registerPageRenderer,
    updateLiveSeriesFormat,
    updateLiveRoundsFormat,
    saveDraftPrompt,
    toggleLiveHighlight,
    pinMatch,
    stepScore,
    setScoreDirect,
    stepRound,
    setRoundDirect,
    updateEntrantMeta,
    saveMatchNote,
    resetMatchScore,
    recordDraw,
    advanceMatch,
    rollbackMatch,
    quickStartSampleBracket
} from './tournament-admin-actions.js';

export async function loadTournament() {
    try {
        const res = await fetch('/api/tournament');
        if (!res.ok) return;
        const data = await res.json();
        setTournamentData(data.tournament);
        renderAdminPage();
    } catch (err) {
        console.warn('Error loading tournament:', err);
    }
}

export function renderAdminPage(overrideData) {
    if (overrideData !== undefined) setTournamentData(overrideData);
    const t = tournamentData;
    const hasTourney = Boolean(t && Array.isArray(t.matches) && t.matches.length > 0);

    const emptyState = $('admin-empty-state');
    if (emptyState) emptyState.style.display = hasTourney ? 'none' : 'block';
    const summaryBar = $('admin-summary-bar');
    if (summaryBar) summaryBar.style.display = hasTourney ? 'grid' : 'none';
    const filterBar = $('admin-filter-bar');
    if (filterBar) filterBar.style.display = hasTourney ? 'flex' : 'none';
    const matchesContainer = $('admin-matches-container');
    if (matchesContainer) matchesContainer.style.display = hasTourney ? 'block' : 'none';
    const seriesCtrl = $('admin-series-ctrl');
    if (seriesCtrl) seriesCtrl.style.display = hasTourney ? 'inline-flex' : 'none';
    const roundsCtrl = $('admin-rounds-ctrl');
    if (roundsCtrl) roundsCtrl.style.display = hasTourney ? 'inline-flex' : 'none';
    const saveDraftBtn = $('btn-admin-save-draft');
    if (saveDraftBtn) saveDraftBtn.style.display = hasTourney ? 'inline-flex' : 'none';
    const liveDot = $('admin-live-dot');
    if (liveDot) liveDot.style.opacity = hasTourney ? (t.status === 'COMPLETED' ? '0.6' : '1') : '0.35';

    if ($('admin-group-mode')) $('admin-group-mode').value = currentGroupMode;

    if (!hasTourney) {
        if ($('admin-tourney-title')) $('admin-tourney-title').textContent = 'No Active Tournament';
        if ($('admin-tourney-format-badge')) $('admin-tourney-format-badge').style.display = 'none';
        if ($('btn-admin-unpin')) $('btn-admin-unpin').disabled = true;
        return;
    }

    const isComp = t.status === 'COMPLETED';
    if ($('admin-tourney-title')) {
        $('admin-tourney-title').textContent = isComp ? `${t.title || 'Tournament'} (Completed)` : (t.title || 'Live Tournament');
    }
    const fmtBadge = $('admin-tourney-format-badge');
    if (fmtBadge) {
        fmtBadge.style.display = 'inline-flex';
        const fmtName = t.format === 'double' ? 'Double Elimination' : (t.format === 'roundRobin' ? 'Round Robin' : 'Single Elimination');
        fmtBadge.textContent = isComp ? `${fmtName} · Finished` : fmtName;
    }

    // Sync live Series Format select
    const seriesSel = $('admin-series-select');
    if (seriesSel) {
        if (t.scoringType === 'points' || (!t.bestOf && !t.targetScore)) {
            seriesSel.value = 'points';
        } else if (t.scoringType === 'firstTo' || (!t.bestOf && t.targetScore > 0)) {
            seriesSel.value = t.targetScore === 10 ? 'firstTo-10' : 'firstTo-custom';
        } else {
            const bo = Number(t.bestOf) || 3;
            seriesSel.value = `bestOf-${[1, 3, 5, 7, 9].includes(bo) ? bo : 3}`;
        }
    }

    // Sync live Rounds per Game select
    const roundsSel = $('admin-rounds-select');
    if (roundsSel) {
        const rb = Number(t.roundsBestOf) || 0;
        roundsSel.value = String([0, 3, 5, 7].includes(rb) ? rb : (rb > 0 ? 3 : 0));
    }

    if ($('admin-highlight-live')) $('admin-highlight-live').checked = t.highlightLive !== false;
    const unpinBtn = $('btn-admin-unpin');
    if (unpinBtn) {
        unpinBtn.disabled = !t.activeMatchId;
        unpinBtn.textContent = t.activeMatchId ? 'Unpin Live' : 'No Match Pinned';
    }

    // Populate round filter options while preserving selection
    const roundSelect = $('admin-round-filter');
    if (roundSelect) {
        const roundNames = [];
        t.matches.forEach(m => {
            if (m.isBye) return;
            const rn = m.roundName || `Round ${m.round || 1}`;
            if (!roundNames.includes(rn)) roundNames.push(rn);
        });
        const prevVal = currentRoundFilter;
        roundSelect.innerHTML = `<option value="all">All Bracket Rounds (${roundNames.length})</option>` +
            roundNames.map(rn => `<option value="${esc(rn)}" ${rn === prevVal ? 'selected' : ''}>${esc(rn)}</option>`).join('');
        if (prevVal !== 'all' && !roundNames.includes(prevVal)) {
            setCurrentRoundFilter('all');
            roundSelect.value = 'all';
        }
    }

    document.querySelectorAll('#filter-chips .preset-chip-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === currentFilter);
    });

    renderAdminMatches();
}

export function renderAdminMatches() {
    const t = tournamentData;
    if (!t || !Array.isArray(t.matches)) return;

    const nonBye = t.matches.filter(m => !m.isBye && m.entrant2?.name !== 'BYE');
    const playable = nonBye.filter(m => classifyMatch(m) === 'playable');
    const upcoming = nonBye.filter(m => classifyMatch(m) === 'upcoming');
    const completed = nonBye.filter(m => classifyMatch(m) === 'completed');

    if ($('count-playable')) $('count-playable').textContent = playable.length;
    if ($('count-all')) $('count-all').textContent = nonBye.length;
    if ($('count-upcoming')) $('count-upcoming').textContent = upcoming.length;
    if ($('count-completed')) $('count-completed').textContent = completed.length;

    if ($('stat-playable')) $('stat-playable').textContent = `${playable.length} active`;
    if ($('stat-completed')) $('stat-completed').textContent = `${completed.length} / ${nonBye.length}`;
    if ($('stat-upcoming')) $('stat-upcoming').textContent = upcoming.length;

    const pinnedMatch = t.highlightLive !== false && t.activeMatchId
        ? nonBye.find(m => m.id === t.activeMatchId)
        : null;
    const statPinned = $('stat-pinned');
    if (statPinned) {
        if (pinnedMatch) {
            const pe1 = pinnedMatch.entrant1?.name || 'TBD';
            const pe2 = pinnedMatch.entrant2?.name || 'TBD';
            statPinned.textContent = `${pe1} vs ${pe2}`;
            statPinned.style.color = '#60a5fa';
        } else {
            statPinned.textContent = t.highlightLive === false ? 'Highlight Off (Multi-Game)' : 'Unpinned (Multi-Game)';
            statPinned.style.color = 'var(--text-muted)';
        }
    }

    const q = ($('admin-search-input')?.value || '').trim().toLowerCase();

    // Pop-Out / Focused Single-Match Utility Bar
    const popoutBar = $('popout-utility-bar');
    const popoutSelect = $('popout-match-select');
    const popoutTitle = $('popout-tourney-title');
    if (popoutTitle) {
        popoutTitle.textContent = t.title ? `${t.title} — Scorekeeper` : 'Match Scorekeeper';
    }
    if (popoutBar) {
        if (focusedMatchId || isPopoutWindow) {
            popoutBar.style.display = 'flex';
            if (popoutSelect) {
                popoutSelect.innerHTML = `<option value="">-- All Matches Grid (${nonBye.length}) --</option>` +
                    nonBye.map(m => {
                        const st = classifyMatch(m);
                        const stTag = st === 'playable' ? '[LIVE]' : (st === 'completed' ? '[DONE]' : '[TBD]');
                        const rn = m.roundName || `R${m.round || 1}`;
                        const label = `${stTag} ${rn} #${m.matchNumber || '?'}: ${m.entrant1?.name || 'TBD'} vs ${m.entrant2?.name || 'TBD'} (${m.score1 || 0}-${m.score2 || 0})`;
                        return `<option value="${esc(m.id)}" ${m.id === focusedMatchId ? 'selected' : ''}>${esc(label)}</option>`;
                    }).join('');
            }
        } else {
            popoutBar.style.display = 'none';
        }
    }

    const globalRb = Number(t.roundsBestOf) || 0;
    const allowDraws = t.format === 'roundRobin' || Boolean(t.allowDraws);
    const container = $('admin-matches-container');
    if (!container) return;

    if (focusedMatchId) {
        const targetMatch = nonBye.find(m => m.id === focusedMatchId);
        if (targetMatch) {
            container.innerHTML = `
                <div style="max-width: 880px; margin: 0 auto;">
                    ${buildMatchCardHtml(targetMatch, t, globalRb, allowDraws)}
                </div>
            `;
            return;
        }
    }

    const filtered = nonBye.filter(m => {
        const st = classifyMatch(m);
        if (currentFilter !== 'all' && st !== currentFilter) return false;
        const rn = m.roundName || `Round ${m.round || 1}`;
        if (currentRoundFilter !== 'all' && rn !== currentRoundFilter) return false;
        if (q) {
            const e1 = (m.entrant1?.name || '').toLowerCase();
            const e2 = (m.entrant2?.name || '').toLowerCase();
            const t1 = (m.entrant1?.tag || '').toLowerCase();
            const t2 = (m.entrant2?.tag || '').toLowerCase();
            const notes = (m.matchDetails || m.details || '').toLowerCase();
            const rLower = rn.toLowerCase();
            if (!e1.includes(q) && !e2.includes(q) && !t1.includes(q) && !t2.includes(q) && !notes.includes(q) && !rLower.includes(q)) {
                return false;
            }
        }
        return true;
    });

    if (!filtered.length) {
        container.innerHTML = `
            <div style="background: var(--bg-card); border: 1px solid var(--border); border-radius: 10px; padding: 1.75rem; text-align: center; color: var(--text-muted); font-size: 0.85rem;">
                No matches match the current filter (<strong>${esc(currentFilter)}</strong>).
                ${currentFilter !== 'all' && nonBye.length > 0 ? `<div style="margin-top: 0.6rem;"><button type="button" class="btn-secondary btn-sm" onclick="setMatchFilter('all')">Show All ${nonBye.length} Matches</button></div>` : ''}
            </div>
        `;
        return;
    }

    if (currentGroupMode === 'round') {
        const groups = [];
        const groupMap = new Map();
        filtered.forEach(m => {
            const rn = m.roundName || `Round ${m.round || 1}`;
            if (!groupMap.has(rn)) {
                const grp = { roundName: rn, matches: [] };
                groupMap.set(rn, grp);
                groups.push(grp);
            }
            groupMap.get(rn).matches.push(m);
        });

        container.innerHTML = groups.map(grp => {
            const playableCount = grp.matches.filter(m => classifyMatch(m) === 'playable').length;
            const doneCount = grp.matches.filter(m => classifyMatch(m) === 'completed').length;
            return `
                <div class="round-group-section">
                    <div class="round-group-header">
                        <div class="round-group-title">
                            <span>${esc(grp.roundName)}</span>
                            <span class="badge-studio" style="font-size: 0.62rem;">${grp.matches.length} Match${grp.matches.length === 1 ? '' : 'es'}</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.72rem; color: var(--text-muted);">
                            ${playableCount > 0 ? `<span style="color: #38bdf8; font-weight: 700;">${playableCount} Playable</span>` : ''}
                            <span>${doneCount} / ${grp.matches.length} Completed</span>
                        </div>
                    </div>
                    <div class="match-admin-grid">
                        ${grp.matches.map(m => buildMatchCardHtml(m, t, globalRb, allowDraws)).join('')}
                    </div>
                </div>
            `;
        }).join('');
    } else {
        container.innerHTML = `
            <div class="match-admin-grid">
                ${filtered.map(m => buildMatchCardHtml(m, t, globalRb, allowDraws)).join('')}
            </div>
        `;
    }
}

export function connectWs() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${location.host}/ws`);
    ws.onmessage = (event) => {
        try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'tournament-update') {
                setTournamentData(msg.data);
                renderAdminPage();
            }
        } catch {}
    };
    ws.onclose = () => setTimeout(connectWs, 2000);
}

// Register page renderer callback in actions module
registerPageRenderer(renderAdminPage);

// Export all methods onto window for inline onclick handlers and test fixture compatibility
const tournamentAdminApp = {
    $,
    esc,
    toast,
    classifyMatch,
    setFocusedMatch: (mId) => setFocusedMatch(mId, renderAdminPage),
    focusNextPlayableMatch: () => focusNextPlayableMatch(renderAdminPage),
    popOutMatchWindow: (mId) => popOutMatchWindow(mId, renderAdminPage),
    setMatchFilter: (f) => setMatchFilter(f, renderAdminMatches),
    setRoundFilter: (r) => setRoundFilter(r, renderAdminMatches),
    setGroupMode: (g) => setGroupMode(g, renderAdminMatches),
    loadTournament,
    renderAdminPage,
    renderAdminMatches,
    updateLiveSeriesFormat,
    updateLiveRoundsFormat,
    saveDraftPrompt,
    toggleLiveHighlight,
    pinMatch,
    stepScore,
    setScoreDirect,
    stepRound,
    setRoundDirect,
    updateEntrantMeta,
    saveMatchNote,
    resetMatchScore,
    recordDraw,
    advanceMatch,
    rollbackMatch,
    quickStartSampleBracket,
    connectWs
};

window.tournamentAdminApp = tournamentAdminApp;
Object.assign(window, tournamentAdminApp);

// Setup event listeners and bootstrap
function init() {
    if (isPopoutWindow) {
        document.body.classList.add('popout-mode');
    }

    $('admin-search-input')?.addEventListener('input', renderAdminMatches);

    loadTournament();
    connectWs();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

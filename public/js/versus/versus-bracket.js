/**
 * StreamPulse — Versus Studio Tournament Bracket, Scoring, Multi-Match Grid & History
 */

import {
    $,
    esc,
    toast,
    activeTourneyData,
    setActiveTourneyData,
    activeMatchupData,
    tourneyStudioViewMode,
    setTourneyStudioViewModeState,
    activeTourneyPresetsList,
    setActiveTourneyPresetsList,
    activePresetsCategory,
    currentDraftsList,
    setCurrentDraftsList,
    currentInspectedTournament,
    setCurrentInspectedTournament,
    tournamentMatchRules,
    loadTournament
} from './versus-state.js';
import {
    syncTourneyOverlayLogoUi
} from './versus-preview.js';
import { renderMatchupStudio, matchCategory } from './versus-matchup.js';

let currentEntrantMode = 'text';

export function setTourneyStudioViewMode(mode) {
    setTourneyStudioViewModeState(mode === 'multi' ? 'multi' : 'single');
    try { localStorage.setItem('versus-tourney-view-mode', tourneyStudioViewMode); } catch {}
    $('btn-tourney-view-single')?.classList.toggle('active', tourneyStudioViewMode === 'single');
    $('btn-tourney-view-multi')?.classList.toggle('active', tourneyStudioViewMode === 'multi');
    if ($('tourney-match-hud')) $('tourney-match-hud').style.display = tourneyStudioViewMode === 'single' ? 'block' : 'none';
    if ($('tourney-multi-match-grid')) $('tourney-multi-match-grid').style.display = tourneyStudioViewMode === 'multi' ? 'grid' : 'none';
    if (activeTourneyData) renderTournamentStudio(activeTourneyData);
}

export async function toggleTournamentLiveHighlight(enabled) {
    if (!activeTourneyData) return;
    try {
        const res = await fetch('/api/tournament/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ highlightLive: Boolean(enabled) })
        });
        const data = await res.json();
        if (data.status === 'ok') {
            setActiveTourneyData(data.tournament);
            renderTournamentStudio(activeTourneyData);
            toast(enabled ? 'Live match highlight enabled on bracket' : 'Live match highlight disabled on bracket');
        }
    } catch {
        toast('Error updating bracket highlight setting');
    }
}

export async function updateTournamentLiveSeries(seriesVal) {
    if (!activeTourneyData) return;
    let bestOf = 3;
    let targetScore = 2;
    let scoringType = 'bestOf';
    if (seriesVal === 'points') {
        scoringType = 'points';
        bestOf = 0;
        targetScore = 0;
    } else if (seriesVal === 'firstTo-10') {
        scoringType = 'firstTo';
        bestOf = 0;
        targetScore = 10;
    } else if (seriesVal === 'firstTo-custom') {
        const customVal = prompt('Enter custom target score to win set:', String(activeTourneyData.targetScore || 5));
        if (!customVal) return;
        scoringType = 'firstTo';
        bestOf = 0;
        targetScore = Math.max(1, parseInt(customVal, 10) || 5);
    } else if (seriesVal.startsWith('bestOf-')) {
        scoringType = 'bestOf';
        bestOf = parseInt(seriesVal.replace('bestOf-', ''), 10) || 3;
        targetScore = Math.ceil(bestOf / 2);
    }
    try {
        const res = await fetch('/api/tournament/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ scoringType, bestOf, targetScore })
        });
        const data = await res.json();
        if (data.status === 'ok') {
            setActiveTourneyData(data.tournament);
            renderTournamentStudio(activeTourneyData);
            if (activeMatchupData) renderMatchupStudio(activeMatchupData);
            toast('Series format updated');
        }
    } catch {
        toast('Error updating series format');
    }
}

export async function updateTournamentLiveRounds(roundsVal) {
    if (!activeTourneyData) return;
    const roundsBestOf = Math.max(0, parseInt(roundsVal, 10) || 0);
    try {
        const res = await fetch('/api/tournament/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roundsBestOf })
        });
        const data = await res.json();
        if (data.status === 'ok') {
            setActiveTourneyData(data.tournament);
            renderTournamentStudio(activeTourneyData);
            if (activeMatchupData) renderMatchupStudio(activeMatchupData);
            toast(roundsBestOf > 0 ? `Enabled Best of ${roundsBestOf} Rounds per Game` : 'Rounds per Game turned off');
        }
    } catch {
        toast('Error updating rounds per game');
    }
}

export function renderTournamentStudio(t) {
    setActiveTourneyData(t);
    const monitorCard = $('active-tourney-card');
    const createCard = $('card-create-tourney');

    const stepState = !t || !t.matches ? 'setup' : (t.status === 'COMPLETED' ? 'review' : 'live');
    document.querySelectorAll('#bracket-steps .bstep').forEach(el => {
        const order = ['setup', 'live', 'review'];
        el.classList.toggle('active', el.dataset.step === stepState);
        el.classList.toggle('done', order.indexOf(el.dataset.step) < order.indexOf(stepState));
    });
    if (!t || !t.matches || t.matches.length === 0) {
        if (monitorCard) monitorCard.style.display = 'none';
        if (createCard) createCard.style.display = 'block';
        return;
    }

    if (monitorCard) monitorCard.style.display = 'block';
    if (createCard) createCard.style.display = 'none';

    const isComp = t.status === 'COMPLETED';
    if ($('tourney-active-title')) $('tourney-active-title').textContent = isComp ? `${t.title || 'Tournament'} (Completed)` : (t.title || 'Live Tournament');
    const liveLogoThumb = $('tourney-active-logo-thumb');
    const liveLogoLabel = $('btn-live-tourney-logo-label');
    if (liveLogoThumb) {
        liveLogoThumb.src = t.logo || '';
        liveLogoThumb.style.display = t.logo ? 'block' : 'none';
    }
    if (liveLogoLabel) {
        liveLogoLabel.textContent = t.logo ? 'Change Logo…' : 'Bracket Logo…';
    }
    if (t.logo !== undefined && $('tourney-opt-logo') && !$('tourney-opt-logo').value) {
        $('tourney-opt-logo').value = t.logo || '';
        syncTourneyOverlayLogoUi(t.logo || '');
    }
    if ($('tourney-live-series-select')) {
        if (t.scoringType === 'points' || (!t.bestOf && !t.targetScore)) {
            $('tourney-live-series-select').value = 'points';
        } else if (t.scoringType === 'firstTo' || (!t.bestOf && t.targetScore > 0)) {
            $('tourney-live-series-select').value = t.targetScore === 10 ? 'firstTo-10' : 'firstTo-custom';
        } else {
            const bo = Number(t.bestOf) || 3;
            $('tourney-live-series-select').value = `bestOf-${[1, 3, 5, 7, 9].includes(bo) ? bo : 3}`;
        }
    }
    if ($('tourney-live-rounds-select')) {
        const rb = Number(t.roundsBestOf) || 0;
        $('tourney-live-rounds-select').value = String([0, 3, 5, 7].includes(rb) ? rb : (rb > 0 ? 3 : 0));
    }
    if ($('tourney-highlight-live-toggle')) $('tourney-highlight-live-toggle').checked = t.highlightLive !== false;
    if ($('btn-tourney-unpin-live')) {
        const hasPinned = Boolean(t.activeMatchId);
        $('btn-tourney-unpin-live').disabled = !hasPinned;
        $('btn-tourney-unpin-live').textContent = hasPinned ? 'Unpin Live Match' : 'No Live Match Pinned';
    }

    const playableMatches = (t.matches || []).filter(m => {
        const isBye = m.isBye || m.entrant2?.name === 'BYE';
        const e1 = m.entrant1?.name || m.entrants?.[0] || 'TBD';
        const e2 = m.entrant2?.name || m.entrants?.[1] || 'TBD';
        return !isBye && !m.winner && e1 !== 'TBD' && e2 !== 'TBD';
    });
    if ($('tourney-playable-count')) $('tourney-playable-count').textContent = playableMatches.length;

    $('btn-tourney-view-single')?.classList.toggle('active', tourneyStudioViewMode === 'single');
    $('btn-tourney-view-multi')?.classList.toggle('active', tourneyStudioViewMode === 'multi');
    if ($('tourney-match-hud')) $('tourney-match-hud').style.display = tourneyStudioViewMode === 'single' ? 'block' : 'none';
    if ($('tourney-multi-match-grid')) {
        $('tourney-multi-match-grid').style.display = tourneyStudioViewMode === 'multi' ? 'grid' : 'none';
        if (tourneyStudioViewMode === 'multi') {
            renderMultiMatchScoreboardGrid(t, playableMatches);
        }
    }

    // Active Match
    const activeMatch = (t.matches || []).find(m => m.id === t.activeMatchId) ||
                        (t.matches || []).find(m => !m.isBye && !m.winner) ||
                        (isComp ? [...(t.matches || [])].reverse().find(m => m.roundName === 'Grand Finals' || m.roundName === 'Finals' || m.winner) : null) ||
                        t.matches[0];

    if (activeMatch) {
        const e1 = activeMatch.entrant1?.name || activeMatch.entrants?.[0] || 'Player 1';
        const e2 = activeMatch.entrant2?.name || activeMatch.entrants?.[1] || (activeMatch.isBye ? 'BYE' : 'Player 2');
        const t1 = activeMatch.entrant1?.tag || '';
        const t2 = activeMatch.entrant2?.tag || '';
        const s1 = activeMatch.entrant1?.score ?? (activeMatch.scores?.[0] ?? (activeMatch.scores?.[e1] ?? 0));
        const s2 = activeMatch.entrant2?.score ?? (activeMatch.scores?.[1] ?? (activeMatch.scores?.[e2] ?? 0));
        const r1 = activeMatch.entrant1?.rounds || 0;
        const r2 = activeMatch.entrant2?.rounds || 0;
        const rules = tournamentMatchRules(activeMatch, t);
        const target = rules.target;
        const rb = Number(rules.roundsBestOf) || 0;
        const roundTarget = rb > 0 ? Math.ceil(rb / 2) : 0;

        if ($('tourney-round-label')) $('tourney-round-label').textContent = activeMatch.roundName || `Round ${activeMatch.round || 1}`;
        const seriesText = rules.bestOf > 0 ? `Best of ${rules.bestOf} (First to ${target})` : (target > 0 ? `First to ${target}` : 'Free Points');
        if ($('tourney-series-label')) $('tourney-series-label').textContent = roundTarget > 0 ? `${seriesText} · Bo${rb} Rounds (First to ${roundTarget})` : seriesText;

        if ($('t-entrant-1')) $('t-entrant-1').textContent = e1;
        if ($('t-entrant-2')) $('t-entrant-2').textContent = e2;
        if ($('t-color-input-1')) $('t-color-input-1').value = activeMatch.entrant1?.color || '#ef4444';
        if ($('t-color-input-2')) $('t-color-input-2').value = activeMatch.entrant2?.color || '#3b82f6';
        if ($('t-tag-input-1')) $('t-tag-input-1').value = t1;
        if ($('t-tag-input-2')) $('t-tag-input-2').value = t2;
        if ($('t-tag-1')) {
            $('t-tag-1').textContent = t1 ? `[${t1}]` : '';
            $('t-tag-1').style.display = t1 ? 'block' : 'none';
        }
        if ($('t-tag-2')) {
            $('t-tag-2').textContent = t2 ? `[${t2}]` : '';
            $('t-tag-2').style.display = t2 ? 'block' : 'none';
        }
        const isWinReady1 = !activeMatch.winner && target > 0 && s1 >= target;
        const isWinReady2 = !activeMatch.winner && target > 0 && s2 >= target;
        const isMatchWinReady = isWinReady1 || isWinReady2;
        const readyWinnerName = isWinReady1 ? e1 : (isWinReady2 ? e2 : null);

        if ($('t-card-1')) $('t-card-1').classList.toggle('win-ready-card', isWinReady1);
        if ($('t-card-2')) $('t-card-2').classList.toggle('win-ready-card', isWinReady2);
        if ($('t-win-badge-1')) $('t-win-badge-1').style.display = isWinReady1 ? 'inline-block' : 'none';
        if ($('t-win-badge-2')) $('t-win-badge-2').style.display = isWinReady2 ? 'inline-block' : 'none';

        if ($('t-score-input-1')) {
            $('t-score-input-1').value = s1;
            if (target > 0) $('t-score-input-1').max = isWinReady2 ? Math.max(0, target - 1) : target;
            else $('t-score-input-1').removeAttribute('max');
        }
        if ($('t-score-input-2')) {
            $('t-score-input-2').value = s2;
            if (target > 0) $('t-score-input-2').max = isWinReady1 ? Math.max(0, target - 1) : target;
            else $('t-score-input-2').removeAttribute('max');
        }
        if ($('t-score-minus-1')) $('t-score-minus-1').disabled = s1 <= 0;
        if ($('t-score-minus-2')) $('t-score-minus-2').disabled = s2 <= 0;
        if ($('t-score-plus-1')) $('t-score-plus-1').disabled = isMatchWinReady || (target > 0 && s1 >= target);
        if ($('t-score-plus-2')) $('t-score-plus-2').disabled = isMatchWinReady || (target > 0 && s2 >= target);

        if ($('t-round-minus-1')) $('t-round-minus-1').disabled = r1 <= 0;
        if ($('t-round-minus-2')) $('t-round-minus-2').disabled = r2 <= 0;
        if ($('t-round-plus-1')) $('t-round-plus-1').disabled = isMatchWinReady;
        if ($('t-round-plus-2')) $('t-round-plus-2').disabled = isMatchWinReady;
        if ($('t-round-input-1')) $('t-round-input-1').disabled = isMatchWinReady;
        if ($('t-round-input-2')) $('t-round-input-2').disabled = isMatchWinReady;

        const winBanner = $('tourney-win-ready-banner');
        const winText = $('tourney-win-ready-text');
        const winBtn = $('btn-tourney-win-ready-advance');
        const mainAdvBtn = $('btn-tourney-advance');
        if (isMatchWinReady) {
            if (winBanner) winBanner.style.display = 'flex';
            if (winText) winText.textContent = `${readyWinnerName} reached ${target} game${target === 1 ? '' : 's'} (${s1}–${s2}) — Ready to Advance`;
            if (winBtn) winBtn.innerHTML = `Confirm &amp; Advance ${esc(readyWinnerName)} &rarr;`;
            if (mainAdvBtn) {
                mainAdvBtn.classList.add('btn-advance-prominent');
                mainAdvBtn.innerHTML = `Confirm &amp; Advance ${esc(readyWinnerName)} &rarr;`;
            }
        } else {
            if (winBanner) winBanner.style.display = 'none';
            if (mainAdvBtn) {
                mainAdvBtn.classList.remove('btn-advance-prominent');
                mainAdvBtn.innerHTML = `Advance Winner &rarr;`;
            }
        }

        if ($('t-score-label-1')) {
            $('t-score-label-1').textContent = target > 0 ? `${s1} / ${target} GAMES` : `${s1} POINTS`;
            $('t-score-label-1').style.color = isWinReady1 ? '#4ade80' : 'var(--text-muted)';
        }
        if ($('t-score-label-2')) {
            $('t-score-label-2').textContent = target > 0 ? `${s2} / ${target} GAMES` : `${s2} POINTS`;
            $('t-score-label-2').style.color = isWinReady2 ? '#4ade80' : 'var(--text-muted)';
        }
        if ($('tourney-match-details')) $('tourney-match-details').value = activeMatch.matchDetails || activeMatch.details || '';

        if ($('t-score-pips-1')) {
            $('t-score-pips-1').textContent = target > 0 ? Array.from({ length: target }, (_, i) => i < s1 ? '●' : '○').join(' ') : `${s1} pts`;
            $('t-score-pips-1').style.color = isWinReady1 ? '#4ade80' : 'var(--accent)';
        }
        if ($('t-score-pips-2')) {
            $('t-score-pips-2').textContent = target > 0 ? Array.from({ length: target }, (_, i) => i < s2 ? '●' : '○').join(' ') : `${s2} pts`;
            $('t-score-pips-2').style.color = isWinReady2 ? '#4ade80' : 'var(--accent)';
        }

        // Rounds controls and pips
        const rControls1 = $('t-round-controls-1');
        const rControls2 = $('t-round-controls-2');
        const rOff1 = $('t-round-off-1');
        const rOff2 = $('t-round-off-2');

        if (roundTarget > 0) {
            if (rControls1) rControls1.style.display = 'flex';
            if (rControls2) rControls2.style.display = 'flex';
            if (rOff1) rOff1.style.display = 'none';
            if (rOff2) rOff2.style.display = 'none';

            if ($('t-round-input-1')) {
                $('t-round-input-1').value = Math.min(roundTarget - 1, r1);
                $('t-round-input-1').max = roundTarget - 1;
            }
            if ($('t-round-input-2')) {
                $('t-round-input-2').value = Math.min(roundTarget - 1, r2);
                $('t-round-input-2').max = roundTarget - 1;
            }
            if ($('t-round-pips-1')) {
                $('t-round-pips-1').textContent = Array.from({ length: roundTarget }, (_, i) => i < r1 ? '◆' : '◇').join(' ');
            }
            if ($('t-round-pips-2')) {
                $('t-round-pips-2').textContent = Array.from({ length: roundTarget }, (_, i) => i < r2 ? '◆' : '◇').join(' ');
            }
            if ($('t-round-label-1')) $('t-round-label-1').textContent = `${Math.min(roundTarget - 1, r1)} / ${roundTarget} ROUNDS`;
            if ($('t-round-label-2')) $('t-round-label-2').textContent = `${Math.min(roundTarget - 1, r2)} / ${roundTarget} ROUNDS`;
        } else {
            if (rControls1) rControls1.style.display = 'none';
            if (rControls2) rControls2.style.display = 'none';
            if (rOff1) rOff1.style.display = 'block';
            if (rOff2) rOff2.style.display = 'block';
        }
    }

    // Render Bracket Overview list in studio
    const overview = $('tourney-bracket-overview');
    if (overview && t.matches) {
        overview.innerHTML = t.matches.map(m => {
            const isCur = m.id === t.activeMatchId;
            const isBye = m.isBye || m.entrant2?.name === 'BYE';
            const e1 = m.entrant1?.name || m.entrants?.[0] || 'TBD';
            const e2 = m.entrant2?.name || m.entrants?.[1] || (isBye ? 'BYE' : 'TBD');
            const t1Str = m.entrant1?.tag ? ` [${esc(m.entrant1.tag)}]` : '';
            const t2Str = m.entrant2?.tag ? ` [${esc(m.entrant2.tag)}]` : '';
            const s1 = m.entrant1?.score ?? (m.scores?.[0] ?? (m.scores?.[e1] ?? 0));
            const s2 = m.entrant2?.score ?? (m.scores?.[1] ?? (m.scores?.[e2] ?? 0));
            const isCompleted = Boolean(m.winner && !isBye);
            const mRb = Number(m.roundsBestOf ?? t.roundsBestOf) || 0;
            const mr1 = m.entrant1?.rounds || 0;
            const mr2 = m.entrant2?.rounds || 0;
            const hasMRounds = mRb > 0 || mr1 > 0 || mr2 > 0;
            const roundBadge = hasMRounds ? `<span style="color: var(--accent); margin-left: 0.45rem; font-size: 0.68rem; font-weight: 700;">(Rounds: ${mr1} — ${mr2})</span>` : '';

            return `
                <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.4rem 0.65rem; margin-bottom: 0.35rem; background: ${isCur ? 'rgba(59, 130, 246, 0.15)' : 'var(--bg-card)'}; border: 1px solid ${isCur ? 'var(--accent)' : 'var(--border)'}; border-radius: 6px; font-size: 0.75rem; cursor: pointer;" onclick="selectTourneyMatchDirect('${m.id}')">
                    <div style="display: flex; flex-direction: column; min-width: 0;">
                        <div style="display: flex; align-items: center; gap: 0.4rem;">
                            <span style="font-weight: 800; color: ${isCur ? 'var(--accent)' : 'var(--text)'};">${esc(m.roundName || `R${m.round}`)}</span>${mRb > 0 ? ` <span style="font-size:0.62rem;opacity:0.8;font-weight:600;">(Bo${mRb} Rds)</span>` : ''}
                            ${m.pendingWinner && !m.winner ? `<span class="badge-studio" style="font-size: 0.6rem; padding: 0.05rem 0.35rem;">${esc(m.pendingWinner)} reached target</span>` : ''}<span style="color: var(--text-muted); font-size: 0.72rem;">${esc(e1)}${t1Str} ${isBye ? '(BYE)' : `vs ${esc(e2)}${t2Str}`}</span>
                            ${isCur ? '<span class="badge-studio" style="font-size: 0.6rem; padding: 0.05rem 0.35rem;">Live</span>' : ''}
                        </div>
                        <div style="font-size: 0.72rem; margin-top: 0.15rem;">
                            ${isBye ? '<span style="color: #3fb950; font-weight: 700;">ADVANCED (BYE)</span>' : (m.winner ? `<span style="color: #3fb950; font-weight: 800;">Winner: ${esc(m.winner)} (${s1} - ${s2})</span>${roundBadge}` : `<span style="color: var(--text-muted); font-weight: 600;">Score: ${s1} — ${s2}</span>${roundBadge}`)}
                        </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 0.35rem;">
                        ${m.pendingWinner && !m.winner ? `
                            <button type="button" class="btn-primary btn-sm btn-advance-prominent" style="font-size: 0.68rem; padding: 0.18rem 0.55rem;" onclick="event.stopPropagation(); advanceMultiMatch('${m.id}')">
                                Confirm &amp; Advance ${esc(m.pendingWinner)} &rarr;
                            </button>
                        ` : ''}
                        ${isCompleted ? `
                            <button type="button" class="btn-secondary btn-sm" style="color: #f59e0b; display: inline-flex; align-items: center; gap: 0.25rem;" onclick="rollbackTourneyMatch('${m.id}', event)" title="Undo winner and cascade reset downstream matches">
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 00-9-9 9 9 0 00-6 2.3L3 13"/></svg> Undo / Edit
                            </button>
                        ` : ''}
                        ${!isCur && !isBye && e1 !== 'TBD' && e2 !== 'TBD' ? `
                            <button type="button" class="btn-secondary btn-sm" onclick="event.stopPropagation(); selectTourneyMatchDirect('${m.id}')">Select</button>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');
    }
}

export async function rollbackTourneyMatch(matchId, e) {
    if (e) e.stopPropagation();
    if (!confirm('Undo this match advancement and roll back downstream bracket matches? The match winner will be cleared and subsequent matches will revert to TBD.')) return;

    try {
        const res = await fetch('/api/tournament/rollback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ matchId })
        });
        const data = await res.json();
        if (data.status === 'ok') {
            setActiveTourneyData(data.tournament);
            renderTournamentStudio(activeTourneyData);
            toast('Match advancement undone and bracket rolled back');
        }
    } catch {
        toast('Error rolling back match');
    }
}

export function toggleDraftsModal(show) {
    const modal = $('drafts-modal');
    if (modal) modal.style.display = show ? 'flex' : 'none';
    if (show) loadTournamentDrafts();
}

export async function loadTournamentDrafts() {
    try {
        const res = await fetch('/api/tournament/drafts');
        const data = await res.json();
        if (data.status === 'ok') {
            setCurrentDraftsList(data.drafts || []);
            if ($('drafts-count')) $('drafts-count').textContent = currentDraftsList.length;
            renderTournamentDrafts(currentDraftsList);
        }
    } catch { /* ignore */ }
}

export function renderTournamentDrafts(drafts = []) {
    const body = $('drafts-modal-body');
    if (!body) return;

    if (!drafts || drafts.length === 0) {
        body.innerHTML = `
            <div style="padding: 1.5rem; text-align: center; color: var(--text-muted); font-size: 0.8rem; background: var(--bg-inset); border-radius: 8px;">
                No saved tournament drafts or checkpoints found. Click "Save Draft" in the tournament card to save an in-progress bracket at any time.
            </div>
        `;
        return;
    }

    body.innerHTML = drafts.map(d => {
        const date = d.savedAt ? new Date(d.savedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Recently';
        const t = d.tournament || {};
        const matchesCount = Array.isArray(t.matches) ? t.matches.length : 0;
        const completedCount = Array.isArray(t.matches) ? t.matches.filter(m => m.winner || m.isBye).length : 0;

        return `
            <div style="background: var(--bg-inset); border: 1px solid var(--border); border-radius: 8px; padding: 0.75rem 1rem; display: flex; justify-content: space-between; align-items: center; gap: 0.75rem;">
                <div>
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <span style="font-size: 0.88rem; font-weight: 800; color: var(--text);">${esc(d.name)}</span>
                        <span class="badge-pill" style="background: rgba(59, 130, 246, 0.15); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.3); font-size: 0.65rem;">${t.format === 'double' ? 'Double Elim' : (t.format === 'roundRobin' ? 'Round Robin' : 'Single Elim')}</span>
                    </div>
                    <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 0.25rem;">
                        Saved ${date} · Progress: ${completedCount} of ${matchesCount} matches played (${t.entrants ? t.entrants.length : 0} players)
                    </div>
                </div>
                <div style="display: flex; gap: 0.35rem; align-items: center;">
                    <button type="button" class="btn-primary btn-sm" onclick="restoreTourneyDraft('${d.id}')">
                        Resume Bracket
                    </button>
                    <button type="button" class="btn-secondary btn-sm" onclick="deleteTourneyDraft('${d.id}')" title="Delete checkpoint">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

export async function saveTourneyDraftPrompt() {
    if (!activeTourneyData) {
        toast('No active tournament running');
        return;
    }
    const defaultName = `${activeTourneyData.title || 'Tournament'} — Checkpoint`;
    const name = prompt('Checkpoint Name / Note:', defaultName);
    if (!name) return;

    try {
        const res = await fetch('/api/tournament/drafts/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });
        const data = await res.json();
        if (data.status === 'ok') {
            toast('Saved tournament draft checkpoint!');
            loadTournamentDrafts();
        }
    } catch {
        toast('Error saving tournament draft');
    }
}

export async function restoreTourneyDraft(draftId) {
    if (!confirm('Resume this saved tournament checkpoint? Any unsaved live progress will be replaced.')) return;
    try {
        const res = await fetch('/api/tournament/drafts/restore', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: draftId })
        });
        const data = await res.json();
        if (data.status === 'ok') {
            setActiveTourneyData(data.tournament);
            renderTournamentStudio(activeTourneyData);
            toggleDraftsModal(false);
            toast('Tournament checkpoint resumed!');
        }
    } catch {
        toast('Error restoring tournament draft');
    }
}

export async function deleteTourneyDraft(draftId) {
    if (!confirm('Delete this saved checkpoint?')) return;
    try {
        const res = await fetch(`/api/tournament/drafts/${encodeURIComponent(draftId)}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.status === 'ok') {
            loadTournamentDrafts();
            toast('Checkpoint deleted');
        }
    } catch {
        toast('Error deleting draft');
    }
}

export function handleTourneyFormatChange(fmt) {
    const rrBox = $('tourney-rr-options');
    if (rrBox) rrBox.style.display = fmt === 'roundRobin' ? 'block' : 'none';
    const drawBtn = $('btn-tourney-draw');
    if (drawBtn) drawBtn.style.display = fmt === 'roundRobin' ? 'inline-block' : 'none';
    const matchupDrawBtn = $('btn-matchup-tourney-draw');
    if (matchupDrawBtn) matchupDrawBtn.style.display = fmt === 'roundRobin' ? 'inline-block' : 'none';
}

export function parseEntrantString(str) {
    if (!str) return { name: '', tag: '' };
    const s = str.trim();
    const bracketMatch = s.match(/^(.*?)\s*\[(.*?)\]$/);
    if (bracketMatch) return { name: bracketMatch[1].trim(), tag: bracketMatch[2].trim() };
    const parenMatch = s.match(/^(.*?)\s*\((.*?)\)$/);
    if (parenMatch) return { name: parenMatch[1].trim(), tag: parenMatch[2].trim() };
    const pipeMatch = s.match(/^(.*?)\s*\|\s*(.*)$/);
    if (pipeMatch) return { name: pipeMatch[2].trim(), tag: pipeMatch[1].trim() };
    return { name: s, tag: '' };
}

export function switchEntrantEntryMode(mode) {
    currentEntrantMode = mode;
    $('btn-entrant-mode-text')?.classList.toggle('active', mode === 'text');
    $('btn-entrant-mode-table')?.classList.toggle('active', mode === 'table');
    if (mode === 'table') {
        syncEntrantsTextToTable();
        if ($('entrant-mode-text-container')) $('entrant-mode-text-container').style.display = 'none';
        if ($('entrant-mode-table-container')) $('entrant-mode-table-container').style.display = 'block';
    } else {
        syncEntrantsTableToText();
        if ($('entrant-mode-table-container')) $('entrant-mode-table-container').style.display = 'none';
        if ($('entrant-mode-text-container')) $('entrant-mode-text-container').style.display = 'block';
    }
}

export function syncEntrantsTextToTable() {
    const raw = $('tourney-entrants-text')?.value || '';
    const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
    const parsed = lines.map(parseEntrantString);
    renderEntrantTableRows(parsed);
}

export function syncEntrantsTableToText() {
    const rows = document.querySelectorAll('#entrant-rows-list .entrant-table-row');
    const lines = [];
    rows.forEach(r => {
        const nameInput = r.querySelector('.entrant-row-name');
        const tagInput = r.querySelector('.entrant-row-tag');
        const name = (nameInput?.value || '').trim();
        const tag = (tagInput?.value || '').trim();
        if (name) {
            lines.push(tag ? `${name} [${tag}]` : name);
        }
    });
    if ($('tourney-entrants-text')) $('tourney-entrants-text').value = lines.join('\n');
    if ($('entrant-table-count')) $('entrant-table-count').textContent = `${lines.length} player${lines.length === 1 ? '' : 's'}`;
}

export function renderEntrantTableRows(entrants) {
    const container = $('entrant-rows-list');
    if (!container) return;
    if (!entrants || entrants.length === 0) {
        entrants = [{ name: '', tag: '' }, { name: '', tag: '' }];
    }
    container.innerHTML = entrants.map((e, idx) => `
        <div class="entrant-table-row" style="display: flex; gap: 0.4rem; align-items: center;">
            <span style="font-size: 0.72rem; font-weight: 700; color: var(--text-muted); width: 22px; text-align: right;">${idx + 1}</span>
            <input type="text" class="form-control entrant-row-name" style="font-size: 0.78rem; padding: 0.25rem 0.5rem; flex: 2;" placeholder="Player Name" value="${esc(e.name)}" oninput="syncEntrantsTableToText()">
            <input type="text" class="form-control entrant-row-tag" style="font-size: 0.78rem; padding: 0.25rem 0.5rem; flex: 1.2;" placeholder="Tag / Character" value="${esc(e.tag)}" oninput="syncEntrantsTableToText()">
            <button type="button" class="btn-secondary btn-sm" onclick="removeEntrantRow(this)" style="padding: 0.2rem 0.45rem; line-height: 1;" title="Remove row">&times;</button>
        </div>
    `).join('');
    const validCount = entrants.filter(e => e.name).length;
    if ($('entrant-table-count')) $('entrant-table-count').textContent = `${validCount} player${validCount === 1 ? '' : 's'}`;
}

export function addEntrantRow(name = '', tag = '') {
    const container = $('entrant-rows-list');
    if (!container) return;
    const count = container.querySelectorAll('.entrant-table-row').length + 1;
    const row = document.createElement('div');
    row.className = 'entrant-table-row';
    row.style.cssText = 'display: flex; gap: 0.4rem; align-items: center;';
    row.innerHTML = `
        <span style="font-size: 0.72rem; font-weight: 700; color: var(--text-muted); width: 22px; text-align: right;">${count}</span>
        <input type="text" class="form-control entrant-row-name" style="font-size: 0.78rem; padding: 0.25rem 0.5rem; flex: 2;" placeholder="Player Name" value="${esc(name)}" oninput="syncEntrantsTableToText()">
        <input type="text" class="form-control entrant-row-tag" style="font-size: 0.78rem; padding: 0.25rem 0.5rem; flex: 1.2;" placeholder="Tag / Character" value="${esc(tag)}" oninput="syncEntrantsTableToText()">
        <button type="button" class="btn-secondary btn-sm" onclick="removeEntrantRow(this)" style="padding: 0.2rem 0.45rem; line-height: 1;" title="Remove row">&times;</button>
    `;
    container.appendChild(row);
    syncEntrantsTableToText();
}

export function removeEntrantRow(btn) {
    const row = btn.closest('.entrant-table-row');
    if (row) {
        row.remove();
        document.querySelectorAll('#entrant-rows-list .entrant-table-row').forEach((r, idx) => {
            const numSpan = r.querySelector('span');
            if (numSpan) numSpan.textContent = idx + 1;
        });
        syncEntrantsTableToText();
    }
}

export async function saveTournamentEntrantTag(entrantIdx, val) {
    if (!activeTourneyData) return;
    const activeMatch = (activeTourneyData.matches || []).find(m => m.id === activeTourneyData.activeMatchId) ||
                        (activeTourneyData.matches || []).find(m => !m.isBye && !m.winner);
    if (!activeMatch) return;
    const body = { matchId: activeMatch.id };
    if (entrantIdx === 1) body.entrant1Tag = val;
    else if (entrantIdx === 2) body.entrant2Tag = val;
    try {
        const res = await fetch('/api/tournament/score', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await res.json();
        if (data.status === 'ok') {
            setActiveTourneyData(data.tournament);
            renderTournamentStudio(activeTourneyData);
            if (activeMatchupData) renderMatchupStudio(activeMatchupData);
            toast('Tag updated');
        }
    } catch {
        toast('Error saving tag');
    }
}

export async function saveTournamentEntrantColor(entrantIdx, val) {
    if (!activeTourneyData) return;
    const activeMatch = (activeTourneyData.matches || []).find(m => m.id === activeTourneyData.activeMatchId) ||
                        (activeTourneyData.matches || []).find(m => !m.isBye && !m.winner);
    if (!activeMatch) return;
    const body = { matchId: activeMatch.id };
    if (entrantIdx === 1) body.entrant1Color = val;
    else if (entrantIdx === 2) body.entrant2Color = val;
    try {
        const res = await fetch('/api/tournament/score', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await res.json();
        if (data.status === 'ok') {
            setActiveTourneyData(data.tournament);
            renderTournamentStudio(activeTourneyData);
            if (activeMatchupData) renderMatchupStudio(activeMatchupData);
            toast('Color updated');
        }
    } catch {
        toast('Error saving color');
    }
}

export async function recordTournamentDraw() {
    if (!activeTourneyData) return;
    const activeMatch = (activeTourneyData.matches || []).find(m => m.id === activeTourneyData.activeMatchId) ||
                        (activeTourneyData.matches || []).find(m => !m.isBye && !m.winner);
    if (!activeMatch) return;
    try {
        const res = await fetch('/api/tournament/advance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                matchId: activeMatch.id,
                winner: 'DRAW'
            })
        });
        const data = await res.json();
        if (data.status === 'ok') {
            setActiveTourneyData(data.tournament);
            renderTournamentStudio(activeTourneyData);
            if (activeMatchupData) renderMatchupStudio(activeMatchupData);
            toast('Match recorded as a Tie / Draw');
        }
    } catch {
        toast('Error recording draw');
    }
}

export async function handleCreateTournament(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (currentEntrantMode === 'table') syncEntrantsTableToText();
    const title = $('tourney-title').value.trim();
    const format = $('tourney-format').value;
    const seriesVal = $('tourney-series').value;
    const entrantsText = $('tourney-entrants-text').value;

    const entrants = entrantsText.split('\n').map(s => s.trim()).filter(Boolean);
    if (entrants.length < 2) {
        alert('Please enter at least 2 entrants (one per line).');
        return;
    }
    const entrantLimit = format === 'double' ? 16 : (format === 'single' ? 32 : null);
    if (entrantLimit && entrants.length > entrantLimit) {
        alert(`${format === 'double' ? 'Double' : 'Single'} elimination supports up to ${entrantLimit} entrants. The current tournament has not been changed.`);
        return;
    }

    let bestOf = 3;
    let targetScore = 2;
    let scoringType = 'bestOf';

    if (seriesVal === 'points') {
        scoringType = 'points';
        bestOf = 0;
        targetScore = 0;
    } else if (seriesVal.startsWith('bestOf-')) {
        scoringType = 'bestOf';
        bestOf = parseInt(seriesVal.replace('bestOf-', ''), 10) || 3;
        targetScore = Math.ceil(bestOf / 2);
    } else if (seriesVal === 'firstTo-10') {
        scoringType = 'firstTo';
        targetScore = 10;
        bestOf = 0;
    } else if (seriesVal === 'firstTo-custom') {
        scoringType = 'firstTo';
        targetScore = Math.max(1, parseInt($('tourney-target-input')?.value, 10) || 5);
        bestOf = 0;
    }

    const payload = {
        title,
        logo: ($('tourney-create-logo')?.value || $('tourney-opt-logo')?.value || '').trim(),
        format,
        entrants,
        scoringType,
        bestOf,
        roundsBestOf: parseInt($('tourney-rounds')?.value, 10) || 0,
        targetScore,
        progressionMode: 'manual'
    };

    if (format === 'roundRobin') {
        payload.roundRobinLegs = parseInt($('tourney-rr-legs')?.value, 10) || 1;
        payload.pointsSystem = $('tourney-rr-points')?.value || '3-1-0';
        payload.allowDraws = Boolean($('tourney-allow-draws')?.checked);
    }

    try {
        const res = await fetch('/api/tournament/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.status === 'ok') {
            setActiveTourneyData(data.tournament);
            renderTournamentStudio(activeTourneyData);
            if (activeMatchupData) renderMatchupStudio(activeMatchupData);
            toast('Tournament created!');
        } else {
            toast(data.error || 'Error creating tournament');
        }
    } catch {
        toast('Error creating tournament');
    }
}

export async function stepTourneyScore(entrantIdx, delta) {
    if (!activeTourneyData) return;
    const activeMatch = (activeTourneyData.matches || []).find(m => m.id === activeTourneyData.activeMatchId) ||
                        (activeTourneyData.matches || []).find(m => !m.isBye && !m.winner);
    if (!activeMatch) return;
    const entrantName = entrantIdx === 1 ? (activeMatch.entrant1?.name || activeMatch.entrants?.[0]) : (activeMatch.entrant2?.name || activeMatch.entrants?.[1]);
    if (!entrantName || entrantName === 'TBD' || entrantName === 'BYE') return;

    const curScore = entrantIdx === 1 ? (activeMatch.entrant1?.score ?? (activeMatch.scores?.[0] ?? 0)) : (activeMatch.entrant2?.score ?? (activeMatch.scores?.[1] ?? 0));
    const newScore = Math.max(0, curScore + delta);

    try {
        const res = await fetch('/api/tournament/score', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                matchId: activeMatch.id,
                entrant: entrantName,
                score: newScore
            })
        });
        const data = await res.json();
        if (data.status === 'ok') {
            setActiveTourneyData(data.tournament);
            renderTournamentStudio(activeTourneyData);
            if (activeMatchupData) renderMatchupStudio(activeMatchupData);
        }
    } catch {
        toast('Error scoring match');
    }
}

export async function setTourneyScoreDirect(entrantIdx, scoreVal) {
    if (!activeTourneyData) return;
    const activeMatch = (activeTourneyData.matches || []).find(m => m.id === activeTourneyData.activeMatchId) ||
                        (activeTourneyData.matches || []).find(m => !m.isBye && !m.winner);
    if (!activeMatch) return;
    const entrantName = entrantIdx === 1 ? (activeMatch.entrant1?.name || activeMatch.entrants?.[0]) : (activeMatch.entrant2?.name || activeMatch.entrants?.[1]);
    if (!entrantName || entrantName === 'TBD' || entrantName === 'BYE') return;
    const score = Math.max(0, parseInt(scoreVal, 10) || 0);

    try {
        const res = await fetch('/api/tournament/score', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                matchId: activeMatch.id,
                entrant: entrantName,
                score
            })
        });
        const data = await res.json();
        if (data.status === 'ok') {
            setActiveTourneyData(data.tournament);
            renderTournamentStudio(activeTourneyData);
            if (activeMatchupData) renderMatchupStudio(activeMatchupData);
        }
    } catch {
        toast('Error setting score');
    }
}

export async function stepTourneyRound(entrantIdx, roundDelta) {
    if (!activeTourneyData) return;
    const activeMatch = (activeTourneyData.matches || []).find(m => m.id === activeTourneyData.activeMatchId) ||
                        (activeTourneyData.matches || []).find(m => !m.isBye && !m.winner);
    if (!activeMatch) return;
    const entrantName = entrantIdx === 1 ? (activeMatch.entrant1?.name || activeMatch.entrants?.[0]) : (activeMatch.entrant2?.name || activeMatch.entrants?.[1]);
    if (!entrantName || entrantName === 'TBD' || entrantName === 'BYE') return;

    try {
        const res = await fetch('/api/tournament/score', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                matchId: activeMatch.id,
                entrant: entrantName,
                roundDelta
            })
        });
        const data = await res.json();
        if (data.status === 'ok') {
            setActiveTourneyData(data.tournament);
            renderTournamentStudio(activeTourneyData);
            if (activeMatchupData) renderMatchupStudio(activeMatchupData);
        }
    } catch {
        toast('Error updating tournament rounds');
    }
}

export async function setTourneyRoundDirect(entrantIdx, roundVal) {
    if (!activeTourneyData) return;
    const activeMatch = (activeTourneyData.matches || []).find(m => m.id === activeTourneyData.activeMatchId) ||
                        (activeTourneyData.matches || []).find(m => !m.isBye && !m.winner);
    if (!activeMatch) return;
    const entrantName = entrantIdx === 1 ? (activeMatch.entrant1?.name || activeMatch.entrants?.[0]) : (activeMatch.entrant2?.name || activeMatch.entrants?.[1]);
    if (!entrantName || entrantName === 'TBD' || entrantName === 'BYE') return;
    const rounds = Math.max(0, parseInt(roundVal, 10) || 0);

    try {
        const res = await fetch('/api/tournament/score', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                matchId: activeMatch.id,
                entrant: entrantName,
                rounds
            })
        });
        const data = await res.json();
        if (data.status === 'ok') {
            setActiveTourneyData(data.tournament);
            renderTournamentStudio(activeTourneyData);
            if (activeMatchupData) renderMatchupStudio(activeMatchupData);
        }
    } catch {
        toast('Error setting tournament rounds');
    }
}

export async function advanceActiveTournamentMatch() {
    if (!activeTourneyData) return;
    const activeMatch = (activeTourneyData.matches || []).find(m => m.id === activeTourneyData.activeMatchId) ||
                        (activeTourneyData.matches || []).find(m => !m.isBye && !m.winner);
    if (!activeMatch) return;

    const e1 = activeMatch.entrant1?.name || activeMatch.entrants?.[0];
    const e2 = activeMatch.entrant2?.name || activeMatch.entrants?.[1];
    const s1 = activeMatch.entrant1?.score ?? (activeMatch.scores?.[0] ?? 0);
    const s2 = activeMatch.entrant2?.score ?? (activeMatch.scores?.[1] ?? 0);

    let winner = activeMatch.winner;
    if (!winner) {
        if (s1 > s2) winner = e1;
        else if (s2 > s1) winner = e2;
        else {
            winner = prompt(`Select match winner (${e1} or ${e2}):`, e1);
            if (!winner) return;
        }
    }

    try {
        const res = await fetch('/api/tournament/advance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                matchId: activeMatch.id,
                winner
            })
        });
        const data = await res.json();
        if (data.status === 'ok') {
            setActiveTourneyData(data.tournament);
            renderTournamentStudio(activeTourneyData);
            if (activeMatchupData) renderMatchupStudio(activeMatchupData);
            toast(`Advanced: ${winner} won!`);
        }
    } catch {
        toast('Error advancing match');
    }
}

export async function selectTourneyMatchDirect(matchId) {
    try {
        const res = await fetch('/api/tournament/select-match', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ matchId })
        });
        const data = await res.json();
        if (data.status === 'ok') {
            setActiveTourneyData(data.tournament);
            renderTournamentStudio(activeTourneyData);
            if (activeMatchupData) renderMatchupStudio(activeMatchupData);
        }
    } catch {
        toast('Error selecting match');
    }
}

export async function resetTournamentActiveMatch() {
    if (!activeTourneyData) return;
    try {
        const res = await fetch('/api/tournament/reset-match', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ matchId: activeTourneyData.activeMatchId })
        });
        const data = await res.json();
        if (data.status === 'ok') {
            setActiveTourneyData(data.tournament);
            renderTournamentStudio(activeTourneyData);
            if (activeMatchupData) renderMatchupStudio(activeMatchupData);
            toast('Match reset');
        }
    } catch {
        toast('Error resetting match');
    }
}

export async function endTournament() {
    if (!confirm('End and reset this tournament?')) return;
    try {
        const res = await fetch('/api/tournament/reset', { method: 'POST' });
        const data = await res.json();
        if (data.status === 'ok') {
            setActiveTourneyData(null);
            renderTournamentStudio(null);
            if (activeMatchupData) renderMatchupStudio(activeMatchupData);
            toast('Tournament ended');
        }
    } catch {
        toast('Error ending tournament');
    }
}

export async function saveTournamentMatchDetails(details) {
    if (!activeTourneyData) return;
    const activeMatch = (activeTourneyData.matches || []).find(m => m.id === activeTourneyData.activeMatchId) ||
                        (activeTourneyData.matches || []).find(m => !m.isBye && !m.winner);
    if (!activeMatch) return;
    try {
        const res = await fetch('/api/tournament/score', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                matchId: activeMatch.id,
                matchDetails: details.trim(),
                preserveActiveMatch: true
            })
        });
        const data = await res.json();
        if (data.status === 'ok') {
            setActiveTourneyData(data.tournament);
        }
    } catch { /* ignore */ }
}

export function renderMultiMatchScoreboardGrid(t, playableMatches) {
    const grid = $('tourney-multi-match-grid');
    if (!grid) return;
    if (!playableMatches || playableMatches.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1 / -1; padding: 1rem; text-align: center; background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px; color: var(--text-muted); font-size: 0.78rem;">
                No active playable matches right now. Check the Bracket Matches list below to undo completed matches or inspect upcoming rounds.
            </div>
        `;
        return;
    }
    grid.innerHTML = playableMatches.map(m => {
        const isPinned = t.highlightLive !== false && m.id === t.activeMatchId;
        const e1 = m.entrant1?.name || m.entrants?.[0] || 'Player 1';
        const e2 = m.entrant2?.name || m.entrants?.[1] || 'Player 2';
        const t1 = m.entrant1?.tag ? ` [${esc(m.entrant1.tag)}]` : '';
        const t2 = m.entrant2?.tag ? ` [${esc(m.entrant2.tag)}]` : '';
        const c1 = m.entrant1?.color || '#ef4444';
        const c2 = m.entrant2?.color || '#3b82f6';
        const s1 = m.entrant1?.score ?? (m.scores?.[0] ?? 0);
        const s2 = m.entrant2?.score ?? (m.scores?.[1] ?? 0);
        const r1 = m.entrant1?.rounds || 0;
        const r2 = m.entrant2?.rounds || 0;
        const rules = tournamentMatchRules(m, t);
        const target = rules.target;
        const rb = Number(rules.roundsBestOf) || 0;
        const roundTarget = rb > 0 ? Math.ceil(rb / 2) : 0;
        const notes = m.matchDetails || m.details || '';
        const isWinReady1 = !m.winner && target > 0 && s1 >= target;
        const isWinReady2 = !m.winner && target > 0 && s2 >= target;
        const isMatchWinReady = isWinReady1 || isWinReady2;
        const readyWinnerName = isWinReady1 ? e1 : (isWinReady2 ? e2 : null);

        return `
            <div class="${isMatchWinReady ? 'win-ready-card' : ''}" style="background: var(--bg-card); border: 1px solid ${isMatchWinReady ? '#22c55e' : (isPinned ? 'var(--accent)' : 'var(--border)')}; border-radius: 8px; padding: 0.65rem; display: flex; flex-direction: column; gap: 0.45rem;">
                <div style="display: flex; justify-content: space-between; align-items: center; gap: 0.4rem;">
                    <div style="display: flex; align-items: center; gap: 0.35rem; min-width: 0;">
                        <span style="font-size: 0.72rem; font-weight: 800; color: var(--accent); text-transform: uppercase;">${esc(m.roundName || ('Round ' + m.round))}</span>
                        <span style="font-size: 0.65rem; color: var(--text-muted);">${target > 0 ? 'FT' + target : 'Open'}</span>
                        ${isMatchWinReady ? '<span class="badge-studio" style="background: rgba(34, 197, 94, 0.2); color: #4ade80; border-color: rgba(34, 197, 94, 0.45); font-size: 0.58rem; padding: 0.05rem 0.35rem;">Win Target Met</span>' : (isPinned ? '<span class="badge-studio" style="font-size: 0.58rem; padding: 0.05rem 0.35rem;">Pinned Live</span>' : '')}
                    </div>
                    <button type="button" class="btn-secondary btn-sm" style="font-size: 0.65rem; padding: 0.12rem 0.4rem;" onclick="selectTourneyMatchDirect(${isPinned ? 'null' : `'${m.id}'`})">
                        ${isPinned ? 'Unpin' : 'Pin to HUD'}
                    </button>
                </div>

                <!-- Entrant 1 Row -->
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.4rem; background: ${isWinReady1 ? 'rgba(34, 197, 94, 0.14)' : 'var(--bg-inset)'}; padding: 0.35rem 0.5rem; border-radius: 6px; border-left: 3px solid ${esc(c1)};">
                    <div style="font-weight: 700; font-size: 0.8rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0;">
                        ${esc(e1)}<span style="color: var(--text-muted); font-size: 0.68rem;">${t1}</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 0.35rem; flex-shrink: 0;">
                        ${roundTarget > 0 ? `
                            <div style="display: inline-flex; align-items: center; gap: 0.15rem; margin-right: 0.25rem;" title="Rounds won in current game">
                                <span style="font-size: 0.6rem; color: #ffd700; font-weight: 700;">R:</span>
                                <button type="button" class="score-btn" style="width: 20px; height: 20px; font-size: 0.7rem;" onclick="stepMultiMatchRound('${m.id}', 1, -1)" ${r1 <= 0 ? 'disabled' : ''}>-</button>
                                <span style="font-size: 0.72rem; font-weight: 800; color: #ffd700; min-width: 14px; text-align: center;">${r1}</span>
                                <button type="button" class="score-btn" style="width: 20px; height: 20px; font-size: 0.7rem;" onclick="stepMultiMatchRound('${m.id}', 1, 1)" ${isMatchWinReady ? 'disabled' : ''}>+</button>
                            </div>
                        ` : ''}
                        <div class="score-stepper" style="gap: 0.2rem;">
                            <button type="button" class="score-btn" style="width: 24px; height: 24px;" onclick="stepMultiMatchScore('${m.id}', 1, -1)" ${s1 <= 0 ? 'disabled' : ''}>-</button>
                            <input type="number" class="score-val-input" style="width: 36px; height: 24px; font-size: 0.8rem;" min="0" ${target > 0 ? `max="${isWinReady2 ? Math.max(0, target - 1) : target}"` : ''} value="${s1}" onchange="setMultiMatchScoreDirect('${m.id}', 1, this.value)">
                            <button type="button" class="score-btn" style="width: 24px; height: 24px;" onclick="stepMultiMatchScore('${m.id}', 1, 1)" ${isMatchWinReady || (target > 0 && s1 >= target) ? 'disabled' : ''}>+</button>
                        </div>
                    </div>
                </div>

                <!-- Entrant 2 Row -->
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.4rem; background: ${isWinReady2 ? 'rgba(34, 197, 94, 0.14)' : 'var(--bg-inset)'}; padding: 0.35rem 0.5rem; border-radius: 6px; border-left: 3px solid ${esc(c2)};">
                    <div style="font-weight: 700; font-size: 0.8rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0;">
                        ${esc(e2)}<span style="color: var(--text-muted); font-size: 0.68rem;">${t2}</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 0.35rem; flex-shrink: 0;">
                        ${roundTarget > 0 ? `
                            <div style="display: inline-flex; align-items: center; gap: 0.15rem; margin-right: 0.25rem;" title="Rounds won in current game">
                                <span style="font-size: 0.6rem; color: #ffd700; font-weight: 700;">R:</span>
                                <button type="button" class="score-btn" style="width: 20px; height: 20px; font-size: 0.7rem;" onclick="stepMultiMatchRound('${m.id}', 2, -1)" ${r2 <= 0 ? 'disabled' : ''}>-</button>
                                <span style="font-size: 0.72rem; font-weight: 800; color: #ffd700; min-width: 14px; text-align: center;">${r2}</span>
                                <button type="button" class="score-btn" style="width: 20px; height: 20px; font-size: 0.7rem;" onclick="stepMultiMatchRound('${m.id}', 2, 1)" ${isMatchWinReady ? 'disabled' : ''}>+</button>
                            </div>
                        ` : ''}
                        <div class="score-stepper" style="gap: 0.2rem;">
                            <button type="button" class="score-btn" style="width: 24px; height: 24px;" onclick="stepMultiMatchScore('${m.id}', 2, -1)" ${s2 <= 0 ? 'disabled' : ''}>-</button>
                            <input type="number" class="score-val-input" style="width: 36px; height: 24px; font-size: 0.8rem;" min="0" ${target > 0 ? `max="${isWinReady1 ? Math.max(0, target - 1) : target}"` : ''} value="${s2}" onchange="setMultiMatchScoreDirect('${m.id}', 2, this.value)">
                            <button type="button" class="score-btn" style="width: 24px; height: 24px;" onclick="stepMultiMatchScore('${m.id}', 2, 1)" ${isMatchWinReady || (target > 0 && s2 >= target) ? 'disabled' : ''}>+</button>
                        </div>
                    </div>
                </div>

                <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.4rem; margin-top: 0.1rem;">
                    <input type="text" class="form-control" style="font-size: 0.7rem; padding: 0.2rem 0.4rem; flex: 1;" placeholder="Station / Match note..." value="${esc(notes)}" onchange="saveMultiMatchDetails('${m.id}', this.value)">
                    <button type="button" class="btn-primary btn-sm ${isMatchWinReady ? 'btn-advance-prominent' : ''}" style="font-size: 0.68rem; padding: 0.22rem 0.55rem; white-space: nowrap;" onclick="advanceMultiMatch('${m.id}')">
                        ${isMatchWinReady ? `Confirm &amp; Advance ${esc(readyWinnerName)} &rarr;` : 'Advance &rarr;'}
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

export async function stepMultiMatchScore(matchId, entrantIdx, delta) {
    if (!activeTourneyData) return;
    const m = (activeTourneyData.matches || []).find(x => x.id === matchId);
    if (!m) return;
    const entrantName = entrantIdx === 1 ? (m.entrant1?.name || m.entrants?.[0]) : (m.entrant2?.name || m.entrants?.[1]);
    if (!entrantName || entrantName === 'TBD' || entrantName === 'BYE') return;
    const cur = entrantIdx === 1 ? (m.entrant1?.score ?? 0) : (m.entrant2?.score ?? 0);
    await setMultiMatchScoreDirect(matchId, entrantIdx, Math.max(0, cur + delta));
}

export async function setMultiMatchScoreDirect(matchId, entrantIdx, scoreVal) {
    if (!activeTourneyData) return;
    const m = (activeTourneyData.matches || []).find(x => x.id === matchId);
    if (!m) return;
    const entrantName = entrantIdx === 1 ? (m.entrant1?.name || m.entrants?.[0]) : (m.entrant2?.name || m.entrants?.[1]);
    if (!entrantName || entrantName === 'TBD' || entrantName === 'BYE') return;
    const score = Math.max(0, parseInt(scoreVal, 10) || 0);
    try {
        const res = await fetch('/api/tournament/score', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ matchId, entrant: entrantName, score, preserveActiveMatch: true })
        });
        const data = await res.json();
        if (data.status === 'ok') {
            setActiveTourneyData(data.tournament);
            renderTournamentStudio(activeTourneyData);
            if (activeMatchupData) renderMatchupStudio(activeMatchupData);
        }
    } catch {
        toast('Error updating match score');
    }
}

export async function stepMultiMatchRound(matchId, entrantIdx, roundDelta) {
    if (!activeTourneyData) return;
    const m = (activeTourneyData.matches || []).find(x => x.id === matchId);
    if (!m) return;
    const entrantName = entrantIdx === 1 ? (m.entrant1?.name || m.entrants?.[0]) : (m.entrant2?.name || m.entrants?.[1]);
    if (!entrantName || entrantName === 'TBD' || entrantName === 'BYE') return;
    try {
        const res = await fetch('/api/tournament/score', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ matchId, entrant: entrantName, roundDelta, preserveActiveMatch: true })
        });
        const data = await res.json();
        if (data.status === 'ok') {
            setActiveTourneyData(data.tournament);
            renderTournamentStudio(activeTourneyData);
            if (activeMatchupData) renderMatchupStudio(activeMatchupData);
        }
    } catch {
        toast('Error updating match rounds');
    }
}

export async function saveMultiMatchDetails(matchId, details) {
    try {
        const res = await fetch('/api/tournament/score', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ matchId, matchDetails: (details || '').trim(), preserveActiveMatch: true })
        });
        const data = await res.json();
        if (data.status === 'ok') {
            setActiveTourneyData(data.tournament);
            toast('Match note saved');
        }
    } catch {
        toast('Error saving match note');
    }
}

export async function advanceMultiMatch(matchId) {
    if (!activeTourneyData) return;
    const m = (activeTourneyData.matches || []).find(x => x.id === matchId);
    if (!m) return;
    const e1 = m.entrant1?.name || m.entrants?.[0];
    const e2 = m.entrant2?.name || m.entrants?.[1];
    const s1 = m.entrant1?.score ?? 0;
    const s2 = m.entrant2?.score ?? 0;
    let winner = m.winner;
    if (!winner) {
        if (s1 > s2) winner = e1;
        else if (s2 > s1) winner = e2;
        else {
            winner = prompt(`Select match winner (${e1} or ${e2}):`, e1);
            if (!winner) return;
        }
    }
    try {
        const res = await fetch('/api/tournament/advance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ matchId, winner })
        });
        const data = await res.json();
        if (data.status === 'ok') {
            setActiveTourneyData(data.tournament);
            renderTournamentStudio(activeTourneyData);
            if (activeMatchupData) renderMatchupStudio(activeMatchupData);
            toast(`Advanced: ${winner} won!`);
        }
    } catch {
        toast('Error advancing match');
    }
}

export async function loadTournamentPresets() {
    try {
        const res = await fetch('/api/tournament/presets');
        const data = await res.json();
        if (data.status === 'ok') {
            setActiveTourneyPresetsList(data.presets || []);
            renderTournamentPresets(activeTourneyPresetsList);
        }
    } catch { /* ignore */ }
}

export function renderTournamentPresets(presets = []) {
    setActiveTourneyPresetsList(presets);
    const list = $('tourney-presets-list');
    if (!list) return;

    const filtered = presets.filter(p => matchCategory(p, activePresetsCategory));
    if (!filtered || filtered.length === 0) {
        list.innerHTML = `<div style="padding: 0.75rem; text-align: center; color: var(--text-muted); font-size: 0.8rem;">No tournament presets found in this category.</div>`;
        return;
    }

    list.innerHTML = filtered.map(p => {
        const formatLabel = p.format === 'double' ? 'Double Elim' : (p.format === 'roundRobin' ? 'Round Robin' : 'Single Elim');
        const entrantsCount = Array.isArray(p.entrants) ? p.entrants.length : 0;
        const seriesLabel = p.scoringType === 'points' ? 'Points' : `Bo${p.bestOf || 3}`;
        const isCustom = Boolean(p.isCustom || !p.isBuiltIn);

        return `
            <div style="background: var(--bg-inset); border: 1px solid var(--border); border-radius: 6px; padding: 0.65rem 0.85rem; display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
                <div style="min-width: 0;">
                    <div style="display: flex; align-items: center; gap: 0.45rem;">
                        <span style="font-size: 0.82rem; font-weight: 700; color: var(--text);">${esc(p.name)}</span>
                        <span class="badge-pill" style="background: rgba(59, 130, 246, 0.15); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.3); font-size: 0.65rem;">${formatLabel}</span>
                        <span class="badge-pill" style="background: rgba(255, 255, 255, 0.06); color: var(--text-muted); border: 1px solid var(--border); font-size: 0.65rem;">${seriesLabel}</span>
                        ${isCustom ? '<span class="badge-pill" style="background: rgba(63, 185, 80, 0.15); color: #3fb950; border: 1px solid rgba(63, 185, 80, 0.3); font-size: 0.65rem;">Custom</span>' : ''}
                    </div>
                    <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 0.2rem;">
                        ${entrantsCount} Entrants: ${(p.entrants || []).slice(0, 4).join(', ')}${entrantsCount > 4 ? '...' : ''}
                    </div>
                </div>
                <div style="display: flex; gap: 0.35rem; align-items: center;">
                    <button type="button" class="btn-secondary btn-sm" onclick="loadTournamentPresetToForm('${p.id}')" title="Load into Create Form">
                        Load to Form
                    </button>
                    <button type="button" class="btn-primary btn-sm" onclick="launchTournamentPresetDirect('${p.id}')" title="Launch tournament immediately">
                        Launch
                    </button>
                    ${isCustom ? `<button type="button" class="btn-secondary btn-sm" onclick="openEditTournamentPresetModal('${p.id}')" title="Edit preset rules and seeds">
                            Edit
                        </button>` : `<button type="button" class="btn-secondary btn-sm" onclick="duplicateBuiltInTournamentPreset('${p.id}')" title="Duplicate to custom preset">
                            Duplicate
                        </button>`}
                    <button type="button" class="btn-secondary btn-sm" onclick="deleteTournamentPreset('${p.id}')" title="Delete preset">
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                </div>
            </div>
        `;
    }).join('');
}

export function openEditTournamentPresetModal(presetId) {
    const p = activeTourneyPresetsList.find(x => x.id === presetId);
    if (!p) return;
    $('edit-preset-id').value = p.id;
    $('edit-preset-name').value = p.name || '';
    $('edit-preset-title').value = p.title || p.name || '';
    $('edit-preset-format').value = p.format || 'single';
    if (p.scoringType === 'points') $('edit-preset-series').value = 'points';
    else $('edit-preset-series').value = `bestOf-${p.bestOf || 3}`;
    $('edit-preset-entrants').value = Array.isArray(p.entrants) ? p.entrants.join('\n') : '';
    $('modal-preset-edit').style.display = 'flex';
}

export function closeEditTournamentPresetModal() {
    $('modal-preset-edit').style.display = 'none';
}

export async function submitEditTournamentPreset(e) {
    if (e && e.preventDefault) e.preventDefault();
    const id = $('edit-preset-id').value;
    const name = $('edit-preset-name').value.trim();
    const title = $('edit-preset-title').value.trim();
    const format = $('edit-preset-format').value;
    const seriesVal = $('edit-preset-series').value;
    const scoringType = seriesVal === 'points' ? 'points' : 'bestOf';
    const bestOf = seriesVal.startsWith('bestOf-') ? (parseInt(seriesVal.replace('bestOf-', ''), 10) || 3) : 3;
    const entrants = $('edit-preset-entrants').value.split('\n').map(s => s.trim()).filter(Boolean);

    if (!name) { toast('Please enter a preset name'); return; }
    if (entrants.length < 2) { toast('Please provide at least 2 entrants'); return; }

    try {
        const res = await fetch(`/api/tournament/presets/${encodeURIComponent(id)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, title, format, scoringType, bestOf, entrants })
        });
        const data = await res.json();
        if (data.status === 'ok') {
            closeEditTournamentPresetModal();
            loadTournamentPresets();
            toast('Tournament preset updated!');
        } else {
            toast(data.error || 'Failed to update preset');
        }
    } catch {
        toast('Error updating preset');
    }
}

export async function duplicateBuiltInTournamentPreset(presetId) {
    const p = activeTourneyPresetsList.find(x => x.id === presetId);
    if (!p) return;
    const newName = prompt('New preset name:', `${p.name} (Copy)`);
    if (!newName) return;
    try {
        const res = await fetch('/api/tournament/presets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: newName,
                title: p.title || newName,
                format: p.format || 'single',
                scoringType: p.scoringType || 'bestOf',
                bestOf: p.bestOf || 3,
                entrants: p.entrants || []
            })
        });
        const data = await res.json();
        if (data.status === 'ok') {
            loadTournamentPresets();
            toast('Preset duplicated to custom templates!');
        }
    } catch {
        toast('Error duplicating preset');
    }
}

export async function loadTournamentPresetToForm(presetId) {
    try {
        const res = await fetch('/api/tournament/presets');
        const data = await res.json();
        const preset = (data.presets || []).find(p => p.id === presetId);
        if (!preset) return;

        if (window.switchTab) window.switchTab('tourney');
        if ($('tourney-title')) $('tourney-title').value = preset.title || preset.name;
        if ($('tourney-format')) $('tourney-format').value = preset.format || 'single';
        if ($('tourney-series')) {
            if (preset.scoringType === 'points') $('tourney-series').value = 'points';
            else $('tourney-series').value = `bestOf-${preset.bestOf || 3}`;
        }
        if ($('tourney-entrants-text')) $('tourney-entrants-text').value = (preset.entrants || []).join('\n');
        toast(`Loaded preset: ${preset.name}`);
    } catch {
        toast('Error loading preset');
    }
}

export async function launchTournamentPresetDirect(presetId) {
    try {
        const res = await fetch('/api/tournament/presets');
        const data = await res.json();
        const preset = (data.presets || []).find(p => p.id === presetId);
        if (!preset) return;

        const bestOf = Number(preset.bestOf) || 3;
        const targetScore = preset.scoringType === 'bestOf' ? Math.ceil(bestOf / 2) : 0;

        const createRes = await fetch('/api/tournament/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: preset.title || preset.name,
                format: preset.format || 'single',
                entrants: preset.entrants || [],
                scoringType: preset.scoringType || 'bestOf',
                bestOf,
                targetScore,
                progressionMode: preset.progressionMode || 'manual'
            })
        });
        const createData = await createRes.json();
        if (createData.status === 'ok') {
            setActiveTourneyData(createData.tournament);
            if (window.switchTab) window.switchTab('tourney');
            renderTournamentStudio(activeTourneyData);
            toast(`Launched tournament: ${preset.name}!`);
        }
    } catch {
        toast('Error launching tournament preset');
    }
}

export async function saveCurrentTournamentAsPreset() {
    if (!activeTourneyData) {
        const title = ($('tourney-title')?.value || '').trim();
        const entrantsText = ($('tourney-entrants-text')?.value || '').trim();
        const entrants = entrantsText.split('\n').map(s => s.trim()).filter(Boolean);
        if (!title || entrants.length < 2) {
            alert('Launch a tournament or fill out the tournament form with at least 2 entrants first.');
            return;
        }
        const name = prompt('Preset Name:', title);
        if (!name) return;
        try {
            const res = await fetch('/api/tournament/presets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name,
                    title,
                    format: $('tourney-format')?.value || 'single',
                    scoringType: $('tourney-series')?.value === 'points' ? 'points' : 'bestOf',
                    bestOf: $('tourney-series')?.value?.startsWith('bestOf-') ? parseInt($('tourney-series').value.replace('bestOf-', ''), 10) : 3,
                    entrants
                })
            });
            const data = await res.json();
            if (data.status === 'ok') {
                renderTournamentPresets(data.presets);
                toast('Tournament preset saved!');
            }
        } catch {
            toast('Error saving preset');
        }
        return;
    }

    const name = prompt('Preset Name:', activeTourneyData.title || 'Tournament Preset');
    if (!name) return;

    try {
        const res = await fetch('/api/tournament/presets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name,
                title: activeTourneyData.title,
                format: activeTourneyData.format,
                progressionMode: activeTourneyData.progressionMode,
                scoringType: activeTourneyData.scoringType,
                bestOf: activeTourneyData.bestOf,
                entrants: activeTourneyData.entrants || []
            })
        });
        const data = await res.json();
        if (data.status === 'ok') {
            renderTournamentPresets(data.presets);
            toast('Tournament preset saved!');
        }
    } catch {
        toast('Error saving preset');
    }
}

export async function deleteTournamentPreset(id) {
    if (!confirm('Delete this tournament preset?')) return;
    try {
        const res = await fetch(`/api/tournament/presets/${encodeURIComponent(id)}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.status === 'ok') {
            renderTournamentPresets(data.presets);
            toast('Preset deleted');
        }
    } catch {
        toast('Error deleting preset');
    }
}

export async function loadTournamentHistory() {
    try {
        const res = await fetch('/api/tournament/history');
        const data = await res.json();
        if (data.status === 'ok') {
            renderTournamentHistory(data.history || []);
        }
    } catch { /* ignore */ }
}

export function renderTournamentHistory(history = []) {
    const list = $('tourney-history-list');
    if (!list) return;

    if (!history || history.length === 0) {
        list.innerHTML = `<div style="padding: 1rem; text-align: center; color: var(--text-muted); font-size: 0.8rem; background: var(--bg-inset); border-radius: 6px;">No past tournaments found. Completed and archived brackets will appear here.</div>`;
        return;
    }

    list.innerHTML = history.map((item) => {
        const endedDate = item.endedAt ? new Date(item.endedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Recently';
        const formatLabel = item.format === 'double' ? 'Double Elim' : (item.format === 'roundRobin' ? 'Round Robin' : 'Single Elim');
        const entrantCount = Array.isArray(item.entrants) ? item.entrants.length : (item.entrantCount || 0);

        return `
            <div class="history-card">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem;">
                    <div>
                        <div style="display: flex; align-items: center; gap: 0.45rem;">
                            <span style="font-size: 0.88rem; font-weight: 800; color: var(--text);">${esc(item.title || 'Tournament')}</span>
                            <span class="badge-pill" style="background: rgba(59, 130, 246, 0.15); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.3); font-size: 0.65rem;">${formatLabel}</span>
                            <span class="badge-pill" style="background: rgba(255, 255, 255, 0.06); color: var(--text-muted); border: 1px solid var(--border); font-size: 0.65rem;">${entrantCount} Players</span>
                        </div>
                        <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 0.25rem;">
                            Concluded ${endedDate} · ${item.matches ? item.matches.length : 0} Matches
                        </div>
                    </div>
                    <div style="display: flex; gap: 0.35rem; align-items: center;">
                        <button type="button" class="btn-secondary btn-sm" onclick="inspectTournamentBracket('${item.id}')">
                            Inspect Bracket
                        </button>
                        <button type="button" class="btn-primary btn-sm" onclick="restoreTournamentFromHistory('${item.id}')" title="Restore this tournament to live studio">
                            Restore
                        </button>
                        <button type="button" class="btn-secondary btn-sm" onclick="deleteTournamentHistoryItem('${item.id}')" title="Delete record">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                    </div>
                </div>

                ${item.champion ? `
                    <div style="margin-top: 0.35rem;">
                        <span class="history-champ-badge">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg>
                            Champion: ${esc(item.champion)}
                        </span>
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');
}

export async function inspectTournamentBracket(historyId) {
    try {
        const res = await fetch('/api/tournament/history');
        const data = await res.json();
        const item = (data.history || []).find(h => h.id === historyId);
        if (!item) return;

        setCurrentInspectedTournament(item);
        const modal = $('bracket-inspect-modal');
        if (!modal) return;

        $('inspect-modal-title').textContent = item.title || 'Tournament Result';
        const endedDate = item.endedAt ? new Date(item.endedAt).toLocaleString() : '';
        $('inspect-modal-subtitle').textContent = `${item.format === 'double' ? 'Double Elimination' : (item.format === 'roundRobin' ? 'Round Robin' : 'Single Elimination')} · Concluded ${endedDate}`;

        const body = $('inspect-modal-body');
        if (body) {
            let html = '';
            if (item.champion) {
                html += `
                    <div style="background: linear-gradient(135deg, rgba(245, 158, 11, 0.15), rgba(234, 179, 8, 0.25)); border: 1px solid rgba(245, 158, 11, 0.4); border-radius: 8px; padding: 1rem; text-align: center; margin-bottom: 1.25rem;">
                        <div style="font-size: 0.72rem; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: #fbbf24;">Tournament Champion</div>
                        <div style="font-size: 1.6rem; font-weight: 900; color: #fff; margin-top: 0.2rem;">${esc(item.champion)}</div>
                    </div>
                `;
            }

            if (item.format === 'roundRobin' && Array.isArray(item.standings)) {
                html += `
                    <div style="margin-bottom: 1.25rem;">
                        <div class="micro-heading" style="margin-bottom: 0.5rem;">Final Round Robin Standings</div>
                        <table style="width: 100%; border-collapse: collapse; font-size: 0.8rem;">
                            <thead>
                                <tr style="border-bottom: 1px solid var(--border); text-align: left; color: var(--text-muted); font-size: 0.72rem;">
                                    <th style="padding: 0.4rem;">Rank</th>
                                    <th style="padding: 0.4rem;">Competitor</th>
                                    <th style="padding: 0.4rem;">Played</th>
                                    <th style="padding: 0.4rem;">W - L</th>
                                    <th style="padding: 0.4rem;">Points</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${item.standings.map((st, i) => `
                                    <tr style="border-bottom: 1px solid rgba(255,255,255,0.05); ${i === 0 ? 'background: rgba(245, 158, 11, 0.08); font-weight: 700;' : ''}">
                                        <td style="padding: 0.45rem;">#${i + 1}</td>
                                        <td style="padding: 0.45rem; color: ${i === 0 ? '#fbbf24' : 'var(--text)'};">${esc(st.name)}</td>
                                        <td style="padding: 0.45rem;">${st.played || 0}</td>
                                        <td style="padding: 0.45rem;">${st.wins || 0} - ${st.losses || 0}</td>
                                        <td style="padding: 0.45rem; font-weight: 800;">${st.points || 0}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                `;
            }

            if (Array.isArray(item.matches) && item.matches.length > 0) {
                html += `
                    <div>
                        <div class="micro-heading" style="margin-bottom: 0.5rem;">Match Breakdown</div>
                        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 0.6rem;">
                            ${item.matches.map((m, idx) => {
                                const e1 = m.entrant1?.name || 'TBD';
                                const e2 = m.entrant2?.name || (m.isBye ? 'BYE' : 'TBD');
                                const s1 = m.entrant1?.score ?? (m.scores?.[0] ?? 0);
                                const s2 = m.entrant2?.score ?? (m.scores?.[1] ?? 0);
                                const isWinner1 = m.winner && m.winner === e1;
                                const isWinner2 = m.winner && m.winner === e2;

                                return `
                                    <div style="background: var(--bg-inset); border: 1px solid var(--border); border-radius: 6px; padding: 0.6rem; font-size: 0.78rem;">
                                        <div style="display: flex; justify-content: space-between; margin-bottom: 0.35rem; font-size: 0.7rem; color: var(--text-muted); font-weight: 700;">
                                            <span>${esc(m.roundName || `Round ${m.round}`)}</span>
                                            <span>${m.matchDetails ? esc(m.matchDetails) : `#${idx + 1}`}</span>
                                        </div>
                                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.2rem 0; ${isWinner1 ? 'color: #3fb950; font-weight: 800;' : ''}">
                                            <span>${esc(e1)}</span>
                                            <span style="font-family: monospace;">${s1}</span>
                                        </div>
                                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.2rem 0; ${isWinner2 ? 'color: #3fb950; font-weight: 800;' : ''}">
                                            <span>${esc(e2)}</span>
                                            <span style="font-family: monospace;">${s2}</span>
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                `;
            }

            body.innerHTML = html;
        }

        modal.style.display = 'flex';
    } catch {
        toast('Error inspecting bracket');
    }
}

export function closeBracketInspectModal() {
    const modal = $('bracket-inspect-modal');
    if (modal) modal.style.display = 'none';
    setCurrentInspectedTournament(null);
}

export async function restoreInspectedTournament() {
    if (!currentInspectedTournament) return;
    const tid = currentInspectedTournament.id;
    closeBracketInspectModal();
    await restoreTournamentFromHistory(tid);
}

export async function restoreTournamentFromHistory(historyId) {
    try {
        const res = await fetch('/api/tournament/history/restore', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: historyId })
        });
        const data = await res.json();
        if (data.status === 'ok') {
            setActiveTourneyData(data.tournament);
            if (window.switchTab) window.switchTab('tourney');
            renderTournamentStudio(activeTourneyData);
            toast('Tournament restored to live studio!');
        }
    } catch {
        toast('Error restoring tournament');
    }
}

export async function deleteTournamentHistoryItem(historyId) {
    if (!confirm('Delete this tournament record?')) return;
    try {
        const res = await fetch(`/api/tournament/history/${encodeURIComponent(historyId)}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.status === 'ok') {
            renderTournamentHistory(data.history || []);
            toast('History record deleted');
        }
    } catch {
        toast('Error deleting history item');
    }
}

export async function clearAllTournamentHistory() {
    if (!confirm('Clear all tournament history? This cannot be undone.')) return;
    try {
        const res = await fetch('/api/tournament/history/clear', { method: 'POST' });
        const data = await res.json();
        if (data.status === 'ok') {
            renderTournamentHistory([]);
            toast('Tournament history cleared');
        }
    } catch {
        toast('Error clearing tournament history');
    }
}

/**
 * StreamPulse — Tournament Multi-Match Admin Card Renderer
 */

import { esc, classifyMatch } from './tournament-admin-state.js';

export function buildMatchCardHtml(m, t, globalRb, allowDraws) {
    const state = classifyMatch(m);
    const isPinned = t.highlightLive !== false && m.id === t.activeMatchId;
    const e1 = m.entrant1?.name || m.entrants?.[0] || 'TBD';
    const e2 = m.entrant2?.name || m.entrants?.[1] || 'TBD';
    const t1 = m.entrant1?.tag || '';
    const t2 = m.entrant2?.tag || '';
    const c1 = m.entrant1?.color || '#ef4444';
    const c2 = m.entrant2?.color || '#3b82f6';
    const s1 = m.entrant1?.score ?? (m.scores?.[0] ?? 0);
    const s2 = m.entrant2?.score ?? (m.scores?.[1] ?? 0);
    const r1 = m.entrant1?.rounds || 0;
    const r2 = m.entrant2?.rounds || 0;
    const target = m.targetScore || Math.ceil((m.bestOf || 3) / 2);
    const rb = Number(m.roundsBestOf ?? globalRb) || 0;
    const roundTarget = rb > 0 ? Math.ceil(rb / 2) : 0;
    const notes = m.matchDetails || m.details || '';
    const canScore = state === 'playable';
    const isWinner1 = m.winner && m.winner === e1;
    const isWinner2 = m.winner && m.winner === e2;
    const isWinReady1 = canScore && target > 0 && s1 >= target;
    const isWinReady2 = canScore && target > 0 && s2 >= target;
    const isMatchWinReady = isWinReady1 || isWinReady2;
    const readyWinnerName = isWinReady1 ? e1 : (isWinReady2 ? e2 : null);

    let statusBadge = '';
    if (isMatchWinReady) {
        statusBadge = `<span class="status-pill completed" style="background: rgba(34, 197, 94, 0.22); border-color: rgba(34, 197, 94, 0.55); color: #4ade80;">Win Target Met</span>`;
    } else if (isPinned) {
        statusBadge = `<span class="status-pill pinned">Pinned Live</span>`;
    } else if (state === 'playable') {
        statusBadge = `<span class="status-pill playable">Playable</span>`;
    } else if (state === 'completed') {
        statusBadge = `<span class="status-pill completed">${m.winner === 'DRAW' ? 'Draw' : 'Completed'}</span>`;
    } else {
        statusBadge = `<span class="status-pill upcoming">Waiting TBD</span>`;
    }

    const gamePips1 = target > 0 && target <= 10
        ? Array.from({ length: target }, (_, i) => i < s1 ? '●' : '○').join(' ')
        : `${s1} pts`;
    const gamePips2 = target > 0 && target <= 10
        ? Array.from({ length: target }, (_, i) => i < s2 ? '●' : '○').join(' ')
        : `${s2} pts`;

    const roundPips1 = roundTarget > 0
        ? Array.from({ length: roundTarget }, (_, i) => i < r1 ? '◆' : '◇').join(' ')
        : '◇ ◇';
    const roundPips2 = roundTarget > 0
        ? Array.from({ length: roundTarget }, (_, i) => i < r2 ? '◆' : '◇').join(' ')
        : '◇ ◇';

    function renderEntrantBox(idx, name, tag, color, score, rounds, gamePips, roundPips, isWinner, isWinReady, otherWinReady) {
        const maxGameAllowed = target > 0 ? (otherWinReady ? Math.max(0, target - 1) : target) : '';
        const canStepGameUp = canScore && !isMatchWinReady && (target <= 0 || score < target);
        const canStepRoundUp = canScore && !isMatchWinReady;
        return `
            <div class="entrant-admin-box ${isWinner ? 'is-winner' : ''} ${isWinReady ? 'is-win-ready' : ''}" style="border-top: 3px solid ${esc(color)};">
                <div class="entrant-top-bar">
                    <div style="display: flex; align-items: center; gap: 0.4rem; min-width: 0; flex: 1;">
                        <input type="color" value="${esc(color)}" style="width: 22px; height: 22px; border: none; border-radius: 4px; cursor: pointer; flex-shrink: 0;" onchange="updateEntrantMeta('${m.id}', ${idx}, 'color', this.value)" ${!canScore ? 'disabled' : ''} title="Change entrant color">
                        <div style="font-weight: 800; font-size: 0.94rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; flex: 1; color: ${name === 'TBD' ? 'var(--text-muted)' : 'var(--text)'};" title="${esc(name)}">
                            ${esc(name)}
                        </div>
                        ${isWinReady ? `<span class="status-pill completed" style="font-size: 0.56rem; padding: 0.06rem 0.35rem; flex-shrink: 0;">Win Ready</span>` : ''}
                    </div>
                    <input type="text" class="form-control" style="font-size: 0.68rem; padding: 0.12rem 0.35rem; height: 22px; max-width: 105px; text-align: right;" placeholder="Tag / Char" value="${esc(tag)}" onchange="updateEntrantMeta('${m.id}', ${idx}, 'tag', this.value)" ${!canScore ? 'disabled' : ''}>
                </div>

                <div class="entrant-scoring-cols">
                    <!-- Games Won Column -->
                    <div class="scoring-col games-col">
                        <div class="scoring-col-label">Games Won</div>
                        <div class="score-stepper" style="gap: 0.2rem;">
                            <button type="button" class="score-btn" style="width: 26px; height: 26px;" onclick="stepScore('${m.id}', ${idx}, -1)" ${!canScore || score <= 0 ? 'disabled' : ''}>-</button>
                            <input type="number" class="score-val-input" style="width: 40px; height: 26px; font-size: 0.85rem;" min="0" ${maxGameAllowed !== '' ? `max="${maxGameAllowed}"` : ''} value="${score}" onchange="setScoreDirect('${m.id}', ${idx}, this.value)" ${!canScore ? 'disabled' : ''}>
                            <button type="button" class="score-btn" style="width: 26px; height: 26px;" onclick="stepScore('${m.id}', ${idx}, 1)" ${!canStepGameUp ? 'disabled' : ''} title="${isMatchWinReady ? 'Series win target already reached' : 'Add game win'}">+</button>
                        </div>
                        <div class="pips-preview" style="color: ${isWinReady ? '#4ade80' : 'var(--accent)'};">${gamePips}</div>
                        <div class="sub-count-label" style="${isWinReady ? 'color: #4ade80; font-weight: 800;' : ''}">${target > 0 ? `${score} / ${target} GAMES` : `${score} GAMES`}</div>
                    </div>

                    <!-- Rounds in Game Column -->
                    <div class="scoring-col rounds-col">
                        <div class="scoring-col-label">Rounds in Game</div>
                        ${roundTarget > 0 ? `
                            <div class="score-stepper" style="gap: 0.2rem;">
                                <button type="button" class="score-btn" style="width: 26px; height: 26px;" onclick="stepRound('${m.id}', ${idx}, -1)" ${!canScore || rounds <= 0 ? 'disabled' : ''}>-</button>
                                <input type="number" class="score-val-input" style="width: 40px; height: 26px; font-size: 0.85rem;" min="0" max="${Math.max(0, roundTarget - 1)}" value="${Math.min(Math.max(0, roundTarget - 1), rounds)}" onchange="setRoundDirect('${m.id}', ${idx}, this.value)" ${!canStepRoundUp ? 'disabled' : ''}>
                                <button type="button" class="score-btn" style="width: 26px; height: 26px;" onclick="stepRound('${m.id}', ${idx}, 1)" ${!canStepRoundUp ? 'disabled' : ''} title="${isMatchWinReady ? 'Series win target already reached' : 'Add round win'}">+</button>
                            </div>
                            <div class="pips-preview" style="color: #ffd700;">${roundPips}</div>
                            <div class="sub-count-label">${Math.min(Math.max(0, roundTarget - 1), rounds)} / ${roundTarget} ROUNDS</div>
                        ` : `
                            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 0.25rem 0; gap: 0.25rem;">
                                <span style="font-size: 0.68rem; color: var(--text-muted); font-style: italic;">Rounds Off</span>
                                <button type="button" class="btn-secondary btn-sm" style="font-size: 0.6rem; padding: 0.1rem 0.4rem;" onclick="updateLiveRoundsFormat(3)" title="Enable Best of 3 Rounds per Game for this tournament">
                                    Enable Bo3 Rds
                                </button>
                            </div>
                        `}
                    </div>
                </div>
            </div>
        `;
    }

    return `
        <div class="match-admin-card ${state === 'playable' ? 'is-playable' : ''} ${isPinned ? 'is-pinned' : ''} ${isMatchWinReady ? 'is-win-ready' : ''} ${state === 'completed' ? 'is-completed' : ''}">
            <div class="match-admin-header">
                <div style="display: flex; align-items: center; gap: 0.45rem; flex-wrap: wrap;">
                    <span style="font-size: 0.8rem; font-weight: 800; color: var(--accent); text-transform: uppercase;">${esc(m.roundName || ('Round ' + m.round))}</span>
                    <span style="font-size: 0.68rem; color: var(--text-muted); font-family: monospace;">#${esc(m.id)}</span>
                    <span style="font-size: 0.68rem; color: var(--text-muted); font-weight: 600;">${target > 0 ? `Bo${m.bestOf || (target * 2 - 1)} (FT${target})` : 'Open Points'}${roundTarget > 0 ? ` · Bo${rb} Rds` : ''}</span>
                </div>
                <div style="display: flex; align-items: center; gap: 0.35rem; flex-wrap: wrap;">
                    ${statusBadge}
                    ${state !== 'completed' ? `
                        <button type="button" class="btn-secondary btn-sm" style="font-size: 0.65rem; padding: 0.15rem 0.45rem;" onclick="pinMatch(${isPinned ? 'null' : `'${m.id}'`})" title="${isPinned ? 'Unpin from broadcast HUD' : 'Pin this match as the active broadcast match'}">
                            ${isPinned ? 'Unpin' : 'Pin Live'}
                        </button>
                    ` : `
                        <button type="button" class="btn-secondary btn-sm" style="font-size: 0.65rem; padding: 0.15rem 0.45rem; color: #f59e0b;" onclick="rollbackMatch('${m.id}')" title="Undo advancement and reopen this match">
                            Undo
                        </button>
                    `}
                    <button type="button" class="btn-secondary btn-sm" style="font-size: 0.65rem; padding: 0.15rem 0.45rem; display: inline-flex; align-items: center; gap: 0.25rem;" onclick="popOutMatchWindow('${m.id}')" title="Pop out this match into its own floating scorekeeper window">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                        Pop Out
                    </button>
                </div>
            </div>

            <!-- Side-by-Side Left vs Right Matchup Layout -->
            <div class="match-versus-row">
                ${renderEntrantBox(1, e1, t1, c1, s1, r1, gamePips1, roundPips1, isWinner1, isWinReady1, isWinReady2)}
                <div class="match-vs-divider">
                    <span class="match-vs-badge">VS</span>
                </div>
                ${renderEntrantBox(2, e2, t2, c2, s2, r2, gamePips2, roundPips2, isWinner2, isWinReady2, isWinReady1)}
            </div>

            ${isMatchWinReady ? `
                <div class="win-ready-banner">
                    <div style="display: flex; align-items: center; gap: 0.4rem; font-size: 0.78rem; font-weight: 800; color: #4ade80;">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                        <span>${esc(readyWinnerName)} reached ${target} game${target === 1 ? '' : 's'} (${s1}&ndash;${s2})</span>
                    </div>
                    <button type="button" class="btn-primary btn-sm btn-advance-prominent" style="font-size: 0.76rem; padding: 0.34rem 0.8rem;" onclick="advanceMatch('${m.id}')">
                        Confirm &amp; Advance ${esc(readyWinnerName)} &rarr;
                    </button>
                </div>
            ` : ''}

            <!-- Footer / Station Note & Advancement -->
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.4rem; padding-top: 0.15rem;">
                <input type="text" class="form-control" style="font-size: 0.72rem; padding: 0.25rem 0.5rem; flex: 1;" placeholder="Station / Stream / Note (e.g. Station 2 · Map 1)" value="${esc(notes)}" onchange="saveMatchNote('${m.id}', this.value)">
                ${canScore ? `
                    <div style="display: flex; align-items: center; gap: 0.3rem;">
                        <button type="button" class="btn-secondary btn-sm" style="font-size: 0.68rem; padding: 0.25rem 0.45rem;" onclick="resetMatchScore('${m.id}')" title="Reset this match's scores and rounds to 0-0">
                            Reset
                        </button>
                        ${allowDraws && !isMatchWinReady ? `
                            <button type="button" class="btn-secondary btn-sm" style="font-size: 0.68rem; padding: 0.25rem 0.45rem;" onclick="recordDraw('${m.id}')">
                                Draw
                            </button>
                        ` : ''}
                        ${!isMatchWinReady ? `
                            <button type="button" class="btn-primary btn-sm" style="font-size: 0.7rem; padding: 0.25rem 0.55rem; white-space: nowrap;" onclick="advanceMatch('${m.id}')">
                                Advance Winner &rarr;
                            </button>
                        ` : ''}
                    </div>
                ` : (state === 'completed' ? `
                    <span style="font-size: 0.72rem; font-weight: 800; color: #3fb950; white-space: nowrap;">
                        ${m.winner === 'DRAW' ? 'Recorded Draw' : `Won: ${esc(m.winner)}`}
                    </span>
                ` : `
                    <span style="font-size: 0.7rem; color: var(--text-muted); white-space: nowrap;">Awaiting Entrants</span>
                `)}
            </div>
        </div>
    `;
}

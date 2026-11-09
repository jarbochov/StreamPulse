/**
 * StreamPulse — Versus Studio Matchup Mode, Clocks, Competitors & Fight Card Queue
 */

import {
    $,
    esc,
    toast,
    fmtStudioMs,
    activeTourneyData,
    setActiveTourneyData,
    activeMatchupData,
    setActiveMatchupData,
    matchupSourceMode,
    setMatchupSourceMode,
    activeMatchupPresetsList,
    setActiveMatchupPresetsList,
    activePresetsCategory,
    setActivePresetsCategory,
    studioClockTicker,
    setStudioClockTicker,
    tournamentMatchRules,
    isTournamentMatchActive,
    getTourneyActiveMatch,
    showLoadedExhibition,
    loadMatchup
} from './versus-state.js';
import { updateMatchupOverlayUrl } from './versus-preview.js';

let studioTickN = 0;

export async function toggleMatchClock() {
    if (!activeMatchupData) return;
    const isRunning = Boolean(activeMatchupData.clock && activeMatchupData.clock.isRunning);
    const endpoint = isRunning ? '/api/matchup/clock/pause' : '/api/matchup/clock/start';
    try {
        const res = await fetch(endpoint, { method: 'POST' });
        const data = await res.json();
        if (data.status === 'ok') {
            if (activeMatchupData.clock) activeMatchupData.clock = data.clock;
            syncClockStudioUi(data.clock);
            toast(isRunning ? 'Clock paused' : 'Clock started');
        }
    } catch {
        toast('Error toggling clock');
    }
}

export async function resetMatchClock() {
    try {
        const res = await fetch('/api/matchup/clock/reset', { method: 'POST' });
        const data = await res.json();
        if (data.status === 'ok') {
            if (activeMatchupData && activeMatchupData.clock) activeMatchupData.clock = data.clock;
            syncClockStudioUi(data.clock);
            toast('Clock reset');
        }
    } catch {
        toast('Error resetting clock');
    }
}

export async function setClockPreset(mode, duration) {
    try {
        const body = mode === 'none' ? { enabled: false } : { mode, enabled: true };
        if (mode === 'countdown') {
            body.duration = duration;
        } else if (mode === 'stopwatch') {
            body.estimate = '45:00';
        } else if (mode === 'race') {
            body.estimate = $('race-est-input')?.value || '45:00';
        }
        const res = await fetch('/api/matchup/clock/set', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await res.json();
        if (data.status === 'ok') {
            if (activeMatchupData && activeMatchupData.clock) activeMatchupData.clock = data.clock;
            syncClockStudioUi(data.clock);
            if ($('matchup-opt-clock')) {
                $('matchup-opt-clock').checked = mode !== 'none';
                updateMatchupOverlayUrl();
            }
            if (activeMatchupData) renderMatchupStudio(activeMatchupData);
            toast(mode === 'none' ? 'Clock hidden' : `Clock set to ${mode === 'countdown' ? duration + 's countdown' : (mode === 'race' ? 'Speedrun Battle (GDQ)' : 'Stopwatch')}`);
        }
    } catch {
        toast('Error setting clock');
    }
}

export function syncClockStudioUi(clk) {
    if (!clk) return;
    const digitsEl = $('studio-clock-digits');
    const modeEl = $('studio-clock-mode-label');
    const toggleBtn = $('btn-clock-toggle');

    if (digitsEl) {
        if (clk.mode === 'race' || clk.mode === 'stopwatch') {
            digitsEl.textContent = fmtStudioMs(clk.elapsed || 0);
            digitsEl.style.color = '#38bdf8';
        } else {
            digitsEl.textContent = String(clk.remaining ?? clk.duration ?? 99);
            digitsEl.style.color = (clk.remaining !== undefined && clk.remaining <= 10) ? '#ef4444' : '#ffd700';
        }
    }

    if (modeEl) {
        if (clk.mode === 'race') {
            modeEl.textContent = clk.estimate ? `Speedrun Battle · EST ${clk.estimate}` : 'Speedrun Battle';
        } else if (clk.mode === 'stopwatch') {
            modeEl.textContent = clk.estimate ? `Stopwatch · EST ${clk.estimate}` : 'Stopwatch';
        } else {
            modeEl.textContent = 'Countdown';
        }
    }

    if (toggleBtn) {
        toggleBtn.textContent = clk.isRunning ? 'Pause Clock' : 'Start Clock';
        toggleBtn.classList.toggle('btn-primary', !clk.isRunning);
        toggleBtn.classList.toggle('btn-secondary', clk.isRunning);
    }

    const off = clk.enabled === false;
    $('chip-clk-none')?.classList.toggle('active', off);
    const c99 = $('chip-clk-99');
    const c60 = $('chip-clk-60');
    const cSw = $('chip-clk-stopwatch');
    const cRc = $('chip-clk-race');
    if (c99) c99.classList.toggle('active', !off && clk.mode === 'countdown' && clk.duration === 99);
    if (c60) c60.classList.toggle('active', !off && clk.mode === 'countdown' && clk.duration === 60);
    if (cSw) cSw.classList.toggle('active', !off && clk.mode === 'stopwatch');
    if (cRc) cRc.classList.toggle('active', !off && clk.mode === 'race');

    const stdCtrl = $('clock-standard-controls');
    if (stdCtrl) stdCtrl.style.display = off ? 'none' : 'flex';
    const raceCtrl = $('clock-race-controls');
    if (raceCtrl) raceCtrl.style.display = (!off && clk.mode === 'race') ? 'block' : 'none';
    const noticeEl = $('clock-off-notice');
    if (noticeEl) noticeEl.style.display = off ? 'block' : 'none';
    if ($('race-est-input') && clk.estimate) $('race-est-input').value = clk.estimate;
    if ($('race-timers-mode-select') && clk.runnerTimersMode) {
        $('race-timers-mode-select').value = (clk.runnerTimersMode === 'always' || clk.runnerTimersMode === 'off') ? clk.runnerTimersMode : 'finish';
    }
    if ($('race-show-splits-check') && clk.showSplits !== undefined) {
        $('race-show-splits-check').checked = clk.showSplits !== false;
    }

    // Update individual runner timers in the DOM
    if (activeMatchupData && Array.isArray(activeMatchupData.competitors)) {
        activeMatchupData.competitors.forEach((c, i) => {
            const el = document.querySelector(`[data-runner-timer="${i}"]`);
            if (!el || !c.timer) return;
            el.textContent = c.timer.finished && c.timer.finishTime ? c.timer.finishTime : fmtStudioMs(c.timer.elapsed || 0);
        });
    }

    const anyRunning = clk.isRunning || (activeMatchupData?.competitors || []).some(c => c.timer && c.timer.isRunning && !c.timer.finished);
    if (anyRunning) {
        if (!studioClockTicker) {
            setStudioClockTicker(setInterval(() => {
                const isMasterRunning = activeMatchupData?.clock?.isRunning;
                const anyRunner = (activeMatchupData?.competitors || []).some(c => c.timer && c.timer.isRunning && !c.timer.finished);
                if (!activeMatchupData || !activeMatchupData.clock || (!isMasterRunning && !anyRunner)) {
                    clearInterval(studioClockTicker);
                    setStudioClockTicker(null);
                    return;
                }
                if (isMasterRunning) {
                    if (activeMatchupData.clock.mode === 'stopwatch' || activeMatchupData.clock.mode === 'race') {
                        activeMatchupData.clock.elapsed = (activeMatchupData.clock.elapsed || 0) + 0.1;
                    } else if (activeMatchupData.clock.remaining > 0) {
                        studioTickN = (studioTickN || 0) + 1;
                        if (studioTickN % 10 === 0) activeMatchupData.clock.remaining -= 1;
                    }
                }
                if (activeMatchupData.clock.mode === 'race' && Array.isArray(activeMatchupData.competitors)) {
                    activeMatchupData.competitors.forEach(c => {
                        if (c.timer && c.timer.isRunning && !c.timer.finished) {
                            c.timer.elapsed = (c.timer.elapsed || 0) + 0.1;
                        }
                    });
                }
                syncClockStudioUi(activeMatchupData.clock);
            }, 100));
        }
    } else {
        if (studioClockTicker) {
            clearInterval(studioClockTicker);
            setStudioClockTicker(null);
        }
    }
}

export async function startAllRunnersRace() {
    try {
        const res = await fetch('/api/matchup/clock/race/start-all', { method: 'POST' });
        const data = await res.json();
        if (data.status === 'ok') {
            if (data.matchup) {
                setActiveMatchupData(data.matchup);
                renderMatchupStudio(data.matchup);
            }
            toast('Speedrun Battle started for all runners!');
        }
    } catch {
        toast('Error starting race');
    }
}

export async function pauseAllRunnersRace() {
    try {
        const res = await fetch('/api/matchup/clock/race/pause-all', { method: 'POST' });
        const data = await res.json();
        if (data.status === 'ok') {
            if (data.matchup) {
                setActiveMatchupData(data.matchup);
                renderMatchupStudio(data.matchup);
            }
            toast('Race paused');
        }
    } catch {
        toast('Error pausing race');
    }
}

export async function resetAllRunnersRace() {
    if (!confirm('Reset all runner timers to 0:00?')) return;
    try {
        const res = await fetch('/api/matchup/clock/race/reset-all', { method: 'POST' });
        const data = await res.json();
        if (data.status === 'ok') {
            if (data.matchup) {
                setActiveMatchupData(data.matchup);
                renderMatchupStudio(data.matchup);
            }
            toast('Race timers reset');
        }
    } catch {
        toast('Error resetting race');
    }
}

export async function finishRunnerRace(idx) {
    try {
        const res = await fetch('/api/matchup/clock/race/finish', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ index: idx })
        });
        const data = await res.json();
        if (data.status === 'ok') {
            if (data.matchup) {
                setActiveMatchupData(data.matchup);
                renderMatchupStudio(data.matchup);
            }
            const runner = data.matchup?.competitors?.[idx];
            toast(`Runner ${runner ? runner.name : idx + 1} finished at ${runner?.timer?.finishTime || ''}!`);
        }
    } catch {
        toast('Error finishing runner race');
    }
}

export async function toggleRunnerRace(idx) {
    try {
        const res = await fetch('/api/matchup/clock/race/toggle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ index: idx })
        });
        const data = await res.json();
        if (data.status === 'ok') {
            if (data.matchup) {
                setActiveMatchupData(data.matchup);
                renderMatchupStudio(data.matchup);
            }
        }
    } catch {
        toast('Error toggling runner timer');
    }
}

export async function resetRunnerRace(idx) {
    try {
        const res = await fetch('/api/matchup/clock/race/reset', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ index: idx })
        });
        const data = await res.json();
        if (data.status === 'ok') {
            if (data.matchup) {
                setActiveMatchupData(data.matchup);
                renderMatchupStudio(data.matchup);
            }
        }
    } catch {
        toast('Error resetting runner timer');
    }
}

export async function saveRaceEstimate(val) {
    try {
        const res = await fetch('/api/matchup/clock/estimate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ estimate: val })
        });
        const data = await res.json();
        if (data.status === 'ok') {
            if (activeMatchupData && activeMatchupData.clock) activeMatchupData.clock.estimate = val;
            toast(`Target estimate updated: ${val}`);
        }
    } catch {
        toast('Error saving estimate');
    }
}

export async function setRunnerTimersMode(modeVal) {
    const runnerTimersMode = (modeVal === 'always' || modeVal === 'off') ? modeVal : 'finish';
    try {
        const res = await fetch('/api/matchup/clock/set', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ runnerTimersMode })
        });
        const data = await res.json();
        if (data.status === 'ok') {
            if (activeMatchupData && activeMatchupData.clock) activeMatchupData.clock = data.clock;
            if ($('matchup-opt-runnertimers')) {
                $('matchup-opt-runnertimers').value = runnerTimersMode;
                updateMatchupOverlayUrl();
            }
            if ($('race-timers-mode-select')) $('race-timers-mode-select').value = runnerTimersMode;
            if (activeMatchupData) renderMatchupStudio(activeMatchupData);
            const msg = runnerTimersMode === 'finish'
                ? 'Overlays set to Overall Clock Only — runner times reveal on finish'
                : (runnerTimersMode === 'off'
                    ? 'Overlays set to Overall Clock Only — runner times hidden'
                    : 'Overlays set to always show live runner timers');
            toast(msg);
        }
    } catch {
        toast('Error updating runner timer display mode');
    }
}

export async function setRaceShowSplits(checked) {
    const showSplits = Boolean(checked);
    try {
        const res = await fetch('/api/matchup/clock/set', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ showSplits })
        });
        const data = await res.json();
        if (data.status === 'ok') {
            if (activeMatchupData && activeMatchupData.clock) activeMatchupData.clock = data.clock;
            if ($('matchup-opt-splits')) {
                $('matchup-opt-splits').checked = showSplits;
                updateMatchupOverlayUrl();
            }
            if ($('race-show-splits-check')) $('race-show-splits-check').checked = showSplits;
            if (activeMatchupData) renderMatchupStudio(activeMatchupData);
            toast(showSplits ? 'Speedrun split deltas enabled (+00:12.65)' : 'Speedrun split deltas hidden (finish times only)');
        }
    } catch {
        toast('Error updating speedrun splits setting');
    }
}

export function filterPresetsCategory(cat, btn) {
    setActivePresetsCategory(cat);
    document.querySelectorAll('#presets-category-tabs .preset-chip-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    if (window.renderTournamentPresets && window.activeTourneyPresetsList) window.renderTournamentPresets(window.activeTourneyPresetsList);
    if (activeMatchupPresetsList) renderMatchupPresets(activeMatchupPresetsList);
}

export function matchCategory(p, cat) {
    if (cat === 'all') return true;
    const str = `${p.id || ''} ${p.name || ''} ${p.title || ''} ${p.details || ''}`.toLowerCase();
    if (cat === 'custom') {
        return Boolean(p.isCustom || !p.isBuiltIn || (!p.id.startsWith('tp-') && !p.id.startsWith('preset-')));
    }
    if (cat === 'fgc') {
        return /sf6|street fighter|tekken|smash|guilty|evo|fgc|fighter|mishima/.test(str);
    }
    if (cat === 'speedrun') {
        return /speedrun|gdq|race|any%|pb:/.test(str);
    }
    if (cat === 'party') {
        return /mario|kart|rocket|league|ffa|party/.test(str);
    }
    return true;
}

export function toggleMatchupSourceMode() {
    if (matchupSourceMode === 'tournament' || (matchupSourceMode === 'auto' && isTournamentMatchActive())) {
        setMatchupSourceMode('exhibition');
        toast('Switched to Exhibition Matchup mode');
    } else {
        setMatchupSourceMode('tournament');
        toast('Switched to Active Tournament match mode');
    }
    if (activeMatchupData) renderMatchupStudio(activeMatchupData);
}

export function navTournamentMatch(direction) {
    if (!activeTourneyData || !Array.isArray(activeTourneyData.matches)) return;
    const validMatches = activeTourneyData.matches.filter(m => !m.isBye);
    if (!validMatches.length) return;
    const curMatch = getTourneyActiveMatch();
    const curIdx = curMatch ? validMatches.findIndex(m => m.id === curMatch.id) : 0;
    let nextIdx = curIdx + direction;
    if (nextIdx < 0) nextIdx = validMatches.length - 1;
    if (nextIdx >= validMatches.length) nextIdx = 0;
    if (window.selectTourneyMatchDirect) window.selectTourneyMatchDirect(validMatches[nextIdx].id);
}

export function renderMatchupStudio(m) {
    if (!m) return;
    setActiveMatchupData(m);
    if (m.clock) syncClockStudioUi(m.clock);

    const tourneyActive = isTournamentMatchActive();
    const activeMatch = tourneyActive ? getTourneyActiveMatch() : null;

    // Tournament Banner & Match Switcher
    const banner = $('matchup-tourney-banner');
    if (banner) {
        if (tourneyActive && activeMatch) {
            banner.style.display = 'block';
            if ($('matchup-tourney-title-text')) $('matchup-tourney-title-text').textContent = activeTourneyData.title || 'Tournament Bracket';
            if ($('matchup-tourney-round-text')) $('matchup-tourney-round-text').textContent = activeMatch.roundName || ('Round ' + (activeMatch.round || 1));
            if ($('btn-toggle-matchup-source')) $('btn-toggle-matchup-source').textContent = 'Exhibition Mode';
            if ($('btn-matchup-tourney-draw')) {
                $('btn-matchup-tourney-draw').style.display = (activeTourneyData.format === 'roundRobin' || activeTourneyData.allowDraws) ? 'inline-block' : 'none';
            }
            const matchSelect = $('matchup-tourney-match-select');
            if (matchSelect) {
                const validMatches = (activeTourneyData.matches || []).filter(match => !match.isBye);
                matchSelect.innerHTML = validMatches.map(match => `
                    <option value="${match.id}" ${match.id === activeMatch.id ? 'selected' : ''}>
                        ${match.roundName || ('R' + match.round)}: ${match.entrant1?.name || 'TBD'} vs ${match.entrant2?.name || 'TBD'}${match.winner ? (match.winner === 'DRAW' ? ' [Draw]' : ` [Won: ${match.winner}]`) : ''}
                    </option>
                `).join('');
            }
        } else {
            banner.style.display = 'none';
            if ($('btn-toggle-matchup-source')) $('btn-toggle-matchup-source').textContent = 'Tournament Mode';
        }
    }

    if ($('matchup-title')) $('matchup-title').value = tourneyActive ? (activeTourneyData.title || '') : (m.title || '');
    if ($('matchup-phase')) $('matchup-phase').value = tourneyActive ? (activeMatch?.roundName || '') : (m.phase || '');
    if ($('matchup-details')) $('matchup-details').value = tourneyActive ? (activeMatch?.matchDetails || '') : (m.details || '');
    if ($('matchup-competitor-count')) $('matchup-competitor-count').value = tourneyActive ? '2' : String(m.competitorCount || 2);

    const tourneyRoundsBestOf = (tourneyActive ? (activeMatch?.roundsBestOf ?? activeTourneyData?.roundsBestOf ?? 0) : null);
    const effectiveRoundsBestOf = (tourneyRoundsBestOf !== null && tourneyRoundsBestOf !== undefined) ? tourneyRoundsBestOf : (m.roundsBestOf || 0);
    if ($('matchup-rounds')) $('matchup-rounds').value = String(effectiveRoundsBestOf || 0);
    const fmtSelect = $('matchup-format');
    const targetRow = $('matchup-custom-target-row');
    if (fmtSelect) {
        const srcFmt = tourneyActive ? (activeTourneyData.scoringType || 'bestOf') : (m.format || 'bestOf');
        const srcBestOf = tourneyActive ? tournamentMatchRules(activeMatch, activeTourneyData).bestOf : (m.bestOf ?? 5);
        const srcTarget = tourneyActive ? tournamentMatchRules(activeMatch, activeTourneyData).target : (m.targetScore ?? 3);
        if (srcFmt === 'points' || (!srcBestOf && !srcTarget)) {
            fmtSelect.value = 'points';
            if (targetRow) targetRow.style.display = 'none';
        } else if (srcFmt === 'firstTo' || (!srcBestOf && srcTarget > 0)) {
            if (srcTarget === 10) {
                fmtSelect.value = 'firstTo-10';
                if (targetRow) targetRow.style.display = 'none';
            } else {
                fmtSelect.value = 'firstTo-custom';
                if (targetRow) targetRow.style.display = 'block';
                if ($('matchup-target-input')) $('matchup-target-input').value = srcTarget || 5;
            }
        } else {
            fmtSelect.value = `bestOf-${[1, 3, 5, 7, 9].includes(Number(srcBestOf)) ? Number(srcBestOf) : 3}`;
            if (targetRow) targetRow.style.display = 'none';
        }
    }

    const grid = $('matchup-competitors-grid');
    if (!grid) return;

    const competitorsToRender = (tourneyActive && activeMatch) ? [
        {
            id: 't-c1',
            name: activeMatch.entrant1?.name || (activeMatch.entrants && activeMatch.entrants[0]) || 'Player 1',
            tag: activeMatch.entrant1?.tag || '',
            color: activeMatch.entrant1?.color || '#ef4444',
            score: activeMatch.entrant1?.score ?? (Array.isArray(activeMatch.scores) ? (activeMatch.scores[0] ?? 0) : 0),
            rounds: activeMatch.entrant1?.rounds || 0
        },
        {
            id: 't-c2',
            name: activeMatch.entrant2?.name || (activeMatch.entrants && activeMatch.entrants[1]) || 'Player 2',
            tag: activeMatch.entrant2?.tag || '',
            color: activeMatch.entrant2?.color || '#3b82f6',
            score: activeMatch.entrant2?.score ?? (Array.isArray(activeMatch.scores) ? (activeMatch.scores[1] ?? 0) : 0),
            rounds: activeMatch.entrant2?.rounds || 0
        }
    ] : m.competitors;

    const target = tourneyActive
        ? tournamentMatchRules(activeMatch, activeTourneyData).target
        : (m.targetScore ?? (m.bestOf > 0 ? Math.ceil(m.bestOf / 2) : 0));
    const roundTarget = (effectiveRoundsBestOf > 0 ? Math.ceil(effectiveRoundsBestOf / 2) : 0);
    const anyCompetitorAtTarget = target > 0 && competitorsToRender.some(comp => (comp.score || 0) >= target);
    const readyWinnerComp = target > 0 ? competitorsToRender.find(comp => (comp.score || 0) >= target) : null;

    const mAdvBtn = $('btn-matchup-tourney-advance');
    const mWinLabel = $('matchup-tourney-win-ready-label');
    if (tourneyActive && activeMatch) {
        if (readyWinnerComp && !activeMatch.winner) {
            if (mAdvBtn) {
                mAdvBtn.classList.add('btn-advance-prominent');
                mAdvBtn.innerHTML = `Confirm &amp; Advance ${esc(readyWinnerComp.name)} &rarr;`;
            }
            if (mWinLabel) {
                mWinLabel.style.display = 'inline-flex';
                mWinLabel.textContent = `Win Target Met: ${readyWinnerComp.name} reached ${target} game${target === 1 ? '' : 's'}`;
            }
        } else {
            if (mAdvBtn) {
                mAdvBtn.classList.remove('btn-advance-prominent');
                mAdvBtn.innerHTML = `Advance Winner &rarr;`;
            }
            if (mWinLabel) mWinLabel.style.display = 'none';
        }
    }

    grid.style.gridTemplateColumns = competitorsToRender.length > 2 ? 'repeat(2, 1fr)' : '1fr 1fr';

    grid.innerHTML = competitorsToRender.map((c, i) => {
        const isWinner = tourneyActive
            ? (activeMatch?.winner === c.name || (target > 0 && (c.score || 0) >= target))
            : ((m.status === 'COMPLETED' && m.winner === c.name) || (target > 0 && (c.score || 0) >= target));
        const otherAtTarget = target > 0 && competitorsToRender.some((other, idx) => idx !== i && (other.score || 0) >= target);
        const maxAllowedScore = target > 0 ? (otherAtTarget ? Math.max(0, target - 1) : target) : '';
        const canStepGameUp = !anyCompetitorAtTarget && (target <= 0 || (c.score || 0) < target);
        const canStepRoundUp = !anyCompetitorAtTarget;
        const gamePips = target > 0
            ? Array.from({ length: target }, (_, p) => p < (c.score || 0) ? '●' : '○').join(' ')
            : `${c.score || 0} pts`;
        const roundPips = roundTarget > 0
            ? Array.from({ length: roundTarget }, (_, p) => p < (c.rounds || 0) ? '◆' : '◇').join(' ')
            : '';
        const isRace = !tourneyActive && m.clock && m.clock.enabled !== false && m.clock.mode === 'race';
        const timerObj = c.timer || { elapsed: 0, isRunning: false, finished: false };
        const pad = n => String(n).padStart(2, '0');
        const mElapsed = Math.floor((timerObj.elapsed || 0) / 60);
        const sElapsed = Math.floor((timerObj.elapsed || 0) % 60);
        const formattedTime = `${pad(mElapsed)}:${pad(sElapsed)}.${pad(Math.floor((timerObj.elapsed || 0) * 100) % 100)}`;

        return `
            <div class="matchup-competitor-card${isWinner ? ' winner win-ready-card' : ''}">
                <div class="matchup-card-strip" style="background: ${c.color || '#fff'};"></div>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-size: 0.72rem; font-weight: 800; color: ${isWinner ? '#4ade80' : 'var(--text-muted)'}; text-transform: uppercase;">
                        Player ${i + 1}${isWinner ? ' · WIN TARGET MET' : ''}${tourneyActive ? ' (Tournament)' : ''}
                    </span>
                    <div style="display: flex; align-items: center; gap: 0.35rem;">
                        <input type="color" value="${c.color || '#fff'}" style="width: 22px; height: 22px; border: none; cursor: pointer; border-radius: 4px;" onchange="updateCompetitorColor(${i}, this.value)" title="Change player color">
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.4rem;">
                    <input type="text" id="matchup-comp-name-${i}" class="form-control" style="font-size: 0.8rem; padding: 0.3rem 0.5rem;" value="${esc(c.name)}" placeholder="Player ${i + 1} Name" oninput="updateCompetitorNameImmediate(${i}, this.value)" onchange="saveMatchupSettings()" ${tourneyActive ? 'readonly title="Tournament entrant name locked to bracket"' : ''}>
                    <input type="text" id="matchup-comp-tag-${i}" class="form-control" style="font-size: 0.8rem; padding: 0.3rem 0.5rem;" value="${esc(c.tag)}" placeholder="Character / Tag" oninput="updateCompetitorTagImmediate(${i}, this.value)" onchange="saveMatchupSettings()">
                </div>

                ${isRace ? `
                    <div style="background: rgba(0,0,0,0.3); border: 1px solid var(--border); border-radius: 6px; padding: 0.5rem 0.65rem; margin-top: 0.45rem;">
                        <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 0.35rem;">
                            <div data-runner-timer="${i}" style="font-size: 1.15rem; font-weight: 900; font-family: monospace; color: ${timerObj.finished ? '#3fb950' : (timerObj.isRunning ? '#38bdf8' : '#e6edf3')};">
                                ${timerObj.finished ? (timerObj.finishTime || formattedTime) : formattedTime}
                            </div>
                            <div>
                                ${timerObj.finished ? (
                                    (timerObj.place === 1 || timerObj.delta === 'WINNER' || !timerObj.delta)
                                        ? '<span class="badge-studio" style="background: rgba(63,185,80,0.18); color: #4ade80; border: 1px solid rgba(63,185,80,0.45); font-size: 0.65rem;">1ST · WINNER</span>'
                                        : `<span class="badge-studio" style="background: rgba(239,68,68,0.18); color: #fca5a5; border: 1px solid rgba(239,68,68,0.45); font-size: 0.65rem;">${timerObj.place ? (timerObj.place === 2 ? '2ND' : (timerObj.place === 3 ? '3RD' : timerObj.place + 'TH')) + ' · ' : ''}${esc(timerObj.delta)}</span>`
                                ) : (timerObj.isRunning ? '<span class="badge-studio" style="background: rgba(56,189,248,0.15); color: #38bdf8; font-size: 0.65rem;">RUNNING</span>' : '<span class="badge-studio" style="font-size: 0.65rem;">READY</span>')}
                            </div>
                        </div>
                        <div style="display: flex; gap: 0.35rem; align-items: center;">
                            <button type="button" class="btn-primary btn-sm" style="background: #238636; border-color: #2ea043; color: #fff;" onclick="finishRunnerRace(${i})" ${timerObj.finished ? 'disabled' : ''}>
                                Finish / Split
                            </button>
                            <button type="button" class="btn-secondary btn-sm" onclick="toggleRunnerRace(${i})">
                                ${timerObj.isRunning ? 'Pause' : 'Start'}
                            </button>
                            <button type="button" class="btn-secondary btn-sm" onclick="resetRunnerRace(${i})">
                                Reset
                            </button>
                        </div>
                    </div>
                ` : ''}

                <!-- Separated Score & Round Pips Dock -->
                <div class="score-pips-dock" style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin-top: 0.6rem; background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px; padding: 0.6rem;">
                    <!-- Game / Set Wins & Game Pips -->
                    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; border-right: 1px solid var(--border); padding-right: 0.35rem;">
                        <div style="font-size: 0.65rem; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-muted); margin-bottom: 0.3rem;">
                            Games Won
                        </div>
                        <div class="score-stepper">
                            <button type="button" class="score-btn" onclick="stepMatchupScore(${i}, -1)" ${(c.score || 0) <= 0 ? 'disabled' : ''}>-</button>
                            <input type="number" class="score-val-input" min="0" ${maxAllowedScore !== '' ? `max="${maxAllowedScore}"` : ''} value="${c.score || 0}" onchange="setMatchupScoreDirect(${i}, this.value)">
                            <button type="button" class="score-btn" onclick="stepMatchupScore(${i}, 1)" ${!canStepGameUp ? 'disabled' : ''} title="${!canStepGameUp ? 'Series win target reached' : 'Add game win'}">+</button>
                        </div>
                        <div style="font-size: 0.82rem; letter-spacing: 0.12rem; color: ${c.color || '#fff'}; margin-top: 0.35rem; font-weight: 800;">
                            ${gamePips}
                        </div>
                        <div style="font-size: 0.65rem; font-weight: 700; color: ${isWinner ? '#4ade80' : 'var(--text-muted)'}; margin-top: 0.15rem;">
                            ${target > 0 ? `${c.score || 0} / ${target} GAMES` : `${c.score || 0} POINTS`}
                        </div>
                    </div>

                    <!-- Round Pips & Round Stepper -->
                    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding-left: 0.35rem;">
                        <div style="font-size: 0.65rem; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-muted); margin-bottom: 0.3rem;">
                            Rounds in Game
                        </div>
                        ${roundTarget > 0 ? `
                            <div class="score-stepper">
                                <button type="button" class="score-btn" onclick="stepMatchupRound(${i}, -1)" ${(c.rounds || 0) <= 0 ? 'disabled' : ''}>-</button>
                                <input type="number" class="score-val-input" min="0" max="${roundTarget - 1}" value="${Math.min(roundTarget - 1, c.rounds || 0)}" onchange="setMatchupRoundDirect(${i}, this.value)" ${!canStepRoundUp ? 'disabled' : ''}>
                                <button type="button" class="score-btn" onclick="stepMatchupRound(${i}, 1)" ${!canStepRoundUp ? 'disabled' : ''} title="${!canStepRoundUp ? 'Series win target reached' : 'Add round win'}">+</button>
                            </div>
                            <div style="font-size: 0.82rem; letter-spacing: 0.12rem; color: #ffd700; margin-top: 0.35rem; font-weight: 800;">
                                ${roundPips}
                            </div>
                            <div style="font-size: 0.65rem; font-weight: 700; color: var(--text-muted); margin-top: 0.15rem;">
                                ${Math.min(roundTarget - 1, c.rounds || 0)} / ${roundTarget} ROUNDS
                            </div>
                        ` : `
                            <div style="font-size: 0.72rem; color: var(--text-muted); padding: 0.45rem 0; font-style: italic;">
                                Rounds Off
                            </div>
                            <div style="font-size: 0.62rem; color: var(--text-muted);">
                                (Enable in format settings)
                            </div>
                        `}
                    </div>
                </div>
            </div>
        `;
    }).join('');

    renderMatchupQueue(m.queue || [], tourneyActive ? -1 : (m.activeQueueIndex ?? -1));
}

export function syncCompetitorsFromDom() {
    if (!activeMatchupData || !Array.isArray(activeMatchupData.competitors)) return;
    activeMatchupData.competitors.forEach((c, i) => {
        const nameEl = $(`matchup-comp-name-${i}`);
        const tagEl = $(`matchup-comp-tag-${i}`);
        if (nameEl) c.name = nameEl.value.trim() || `Player ${i + 1}`;
        if (tagEl) c.tag = tagEl.value.trim();
    });
}

let nameDebounceTimer = null;
export function updateCompetitorNameImmediate(index, name) {
    if (!activeMatchupData || !activeMatchupData.competitors[index]) return;
    activeMatchupData.competitors[index].name = name;
    clearTimeout(nameDebounceTimer);
    nameDebounceTimer = setTimeout(() => {
        saveMatchupSettings();
    }, 600);
}

export function updateCompetitorTagImmediate(index, tag) {
    if (!activeMatchupData || !activeMatchupData.competitors[index]) return;
    activeMatchupData.competitors[index].tag = tag;
    clearTimeout(nameDebounceTimer);
    nameDebounceTimer = setTimeout(() => {
        saveMatchupSettings();
    }, 600);
}

export async function updateCompetitorColor(index, color) {
    if (isTournamentMatchActive()) {
        const activeMatch = getTourneyActiveMatch();
        if (activeMatch) {
            const entrantName = index === 0 ? (activeMatch.entrant1?.name || activeMatch.entrants?.[0]) : (activeMatch.entrant2?.name || activeMatch.entrants?.[1]);
            try {
                const res = await fetch('/api/tournament/score', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ matchId: activeMatch.id, entrant: entrantName, color })
                });
                const data = await res.json();
                if (data.status === 'ok') {
                    setActiveTourneyData(data.tournament);
                    if (window.renderTournamentStudio) window.renderTournamentStudio(activeTourneyData);
                    if (activeMatchupData) renderMatchupStudio(activeMatchupData);
                    return;
                }
            } catch (e) {
                console.error('Failed to update tournament entrant color:', e);
            }
        }
    }
    if (!activeMatchupData || !activeMatchupData.competitors[index]) return;
    activeMatchupData.competitors[index].color = color;
    saveMatchupSettings();
}

export async function stepMatchupRound(index, roundDelta) {
    if (isTournamentMatchActive()) {
        const activeMatch = getTourneyActiveMatch();
        if (!activeMatch) return;
        const entrantName = index === 0 ? (activeMatch.entrant1?.name || activeMatch.entrants?.[0]) : (activeMatch.entrant2?.name || activeMatch.entrants?.[1]);
        try {
            const res = await fetch('/api/tournament/score', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ matchId: activeMatch.id, entrant: entrantName, roundDelta })
            });
            const data = await res.json();
            if (data.status === 'ok') {
                setActiveTourneyData(data.tournament);
                if (window.renderTournamentStudio) window.renderTournamentStudio(activeTourneyData);
                if (activeMatchupData) renderMatchupStudio(activeMatchupData);
            }
        } catch {
            toast('Error updating tournament rounds');
        }
        return;
    }
    try {
        const res = await fetch('/api/matchup/score', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ index, roundDelta }) });
        const data = await res.json();
        if (data.status === 'ok') renderMatchupStudio(data.matchup);
    } catch { toast('Error updating round'); }
}

export async function setMatchupRoundDirect(index, roundVal) {
    const rounds = Math.max(0, parseInt(roundVal, 10) || 0);
    if (isTournamentMatchActive()) {
        const activeMatch = getTourneyActiveMatch();
        if (!activeMatch) return;
        const entrantName = index === 0 ? (activeMatch.entrant1?.name || activeMatch.entrants?.[0]) : (activeMatch.entrant2?.name || activeMatch.entrants?.[1]);
        try {
            const res = await fetch('/api/tournament/score', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ matchId: activeMatch.id, entrant: entrantName, rounds })
            });
            const data = await res.json();
            if (data.status === 'ok') {
                setActiveTourneyData(data.tournament);
                if (window.renderTournamentStudio) window.renderTournamentStudio(activeTourneyData);
                if (activeMatchupData) renderMatchupStudio(activeMatchupData);
            }
        } catch {
            toast('Error setting tournament rounds');
        }
        return;
    }
    try {
        const res = await fetch('/api/matchup/score', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ index, rounds })
        });
        const data = await res.json();
        if (data.status === 'ok') renderMatchupStudio(data.matchup);
    } catch {
        toast('Error setting round');
    }
}

export async function stepMatchupScore(index, delta) {
    if (isTournamentMatchActive()) {
        if (window.stepTourneyScore) await window.stepTourneyScore(index + 1, delta);
        if (activeMatchupData) renderMatchupStudio(activeMatchupData);
        return;
    }
    try {
        const res = await fetch('/api/matchup/score', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ index, delta })
        });
        const data = await res.json();
        if (data.status === 'ok') {
            renderMatchupStudio(data.matchup);
            if (data.matchup.status === 'COMPLETED' && data.matchup.winner) {
                toast(`Set won by ${data.matchup.winner}!`);
            }
        }
    } catch {
        toast('Error updating score');
    }
}

export async function setMatchupScoreDirect(index, scoreVal) {
    if (isTournamentMatchActive()) {
        if (window.setTourneyScoreDirect) await window.setTourneyScoreDirect(index + 1, scoreVal);
        if (activeMatchupData) renderMatchupStudio(activeMatchupData);
        return;
    }
    const score = Math.max(0, parseInt(scoreVal, 10) || 0);
    try {
        const res = await fetch('/api/matchup/score', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ index, score })
        });
        const data = await res.json();
        if (data.status === 'ok') {
            renderMatchupStudio(data.matchup);
        }
    } catch {
        toast('Error setting score');
    }
}

export async function changeMatchupCompetitorCount(countVal) {
    const count = parseInt(countVal, 10) || 2;
    try {
        const res = await fetch('/api/matchup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ competitorCount: count })
        });
        const data = await res.json();
        if (data.status === 'ok') {
            renderMatchupStudio(data.matchup);
            toast(`Updated to ${count} competitors`);
        }
    } catch {
        toast('Error updating competitor count');
    }
}

export async function changeMatchupFormat(fmtVal) {
    const targetRow = $('matchup-custom-target-row');
    let format = 'bestOf';
    let bestOf = 5;
    let targetScore = 3;

    if (fmtVal === 'points') {
        format = 'points';
        bestOf = 0;
        targetScore = 0;
        if (targetRow) targetRow.style.display = 'none';
    } else if (fmtVal.startsWith('bestOf-')) {
        format = 'bestOf';
        bestOf = parseInt(fmtVal.replace('bestOf-', ''), 10) || 5;
        targetScore = Math.ceil(bestOf / 2);
        if (targetRow) targetRow.style.display = 'none';
    } else if (fmtVal === 'firstTo-10') {
        format = 'firstTo';
        targetScore = 10;
        bestOf = 0;
        if (targetRow) targetRow.style.display = 'none';
    } else if (fmtVal === 'firstTo-custom') {
        format = 'firstTo';
        targetScore = parseInt($('matchup-target-input').value, 10) || 5;
        bestOf = 0;
        if (targetRow) targetRow.style.display = 'block';
    }

    if (isTournamentMatchActive()) {
        try {
            const tRes = await fetch('/api/tournament/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    scoringType: format,
                    bestOf,
                    targetScore
                })
            });
            const tData = await tRes.json();
            if (tData.status === 'ok') {
                setActiveTourneyData(tData.tournament);
                if (window.renderTournamentStudio) window.renderTournamentStudio(activeTourneyData);
            }
        } catch {}
    }

    try {
        const res = await fetch('/api/matchup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ format, bestOf, targetScore })
        });
        const data = await res.json();
        if (data.status === 'ok') {
            renderMatchupStudio(data.matchup);
        }
    } catch {
        toast('Error updating format');
    }
}

export async function saveMatchupSettings() {
    if (!activeMatchupData) return;
    syncCompetitorsFromDom();
    const payload = {
        title: ($('matchup-title')?.value || '').trim(),
        phase: ($('matchup-phase')?.value || '').trim(),
        details: ($('matchup-details')?.value || '').trim(),
        competitors: activeMatchupData.competitors
    };
    payload.roundsBestOf = parseInt($('matchup-rounds')?.value, 10) || 0;
    const fmtVal = $('matchup-format')?.value || 'bestOf-5';
    if (fmtVal === 'firstTo-custom') {
        payload.targetScore = parseInt($('matchup-target-input')?.value, 10) || 5;
    }

    if (isTournamentMatchActive()) {
        try {
            const tSettings = {
                title: payload.title,
                roundsBestOf: payload.roundsBestOf
            };
            if (fmtVal === 'firstTo-custom' && payload.targetScore) {
                tSettings.scoringType = 'firstTo';
                tSettings.bestOf = 0;
                tSettings.targetScore = payload.targetScore;
            }
            const tRes = await fetch('/api/tournament/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(tSettings)
            });
            const tData = await tRes.json();
            if (tData.status === 'ok') {
                setActiveTourneyData(tData.tournament);
                if (window.renderTournamentStudio) window.renderTournamentStudio(activeTourneyData);
            }
        } catch (e) {
            console.warn('Failed to sync settings to active tournament:', e);
        }
    }

    try {
        const res = await fetch('/api/matchup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.status === 'ok') {
            renderMatchupStudio(data.matchup);
        }
    } catch {
        toast('Error saving matchup');
    }
}

export async function swapMatchupSides() {
    syncCompetitorsFromDom();
    await saveMatchupSettings();
    try {
        const res = await fetch('/api/matchup/swap', { method: 'POST' });
        const data = await res.json();
        if (data.status === 'ok') {
            renderMatchupStudio(data.matchup);
            toast('Swapped P1 ⇄ P2');
        }
    } catch {
        toast('Error swapping sides');
    }
}

export async function resetMatchupScores() {
    if (!confirm('Reset current scores back to 0-0?')) return;
    if (isTournamentMatchActive()) {
        const activeMatch = getTourneyActiveMatch();
        if (!activeMatch) return;
        try {
            const res = await fetch('/api/tournament/score', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ matchId: activeMatch.id, entrant1Score: 0, entrant2Score: 0, entrant1Rounds: 0, entrant2Rounds: 0 })
            });
            const data = await res.json();
            if (data.status === 'ok') {
                setActiveTourneyData(data.tournament);
                if (window.renderTournamentStudio) window.renderTournamentStudio(activeTourneyData);
                if (activeMatchupData) renderMatchupStudio(activeMatchupData);
                toast('Tournament match scores reset to 0-0');
            }
        } catch {
            toast('Error resetting match scores');
        }
        return;
    }
    try {
        const res = await fetch('/api/matchup/reset-scores', { method: 'POST' });
        const data = await res.json();
        if (data.status === 'ok') {
            renderMatchupStudio(data.matchup);
            toast('Scores reset to 0-0');
        }
    } catch {
        toast('Error resetting scores');
    }
}

export function renderMatchupQueue(queue, activeQueueIndex) {
    const container = $('matchup-queue-container');
    if (!container) return;

    if (!queue || queue.length === 0) {
        container.innerHTML = `
            <div style="padding: 1rem; text-align: center; color: var(--text-muted); background: var(--bg-inset); border-radius: 6px; font-size: 0.78rem;">
                No matches in the fight card queue. Add matches to step through an exhibition card or tournament schedule.
            </div>
        `;
        return;
    }

    container.innerHTML = queue.map((item, idx) => {
        const isActive = idx === activeQueueIndex;
        const c1 = (item.competitors && item.competitors[0]) || { name: 'Player 1', score: 0 };
        const c2 = (item.competitors && item.competitors[1]) || { name: 'Player 2', score: 0 };
        const isCompleted = item.status === 'COMPLETED';

        let statusBadge = '';
        if (isActive) statusBadge = '<span class="matchup-queue-status live">Live Now</span>';
        else if (isCompleted) statusBadge = '<span class="matchup-queue-status completed">Done</span>';
        else statusBadge = '<span class="matchup-queue-status upcoming">Queued</span>';

        return `
            <div class="matchup-queue-item${isActive ? ' active' : ''}">
                <div class="matchup-queue-meta">
                    <span class="matchup-queue-idx">#${idx + 1}</span>
                    <div style="display: flex; flex-direction: column; min-width: 0;">
                        <div style="display: flex; align-items: center; gap: 0.4rem;">
                            <span style="font-size: 0.75rem; font-weight: 700; color: ${isActive ? 'var(--accent)' : 'var(--text)'};">
                                ${esc(item.title || 'Exhibition Match')}
                            </span>
                            ${item.phase ? `<span style="font-size: 0.7rem; color: var(--text-muted);">· ${esc(item.phase)}</span>` : ''}
                            ${statusBadge}
                        </div>
                        <div class="matchup-queue-names">
                            <span>${esc(c1.name)}${c1.tag ? ` <span class="matchup-queue-tag">(${esc(c1.tag)})</span>` : ''}</span>
                            <span style="color: var(--text-muted); font-size: 0.75rem; font-weight: 800;">${c1.score ?? 0} — ${c2.score ?? 0}</span>
                            <span>${esc(c2.name)}${c2.tag ? ` <span class="matchup-queue-tag">(${esc(c2.tag)})</span>` : ''}</span>
                        </div>
                    </div>
                </div>
                <div style="display: flex; align-items: center; gap: 0.35rem;">
                    ${!isActive ? `
                        <button type="button" class="btn-secondary btn-sm" onclick="selectMatchupQueue('${item.id}')" title="Load this match to overlay">
                            Load
                        </button>
                    ` : ''}
                    <button type="button" class="btn-secondary btn-sm" onclick="duplicateMatchupQueue('${item.id}')" title="Duplicate match in fight card">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                    </button>
                    <button type="button" class="btn-secondary btn-sm" onclick="deleteMatchupQueue('${item.id}')" title="Delete from fight card">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

export function toggleAddMatchupQueueModal(show) {
    const drawer = $('matchup-add-queue-drawer');
    if (drawer) drawer.style.display = show ? 'block' : 'none';
}

export async function submitAddMatchupQueue() {
    const title = ($('queue-add-title')?.value || '').trim() || 'Exhibition Match';
    const phase = ($('queue-add-phase')?.value || '').trim() || 'Match';
    const p1Name = ($('queue-add-p1-name')?.value || '').trim() || 'Player 1';
    const p1Tag = ($('queue-add-p1-tag')?.value || '').trim();
    const p2Name = ($('queue-add-p2-name')?.value || '').trim() || 'Player 2';
    const p2Tag = ($('queue-add-p2-tag')?.value || '').trim();
    const loadImmediately = $('queue-add-load-now')?.checked || false;

    const newMatch = {
        title,
        phase,
        competitors: [
            { name: p1Name, tag: p1Tag, score: 0 },
            { name: p2Name, tag: p2Tag, score: 0 }
        ]
    };

    try {
        const res = await fetch('/api/matchup/queue', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ match: newMatch, loadImmediately })
        });
        const data = await res.json();
        if (data.status === 'ok') {
            if ($('queue-add-title')) $('queue-add-title').value = '';
            if ($('queue-add-phase')) $('queue-add-phase').value = '';
            if ($('queue-add-p1-name')) $('queue-add-p1-name').value = '';
            if ($('queue-add-p1-tag')) $('queue-add-p1-tag').value = '';
            if ($('queue-add-p2-name')) $('queue-add-p2-name').value = '';
            if ($('queue-add-p2-tag')) $('queue-add-p2-tag').value = '';
            toggleAddMatchupQueueModal(false);
            if (data.matchup) {
                if (loadImmediately) showLoadedExhibition(data.matchup);
                else renderMatchupStudio(data.matchup);
            }
            toast('Match added to fight card!');
        }
    } catch {
        toast('Error adding match to queue');
    }
}

export async function selectMatchupQueue(id) {
    try {
        const res = await fetch('/api/matchup/queue/select', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
        });
        const data = await res.json();
        if (data.status === 'ok') {
            showLoadedExhibition(data.matchup);
            toast('Loaded fight from queue');
        }
    } catch {
        toast('Error selecting queue match');
    }
}

export async function stepMatchupQueue(direction) {
    const endpoint = direction > 0 ? '/api/matchup/queue/next' : '/api/matchup/queue/prev';
    try {
        const res = await fetch(endpoint, { method: 'POST' });
        const data = await res.json();
        if (data.status === 'ok') {
            showLoadedExhibition(data.matchup);
            toast(direction > 0 ? 'Advanced to next match' : 'Returned to previous match');
        }
    } catch {
        toast('Error stepping queue');
    }
}

export async function deleteMatchupQueue(id) {
    try {
        const res = await fetch(`/api/matchup/queue/${encodeURIComponent(id)}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.status === 'ok') {
            loadMatchup();
            toast('Match removed from queue');
        }
    } catch {
        toast('Error deleting match');
    }
}

export async function duplicateMatchupQueue(id) {
    try {
        const res = await fetch('/api/matchup/queue/duplicate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
        });
        const data = await res.json();
        if (data.status === 'ok') {
            loadMatchup();
            toast('Match duplicated in queue');
        } else toast(data.error || 'Failed to duplicate match');
    } catch {
        toast('Error duplicating match');
    }
}

export async function clearMatchupQueue() {
    if (!confirm('Clear all queued matches in the fight card?')) return;
    try {
        const res = await fetch('/api/matchup/queue', { method: 'DELETE' });
        const data = await res.json();
        if (data.status === 'ok') {
            loadMatchup();
            toast('Fight card queue cleared');
        }
    } catch {
        toast('Error clearing queue');
    }
}

export function renderMatchupPresets(presets = []) {
    setActiveMatchupPresetsList(presets);
    const list = $('matchup-presets-list');
    if (!list) return;

    const filtered = presets.filter(p => matchCategory(p, activePresetsCategory));
    if (!filtered || filtered.length === 0) {
        list.innerHTML = `<div style="padding: 0.75rem; text-align: center; color: var(--text-muted); font-size: 0.8rem;">No matchup presets found in this category.</div>`;
        return;
    }

    list.innerHTML = filtered.map(p => `
        <div style="background: var(--bg-inset); border: 1px solid var(--border); border-radius: 6px; padding: 0.6rem 0.85rem; display: flex; justify-content: space-between; align-items: center;">
            <div>
                <div style="font-size: 0.82rem; font-weight: 700; color: var(--text);">${esc(p.name)}</div>
                <div style="font-size: 0.72rem; color: var(--text-muted);">
                    ${esc(p.title)} · ${p.competitors ? p.competitors.map(c => c.name).join(' vs ') : 'Competitors'}
                </div>
            </div>
            <div style="display: flex; gap: 0.35rem;">
                <button type="button" class="btn-primary btn-sm" onclick="loadMatchupPreset('${p.id}')">
                    Load
                </button>
                <button type="button" class="btn-secondary btn-sm" onclick="deleteMatchupPreset('${p.id}')">
                    &times;
                </button>
            </div>
        </div>
    `).join('');
}

export async function saveCurrentMatchupAsPreset() {
    if (!activeMatchupData) return;
    syncCompetitorsFromDom();
    await saveMatchupSettings();
    const currentTitle = $('matchup-title')?.value.trim() || activeMatchupData.title || 'Matchup';
    const currentPhase = $('matchup-phase')?.value.trim() || activeMatchupData.phase || 'Set';
    const name = prompt('Preset Name:', `${currentTitle} — ${currentPhase}`);
    if (!name) return;

    try {
        const res = await fetch('/api/matchup/presets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name,
                title: currentTitle,
                phase: currentPhase,
                details: $('matchup-details')?.value.trim() || activeMatchupData.details,
                format: activeMatchupData.format,
                bestOf: activeMatchupData.bestOf,
                targetScore: activeMatchupData.targetScore,
                competitorCount: activeMatchupData.competitors ? activeMatchupData.competitors.length : 2,
                competitors: activeMatchupData.competitors
            })
        });
        const data = await res.json();
        if (data.status === 'ok') {
            renderMatchupPresets(data.presets);
            toast('Saved preset!');
        }
    } catch {
        toast('Error saving preset');
    }
}

export async function loadMatchupPreset(id) {
    try {
        const res = await fetch('/api/matchup/presets/load', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
        });
        const data = await res.json();
        if (data.status === 'ok') {
            showLoadedExhibition(data.matchup);
            if (window.switchTab) window.switchTab('matchup');
            toast('Loaded preset!');
        }
    } catch {
        toast('Error loading preset');
    }
}

export async function deleteMatchupPreset(id) {
    if (!confirm('Delete this preset?')) return;
    try {
        const res = await fetch(`/api/matchup/presets/${encodeURIComponent(id)}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.status === 'ok') {
            renderMatchupPresets(data.presets);
            toast('Deleted preset');
        }
    } catch {
        toast('Error deleting preset');
    }
}

export async function loadMatchupPresetById(presetId) {
    await loadMatchupPreset(presetId);
}

export async function applyMatchupQuickChip(key) {
    if (window.switchTab) window.switchTab('matchup');
    let payload = null;
    if (key === 'sf6-ft10') {
        payload = {
            title: 'Street Fighter 6',
            phase: 'Grand Finals (FT10)',
            details: 'First to 10 · Metro City Decider',
            format: 'firstTo',
            targetScore: 10,
            competitorCount: 2,
            competitors: [
                { id: 'c1', name: 'Daigo', tag: 'Ken', color: '#ef4444', score: 0 },
                { id: 'c2', name: 'Justin Wong', tag: 'Chun-Li', color: '#3b82f6', score: 0 }
            ]
        };
    } else if (key === 'tekken-bo5') {
        payload = {
            title: 'Tekken 8',
            phase: 'Winners Finals',
            details: 'Best of 5 · Colosseum',
            format: 'bestOf',
            bestOf: 5,
            targetScore: 3,
            competitorCount: 2,
            competitors: [
                { id: 'c1', name: 'Jin Kazama', tag: 'Mishima', color: '#ef4444', score: 0 },
                { id: 'c2', name: 'Kazuya Mishima', tag: 'Devil', color: '#8b5cf6', score: 0 }
            ]
        };
    } else if (key === 'smash-bo3') {
        payload = {
            title: 'Super Smash Bros Ultimate',
            phase: 'Semifinals',
            details: 'Best of 3 · Battlefield · 3 Stock',
            format: 'bestOf',
            bestOf: 3,
            targetScore: 2,
            competitorCount: 2,
            competitors: [
                { id: 'c1', name: 'Fox', tag: 'Sparg0', color: '#f59e0b', score: 0 },
                { id: 'c2', name: 'Falco', tag: 'MkLeo', color: '#3b82f6', score: 0 }
            ]
        };
    } else if (key === 'mariokart-4p') {
        payload = {
            title: 'Mario Kart 8 Deluxe',
            phase: 'Grand Prix 150cc',
            details: '4 Races · Open Score Tally',
            format: 'points',
            targetScore: 0,
            competitorCount: 4,
            competitors: [
                { id: 'c1', name: 'Mario', tag: 'Pipe Frame', color: '#ef4444', score: 0 },
                { id: 'c2', name: 'Luigi', tag: 'Mach 8', color: '#10b981', score: 0 },
                { id: 'c3', name: 'Peach', tag: 'Cat Cruiser', color: '#ec4899', score: 0 },
                { id: 'c4', name: 'Bowser', tag: 'Badwagon', color: '#f59e0b', score: 0 }
            ]
        };
    } else if (key === 'speedrun-1v1') {
        payload = {
            title: 'Retro Speedrun Race',
            phase: 'Head-to-Head 1v1',
            details: 'Any% Glitchless · Best of 3',
            format: 'bestOf',
            bestOf: 3,
            targetScore: 2,
            competitorCount: 2,
            competitors: [
                { id: 'c1', name: 'Runner One', tag: 'PB: 18:42', color: '#3b82f6', score: 0 },
                { id: 'c2', name: 'Runner Two', tag: 'PB: 18:49', color: '#10b981', score: 0 }
            ]
        };
    } else if (key === 'rocketleague-3v3') {
        payload = {
            title: 'Rocket League Championship',
            phase: 'Championship Series',
            details: '3v3 Standard · Best of 5',
            format: 'bestOf',
            bestOf: 5,
            targetScore: 3,
            competitorCount: 2,
            competitors: [
                { id: 'c1', name: 'Blue Squad', tag: 'Home', color: '#3b82f6', score: 0 },
                { id: 'c2', name: 'Orange Team', tag: 'Away', color: '#f97316', score: 0 }
            ]
        };
    }

    if (!payload) return;
    try {
        const res = await fetch('/api/matchup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.status === 'ok') {
            showLoadedExhibition(data.matchup);
            toast(`Loaded template: ${payload.title}!`);
        }
    } catch {
        toast('Error loading template');
    }
}

export async function loadMatchupHistory() {
    try {
        const res = await fetch('/api/matchup/history');
        const data = await res.json();
        if (data.status === 'ok') {
            renderMatchupHistory(data.history || []);
        }
    } catch { /* ignore */ }
}

export function renderMatchupHistory(history = []) {
    const list = $('matchup-history-list');
    if (!list) return;

    if (!history || history.length === 0) {
        list.innerHTML = `<div style="padding: 1rem; text-align: center; color: var(--text-muted); font-size: 0.8rem; background: var(--bg-inset); border-radius: 6px;">No past matchups recorded. Finished fight sets will appear here.</div>`;
        return;
    }

    list.innerHTML = history.map(item => {
        const date = item.timestamp ? new Date(item.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Recently';
        const competitorsText = (item.competitors || []).map(c => `${c.name} (${c.score})`).join(' vs ');

        return `
            <div class="history-card">
                <div style="display: flex; justify-content: space-between; align-items: center; gap: 0.5rem;">
                    <div>
                        <div style="display: flex; align-items: center; gap: 0.45rem;">
                            <span style="font-size: 0.85rem; font-weight: 800; color: var(--text);">${esc(item.title || 'Matchup')}</span>
                            ${item.phase ? `<span style="font-size: 0.72rem; color: var(--text-muted);">· ${esc(item.phase)}</span>` : ''}
                            ${item.winner ? `<span class="badge-pill" style="background: rgba(34, 197, 94, 0.15); color: #22c55e; border: 1px solid rgba(34, 197, 94, 0.3); font-size: 0.65rem;">Winner: ${esc(item.winner)}</span>` : ''}
                        </div>
                        <div style="font-size: 0.78rem; font-weight: 700; color: var(--text); margin-top: 0.2rem;">
                            ${esc(competitorsText)}
                        </div>
                        <div style="font-size: 0.7rem; color: var(--text-muted); margin-top: 0.15rem;">
                            ${item.status === 'IN_PROGRESS' ? 'Saved in progress' : 'Completed'} ${date}
                        </div>
                        ${(item.competitors || []).some(c => c.timer && c.timer.finishTime) ? `<div style="font-size: 0.7rem; color: var(--text-muted); margin-top: 0.15rem;">${(item.competitors || []).filter(c => c.timer && c.timer.finishTime).map(c => esc(c.name) + ' ' + esc(c.timer.finishTime)).join(' · ')}</div>` : ''}
                        ${(item.log || []).length ? `<details style="margin-top:0.3rem;"><summary style="font-size:0.7rem;color:var(--text-muted);cursor:pointer;">Event log (${item.log.length})</summary><div style="font-size:0.7rem;color:var(--text-muted);max-height:140px;overflow:auto;margin-top:0.25rem;">${item.log.map(l => `<div>${new Date(l.ts).toLocaleTimeString()} &middot; ${esc(l.text)}</div>`).join('')}</div></details>` : ''}
                    </div>
                    <div style="display: flex; gap: 0.35rem; align-items: center;">
                        <button type="button" class="btn-primary btn-sm" onclick="restoreMatchupFromHistory('${item.id}')" title="Restore this matchup to active scoreboard">
                            Restore
                        </button>
                        <button type="button" class="btn-secondary btn-sm" onclick="deleteMatchupHistoryItem('${item.id}')" title="Delete record">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

export async function saveMatchupProgress() {
    try {
        const res = await fetch('/api/matchup/history/snapshot', { method: 'POST' });
        const data = await res.json();
        if (data.status === 'ok') { toast('Progress saved to History'); loadMatchupHistory(); }
    } catch { toast('Error saving progress'); }
}

export async function restoreMatchupFromHistory(id) {
    try {
        const res = await fetch('/api/matchup/history/restore', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
        });
        const data = await res.json();
        if (data.status === 'ok') {
            showLoadedExhibition(data.matchup);
            if (window.switchTab) window.switchTab('matchup');
            toast('Matchup restored to live scoreboard!');
        }
    } catch {
        toast('Error restoring matchup');
    }
}

export async function deleteMatchupHistoryItem(id) {
    try {
        const res = await fetch(`/api/matchup/history/${encodeURIComponent(id)}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.status === 'ok') {
            renderMatchupHistory(data.history || []);
            toast('Matchup record deleted');
        }
    } catch {
        toast('Error deleting matchup history');
    }
}

export async function clearAllMatchupHistory() {
    if (!confirm('Clear all matchup history?')) return;
    try {
        const res = await fetch('/api/matchup/history/clear', { method: 'POST' });
        const data = await res.json();
        if (data.status === 'ok') {
            renderMatchupHistory([]);
            toast('Matchup history cleared');
        }
    } catch {
        toast('Error clearing matchup history');
    }
}

'use strict';

import { api, esc, toast } from '../shared/client-core.js';
import { OP_ICONS } from './operator-icons.js';
import { registerCardType, registerOperatorModule } from './operator-registry.js';
import { isEditLocked } from './operator-state.js';

function undoToast(message, undoFn) {
    if (typeof window.opUndoToast === 'function') {
        window.opUndoToast(message, undoFn);
    } else {
        toast(message, 'info');
    }
}

function getActiveTourneyMatch(tournament) {
    if (!tournament || tournament.status === 'COMPLETED' || !Array.isArray(tournament.matches)) return null;
    const playable = tournament.matches.filter(m => m.entrant1?.name && m.entrant2?.name && m.entrant1.name !== 'BYE' && m.entrant2.name !== 'BYE');
    if (!playable.length) return null;
    if (tournament.activeMatchId) {
        const active = playable.find(m => m.id === tournament.activeMatchId);
        if (active) return active;
    }
    return playable.find(m => !m.winner) || playable[0];
}

function renderPips(count, target) {
    if (target <= 0) return '';
    return Array.from({ length: target }, (_, idx) => (idx < count ? '◆' : '◇')).join(' ');
}

function formatClockDisplay(clock, extraElapsedSec = 0) {
    if (!clock) return '0:00';
    if (clock.mode === 'countdown') {
        const secs = Math.max(0, Math.ceil((Number(clock.remaining) || 0) - extraElapsedSec));
        if (secs < 100 && (Number(clock.duration) || 0) <= 99) return String(secs);
        const m = Math.floor(secs / 60);
        const s = secs % 60;
        return `${m}:${String(s).padStart(2, '0')}`;
    }
    const total = Math.max(0, (Number(clock.elapsed) || 0) + extraElapsedSec);
    const hrs = Math.floor(total / 3600);
    const mins = Math.floor((total % 3600) / 60);
    const secs = Math.floor(total % 60);
    if (hrs > 0) return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function matchupStructureSig(m) {
    if (!m) return '';
    return JSON.stringify({
        title: m.title,
        phase: m.phase,
        format: m.format,
        bestOf: m.bestOf,
        targetScore: m.targetScore,
        roundsBestOf: m.roundsBestOf,
        clockEnabled: m.clock?.enabled !== false,
        clockMode: m.clock?.mode,
        clockDuration: m.clock?.duration,
        competitors: (m.competitors || []).map(c => [c.id, c.name, c.tag, c.color, c.score, c.rounds])
    });
}

async function fetchVersusState() {
    const [mRes, tRes] = await Promise.all([
        api('/api/matchup').catch(() => ({ matchup: null })),
        api('/api/tournament').catch(() => ({ tournament: null }))
    ]);
    return {
        matchup: mRes?.matchup || null,
        tournament: tRes?.tournament || null
    };
}

function mountVersusWidget(el, { fullView = false } = {}) {
    let sourceMode = 'auto'; // 'auto' | 'exhibition'
    let latestState = { matchup: null, tournament: null };
    let lastSig = '';
    let clockSyncedAt = Date.now();
    let tickTimer = null;

    const stopTicker = () => {
        if (tickTimer) {
            clearInterval(tickTimer);
            tickTimer = null;
        }
    };

    const patchClockDom = () => {
        const clk = latestState.matchup?.clock;
        if (!clk || clk.enabled === false) {
            stopTicker();
            return;
        }
        const extraSec = clk.isRunning ? Math.max(0, (Date.now() - clockSyncedAt) / 1000) : 0;
        const readout = el.querySelector('[data-vs-clock-readout]');
        if (readout) {
            readout.textContent = formatClockDisplay(clk, extraSec);
            readout.classList.toggle('is-live', Boolean(clk.isRunning));
        }
        const toggleBtn = el.querySelector('[data-vs-clock="toggle"]');
        if (toggleBtn) {
            toggleBtn.textContent = clk.isRunning
                ? (clk.mode === 'race' ? 'Pause All' : 'Pause Clock')
                : (clk.mode === 'race' ? 'Start All' : 'Start Clock');
            toggleBtn.classList.toggle('primary', !clk.isRunning);
        }
    };

    const syncTicker = () => {
        const clk = latestState.matchup?.clock;
        const activeMatch = getActiveTourneyMatch(latestState.tournament);
        const useTourney = Boolean(activeMatch) && sourceMode !== 'exhibition';
        if (useTourney || !clk || clk.enabled === false || !clk.isRunning) {
            stopTicker();
            return;
        }
        if (!tickTimer) {
            tickTimer = setInterval(() => {
                if (document.hidden) return;
                patchClockDom();
            }, 250);
        }
    };

    const drawFromState = () => {
        const { matchup, tournament } = latestState;
        const activeMatch = getActiveTourneyMatch(tournament);
        const useTourney = Boolean(activeMatch) && sourceMode !== 'exhibition';
        const readOnly = isEditLocked();

        if (useTourney) {
            stopTicker();
            lastSig = 'tourney';
            const playable = (tournament.matches || []).filter(m => m.entrant1?.name && m.entrant2?.name && m.entrant1.name !== 'BYE' && m.entrant2.name !== 'BYE');
            const roundsBestOf = Number(activeMatch.roundsBestOf ?? tournament.roundsBestOf ?? 0) || 0;
            const roundTarget = roundsBestOf > 0 ? Math.ceil(roundsBestOf / 2) : 0;
            const e1 = activeMatch.entrant1 || { name: 'Player 1', score: 0, rounds: 0 };
            const e2 = activeMatch.entrant2 || { name: 'Player 2', score: 0, rounds: 0 };
            const s1 = Number(e1.score) || 0;
            const s2 = Number(e2.score) || 0;
            const leader = s1 > s2 ? e1.name : (s2 > s1 ? e2.name : '');

            el.innerHTML = `
                <div style="display:grid;gap:.65rem;">
                    <div class="op-panel-row" style="flex-wrap:wrap;gap:.4rem;">
                        <div style="display:flex;align-items:center;gap:.4rem;flex-wrap:wrap;">
                            <span class="op-pill is-live">Tournament</span>
                            <strong style="font-size:.84rem;">${esc(tournament.title || 'Tournament')}</strong>
                            <span class="op-pill">${esc(activeMatch.roundName || `Round ${activeMatch.round || 1}`)}</span>
                        </div>
                        <div class="op-btn-row">
                            ${playable.length > 1 ? `<select class="op-profile-select" style="max-width:210px;" data-vs-t-select="1" aria-label="Select tournament match">
                                ${playable.map(m => `<option value="${esc(m.id)}"${m.id === activeMatch.id ? ' selected' : ''}>${esc(m.roundName || `R${m.round}`)}: ${esc(m.entrant1?.name)} vs ${esc(m.entrant2?.name)}${m.winner ? ' [Done]' : ''}</option>`).join('')}
                            </select>` : ''}
                            <button type="button" class="op-btn sm" data-vs-source="exhibition" title="Switch to Exhibition Matchup">Exhibition</button>
                        </div>
                    </div>
                    <div style="display:grid;grid-template-columns:1fr auto 1fr;gap:.6rem;align-items:center;text-align:center;">
                        ${[e1, e2].map((ent, idx) => `
                            ${idx === 1 ? '<div style="font-size:.72rem;font-weight:800;color:var(--text-muted);">VS</div>' : ''}
                            <div style="display:grid;gap:.35rem;padding:.55rem;border:1px solid var(--border);border-radius:8px;background:var(--bg-inset);">
                                <strong style="font-size:.84rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${esc(ent.name)}">${esc(ent.name)}</strong>
                                <div style="font-size:1.6rem;font-weight:800;font-variant-numeric:tabular-nums;line-height:1;">${Number(ent.score) || 0}</div>
                                ${readOnly ? '' : `<div class="op-btn-row" style="justify-content:center;">
                                    <button type="button" class="op-btn sm" data-vs-t-score="${esc(ent.name)}" data-delta="-1">-1</button>
                                    <button type="button" class="op-btn sm primary" data-vs-t-score="${esc(ent.name)}" data-delta="1">+1</button>
                                </div>`}
                                ${roundTarget > 0 ? `<div style="border-top:1px solid var(--border);padding-top:.35rem;margin-top:.15rem;display:grid;gap:.25rem;">
                                    <span style="font-size:.66rem;text-transform:uppercase;color:var(--text-muted);font-weight:700;">Rounds (${Number(ent.rounds) || 0}/${roundTarget})</span>
                                    <span style="font-size:.76rem;color:#fbbf24;letter-spacing:.1em;">${renderPips(Number(ent.rounds) || 0, roundTarget)}</span>
                                    ${readOnly ? '' : `<div class="op-btn-row" style="justify-content:center;">
                                        <button type="button" class="op-btn sm" data-vs-t-round="${esc(ent.name)}" data-delta="-1">R-</button>
                                        <button type="button" class="op-btn sm" data-vs-t-round="${esc(ent.name)}" data-delta="1">R+</button>
                                    </div>`}
                                </div>` : ''}
                            </div>
                        `).join('')}
                    </div>
                    ${readOnly ? '' : `<div class="op-panel-row" style="flex-wrap:wrap;gap:.4rem;">
                        <label style="display:inline-flex;align-items:center;gap:.35rem;font-size:.74rem;color:var(--text-muted);">
                            Rounds
                            <select class="op-profile-select" style="min-width:90px;max-width:125px;" data-vs-t-rounds-cfg="1">
                                <option value="0"${roundsBestOf === 0 ? ' selected' : ''}>Off</option>
                                <option value="3"${roundsBestOf === 3 ? ' selected' : ''}>Bo3 (FT2)</option>
                                <option value="5"${roundsBestOf === 5 ? ' selected' : ''}>Bo5 (FT3)</option>
                                <option value="7"${roundsBestOf === 7 ? ' selected' : ''}>Bo7 (FT4)</option>
                            </select>
                        </label>
                        <div class="op-btn-row">
                            <button type="button" class="op-btn sm primary" data-vs-t-advance="${esc(leader)}" ${leader && !activeMatch.winner ? '' : 'disabled'}>Advance ${leader ? esc(leader) : 'Winner'}</button>
                        </div>
                    </div>`}
                </div>`;
            return;
        }

        const m = matchup || { title: 'Exhibition Match', phase: '', roundsBestOf: 0, competitors: [] };
        lastSig = matchupStructureSig(m);
        const comps = Array.isArray(m.competitors) && m.competitors.length
            ? m.competitors
            : [{ id: 'c1', name: 'Player 1', score: 0, rounds: 0 }, { id: 'c2', name: 'Player 2', score: 0, rounds: 0 }];
        const roundsBestOf = Number(m.roundsBestOf) || 0;
        const roundTarget = roundsBestOf > 0 ? Math.ceil(roundsBestOf / 2) : 0;
        const clock = m.clock || { enabled: false, mode: 'countdown', duration: 99, remaining: 99, elapsed: 0, isRunning: false };
        const clockEnabled = clock.enabled !== false && clock.mode && clock.mode !== 'none';
        const isRunning = Boolean(clock.isRunning);
        const clockPresetValue = !clockEnabled
            ? 'none'
            : (clock.mode === 'countdown' && Number(clock.duration) === 60 ? 'countdown:60'
                : clock.mode === 'countdown' ? `countdown:${Number(clock.duration) || 99}`
                    : clock.mode);

        el.innerHTML = `
            <div style="display:grid;gap:.65rem;">
                <div class="op-panel-row" style="flex-wrap:wrap;gap:.4rem;">
                    <div style="display:flex;align-items:center;gap:.4rem;flex-wrap:wrap;">
                        <strong style="font-size:.86rem;">${esc(m.title || 'Matchup Scoreboard')}</strong>
                        ${m.phase ? `<span class="op-pill">${esc(m.phase)}</span>` : ''}
                        ${m.format === 'bestOf' && m.bestOf ? `<span class="op-pill">Bo${Number(m.bestOf)}</span>` : ''}
                        ${m.format === 'firstTo' && m.targetScore ? `<span class="op-pill">FT${Number(m.targetScore)}</span>` : ''}
                    </div>
                    <div class="op-btn-row">
                        ${activeMatch ? '<button type="button" class="op-btn sm" data-vs-source="auto">Tournament Mode</button>' : ''}
                        ${!readOnly ? `<select class="op-profile-select" style="min-width:96px;max-width:130px;" data-vs-m-rounds-cfg="1" aria-label="Rounds per game">
                            <option value="0"${roundsBestOf === 0 ? ' selected' : ''}>Rounds: Off</option>
                            <option value="3"${roundsBestOf === 3 ? ' selected' : ''}>Rounds: Bo3</option>
                            <option value="5"${roundsBestOf === 5 ? ' selected' : ''}>Rounds: Bo5</option>
                            <option value="7"${roundsBestOf === 7 ? ' selected' : ''}>Rounds: Bo7</option>
                        </select>` : ''}
                    </div>
                </div>
                <div style="display:grid;grid-template-columns:repeat(${comps.length === 2 ? 2 : (fullView ? comps.length : 2)},minmax(0,1fr));gap:.55rem;text-align:center;">
                    ${comps.map((c, idx) => `
                        <div style="display:grid;gap:.32rem;padding:.55rem;border:1px solid var(--border);border-top:3px solid ${esc(c.color || 'var(--accent)')};border-radius:8px;background:var(--bg-inset);">
                            <div style="min-width:0;">
                                <strong style="display:block;font-size:.84rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${esc(c.name || `Player ${idx + 1}`)}">${esc(c.name || `Player ${idx + 1}`)}</strong>
                                ${c.tag ? `<span style="font-size:.7rem;color:var(--text-muted);">${esc(c.tag)}</span>` : ''}
                            </div>
                            <div style="font-size:1.6rem;font-weight:800;font-variant-numeric:tabular-nums;line-height:1;">${Number(c.score) || 0}</div>
                            ${readOnly ? '' : `<div class="op-btn-row" style="justify-content:center;">
                                <button type="button" class="op-btn sm" data-vs-m-score="${idx}" data-delta="-1">-1</button>
                                <button type="button" class="op-btn sm primary" data-vs-m-score="${idx}" data-delta="1">+1</button>
                            </div>`}
                            ${roundTarget > 0 ? `<div style="border-top:1px solid var(--border);padding-top:.32rem;margin-top:.12rem;display:grid;gap:.22rem;">
                                <span style="font-size:.66rem;text-transform:uppercase;color:var(--text-muted);font-weight:700;">Rounds (${Number(c.rounds) || 0}/${roundTarget})</span>
                                <span style="font-size:.76rem;color:#fbbf24;letter-spacing:.1em;">${renderPips(Number(c.rounds) || 0, roundTarget)}</span>
                                ${readOnly ? '' : `<div class="op-btn-row" style="justify-content:center;">
                                    <button type="button" class="op-btn sm" data-vs-m-round="${idx}" data-delta="-1">R-</button>
                                    <button type="button" class="op-btn sm" data-vs-m-round="${idx}" data-delta="1">R+</button>
                                </div>`}
                            </div>` : ''}
                        </div>
                    `).join('')}
                </div>
                <div class="op-panel-row" style="flex-wrap:wrap;gap:.45rem;padding-top:.35rem;border-top:1px solid var(--border);">
                    <div class="op-btn-row" style="flex-wrap:wrap;">
                        ${clockEnabled ? `<span class="op-pill ${isRunning ? 'is-live' : ''}" data-vs-clock-readout="1" style="font-family:monospace;font-weight:800;font-size:.84rem;min-width:46px;justify-content:center;">${esc(formatClockDisplay(clock, 0))}</span>
                        ${readOnly ? '' : `<button type="button" class="op-btn sm ${isRunning ? '' : 'primary'}" data-vs-clock="toggle">${isRunning ? (clock.mode === 'race' ? 'Pause All' : 'Pause Clock') : (clock.mode === 'race' ? 'Start All' : 'Start Clock')}</button>
                        <button type="button" class="op-btn sm" data-vs-clock="reset">${clock.mode === 'race' ? 'Reset All' : 'Reset Clock'}</button>`}` : '<span class="op-pill">Clock Off</span>'}
                        ${readOnly ? '' : `<select class="op-profile-select" style="min-width:96px;max-width:130px;" data-vs-clock-preset="1" aria-label="Clock preset">
                            <option value="none"${clockPresetValue === 'none' ? ' selected' : ''}>Clock: Off</option>
                            <option value="countdown:99"${clockPresetValue === 'countdown:99' ? ' selected' : ''}>99s Countdown</option>
                            <option value="countdown:60"${clockPresetValue === 'countdown:60' ? ' selected' : ''}>60s Countdown</option>
                            <option value="stopwatch"${clockPresetValue === 'stopwatch' ? ' selected' : ''}>Stopwatch</option>
                            <option value="race"${clockPresetValue === 'race' ? ' selected' : ''}>Race</option>
                        </select>`}
                    </div>
                    ${readOnly ? '' : `<div class="op-btn-row">
                        ${comps.length === 2 ? '<button type="button" class="op-btn sm" data-vs-m-act="swap">Swap</button>' : ''}
                        <button type="button" class="op-btn sm" data-vs-m-act="reset-scores">Reset Scores</button>
                    </div>`}
                </div>
            </div>`;
        syncTicker();
    };

    const refresh = async () => {
        try {
            latestState = await fetchVersusState();
            clockSyncedAt = Date.now();
            drawFromState();
        } catch (err) {
            el.innerHTML = `<div style="color:#f87171;font-size:.8rem;">${esc(err.message)}</div>`;
        }
    };

    const applySocketUpdate = (type, payload) => {
        if ((type === 'matchup-update' || type === 'matchup') && payload && typeof payload === 'object') {
            latestState.matchup = payload;
            clockSyncedAt = Date.now();
            const nextSig = matchupStructureSig(payload);
            if (nextSig === lastSig && lastSig !== 'tourney') {
                patchClockDom();
                syncTicker();
                return;
            }
            drawFromState();
            return;
        }
        if ((type === 'tournament-update' || type === 'tournament') && payload && typeof payload === 'object') {
            latestState.tournament = payload;
            drawFromState();
            return;
        }
        refresh();
    };

    const onClick = async e => {
        const srcBtn = e.target.closest('[data-vs-source]');
        if (srcBtn) {
            sourceMode = srcBtn.dataset.vsSource;
            drawFromState();
            return;
        }
        if (isEditLocked()) return;

        const tScore = e.target.closest('[data-vs-t-score]');
        if (tScore) {
            const match = getActiveTourneyMatch(latestState.tournament);
            if (!match) return;
            try {
                await api('/api/tournament/score', 'POST', { matchId: match.id, entrant: tScore.dataset.vsTScore, delta: Number(tScore.dataset.delta) || 1 });
                refresh();
            } catch (err) { toast(err.message, 'error'); }
            return;
        }
        const tRound = e.target.closest('[data-vs-t-round]');
        if (tRound) {
            const match = getActiveTourneyMatch(latestState.tournament);
            if (!match) return;
            try {
                await api('/api/tournament/score', 'POST', { matchId: match.id, entrant: tRound.dataset.vsTRound, roundDelta: Number(tRound.dataset.delta) || 1 });
                refresh();
            } catch (err) { toast(err.message, 'error'); }
            return;
        }
        const tAdv = e.target.closest('[data-vs-t-advance]');
        if (tAdv && tAdv.dataset.vsTAdvance) {
            const match = getActiveTourneyMatch(latestState.tournament);
            if (!match) return;
            try {
                await api('/api/tournament/advance', 'POST', { matchId: match.id, winner: tAdv.dataset.vsTAdvance });
                toast(`Advanced ${tAdv.dataset.vsTAdvance}`, 'success');
                refresh();
            } catch (err) { toast(err.message, 'error'); }
            return;
        }

        const mScore = e.target.closest('[data-vs-m-score]');
        if (mScore) {
            try {
                const res = await api('/api/matchup/score', 'POST', { index: Number(mScore.dataset.vsMScore), delta: Number(mScore.dataset.delta) || 1 });
                if (res?.matchup) { latestState.matchup = res.matchup; drawFromState(); }
                else refresh();
            } catch (err) { toast(err.message, 'error'); }
            return;
        }
        const mRound = e.target.closest('[data-vs-m-round]');
        if (mRound) {
            try {
                const res = await api('/api/matchup/score', 'POST', { index: Number(mRound.dataset.vsMRound), roundDelta: Number(mRound.dataset.delta) || 1 });
                if (res?.matchup) { latestState.matchup = res.matchup; drawFromState(); }
                else refresh();
            } catch (err) { toast(err.message, 'error'); }
            return;
        }
        const clkBtn = e.target.closest('[data-vs-clock]');
        if (clkBtn) {
            const act = clkBtn.dataset.vsClock;
            const clk = latestState.matchup?.clock || {};
            try {
                let res;
                if (clk.mode === 'race') {
                    const ep = act === 'reset'
                        ? '/api/matchup/clock/race/reset-all'
                        : (clk.isRunning ? '/api/matchup/clock/race/pause-all' : '/api/matchup/clock/race/start-all');
                    res = await api(ep, 'POST', {});
                } else if (act === 'reset') {
                    res = await api('/api/matchup/clock/reset', 'POST', {});
                } else if (clk.isRunning) {
                    res = await api('/api/matchup/clock/pause', 'POST', {});
                } else {
                    // Auto-reset expired countdown before starting so Start always runs
                    if (clk.mode === 'countdown' && (Number(clk.remaining) || 0) <= 0) {
                        await api('/api/matchup/clock/reset', 'POST', {});
                    }
                    res = await api('/api/matchup/clock/start', 'POST', {});
                }
                if (res?.matchup) {
                    latestState.matchup = res.matchup;
                    clockSyncedAt = Date.now();
                    patchClockDom();
                    syncTicker();
                } else {
                    await refresh();
                }
            } catch (err) { toast(err.message, 'error'); }
            return;
        }
        const actBtn = e.target.closest('[data-vs-m-act]');
        if (actBtn) {
            const act = actBtn.dataset.vsMAct;
            try {
                if (act === 'swap') {
                    const res = await api('/api/matchup/swap', 'POST', {});
                    if (res?.matchup) { latestState.matchup = res.matchup; drawFromState(); }
                    else refresh();
                } else if (act === 'reset-scores') {
                    const before = latestState.matchup ? JSON.parse(JSON.stringify(latestState.matchup.competitors || [])) : null;
                    const res = await api('/api/matchup/reset-scores', 'POST', {});
                    if (before) {
                        undoToast('Reset Versus scores', async () => {
                            await api('/api/matchup', 'POST', { competitors: before });
                            refresh();
                        });
                    }
                    if (res?.matchup) { latestState.matchup = res.matchup; drawFromState(); }
                    else refresh();
                }
            } catch (err) { toast(err.message, 'error'); }
        }
    };

    const onChange = async e => {
        const selMatch = e.target.closest('[data-vs-t-select]');
        if (selMatch) {
            try {
                await api('/api/tournament/select-match', 'POST', { matchId: selMatch.value });
                refresh();
            } catch (err) { toast(err.message, 'error'); }
            return;
        }
        if (isEditLocked()) return;
        const tRounds = e.target.closest('[data-vs-t-rounds-cfg]');
        if (tRounds) {
            try {
                await api('/api/tournament/settings', 'POST', { roundsBestOf: Number(tRounds.value) || 0 });
                refresh();
            } catch (err) { toast(err.message, 'error'); }
            return;
        }
        const mRounds = e.target.closest('[data-vs-m-rounds-cfg]');
        if (mRounds) {
            try {
                const res = await api('/api/matchup', 'POST', { roundsBestOf: Number(mRounds.value) || 0 });
                if (res?.matchup) { latestState.matchup = res.matchup; drawFromState(); }
                else refresh();
            } catch (err) { toast(err.message, 'error'); }
            return;
        }
        const clkPreset = e.target.closest('[data-vs-clock-preset]');
        if (clkPreset) {
            const raw = clkPreset.value;
            const body = raw === 'none'
                ? { enabled: false }
                : raw.startsWith('countdown:')
                    ? { enabled: true, mode: 'countdown', duration: Number(raw.split(':')[1]) || 99 }
                    : { enabled: true, mode: raw };
            try {
                const res = await api('/api/matchup/clock/set', 'POST', body);
                if (res?.matchup) { latestState.matchup = res.matchup; clockSyncedAt = Date.now(); drawFromState(); }
                else refresh();
            } catch (err) { toast(err.message, 'error'); }
        }
    };

    el.addEventListener('click', onClick);
    el.addEventListener('change', onChange);
    el._opRefresh = refresh;
    el._opSocket = applySocketUpdate;
    el._opCleanup = () => {
        stopTicker();
        el.removeEventListener('click', onClick);
        el.removeEventListener('change', onChange);
    };
    refresh();
}

registerCardType({
    type: 'versus-quick',
    moduleId: 'versus',
    label: 'Versus Match Score',
    description: 'Live Versus / Tournament scoreboard controls with Scores, Rounds, Clock, Swap, and Reset.',
    iconSvg: OP_ICONS.versus,
    isEnabled: status => status?.modules?.versus !== false && status?.modules?.matchup !== false,
    mount(el) {
        mountVersusWidget(el, { fullView: false });
    },
    onSocket(el, card, type, payload) {
        if (['matchup', 'matchup-update', 'tournament', 'tournament-update'].includes(type)) {
            el._opSocket?.(type, payload);
        }
    },
    unmount(el) { el._opCleanup?.(); }
});

(() => {
    let mountedBody = null;
    registerOperatorModule({
        id: 'versus',
        label: 'Versus',
        iconSvg: OP_ICONS.versus,
        order: 60,
        isEnabled: status => status?.modules?.versus !== false && status?.modules?.matchup !== false,
        async mount(container) {
            if (mountedBody) {
                try { mountedBody._opCleanup?.(); } catch { /* ignore */ }
            }
            container.innerHTML = `
                <div class="op-domain-stack">
                    <section class="op-toolbar" aria-label="Versus controls">
                        <div class="op-toolbar-left">
                            <span style="display:inline-flex;align-items:center;gap:.45rem;font-weight:700;font-size:.9rem;">${OP_ICONS.versus} Versus</span>
                            <span style="font-size:.78rem;color:var(--text-muted);">Live scoreboard controls &amp; active tournament match scoring.</span>
                        </div>
                        <div class="op-toolbar-right">
                            <a class="op-btn sm" href="/versus.html">Open Versus Studio</a>
                        </div>
                    </section>
                    <section class="op-panel" style="max-width:860px;">
                        <div class="op-panel-body" data-versus-domain-host="1"></div>
                    </section>
                </div>`;
            mountedBody = container.querySelector('[data-versus-domain-host]');
            if (mountedBody) mountVersusWidget(mountedBody, { fullView: true });
        },
        unmount() {
            if (mountedBody) {
                try { mountedBody._opCleanup?.(); } catch { /* ignore */ }
                mountedBody = null;
            }
        },
        onSocket(type, payload) {
            if (['matchup', 'matchup-update', 'tournament', 'tournament-update'].includes(type)) {
                mountedBody?._opSocket?.(type, payload);
            }
        }
    });
})();

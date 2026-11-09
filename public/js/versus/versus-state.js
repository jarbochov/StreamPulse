/**
 * StreamPulse — Versus Studio State & API Client
 */

export const $ = id => document.getElementById(id);
export const esc = s => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function toast(msg) {
    const t = $('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2400);
}

export function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function fmtStudioMs(sec) {
    const t = Math.max(0, sec || 0), w = Math.floor(t), p = n => String(n).padStart(2, '0');
    const h = Math.floor(w / 3600), m = Math.floor((w % 3600) / 60);
    return `${h > 0 ? h + ':' + p(m) : p(m)}:${p(w % 60)}.${p(Math.floor(t * 100) % 100)}`;
}

// Global state variables
export let activeTourneyData = null;
export function setActiveTourneyData(val) { activeTourneyData = val; }

export let activeMatchupData = null;
export function setActiveMatchupData(val) { activeMatchupData = val; }

export let activeTab = 'tourney';
export function setActiveTab(val) { activeTab = val; }

export let previewMode = 'matchup';
export function setPreviewModeState(val) { previewMode = val; }

export let previewUseSample = true;
export function setPreviewUseSampleState(val) { previewUseSample = val; }

export let previewBackdrop = 'dark';
export function setPreviewBackdropState(val) { previewBackdrop = val; }

export let tourneyFitWholeBracket = false;
export function setTourneyFitWholeBracketState(val) { tourneyFitWholeBracket = val; }

export let currentViewportW = 1100;
export function setCurrentViewportW(val) { currentViewportW = val; }

export let currentViewportH = 100;
export function setCurrentViewportH(val) { currentViewportH = val; }

export let matchupSourceMode = 'auto'; // 'auto' | 'tournament' | 'exhibition'
export function setMatchupSourceMode(val) { matchupSourceMode = val; }

export let lastMatchupSig = '';
export function setLastMatchupSig(val) { lastMatchupSig = val; }

export let tourneyStudioViewMode = 'single'; // 'single' | 'multi'
export function setTourneyStudioViewModeState(val) { tourneyStudioViewMode = val; }

export let activeMatchupPresetsList = [];
export function setActiveMatchupPresetsList(val) { activeMatchupPresetsList = val; }

export let activeTourneyPresetsList = [];
export function setActiveTourneyPresetsList(val) { activeTourneyPresetsList = val; }

export let activePresetsCategory = 'all';
export function setActivePresetsCategory(val) { activePresetsCategory = val; }

export let currentDraftsList = [];
export function setCurrentDraftsList(val) { currentDraftsList = val; }

export let currentInspectedTournament = null;
export function setCurrentInspectedTournament(val) { currentInspectedTournament = val; }

export let activeThemeModalTarget = 'matchup';
export function setActiveThemeModalTarget(val) { activeThemeModalTarget = val; }

export let activeFontPickerTarget = 'matchup';
export function setActiveFontPickerTarget(val) { activeFontPickerTarget = val; }

export let cachedAssetFontsList = [];
export function setCachedAssetFontsList(val) { cachedAssetFontsList = val; }

export let studioClockTicker = null;
export function setStudioClockTicker(val) { studioClockTicker = val; }

export let isRestoringVersusPrefs = false;
export function setIsRestoringVersusPrefs(val) { isRestoringVersusPrefs = val; }

// Domain helper rules
export function tournamentMatchRules(match, tournament) {
    const bestOf = match.bestOf ?? tournament.bestOf ?? 3;
    return {
        bestOf,
        target: match.targetScore ?? tournament.targetScore ?? (bestOf > 0 ? Math.ceil(bestOf / 2) : 0),
        roundsBestOf: match.roundsBestOf ?? tournament.roundsBestOf ?? 0
    };
}

export function isTournamentMatchActive() {
    const mode = (typeof window !== 'undefined' && window.matchupSourceMode) || matchupSourceMode;
    if (mode === 'exhibition') return false;
    if (!activeTourneyData) return false;
    const m = getTourneyActiveMatch();
    return Boolean(m && !m.isBye);
}

export function getTourneyActiveMatch() {
    if (!activeTourneyData || !Array.isArray(activeTourneyData.matches)) return null;
    return activeTourneyData.matches.find(m => m.id === activeTourneyData.activeMatchId) ||
           activeTourneyData.matches.find(m => !m.isBye && !m.winner && m.status !== 'COMPLETED') ||
           activeTourneyData.matches.find(m => !m.isBye);
}

export function showLoadedExhibition(matchup) {
    if (!matchup) return;
    setMatchupSourceMode('exhibition');
    if (window.renderMatchupStudio) window.renderMatchupStudio(matchup);
}

export async function triggerLiveTourneyView(opts) {
    try {
        const res = await fetch('/api/tournament/view', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(opts)
        });
        const data = await res.json();
        if (data.status === 'ok') {
            const iframe = $('tourney-preview-iframe');
            if (iframe && iframe.contentWindow) {
                iframe.contentWindow.postMessage({ type: 'tournament-view', data: data.view }, '*');
            }
            if (data.view?.focus !== undefined) {
                const label = $('btn-live-focus-label');
                if (label) label.textContent = data.view.focus ? 'Focus: ON' : 'Focus: OFF';
            }
            if (data.view?.bracket && $('live-bracket-section-select')) {
                $('live-bracket-section-select').value = data.view.bracket;
            }
            toast('Updated live bracket camera');
        }
    } catch {
        toast('Error updating bracket camera view');
    }
}

export async function loadMatchup() {
    try {
        const res = await fetch('/api/matchup');
        if (res.ok) {
            const data = await res.json();
            setActiveMatchupData(data.matchup);
            if (window.renderMatchupStudio) window.renderMatchupStudio(activeMatchupData);
            setActiveMatchupPresetsList(activeMatchupData.presets || []);
            if (window.renderMatchupPresets) window.renderMatchupPresets(activeMatchupPresetsList);
        }
    } catch (err) {
        console.warn('Error loading matchup:', err);
    }
}

export async function loadTournament() {
    try {
        const res = await fetch('/api/tournament');
        if (res.ok) {
            const data = await res.json();
            setActiveTourneyData(data.tournament);
            if (window.renderTournamentStudio) window.renderTournamentStudio(activeTourneyData);
            if (activeMatchupData && window.renderMatchupStudio) window.renderMatchupStudio(activeMatchupData);
            if (window.loadTournamentDrafts) window.loadTournamentDrafts();
        }
    } catch (err) {
        console.warn('Error loading tournament:', err);
    }
}

export function connectWs() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${location.host}/ws`);

    ws.onmessage = (event) => {
        try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'tournament-update') {
                setActiveTourneyData(msg.data);
                if (window.renderTournamentStudio) window.renderTournamentStudio(activeTourneyData);
                if (activeMatchupData && window.renderMatchupStudio) window.renderMatchupStudio(activeMatchupData);
            } else if (msg.type === 'matchup-update') {
                const d = msg.data;
                const sig = JSON.stringify(d, (k, v) => (k === 'elapsed' || k === 'remaining' || k === 'startedAt' || k === 'estimate') ? undefined : v);
                const same = sig === lastMatchupSig;
                setLastMatchupSig(sig);
                setActiveMatchupData(d);
                if (same) {
                    if (d && d.clock && window.syncClockStudioUi) window.syncClockStudioUi(d.clock);
                } else {
                    if (window.renderMatchupStudio) window.renderMatchupStudio(d);
                }
            }
        } catch { /* ignore */ }
    };

    ws.onclose = () => setTimeout(connectWs, 2000);
}

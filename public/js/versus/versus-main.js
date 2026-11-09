/**
 * StreamPulse — Versus Studio Main Orchestrator & Window Exports
 */

import * as State from './versus-state.js';
import * as Preview from './versus-preview.js';
import * as Matchup from './versus-matchup.js';
import * as Bracket from './versus-bracket.js';

const {
    $,
    activeTourneyData,
    activeMatchupData,
    activeTab,
    setActiveTab,
    previewMode,
    setPreviewModeState,
    tourneyStudioViewMode,
    setTourneyStudioViewModeState,
    loadMatchup,
    loadTournament,
    connectWs
} = State;

const {
    applyViewportScale,
    setPreviewMode,
    updateMatchupOverlayUrl,
    updateTourneyOverlayUrl,
    restoreVersusOverlayPrefs,
    populateFontDatalist,
    populateThemeDropdowns
} = Preview;

export function switchTab(tab) {
    setActiveTab(tab);
    try { localStorage.setItem('versus-active-tab', tab); } catch {}
    $('tab-btn-tourney')?.classList.toggle('active', tab === 'tourney');
    $('tab-btn-matchup')?.classList.toggle('active', tab === 'matchup');
    $('tab-btn-overlays')?.classList.toggle('active', tab === 'overlays');
    $('tab-btn-presets')?.classList.toggle('active', tab === 'presets');
    $('tab-btn-history')?.classList.toggle('active', tab === 'history');

    if ($('panel-tourney')) $('panel-tourney').style.display = tab === 'tourney' ? 'block' : 'none';
    if ($('panel-matchup')) $('panel-matchup').style.display = tab === 'matchup' ? 'block' : 'none';
    if ($('panel-overlays')) $('panel-overlays').style.display = tab === 'overlays' ? 'block' : 'none';
    if ($('panel-presets')) $('panel-presets').style.display = tab === 'presets' ? 'block' : 'none';
    if ($('panel-history')) $('panel-history').style.display = tab === 'history' ? 'block' : 'none';

    if (tab === 'overlays') {
        const savedPreview = localStorage.getItem('versus-overlay-tab') || State.previewMode || 'matchup';
        setPreviewMode(savedPreview);
        applyViewportScale();
    } else if (tab === 'presets') {
        Bracket.loadTournamentPresets();
        loadMatchup();
    } else if (tab === 'history') {
        Bracket.loadTournamentHistory();
        Matchup.loadMatchupHistory();
    }
}

export function switchMatchupSubtab(tabName) {
    const tabs = ['layout', 'typography', 'colors', 'toggles'];
    tabs.forEach(t => {
        const btn = $('btn-matchup-subtab-' + t);
        const panel = $('matchup-subpanel-' + t);
        if (btn) btn.classList.toggle('active', t === tabName);
        if (panel) panel.style.display = (t === tabName) ? 'block' : 'none';
    });
    try { localStorage.setItem('sp-versus-matchup-subtab', tabName); } catch {}
}

export function switchTourneySubtab(tabName) {
    const tabs = ['layout', 'typography', 'colors', 'elements'];
    tabs.forEach(t => {
        const btn = $('btn-tourney-subtab-' + t);
        const panel = $('tourney-subpanel-' + t);
        if (btn) btn.classList.toggle('active', t === tabName);
        if (panel) panel.style.display = (t === tabName) ? 'block' : 'none';
    });
    try { localStorage.setItem('sp-versus-tourney-subtab', tabName); } catch {}
}

// Consolidate all methods onto window for inline onclick handlers and test fixture compatibility
const versusApp = {
    ...State,
    ...Preview,
    ...Matchup,
    ...Bracket,
    switchTab,
    switchMatchupSubtab,
    switchTourneySubtab
};

window.versusApp = versusApp;
Object.assign(window, versusApp);

const dynamicVars = [
    ['matchupSourceMode', State.setMatchupSourceMode],
    ['activeMatchupData', State.setActiveMatchupData],
    ['activeTourneyData', State.setActiveTourneyData],
    ['tourneyStudioViewMode', State.setTourneyStudioViewModeState],
    ['previewMode', State.setPreviewModeState],
    ['previewBackdrop', State.setPreviewBackdropState],
    ['previewUseSample', State.setPreviewUseSampleState],
    ['tourneyFitWholeBracket', State.setTourneyFitWholeBracketState],
    ['currentViewportW', State.setCurrentViewportW],
    ['currentViewportH', State.setCurrentViewportH],
    ['activeTab', State.setActiveTab]
];

dynamicVars.forEach(([prop, setter]) => {
    Object.defineProperty(window, prop, {
        get() { return State[prop]; },
        set(val) { setter(val); },
        configurable: true
    });
});

// Initialize window resize listener for live viewport scaling
window.addEventListener('resize', applyViewportScale);

// Bootstrap
function init() {
    const baseUrl = window.location.origin;
    if ($('url-matchup-overlay')) $('url-matchup-overlay').value = `${baseUrl}/overlays/matchup.html`;
    if ($('url-tourney-overlay')) $('url-tourney-overlay').value = `${baseUrl}/overlays/tournament.html`;

    populateFontDatalist();
    populateThemeDropdowns();
    restoreVersusOverlayPrefs();
    setPreviewMode(State.previewMode);

    try {
        const savedMatchupSubtab = localStorage.getItem('sp-versus-matchup-subtab') || 'layout';
        switchMatchupSubtab(savedMatchupSubtab);
        const savedTourneySubtab = localStorage.getItem('sp-versus-tourney-subtab') || 'layout';
        switchTourneySubtab(savedTourneySubtab);
    } catch {}

    loadMatchup();
    loadTournament();
    Bracket.loadTournamentDrafts();
    Bracket.loadTournamentPresets();
    updateMatchupOverlayUrl();
    updateTourneyOverlayUrl();
    applyViewportScale();
    connectWs();

    try {
        const savedViewMode = localStorage.getItem('versus-tourney-view-mode');
        if (savedViewMode === 'multi' || savedViewMode === 'single') {
            setTourneyStudioViewModeState(savedViewMode);
        }
        const saved = localStorage.getItem('versus-active-tab');
        if (saved && $('tab-btn-' + saved)) switchTab(saved);
        else switchTab('matchup');
    } catch {}
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

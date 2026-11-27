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
    const tabs = ['tourney', 'matchup', 'overlays', 'presets', 'history'];
    tabs.forEach(t => {
        const btn = $(`tab-btn-${t}`);
        if (btn) {
            const isActive = tab === t;
            btn.classList.toggle('active', isActive);
            btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
        }
    });

    if ($('panel-tourney')) $('panel-tourney').style.display = tab === 'tourney' ? 'block' : 'none';
    if ($('panel-matchup')) $('panel-matchup').style.display = tab === 'matchup' ? 'block' : 'none';
    if ($('panel-overlays')) $('panel-overlays').style.display = tab === 'overlays' ? 'block' : 'none';
    if ($('panel-presets')) $('panel-presets').style.display = tab === 'presets' ? 'block' : 'none';
    if ($('panel-history')) $('panel-history').style.display = tab === 'history' ? 'block' : 'none';

    Matchup.setMatchupMiniPreviewIdle(tab !== 'matchup');

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

// Matchup live keyboard shortcuts
function handleMatchupKeydown(e) {
    if (State.activeTab !== 'matchup') return;
    if (!Matchup.isMatchupHotkeysEnabled()) return;

    const target = e.target;
    if (target && target.nodeType === 1) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) {
            return;
        }
    }

    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && String(e.key || '').toLowerCase() === 'z') {
        e.preventDefault();
        Matchup.undoLastMatchupAction();
        return;
    }

    if (e.metaKey || e.ctrlKey || e.altKey) return;

    switch (e.code) {
        case 'KeyQ':
            e.preventDefault();
            Matchup.stepMatchupScore(0, 1);
            break;
        case 'KeyA':
            e.preventDefault();
            Matchup.stepMatchupScore(0, -1);
            break;
        case 'KeyP':
            e.preventDefault();
            Matchup.stepMatchupScore(1, 1);
            break;
        case 'KeyL':
            e.preventDefault();
            Matchup.stepMatchupScore(1, -1);
            break;
        case 'KeyS':
            e.preventDefault();
            Matchup.swapMatchupSides();
            break;
        case 'Space': {
            const clk = State.activeMatchupData?.clock;
            if (clk && clk.enabled !== false) {
                e.preventDefault();
                if (clk.mode === 'race') {
                    if (clk.isRunning) Matchup.pauseAllRunnersRace();
                    else Matchup.startAllRunnersRace();
                } else {
                    Matchup.toggleMatchClock();
                }
            }
            break;
        }
        default:
            break;
    }
}

document.addEventListener('keydown', handleMatchupKeydown);

// Bootstrap
function init() {
    const baseUrl = window.location.origin;
    if ($('url-matchup-overlay')) $('url-matchup-overlay').value = `${baseUrl}/overlays/matchup.html`;
    if ($('url-tourney-overlay')) $('url-tourney-overlay').value = `${baseUrl}/overlays/tournament.html`;

    populateFontDatalist();
    populateThemeDropdowns();
    restoreVersusOverlayPrefs();
    if (window.WizardVariableBinder) {
        window.WizardVariableBinder.mount({
            storageKey: 'streampulse_versus_overlay_vars_v1',
            onChange: () => {
                updateMatchupOverlayUrl();
                updateTourneyOverlayUrl();
            },
            bindings: [
                { id: 'matchup-opt-heading-font', param: 'headingfont', kind: 'font', label: 'Matchup Title Font', overlays: ['matchup'] },
                { id: 'matchup-opt-font', param: 'font', kind: 'font', label: 'Matchup Body Font', overlays: ['matchup'] },
                { id: 'matchup-opt-weight', param: 'weight', kind: 'number', label: 'Matchup Font Weight', overlays: ['matchup'] },
                { id: 'matchup-opt-radius', param: 'radius', kind: 'number', label: 'Matchup Corner Radius', overlays: ['matchup'] },
                { id: 'matchup-opt-outline', param: 'outline', kind: 'text', label: 'Matchup Text Outline', overlays: ['matchup'] },
                { id: 'matchup-opt-scale', param: 'scale', kind: 'number', label: 'Matchup Font Scale', overlays: ['matchup'] },
                { id: 'matchup-opt-width', param: 'width', kind: 'number', label: 'Matchup Max Width', overlays: ['matchup'] },
                { id: 'matchup-opt-gap', param: 'gap', kind: 'number', label: 'Matchup Gap', overlays: ['matchup'] },
                { id: 'matchup-opt-accent', param: 'accent', kind: 'color', label: 'Matchup Accent Color', overlays: ['matchup'] },
                { id: 'matchup-opt-badgecolor', param: 'badgecolor', kind: 'color', label: 'Matchup Badge Color', overlays: ['matchup'] },
                { id: 'matchup-opt-text', param: 'text', kind: 'color', label: 'Matchup Text Color', overlays: ['matchup'] },
                { id: 'matchup-opt-muted', param: 'muted', kind: 'color', label: 'Matchup Muted Color', overlays: ['matchup'] },
                { id: 'matchup-opt-cardbg', param: 'cardbg', kind: 'color', label: 'Matchup Card Background', overlays: ['matchup'] },
                { id: 'matchup-opt-bg', param: 'bg', kind: 'color', label: 'Matchup Page Background', overlays: ['matchup'] },
                { id: 'matchup-opt-border', param: 'border', kind: 'color', label: 'Matchup Border Color', overlays: ['matchup'] },
                { id: 'matchup-opt-winner', param: 'winner', kind: 'color', label: 'Matchup Winner Color', overlays: ['matchup'] },
                { id: 'matchup-opt-p1color', param: 'p1color', kind: 'color', label: 'Matchup Player 1 Color', overlays: ['matchup'] },
                { id: 'matchup-opt-p2color', param: 'p2color', kind: 'color', label: 'Matchup Player 2 Color', overlays: ['matchup'] },
                { id: 'tourney-opt-heading-font', param: 'headingfont', kind: 'font', label: 'Bracket Title Font', overlays: ['tourney'] },
                { id: 'tourney-opt-font', param: 'font', kind: 'font', label: 'Bracket Body Font', overlays: ['tourney'] },
                { id: 'tourney-opt-scale', param: 'scale', kind: 'number', label: 'Bracket Font Scale', overlays: ['tourney'] },
                { id: 'tourney-opt-weight', param: 'weight', kind: 'number', label: 'Bracket Font Weight', overlays: ['tourney'] },
                { id: 'tourney-opt-radius', param: 'radius', kind: 'number', label: 'Bracket Corner Radius', overlays: ['tourney'] },
                { id: 'tourney-opt-outline', param: 'outline', kind: 'text', label: 'Bracket Text Outline', overlays: ['tourney'] },
                { id: 'tourney-opt-gap', param: 'gap', kind: 'number', label: 'Bracket Gap', overlays: ['tourney'] },
                { id: 'tourney-opt-logosize', param: 'logosize', kind: 'number', label: 'Bracket Logo Size', overlays: ['tourney'] },
                { id: 'tourney-opt-accent', param: 'accent', kind: 'color', label: 'Bracket Accent Color', overlays: ['tourney'] },
                { id: 'tourney-opt-badgecolor', param: 'badgecolor', kind: 'color', label: 'Bracket Badge Color', overlays: ['tourney'] },
                { id: 'tourney-opt-p1color', param: 'p1color', kind: 'color', label: 'Bracket Player 1 Color', overlays: ['tourney'] },
                { id: 'tourney-opt-p2color', param: 'p2color', kind: 'color', label: 'Bracket Player 2 Color', overlays: ['tourney'] },
                { id: 'tourney-opt-text', param: 'text', kind: 'color', label: 'Bracket Text Color', overlays: ['tourney'] },
                { id: 'tourney-opt-muted', param: 'muted', kind: 'color', label: 'Bracket Muted Color', overlays: ['tourney'] },
                { id: 'tourney-opt-cardbg', param: 'cardbg', kind: 'color', label: 'Bracket Card Background', overlays: ['tourney'] },
                { id: 'tourney-opt-bg', param: 'bg', kind: 'color', label: 'Bracket Page Background', overlays: ['tourney'] },
                { id: 'tourney-opt-border', param: 'border', kind: 'color', label: 'Bracket Border Color', overlays: ['tourney'] },
                { id: 'tourney-opt-winner', param: 'winner', kind: 'color', label: 'Bracket Winner Color', overlays: ['tourney'] }
            ]
        });
    }
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

    // Initialize Matchup hotkeys toggle, undo button, roster datalist, and mini-preview
    const hotkeysCb = $('matchup-hotkeys-enabled');
    if (hotkeysCb) {
        hotkeysCb.checked = Matchup.isMatchupHotkeysEnabled();
        if (!hotkeysCb.getAttribute('onchange')) {
            hotkeysCb.addEventListener('change', () => Matchup.toggleMatchupHotkeys(hotkeysCb.checked));
        }
    }
    Matchup.syncMatchupUndoButton();
    Matchup.renderVersusRosterUi();
    if ($('queue-add-p1-name')) $('queue-add-p1-name').setAttribute('list', 'versus-roster-datalist');
    if ($('queue-add-p2-name')) $('queue-add-p2-name').setAttribute('list', 'versus-roster-datalist');

    const miniDetails = $('matchup-mini-preview-details');
    if (miniDetails) {
        let savedMiniOpen = false;
        try { savedMiniOpen = localStorage.getItem('sp-versus-mini-preview') === '1'; } catch {}
        Matchup.toggleMatchupMiniPreview(savedMiniOpen);
        if (!miniDetails.getAttribute('ontoggle')) {
            miniDetails.addEventListener('toggle', () => Matchup.toggleMatchupMiniPreview(miniDetails.open));
        }
    }

    // Initialize Bracket seed/BYE live preview and file import listener
    const entrantsTextarea = $('tourney-entrants-text') || $('tourney-entrants');
    if (entrantsTextarea) {
        entrantsTextarea.addEventListener('input', Bracket.updateTourneySeedPreview);
    }
    if ($('tourney-rr-legs')) {
        $('tourney-rr-legs').addEventListener('change', Bracket.updateTourneySeedPreview);
    }
    const importFileEl = $('tourney-import-file');
    if (importFileEl && !importFileEl.getAttribute('onchange')) {
        importFileEl.addEventListener('change', () => Bracket.importTourneyEntrantsFile(importFileEl));
    }
    Bracket.updateTourneySeedPreview();

    async function syncPromoCreatorButtons() {
        let enabled = false;
        try {
            const res = await fetch('/api/status', { cache: 'no-store' });
            if (res.ok) {
                const statusData = await res.json();
                enabled = statusData?.modules?.promoCreator === true;
            }
        } catch { /* ignore */ }
        document.querySelectorAll('[data-requires-module="promoCreator"]').forEach(el => {
            el.hidden = !enabled;
        });
    }
    syncPromoCreatorButtons();
    window.addEventListener('streampulse:config-saved', syncPromoCreatorButtons);
    window.addEventListener('storage', e => {
        if (e.key === 'streampulse:modules') syncPromoCreatorButtons();
    });

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

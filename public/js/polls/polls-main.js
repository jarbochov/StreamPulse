/**
 * StreamPulse Poll Studio — Main Entry Point & Window Exports
 */

import * as State from './polls-state.js';
import * as Preview from './polls-preview.js';
import * as Monitor from './polls-monitor.js';
import * as Editor from './polls-editor.js';
import * as Bracket from './polls-bracket.js';

const { $ } = State;

export function switchTab(tab) {
    State.setActiveTabState(tab);
    try { localStorage.setItem('polls-active-tab', tab); } catch {}
    $('tab-btn-poll')?.classList.toggle('active', tab === 'poll');
    $('tab-btn-tourney')?.classList.toggle('active', tab === 'tourney');
    $('tab-btn-overlays')?.classList.toggle('active', tab === 'overlays');
    $('tab-btn-templates')?.classList.toggle('active', tab === 'templates');

    if ($('panel-poll')) $('panel-poll').style.display = tab === 'poll' ? 'block' : 'none';
    if ($('panel-tourney')) $('panel-tourney').style.display = tab === 'tourney' ? 'block' : 'none';
    if ($('panel-overlays')) $('panel-overlays').style.display = tab === 'overlays' ? 'block' : 'none';
    if ($('panel-templates')) $('panel-templates').style.display = tab === 'templates' ? 'block' : 'none';

    if ($('poll-steps')) $('poll-steps').style.display = (tab === 'poll' || tab === 'tourney') ? '' : 'none';
    if (tab === 'tourney') {
        Bracket.loadTournament();
        Bracket.loadPollTournamentLibrary();
    } else if (tab === 'overlays') {
        const savedMode = localStorage.getItem('polls-overlay-preview-mode') || Preview.previewMode || 'poll';
        Preview.setPreviewMode(['poll', 'tree', 'active'].includes(savedMode) ? savedMode : 'poll');
    } else if (tab === 'templates') {
        Editor.loadPresets();
        Editor.loadHistory();
        Bracket.loadPollTournamentLibrary();
    }
}

// Consolidate all methods onto window for inline HTML onclick handlers and test fixture compatibility
const pollApp = {
    ...State,
    ...Preview,
    ...Monitor,
    ...Editor,
    ...Bracket,
    switchTab
};

window.pollApp = pollApp;
Object.assign(window, pollApp);

// Reactive property bindings on window for backward-compatible test fixtures
const dynamicVars = [
    ['activePollData', State.setActivePollData],
    ['activeTourneyData', State.setActiveTourneyData],
    ['previewMode', Preview.setPreviewModeState],
    ['activeTab', State.setActiveTabState]
];

dynamicVars.forEach(([prop, setter]) => {
    Object.defineProperty(window, prop, {
        get() {
            if (prop === 'previewMode') return Preview.previewMode;
            return State[prop];
        },
        set(val) { setter(val); },
        configurable: true
    });
});

// Bootstrap
async function init() {
    const baseUrl = window.location.origin;
    if ($('url-poll-overlay')) $('url-poll-overlay').value = `${baseUrl}/overlays/poll.html`;
    if ($('url-tourney-overlay')) $('url-tourney-overlay').value = `${baseUrl}/overlays/poll-tournament.html`;

    await Preview.populateFontDatalist();
    Preview.populateThemeDropdowns();
    Preview.restorePollsOverlayPrefs();
    Preview.setPreviewMode(Preview.previewMode);
    const restored = Editor.restorePollDraft();
    if (!restored) {
        Editor.addChoiceField('Zelda: Tears of the Kingdom');
        Editor.addChoiceField('Elden Ring');
        Editor.addChoiceField('Metroid Prime Remastered');
    }

    try {
        const res = await fetch('/api/polls/active');
        const data = await res.json();
        if (data.poll?.status === 'ACTIVE') {
            State.setActivePollData(data.poll);
            Monitor.renderActivePollMonitor(data.poll);
        }
    } catch {}

    Editor.loadPresets();
    Bracket.loadTournament();
    Editor.loadHistory();
    State.checkChatbotStatus();
    Bracket.updateEntrantsCalc();
    Preview.updatePollOverlayUrl();
    Preview.updateTourneyOverlayUrl();
    try {
        const savedPollSubtab = localStorage.getItem('sp-polls-subtab') || 'layout';
        Preview.switchPollSubtab(savedPollSubtab);
        const savedPollTourneySubtab = localStorage.getItem('sp-polls-tourney-subtab') || 'layout';
        Preview.switchPollTourneySubtab(savedPollTourneySubtab);
    } catch {}
    Preview.updateAssetFontBadges();
    Preview.updatePreview();
    State.connectWs(
        poll => Monitor.renderActivePollMonitor(poll),
        tourney => Bracket.renderTournamentStudio(tourney)
    );
    try {
        const saved = localStorage.getItem('polls-active-tab');
        if (saved && saved !== 'poll' && $('tab-btn-' + saved)) switchTab(saved);
    } catch {}
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

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
    const tabs = ['poll', 'tourney', 'overlays', 'templates'];
    tabs.forEach(t => {
        const btn = $(`tab-btn-${t}`);
        if (btn) {
            const isActive = tab === t;
            btn.classList.toggle('active', isActive);
            btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
        }
    });

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
    if (window.WizardVariableBinder) {
        window.WizardVariableBinder.mount({
            storageKey: 'streampulse_polls_overlay_vars_v1',
            onChange: () => {
                Preview.updatePollOverlayUrl();
                Preview.updateTourneyOverlayUrl();
            },
            bindings: [
                { id: 'poll-opt-heading-font', param: 'headingfont', kind: 'font', label: 'Poll Title Font', overlays: ['poll'] },
                { id: 'poll-opt-font', param: 'font', kind: 'font', label: 'Poll Body Font', overlays: ['poll'] },
                { id: 'poll-opt-scale', param: 'fontscale', kind: 'number', label: 'Poll Font Scale', overlays: ['poll'] },
                { id: 'poll-opt-weight', param: 'weight', kind: 'number', label: 'Poll Font Weight', overlays: ['poll'] },
                { id: 'poll-opt-radius', param: 'radius', kind: 'number', label: 'Poll Corner Radius', overlays: ['poll'] },
                { id: 'poll-opt-outline', param: 'outline', kind: 'text', label: 'Poll Text Outline', overlays: ['poll'] },
                { id: 'poll-opt-text', param: 'text', kind: 'color', label: 'Poll Text Color', overlays: ['poll'] },
                { id: 'poll-opt-muted', param: 'muted', kind: 'color', label: 'Poll Muted Color', overlays: ['poll'] },
                { id: 'poll-opt-cardbg', param: 'cardbg', kind: 'color', label: 'Poll Card Background', overlays: ['poll'] },
                { id: 'poll-opt-border', param: 'border', kind: 'color', label: 'Poll Border Color', overlays: ['poll'] },
                { id: 'poll-opt-accent', param: 'accent', kind: 'color', label: 'Poll Accent Color', overlays: ['poll'] },
                { id: 'poll-opt-winner', param: 'winner', kind: 'color', label: 'Poll Winner Color', overlays: ['poll'] },
                { id: 'poll-opt-track', param: 'track', kind: 'color', label: 'Poll Track Color', overlays: ['poll'] },
                { id: 'tourney-opt-heading-font', param: 'headingfont', kind: 'font', label: 'Bracket Title Font', overlays: ['tourney'] },
                { id: 'tourney-opt-font', param: 'font', kind: 'font', label: 'Bracket Body Font', overlays: ['tourney'] },
                { id: 'tourney-opt-scale', param: 'scale', kind: 'number', label: 'Bracket Font Scale', overlays: ['tourney'] },
                { id: 'tourney-opt-weight', param: 'weight', kind: 'number', label: 'Bracket Font Weight', overlays: ['tourney'] },
                { id: 'tourney-opt-radius', param: 'radius', kind: 'number', label: 'Bracket Corner Radius', overlays: ['tourney'] },
                { id: 'tourney-opt-outline', param: 'outline', kind: 'text', label: 'Bracket Text Outline', overlays: ['tourney'] },
                { id: 'tourney-opt-gap', param: 'gap', kind: 'number', label: 'Bracket Gap', overlays: ['tourney'] },
                { id: 'tourney-opt-logosize', param: 'logosize', kind: 'number', label: 'Bracket Logo Size', overlays: ['tourney'] },
                { id: 'tourney-opt-text', param: 'text', kind: 'color', label: 'Bracket Text Color', overlays: ['tourney'] },
                { id: 'tourney-opt-muted', param: 'muted', kind: 'color', label: 'Bracket Muted Color', overlays: ['tourney'] },
                { id: 'tourney-opt-cardbg', param: 'cardbg', kind: 'color', label: 'Bracket Card Background', overlays: ['tourney'] },
                { id: 'tourney-opt-bg', param: 'bg', kind: 'color', label: 'Bracket Page Background', overlays: ['tourney'] },
                { id: 'tourney-opt-border', param: 'border', kind: 'color', label: 'Bracket Border Color', overlays: ['tourney'] },
                { id: 'tourney-opt-accent', param: 'accent', kind: 'color', label: 'Bracket Accent Color', overlays: ['tourney'] },
                { id: 'tourney-opt-winner', param: 'winner', kind: 'color', label: 'Bracket Winner Color', overlays: ['tourney'] },
                { id: 'tourney-opt-badgecolor', param: 'badgecolor', kind: 'color', label: 'Bracket Badge Color', overlays: ['tourney'] },
                { id: 'tourney-opt-p1color', param: 'p1color', kind: 'color', label: 'Bracket Option A Color', overlays: ['tourney'] },
                { id: 'tourney-opt-p2color', param: 'p2color', kind: 'color', label: 'Bracket Option B Color', overlays: ['tourney'] }
            ]
        });
    }
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

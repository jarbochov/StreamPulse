/**
 * StreamPulse Poll Studio — Reactive State & WebSocket Engine
 */

export const $ = id => document.getElementById(id);
export const esc = s => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const escapeHtml = esc;
export function toast(msg) {
    const t = $('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2400);
}

// Global reactive state variables
export let activePollData = null;
export function setActivePollData(val) { activePollData = val; }

export let activeTourneyData = null;
export function setActiveTourneyData(val) { activeTourneyData = val; }

export let savedPresetsList = [];
export function setSavedPresetsList(val) { savedPresetsList = val; }

export let selectedDuration = 60;
export function setSelectedDuration(val) { selectedDuration = val; }

export let choiceCount = 0;
export function setChoiceCount(val) { choiceCount = val; }

export const maxChoices = 10;

export let pollSocket = null;
export function setPollSocket(val) { pollSocket = val; }

export let activeTab = 'poll';
export function setActiveTabState(val) { activeTab = val; }

export let previewMode = 'poll';
export function setPreviewModeState(val) { previewMode = val; }

export let activeThemeModalTarget = 'tourney';
export function setActiveThemeModalTarget(val) { activeThemeModalTarget = val; }

export let activeFontPickerTarget = 'tourney';
export function setActiveFontPickerTarget(val) { activeFontPickerTarget = val; }

export let cachedAssetFontsList = [];
export function setCachedAssetFontsList(val) { cachedAssetFontsList = val; }

export let currentCreateTourneyMode = 'vote';
export function setCurrentCreateTourneyMode(val) { currentCreateTourneyMode = val; }

export let pollTournamentTemplates = [];
export function setPollTournamentTemplates(val) { pollTournamentTemplates = val; }

export let pollTournamentSavedBrackets = [];
export function setPollTournamentSavedBrackets(val) { pollTournamentSavedBrackets = val; }

export let loadedTournamentTemplate = null;
export function setLoadedTournamentTemplate(val) { loadedTournamentTemplate = val; }

export let tournamentLibraryRequest = null;
export function setTournamentLibraryRequest(val) { tournamentLibraryRequest = val; }

export let tournamentLibraryRendered = false;
export function setTournamentLibraryRendered(val) { tournamentLibraryRendered = val; }

export const BUILT_IN_THEME_OPTIONS = [
    { id: 'card', name: 'Dark Card' },
    { id: 'fgc-evo', name: 'EVO Championship' },
    { id: 'championship', name: 'Championship Gold' },
    { id: 'cyber', name: 'Cyberpunk Neon' },
    { id: 'clean-light', name: 'Clean Light Contrast' },
    { id: 'minimal-dark', name: 'OLED Deep Black' },
    { id: 'glass', name: 'Frosted Glass' },
    { id: 'solid', name: 'Opaque Solid' },
    { id: 'transparent', name: 'Transparent / Clean' },
    { id: 'pill', name: 'Pill Capsule' },
    { id: 'border', name: 'Border Framing' },
    { id: 'retro', name: 'Retro Arcade' },
    { id: 'ember', name: 'Ember' },
    { id: 'aurora', name: 'Aurora' },
    { id: 'ocean', name: 'Ocean' },
    { id: 'sunset', name: 'Sunset' },
    { id: 'violet', name: 'Violet' },
    { id: 'forest', name: 'Forest' }
];

export async function checkChatbotStatus() {
    try {
        const res = await fetch('/api/polls/status');
        const data = await res.json();
        const ready = data.chatbot?.ready;
        const badges = [$('poll-chat-status-badge'), $('tourney-chat-status-badge')];
        badges.forEach(b => {
            if (!b) return;
            if (ready) {
                b.textContent = 'Chatbot: Ready';
                b.style.color = '#3fb950';
                b.title = 'SocialStream chat bot is active and ready to post announcements.';
            } else {
                b.textContent = 'Chatbot: Inactive';
                b.style.color = 'var(--text-muted)';
                b.title = data.chatbot?.reason || 'Chat bot or SocialStream is not active. Polls will still run normally.';
            }
        });
    } catch {
        const badges = [$('poll-chat-status-badge'), $('tourney-chat-status-badge')];
        badges.forEach(b => {
            if (b) {
                b.textContent = 'Chatbot: Inactive';
                b.style.color = 'var(--text-muted)';
            }
        });
    }
}

// WebSocket for Live Push
export function connectWs(onPollUpdate, onTourneyUpdate) {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    pollSocket = new WebSocket(`${proto}//${location.host}/ws`);

    pollSocket.onmessage = (event) => {
        try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'poll-update') {
                activePollData = msg.data;
                if (window.renderActivePollMonitor) window.renderActivePollMonitor(activePollData);
                if (window.updatePreview) window.updatePreview(false);
                if (onPollUpdate) onPollUpdate(activePollData);
            } else if (msg.type === 'poll-tournament-update') {
                activeTourneyData = msg.data;
                if (window.renderTournamentStudio) window.renderTournamentStudio(activeTourneyData);
                if (onTourneyUpdate) onTourneyUpdate(activeTourneyData);
            }
        } catch { /* ignore parse error */ }
    };

    pollSocket.onclose = () => setTimeout(() => connectWs(onPollUpdate, onTourneyUpdate), 2000);
}

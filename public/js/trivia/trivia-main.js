/**
 * StreamPulse Trivia Studio — Main Entry Point
 * Orchestrates modules, tab management, toolbar triggers, and view preferences.
 */

import { fetchState, connectWs, onStateChange, startQuestion, revealAnswer, nextQuestion, prevQuestion, clearQuestion, resetTrivia, shuffleQuestions, resetDoneQuestions, toggleQuestionDone, moveQuestion, deleteQuestion } from './trivia-state.js';
import { renderState } from './trivia-monitor.js';
import { initPreviewListeners, setPreviewViewport, applyViewportScale, togglePreviewBackdrop, applyPreviewBackdrop, setPreviewPhase, togglePreviewSampleData, setActiveTab, updateObsUrl } from './trivia-preview.js';
import { initEditorListeners, openEditModal, removeModalChoice, updateCorrectOptions, modalChoices } from './trivia-editor.js';
import { initLeaderboardListeners, updateLeaderboardPreview } from './trivia-leaderboard.js';

let currentTab = 'studio';
let currentThemingSubTab = 'questions';

function updateOpenOverlayLink() {
    const link = document.getElementById('tab-open-overlay-link');
    if (!link) return;
    if (currentTab === 'leaderboard' || (currentTab === 'theming' && currentThemingSubTab === 'leaderboard')) {
        link.href = '/overlays/trivia-leaderboard.html';
        link.title = 'Open live trivia leaderboard overlay in new window';
    } else {
        link.href = '/overlays/trivia.html';
        link.title = 'Open live trivia overlay in new window';
    }
}

export function switchThemingSubTab(subTab) {
    currentThemingSubTab = subTab === 'leaderboard' ? 'leaderboard' : 'questions';

    const btnQuestions = document.getElementById('theming-sub-btn-questions');
    const btnLeaderboard = document.getElementById('theming-sub-btn-leaderboard');
    const viewQuestions = document.getElementById('theming-view-questions');
    const viewLeaderboard = document.getElementById('theming-view-leaderboard');

    if (btnQuestions) {
        const active = currentThemingSubTab === 'questions';
        btnQuestions.classList.toggle('active', active);
        btnQuestions.setAttribute('aria-selected', active ? 'true' : 'false');
    }
    if (btnLeaderboard) {
        const active = currentThemingSubTab === 'leaderboard';
        btnLeaderboard.classList.toggle('active', active);
        btnLeaderboard.setAttribute('aria-selected', active ? 'true' : 'false');
    }

    if (viewQuestions) viewQuestions.style.display = currentThemingSubTab === 'questions' ? 'grid' : 'none';
    if (viewLeaderboard) viewLeaderboard.style.display = currentThemingSubTab === 'leaderboard' ? 'grid' : 'none';

    try {
        localStorage.setItem('trivia-theming-subtab', currentThemingSubTab);
    } catch {}

    updateOpenOverlayLink();

    if (currentTab === 'theming') {
        if (currentThemingSubTab === 'questions') {
            setTimeout(() => {
                applyViewportScale();
                updateObsUrl();
            }, 50);
        } else {
            setTimeout(() => {
                updateLeaderboardPreview();
            }, 50);
        }
    }
}

export function switchTab(tab, subTab) {
    currentTab = tab;
    setActiveTab(tab);

    const btnStudio = document.getElementById('tab-btn-studio');
    const btnTheming = document.getElementById('tab-btn-theming');
    const btnLeaderboard = document.getElementById('tab-btn-leaderboard');
    const panelStudio = document.getElementById('panel-studio');
    const panelTheming = document.getElementById('panel-theming');
    const panelLeaderboard = document.getElementById('panel-leaderboard');

    if (btnStudio) {
        btnStudio.classList.toggle('active', tab === 'studio');
        btnStudio.setAttribute('aria-selected', tab === 'studio' ? 'true' : 'false');
    }
    if (btnTheming) {
        btnTheming.classList.toggle('active', tab === 'theming');
        btnTheming.setAttribute('aria-selected', tab === 'theming' ? 'true' : 'false');
    }
    if (btnLeaderboard) {
        btnLeaderboard.classList.toggle('active', tab === 'leaderboard');
        btnLeaderboard.setAttribute('aria-selected', tab === 'leaderboard' ? 'true' : 'false');
    }

    if (panelStudio) panelStudio.style.display = (tab === 'studio') ? 'grid' : 'none';
    if (panelTheming) panelTheming.style.display = (tab === 'theming') ? 'block' : 'none';
    if (panelLeaderboard) panelLeaderboard.style.display = (tab === 'leaderboard') ? 'grid' : 'none';

    try {
        localStorage.setItem('trivia-active-tab', tab);
    } catch {}

    if (tab === 'theming') {
        switchThemingSubTab(subTab || currentThemingSubTab);
    } else {
        updateOpenOverlayLink();
    }
}

// ── Global Window Bridge for Dynamic Markup Callbacks ────────────────────────
window.triviaApp = {
    switchTab,
    switchThemingSubTab,
    startSpecificQuestion: (id) => startQuestion(id),
    toggleQuestionDone: (id) => toggleQuestionDone(id),
    moveQuestion: (id, dir) => moveQuestion(id, dir),
    openEditModal: (id) => openEditModal(id),
    deleteQuestion: (id) => deleteQuestion(id),
    removeModalChoice: (idx) => removeModalChoice(idx),
    updateModalChoiceText: (idx, val) => {
        modalChoices[idx] = val;
        updateCorrectOptions();
    },
    setPreviewPhase: (phase) => setPreviewPhase(phase),
    togglePreviewBackdrop,
    togglePreviewSampleData,
    setPreviewViewport: (w, h, btn, mode) => setPreviewViewport(w, h, btn, mode)
};

// Legacy global fallbacks
window.switchTab = window.triviaApp.switchTab;
window.startSpecificQuestion = window.triviaApp.startSpecificQuestion;
window.toggleQuestionDone = window.triviaApp.toggleQuestionDone;
window.moveQuestion = window.triviaApp.moveQuestion;
window.openEditModal = window.triviaApp.openEditModal;
window.deleteQuestion = window.triviaApp.deleteQuestion;
window.removeModalChoice = window.triviaApp.removeModalChoice;
window.setPreviewPhase = window.triviaApp.setPreviewPhase;
window.togglePreviewBackdrop = window.triviaApp.togglePreviewBackdrop;
window.togglePreviewSampleData = window.triviaApp.togglePreviewSampleData;
window.setPreviewViewport = window.triviaApp.setPreviewViewport;

function initToolbarTriggers() {
    document.getElementById('btn-start')?.addEventListener('click', () => startQuestion());
    document.getElementById('btn-reveal')?.addEventListener('click', () => revealAnswer());
    document.getElementById('btn-next')?.addEventListener('click', () => nextQuestion());
    document.getElementById('btn-prev')?.addEventListener('click', () => prevQuestion());
    document.getElementById('btn-clear-question')?.addEventListener('click', () => clearQuestion());
    document.getElementById('btn-reset')?.addEventListener('click', () => resetTrivia());
    document.getElementById('btn-shuffle-q')?.addEventListener('click', () => shuffleQuestions());
    document.getElementById('btn-reset-done')?.addEventListener('click', () => resetDoneQuestions());

    document.getElementById('tab-btn-studio')?.addEventListener('click', () => switchTab('studio'));
    document.getElementById('tab-btn-theming')?.addEventListener('click', () => switchTab('theming'));
    document.getElementById('tab-btn-leaderboard')?.addEventListener('click', () => switchTab('leaderboard'));
    document.getElementById('theming-sub-btn-questions')?.addEventListener('click', () => switchThemingSubTab('questions'));
    document.getElementById('theming-sub-btn-leaderboard')?.addEventListener('click', () => switchThemingSubTab('leaderboard'));
    document.getElementById('btn-goto-lb-theming')?.addEventListener('click', () => switchTab('theming', 'leaderboard'));

    document.getElementById('prev-btn-bg')?.addEventListener('click', () => togglePreviewBackdrop());
    document.getElementById('prev-btn-backdrop')?.addEventListener('click', () => togglePreviewBackdrop());
    document.getElementById('prev-btn-sample')?.addEventListener('click', () => togglePreviewSampleData());

    document.querySelectorAll('.phase-chip-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.dataset.phase) setPreviewPhase(btn.dataset.phase);
        });
    });

    document.getElementById('chip-vp-full')?.addEventListener('click', function() {
        setPreviewViewport(1920, 1080, this, 'full');
    });
    document.getElementById('chip-vp-compact')?.addEventListener('click', function() {
        setPreviewViewport(1920, 360, this, 'compact');
    });
    document.getElementById('chip-vp-hud')?.addEventListener('click', function() {
        setPreviewViewport(520, 680, this, 'hud');
    });
    document.getElementById('chip-vp-vertical')?.addEventListener('click', function() {
        setPreviewViewport(1080, 1920, this, 'full');
    });
    document.getElementById('chip-vp-mobile')?.addEventListener('click', function() {
        setPreviewViewport(1080, 1920, this, 'full');
    });
}

function restoreUserPreferences() {
    try {
        const savedSubTab = localStorage.getItem('trivia-theming-subtab');
        if (savedSubTab === 'questions' || savedSubTab === 'leaderboard') {
            currentThemingSubTab = savedSubTab;
        }
        const savedTab = localStorage.getItem('trivia-active-tab');
        if (savedTab && (savedTab === 'theming' || savedTab === 'studio' || savedTab === 'leaderboard')) {
            switchTab(savedTab);
        } else {
            switchThemingSubTab(currentThemingSubTab);
        }
        const savedBackdrop = localStorage.getItem('trivia-preview-backdrop');
        if (savedBackdrop) {
            applyPreviewBackdrop();
        }
        const savedPhase = localStorage.getItem('trivia-preview-phase');
        if (savedPhase) {
            setPreviewPhase(savedPhase);
        }
        const savedVp = localStorage.getItem('trivia-preview-viewport');
        if (savedVp) {
            const parsed = JSON.parse(savedVp);
            if (parsed.w && parsed.h) {
                const chipBtn = parsed.chipId ? document.getElementById(parsed.chipId) : null;
                setPreviewViewport(parsed.w, parsed.h, chipBtn, parsed.mode);
            }
        }
    } catch {}
}

document.addEventListener('DOMContentLoaded', () => {
    onStateChange((state) => renderState(state));
    initToolbarTriggers();
    initPreviewListeners();
    initEditorListeners();
    initLeaderboardListeners();
    restoreUserPreferences();
    fetchState();
    connectWs();
});

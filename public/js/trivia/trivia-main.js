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

export function switchTab(tab) {
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
    if (panelTheming) panelTheming.style.display = (tab === 'theming') ? 'grid' : 'none';
    if (panelLeaderboard) panelLeaderboard.style.display = (tab === 'leaderboard') ? 'grid' : 'none';

    try {
        localStorage.setItem('trivia-active-tab', tab);
    } catch {}

    if (tab === 'theming') {
        setTimeout(() => {
            applyViewportScale();
            updateObsUrl();
        }, 50);
    } else if (tab === 'leaderboard') {
        setTimeout(() => {
            updateLeaderboardPreview();
        }, 50);
    }
}

// ── Global Window Bridge for Dynamic Markup Callbacks ────────────────────────
window.triviaApp = {
    switchTab,
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
        const savedTab = localStorage.getItem('trivia-active-tab');
        if (savedTab && (savedTab === 'theming' || savedTab === 'studio' || savedTab === 'leaderboard')) {
            switchTab(savedTab);
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

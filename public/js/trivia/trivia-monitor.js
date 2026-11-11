/**
 * StreamPulse Trivia Studio — Broadcast Monitor & Question Bank View
 * Renders the live monitor card, audience chat voting meters, played/unplayed badges,
 * and handles UI updates for questions and theme settings.
 */

import { esc } from './trivia-state.js';
import { PRESET_DEFAULTS, setFieldColor, setHeaderFontSizeValue, updateObsUrl } from './trivia-preview.js';
import { attachDragAndDrop, populateFontDropdowns } from './trivia-editor.js';

let formSignature = '';

export function renderState(currentState) {
    if (!currentState) return;

    // ── Live Badge & Active Question Monitor ─────────────────────────────────
    const liveBadge = document.getElementById('live-badge');
    const liveCategory = document.getElementById('live-category');
    const liveQuestion = document.getElementById('live-question');
    const liveTimerText = document.getElementById('live-timer-text');
    const liveChoices = document.getElementById('live-choices');

    const status = currentState.status || 'idle';
    const active = currentState.activeQuestion;
    const votingEnabled = currentState.settings?.chatVoting !== false && currentState.chatVotingActive !== false;
    const clearButton = document.getElementById('btn-clear-question');
    if (clearButton) {
        clearButton.hidden = !(currentState.settings?.manualTransition || currentState.settings?.autoReveal === false);
        clearButton.disabled = !active || status === 'idle';
    }

    if (liveBadge) {
        if (status === 'question') {
            liveBadge.textContent = 'Question Active';
            liveBadge.className = 'badge-status badge-question';
        } else if (status === 'reveal') {
            liveBadge.textContent = 'Answer Revealed';
            liveBadge.className = 'badge-status badge-reveal';
        } else {
            liveBadge.textContent = 'Idle';
            liveBadge.className = 'badge-status badge-idle';
        }
    }

    if (active) {
        if (liveCategory) liveCategory.textContent = active.category || 'General';
        if (liveQuestion) liveQuestion.textContent = active.question || '';
        if (liveTimerText) liveTimerText.textContent = `${active.remainingSeconds || 0}s remaining${votingEnabled ? ` · ${active.totalVotes || 0} votes` : ''}`;

        const choices = active.choices || [];
        const correctIdx = active.correctIndex;

        if (liveChoices) {
            liveChoices.innerHTML = choices.map((c, i) => {
                const isCorrect = (status === 'reveal' && i === correctIdx);
                const letter = c.letter || String.fromCharCode(65 + i);
                return `
                    <div class="monitor-choice-item ${isCorrect ? 'correct' : ''}">
                        ${votingEnabled ? `<div class="monitor-choice-meter" style="width: ${c.percent || 0}%"></div>` : ''}
                        <span class="monitor-choice-label">
                            <span class="monitor-choice-letter">${esc(letter)}</span>
                            <span>${esc(c.text)}</span>
                        </span>
                        ${votingEnabled ? `<span class="monitor-choice-votes">${c.percent || 0}% (${c.votes || 0})</span>` : ''}
                    </div>
                `;
            }).join('');
        }
    } else {
        if (liveCategory) liveCategory.textContent = 'No Active Question';
        if (liveQuestion) liveQuestion.textContent = 'Start a question from your bank below or advance to begin.';
        if (liveTimerText) liveTimerText.textContent = '0s';
        if (liveChoices) {
            liveChoices.innerHTML = ['A', 'B', 'C', 'D'].map((letter, i) => `
                <div class="monitor-choice-item"><span class="monitor-choice-label"><span class="monitor-choice-letter">${letter}</span> Choice ${i + 1}</span>${votingEnabled ? '<span class="monitor-choice-votes">0% (0)</span>' : ''}</div>
            `).join('');
        }
    }

    // ── Question Bank List ───────────────────────────────────────────────────
    const questions = currentState.questions || [];
    const playedIds = new Set(currentState.playedQuestionIds || []);
    const countEl = document.getElementById('q-count');
    if (countEl) countEl.textContent = questions.length;
    const container = document.getElementById('questions-container');

    if (container) {
        container.innerHTML = questions.map((q, idx) => {
            const isActive = (currentState.currentIndex === idx && currentState.status !== 'idle');
            const isDone = Boolean(q.done || q.played || playedIds.has(q.id));
            const choicesStr = (q.choices || []).join(' · ');
            return `
                <div class="question-item ${isActive ? 'active-item' : ''}" data-id="${esc(q.id)}" draggable="true">
                    <span class="drag-handle" title="Drag to reorder">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="14" height="14">
                            <circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/>
                            <circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>
                            <circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/>
                        </svg>
                    </span>
                    <div class="question-meta">
                        <div style="display: flex; align-items: center; gap: 0.4rem;">
                            <span class="question-category">${esc(q.category)} · Q${idx + 1}</span>
                            <button type="button" class="${isDone ? 'badge-done' : 'badge-unplayed'}" onclick="window.triviaApp.toggleQuestionDone('${esc(q.id)}')" title="${isDone ? 'Marked as Done (click to mark Unplayed)' : 'Unplayed (click to mark Done)'}">
                                ${isDone ? 'Done' : 'Unplayed'}
                            </button>
                        </div>
                        <span class="question-item-text">${esc(q.question)}</span>
                        <span class="question-answer-preview">Choices: ${esc(choicesStr)}</span>
                    </div>
                    <div class="question-actions">
                        <button type="button" class="btn" onclick="window.triviaApp.startSpecificQuestion('${esc(q.id)}')">Start</button>
                        <button type="button" class="icon-btn ${isDone ? 'btn-done-active' : ''}" onclick="window.triviaApp.toggleQuestionDone('${esc(q.id)}')" title="${isDone ? 'Marked as Done (click to mark Unplayed)' : 'Mark as Done'}">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="14" height="14" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        </button>
                        <button type="button" class="icon-btn" onclick="window.triviaApp.moveQuestion('${esc(q.id)}', -1)" title="Move Up" ${idx === 0 ? 'disabled style="opacity:0.3;cursor:not-allowed;"' : ''}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="18 15 12 9 6 15"></polyline></svg>
                        </button>
                        <button type="button" class="icon-btn" onclick="window.triviaApp.moveQuestion('${esc(q.id)}', 1)" title="Move Down" ${idx === questions.length - 1 ? 'disabled style="opacity:0.3;cursor:not-allowed;"' : ''}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="6 9 12 15 18 9"></polyline></svg>
                        </button>
                        <button type="button" class="icon-btn" onclick="window.triviaApp.openEditModal('${esc(q.id)}')" title="Edit">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                        </button>
                        <button type="button" class="icon-btn" onclick="window.triviaApp.deleteQuestion('${esc(q.id)}')" title="Delete">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        attachDragAndDrop();
    }

    const chatbotPill = document.getElementById('chatbot-status-pill');
    if (chatbotPill) {
        const active = currentState.chatVotingActive !== false;
        chatbotPill.textContent = active ? 'Chat voting active' : (currentState.settings?.chatVoting === false ? 'Chat voting off' : 'Chat Bot off');
        chatbotPill.title = active ? 'Audience answers are accepted.' : 'Automatic trivia chat announcements are also off.';
        chatbotPill.style.background = active ? 'rgba(34, 197, 94, 0.15)' : 'rgba(139, 148, 158, 0.15)';
        chatbotPill.style.borderColor = active ? 'rgba(34, 197, 94, 0.35)' : 'rgba(139, 148, 158, 0.35)';
        chatbotPill.style.color = active ? '#22c55e' : '#8b949e';
    }

    // Vote and lifecycle updates must not reset unsaved configuration.
    const signature = JSON.stringify([currentState.settings, currentState.theme, currentState.presets]);
    if (signature === formSignature) return;
    formSignature = signature;

    // ── Presets Dropdown ─────────────────────────────────────────────────────
    const presets = currentState.presets || [];
    const presetSelect = document.getElementById('preset-select');
    if (presetSelect) {
        presetSelect.innerHTML = presets.map(p => `
            <option value="${esc(p.id)}">${esc(p.name)} (${p.questionCount} questions)${p.isBuiltin ? ' [Built-in]' : ''}</option>
        `).join('');
    }

    // ── Settings Form Inputs ─────────────────────────────────────────────────
    const settings = currentState.settings || {};
    const durEl = document.getElementById('cfg-duration');
    if (durEl) durEl.value = settings.defaultDuration || 20;
    const revEl = document.getElementById('cfg-reveal-delay');
    if (revEl) revEl.value = settings.revealDelay ?? 6;
    const advanceDelayEl = document.getElementById('cfg-advance-delay');
    if (advanceDelayEl) advanceDelayEl.value = settings.advanceDelay ?? 6;
    const advanceDelayRow = document.getElementById('advance-delay-row');
    if (advanceDelayRow) advanceDelayRow.hidden = !settings.autoAdvance;
    const isManual = Boolean(settings.manualTransition || settings.autoReveal === false);
    const modeEl = document.getElementById('cfg-transition-mode');
    if (modeEl) modeEl.value = isManual ? 'manual' : 'auto';
    const voteEl = document.getElementById('cfg-chat-voting');
    if (voteEl) voteEl.checked = settings.chatVoting !== false;
    const advEl = document.getElementById('cfg-auto-advance');
    if (advEl) advEl.checked = Boolean(settings.autoAdvance);
    const randEl = document.getElementById('cfg-random-order');
    if (randEl) randEl.checked = Boolean(settings.randomOrder);
    const randomizeChoicesEl = document.getElementById('cfg-randomize-choices');
    if (randomizeChoicesEl) randomizeChoicesEl.checked = Boolean(settings.randomizeChoices);
    const sndEl = document.getElementById('cfg-sound-enabled');
    if (sndEl) sndEl.checked = settings.soundEnabled !== false;

    // ── Theme Inputs ─────────────────────────────────────────────────────────
    const theme = currentState.theme || {};
    const presetThemeEl = document.getElementById('cfg-theme-preset');
    if (presetThemeEl) presetThemeEl.value = theme.preset || 'modern';
    const obsThemeEl = document.getElementById('obs-theme');
    if (obsThemeEl) obsThemeEl.value = theme.preset || 'modern';
    const styleEl = document.getElementById('cfg-theme-card-style');
    if (styleEl) styleEl.value = theme.cardStyle || ((theme.preset === 'broadcast-text' || theme.preset === 'nodecg') ? 'text' : 'cards');
    const widthEl = document.getElementById('cfg-theme-card-width');
    if (widthEl) widthEl.value = theme.cardMaxWidth || '1100px';
    const collapseEl = document.getElementById('cfg-theme-collapse-incorrect');
    if (collapseEl) collapseEl.checked = Boolean(theme.collapseIncorrect);

    const scale = parseFloat(theme.fontScale || theme.scale || 1.0) || 1.0;
    const scaleEl = document.getElementById('cfg-theme-scale');
    if (scaleEl) scaleEl.value = scale;
    const scaleValEl = document.getElementById('cfg-theme-scale-val');
    if (scaleValEl) scaleValEl.textContent = scale.toFixed(2) + '×';

    const qLabelEl = document.getElementById('cfg-theme-question-label');
    if (qLabelEl) qLabelEl.value = theme.questionLabel || 'Question';
    const aLabelEl = document.getElementById('cfg-theme-answer-label');
    if (aLabelEl) aLabelEl.value = theme.answerLabel || 'Answer';
    const cFormatEl = document.getElementById('cfg-theme-counter-format');
    if (cFormatEl) cFormatEl.value = theme.counterFormat || 'full';
    const pTransEl = document.getElementById('cfg-theme-phase-transform');
    if (pTransEl) pTransEl.value = theme.phaseTransform || 'uppercase';

    setHeaderFontSizeValue(theme.headerFontSize || '');

    const pFontEl = document.getElementById('cfg-theme-phase-font');
    if (pFontEl) pFontEl.value = theme.phaseFont || '';
    const qWeightEl = document.getElementById('cfg-theme-question-weight');
    if (qWeightEl) qWeightEl.value = theme.questionWeight || '';
    const cWeightEl = document.getElementById('cfg-theme-choice-weight');
    if (cWeightEl) cWeightEl.value = theme.choiceWeight || '';
    const hWeightEl = document.getElementById('cfg-theme-header-weight');
    if (hWeightEl) hWeightEl.value = theme.headerWeight || '';
    const fWeightEl = document.getElementById('cfg-theme-funfact-weight');
    if (fWeightEl) fWeightEl.value = theme.funfactWeight || '';

    const defTheme = PRESET_DEFAULTS[theme.preset || 'modern'] || PRESET_DEFAULTS.modern;
    setFieldColor('cfg-theme-card-bg', theme.cardBg, defTheme.cardBg || '#0d1117');
    setFieldColor('cfg-theme-card-border', theme.cardBorderColor || theme.cardBorder, defTheme.cardBorder || '#38bdf8');
    setFieldColor('cfg-theme-choice-bg', theme.choiceBg, defTheme.choiceBg || '#161b22');
    setFieldColor('cfg-theme-choice-border', theme.choiceBorderColor || theme.choiceBorder, defTheme.choiceBorder || '#30363d');

    const blurVal = theme.cardBlur !== undefined ? Number(theme.cardBlur) : (defTheme.blur ?? 12);
    const blurEl = document.getElementById('cfg-theme-blur');
    if (blurEl) blurEl.value = blurVal;
    const blurValEl = document.getElementById('cfg-theme-blur-val');
    if (blurValEl) blurValEl.textContent = `${blurVal}px`;

    setFieldColor('cfg-theme-accent-color', theme.accentColor, defTheme.accent || '#3b82f6');
    setFieldColor('cfg-theme-correct-color', theme.correctColor, defTheme.correct || '#22c55e');
    setFieldColor('cfg-theme-phase-question-color', theme.phaseQuestionColor, defTheme.accent || '#3b82f6');
    setFieldColor('cfg-theme-phase-answer-color', theme.phaseAnswerColor, defTheme.correct || '#22c55e');
    setFieldColor('cfg-theme-category-color', theme.categoryColor, defTheme.catColor || '#a855f7');
    setFieldColor('cfg-theme-hint-color', theme.hintColor, defTheme.hintColor || '#94a3b8');
    setFieldColor('cfg-theme-funfact-color', theme.funfactColor, defTheme.funfactColor || '#eab308');
    setFieldColor('cfg-theme-timer-color', theme.timerColor, '#38bdf8');
    setFieldColor('cfg-theme-timer-warning-color', theme.timerWarningColor, '#f59e0b');
    setFieldColor('cfg-theme-timer-critical-color', theme.timerCriticalColor, '#ef4444');

    // Element visibility toggles
    const phaseEl = document.getElementById('cfg-elem-phase-indicator');
    if (phaseEl) phaseEl.checked = theme.showPhaseIndicator !== false;
    const catEl = document.getElementById('cfg-elem-category');
    if (catEl) catEl.checked = theme.showCategory !== false;
    const qNumEl = document.getElementById('cfg-elem-question-number');
    if (qNumEl) qNumEl.checked = theme.showQuestionNumber !== false;
    const tmrEl = document.getElementById('cfg-elem-timer');
    if (tmrEl) tmrEl.checked = theme.showTimer !== false;
    const ltrEl = document.getElementById('cfg-elem-letter-badges');
    if (ltrEl) ltrEl.checked = theme.showLetterBadges !== false;
    const vtEl = document.getElementById('cfg-elem-votes');
    if (vtEl) vtEl.checked = theme.showVoteCounts !== false;
    const pctEl = document.getElementById('cfg-elem-percentages');
    if (pctEl) pctEl.checked = theme.showPercentages !== false;
    const hntEl = document.getElementById('cfg-elem-chat-hint');
    if (hntEl) hntEl.checked = theme.showChatHint !== false;
    const ffEl = document.getElementById('cfg-elem-funfact');
    if (ffEl) ffEl.checked = theme.showFunFact !== false;

    populateFontDropdowns();
    updateObsUrl();
}

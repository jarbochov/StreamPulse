/**
 * StreamPulse Trivia Studio — Editor Modals & Drag-and-Drop
 * Handles question CRUD modal, preset manager, bulk JSON import,
 * Sortable / native drag-and-drop, and font family discovery.
 */

import { getState, esc, toast, fetchState, saveQuestion, reorderQuestions, savePreset, loadPreset, deletePreset, importQuestions, exportQuestions, saveSettings, saveTheme } from './trivia-state.js';
import { getColorFieldValue, getHeaderFontSizeValue, updateObsUrl } from './trivia-preview.js';

export let modalChoices = [];

export function renderModalChoices(selectedIndex = 0) {
    const container = document.getElementById('edit-q-choices-container');
    if (!container) return;

    container.innerHTML = modalChoices.map((choice, i) => {
        const letter = String.fromCharCode(65 + i);
        return `
            <div style="display: flex; align-items: center; gap: 0.5rem;" data-choice-index="${i}">
                <span class="monitor-choice-letter" style="width: 24px; height: 24px; border-radius: 4px; font-weight: 700; flex-shrink: 0;">${letter}</span>
                <input type="text" class="modal-choice-input" value="${esc(choice)}" placeholder="Choice ${letter}" oninput="window.triviaApp.updateModalChoiceText(${i}, this.value, ${selectedIndex});">
                ${modalChoices.length > 2 ? `
                    <button type="button" class="icon-btn" onclick="window.triviaApp.removeModalChoice(${i})" title="Remove Choice">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                ` : ''}
            </div>
        `;
    }).join('');

    updateCorrectOptions(selectedIndex);
    const addBtn = document.getElementById('btn-add-choice');
    if (addBtn) addBtn.style.display = modalChoices.length >= 6 ? 'none' : 'inline-flex';
}

export function updateCorrectOptions(selectedIndex = null) {
    const correctSelect = document.getElementById('edit-q-correct');
    if (!correctSelect) return;
    const currentVal = parseInt(correctSelect.value, 10);
    const keepIndex = selectedIndex ?? (!isNaN(currentVal) && currentVal < modalChoices.length ? currentVal : 0);
    const isTF = (modalChoices.length === 2 && modalChoices[0].toLowerCase() === 'true' && modalChoices[1].toLowerCase() === 'false');

    correctSelect.innerHTML = modalChoices.map((c, i) => {
        const letter = String.fromCharCode(65 + i);
        const label = isTF ? (i === 0 ? 'True' : 'False') : `Choice ${letter} (${c || 'Option ' + letter})`;
        return `<option value="${i}" ${i === keepIndex ? 'selected' : ''}>${esc(label)}</option>`;
    }).join('');
}

export function removeModalChoice(index) {
    if (modalChoices.length <= 2) return;
    const selected = parseInt(document.getElementById('edit-q-correct')?.value, 10) || 0;
    modalChoices.splice(index, 1);
    const currentCorrect = selected === index ? 0 : (selected > index ? selected - 1 : selected);
    renderModalChoices(currentCorrect);
}

export function addModalChoice() {
    if (modalChoices.length >= 6) return;
    modalChoices.push('');
    const currentCorrect = parseInt(document.getElementById('edit-q-correct')?.value, 10) || 0;
    renderModalChoices(currentCorrect);
}

export function setModalTrueFalse() {
    modalChoices = ['True', 'False'];
    renderModalChoices(0);
}

export function openAddModal() {
    const titleEl = document.getElementById('q-modal-title');
    if (titleEl) titleEl.textContent = 'Add Trivia Question';
    document.getElementById('edit-q-id').value = '';
    document.getElementById('edit-q-category').value = '';
    document.getElementById('edit-q-text').value = '';
    document.getElementById('edit-q-funfact').value = '';
    document.getElementById('edit-q-done').checked = false;
    modalChoices = ['', '', '', ''];
    renderModalChoices(0);
    document.getElementById('q-modal')?.classList.add('open');
}

export function openEditModal(id) {
    const currentState = getState();
    const q = (currentState?.questions || []).find(it => it.id === id);
    if (!q) return;

    const titleEl = document.getElementById('q-modal-title');
    if (titleEl) titleEl.textContent = 'Edit Trivia Question';
    document.getElementById('edit-q-id').value = q.id;
    document.getElementById('edit-q-category').value = q.category || '';
    document.getElementById('edit-q-text').value = q.question || '';
    document.getElementById('edit-q-funfact').value = q.funfact || '';
    const isDone = Boolean(q.done || q.played || (currentState?.playedQuestionIds || []).includes(q.id));
    document.getElementById('edit-q-done').checked = isDone;
    modalChoices = Array.isArray(q.choices) && q.choices.length >= 2 ? [...q.choices] : ['', '', '', ''];
    renderModalChoices(q.correctIndex || 0);
    document.getElementById('q-modal')?.classList.add('open');
}

export function closeQuestionModal() {
    document.getElementById('q-modal')?.classList.remove('open');
}

export async function saveQuestionModal() {
    const id = document.getElementById('edit-q-id')?.value;
    const category = document.getElementById('edit-q-category')?.value.trim() || 'General';
    const question = document.getElementById('edit-q-text')?.value.trim();
    const choices = modalChoices.map(c => String(c || '').trim()).filter(Boolean);
    const correctIndex = parseInt(document.getElementById('edit-q-correct')?.value, 10);
    const funfact = document.getElementById('edit-q-funfact')?.value.trim();
    const isDone = document.getElementById('edit-q-done')?.checked;

    if (!question) return alert('Please enter question text');
    if (choices.length < 2) return alert('Please enter at least 2 choices');
    if (choices.length > 6) return alert('Maximum 6 choices allowed');

    const payload = { category, question, choices, correctIndex, funfact, done: isDone };
    const success = await saveQuestion(payload, id || null);
    if (success) {
        closeQuestionModal();
    }
}

// ── Drag & Drop Logic ────────────────────────────────────────────────────────
let draggedItem = null;

export function attachDragAndDrop() {
    const items = document.querySelectorAll('#questions-container .question-item');
    items.forEach((item) => {
        item.addEventListener('dragstart', (e) => {
            draggedItem = item;
            item.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', item.dataset.id);
        });
        item.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            if (item !== draggedItem) {
                item.classList.add('drag-over');
            }
        });
        item.addEventListener('dragleave', () => {
            item.classList.remove('drag-over');
        });
        item.addEventListener('dragend', () => {
            items.forEach(el => el.classList.remove('drag-over', 'dragging'));
            draggedItem = null;
        });
        item.addEventListener('drop', async (e) => {
            e.preventDefault();
            item.classList.remove('drag-over');
            if (!draggedItem || draggedItem === item) return;

            const container = document.getElementById('questions-container');
            const allItems = [...container.querySelectorAll('.question-item')];
            const srcIdx = allItems.indexOf(draggedItem);
            const dstIdx = allItems.indexOf(item);

            if (srcIdx === -1 || dstIdx === -1) return;

            if (srcIdx < dstIdx) {
                container.insertBefore(draggedItem, item.nextSibling);
            } else {
                container.insertBefore(draggedItem, item);
            }

            const newIds = [...container.querySelectorAll('.question-item')].map(el => el.dataset.id);
            await reorderQuestions(newIds);
        });
    });
}

// ── Font Discovery & Dropdown Population ─────────────────────────────────────
let cachedFontList = null;

export async function populateFontDropdowns() {
    const qSelect = document.getElementById('cfg-theme-question-font');
    const hSelect = document.getElementById('cfg-theme-header-font');
    const cSelect = document.getElementById('cfg-theme-choice-font');
    const fSelect = document.getElementById('cfg-theme-funfact-font');
    const pSelect = document.getElementById('cfg-theme-phase-font');
    if (!qSelect || !hSelect || !cSelect) return;

    if (!cachedFontList) {
        let fontList = [];
        try {
            if (window.OverlayFonts && typeof window.OverlayFonts.getDeduplicatedFontFamilies === 'function') {
                fontList = await window.OverlayFonts.getDeduplicatedFontFamilies();
            } else if (window.OverlayFonts) {
                const assets = await window.OverlayFonts.getAssetFonts?.() || [];
                fontList = [
                    ...assets.map(a => ({ name: a.family || a.name, source: 'asset' })),
                    ...(window.OverlayFonts.google || []).map(g => ({ name: g, source: 'google' })),
                    ...(window.OverlayFonts.system || []).map(s => ({ name: s, source: 'system' }))
                ];
            }
        } catch {
            fontList = [];
        }

        if (!fontList || fontList.length === 0) {
            const fallback = [
                'Inter', 'Montserrat', 'Oswald', 'Roboto', 'Bebas Neue', 'Jersey 15', 'Jersey 20',
                'Press Start 2P', 'Rajdhani', 'Orbitron', 'Righteous', 'Russo One', 'Impact', 'Arial'
            ];
            fontList = fallback.map(name => ({ name, source: 'google' }));
        }
        cachedFontList = fontList;
    }

    const assetFonts = cachedFontList.filter(f => f.source === 'asset');
    const googleFonts = cachedFontList.filter(f => f.source === 'google' || !f.source);
    const systemFonts = cachedFontList.filter(f => f.source === 'system');

    function buildOptions(currentVal, defaultLabel = '(Theme Default)') {
        let html = `<option value="">${defaultLabel}</option>`;
        if (assetFonts.length) {
            html += '<optgroup label="Custom Asset Fonts">';
            assetFonts.forEach(f => {
                html += `<option value="${esc(f.name)}" ${f.name === currentVal ? 'selected' : ''}>${esc(f.name)}</option>`;
            });
            html += '</optgroup>';
        }
        if (googleFonts.length) {
            html += '<optgroup label="Streaming & Esports Fonts">';
            googleFonts.forEach(f => {
                html += `<option value="${esc(f.name)}" ${f.name === currentVal ? 'selected' : ''}>${esc(f.name)}</option>`;
            });
            html += '</optgroup>';
        }
        if (systemFonts.length) {
            html += '<optgroup label="System Fonts">';
            systemFonts.forEach(f => {
                html += `<option value="${esc(f.name)}" ${f.name === currentVal ? 'selected' : ''}>${esc(f.name)}</option>`;
            });
            html += '</optgroup>';
        }
        return html;
    }

    const theme = getState()?.theme || {};
    const qVal = theme.questionFont || qSelect.value || '';
    const hVal = theme.headerFont || hSelect.value || '';
    const cVal = theme.choiceFont || cSelect.value || '';
    const fVal = theme.funfactFont || fSelect?.value || '';
    const pVal = theme.phaseFont || pSelect?.value || '';

    qSelect.innerHTML = buildOptions(qVal);
    hSelect.innerHTML = buildOptions(hVal);
    cSelect.innerHTML = buildOptions(cVal);
    if (fSelect) fSelect.innerHTML = buildOptions(fVal);
    if (pSelect) pSelect.innerHTML = buildOptions(pVal, '(Inherit Header Font)');

    qSelect.value = qVal;
    hSelect.value = hVal;
    cSelect.value = cVal;
    if (fSelect) fSelect.value = fVal;
    if (pSelect) pSelect.value = pVal;

    if (qVal) window.loadUrlFont?.(qVal);
    if (hVal) window.loadUrlFont?.(hVal);
    if (cVal) window.loadUrlFont?.(cVal);
    if (fVal) window.loadUrlFont?.(fVal);
    if (pVal) window.loadUrlFont?.(pVal);

    updateObsUrl();
}

export function initEditorListeners() {
    // Modal buttons
    document.getElementById('btn-add-q')?.addEventListener('click', openAddModal);
    document.getElementById('btn-close-q-modal')?.addEventListener('click', closeQuestionModal);
    document.getElementById('btn-cancel-q')?.addEventListener('click', closeQuestionModal);
    document.getElementById('btn-save-q')?.addEventListener('click', saveQuestionModal);

    document.getElementById('btn-add-choice')?.addEventListener('click', addModalChoice);
    document.getElementById('btn-set-truefalse')?.addEventListener('click', setModalTrueFalse);

    // Preset buttons
    document.getElementById('btn-load-preset')?.addEventListener('click', async () => {
        const id = document.getElementById('preset-select')?.value;
        if (id) await loadPreset(id);
    });

    document.getElementById('btn-delete-preset')?.addEventListener('click', async () => {
        const id = document.getElementById('preset-select')?.value;
        if (!id) return;
        if (!confirm('Delete this custom preset?')) return;
        await deletePreset(id);
    });

    document.getElementById('btn-save-preset-modal')?.addEventListener('click', () => {
        const nameEl = document.getElementById('save-preset-name');
        const descEl = document.getElementById('save-preset-desc');
        if (nameEl) nameEl.value = '';
        if (descEl) descEl.value = '';
        document.getElementById('preset-modal')?.classList.add('open');
    });

    document.getElementById('btn-close-preset-modal')?.addEventListener('click', () => {
        document.getElementById('preset-modal')?.classList.remove('open');
    });
    document.getElementById('btn-cancel-save-preset')?.addEventListener('click', () => {
        document.getElementById('preset-modal')?.classList.remove('open');
    });

    document.getElementById('btn-confirm-save-preset')?.addEventListener('click', async () => {
        const name = document.getElementById('save-preset-name')?.value.trim();
        const desc = document.getElementById('save-preset-desc')?.value.trim();
        if (!name) return alert('Please enter a preset name');
        const success = await savePreset(name, desc);
        if (success) {
            document.getElementById('preset-modal')?.classList.remove('open');
        }
    });

    // Export Question Bank (JSON & CSV)
    document.getElementById('btn-export-q')?.addEventListener('click', () => {
        exportQuestions('json');
    });
    document.getElementById('btn-export-q-csv')?.addEventListener('click', () => {
        exportQuestions('csv');
    });

    // Download CSV Template
    document.getElementById('btn-download-csv-template')?.addEventListener('click', () => {
        const csvTemplate = [
            'Category,Question,ChoiceA,ChoiceB,ChoiceC,ChoiceD,ChoiceE,ChoiceF,CorrectAnswer,FunFact,Duration,Points',
            'Gaming,"In what year was Super Mario World released in Japan?",1988,1990,1991,1992,,,B,"It launched alongside the Super Famicom in 1990.",20,100',
            'Science,"True or False: Light travels faster than sound.",True,False,,,,,True,"Light travels roughly 874,000 times faster than sound in air.",15,50'
        ].join('\r\n');
        const blob = new Blob([csvTemplate], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'trivia-questions-template.csv';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    });

    // Import modal
    document.getElementById('btn-import-modal')?.addEventListener('click', () => {
        const txt = document.getElementById('import-json');
        const rep = document.getElementById('import-replace');
        const fileEl = document.getElementById('import-file');
        if (txt) txt.value = '';
        if (rep) rep.checked = false;
        if (fileEl) fileEl.value = '';
        document.getElementById('import-modal')?.classList.add('open');
    });
    document.getElementById('import-file')?.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const text = await file.text();
        const txt = document.getElementById('import-json');
        if (txt) txt.value = text;
    });
    document.getElementById('btn-close-import-modal')?.addEventListener('click', () => {
        document.getElementById('import-modal')?.classList.remove('open');
    });
    document.getElementById('btn-cancel-import')?.addEventListener('click', () => {
        document.getElementById('import-modal')?.classList.remove('open');
    });
    document.getElementById('btn-confirm-import')?.addEventListener('click', async () => {
        const raw = document.getElementById('import-json')?.value.trim() || '';
        const replace = Boolean(document.getElementById('import-replace')?.checked);
        if (!raw) {
            alert('Please upload a CSV or JSON file, or paste question data first.');
            return;
        }
        let payload;
        if (raw.startsWith('[') || raw.startsWith('{')) {
            try {
                const parsed = JSON.parse(raw);
                payload = Array.isArray(parsed) ? parsed : (parsed.questions || []);
            } catch (err) {
                alert('Invalid JSON format: ' + err.message);
                return;
            }
        } else {
            payload = raw;
        }
        const success = await importQuestions(payload, replace);
        if (success) {
            document.getElementById('import-modal')?.classList.remove('open');
        }
    });

    // Save Settings
    document.getElementById('btn-save-settings')?.addEventListener('click', async () => {
        const transitionMode = document.getElementById('cfg-transition-mode')?.value;
        const payload = {
            defaultDuration: parseInt(document.getElementById('cfg-duration')?.value, 10) || 20,
            revealDelay: Number(document.getElementById('cfg-reveal-delay')?.value ?? 6),
            advanceDelay: Number(document.getElementById('cfg-advance-delay')?.value ?? 6),
            autoReveal: transitionMode === 'auto',
            manualTransition: transitionMode === 'manual',
            chatVoting: document.getElementById('cfg-chat-voting')?.checked,
            autoAdvance: document.getElementById('cfg-auto-advance')?.checked,
            randomOrder: document.getElementById('cfg-random-order')?.checked,
            randomizeChoices: document.getElementById('cfg-randomize-choices')?.checked,
            soundEnabled: document.getElementById('cfg-sound-enabled')?.checked
        };
        await saveSettings(payload);
    });

    // Save Theme
    document.getElementById('btn-save-theme')?.addEventListener('click', async () => {
        const cardMaxWidth = document.getElementById('cfg-theme-card-width')?.value.trim() || '1100px';
        if (!CSS.supports('max-width', cardMaxWidth)) {
            alert('Enter a valid card width, such as 1400px, 85vw, or 100%.');
            return;
        }
        const payload = {
            preset: document.getElementById('cfg-theme-preset')?.value,
            cardStyle: document.getElementById('cfg-theme-card-style')?.value,
            cardMaxWidth,
            questionFont: document.getElementById('cfg-theme-question-font')?.value.trim(),
            questionWeight: document.getElementById('cfg-theme-question-weight')?.value,
            headerFont: document.getElementById('cfg-theme-header-font')?.value.trim(),
            headerWeight: document.getElementById('cfg-theme-header-weight')?.value,
            choiceFont: document.getElementById('cfg-theme-choice-font')?.value.trim(),
            choiceWeight: document.getElementById('cfg-theme-choice-weight')?.value,
            funfactFont: document.getElementById('cfg-theme-funfact-font')?.value.trim(),
            funfactWeight: document.getElementById('cfg-theme-funfact-weight')?.value,
            fontScale: parseFloat(document.getElementById('cfg-theme-scale')?.value) || 1.0,
            cardBg: getColorFieldValue('cfg-theme-card-bg'),
            cardBorderColor: getColorFieldValue('cfg-theme-card-border'),
            choiceBg: getColorFieldValue('cfg-theme-choice-bg'),
            choiceBorderColor: getColorFieldValue('cfg-theme-choice-border'),
            cardBlur: Number(document.getElementById('cfg-theme-blur')?.value ?? 12),
            accentColor: getColorFieldValue('cfg-theme-accent-color'),
            correctColor: getColorFieldValue('cfg-theme-correct-color'),
            categoryColor: getColorFieldValue('cfg-theme-category-color'),
            hintColor: getColorFieldValue('cfg-theme-hint-color'),
            funfactColor: getColorFieldValue('cfg-theme-funfact-color'),
            timerColor: getColorFieldValue('cfg-theme-timer-color'),
            timerWarningColor: getColorFieldValue('cfg-theme-timer-warning-color'),
            timerCriticalColor: getColorFieldValue('cfg-theme-timer-critical-color'),
            collapseIncorrect: document.getElementById('cfg-theme-collapse-incorrect')?.checked,
            questionLabel: document.getElementById('cfg-theme-question-label')?.value.trim() || 'Question',
            answerLabel: document.getElementById('cfg-theme-answer-label')?.value.trim() || 'Answer',
            counterFormat: document.getElementById('cfg-theme-counter-format')?.value || 'full',
            phaseTransform: document.getElementById('cfg-theme-phase-transform')?.value || 'uppercase',
            headerFontSize: getHeaderFontSizeValue(),
            phaseFont: document.getElementById('cfg-theme-phase-font')?.value.trim(),
            phaseQuestionColor: getColorFieldValue('cfg-theme-phase-question-color'),
            phaseAnswerColor: getColorFieldValue('cfg-theme-phase-answer-color'),
            showPhaseIndicator: document.getElementById('cfg-elem-phase-indicator')?.checked,
            showCategory: document.getElementById('cfg-elem-category')?.checked,
            showQuestionNumber: document.getElementById('cfg-elem-question-number')?.checked,
            showTimer: document.getElementById('cfg-elem-timer')?.checked,
            showLetterBadges: document.getElementById('cfg-elem-letter-badges')?.checked,
            showVoteCounts: document.getElementById('cfg-elem-votes')?.checked,
            showPercentages: document.getElementById('cfg-elem-percentages')?.checked,
            showChatHint: document.getElementById('cfg-elem-chat-hint')?.checked,
            showFunFact: document.getElementById('cfg-elem-funfact')?.checked
        };
        await saveTheme(payload);
    });
}

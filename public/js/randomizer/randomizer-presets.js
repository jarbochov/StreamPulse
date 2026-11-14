/**
 * Preset managers (Choices, Button Phrases, Winner Quotes), Elimination UI,
 * Weighting table/stepper controls, and JSON Export/Import for Randomizer Studio.
 */

import {
    DEFAULT_FALLBACK_CHOICES,
    state,
    $,
    esc,
    toast,
    isEliminated,
    playableChoices,
    getClientEffectiveWeights,
    parseRawChoicesFromTextarea,
    getChoices,
    getWeightSettings,
    getActiveWeightsMap,
    saveStudioState
} from './randomizer-state.js';

import {
    drawWheel,
    renderInitialState,
    updateDeckVisuals,
    updateObsUrl,
    updateButtonLabel
} from './randomizer-preview.js';

export function renderEliminationUI() {
    const toggle = $('elim-toggle');
    if (toggle) toggle.checked = state.currentEliminationMode;
    const restoreBtn = $('btn-reset-elim');
    if (restoreBtn) restoreBtn.style.display = state.currentEliminated.length ? '' : 'none';
    const pill = $('elim-count-pill');
    if (pill) {
        const total = state.choices.length;
        pill.textContent = (state.currentEliminationMode || state.currentEliminated.length)
            ? `${playableChoices(state.choices).length} of ${total} left`
            : 'Off';
    }
    const countPill = $('history-count-pill');
    if (countPill) {
        countPill.textContent = `${state.currentSpinHistory.length} ${state.currentSpinHistory.length === 1 ? 'entry' : 'entries'}`;
    }
    const limitSel = $('history-limit-select');
    if (limitSel) limitSel.value = String(state.currentHistoryLimit);
    const box = $('elim-history');
    if (!box) return;
    box.innerHTML = '';
    if (!state.currentSpinHistory.length) {
        box.innerHTML = '<div style="padding:1.2rem; text-align:center; font-size:.78rem; color:var(--text-muted);">No spins yet. Selections and removals will appear here.</div>';
        return;
    }
    const entries = state.currentSpinHistory.slice().reverse();
    entries.forEach(h => {
        const row = document.createElement('div');
        row.className = 'elim-history-row';
        const badge = document.createElement('span');
        const name = document.createElement('span');
        name.className = 'elim-name';
        if (h.type === 'reset') {
            badge.className = 'elim-badge restored';
            badge.textContent = 'Restored';
            name.textContent = 'All choices restored';
        } else if (h.type === 'manual') {
            badge.className = 'elim-badge ' + (h.eliminated ? 'out' : 'restored');
            badge.textContent = h.eliminated ? 'Removed' : 'Restored';
            name.textContent = h.winner;
        } else {
            badge.className = 'elim-badge ' + (h.eliminated ? 'out' : 'picked');
            badge.textContent = h.eliminated ? 'Selected, removed' : 'Selected';
            name.textContent = h.winner;
        }
        const time = document.createElement('span');
        time.className = 'elim-time';
        time.style.whiteSpace = 'nowrap';
        time.textContent = h.at
            ? new Date(h.at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
            : '';
        row.append(badge, name, time);
        box.appendChild(row);
    });
}

export function applyEliminationState(d, { redraw = true } = {}) {
    if (!d) return;
    if (d.eliminationMode !== undefined) state.currentEliminationMode = !!d.eliminationMode;
    if (Array.isArray(d.eliminated)) state.currentEliminated = [...d.eliminated];
    if (Array.isArray(d.spinHistory)) state.currentSpinHistory = [...d.spinHistory];
    if (d.historyLimit) state.currentHistoryLimit = d.historyLimit;
    renderEliminationUI();
    renderChoicesTable();
    if (redraw && !state.isSpinning) renderInitialState();
}

export async function refreshPresetsListQuietly() {
    try {
        const res = await fetch('/api/randomizer/presets').then(r => r.json());
        if (Array.isArray(res.presets)) state.presetsList = res.presets;
    } catch {}
}

export async function setChoiceOut(choice, out) {
    if (state.isSpinning) return;
    if (state.currentPresetId && state.presetsList.some(p => p.id === state.currentPresetId)) {
        try {
            const res = await fetch(`/api/randomizer/presets/${encodeURIComponent(state.currentPresetId)}/eliminated`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ choice, out })
            }).then(r => r.json());
            if (res.ok) {
                state.presetsList = res.presets;
                applyEliminationState(res.preset);
                return;
            }
        } catch {}
        return toast('Could not update the choice');
    }
    const rest = state.currentEliminated.filter(e => e.toLowerCase() !== choice.toLowerCase());
    state.currentEliminated = out ? [...rest, choice] : rest;
    state.currentSpinHistory = [...state.currentSpinHistory, { type: 'manual', winner: choice, eliminated: out, at: Date.now() }];
    applyEliminationState({});
}

export async function persistEliminationMode() {
    const existing = state.presetsList.find(p => p.id === state.currentPresetId);
    if (!existing) return;
    try {
        await fetch('/api/randomizer/presets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: existing.id,
                name: existing.name,
                choices: existing.choices,
                eliminationMode: state.currentEliminationMode
            })
        }).then(r => r.json()).then(res => { if (res.ok) state.presetsList = res.presets; });
    } catch {}
}

export function syncChoicesToTextarea() {
    if (!$('choices-textarea')) return;
    if (state.currentWeightMode === 'manual') {
        const lines = state.choices.map(c => {
            const w = state.currentWeightsMap[c];
            if (w != null && Number(w) !== 1) {
                return `${c} : ${w}`;
            }
            return c;
        });
        $('choices-textarea').value = lines.join('\n');
    } else {
        $('choices-textarea').value = state.choices.join('\n');
    }
}

export function setPresetNeedsSave(needed) {
    const btn = $('btn-save-preset');
    const notice = $('weight-save-notice');
    if (!btn) return;
    if (needed && state.currentWeightMode !== 'equal') {
        btn.classList.add('btn-needs-save');
        btn.title = 'Unsaved weighting changes — click Save to activate in OBS & Stream Deck';
        if (notice) notice.style.display = 'block';
    } else if (!needed) {
        btn.classList.remove('btn-needs-save');
        btn.title = 'Save active preset';
        if (notice && state.currentWeightMode === 'equal') notice.style.display = 'none';
    }
}

export function updateChoiceWeight(c, nextWeight, inputEl) {
    const clamped = Math.max(0.1, Math.min(1000, Number(nextWeight) || 0.1));
    const rounded = Math.round(clamped * 10) / 10;

    state.currentWeightsMap[c] = rounded;
    if (state.currentChoiceStats[c]) state.currentChoiceStats[c].effectiveWeight = rounded;

    if (inputEl && Number(inputEl.value) !== rounded) {
        inputEl.value = rounded;
    }

    const list = playableChoices(state.choices);
    const { weights: effWeights, totalWeight, mode } = getClientEffectiveWeights(list);
    const avgProb = totalWeight > 0 ? (100 / Math.max(1, list.length)) : 0;

    const tbody = $('choices-table-body');
    if (tbody) {
        const rows = tbody.querySelectorAll('tr[data-choice]');
        rows.forEach(row => {
            const rowChoice = row.dataset.choice;
            if (!rowChoice || isEliminated(rowChoice)) return;
            const rEffW = effWeights[rowChoice] != null ? effWeights[rowChoice] : 1;
            const rProb = totalWeight > 0 ? ((rEffW / totalWeight) * 100).toFixed(1) : (100 / list.length).toFixed(1);
            const probClass = Number(rProb) > avgProb * 1.25 ? 'high' : (Number(rProb) < avgProb * 0.75 ? 'low' : '');

            const badge = row.querySelector('.prob-badge');
            if (badge) {
                badge.className = `prob-badge ${probClass}`.trim();
                badge.textContent = `${rProb}%`;
            }

            const stats = row.querySelector('.choice-weight-stats');
            if (stats && (mode === 'growth' || mode === 'momentum')) {
                const picks = state.currentChoiceStats[rowChoice]?.picks || 0;
                const unpicked = state.currentChoiceStats[rowChoice]?.unpickedSpins || 0;
                stats.textContent = `Eff: ${rEffW}x (${picks} wins, ${unpicked} missed)`;
            }
        });
    }

    syncChoicesToTextarea();
    drawWheel(0, state.choices);
    setPresetNeedsSave(true);
}

export function renderChoicesTable() {
    const tbody = $('choices-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    const list = state.choices;
    const playable = playableChoices(list);
    const { weights: effWeights, totalWeight, mode } = getClientEffectiveWeights(playable);

    if ($('choices-count-pill')) {
        $('choices-count-pill').textContent = state.currentEliminationMode
            ? `${playable.length} of ${list.length} choices`
            : `${list.length} choices`;
    }

    if (!list.length) {
        const tr = document.createElement('tr');
        tr.innerHTML = '<td colspan="4" style="text-align:center; padding:1.5rem; color:var(--text-muted); font-size:.8rem;">No choices yet. Add one below or switch to Raw Text.</td>';
        tbody.appendChild(tr);
        return;
    }

    const avgProb = totalWeight > 0 ? (100 / Math.max(1, playable.length)) : 0;

    list.forEach((c, idx) => {
        const tr = document.createElement('tr');
        tr.dataset.choice = c;
        const out = isEliminated(c);
        if (out) tr.classList.add('eliminated-row');
        const effW = effWeights[c] != null ? effWeights[c] : 1;
        const baseW = state.currentWeightsMap[c] != null ? state.currentWeightsMap[c] : (state.currentWeightSettings.base || 1);
        const prob = totalWeight > 0 ? ((effW / totalWeight) * 100).toFixed(1) : (100 / list.length).toFixed(1);

        const probClass = Number(prob) > avgProb * 1.25 ? 'high' : (Number(prob) < avgProb * 0.75 ? 'low' : '');

        const tdName = document.createElement('td');
        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.className = 'choice-name-input';
        nameInput.value = c;
        nameInput.onchange = e => {
            const newName = e.target.value.trim();
            if (!newName) {
                renderChoicesTable();
                return;
            }
            if (newName !== c) {
                state.choices[idx] = newName;
                if (state.currentWeightsMap[c] != null) {
                    state.currentWeightsMap[newName] = state.currentWeightsMap[c];
                    delete state.currentWeightsMap[c];
                }
                if (state.currentChoiceStats[c]) {
                    state.currentChoiceStats[newName] = state.currentChoiceStats[c];
                    delete state.currentChoiceStats[c];
                }
                syncChoicesToTextarea();
                renderChoicesTable();
                drawWheel(0, state.choices);
            }
        };
        tdName.appendChild(nameInput);
        tr.appendChild(tdName);

        const tdWeight = document.createElement('td');
        tdWeight.style.textAlign = 'center';

        if (mode === 'equal') {
            tdWeight.innerHTML = '<span style="color:var(--text-muted); font-size:.74rem; font-weight:600;">1.0&times;</span>';
        } else {
            const stepper = document.createElement('div');
            stepper.className = 'weight-stepper';
            const step = (state.currentWeightMode === 'manual') ? 0.1 : (state.currentWeightSettings.step || 1);

            const wInput = document.createElement('input');
            wInput.type = 'number';
            wInput.min = '0.1';
            wInput.max = '1000';
            wInput.step = String(step);
            wInput.value = baseW;
            wInput.setAttribute('aria-label', `Weight for ${c}`);

            const btnMinus = document.createElement('button');
            btnMinus.type = 'button';
            btnMinus.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"/></svg>';
            btnMinus.title = 'Decrease weight by ' + step + ' (or hold Shift for 1.0)';
            btnMinus.onclick = e => {
                e.preventDefault();
                const cur = Number(wInput.value) || Number(baseW) || 1;
                const s = e.shiftKey ? (step < 1 ? 1 : 5) : step;
                updateChoiceWeight(c, Math.max(0.1, cur - s), wInput);
                wInput.focus();
            };

            wInput.onkeydown = e => {
                const s = e.shiftKey ? (step < 1 ? 1 : 5) : step;
                if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    const cur = Number(wInput.value) || Number(baseW) || 1;
                    updateChoiceWeight(c, cur + s, wInput);
                } else if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    const cur = Number(wInput.value) || Number(baseW) || 1;
                    updateChoiceWeight(c, Math.max(0.1, cur - s), wInput);
                }
            };

            wInput.oninput = e => {
                const val = Number(e.target.value);
                if (!isNaN(val) && val > 0) {
                    updateChoiceWeight(c, val, wInput);
                }
            };

            wInput.onchange = e => {
                const val = Math.max(0.1, Number(e.target.value) || 0.1);
                updateChoiceWeight(c, val, wInput);
            };

            const btnPlus = document.createElement('button');
            btnPlus.type = 'button';
            btnPlus.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
            btnPlus.title = 'Increase weight by ' + step + ' (or hold Shift for 1.0)';
            btnPlus.onclick = e => {
                e.preventDefault();
                const cur = Number(wInput.value) || Number(baseW) || 1;
                const s = e.shiftKey ? (step < 1 ? 1 : 5) : step;
                updateChoiceWeight(c, cur + s, wInput);
                wInput.focus();
            };

            stepper.appendChild(btnMinus);
            stepper.appendChild(wInput);
            stepper.appendChild(btnPlus);
            tdWeight.appendChild(stepper);

            if (mode === 'growth' || mode === 'momentum') {
                const statsSpan = document.createElement('div');
                statsSpan.className = 'choice-weight-stats';
                statsSpan.style.cssText = 'font-size:.66rem; color:var(--text-muted); margin-top:3px;';
                const picks = state.currentChoiceStats[c]?.picks || 0;
                const unpicked = state.currentChoiceStats[c]?.unpickedSpins || 0;
                statsSpan.textContent = `Eff: ${effW}x (${picks} wins, ${unpicked} missed)`;
                tdWeight.appendChild(statsSpan);
            }
        }
        tr.appendChild(tdWeight);

        const tdProb = document.createElement('td');
        tdProb.style.textAlign = 'center';
        tdProb.innerHTML = out
            ? '<span class="elim-badge out">Out</span>'
            : `<span class="prob-badge ${probClass}">${prob}%</span>`;
        tr.appendChild(tdProb);

        const tdDel = document.createElement('td');
        tdDel.style.whiteSpace = 'nowrap';
        const outBtn = document.createElement('button');
        outBtn.type = 'button';
        outBtn.className = 'choice-del-btn';
        outBtn.title = out ? `Put "${c}" back in the pool` : `Take "${c}" out of the pool (keeps the choice)`;
        outBtn.innerHTML = out
            ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>'
            : '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="9"/><line x1="5.6" y1="5.6" x2="18.4" y2="18.4"/></svg>';
        outBtn.onclick = () => setChoiceOut(c, !out);
        tdDel.appendChild(outBtn);

        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'choice-del-btn';
        delBtn.title = `Remove "${c}"`;
        delBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
        delBtn.onclick = () => {
            state.choices.splice(idx, 1);
            delete state.currentWeightsMap[c];
            delete state.currentChoiceStats[c];
            syncChoicesToTextarea();
            renderChoicesTable();
            drawWheel(0, state.choices);
        };
        tdDel.appendChild(delBtn);
        tr.appendChild(tdDel);

        tbody.appendChild(tr);
    });
}

export function updateWeightControlsUI() {
    document.querySelectorAll('.weight-mode-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === state.currentWeightMode);
    });
    const pill = $('weight-mode-pill');
    if (pill) {
        if (state.currentWeightMode === 'equal') pill.textContent = 'Equal (1x)';
        else if (state.currentWeightMode === 'manual') pill.textContent = 'Manual Weights';
        else if (state.currentWeightMode === 'growth') pill.textContent = 'Pity / Growth Mode';
        else if (state.currentWeightMode === 'momentum') pill.textContent = 'Hot Streak Mode';
    }
    const settingsBar = $('weight-settings-bar');
    const stepLabel = $('weight-step-label');
    const maxLabel = $('weight-max-label');
    const baseLabel = $('weight-base-label');
    const resetBtn = $('btn-reset-weights');
    const resetText = $('btn-reset-weights-text');
    const notice = $('weight-save-notice');
    const noticeText = $('weight-save-notice-text');

    if (settingsBar) {
        if (state.currentWeightMode === 'equal') {
            settingsBar.style.display = 'none';
            if (notice) notice.style.display = 'none';
        } else if (state.currentWeightMode === 'manual') {
            settingsBar.style.display = 'flex';
            if (stepLabel) stepLabel.style.display = 'none';
            if (maxLabel) maxLabel.style.display = 'none';
            if (baseLabel) baseLabel.style.display = 'none';
            if (resetBtn) {
                resetBtn.title = 'Reset all choice weights back to equal 1.0 odds';
                if (resetText) resetText.textContent = 'Reset to Equal (1.0)';
            }
            if (notice) {
                notice.style.display = 'block';
                if (noticeText) noticeText.innerHTML = 'Manual weights are stored in your active <strong>Choice Preset</strong>. Click <strong>Save</strong> above to activate these weights in OBS overlays and Stream Deck triggers.';
            }
        } else if (state.currentWeightMode === 'growth') {
            settingsBar.style.display = 'flex';
            if (stepLabel) stepLabel.style.display = 'flex';
            if (maxLabel) maxLabel.style.display = 'flex';
            if (baseLabel) baseLabel.style.display = 'flex';
            if (resetBtn) {
                resetBtn.title = 'Clear accrued unpicked pity weights back to baseline (does not delete custom choices)';
                if (resetText) resetText.textContent = 'Reset Pity Streaks';
            }
            if (notice) {
                notice.style.display = 'block';
                if (noticeText) noticeText.innerHTML = 'Growth (Pity) mode adjusts weights dynamically on each spin. Click <strong>Save</strong> above to link this mode to your active preset.';
            }
        } else if (state.currentWeightMode === 'momentum') {
            settingsBar.style.display = 'flex';
            if (stepLabel) stepLabel.style.display = 'flex';
            if (maxLabel) maxLabel.style.display = 'flex';
            if (baseLabel) baseLabel.style.display = 'flex';
            if (resetBtn) {
                resetBtn.title = 'Clear accrued winning streak weights back to baseline (does not delete custom choices)';
                if (resetText) resetText.textContent = 'Reset Win Streaks';
            }
            if (notice) {
                notice.style.display = 'block';
                if (noticeText) noticeText.innerHTML = 'Momentum mode boosts repeat winners. Click <strong>Save</strong> above to link this mode and streak history to your active preset.';
            }
        }
    }
    if ($('weight-step-input')) $('weight-step-input').value = state.currentWeightSettings.step || 1;
    if ($('weight-max-input')) $('weight-max-input').value = state.currentWeightSettings.max || 20;
    if ($('weight-base-input')) $('weight-base-input').value = state.currentWeightSettings.base || 1;
    renderChoicesTable();
}

export function setChoices(newChoices, weights = null, stats = null, mode = null) {
    state.choices = newChoices.map(c => c.trim()).filter(Boolean);
    if (weights) state.currentWeightsMap = { ...weights };
    if (stats) state.currentChoiceStats = { ...stats };
    if (mode) state.currentWeightMode = mode;
    syncChoicesToTextarea();
    renderChoicesTable();
    renderEliminationUI();
    updateObsUrl();
    renderInitialState();
}

// 1. Choices Presets
export async function fetchChoicesPresets() {
    try {
        const res = await fetch('/api/randomizer/presets').then(r => r.json());
        if (res.presets && Array.isArray(res.presets)) {
            state.presetsList = res.presets;
            populateChoicesPresetsDropdown();
        }
    } catch (e) {
        console.error('Failed to load choice presets:', e);
    }
}

export function populateChoicesPresetsDropdown() {
    const sel = $('preset-select');
    if (!sel) return;
    sel.innerHTML = '';

    const optCustom = document.createElement('optgroup');
    optCustom.label = 'Saved Presets';
    state.presetsList.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = `${p.name} (${p.choices?.length || 0} choices)`;
        if (p.id === state.currentPresetId) opt.selected = true;
        optCustom.appendChild(opt);
    });
    sel.appendChild(optCustom);

    const optDynamic = document.createElement('optgroup');
    optDynamic.label = 'Dynamic Sources';
    const optChat = document.createElement('option');
    optChat.value = 'chatters';
    optChat.textContent = 'Active Stream Chatters (Current Session)';
    if (state.currentPresetId === 'chatters') optChat.selected = true;
    optDynamic.appendChild(optChat);

    const optVar = document.createElement('option');
    optVar.value = 'variables';
    optVar.textContent = 'StreamPulse List Variable…';
    if (state.currentPresetId === 'variables') optVar.selected = true;
    optDynamic.appendChild(optVar);

    sel.appendChild(optDynamic);
    loadSelectedChoicesPreset();
}

export function loadSelectedChoicesPreset() {
    const selVal = $('preset-select')?.value || state.currentPresetId;
    state.currentPresetId = selVal;
    if ($('var-picker-row')) $('var-picker-row').style.display = selVal === 'variables' ? 'block' : 'none';

    const matched = state.presetsList.find(p => p.id === selVal);
    if (matched) {
        if (state.currentPresetId !== matched.id && $('preset-select')) $('preset-select').value = matched.id;
        state.currentPresetId = matched.id;
        state.currentWeightMode = matched.weightMode || 'equal';
        state.currentWeightSettings = matched.weightSettings || { step: 1, max: 20, base: 1 };
        state.currentWeightsMap = matched.weights || {};
        state.currentChoiceStats = matched.choiceStats || {};
        state.currentEliminationMode = !!matched.eliminationMode;
        state.currentEliminated = matched.eliminated || [];
        state.currentSpinHistory = matched.spinHistory || [];
        state.currentHistoryLimit = matched.historyLimit || 100;
        updateWeightControlsUI();
        setChoices(matched.choices || [], state.currentWeightsMap, state.currentChoiceStats, state.currentWeightMode);
        if ($('winner-header-input')) {
            if (!state.isInitialLoad || !state.savedStudio?.winnerHeader) {
                $('winner-header-input').value = matched.winnerHeader || 'THE UNIVERSE HAS DECIDED';
            }
        }
        if (matched.buttonPreset) {
            state.currentBtnPresetId = matched.buttonPreset;
            if ($('btn-preset-select')) $('btn-preset-select').value = matched.buttonPreset;
            loadSelectedButtonPreset();
        }
        if (matched.quotePreset) {
            state.currentQuotePresetId = matched.quotePreset;
            if ($('quote-preset-select')) $('quote-preset-select').value = matched.quotePreset;
            loadSelectedQuotePreset();
        }
        if (matched.deckLogo !== undefined) {
            state.currentDeckLogo = matched.deckLogo;
            if ($('deck-logo-input')) $('deck-logo-input').value = matched.deckLogo;
        }
        if (matched.deckWatermark !== undefined) {
            state.currentDeckWatermark = matched.deckWatermark;
            if ($('deck-watermark-input')) $('deck-watermark-input').value = matched.deckWatermark;
        }
        updateDeckVisuals();
    } else if (selVal === 'chatters') {
        if ($('preset-select')) $('preset-select').value = 'chatters';
        state.currentEliminated = [];
        state.currentSpinHistory = [];
        state.currentWeightMode = 'equal';
        updateWeightControlsUI();
        loadChatters();
    } else if (selVal === 'variables') {
        if ($('preset-select')) $('preset-select').value = 'variables';
        state.currentEliminated = [];
        state.currentSpinHistory = [];
        state.currentWeightMode = 'equal';
        updateWeightControlsUI();
        loadVariables();
    } else if (state.presetsList.length) {
        const fallback = state.presetsList[0];
        state.currentPresetId = fallback.id;
        if ($('preset-select')) $('preset-select').value = fallback.id;
        state.currentWeightMode = fallback.weightMode || 'equal';
        state.currentWeightSettings = fallback.weightSettings || { step: 1, max: 20, base: 1 };
        state.currentWeightsMap = fallback.weights || {};
        state.currentChoiceStats = fallback.choiceStats || {};
        state.currentEliminationMode = !!fallback.eliminationMode;
        state.currentEliminated = fallback.eliminated || [];
        state.currentSpinHistory = fallback.spinHistory || [];
        state.currentHistoryLimit = fallback.historyLimit || 100;
        updateWeightControlsUI();
        setChoices(fallback.choices || [], state.currentWeightsMap, state.currentChoiceStats, state.currentWeightMode);
    } else {
        state.currentWeightMode = 'equal';
        updateWeightControlsUI();
        setChoices(DEFAULT_FALLBACK_CHOICES);
    }
    updateObsUrl();
    setPresetNeedsSave(false);
    if (!state.isInitialLoad) saveStudioState();
}

// 2. Button Phrase Presets
export async function fetchButtonPresets() {
    try {
        const res = await fetch('/api/randomizer/button-presets').then(r => r.json());
        if (res.presets && Array.isArray(res.presets)) {
            state.buttonPresetsList = res.presets;
            populateButtonPresetsDropdown();
        }
    } catch (e) {
        console.error('Failed to load button presets:', e);
    }
}

export function populateButtonPresetsDropdown() {
    const sel = $('btn-preset-select');
    if (!sel) return;
    sel.innerHTML = '';
    state.buttonPresetsList.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = `${p.name} (${p.phrases?.length || 0} phrases)`;
        if (p.id === state.currentBtnPresetId) opt.selected = true;
        sel.appendChild(opt);
    });
    const optStatic = document.createElement('option');
    optStatic.value = 'static';
    optStatic.textContent = 'Fixed Single Title';
    if (state.currentBtnPresetId === 'static') optStatic.selected = true;
    sel.appendChild(optStatic);

    loadSelectedButtonPreset();
}

export function loadSelectedButtonPreset() {
    const selVal = $('btn-preset-select')?.value || state.currentBtnPresetId;
    state.currentBtnPresetId = selVal;
    const staticRow = $('btn-text-static-row');

    if (selVal === 'static') {
        if (staticRow) staticRow.style.display = 'block';
        state.activeButtonPhrases = [$('btn-text-static')?.value.trim() || 'Spin Now!'];
        if ($('btn-phrases-count-pill')) $('btn-phrases-count-pill').textContent = '1 title';
    } else {
        if (staticRow) staticRow.style.display = 'none';
        const matched = state.buttonPresetsList.find(p => p.id === selVal);
        if (matched) {
            state.activeButtonPhrases = [...(matched.phrases || [])];
            if ($('btn-phrases-textarea')) $('btn-phrases-textarea').value = state.activeButtonPhrases.join('\n');
            if ($('btn-phrases-count-pill')) $('btn-phrases-count-pill').textContent = `${state.activeButtonPhrases.length} phrases`;
        }
    }
    updateButtonLabel();
    updateObsUrl();
    if (!state.isInitialLoad) saveStudioState();
}

// 3. Winner Quote Presets
export async function fetchQuotePresets() {
    try {
        const res = await fetch('/api/randomizer/quote-presets').then(r => r.json());
        if (res.presets && Array.isArray(res.presets)) {
            state.quotePresetsList = res.presets;
            populateQuotePresetsDropdown();
        }
    } catch (e) {
        console.error('Failed to load quote presets:', e);
    }
}

export function populateQuotePresetsDropdown() {
    const sel = $('quote-preset-select');
    if (!sel) return;
    sel.innerHTML = '';
    state.quotePresetsList.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = `${p.name} (${p.quotes?.length || 0} quotes)`;
        if (p.id === state.currentQuotePresetId) opt.selected = true;
        sel.appendChild(opt);
    });
    loadSelectedQuotePreset();
}

export function loadSelectedQuotePreset() {
    const selVal = $('quote-preset-select')?.value || state.currentQuotePresetId;
    state.currentQuotePresetId = selVal;
    const matched = state.quotePresetsList.find(p => p.id === selVal);
    if (matched) {
        state.activeQuotesPool = [...(matched.quotes || [])];
        if ($('quotes-textarea')) $('quotes-textarea').value = state.activeQuotesPool.join('\n');
        if ($('quotes-count-pill')) $('quotes-count-pill').textContent = `${state.activeQuotesPool.length} quotes`;
    }
    updateObsUrl();
    if (!state.isInitialLoad) saveStudioState();
}

export async function loadChatters() {
    try {
        const res = await fetch('/api/randomizer/chatters').then(r => r.json());
        if (res.chatters && res.chatters.length) {
            setChoices(res.chatters);
            const label = res.sessionCount ? `${res.chatters.length} active session chatters` : `${res.chatters.length} recent chatters`;
            toast(`Loaded ${label}`);
        } else {
            toast('No active chatters recorded in session yet');
            setChoices(['(No active chatters yet)']);
        }
    } catch (e) { toast('Could not load chatters: ' + e.message); }
}

export async function loadVariables() {
    try {
        const res = await fetch('/api/variables').then(r => r.json());
        const lists = (res.variables || []).filter(v => v.type === 'list');
        const sel = $('var-select');
        sel.innerHTML = lists.length
            ? lists.map(v => `<option value="${esc(v.name)}">${esc(v.name)} (${v.items?.length || 0} items)</option>`).join('')
            : '<option value="">(No list variables found)</option>';
        if (lists.length) setChoices(lists[0].items || []);
        sel.onchange = () => {
            const chosen = lists.find(v => v.name === sel.value);
            if (chosen) setChoices(chosen.items || []);
        };
    } catch (e) { toast('Could not load variables'); }
}

export function exportRandomizerPresetsJson() {
    const payload = {
        version: 1,
        exportedAt: new Date().toISOString(),
        choicePresets: Array.isArray(state.presetsList) ? state.presetsList : [],
        buttonPresets: Array.isArray(state.buttonPresetsList) ? state.buttonPresetsList : [],
        quotePresets: Array.isArray(state.quotePresetsList) ? state.quotePresetsList : []
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'streampulse-randomizer-presets.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    const total = payload.choicePresets.length + payload.buttonPresets.length + payload.quotePresets.length;
    toast(`Exported ${total} randomizer preset(s)`);
}

export async function importRandomizerPresetsJson(event) {
    const input = event?.target;
    const file = input?.files?.[0];
    if (!file) return;
    try {
        const parsed = JSON.parse(await file.text());
        const choiceList = Array.isArray(parsed)
            ? parsed
            : (Array.isArray(parsed?.choicePresets)
                ? parsed.choicePresets
                : (Array.isArray(parsed?.presets) ? parsed.presets : []));
        const btnList = Array.isArray(parsed?.buttonPresets) ? parsed.buttonPresets : [];
        const quoteList = Array.isArray(parsed?.quotePresets) ? parsed.quotePresets : [];

        if (!choiceList.length && !btnList.length && !quoteList.length) {
            toast('No presets found in JSON file');
            return;
        }

        let imported = 0;
        for (const p of choiceList) {
            if (!p || typeof p.name !== 'string' || !p.name.trim() || !Array.isArray(p.choices) || !p.choices.length) continue;
            const res = await fetch('/api/randomizer/presets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...(p.id ? { id: String(p.id) } : {}),
                    name: p.name.trim(),
                    choices: p.choices,
                    winnerHeader: p.winnerHeader,
                    buttonPreset: p.buttonPreset,
                    quotePreset: p.quotePreset,
                    weightMode: p.weightMode,
                    weightSettings: p.weightSettings,
                    weights: p.weights,
                    choiceStats: p.choiceStats,
                    deckLogo: p.deckLogo,
                    deckWatermark: p.deckWatermark,
                    eliminationMode: p.eliminationMode,
                    eliminated: p.eliminated,
                    historyLimit: p.historyLimit
                })
            }).then(r => r.json());
            if (res.ok) imported++;
        }
        for (const p of btnList) {
            if (!p || typeof p.name !== 'string' || !p.name.trim() || !Array.isArray(p.phrases) || !p.phrases.length) continue;
            const res = await fetch('/api/randomizer/button-presets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...(p.id ? { id: String(p.id) } : {}), name: p.name.trim(), phrases: p.phrases })
            }).then(r => r.json());
            if (res.ok) imported++;
        }
        for (const p of quoteList) {
            if (!p || typeof p.name !== 'string' || !p.name.trim() || !Array.isArray(p.quotes) || !p.quotes.length) continue;
            const res = await fetch('/api/randomizer/quote-presets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...(p.id ? { id: String(p.id) } : {}), name: p.name.trim(), quotes: p.quotes })
            }).then(r => r.json());
            if (res.ok) imported++;
        }

        await Promise.all([fetchChoicesPresets(), fetchButtonPresets(), fetchQuotePresets()]);
        populateChoicesPresetsDropdown();
        populateButtonPresetsDropdown();
        populateQuotePresetsDropdown();
        toast(imported > 0 ? `Imported ${imported} randomizer preset(s)` : 'No valid presets were imported');
    } catch (err) {
        toast(`Import failed: ${err?.message || 'Invalid JSON'}`);
    } finally {
        if (input) input.value = '';
    }
}

export function bindPresetControls() {
    $('preset-select').onchange = loadSelectedChoicesPreset;

    $('btn-new-preset').onclick = async () => {
        const name = prompt('Enter a name for the new choices preset:', 'Game Night Choices');
        if (!name || !name.trim()) return;
        try {
            const res = await fetch('/api/randomizer/presets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: name.trim(), choices: ['Choice 1', 'Choice 2', 'Choice 3'] })
            }).then(r => r.json());
            if (res.ok) {
                state.presetsList = res.presets;
                state.currentPresetId = res.preset.id;
                populateChoicesPresetsDropdown();
                setChoices(res.preset.choices);
                toast(`Created choices preset "${res.preset.name}"`);
            }
        } catch (e) { toast('Failed to create preset: ' + e.message); }
    };

    $('btn-save-preset').onclick = async () => {
        const currentChoices = getChoices();
        if (!currentChoices.length) return toast('Cannot save empty preset!');
        const selVal = $('preset-select').value;
        const existing = state.presetsList.find(p => p.id === selVal);
        let name = existing ? existing.name : 'Custom Preset';
        const id = existing ? existing.id : null;

        if (!existing) {
            name = prompt('Enter preset name:', 'Custom Choices');
            if (!name) return;
        }

        try {
            const res = await fetch('/api/randomizer/presets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id,
                    name,
                    choices: currentChoices,
                    winnerHeader: $('winner-header-input')?.value.trim(),
                    buttonPreset: state.currentBtnPresetId,
                    quotePreset: state.currentQuotePresetId,
                    weightMode: state.currentWeightMode,
                    weightSettings: getWeightSettings(),
                    weights: getActiveWeightsMap(),
                    choiceStats: state.currentChoiceStats,
                    deckLogo: state.currentDeckLogo,
                    deckWatermark: state.currentDeckWatermark,
                    eliminationMode: state.currentEliminationMode,
                    eliminated: state.currentEliminated,
                    historyLimit: state.currentHistoryLimit
                })
            }).then(r => r.json());
            if (res.ok) {
                state.presetsList = res.presets;
                state.currentPresetId = res.preset.id;
                populateChoicesPresetsDropdown();
                setPresetNeedsSave(false);
                const modeLabel = state.currentWeightMode === 'equal' ? 'equal odds' : `${state.currentWeightMode} weighting`;
                toast(`Saved choices preset "${res.preset.name}" (${modeLabel})`);
            }
        } catch (e) { toast('Failed to save preset: ' + e.message); }
    };

    $('btn-rename-preset').onclick = async () => {
        const selVal = $('preset-select').value;
        const existing = state.presetsList.find(p => p.id === selVal);
        if (!existing) return toast('Select a saved preset to rename');
        const newName = prompt('Enter new preset name:', existing.name);
        if (!newName || !newName.trim()) return;

        try {
            const res = await fetch('/api/randomizer/presets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: existing.id, name: newName.trim(), choices: existing.choices })
            }).then(r => r.json());
            if (res.ok) {
                state.presetsList = res.presets;
                populateChoicesPresetsDropdown();
                toast(`Renamed to "${newName.trim()}"`);
            }
        } catch (e) { toast('Failed to rename: ' + e.message); }
    };

    $('btn-delete-preset').onclick = async () => {
        const selVal = $('preset-select').value;
        const existing = state.presetsList.find(p => p.id === selVal);
        if (!existing) return toast('Cannot delete built-in source');
        if (!confirm(`Are you sure you want to delete preset "${existing.name}"?`)) return;

        try {
            const res = await fetch('/api/randomizer/presets/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: existing.id })
            }).then(r => r.json());
            if (res.ok) {
                state.presetsList = res.presets;
                state.currentPresetId = 'jackbox';
                populateChoicesPresetsDropdown();
                toast(`Deleted preset "${existing.name}"`);
            }
        } catch (e) { toast('Failed to delete: ' + e.message); }
    };

    $('btn-reload-preset').onclick = () => {
        loadSelectedChoicesPreset();
        toast('Reloaded preset choices');
    };

    if ($('btn-export-presets')) $('btn-export-presets').onclick = exportRandomizerPresetsJson;
    if ($('btn-import-presets')) $('btn-import-presets').onclick = () => $('import-presets-file')?.click();
    if ($('import-presets-file')) $('import-presets-file').onchange = importRandomizerPresetsJson;

    $('btn-preset-select').onchange = loadSelectedButtonPreset;

    $('btn-new-btnpreset').onclick = async () => {
        const name = prompt('Enter a name for the new button phrase preset:', 'Custom Phrases');
        if (!name || !name.trim()) return;
        try {
            const res = await fetch('/api/randomizer/button-presets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: name.trim(), phrases: ['Spin Now!', 'Roll the Dice!', 'Pick One!'] })
            }).then(r => r.json());
            if (res.ok) {
                state.buttonPresetsList = res.presets;
                state.currentBtnPresetId = res.preset.id;
                populateButtonPresetsDropdown();
                toast(`Created button phrases preset "${res.preset.name}"`);
            }
        } catch (e) { toast('Failed to create button preset: ' + e.message); }
    };

    $('btn-save-btnpreset').onclick = async () => {
        const lines = ($('btn-phrases-textarea')?.value || '').split('\n').map(s => s.trim()).filter(Boolean);
        if (!lines.length) return toast('Phrases pool cannot be empty!');
        const selVal = $('btn-preset-select').value;
        const existing = state.buttonPresetsList.find(p => p.id === selVal);
        const name = existing ? existing.name : 'Custom Button Phrases';
        const id = existing ? existing.id : null;

        try {
            const res = await fetch('/api/randomizer/button-presets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, name, phrases: lines })
            }).then(r => r.json());
            if (res.ok) {
                state.buttonPresetsList = res.presets;
                state.currentBtnPresetId = res.preset.id;
                populateButtonPresetsDropdown();
                toast(`Saved button phrases preset "${res.preset.name}"`);
            }
        } catch (e) { toast('Failed to save button preset: ' + e.message); }
    };

    $('btn-rename-btnpreset').onclick = async () => {
        const selVal = $('btn-preset-select').value;
        const existing = state.buttonPresetsList.find(p => p.id === selVal);
        if (!existing) return toast('Select a button phrase preset to rename');
        const newName = prompt('Enter new button preset name:', existing.name);
        if (!newName || !newName.trim()) return;

        try {
            const res = await fetch('/api/randomizer/button-presets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: existing.id, name: newName.trim(), phrases: existing.phrases })
            }).then(r => r.json());
            if (res.ok) {
                state.buttonPresetsList = res.presets;
                populateButtonPresetsDropdown();
                toast(`Renamed to "${newName.trim()}"`);
            }
        } catch (e) { toast('Failed to rename button preset: ' + e.message); }
    };

    $('btn-delete-btnpreset').onclick = async () => {
        const selVal = $('btn-preset-select').value;
        const existing = state.buttonPresetsList.find(p => p.id === selVal);
        if (!existing) return toast('Cannot delete built-in preset');
        if (!confirm(`Are you sure you want to delete button preset "${existing.name}"?`)) return;

        try {
            const res = await fetch('/api/randomizer/button-presets/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: existing.id })
            }).then(r => r.json());
            if (res.ok) {
                state.buttonPresetsList = res.presets;
                state.currentBtnPresetId = 'chaos';
                populateButtonPresetsDropdown();
                toast(`Deleted button preset "${existing.name}"`);
            }
        } catch (e) { toast('Failed to delete button preset: ' + e.message); }
    };

    $('quote-preset-select').onchange = loadSelectedQuotePreset;

    $('btn-new-quotepreset').onclick = async () => {
        const name = prompt('Enter a name for the new quotes pool preset:', 'Custom Quotes');
        if (!name || !name.trim()) return;
        try {
            const res = await fetch('/api/randomizer/quote-presets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: name.trim(),
                    quotes: ['Destiny has spoken!', 'The universe approves.', 'Outcome locked in!']
                })
            }).then(r => r.json());
            if (res.ok) {
                state.quotePresetsList = res.presets;
                state.currentQuotePresetId = res.preset.id;
                populateQuotePresetsDropdown();
                toast(`Created quotes preset "${res.preset.name}"`);
            }
        } catch (e) { toast('Failed to create quote preset: ' + e.message); }
    };

    $('btn-save-quotepreset').onclick = async () => {
        const lines = ($('quotes-textarea')?.value || '').split('\n').map(s => s.trim()).filter(Boolean);
        if (!lines.length) return toast('Quotes pool cannot be empty!');
        const selVal = $('quote-preset-select').value;
        const existing = state.quotePresetsList.find(p => p.id === selVal);
        const name = existing ? existing.name : 'Custom Quotes Pool';
        const id = existing ? existing.id : null;

        try {
            const res = await fetch('/api/randomizer/quote-presets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, name, quotes: lines })
            }).then(r => r.json());
            if (res.ok) {
                state.quotePresetsList = res.presets;
                state.currentQuotePresetId = res.preset.id;
                populateQuotePresetsDropdown();
                toast(`Saved quotes preset "${res.preset.name}"`);
            }
        } catch (e) { toast('Failed to save quotes preset: ' + e.message); }
    };

    $('btn-rename-quotepreset').onclick = async () => {
        const selVal = $('quote-preset-select').value;
        const existing = state.quotePresetsList.find(p => p.id === selVal);
        if (!existing) return toast('Select a quotes preset to rename');
        const newName = prompt('Enter new quote preset name:', existing.name);
        if (!newName || !newName.trim()) return;

        try {
            const res = await fetch('/api/randomizer/quote-presets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: existing.id, name: newName.trim(), quotes: existing.quotes })
            }).then(r => r.json());
            if (res.ok) {
                state.quotePresetsList = res.presets;
                populateQuotePresetsDropdown();
                toast(`Renamed to "${newName.trim()}"`);
            }
        } catch (e) { toast('Failed to rename quote preset: ' + e.message); }
    };

    $('btn-delete-quotepreset').onclick = async () => {
        const selVal = $('quote-preset-select').value;
        const existing = state.quotePresetsList.find(p => p.id === selVal);
        if (!existing) return toast('Cannot delete built-in preset');
        if (!confirm(`Are you sure you want to delete quote preset "${existing.name}"?`)) return;

        try {
            const res = await fetch('/api/randomizer/quote-presets/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: existing.id })
            }).then(r => r.json());
            if (res.ok) {
                state.quotePresetsList = res.presets;
                state.currentQuotePresetId = 'multiverse';
                populateQuotePresetsDropdown();
                toast(`Deleted quote preset "${existing.name}"`);
            }
        } catch (e) { toast('Failed to delete quote preset: ' + e.message); }
    };
}

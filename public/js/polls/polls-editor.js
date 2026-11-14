/**
 * StreamPulse Poll Studio — Poll Editor, Presets & History
 */

import {
    $,
    esc,
    toast,
    choiceCount,
    setChoiceCount,
    maxChoices,
    selectedDuration,
    setSelectedDuration,
    savedPresetsList,
    setSavedPresetsList
} from './polls-state.js';
import { updatePreview } from './polls-preview.js';

export { choiceCount, maxChoices, selectedDuration, setSelectedDuration, savedPresetsList };

export const DRAFT_STORAGE_KEY = 'sp-polls-draft';

export function savePollDraft() {
    try {
        const title = $('poll-question')?.value || '';
        const inputs = $('choices-container')?.querySelectorAll('.choice-input') || [];
        const choices = [...inputs].map(inp => inp.value);
        const draft = {
            title,
            choices,
            duration: selectedDuration,
            blind: $('poll-blind')?.checked || false,
            keywordVoting: $('poll-keywords')?.checked !== false,
            subMultiplier: $('poll-sub-multiplier')?.checked ? 2 : 1,
            presetId: $('preset-select')?.value || ''
        };
        localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
    } catch {}
}

export function restorePollDraft() {
    try {
        const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
        if (!raw) return false;
        const draft = JSON.parse(raw);
        if (!draft || !Array.isArray(draft.choices) || draft.choices.length < 2) return false;
        if ($('poll-question')) $('poll-question').value = draft.title || '';
        const container = $('choices-container');
        if (container) container.innerHTML = '';
        setChoiceCount(0);
        draft.choices.forEach(c => addChoiceField(c));
        if (draft.duration !== undefined) {
            setSelectedDuration(draft.duration);
            document.querySelectorAll('#duration-chips .chip-btn').forEach(b => {
                b.classList.toggle('active', parseInt(b.dataset.dur, 10) === draft.duration);
            });
        }
        if (draft.blind !== undefined && $('poll-blind')) $('poll-blind').checked = !!draft.blind;
        if (draft.keywordVoting !== undefined && $('poll-keywords')) $('poll-keywords').checked = !!draft.keywordVoting;
        if (draft.subMultiplier !== undefined && $('poll-sub-multiplier')) $('poll-sub-multiplier').checked = draft.subMultiplier > 1;
        if (draft.presetId && $('preset-select')) $('preset-select').value = draft.presetId;
        updatePreview();
        return true;
    } catch {
        return false;
    }
}

export function addChoiceField(initialValue = '') {
    if (choiceCount >= maxChoices) return;
    setChoiceCount(choiceCount + 1);
    const container = $('choices-container');
    const row = document.createElement('div');
    row.className = 'choice-row';
    row.dataset.id = String(choiceCount);
    row.innerHTML = `
        <span class="choice-num">${choiceCount}</span>
        <input type="text" class="form-control choice-input" placeholder="Option ${choiceCount}" value="${esc(initialValue)}" required autocomplete="off">
        ${choiceCount > 2 ? `
            <button type="button" class="choice-del-btn" onclick="removeChoiceField(this)" title="Remove option">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
        ` : '<div style="width: 28px; flex-shrink: 0;"></div>'}
    `;
    container.appendChild(row);
    updateAddButtonState();
    row.querySelector('.choice-input').addEventListener('input', () => {
        savePollDraft();
        updatePreview();
    });
    savePollDraft();
    updatePreview();
}

export function removeChoiceField(btn) {
    if (choiceCount <= 2) return;
    const row = btn.closest('.choice-row');
    row.remove();
    setChoiceCount(choiceCount - 1);
    reindexChoices();
    updateAddButtonState();
    savePollDraft();
    updatePreview();
}

export function reindexChoices() {
    const rows = $('choices-container').querySelectorAll('.choice-row');
    setChoiceCount(rows.length);
    rows.forEach((r, idx) => {
        const num = idx + 1;
        r.dataset.id = String(num);
        r.querySelector('.choice-num').textContent = num;
        r.querySelector('.choice-input').placeholder = `Option ${num}`;
    });
}

export function updateAddButtonState() {
    const btn = $('btn-add-choice');
    if (!btn) return;
    btn.disabled = choiceCount >= maxChoices;
    btn.style.opacity = choiceCount >= maxChoices ? '0.5' : '1';
}

// Duration Chips
const chips = document.querySelectorAll('#duration-chips .chip-btn');
chips.forEach(btn => {
    btn.addEventListener('click', () => {
        chips.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        setSelectedDuration(parseInt(btn.dataset.dur, 10));
        savePollDraft();
        updatePreview();
    });
});

// Watch poll question and spice toggles
$('poll-question')?.addEventListener('input', () => {
    savePollDraft();
    updatePreview();
});
$('poll-blind')?.addEventListener('change', savePollDraft);
$('poll-keywords')?.addEventListener('change', savePollDraft);
$('poll-sub-multiplier')?.addEventListener('change', savePollDraft);

        // Pull from Game Plan
export async function pullFromGamePlan() {
            try {
                const res = await fetch('/api/game-plan');
                const plan = await res.json();
                const tonight = (plan.items || []).filter(i => i.list === 'tonight' || i.period === '@today');
                const pool = tonight.length >= 2 ? tonight : (plan.items || []);

                if (pool.length < 2) {
                    toast('Need at least 2 games in Game Plan to pull from!');
                    return;
                }

                $('poll-question').value = 'Which game should we play next?';
                $('choices-container').innerHTML = '';
                choiceCount = 0;
                pool.slice(0, 4).forEach(item => {
                    addChoiceField(item.title);
                });
                toast(`Loaded ${Math.min(4, pool.length)} games from Game Plan!`);
            } catch (err) {
                toast('Could not fetch Game Plan data.');
            }
        }

        // Pull from Active Chatters
export async function pullFromChatters() {
            try {
                const res = await fetch('/api/stats');
                const stats = await res.json();
                const chatters = (stats.chatters || []).map(c => c.name || c.user || c.chatname).filter(Boolean);
                if (chatters.length < 2) {
                    toast('Need at least 2 active chatters to populate poll!');
                    return;
                }
                $('poll-question').value = 'Who is your champion tonight?';
                $('choices-container').innerHTML = '';
                choiceCount = 0;
                chatters.slice(0, 4).forEach(name => {
                    addChoiceField(name);
                });
                toast(`Loaded ${Math.min(4, chatters.length)} active chatters!`);
            } catch (err) {
                toast('Could not load chatter list.');
            }
        }

        // Live Poll Monitor Renderer

export async function loadPresets() {
    try {
        const res = await fetch('/api/polls/presets');
        const data = await res.json();
        setSavedPresetsList(data.presets || []);

        // Populate select while preserving current selection
        const sel = $('preset-select');
        if (sel) {
            const curVal = sel.value;
            sel.innerHTML = '<option value="">-- Load a saved poll template --</option>' +
                savedPresetsList.map(p => `<option value="${p.id}">${esc(p.title)} (${p.choices.length} options)</option>`).join('');
            if (curVal && savedPresetsList.some(p => p.id === curVal)) {
                sel.value = curVal;
            }
        }

        // Populate templates list in tab 3
        const list = $('templates-list');
        if (list) {
            if (savedPresetsList.length === 0) {
                list.innerHTML = '<div style="color: var(--text-muted); font-size: 0.8rem;">No saved templates yet.</div>';
            } else {
                list.innerHTML = savedPresetsList.map(p => `
                    <div class="history-item">
                        <div>
                            <div class="history-title">${esc(p.title)}</div>
                            <div class="history-meta">${p.choices.length} choices · ${p.duration > 0 ? p.duration + 's' : 'Manual'} ${p.blind ? '· Blind' : ''}</div>
                        </div>
                        <div style="display: flex; gap: 0.35rem;">
                            <button type="button" class="btn-secondary btn-sm" onclick="applyPresetById('${p.id}')">Load</button>
                            <button type="button" class="btn-danger btn-sm" onclick="deletePresetById('${p.id}')">Delete</button>
                        </div>
                    </div>
                `).join('');
            }
        }
    } catch (err) {
        console.warn('Error loading presets:', err);
    }
}

export function loadSelectedPreset(id) {
    if (!id) return;
    applyPresetById(id);
}

export function applyPresetById(id) {
    const p = savedPresetsList.find(x => x.id === id);
    if (!p) return;
    if ($('preset-select')) $('preset-select').value = id;
    $('poll-question').value = p.title;
    $('choices-container').innerHTML = '';
    setChoiceCount(0);
    p.choices.forEach(c => addChoiceField(c));

    $('poll-blind').checked = !!p.blind;
    $('poll-keywords').checked = p.keywordVoting !== false;
    $('poll-sub-multiplier').checked = p.subMultiplier > 1;

    chips.forEach(b => {
        b.classList.toggle('active', parseInt(b.dataset.dur, 10) === p.duration);
    });
    setSelectedDuration(p.duration);

    if (window.switchTab) switchTab('poll');
    savePollDraft();
    updatePreview();
    toast(`Loaded template: "${p.title}"`);
}

export async function saveCurrentAsTemplate() {
    const title = $('poll-question').value.trim();
    const inputs = $('choices-container').querySelectorAll('.choice-input');
    const choices = [...inputs].map(inp => inp.value.trim()).filter(Boolean);

    if (!title) { toast('Please enter a poll title.'); return; }
    if (choices.length < 2) { toast('Please enter at least 2 choices.'); return; }

    const selectedPresetId = $('preset-select')?.value || undefined;

    const payload = {
        id: selectedPresetId,
        title,
        choices,
        duration: selectedDuration,
        blind: $('poll-blind').checked,
        keywordVoting: $('poll-keywords').checked,
        subMultiplier: $('poll-sub-multiplier').checked ? 2 : 1
    };

    try {
        const res = await fetch('/api/polls/presets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.status === 'ok') {
            toast('Template saved!');
            await loadPresets();
            if (data.preset?.id && $('preset-select')) {
                $('preset-select').value = data.preset.id;
            }
            savePollDraft();
        } else {
            toast(data.error || 'Failed to save template.');
        }
    } catch {
        toast('Failed to save template.');
    }
}

export async function deletePresetById(id) {
    if (!confirm('Delete this template?')) return;
    try {
        await fetch(`/api/polls/presets/${encodeURIComponent(id)}`, { method: 'DELETE' });
        toast('Template deleted.');
        if ($('preset-select')?.value === id) {
            $('preset-select').value = '';
            savePollDraft();
        }
        loadPresets();
    } catch {
        toast('Failed to delete template.');
    }
}


export async function loadHistory() {
            try {
                const res = await fetch('/api/polls/history');
                const data = await res.json();
                const list = $('poll-history-list');
                const items = data.history || [];

                if (!items.length) {
                    list.innerHTML = '<div style="color:var(--text-muted); font-size:0.8rem; text-align:center; padding:1.5rem 0;">No completed polls yet.</div>';
                    return;
                }

                list.innerHTML = items.map(p => `
                    <div class="history-item">
                        <div>
                            <div class="history-title">${esc(p.title)}</div>
                            <div class="history-meta">${p.totalVotes} total votes · ${p.choices?.length || 0} choices</div>
                        </div>
                        <div style="text-align: right; display: flex; align-items: center; gap: 0.5rem;">
                            ${p.winner ? `<span class="badge-pill badge-winner">${esc(p.winner)}</span>` : '<span class="badge-pill" style="background:var(--bg-inset); color:var(--text-muted);">Tie / None</span>'}
                            <button type="button" class="btn-secondary btn-sm" onclick="rerunPoll(${esc(JSON.stringify(p))})">Re-run</button>
                        </div>
                    </div>
                `).join('');
            } catch (err) {
                console.warn('Error loading history:', err);
            }
        }

export function rerunPoll(poll) {
            $('poll-question').value = poll.title;
            $('choices-container').innerHTML = '';
            choiceCount = 0;
            (poll.choices || []).forEach(c => addChoiceField(c.title));
            switchTab('poll');
            updatePreview();
            toast('Loaded past poll into form!');
        }

export async function clearPollHistory() {
            if (!confirm('Clear all poll history?')) return;
            try {
                await fetch('/api/polls/history', { method: 'DELETE' });
                loadHistory();
                toast('Poll history cleared.');
            } catch (err) {
                toast('Failed to clear history.');
            }
        }

export function exportPollPresetsJson() {
    if (!Array.isArray(savedPresetsList) || !savedPresetsList.length) {
        toast('No saved poll templates to export.');
        return;
    }
    const payload = {
        version: 1,
        exportedAt: new Date().toISOString(),
        presets: savedPresetsList
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'streampulse-poll-templates.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(`Exported ${savedPresetsList.length} poll template(s).`);
}

export async function importPollPresetsJson(event) {
    const input = event?.target;
    const file = input?.files?.[0];
    if (!file) return;
    try {
        const parsed = JSON.parse(await file.text());
        const list = Array.isArray(parsed)
            ? parsed
            : (Array.isArray(parsed?.presets) ? parsed.presets : null);
        if (!Array.isArray(list)) {
            toast('Invalid JSON: expected an array or { presets: [...] }.');
            return;
        }
        const valid = list.filter(p => p && typeof p.title === 'string' && p.title.trim() && Array.isArray(p.choices) && p.choices.filter(c => String(c || '').trim()).length >= 2);
        if (!valid.length) {
            toast('No valid poll templates found (title and at least 2 choices required).');
            return;
        }
        let importedCount = 0;
        for (const p of valid) {
            const payload = {
                ...(p.id ? { id: String(p.id) } : {}),
                title: String(p.title).trim(),
                choices: p.choices.map(c => String(c || '').trim()).filter(Boolean),
                duration: Number.isFinite(Number(p.duration)) ? Number(p.duration) : 60,
                blind: Boolean(p.blind),
                keywordVoting: p.keywordVoting !== false,
                subMultiplier: Number(p.subMultiplier) > 1 ? Number(p.subMultiplier) : 1
            };
            const res = await fetch('/api/polls/presets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (res.ok && data.status === 'ok') importedCount++;
        }
        await loadPresets();
        toast(importedCount > 0 ? `Imported ${importedCount} poll template(s).` : 'Failed to import templates.');
    } catch (err) {
        toast(`Import failed: ${err?.message || 'Invalid JSON'}`);
    } finally {
        if (input) input.value = '';
    }
}


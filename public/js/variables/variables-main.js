// Main controller for Placeholders Reference & Custom Variables Studio

import { api, copyToClipboard, esc, pickImage, state, toast } from './variables-state.js';
import { bindSetEvents, renderSets } from './variables-sets.js';

const $ = id => document.getElementById(id);
const S = window.OverlayShared;

function showTab(name) {
    const activeKey = name === 'sets' ? 'sets' : (name === 'vars' || name === 'variables') ? 'variables' : 'placeholders';
    document.querySelectorAll('#tabs button').forEach(b => {
        const isSel = b.dataset.t === activeKey;
        b.setAttribute('aria-selected', String(isSel));
        b.classList.toggle('active', isSel);
    });
    document.querySelectorAll('.tab-content').forEach(c => {
        c.hidden = c.dataset.tab !== activeKey;
    });
    history.replaceState(null, '', `#${activeKey}`);
}

let activePhPickerCleanup = null;

function closePlaceholderPicker() {
    if (typeof activePhPickerCleanup === 'function') {
        activePhPickerCleanup();
        activePhPickerCleanup = null;
    }
}

function openPlaceholderPicker(anchorBtn, inputEl, selfVarName = '') {
    closePlaceholderPicker();
    if (!S?.variableGroups || !inputEl) return;
    const table = S.variableTable ? S.variableTable(state.status, {}) : {};
    const allItems = [];
    for (const g of S.variableGroups(state.status)) {
        for (const [key, label] of g.items) {
            if (selfVarName && key === `var.${selfVarName}`) continue;
            const cur = table[key];
            allItems.push({
                group: g.label,
                key,
                label,
                val: cur !== undefined && cur !== null && cur !== '' ? String(cur) : ''
            });
        }
    }

    const pop = document.createElement('div');
    pop.className = 'slot-picker-popover';
    pop.style.width = '340px';
    pop.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; gap:.4rem;">
            <strong style="font-size:.8rem;">Insert Variable / Placeholder</strong>
            <button type="button" class="b sm" data-picker-close style="padding:.1rem .35rem;">&times;</button>
        </div>
        <input type="search" placeholder="Search variables or placeholders..." aria-label="Search placeholders" style="padding:.3rem .5rem; font-size:.82rem;">
        <div class="slot-picker-list"></div>
    `;
    document.body.appendChild(pop);

    const rect = anchorBtn.getBoundingClientRect();
    const popW = 340;
    const left = Math.max(8, Math.min(window.innerWidth - popW - 8, rect.left));
    const top = Math.min(window.innerHeight - 330, rect.bottom + 6);
    pop.style.left = `${left}px`;
    pop.style.top = `${Math.max(8, top)}px`;

    const searchInput = pop.querySelector('input[type="search"]');
    const listEl = pop.querySelector('.slot-picker-list');
    let selectedIdx = 0;
    let visible = allItems;

    const renderList = () => {
        const q = searchInput.value.trim().toLowerCase();
        visible = allItems.filter(it => !q || `${it.group} ${it.key} ${it.label} ${it.val}`.toLowerCase().includes(q)).slice(0, 60);
        if (selectedIdx >= visible.length) selectedIdx = Math.max(0, visible.length - 1);
        if (!visible.length) {
            listEl.innerHTML = '<div class="muted" style="font-size:.78rem; padding:.5rem; text-align:center;">No matching variables or placeholders.</div>';
            return;
        }
        listEl.innerHTML = visible.map((it, i) => `
            <button type="button" class="slot-picker-item ${i === selectedIdx ? 'is-active' : ''}" data-pick-ph="${esc(it.key)}">
                <div class="slot-picker-meta">
                    <div class="slot-picker-name"><code style="font-size:.76rem;">{{${esc(it.key)}}}</code></div>
                    <div class="slot-picker-sub">${esc(it.group)} · ${esc(it.label)}${it.val ? ` = ${esc(it.val)}` : ''}</div>
                </div>
            </button>
        `).join('');
    };

    const insertKey = key => {
        closePlaceholderPicker();
        const token = `{{${key}}}`;
        const start = Number.isInteger(inputEl.selectionStart) ? inputEl.selectionStart : inputEl.value.length;
        const end = Number.isInteger(inputEl.selectionEnd) ? inputEl.selectionEnd : start;
        inputEl.value = inputEl.value.slice(0, start) + token + inputEl.value.slice(end);
        inputEl.focus();
        inputEl.setSelectionRange(start + token.length, start + token.length);
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    };

    renderList();
    searchInput.focus();

    searchInput.addEventListener('input', () => { selectedIdx = 0; renderList(); });
    searchInput.addEventListener('keydown', e => {
        if (e.key === 'ArrowDown') { e.preventDefault(); if (visible.length) { selectedIdx = (selectedIdx + 1) % visible.length; renderList(); } }
        else if (e.key === 'ArrowUp') { e.preventDefault(); if (visible.length) { selectedIdx = (selectedIdx - 1 + visible.length) % visible.length; renderList(); } }
        else if (e.key === 'Enter' && visible[selectedIdx]) { e.preventDefault(); insertKey(visible[selectedIdx].key); }
    });

    pop.addEventListener('click', e => {
        if (e.target.closest('[data-picker-close]')) return closePlaceholderPicker();
        const item = e.target.closest('[data-pick-ph]');
        if (item) insertKey(item.dataset.pickPh);
    });

    const onDocDown = e => {
        if (!pop.contains(e.target) && !anchorBtn.contains(e.target)) closePlaceholderPicker();
    };
    const onDocKey = e => { if (e.key === 'Escape') closePlaceholderPicker(); };
    setTimeout(() => {
        document.addEventListener('mousedown', onDocDown);
        document.addEventListener('keydown', onDocKey);
    }, 0);

    activePhPickerCleanup = () => {
        document.removeEventListener('mousedown', onDocDown);
        document.removeEventListener('keydown', onDocKey);
        pop.remove();
    };
}

function renderVarControls(v) {
    if (v.type === 'counter') {
        return `
            <button type="button" class="b sm" data-act="decrement" title="Decrement (-1)">-</button>
            <input type="number" data-act="value" value="${v.value}" style="width:5rem; text-align:center; padding:.25rem .4rem;">
            <button type="button" class="b sm" data-act="increment" title="Increment (+1)">+</button>
            <button type="button" class="b sm" data-act="reset" title="Reset to initial">Reset</button>
        `;
    }
    if (v.type === 'toggle') {
        const on = String(v.value) === 'true';
        return `
            <button type="button" class="var-switch" data-act="toggle" role="switch" aria-checked="${on}" aria-pressed="${on}">
                <span class="var-switch-dot"></span>
                <span>${on ? 'ON (true)' : 'OFF (false)'}</span>
            </button>
        `;
    }
    if (v.type === 'color') {
        const hex = /^#[0-9a-f]{6}/i.test(v.value || '') ? v.value.slice(0, 7) : '#3b82f6';
        return `
            <input type="color" data-act="color-picker" value="${esc(hex)}" style="width:2.4rem; height:1.9rem; padding:0; border:1px solid var(--border); border-radius:5px; cursor:pointer;">
            <input type="text" data-act="value" value="${esc(v.value)}" placeholder="#3b82f6" class="var-mono" style="width:7.5rem; padding:.3rem .5rem;">
            <button type="button" class="b sm" data-act="save-value">Save</button>
        `;
    }
    if (v.type === 'image') {
        return `
            ${v.value ? `<img src="${esc(v.value)}" alt="" class="var-img-thumb">` : ''}
            <input type="text" data-act="value" value="${esc(v.value)}" placeholder="https://... or /assets/..." class="var-input-grow">
            <button type="button" class="b sm" data-act="pick-image">Asset Library</button>
            ${v.value ? '<button type="button" class="b sm" data-act="clear-image" title="Clear image">Clear</button>' : ''}
        `;
    }
    if (v.type === 'list') {
        return `
            <span class="muted" style="flex:1; min-width:12rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">Current: <b style="color:var(--accent);">${esc(v.value) || '(empty)'}</b></span>
            <button type="button" class="b sm" data-act="roll" title="Pick next item">Pick next</button>
        `;
    }
    if (v.type === 'template') {
        return `
            <input type="text" data-act="value" value="${esc(v.value)}" placeholder="{{var.first}} — {{var.second|Fallback}}" class="var-input-grow var-mono">
            <button type="button" class="b sm" data-act="pick-placeholder" title="Insert variable or placeholder">+ Insert...</button>
            <button type="button" class="b sm primary" data-act="save-value">Save</button>
        `;
    }
    return `<input type="text" data-act="value" value="${esc(v.value)}" placeholder="(empty value)" class="var-input-grow"><button type="button" class="b sm" data-act="save-value">Save</button>`;
}

export function renderVars() {
    const container = $('vars-list');
    const q = state.varQuery.trim().toLowerCase();
    const typeFilter = state.varTypeFilter;
    const filtered = (state.customVars || []).filter(v => {
        if (!state.showSetVars && v.setId) return false;
        if (typeFilter !== 'all' && v.type !== typeFilter) return false;
        if (q && !`${v.name} ${v.type} ${v.value}`.toLowerCase().includes(q)) return false;
        return true;
    });

    const standaloneCount = (state.customVars || []).filter(v => !v.setId).length;
    $('var-count').textContent = standaloneCount ? String(standaloneCount) : '';
    const setsCountEl = $('sets-count');
    if (setsCountEl) setsCountEl.textContent = (state.variableSets || []).length ? String(state.variableSets.length) : '';

    if (!filtered.length) {
        container.innerHTML = `<div class="muted" style="padding:.5rem 0;">${(state.customVars || []).length ? 'No variables match your current filter.' : 'No custom variables defined yet. Create one above!'}</div>`;
        return;
    }

    container.innerHTML = filtered.map(v => {
        const listDetails = v.type === 'list' ? `
            <details style="margin-top:.2rem;">
                <summary class="muted" style="cursor:pointer; font-size:.8rem;">${(v.items || []).length} items · ${v.mode === 'sequential' ? 'Sequential order' : 'Random order'} (click to edit items)</summary>
                <div style="margin-top:.5rem; display:grid; gap:.5rem;">
                    <textarea data-act="items" rows="4" style="width:100%; padding:.45rem; font-family:monospace; font-size:.82rem;" placeholder="One item per line">${esc((v.items || []).join('\n'))}</textarea>
                    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:.5rem;">
                        <label style="font-size:.82rem; color:var(--text-muted);">
                            Pick mode:
                            <select data-act="mode" style="margin-left:.3rem; padding:.2rem .4rem;">
                                <option value="random" ${v.mode !== 'sequential' ? 'selected' : ''}>Randomly</option>
                                <option value="sequential" ${v.mode === 'sequential' ? 'selected' : ''}>In order</option>
                            </select>
                        </label>
                        <button type="button" class="b sm primary" data-act="save-items">Save list items</button>
                    </div>
                </div>
            </details>
        ` : '';

        const tplPreview = v.type === 'template'
            ? `<div class="var-tpl-preview"><span>Preview:</span><span class="var-tpl-out">${esc((S?.expandVariables ? S.expandVariables(v.value || '', state.status, {}) : v.value) || '(empty)')}</span></div>`
            : '';

        return `
            <div class="var-row" data-n="${esc(v.name)}" data-type="${esc(v.type)}">
                <div class="var-head">
                    <div style="display:flex; align-items:center; gap:.5rem; flex-wrap:wrap;">
                        <strong style="font-size:.9rem;">${esc(v.name)}</strong>
                        <span class="badge">${esc(v.type)}</span>
                        ${v.setId ? `<span class="badge">set:${esc(v.setId)}</span>` : ''}
                        <code class="copyable" title="Click to copy" data-copy="{{var.${esc(v.name)}}}">{{var.${esc(v.name)}}}</code>
                    </div>
                    ${v.setId ? '' : '<button type="button" class="b sm danger" data-act="delete" title="Delete variable">Delete</button>'}
                </div>
                <div class="var-controls">
                    ${renderVarControls(v)}
                </div>
                ${tplPreview}
                ${listDetails}
            </div>
        `;
    }).join('');
}

// Placeholders rendering
function groups() {
    const table = S.variableTable(state.status, {});
    const allGroups = S.variableGroups(state.status);
    const catSelect = $('ph-cat');
    if (catSelect) {
        const cur = catSelect.value || 'all';
        const labels = allGroups.map(g => g.label);
        const existing = Array.from(catSelect.options).slice(1).map(o => o.value);
        if (labels.join('\0') !== existing.join('\0')) {
            catSelect.innerHTML = `<option value="all">All categories (${labels.length})</option>`
                + labels.map(l => `<option value="${esc(l)}">${esc(l)}</option>`).join('');
            catSelect.value = labels.includes(cur) ? cur : 'all';
        }
    }
    const cat = catSelect?.value || 'all';
    const q = $('q').value.trim().toLowerCase();
    const show = $('vals').checked;
    return allGroups
        .filter(g => cat === 'all' || g.label === cat)
        .map(g => ({
            label: g.label,
            items: g.items.filter(([key, label]) => !q || `${g.label} ${key} ${label}`.toLowerCase().includes(q)).map(([key, label]) => {
                const v = table[key];
                return { key, label, value: show && v !== undefined && v !== null && v !== '' ? String(v) : '' };
            })
        })).filter(g => g.items.length);
}

function renderPlaceholders() {
    const gs = groups();
    let totalItems = 0;
    gs.forEach(g => { totalItems += g.items.length; });
    $('ph-count').textContent = totalItems ? String(totalItems) : '';

    $('out').innerHTML = gs.map(g => `
        <div class="card">
            <h2>${esc(g.label)}</h2>
            <table>
                ${g.items.map(i => `
                    <tr>
                        <td><code class="copyable" title="Click to copy" data-copy="{{${esc(i.key)}}}">{{${esc(i.key)}}}</code></td>
                        <td>${esc(i.label)}</td>
                        ${$('vals').checked ? `<td class="val">${esc(i.value)}</td>` : ''}
                    </tr>
                `).join('')}
            </table>
        </div>
    `).join('') || '<div class="card muted">No placeholders match.</div>';
}

function markdown() {
    const cell = v => String(v ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
    const show = $('vals').checked;
    let md = '# Placeholders\n\nUse as `{{name}}`. Dates, timers and lists accept a format: `{{name|format}}`.\n';
    for (const g of groups()) {
        md += `\n## ${cell(g.label)}\n\n| Placeholder | What it shows |${show ? ' Example |' : ''}\n|---|---|${show ? '---|' : ''}\n`;
        md += g.items.map(i => `| \`{{${cell(i.key)}}}\` | ${cell(i.label)} |${show ? ` ${cell(i.value)} |` : ''}`).join('\n') + '\n';
    }
    return md;
}

export async function loadAllVars() {
    try {
        const res = await api('/api/variables');
        state.customVars = res.variables || [];
        state.variableSets = res.sets || [];
        state.status.customVars = state.customVars;
        renderSets();
        renderVars();
        renderPlaceholders();
    } catch (e) {
        toast('Failed to load variables: ' + e.message, 'error');
    }
}

function bindEvents() {
    $('tabs').addEventListener('click', e => {
        const b = e.target.closest('button[data-t]');
        if (b) showTab(b.dataset.t);
    });

    document.addEventListener('click', e => {
        const code = e.target.closest('code.copyable, [data-copy]');
        if (code) {
            const text = code.getAttribute('data-copy') || code.textContent;
            if (text) {
                copyToClipboard(text);
                code.classList.add('copied');
                setTimeout(() => code.classList.remove('copied'), 900);
            }
        }
    });

    $('var-add').onclick = async () => {
        const rawName = $('var-name').value.trim();
        const type = $('var-type').value;
        const name = rawName.replace(/^[^a-z0-9_]+/i, '').replace(/[^a-z0-9_]/gi, '');
        if (!name) return toast('Variable name is required (letters, numbers, underscore)', 'error');
        try {
            await api(`/api/variables/${encodeURIComponent(name)}`, 'PUT', { type });
            $('var-name').value = '';
            toast(`Variable "${name}" created`, 'success');
            await loadAllVars();
        } catch (e) {
            toast(e.message, 'error');
        }
    };

    $('var-type')?.addEventListener('change', e => {
        const hint = $('var-type-hint');
        if (hint) hint.hidden = e.target.value !== 'template';
    });

    $('var-name').addEventListener('keydown', e => {
        if (e.key === 'Enter') $('var-add').click();
    });

    $('var-search').addEventListener('input', e => {
        state.varQuery = e.target.value;
        renderVars();
    });

    $('var-type-filter').addEventListener('change', e => {
        state.varTypeFilter = e.target.value;
        renderVars();
    });

    $('var-show-set').addEventListener('change', e => {
        state.showSetVars = e.target.checked;
        renderVars();
    });

    $('vars-export').onclick = () => {
        const payload = { version: 1, exportedAt: new Date().toISOString(), variables: state.customVars, sets: state.variableSets };
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
        a.download = 'streampulse-variables.json';
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    };

    $('vars-import').onchange = async e => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        try {
            const data = JSON.parse(await file.text());
            await api('/api/variables/import', 'POST', data);
            toast('Variables and sets imported', 'success');
            await loadAllVars();
        } catch (err) {
            toast('Import failed: ' + err.message, 'error');
        }
    };

    $('vars-list').addEventListener('click', async event => {
        const btn = event.target.closest('[data-act]');
        const act = btn?.dataset.act;
        const row = event.target.closest('[data-n]');
        if (!act || ['value', 'items', 'mode', 'color-picker'].includes(act) || !row) return;
        const name = row.dataset.n;
        const url = `/api/variables/${encodeURIComponent(name)}`;

        try {
            if (act === 'pick-image') {
                const input = row.querySelector('[data-act="value"]');
                pickImage(input?.value || '', async urlPicked => {
                    if (urlPicked === undefined) return;
                    await api(url, 'PUT', { value: urlPicked });
                    await loadAllVars();
                });
                return;
            }
            if (act === 'pick-placeholder') {
                const input = row.querySelector('[data-act="value"]');
                openPlaceholderPicker(btn, input, name);
                return;
            }
            if (act === 'save-value') {
                const input = row.querySelector('[data-act="value"]');
                await api(url, 'PUT', { value: input?.value ?? '' });
                toast(`Variable "${name}" saved`, 'success');
                await loadAllVars();
                return;
            }
            if (act === 'clear-image') {
                await api(url, 'PUT', { value: '' });
                await loadAllVars();
                return;
            }
            if (act === 'delete') {
                const confirmed = window.StreamPulse?.confirm
                    ? await StreamPulse.confirm('Delete Variable', `Delete variable "${name}"? Any overlays using it will display empty.`, { danger: true, confirmText: 'Delete' })
                    : confirm(`Delete variable "${name}"?`);
                if (!confirmed) return;
                await api(url, 'DELETE');
                toast(`Variable "${name}" deleted`, 'info');
            } else if (act === 'save-items') {
                const items = row.querySelector('[data-act="items"]').value;
                const mode = row.querySelector('[data-act="mode"]').value;
                await api(url, 'PUT', { items, mode });
                toast(`List "${name}" saved`, 'success');
            } else {
                await api(`${url}/${act}`, 'POST', {});
            }
            await loadAllVars();
        } catch (e) {
            toast(e.message, 'error');
        }
    });

    $('vars-list').addEventListener('input', event => {
        const row = event.target.closest('[data-n][data-type="template"]');
        if (!row || event.target.dataset.act !== 'value') return;
        const out = row.querySelector('.var-tpl-out');
        if (!out) return;
        const resolved = S?.expandVariables ? S.expandVariables(event.target.value || '', state.status, {}) : event.target.value;
        out.textContent = resolved || '(empty)';
    });

    $('vars-list').addEventListener('change', async event => {
        const row = event.target.closest('[data-n]');
        if (!row) return;
        const name = row.dataset.n;
        const act = event.target.dataset.act;
        if (act === 'value' || act === 'color-picker') {
            try {
                await api(`/api/variables/${encodeURIComponent(name)}`, 'PUT', { value: event.target.value });
                toast(`Variable "${name}" saved`, 'success');
                await loadAllVars();
            } catch (e) {
                toast(e.message, 'error');
            }
        }
    });

    // Collapsible Chat Bot Tokens
    const tokensCard = $('chat-tokens-card');
    if (tokensCard) {
        const saved = localStorage.getItem('placeholders_tokens_open');
        tokensCard.open = saved === 'true';
        tokensCard.addEventListener('toggle', () => {
            if (!tokensCard._searching) localStorage.setItem('placeholders_tokens_open', String(tokensCard.open));
        });
    }

    $('q').oninput = () => {
        renderPlaceholders();
        if (!tokensCard) return;
        const q = $('q').value.trim().toLowerCase();
        const rows = tokensCard.querySelectorAll('tbody tr');
        tokensCard._searching = true;
        if (!q) {
            rows.forEach(r => { r.style.display = ''; });
            tokensCard.open = localStorage.getItem('placeholders_tokens_open') === 'true';
        } else {
            let any = false;
            rows.forEach(r => {
                const match = r.textContent.toLowerCase().includes(q);
                r.style.display = match ? '' : 'none';
                if (match) any = true;
            });
            if (any) tokensCard.open = true;
        }
        tokensCard._searching = false;
    };

    $('ph-cat')?.addEventListener('change', renderPlaceholders);
    $('vals').onchange = renderPlaceholders;
    $('copy').onclick = async () => {
        await copyToClipboard(markdown());
        $('copy').textContent = 'Copied';
        setTimeout(() => { $('copy').textContent = 'Copy Markdown'; }, 1500);
    };
    $('md').onclick = () => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([markdown()], { type: 'text/markdown' }));
        a.download = 'streampulse-placeholders.md';
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    };

    bindSetEvents(loadAllVars);
}

// Init
bindEvents();
showTab(location.hash.slice(1));
window.addEventListener('hashchange', () => showTab(location.hash.slice(1)));

loadAllVars();
fetch('/api/status', { cache: 'no-store' }).then(r => r.json()).then(async s => {
    state.status = s;
    if (s.customVars) {
        state.customVars = s.customVars;
        renderVars();
    }
    try { await S.loadLiveExtras(s); } catch { /* extras are optional */ }
    renderPlaceholders();
}).catch(renderPlaceholders);

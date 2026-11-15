// Main controller for Placeholders Reference & Custom Variables Studio

import { api, copyToClipboard, esc, state, toast } from './variables-state.js';
import { bindSetEvents, renderSets, tickSetCountdowns } from './variables-sets.js';
import { bindGroupDragDrop, exportVariables, openGroupEditor } from './variables-groups.js';
import { numberControls } from './variables-numbers.js';
import { bindInlineEditing, inlineValue } from './variables-inline.js';
import { groupFilterLink, groupFilterTag, groupQueryFromFragment, matchesVariableQuery, parseVariableQuery } from './variables-filter.js';
import { createVariableInspector } from './variables-inspector.js';

const $ = id => document.getElementById(id);
const S = window.OverlayShared;
let inlineEditor = null;
let variableInspector = null;
let varsLoaded = false;
let groupNavigation = '';

function applyVariableSetsVisibility() {
    const enabled = state.variableSetsEnabled !== false;
    const setsTabBtn = document.querySelector('#tabs button[data-t="sets"]');
    if (setsTabBtn) setsTabBtn.hidden = !enabled;
    const showSetWrap = $('var-show-set')?.closest('label');
    if (showSetWrap) showSetWrap.style.display = enabled ? 'flex' : 'none';
    if (!enabled) state.showSetVars = false;
    if (!state.status || typeof state.status !== 'object') state.status = {};
    state.status.modules = { ...(state.status.modules || {}), variableSets: enabled };
    if (!enabled && location.hash === '#sets') showTab('variables');
}

function showTab(name) {
    const [tab, groupFragment = ''] = name.split('#');
    name = tab;
    const activeKey = (name === 'sets' && state.variableSetsEnabled !== false) ? 'sets' : (name === 'vars' || name === 'variables') ? 'variables' : 'placeholders';
    document.querySelectorAll('#tabs button').forEach(b => {
        const isSel = b.dataset.t === activeKey;
        b.setAttribute('aria-selected', String(isSel));
        b.classList.toggle('active', isSel);
    });
    document.querySelectorAll('.tab-content').forEach(c => {
        c.hidden = c.dataset.tab !== activeKey;
    });
    state.varGroupQuery = activeKey === 'variables' ? groupQueryFromFragment(groupFragment) : '';
    history.replaceState(null, '', `#${activeKey}${activeKey === 'variables' && groupFragment ? `#${groupFragment}` : ''}`);
    renderVars();
}

function renderVarControls(v) {
    if (v.type === 'toggle') {
        const on = String(v.value) === 'true';
        return `
            <button type="button" class="var-switch" data-act="toggle" role="switch" aria-checked="${on}" aria-pressed="${on}">
                <span class="var-switch-dot"></span>
                <span>${on ? 'ON (true)' : 'OFF (false)'}</span>
            </button>
        `;
    }
    return '';
}

export function renderVars() {
    const container = $('vars-list');
    if (!varsLoaded) return;
    variableInspector?.refresh();
    if (inlineEditor?.isEditing()) return;
    const q = { ...parseVariableQuery(state.varGroupQuery, state.variableGroups), text: state.varQuery.trim() };
    const groupChip = $('var-group-filter');
    if (groupChip) {
        groupChip.hidden = !q.hasGroup;
        groupChip.querySelector('span').textContent = q.ungrouped ? 'Ungrouped' : q.groups[0] || q.group || '';
    }
    const typeFilter = state.varTypeFilter;
    const visibleGroups = q.hasGroup && !q.ungrouped && !q.text && typeFilter === 'all' ? q.groups : null;
    const filtered = (state.customVars || []).filter(v => {
        if (v.hidden) return false;
        if ((state.variableSetsEnabled === false || !state.showSetVars) && v.setId) return false;
        if (typeFilter !== 'all' && v.type !== typeFilter && !(typeFilter === 'number' && v.type === 'counter')) return false;
        if (!matchesVariableQuery(v, q)) return false;
        return true;
    });

    const standaloneCount = (state.customVars || []).filter(v => !v.setId).length;
    $('var-count').textContent = standaloneCount ? String(standaloneCount) : '';
    const setsCountEl = $('sets-count');
    if (setsCountEl) setsCountEl.textContent = (state.variableSets || []).length ? String(state.variableSets.length) : '';

    const ordinary = state.customVars.filter(variable => !variable.setId && !variable.hidden);
    const counts = new Map();
    ordinary.forEach(variable => counts.set(variable.group || '', (counts.get(variable.group || '') || 0) + 1));
    const nav = (label, href, count, active, attrs) => `<a class="variable-group-link${active ? ' is-active' : ''}" href="${esc(href)}"${active ? ' aria-current="page"' : ''} ${attrs}><span>${esc(label)}</span><small>${count}</small></a>`;
    const navigation = nav('All variables', '#variables', ordinary.length, !q.hasGroup, 'data-filter-all')
        + nav('Ungrouped', '#variables#ungrouped', counts.get('') || 0, q.ungrouped, 'data-filter-ungrouped data-drop-group=""')
        + state.variableGroups.map(group => nav(group, groupFilterLink(group), counts.get(group) || 0, !q.ungrouped && q.groups.includes(group), `data-filter-group="${esc(group)}" data-drop-group="${esc(group)}"`)).join('');
    if (navigation !== groupNavigation) { $('variable-group-nav').innerHTML = navigation; groupNavigation = navigation; }
    const manage = $('var-group-manage');
    manage.hidden = q.ungrouped || q.groups.length !== 1;
    manage.dataset.manageGroup = q.groups[0] || '';
    if (!filtered.length && !visibleGroups?.length) {
        container.innerHTML = `<div class="muted" style="padding:.5rem 0;">${(state.customVars || []).length ? 'No variables match your current filter.' : 'No custom variables defined yet. Create one above!'}</div>`;
        return;
    }
    container.innerHTML = filtered.length ? `<div class="variable-table-heading"><span>Variable</span><span>Type</span><span>Value</span></div>` + filtered.map(variable =>
        `<div class="var-row variable-studio-row${variableInspector?.selected() === variable.name ? ' is-selected' : ''}" data-n="${esc(variable.name)}" data-type="${esc(variable.type)}">
            <button type="button" class="variable-name" data-select-variable="${esc(variable.name)}"${variable.setId ? '' : ` draggable="true" data-drag-variable="${esc(variable.name)}"`} title="Open variable inspector${variable.setId ? '' : '; drag to a group'}">${esc(variable.name)}${variable.group && !q.hasGroup ? `<small>${esc(variable.group)}</small>` : ''}</button>
            <span class="variable-type">${esc(variable.type === 'counter' ? 'number' : variable.type)}</span>
            <div class="var-controls">${variable.type === 'toggle' ? renderVarControls(variable) : inlineValue(variable)}${['number', 'counter'].includes(variable.type) ? numberControls(variable) : variable.type === 'list' ? '<button type="button" class="b sm" data-act="roll">Next</button>' : ''}</div>
        </div>`).join('') : '<p class="muted">This group is empty. Drag a variable here or use Manage members.</p>';
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
            <table class="placeholder-table${$('vals').checked ? ' has-values' : ''}">
                <colgroup><col class="placeholder-key"><col>${$('vals').checked ? '<col class="placeholder-value">' : ''}</colgroup>
                ${g.items.map(i => `
                    <tr>
                        <td><code class="copyable" title="Click to copy" data-copy="{{${esc(i.key)}}}">{{${esc(i.key)}}}</code></td>
                        <td>${esc(i.label)}</td>
                        ${$('vals').checked ? `<td class="val" title="${esc(i.value)}">${esc(i.value)}</td>` : ''}
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

async function refreshOverlaysSummary() {
    try {
        const list = await api('/api/custom-overlays');
        if (Array.isArray(list)) state.overlays = list;
    } catch { /* overlay summary is optional */ }
}

export async function loadAllVars() {
    try {
        const [res] = await Promise.all([api('/api/variables'), refreshOverlaysSummary()]);
        state.customVars = res.variables || [];
        varsLoaded = true;
        state.variableGroups = res.groups || [];
        state.variableSets = res.sets || [];
        if (typeof res.variableSetsEnabled === 'boolean') state.variableSetsEnabled = res.variableSetsEnabled;
        state.status.customVars = state.customVars;
        if (state.customVars.some(v => v.type === 'font')) await S?.loadAssetFonts?.();
        applyVariableSetsVisibility();
        renderSets();
        renderVars();
        renderPlaceholders();
    } catch (e) {
        toast('Failed to load variables: ' + e.message, 'error');
    }
}

let pendingWsRender = null;

function flushPendingWsRender() {
    if (!pendingWsRender || document.hidden) return;
    const { varsOrGroups } = pendingWsRender;
    pendingWsRender = null;
    applyVariableSetsVisibility();
    renderSets();
    if (varsOrGroups) renderVars();
    renderPlaceholders();
}

function connectVariablesWs() {
    if (typeof WebSocket !== 'function') return;
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    let ws;
    try {
        ws = new WebSocket(`${proto}//${location.host}`);
    } catch {
        return;
    }
    ws.addEventListener('message', event => {
        if (typeof event.data !== 'string' || !event.data.includes('"variables-update"')) return;
        let msg;
        try { msg = JSON.parse(event.data); } catch { return; }
        if (msg?.type !== 'variables-update' || !msg.data) return;
        const varsChanged = Array.isArray(msg.data.variables) && JSON.stringify(state.customVars) !== JSON.stringify(msg.data.variables);
        const groupsChanged = Array.isArray(msg.data.groups) && JSON.stringify(state.variableGroups) !== JSON.stringify(msg.data.groups);
        if (Array.isArray(msg.data.groups)) state.variableGroups = msg.data.groups;
        if (Array.isArray(msg.data.variables)) {
            state.customVars = msg.data.variables;
            state.status.customVars = state.customVars;
        }
        if (Array.isArray(msg.data.sets)) {
            state.variableSets = msg.data.sets;
        }
        if (typeof msg.data.variableSetsEnabled === 'boolean') {
            state.variableSetsEnabled = msg.data.variableSetsEnabled;
            if (!document.hidden) applyVariableSetsVisibility();
        }
        if (document.hidden) {
            pendingWsRender = { varsOrGroups: Boolean(pendingWsRender?.varsOrGroups || varsChanged || groupsChanged) };
            return;
        }
        renderSets();
        if (varsChanged || groupsChanged) renderVars();
        renderPlaceholders();
    });
    ws.addEventListener('close', () => {
        setTimeout(connectVariablesWs, 3000);
    });
}

if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', flushPendingWsRender);
}

function bindEvents() {
    try {
        state.varQuery = localStorage.getItem('streampulse:variables:search') || '';
        const type = localStorage.getItem('streampulse:variables:type') || 'all';
        state.varTypeFilter = type === 'counter' ? 'number' : type;
        if (![...$('var-type-filter').options].some(option => option.value === state.varTypeFilter)) state.varTypeFilter = 'all';
    } catch { /* storage is optional */ }
    $('var-search').value = state.varQuery;
    $('var-type-filter').value = state.varTypeFilter;
    const saveFilters = () => {
        try {
            localStorage.setItem('streampulse:variables:search', state.varQuery);
            localStorage.setItem('streampulse:variables:type', state.varTypeFilter);
        } catch { /* storage is optional */ }
    };
    inlineEditor = bindInlineEditing($('vars-list'), name => state.customVars.find(v => v.name === name), updated => {
        if (updated) {
            state.customVars = state.customVars.map(v => v.name === updated.name && !(v.updatedAt > updated.updatedAt) ? updated : v);
            state.status.customVars = state.customVars;
        }
        renderVars();
        renderPlaceholders();
    });
    variableInspector = createVariableInspector($('variable-inspector'), {
        getVariable: name => state.customVars.find(variable => variable.name === name),
        getStatus: () => state.status,
        onSaved: loadAllVars
    });
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
            const selectedGroup = parseVariableQuery(state.varGroupQuery, state.variableGroups);
            const created = await api(`/api/variables/${encodeURIComponent(name)}`, 'PUT', { type, ...(!selectedGroup.ungrouped && selectedGroup.groups.length === 1 ? { group: selectedGroup.groups[0] } : {}) });
            $('var-name').value = '';
            toast(`Variable "${name}" created`, 'success');
            await loadAllVars();
            await variableInspector.open(created.name || name);
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
        saveFilters();
        renderVars();
    });

    $('var-type-filter').addEventListener('change', e => {
        state.varTypeFilter = e.target.value;
        saveFilters();
        renderVars();
    });
    $('var-clear-group')?.addEventListener('click', () => {
        showTab('variables');
    });

    $('var-show-set').addEventListener('change', e => {
        state.showSetVars = e.target.checked;
        renderVars();
    });

    $('vars-export').onclick = () => {
        exportVariables(state.customVars, state.variableSets, 'streampulse-variables.json', state.variableGroups);
    };
    const groupSaved = async (name, previous) => {
        const selected = parseVariableQuery(state.varGroupQuery, previous ? [previous] : []);
        if (previous && previous !== name && !selected.ungrouped && selected.groups.includes(previous)) {
            state.varGroupQuery = groupFilterTag(name);
            history.replaceState(null, '', groupFilterLink(name));
        }
        await loadAllVars();
    };
    $('var-group-add').onclick = () => openGroupEditor(groupSaved);
    bindGroupDragDrop($('variable-workspace'), loadAllVars);

    $('vars-import').onchange = async e => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        try {
            const data = JSON.parse(await file.text());
            const names = new Set(state.customVars.map(v => v.name));
            const overlaps = (data.variables || []).filter(v => !v.setId && names.has(v.name)).length;
            const setNames = new Set(state.variableSets.map(s => s.id));
            const setOverlaps = (data.sets || []).filter(s => setNames.has(s.id)).length;
            if (overlaps || setOverlaps) {
                const message = `This import will update ${overlaps} existing variables and ${setOverlaps} existing sets. Other entries stay unchanged. Continue?`;
                const confirmed = window.StreamPulse?.confirm
                    ? await StreamPulse.confirm('Import variables', message, { confirmText: 'Import' })
                    : confirm(message);
                if (!confirmed) return;
            }
            await api('/api/variables/import', 'POST', data);
            toast('Variables and sets imported', 'success');
            await loadAllVars();
        } catch (err) {
            toast('Import failed: ' + err.message, 'error');
        }
    };

    $('vars-card').addEventListener('click', async event => {
        const selected = event.target.closest('[data-select-variable]');
        if (selected) {
            const name = selected.dataset.selectVariable;
            await inlineEditor.flush();
            await variableInspector.open(name);
            $('vars-list').querySelectorAll('[data-n]').forEach(row => row.classList.toggle('is-selected', row.dataset.n === variableInspector.selected()));
            return;
        }
        const groupFilter = event.target.closest('[data-filter-group], [data-filter-ungrouped], [data-filter-all]');
        if (groupFilter) {
            if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
            event.preventDefault();
            const fragment = groupFilter.getAttribute('href').slice(1);
            await inlineEditor.flush();
            if (location.hash !== `#${fragment}`) history.pushState(null, '', `#${fragment}`);
            showTab(fragment);
            return;
        }
        const manageGroup = event.target.closest('[data-manage-group]');
        if (manageGroup) {
            openGroupEditor(groupSaved, manageGroup.dataset.manageGroup);
            return;
        }
        const exportGroup = event.target.closest('[data-export-group]');
        if (exportGroup) {
            const group = exportGroup.dataset.exportGroup;
            exportVariables(state.customVars.filter(v => !v.setId && !v.hidden && v.group === group), [], 'streampulse-variable-group.json', [group]);
            return;
        }
        const btn = event.target.closest('[data-act]');
        const act = btn?.dataset.act;
        const row = event.target.closest('[data-n]');
        if (!act || ['value', 'items', 'mode', 'color-picker', 'group'].includes(act) || !row) return;
        const name = row.dataset.n;
        const url = `/api/variables/${encodeURIComponent(name)}`;

        try {
            if (['increment', 'decrement', 'reset'].includes(act)) await inlineEditor.flush();
            if (!['increment', 'decrement', 'reset', 'toggle', 'roll'].includes(act)) return;
            await api(`${url}/${act}`, 'POST', {});
            await loadAllVars();
        } catch (e) {
            toast(e.message, 'error');
        }
    });

    $('vars-list').addEventListener('input', event => {
        const row = event.target.closest('[data-n][data-type="template"]');
        if (!row || (event.target.dataset.act !== 'value' && !event.target.hasAttribute('data-inline-value'))) return;
        const out = row.querySelector('.var-tpl-out');
        if (!out) return;
        const resolved = S?.expandVariables ? S.expandVariables(event.target.value || '', state.status, {}) : event.target.value;
        out.textContent = resolved || '(empty)';
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
window.addEventListener('pagehide', event => { if (!event.persisted) inlineEditor.dispose(); });
showTab(location.hash.slice(1));
window.addEventListener('hashchange', () => showTab(location.hash.slice(1)));

loadAllVars();
connectVariablesWs();
setInterval(() => {
    if (document.hidden || document.getElementById('tab-sets')?.hidden) return;
    tickSetCountdowns();
}, 1000);
fetch('/api/status', { cache: 'no-store' }).then(r => r.json()).then(async s => {
    state.status = s;
    if (typeof s.modules?.variableSets === 'boolean') {
        state.variableSetsEnabled = s.modules.variableSets;
    }
    if (s.customVars) {
        state.customVars = s.customVars;
    }
    applyVariableSetsVisibility();
    renderVars();
    try { await S.loadLiveExtras(s); } catch { /* extras are optional */ }
    renderPlaceholders();
}).catch(renderPlaceholders);

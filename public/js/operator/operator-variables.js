'use strict';

import { api, esc, toast } from '../shared/client-core.js';
import { fontControls } from '../variables/variables-groups.js';
import {
    mountUnifiedVariablesOperator,
    refreshUnifiedVariablesOperator
} from '../variables/variable-set-operator.js';
import { OP_ICONS } from './operator-icons.js';
import { registerCardType, registerOperatorModule } from './operator-registry.js';
import { isEditLocked } from './operator-state.js';

let mounted = false;
let varCache = null;

async function fetchVariablesData(force = false) {
    if (!force && varCache) return varCache;
    varCache = await api('/api/variables');
    return varCache;
}

function getVarLines(v) {
    if (Array.isArray(v?.items)) return v.items.map(s => String(s ?? '').trim()).filter(Boolean);
    return String(v?.value ?? '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
}

function updateSubTabVisibility(status) {
    const mods = status?.modules || {};
    const setsBtn = document.querySelector('#op-mode-tabs [data-op-mode="sets"]');
    const varBtn = document.querySelector('#op-mode-tabs [data-op-mode="var"]');
    const groupBtn = document.querySelector('#op-mode-tabs [data-op-mode="group"]');
    const showSets = Boolean(mods.variableSets || varCache?.sets?.length);
    const showVars = mods.variableSettings !== false;
    if (setsBtn) setsBtn.hidden = !showSets;
    if (varBtn) varBtn.hidden = !showVars;
    if (groupBtn) groupBtn.hidden = !showVars;
}

function applyDomainReadOnlyState() {
    const readOnly = isEditLocked();
    const setsView = document.getElementById('op-sets-view');
    const varsView = document.getElementById('op-vars-view');
    const addBtn = document.getElementById('op-add-entry');
    if (setsView) setsView.inert = readOnly;
    if (varsView) varsView.inert = readOnly;
    if (addBtn && readOnly) addBtn.hidden = true;
}

registerOperatorModule({
    id: 'variables',
    label: 'Variables',
    iconSvg: OP_ICONS.variables,
    order: 20,
    isEnabled: status => Boolean(status?.modules?.variableSets || status?.modules?.variableSettings !== false),
    async mount(container, ctx) {
        mounted = true;
        container.hidden = false;
        await mountUnifiedVariablesOperator();
        updateSubTabVisibility(ctx.status);
        applyDomainReadOnlyState();
    },
    unmount(ctx) {
        mounted = false;
        if (ctx?.container) ctx.container.hidden = true;
    },
    onSocket(type) {
        varCache = null;
        if (mounted && (type === 'variables' || type === 'variables-update' || type === 'status')) {
            refreshUnifiedVariablesOperator(true).then(applyDomainReadOnlyState);
        }
    },
    onStatus(status) {
        if (mounted) {
            updateSubTabVisibility(status);
            applyDomainReadOnlyState();
        }
    }
});

// Read-only value renderer for Show Mode (isEditLocked)
function renderReadOnlyVarHtml(v, head) {
    const val = String(v.value ?? '');
    if (v.type === 'toggle') {
        const on = val === 'true';
        return `${head}<div class="op-panel-row"><span class="op-pill ${on ? 'is-ok' : ''}">${on ? 'On (true)' : 'Off (false)'}</span></div>`;
    }
    if (v.type === 'counter' || v.type === 'number') {
        return `${head}<div class="op-ro-value" style="font-size:1.25rem;font-variant-numeric:tabular-nums;">${esc(val || '0')}</div>`;
    }
    if (v.type === 'list') {
        const lines = getVarLines(v);
        const savedOpen = localStorage.getItem(`streampulse_var_lines_open_${v.name}`);
        const isOpen = savedOpen !== null ? savedOpen === '1' : lines.length <= 5;
        const activeText = String(v.current || lines[0] || '');
        return `
            ${head}
            ${activeText ? `<div class="op-ro-value">${esc(activeText)}</div>` : '<div style="font-size:.8rem;color:var(--text-muted);">Empty list</div>'}
            <details class="op-list-collapse" data-card-list-details="${esc(v.name)}"${isOpen ? ' open' : ''}>
                <summary><span>Lines (${lines.length})</span><span style="font-size:.72rem;">${isOpen ? 'Collapse' : 'Show all'}</span></summary>
                <div class="op-list-lines-body">
                    <div class="op-ro-lines">${lines.map(l => `<div class="op-ro-line">${esc(l)}</div>`).join('') || '<span style="color:var(--text-muted);">No lines</span>'}</div>
                </div>
            </details>`;
    }
    if (v.type === 'color') {
        const hex = /^#[0-9a-f]{6}/i.test(val) ? val.slice(0, 7) : '#3b82f6';
        return `${head}<div class="op-inline-group">
            <span class="op-color-swatch" style="background:${esc(hex)};cursor:default;"></span>
            <span class="op-ro-value">${esc(val || hex)}</span>
        </div>`;
    }
    if (v.type === 'image') {
        return `${head}<div class="op-inline-group">
            ${val ? `<img src="${esc(val)}" alt="" class="op-thumb">` : ''}
            <span class="op-ro-value">${esc(val || 'No image')}</span>
        </div>`;
    }
    if (v.type === 'icon') {
        return `${head}<div class="op-inline-group">
            <span class="op-icon-box">${val ? `<i class="${esc(val)}" aria-hidden="true"></i>` : ''}</span>
            <span class="op-ro-value">${esc(val || 'None')}</span>
        </div>`;
    }
    if (v.type === 'font') {
        return `${head}<div class="op-ro-value" style="font-family:${esc(val || 'inherit')};">${esc(val || 'Default')}</div>`;
    }
    return `${head}<div class="op-ro-value">${esc(val || '—')}</div>`;
}

// Shared inline control renderer for Single Variable & Variable Group Live Board cards
function renderBoardVarControlHtml(v, showHeader = true) {
    const name = esc(v.name);
    const val = String(v.value ?? '');
    const head = showHeader
        ? `<div class="op-panel-row"><span style="font-size:.82rem;font-weight:700;">${name}</span><span class="op-pill">${esc(v.type || 'text')}</span></div>`
        : '';

    if (isEditLocked()) {
        return renderReadOnlyVarHtml(v, head);
    }

    if (v.type === 'toggle') {
        const on = val === 'true';
        return `${head}<div class="op-panel-row">
            <span class="op-pill ${on ? 'is-ok' : ''}">${on ? 'Enabled' : 'Disabled'}</span>
            <button type="button" class="op-btn sm ${on ? 'active' : ''}" data-card-var-toggle="${name}">${on ? 'On (true)' : 'Off (false)'}</button>
        </div>`;
    }

    if (v.type === 'counter' || v.type === 'number') {
        return `${head}<div class="op-panel-row">
            <input type="number" step="any" class="op-cell-input" style="width:78px;min-width:64px;text-align:center;font-weight:700;font-variant-numeric:tabular-nums;" data-card-var-direct="${name}" value="${esc(val || '0')}" aria-label="${name} value">
            <div class="op-btn-row">
                <button type="button" class="op-btn sm" data-card-var-step="${name}" data-delta="-1">-1</button>
                <button type="button" class="op-btn sm" data-card-var-step="${name}" data-delta="1">+1</button>
                <button type="button" class="op-btn sm" data-card-var-step="${name}" data-delta="5">+5</button>
                <button type="button" class="op-btn sm" data-card-var-set="${name}" data-val="0">Reset</button>
            </div>
        </div>`;
    }

    if (v.type === 'list') {
        const lines = getVarLines(v);
        const savedOpen = localStorage.getItem(`streampulse_var_lines_open_${v.name}`);
        const isOpen = savedOpen !== null ? savedOpen === '1' : lines.length <= 5;
        const activeText = String(v.current || lines[0] || '');
        const rows = lines.map((line, idx) => `
            <div style="display:flex;gap:.3rem;align-items:center;">
                <input type="text" class="op-cell-input" data-card-list-edit="${name}" data-line-idx="${idx}" value="${esc(line)}">
                <button type="button" class="op-icon-btn danger" data-card-list-del="${name}" data-line-idx="${idx}" title="Remove line">${OP_ICONS.close}</button>
            </div>`).join('');
        return `
            ${head}
            ${activeText ? `<div style="font-size:.76rem;color:var(--text-muted);">Current: <strong style="color:var(--text);">${esc(activeText)}</strong></div>` : ''}
            <form class="op-inline-group" data-card-list-add="${name}">
                <input type="text" class="op-cell-input" data-card-list-input="${name}" placeholder="Add one line…" autocomplete="off">
                <button type="submit" class="op-btn sm primary" title="Add line">${OP_ICONS.plus} Add</button>
                <button type="button" class="op-btn sm" data-card-var-roll="${name}" title="Pick random line">Roll</button>
            </form>
            <details class="op-list-collapse" data-card-list-details="${name}"${isOpen ? ' open' : ''}>
                <summary><span>Lines (${lines.length})</span><span style="font-size:.72rem;">${isOpen ? 'Collapse' : 'Show all'}</span></summary>
                <div class="op-list-lines-body">
                    ${rows || '<div style="font-size:.78rem;color:var(--text-muted);">No lines yet. Add one above.</div>'}
                </div>
            </details>`;
    }

    if (v.type === 'color') {
        const hex = /^#[0-9a-f]{6}/i.test(val) ? val.slice(0, 7) : '#3b82f6';
        return `${head}<div class="op-inline-group">
            <input type="color" class="op-color-swatch" data-card-var-color="${name}" value="${esc(hex)}" aria-label="${name} color">
            <input type="text" class="op-cell-input" data-card-var-input="${name}" value="${esc(val)}">
            <button type="button" class="op-btn sm primary" data-card-var-save="${name}">Save</button>
        </div>`;
    }

    if (v.type === 'image') {
        return `${head}<div class="op-inline-group">
            ${val ? `<img src="${esc(val)}" alt="" class="op-thumb">` : ''}
            <input type="text" class="op-cell-input" data-card-var-direct="${name}" value="${esc(val)}" placeholder="/assets/...">
            <button type="button" class="op-btn sm" data-card-pick-img="${name}">Assets</button>
        </div>`;
    }

    if (v.type === 'icon') {
        return `${head}<div class="op-inline-group">
            <span class="op-icon-box">${val ? `<i class="${esc(val)}" aria-hidden="true"></i>` : ''}</span>
            <input type="text" class="op-cell-input" data-card-var-direct="${name}" value="${esc(val)}" placeholder="fa-solid fa-star">
            <button type="button" class="op-btn sm" data-card-pick-icon="${name}">Icon</button>
        </div>`;
    }

    if (v.type === 'font') {
        return `${head}<div style="display:grid;gap:.35rem;" data-card-font-wrap="${name}">
            ${fontControls(v)}
            <div style="font-family:${esc(val || 'inherit')};font-size:.9rem;color:var(--text-muted);">The quick brown fox</div>
        </div>`;
    }

    if (v.type === 'date' || v.type === 'time' || v.type === 'datetime') {
        const inputType = v.type === 'datetime' ? 'datetime-local' : v.type;
        return `${head}<input type="${inputType}" class="op-cell-input" data-card-var-direct="${name}" value="${esc(val)}">`;
    }

    if (val.includes('\n') || val.length > 64) {
        const savedOpen = localStorage.getItem(`streampulse_var_lines_open_${v.name}`);
        const isOpen = savedOpen !== null ? savedOpen === '1' : false;
        return `${head}<details class="op-list-collapse" data-card-list-details="${name}"${isOpen ? ' open' : ''}>
            <summary><span>Text (${val.length} chars)</span><span style="font-size:.72rem;">${isOpen ? 'Collapse' : 'Edit text'}</span></summary>
            <div style="display:grid;gap:.4rem;">
                <textarea class="op-cell-textarea" rows="4" data-card-var-input="${name}">${esc(val)}</textarea>
                <div style="display:flex;justify-content:flex-end;">
                    <button type="button" class="op-btn sm primary" data-card-var-save="${name}">Save Text</button>
                </div>
            </div>
        </details>`;
    }

    return `${head}<div class="op-inline-group">
        <input type="text" class="op-cell-input" data-card-var-input="${name}" value="${esc(val)}">
        <button type="button" class="op-btn sm primary" data-card-var-save="${name}">Save</button>
    </div>`;
}

function bindBoardVarEvents(el, onRefresh) {
    const onKeyDown = async e => {
        if (e.key !== 'Enter' || isEditLocked()) return;
        const t = e.target;
        if (t.dataset?.cardVarDirect) {
            e.preventDefault();
            const name = t.dataset.cardVarDirect;
            await api(`/api/variables/${encodeURIComponent(name)}`, 'PUT', { value: t.value });
            await fetchVariablesData(true);
            toast(`Saved ${name}`, 'success');
            onRefresh();
            return;
        }
        if (t.dataset?.cardVarInput && t.tagName !== 'TEXTAREA') {
            e.preventDefault();
            const name = t.dataset.cardVarInput;
            await api(`/api/variables/${encodeURIComponent(name)}`, 'PUT', { value: t.value });
            await fetchVariablesData(true);
            toast(`Saved ${name}`, 'success');
            onRefresh();
            return;
        }
        if (t.dataset?.cardListEdit) {
            e.preventDefault();
            t.blur();
        }
    };

    const onSubmit = async e => {
        if (isEditLocked()) { e.preventDefault(); return; }
        const form = e.target.closest('[data-card-list-add]');
        if (!form) return;
        e.preventDefault();
        const name = form.dataset.cardListAdd;
        const input = form.querySelector(`[data-card-list-input="${CSS.escape(name)}"]`);
        const line = (input?.value || '').trim();
        if (!line) return;
        const data = await fetchVariablesData(true);
        const v = (data.variables || []).find(item => item.name === name);
        if (!v) return;
        const lines = getVarLines(v);
        input.value = '';
        await api(`/api/variables/${encodeURIComponent(name)}`, 'PUT', { items: [...lines, line] });
        await fetchVariablesData(true);
        onRefresh();
        el.querySelector(`[data-card-list-input="${CSS.escape(name)}"]`)?.focus();
    };

    const onChange = async e => {
        if (isEditLocked()) return;
        const t = e.target;
        if (t.dataset.cardVarColor) {
            await api(`/api/variables/${encodeURIComponent(t.dataset.cardVarColor)}`, 'PUT', { value: t.value });
            await fetchVariablesData(true);
            onRefresh();
            return;
        }
        if (t.dataset.cardVarDirect) {
            await api(`/api/variables/${encodeURIComponent(t.dataset.cardVarDirect)}`, 'PUT', { value: t.value });
            await fetchVariablesData(true);
            onRefresh();
            return;
        }
        if (t.dataset.act === 'value') {
            const wrap = t.closest('[data-card-font-wrap]');
            if (wrap?.dataset.cardFontWrap) {
                await api(`/api/variables/${encodeURIComponent(wrap.dataset.cardFontWrap)}`, 'PUT', { value: t.value });
                await fetchVariablesData(true);
                onRefresh();
                return;
            }
        }
        if (t.dataset.cardListEdit) {
            const name = t.dataset.cardListEdit;
            const idx = Number(t.dataset.lineIdx);
            const data = await fetchVariablesData(true);
            const v = (data.variables || []).find(item => item.name === name);
            if (!v) return;
            const lines = getVarLines(v);
            const clean = t.value.trim();
            if (clean) lines[idx] = clean;
            else lines.splice(idx, 1);
            await api(`/api/variables/${encodeURIComponent(name)}`, 'PUT', { items: lines });
            await fetchVariablesData(true);
            onRefresh();
        }
    };

    const onToggle = e => {
        const details = e.target.closest?.('[data-card-list-details]');
        if (!details) return;
        localStorage.setItem(`streampulse_var_lines_open_${details.dataset.cardListDetails}`, details.open ? '1' : '0');
        const label = details.querySelector('summary span:last-child');
        if (label) {
            const summaryText = details.querySelector('summary span:first-child')?.textContent || '';
            label.textContent = details.open ? 'Collapse' : (summaryText.startsWith('Lines') ? 'Show all' : 'Edit text');
        }
    };

    const onClick = async e => {
        if (isEditLocked()) return;
        const tog = e.target.closest('[data-card-var-toggle]');
        if (tog) {
            const name = tog.dataset.cardVarToggle;
            const next = tog.classList.contains('active') ? 'false' : 'true';
            await api(`/api/variables/${encodeURIComponent(name)}`, 'PUT', { value: next });
            await fetchVariablesData(true);
            onRefresh();
            return;
        }
        const step = e.target.closest('[data-card-var-step]');
        if (step) {
            const name = step.dataset.cardVarStep;
            const delta = Number(step.dataset.delta) || 0;
            const data = await fetchVariablesData(true);
            const cur = Number((data.variables || []).find(item => item.name === name)?.value) || 0;
            await api(`/api/variables/${encodeURIComponent(name)}`, 'PUT', { value: String(cur + delta) });
            await fetchVariablesData(true);
            onRefresh();
            return;
        }
        const setBtn = e.target.closest('[data-card-var-set]');
        if (setBtn) {
            await api(`/api/variables/${encodeURIComponent(setBtn.dataset.cardVarSet)}`, 'PUT', { value: setBtn.dataset.val || '0' });
            await fetchVariablesData(true);
            onRefresh();
            return;
        }
        const rollBtn = e.target.closest('[data-card-var-roll]');
        if (rollBtn) {
            await api(`/api/variables/${encodeURIComponent(rollBtn.dataset.cardVarRoll)}/roll`, 'POST', {});
            await fetchVariablesData(true);
            onRefresh();
            return;
        }
        const delLine = e.target.closest('[data-card-list-del]');
        if (delLine) {
            const name = delLine.dataset.cardListDel;
            const idx = Number(delLine.dataset.lineIdx);
            const data = await fetchVariablesData(true);
            const v = (data.variables || []).find(item => item.name === name);
            if (!v) return;
            const lines = getVarLines(v);
            lines.splice(idx, 1);
            await api(`/api/variables/${encodeURIComponent(name)}`, 'PUT', { items: lines });
            await fetchVariablesData(true);
            onRefresh();
            return;
        }
        const pickImg = e.target.closest('[data-card-pick-img]');
        if (pickImg) {
            const name = pickImg.dataset.cardPickImg;
            const data = await fetchVariablesData();
            const cur = (data.variables || []).find(item => item.name === name)?.value || '';
            window.ImagePicker?.open?.({
                value: cur,
                onPick: async url => {
                    await api(`/api/variables/${encodeURIComponent(name)}`, 'PUT', { value: url || '' });
                    await fetchVariablesData(true);
                    onRefresh();
                }
            });
            return;
        }
        const pickIcon = e.target.closest('[data-card-pick-icon]');
        if (pickIcon) {
            const name = pickIcon.dataset.cardPickIcon;
            const data = await fetchVariablesData();
            const cur = (data.variables || []).find(item => item.name === name)?.value || '';
            window.IconPicker?.open?.({
                value: cur,
                onPick: async cls => {
                    await api(`/api/variables/${encodeURIComponent(name)}`, 'PUT', { value: cls || '' });
                    await fetchVariablesData(true);
                    onRefresh();
                }
            });
            return;
        }
        const saveBtn = e.target.closest('[data-card-var-save]');
        if (saveBtn) {
            const name = saveBtn.dataset.cardVarSave;
            const input = el.querySelector(`[data-card-var-input="${CSS.escape(name)}"]`);
            if (!input) return;
            await api(`/api/variables/${encodeURIComponent(name)}`, 'PUT', { value: input.value });
            await fetchVariablesData(true);
            toast(`Updated ${name}`, 'success');
            onRefresh();
        }
    };

    el.addEventListener('keydown', onKeyDown);
    el.addEventListener('submit', onSubmit);
    el.addEventListener('change', onChange);
    el.addEventListener('toggle', onToggle, true);
    el.addEventListener('click', onClick);
    return () => {
        el.removeEventListener('keydown', onKeyDown);
        el.removeEventListener('submit', onSubmit);
        el.removeEventListener('change', onChange);
        el.removeEventListener('toggle', onToggle, true);
        el.removeEventListener('click', onClick);
    };
}

// --- Live Board Card: Single Variable ---
async function renderSingleVarCard(el, card) {
    const varName = card.config?.variable || '';
    if (!varName) {
        el.innerHTML = '<div style="color:var(--text-muted);font-size:.8rem;">No variable selected.</div>';
        return;
    }
    const data = await fetchVariablesData();
    const v = (data.variables || []).find(item => item.name === varName);
    if (!v) {
        el.innerHTML = `<div style="color:var(--text-muted);font-size:.8rem;">Variable "${esc(varName)}" not found.</div>`;
        return;
    }
    el.innerHTML = renderBoardVarControlHtml(v, false);
}

registerCardType({
    type: 'variable-single',
    moduleId: 'variables',
    label: 'Single Variable',
    description: 'Pin live controls for one custom variable.',
    iconSvg: OP_ICONS.variables,
    isEnabled: status => status?.modules?.variableSettings !== false,
    async getPickerItems() {
        const data = await fetchVariablesData(true);
        return (data.variables || [])
            .filter(v => !v.setId && !v.hidden)
            .map(v => ({
                title: v.name,
                subtitle: `${v.type || 'text'}${v.type === 'list' ? ` · ${getVarLines(v).length} lines` : ` · ${String(v.value ?? '').slice(0, 40)}`}`,
                defaultTitle: v.name,
                config: { variable: v.name }
            }));
    },
    mount(el, card) {
        const refresh = () => renderSingleVarCard(el, card).catch(err => { el.textContent = err.message; });
        const unbind = bindBoardVarEvents(el, refresh);
        el._opRefresh = refresh;
        el._opCleanup = unbind;
        refresh();
    },
    onSocket(el, card, type) {
        if (type === 'variables' || type === 'variables-update') {
            varCache = null;
            el._opRefresh?.();
        }
    },
    unmount(el) {
        el._opCleanup?.();
    }
});

// --- Live Board Card: Variable Group Controls ---
async function renderGroupVarCard(el, card) {
    const groupName = card.config?.group || '';
    const data = await fetchVariablesData();
    const vars = (data.variables || []).filter(v => !v.setId && !v.hidden && (v.group || '') === groupName);
    if (!groupName || !vars.length) {
        el.innerHTML = `<div style="color:var(--text-muted);font-size:.8rem;">No variables in group "${esc(groupName)}".</div>`;
        return;
    }
    el.innerHTML = vars.map(v => `<div class="op-group-var-row">${renderBoardVarControlHtml(v, true)}</div>`).join('')
        + `<a class="op-btn sm" href="#group=${encodeURIComponent(groupName)}" data-jump-vars="1">Open Group View</a>`;
}

registerCardType({
    type: 'variable-group',
    moduleId: 'variables',
    label: 'Variable Group',
    description: 'Controls for variables in a group (with collapsible lists).',
    iconSvg: OP_ICONS.variables,
    isEnabled: status => status?.modules?.variableSettings !== false,
    async getPickerItems() {
        const data = await fetchVariablesData(true);
        return (data.groups || []).map(group => ({
            title: group,
            subtitle: `${(data.variables || []).filter(v => !v.setId && (v.group || '') === group).length} variables`,
            defaultTitle: `Group: ${group}`,
            config: { group }
        }));
    },
    mount(el, card, ctx) {
        const refresh = () => renderGroupVarCard(el, card).catch(err => { el.textContent = err.message; });
        const unbindVars = bindBoardVarEvents(el, refresh);
        const onJump = e => {
            const jump = e.target.closest('[data-jump-vars]');
            if (jump) {
                e.preventDefault();
                location.hash = `#group=${encodeURIComponent(card.config?.group || '')}`;
                ctx.switchTab?.('variables');
            }
        };
        el.addEventListener('click', onJump);
        el._opRefresh = refresh;
        el._opCleanup = () => {
            unbindVars();
            el.removeEventListener('click', onJump);
        };
        refresh();
    },
    onSocket(el, card, type) {
        if (type === 'variables' || type === 'variables-update') {
            varCache = null;
            el._opRefresh?.();
        }
    },
    unmount(el) {
        el._opCleanup?.();
    }
});

// --- Live Board Card: Variable Set Quick Switcher ---
async function renderSetQuickCard(el, card) {
    const setId = card.config?.setId || '';
    const data = await fetchVariablesData();
    const setObj = (data.sets || []).find(s => s.id === setId);
    if (!setObj) {
        el.innerHTML = `<div style="color:var(--text-muted);font-size:.8rem;">Variable Set "${esc(setId)}" not found.</div>`;
        return;
    }
    const roster = (setObj.roster || []).filter(r => r.enabled !== false);
    const activeEntry = setObj.activeEntry || setObj.slots?.[0] || '';
    const readOnly = isEditLocked();
    if (readOnly) {
        const activeLabel = roster.find(r => r.id === activeEntry)?.label || activeEntry || 'None';
        el.innerHTML = `
            <div class="op-panel-row">
                <span class="op-pill is-live">Active: ${esc(activeLabel)}</span>
                <span class="op-pill">${roster.length} enabled</span>
            </div>`;
        return;
    }
    el.innerHTML = `
        <div class="op-panel-row">
            <span class="op-pill">${roster.length} enabled</span>
            <div class="op-btn-row">
                <button type="button" class="op-btn sm" data-set-rot="prev">Prev</button>
                <button type="button" class="op-btn sm" data-set-rot="next">Next</button>
            </div>
        </div>
        <div class="op-alert-triggers">
            ${roster.map(entry => `
                <button type="button" class="op-slot-btn ${activeEntry === entry.id ? 'active' : ''}" data-set-entry="${esc(entry.id)}">${esc(entry.label || entry.id)}</button>
            `).join('') || '<span style="font-size:.78rem;color:var(--text-muted);">No enabled items.</span>'}
        </div>`;
}

registerCardType({
    type: 'variable-set-quick',
    moduleId: 'variables',
    label: 'Variable Set Switcher',
    description: 'Rotate or activate entries in a Variable Set.',
    iconSvg: OP_ICONS.variables,
    isEnabled: status => Boolean(status?.modules?.variableSets),
    async getPickerItems() {
        const data = await fetchVariablesData(true);
        return (data.sets || []).map(s => ({
            title: s.name || s.id,
            subtitle: `${(s.roster || []).length} items · ${(s.fields || []).length} fields`,
            defaultTitle: s.name || s.id,
            config: { setId: s.id }
        }));
    },
    mount(el, card) {
        const setId = card.config?.setId || '';
        const refresh = () => renderSetQuickCard(el, card).catch(err => { el.textContent = err.message; });
        const onClick = async e => {
            if (isEditLocked()) return;
            const rot = e.target.closest('[data-set-rot]');
            if (rot && setId) {
                await api(`/api/variables/sets/${encodeURIComponent(setId)}/rotation/${rot.dataset.setRot}`, 'POST', {});
                await fetchVariablesData(true);
                refresh();
                return;
            }
            const entryBtn = e.target.closest('[data-set-entry]');
            if (entryBtn && setId) {
                await api(`/api/variables/sets/${encodeURIComponent(setId)}/assign`, 'POST', { slot: 0, entry: entryBtn.dataset.setEntry });
                await fetchVariablesData(true);
                refresh();
            }
        };
        el.addEventListener('click', onClick);
        el._opRefresh = refresh;
        el._opCleanup = () => el.removeEventListener('click', onClick);
        refresh();
    },
    onSocket(el, card, type) {
        if (type === 'variables' || type === 'variables-update') {
            varCache = null;
            el._opRefresh?.();
        }
    },
    unmount(el) {
        el._opCleanup?.();
    }
});

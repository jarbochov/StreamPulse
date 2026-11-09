/**
 * StreamPulse — Alerts Studio Rules Management & Master Controls
 */

import {
    $, esc, ICONS, TRIGGERS, TRIGGER_META, AMOUNT_LABEL,
    cfg, setCfg, sel, setSel, dirty, setDirty,
    ruleSearchQuery, setRuleSearchQuery, activeTriggerFilter, setActiveTriggerFilter,
    activeStateFilter, setActiveStateFilter, filtering, showThumbs, persistFilters,
    rule, mediaKind, amountText, api, toast, normRule
} from './alerts-state.js';
import { renderEditor } from './alerts-editor.js';

export function renderSettings() {
    const sEnabled = $('s-enabled');
    const sGap = $('s-gap');
    if (sEnabled) sEnabled.checked = cfg.settings.enabled;
    if (sGap) sGap.value = cfg.settings.gapSeconds;
}

export function thumbFor(r) {
    const v = r.variants.find(x => mediaKind(x));
    if (!v) return '';
    if (v.image) return `<img src="${esc(v.image)}" alt="" loading="lazy">`;
    if (v.video) return `<video src="${esc(v.video)}" muted preload="metadata"></video>`;
    return v.emojiUrl ? `<img src="${esc(v.emojiUrl)}" alt="" loading="lazy">` : '';
}

export function syncFilterUi() {
    document.querySelectorAll('[data-filter-trigger]').forEach(b => b.classList.toggle('active', b.dataset.filterTrigger === activeTriggerFilter));
    document.querySelectorAll('[data-filter-state]').forEach(b => b.classList.toggle('active', b.dataset.filterState === activeStateFilter));
    const searchInput = $('rule-search');
    const searchClear = $('rule-search-clear');
    if (searchInput) searchInput.value = ruleSearchQuery;
    if (searchClear) searchClear.hidden = !ruleSearchQuery;
}

export function renderRules() {
    const q = ruleSearchQuery.toLowerCase().trim();
    const allowedTriggers = activeTriggerFilter ? activeTriggerFilter.split(',') : null;
    const filtered = cfg.rules.filter(r => {
        if (q && !(r.name.toLowerCase().includes(q) || (TRIGGERS[r.trigger] || '').toLowerCase().includes(q) || r.trigger.includes(q) || r.variants.some(v => `${v.title || ''} ${v.message || ''}`.toLowerCase().includes(q)))) return false;
        if (activeStateFilter === 'active' && !r.enabled) return false;
        if (activeStateFilter === 'inactive' && r.enabled) return false;
        if (allowedTriggers && !allowedTriggers.includes(r.trigger)) return false;
        return true;
    });

    const ruleCountPill = $('rule-count-pill');
    const ruleBadgeCnt = $('rule-badge-cnt');
    if (ruleCountPill) ruleCountPill.textContent = cfg.rules.length;
    if (ruleBadgeCnt) ruleBadgeCnt.textContent = cfg.rules.length;

    const ruleList = $('rule-list');
    if (!ruleList) return;

    if (!cfg.rules.length) {
        ruleList.innerHTML = `<div class="empty-state">${ICONS.sliders}<span>No alert rules yet. Click "New Rule" to create your first alert.</span></div>`;
        return;
    }

    if (!filtered.length) {
        ruleList.innerHTML = `<div class="empty-state" style="padding:1.5rem 0.5rem;"><span>No rules match "${esc(q || activeTriggerFilter)}".</span><button type="button" class="btn sm" id="clear-rule-filters">Reset filters</button></div>`;
        return;
    }

    const canReorder = !filtering();
    ruleList.innerHTML = filtered.map(r => {
        const meta = TRIGGER_META[r.trigger] || { label: r.trigger, icon: ICONS.zap, color: '#3b82f6' };
        const isSel = r.id === sel;
        const amtCond = AMOUNT_LABEL[r.trigger] && r.trigger !== 'sub' ? amountText(r.conditions) : '';
        return `
        <div class="rule-item${isSel ? ' active' : ''}${r.enabled ? '' : ' off'}" data-rule="${esc(r.id)}" tabindex="0" ${canReorder ? 'draggable="true"' : ''} title="${esc(r.name)} (${meta.label})">
            ${canReorder ? `<span class="drag-handle" title="Drag to reorder (Alt+Up / Alt+Down)" aria-hidden="true"><svg class="ico" viewBox="0 0 24 24"><circle cx="9" cy="6" r="1.4"/><circle cx="15" cy="6" r="1.4"/><circle cx="9" cy="12" r="1.4"/><circle cx="15" cy="12" r="1.4"/><circle cx="9" cy="18" r="1.4"/><circle cx="15" cy="18" r="1.4"/></svg></span>` : ''}
            ${showThumbs() && thumbFor(r) ? `<span class="vthumb sm">${thumbFor(r)}</span>` : ''}
            <div class="rule-icon-box" style="color:${meta.color};border-color:color-mix(in srgb, ${meta.color} 35%, var(--border));background:color-mix(in srgb, ${meta.color} 10%, var(--bg-card));">
                ${meta.icon}
            </div>
            <div class="rule-item-content">
                <div class="rule-item-name">${esc(r.name)}</div>
                <div class="rule-item-meta">
                    <span class="rule-item-tag" style="color:${meta.color};">${esc(meta.label)}</span>
                    ${r.webhookOnly ? `<span class="al-s5 rule-item-tag">Action Only</span>` : ''}
                    ${amtCond ? `<span class="rule-item-tag">${esc(amtCond)}</span>` : ''}
                </div>
            </div>
            <span class="count-pill" title="${r.variants.length} variant${r.variants.length === 1 ? '' : 's'}">${r.variants.length}</span>
            <div class="rule-item-toggle">
                <button type="button" class="rule-switch${r.enabled ? ' on' : ''}" data-rule-toggle="${esc(r.id)}" role="switch" aria-checked="${r.enabled ? 'true' : 'false'}" title="${r.enabled ? 'Active: click to disable' : 'Disabled: click to enable'}" aria-label="Rule active"><span class="rule-switch-knob"></span></button>
            </div>
        </div>`;
    }).join('');
}

export const moveRule = (id, toIndex) => {
    const from = cfg.rules.findIndex(r => r.id === id);
    if (from < 0 || toIndex < 0 || toIndex >= cfg.rules.length || from === toIndex) return;
    cfg.rules.splice(toIndex, 0, cfg.rules.splice(from, 1)[0]);
    setDirty(true);
    renderRules();
    document.querySelector(`.rule-item[data-rule="${CSS.escape(id)}"]`)?.focus();
};

export async function save(renderAll) {
    const saved = await api('/api/alerts', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg) });
    setCfg({ settings: saved.settings, rules: saved.rules });
    if (!rule()) setSel(cfg.rules[0]?.id || null);
    setDirty(false);
    if (renderAll) renderAll();
}

export const download = (name, data) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};

export const exportRules = (rules, label) => {
    download(`streampulse-alerts-${label}-${new Date().toISOString().slice(0, 10)}.json`, { format: 'streampulse-alerts', version: 1, exportedAt: new Date().toISOString(), rules });
    toast(`Exported ${rules.length} rule${rules.length === 1 ? '' : 's'}${rules.some(x => x.actions?.http?.url) ? '. Webhook URLs are included in the file' : ''}`);
};

export function setupRulesEvents(renderAll) {
    let dragId = null;
    const clearDrop = () => $('rule-list')?.querySelectorAll('.drop-before,.drop-after,.dragging').forEach(n => n.classList.remove('drop-before', 'drop-after', 'dragging'));

    $('rule-list')?.addEventListener('click', event => {
        const cl = event.target.closest('#clear-rule-filters');
        if (cl) {
            setRuleSearchQuery('');
            setActiveTriggerFilter('');
            setActiveStateFilter('');
            persistFilters();
            syncFilterUi();
            renderRules();
            return;
        }
        const tg = event.target.closest('[data-rule-toggle]');
        if (tg) {
            const r = cfg.rules.find(x => x.id === tg.dataset.ruleToggle);
            if (r) {
                r.enabled = !r.enabled;
                setDirty(true);
                renderRules();
                if (r.id === sel) renderEditor();
            }
            return;
        }
        const item = event.target.closest('[data-rule]');
        if (item) {
            setSel(item.dataset.rule);
            localStorage.setItem('alerts.selected', sel);
            renderRules();
            renderEditor();
        }
    });

    $('rule-list')?.addEventListener('dragstart', e => {
        const item = e.target.closest('[data-rule]');
        if (!item) return;
        dragId = item.dataset.rule;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', dragId);
        item.classList.add('dragging');
    });

    $('rule-list')?.addEventListener('dragover', e => {
        const item = e.target.closest('[data-rule]');
        if (!dragId || !item) return;
        e.preventDefault();
        const rect = item.getBoundingClientRect();
        const after = e.clientY > rect.top + rect.height / 2;
        $('rule-list').querySelectorAll('.drop-before,.drop-after').forEach(n => n.classList.remove('drop-before', 'drop-after'));
        if (item.dataset.rule !== dragId) item.classList.add(after ? 'drop-after' : 'drop-before');
    });

    $('rule-list')?.addEventListener('drop', e => {
        const item = e.target.closest('[data-rule]');
        if (!dragId || !item) return;
        e.preventDefault();
        const rect = item.getBoundingClientRect();
        const after = e.clientY > rect.top + rect.height / 2;
        const id = dragId;
        dragId = null;
        clearDrop();
        const without = cfg.rules.filter(r => r.id !== id);
        let to = without.findIndex(r => r.id === item.dataset.rule) + (after ? 1 : 0);
        if (item.dataset.rule === id) return;
        cfg.rules.splice(0, cfg.rules.length, ...without.slice(0, to), cfg.rules.find(r => r.id === id), ...without.slice(to));
        setDirty(true);
        renderRules();
    });

    $('rule-list')?.addEventListener('dragend', () => { dragId = null; clearDrop(); });

    $('rule-list')?.addEventListener('keydown', e => {
        const item = e.target.closest('[data-rule]');
        if (!item || e.target !== item) return;
        if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && !filtering()) {
            e.preventDefault();
            const i = cfg.rules.findIndex(r => r.id === item.dataset.rule);
            moveRule(item.dataset.rule, i + (e.key === 'ArrowUp' ? -1 : 1));
        } else if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            item.click();
        }
    });

    $('rule-search')?.addEventListener('input', e => {
        setRuleSearchQuery(e.target.value);
        const clearBtn = $('rule-search-clear');
        if (clearBtn) clearBtn.hidden = !ruleSearchQuery;
        persistFilters();
        renderRules();
    });

    $('rule-search-clear')?.addEventListener('click', () => {
        setRuleSearchQuery('');
        const input = $('rule-search');
        if (input) input.value = '';
        $('rule-search-clear').hidden = true;
        persistFilters();
        renderRules();
    });

    $('trigger-filter-chips')?.addEventListener('click', e => {
        const btn = e.target.closest('[data-filter-trigger]');
        if (btn) {
            setActiveTriggerFilter(btn.dataset.filterTrigger);
            persistFilters();
            syncFilterUi();
            renderRules();
            return;
        }
        const stateBtn = e.target.closest('[data-filter-state]');
        if (stateBtn) {
            setActiveStateFilter(activeStateFilter === stateBtn.dataset.filterState ? '' : stateBtn.dataset.filterState);
            persistFilters();
            syncFilterUi();
            renderRules();
        }
    });

    // Master Settings Listeners
    $('s-enabled')?.addEventListener('change', e => {
        cfg.settings.enabled = e.target.checked;
        setDirty(true);
    });
    $('s-gap')?.addEventListener('change', e => {
        cfg.settings.gapSeconds = Math.max(0, Math.min(60, Number(e.target.value) || 0));
        setDirty(true);
    });
    document.addEventListener('change', e => {
        if (e.target.id === 's-companion-url') {
            cfg.settings.companionUrl = e.target.value.trim();
            setDirty(true);
        }
    });

    // Guide Toggle
    $('btn-guide')?.addEventListener('click', () => {
        const g = $('alerts-guide');
        if (!g) return;
        const willOpen = g.hidden;
        g.hidden = !willOpen;
        localStorage.setItem('alerts.guideOpen', willOpen ? '1' : '0');
        $('btn-guide').classList.toggle('active', willOpen);
    });
    if (localStorage.getItem('alerts.guideOpen') === '1' && $('alerts-guide')) {
        $('alerts-guide').hidden = false;
        $('btn-guide')?.classList.add('active');
    }

    // Add Rule
    const addRuleBtn = $('add-rule');
    if (addRuleBtn) {
        addRuleBtn.addEventListener('click', () => {
            const menu = $('add-rule-menu');
            if (menu) menu.open = !menu.open;
        });
    }

    $('add-rule-menu')?.addEventListener('click', e => {
        const item = e.target.closest('[data-add-trigger]');
        if (!item) return;
        $('add-rule-menu').open = false;
        const trigger = item.dataset.addTrigger;
        import('./alerts-state.js').then(({ blankRule }) => {
            const nr = blankRule(trigger);
            cfg.rules.unshift(nr);
            setSel(nr.id);
            setDirty(true);
            renderRules();
            renderEditor();
            document.querySelector(`.rule-item[data-rule="${CSS.escape(nr.id)}"]`)?.focus();
        });
    });

    // Import / Export
    let importRules = [];
    $('export-all')?.addEventListener('click', () => {
        const io = $('io-menu');
        if (io) io.open = false;
        exportRules(cfg.rules, 'all');
    });

    $('export-rule')?.addEventListener('click', () => {
        const io = $('io-menu');
        if (io) io.open = false;
        const r = rule();
        if (r) exportRules([r], r.name.replace(/[^\w-]+/g, '-').toLowerCase() || 'rule');
        else toast('Select a rule first', true);
    });

    $('import-btn')?.addEventListener('click', () => {
        const io = $('io-menu');
        if (io) io.open = false;
        const fileInput = $('import-file');
        if (fileInput) {
            fileInput.value = '';
            fileInput.click();
        }
    });

    $('import-file')?.addEventListener('change', async () => {
        try {
            const file = $('import-file').files[0];
            if (!file) return;
            const data = JSON.parse(await file.text());
            const list = Array.isArray(data) ? data : Array.isArray(data?.rules) ? data.rules : null;
            if (!list || !list.length) throw new Error('No rules found in that file');
            const bad = list.findIndex(x => !x || typeof x !== 'object' || !TRIGGERS[x.trigger]);
            if (bad >= 0) throw new Error(`Rule ${bad + 1} has a missing or unknown trigger`);
            importRules = list;
            const hooks = list.filter(x => x.actions?.http?.url).length;
            $('import-summary').textContent = `${list.length} rule${list.length === 1 ? '' : 's'} found (${list.reduce((n, x) => n + (x.variants?.length || 1), 0)} variants${hooks ? `, ${hooks} with webhook URLs` : ''}). You currently have ${cfg.rules.length}.`;
            $('import-dlg').showModal();
        } catch (err) {
            toast(`Import failed: ${err.message}`, true);
        }
    });

    $('import-cancel')?.addEventListener('click', () => $('import-dlg')?.close());

    $('import-apply')?.addEventListener('click', () => {
        const replace = document.querySelector('input[name="import-mode"]:checked')?.value === 'replace';
        const rules = importRules.map(x => normRule(x, !replace));
        cfg.rules = replace ? rules : cfg.rules.concat(rules);
        setSel(rules[0].id);
        $('import-dlg')?.close();
        setDirty(true);
        if (renderAll) renderAll();
        toast(`${replace ? 'Replaced with' : 'Imported'} ${rules.length} rule${rules.length === 1 ? '' : 's'}. Save to keep, Revert to undo`);
    });
}

'use strict';

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

export function defaultMeter() {
    return window.OverlayShared?.defaultDisplayMeter
        ? window.OverlayShared.defaultDisplayMeter()
        : {
            sourceMode: 'variables', variables: [], valueField: '', labelField: '$label', rowScope: 'all',
            theme: 'modern', style: 'bar', capMode: 'auto', customCap: 100, segments: 10, direction: 'vertical',
            readout: 'both', showLabel: true, trail: true, useThresholds: false, lowThreshold: 25, midThreshold: 55,
            fillColor: '#22c55e', trackColor: '#ffffff1a', trailColor: '#ffffff66', lowColor: '#ef4444', midColor: '#f59e0b',
            labelColor: '#f8fafc', readoutColor: '#e2e8f0', rowBackground: '#0f172ad9', rowBorderColor: '#ffffff24',
            rowBorderWidth: 1, rowRadius: 12, rowPadding: 14, barHeight: 16, ringSize: 96, rowGap: 10, fontSize: 15, fontFamily: 'sans-serif', maxRows: 12
        };
}

const THEME_SWATCHES = [
    ['modern', 'Modern Glass', '#0f172a', '#22c55e', '#ffffff33'],
    ['esports', 'Esports Broadcast', '#090d16', '#38bdf8', '#38bdf866'],
    ['sports', 'Broadcast Sports', '#0d1a33', '#f59e0b', '#f59e0b66'],
    ['arcade', 'Retro Arcade', '#120824', '#e879f9', '#22d3ee99'],
    ['minimal', 'Minimal HUD', 'transparent', '#f8fafc', '#ffffff66'],
    ['cozy', 'RPG Hearts', '#1c1124', '#f43f5e', '#fb718566']
];

const STYLE_OPTIONS = [
    ['bar', 'HP Bar', '<svg viewBox="0 0 44 16" width="38" height="14" aria-hidden="true"><rect x="2" y="4" width="40" height="8" rx="4" fill="currentColor" opacity=".2"/><rect x="2" y="4" width="28" height="8" rx="4" fill="currentColor"/></svg>'],
    ['segmented', 'Segmented', '<svg viewBox="0 0 44 16" width="38" height="14" aria-hidden="true"><rect x="2" y="4" width="7" height="8" rx="1.5" fill="currentColor"/><rect x="11" y="4" width="7" height="8" rx="1.5" fill="currentColor"/><rect x="20" y="4" width="7" height="8" rx="1.5" fill="currentColor"/><rect x="29" y="4" width="7" height="8" rx="1.5" fill="currentColor" opacity=".22"/></svg>'],
    ['ring', 'Radial Ring', '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="3" opacity=".22"/><path d="M12 4a8 8 0 1 1-7.5 10.7" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>'],
    ['vertical', 'Vertical Bar', '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><rect x="8" y="2" width="8" height="20" rx="4" fill="currentColor" opacity=".2"/><rect x="8" y="8" width="8" height="14" rx="4" fill="currentColor"/></svg>']
];

const COLOR_FIELDS = [
    ['fillColor', 'Fill color'],
    ['trackColor', 'Track background'],
    ['trailColor', 'Drain trail color'],
    ['midColor', 'Mid threshold color'],
    ['lowColor', 'Low threshold color'],
    ['labelColor', 'Label text'],
    ['readoutColor', 'Readout text'],
    ['rowBackground', 'Row background'],
    ['rowBorderColor', 'Row border']
];

export function createMeterDesigner(designRoot, appearanceRoot, { getDraft, getSets, getVariables, onChange, pickColor, pickFont }) {
    function ensureMeter() {
        const draft = getDraft();
        if (!draft) return null;
        draft.meter = { ...defaultMeter(), ...(draft.meter || {}) };
        if (!Array.isArray(draft.meter.variables)) draft.meter.variables = [];
        return draft.meter;
    }

    const numericVars = () => (getVariables() || []).filter(v => !v.setId && (v.type === 'counter' || v.type === 'number'));

    function renderDesign() {
        const draft = getDraft();
        const cfg = ensureMeter();
        if (!draft || !cfg || !designRoot) return;
        const sets = getSets() || [];
        const vars = numericVars();
        const bound = new Set(cfg.variables.map(v => v.name));
        const available = vars.filter(v => !bound.has(v.name));
        const selectedSet = sets.find(s => s.id === draft.catalogId);
        const setFields = selectedSet?.fields || [];

        const sourceHtml = cfg.sourceMode === 'set'
            ? `<div class="control-grid">
                <div class="control-field"><label for="meter-set-select">Variable Set</label>
                    <select id="meter-set-select" class="select input" data-meter-set="catalogId">
                        <option value="">Choose a Variable Set</option>
                        ${sets.map(s => `<option value="${esc(s.id)}"${draft.catalogId === s.id ? ' selected' : ''}>${esc(s.name || s.id)} · ${(s.roster || []).length} entries</option>`).join('')}
                    </select>
                </div>
                <div class="control-field"><label for="meter-val-field">Numeric field</label>
                    <select id="meter-val-field" class="select input" data-meter-field="valueField"${!selectedSet ? ' disabled' : ''}>
                        <option value="">Auto (first numeric field)</option>
                        ${setFields.filter(f => ['counter', 'number'].includes(f.type)).map(f => `<option value="${esc(f.key)}"${cfg.valueField === f.key ? ' selected' : ''}>${esc(f.label || f.key)}</option>`).join('')}
                    </select>
                </div>
                <div class="control-field"><label for="meter-row-scope">Default rows</label>
                    <select id="meter-row-scope" class="select input" data-meter-field="rowScope">
                        <option value="all"${cfg.rowScope === 'all' ? ' selected' : ''}>All enabled entries</option>
                        <option value="active"${cfg.rowScope === 'active' ? ' selected' : ''}>Active entry only</option>
                        <option value="slots"${cfg.rowScope === 'slots' ? ' selected' : ''}>Live slots</option>
                        <option value="group"${cfg.rowScope === 'group' ? ' selected' : ''}>In Group entries</option>
                        <option value="group-slots"${cfg.rowScope === 'group-slots' ? ' selected' : ''}>In Group live slots</option>
                    </select>
                </div>
            </div>`
            : `<div class="counter-var-picker">
                <select id="meter-var-select" class="select input" aria-label="Choose a counter or number variable">
                    <option value="">${available.length ? 'Choose a counter or number variable…' : (vars.length ? 'All numeric variables added' : 'No counter or number variables yet')}</option>
                    ${available.map(v => `<option value="${esc(v.name)}">${esc(v.name)} (${esc(v.value ?? 0)}${v.max != null && v.max !== '' ? ` / ${v.max}` : ''})</option>`).join('')}
                </select>
                <button type="button" class="btn btn-sm btn-primary" data-meter-act="add-var"${!available.length ? ' disabled' : ''}>Add meter</button>
            </div>
            <div class="counter-var-list">
                ${cfg.variables.length ? cfg.variables.map((item, idx) => `<div class="counter-var-row" data-var-idx="${idx}">
                    <div class="counter-var-info"><strong>${esc(item.name)}</strong><small>Counter / Number</small></div>
                    <input type="text" class="input input-sm" maxlength="60" placeholder="Display label" value="${esc(item.label || '')}" data-meter-var-prop="label" data-var-idx="${idx}">
                    <input type="number" class="input input-sm" min="1" max="1000000" placeholder="Max (auto)" value="${item.cap != null ? esc(item.cap) : ''}" data-meter-var-prop="cap" data-var-idx="${idx}">
                    <div class="counter-var-actions">
                        <button type="button" class="btn btn-sm btn-danger" data-meter-act="remove-var" data-var-idx="${idx}">Remove</button>
                    </div>
                </div>`).join('') : '<div class="section-placeholder">Add one or more Counter / Number variables above to display HP bars or radial gauges.</div>'}
            </div>`;

        designRoot.innerHTML = `
            <div class="builder-card-heading">
                <div><h3>1. Data source</h3><p class="display-muted">Track Counter/Number variables or numeric fields from a Variable Set.</p></div>
                <div class="tabs-nav" role="group" aria-label="Meter data source">
                    <button type="button" class="tab-btn${cfg.sourceMode === 'variables' ? ' active' : ''}" data-meter-source="variables">Variables</button>
                    <button type="button" class="tab-btn${cfg.sourceMode === 'set' ? ' active' : ''}" data-meter-source="set">Variable Set</button>
                </div>
            </div>
            ${sourceHtml}
            <div class="builder-card-heading" style="margin-top:20px;">
                <div><h3>2. Meter style &amp; readout</h3><p class="display-muted">Choose an HP bar, segmented meter, circular ring gauge, or vertical meter.</p></div>
            </div>
            <div class="counter-style-grid" role="radiogroup" aria-label="Meter style">
                ${STYLE_OPTIONS.map(([id, label, svg]) => `<button type="button" class="counter-style-chip${cfg.style === id ? ' active' : ''}" data-meter-style="${esc(id)}" aria-pressed="${cfg.style === id}"><span class="counter-style-icon">${svg}</span><span>${esc(label)}</span></button>`).join('')}
            </div>
            <div class="control-grid" style="margin-top:14px;">
                <div class="control-field"><label for="meter-cap-mode">Max scale</label>
                    <select id="meter-cap-mode" class="select input" data-meter-field="capMode">
                        <option value="auto"${cfg.capMode === 'auto' ? ' selected' : ''}>Auto (variable max / fallback)</option>
                        <option value="custom"${cfg.capMode === 'custom' ? ' selected' : ''}>Fixed custom max</option>
                    </select>
                </div>
                <div class="control-field"><label for="meter-custom-cap">${cfg.capMode === 'auto' ? 'Fallback max' : 'Custom max'}</label>
                    <input id="meter-custom-cap" class="input" type="number" min="1" max="1000000" value="${esc(cfg.customCap)}" data-meter-field="customCap">
                </div>
                ${cfg.style === 'segmented' ? `<div class="control-field"><label for="meter-segments">Segments</label><input id="meter-segments" class="input" type="number" min="2" max="40" value="${esc(cfg.segments)}" data-meter-field="segments"></div>` : ''}
                <div class="control-field"><label for="meter-readout">Readout</label>
                    <select id="meter-readout" class="select input" data-meter-field="readout">
                        <option value="both"${cfg.readout === 'both' ? ' selected' : ''}>Value &amp; % (75 / 100 · 75%)</option>
                        <option value="fraction"${cfg.readout === 'fraction' ? ' selected' : ''}>Fraction (75 / 100)</option>
                        <option value="percent"${cfg.readout === 'percent' ? ' selected' : ''}>Percent (75%)</option>
                        <option value="value"${cfg.readout === 'value' ? ' selected' : ''}>Value only (75)</option>
                        <option value="none"${cfg.readout === 'none' ? ' selected' : ''}>Hidden</option>
                    </select>
                </div>
                <div class="control-field toggle-field" style="align-self:end;"><input id="meter-show-label" type="checkbox" data-meter-check="showLabel"${cfg.showLabel ? ' checked' : ''}><label for="meter-show-label">Show label</label></div>
                <div class="control-field toggle-field" style="align-self:end;"><input id="meter-trail" type="checkbox" data-meter-check="trail"${cfg.trail ? ' checked' : ''}><label for="meter-trail">Damage-drain trail</label></div>
            </div>
        `;
    }

    function renderAppearance() {
        const cfg = ensureMeter();
        if (!cfg || !appearanceRoot) return;
        appearanceRoot.innerHTML = `
            <div class="builder-card-heading"><div><h3>Broadcast theme</h3><p class="display-muted">Apply a cohesive broadcast look, then fine-tune thresholds, colors, or variable bindings.</p></div></div>
            <div class="counter-theme-grid" role="radiogroup" aria-label="Broadcast theme" style="margin-bottom:20px;">
                ${THEME_SWATCHES.map(([id, label, bg, accent, border]) => `<button type="button" class="counter-theme-swatch${(cfg.theme || 'modern') === id ? ' active' : ''}" data-meter-theme="${esc(id)}" aria-pressed="${(cfg.theme || 'modern') === id}"><span class="counter-theme-bar" style="background:${esc(bg)};border-color:${esc(border)};"><i style="width:60%;height:7px;border-radius:4px;background:${esc(accent)};"></i></span><span>${esc(label)}</span></button>`).join('')}
            </div>
            <div class="builder-card-heading"><div><h3>Thresholds, colors &amp; sizing</h3><p class="display-muted">Colors support #RRGGBBAA, <code>{{var.*}}</code>, or per-player Variable Set colors (<code>@color</code>).</p></div></div>
            <div class="control-grid" style="margin-bottom:14px;">
                <div class="control-field toggle-field"><input id="meter-thresholds" type="checkbox" data-meter-check="useThresholds"${cfg.useThresholds ? ' checked' : ''}><label for="meter-thresholds">Enable HP color thresholds</label></div>
                ${cfg.useThresholds ? `<div class="control-field"><label for="meter-mid-t">Mid threshold (%)</label><input id="meter-mid-t" class="input" type="number" min="2" max="99" value="${esc(cfg.midThreshold)}" data-meter-field="midThreshold"></div>
                <div class="control-field"><label for="meter-low-t">Low threshold (%)</label><input id="meter-low-t" class="input" type="number" min="1" max="99" value="${esc(cfg.lowThreshold)}" data-meter-field="lowThreshold"></div>` : ''}
            </div>
            <div class="control-grid appearance-grid" style="padding:0;">
                ${COLOR_FIELDS.map(([key, label]) => {
                    const val = cfg[key] || '';
                    const isVar = val.includes('{{') || val.startsWith('@');
                    const pickerVal = /^#[a-f\d]{6}/i.test(val) ? val.slice(0, 7) : '#22c55e';
                    return `<div class="control-field"><label for="meter-color-${key}">${esc(label)}</label>
                        <span class="display-color-pair">
                            <input type="color" data-meter-color="${key}" value="${esc(pickerVal)}"${isVar ? ' disabled style="opacity:.35;"' : ''}>
                            <input id="meter-color-${key}" class="input" type="text" maxlength="90" value="${esc(val)}" data-meter-field="${key}">
                            ${isVar ? `<button type="button" class="btn btn-sm counter-var-btn" data-meter-unbind-color="${key}" title="Clear binding">&times;</button>` : ''}
                            <button type="button" class="btn btn-sm counter-var-btn${isVar ? ' active' : ''}" data-meter-pick-color="${key}" title="Bind color variable">{}</button>
                        </span>
                    </div>`;
                }).join('')}
                <div class="control-field"><label for="meter-bar-h">Bar height (px)</label><input id="meter-bar-h" class="input" type="number" min="6" max="64" value="${esc(cfg.barHeight)}" data-meter-field="barHeight"></div>
                <div class="control-field"><label for="meter-ring-s">Ring / Vertical size (px)</label><input id="meter-ring-s" class="input" type="number" min="48" max="240" value="${esc(cfg.ringSize)}" data-meter-field="ringSize"></div>
                <div class="control-field"><label for="meter-font-s">Font size (px)</label><input id="meter-font-s" class="input" type="number" min="10" max="64" value="${esc(cfg.fontSize)}" data-meter-field="fontSize"></div>
                <div class="control-field"><label for="meter-font">Font family</label>
                    <span class="display-color-pair">
                        <input id="meter-font" class="input" type="text" maxlength="120" value="${esc(cfg.fontFamily)}" data-meter-field="fontFamily">
                        <button type="button" class="btn btn-sm counter-var-btn${(cfg.fontFamily || '').includes('{{') ? ' active' : ''}" data-meter-pick-font="1" title="Bind font variable">{}</button>
                    </span>
                </div>
            </div>
        `;
    }

    function render() { renderDesign(); renderAppearance(); }

    function bind(root) {
        if (!root) return;
        root.addEventListener('click', event => {
            const cfg = ensureMeter();
            if (!cfg) return;
            const src = event.target.closest('[data-meter-source]');
            if (src) { cfg.sourceMode = src.dataset.meterSource === 'set' ? 'set' : 'variables'; renderDesign(); onChange(); return; }
            const sty = event.target.closest('[data-meter-style]');
            if (sty) { cfg.style = sty.dataset.meterStyle; renderDesign(); onChange(); return; }
            const thm = event.target.closest('[data-meter-theme]');
            if (thm) {
                const id = thm.dataset.meterTheme;
                const p = window.OverlayShared?.METER_THEME_PRESETS?.[id];
                cfg.theme = id;
                if (p) Object.assign(cfg, { fillColor: p.filledColor, labelColor: p.labelColor, readoutColor: p.readoutColor, rowBackground: p.rowBackground, rowBorderColor: p.rowBorderColor, rowBorderWidth: p.rowBorderWidth, rowRadius: p.rowRadius, rowPadding: p.rowPadding });
                renderAppearance(); onChange(); return;
            }
            const unbind = event.target.closest('[data-meter-unbind-color]');
            if (unbind) { cfg[unbind.dataset.meterUnbindColor] = defaultMeter()[unbind.dataset.meterUnbindColor] || ''; renderAppearance(); onChange(); return; }
            const pickC = event.target.closest('[data-meter-pick-color]');
            if (pickC && typeof pickColor === 'function') {
                pickColor({ allowMember: cfg.sourceMode === 'set', onSelect: token => { cfg[pickC.dataset.meterPickColor] = token; renderAppearance(); onChange(); } });
                return;
            }
            if (event.target.closest('[data-meter-pick-font]') && typeof pickFont === 'function') {
                pickFont({ onSelect: token => { cfg.fontFamily = token; renderAppearance(); onChange(); } });
                return;
            }
            const act = event.target.closest('[data-meter-act]');
            if (!act) return;
            if (act.dataset.meterAct === 'add-var') {
                const name = designRoot.querySelector('#meter-var-select')?.value;
                if (name && !cfg.variables.some(v => v.name === name)) { cfg.variables.push({ name, label: '', cap: null }); renderDesign(); onChange(); }
            } else if (act.dataset.meterAct === 'remove-var') {
                cfg.variables.splice(Number(act.dataset.varIdx), 1); renderDesign(); onChange();
            }
        });
        root.addEventListener('input', event => {
            const cfg = ensureMeter();
            if (!cfg) return;
            const t = event.target;
            if (t.dataset.meterColor) {
                cfg[t.dataset.meterColor] = t.value;
                const txt = t.closest('.display-color-pair')?.querySelector('input[type="text"]');
                if (txt) txt.value = t.value;
                onChange(); return;
            }
            if (t.dataset.meterVarProp) {
                const idx = Number(t.dataset.varIdx);
                if (cfg.variables[idx]) cfg.variables[idx][t.dataset.meterVarProp] = t.dataset.meterVarProp === 'cap' ? (t.value === '' ? null : Number(t.value)) : t.value;
                onChange(); return;
            }
            if (t.dataset.meterField) {
                if (t.type === 'number') { if (t.value === '') return; cfg[t.dataset.meterField] = Number(t.value); }
                else cfg[t.dataset.meterField] = t.value;
                onChange();
            }
        });
        root.addEventListener('change', event => {
            const draft = getDraft();
            const cfg = ensureMeter();
            if (!draft || !cfg) return;
            const t = event.target;
            if (t.dataset.meterSet === 'catalogId') { draft.catalogId = t.value; cfg.valueField = ''; renderDesign(); onChange(); return; }
            if (t.dataset.meterCheck) { cfg[t.dataset.meterCheck] = t.checked; render(); onChange(); return; }
            if (t.dataset.meterField && ['capMode'].includes(t.dataset.meterField)) { cfg[t.dataset.meterField] = t.value; renderDesign(); onChange(); }
        });
    }

    bind(designRoot);
    bind(appearanceRoot);
    return { render };
}

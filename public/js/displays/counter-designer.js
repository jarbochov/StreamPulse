'use strict';

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

export function defaultCounter() {
    if (window.OverlayShared?.defaultDisplayCounter) {
        return window.OverlayShared.defaultDisplayCounter();
    }
    return {
        sourceMode: 'variables',
        variables: [],
        valueField: '',
        labelField: '$label',
        rowScope: 'all',
        theme: 'modern',
        style: 'pips',
        capMode: 'auto',
        customCap: 5,
        overflowMode: 'plus',
        perRow: 10,
        direction: 'vertical',
        align: 'left',
        showLabel: true,
        labelPosition: 'left',
        readout: 'fraction',
        readoutPosition: 'right',
        filledColor: '#f43f5e',
        emptyColor: '#ffffff1f',
        outlineColor: '#ffffff66',
        capReachedColor: '',
        overflowColor: '#fbbf24',
        labelColor: '#f8fafc',
        readoutColor: '#cbd5e1',
        rowBackground: '#0f172acc',
        rowBorderColor: '#ffffff1a',
        rowBorderWidth: 1,
        rowRadius: 10,
        rowPadding: 12,
        markerSize: 26,
        strokeWidth: 2,
        markerGap: 6,
        rowGap: 10,
        fontSize: 16,
        fontFamily: 'sans-serif',
        animate: 'pop',
        maxRows: 12
    };
}

const THEME_SWATCHES = [
    ['modern', 'Modern Glass', '#0f172a', '#f43f5e', '#ffffff33'],
    ['esports', 'Esports Broadcast', '#090d16', '#38bdf8', '#38bdf866'],
    ['sports', 'Broadcast Sports', '#0d1a33', '#f59e0b', '#f59e0b66'],
    ['arcade', 'Retro Arcade', '#120824', '#e879f9', '#22d3ee99'],
    ['minimal', 'Minimal HUD', 'transparent', '#f8fafc', '#ffffff66'],
    ['cozy', 'RPG Hearts', '#1c1124', '#f43f5e', '#fb718566'],
    ['chalkboard', 'Chalkboard', '#13201a', '#f5f2e6', '#d6c7a166']
];

const STYLE_OPTIONS = [
    ['pips', 'Pips', '<svg viewBox="0 0 44 16" width="38" height="14" aria-hidden="true"><circle cx="8" cy="8" r="5" fill="currentColor"/><circle cx="22" cy="8" r="5" fill="currentColor"/><circle cx="36" cy="8" r="5" fill="none" stroke="currentColor" stroke-width="1.6" opacity=".5"/></svg>'],
    ['hearts', 'Hearts', '<svg viewBox="0 0 44 16" width="38" height="14" aria-hidden="true"><path d="M8 13.5S2.5 9.8 2.5 6A3 3 0 0 1 8 4.4 3 3 0 0 1 13.5 6C13.5 9.8 8 13.5 8 13.5Z" fill="currentColor"/><path d="M22 13.5S16.5 9.8 16.5 6A3 3 0 0 1 22 4.4 3 3 0 0 1 27.5 6C27.5 9.8 22 13.5 22 13.5Z" fill="currentColor"/><path d="M36 13.5S30.5 9.8 30.5 6A3 3 0 0 1 36 4.4 3 3 0 0 1 41.5 6C41.5 9.8 36 13.5 36 13.5Z" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".55"/></svg>'],
    ['stars', 'Stars', '<svg viewBox="0 0 44 16" width="38" height="14" aria-hidden="true"><path d="M8 2l1.8 3.6 4 .6-2.9 2.8.7 4L8 11.1 4.4 13l.7-4-2.9-2.8 4-.6z" fill="currentColor"/><path d="M22 2l1.8 3.6 4 .6-2.9 2.8.7 4-3.6-1.9-3.6 1.9.7-4-2.9-2.8 4-.6z" fill="currentColor"/><path d="M36 2l1.8 3.6 4 .6-2.9 2.8.7 4-3.6-1.9-3.6 1.9.7-4-2.9-2.8 4-.6z" fill="none" stroke="currentColor" stroke-width="1.4" opacity=".55"/></svg>'],
    ['diamonds', 'Diamonds', '<svg viewBox="0 0 44 16" width="38" height="14" aria-hidden="true"><path d="M8 2l5.5 6L8 14 2.5 8z" fill="currentColor"/><path d="M22 2l5.5 6-5.5 6-5.5-6z" fill="currentColor"/><path d="M36 2l5.5 6-5.5 6-5.5-6z" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".55"/></svg>'],
    ['squares', 'Squares', '<svg viewBox="0 0 44 16" width="38" height="14" aria-hidden="true"><rect x="3" y="3" width="10" height="10" rx="2.5" fill="currentColor"/><rect x="17" y="3" width="10" height="10" rx="2.5" fill="currentColor"/><rect x="31" y="3" width="10" height="10" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".55"/></svg>'],
    ['bars', 'Bars', '<svg viewBox="0 0 44 16" width="38" height="14" aria-hidden="true"><rect x="5" y="2" width="6" height="12" rx="1.8" fill="currentColor"/><rect x="15" y="2" width="6" height="12" rx="1.8" fill="currentColor"/><rect x="25" y="2" width="6" height="12" rx="1.8" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".55"/></svg>'],
    ['icon', 'Custom Icon', '<svg viewBox="0 0 44 16" width="38" height="14" aria-hidden="true"><path d="M5 12h10l1.5-6-3.5 2.5L10 4 7 8.5 3.5 6z" fill="currentColor"/><path d="M27 12h10l1.5-6-3.5 2.5L32 4l-3 4.5-3.5-2.5z" fill="none" stroke="currentColor" stroke-width="1.3" opacity=".55"/></svg>'],
    ['tally', 'Tally Marks', '<svg viewBox="0 0 44 16" width="38" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M5 2v12M10 2v12M15 2v12M20 2v12M2.5 12l20-8"/><path d="M30 2v12M35 2v12" opacity=".7"/></svg>'],
    ['tally-chalk', 'Tally (Chalk)', '<svg viewBox="0 0 44 16" width="38" height="14" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><path d="M5.5 2L4.5 14M10 2.4l.7 11.2M15.4 2l-.8 12M19.7 2.3l.8 11.4M2 12.4l21-8.8"/><path d="M30.5 2.2l-.6 11.5M35.2 2.4l.7 11.2" opacity=".7"/></svg>'],
    ['number', 'Number', '<svg viewBox="0 0 44 16" width="38" height="14" aria-hidden="true"><text x="22" y="12.5" text-anchor="middle" fill="currentColor" font-size="12" font-weight="700" font-family="system-ui,sans-serif">3/5</text></svg>']
];

const COLOR_FIELDS = [
    ['filledColor', 'Filled color', false],
    ['emptyColor', 'Empty fill', false],
    ['outlineColor', 'Empty outline', false],
    ['capReachedColor', 'Cap reached (optional)', true],
    ['overflowColor', 'Overflow color', false],
    ['labelColor', 'Label text', false],
    ['readoutColor', 'Readout text', false],
    ['rowBackground', 'Row background', false],
    ['rowBorderColor', 'Row border', false]
];

const NUMERIC_FIELDS = [
    ['markerSize', 'Marker size (px)', 10, 96, 1],
    ['strokeWidth', 'Stroke width', 0.5, 6, 0.5],
    ['markerGap', 'Marker gap (px)', 0, 32, 1],
    ['rowGap', 'Row gap (px)', 0, 48, 1],
    ['fontSize', 'Font size (px)', 10, 64, 1],
    ['rowPadding', 'Row padding (px)', 0, 48, 1],
    ['rowBorderWidth', 'Row border width', 0, 8, 0.5],
    ['rowRadius', 'Row radius (px)', 0, 48, 1]
];

export function createCounterDesigner(designRoot, appearanceRoot, { getDraft, getSets, getVariables, onChange, pickColor, pickFont }) {
    function ensureCounter() {
        const draft = getDraft();
        if (!draft) return null;
        draft.counter = { ...defaultCounter(), ...(draft.counter || {}) };
        if (!Array.isArray(draft.counter.variables)) draft.counter.variables = [];
        return draft.counter;
    }

    function numericVars() {
        return (getVariables() || []).filter(v => !v.setId && (v.type === 'counter' || v.type === 'number'));
    }

    function setFieldOptions(setObj) {
        if (!setObj) return { numeric: [], labels: [['$label', 'Entry label']] };
        const fields = setObj.fields || [];
        const numeric = [
            ...fields.filter(f => f.type === 'number' || f.type === 'counter').map(f => [f.key, `${f.label || f.key} (${f.type})`]),
            ...fields.filter(f => f.type !== 'number' && f.type !== 'counter' && f.type !== 'image' && f.type !== 'checklist' && f.type !== 'ref' && f.type !== 'ref_list')
                .map(f => [f.key, f.label || f.key])
        ];
        const labels = [['$label', 'Entry label'], ...fields.filter(f => f.type === 'text' || f.type === 'select').map(f => [f.key, f.label || f.key])];
        return { numeric, labels };
    }

    function renderDesign() {
        const draft = getDraft();
        const cfg = ensureCounter();
        if (!draft || !cfg || !designRoot) return;

        const sets = getSets() || [];
        const vars = numericVars();
        const boundNames = new Set(cfg.variables.map(v => v.name));
        const availableVars = vars.filter(v => !boundNames.has(v.name));
        const selectedSet = sets.find(s => s.id === draft.catalogId);
        const { numeric: setNumericFields, labels: setLabelFields } = setFieldOptions(selectedSet);

        const sourceSection = cfg.sourceMode === 'set'
            ? `
                <div class="control-grid">
                    <div class="control-field">
                        <label for="counter-set-select">Variable Set</label>
                        <select id="counter-set-select" class="select input" data-counter-set="catalogId">
                            <option value="">Choose a Variable Set</option>
                            ${sets.map(s => `<option value="${esc(s.id)}"${draft.catalogId === s.id ? ' selected' : ''}>${esc(s.name || s.id)} · ${(s.roster || []).length} entries</option>`).join('')}
                        </select>
                    </div>
                    <div class="control-field">
                        <label for="counter-value-field">Numeric field</label>
                        <select id="counter-value-field" class="select input" data-counter-field="valueField"${!selectedSet ? ' disabled' : ''}>
                            <option value="">Auto (first numeric field)</option>
                            ${setNumericFields.map(([key, label]) => `<option value="${esc(key)}"${cfg.valueField === key ? ' selected' : ''}>${esc(label)}</option>`).join('')}
                        </select>
                    </div>
                    <div class="control-field">
                        <label for="counter-label-field">Row label field</label>
                        <select id="counter-label-field" class="select input" data-counter-field="labelField"${!selectedSet ? ' disabled' : ''}>
                            ${setLabelFields.map(([key, label]) => `<option value="${esc(key)}"${cfg.labelField === key ? ' selected' : ''}>${esc(label)}</option>`).join('')}
                        </select>
                    </div>
                    <div class="control-field">
                        <label for="counter-row-scope">Default rows</label>
                        <select id="counter-row-scope" class="select input" data-counter-field="rowScope">
                            <option value="all"${cfg.rowScope === 'all' ? ' selected' : ''}>All enabled entries</option>
                            <option value="active"${cfg.rowScope === 'active' ? ' selected' : ''}>Active entry only</option>
                            <option value="slots"${cfg.rowScope === 'slots' ? ' selected' : ''}>Live slots</option>
                            <option value="group"${cfg.rowScope === 'group' ? ' selected' : ''}>In Group entries</option>
                            <option value="group-slots"${cfg.rowScope === 'group-slots' ? ' selected' : ''}>In Group live slots</option>
                        </select>
                    </div>
                    <div class="control-field">
                        <label for="counter-max-rows">Max rows</label>
                        <input id="counter-max-rows" class="input" type="number" min="1" max="50" step="1" value="${esc(cfg.maxRows)}" data-counter-field="maxRows">
                    </div>
                </div>
                ${!sets.length ? '<p class="catalog-help">No Variable Sets found. <a href="/placeholders.html#sets">Create a Variable Set</a> first.</p>' : ''}
            `
            : `
                <div class="counter-var-picker">
                    <select id="counter-var-select" class="select input" aria-label="Choose a counter or number variable">
                        <option value="">${availableVars.length ? 'Choose a counter or number variable…' : (vars.length ? 'All numeric variables added' : 'No counter or number variables yet')}</option>
                        ${availableVars.map(v => {
                            const capText = v.max !== '' && v.max != null ? ` / ${v.max}` : '';
                            return `<option value="${esc(v.name)}">${esc(v.name)} (${esc(v.value ?? 0)}${esc(capText)} · ${esc(v.type)})</option>`;
                        }).join('')}
                    </select>
                    <button type="button" class="btn btn-sm btn-primary" data-counter-act="add-var"${!availableVars.length ? ' disabled' : ''}>Add counter</button>
                </div>
                ${!vars.length ? '<p class="catalog-help">No counter or number variables found yet. <a href="/placeholders.html">Create a Counter variable</a> in Placeholders &amp; Variables.</p>' : ''}
                <div class="counter-var-list">
                    ${cfg.variables.length ? cfg.variables.map((item, idx) => {
                        const live = vars.find(v => v.name === item.name);
                        const liveText = live ? `Live: ${live.value ?? 0}${live.max !== '' && live.max != null ? ` / ${live.max}` : ''}` : 'Variable not found';
                        return `<div class="counter-var-row" data-var-idx="${idx}">
                            <div class="counter-var-info">
                                <strong>${esc(item.name)}</strong>
                                <small>${esc(liveText)}</small>
                            </div>
                            <input type="text" class="input input-sm" maxlength="60" placeholder="Display label (optional)" value="${esc(item.label || '')}" data-counter-var-prop="label" data-var-idx="${idx}" aria-label="Label for ${esc(item.name)}">
                            <input type="number" class="input input-sm counter-var-cap" min="1" max="100" step="1" placeholder="Cap (auto)" value="${item.cap != null ? esc(item.cap) : ''}" data-counter-var-prop="cap" data-var-idx="${idx}" aria-label="Cap override for ${esc(item.name)}">
                            <div class="counter-var-actions">
                                <button type="button" class="btn btn-sm" data-counter-act="move-var" data-var-idx="${idx}" data-delta="-1"${idx === 0 ? ' disabled' : ''} aria-label="Move up">Up</button>
                                <button type="button" class="btn btn-sm" data-counter-act="move-var" data-var-idx="${idx}" data-delta="1"${idx === cfg.variables.length - 1 ? ' disabled' : ''} aria-label="Move down">Down</button>
                                <button type="button" class="btn btn-sm btn-danger" data-counter-act="remove-var" data-var-idx="${idx}" aria-label="Remove ${esc(item.name)}">Remove</button>
                            </div>
                        </div>`;
                    }).join('') : '<div class="section-placeholder">Add one or more Counter / Number variables above to track pips, hearts, or tally marks.</div>'}
                </div>
            `;

        designRoot.innerHTML = `
            <div class="builder-card-heading">
                <div>
                    <h3>1. Data source</h3>
                    <p class="display-muted">Bind one or more Counter/Number variables, or track a numeric field across a Variable Set.</p>
                </div>
                <div class="tabs-nav" role="group" aria-label="Counter data source">
                    <button type="button" class="tab-btn${cfg.sourceMode === 'variables' ? ' active' : ''}" data-counter-source="variables" aria-pressed="${cfg.sourceMode === 'variables'}">Variables</button>
                    <button type="button" class="tab-btn${cfg.sourceMode === 'set' ? ' active' : ''}" data-counter-source="set" aria-pressed="${cfg.sourceMode === 'set'}">Variable Set</button>
                </div>
            </div>
            ${sourceSection}

            <div class="builder-card-heading" style="margin-top:20px;">
                <div>
                    <h3>2. Marker style</h3>
                    <p class="display-muted">Choose pips, filled &amp; outlined hearts, stars, bars, or 5-count slashed tally marks.</p>
                </div>
            </div>
            <div class="counter-style-grid" role="radiogroup" aria-label="Marker style">
                ${STYLE_OPTIONS.map(([id, label, svg]) => `
                    <button type="button" class="counter-style-chip${cfg.style === id ? ' active' : ''}" data-counter-style="${esc(id)}" aria-pressed="${cfg.style === id}">
                        <span class="counter-style-icon">${svg}</span>
                        <span>${esc(label)}</span>
                    </button>
                `).join('')}
            </div>
            ${cfg.style === 'icon' ? `
                <div class="control-field" style="margin-top:10px;max-width:340px;">
                    <label for="counter-icon-class">Custom icon class</label>
                    <span class="display-color-pair">
                        <input id="counter-icon-class" class="input" type="text" maxlength="80" value="${esc(cfg.iconClass || 'fa-solid fa-crown')}" placeholder="fa-solid fa-crown" data-counter-field="iconClass">
                        <button type="button" class="btn btn-sm" data-counter-pick-icon="1">Pick Icon</button>
                    </span>
                </div>` : ''}

            <div class="builder-card-heading" style="margin-top:20px;">
                <div>
                    <h3>3. Cap, wrapping &amp; readout</h3>
                    <p class="display-muted">Uncapped counters grow dynamically; capped counters show empty slots up to the cap.</p>
                </div>
            </div>
            <div class="control-grid">
                <div class="control-field">
                    <label for="counter-cap-mode">Cap behavior</label>
                    <select id="counter-cap-mode" class="select input" data-counter-field="capMode">
                        <option value="auto"${cfg.capMode === 'auto' ? ' selected' : ''}>Auto (variable max / grow)</option>
                        <option value="custom"${cfg.capMode === 'custom' ? ' selected' : ''}>Fixed custom cap</option>
                        <option value="none"${cfg.capMode === 'none' ? ' selected' : ''}>Uncapped (always grow)</option>
                    </select>
                </div>
                ${cfg.capMode === 'custom' ? `
                <div class="control-field">
                    <label for="counter-custom-cap">Cap value</label>
                    <input id="counter-custom-cap" class="input" type="number" min="1" max="100" step="1" value="${esc(cfg.customCap)}" data-counter-field="customCap">
                </div>` : ''}
                ${cfg.capMode !== 'none' ? `
                <div class="control-field">
                    <label for="counter-overflow-mode">If count exceeds cap</label>
                    <select id="counter-overflow-mode" class="select input" data-counter-field="overflowMode">
                        <option value="plus"${cfg.overflowMode === 'plus' ? ' selected' : ''}>Show +N overflow badge</option>
                        <option value="overflow"${cfg.overflowMode === 'overflow' ? ' selected' : ''}>Show extra overflow markers</option>
                        <option value="clamp"${cfg.overflowMode === 'clamp' ? ' selected' : ''}>Clamp at cap</option>
                    </select>
                </div>` : ''}
                <div class="control-field">
                    <label for="counter-per-row">Markers per row (0 = auto)</label>
                    <input id="counter-per-row" class="input" type="number" min="0" max="50" step="1" value="${esc(cfg.perRow)}" data-counter-field="perRow">
                </div>
                <div class="control-field">
                    <label for="counter-readout">Numeric readout</label>
                    <select id="counter-readout" class="select input" data-counter-field="readout">
                        <option value="fraction"${cfg.readout === 'fraction' ? ' selected' : ''}>Fraction (3 / 5)</option>
                        <option value="value"${cfg.readout === 'value' ? ' selected' : ''}>Value only (3)</option>
                        <option value="of"${cfg.readout === 'of' ? ' selected' : ''}>Text (3 of 5)</option>
                        <option value="none"${cfg.readout === 'none' ? ' selected' : ''}>Hidden</option>
                    </select>
                </div>
                ${cfg.readout !== 'none' && cfg.style !== 'number' ? `
                <div class="control-field">
                    <label for="counter-readout-pos">Readout placement</label>
                    <select id="counter-readout-pos" class="select input" data-counter-field="readoutPosition">
                        <option value="right"${cfg.readoutPosition === 'right' ? ' selected' : ''}>Right of markers</option>
                        <option value="left"${cfg.readoutPosition === 'left' ? ' selected' : ''}>Left of markers</option>
                        <option value="top"${cfg.readoutPosition === 'top' ? ' selected' : ''}>Above markers</option>
                        <option value="bottom"${cfg.readoutPosition === 'bottom' ? ' selected' : ''}>Below markers</option>
                    </select>
                </div>` : ''}
                <div class="control-field">
                    <label for="counter-label-pos">Label placement</label>
                    <select id="counter-label-pos" class="select input" data-counter-field="labelPosition">
                        <option value="left"${cfg.labelPosition === 'left' ? ' selected' : ''}>Left</option>
                        <option value="top"${cfg.labelPosition === 'top' ? ' selected' : ''}>Above</option>
                        <option value="bottom"${cfg.labelPosition === 'bottom' ? ' selected' : ''}>Below</option>
                        <option value="none"${cfg.labelPosition === 'none' ? ' selected' : ''}>Hidden</option>
                    </select>
                </div>
                <div class="control-field">
                    <label for="counter-direction">Multi-row layout</label>
                    <select id="counter-direction" class="select input" data-counter-field="direction">
                        <option value="vertical"${cfg.direction === 'vertical' ? ' selected' : ''}>Vertical stack</option>
                        <option value="horizontal"${cfg.direction === 'horizontal' ? ' selected' : ''}>Horizontal strip</option>
                    </select>
                </div>
                <div class="control-field">
                    <label for="counter-align">Alignment</label>
                    <select id="counter-align" class="select input" data-counter-field="align">
                        <option value="left"${cfg.align === 'left' ? ' selected' : ''}>Left</option>
                        <option value="center"${cfg.align === 'center' ? ' selected' : ''}>Center</option>
                        <option value="right"${cfg.align === 'right' ? ' selected' : ''}>Right</option>
                    </select>
                </div>
            </div>
        `;
    }

    function renderAppearance() {
        const cfg = ensureCounter();
        if (!cfg || !appearanceRoot) return;
        appearanceRoot.innerHTML = `
            <div class="builder-card-heading">
                <div>
                    <h3>Broadcast theme</h3>
                    <p class="display-muted">Choose a broadcast theme matching Versus &amp; Trivia overlays, then fine-tune any color or dimension below.</p>
                </div>
            </div>
            <div class="counter-theme-grid" role="radiogroup" aria-label="Broadcast theme" style="margin-bottom:20px;">
                ${THEME_SWATCHES.map(([id, label, bg, accent, border]) => `
                    <button type="button" class="counter-theme-swatch${(cfg.theme || 'modern') === id ? ' active' : ''}" data-counter-theme="${esc(id)}" aria-pressed="${(cfg.theme || 'modern') === id}">
                        <span class="counter-theme-bar" style="background:${esc(bg)};border-color:${esc(border)};">
                            <i style="background:${esc(accent)};"></i>
                            <i style="background:${esc(accent)};"></i>
                            <i class="is-empty" style="border-color:${esc(accent)};"></i>
                        </span>
                        <span>${esc(label)}</span>
                    </button>
                `).join('')}
            </div>
            <div class="builder-card-heading">
                <div>
                    <h3>Colors, sizing &amp; animation</h3>
                    <p class="display-muted">Colors support 8-digit #RRGGBBAA hex, variable tokens (<code>{{var.accent}}</code>), or per-player Variable Set colors (<code>@color</code>) via the <code>{}</code> picker.</p>
                </div>
            </div>
            <div class="control-grid appearance-grid" style="padding:0;">
                ${COLOR_FIELDS.map(([key, label, optional]) => {
                    const val = cfg[key] || '';
                    const isVar = val.includes('{{') || val.startsWith('@');
                    const pickerVal = /^#[a-f\d]{6}/i.test(val) ? val.slice(0, 7) : '#f43f5e';
                    return `<div class="control-field">
                        <label for="counter-color-${key}">${esc(label)}</label>
                        <span class="display-color-pair">
                            <input type="color" data-counter-color="${key}" value="${esc(pickerVal)}"${isVar ? ' disabled style="opacity:.35;"' : ''} aria-label="${esc(label)} picker">
                            <input id="counter-color-${key}" class="input" type="text" maxlength="90" placeholder="${optional ? 'Default' : '#RRGGBBAA, @color, or {{var}}'}" value="${esc(val)}" data-counter-field="${key}">
                            ${isVar ? `<button type="button" class="btn btn-sm counter-var-btn" data-counter-unbind-color="${key}" title="Clear variable binding" aria-label="Unbind ${esc(label)}">&times;</button>` : ''}
                            <button type="button" class="btn btn-sm counter-var-btn${isVar ? ' active' : ''}" data-counter-pick-color="${key}" title="Bind color variable or Variable Set member color" aria-label="Bind variable for ${esc(label)}">{}</button>
                        </span>
                    </div>`;
                }).join('')}
                ${NUMERIC_FIELDS.map(([key, label, min, max, step]) => `
                    <div class="control-field">
                        <label for="counter-num-${key}">${esc(label)}</label>
                        <input id="counter-num-${key}" class="input" type="number" min="${min}" max="${max}" step="${step}" value="${esc(cfg[key])}" data-counter-field="${key}">
                    </div>
                `).join('')}
                <div class="control-field">
                    <label for="counter-font">Font family</label>
                    <span class="display-color-pair">
                        <input id="counter-font" class="input" type="text" maxlength="120" value="${esc(cfg.fontFamily)}" data-counter-field="fontFamily">
                        <button type="button" class="btn btn-sm counter-var-btn${(cfg.fontFamily || '').includes('{{') ? ' active' : ''}" data-counter-pick-font="1" title="Bind font variable" aria-label="Bind font variable">{}</button>
                    </span>
                </div>
                <div class="control-field">
                    <label for="counter-animate">Increment animation</label>
                    <select id="counter-animate" class="select input" data-counter-field="animate">
                        <option value="pop"${cfg.animate === 'pop' ? ' selected' : ''}>Pop / slash-in</option>
                        <option value="none"${cfg.animate === 'none' ? ' selected' : ''}>None</option>
                    </select>
                </div>
            </div>
        `;
    }

    function render() {
        renderDesign();
        renderAppearance();
    }

    function bindRoot(root) {
        if (!root) return;
        root.addEventListener('click', event => {
            const cfg = ensureCounter();
            if (!cfg) return;
            const sourceBtn = event.target.closest('[data-counter-source]');
            if (sourceBtn) {
                cfg.sourceMode = sourceBtn.dataset.counterSource === 'set' ? 'set' : 'variables';
                renderDesign();
                onChange();
                return;
            }
            const unbindBtn = event.target.closest('[data-counter-unbind-color]');
            if (unbindBtn) {
                const key = unbindBtn.dataset.counterUnbindColor;
                const def = defaultCounter();
                cfg[key] = def[key] ?? '';
                renderAppearance();
                onChange();
                return;
            }
            const pickIconBtn = event.target.closest('[data-counter-pick-icon]');
            if (pickIconBtn) {
                window.IconPicker?.open({
                    value: cfg.iconClass || 'fa-solid fa-crown',
                    onPick: cls => {
                        cfg.iconClass = cls || 'fa-solid fa-crown';
                        renderDesign();
                        onChange();
                    }
                });
                return;
            }
            const pickColorBtn = event.target.closest('[data-counter-pick-color]');
            if (pickColorBtn && typeof pickColor === 'function') {
                const key = pickColorBtn.dataset.counterPickColor;
                pickColor({
                    allowMember: cfg.sourceMode === 'set',
                    onSelect: token => {
                        cfg[key] = token;
                        renderAppearance();
                        onChange();
                    }
                });
                return;
            }
            const pickFontBtn = event.target.closest('[data-counter-pick-font]');
            if (pickFontBtn && typeof pickFont === 'function') {
                pickFont({
                    onSelect: token => {
                        cfg.fontFamily = token;
                        renderAppearance();
                        onChange();
                    }
                });
                return;
            }
            const themeBtn = event.target.closest('[data-counter-theme]');
            if (themeBtn) {
                const themeId = themeBtn.dataset.counterTheme;
                const presets = window.OverlayShared?.COUNTER_THEME_PRESETS || {};
                const preset = presets[themeId];
                cfg.theme = themeId;
                if (preset) {
                    const { label: _unused, ...visual } = preset;
                    Object.assign(cfg, visual);
                }
                render();
                onChange();
                return;
            }
            const styleBtn = event.target.closest('[data-counter-style]');
            if (styleBtn) {
                cfg.style = styleBtn.dataset.counterStyle;
                renderDesign();
                onChange();
                return;
            }
            const actBtn = event.target.closest('[data-counter-act]');
            if (!actBtn) return;
            const act = actBtn.dataset.counterAct;
            if (act === 'add-var') {
                const select = designRoot.querySelector('#counter-var-select');
                const name = select?.value;
                if (!name || cfg.variables.some(v => v.name === name)) return;
                cfg.variables.push({ name, label: '', cap: null });
                renderDesign();
                onChange();
                return;
            }
            const idx = Number(actBtn.dataset.varIdx);
            if (!Number.isInteger(idx) || idx < 0 || idx >= cfg.variables.length) return;
            if (act === 'remove-var') {
                cfg.variables.splice(idx, 1);
                renderDesign();
                onChange();
            } else if (act === 'move-var') {
                const delta = Number(actBtn.dataset.delta) || 0;
                const target = idx + delta;
                if (target < 0 || target >= cfg.variables.length) return;
                const [moved] = cfg.variables.splice(idx, 1);
                cfg.variables.splice(target, 0, moved);
                renderDesign();
                onChange();
            }
        });

        root.addEventListener('input', event => {
            const cfg = ensureCounter();
            if (!cfg) return;
            const target = event.target;
            if (target.dataset.counterColor) {
                const key = target.dataset.counterColor;
                cfg[key] = target.value;
                const textInput = target.closest('.display-color-pair')?.querySelector('input[type="text"]');
                if (textInput) textInput.value = target.value;
                onChange();
                return;
            }
            if (target.dataset.counterVarProp) {
                const idx = Number(target.dataset.varIdx);
                const prop = target.dataset.counterVarProp;
                if (!cfg.variables[idx]) return;
                if (prop === 'cap') {
                    cfg.variables[idx].cap = target.value === '' ? null : Math.max(1, Math.min(100, Math.round(Number(target.value) || 1)));
                } else {
                    cfg.variables[idx][prop] = target.value;
                }
                onChange();
                return;
            }
            if (target.dataset.counterField) {
                const key = target.dataset.counterField;
                if (target.type === 'number') {
                    if (target.value === '') return;
                    cfg[key] = Number(target.value);
                } else {
                    cfg[key] = target.value;
                    if (target.closest('.display-color-pair') && /^#[a-f\d]{6}/i.test(target.value)) {
                        const picker = target.closest('.display-color-pair').querySelector('input[type="color"]');
                        if (picker) picker.value = target.value.slice(0, 7);
                    }
                }
                if (key === 'labelPosition') cfg.showLabel = target.value !== 'none';
                onChange();
            }
        });

        root.addEventListener('change', event => {
            const draft = getDraft();
            const cfg = ensureCounter();
            if (!draft || !cfg) return;
            const target = event.target;
            if (target.dataset.counterSet === 'catalogId') {
                draft.catalogId = target.value;
                cfg.valueField = '';
                cfg.labelField = '$label';
                renderDesign();
                onChange();
                return;
            }
            if (target.dataset.counterField && ['capMode', 'readout', 'style', 'sourceMode'].includes(target.dataset.counterField)) {
                cfg[target.dataset.counterField] = target.value;
                renderDesign();
                onChange();
            }
        });
    }

    bindRoot(designRoot);
    bindRoot(appearanceRoot);

    return { render };
}

'use strict';

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

export function defaultTicker() {
    return window.OverlayShared?.defaultDisplayTicker
        ? window.OverlayShared.defaultDisplayTicker()
        : {
            sourceMode: 'list', listVariable: '', labelField: '$label', subField: '', imageField: '', rowScope: 'all',
            theme: 'esports', badgeText: 'LIVE', separator: 'diamond', direction: 'left', speed: 75, itemGap: 40, showImages: true,
            background: '#090d16eb', textColor: '#f8fafc', accentColor: '#38bdf8', badgeBackground: '#38bdf8', badgeTextColor: '#090d16',
            borderColor: '#38bdf844', borderWidth: 1, radius: 4, height: 48, fontSize: 16, fontFamily: 'sans-serif', maxItems: 40
        };
}

const THEME_SWATCHES = [
    ['esports', 'Esports Broadcast', '#090d16', '#38bdf8', '#38bdf866'],
    ['sports', 'Broadcast Sports', '#0d1a33', '#f59e0b', '#f59e0b66'],
    ['modern', 'Modern Glass', '#0f172a', '#818cf8', '#ffffff33'],
    ['arcade', 'Retro Arcade', '#120824', '#e879f9', '#22d3ee99'],
    ['minimal', 'Minimal HUD', 'transparent', '#ffffff', '#ffffff66']
];

const COLOR_FIELDS = [
    ['background', 'Bar background'],
    ['textColor', 'Text color'],
    ['accentColor', 'Separator accent'],
    ['badgeBackground', 'Badge fill'],
    ['badgeTextColor', 'Badge text'],
    ['borderColor', 'Border color']
];

export function createTickerDesigner(designRoot, appearanceRoot, { getDraft, getSets, getVariables, onChange, pickColor, pickFont }) {
    function ensureTicker() {
        const draft = getDraft();
        if (!draft) return null;
        draft.ticker = { ...defaultTicker(), ...(draft.ticker || {}) };
        return draft.ticker;
    }

    const listVars = () => (getVariables() || []).filter(v => !v.setId && v.type === 'list');

    function renderDesign() {
        const draft = getDraft();
        const cfg = ensureTicker();
        if (!draft || !cfg || !designRoot) return;
        const sets = getSets() || [];
        const lists = listVars();
        const selectedSet = sets.find(s => s.id === draft.catalogId);
        const setFields = selectedSet?.fields || [];

        const sourceHtml = cfg.sourceMode === 'set'
            ? `<div class="control-grid">
                <div class="control-field"><label for="ticker-set-select">Variable Set</label>
                    <select id="ticker-set-select" class="select input" data-ticker-set="catalogId">
                        <option value="">Choose a Variable Set</option>
                        ${sets.map(s => `<option value="${esc(s.id)}"${draft.catalogId === s.id ? ' selected' : ''}>${esc(s.name || s.id)} · ${(s.roster || []).length} entries</option>`).join('')}
                    </select>
                </div>
                <div class="control-field"><label for="ticker-label-field">Main text field</label>
                    <select id="ticker-label-field" class="select input" data-ticker-field="labelField"${!selectedSet ? ' disabled' : ''}>
                        <option value="$label"${cfg.labelField === '$label' ? ' selected' : ''}>Entry label</option>
                        ${setFields.filter(f => ['text', 'select', 'tags', 'template'].includes(f.type)).map(f => `<option value="${esc(f.key)}"${cfg.labelField === f.key ? ' selected' : ''}>${esc(f.label || f.key)}</option>`).join('')}
                    </select>
                </div>
                <div class="control-field"><label for="ticker-sub-field">Subtitle field (optional)</label>
                    <select id="ticker-sub-field" class="select input" data-ticker-field="subField"${!selectedSet ? ' disabled' : ''}>
                        <option value="">None</option>
                        ${setFields.filter(f => !['image', 'checklist', 'ref', 'ref_list'].includes(f.type)).map(f => `<option value="${esc(f.key)}"${cfg.subField === f.key ? ' selected' : ''}>${esc(f.label || f.key)}</option>`).join('')}
                    </select>
                </div>
                <div class="control-field"><label for="ticker-row-scope">Default rows</label>
                    <select id="ticker-row-scope" class="select input" data-ticker-field="rowScope">
                        <option value="all"${cfg.rowScope === 'all' ? ' selected' : ''}>All enabled entries</option>
                        <option value="group"${cfg.rowScope === 'group' ? ' selected' : ''}>In Group entries</option>
                        <option value="slots"${cfg.rowScope === 'slots' ? ' selected' : ''}>Live slots</option>
                    </select>
                </div>
                <div class="control-field toggle-field" style="align-self:end;"><input id="ticker-show-img" type="checkbox" data-ticker-check="showImages"${cfg.showImages ? ' checked' : ''}><label for="ticker-show-img">Show thumbnails</label></div>
            </div>`
            : `<div class="control-grid">
                <div class="control-field" style="grid-column:1 / -1;"><label for="ticker-list-var">List variable</label>
                    <select id="ticker-list-var" class="select input" data-ticker-field="listVariable">
                        <option value="">${lists.length ? 'Choose a List variable…' : 'No List variables yet'}</option>
                        ${lists.map(v => `<option value="${esc(v.name)}"${cfg.listVariable === v.name ? ' selected' : ''}>${esc(v.name)} (${(v.items || []).length} items)</option>`).join('')}
                    </select>
                </div>
            </div>
            ${!lists.length ? '<p class="catalog-help">No List variables found. <a href="/placeholders.html">Create a List variable</a> or switch to Variable Set mode.</p>' : ''}`;

        designRoot.innerHTML = `
            <div class="builder-card-heading">
                <div><h3>1. Ticker feed source</h3><p class="display-muted">Stream headlines from a List variable or a Variable Set (Sponsors, Schedule, Shoutouts).</p></div>
                <div class="tabs-nav" role="group" aria-label="Ticker source">
                    <button type="button" class="tab-btn${cfg.sourceMode === 'list' ? ' active' : ''}" data-ticker-source="list">List Variable</button>
                    <button type="button" class="tab-btn${cfg.sourceMode === 'set' ? ' active' : ''}" data-ticker-source="set">Variable Set</button>
                </div>
            </div>
            ${sourceHtml}
            <div class="builder-card-heading" style="margin-top:20px;">
                <div><h3>2. Motion &amp; layout</h3><p class="display-muted">GPU-composited infinite scroll; pauses automatically when hidden in OBS.</p></div>
            </div>
            <div class="control-grid">
                <div class="control-field"><label for="ticker-badge">Leading badge (optional)</label><input id="ticker-badge" class="input" type="text" maxlength="32" value="${esc(cfg.badgeText)}" placeholder="LIVE / UP NEXT" data-ticker-field="badgeText"></div>
                <div class="control-field"><label for="ticker-sep">Separator</label>
                    <select id="ticker-sep" class="select input" data-ticker-field="separator">
                        <option value="diamond"${cfg.separator === 'diamond' ? ' selected' : ''}>Diamond</option>
                        <option value="dot"${cfg.separator === 'dot' ? ' selected' : ''}>Dot</option>
                        <option value="slash"${cfg.separator === 'slash' ? ' selected' : ''}>Slash</option>
                        <option value="bar"${cfg.separator === 'bar' ? ' selected' : ''}>Vertical bar</option>
                        <option value="none"${cfg.separator === 'none' ? ' selected' : ''}>None</option>
                    </select>
                </div>
                <div class="control-field"><label for="ticker-dir">Direction</label>
                    <select id="ticker-dir" class="select input" data-ticker-field="direction">
                        <option value="left"${cfg.direction === 'left' ? ' selected' : ''}>Scroll left</option>
                        <option value="right"${cfg.direction === 'right' ? ' selected' : ''}>Scroll right</option>
                    </select>
                </div>
                <div class="control-field"><label for="ticker-speed">Speed (px/sec)</label><input id="ticker-speed" class="input" type="number" min="15" max="240" value="${esc(cfg.speed)}" data-ticker-field="speed"></div>
                <div class="control-field"><label for="ticker-gap">Item gap (px)</label><input id="ticker-gap" class="input" type="number" min="12" max="160" value="${esc(cfg.itemGap)}" data-ticker-field="itemGap"></div>
            </div>
        `;
    }

    function renderAppearance() {
        const cfg = ensureTicker();
        if (!cfg || !appearanceRoot) return;
        appearanceRoot.innerHTML = `
            <div class="builder-card-heading"><div><h3>Broadcast theme</h3><p class="display-muted">Apply a broadcast ribbon preset, then customize colors or bind variables.</p></div></div>
            <div class="counter-theme-grid" role="radiogroup" aria-label="Broadcast theme" style="margin-bottom:20px;">
                ${THEME_SWATCHES.map(([id, label, bg, accent, border]) => `<button type="button" class="counter-theme-swatch${(cfg.theme || 'esports') === id ? ' active' : ''}" data-ticker-theme="${esc(id)}" aria-pressed="${(cfg.theme || 'esports') === id}"><span class="counter-theme-bar" style="background:${esc(bg)};border-color:${esc(border)};justify-content:flex-start;padding:0 5px;"><i style="width:22%;height:12px;border-radius:2px;background:${esc(accent)};"></i><i style="width:55%;height:5px;border-radius:3px;background:#ffffff66;"></i></span><span>${esc(label)}</span></button>`).join('')}
            </div>
            <div class="builder-card-heading"><div><h3>Colors, typography &amp; dimensions</h3><p class="display-muted">Colors support #RRGGBBAA hex and variable bindings via <code>{}</code>.</p></div></div>
            <div class="control-grid appearance-grid" style="padding:0;">
                ${COLOR_FIELDS.map(([key, label]) => {
                    const val = cfg[key] || '';
                    const isVar = val.includes('{{') || val.startsWith('@');
                    const pickerVal = /^#[a-f\d]{6}/i.test(val) ? val.slice(0, 7) : '#38bdf8';
                    return `<div class="control-field"><label for="ticker-color-${key}">${esc(label)}</label>
                        <span class="display-color-pair">
                            <input type="color" data-ticker-color="${key}" value="${esc(pickerVal)}"${isVar ? ' disabled style="opacity:.35;"' : ''}>
                            <input id="ticker-color-${key}" class="input" type="text" maxlength="90" value="${esc(val)}" data-ticker-field="${key}">
                            ${isVar ? `<button type="button" class="btn btn-sm counter-var-btn" data-ticker-unbind-color="${key}" title="Clear binding">&times;</button>` : ''}
                            <button type="button" class="btn btn-sm counter-var-btn${isVar ? ' active' : ''}" data-ticker-pick-color="${key}" title="Bind color variable">{}</button>
                        </span>
                    </div>`;
                }).join('')}
                <div class="control-field"><label for="ticker-height">Bar height (px)</label><input id="ticker-height" class="input" type="number" min="28" max="120" value="${esc(cfg.height)}" data-ticker-field="height"></div>
                <div class="control-field"><label for="ticker-fs">Font size (px)</label><input id="ticker-fs" class="input" type="number" min="10" max="48" value="${esc(cfg.fontSize)}" data-ticker-field="fontSize"></div>
                <div class="control-field"><label for="ticker-rad">Corner radius (px)</label><input id="ticker-rad" class="input" type="number" min="0" max="48" value="${esc(cfg.radius)}" data-ticker-field="radius"></div>
                <div class="control-field"><label for="ticker-font">Font family</label>
                    <span class="display-color-pair">
                        <input id="ticker-font" class="input" type="text" maxlength="120" value="${esc(cfg.fontFamily)}" data-ticker-field="fontFamily">
                        <button type="button" class="btn btn-sm counter-var-btn${(cfg.fontFamily || '').includes('{{') ? ' active' : ''}" data-ticker-pick-font="1" title="Bind font variable">{}</button>
                    </span>
                </div>
            </div>
        `;
    }

    function render() { renderDesign(); renderAppearance(); }

    function bind(root) {
        if (!root) return;
        root.addEventListener('click', event => {
            const cfg = ensureTicker();
            if (!cfg) return;
            const src = event.target.closest('[data-ticker-source]');
            if (src) { cfg.sourceMode = src.dataset.tickerSource === 'set' ? 'set' : 'list'; renderDesign(); onChange(); return; }
            const thm = event.target.closest('[data-ticker-theme]');
            if (thm) {
                const id = thm.dataset.tickerTheme;
                const p = window.OverlayShared?.TICKER_THEME_PRESETS?.[id];
                cfg.theme = id;
                if (p) { const { label: _u, ...visual } = p; Object.assign(cfg, visual); }
                renderAppearance(); onChange(); return;
            }
            const unbind = event.target.closest('[data-ticker-unbind-color]');
            if (unbind) { cfg[unbind.dataset.tickerUnbindColor] = defaultTicker()[unbind.dataset.tickerUnbindColor] || ''; renderAppearance(); onChange(); return; }
            const pickC = event.target.closest('[data-ticker-pick-color]');
            if (pickC && typeof pickColor === 'function') {
                pickColor({ allowMember: cfg.sourceMode === 'set', onSelect: token => { cfg[pickC.dataset.tickerPickColor] = token; renderAppearance(); onChange(); } });
                return;
            }
            if (event.target.closest('[data-ticker-pick-font]') && typeof pickFont === 'function') {
                pickFont({ onSelect: token => { cfg.fontFamily = token; renderAppearance(); onChange(); } });
            }
        });
        root.addEventListener('input', event => {
            const cfg = ensureTicker();
            if (!cfg) return;
            const t = event.target;
            if (t.dataset.tickerColor) {
                cfg[t.dataset.tickerColor] = t.value;
                const txt = t.closest('.display-color-pair')?.querySelector('input[type="text"]');
                if (txt) txt.value = t.value;
                onChange(); return;
            }
            if (t.dataset.tickerField) {
                if (t.type === 'number') { if (t.value === '') return; cfg[t.dataset.tickerField] = Number(t.value); }
                else cfg[t.dataset.tickerField] = t.value;
                onChange();
            }
        });
        root.addEventListener('change', event => {
            const draft = getDraft();
            const cfg = ensureTicker();
            if (!draft || !cfg) return;
            const t = event.target;
            if (t.dataset.tickerSet === 'catalogId') { draft.catalogId = t.value; cfg.labelField = '$label'; cfg.subField = ''; renderDesign(); onChange(); return; }
            if (t.dataset.tickerCheck) { cfg[t.dataset.tickerCheck] = t.checked; onChange(); }
        });
    }

    bind(designRoot);
    bind(appearanceRoot);
    return { render };
}

'use strict';

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

export function defaultBingo() {
    return window.OverlayShared?.defaultDisplayBingo
        ? window.OverlayShared.defaultDisplayBingo()
        : {
            sourceMode: 'custom', items: [], listVariable: '', labelField: '$label', imageField: '',
            size: 5, freeSpace: true, freeSpaceLabel: 'FREE', showHeader: true, headerText: 'BINGO',
            showBingoBanner: true, bingoBannerText: 'BINGO!', stampStyle: 'dauber', theme: 'modern', showImages: true,
            boardBackground: '#0f172ad9', cellBackground: '#1e293bcc', stampedBackground: '#f43f5e33',
            stampColor: '#f43f5e', bingoColor: '#22c55e', textColor: '#f8fafc', borderColor: '#ffffff26',
            headerBackground: '#f43f5e', headerTextColor: '#ffffff', borderWidth: 1, radius: 10, cellGap: 6, padding: 12, fontSize: 13, fontFamily: 'sans-serif'
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

const STAMP_OPTIONS = [
    ['dauber', 'Dauber Ink'],
    ['check', 'Checkmark'],
    ['x', 'Cross (X)'],
    ['star', 'Star Stamp'],
    ['fill', 'Solid Fill']
];

const COLOR_FIELDS = [
    ['boardBackground', 'Board background'],
    ['cellBackground', 'Cell background'],
    ['stampedBackground', 'Stamped cell fill'],
    ['stampColor', 'Stamp color'],
    ['bingoColor', 'Winning line color'],
    ['textColor', 'Text color'],
    ['borderColor', 'Border color'],
    ['headerBackground', 'Header fill'],
    ['headerTextColor', 'Header text']
];

export function createBingoDesigner(designRoot, appearanceRoot, { getDraft, getSets, getVariables, onChange, pickColor, pickFont }) {
    function ensureBingo() {
        const draft = getDraft();
        if (!draft) return null;
        draft.bingo = { ...defaultBingo(), ...(draft.bingo || {}) };
        if (!Array.isArray(draft.bingo.items)) draft.bingo.items = defaultBingo().items;
        return draft.bingo;
    }

    const listVars = () => (getVariables() || []).filter(v => !v.setId && v.type === 'list');

    function renderDesign() {
        const draft = getDraft();
        const cfg = ensureBingo();
        if (!draft || !cfg || !designRoot) return;
        const sets = getSets() || [];
        const lists = listVars();
        const selectedSet = sets.find(s => s.id === draft.catalogId);
        const setFields = selectedSet?.fields || [];

        const sourceHtml = cfg.sourceMode === 'custom'
            ? `<div class="control-field">
                <label for="bingo-items-text">Bingo prompts (one per line · ${cfg.items.length} items for ${cfg.size}×${cfg.size} grid)</label>
                <textarea id="bingo-items-text" class="input" rows="7" data-bingo-items="1" placeholder="One bingo square prompt per line…">${esc(cfg.items.join('\n'))}</textarea>
            </div>`
            : cfg.sourceMode === 'list'
                ? `<div class="control-field"><label for="bingo-list-var">List variable</label>
                    <select id="bingo-list-var" class="select input" data-bingo-field="listVariable">
                        <option value="">${lists.length ? 'Choose a List variable…' : 'No List variables yet'}</option>
                        ${lists.map(v => `<option value="${esc(v.name)}"${cfg.listVariable === v.name ? ' selected' : ''}>${esc(v.name)} (${(v.items || []).length} items)</option>`).join('')}
                    </select>
                </div>`
                : `<div class="control-grid">
                    <div class="control-field"><label for="bingo-set-select">Variable Set</label>
                        <select id="bingo-set-select" class="select input" data-bingo-set="catalogId">
                            <option value="">Choose a Variable Set</option>
                            ${sets.map(s => `<option value="${esc(s.id)}"${draft.catalogId === s.id ? ' selected' : ''}>${esc(s.name || s.id)} · ${(s.roster || []).length} entries</option>`).join('')}
                        </select>
                    </div>
                    <div class="control-field"><label for="bingo-label-field">Square label field</label>
                        <select id="bingo-label-field" class="select input" data-bingo-field="labelField"${!selectedSet ? ' disabled' : ''}>
                            <option value="$label"${cfg.labelField === '$label' ? ' selected' : ''}>Entry label</option>
                            ${setFields.filter(f => ['text', 'select'].includes(f.type)).map(f => `<option value="${esc(f.key)}"${cfg.labelField === f.key ? ' selected' : ''}>${esc(f.label || f.key)}</option>`).join('')}
                        </select>
                    </div>
                    <div class="control-field toggle-field" style="align-self:end;"><input id="bingo-show-img" type="checkbox" data-bingo-check="showImages"${cfg.showImages ? ' checked' : ''}><label for="bingo-show-img">Show images</label></div>
                </div>`;

        designRoot.innerHTML = `
            <div class="builder-card-heading">
                <div><h3>1. Bingo squares source</h3><p class="display-muted">Enter custom prompts, bind a List variable, or pull squares from a Variable Set.</p></div>
                <div class="tabs-nav" role="group" aria-label="Bingo source">
                    <button type="button" class="tab-btn${cfg.sourceMode === 'custom' ? ' active' : ''}" data-bingo-source="custom">Custom</button>
                    <button type="button" class="tab-btn${cfg.sourceMode === 'list' ? ' active' : ''}" data-bingo-source="list">List Var</button>
                    <button type="button" class="tab-btn${cfg.sourceMode === 'set' ? ' active' : ''}" data-bingo-source="set">Variable Set</button>
                </div>
            </div>
            ${sourceHtml}
            <div class="builder-card-heading" style="margin-top:20px;">
                <div><h3>2. Grid, free space &amp; stamp style</h3><p class="display-muted">Click squares in Live Preview to test stamping and automatic Bingo line detection.</p></div>
            </div>
            <div class="control-grid">
                <div class="control-field"><label for="bingo-size">Grid size</label>
                    <select id="bingo-size" class="select input" data-bingo-field="size">
                        <option value="3"${cfg.size === 3 ? ' selected' : ''}>3 × 3 (9 squares)</option>
                        <option value="4"${cfg.size === 4 ? ' selected' : ''}>4 × 4 (16 squares)</option>
                        <option value="5"${cfg.size === 5 ? ' selected' : ''}>5 × 5 (25 squares)</option>
                    </select>
                </div>
                <div class="control-field"><label for="bingo-stamp">Stamp style</label>
                    <select id="bingo-stamp" class="select input" data-bingo-field="stampStyle">
                        ${STAMP_OPTIONS.map(([id, label]) => `<option value="${esc(id)}"${cfg.stampStyle === id ? ' selected' : ''}>${esc(label)}</option>`).join('')}
                    </select>
                </div>
                <div class="control-field"><label for="bingo-header-text">Header text</label><input id="bingo-header-text" class="input" type="text" maxlength="32" value="${esc(cfg.headerText)}" placeholder="BINGO" data-bingo-field="headerText"></div>
                <div class="control-field"><label for="bingo-free-label">Free space label</label><input id="bingo-free-label" class="input" type="text" maxlength="24" value="${esc(cfg.freeSpaceLabel)}" placeholder="FREE" data-bingo-field="freeSpaceLabel"></div>
                <div class="control-field"><label for="bingo-win-text">Bingo banner text</label><input id="bingo-win-text" class="input" type="text" maxlength="32" value="${esc(cfg.bingoBannerText)}" placeholder="BINGO!" data-bingo-field="bingoBannerText"></div>
                <div class="control-field toggle-field" style="align-self:end;"><input id="bingo-free" type="checkbox" data-bingo-check="freeSpace"${cfg.freeSpace ? ' checked' : ''}><label for="bingo-free">Center free space (3×3 / 5×5)</label></div>
                <div class="control-field toggle-field" style="align-self:end;"><input id="bingo-show-head" type="checkbox" data-bingo-check="showHeader"${cfg.showHeader ? ' checked' : ''}><label for="bingo-show-head">Show header row</label></div>
                <div class="control-field toggle-field" style="align-self:end;"><input id="bingo-show-banner" type="checkbox" data-bingo-check="showBingoBanner"${cfg.showBingoBanner ? ' checked' : ''}><label for="bingo-show-banner">Show BINGO! banner</label></div>
            </div>
        `;
    }

    function renderAppearance() {
        const cfg = ensureBingo();
        if (!cfg || !appearanceRoot) return;
        appearanceRoot.innerHTML = `
            <div class="builder-card-heading"><div><h3>Broadcast theme</h3><p class="display-muted">Apply a cohesive broadcast palette, then fine-tune any color or variable binding.</p></div></div>
            <div class="counter-theme-grid" role="radiogroup" aria-label="Broadcast theme" style="margin-bottom:20px;">
                ${THEME_SWATCHES.map(([id, label, bg, accent, border]) => `<button type="button" class="counter-theme-swatch${(cfg.theme || 'modern') === id ? ' active' : ''}" data-bingo-theme="${esc(id)}" aria-pressed="${(cfg.theme || 'modern') === id}"><span class="counter-theme-bar" style="background:${esc(bg)};border-color:${esc(border)};"><i style="background:${esc(accent)};border-radius:2px;"></i><i class="is-empty" style="border-color:${esc(accent)};border-radius:2px;"></i><i style="background:${esc(accent)};border-radius:2px;"></i></span><span>${esc(label)}</span></button>`).join('')}
            </div>
            <div class="builder-card-heading"><div><h3>Colors, typography &amp; spacing</h3><p class="display-muted">Colors support #RRGGBBAA hex and variable bindings via <code>{}</code>.</p></div></div>
            <div class="control-grid appearance-grid" style="padding:0;">
                ${COLOR_FIELDS.map(([key, label]) => {
                    const val = cfg[key] || '';
                    const isVar = val.includes('{{') || val.startsWith('@');
                    const pickerVal = /^#[a-f\d]{6}/i.test(val) ? val.slice(0, 7) : '#f43f5e';
                    return `<div class="control-field"><label for="bingo-color-${key}">${esc(label)}</label>
                        <span class="display-color-pair">
                            <input type="color" data-bingo-color="${key}" value="${esc(pickerVal)}"${isVar ? ' disabled style="opacity:.35;"' : ''}>
                            <input id="bingo-color-${key}" class="input" type="text" maxlength="90" value="${esc(val)}" data-bingo-field="${key}">
                            ${isVar ? `<button type="button" class="btn btn-sm counter-var-btn" data-bingo-unbind-color="${key}" title="Clear binding">&times;</button>` : ''}
                            <button type="button" class="btn btn-sm counter-var-btn${isVar ? ' active' : ''}" data-bingo-pick-color="${key}" title="Bind color variable">{}</button>
                        </span>
                    </div>`;
                }).join('')}
                <div class="control-field"><label for="bingo-fs">Font size (px)</label><input id="bingo-fs" class="input" type="number" min="9" max="42" value="${esc(cfg.fontSize)}" data-bingo-field="fontSize"></div>
                <div class="control-field"><label for="bingo-gap">Cell gap (px)</label><input id="bingo-gap" class="input" type="number" min="0" max="24" value="${esc(cfg.cellGap)}" data-bingo-field="cellGap"></div>
                <div class="control-field"><label for="bingo-rad">Corner radius (px)</label><input id="bingo-rad" class="input" type="number" min="0" max="32" value="${esc(cfg.radius)}" data-bingo-field="radius"></div>
                <div class="control-field"><label for="bingo-font">Font family</label>
                    <span class="display-color-pair">
                        <input id="bingo-font" class="input" type="text" maxlength="120" value="${esc(cfg.fontFamily)}" data-bingo-field="fontFamily">
                        <button type="button" class="btn btn-sm counter-var-btn${(cfg.fontFamily || '').includes('{{') ? ' active' : ''}" data-bingo-pick-font="1" title="Bind font variable">{}</button>
                    </span>
                </div>
            </div>
        `;
    }

    function render() { renderDesign(); renderAppearance(); }

    function bind(root) {
        if (!root) return;
        root.addEventListener('click', event => {
            const cfg = ensureBingo();
            if (!cfg) return;
            const src = event.target.closest('[data-bingo-source]');
            if (src) { cfg.sourceMode = src.dataset.bingoSource; renderDesign(); onChange(); return; }
            const thm = event.target.closest('[data-bingo-theme]');
            if (thm) {
                const id = thm.dataset.bingoTheme;
                const p = window.OverlayShared?.BINGO_THEME_PRESETS?.[id];
                cfg.theme = id;
                if (p) Object.assign(cfg, {
                    boardBackground: p.rowBackground, stampColor: p.filledColor, headerBackground: p.filledColor,
                    textColor: p.labelColor, borderColor: p.rowBorderColor, borderWidth: p.rowBorderWidth, radius: p.rowRadius
                });
                renderAppearance(); onChange(); return;
            }
            const unbind = event.target.closest('[data-bingo-unbind-color]');
            if (unbind) { cfg[unbind.dataset.bingoUnbindColor] = defaultBingo()[unbind.dataset.bingoUnbindColor] || ''; renderAppearance(); onChange(); return; }
            const pickC = event.target.closest('[data-bingo-pick-color]');
            if (pickC && typeof pickColor === 'function') {
                pickColor({ allowMember: cfg.sourceMode === 'set', onSelect: token => { cfg[pickC.dataset.bingoPickColor] = token; renderAppearance(); onChange(); } });
                return;
            }
            if (event.target.closest('[data-bingo-pick-font]') && typeof pickFont === 'function') {
                pickFont({ onSelect: token => { cfg.fontFamily = token; renderAppearance(); onChange(); } });
            }
        });
        root.addEventListener('input', event => {
            const cfg = ensureBingo();
            if (!cfg) return;
            const t = event.target;
            if (t.dataset.bingoItems) {
                cfg.items = t.value.split(/\r?\n/).map(s => s.trim()).filter(Boolean).slice(0, 60);
                onChange(); return;
            }
            if (t.dataset.bingoColor) {
                cfg[t.dataset.bingoColor] = t.value;
                const txt = t.closest('.display-color-pair')?.querySelector('input[type="text"]');
                if (txt) txt.value = t.value;
                onChange(); return;
            }
            if (t.dataset.bingoField) {
                if (t.type === 'number' || t.dataset.bingoField === 'size') {
                    if (t.value === '') return;
                    cfg[t.dataset.bingoField] = Number(t.value);
                } else cfg[t.dataset.bingoField] = t.value;
                onChange();
            }
        });
        root.addEventListener('change', event => {
            const draft = getDraft();
            const cfg = ensureBingo();
            if (!draft || !cfg) return;
            const t = event.target;
            if (t.dataset.bingoSet === 'catalogId') { draft.catalogId = t.value; renderDesign(); onChange(); return; }
            if (t.dataset.bingoCheck) { cfg[t.dataset.bingoCheck] = t.checked; onChange(); return; }
            if (t.dataset.bingoField === 'size') { cfg.size = Number(t.value) || 5; renderDesign(); onChange(); }
        });
    }

    bind(designRoot);
    bind(appearanceRoot);
    return { render };
}

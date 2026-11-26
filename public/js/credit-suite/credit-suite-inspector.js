/**
 * StreamPulse Credit Suite — Right Contextual Inspector
 * Handles Selected Block, Selected Track Clip, Global Theme/Timing/BG, and Export/Live Delivery.
 */

function esc(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function copyTextWithFeedback(text, btnEl) {
    const flash = () => {
        if (!btnEl) return;
        const prev = btnEl.dataset.origLabel || btnEl.textContent;
        btnEl.dataset.origLabel = prev;
        btnEl.textContent = 'Copied!';
        clearTimeout(btnEl._copyTimer);
        btnEl._copyTimer = setTimeout(() => { btnEl.textContent = prev; }, 1400);
    };
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        navigator.clipboard.writeText(text).then(flash).catch(() => fallbackCopy(text, flash));
    } else {
        fallbackCopy(text, flash);
    }
}

function fallbackCopy(text, onDone) {
    try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none;';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
        onDone?.();
    } catch {}
}

function toColorHex6(c, fallback = '#ffffff') {
    const s = String(c || '').trim();
    if (/^#[0-9a-fA-F]{6,8}$/.test(s)) return s.slice(0, 7);
    if (/^#[0-9a-fA-F]{3}$/.test(s)) return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
    return fallback;
}

function getBorderStyles() {
    return window.StreamPulseBorderCatalog?.BORDER_STYLES || ['solid', 'dashed', 'dotted', 'double', 'outset', 'inset', 'neon-tube', 'corner-brackets', 'tech-hud', 'chamfer'];
}

function getBorderAnims() {
    return window.StreamPulseBorderCatalog?.BORDER_ANIM_TYPES || ['none', 'rotate', 'beam', 'dual-beam', 'pulse', 'palette-flow', 'shimmer-glint'];
}

function getPatternCatalog() {
    return window.StreamPulsePatternCatalog || window.StreamPulsePatterns || {};
}

function getPatternPresets() {
    const cat = getPatternCatalog();
    const raw = cat.PATTERNS || cat.PATTERN_PRESETS;
    if (Array.isArray(raw)) return raw.map(p => (typeof p === 'string' ? p : p.id));
    if (raw && typeof raw === 'object') return Object.keys(raw);
    return ['starfield', 'sparkles', 'hexagons', 'orbits', 'mesh', 'topography', 'waves', 'grid'];
}

function getPatternPresetOptionsHtml(selected) {
    const cat = getPatternCatalog();
    if (Array.isArray(cat.PATTERN_CATEGORIES) && cat.PATTERN_CATEGORIES.length) {
        return cat.PATTERN_CATEGORIES.map(grp =>
            `<optgroup label="${esc(grp.group)}">${grp.options.map(([id, label]) =>
                `<option value="${esc(id)}" ${selected === id ? 'selected' : ''}>${esc(label)}</option>`
            ).join('')}</optgroup>`
        ).join('');
    }
    return getPatternPresets().map(p => `<option value="${esc(p)}" ${selected === p ? 'selected' : ''}>${esc(p)}</option>`).join('');
}

function getPatternPaletteOptionsHtml(selected) {
    const cat = getPatternCatalog();
    if (Array.isArray(cat.PALETTE_OPTIONS) && cat.PALETTE_OPTIONS.length) {
        return cat.PALETTE_OPTIONS
            .filter(([id]) => id !== 'custom')
            .map(([id, label]) => `<option value="${esc(id)}" ${selected === id ? 'selected' : ''}>${esc(label)}</option>`)
            .join('');
    }
    const raw = cat.PALETTES;
    const keys = raw && typeof raw === 'object' ? ['dual', ...Object.keys(raw)] : ['dual', 'galaxy', 'cool', 'neon', 'warm', 'sunset', 'ocean', 'royal', 'forest'];
    return keys.map(p => `<option value="${esc(p)}" ${selected === p ? 'selected' : ''}>${esc(p)}</option>`).join('');
}

function renderPatternControlsHtml(obj, { attrStr, attrNum, attrColor, prefix = '', showOpacity = true }) {
    const cat = getPatternCatalog();
    const preset = obj.patternPreset || 'starfield';
    const palette = obj.patternPalette || 'galaxy';
    const caps = (cat.PATTERN_CAPABILITIES && cat.PATTERN_CAPABILITIES[preset]) || {
        sizeVariance: true, scatter: true, inPlace: true, spin: true, fill: true, density: true, spacing: true
    };
    const motions = cat.PROCEDURAL_MOTIONS || [
        { id: 'none', label: 'Static' }, { id: 'drift', label: 'Drift' }, { id: 'fall', label: 'Fall' },
        { id: 'sway', label: 'Sway' }, { id: 'pulse', label: 'Pulse' }, { id: 'orbit', label: 'Orbit' },
        { id: 'sweep', label: 'Sweep' }, { id: 'aurora', label: 'Aurora' }, { id: 'pan', label: 'Pan' }
    ];
    const fillModes = cat.PROCEDURAL_FILL_MODES || [
        { id: 'tinted', label: 'Translucent Tint' }, { id: 'solid', label: 'Solid Color' }, { id: 'outline', label: 'Wireframe Outlines' }
    ];
    const inPlaceModes = cat.PROCEDURAL_IN_PLACE_MODES || [
        { id: 'auto', label: 'In-place motion' }, { id: 'pulse', label: 'Rhythmic pulse' },
        { id: 'gentle', label: 'Gentle shimmer' }, { id: 'sparkle', label: 'Fast twinkle' }, { id: 'none', label: 'Frozen' }
    ];
    const spinModes = cat.PROCEDURAL_SPIN_MODES || [
        { id: 'none', label: 'No spin' }, { id: 'cw', label: 'Clockwise' }, { id: 'ccw', label: 'Counter-clockwise' }, { id: 'sway', label: 'Pendulum sway' }
    ];
    const colorModes = cat.PROCEDURAL_COLOR_MODES || [
        { id: 'mosaic', label: 'Mosaic scatter' }, { id: 'radial', label: 'Concentric radial' },
        { id: 'rows', label: 'Horizontal rows' }, { id: 'columns', label: 'Vertical columns' },
        { id: 'diagonal', label: 'Diagonal waves' }, { id: 'spiral', label: 'Spiral vortex' }, { id: 'checker', label: 'Checkerboard' }
    ];
    const colorAnims = cat.PROCEDURAL_COLOR_ANIMS || [
        { id: 'none', label: 'Static' }, { id: 'cycle', label: 'Continuous cycle' }, { id: 'breathe', label: 'Breathe' }
    ];
    const panDirs = cat.PROCEDURAL_PAN_DIRECTIONS || [
        { id: 'continuous', label: 'Continuous glide' }, { id: 'oscillate', label: 'Back-and-forth' }
    ];
    const snowStyles = cat.SNOWFLAKE_STYLES || ['all', 'dendrite', 'plate', 'fern', 'rosette', 'cross', 'needle'];
    const swatches = palette === 'dual'
        ? [toColorHex6(obj.patternAccent, '#58a6ff'), toColorHex6(obj.patternSecondary, '#a855f7')]
        : ((cat.PALETTES && cat.PALETTES[palette]) || ['#240046', '#9d4edd', '#00b4d8', '#e0aaff']);
    const k = name => `${prefix}${name}`;
    const curMotion = obj.patternMotion || 'drift';
    const curFillMode = obj.patternFillMode || 'tinted';
    const curInPlace = obj.patternInPlace || 'auto';
    const curSpin = obj.patternSpin || 'none';
    const curColorAnim = obj.patternColorAnim || 'none';

    return `
        <div class="cs-field">
            <label>Pattern Preset (31 Presets)</label>
            <select ${attrStr}="${k('patternPreset')}">${getPatternPresetOptionsHtml(preset)}</select>
        </div>
        ${preset === 'snowflakes' ? `
            <div class="cs-field">
                <label>Snowflake Style</label>
                <select ${attrStr}="${k('patternSnowflakeStyle')}">
                    ${snowStyles.map(s => `<option value="${esc(s)}" ${(obj.patternSnowflakeStyle || 'all') === s ? 'selected' : ''}>${esc(s[0].toUpperCase() + s.slice(1))}</option>`).join('')}
                </select>
            </div>
        ` : ''}
        ${caps.hint ? `<div style="font-size:10px;color:var(--text-muted);line-height:1.4;">${esc(caps.hint)}</div>` : ''}

        <div class="cs-grid-2">
            <div class="cs-field"><label>Scale (%)</label><input type="number" min="15" max="400" step="5" ${attrNum}="${k('patternScale')}" value="${obj.patternScale ?? 100}"></div>
            <div class="cs-field"><label>Line Width (px)</label><input type="number" min="0.5" max="24" step="0.5" ${attrNum}="${k('patternLineWidth')}" value="${obj.patternLineWidth ?? 2}"></div>
        </div>
        ${caps.fill !== false ? `
            <div class="cs-grid-2">
                <div class="cs-field">
                    <label>Fill Style</label>
                    <select ${attrStr}="${k('patternFillMode')}">
                        ${fillModes.map(m => `<option value="${esc(m.id)}" ${curFillMode === m.id ? 'selected' : ''}>${esc(m.label)}</option>`).join('')}
                    </select>
                </div>
                ${curFillMode === 'tinted' ? `<div class="cs-field"><label>Fill Opacity (%)</label><input type="number" min="0" max="100" step="5" ${attrNum}="${k('patternFillOpacity')}" value="${obj.patternFillOpacity ?? 35}"></div>` : '<div></div>'}
            </div>
        ` : ''}
        <div class="cs-grid-2">
            ${caps.density !== false ? `<div class="cs-field"><label>Density</label><input type="number" min="0.25" max="4" step="0.25" ${attrNum}="${k('patternDensity')}" value="${obj.patternDensity ?? 1}"></div>` : ''}
            ${caps.spacing !== false ? `<div class="cs-field"><label>Spacing (%)</label><input type="number" min="50" max="300" step="5" ${attrNum}="${k('patternSpacing')}" value="${obj.patternSpacing ?? 100}"></div>` : ''}
        </div>

        <div class="cs-grid-2">
            <div class="cs-field">
                <label>Canvas Movement</label>
                <select ${attrStr}="${k('patternMotion')}">
                    ${motions.map(m => `<option value="${esc(m.id)}" ${curMotion === m.id ? 'selected' : ''}>${esc(m.label)}</option>`).join('')}
                </select>
            </div>
            <div class="cs-field"><label>Move Speed</label><input type="number" min="0" max="10" step="0.1" ${attrNum}="${k('patternSpeed')}" value="${obj.patternSpeed ?? 0.5}"></div>
        </div>
        ${curMotion === 'pan' ? `
            <div class="cs-grid-2">
                <div class="cs-field">
                    <label>Pan Direction</label>
                    <select ${attrStr}="${k('patternPanDirection')}">
                        ${panDirs.map(d => `<option value="${esc(d.id)}" ${(obj.patternPanDirection || 'continuous') === d.id ? 'selected' : ''}>${esc(d.label)}</option>`).join('')}
                    </select>
                </div>
                <div class="cs-field"><label>Pan Angle (deg)</label><input type="number" min="-360" max="360" step="15" ${attrNum}="${k('patternPanAngle')}" value="${obj.patternPanAngle ?? 0}"></div>
            </div>
        ` : ''}
        <div class="cs-grid-2">
            <div class="cs-field">
                <label>In-Place Motion</label>
                <select ${attrStr}="${k('patternInPlace')}">
                    ${inPlaceModes.map(m => `<option value="${esc(m.id)}" ${curInPlace === m.id ? 'selected' : ''}>${esc(m.label)}</option>`).join('')}
                </select>
            </div>
            ${curInPlace !== 'none' ? `<div class="cs-field"><label>In-Place Speed</label><input type="number" min="0.2" max="5" step="0.2" ${attrNum}="${k('patternInPlaceSpeed')}" value="${obj.patternInPlaceSpeed ?? 1}"></div>` : '<div></div>'}
        </div>
        ${caps.spin ? `
            <div class="cs-grid-2">
                <div class="cs-field">
                    <label>Element Spin</label>
                    <select ${attrStr}="${k('patternSpin')}">
                        ${spinModes.map(m => `<option value="${esc(m.id)}" ${curSpin === m.id ? 'selected' : ''}>${esc(m.label)}</option>`).join('')}
                    </select>
                </div>
                ${curSpin !== 'none' ? `<div class="cs-field"><label>Spin Speed</label><input type="number" min="0.1" max="5" step="0.1" ${attrNum}="${k('patternSpinSpeed')}" value="${obj.patternSpinSpeed ?? 1}"></div>` : '<div></div>'}
            </div>
        ` : ''}

        <div class="cs-field">
            <label>Color Palette</label>
            <select ${attrStr}="${k('patternPalette')}">${getPatternPaletteOptionsHtml(palette)}</select>
            <div style="display:flex;gap:3px;height:10px;border-radius:4px;overflow:hidden;border:1px solid var(--border);margin-top:4px;">
                ${swatches.map(hex => `<span style="flex:1;background:${esc(hex)};"></span>`).join('')}
            </div>
        </div>
        ${palette === 'dual' ? `
            <div class="cs-grid-2">
                <div class="cs-field"><label>Accent Color</label><input type="color" ${attrColor}="${k('patternAccent')}" value="${toColorHex6(obj.patternAccent, '#58a6ff')}"></div>
                <div class="cs-field"><label>Secondary Color</label><input type="color" ${attrColor}="${k('patternSecondary')}" value="${toColorHex6(obj.patternSecondary, '#a855f7')}"></div>
            </div>
        ` : ''}
        <div class="cs-field">
            <label>Color Placement</label>
            <select ${attrStr}="${k('patternColorMode')}">
                ${colorModes.map(m => `<option value="${esc(m.id)}" ${(obj.patternColorMode || 'mosaic') === m.id ? 'selected' : ''}>${esc(m.label)}</option>`).join('')}
            </select>
        </div>
        <div class="cs-grid-2">
            <div class="cs-field">
                <label>Color Animation</label>
                <select ${attrStr}="${k('patternColorAnim')}">
                    ${colorAnims.map(m => `<option value="${esc(m.id)}" ${curColorAnim === m.id ? 'selected' : ''}>${esc(m.label)}</option>`).join('')}
                </select>
            </div>
            ${curColorAnim !== 'none' ? `<div class="cs-field"><label>Color Speed</label><input type="number" min="0" max="5" step="0.05" ${attrNum}="${k('patternColorSpeed')}" value="${obj.patternColorSpeed ?? 0.5}"></div>` : '<div></div>'}
        </div>

        <details class="cs-acc" style="margin-top:4px;">
            <summary>Pattern Opacity, Variation &amp; Vignette</summary>
            <div class="cs-acc-body">
                ${showOpacity ? `<div class="cs-field"><label>Pattern Opacity (0–1)</label><input type="number" min="0.05" max="1" step="0.05" ${attrNum}="${k('patternOpacity')}" value="${obj.patternOpacity ?? 0.65}"></div>` : ''}
                ${(caps.scatter || caps.sizeVariance) ? `
                    <div class="cs-grid-3">
                        <div class="cs-field"><label>Scatter %</label><input type="number" min="0" max="100" step="5" ${attrNum}="${k('patternScatter')}" value="${obj.patternScatter ?? 0}"></div>
                        <div class="cs-field"><label>Size Var %</label><input type="number" min="0" max="100" step="5" ${attrNum}="${k('patternSizeVariance')}" value="${obj.patternSizeVariance ?? 0}"></div>
                        <div class="cs-field"><label>Rot Var %</label><input type="number" min="0" max="100" step="5" ${attrNum}="${k('patternRotationVariance')}" value="${obj.patternRotationVariance ?? 0}"></div>
                    </div>
                ` : ''}
                <div class="cs-grid-2">
                    <div class="cs-field"><label>Vignette (%)</label><input type="number" min="0" max="100" step="5" ${attrNum}="${k('patternVignette')}" value="${obj.patternVignette ?? 0}"></div>
                    <div class="cs-field"><label>Vignette Color</label><input type="color" ${attrColor}="${k('patternVignetteColor')}" value="${toColorHex6(obj.patternVignetteColor, '#000000')}"></div>
                </div>
            </div>
        </details>
    `;
}

function openAssetPickerModal(_state, { kind = 'image', value = '', onPick }) {
    if (window.ImagePicker && typeof window.ImagePicker.open === 'function') {
        window.ImagePicker.open({ value, kind, onPick });
    }
}

function openBulkImportModal({ mode, onImport }) {
    const existing = document.getElementById('cs-bulk-modal');
    if (existing) existing.remove();
    const isRoleSplit = mode === 'role-split';
    const modal = document.createElement('div');
    modal.id = 'cs-bulk-modal';
    modal.className = 'cs-modal-backdrop';
    modal.innerHTML = `
        <div class="cs-modal" style="max-width:520px;">
            <div class="cs-modal-head">
                <span>${isRoleSplit ? 'Bulk Paste Role & Name Pairs' : 'Bulk Paste Roster Names'}</span>
                <button type="button" class="cs-btn cs-btn-sm" data-close>Close</button>
            </div>
            <div class="cs-modal-body">
                <p style="margin:0 0 8px;font-size:12px;color:var(--text-muted);">
                    ${isRoleSplit ? 'Paste one entry per line as <code>Role, Name</code> or <code>Role | Name</code> or <code>Role - Name</code>.' : 'Paste one name per line (or comma-separated).'}
                </p>
                <textarea id="cs-bulk-ta" style="width:100%;min-height:180px;padding:8px;border-radius:6px;border:1px solid var(--border);background:var(--bg-inset);color:var(--text);font-size:12px;font-family:inherit;box-sizing:border-box;" placeholder="${isRoleSplit ? 'Director, Alex Rivera\nProducer, Jordan Blake' : 'Casey Morgan\nTaylor Quinn\nRiley Vance'}"></textarea>
                <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px;">
                    <label class="cs-check-row" style="margin-right:auto;"><input type="checkbox" id="cs-bulk-replace"> Replace existing items</label>
                    <button type="button" class="cs-btn" data-close>Cancel</button>
                    <button type="button" class="cs-btn cs-btn-primary" id="cs-bulk-apply">Import</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    const close = () => modal.remove();
    modal.addEventListener('click', ev => { if (ev.target === modal || ev.target.closest('[data-close]')) close(); });
    modal.querySelector('#cs-bulk-apply').addEventListener('click', () => {
        const raw = modal.querySelector('#cs-bulk-ta').value || '';
        const replace = modal.querySelector('#cs-bulk-replace').checked;
        onImport(raw, replace);
        close();
    });
}

export function mountCreditSuiteInspector({ state, stage }) {
    const tabBtns = document.querySelectorAll('[data-cs-insp-tab]');
    const bodyEl = document.getElementById('cs-inspector-body');
    let inlineSortable = null;

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => state.setInspectorTab(btn.dataset.csInspTab));
    });

    function fontOptionsHtml(current, allowInherit = false) {
        const fonts = window.StreamPulseCreditSuiteEngine.GOOGLE_FONT_LIST;
        let html = allowInherit ? `<option value="" ${!current ? 'selected' : ''}>Inherit Global Theme</option>` : '';
        for (const f of fonts) {
            html += `<option value="${esc(f)}" ${current === f ? 'selected' : ''}>${esc(f)}</option>`;
        }
        if (current && !fonts.includes(current)) {
            html += `<option value="${esc(current)}" selected>${esc(current)} (Custom)</option>`;
        }
        return html;
    }

    function renderBlockInspector(block) {
        const engine = window.StreamPulseCreditSuiteEngine;
        const proj = state.store.project;
        const ds = state.store.dataSources || {};
        const st = block.style || {};

        let contentHtml = '';
        if (block.type === 'spacer') {
            contentHtml = `
                <div class="cs-section">
                    <div class="cs-section-head">Spacer Size</div>
                    <div class="cs-field">
                        <label>Height (px)</label>
                        <input type="number" min="16" max="1200" step="10" data-b-num="spacerHeight" value="${block.spacerHeight || 120}">
                    </div>
                </div>
            `;
        } else if (block.type === 'divider') {
            contentHtml = `
                <div class="cs-section">
                    <div class="cs-section-head">Divider Style</div>
                    <div class="cs-grid-2">
                        <div class="cs-field">
                            <label>Pattern</label>
                            <select data-b="dividerStyle">
                                ${engine.DIVIDER_STYLES.map(d => `<option value="${d}" ${block.dividerStyle === d ? 'selected' : ''}>${d[0].toUpperCase() + d.slice(1)}</option>`).join('')}
                            </select>
                        </div>
                        <div class="cs-field">
                            <label>Width (%)</label>
                            <input type="number" min="10" max="100" data-b-num="dividerWidth" value="${block.dividerWidth || 55}">
                        </div>
                    </div>
                    ${block.dividerStyle === 'icon' ? `
                        <div class="cs-field">
                            <label>Center Icon</label>
                            <div style="display:flex;gap:6px;">
                                <input type="text" data-bs="iconClass" value="${esc(st.iconClass || 'fa-solid fa-star')}">
                                <button type="button" class="cs-btn cs-btn-sm" id="cs-pick-block-icon">Pick</button>
                            </div>
                        </div>
                    ` : ''}
                </div>
            `;
        } else {
            const hasTitle = block.type !== 'spacer' && block.type !== 'divider';
            const hasColumns = block.type === 'roster' || block.type === 'section';
            contentHtml += `
                <div class="cs-section">
                    <div class="cs-section-head">Block Content</div>
                    ${hasTitle ? `
                        <div class="cs-field">
                            <label>Heading / Title</label>
                            <input type="text" data-b="title" value="${esc(block.title || '')}" placeholder="Section heading (supports {{var.key}})...">
                        </div>
                        <div class="cs-field">
                            <label>Subtitle (optional)</label>
                            <input type="text" data-b="subtitle" value="${esc(block.subtitle || '')}" placeholder="Optional italic subtitle...">
                        </div>
                    ` : ''}
                    ${hasColumns ? `
                        <div class="cs-grid-2">
                            <div class="cs-field">
                                <label>Columns</label>
                                <select data-b-num="columns">
                                    ${[1, 2, 3, 4].map(n => `<option value="${n}" ${Number(block.columns) === n ? 'selected' : ''}>${n} Column${n > 1 ? 's' : ''}</option>`).join('')}
                                </select>
                            </div>
                            <label class="cs-check-row" style="align-self:end;padding-bottom:6px;">
                                <input type="checkbox" data-b-chk="autoFitNames" ${block.autoFitNames !== false ? 'checked' : ''}>
                                Auto-fit long names
                            </label>
                        </div>
                    ` : ''}
                    ${['featured', 'section', 'paragraph', 'split-row'].includes(block.type) ? `
                        <div class="cs-field">
                            <label>Body Text</label>
                            <textarea data-b="content" placeholder="One entry per line or paragraph (supports {{var.name}})...">${esc(block.content || '')}</textarea>
                        </div>
                    ` : ''}
                </div>
            `;

            // Role-Split interactive rows
            if (block.type === 'role-split') {
                const rows = block.rows || [];
                contentHtml += `
                    <div class="cs-section">
                        <div class="cs-section-head">
                            <span>Role &amp; Name Pairs (${rows.length})</span>
                            <div style="display:flex;gap:4px;">
                                <button type="button" class="cs-btn cs-btn-sm" id="cs-bulk-rows">Bulk Paste</button>
                                <button type="button" class="cs-btn cs-btn-sm cs-btn-primary" id="cs-add-role-row">+ Row</button>
                            </div>
                        </div>
                        <div class="cs-inline-list" id="cs-inline-rows-list">
                            ${rows.map((r, i) => `
                                <div class="cs-inline-row" data-row-idx="${i}">
                                    <span class="cs-grip" style="cursor:grab;">&#8942;</span>
                                    <input type="checkbox" data-row-chk="${i}" ${r.checked !== false ? 'checked' : ''}>
                                    <input type="text" data-row-role="${i}" value="${esc(r.role)}" placeholder="Role">
                                    <input type="text" data-row-name="${i}" value="${esc(r.name)}" placeholder="Name">
                                    <button type="button" class="cs-mini-icon-btn danger" data-row-del="${i}" title="Remove">&times;</button>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
            }

            // Roster interactive names + Data Source Binding
            if (block.type === 'roster') {
                const names = block.names || [];
                const dsrc = block.dataSource || { type: 'manual' };
                let sourceSelectHtml = '';
                if (dsrc.type === 'variable-set') {
                    const sets = ds.variableSets || [];
                    const curSet = sets.find(s => s.id === dsrc.sourceId) || null;
                    sourceSelectHtml = `
                        <div class="cs-grid-2">
                            <div class="cs-field">
                                <label>Variable Set</label>
                                <select data-b-ds="sourceId">
                                    <option value="">-- Select Set --</option>
                                    ${sets.map(s => `<option value="${esc(s.id)}" ${dsrc.sourceId === s.id ? 'selected' : ''}>${esc(s.label)} (${s.count})</option>`).join('')}
                                </select>
                            </div>
                            <div class="cs-field">
                                <label>Name Field</label>
                                <select data-b-ds="field" ${curSet ? '' : 'disabled'}>
                                    <option value="">Entry Label</option>
                                    ${(curSet?.fields || []).map(f => `<option value="${esc(f.key)}" ${dsrc.field === f.key ? 'selected' : ''}>${esc(f.label)}</option>`).join('')}
                                </select>
                            </div>
                        </div>
                    `;
                } else if (dsrc.type === 'list-variable') {
                    const lists = ds.listVariables || [];
                    sourceSelectHtml = `
                        <div class="cs-field">
                            <label>List Variable</label>
                            <select data-b-ds="sourceId">
                                <option value="">-- Select List --</option>
                                ${lists.map(v => `<option value="${esc(v.id)}" ${dsrc.sourceId === v.id ? 'selected' : ''}>${esc(v.label)} (${v.count})</option>`).join('')}
                            </select>
                        </div>
                    `;
                } else if (dsrc.type === 'session-credits') {
                    const cats = ds.sessionCategories || [];
                    sourceSelectHtml = `
                        <div class="cs-field">
                            <label>Session Group</label>
                            <select data-b-ds="sessionCategory">
                                ${cats.map(c => `<option value="${esc(c.id)}" ${dsrc.sessionCategory === c.id ? 'selected' : ''}>${esc(c.label)} (${c.count})</option>`).join('')}
                            </select>
                        </div>
                    `;
                }
                contentHtml += `
                    <div class="cs-section">
                        <div class="cs-section-head">Data Source Binding</div>
                        <div class="cs-field">
                            <label>Source</label>
                            <select data-b-ds="type">
                                <option value="manual" ${dsrc.type === 'manual' ? 'selected' : ''}>Manual List</option>
                                <option value="variable-set" ${dsrc.type === 'variable-set' ? 'selected' : ''}>StreamPulse Variable Set</option>
                                <option value="list-variable" ${dsrc.type === 'list-variable' ? 'selected' : ''}>StreamPulse List Variable</option>
                                <option value="session-credits" ${dsrc.type === 'session-credits' ? 'selected' : ''}>Live Stream Session Contributors</option>
                            </select>
                        </div>
                        ${sourceSelectHtml}
                        ${dsrc.type !== 'manual' ? `<button type="button" class="cs-btn cs-btn-primary cs-btn-sm" id="cs-pull-ds">Pull / Refresh Names</button>` : ''}
                    </div>
                    <div class="cs-section">
                        <div class="cs-section-head">
                            <span>Names (${names.filter(n => n.checked !== false).length} / ${names.length})</span>
                            <div style="display:flex;gap:4px;">
                                <button type="button" class="cs-btn cs-btn-sm" id="cs-bulk-names">Bulk Paste</button>
                                <button type="button" class="cs-btn cs-btn-sm cs-btn-primary" id="cs-add-roster-name">+ Name</button>
                            </div>
                        </div>
                        <div class="cs-inline-list" id="cs-inline-names-list">
                            ${names.map((n, i) => `
                                <div class="cs-inline-row" data-name-idx="${i}">
                                    <span class="cs-grip" style="cursor:grab;">&#8942;</span>
                                    <input type="checkbox" data-name-chk="${i}" ${n.checked !== false ? 'checked' : ''}>
                                    <input type="text" data-name-val="${i}" value="${esc(n.editedName || n.name)}" placeholder="Display name">
                                    <button type="button" class="cs-mini-icon-btn danger" data-name-del="${i}" title="Remove">&times;</button>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
            }

            // Inline Media / Split Row settings
            if (block.type === 'media' || block.type === 'split-row') {
                contentHtml += `
                    <div class="cs-section">
                        <div class="cs-section-head">Inline Media</div>
                        <div class="cs-grid-2">
                            <div class="cs-field">
                                <label>Media Kind</label>
                                <select data-b="mediaKind">
                                    <option value="image" ${block.mediaKind === 'image' ? 'selected' : ''}>Image</option>
                                    <option value="video" ${block.mediaKind === 'video' ? 'selected' : ''}>Local Video</option>
                                    <option value="icon" ${block.mediaKind === 'icon' ? 'selected' : ''}>Font Awesome Icon</option>
                                </select>
                            </div>
                            ${block.type === 'split-row' ? `
                                <div class="cs-field">
                                    <label>Side</label>
                                    <select data-b="mediaPosition">
                                        <option value="left" ${block.mediaPosition === 'left' ? 'selected' : ''}>Media Left</option>
                                        <option value="right" ${block.mediaPosition === 'right' ? 'selected' : ''}>Media Right</option>
                                    </select>
                                </div>
                            ` : `
                                <div class="cs-field">
                                    <label>Radius (px)</label>
                                    <input type="number" min="0" max="200" data-b-num="mediaRadius" value="${block.mediaRadius ?? 12}">
                                </div>
                            `}
                        </div>
                        ${block.mediaKind === 'icon' ? `
                            <div class="cs-field">
                                <label>Icon Class</label>
                                <div style="display:flex;gap:6px;">
                                    <input type="text" data-b="mediaIcon" value="${esc(block.mediaIcon || 'fa-solid fa-film')}">
                                    <button type="button" class="cs-btn cs-btn-sm" id="cs-pick-media-icon">Pick</button>
                                </div>
                            </div>
                        ` : `
                            <div class="cs-field">
                                <label>Asset URL</label>
                                <div style="display:flex;gap:6px;">
                                    <input type="text" data-b="mediaUrl" value="${esc(block.mediaUrl || '')}" placeholder="/custom-overlay-assets/...">
                                    <button type="button" class="cs-btn cs-btn-sm" id="cs-pick-block-asset">Library</button>
                                </div>
                            </div>
                        `}
                        <div class="cs-grid-2">
                            <div class="cs-field"><label>Width (px)</label><input type="number" min="40" max="1600" data-b-num="mediaWidth" value="${block.mediaWidth || 320}"></div>
                            <div class="cs-field"><label>Height (0=Auto)</label><input type="number" min="0" max="1200" data-b-num="mediaHeight" value="${block.mediaHeight || 0}"></div>
                        </div>
                        ${block.type === 'media' ? `<div class="cs-field"><label>Caption</label><input type="text" data-b="caption" value="${esc(block.caption || '')}"></div>` : ''}
                    </div>
                `;
            }

            // Logo Strip settings
            if (block.type === 'logo-strip') {
                const logos = block.logos || [];
                contentHtml += `
                    <div class="cs-section">
                        <div class="cs-section-head">
                            <span>Logos (${logos.length})</span>
                            <button type="button" class="cs-btn cs-btn-sm cs-btn-primary" id="cs-add-logo">+ Logo</button>
                        </div>
                        <div class="cs-grid-2">
                            <div class="cs-field"><label>Height (px)</label><input type="number" min="24" max="240" data-b-num="logoHeight" value="${block.logoHeight || 64}"></div>
                            <div class="cs-field"><label>Gap (px)</label><input type="number" min="8" max="160" data-b-num="logoGap" value="${block.logoGap || 48}"></div>
                        </div>
                        <label class="cs-check-row"><input type="checkbox" data-b-chk="logoMono" ${block.logoMono ? 'checked' : ''}> Desaturate / Monochrome Logos</label>
                        <div class="cs-inline-list">
                            ${logos.map((lg, i) => `
                                <div class="cs-inline-row">
                                    <input type="text" data-logo-lbl="${i}" value="${esc(lg.label)}" placeholder="Label">
                                    <button type="button" class="cs-btn cs-btn-sm" data-logo-asset="${i}">Img</button>
                                    <button type="button" class="cs-btn cs-btn-sm" data-logo-icon="${i}">Icon</button>
                                    <button type="button" class="cs-mini-icon-btn danger" data-logo-del="${i}">&times;</button>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
            }
        }

        // Common Presentation, Timing & Choreography + Typography & Border Overrides
        bodyEl.innerHTML = `
            <div class="cs-section">
                <div class="cs-section-head">
                    <span>Choreography &amp; Timing</span>
                    <div style="display:flex;gap:4px;">
                        <button type="button" class="cs-btn cs-btn-sm" id="cs-insp-dup-block" title="Duplicate block">Duplicate</button>
                        <button type="button" class="cs-btn cs-btn-sm cs-btn-danger" id="cs-insp-del-block" title="Delete block (Del)">Delete</button>
                    </div>
                </div>
                <div class="cs-grid-2">
                    <div class="cs-field">
                        <label>Presentation</label>
                        <select data-b="presentation">
                            <option value="crawl" ${block.presentation === 'crawl' ? 'selected' : ''}>Continuous Crawl</option>
                            <option value="card" ${block.presentation === 'card' ? 'selected' : ''}>Fade / Title Card</option>
                        </select>
                    </div>
                    <div class="cs-field">
                        <label>Column Zone</label>
                        <select data-b="zoneOverride">
                            <option value="auto" ${block.zoneOverride === 'auto' ? 'selected' : ''}>Auto (Reflow)</option>
                            <option value="center" ${block.zoneOverride === 'center' ? 'selected' : ''}>Force Center</option>
                            <option value="left" ${block.zoneOverride === 'left' ? 'selected' : ''}>Force Left</option>
                            <option value="right" ${block.zoneOverride === 'right' ? 'selected' : ''}>Force Right</option>
                        </select>
                    </div>
                </div>
                ${block.presentation === 'card' ? `
                    <div class="cs-grid-3">
                        <div class="cs-field"><label>Card Hold (s)</label><input type="number" min="0.5" max="120" step="0.5" data-b-num="duration" value="${block.duration || 4.5}"></div>
                        <div class="cs-field"><label>Enter (s)</label><input type="number" min="0" max="10" step="0.1" data-b-num="transitionInSec" value="${block.transitionInSec ?? block.transitionSec ?? 0.75}"></div>
                        <div class="cs-field"><label>Exit (s)</label><input type="number" min="0" max="10" step="0.1" data-b-num="transitionOutSec" value="${block.transitionOutSec ?? block.transitionSec ?? 0.75}"></div>
                    </div>
                    <div class="cs-grid-2">
                        <div class="cs-field">
                            <label>Enter FX</label>
                            <select data-b="transitionIn">
                                ${engine.TRANSITION_TYPES.map(tr => `<option value="${tr}" ${block.transitionIn === tr ? 'selected' : ''}>${tr}</option>`).join('')}
                            </select>
                        </div>
                        <div class="cs-field">
                            <label>Exit FX</label>
                            <select data-b="transitionOut">
                                ${engine.TRANSITION_TYPES.map(tr => `<option value="${tr}" ${block.transitionOut === tr ? 'selected' : ''}>${tr}</option>`).join('')}
                            </select>
                        </div>
                    </div>
                ` : ''}
                <div class="cs-field">
                    <label>Jump Marker (Companion / Timeline)</label>
                    <input type="text" data-b="marker" value="${esc(block.marker || '')}" placeholder="e.g. Cast, Sponsors, Finale...">
                </div>
            </div>

            ${contentHtml}

            <details class="cs-acc">
                <summary>Typography, Padding &amp; Borders</summary>
                <div class="cs-acc-body">
                <div class="cs-grid-2">
                    <div class="cs-field"><label>Heading Font</label><select data-bs="headingFont">${fontOptionsHtml(st.headingFont, true)}</select></div>
                    <div class="cs-field"><label>Content Font</label><select data-bs="contentFont">${fontOptionsHtml(st.contentFont, true)}</select></div>
                </div>
                <div class="cs-grid-3">
                    <div class="cs-field"><label>H. Size</label><input type="number" min="10" max="240" placeholder="Theme" data-bs-optnum="headingSize" value="${esc(st.headingSize)}"></div>
                    <div class="cs-field"><label>C. Size</label><input type="number" min="10" max="180" placeholder="Theme" data-bs-optnum="contentSize" value="${esc(st.contentSize)}"></div>
                    <div class="cs-field">
                        <label>Align</label>
                        <select data-bs="align">
                            <option value="center" ${st.align === 'center' ? 'selected' : ''}>Center</option>
                            <option value="left" ${st.align === 'left' ? 'selected' : ''}>Left</option>
                            <option value="right" ${st.align === 'right' ? 'selected' : ''}>Right</option>
                        </select>
                    </div>
                </div>
                <div class="cs-grid-3">
                    <div class="cs-field"><label>Pad Top</label><input type="number" min="0" max="400" placeholder="Auto" data-b-optnum="paddingTop" value="${esc(block.paddingTop)}"></div>
                    <div class="cs-field"><label>Pad Bot</label><input type="number" min="0" max="400" placeholder="Auto" data-b-optnum="paddingBottom" value="${esc(block.paddingBottom)}"></div>
                    <div class="cs-field"><label>Pad H</label><input type="number" min="0" max="400" placeholder="Auto" data-b-optnum="paddingH" value="${esc(block.paddingH)}"></div>
                </div>
                <div class="cs-grid-2">
                    <div class="cs-field">
                        <label>Heading Color</label>
                        <div class="cs-color-row">
                            <input type="color" data-bs-color="headingColor" value="${toColorHex6(st.headingColor, toColorHex6(proj.theme?.accentColor, '#e5c07b'))}">
                            <input type="text" data-bs="headingColor" value="${esc(st.headingColor || '')}" placeholder="Inherit">
                        </div>
                    </div>
                    <div class="cs-field">
                        <label>Content Color</label>
                        <div class="cs-color-row">
                            <input type="color" data-bs-color="contentColor" value="${toColorHex6(st.contentColor, toColorHex6(proj.theme?.textColor, '#f3f4f6'))}">
                            <input type="text" data-bs="contentColor" value="${esc(st.contentColor || '')}" placeholder="Inherit">
                        </div>
                    </div>
                </div>
                <div class="cs-grid-2">
                    <div class="cs-field">
                        <label>Block Border</label>
                        <select data-bs="borderStyle">
                            <option value="none" ${(!st.borderStyle || st.borderStyle === 'none') ? 'selected' : ''}>None</option>
                            ${getBorderStyles().map(bs => `<option value="${bs}" ${st.borderStyle === bs ? 'selected' : ''}>${bs}</option>`).join('')}
                        </select>
                    </div>
                    <div class="cs-field">
                        <label>Border Width</label>
                        <input type="number" min="0" max="24" data-bs-num="borderWidth" value="${st.borderWidth || 0}">
                    </div>
                </div>
                </div>
            </details>
        `;

        bodyEl.querySelector('#cs-insp-dup-block')?.addEventListener('click', () => {
            state.mutateProject(p => {
                const idx = p.blocks.findIndex(x => x.id === block.id);
                if (idx >= 0) {
                    const copy = JSON.parse(JSON.stringify(p.blocks[idx]));
                    copy.id = `blk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
                    p.blocks.splice(idx + 1, 0, copy);
                }
            }, { reason: 'project-structure' });
        });
        bodyEl.querySelector('#cs-insp-del-block')?.addEventListener('click', () => {
            state.mutateProject(p => {
                p.blocks = p.blocks.filter(x => x.id !== block.id);
            }, { reason: 'project-structure' });
            state.setSelection(null, null);
        });

        // Wire block bindings
        const updateBlock = (fn, opts = {}) => state.mutateProject(p => {
            const b = p.blocks.find(x => x.id === block.id);
            if (b) fn(b);
        }, opts);

        bodyEl.querySelectorAll('[data-b]').forEach(el => {
            const isSel = el.tagName === 'SELECT';
            el.addEventListener(isSel ? 'change' : 'input', () => {
                updateBlock(
                    b => { b[el.dataset.b] = el.value; },
                    isSel ? { reason: 'project-structure' } : { undoGroup: `b:${block.id}:${el.dataset.b}` }
                );
            });
        });
        bodyEl.querySelectorAll('[data-b-num]').forEach(el => {
            el.addEventListener('change', () => {
                const min = el.min !== '' ? Number(el.min) : -Infinity;
                const max = el.max !== '' ? Number(el.max) : Infinity;
                const parsed = Number(el.value);
                if (el.value === '' || !Number.isFinite(parsed)) return;
                updateBlock(b => { b[el.dataset.bNum] = Math.max(min, Math.min(max, parsed)); });
            });
        });
        bodyEl.querySelectorAll('[data-b-optnum]').forEach(el => {
            el.addEventListener('change', () => {
                updateBlock(b => { b[el.dataset.bOptnum] = el.value === '' ? '' : Number(el.value); });
            });
        });
        bodyEl.querySelectorAll('[data-b-chk]').forEach(el => {
            el.addEventListener('change', () => {
                updateBlock(b => { b[el.dataset.bChk] = el.checked; });
            });
        });
        bodyEl.querySelectorAll('[data-bs]').forEach(el => {
            const isSel = el.tagName === 'SELECT';
            el.addEventListener(isSel ? 'change' : 'input', () => {
                updateBlock(
                    b => { b.style = b.style || {}; b.style[el.dataset.bs] = el.value; },
                    isSel ? {} : { undoGroup: `bs:${block.id}:${el.dataset.bs}` }
                );
                // Keep paired color picker synced when typing a hex color
                const pair = bodyEl.querySelector(`[data-bs-color="${CSS.escape(el.dataset.bs)}"]`);
                if (pair && /^#[0-9a-f]{6,8}$/i.test(el.value.trim())) {
                    pair.value = el.value.trim().slice(0, 7);
                }
            });
        });
        bodyEl.querySelectorAll('[data-bs-num]').forEach(el => {
            el.addEventListener('change', () => {
                updateBlock(b => { b.style = b.style || {}; b.style[el.dataset.bsNum] = Number(el.value) || 0; });
            });
        });
        bodyEl.querySelectorAll('[data-bs-optnum]').forEach(el => {
            el.addEventListener('change', () => {
                updateBlock(b => { b.style = b.style || {}; b.style[el.dataset.bsOptnum] = el.value === '' ? '' : Number(el.value); });
            });
        });
        bodyEl.querySelectorAll('[data-bs-color]').forEach(el => {
            el.addEventListener('input', () => {
                const hex8 = `${el.value.toUpperCase()}FF`;
                updateBlock(b => { b.style = b.style || {}; b.style[el.dataset.bsColor] = hex8; }, { undoGroup: `bsc:${block.id}:${el.dataset.bsColor}` });
                const textPair = bodyEl.querySelector(`input[type="text"][data-bs="${CSS.escape(el.dataset.bsColor)}"]`);
                if (textPair) textPair.value = hex8;
            });
        });

        // Pickers
        bodyEl.querySelector('#cs-pick-block-icon')?.addEventListener('click', () => {
            window.IconPicker?.open({ value: st.iconClass || '', onPick: cls => updateBlock(b => { b.style = b.style || {}; b.style.iconClass = cls; }, { reason: 'project-structure' }) });
        });
        bodyEl.querySelector('#cs-pick-media-icon')?.addEventListener('click', () => {
            window.IconPicker?.open({ value: block.mediaIcon || '', onPick: cls => updateBlock(b => { b.mediaIcon = cls; }, { reason: 'project-structure' }) });
        });
        bodyEl.querySelector('#cs-pick-block-asset')?.addEventListener('click', () => {
            openAssetPickerModal(state, { value: block.mediaUrl || '', kind: block.mediaKind === 'video' ? 'video' : 'image', onPick: url => updateBlock(b => { b.mediaUrl = url; }, { reason: 'project-structure' }) });
        });

        // Role-split rows
        bodyEl.querySelector('#cs-add-role-row')?.addEventListener('click', () => {
            updateBlock(b => {
                b.rows = b.rows || [];
                b.rows.push({ id: `r-${Date.now()}`, role: 'Role', name: 'Name', checked: true });
            }, { reason: 'project-structure' });
        });
        bodyEl.querySelector('#cs-bulk-rows')?.addEventListener('click', () => {
            openBulkImportModal({
                mode: 'role-split',
                onImport: (raw, replace) => {
                    const parsed = raw.split('\n').map(l => l.trim()).filter(Boolean).map((line, i) => {
                        const parts = line.split(/\s*(?:\||,|\t|—|–| - )\s*/);
                        return { id: `r-${Date.now()}-${i}`, role: parts[0] || '', name: parts.slice(1).join(' ') || '', checked: true };
                    });
                    updateBlock(b => { b.rows = replace ? parsed : [...(b.rows || []), ...parsed]; }, { reason: 'project-structure' });
                }
            });
        });
        bodyEl.querySelectorAll('[data-row-chk]').forEach(el => {
            el.addEventListener('change', () => updateBlock(b => { if (b.rows[Number(el.dataset.rowChk)]) b.rows[Number(el.dataset.rowChk)].checked = el.checked; }));
        });
        bodyEl.querySelectorAll('[data-row-role]').forEach(el => {
            el.addEventListener('input', () => updateBlock(b => { if (b.rows[Number(el.dataset.rowRole)]) b.rows[Number(el.dataset.rowRole)].role = el.value; }, { undoGroup: `rr:${block.id}:${el.dataset.rowRole}` }));
        });
        bodyEl.querySelectorAll('[data-row-name]').forEach(el => {
            el.addEventListener('input', () => updateBlock(b => { if (b.rows[Number(el.dataset.rowName)]) b.rows[Number(el.dataset.rowName)].name = el.value; }, { undoGroup: `rn:${block.id}:${el.dataset.rowName}` }));
        });
        bodyEl.querySelectorAll('[data-row-del]').forEach(el => {
            el.addEventListener('click', () => updateBlock(b => { b.rows.splice(Number(el.dataset.rowDel), 1); }, { reason: 'project-structure' }));
        });

        // Roster names & Data Source
        bodyEl.querySelectorAll('[data-b-ds]').forEach(el => {
            el.addEventListener('change', () => {
                updateBlock(b => { b.dataSource = b.dataSource || {}; b.dataSource[el.dataset.bDs] = el.value; }, { reason: 'project-structure' });
            });
        });
        bodyEl.querySelector('#cs-pull-ds')?.addEventListener('click', async () => {
            const liveBlock = (state.store.project?.blocks || []).find(x => x.id === block.id);
            if (!liveBlock) return;
            const dsrc = liveBlock.dataSource || {};
            if ((dsrc.type === 'variable-set' || dsrc.type === 'list-variable') && !dsrc.sourceId) {
                window.alert('Please select a source first before pulling names.');
                return;
            }
            try {
                const res = await state.pullDataSource(liveBlock);
                updateBlock(b => {
                    if (res.names) b.names = res.names;
                    if (res.rows) b.rows = res.rows;
                }, { reason: 'project-structure' });
                if (res.conflicts && res.conflicts.length) {
                    window.alert(`Refreshed ${res.count || 0} entries. ${res.conflicts.length} customized name override(s) were preserved despite upstream changes.`);
                }
            } catch (err) {
                window.alert(err.message);
            }
        });
        bodyEl.querySelector('#cs-add-roster-name')?.addEventListener('click', () => {
            updateBlock(b => {
                b.names = b.names || [];
                b.names.push({ id: `n-${Date.now()}`, name: 'New Contributor', editedName: '', checked: true });
            }, { reason: 'project-structure' });
        });
        bodyEl.querySelector('#cs-bulk-names')?.addEventListener('click', () => {
            openBulkImportModal({
                mode: 'roster',
                onImport: (raw, replace) => {
                    const parsed = raw.split(/[\n,]+/).map(s => s.trim()).filter(Boolean).map((name, i) => ({
                        id: `n-${Date.now()}-${i}`, name, editedName: '', checked: true
                    }));
                    updateBlock(b => { b.names = replace ? parsed : [...(b.names || []), ...parsed]; }, { reason: 'project-structure' });
                }
            });
        });
        bodyEl.querySelectorAll('[data-name-chk]').forEach(el => {
            el.addEventListener('change', () => updateBlock(b => { if (b.names[Number(el.dataset.nameChk)]) b.names[Number(el.dataset.nameChk)].checked = el.checked; }));
        });
        bodyEl.querySelectorAll('[data-name-val]').forEach(el => {
            el.addEventListener('input', () => updateBlock(b => {
                const item = b.names[Number(el.dataset.nameVal)];
                if (!item) return;
                if (item.sourceKey) item.editedName = el.value;
                else item.name = el.value;
            }, { undoGroup: `nv:${block.id}:${el.dataset.nameVal}` }));
        });
        bodyEl.querySelectorAll('[data-name-del]').forEach(el => {
            el.addEventListener('click', () => updateBlock(b => { b.names.splice(Number(el.dataset.nameDel), 1); }, { reason: 'project-structure' }));
        });

        // Logo strip controls
        bodyEl.querySelector('#cs-add-logo')?.addEventListener('click', () => {
            updateBlock(b => {
                b.logos = b.logos || [];
                b.logos.push({ id: `lg-${Date.now()}`, url: '', iconClass: 'fa-solid fa-star', label: 'Partner' });
            }, { reason: 'project-structure' });
        });
        bodyEl.querySelectorAll('[data-logo-lbl]').forEach(el => {
            el.addEventListener('input', () => updateBlock(b => { if (b.logos[Number(el.dataset.logoLbl)]) b.logos[Number(el.dataset.logoLbl)].label = el.value; }, { undoGroup: `lg:${block.id}:${el.dataset.logoLbl}` }));
        });
        bodyEl.querySelectorAll('[data-logo-asset]').forEach(el => {
            el.addEventListener('click', () => {
                const idx = Number(el.dataset.logoAsset);
                openAssetPickerModal(state, { kind: 'image', onPick: url => updateBlock(b => { if (b.logos[idx]) { b.logos[idx].url = url; b.logos[idx].iconClass = ''; } }, { reason: 'project-structure' }) });
            });
        });
        bodyEl.querySelectorAll('[data-logo-icon]').forEach(el => {
            el.addEventListener('click', () => {
                const idx = Number(el.dataset.logoIcon);
                window.IconPicker?.open({ value: block.logos[idx]?.iconClass || '', onPick: cls => updateBlock(b => { if (b.logos[idx]) { b.logos[idx].iconClass = cls; b.logos[idx].url = ''; } }, { reason: 'project-structure' }) });
            });
        });
        bodyEl.querySelectorAll('[data-logo-del]').forEach(el => {
            el.addEventListener('click', () => updateBlock(b => { b.logos.splice(Number(el.dataset.logoDel), 1); }, { reason: 'project-structure' }));
        });

        // Sortable drag-and-drop for inline Role/Roster rows
        if (typeof Sortable !== 'undefined') {
            const rowsEl = bodyEl.querySelector('#cs-inline-rows-list');
            const namesEl = bodyEl.querySelector('#cs-inline-names-list');
            if (rowsEl) {
                inlineSortable = new Sortable(rowsEl, {
                    animation: 120,
                    handle: '.cs-grip',
                    onEnd: evt => {
                        if (evt.oldIndex === evt.newIndex) return;
                        updateBlock(b => { const [m] = b.rows.splice(evt.oldIndex, 1); b.rows.splice(evt.newIndex, 0, m); }, { reason: 'project-structure' });
                    }
                });
            } else if (namesEl) {
                inlineSortable = new Sortable(namesEl, {
                    animation: 120,
                    handle: '.cs-grip',
                    onEnd: evt => {
                        if (evt.oldIndex === evt.newIndex) return;
                        updateBlock(b => { const [m] = b.names.splice(evt.oldIndex, 1); b.names.splice(evt.newIndex, 0, m); }, { reason: 'project-structure' });
                    }
                });
            }
        }
    }

    function renderClipInspector(track, clip) {
        const engine = window.StreamPulseCreditSuiteEngine;
        const proj = state.store.project;
        const t = clip.elementType || 'image';

        bodyEl.innerHTML = `
            <div class="cs-section">
                <div class="cs-section-head">
                    <span>Clip Setup (${esc(track.name)})</span>
                    <div style="display:flex;gap:4px;">
                        <button type="button" class="cs-btn cs-btn-sm" id="cs-insp-dup-clip" title="Duplicate clip">Duplicate</button>
                        <button type="button" class="cs-btn cs-btn-sm cs-btn-danger" id="cs-insp-del-clip" title="Delete clip (Del)">Delete</button>
                    </div>
                </div>
                <div class="cs-grid-2">
                    <div class="cs-field"><label>Clip Name</label><input type="text" data-c="name" value="${esc(clip.name || '')}"></div>
                    <div class="cs-field">
                        <label>Element Type</label>
                        <select data-c="elementType">
                            ${engine.CLIP_ELEMENT_TYPES.map(et => `<option value="${et}" ${t === et ? 'selected' : ''}>${et[0].toUpperCase() + et.slice(1)}</option>`).join('')}
                        </select>
                    </div>
                </div>
                <div class="cs-field">
                    <label>Dynamic Auto-Reflow Behavior</label>
                    <select data-c="pushCredits">
                        <option value="auto" ${clip.pushCredits === 'auto' ? 'selected' : ''}>Auto — Glide credits away &amp; back to center</option>
                        <option value="none" ${clip.pushCredits === 'none' ? 'selected' : ''}>None — Float over/under without shifting credits</option>
                        <option value="right" ${clip.pushCredits === 'right' ? 'selected' : ''}>Force Credits Right while active</option>
                        <option value="left" ${clip.pushCredits === 'left' ? 'selected' : ''}>Force Credits Left while active</option>
                    </select>
                </div>
            </div>

            <div class="cs-section">
                <div class="cs-section-head">Timing &amp; Block Sync</div>
                <div class="cs-field">
                    <label>Timing Mode</label>
                    <select data-c="timingMode">
                        <option value="timecode" ${clip.timingMode === 'timecode' ? 'selected' : ''}>Absolute Timecode (Seconds)</option>
                        <option value="block" ${clip.timingMode === 'block' ? 'selected' : ''}>Sync to Credit Block (Auto-Adjusts)</option>
                    </select>
                </div>
                ${clip.timingMode === 'block' ? `
                    <div class="cs-field">
                        <label>Anchor Block</label>
                        <select data-c="anchorBlockId">
                            <option value="">-- Select Block --</option>
                            ${(proj.blocks || []).map(b => `<option value="${esc(b.id)}" ${clip.anchorBlockId === b.id ? 'selected' : ''}>${esc(b.title || b.type)}</option>`).join('')}
                        </select>
                    </div>
                    <div class="cs-grid-2">
                        <div class="cs-field"><label>Offset (s)</label><input type="number" step="0.25" data-c-num="anchorOffsetSec" value="${clip.anchorOffsetSec || 0}"></div>
                        <div class="cs-field"><label>Span Blocks</label><input type="number" min="1" max="20" data-c-num="anchorSpanBlocks" value="${clip.anchorSpanBlocks || 1}"></div>
                    </div>
                ` : `
                    <div class="cs-grid-2">
                        <div class="cs-field"><label>Start (s)</label><input type="number" min="0" step="0.25" data-c-num="startSec" value="${clip.startSec || 0}"></div>
                        <div class="cs-field"><label>Duration (s)</label><input type="number" min="0.25" step="0.25" data-c-num="durationSec" value="${clip.durationSec || 10}"></div>
                    </div>
                `}
            </div>

            <div class="cs-section">
                <div class="cs-section-head">
                    <span>Stage Placement</span>
                    <div style="display:flex;gap:3px;">
                        <button type="button" class="cs-btn cs-btn-sm" data-place="left">Left</button>
                        <button type="button" class="cs-btn cs-btn-sm" data-place="right">Right</button>
                        <button type="button" class="cs-btn cs-btn-sm" data-place="full">Full</button>
                    </div>
                </div>
                <div class="cs-grid-2">
                    <div class="cs-field"><label>X (%)</label><input type="number" step="0.5" data-c-num="x" value="${clip.x}"></div>
                    <div class="cs-field"><label>Y (%)</label><input type="number" step="0.5" data-c-num="y" value="${clip.y}"></div>
                    <div class="cs-field"><label>Width (%)</label><input type="number" min="2" step="0.5" data-c-num="width" value="${clip.width}"></div>
                    <div class="cs-field"><label>Height (%)</label><input type="number" min="2" step="0.5" data-c-num="height" value="${clip.height}"></div>
                    <div class="cs-field"><label>Opacity (0-1)</label><input type="number" min="0" max="1" step="0.05" data-c-num="opacity" value="${clip.opacity ?? 1}"></div>
                    <div class="cs-field"><label>Rotation (deg)</label><input type="number" min="-360" max="360" data-c-num="rotation" value="${clip.rotation || 0}"></div>
                </div>
            </div>

            <div class="cs-section">
                <div class="cs-section-head">Element Content</div>
                ${(t === 'image' || t === 'video') ? `
                    <div class="cs-field">
                        <label>${t === 'video' ? 'Video Asset' : 'Image Asset'}</label>
                        <div style="display:flex;gap:6px;">
                            <input type="text" data-c="mediaUrl" value="${esc(clip.mediaUrl || '')}" placeholder="/custom-overlay-assets/...">
                            <button type="button" class="cs-btn cs-btn-sm" id="cs-pick-clip-asset">Library</button>
                        </div>
                    </div>
                    <div class="cs-grid-2">
                        <div class="cs-field">
                            <label>Fit Mode</label>
                            <select data-c="mediaFit">
                                <option value="cover" ${clip.mediaFit === 'cover' ? 'selected' : ''}>Cover (Crop)</option>
                                <option value="contain" ${clip.mediaFit === 'contain' ? 'selected' : ''}>Contain</option>
                                <option value="contain-blur" ${clip.mediaFit === 'contain-blur' ? 'selected' : ''}>Contain + Blurred Fill</option>
                                <option value="fill" ${clip.mediaFit === 'fill' ? 'selected' : ''}>Stretch</option>
                            </select>
                        </div>
                        <div class="cs-field"><label>Caption</label><input type="text" data-c="caption" value="${esc(clip.caption || '')}"></div>
                    </div>
                    ${t === 'video' ? `
                        <div class="cs-grid-2">
                            <div class="cs-field"><label>Start Offset (s)</label><input type="number" min="0" step="0.5" data-c-num="videoStartSec" value="${clip.videoStartSec || 0}"></div>
                            <div class="cs-field"><label>Playback Rate</label><input type="number" min="0.25" max="4" step="0.25" data-c-num="videoRate" value="${clip.videoRate || 1}"></div>
                        </div>
                        <div class="cs-grid-2">
                            <label class="cs-check-row"><input type="checkbox" data-c-chk="videoLoop" ${clip.videoLoop !== false ? 'checked' : ''}> Loop video</label>
                            <label class="cs-check-row"><input type="checkbox" data-c-chk="videoMuted" ${clip.videoMuted !== false ? 'checked' : ''}> Muted</label>
                        </div>
                    ` : ''}
                ` : ''}
                ${t === 'slideshow' ? `
                    <div class="cs-field">
                        <label>Slide Interval (s)</label>
                        <input type="number" min="1" max="60" data-c-num="slideshowIntervalSec" value="${clip.slideshowIntervalSec || 4}">
                    </div>
                    <div class="cs-inline-list" style="margin-bottom:6px;">
                        ${(clip.slideshowImages || []).map((url, idx) => `
                            <div class="cs-inline-row">
                                <img src="${esc(url)}" alt="" style="width:24px;height:18px;object-fit:cover;border-radius:3px;flex-shrink:0;">
                                <span style="flex:1;min-width:0;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(String(url).split('/').pop() || url)}</span>
                                <button type="button" class="cs-mini-icon-btn danger" data-slide-del="${idx}" title="Remove image">&times;</button>
                            </div>
                        `).join('')}
                    </div>
                    <button type="button" class="cs-btn cs-btn-sm cs-btn-primary" id="cs-add-slide-img">+ Add Image to Slideshow (${(clip.slideshowImages || []).length})</button>
                ` : ''}
                ${(t === 'text' || t === 'shape') ? `
                    <div class="cs-field"><label>Heading / Text</label><textarea data-c="text">${esc(clip.text || '')}</textarea></div>
                    ${t === 'shape' ? `<div class="cs-field"><label>Subtext</label><textarea data-c="subtext">${esc(clip.subtext || '')}</textarea></div>` : ''}
                    <div class="cs-grid-2">
                        <div class="cs-field"><label>Font</label><select data-c="fontFamily">${fontOptionsHtml(clip.fontFamily, true)}</select></div>
                        <div class="cs-field"><label>Size (px)</label><input type="number" min="10" max="240" data-c-num="fontSize" value="${clip.fontSize || 34}"></div>
                    </div>
                ` : ''}
                ${(t === 'icon' || t === 'shape' || t === 'badge') ? `
                    <div class="cs-field">
                        <label>Icon</label>
                        <div style="display:flex;gap:6px;">
                            <input type="text" data-c="${t === 'badge' ? 'badgeIcon' : 'iconClass'}" value="${esc(t === 'badge' ? clip.badgeIcon : clip.iconClass)}">
                            <button type="button" class="cs-btn cs-btn-sm" id="cs-pick-clip-icon">Pick</button>
                        </div>
                    </div>
                ` : ''}
                ${t === 'badge' ? `<div class="cs-field"><label>Badge Label</label><input type="text" data-c="badgeLabel" value="${esc(clip.badgeLabel || '')}"></div>` : ''}
                ${(t === 'counter' || t === 'meter') ? `
                    <div class="cs-grid-2">
                        <div class="cs-field"><label>Label</label><input type="text" data-c="counterLabel" value="${esc(clip.counterLabel || '')}"></div>
                        <div class="cs-field"><label>Value (or {{var}})</label><input type="text" data-c="counterValue" value="${esc(clip.counterValue || '')}"></div>
                    </div>
                    ${t === 'meter' ? `<div class="cs-field"><label>Max Value</label><input type="number" min="1" data-c-num="counterMax" value="${clip.counterMax || 100}"></div>` : ''}
                ` : ''}
                ${t === 'pattern' ? `
                    <div class="cs-field"><label>Base Fill Color</label><input type="color" data-c-color="fillColor" value="${toColorHex6(clip.fillColor, '#07080c')}"></div>
                    ${renderPatternControlsHtml(clip, { attrStr: 'data-c', attrNum: 'data-c-num', attrColor: 'data-c-color', prefix: '', showOpacity: false })}
                ` : ''}
            </div>

            <div class="cs-section">
                <div class="cs-section-head">
                    <span>Enter / Exit FX &amp; Motion</span>
                    <button type="button" class="cs-btn cs-btn-sm" id="cs-preview-clip-fx" title="Play from clip entrance">Preview FX</button>
                </div>
                <div class="cs-grid-2">
                    <div class="cs-field"><label>Enter FX</label><select data-c="enterAnim">${engine.TRANSITION_TYPES.map(tr => `<option value="${tr}" ${clip.enterAnim === tr ? 'selected' : ''}>${tr}</option>`).join('')}</select></div>
                    <div class="cs-field"><label>Enter (s)</label><input type="number" min="0" max="10" step="0.1" data-c-num="enterSec" value="${clip.enterSec ?? 0.75}"></div>
                    <div class="cs-field"><label>Exit FX</label><select data-c="exitAnim">${engine.TRANSITION_TYPES.map(tr => `<option value="${tr}" ${clip.exitAnim === tr ? 'selected' : ''}>${tr}</option>`).join('')}</select></div>
                    <div class="cs-field"><label>Exit (s)</label><input type="number" min="0" max="10" step="0.1" data-c-num="exitSec" value="${clip.exitSec ?? 0.75}"></div>
                </div>
                <div class="cs-field">
                    <label>Ken Burns Motion</label>
                    <select data-c="kenBurns">
                        ${engine.KEN_BURNS_TYPES.map(kb => `<option value="${kb}" ${clip.kenBurns === kb ? 'selected' : ''}>${kb}</option>`).join('')}
                    </select>
                </div>
            </div>

            <details class="cs-acc">
                <summary>Borders &amp; Color Filters</summary>
                <div class="cs-acc-body">
                <div class="cs-grid-3">
                    <div class="cs-field">
                        <label>Border Style</label>
                        <select data-c="borderStyle">
                            <option value="none" ${(!clip.borderStyle || clip.borderStyle === 'none') ? 'selected' : ''}>None</option>
                            ${getBorderStyles().map(bs => `<option value="${bs}" ${clip.borderStyle === bs ? 'selected' : ''}>${bs}</option>`).join('')}
                        </select>
                    </div>
                    <div class="cs-field"><label>Width</label><input type="number" min="0" max="40" data-c-num="borderWidth" value="${clip.borderWidth || 0}"></div>
                    <div class="cs-field"><label>Radius</label><input type="number" min="0" max="500" data-c-num="borderRadius" value="${clip.borderRadius ?? 14}"></div>
                </div>
                <div class="cs-grid-2">
                    <div class="cs-field">
                        <label>Border Anim</label>
                        <select data-c="borderAnim">
                            ${getBorderAnims().map(ba => `<option value="${ba}" ${clip.borderAnim === ba ? 'selected' : ''}>${ba}</option>`).join('')}
                        </select>
                    </div>
                    <div class="cs-field">
                        <label>Border Color</label>
                        <input type="color" data-c-color="borderColor" value="${toColorHex6(clip.borderColor, '#e5c07b')}">
                    </div>
                </div>
                <div class="cs-grid-3">
                    <div class="cs-field"><label>Bright %</label><input type="number" min="0" max="200" data-c-num="filterBrightness" value="${clip.filterBrightness ?? 100}"></div>
                    <div class="cs-field"><label>Contrast %</label><input type="number" min="0" max="200" data-c-num="filterContrast" value="${clip.filterContrast ?? 100}"></div>
                    <div class="cs-field"><label>Blur px</label><input type="number" min="0" max="40" data-c-num="filterBlur" value="${clip.filterBlur ?? 0}"></div>
                </div>
                <label class="cs-check-row"><input type="checkbox" data-c-chk="shadow" ${clip.shadow ? 'checked' : ''}> Drop Shadow</label>
                </div>
            </details>
        `;

        const updateClip = (fn, opts = {}) => state.mutateProject(p => {
            const tr = p.tracks.find(x => x.id === track.id);
            const c = tr?.clips.find(x => x.id === clip.id);
            if (c) fn(c);
        }, opts);

        bodyEl.querySelector('#cs-insp-dup-clip')?.addEventListener('click', () => {
            state.mutateProject(p => {
                const tr = p.tracks.find(x => x.id === track.id);
                const idx = tr?.clips.findIndex(x => x.id === clip.id) ?? -1;
                if (tr && idx >= 0) {
                    const copy = JSON.parse(JSON.stringify(tr.clips[idx]));
                    copy.id = `clip-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
                    copy.name = `${copy.name} (Copy)`;
                    tr.clips.splice(idx + 1, 0, copy);
                }
            }, { reason: 'project-structure' });
        });
        bodyEl.querySelector('#cs-insp-del-clip')?.addEventListener('click', () => {
            state.mutateProject(p => {
                const tr = p.tracks.find(x => x.id === track.id);
                if (tr) tr.clips = tr.clips.filter(x => x.id !== clip.id);
            }, { reason: 'project-structure' });
            state.setSelection(null, null);
        });

        bodyEl.querySelectorAll('[data-c]').forEach(el => {
            const isSel = el.tagName === 'SELECT';
            el.addEventListener(isSel ? 'change' : 'input', () => updateClip(
                c => { c[el.dataset.c] = el.value; },
                isSel ? { reason: 'project-structure' } : { undoGroup: `c:${clip.id}:${el.dataset.c}` }
            ));
        });
        bodyEl.querySelectorAll('[data-c-num]').forEach(el => {
            el.addEventListener('change', () => {
                const parsed = Number(el.value);
                if (el.value === '' || !Number.isFinite(parsed)) return;
                updateClip(c => { c[el.dataset.cNum] = parsed; });
            });
        });
        bodyEl.querySelectorAll('[data-c-chk]').forEach(el => {
            el.addEventListener('change', () => updateClip(c => { c[el.dataset.cChk] = el.checked; }));
        });
        bodyEl.querySelectorAll('[data-c-color]').forEach(el => {
            el.addEventListener('input', () => updateClip(c => { c[el.dataset.cColor] = `${el.value.toUpperCase()}FF`; }, { undoGroup: `cc:${clip.id}:${el.dataset.cColor}` }));
        });

        bodyEl.querySelectorAll('[data-place]').forEach(btn => {
            btn.addEventListener('click', () => {
                const mode = btn.dataset.place;
                updateClip(c => {
                    if (mode === 'left') { c.x = 4; c.y = 14; c.width = 42; c.height = 72; c.pushCredits = 'auto'; }
                    else if (mode === 'right') { c.x = 54; c.y = 14; c.width = 42; c.height = 72; c.pushCredits = 'auto'; }
                    else if (mode === 'full') { c.x = 0; c.y = 0; c.width = 100; c.height = 100; c.pushCredits = 'none'; }
                }, { reason: 'project-structure' });
            });
        });

        bodyEl.querySelector('#cs-preview-clip-fx')?.addEventListener('click', () => {
            const rc = (state.store.solved?.resolvedClips || []).find(item => item.clip.id === clip.id);
            const startT = Math.max(0, (rc ? rc.startSec : (clip.startSec || 0)) - 0.15);
            stage?.seek(startT);
            stage?.play();
        });
        bodyEl.querySelector('#cs-pick-clip-asset')?.addEventListener('click', () => {
            openAssetPickerModal(state, { value: clip.mediaUrl || '', kind: t === 'video' ? 'video' : 'image', onPick: url => updateClip(c => { c.mediaUrl = url; }, { reason: 'project-structure' }) });
        });
        bodyEl.querySelector('#cs-add-slide-img')?.addEventListener('click', () => {
            openAssetPickerModal(state, { kind: 'image', onPick: url => updateClip(c => { c.slideshowImages = [...(c.slideshowImages || []), url]; }, { reason: 'project-structure' }) });
        });
        bodyEl.querySelectorAll('[data-slide-del]').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = Number(btn.dataset.slideDel);
                updateClip(c => {
                    c.slideshowImages = (c.slideshowImages || []).filter((_, i) => i !== idx);
                }, { reason: 'project-structure' });
            });
        });
        bodyEl.querySelector('#cs-pick-clip-icon')?.addEventListener('click', () => {
            const key = t === 'badge' ? 'badgeIcon' : 'iconClass';
            window.IconPicker?.open({ value: clip[key] || '', onPick: cls => updateClip(c => { c[key] = cls; }, { reason: 'project-structure' }) });
        });
    }

    function renderThemeInspector() {
        const engine = window.StreamPulseCreditSuiteEngine;
        const proj = state.store.project;
        const th = proj.theme;
        const bg = proj.background;
        const tm = proj.timing;
        const cv = proj.canvas;
        const ar = th.autoReflow || {};

        bodyEl.innerHTML = `
            <div class="cs-section">
                <div class="cs-section-head">Project Info</div>
                <div class="cs-field"><label>Project Name</label><input type="text" id="cs-proj-name" value="${esc(proj.name)}"></div>
            </div>

            <div class="cs-section">
                <div class="cs-section-head">Canvas &amp; Edge Fade</div>
                <div class="cs-grid-2">
                    <div class="cs-field">
                        <label>Aspect / Size Preset</label>
                        <select id="cs-cv-preset">
                            ${engine.CANVAS_PRESETS.map(p => `<option value="${p.id}" ${cv.preset === p.id ? 'selected' : ''}>${esc(p.label)}</option>`).join('')}
                        </select>
                    </div>
                    <div class="cs-field">
                        <label>Frame Rate</label>
                        <select data-p-num="canvas.fps">
                            ${[24, 30, 60].map(f => `<option value="${f}" ${Number(cv.fps) === f ? 'selected' : ''}>${f} fps</option>`).join('')}
                        </select>
                    </div>
                </div>
                <div class="cs-grid-2">
                    <div class="cs-field"><label>Width (px)</label><input type="number" min="320" max="7680" data-p-num="canvas.width" value="${cv.width}"></div>
                    <div class="cs-field"><label>Height (px)</label><input type="number" min="240" max="4320" data-p-num="canvas.height" value="${cv.height}"></div>
                    <div class="cs-field"><label>Top Edge Fade (%)</label><input type="number" min="0" max="35" data-p-num="canvas.edgeFadeTop" value="${cv.edgeFadeTop ?? 10}"></div>
                    <div class="cs-field"><label>Bottom Fade (%)</label><input type="number" min="0" max="35" data-p-num="canvas.edgeFadeBottom" value="${cv.edgeFadeBottom ?? 10}"></div>
                </div>
            </div>

            <div class="cs-section">
                <div class="cs-section-head">Timing &amp; Dynamic Auto-Reflow</div>
                <div class="cs-grid-2">
                    <div class="cs-field">
                        <label>Timing Mode</label>
                        <select data-p="timing.mode">
                            <option value="speed" ${tm.mode === 'speed' ? 'selected' : ''}>Constant Speed (px/s)</option>
                            <option value="duration" ${tm.mode === 'duration' ? 'selected' : ''}>Exact Target Duration</option>
                        </select>
                    </div>
                    ${tm.mode === 'duration'
                        ? `<div class="cs-field"><label>Target Duration (s)</label><input type="number" min="5" max="3600" data-p-num="timing.targetDurationSec" value="${tm.targetDurationSec || 45}"></div>`
                        : `<div class="cs-field"><label>Scroll Speed (px/s)</label><input type="number" min="15" max="600" data-p-num="timing.speedPxPerSec" value="${tm.speedPxPerSec || 95}"></div>`
                    }
                </div>
                <div class="cs-grid-2">
                    <div class="cs-field"><label>End Behavior</label>
                        <select data-p="timing.endBehavior">
                            <option value="hold" ${tm.endBehavior === 'hold' ? 'selected' : ''}>Hold Final Frame</option>
                            <option value="clear" ${tm.endBehavior === 'clear' ? 'selected' : ''}>Clear Transparent</option>
                            <option value="loop" ${tm.endBehavior === 'loop' ? 'selected' : ''}>Loop Seamlessly</option>
                        </select>
                    </div>
                    <div class="cs-field"><label>Reflow Style</label>
                        <select data-p="theme.autoReflow.mode">
                            <option value="per-section" ${ar.mode !== 'glide' ? 'selected' : ''}>Per-Section Auto-Center</option>
                            <option value="glide" ${ar.mode === 'glide' ? 'selected' : ''}>Smooth Column Glide</option>
                        </select>
                    </div>
                </div>
                <label class="cs-check-row"><input type="checkbox" data-p-chk="theme.autoReflow.enabled" ${ar.enabled !== false ? 'checked' : ''}> Auto-place sections aside for Side Media</label>
                <div class="cs-grid-2">
                    <div class="cs-field"><label>Split Width (%)</label><input type="number" min="35" max="65" data-p-num="theme.autoReflow.splitRatio" value="${ar.splitRatio ?? 52}"></div>
                    ${ar.mode === 'glide'
                        ? `<div class="cs-field"><label>Glide Ease (s)</label><input type="number" min="0.15" max="3" step="0.05" data-p-num="theme.autoReflow.transitionSec" value="${ar.transitionSec ?? 0.85}"></div>`
                        : `<div class="cs-field"><label>Split Gap (px)</label><input type="number" min="16" max="200" data-p-num="theme.autoReflow.gapPx" value="${ar.gapPx ?? 48}"></div>`
                    }
                </div>
            </div>

            <div class="cs-section">
                <div class="cs-section-head">
                    <span>Cinema Themes</span>
                    <div style="display:flex;gap:4px;">
                        <button type="button" class="cs-btn cs-btn-sm cs-btn-primary" id="cs-save-theme-btn" title="Save current typography, colors & background as a theme">+ Save Current</button>
                        <button type="button" class="cs-btn cs-btn-sm" id="cs-reset-themes-btn" title="Restore built-in starter themes">Defaults</button>
                    </div>
                </div>
                <div class="cs-theme-grid">
                    ${(state.store.themes || []).map(t => `
                        <div class="cs-theme-card ${th.preset === t.id ? 'active' : ''}" data-apply-theme="${esc(t.id)}" role="button" tabindex="0">
                            <div style="display:flex;align-items:center;justify-content:space-between;gap:4px;">
                                <div class="cs-theme-swatches">
                                    <span style="background:${esc(t.background?.color1 || '#07080c')};"></span>
                                    <span style="background:${esc(t.accentColor || '#e5c07b')};"></span>
                                    <span style="background:${esc(t.textColor || '#f3f4f6')};"></span>
                                </div>
                                <div class="cs-theme-card-acts">
                                    <button type="button" class="cs-mini-icon-btn" data-theme-update="${esc(t.id)}" title="Overwrite theme with current style">
                                        <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/></svg>
                                    </button>
                                    <button type="button" class="cs-mini-icon-btn" data-theme-rename="${esc(t.id)}" title="Rename theme">
                                        <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                                    </button>
                                    <button type="button" class="cs-mini-icon-btn danger" data-theme-delete="${esc(t.id)}" title="Delete theme">
                                        <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
                                    </button>
                                </div>
                            </div>
                            <div style="font-size:11px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(t.name)}</div>
                        </div>
                    `).join('')}
                </div>
            </div>

            <div class="cs-section">
                <div class="cs-section-head">Background</div>
                <div class="cs-field">
                    <label>Background Type</label>
                    <select data-p="background.type">
                        <option value="solid" ${bg.type === 'solid' ? 'selected' : ''}>Solid Color</option>
                        <option value="gradient" ${bg.type === 'gradient' ? 'selected' : ''}>Gradient</option>
                        <option value="transparent" ${bg.type === 'transparent' ? 'selected' : ''}>Transparent (Alpha)</option>
                        <option value="pattern" ${bg.type === 'pattern' ? 'selected' : ''}>Animated Pattern</option>
                        <option value="image" ${bg.type === 'image' ? 'selected' : ''}>Background Image</option>
                        <option value="video" ${bg.type === 'video' ? 'selected' : ''}>Background Video</option>
                        <option value="chroma" ${bg.type === 'chroma' ? 'selected' : ''}>Chroma Key</option>
                    </select>
                </div>
                ${(bg.type === 'solid' || bg.type === 'gradient' || bg.type === 'pattern') ? `
                    <div class="cs-grid-2">
                        <div class="cs-field"><label>${bg.type === 'pattern' ? 'Backdrop Color' : 'Primary Color'}</label><input type="color" data-p-color="background.color1" value="${toColorHex6(bg.color1, '#07080c')}"></div>
                        ${bg.type === 'gradient' ? `<div class="cs-field"><label>Secondary Color</label><input type="color" data-p-color="background.color2" value="${toColorHex6(bg.color2, '#131826')}"></div>` : ''}
                    </div>
                ` : ''}
                ${bg.type === 'gradient' ? `<div class="cs-field"><label>Gradient Angle (deg)</label><input type="number" min="0" max="360" step="15" data-p-num="background.angle" value="${bg.angle ?? 180}"></div>` : ''}
                ${bg.type === 'pattern' ? renderPatternControlsHtml(bg, { attrStr: 'data-p', attrNum: 'data-p-num', attrColor: 'data-p-color', prefix: 'background.', showOpacity: true }) : ''}
                ${(bg.type === 'image' || bg.type === 'video') ? `
                    <div class="cs-field">
                        <label>Media Asset</label>
                        <div style="display:flex;gap:6px;">
                            <input type="text" data-p="background.mediaUrl" value="${esc(bg.mediaUrl || '')}">
                            <button type="button" class="cs-btn cs-btn-sm" id="cs-pick-bg-asset">Library</button>
                        </div>
                    </div>
                    <div class="cs-field">
                        <label>Fit Mode</label>
                        <select data-p="background.mediaFit">
                            <option value="cover" ${bg.mediaFit === 'cover' ? 'selected' : ''}>Cover (Fill)</option>
                            <option value="contain" ${bg.mediaFit === 'contain' ? 'selected' : ''}>Contain (Fit)</option>
                            <option value="contain-blur" ${bg.mediaFit === 'contain-blur' ? 'selected' : ''}>Contain + Blurred Fill</option>
                        </select>
                    </div>
                    <div class="cs-grid-2">
                        <div class="cs-field"><label>Opacity</label><input type="number" min="0" max="1" step="0.05" data-p-num="background.mediaOpacity" value="${bg.mediaOpacity ?? 0.45}"></div>
                        <div class="cs-field"><label>Blur (px)</label><input type="number" min="0" max="40" data-p-num="background.mediaBlur" value="${bg.mediaBlur ?? 0}"></div>
                    </div>
                ` : ''}
                ${bg.type === 'chroma' ? `<div class="cs-field"><label>Chroma Color</label><input type="color" data-p-color="background.chromaColor" value="${toColorHex6(bg.chromaColor, '#00ff00')}"></div>` : ''}
            </div>

            <div class="cs-section">
                <div class="cs-section-head">Global Typography &amp; Colors</div>
                <div class="cs-grid-2">
                    <div class="cs-field"><label>Heading Font</label><select data-p="theme.headingFont">${fontOptionsHtml(th.headingFont)}</select></div>
                    <div class="cs-field"><label>Content Font</label><select data-p="theme.contentFont">${fontOptionsHtml(th.contentFont)}</select></div>
                    <div class="cs-field"><label>Heading Size</label><input type="number" min="12" max="160" data-p-num="theme.headingSize" value="${th.headingSize}"></div>
                    <div class="cs-field"><label>Content Size</label><input type="number" min="10" max="120" data-p-num="theme.contentSize" value="${th.contentSize}"></div>
                    <div class="cs-field"><label>Section Gap</label><input type="number" min="0" max="300" data-p-num="theme.sectionSpacing" value="${th.sectionSpacing}"></div>
                    <div class="cs-field"><label>Line Height</label><input type="number" min="1" max="3.2" step="0.05" data-p-num="theme.lineHeight" value="${th.lineHeight}"></div>
                </div>
                <div class="cs-grid-3">
                    <div class="cs-field"><label>Text</label><input type="color" data-p-color="theme.textColor" value="${toColorHex6(th.textColor, '#f3f4f6')}"></div>
                    <div class="cs-field"><label>Accent</label><input type="color" data-p-color="theme.accentColor" value="${toColorHex6(th.accentColor, '#e5c07b')}"></div>
                    <div class="cs-field"><label>Subtitle</label><input type="color" data-p-color="theme.subtitleColor" value="${toColorHex6(th.subtitleColor, '#9ca3af')}"></div>
                </div>
            </div>
        `;

        const setNested = (obj, dotPath, value) => {
            const parts = dotPath.split('.');
            let cur = obj;
            for (let i = 0; i < parts.length - 1; i++) {
                cur[parts[i]] = cur[parts[i]] || {};
                cur = cur[parts[i]];
            }
            cur[parts[parts.length - 1]] = value;
        };

        bodyEl.querySelector('#cs-proj-name')?.addEventListener('input', ev => {
            state.mutateProject(p => { p.name = ev.target.value; }, { undoGroup: 'proj:name' });
        });
        bodyEl.querySelector('#cs-cv-preset')?.addEventListener('change', ev => {
            const found = engine.CANVAS_PRESETS.find(c => c.id === ev.target.value);
            state.mutateProject(p => {
                p.canvas.preset = ev.target.value;
                if (found && found.id !== 'custom') {
                    p.canvas.width = found.width;
                    p.canvas.height = found.height;
                }
            }, { reason: 'project-structure' });
        });
        bodyEl.querySelectorAll('[data-p]').forEach(el => {
            const isSel = el.tagName === 'SELECT';
            el.addEventListener(isSel ? 'change' : 'input', () => {
                state.mutateProject(
                    p => setNested(p, el.dataset.p, el.value),
                    isSel ? { reason: 'project-structure' } : { undoGroup: `p:${el.dataset.p}` }
                );
            });
        });
        bodyEl.querySelectorAll('[data-p-num]').forEach(el => {
            el.addEventListener('change', () => {
                const parsed = Number(el.value);
                if (el.value === '' || !Number.isFinite(parsed)) return;
                const min = el.min !== '' ? Number(el.min) : -Infinity;
                const max = el.max !== '' ? Number(el.max) : Infinity;
                const clamped = Math.max(min, Math.min(max, parsed));
                el.value = String(clamped);
                state.mutateProject(p => setNested(p, el.dataset.pNum, clamped));
            });
        });
        bodyEl.querySelectorAll('[data-p-chk]').forEach(el => {
            el.addEventListener('change', () => {
                state.mutateProject(p => setNested(p, el.dataset.pChk, el.checked));
            });
        });
        bodyEl.querySelectorAll('[data-p-color]').forEach(el => {
            el.addEventListener('input', () => {
                state.mutateProject(p => setNested(p, el.dataset.pColor, `${el.value.toUpperCase()}FF`), { undoGroup: `pc:${el.dataset.pColor}` });
            });
        });
        const snapshotCurrentTheme = name => ({
            name,
            headingFont: th.headingFont,
            contentFont: th.contentFont,
            headingSize: th.headingSize,
            contentSize: th.contentSize,
            headingWeight: th.headingWeight,
            contentWeight: th.contentWeight,
            headingStyle: th.headingStyle,
            contentStyle: th.contentStyle,
            headingTransform: th.headingTransform,
            headingLetterSpacing: th.headingLetterSpacing,
            lineHeight: th.lineHeight,
            sectionSpacing: th.sectionSpacing,
            textColor: th.textColor,
            accentColor: th.accentColor,
            subtitleColor: th.subtitleColor,
            dividerColor: th.dividerColor,
            background: {
                ...bg
            }
        });

        bodyEl.querySelector('#cs-save-theme-btn')?.addEventListener('click', async () => {
            const name = window.prompt('Save current look as theme name:', `${proj.name} Theme`);
            if (!name || !name.trim()) return;
            try {
                const created = await state.saveTheme(snapshotCurrentTheme(name.trim()), { createNew: true });
                state.mutateProject(p => { p.theme.preset = created.id; }, { reason: 'project-structure' });
            } catch (err) { window.alert(err.message); }
        });

        bodyEl.querySelector('#cs-reset-themes-btn')?.addEventListener('click', async () => {
            if (!window.confirm('Restore all built-in starter themes to their default colors and typography? (Your custom themes will be kept.)')) return;
            try { await state.resetThemes(); } catch (err) { window.alert(err.message); }
        });

        bodyEl.querySelectorAll('[data-theme-update]').forEach(btn => {
            btn.addEventListener('click', async ev => {
                ev.stopPropagation();
                const tid = btn.dataset.themeUpdate;
                const existing = (state.store.themes || []).find(t => t.id === tid);
                if (!existing) return;
                if (!window.confirm(`Overwrite theme "${existing.name}" with your current typography, colors & background?`)) return;
                try {
                    await state.updateTheme(tid, snapshotCurrentTheme(existing.name));
                    state.mutateProject(p => { p.theme.preset = tid; }, { reason: 'project-structure' });
                } catch (err) { window.alert(err.message); }
            });
        });

        bodyEl.querySelectorAll('[data-theme-rename]').forEach(btn => {
            btn.addEventListener('click', async ev => {
                ev.stopPropagation();
                const tid = btn.dataset.themeRename;
                const existing = (state.store.themes || []).find(t => t.id === tid);
                if (!existing) return;
                const nextName = window.prompt('Rename theme:', existing.name);
                if (!nextName || !nextName.trim()) return;
                try { await state.updateTheme(tid, { ...existing, name: nextName.trim() }); } catch (err) { window.alert(err.message); }
            });
        });

        bodyEl.querySelectorAll('[data-theme-delete]').forEach(btn => {
            btn.addEventListener('click', async ev => {
                ev.stopPropagation();
                const tid = btn.dataset.themeDelete;
                const existing = (state.store.themes || []).find(t => t.id === tid);
                if (!existing) return;
                if (!window.confirm(`Delete theme "${existing.name}"?`)) return;
                try { await state.deleteTheme(tid); } catch (err) { window.alert(err.message); }
            });
        });

        bodyEl.querySelectorAll('[data-apply-theme]').forEach(btn => {
            const applyThisTheme = () => {
                const preset = (state.store.themes || []).find(t => t.id === btn.dataset.applyTheme)
                    || engine.STARTER_THEMES[btn.dataset.applyTheme];
                if (!preset) return;
                state.mutateProject(p => {
                    Object.assign(p.theme, {
                        preset: preset.id,
                        headingFont: preset.headingFont,
                        contentFont: preset.contentFont,
                        headingSize: preset.headingSize,
                        contentSize: preset.contentSize,
                        headingWeight: preset.headingWeight,
                        contentWeight: preset.contentWeight,
                        headingStyle: preset.headingStyle,
                        contentStyle: preset.contentStyle,
                        headingTransform: preset.headingTransform,
                        headingLetterSpacing: preset.headingLetterSpacing,
                        lineHeight: preset.lineHeight,
                        sectionSpacing: preset.sectionSpacing,
                        textColor: preset.textColor,
                        accentColor: preset.accentColor,
                        subtitleColor: preset.subtitleColor,
                        dividerColor: preset.dividerColor
                    });
                    if (preset.background && ['solid', 'gradient', 'transparent', 'pattern', 'chroma'].includes(preset.background.type)) {
                        Object.assign(p.background, preset.background);
                    }
                }, { reason: 'project-structure' });
            };
            btn.addEventListener('click', applyThisTheme);
            btn.addEventListener('keydown', ev => {
                if (ev.key === 'Enter' || ev.key === ' ') {
                    ev.preventDefault();
                    applyThisTheme();
                }
            });
        });
        bodyEl.querySelector('#cs-pick-bg-asset')?.addEventListener('click', () => {
            openAssetPickerModal(state, { value: bg.mediaUrl || '', kind: bg.type === 'video' ? 'video' : 'image', onPick: url => state.mutateProject(p => { p.background.mediaUrl = url; }, { reason: 'project-structure' }) });
        });
    }

    function renderExportJobMarkup(job) {
        if (!job) return '';
        const isBusy = job.status === 'queued' || job.status === 'running';
        return `
            <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:7px;padding:9px;display:flex;flex-direction:column;gap:6px;">
                <div style="display:flex;justify-content:space-between;font-size:11px;font-weight:700;">
                    <span>${esc(job.phase || job.status)}</span>
                    <span>${job.percent || 0}%</span>
                </div>
                <div class="cs-progress-bar"><div class="cs-progress-fill" style="width:${job.percent || 0}%;"></div></div>
                ${job.error ? `<div style="font-size:11px;color:#f87171;">${esc(job.error)}</div>` : ''}
                <div style="display:flex;gap:6px;justify-content:flex-end;">
                    ${isBusy ? '<button type="button" class="cs-btn cs-btn-sm cs-btn-danger" id="cs-cancel-export">Cancel</button>' : ''}
                    ${job.status === 'done' && job.downloadUrl ? `<a class="cs-btn cs-btn-sm cs-btn-primary" href="${esc(job.downloadUrl)}" style="text-decoration:none;">Download ${esc(job.fileName)}</a>` : ''}
                </div>
            </div>
        `;
    }

    function updateExportProgressDom() {
        const slot = bodyEl?.querySelector('#cs-export-job-slot');
        if (!slot) return false;
        const job = state.store.activeExportJob;
        const isBusy = Boolean(job && (job.status === 'queued' || job.status === 'running'));
        slot.innerHTML = renderExportJobMarkup(job);
        slot.querySelector('#cs-cancel-export')?.addEventListener('click', () => state.cancelExport());
        const startBtn = bodyEl.querySelector('#cs-start-export');
        if (startBtn) startBtn.disabled = isBusy;
        return true;
    }

    function renderExportInspector() {
        const proj = state.store.project;
        const caps = state.store.capabilities;
        const hasFfmpeg = Boolean(caps?.ffmpeg?.available);
        const job = state.store.activeExportJob;
        const isBusy = Boolean(job && (job.status === 'queued' || job.status === 'running'));
        const expOpts = state.store.exportOptions || {};
        const selFormat = expOpts.format || 'mp4';
        const selFps = expOpts.fps === 'project' || !expOpts.fps ? String(proj.canvas.fps || 60) : String(expOpts.fps);
        const selScale = expOpts.scale || '1';
        const selAlpha = expOpts.transparent !== undefined ? Boolean(expOpts.transparent) : (proj.background.type === 'transparent');
        const overlayUrl = `${window.location.origin}/overlays/credit-suite.html?project=${encodeURIComponent(proj.id)}`;

        bodyEl.innerHTML = `
            <div class="cs-section">
                <div class="cs-section-head">Video &amp; Still Render Export</div>
                <div style="font-size:11px;color:var(--text-muted);">
                    ${hasFfmpeg
                        ? `<span style="color:#34d399;font-weight:600;">FFmpeg Ready</span> — Frame-accurate headless render at exact FPS.`
                        : `<span style="color:#fbbf24;font-weight:600;">FFmpeg not detected</span> — PNG/ZIP/SRT exports ready; install FFmpeg for MP4/WebM/ProRes.`
                    }
                </div>
                <div class="cs-field">
                    <label>Export Format</label>
                    <select id="cs-exp-format">
                        <option value="mp4" ${selFormat === 'mp4' ? 'selected' : ''}>MP4 (H.264 — Universal / Opaque BG)</option>
                        <option value="webm-alpha" ${selFormat === 'webm-alpha' ? 'selected' : ''}>WebM (VP9 + True Alpha — OBS &amp; Web)</option>
                        <option value="prores-alpha" ${selFormat === 'prores-alpha' ? 'selected' : ''}>ProRes 4444 (.mov + True Alpha — Resolve/FCP/Premiere)</option>
                        <option value="png-sequence" ${selFormat === 'png-sequence' ? 'selected' : ''}>PNG Frame Sequence (.zip + True Alpha)</option>
                        <option value="full-png" ${selFormat === 'full-png' ? 'selected' : ''}>Full Tall Credits Sheet (.png)</option>
                        <option value="section-pngs" ${selFormat === 'section-pngs' ? 'selected' : ''}>Individual Section PNGs (.zip)</option>
                    </select>
                </div>
                <div class="cs-grid-2">
                    <div class="cs-field"><label>FPS</label><select id="cs-exp-fps"><option value="60" ${selFps === '60' ? 'selected' : ''}>60 fps</option><option value="30" ${selFps === '30' ? 'selected' : ''}>30 fps</option><option value="24" ${selFps === '24' ? 'selected' : ''}>24 fps</option></select></div>
                    <div class="cs-field"><label>Resolution</label><select id="cs-exp-scale"><option value="1" ${selScale === '1' ? 'selected' : ''}>Project (${proj.canvas.width}x${proj.canvas.height})</option><option value="0.5" ${selScale === '0.5' ? 'selected' : ''}>Half Preview (${Math.round(proj.canvas.width / 2)}x${Math.round(proj.canvas.height / 2)})</option></select></div>
                </div>
                <label class="cs-check-row"><input type="checkbox" id="cs-exp-alpha" ${selAlpha ? 'checked' : ''}> Force Transparent Background (Alpha formats)</label>
                <button type="button" class="cs-btn cs-btn-primary" id="cs-start-export" ${isBusy ? 'disabled' : ''}>Start Render Export</button>
                <div id="cs-export-job-slot">${renderExportJobMarkup(job)}</div>
            </div>

            <div class="cs-section">
                <div class="cs-section-head">Quick Text &amp; Subtitles</div>
                <div class="cs-grid-2">
                    <a class="cs-btn" href="/api/credit-suite/projects/${encodeURIComponent(proj.id)}/srt" style="text-decoration:none;">Download .SRT</a>
                    <button type="button" class="cs-btn" id="cs-copy-plain">Copy Plain Text</button>
                </div>
            </div>

            <div class="cs-section">
                <div class="cs-section-head">Dynamic OBS Browser Overlay</div>
                <div class="cs-field">
                    <label>Overlay URL</label>
                    <input type="text" id="cs-obs-url" readonly value="${esc(overlayUrl)}">
                </div>
                <div class="cs-grid-2">
                    <button type="button" class="cs-btn cs-btn-primary" id="cs-copy-obs-url">Copy OBS URL</button>
                    <a class="cs-btn" href="${esc(overlayUrl)}" target="_blank" rel="noopener noreferrer" style="text-decoration:none;">Open Live Tab</a>
                </div>
                <div class="cs-section-head" style="margin-top:6px;">Live OBS Transport (WebSocket / Companion)</div>
                <div class="cs-grid-2">
                    <button type="button" class="cs-btn" data-remote="play">Live Play</button>
                    <button type="button" class="cs-btn" data-remote="pause">Live Pause</button>
                    <button type="button" class="cs-btn" data-remote="restart">Live Restart</button>
                    <button type="button" class="cs-btn" data-remote="stop">Live Stop</button>
                </div>
            </div>
        `;

        const formatEl = bodyEl.querySelector('#cs-exp-format');
        const fpsEl = bodyEl.querySelector('#cs-exp-fps');
        const scaleEl = bodyEl.querySelector('#cs-exp-scale');
        const alphaEl = bodyEl.querySelector('#cs-exp-alpha');
        const persistExp = () => {
            state.store.exportOptions = {
                format: formatEl?.value || 'mp4',
                fps: fpsEl?.value || '60',
                scale: scaleEl?.value || '1',
                transparent: Boolean(alphaEl?.checked)
            };
        };
        formatEl?.addEventListener('change', persistExp);
        fpsEl?.addEventListener('change', persistExp);
        scaleEl?.addEventListener('change', persistExp);
        alphaEl?.addEventListener('change', persistExp);

        bodyEl.querySelector('#cs-start-export')?.addEventListener('click', async () => {
            persistExp();
            const format = formatEl.value;
            const fps = Number(fpsEl.value) || 60;
            const scale = Number(scaleEl.value) || 1;
            const transparent = alphaEl.checked;
            try {
                await state.startExport({
                    format,
                    fps,
                    width: Math.round(proj.canvas.width * scale),
                    height: Math.round(proj.canvas.height * scale),
                    transparent
                });
            } catch (err) {
                window.alert(err.message);
            }
        });
        bodyEl.querySelector('#cs-cancel-export')?.addEventListener('click', () => state.cancelExport());
        bodyEl.querySelector('#cs-copy-plain')?.addEventListener('click', ev => {
            const txt = window.StreamPulseCreditSuiteEngine.generatePlainText(proj);
            copyTextWithFeedback(txt, ev.currentTarget);
        });
        bodyEl.querySelector('#cs-copy-obs-url')?.addEventListener('click', ev => {
            copyTextWithFeedback(overlayUrl, ev.currentTarget);
        });
        bodyEl.querySelectorAll('[data-remote]').forEach(btn => {
            btn.addEventListener('click', () => {
                state.sendRemoteTransport(btn.dataset.remote).catch(err => window.alert(err.message));
            });
        });
    }

    function isEditingTextIn(container) {
        const active = document.activeElement;
        if (!active || !container || !container.contains(active)) return false;
        if (active.tagName === 'TEXTAREA') return true;
        if (active.tagName === 'INPUT') {
            return !['checkbox', 'radio', 'button', 'submit', 'reset'].includes(active.type);
        }
        return Boolean(active.isContentEditable);
    }

    function render() {
        if (!bodyEl || !state.store.project) return;
        const prevScroll = bodyEl.scrollTop;
        const openAccTitles = new Set(
            [...bodyEl.querySelectorAll('details.cs-acc[open] > summary')].map(s => s.textContent.trim())
        );

        if (inlineSortable) {
            inlineSortable.destroy();
            inlineSortable = null;
        }
        const tab = state.store.inspectorTab;
        tabBtns.forEach(b => b.classList.toggle('active', b.dataset.csInspTab === tab));

        if (tab === 'theme') {
            renderThemeInspector();
        } else if (tab === 'export') {
            renderExportInspector();
        } else {
            const selBlock = state.getSelectedBlock();
            const selClip = state.getSelectedClip();
            if (selBlock) renderBlockInspector(selBlock);
            else if (selClip) renderClipInspector(selClip.track, selClip.clip);
            else {
                bodyEl.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:12px;">Select a Credit Block or Floating Clip to edit its properties, or switch to <strong>Theme</strong> / <strong>Export</strong>.</div>';
            }
        }

        if (openAccTitles.size) {
            bodyEl.querySelectorAll('details.cs-acc').forEach(det => {
                const title = det.querySelector('summary')?.textContent?.trim();
                if (title && openAccTitles.has(title)) det.open = true;
            });
        }
        bodyEl.scrollTop = prevScroll;
    }

    state.subscribe(reason => {
        if (reason === 'export') {
            if (state.store.inspectorTab === 'export') {
                if (!updateExportProgressDom()) render();
            }
            return;
        }
        if (['init', 'project-switched', 'project-structure', 'selection', 'inspector-tab', 'themes'].includes(reason)) {
            render();
        } else if (reason === 'project') {
            if (!isEditingTextIn(bodyEl)) {
                render();
            }
        }
    });

    return { render, stage };
}

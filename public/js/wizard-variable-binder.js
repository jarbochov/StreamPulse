/**
 * StreamPulse Shared URL Wizard & Studio Variable Settings Binder
 *
 * Adds first-class Variable Settings support (Font, Color, Number/Counter, Text/Template,
 * plus active-slot Variable Set fields) to all standalone URL Wizards and Studio Theming Builders.
 *
 * Syntax:
 *   var:<key>           (e.g., ?accent=var:brand_color, ?font=var:heading_font, ?scale=var:ui_scale)
 *   var:<key>|<fallback> (e.g., ?accent=var:brand_color|#3b82f6, ?scale=var:ui_scale|1.25)
 *   {{var.<key>}} / {{var.<key>|<fallback>}} (also accepted when typed or pasted)
 *
 * Strict compliance:
 * - Zero raw unicode emojis (crisp inline SVGs only).
 * - Preserves live preview responsiveness by keeping resolved numeric/color values in native
 *   <input type="range">, <input type="number">, and <input type="color"> DOM .value while
 *   storing the variable token in dataset.varToken and applying it to generated URLs.
 */
(function (root) {
    'use strict';

    const VAR_TOKEN_TEST_RE = /(?:^var:[a-z0-9_.]|\{\{\s*var\.[a-z0-9_.])/i;
    const COMPACT_VAR_RE = /^var:([a-z0-9_.]+)(?:\|(.*))?$/i;
    const BRACE_EXACT_VAR_RE = /^\{\{\s*var\.([a-z0-9_.]+)\s*(?:\|([^{}]*?))?\s*\}\}$/i;

    const ICON_VAR_BRACES = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1"/><path d="M16 3h1a2 2 0 0 1 2 2v5a2 2 0 0 0 2 2 2 2 0 0 0-2 2v5a2 2 0 0 1-2 2h-1"/></svg>';
    const ICON_UNBIND_X = '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    const ICON_SEARCH = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>';
    const ICON_EXT_LINK = '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>';

    let cachedPayload = null;
    let loadPromise = null;
    let modalEl = null;
    let activeModalContext = null;
    let variableSettingsEnabled = true;

    function isEnabled() {
        if (cachedPayload && typeof cachedPayload.variableSettingsEnabled === 'boolean') {
            return cachedPayload.variableSettingsEnabled;
        }
        return variableSettingsEnabled;
    }

    function applyEnabledState(enabled) {
        variableSettingsEnabled = enabled !== false;
        if (typeof document !== 'undefined' && document.body) {
            document.body.classList.toggle('sp-var-settings-disabled', !variableSettingsEnabled);
        }
        if (!variableSettingsEnabled) {
            closeModal();
            // Remove injected font variable options from datalists and selects when disabled
            const fontDatalistIds = ['ap-font-list', 'wiz-font-list', 'overlay-fonts-list', 'system-font-list'];
            for (const listId of fontDatalistIds) {
                const dl = typeof document !== 'undefined' ? document.getElementById(listId) : null;
                if (!dl) continue;
                Array.from(dl.querySelectorAll('option[data-sp-var-font="1"]')).forEach(n => n.remove());
            }
            for (const [id, cfg] of controlRegistry.entries()) {
                if (cfg.kind !== 'font') continue;
                const sel = typeof document !== 'undefined' ? document.getElementById(id) : null;
                if (!sel || sel.tagName !== 'SELECT') continue;
                sel.querySelector('optgroup[data-sp-var-font-group="1"]')?.remove();
            }
        }
        refreshAllBoundControlsUI();
    }

    // Registry of mounted configs & control bindings on the current page
    const controlRegistry = new Map(); // controlId -> bindingConfig
    let activeStorageKey = `streampulse:var-bindings:${(root.location?.pathname || 'default').replace(/[^a-z0-9/_-]/gi, '')}`;
    let globalOnChange = null;
    let isApplyingBindings = false;

    function esc(val) {
        return String(val ?? '').replace(/[&<>"']/g, ch => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[ch]));
    }

    function hasToken(raw) {
        if (typeof raw !== 'string' || !raw) return false;
        return VAR_TOKEN_TEST_RE.test(raw.trim());
    }

    function parseToken(raw) {
        if (typeof raw !== 'string' || !raw) return null;
        const trimmed = raw.trim();
        let m = trimmed.match(COMPACT_VAR_RE);
        if (m) {
            return {
                key: m[1].toLowerCase(),
                fallback: m[2] !== undefined ? m[2].trim() : '',
                syntax: 'compact'
            };
        }
        m = trimmed.match(BRACE_EXACT_VAR_RE);
        if (m) {
            return {
                key: m[1].toLowerCase(),
                fallback: m[2] !== undefined ? m[2].trim() : '',
                syntax: 'brace'
            };
        }
        return null;
    }

    function formatToken(key, fallback = '') {
        const cleanKey = String(key || '').trim().replace(/^var[.:]/i, '').toLowerCase();
        if (!cleanKey) return '';
        const fb = fallback !== undefined && fallback !== null ? String(fallback).trim() : '';
        return fb ? `var:${cleanKey}|${fb}` : `var:${cleanKey}`;
    }

    function resolveToken(raw, fallbackOverride = '') {
        if (typeof raw !== 'string' || !hasToken(raw)) return raw;
        if (root.OverlayVariableSettings && typeof root.OverlayVariableSettings.resolve === 'function') {
            const res = root.OverlayVariableSettings.resolve(raw);
            if (res !== undefined && res !== null && res !== '') return res;
        }
        const parsed = parseToken(raw);
        if (!parsed) return raw;
        const map = getValuesMap();
        const k = parsed.key;
        let found = map[k];
        if ((found === undefined || found === '') && k.includes('.')) {
            const shortKey = k.split('.').pop();
            found = map[shortKey];
        }
        if (found !== undefined && found !== null && String(found).trim() !== '') {
            return String(found).trim();
        }
        return parsed.fallback || fallbackOverride || '';
    }

    function getValuesMap() {
        const map = {};
        if (cachedPayload && cachedPayload.values && typeof cachedPayload.values === 'object') {
            Object.entries(cachedPayload.values).forEach(([k, v]) => {
                if (v !== undefined && v !== null) map[String(k).toLowerCase()] = String(v);
            });
        }
        if (cachedPayload && Array.isArray(cachedPayload.variables)) {
            cachedPayload.variables.forEach(v => {
                if (!v || !v.name) return;
                const key = String(v.key || (v.group && !v.setId ? `${v.group}.${v.name}` : v.name)).toLowerCase();
                if (map[key] === undefined && v.value !== undefined && v.value !== null) {
                    map[key] = String(v.value);
                }
                const rawName = String(v.name).toLowerCase();
                if (map[rawName] === undefined && v.value !== undefined && v.value !== null) {
                    map[rawName] = String(v.value);
                }
            });
        }
        if (root.OverlayVariableSettings && typeof root.OverlayVariableSettings.getValues === 'function') {
            try {
                const ovMap = root.OverlayVariableSettings.getValues() || {};
                Object.entries(ovMap).forEach(([k, v]) => {
                    if (map[k.toLowerCase()] === undefined && v !== undefined && v !== null) {
                        map[k.toLowerCase()] = String(v);
                    }
                });
            } catch {}
        }
        return map;
    }

    async function fetchVariables(force = false) {
        if (cachedPayload && !force) return cachedPayload;
        if (loadPromise && !force) return loadPromise;
        if (typeof fetch !== 'function') return { variables: [], sets: [], values: {} };
        loadPromise = fetch('/api/variables', { cache: 'no-store' })
            .then(r => (r.ok ? r.json() : { variables: [], sets: [], values: {} }))
            .then(data => {
                cachedPayload = data || { variables: [], sets: [], values: {} };
                if (typeof cachedPayload.variableSettingsEnabled === 'boolean') {
                    applyEnabledState(cachedPayload.variableSettingsEnabled);
                } else if (typeof fetch === 'function') {
                    // Fallback check against /api/config if testing against a minimal mock server
                    fetch('/api/config', { cache: 'no-store' })
                        .then(r => (r.ok ? r.json() : null))
                        .then(cfg => {
                            if (cfg && typeof cfg.variable_settings_enabled === 'boolean') {
                                cachedPayload.variableSettingsEnabled = cfg.variable_settings_enabled;
                                applyEnabledState(cfg.variable_settings_enabled);
                            }
                        })
                        .catch(() => {});
                }
                if (root.OverlayVariableSettings && typeof root.OverlayVariableSettings.setValues === 'function') {
                    root.OverlayVariableSettings.setValues(cachedPayload);
                }
                populateAllFontControls();
                refreshAllBoundControlsUI();
                return cachedPayload;
            })
            .catch(() => {
                cachedPayload = cachedPayload || { variables: [], sets: [], values: {} };
                return cachedPayload;
            })
            .finally(() => {
                loadPromise = null;
            });
        return loadPromise;
    }

    function getAvailableVariableItems(kind = 'text') {
        const data = cachedPayload || { variables: [], sets: [], values: {} };
        const valuesMap = getValuesMap();
        const rawVars = Array.isArray(data.variables) ? data.variables : [];
        const rawSets = data.variableSetsEnabled === false ? [] : (Array.isArray(data.sets) ? data.sets : []);

        const primaryTypes = new Set(
            kind === 'font' ? ['font']
                : kind === 'color' ? ['color']
                    : kind === 'number' ? ['number', 'counter']
                        : ['text', 'template', 'font', 'color', 'number', 'counter']
        );
        const secondaryTypes = new Set(['text', 'template']);

        const primaryItems = [];
        const setPrimaryItems = [];
        const secondaryItems = [];

        const seenKeys = new Set();

        for (const v of rawVars) {
            if (!v || v.hidden || !v.name) continue;
            const vType = String(v.type || 'text').toLowerCase();
            const key = String(v.key || (v.group && !v.setId ? `${v.group}.${v.name}` : v.name)).toLowerCase();
            if (seenKeys.has(key)) continue;

            const resolvedVal = valuesMap[key] !== undefined ? valuesMap[key] : String(v.value ?? '');
            const displayLabel = v.setId
                ? `${v.setName || v.group || v.setId} / ${v.fieldLabel || v.label || v.name}`
                : (v.group ? `${v.group} / ${v.label || v.name}` : (v.label || v.name));

            const item = {
                key,
                name: v.name,
                label: displayLabel,
                group: v.group || '',
                type: vType,
                isSet: Boolean(v.setId),
                value: resolvedVal
            };

            if (primaryTypes.has(vType)) {
                seenKeys.add(key);
                if (item.isSet) setPrimaryItems.push(item);
                else primaryItems.push(item);
            } else if (kind !== 'text' && secondaryTypes.has(vType)) {
                seenKeys.add(key);
                secondaryItems.push(item);
            }
        }

        // Also include active-slot Variable Set fields from `sets` if not already in `variables`
        for (const set of rawSets) {
            if (!set || !set.id || !Array.isArray(set.fields)) continue;
            const activeItem = Array.isArray(set.items)
                ? (set.items.find(it => it && it.id === set.activeItemId) || set.items[0])
                : null;
            for (const f of set.fields) {
                if (!f || !f.name) continue;
                const fType = String(f.type || 'text').toLowerCase();
                const key = `${set.id}.${f.name}`.toLowerCase();
                if (seenKeys.has(key)) continue;
                const val = valuesMap[key] !== undefined
                    ? valuesMap[key]
                    : String(activeItem?.values?.[f.name] ?? f.defaultValue ?? '');
                const item = {
                    key,
                    name: f.name,
                    label: `${set.name || set.id} / ${f.label || f.name}`,
                    group: set.name || set.id,
                    type: fType,
                    isSet: true,
                    value: val
                };
                if (primaryTypes.has(fType)) {
                    seenKeys.add(key);
                    setPrimaryItems.push(item);
                } else if (kind !== 'text' && secondaryTypes.has(fType)) {
                    seenKeys.add(key);
                    secondaryItems.push(item);
                }
            }
        }

        const groups = [];
        const kindTitle = kind === 'font' ? 'Font Variables'
            : kind === 'color' ? 'Color Variables'
                : kind === 'number' ? 'Number & Counter Variables'
                    : 'Variables';

        if (primaryItems.length) {
            groups.push({ label: kindTitle, items: primaryItems });
        }
        if (setPrimaryItems.length) {
            groups.push({ label: `Variable Set ${kindTitle}`, items: setPrimaryItems });
        }
        if (secondaryItems.length) {
            groups.push({ label: 'Text & Template Variables', items: secondaryItems });
        }
        return groups;
    }

    function injectStyles() {
        if (typeof document === 'undefined' || document.getElementById('sp-var-binder-styles')) return;
        const style = document.createElement('style');
        style.id = 'sp-var-binder-styles';
        style.textContent = `
            .sp-var-btn {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                width: 26px;
                height: 26px;
                min-width: 26px;
                padding: 0;
                margin-left: 4px;
                border-radius: 6px;
                border: 1px solid var(--border, #30363d);
                background: var(--bg-inset, #0d1117);
                color: var(--text-muted, #8b949e);
                cursor: pointer;
                transition: all 0.15s ease;
                flex-shrink: 0;
                vertical-align: middle;
            }
            .sp-var-btn:hover {
                border-color: var(--accent, #58a6ff);
                color: var(--text, #f0f6fc);
                background: var(--bg-raised, #21262d);
            }
            .sp-var-btn.is-bound {
                border-color: var(--accent, #58a6ff);
                background: color-mix(in srgb, var(--accent, #58a6ff) 16%, var(--bg-inset, #0d1117));
                color: var(--accent, #58a6ff);
                box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent, #58a6ff) 25%, transparent);
            }
            .sp-var-btn[hidden],
            body.sp-var-settings-disabled .sp-var-btn {
                display: none !important;
            }
            .sp-var-pill {
                display: none;
                align-items: center;
                gap: 5px;
                padding: 2px 7px;
                margin-top: 4px;
                border-radius: 999px;
                font-size: 10.5px;
                font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
                font-weight: 600;
                background: color-mix(in srgb, var(--accent, #58a6ff) 14%, var(--bg-inset, #0d1117));
                border: 1px solid color-mix(in srgb, var(--accent, #58a6ff) 38%, var(--border, #30363d));
                color: var(--accent, #58a6ff);
                max-width: 100%;
                width: fit-content;
                line-height: 1.3;
            }
            .sp-var-pill.is-active {
                display: inline-flex;
            }
            .sp-var-pill-key {
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                max-width: 180px;
                cursor: pointer;
            }
            .sp-var-pill-preview {
                color: var(--text-muted, #8b949e);
                font-weight: 500;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                max-width: 110px;
            }
            .sp-var-pill-swatch {
                width: 9px;
                height: 9px;
                border-radius: 50%;
                border: 1px solid rgba(255,255,255,0.28);
                flex-shrink: 0;
            }
            .sp-var-pill-clear {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                border: none;
                background: transparent;
                color: var(--text-muted, #8b949e);
                cursor: pointer;
                padding: 1px;
                border-radius: 4px;
                margin-left: 1px;
            }
            .sp-var-pill-clear:hover {
                color: #f85149;
                background: rgba(248, 81, 73, 0.14);
            }
            .sp-var-modal-backdrop {
                display: none;
                position: fixed;
                inset: 0;
                z-index: 100000;
                background: rgba(0, 0, 0, 0.68);
                backdrop-filter: blur(3px);
                -webkit-backdrop-filter: blur(3px);
                align-items: center;
                justify-content: center;
                padding: 16px;
            }
            .sp-var-modal-backdrop.is-open {
                display: flex;
            }
            .sp-var-modal {
                width: min(520px, 95vw);
                max-height: 84vh;
                background: var(--bg-card, #161b22);
                border: 1px solid var(--border, #30363d);
                border-radius: 12px;
                box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6);
                display: flex;
                flex-direction: column;
                overflow: hidden;
                color: var(--text, #f0f6fc);
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, system-ui, sans-serif;
            }
            .sp-var-modal-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 10px;
                padding: 13px 16px;
                border-bottom: 1px solid var(--border, #30363d);
                background: var(--bg-inset, #0d1117);
            }
            .sp-var-modal-title-wrap {
                display: flex;
                align-items: center;
                gap: 8px;
                min-width: 0;
            }
            .sp-var-modal-title {
                font-size: 0.92rem;
                font-weight: 700;
                color: var(--text, #f0f6fc);
                margin: 0;
            }
            .sp-var-kind-badge {
                font-size: 0.68rem;
                font-weight: 700;
                text-transform: uppercase;
                letter-spacing: 0.05em;
                padding: 2px 7px;
                border-radius: 999px;
                background: color-mix(in srgb, var(--accent, #58a6ff) 16%, transparent);
                border: 1px solid color-mix(in srgb, var(--accent, #58a6ff) 40%, transparent);
                color: var(--accent, #58a6ff);
            }
            .sp-var-modal-close {
                border: 1px solid var(--border, #30363d);
                background: var(--bg-card, #161b22);
                color: var(--text-muted, #8b949e);
                width: 28px;
                height: 28px;
                border-radius: 6px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
            }
            .sp-var-modal-close:hover {
                color: var(--text, #f0f6fc);
                border-color: var(--accent, #58a6ff);
            }
            .sp-var-modal-toolbar {
                padding: 10px 16px;
                border-bottom: 1px solid var(--border, #30363d);
                display: flex;
                flex-direction: column;
                gap: 8px;
            }
            .sp-var-search-wrap {
                display: flex;
                align-items: center;
                gap: 8px;
                background: var(--bg-inset, #0d1117);
                border: 1px solid var(--border, #30363d);
                border-radius: 7px;
                padding: 6px 10px;
            }
            .sp-var-search-wrap:focus-within {
                border-color: var(--accent, #58a6ff);
            }
            .sp-var-search-wrap input {
                flex: 1;
                border: none;
                background: transparent;
                color: var(--text, #f0f6fc);
                font-size: 0.84rem;
                outline: none;
            }
            .sp-var-fallback-row {
                display: flex;
                align-items: center;
                gap: 8px;
                font-size: 0.76rem;
                color: var(--text-muted, #8b949e);
            }
            .sp-var-fallback-row label {
                white-space: nowrap;
                font-weight: 600;
            }
            .sp-var-fallback-row input {
                flex: 1;
                background: var(--bg-inset, #0d1117);
                border: 1px solid var(--border, #30363d);
                border-radius: 6px;
                padding: 4px 8px;
                color: var(--text, #f0f6fc);
                font-size: 0.78rem;
                font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
            }
            .sp-var-list {
                flex: 1;
                overflow-y: auto;
                padding: 10px 14px;
                display: flex;
                flex-direction: column;
                gap: 4px;
            }
            .sp-var-group-title {
                font-size: 10.5px;
                font-weight: 700;
                letter-spacing: 0.06em;
                text-transform: uppercase;
                color: var(--text-muted, #8b949e);
                padding: 8px 4px 3px;
            }
            .sp-var-group-title:first-child {
                padding-top: 2px;
            }
            .sp-var-item {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 10px;
                width: 100%;
                text-align: left;
                padding: 8px 10px;
                border-radius: 7px;
                border: 1px solid var(--border, #30363d);
                background: var(--bg-inset, #0d1117);
                color: var(--text, #f0f6fc);
                cursor: pointer;
                transition: all 0.12s ease;
            }
            .sp-var-item:hover {
                border-color: var(--accent, #58a6ff);
                background: color-mix(in srgb, var(--accent, #58a6ff) 10%, var(--bg-inset, #0d1117));
            }
            .sp-var-item.is-selected {
                border-color: var(--accent, #58a6ff);
                background: color-mix(in srgb, var(--accent, #58a6ff) 18%, var(--bg-inset, #0d1117));
            }
            .sp-var-item-left {
                display: flex;
                flex-direction: column;
                gap: 2px;
                min-width: 0;
            }
            .sp-var-item-label {
                font-size: 0.83rem;
                font-weight: 600;
                color: var(--text, #f0f6fc);
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            .sp-var-item-code {
                font-size: 0.72rem;
                font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
                color: var(--accent, #58a6ff);
            }
            .sp-var-item-right {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                font-size: 0.76rem;
                color: var(--text-muted, #8b949e);
                font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
                flex-shrink: 0;
                max-width: 170px;
            }
            .sp-var-item-val {
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            .sp-var-modal-footer {
                padding: 10px 16px;
                border-top: 1px solid var(--border, #30363d);
                background: var(--bg-inset, #0d1117);
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 8px;
                font-size: 0.75rem;
            }
            .sp-var-modal-footer a {
                color: var(--accent, #58a6ff);
                text-decoration: none;
                display: inline-flex;
                align-items: center;
                gap: 4px;
                font-weight: 600;
            }
            .sp-var-modal-footer a:hover {
                text-decoration: underline;
            }
            .sp-var-unbind-btn {
                padding: 5px 10px;
                border-radius: 6px;
                border: 1px solid rgba(248, 81, 73, 0.4);
                background: rgba(248, 81, 73, 0.12);
                color: #f85149;
                font-size: 0.75rem;
                font-weight: 600;
                cursor: pointer;
            }
            .sp-var-unbind-btn:hover {
                background: rgba(248, 81, 73, 0.22);
            }
        `;
        document.head.appendChild(style);
    }

    function ensureModal() {
        injectStyles();
        if (modalEl) return modalEl;
        modalEl = document.createElement('div');
        modalEl.className = 'sp-var-modal-backdrop';
        modalEl.id = 'sp-var-binder-modal';
        modalEl.innerHTML = `
            <div class="sp-var-modal" role="dialog" aria-modal="true" aria-labelledby="sp-var-modal-title">
                <div class="sp-var-modal-header">
                    <div class="sp-var-modal-title-wrap">
                        <h3 class="sp-var-modal-title" id="sp-var-modal-title">Bind Variable Setting</h3>
                        <span class="sp-var-kind-badge" id="sp-var-modal-badge">Variable</span>
                    </div>
                    <button type="button" class="sp-var-modal-close" id="sp-var-modal-close" aria-label="Close">
                        ${ICON_UNBIND_X}
                    </button>
                </div>
                <div class="sp-var-modal-toolbar">
                    <div class="sp-var-search-wrap">
                        ${ICON_SEARCH}
                        <input type="search" id="sp-var-modal-search" placeholder="Search variables by name, group, or value…" autocomplete="off" spellcheck="false">
                    </div>
                    <div class="sp-var-fallback-row">
                        <label for="sp-var-modal-fallback">Fallback if empty (optional):</label>
                        <input type="text" id="sp-var-modal-fallback" placeholder="e.g. #3b82f6, Oswald, 1.25" spellcheck="false">
                    </div>
                </div>
                <div class="sp-var-list" id="sp-var-modal-list"></div>
                <div class="sp-var-modal-footer">
                    <a href="/placeholders.html#variables" target="_blank" rel="noopener noreferrer">
                        Manage Variables &amp; Sets ${ICON_EXT_LINK}
                    </a>
                    <div style="display:flex; align-items:center; gap:6px;">
                        <button type="button" class="sp-var-unbind-btn" id="sp-var-modal-unbind" hidden>Unlink Variable</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modalEl);

        modalEl.addEventListener('click', (e) => {
            if (e.target === modalEl) closeModal();
        });
        modalEl.querySelector('#sp-var-modal-close').addEventListener('click', closeModal);
        modalEl.querySelector('#sp-var-modal-search').addEventListener('input', renderModalList);
        modalEl.querySelector('#sp-var-modal-unbind').addEventListener('click', () => {
            if (activeModalContext) {
                unbindControl(activeModalContext.id);
                closeModal();
            }
        });
        modalEl.querySelector('#sp-var-modal-list').addEventListener('click', (e) => {
            const btn = e.target.closest('[data-var-key]');
            if (!btn || !activeModalContext) return;
            const key = btn.dataset.varKey;
            const fb = modalEl.querySelector('#sp-var-modal-fallback').value.trim();
            const token = formatToken(key, fb);
            bindControl(activeModalContext.id, token);
            closeModal();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modalEl && modalEl.classList.contains('is-open')) {
                closeModal();
            }
        });
        return modalEl;
    }

    function openModalForControl(controlId) {
        if (!isEnabled()) return;
        const cfg = controlRegistry.get(controlId);
        if (!cfg) return;
        ensureModal();
        activeModalContext = cfg;

        const currentToken = getBoundToken(controlId);
        const parsed = parseToken(currentToken);

        const kindLabels = {
            font: 'Font',
            color: 'Color',
            number: 'Number',
            text: 'Text / Template'
        };
        modalEl.querySelector('#sp-var-modal-title').textContent = cfg.label ? `Bind Variable — ${cfg.label}` : 'Bind Variable Setting';
        modalEl.querySelector('#sp-var-modal-badge').textContent = kindLabels[cfg.kind] || 'Variable';
        modalEl.querySelector('#sp-var-modal-search').value = '';
        modalEl.querySelector('#sp-var-modal-fallback').value = parsed ? parsed.fallback : (cfg.defaultFallback || '');
        modalEl.querySelector('#sp-var-modal-unbind').hidden = !currentToken;

        renderModalList();
        modalEl.classList.add('is-open');
        setTimeout(() => modalEl.querySelector('#sp-var-modal-search')?.focus(), 30);

        fetchVariables(true).then(() => {
            if (modalEl && modalEl.classList.contains('is-open') && activeModalContext?.id === controlId) {
                renderModalList();
            }
        });
    }

    function closeModal() {
        if (modalEl) modalEl.classList.remove('is-open');
        activeModalContext = null;
    }

    function looksLikeColor(val) {
        const s = String(val || '').trim();
        return /^#([0-9a-f]{3,8})$/i.test(s) || /^[0-9a-f]{6,8}$/i.test(s) || /^(rgb|hsl)a?\([^)]+\)$/i.test(s);
    }

    function toHex6(val) {
        let s = String(val || '').trim();
        if (!s) return null;
        if (/^[0-9a-f]{6,8}$/i.test(s)) s = '#' + s;
        if (/^#[0-9a-f]{6,8}$/i.test(s)) return s.slice(0, 7).toLowerCase();
        if (/^#[0-9a-f]{3}$/i.test(s)) {
            return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`.toLowerCase();
        }
        return null;
    }

    function renderModalList() {
        if (!modalEl || !activeModalContext) return;
        const listEl = modalEl.querySelector('#sp-var-modal-list');
        const query = modalEl.querySelector('#sp-var-modal-search').value.trim().toLowerCase();
        const currentToken = getBoundToken(activeModalContext.id);
        const currentKey = parseToken(currentToken)?.key || '';

        const groups = getAvailableVariableItems(activeModalContext.kind);
        let html = '';

        for (const group of groups) {
            const filtered = group.items.filter(it => {
                if (!query) return true;
                const hay = `${group.label} ${it.key} ${it.label} ${it.value} ${it.type}`.toLowerCase();
                return query.split(/\s+/).every(term => hay.includes(term));
            });
            if (!filtered.length) continue;

            html += `<div class="sp-var-group-title">${esc(group.label)}</div>`;
            for (const item of filtered) {
                const isSelected = currentKey === item.key;
                const valStr = item.value !== '' ? item.value : 'Empty';
                let swatchHtml = '';
                if (looksLikeColor(item.value)) {
                    const cssCol = /^[0-9a-f]{6,8}$/i.test(item.value.trim()) ? `#${item.value.trim()}` : item.value.trim();
                    swatchHtml = `<span class="sp-var-pill-swatch" style="background:${esc(cssCol)};"></span>`;
                }
                html += `
                    <button type="button" class="sp-var-item${isSelected ? ' is-selected' : ''}" data-var-key="${esc(item.key)}">
                        <div class="sp-var-item-left">
                            <span class="sp-var-item-label">${esc(item.label)}</span>
                            <code class="sp-var-item-code">var:${esc(item.key)}</code>
                        </div>
                        <div class="sp-var-item-right">
                            ${swatchHtml}
                            <span class="sp-var-item-val" title="${esc(valStr)}">${esc(valStr)}</span>
                        </div>
                    </button>
                `;
            }
        }

        if (!html) {
            html = `
                <div style="text-align:center; padding: 1.8rem 1rem; color: var(--text-muted, #8b949e); font-size: 0.82rem; line-height: 1.5;">
                    No matching variables found.<br>
                    Create a <strong>${esc(activeModalContext.kind)}</strong> or <strong>text</strong> variable in
                    <a href="/placeholders.html#variables" target="_blank" rel="noopener" style="color: var(--accent, #58a6ff);">Placeholders &amp; Variables</a>.
                </div>
            `;
        }
        listEl.innerHTML = html;
    }

    function loadStoredBindings() {
        try {
            const raw = localStorage.getItem(activeStorageKey);
            if (!raw) return {};
            const parsed = JSON.parse(raw);
            return (parsed && typeof parsed === 'object') ? parsed : {};
        } catch {
            return {};
        }
    }

    function saveStoredBinding(controlId, token) {
        try {
            const map = loadStoredBindings();
            if (token) map[controlId] = token;
            else delete map[controlId];
            localStorage.setItem(activeStorageKey, JSON.stringify(map));
        } catch {}
    }

    function clearAllStoredBindings() {
        try {
            localStorage.removeItem(activeStorageKey);
        } catch {}
    }

    function getBoundToken(controlId) {
        const el = typeof controlId === 'string' ? document.getElementById(controlId) : controlId;
        if (!el) return '';
        if (el.dataset.varToken && hasToken(el.dataset.varToken)) {
            return el.dataset.varToken.trim();
        }
        const val = (el.value || '').trim();
        if (hasToken(val)) {
            const parsed = parseToken(val);
            return parsed ? formatToken(parsed.key, parsed.fallback) : val;
        }
        return '';
    }

    function inferKind(el, explicitKind) {
        if (explicitKind) return explicitKind;
        const id = (el.id || '').toLowerCase();
        if (id.includes('font')) return 'font';
        if (el.type === 'color' || id.includes('color') || id.includes('accent') || id.includes('bg') || id.includes('border') || id.includes('winner') || id.includes('muted') || id.includes('track') || id.includes('scrim') || id.includes('grad')) {
            return 'color';
        }
        if (el.type === 'number' || el.type === 'range' || id.includes('scale') || id.includes('radius') || id.includes('blur') || id.includes('weight') || id.includes('size') || id.includes('width') || id.includes('height') || id.includes('limit') || id.includes('max') || id.includes('duration') || id.includes('speed') || id.includes('interval')) {
            return 'number';
        }
        return 'text';
    }

    function inferLabel(el) {
        if (!el) return '';
        if (el.id) {
            const explicitLabel = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
            if (explicitLabel) return explicitLabel.textContent.replace(/\s+/g, ' ').trim();
        }
        const row = el.closest('.cfg-row, .form-row, .field, label');
        if (row) {
            const lbl = row.querySelector('label, span:first-child');
            if (lbl && lbl !== el) return lbl.textContent.replace(/\s+/g, ' ').trim();
        }
        return el.id || 'Setting';
    }

    function ensureSelectOption(selectEl, token, resolvedVal) {
        if (!selectEl || selectEl.tagName !== 'SELECT') return;
        let opt = Array.from(selectEl.options).find(o => o.value === token);
        const labelSuffix = resolvedVal ? ` (${resolvedVal})` : '';
        if (!opt) {
            opt = document.createElement('option');
            opt.value = token;
            opt.dataset.spVarOpt = '1';
            selectEl.insertBefore(opt, selectEl.firstChild);
        }
        opt.textContent = `${token}${labelSuffix}`;
    }

    function updateControlUI(controlId) {
        const cfg = controlRegistry.get(controlId);
        if (!cfg) return;
        const el = document.getElementById(controlId);
        if (!el) return;

        const token = getBoundToken(controlId);
        const btn = cfg.btnEl;
        const pill = cfg.pillEl;
        const enabled = isEnabled();

        if (btn) {
            btn.hidden = !enabled;
            btn.classList.toggle('is-bound', Boolean(token));
            btn.title = token
                ? `Bound to ${token} (click to change or unlink)`
                : `Bind ${cfg.label || controlId} to a Variable`;
        }

        if (!pill) return;
        if (!token) {
            pill.classList.remove('is-active');
            pill.innerHTML = '';
            return;
        }

        const resolved = resolveToken(token);
        const previewText = enabled ? (resolved !== '' ? resolved : 'empty') : 'variable settings disabled';
        let swatch = '';
        if (enabled && cfg.kind === 'color' && looksLikeColor(resolved)) {
            const cssCol = /^[0-9a-f]{6,8}$/i.test(resolved.trim()) ? `#${resolved.trim()}` : resolved.trim();
            swatch = `<span class="sp-var-pill-swatch" style="background:${esc(cssCol)};"></span>`;
        }

        pill.innerHTML = `
            ${swatch}
            <span class="sp-var-pill-key" title="${enabled ? 'Click to edit variable binding' : 'Variable settings disabled in Config Editor'}">${esc(token)}</span>
            <span class="sp-var-pill-preview" title="Current resolved value on load/refresh">&rarr; ${esc(previewText)}</span>
            <button type="button" class="sp-var-pill-clear" title="Unlink variable" aria-label="Unlink variable">${ICON_UNBIND_X}</button>
        `;
        pill.classList.add('is-active');

        if (enabled) {
            pill.querySelector('.sp-var-pill-key')?.addEventListener('click', (e) => {
                e.preventDefault();
                openModalForControl(controlId);
            });
        }
        pill.querySelector('.sp-var-pill-clear')?.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            unbindControl(controlId);
        });
    }

    function applyTokenToDomControl(controlId, token, { triggerChange = true } = {}) {
        const cfg = controlRegistry.get(controlId);
        const el = document.getElementById(controlId);
        if (!el || !cfg) return;

        isApplyingBindings = true;
        try {
            if (!token) {
                delete el.dataset.varToken;
                if (el.tagName === 'SELECT') {
                    if (hasToken(el.value)) {
                        el.value = cfg.initialValue ?? '';
                    }
                } else if (el.type === 'text' || !el.type) {
                    if (hasToken(el.value)) {
                        el.value = cfg.initialValue ?? '';
                    }
                }
                updateControlUI(controlId);
                saveStoredBinding(controlId, '');
                if (triggerChange) notifyChange(el, cfg);
                return;
            }

            el.dataset.varToken = token;
            const resolved = resolveToken(token);

            if (el.tagName === 'SELECT') {
                ensureSelectOption(el, token, resolved);
                el.value = token;
            } else if (el.type === 'color') {
                const hex = toHex6(resolved);
                if (hex) el.value = hex;
            } else if (el.type === 'range' || el.type === 'number') {
                const num = parseFloat(String(resolved).replace(/px|rem|em|%|x|×/gi, '').trim());
                if (Number.isFinite(num)) {
                    el.value = String(num);
                }
                if (el.id === 'overlay-opt-blur') {
                    el.dataset.isCustom = '1';
                }
            } else {
                // text input (or search/datalist input)
                el.value = token;
                if (cfg.pairColorId) {
                    const picker = document.getElementById(cfg.pairColorId);
                    const hex = toHex6(resolved);
                    if (picker && hex) picker.value = hex;
                } else {
                    const picker = document.querySelector(`[data-color-for="${CSS.escape(el.id)}"]`) || document.getElementById(`${el.id}-picker`) || document.getElementById(`${el.id}-pick`);
                    const hex = toHex6(resolved);
                    if (picker && hex) picker.value = hex;
                }
            }

            updateControlUI(controlId);
            saveStoredBinding(controlId, token);
            if (triggerChange) notifyChange(el, cfg);
        } finally {
            isApplyingBindings = false;
        }
    }

    function notifyChange(el, cfg) {
        try {
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
        } catch {}
        if (typeof cfg?.onChange === 'function') cfg.onChange(el);
        if (typeof globalOnChange === 'function') globalOnChange(el);
    }

    function bindControl(controlId, token, opts) {
        applyTokenToDomControl(controlId, token, opts);
    }

    function unbindControl(controlId, opts) {
        applyTokenToDomControl(controlId, '', opts);
    }

    function mountSingleControl(rawDef) {
        const id = typeof rawDef === 'string' ? rawDef : rawDef?.id;
        if (!id) return;
        const el = document.getElementById(id);
        if (!el) return;

        const existing = controlRegistry.get(id);
        if (existing && existing.btnEl && existing.btnEl.isConnected) {
            return;
        }

        const kind = inferKind(el, rawDef?.kind);
        const label = rawDef?.label || inferLabel(el);
        const param = rawDef?.param || el.dataset.varParam || '';
        const pairColorId = rawDef?.pairColorId || '';
        const defaultFallback = rawDef?.defaultFallback || '';

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'sp-var-btn';
        btn.dataset.varBindFor = id;
        btn.innerHTML = ICON_VAR_BRACES;
        btn.setAttribute('aria-label', `Bind ${label} to variable`);
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            openModalForControl(id);
        });

        const pill = document.createElement('div');
        pill.className = 'sp-var-pill';
        pill.dataset.varPillFor = id;

        // Place button right after the control (or after its paired companion in the same flex container)
        const parent = el.parentElement;
        if (parent) {
            el.insertAdjacentElement('afterend', btn);
            // Place pill after the control row or inside the field container
            const fieldContainer = el.closest('.form-row, .cfg-row, .field') || parent;
            fieldContainer.appendChild(pill);
        }

        const cfg = {
            id,
            param,
            kind,
            label,
            pairColorId,
            defaultFallback,
            overlays: rawDef?.overlays || null,
            initialValue: el.value,
            onChange: rawDef?.onChange || null,
            btnEl: btn,
            pillEl: pill
        };
        controlRegistry.set(id, cfg);

        // Listen for manual typing or native picker changes
        const onUserEdit = () => {
            if (isApplyingBindings) return;
            const val = (el.value || '').trim();
            if (hasToken(val)) {
                const parsed = parseToken(val);
                el.dataset.varToken = parsed ? formatToken(parsed.key, parsed.fallback) : val;
                saveStoredBinding(id, el.dataset.varToken);
            } else if (el.type === 'text' || el.tagName === 'SELECT') {
                // User manually typed a literal value or chose a non-variable option
                if (el.dataset.varToken) {
                    delete el.dataset.varToken;
                    saveStoredBinding(id, '');
                }
            }
            updateControlUI(id);
        };
        el.addEventListener('input', onUserEdit);
        el.addEventListener('change', onUserEdit);

        // If a paired color picker is adjusted directly by the user on a text-backed color field,
        // unlink the variable token so the user's manual color choice takes effect cleanly.
        const pickerEl = (pairColorId && document.getElementById(pairColorId))
            || document.querySelector(`[data-color-for="${CSS.escape(id)}"]`)
            || document.getElementById(`${id}-picker`)
            || document.getElementById(`${id}-pick`);
        if (pickerEl && pickerEl !== el) {
            pickerEl.addEventListener('input', () => {
                if (isApplyingBindings) return;
                if (el.dataset.varToken) {
                    delete el.dataset.varToken;
                    saveStoredBinding(id, '');
                    updateControlUI(id);
                }
            });
        }
    }

    function populateAllFontControls() {
        if (!isEnabled()) return;
        const fontGroups = getAvailableVariableItems('font');
        const fontItems = fontGroups.flatMap(g => g.items.filter(it => it.type === 'font'));
        if (!fontItems.length) return;

        // 1. Populate <datalist> elements used for fonts
        const fontDatalistIds = ['ap-font-list', 'wiz-font-list', 'overlay-fonts-list', 'system-font-list'];
        for (const listId of fontDatalistIds) {
            const dl = document.getElementById(listId);
            if (!dl) continue;
            Array.from(dl.querySelectorAll('option[data-sp-var-font="1"]')).forEach(n => n.remove());
            const frag = document.createDocumentFragment();
            for (const item of fontItems) {
                const token = `var:${item.key}`;
                if (Array.from(dl.options).some(o => o.value === token)) continue;
                const opt = document.createElement('option');
                opt.value = token;
                opt.label = `Font Variable: ${item.label}${item.value ? ` (${item.value})` : ''}`;
                opt.dataset.spVarFont = '1';
                frag.appendChild(opt);
            }
            dl.insertBefore(frag, dl.firstChild);
        }

        // 2. Populate <select> elements registered with kind === 'font'
        for (const [id, cfg] of controlRegistry.entries()) {
            if (cfg.kind !== 'font') continue;
            const sel = document.getElementById(id);
            if (!sel || sel.tagName !== 'SELECT') continue;
            const prevVal = sel.value;
            let optgroup = sel.querySelector('optgroup[data-sp-var-font-group="1"]');
            if (!optgroup) {
                optgroup = document.createElement('optgroup');
                optgroup.label = 'Font Variables';
                optgroup.dataset.spVarFontGroup = '1';
                const firstOpt = sel.querySelector('option');
                if (firstOpt && firstOpt.nextSibling) {
                    sel.insertBefore(optgroup, firstOpt.nextSibling);
                } else {
                    sel.appendChild(optgroup);
                }
            }
            optgroup.innerHTML = '';
            for (const item of fontItems) {
                const token = `var:${item.key}`;
                const opt = document.createElement('option');
                opt.value = token;
                opt.textContent = `${item.label} (var:${item.key}${item.value ? ` → ${item.value}` : ''})`;
                optgroup.appendChild(opt);
            }
            if (prevVal && Array.from(sel.options).some(o => o.value === prevVal)) {
                sel.value = prevVal;
            }
        }
    }

    function refreshAllBoundControlsUI() {
        for (const id of controlRegistry.keys()) {
            const token = getBoundToken(id);
            if (token) {
                applyTokenToDomControl(id, token, { triggerChange: false });
            } else {
                updateControlUI(id);
            }
        }
    }

    function restoreBindingsFromStorageAndUrl() {
        const stored = loadStoredBindings();
        const urlParams = new URLSearchParams(root.location?.search || '');

        for (const [id, cfg] of controlRegistry.entries()) {
            const el = document.getElementById(id);
            if (!el) continue;

            // Check if current DOM value or URL query param already has a var token
            let token = '';
            if (cfg.param && urlParams.has(cfg.param)) {
                const rawUrlVal = root.OverlayVariableSettings?.getRawParam
                    ? root.OverlayVariableSettings.getRawParam(urlParams, cfg.param)
                    : urlParams.get(cfg.param);
                if (rawUrlVal && hasToken(rawUrlVal)) {
                    token = rawUrlVal.trim();
                }
            }
            if (!token && hasToken(el.value)) {
                token = el.value.trim();
            }
            if (!token && stored[id] && hasToken(stored[id])) {
                token = stored[id];
            }
            if (token) {
                applyTokenToDomControl(id, token, { triggerChange: false });
            } else {
                updateControlUI(id);
            }
        }
    }

    /**
     * Apply bound variable tokens to a URLSearchParams instance.
     * Any registered control that currently has a bound `var:...` token and a `param` name
     * will set `params.set(cfg.param, token)`.
     */
    function applyToParams(params, overlayFilter = null) {
        if (!params || typeof params.set !== 'function') return params;
        for (const [id, cfg] of controlRegistry.entries()) {
            if (!cfg.param) continue;
            if (overlayFilter && Array.isArray(cfg.overlays) && !cfg.overlays.includes(overlayFilter)) {
                continue;
            }
            const token = getBoundToken(id);
            if (token) {
                params.set(cfg.param, token);
            }
        }
        return params;
    }

    /**
     * Apply bound variable tokens to a full or relative URL string.
     */
    function applyToUrl(urlString, overlayFilter = null) {
        if (!urlString || typeof urlString !== 'string') return urlString;
        try {
            const isRelative = urlString.startsWith('/');
            const u = new URL(urlString, root.location?.origin || 'http://localhost:3000');
            applyToParams(u.searchParams, overlayFilter);
            if (isRelative) {
                const qs = u.searchParams.toString();
                return `${u.pathname}${qs ? `?${qs}` : ''}${u.hash || ''}`;
            }
            return u.toString();
        } catch {
            return urlString;
        }
    }

    /**
     * Read either the bound variable token (`var:...`) or the control's current value.
     */
    function readValue(idOrEl) {
        const id = typeof idOrEl === 'string' ? idOrEl : idOrEl?.id;
        if (!id) return '';
        const token = getBoundToken(id);
        if (token) return token;
        const el = typeof idOrEl === 'string' ? document.getElementById(idOrEl) : idOrEl;
        return el ? el.value : '';
    }

    /**
     * Read the live resolved value of a control (resolving `var:...` if bound).
     */
    function readResolvedValue(idOrEl, fallback = '') {
        const raw = readValue(idOrEl);
        if (hasToken(raw)) return resolveToken(raw, fallback);
        return raw !== '' && raw !== undefined && raw !== null ? raw : fallback;
    }

    /**
     * Unbind all controls and clear stored variable bindings for this page.
     */
    function resetAll() {
        clearAllStoredBindings();
        for (const id of controlRegistry.keys()) {
            applyTokenToDomControl(id, '', { triggerChange: false });
        }
    }

    /**
     * Mount variable binding buttons and badges onto a set of controls.
     * @param {Object} options
     * @param {string} [options.storageKey]
     * @param {Function} [options.onChange]
     * @param {Array<Object|string>} [options.bindings]
     */
    function mount(options = {}) {
        injectStyles();
        if (options.storageKey) activeStorageKey = options.storageKey;
        if (typeof options.onChange === 'function') globalOnChange = options.onChange;

        const bindings = Array.isArray(options.bindings) ? options.bindings : [];
        bindings.forEach(mountSingleControl);

        // Also auto-discover any element with data-var-bind
        if (typeof document !== 'undefined') {
            document.querySelectorAll('[data-var-bind]').forEach(el => {
                if (!el.id) return;
                mountSingleControl({
                    id: el.id,
                    kind: el.dataset.varBind || undefined,
                    param: el.dataset.varParam || undefined,
                    label: el.dataset.varLabel || undefined
                });
            });
        }

        restoreBindingsFromStorageAndUrl();
        fetchVariables(false).then(() => {
            restoreBindingsFromStorageAndUrl();
            if (typeof globalOnChange === 'function') {
                // Refresh once if any bound tokens were restored
                const hasAnyBound = Array.from(controlRegistry.keys()).some(id => Boolean(getBoundToken(id)));
                if (hasAnyBound) globalOnChange();
            }
        });
    }

    root.WizardVariableBinder = {
        mount,
        bindControl,
        unbindControl,
        getBoundToken,
        readValue,
        readResolvedValue,
        applyToParams,
        applyToUrl,
        resetAll,
        hasToken,
        parseToken,
        formatToken,
        resolveToken,
        fetchVariables,
        populateAllFontControls,
        refreshAllBoundControlsUI,
        isEnabled,
        setEnabled: applyEnabledState
    };
})(typeof window !== 'undefined' ? window : globalThis);

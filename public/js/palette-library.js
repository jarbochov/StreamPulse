/**
 * StreamPulse Shared Color Palettes Library & Picker Component
 * Exposes window.StreamPulsePalettes for Custom Overlay Editor,
 * OBS Pattern Studio, OBS Border Studio, and Credit Suite.
 */
(function (root) {
    'use strict';

    const MIN_STOPS = 2;
    const MAX_STOPS = 8;

    const state = {
        loaded: false,
        loadingPromise: null,
        builtin: [],
        custom: [],
        palettes: []
    };

    const listeners = new Set();

    function esc(str) {
        return String(str ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function toHex6(c, fallback = '#38bdf8') {
        const s = String(c || '').trim();
        if (/^#[0-9a-fA-F]{6,8}$/.test(s)) return s.slice(0, 7);
        if (/^#[0-9a-fA-F]{3}$/.test(s)) return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
        return fallback;
    }

    function normalizeColors(colors) {
        const arr = Array.isArray(colors) ? colors.map(c => String(c || '').trim()).filter(Boolean).slice(0, MAX_STOPS) : [];
        return arr.length >= MIN_STOPS ? arr : ['#1f6feb', '#8957e5'];
    }

    function buildGradientStops(colors, opts = {}) {
        const list = normalizeColors(colors);
        const n = list.length;
        const stepped = opts.blendMode === 'stepped';
        const repeat = opts.repeat === true;
        const spread = Number.isFinite(Number(opts.spread)) ? Math.max(10, Math.min(400, Number(opts.spread))) : 100;
        const start = repeat ? 0 : (50 - spread * 0.5);
        const span = spread;
        const fmtPct = v => `${Math.round(v * 100) / 100}%`;

        if (stepped) {
            const parts = [];
            for (let i = 0; i < n; i++) {
                const a = start + (i / n) * span;
                const b = start + ((i + 1) / n) * span;
                parts.push(`${list[i]} ${fmtPct(a)}`, `${list[i]} ${fmtPct(b)}`);
            }
            return parts.join(', ');
        }

        if (!repeat && Math.abs(spread - 100) < 0.01) {
            return list.join(', ');
        }

        const parts = [];
        for (let i = 0; i < n; i++) {
            const pos = start + (n > 1 ? (i / (n - 1)) * span : 0);
            parts.push(`${list[i]} ${fmtPct(pos)}`);
        }
        return parts.join(', ');
    }

    function buildGradientCss(colors, opts = {}) {
        const stops = buildGradientStops(colors, opts);
        const type = opts.type === 'radial' ? 'radial' : (opts.type === 'conic' ? 'conic' : 'linear');
        const rep = opts.repeat === true ? 'repeating-' : '';
        if (type === 'radial') {
            return `${rep}radial-gradient(circle at ${opts.position || 'center'}, ${stops})`;
        }
        if (type === 'conic') {
            return `${rep}conic-gradient(from ${Number(opts.angle) || 0}deg, ${stops})`;
        }
        const angle = Number.isFinite(Number(opts.angle)) ? Number(opts.angle) : 135;
        return `${rep}linear-gradient(${angle}deg, ${stops})`;
    }

    function seedFallbackBuiltins() {
        const raw = root.StreamPulsePatternCatalog?.PALETTES || root.StreamPulsePatterns?.PALETTES || {};
        const entries = Object.entries(raw);
        if (!entries.length) return;
        state.builtin = entries.map(([id, colors]) => ({
            id,
            name: id[0].toUpperCase() + id.slice(1),
            colors: colors.slice(0, MAX_STOPS),
            angle: 135,
            builtin: true
        }));
        state.palettes = [...state.custom, ...state.builtin];
    }

    function applyServerPayload(data) {
        if (!data || typeof data !== 'object') return;
        if (Array.isArray(data.builtin)) state.builtin = data.builtin;
        if (Array.isArray(data.custom)) state.custom = data.custom;
        state.palettes = Array.isArray(data.palettes)
            ? data.palettes
            : [...state.custom, ...state.builtin];
        state.loaded = true;
        notify();
    }

    function notify() {
        for (const fn of listeners) {
            try { fn(getSnapshot()); } catch {}
        }
    }

    function getSnapshot() {
        return {
            loaded: state.loaded,
            builtin: state.builtin.map(p => ({ ...p, colors: [...p.colors] })),
            custom: state.custom.map(p => ({ ...p, colors: [...p.colors] })),
            palettes: state.palettes.map(p => ({ ...p, colors: [...p.colors] }))
        };
    }

    async function load(force = false) {
        if (state.loaded && !force) return getSnapshot();
        if (state.loadingPromise && !force) return state.loadingPromise;
        if (!state.builtin.length) seedFallbackBuiltins();
        state.loadingPromise = fetch('/api/palettes')
            .then(async res => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await res.json();
                applyServerPayload(data);
                return getSnapshot();
            })
            .catch(() => {
                if (!state.builtin.length) seedFallbackBuiltins();
                return getSnapshot();
            })
            .finally(() => {
                state.loadingPromise = null;
            });
        return state.loadingPromise;
    }

    async function apiRequest(url, method, body) {
        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: body !== undefined ? JSON.stringify(body) : undefined
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
        applyServerPayload(data);
        return data.palette || data.removed || data;
    }

    const create = payload => apiRequest('/api/palettes', 'POST', payload);
    const update = (id, patch) => apiRequest(`/api/palettes/${encodeURIComponent(id)}`, 'PUT', patch);
    const duplicate = (id, name = '') => apiRequest(`/api/palettes/${encodeURIComponent(id)}/duplicate`, 'POST', name ? { name } : {});
    const remove = id => apiRequest(`/api/palettes/${encodeURIComponent(id)}`, 'DELETE');

    function getById(id) {
        const clean = String(id || '').trim();
        if (!clean) return null;
        const hit = state.palettes.find(p => p.id === clean);
        return hit ? { ...hit, colors: [...hit.colors] } : null;
    }

    function subscribe(fn) {
        if (typeof fn !== 'function') return () => {};
        listeners.add(fn);
        return () => listeners.delete(fn);
    }

    function ensureStylesheet() {
        if (typeof document === 'undefined') return;
        if (document.querySelector('link[href*="/css/palette-library.css"]')) return;
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = '/css/palette-library.css';
        document.head.appendChild(link);
    }

    function openManagerModal(opts = {}) {
        ensureStylesheet();
        const existing = document.getElementById('sp-palette-library-modal');
        if (existing) existing.remove();

        const onApply = typeof opts.onApply === 'function' ? opts.onApply : null;
        let searchQuery = '';
        let editingId = '';
        let draftName = '';
        let draftColors = normalizeColors(opts.currentColors);
        let draftAngle = Number.isFinite(Number(opts.angle)) ? Number(opts.angle) : 135;

        if (opts.currentPaletteId) {
            const existingPal = getById(opts.currentPaletteId);
            if (existingPal) {
                draftColors = [...existingPal.colors];
                if (!existingPal.builtin) {
                    editingId = existingPal.id;
                    draftName = existingPal.name;
                }
            }
        }

        const backdrop = document.createElement('div');
        backdrop.id = 'sp-palette-library-modal';
        backdrop.className = 'sp-pal-modal-backdrop';
        backdrop.innerHTML = `
            <div class="sp-pal-modal" role="dialog" aria-modal="true" aria-label="Color Palettes Library">
                <div class="sp-pal-modal-head">
                    <div class="sp-pal-modal-title">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.93 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c3.31 0 6-2.69 6-6 0-4.96-4.49-9-10-9z"/></svg>
                        <span>${esc(opts.title || 'Shared Color Palettes Library')}</span>
                    </div>
                    <button type="button" class="sp-pal-btn" data-pal-close>Close</button>
                </div>
                <div class="sp-pal-modal-body">
                    <div class="sp-pal-list-col">
                        <input type="search" class="sp-pal-search" id="sp-pal-search" placeholder="Search palettes...">
                        <div id="sp-pal-list-root"></div>
                    </div>
                    <div class="sp-pal-editor-col">
                        <div class="sp-pal-group-label" id="sp-pal-editor-heading">Custom Palette Builder (2–8 Stops)</div>
                        <div class="sp-pal-editor-preview" id="sp-pal-editor-preview"></div>
                        <div style="display:flex;gap:6px;align-items:center;">
                            <input type="text" class="sp-pal-search" id="sp-pal-name-input" placeholder="Palette name (e.g. Brand Sunset)">
                        </div>
                        <div class="sp-pal-stop-rows" id="sp-pal-stop-rows"></div>
                        <div style="display:flex;gap:6px;flex-wrap:wrap;">
                            <button type="button" class="sp-pal-btn" id="sp-pal-add-stop">+ Add Stop</button>
                            <button type="button" class="sp-pal-btn" id="sp-pal-reverse">Reverse</button>
                            <button type="button" class="sp-pal-btn" id="sp-pal-new-blank">New Blank</button>
                        </div>
                        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px;">
                            <button type="button" class="sp-pal-btn" id="sp-pal-save-new">Save as New Palette</button>
                            <button type="button" class="sp-pal-btn" id="sp-pal-save-update" style="display:none;">Update Saved</button>
                        </div>
                    </div>
                </div>
                <div class="sp-pal-modal-foot">
                    <span class="sp-pal-status" id="sp-pal-status">Saved palettes are shared across all editors &amp; studios.</span>
                    <div style="display:flex;gap:8px;">
                        <button type="button" class="sp-pal-btn" data-pal-close>Cancel</button>
                        ${onApply ? '<button type="button" class="sp-pal-btn primary" id="sp-pal-apply-btn">Apply Palette</button>' : ''}
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(backdrop);

        const listRoot = backdrop.querySelector('#sp-pal-list-root');
        const previewEl = backdrop.querySelector('#sp-pal-editor-preview');
        const nameInput = backdrop.querySelector('#sp-pal-name-input');
        const stopRowsEl = backdrop.querySelector('#sp-pal-stop-rows');
        const addStopBtn = backdrop.querySelector('#sp-pal-add-stop');
        const saveUpdateBtn = backdrop.querySelector('#sp-pal-save-update');
        const statusEl = backdrop.querySelector('#sp-pal-status');
        const searchInput = backdrop.querySelector('#sp-pal-search');

        const setStatus = msg => { if (statusEl) statusEl.textContent = msg; };

        function close() {
            unsub();
            backdrop.remove();
        }

        function renderEditor() {
            previewEl.style.background = buildGradientCss(draftColors, { type: 'linear', angle: 90 });
            if (document.activeElement !== nameInput) nameInput.value = draftName;
            saveUpdateBtn.style.display = editingId ? '' : 'none';
            addStopBtn.disabled = draftColors.length >= MAX_STOPS;

            stopRowsEl.innerHTML = draftColors.map((col, idx) => `
                <div class="sp-pal-stop-row" data-stop-idx="${idx}">
                    <input type="color" data-stop-picker="${idx}" value="${esc(toHex6(col))}" aria-label="Stop ${idx + 1} color">
                    <input type="text" data-stop-hex="${idx}" value="${esc(col)}" aria-label="Stop ${idx + 1} value">
                    <button type="button" class="sp-pal-icon-btn danger" data-stop-del="${idx}" title="Remove stop" ${draftColors.length <= MIN_STOPS ? 'disabled' : ''}>
                        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                </div>
            `).join('');

            stopRowsEl.querySelectorAll('[data-stop-picker]').forEach(el => {
                el.addEventListener('input', () => {
                    const idx = Number(el.dataset.stopPicker);
                    draftColors[idx] = el.value;
                    const hexEl = stopRowsEl.querySelector(`[data-stop-hex="${idx}"]`);
                    if (hexEl) hexEl.value = el.value;
                    previewEl.style.background = buildGradientCss(draftColors, { type: 'linear', angle: 90 });
                });
            });
            stopRowsEl.querySelectorAll('[data-stop-hex]').forEach(el => {
                el.addEventListener('input', () => {
                    const idx = Number(el.dataset.stopHex);
                    const val = el.value.trim();
                    if (!val) return;
                    draftColors[idx] = val;
                    const pickEl = stopRowsEl.querySelector(`[data-stop-picker="${idx}"]`);
                    if (pickEl && /^#[0-9a-f]{6,8}$/i.test(val)) pickEl.value = val.slice(0, 7);
                    previewEl.style.background = buildGradientCss(draftColors, { type: 'linear', angle: 90 });
                });
            });
            stopRowsEl.querySelectorAll('[data-stop-del]').forEach(btn => {
                btn.addEventListener('click', () => {
                    if (draftColors.length <= MIN_STOPS) return;
                    draftColors.splice(Number(btn.dataset.stopDel), 1);
                    renderEditor();
                });
            });
        }

        function renderCards(items, isCustom) {
            if (!items.length) {
                return isCustom
                    ? '<div style="font-size:11px;color:var(--text-muted);padding:6px 2px;">No custom palettes yet — build one on the right and click Save as New Palette.</div>'
                    : '<div style="font-size:11px;color:var(--text-muted);padding:6px 2px;">No matching presets.</div>';
            }
            return `<div class="sp-pal-cards">${items.map(p => `
                <div class="sp-pal-card ${editingId === p.id ? 'active' : ''}" data-pal-select="${esc(p.id)}">
                    <div class="sp-pal-card-bar" style="background:${esc(buildGradientCss(p.colors, { type: 'linear', angle: 90 }))};"></div>
                    <div class="sp-pal-card-meta">
                        <span class="sp-pal-card-name" title="${esc(p.name)}">${esc(p.name)}</span>
                        <div class="sp-pal-card-acts">
                            <button type="button" class="sp-pal-icon-btn" data-pal-dup="${esc(p.id)}" title="Duplicate as custom palette">
                                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                            </button>
                            ${isCustom ? `
                                <button type="button" class="sp-pal-icon-btn danger" data-pal-del="${esc(p.id)}" title="Delete custom palette">
                                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
                                </button>
                            ` : ''}
                        </div>
                    </div>
                </div>
            `).join('')}</div>`;
        }

        function renderList() {
            const q = searchQuery.trim().toLowerCase();
            const match = p => !q || p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q);
            const customItems = state.custom.filter(match);
            const builtinItems = state.builtin.filter(match);
            listRoot.innerHTML = `
                <div class="sp-pal-group-label">My Custom Palettes (${customItems.length})</div>
                ${renderCards(customItems, true)}
                <div class="sp-pal-group-label" style="margin-top:12px;">Curated Presets (${builtinItems.length})</div>
                ${renderCards(builtinItems, false)}
            `;

            listRoot.querySelectorAll('[data-pal-select]').forEach(card => {
                card.addEventListener('click', ev => {
                    if (ev.target.closest('button')) return;
                    const p = getById(card.dataset.palSelect);
                    if (!p) return;
                    draftColors = [...p.colors];
                    draftAngle = p.angle ?? draftAngle;
                    if (!p.builtin) {
                        editingId = p.id;
                        draftName = p.name;
                    } else {
                        editingId = '';
                        draftName = `${p.name} Custom`;
                    }
                    renderEditor();
                    renderList();
                    setStatus(`Loaded "${p.name}" (${p.colors.length} stops)`);
                });
                card.addEventListener('dblclick', ev => {
                    if (ev.target.closest('button') || !onApply) return;
                    const p = getById(card.dataset.palSelect);
                    if (!p) return;
                    onApply({ paletteId: p.id, name: p.name, colors: [...p.colors], angle: p.angle ?? draftAngle });
                    close();
                });
            });

            listRoot.querySelectorAll('[data-pal-dup]').forEach(btn => {
                btn.addEventListener('click', async ev => {
                    ev.stopPropagation();
                    try {
                        const created = await duplicate(btn.dataset.palDup);
                        editingId = created.id;
                        draftName = created.name;
                        draftColors = [...created.colors];
                        renderEditor();
                        renderList();
                        setStatus(`Saved copy "${created.name}"`);
                    } catch (err) {
                        setStatus(err.message);
                    }
                });
            });

            listRoot.querySelectorAll('[data-pal-del]').forEach(btn => {
                btn.addEventListener('click', async ev => {
                    ev.stopPropagation();
                    const p = getById(btn.dataset.palDel);
                    if (!p || !window.confirm(`Delete custom palette "${p.name}"?`)) return;
                    try {
                        await remove(p.id);
                        if (editingId === p.id) editingId = '';
                        renderEditor();
                        renderList();
                        setStatus(`Deleted "${p.name}"`);
                    } catch (err) {
                        setStatus(err.message);
                    }
                });
            });
        }

        searchInput.addEventListener('input', () => {
            searchQuery = searchInput.value;
            renderList();
        });
        nameInput.addEventListener('input', () => {
            draftName = nameInput.value;
        });
        addStopBtn.addEventListener('click', () => {
            if (draftColors.length >= MAX_STOPS) return;
            draftColors.push(draftColors[draftColors.length - 1] || '#38bdf8');
            renderEditor();
        });
        backdrop.querySelector('#sp-pal-reverse').addEventListener('click', () => {
            draftColors.reverse();
            renderEditor();
        });
        backdrop.querySelector('#sp-pal-new-blank').addEventListener('click', () => {
            editingId = '';
            draftName = '';
            draftColors = ['#1f6feb', '#8957e5', '#f472b6'];
            renderEditor();
            renderList();
            nameInput.focus();
        });
        backdrop.querySelector('#sp-pal-save-new').addEventListener('click', async () => {
            const nm = (draftName || '').trim() || window.prompt('Palette name:', 'My Custom Palette');
            if (!nm || !nm.trim()) return;
            try {
                const created = await create({ name: nm.trim(), colors: draftColors, angle: draftAngle });
                editingId = created.id;
                draftName = created.name;
                renderEditor();
                renderList();
                setStatus(`Saved "${created.name}" to shared library`);
            } catch (err) {
                setStatus(err.message);
            }
        });
        saveUpdateBtn.addEventListener('click', async () => {
            if (!editingId) return;
            try {
                const updated = await update(editingId, { name: (draftName || '').trim() || 'Custom Palette', colors: draftColors, angle: draftAngle });
                draftName = updated.name;
                renderEditor();
                renderList();
                setStatus(`Updated "${updated.name}"`);
            } catch (err) {
                setStatus(err.message);
            }
        });
        backdrop.querySelector('#sp-pal-apply-btn')?.addEventListener('click', () => {
            if (onApply) {
                onApply({
                    paletteId: editingId || '',
                    name: draftName || 'Custom Gradient',
                    colors: normalizeColors(draftColors),
                    angle: draftAngle
                });
            }
            close();
        });
        backdrop.addEventListener('click', ev => {
            if (ev.target === backdrop || ev.target.closest('[data-pal-close]')) close();
        });

        const unsub = subscribe(() => renderList());
        renderEditor();
        renderList();
        load().then(() => renderList());
    }

    // Seed built-ins synchronously if pattern catalog is loaded, then fetch server custom palettes
    seedFallbackBuiltins();
    if (typeof fetch === 'function' && typeof window !== 'undefined') {
        load();
    }

    root.StreamPulsePalettes = {
        MIN_STOPS,
        MAX_STOPS,
        load,
        getSnapshot,
        getAll: () => state.palettes.map(p => ({ ...p, colors: [...p.colors] })),
        getCustom: () => state.custom.map(p => ({ ...p, colors: [...p.colors] })),
        getBuiltin: () => state.builtin.map(p => ({ ...p, colors: [...p.colors] })),
        getById,
        create,
        update,
        duplicate,
        remove,
        subscribe,
        applyServerPayload,
        buildGradientCss,
        openManagerModal
    };
})(typeof window !== 'undefined' ? window : globalThis);

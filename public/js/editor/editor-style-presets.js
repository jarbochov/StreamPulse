/**
 * StreamPulse Custom Overlay Editor — Element Style Presets
 */

import { esc, hasText, TEXT_TYPES, uid, toast } from './editor-state.js';
import { F } from './editor-form.js';

import { BUILTIN_STYLE_PRESETS } from '../displays/style-preset-model.js';
export { BUILTIN_STYLE_PRESETS };

let customPresets = [];
let loadedOnce = false;
let loadPromise = null;

export function getCustomStylePresets() {
    return customPresets;
}

export async function loadStylePresets(onLoaded) {
    if (loadPromise) return loadPromise;
    loadPromise = fetch('/api/custom-overlays/style-presets', { cache: 'no-store' })
        .then(r => (r.ok ? r.json() : []))
        .then(list => {
            customPresets = Array.isArray(list) ? list : [];
            loadedOnce = true;
            if (typeof onLoaded === 'function') onLoaded(customPresets);
            return customPresets;
        })
        .catch(() => customPresets)
        .finally(() => { loadPromise = null; });
    return loadPromise;
}

const clone = value => JSON.parse(JSON.stringify(value));

const BOX_KEYS = [
    'background', 'gradient', 'borderColor', 'borderWidth', 'borderStyle', 'borderPlacement',
    'borderRadius', 'borderRadiusCorners', 'borderGlow', 'borderGradient', 'borderAnimation',
    'blur', 'shadow', 'innerShadow', 'opacity'
];
const TEXT_KEYS = [
    'color', 'textGradient', 'textStroke', 'textShadow', 'fontStyle',
    'tabularNums', 'textAnimation', 'textTransform', 'textDecoration'
];

export function applyStylePreset(preset, elements) {
    if (!preset?.style || !Array.isArray(elements) || !elements.length) return false;
    const src = preset.style;
    for (const el of elements) {
        el.style = el.style || {};
        for (const key of BOX_KEYS) {
            if (src[key] === undefined) continue;
            if (key === 'borderPlacement' && el.type !== 'shape') continue;
            el.style[key] = typeof src[key] === 'object' && src[key] !== null ? clone(src[key]) : src[key];
        }
        if (hasText(el)) {
            for (const key of TEXT_KEYS) {
                if (src[key] === undefined) continue;
                el.style[key] = typeof src[key] === 'object' && src[key] !== null ? clone(src[key]) : src[key];
            }
            if (src.fontWeight !== undefined) el.style.fontWeight = src.fontWeight;
        }
        if (src.padding !== undefined && TEXT_TYPES.has(el.type)) {
            el.style.padding = src.padding;
        }
    }
    return true;
}

function previewStyleAttr(preset) {
    const p = preset.preview || {};
    const st = preset.style || {};
    const bg = p.bg || (st.gradient?.enabled ? `linear-gradient(${st.gradient.angle ?? 135}deg, ${st.gradient.from || '#1f6feb'}, ${st.gradient.to || '#8957e5'})` : st.background || 'rgba(15,23,42,0.7)');
    const border = p.border || `${Math.min(3, Math.max(1, Number(st.borderWidth) || 0))}px solid ${st.borderColor || 'rgba(255,255,255,0.22)'}`;
    const radius = p.radius || `${Math.min(12, Number(st.borderRadius) || 0)}px`;
    const color = p.color || st.color || '#f8fafc';
    const shadow = p.shadow ? `box-shadow:${p.shadow};` : '';
    return `background:${esc(bg)};border:${esc(border)};border-radius:${esc(radius)};color:${esc(color)};${shadow}`;
}

export function stylePresetsSection(el, multi) {
    if (!el || el.type === 'cutout' || el.type === 'speaker-badge' || el.type === 'procedural-pattern') return '';
    const renderCard = (p, isCustom) => `
        <div class="sp-preset-item">
            <button type="button" class="sp-preset-btn" data-apply-style-preset="${esc(p.id)}" title="Apply ${esc(p.name)}">
                <span class="sp-preset-swatch" style="${previewStyleAttr(p)}">Aa</span>
                <span class="sp-preset-name">${esc(p.name)}</span>
            </button>
            ${isCustom ? `<button type="button" class="sp-preset-del" data-delete-style-preset="${esc(p.id)}" title="Delete preset ${esc(p.name)}" aria-label="Delete ${esc(p.name)}"><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>` : ''}
        </div>
    `;

    const customHtml = customPresets.length
        ? `<div class="sub-head" style="margin-top:8px;">Saved Presets</div><div class="sp-preset-grid">${customPresets.map(p => renderCard(p, true)).join('')}</div>`
        : '';

    const body = `
        <div class="sp-preset-grid">${BUILTIN_STYLE_PRESETS.map(p => renderCard(p, false)).join('')}</div>
        ${customHtml}
        ${multi ? '' : `<div class="sp-preset-save-row">
            <input type="text" id="style-preset-name" placeholder="Save current look as…" maxlength="60" autocomplete="off">
            <button type="button" id="save-style-preset-btn" class="primary">Save</button>
        </div>`}
        <p class="hint">Click any preset to apply its borders, backdrop, shadows, and text styling while preserving layout and content.</p>
    `;
    return F.section('stylePresets', 'Style Presets', body, false);
}

export async function handleStylePresetClick(target, { selectedElements, primary, renderCanvas, renderProperties, changed }) {
    const applyBtn = target.closest('[data-apply-style-preset]');
    if (applyBtn) {
        const id = applyBtn.dataset.applyStylePreset;
        const preset = BUILTIN_STYLE_PRESETS.find(p => p.id === id) || customPresets.find(p => p.id === id);
        if (preset && applyStylePreset(preset, selectedElements())) {
            renderCanvas();
            renderProperties();
            changed(true);
            toast(`Applied “${preset.name}”`, 'success', 1400);
        }
        return true;
    }

    const saveBtn = target.closest('#save-style-preset-btn');
    if (saveBtn) {
        const el = primary();
        const input = document.getElementById('style-preset-name');
        const name = String(input?.value || '').trim();
        if (!el) return true;
        if (!name) {
            toast('Enter a name for the style preset first', 'warn', 1800);
            input?.focus();
            return true;
        }
        saveBtn.disabled = true;
        try {
            const payload = {
                id: `${uid('style').slice(0, 12)}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24)}`,
                name,
                category: hasText(el) ? 'text' : 'box',
                style: clone(el.style || {})
            };
            const res = await fetch('/api/custom-overlays/style-presets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const saved = await res.json().catch(() => null);
            if (!res.ok || !saved) throw new Error(saved?.error || 'Could not save style preset');
            customPresets = [...customPresets.filter(p => p.id !== saved.id), saved];
            loadedOnce = true;
            renderProperties();
            toast(`Saved style preset “${saved.name}”`, 'success', 1800);
        } catch (err) {
            toast(err.message || 'Could not save preset', 'error', 3000);
        } finally {
            saveBtn.disabled = false;
        }
        return true;
    }

    const delBtn = target.closest('[data-delete-style-preset]');
    if (delBtn) {
        const id = delBtn.dataset.deleteStylePreset;
        delBtn.disabled = true;
        try {
            const res = await fetch(`/api/custom-overlays/style-presets/${encodeURIComponent(id)}`, { method: 'DELETE' });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || 'Could not delete style preset');
            }
            customPresets = customPresets.filter(p => p.id !== id);
            renderProperties();
            toast('Style preset deleted', 'info', 1400);
        } catch (err) {
            delBtn.disabled = false;
            toast(err.message || 'Could not delete style preset', 'error', 3000);
        }
        return true;
    }

    return false;
}

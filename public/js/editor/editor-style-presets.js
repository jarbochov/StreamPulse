/**
 * StreamPulse Custom Overlay Editor — Element Style Presets
 */

import { esc, hasText, TEXT_TYPES, uid, toast } from './editor-state.js';
import { F } from './editor-form.js';

export const BUILTIN_STYLE_PRESETS = [
    {
        id: 'builtin-glass-card',
        name: 'Glass Card',
        category: 'box',
        preview: { bg: 'linear-gradient(135deg, rgba(30,41,59,0.78), rgba(15,23,42,0.68))', border: '1px solid rgba(255,255,255,0.22)', radius: '8px', color: '#f8fafc' },
        style: {
            background: 'rgba(15,23,42,0.66)',
            gradient: { enabled: false },
            blur: 14,
            borderWidth: 1,
            borderStyle: 'solid',
            borderColor: 'rgba(255,255,255,0.22)',
            borderRadius: 14,
            borderRadiusCorners: { enabled: false, tl: 14, tr: 14, br: 14, bl: 14 },
            borderGlow: { enabled: false },
            borderGradient: { enabled: false },
            borderAnimation: { type: 'none' },
            shadow: { blur: 22, color: 'rgba(0,0,0,0.55)' },
            color: '#f8fafc',
            textShadow: { blur: 4, x: 0, y: 1, color: 'rgba(0,0,0,0.45)' },
            textAnimation: { type: 'none' }
        }
    },
    {
        id: 'builtin-neon-tube',
        name: 'Neon Tube',
        category: 'box',
        preview: { bg: '#0c061d', border: '2px solid #ffffff', shadow: '0 0 8px #f43f5e', radius: '8px', color: '#ffffff' },
        style: {
            background: 'rgba(12,6,29,0.82)',
            gradient: { enabled: false },
            blur: 6,
            borderWidth: 3,
            borderStyle: 'neon-tube',
            borderColor: '#f43f5e',
            borderRadius: 12,
            borderRadiusCorners: { enabled: false, tl: 12, tr: 12, br: 12, bl: 12 },
            borderGlow: { enabled: false },
            borderGradient: { enabled: false },
            borderAnimation: { type: 'none' },
            shadow: { blur: 16, color: 'rgba(244,63,94,0.4)' },
            color: '#ffffff',
            textShadow: { blur: 10, x: 0, y: 0, color: '#f43f5e' },
            textAnimation: { type: 'none' }
        }
    },
    {
        id: 'builtin-esports-chamfer',
        name: 'Esports Chamfer',
        category: 'box',
        preview: { bg: '#09111e', border: '2px solid #38bdf8', radius: '2px', color: '#e0f2fe' },
        style: {
            background: 'rgba(9,17,30,0.88)',
            gradient: { enabled: false },
            blur: 4,
            borderWidth: 3,
            borderStyle: 'chamfer',
            borderColor: '#38bdf8',
            borderRadius: 14,
            borderRadiusCorners: { enabled: false, tl: 14, tr: 14, br: 14, bl: 14 },
            borderGlow: { enabled: false },
            borderGradient: { enabled: false },
            borderAnimation: { type: 'none' },
            shadow: { blur: 14, color: 'rgba(2,132,199,0.35)' },
            color: '#e0f2fe',
            fontWeight: '700',
            textTransform: 'uppercase',
            textShadow: { blur: 2, x: 0, y: 2, color: 'rgba(0,0,0,0.8)' },
            textAnimation: { type: 'none' }
        }
    },
    {
        id: 'builtin-broadcast-pill',
        name: 'Broadcast Pill',
        category: 'box',
        preview: { bg: 'linear-gradient(135deg, #1f6feb, #7c3aed)', border: '1px solid rgba(255,255,255,0.28)', radius: '99px', color: '#ffffff' },
        style: {
            background: 'transparent',
            gradient: { enabled: true, type: 'linear', angle: 135, from: '#1f6feb', to: '#7c3aed', animate: false },
            blur: 0,
            borderWidth: 1,
            borderStyle: 'solid',
            borderColor: 'rgba(255,255,255,0.28)',
            borderRadius: 99,
            borderRadiusCorners: { enabled: false, tl: 99, tr: 99, br: 99, bl: 99 },
            borderGlow: { enabled: false },
            borderGradient: { enabled: false },
            borderAnimation: { type: 'none' },
            shadow: { blur: 16, color: 'rgba(15,23,42,0.5)' },
            color: '#ffffff',
            fontWeight: '700',
            tabularNums: true,
            textShadow: { blur: 3, x: 0, y: 1, color: 'rgba(0,0,0,0.4)' },
            textAnimation: { type: 'none' }
        }
    },
    {
        id: 'builtin-gold-plaque',
        name: 'Gold Plaque',
        category: 'box',
        preview: { bg: '#181612', border: '2px double #eab308', radius: '6px', color: '#fef08a' },
        style: {
            background: 'rgba(24,22,18,0.92)',
            gradient: { enabled: false },
            blur: 0,
            borderWidth: 4,
            borderStyle: 'double-ring',
            borderColor: '#eab308',
            borderRadius: 10,
            borderRadiusCorners: { enabled: false, tl: 10, tr: 10, br: 10, bl: 10 },
            borderGlow: { enabled: false },
            borderGradient: { enabled: false },
            borderAnimation: { type: 'none' },
            shadow: { blur: 18, color: 'rgba(0,0,0,0.65)' },
            color: '#fef08a',
            fontWeight: '700',
            textShadow: { blur: 2, x: 1, y: 2, color: 'rgba(0,0,0,0.85)' },
            textAnimation: { type: 'none' }
        }
    },
    {
        id: 'builtin-hazard-hud',
        name: 'Hazard Caution',
        category: 'box',
        preview: { bg: '#111827', border: '2px dashed #f59e0b', radius: '4px', color: '#fde68a' },
        style: {
            background: 'rgba(17,24,39,0.9)',
            gradient: { enabled: false },
            blur: 0,
            borderWidth: 5,
            borderStyle: 'hazard',
            borderColor: '#f59e0b',
            borderRadius: 6,
            borderRadiusCorners: { enabled: false, tl: 6, tr: 6, br: 6, bl: 6 },
            borderGlow: { enabled: false },
            borderGradient: { enabled: false },
            borderAnimation: { type: 'none' },
            shadow: { blur: 14, color: 'rgba(0,0,0,0.6)' },
            color: '#fde68a',
            fontWeight: '700',
            textTransform: 'uppercase',
            textAnimation: { type: 'none' }
        }
    },
    {
        id: 'builtin-cyber-glitch',
        name: 'Cyber Brackets',
        category: 'text',
        preview: { bg: 'rgba(3,7,18,0.85)', border: '1px solid #22d3ee', radius: '2px', color: '#22d3ee' },
        style: {
            background: 'rgba(3,7,18,0.75)',
            gradient: { enabled: false },
            blur: 6,
            borderWidth: 3,
            borderStyle: 'corner-brackets',
            borderColor: '#22d3ee',
            borderRadius: 0,
            borderRadiusCorners: { enabled: false, tl: 0, tr: 0, br: 0, bl: 0 },
            borderGlow: { enabled: false },
            borderGradient: { enabled: false },
            borderAnimation: { type: 'none' },
            color: '#f8fafc',
            fontWeight: '700',
            textAnimation: { type: 'glitch', speed: 2.5, intensity: 45 }
        }
    },
    {
        id: 'builtin-shimmer-title',
        name: 'Metallic Wave',
        category: 'text',
        preview: { bg: 'rgba(15,23,42,0.82)', border: '1px solid rgba(148,163,184,0.35)', radius: '8px', color: '#7dd3fc' },
        style: {
            background: 'rgba(15,23,42,0.72)',
            gradient: { enabled: false },
            blur: 10,
            borderWidth: 1,
            borderStyle: 'solid',
            borderColor: 'rgba(148,163,184,0.35)',
            borderRadius: 12,
            borderRadiusCorners: { enabled: false, tl: 12, tr: 12, br: 12, bl: 12 },
            borderGlow: { enabled: false },
            borderGradient: { enabled: false },
            borderAnimation: { type: 'none' },
            color: '#cbd5e1',
            fontWeight: '700',
            textGradient: { enabled: true, type: 'linear', angle: 115, from: '#cbd5e1', mid: '#ffffff', to: '#94a3b8', animate: true, speed: 4 },
            textAnimation: { type: 'char-wave', speed: 2.8, intensity: 45 }
        }
    },
    {
        id: 'builtin-mecha-hud',
        name: 'Mecha Tech HUD',
        category: 'box',
        preview: { bg: '#060d18', border: '2px solid #38bdf8', shadow: '0 0 8px rgba(56,189,248,0.45)', radius: '2px', color: '#e0f2fe' },
        style: {
            background: 'rgba(6,13,24,0.86)',
            gradient: { enabled: false },
            blur: 8,
            borderWidth: 4,
            borderStyle: 'tech-hud',
            borderColor: '#0284c7',
            borderRadius: 4,
            borderRadiusCorners: { enabled: false, tl: 4, tr: 4, br: 4, bl: 4 },
            borderGlow: { enabled: true, color: '#38bdf8', blur: 12, neon: false, inner: false },
            borderGradient: { enabled: false },
            borderAnimation: { type: 'dual-beam', speed: 3.5, size: 35, color2: '#7dd3fc' },
            color: '#e0f2fe',
            fontWeight: '700',
            textTransform: 'uppercase',
            textAnimation: { type: 'none' }
        }
    },
    {
        id: 'builtin-royal-filigree',
        name: 'Royal Filigree',
        category: 'box',
        preview: { bg: '#16110a', border: '2px double #f59e0b', shadow: '0 0 8px rgba(245,158,11,0.35)', radius: '4px', color: '#fef3c7' },
        style: {
            background: 'rgba(22,17,10,0.9)',
            gradient: { enabled: false },
            blur: 0,
            borderWidth: 5,
            borderStyle: 'ornate-filigree',
            borderColor: '#f59e0b',
            borderRadius: 4,
            borderRadiusCorners: { enabled: false, tl: 4, tr: 4, br: 4, bl: 4 },
            borderGlow: { enabled: false },
            borderGradient: { enabled: true, type: 'linear', angle: 135, from: '#b45309', mid: '#fef08a', to: '#f59e0b', animate: true, speed: 6 },
            borderAnimation: { type: 'none' },
            shadow: { blur: 18, color: 'rgba(0,0,0,0.65)' },
            color: '#fef3c7',
            fontWeight: '700',
            textAnimation: { type: 'none' }
        }
    }
];

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

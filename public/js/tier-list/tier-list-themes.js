/**
 * StreamPulse Tier List Maker — Shared Themes, Custom Fonts & Color Helpers
 * Integrates cleanly with window.OverlayThemes and window.OverlayFonts so
 * theme presets, custom saved themes, Google Fonts, and Asset Library fonts
 * work uniformly across all StreamPulse overlays and studios.
 */

import { $, esc, showToast } from './tier-list-state.js';

export const TIER_LIST_BUILT_IN_THEMES = [
    { id: 'dark', name: 'Dark Card (Default)' },
    { id: 'transparent', name: 'Transparent / Clean' },
    { id: 'light', name: 'Clean Light Contrast' },
    { id: 'glass', name: 'Frosted Glass' },
    { id: 'solid', name: 'Opaque Solid' },
    { id: 'minimal-dark', name: 'OLED Deep Black' },
    { id: 'fgc-evo', name: 'EVO Championship' },
    { id: 'championship', name: 'Championship Gold' },
    { id: 'cyber', name: 'Cyberpunk Neon' },
    { id: 'neon', name: 'Neon Glow' },
    { id: 'retro', name: 'Retro Arcade' },
    { id: 'ember', name: 'Ember Flame' },
    { id: 'aurora', name: 'Aurora Borealis' },
    { id: 'ocean', name: 'Deep Ocean' },
    { id: 'sunset', name: 'Neon Sunset' },
    { id: 'violet', name: 'Ultra Violet' },
    { id: 'forest', name: 'Emerald Forest' },
    { id: 'border', name: 'Border Framing' },
    { id: 'pill', name: 'Pill Capsule' }
];

export const BUILT_IN_THEME_ID_SET = new Set(TIER_LIST_BUILT_IN_THEMES.map(t => t.id));

let cachedAssetFontsList = [];
let fontBrowser = null;
let activeFontPickerTarget = 'content';
let fontSelectCallback = null;
let themeApplyCallback = null;
let themeDeletedCallback = null;
let themeSnapshotGetter = null;
let themeSavedCallback = null;

export function resolveTierThemePalette(styleId, customThemeId = '') {
    const id = String(styleId || 'dark').trim().toLowerCase();
    if (id === 'dark') {
        return {
            id: 'dark',
            bg: 'rgba(13, 17, 23, 0.92)',
            rowBg: 'rgba(13, 17, 23, 0.7)',
            border: 'rgba(255, 255, 255, 0.12)',
            text: '#f0f6fc',
            muted: '#8b949e',
            accent: '#3b82f6',
            radius: '10px',
            backdrop: 'none',
            font: '',
            headingFont: '',
            weight: '',
            textTransform: '',
            outline: '',
            isLight: false,
            isTransparent: false
        };
    }
    if (id === 'light' || id === 'clean-light') {
        return {
            id: 'light',
            bg: '#ffffff',
            rowBg: '#f8fafc',
            border: 'rgba(0, 0, 0, 0.12)',
            text: '#0f172a',
            muted: '#64748b',
            accent: '#0969da',
            radius: '10px',
            backdrop: 'none',
            font: '',
            headingFont: '',
            weight: '',
            textTransform: '',
            outline: '',
            isLight: true,
            isTransparent: false
        };
    }
    if (id === 'transparent') {
        return {
            id: 'transparent',
            bg: 'transparent',
            rowBg: 'rgba(13, 17, 23, 0.68)',
            border: 'transparent',
            text: '#f0f6fc',
            muted: '#cbd5e1',
            accent: '#38bdf8',
            radius: '10px',
            backdrop: 'none',
            font: '',
            headingFont: '',
            weight: '',
            textTransform: '',
            outline: '',
            isLight: false,
            isTransparent: true
        };
    }
    const lookupKey = (id === 'custom' && customThemeId) ? customThemeId : id;
    const matched = window.OverlayThemes?.getTheme?.(lookupKey);
    if (matched) {
        return {
            id: matched.id || id,
            bg: matched.bg || matched.cardBg || 'rgba(13, 17, 23, 0.92)',
            rowBg: matched.cardBg || 'rgba(13, 17, 23, 0.72)',
            border: matched.border || 'rgba(255, 255, 255, 0.14)',
            text: matched.text || '#f0f6fc',
            muted: matched.muted || '#8b949e',
            accent: matched.accent || '#3b82f6',
            radius: matched.radius || '10px',
            backdrop: matched.backdrop || 'none',
            font: matched.font || '',
            headingFont: matched.headingFont || '',
            weight: matched.weight || '',
            textTransform: matched.textTransform || '',
            outline: matched.outline || '',
            isLight: matched.id === 'clean-light',
            isTransparent: matched.bg === 'transparent'
        };
    }
    return resolveTierThemePalette('dark');
}

export function populateThemeDropdown(selectEl) {
    if (!selectEl) return;
    const prevValue = selectEl.value;
    selectEl.innerHTML = '';

    const builtInGroup = document.createElement('optgroup');
    builtInGroup.label = 'Built-in Themes';
    TIER_LIST_BUILT_IN_THEMES.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = t.name;
        builtInGroup.appendChild(opt);
    });
    selectEl.appendChild(builtInGroup);

    const customThemes = window.OverlayThemes?.getCustomThemes?.() || {};
    const customList = Object.values(customThemes);
    if (customList.length > 0) {
        const customGroup = document.createElement('optgroup');
        customGroup.label = 'Custom Saved Themes';
        customList.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t.id;
            opt.textContent = `${t.name || t.id} (Custom)`;
            customGroup.appendChild(opt);
        });
        selectEl.appendChild(customGroup);
    }

    if (prevValue) {
        const exists = Array.from(selectEl.options).some(o => o.value === prevValue);
        if (exists) selectEl.value = prevValue;
    }
}

export function extractHexAndAlpha(colorStr, fallbackHex = '#0d1117', fallbackAlpha = 100) {
    const raw = String(colorStr ?? '').trim();
    if (!raw) return { hex: fallbackHex, alpha: fallbackAlpha };
    if (raw.toLowerCase() === 'transparent') return { hex: fallbackHex, alpha: 0 };

    const shortHex = raw.match(/^#([0-9a-f]{3})$/i);
    if (shortHex) {
        const [r, g, b] = shortHex[1].split('');
        return { hex: `#${r}${r}${g}${g}${b}${b}`.toLowerCase(), alpha: 100 };
    }
    const fullHex = raw.match(/^#([0-9a-f]{6})$/i);
    if (fullHex) return { hex: `#${fullHex[1].toLowerCase()}`, alpha: 100 };

    const hex8 = raw.match(/^#([0-9a-f]{6})([0-9a-f]{2})$/i);
    if (hex8) {
        const alpha = Math.round((parseInt(hex8[2], 16) / 255) * 100);
        return { hex: `#${hex8[1].toLowerCase()}`, alpha };
    }

    const rgbaMatch = raw.match(/^rgba?\(\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})(?:\s*[,/]\s*([0-9.]+%?))?\s*\)$/i);
    if (rgbaMatch) {
        const clampByte = n => Math.min(255, Math.max(0, Math.round(Number(n) || 0)));
        const toHex = n => clampByte(n).toString(16).padStart(2, '0');
        const hex = `#${toHex(rgbaMatch[1])}${toHex(rgbaMatch[2])}${toHex(rgbaMatch[3])}`;
        let alpha = 100;
        if (rgbaMatch[4] !== undefined) {
            const aRaw = rgbaMatch[4];
            alpha = aRaw.endsWith('%')
                ? Math.round(Math.min(100, Math.max(0, parseFloat(aRaw))))
                : Math.round(Math.min(1, Math.max(0, parseFloat(aRaw))) * 100);
        }
        return { hex, alpha };
    }

    const gradHex = raw.match(/#([0-9a-f]{6})/i);
    if (gradHex) return { hex: `#${gradHex[1].toLowerCase()}`, alpha: 100 };

    return { hex: fallbackHex, alpha: fallbackAlpha };
}

export function hexAlphaToCss(hex, alphaPct = 100) {
    const pct = Math.min(100, Math.max(0, Math.round(Number(alphaPct))));
    const parsed = extractHexAndAlpha(hex, '#0d1117', 100).hex;
    if (pct <= 0) return 'transparent';
    if (pct >= 100) return parsed;
    const r = parseInt(parsed.slice(1, 3), 16);
    const g = parseInt(parsed.slice(3, 5), 16);
    const b = parseInt(parsed.slice(5, 7), 16);
    const alpha = Math.round((pct / 100) * 100) / 100;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function syncColorInputPair(textEl, pickerEl, fallbackHex = '#0d1117', opacitySliderEl = null, opacityValEl = null) {
    if (!textEl) return;
    const raw = textEl.value.trim();
    const fallbackAlpha = opacitySliderEl ? Number(opacitySliderEl.dataset.defaultAlpha || 100) : 100;
    const parsed = extractHexAndAlpha(raw, fallbackHex, fallbackAlpha);
    if (pickerEl) pickerEl.value = parsed.hex;
    if (opacitySliderEl) opacitySliderEl.value = String(parsed.alpha);
    if (opacityValEl) opacityValEl.textContent = raw ? `${parsed.alpha}%` : 'Auto';
}

export async function populateFontDatalist() {
    const list = $('overlay-fonts-list');
    if (!list) return;

    let fontEntries = [];
    try {
        if (window.OverlayFonts?.getDeduplicatedFontFamilies) {
            fontEntries = await window.OverlayFonts.getDeduplicatedFontFamilies();
        } else if (window.OverlayFonts) {
            const assets = await window.OverlayFonts.getAssetFonts?.() || [];
            fontEntries = [
                ...assets.map(a => ({ name: (a.family || a.label || a.name || '').replace(/['"]/g, '').trim(), source: 'asset', raw: a })),
                ...(window.OverlayFonts.google || []).map(g => ({ name: g, source: 'google' })),
                ...(window.OverlayFonts.system || []).map(s => ({ name: s, source: 'system' }))
            ];
        }
    } catch {
        fontEntries = [];
    }

    cachedAssetFontsList = fontEntries.filter(e => e.source === 'asset' && e.raw).map(e => e.raw);
    try {
        const allAssets = await window.OverlayFonts?.getAssetFonts?.();
        if (Array.isArray(allAssets)) cachedAssetFontsList = allAssets;
    } catch {}

    list.innerHTML = '';
    const existingStyle = $('tl-asset-font-faces');
    if (existingStyle) existingStyle.remove();
    const cssRules = [];

    fontEntries.forEach(entry => {
        if (!entry.name) return;
        const opt = document.createElement('option');
        opt.value = entry.name;
        list.appendChild(opt);

        if (entry.source === 'asset' && entry.raw?.url) {
            const safeFam = entry.name.replace(/'/g, '');
            if (typeof FontFace !== 'undefined' && document.fonts) {
                try {
                    const ff = new FontFace(safeFam, `url("${entry.raw.url.replace(/"/g, '%22')}")`);
                    ff.load().then(loaded => document.fonts.add(loaded)).catch(() => {});
                } catch {}
            }
            cssRules.push(`@font-face { font-family: '${safeFam}'; src: url('${entry.raw.url}'); font-display: swap; }`);
        }
    });

    if (cssRules.length > 0) {
        const styleEl = document.createElement('style');
        styleEl.id = 'tl-asset-font-faces';
        styleEl.textContent = cssRules.join('\n');
        document.head.appendChild(styleEl);
    }

    updateAssetFontBadges();
}

export function updateAssetFontBadges() {
    const assetNames = (cachedAssetFontsList || []).map(a =>
        (a.family || a.label || (a.name ? a.name.replace(/\.[a-z0-9]+$/i, '') : '')).trim().toLowerCase()
    ).filter(Boolean);

    const hVal = $('overlay-opt-heading-font')?.value?.trim().toLowerCase();
    const cVal = $('overlay-opt-font')?.value?.trim().toLowerCase();
    const hBadge = $('tl-heading-font-asset-badge');
    const cBadge = $('tl-font-asset-badge');

    if (hBadge) hBadge.hidden = !(hVal && assetNames.includes(hVal));
    if (cBadge) cBadge.hidden = !(cVal && assetNames.includes(cVal));
}

export async function openAssetFontPicker(target, onSelect) {
    activeFontPickerTarget = target === 'heading' ? 'heading' : 'content';
    fontSelectCallback = typeof onSelect === 'function' ? onSelect : null;

    const modal = $('modal-asset-font-picker');
    if (!modal) return;

    if (!fontBrowser) {
        try {
            const { mountAssetBrowser } = await import('../asset-browser.js');
            const controls = document.createElement('div');
            controls.id = 'tl-font-browser-controls';
            $('asset-font-picker-list')?.before(controls);
            fontBrowser = mountAssetBrowser({ container: controls, key: 'tier-list-fonts', onChange: renderAssetFontPickerList });
        } catch {}
    }
    if (!cachedAssetFontsList.length) {
        await populateFontDatalist();
    }
    renderAssetFontPickerList();
    modal.classList.add('open');
}

export function closeAssetFontPicker() {
    fontBrowser?.cancel();
    $('modal-asset-font-picker')?.classList.remove('open');
}

export async function refreshAssetFontsAndPicker() {
    showToast('Refreshing Asset Library fonts…');
    await populateFontDatalist();
    renderAssetFontPickerList();
}

export function renderAssetFontPickerList() {
    const container = $('asset-font-picker-list');
    if (!container) return;

    const filtered = fontBrowser ? fontBrowser.filter(cachedAssetFontsList || []) : (cachedAssetFontsList || []);
    const fontMap = new Map();
    filtered.forEach(a => {
        const fam = (a.family || a.label || (a.name ? a.name.replace(/\.[a-z0-9]+$/i, '') : '')).replace(/['"]/g, '').trim();
        if (!fam) return;
        const key = fam.toLowerCase();
        const ext = a.name ? a.name.split('.').pop().toUpperCase() : 'FONT';
        if (!fontMap.has(key)) {
            fontMap.set(key, { family: fam, formats: [ext], asset: a });
        } else {
            const existing = fontMap.get(key);
            if (!existing.formats.includes(ext)) existing.formats.push(ext);
        }
    });

    if (fontMap.size === 0) {
        if (cachedAssetFontsList?.length) {
            container.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--text-muted);">No fonts match these filters. Clear search or tag filter to see more fonts.</div>';
            return;
        }
        container.innerHTML = `
            <div style="text-align:center;padding:2.25rem 1rem;color:var(--text-muted);">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" style="margin-bottom:0.6rem;opacity:0.65;"><path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/></svg>
                <div style="font-weight:700;font-size:0.95rem;color:var(--text);">No Custom Fonts in Asset Library</div>
                <div style="font-size:0.78rem;margin-top:0.35rem;max-width:380px;margin-inline:auto;line-height:1.45;">Upload .ttf, .otf, .woff, or .woff2 fonts in the Asset Library to use them in your tier list overlay and PNG exports.</div>
                <div style="margin-top:1rem;">
                    <a href="/assets.html" target="_blank" rel="noopener noreferrer" class="btn primary sm" style="text-decoration:none;">
                        <svg class="ico" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                        <span>Open Asset Library</span>
                    </a>
                </div>
            </div>
        `;
        return;
    }

    const specimenText = activeFontPickerTarget === 'heading'
        ? 'COMMUNITY TIER LIST • S-TIER TOP PICKS'
        : 'Chrono Trigger • Elden Ring • Hollow Knight';

    container.innerHTML = Array.from(fontMap.values()).map(f => {
        const fam = f.family;
        const safeFam = fam.replace(/'/g, '');
        const formatBadges = f.formats.map(fmt =>
            `<span class="badge" style="font-size:10px;padding:1px 6px;">${esc(fmt)}</span>`
        ).join(' ');
        return `
            <div class="tl-font-specimen-card">
                <div class="tl-font-specimen-head">
                    <div style="display:flex;align-items:center;gap:0.45rem;min-width:0;">
                        <strong style="font-size:0.88rem;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(fam)}</strong>
                        ${formatBadges}
                    </div>
                    <button type="button" class="btn primary sm" data-pick-asset-font="${esc(fam)}">
                        <svg class="ico" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                        <span>Use Font</span>
                    </button>
                </div>
                <div class="tl-font-specimen-sample" style="font-family:'${safeFam}',sans-serif;">
                    ${esc(specimenText)}
                </div>
            </div>
        `;
    }).join('');
}

export function openSaveThemeModal(getSnapshot, onSaved) {
    themeSnapshotGetter = getSnapshot;
    themeSavedCallback = onSaved;
    const modal = $('modal-save-theme');
    const nameInput = $('save-theme-name');
    const summary = $('save-theme-preview-summary');
    if (!modal || typeof getSnapshot !== 'function') return;

    const snap = getSnapshot() || {};
    if (nameInput) nameInput.value = '';

    if (summary) {
        const palette = resolveTierThemePalette(snap.theme || 'dark', snap.customThemeId);
        const effBg = snap.backgroundColor || palette.bg;
        const effRowBg = snap.rowBackgroundColor || palette.rowBg;
        const effBorder = snap.borderColor || palette.border;
        const effText = snap.textColor || palette.text;
        const effAccent = snap.accentColor || palette.accent;
        const headFont = snap.headingFont || snap.fontFamily || palette.headingFont || 'Theme Default';
        const bodyFont = snap.fontFamily || palette.font || 'Theme Default';
        const radius = snap.borderRadius || palette.radius || '10px';

        summary.innerHTML = `
            <div style="display:flex;flex-wrap:wrap;gap:0.4rem;font-size:11px;">
                <span class="badge">Heading: <strong>${esc(headFont)}</strong></span>
                <span class="badge">Captions: <strong>${esc(bodyFont)}</strong></span>
                <span class="badge">Radius: <strong>${esc(radius)}</strong></span>
            </div>
            <div style="display:flex;align-items:center;gap:0.75rem;margin-top:0.55rem;flex-wrap:wrap;font-size:11px;color:var(--text-muted);">
                <span style="display:inline-flex;align-items:center;gap:4px;"><span style="width:12px;height:12px;border-radius:3px;background:${esc(effAccent)};border:1px solid rgba(255,255,255,0.2);"></span> Accent</span>
                <span style="display:inline-flex;align-items:center;gap:4px;"><span style="width:12px;height:12px;border-radius:3px;background:${esc(effBg)};border:1px solid rgba(255,255,255,0.2);"></span> Board</span>
                <span style="display:inline-flex;align-items:center;gap:4px;"><span style="width:12px;height:12px;border-radius:3px;background:${esc(effRowBg)};border:1px solid rgba(255,255,255,0.2);"></span> Rows</span>
                <span style="display:inline-flex;align-items:center;gap:4px;"><span style="width:12px;height:12px;border-radius:3px;background:${esc(effBorder)};border:1px solid rgba(255,255,255,0.2);"></span> Border</span>
                <span style="display:inline-flex;align-items:center;gap:4px;"><span style="width:12px;height:12px;border-radius:3px;background:${esc(effText)};border:1px solid rgba(255,255,255,0.2);"></span> Text</span>
            </div>
        `;
    }

    modal.classList.add('open');
    setTimeout(() => nameInput?.focus(), 40);
}

export function closeSaveThemeModal() {
    $('modal-save-theme')?.classList.remove('open');
}

export async function submitSaveTheme(e) {
    if (e?.preventDefault) e.preventDefault();
    const nameInput = $('save-theme-name');
    const name = nameInput?.value?.trim() || '';
    if (!name || typeof themeSnapshotGetter !== 'function') return;

    const snap = themeSnapshotGetter() || {};
    const basePalette = resolveTierThemePalette(snap.theme || 'dark', snap.customThemeId);
    const themeObj = {
        name,
        headingFont: snap.headingFont || basePalette.headingFont || '',
        font: snap.fontFamily || basePalette.font || '',
        weight: snap.fontWeight || basePalette.weight || '',
        scale: snap.fontScale && Number(snap.fontScale) !== 1 ? String(snap.fontScale) : '',
        textTransform: snap.textTransform || basePalette.textTransform || '',
        outline: snap.textOutline || basePalette.outline || '',
        radius: snap.borderRadius || basePalette.radius || '',
        backdrop: snap.backdropBlur === '0px'
            ? 'none'
            : (snap.backdropBlur ? `blur(${snap.backdropBlur})` : (basePalette.backdrop || '')),
        bg: snap.backgroundColor || basePalette.bg || '',
        cardBg: snap.rowBackgroundColor || basePalette.rowBg || '',
        border: snap.borderColor || basePalette.border || '',
        text: snap.textColor || basePalette.text || '',
        muted: snap.mutedColor || basePalette.muted || '',
        accent: snap.accentColor || basePalette.accent || ''
    };

    const saved = window.OverlayThemes?.saveCustomTheme?.(themeObj);
    if (saved) {
        closeSaveThemeModal();
        if (typeof themeSavedCallback === 'function') {
            await themeSavedCallback(saved);
        }
        showToast(`Custom theme "${name}" saved!`);
    } else {
        showToast('Failed to save custom theme');
    }
}

export function openManageThemesModal(onApply, onDeleted) {
    themeApplyCallback = onApply;
    themeDeletedCallback = onDeleted;
    renderManageThemesList();
    $('modal-manage-themes')?.classList.add('open');
}

export function closeManageThemesModal() {
    $('modal-manage-themes')?.classList.remove('open');
}

export function renderManageThemesList() {
    const container = $('manage-themes-list');
    if (!container) return;
    const themes = window.OverlayThemes?.getCustomThemes?.() || {};
    const list = Object.values(themes);

    if (list.length === 0) {
        container.innerHTML = `
            <div style="text-align:center;padding:2rem 1rem;color:var(--text-muted);">
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" style="margin-bottom:0.5rem;opacity:0.6;"><circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>
                <div style="font-weight:700;font-size:0.9rem;color:var(--text);">No Custom Themes Saved</div>
                <div style="font-size:0.78rem;margin-top:0.35rem;max-width:360px;margin-inline:auto;">Customize fonts, framing, and colors in the Overlay &amp; Theming tab, then click <strong>Save Theme</strong> to reuse your style anywhere in StreamPulse.</div>
            </div>
        `;
        return;
    }

    container.innerHTML = list.map(t => {
        const fontLabel = t.headingFont || t.font || 'System Default';
        const weightLabel = t.weight ? `(${t.weight})` : '';
        const radiusLabel = t.radius || '10px radius';
        return `
            <div class="tl-theme-manage-card">
                <div style="display:flex;flex-direction:column;gap:0.25rem;min-width:0;">
                    <div style="font-weight:700;font-size:0.88rem;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(t.name || t.id)}</div>
                    <div style="display:flex;align-items:center;gap:0.45rem;font-size:11px;color:var(--text-muted);flex-wrap:wrap;">
                        <span>${esc(fontLabel)} ${esc(weightLabel)}</span>
                        <span>&middot;</span>
                        <span>${esc(radiusLabel)}</span>
                        <span style="display:inline-flex;align-items:center;gap:3px;margin-left:2px;">
                            ${t.accent ? `<span style="width:10px;height:10px;border-radius:2px;background:${esc(t.accent)};border:1px solid rgba(255,255,255,0.2);"></span>` : ''}
                            ${t.bg ? `<span style="width:10px;height:10px;border-radius:2px;background:${esc(t.bg)};border:1px solid rgba(255,255,255,0.2);"></span>` : ''}
                            ${t.cardBg ? `<span style="width:10px;height:10px;border-radius:2px;background:${esc(t.cardBg)};border:1px solid rgba(255,255,255,0.2);"></span>` : ''}
                            ${t.text ? `<span style="width:10px;height:10px;border-radius:2px;background:${esc(t.text)};border:1px solid rgba(255,255,255,0.2);"></span>` : ''}
                        </span>
                    </div>
                </div>
                <div style="display:flex;align-items:center;gap:0.4rem;flex-shrink:0;">
                    <button type="button" class="btn primary sm" data-apply-custom-theme="${esc(t.id)}">Apply</button>
                    <button type="button" class="btn danger sm" data-delete-custom-theme="${esc(t.id)}" title="Delete Theme">
                        <svg class="ico" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

export function initThemeModals() {
    $('form-save-theme')?.addEventListener('submit', submitSaveTheme);

    $('asset-font-picker-list')?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-pick-asset-font]');
        if (!btn) return;
        const fam = btn.dataset.pickAssetFont;
        if (fam && typeof fontSelectCallback === 'function') {
            fontSelectCallback(fam, activeFontPickerTarget);
        }
        closeAssetFontPicker();
        showToast(`Applied font "${fam}" from Asset Library!`);
    });

    $('btn-refresh-asset-fonts')?.addEventListener('click', refreshAssetFontsAndPicker);

    $('manage-themes-list')?.addEventListener('click', async (e) => {
        const applyBtn = e.target.closest('[data-apply-custom-theme]');
        if (applyBtn) {
            const themeId = applyBtn.dataset.applyCustomTheme;
            const theme = window.OverlayThemes?.getTheme?.(themeId);
            if (theme && typeof themeApplyCallback === 'function') {
                await themeApplyCallback(theme);
            }
            closeManageThemesModal();
            return;
        }
        const delBtn = e.target.closest('[data-delete-custom-theme]');
        if (delBtn) {
            const themeId = delBtn.dataset.deleteCustomTheme;
            if (!confirm('Are you sure you want to delete this custom theme?')) return;
            window.OverlayThemes?.deleteCustomTheme?.(themeId);
            renderManageThemesList();
            if (typeof themeDeletedCallback === 'function') {
                await themeDeletedCallback(themeId);
            }
            showToast('Custom theme deleted');
        }
    });
}

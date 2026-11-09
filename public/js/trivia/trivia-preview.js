/**
 * StreamPulse Trivia Studio — Live Preview & OBS Synchronization
 * Manages resolution scaling, backdrops, two-way color/font binding,
 * and 60fps zero-lag postMessage preview updates.
 */

export const PRESET_DEFAULTS = {
    'modern': {
        style: 'cards',
        cardBg: '#0d1117ee',
        cardBorder: '#38bdf8',
        choiceBg: '#161b22dd',
        choiceBorder: '#30363d',
        accent: '#38bdf8',
        correct: '#3fb950',
        blur: 16,
        catColor: '#a855f7',
        hintColor: '#94a3b8',
        funfactColor: '#eab308',
        collapse: false
    },
    'arcade': {
        style: 'cards',
        cardBg: '#090514f0',
        cardBorder: '#ec4899',
        choiceBg: '#180e2edd',
        choiceBorder: '#8b5cf6',
        accent: '#f43f5e',
        correct: '#10b981',
        blur: 14,
        catColor: '#fbbf24',
        hintColor: '#c084fc',
        funfactColor: '#f472b6',
        collapse: false
    },
    'esports': {
        style: 'cards',
        cardBg: '#0b0f19f2',
        cardBorder: '#ef4444',
        choiceBg: '#131b2edd',
        choiceBorder: '#3b82f6',
        accent: '#f59e0b',
        correct: '#22c55e',
        blur: 18,
        catColor: '#60a5fa',
        hintColor: '#94a3b8',
        funfactColor: '#fbbf24',
        collapse: false
    },
    'minimal': {
        style: 'cards',
        cardBg: '#0a0a0cf5',
        cardBorder: '#27272a',
        choiceBg: '#18181bdd',
        choiceBorder: '#3f3f46',
        accent: '#e4e4e7',
        correct: '#22c55e',
        blur: 12,
        catColor: '#a1a1aa',
        hintColor: '#71717a',
        funfactColor: '#d4d4d8',
        collapse: false
    },
    'broadcast-text': {
        style: 'text',
        cardBg: '#00000000',
        cardBorder: '#00000000',
        choiceBg: '#00000000',
        choiceBorder: '#00000000',
        accent: '#38bdf8',
        correct: '#4ade80',
        blur: 0,
        catColor: '#c084fc',
        hintColor: '#94a3b8',
        funfactColor: '#facc15',
        collapse: true
    }
};

export const themeInputIds = [
    'obs-mode', 'obs-view', 'obs-theme', 'cfg-theme-preset', 'cfg-theme-card-style',
    'cfg-theme-question-label', 'cfg-theme-answer-label', 'cfg-theme-counter-format', 'cfg-theme-phase-transform',
    'cfg-theme-header-size', 'cfg-theme-header-size-custom', 'cfg-theme-phase-font',
    'cfg-theme-question-font', 'cfg-theme-question-weight',
    'cfg-theme-header-font', 'cfg-theme-header-weight',
    'cfg-theme-choice-font', 'cfg-theme-choice-weight',
    'cfg-theme-funfact-font', 'cfg-theme-funfact-weight',
    'cfg-theme-card-bg', 'cfg-theme-card-border',
    'cfg-theme-choice-bg', 'cfg-theme-choice-border',
    'cfg-theme-accent-color', 'cfg-theme-correct-color',
    'cfg-theme-phase-question-color', 'cfg-theme-phase-answer-color',
    'cfg-theme-category-color', 'cfg-theme-hint-color', 'cfg-theme-funfact-color',
    'cfg-theme-collapse-incorrect',
    'cfg-chat-voting',
    'cfg-elem-phase-indicator', 'cfg-elem-category', 'cfg-elem-question-number', 'cfg-elem-timer',
    'cfg-elem-letter-badges', 'cfg-elem-votes', 'cfg-elem-percentages',
    'cfg-elem-chat-hint', 'cfg-elem-funfact'
];

export const colorInputPairs = [
    'cfg-theme-card-bg',
    'cfg-theme-card-border',
    'cfg-theme-choice-bg',
    'cfg-theme-choice-border',
    'cfg-theme-accent-color',
    'cfg-theme-correct-color',
    'cfg-theme-phase-question-color',
    'cfg-theme-phase-answer-color',
    'cfg-theme-category-color',
    'cfg-theme-hint-color',
    'cfg-theme-funfact-color'
];

let previewWidth = 1920;
let previewHeight = 1080;
let previewBackdrop = 'solid';
let previewPhase = 'auto';
let previewSample = true;
let activeTab = 'studio';

export function setActiveTab(tab) {
    activeTab = tab;
}

export function normalizeColor(val) {
    if (!val || typeof val !== 'string') return null;
    let s = val.trim();
    if (s.toLowerCase() === 'transparent') return '#00000000';
    if (!s.startsWith('#') && /^[0-9a-fA-F]{3,8}$/.test(s)) {
        s = '#' + s;
    }
    if (/^#[0-9a-fA-F]{4}$/.test(s)) {
        return ('#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3] + s[4] + s[4]).toUpperCase();
    }
    if (/^#[0-9a-fA-F]{3}$/.test(s)) {
        return ('#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3]).toUpperCase();
    }
    if (/^#[0-9a-fA-F]{6}$/.test(s)) {
        return s.toUpperCase();
    }
    if (/^#[0-9a-fA-F]{8}$/.test(s)) {
        return s.toUpperCase();
    }
    if (/^rgba?\s*\(.*\)$/i.test(s)) {
        return s;
    }
    return null;
}

export function toRgbHex(colorVal) {
    if (!colorVal || typeof colorVal !== 'string') return '#000000';
    let s = colorVal.trim();
    if (s.toLowerCase() === 'transparent') return '#000000';
    if (!s.startsWith('#') && /^[0-9a-fA-F]{3,8}$/.test(s)) s = '#' + s;
    if (/^#[0-9a-fA-F]{8}$/.test(s)) {
        return ('#' + s.slice(1, 7)).toLowerCase();
    }
    if (/^#[0-9a-fA-F]{6}$/.test(s)) {
        return s.toLowerCase();
    }
    if (/^#[0-9a-fA-F]{4}$/.test(s)) {
        return ('#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3]).toLowerCase();
    }
    if (/^#[0-9a-fA-F]{3}$/.test(s)) {
        return ('#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3]).toLowerCase();
    }
    return '#000000';
}

export function setFieldColor(id, val, fallback) {
    const rawVal = val || fallback;
    const norm = normalizeColor(rawVal);
    const colorEl = document.getElementById(id);
    const hexEl = document.getElementById(id + '-hex');
    if (!colorEl) return;
    if (norm) {
        colorEl.value = toRgbHex(norm);
        if (hexEl) hexEl.value = norm;
    } else {
        colorEl.value = toRgbHex(fallback);
        if (hexEl) hexEl.value = (fallback || '').toUpperCase();
    }
}

export function getColorFieldValue(id, fallback = '') {
    const hexEl = document.getElementById(id + '-hex');
    const colorEl = document.getElementById(id);
    if (hexEl && hexEl.value.trim()) {
        const norm = normalizeColor(hexEl.value.trim());
        if (norm) return norm;
    }
    if (colorEl && colorEl.value) {
        return colorEl.value.toUpperCase();
    }
    return fallback;
}

export function getHeaderFontSizeValue() {
    const select = document.getElementById('cfg-theme-header-size');
    const custom = document.getElementById('cfg-theme-header-size-custom');
    if (!select) return '';
    if (select.value === 'custom') {
        return custom ? custom.value.trim() : '';
    }
    return select.value;
}

export function setHeaderFontSizeValue(val) {
    const select = document.getElementById('cfg-theme-header-size');
    const custom = document.getElementById('cfg-theme-header-size-custom');
    if (!select || !custom) return;
    if (!val) {
        select.value = '';
        custom.value = '';
        return;
    }
    const standardOptions = Array.from(select.options).map(o => o.value).filter(v => v && v !== 'custom');
    if (standardOptions.includes(val)) {
        select.value = val;
        custom.value = '';
    } else {
        select.value = 'custom';
        custom.value = val;
    }
}

export function setPreviewPhase(phase) {
    previewPhase = phase;
    document.querySelectorAll('.phase-chip-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.phase === phase);
    });
    try { localStorage.setItem('trivia-preview-phase', phase); } catch {}
    updateObsUrl();
}

export function togglePreviewBackdrop() {
    previewBackdrop = (previewBackdrop === 'solid') ? 'checker' : 'solid';
    applyPreviewBackdrop();
}

export function applyPreviewBackdrop() {
    const box = document.getElementById('trivia-preview-box') || document.getElementById('preview-container');
    const btn = document.getElementById('prev-btn-bg') || document.getElementById('prev-btn-backdrop');
    if (!box) return;
    box.classList.toggle('checkerboard', previewBackdrop === 'checker');
    box.classList.toggle('solid-dark', previewBackdrop === 'solid');
    if (btn) {
        btn.textContent = previewBackdrop === 'checker' ? 'Canvas: Checkerboard' : 'Canvas: Dark';
        btn.classList.toggle('active', previewBackdrop === 'checker');
    }
    try { localStorage.setItem('trivia-preview-backdrop', previewBackdrop); } catch {}
}

export function togglePreviewSampleData() {
    previewSample = !previewSample;
    const btn = document.getElementById('prev-btn-sample');
    if (btn) {
        btn.textContent = previewSample ? 'Sample: ON' : 'Sample: OFF';
        btn.classList.toggle('active', previewSample);
    }
    try { localStorage.setItem('trivia-preview-sample', previewSample ? '1' : '0'); } catch {}
    updateObsUrl();
}

export function setPreviewViewport(w, h, btn, mode) {
    previewWidth = w;
    previewHeight = h;
    document.querySelectorAll('.viewport-chip-btn').forEach(c => c.classList.remove('active'));
    if (btn) btn.classList.add('active');

    const modeSelect = document.getElementById('obs-mode');
    if (mode && modeSelect && modeSelect.value !== mode) {
        modeSelect.value = mode;
    }

    try {
        localStorage.setItem('trivia-preview-viewport', JSON.stringify({
            w, h, mode, chipId: btn ? btn.id : null
        }));
    } catch {}

    applyViewportScale();
    updateObsUrl();
}

export function applyViewportScale() {
    const wrapper = document.getElementById('preview-viewport-wrapper');
    const scaler = document.getElementById('preview-viewport-scaler');
    const box = document.getElementById('trivia-preview-box');
    if (!wrapper || !scaler || !box) return;

    const availW = Math.max(280, wrapper.clientWidth - 24);
    const maxAvailH = 540;

    const scale = Math.min(availW / previewWidth, maxAvailH / previewHeight, 1.0);
    const scaledW = Math.round(previewWidth * scale);
    const scaledH = Math.round(previewHeight * scale);

    scaler.style.width = `${scaledW}px`;
    scaler.style.height = `${scaledH}px`;

    box.style.position = 'absolute';
    box.style.top = '0';
    box.style.left = '0';
    box.style.width = `${previewWidth}px`;
    box.style.height = `${previewHeight}px`;
    box.style.transform = `scale(${scale})`;
    box.style.transformOrigin = 'top left';

    const resLabel = document.getElementById('preview-res-label');
    if (resLabel) {
        resLabel.textContent = `${previewWidth}×${previewHeight} (${Math.round(scale * 100)}%)`;
    }
}

export function restorePreviewViewport() {
    try {
        const savedVp = localStorage.getItem('trivia-preview-viewport');
        if (savedVp) {
            const parsed = JSON.parse(savedVp);
            if (parsed.w && parsed.h) {
                previewWidth = parsed.w;
                previewHeight = parsed.h;
                if (parsed.chipId) {
                    const chip = document.getElementById(parsed.chipId);
                    if (chip) {
                        document.querySelectorAll('.viewport-chip-btn').forEach(c => c.classList.remove('active'));
                        chip.classList.add('active');
                    }
                }
                if (parsed.mode) {
                    const modeSelect = document.getElementById('obs-mode');
                    if (modeSelect) modeSelect.value = parsed.mode;
                }
            }
        }
    } catch {}

    try {
        const savedBackdrop = localStorage.getItem('trivia-preview-backdrop');
        if (savedBackdrop) {
            previewBackdrop = savedBackdrop;
            applyPreviewBackdrop();
        }
    } catch {}

    try {
        const savedSample = localStorage.getItem('trivia-preview-sample');
        if (savedSample !== null) {
            previewSample = savedSample === '1';
            const btn = document.getElementById('prev-btn-sample');
            if (btn) {
                btn.textContent = previewSample ? 'Sample: ON' : 'Sample: OFF';
                btn.classList.toggle('active', previewSample);
            }
        }
    } catch {}
}

export function updateObsUrl() {
    const mode = document.getElementById('obs-mode')?.value || 'full';
    const view = document.getElementById('obs-view')?.value || 'auto';
    const theme = document.getElementById('cfg-theme-preset')?.value || document.getElementById('obs-theme')?.value || 'modern';
    const cardStyle = document.getElementById('cfg-theme-card-style')?.value || 'cards';
    const scale = document.getElementById('cfg-theme-scale')?.value || '1';
    const accent = getColorFieldValue('cfg-theme-accent-color');
    const correct = getColorFieldValue('cfg-theme-correct-color');
    const defs = PRESET_DEFAULTS[theme] || {};

    let url = `${window.location.origin}/overlays/trivia.html?layout=${mode}&theme=${theme}&style=${cardStyle}`;
    if (view && view !== 'auto') {
        url += `&view=${view}`;
    }
    if (scale && scale !== '1') {
        url += `&scale=${scale}`;
    }

    // Custom accent & correct colors
    if (accent && accent.toLowerCase() !== (defs.accent || '#3b82f6').toLowerCase()) {
        url += `&accent=${encodeURIComponent(accent)}`;
    }
    if (correct && correct.toLowerCase() !== (defs.correct || '#22c55e').toLowerCase()) {
        url += `&correct=${encodeURIComponent(correct)}`;
    }

    // Glass panels & borders
    const cardBg = getColorFieldValue('cfg-theme-card-bg');
    if (cardBg && cardBg.toLowerCase() !== (defs.cardBg || '#0d1117').toLowerCase()) {
        url += `&cardbg=${encodeURIComponent(cardBg)}`;
    }
    const cardBorder = getColorFieldValue('cfg-theme-card-border');
    if (cardBorder && cardBorder.toLowerCase() !== (defs.cardBorder || '#38bdf8').toLowerCase()) {
        url += `&cardborder=${encodeURIComponent(cardBorder)}`;
    }
    const choiceBg = getColorFieldValue('cfg-theme-choice-bg');
    if (choiceBg && choiceBg.toLowerCase() !== (defs.choiceBg || '#161b22').toLowerCase()) {
        url += `&choicebg=${encodeURIComponent(choiceBg)}`;
    }
    const choiceBorder = getColorFieldValue('cfg-theme-choice-border');
    if (choiceBorder && choiceBorder.toLowerCase() !== (defs.choiceBorder || '#30363d').toLowerCase()) {
        url += `&choiceborder=${encodeURIComponent(choiceBorder)}`;
    }
    const blur = parseInt(document.getElementById('cfg-theme-blur')?.value, 10);
    if (!isNaN(blur) && blur !== (defs.blur ?? 12)) {
        url += `&blur=${blur}`;
    }

    // Hint color, category color, fun fact color
    const hintColor = getColorFieldValue('cfg-theme-hint-color');
    if (hintColor && hintColor.toLowerCase() !== (defs.hintColor || '#94a3b8').toLowerCase()) {
        url += `&hintcolor=${encodeURIComponent(hintColor)}`;
    }
    const catColor = getColorFieldValue('cfg-theme-category-color');
    if (catColor && catColor.toLowerCase() !== (defs.catColor || '#a855f7').toLowerCase()) {
        url += `&catcolor=${encodeURIComponent(catColor)}`;
    }
    const ffColor = getColorFieldValue('cfg-theme-funfact-color');
    if (ffColor && ffColor.toLowerCase() !== (defs.funfactColor || '#eab308').toLowerCase()) {
        url += `&fcolor=${encodeURIComponent(ffColor)}`;
    }

    // Fonts & Weights
    const qFont = document.getElementById('cfg-theme-question-font')?.value.trim();
    if (qFont) url += `&qfont=${encodeURIComponent(qFont)}`;
    const qWeight = document.getElementById('cfg-theme-question-weight')?.value;
    if (qWeight) url += `&qweight=${qWeight}`;

    const hFont = document.getElementById('cfg-theme-header-font')?.value.trim();
    if (hFont) url += `&hfont=${encodeURIComponent(hFont)}`;
    const hWeight = document.getElementById('cfg-theme-header-weight')?.value;
    if (hWeight) url += `&hweight=${hWeight}`;

    const cFont = document.getElementById('cfg-theme-choice-font')?.value.trim();
    if (cFont) url += `&cfont=${encodeURIComponent(cFont)}`;
    const cWeight = document.getElementById('cfg-theme-choice-weight')?.value;
    if (cWeight) url += `&cweight=${cWeight}`;

    const ffFont = document.getElementById('cfg-theme-funfact-font')?.value.trim();
    if (ffFont) url += `&ffont=${encodeURIComponent(ffFont)}`;
    const ffWeight = document.getElementById('cfg-theme-funfact-weight')?.value;
    if (ffWeight) url += `&fweight=${ffWeight}`;

    // Header Labels, Casing, Sizing & Phase Font
    const qLabel = document.getElementById('cfg-theme-question-label')?.value.trim();
    if (qLabel && qLabel !== 'Question') url += `&qlabel=${encodeURIComponent(qLabel)}`;
    const aLabel = document.getElementById('cfg-theme-answer-label')?.value.trim();
    if (aLabel && aLabel !== 'Answer') url += `&alabel=${encodeURIComponent(aLabel)}`;
    const cFormat = document.getElementById('cfg-theme-counter-format')?.value;
    if (cFormat && cFormat !== 'full') url += `&cformat=${cFormat}`;
    const pTransform = document.getElementById('cfg-theme-phase-transform')?.value;
    if (pTransform && pTransform !== 'uppercase') url += `&ptransform=${pTransform}`;
    const hSize = getHeaderFontSizeValue();
    if (hSize) url += `&hsize=${encodeURIComponent(hSize)}`;
    const pFont = document.getElementById('cfg-theme-phase-font')?.value.trim();
    if (pFont) url += `&pfont=${encodeURIComponent(pFont)}`;

    // Phase Title Colors
    const qPhaseColor = getColorFieldValue('cfg-theme-phase-question-color');
    if (qPhaseColor) url += `&qcolor=${encodeURIComponent(qPhaseColor)}`;
    const aPhaseColor = getColorFieldValue('cfg-theme-phase-answer-color');
    if (aPhaseColor) url += `&acolor=${encodeURIComponent(aPhaseColor)}`;

    // Chat voting flag
    if (!document.getElementById('cfg-chat-voting')?.checked) {
        url += '&voting=0';
    }

    // Element visibility toggles
    const showPhase = document.getElementById('cfg-elem-phase-indicator')?.checked !== false;
    const showCategory = document.getElementById('cfg-elem-category')?.checked !== false;
    const showCounter = document.getElementById('cfg-elem-question-number')?.checked !== false;
    const showTimer = document.getElementById('cfg-elem-timer')?.checked !== false;
    const showLetters = document.getElementById('cfg-elem-letter-badges')?.checked !== false;
    const showVotes = document.getElementById('cfg-elem-votes')?.checked !== false;
    const showPercentages = document.getElementById('cfg-elem-percentages')?.checked !== false;
    const showHint = document.getElementById('cfg-elem-chat-hint')?.checked !== false;
    const showFunFact = document.getElementById('cfg-elem-funfact')?.checked !== false;
    const collapseIncorrect = Boolean(document.getElementById('cfg-theme-collapse-incorrect')?.checked);

    url += `&phase=${showPhase ? '1' : '0'}`;
    url += `&category=${showCategory ? '1' : '0'}`;
    url += `&counter=${showCounter ? '1' : '0'}`;
    url += `&timer=${showTimer ? '1' : '0'}`;
    url += `&letters=${showLetters ? '1' : '0'}`;
    url += `&votes=${showVotes ? '1' : '0'}`;
    url += `&percentages=${showPercentages ? '1' : '0'}`;
    url += `&hint=${showHint ? '1' : '0'}`;
    url += `&funfact=${showFunFact ? '1' : '0'}`;
    url += `&collapse=${collapseIncorrect ? '1' : '0'}`;

    const linkEl = document.getElementById('obs-url-link');
    const openEl = document.getElementById('btn-open-url');
    if (linkEl) {
        linkEl.href = url;
        linkEl.textContent = url;
    }
    if (openEl) {
        openEl.href = url;
    }

    // Build live preview URL search query
    let previewUrl = url + '&preview=1';
    if (previewSample) {
        previewUrl += '&sample=1';
    }
    if (previewPhase && previewPhase !== 'auto') {
        if (previewUrl.includes('&view=')) {
            previewUrl = previewUrl.replace(/&view=[^&]*/, `&view=${previewPhase}`);
        } else {
            previewUrl += `&view=${previewPhase}`;
        }
    }

    const previewQuery = previewUrl.includes('?') ? previewUrl.split('?')[1] : '';
    const iframe = document.getElementById('trivia-preview-iframe');
    if (iframe) {
        if (!iframe.src || iframe.src === 'about:blank') {
            iframe.src = previewUrl;
        } else {
            try {
                iframe.contentWindow?.postMessage({
                    type: 'trivia:preview-config',
                    query: previewQuery
                }, '*');
            } catch {}
        }
    }
}

export function initPreviewListeners() {
    themeInputIds.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        const handler = (e) => {
            if (id === 'cfg-theme-preset' || id === 'obs-theme') {
                const val = e.target.value;
                const cfgThemeEl = document.getElementById('cfg-theme-preset');
                const obsThemeEl = document.getElementById('obs-theme');
                if (cfgThemeEl) cfgThemeEl.value = val;
                if (obsThemeEl) obsThemeEl.value = val;

                const def = PRESET_DEFAULTS[val];
                if (def) {
                    const styleEl = document.getElementById('cfg-theme-card-style');
                    const collapseEl = document.getElementById('cfg-theme-collapse-incorrect');
                    const blurEl = document.getElementById('cfg-theme-blur');
                    const blurValEl = document.getElementById('cfg-theme-blur-val');

                    if (styleEl) styleEl.value = def.style;
                    if (collapseEl) collapseEl.checked = def.collapse;
                    if (blurEl) blurEl.value = def.blur;
                    if (blurValEl) blurValEl.textContent = `${def.blur}px`;

                    setFieldColor('cfg-theme-card-bg', def.cardBg, '#0d1117');
                    setFieldColor('cfg-theme-card-border', def.cardBorder, '#38bdf8');
                    setFieldColor('cfg-theme-choice-bg', def.choiceBg, '#161b22');
                    setFieldColor('cfg-theme-choice-border', def.choiceBorder || '#30363d', '#30363d');
                    setFieldColor('cfg-theme-accent-color', def.accent, '#3b82f6');
                    setFieldColor('cfg-theme-correct-color', def.correct, '#22c55e');
                    setFieldColor('cfg-theme-phase-question-color', '', def.accent || '#3b82f6');
                    setFieldColor('cfg-theme-phase-answer-color', '', def.correct || '#22c55e');
                    setFieldColor('cfg-theme-category-color', def.catColor, '#a855f7');
                    setFieldColor('cfg-theme-hint-color', def.hintColor, '#94a3b8');
                    setFieldColor('cfg-theme-funfact-color', def.funfactColor, '#eab308');
                }
            }
            updateObsUrl();
        };
        el.addEventListener('input', handler);
        el.addEventListener('change', handler);
    });

    const previewIframe = document.getElementById('trivia-preview-iframe');
    if (previewIframe) {
        previewIframe.addEventListener('load', () => updateObsUrl());
    }

    window.addEventListener('message', (e) => {
        if (e.data?.type === 'trivia:overlay-ready') {
            updateObsUrl();
        }
    });

    const vpWrapper = document.getElementById('preview-viewport-wrapper');
    if (vpWrapper && window.ResizeObserver) {
        new ResizeObserver(() => {
            if (activeTab === 'theming') applyViewportScale();
        }).observe(vpWrapper);
    }

    ['cfg-theme-question-label', 'cfg-theme-answer-label'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', () => updateObsUrl());
    });

    ['cfg-theme-question-font', 'cfg-theme-header-font', 'cfg-theme-choice-font', 'cfg-theme-funfact-font', 'cfg-theme-phase-font'].forEach(id => {
        document.getElementById(id)?.addEventListener('change', (e) => {
            const val = e.target.value;
            if (val) window.loadUrlFont?.(val);
            updateObsUrl();
        });
    });

    ['input', 'change'].forEach(evt => {
        document.getElementById('cfg-theme-scale')?.addEventListener(evt, (e) => {
            const valEl = document.getElementById('cfg-theme-scale-val');
            if (valEl) valEl.textContent = parseFloat(e.target.value).toFixed(2) + '×';
            updateObsUrl();
        });
        document.getElementById('cfg-theme-blur')?.addEventListener(evt, (e) => {
            const valEl = document.getElementById('cfg-theme-blur-val');
            if (valEl) valEl.textContent = e.target.value + 'px';
            updateObsUrl();
        });
    });

    // Two-way synchronization between Header Font Size dropdown and custom CSS size text input
    const hSizeSelect = document.getElementById('cfg-theme-header-size');
    const hSizeCustom = document.getElementById('cfg-theme-header-size-custom');
    if (hSizeSelect && hSizeCustom) {
        hSizeSelect.addEventListener('change', () => {
            if (hSizeSelect.value === 'custom') {
                hSizeCustom.focus();
            } else {
                hSizeCustom.value = '';
            }
            updateObsUrl();
        });
        ['input', 'change'].forEach(evt => {
            hSizeCustom.addEventListener(evt, () => {
                const customVal = hSizeCustom.value.trim();
                if (customVal) {
                    const exists = Array.from(hSizeSelect.options).some(o => o.value === customVal && o.value !== 'custom');
                    if (exists) {
                        hSizeSelect.value = customVal;
                    } else {
                        hSizeSelect.value = 'custom';
                    }
                } else if (hSizeSelect.value === 'custom') {
                    hSizeSelect.value = '';
                }
                updateObsUrl();
            });
        });
    }

    // Two-way synchronization between color pickers and hex text inputs (with #RRGGBBAA opacity support)
    colorInputPairs.forEach(id => {
        const colorEl = document.getElementById(id);
        const hexEl = document.getElementById(id + '-hex');
        if (colorEl && hexEl) {
            colorEl.addEventListener('input', () => {
                const currentHex = hexEl.value.trim();
                const newRgb = colorEl.value.toUpperCase();
                // Retain existing alpha channel if user specified 8-digit hex (e.g. #00000000)
                if (/^#[0-9a-fA-F]{8}$/.test(currentHex)) {
                    hexEl.value = newRgb + currentHex.slice(7, 9).toUpperCase();
                } else {
                    hexEl.value = newRgb;
                }
                updateObsUrl();
            });

            hexEl.addEventListener('input', () => {
                const norm = normalizeColor(hexEl.value);
                if (norm) {
                    colorEl.value = toRgbHex(norm);
                }
                updateObsUrl();
            });

            hexEl.addEventListener('blur', () => {
                const norm = normalizeColor(hexEl.value);
                if (norm) {
                    hexEl.value = norm;
                    colorEl.value = toRgbHex(norm);
                } else if (colorEl.value) {
                    hexEl.value = colorEl.value.toUpperCase();
                }
                updateObsUrl();
            });
        }
    });

    document.getElementById('obs-mode')?.addEventListener('change', (e) => {
        const val = e.target.value;
        if (val === 'compact') {
            setPreviewViewport(1920, 360, document.getElementById('chip-vp-compact'), 'compact');
        } else if (val === 'hud') {
            setPreviewViewport(520, 680, document.getElementById('chip-vp-hud'), 'hud');
        } else {
            setPreviewViewport(1920, 1080, document.getElementById('chip-vp-full'), 'full');
        }
    });

    document.getElementById('btn-copy-url')?.addEventListener('click', () => {
        const url = document.getElementById('obs-url-link')?.href || `${window.location.origin}/overlays/trivia.html`;
        navigator.clipboard.writeText(url).then(() => {
            const toastEl = document.getElementById('toast');
            if (toastEl) {
                toastEl.textContent = 'OBS URL copied to clipboard!';
                toastEl.style.display = 'block';
                toastEl.classList.add('show');
                setTimeout(() => {
                    toastEl.classList.remove('show');
                    toastEl.style.display = 'none';
                }, 2800);
            }
        });
    });

    // Window resize & responsive scaler observer
    window.addEventListener('resize', () => {
        window.requestAnimationFrame(applyViewportScale);
    });

    const wrapper = document.getElementById('preview-viewport-wrapper');
    if (wrapper && typeof ResizeObserver !== 'undefined') {
        const ro = new ResizeObserver(() => {
            window.requestAnimationFrame(applyViewportScale);
        });
        ro.observe(wrapper);
    }

    restorePreviewViewport();
    applyViewportScale();
}

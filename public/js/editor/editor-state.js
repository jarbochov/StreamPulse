/**
 * StreamPulse Custom Overlay Editor — Core State & Model Management
 */

export const $ = id => document.getElementById(id);

export const params = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
export const initialId = params.get('id') || '';

export const LIMITS = { canvasW: [1, 3840], canvasH: [1, 2160], elementW: [10, 3840], elementH: [10, 2160] };
export const MIN_SIZE = 20;

const svg = path => `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;

export const TYPE_META = {
    text: { label: 'Text', icon: svg('<path d="M2.5 4h11M8 4v9M5.5 13h5"/>') },
    'random-text': { label: 'Random Text', icon: svg('<path d="M2.5 7.5A5.5 5.5 0 0112.5 4M13.5 8.5A5.5 5.5 0 013.5 12"/><path d="M10 4h2.5V1.5M6 12H3.5v2.5"/><path d="M6.5 7h3M8 7v4"/>') },
    markdown: { label: 'Markdown', icon: svg('<rect x="2" y="2.5" width="12" height="11" rx="1.5"/><path d="M4.5 9.5V6.5l1.5 2 1.5-2v3M10 6.5v3M8.7 8.2l1.3 1.3 1.3-1.3"/>') },
    image: { label: 'Image', icon: svg('<rect x="2" y="2.5" width="12" height="11" rx="1.5"/><circle cx="5.5" cy="5.5" r="1.2" fill="currentColor"/><path d="M14 11l-3.5-3.5-5 5M8.5 8.5l1.5-1.5 3 3"/>') },
    video: { label: 'Video', icon: svg('<rect x="2" y="3" width="12" height="10" rx="1.5"/><polygon points="6.5 5.5 10.5 8 6.5 10.5" fill="currentColor"/>') },
    embed: { label: 'Webpage', icon: svg('<rect x="2" y="2.5" width="12" height="11" rx="1.5"/><path d="M2 6h12M4.5 4.25h.01M6.5 4.25h.01"/>') },
    qr: { label: 'QR Code', icon: svg('<rect x="2.5" y="2.5" width="4.5" height="4.5" rx=".5"/><rect x="9" y="2.5" width="4.5" height="4.5" rx=".5"/><rect x="2.5" y="9" width="4.5" height="4.5" rx=".5"/><rect x="9.5" y="9.5" width="1.5" height="1.5" fill="currentColor"/><rect x="12" y="12" width="1.5" height="1.5" fill="currentColor"/><rect x="12" y="9.5" width="1.5" height="1.5" fill="currentColor"/>') },
    icon: { label: 'Icon', icon: svg('<polygon points="8 2 9.8 5.8 14 6.4 11 9.3 11.7 13.5 8 11.5 4.3 13.5 5 9.3 2 6.4 6.2 5.8"/>') },
    shape: { label: 'Shape', icon: svg('<rect x="2" y="5.5" width="7" height="7" rx="1"/><circle cx="10" cy="6" r="3.5"/>') },
    cutout: { label: 'Cutout', icon: svg('<rect x="2" y="2" width="12" height="12" rx="2"/><rect x="5" y="5" width="6" height="6" rx="1" stroke-dasharray="2 1.5"/>') },
    progress: { label: 'Progress', icon: svg('<rect x="2" y="6" width="12" height="4" rx="2"/><path d="M2 8h6" stroke-width="2.5"/><circle cx="8" cy="8" r="1.5" fill="currentColor"/>') },
    poll: { label: 'Poll', icon: svg('<path d="M2 4h12M2 8h8M2 12h4"/>') },
    'game-list': { label: 'Game List', icon: svg('<path d="M4 5h8a3 3 0 013 3v3a2 2 0 01-2 2h-1l-2-2H6l-2 2H3a2 2 0 01-2-2V8a3 3 0 013-3z"/><path d="M4 8.5h3M5.5 7v3"/><circle cx="11.5" cy="8" r=".7" fill="currentColor"/><circle cx="13" cy="9.5" r=".7" fill="currentColor"/>') },
    alert: { label: 'Alert Box', icon: svg('<path d="M8 2a3 3 0 00-3 3v2.5L3.5 10v1h9v-1L11 7.5V5a3 3 0 00-3-3zM6.5 12.5a1.5 1.5 0 003 0"/>') },
    slideshow: { label: 'Slideshow', icon: svg('<rect x="4.5" y="2" width="9.5" height="9.5" rx="1.5"/><path d="M2 5.5v7A1.5 1.5 0 003.5 14h7"/><path d="M7 7.5l2 2 1.5-1.5 2 2"/>') },
    pattern: { label: 'Pattern Tile', icon: svg('<rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1"/><rect x="9" y="2.5" width="4.5" height="4.5" rx="1"/><rect x="9" y="9" width="4.5" height="4.5" rx="1"/><rect x="2.5" y="9" width="4.5" height="4.5" rx="1"/>') }
};

export const TEXT_TYPES = new Set(['text', 'random-text', 'markdown']);
export const FILL_TEXT_TYPES = new Set([...TEXT_TYPES, 'game-list']);
export const hasText = el => TEXT_TYPES.has(el.type) || el.type === 'progress' || el.type === 'game-list' || el.type === 'alert' || el.type === 'poll';
export const isLine = el => el.type === 'shape' && el.style?.shape === 'line';

export const CANVAS_PRESETS = [
    ['1920x1080', 'Full HD 1920 × 1080'],
    ['1280x720', 'HD 1280 × 720'],
    ['2560x1440', 'QHD 2560 × 1440'],
    ['3840x2160', '4K 3840 × 2160'],
    ['1080x1920', 'Portrait 1080 × 1920'],
    ['1080x1080', 'Square 1080 × 1080']
];

export const SYSTEM_FONTS = [
    ['sans-serif', 'System sans-serif'],
    ['Arial, sans-serif', 'Arial'],
    ['Helvetica, sans-serif', 'Helvetica'],
    ['Georgia, serif', 'Georgia'],
    ['Impact, sans-serif', 'Impact'],
    ['monospace', 'Monospace'],
    ["'Courier New', monospace", 'Courier New'],
    ["'Trebuchet MS', sans-serif", 'Trebuchet MS']
];

export const SERIF_FONTS = new Set(['Merriweather', 'Playfair Display']);
export const MONO_FONTS = new Set(['Fira Code', 'Silkscreen']);

const shared = window.OverlayShared || {};
export const GOOGLE_FONT_OPTIONS = (shared.GOOGLE_FONTS || []).map(name => [
    `'${name}', ${SERIF_FONTS.has(name) ? 'serif' : MONO_FONTS.has(name) ? 'monospace' : 'sans-serif'}`,
    name
]);

export const ALERT_TRIGGER_LABELS = {
    follow: 'Follow',
    sub: 'New sub',
    resub: 'Resub',
    milestone: 'Sub milestone',
    gift: 'Gifted subs',
    bits: 'Bits',
    donation: 'Donation',
    raid: 'Raid',
    redeem: 'Channel point redeem',
    timer: 'Timer finished',
    goal: 'Goal reached',
    chat_word: 'Chat word',
    chat_command: 'Chat bot command'
};

export const LOCAL_MEDIA = '/local-file?path=';

export const UPLOAD_TYPES = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
    mp4: 'video/mp4', webm: 'video/webm', ogg: 'video/ogg',
    ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2',
    txt: 'text/plain', md: 'text/markdown', markdown: 'text/markdown'
};

export const ICON = {
    eye: svg('<path d="M1.5 8s2.3-4.5 6.5-4.5S14.5 8 14.5 8 12.2 12.5 8 12.5 1.5 8 1.5 8z"/><circle cx="8" cy="8" r="2"/>'),
    eyeOff: svg('<path d="M1.5 8s2.3-4.5 6.5-4.5S14.5 8 14.5 8 12.2 12.5 8 12.5 1.5 8 1.5 8z"/><circle cx="8" cy="8" r="2"/><path d="M2.5 13.5l11-11"/>'),
    lock: svg('<rect x="3.5" y="7" width="9" height="6.5" rx="1.5"/><path d="M5.5 7V5a2.5 2.5 0 015 0v2"/>'),
    unlock: svg('<rect x="3.5" y="7" width="9" height="6.5" rx="1.5"/><path d="M5.5 7V5a2.5 2.5 0 014.8-1"/>'),
    trash: svg('<path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5"/>'),
    preset: svg('<path d="M8 1.8l1.7 3.9 4.1.4-3.1 2.7.9 4.1L8 10.8 4.4 12.9l.9-4.1L2.2 6.1l4.1-.4z"/>'),
    copy: svg('<rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 5.5V4A1.5 1.5 0 009 2.5H4A1.5 1.5 0 002.5 4v5A1.5 1.5 0 004 10.5h1.5"/>'),
    toFront: svg('<path d="M8 13V4M4.5 7.5L8 4l3.5 3.5M3 2.5h10"/>'),
    forward: svg('<path d="M8 13V4M4.5 7.5L8 4l3.5 3.5"/>'),
    backward: svg('<path d="M8 3v9M4.5 8.5L8 12l3.5-3.5"/>'),
    toBack: svg('<path d="M8 3v9M4.5 8.5L8 12l3.5-3.5M3 13.5h10"/>'),
    grip: '<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true"><circle cx="6" cy="4" r="1.1"/><circle cx="10" cy="4" r="1.1"/><circle cx="6" cy="8" r="1.1"/><circle cx="10" cy="8" r="1.1"/><circle cx="6" cy="12" r="1.1"/><circle cx="10" cy="12" r="1.1"/></svg>',
    undo: svg('<path d="M5 3L2.5 5.5 5 8M2.5 5.5H9a4 4 0 010 8H6"/>'),
    redo: svg('<path d="M11 3l2.5 2.5L11 8M13.5 5.5H7a4 4 0 000 8h3"/>'),
    reset: svg('<path d="M2.5 2.5v4h4"/><path d="M2.5 6.5A6 6 0 105 3.5"/>'),
    plus: svg('<path d="M8 3v10M3 8h10"/>'),
    minus: svg('<path d="M3 8h10"/>'),
    alignLeft: svg('<path d="M2 2v12M5 4h8v3H5zM5 9h5v3H5z"/>'),
    alignCenter: svg('<path d="M8 2v12M3 4h10v3H3zM5 9h6v3H5z"/>'),
    alignRight: svg('<path d="M14 2v12M3 4h8v3H3zM6 9h5v3H6z"/>'),
    alignTop: svg('<path d="M2 2h12M4 5v8h3V5zM9 5v5h3V5z"/>'),
    alignMiddle: svg('<path d="M2 8h12M4 3v10h3V3zM9 5v6h3V5z"/>'),
    alignBottom: svg('<path d="M2 14h12M4 3v8h3V3zM9 6v5h3V6z"/>'),
    distH: svg('<path d="M2 2v12M14 2v12M6 4h4v8H6z"/>'),
    distV: svg('<path d="M2 2h12M2 14h12M4 6h8v4H4z"/>'),
    textLeft: svg('<path d="M2 3.5h12M2 7h8M2 10.5h12M2 14h8"/>'),
    textCenter: svg('<path d="M2 3.5h12M4 7h8M2 10.5h12M4 14h8"/>'),
    textRight: svg('<path d="M2 3.5h12M6 7h8M2 10.5h12M6 14h8"/>'),
    vTop: svg('<path d="M2 2.5h12M5 5.5h6v6H5z"/>'),
    vMiddle: svg('<path d="M2 8h12M5 4.5h6v7H5z"/>'),
    vBottom: svg('<path d="M2 13.5h12M5 4.5h6v6H5z"/>'),
    paint: svg('<path d="M12 2.5a2.5 2.5 0 012.5 2.5c0 1.2-.6 2.3-1.6 2.7l-4.2 2-2 4.2c-.4 1-1.5 1.6-2.7 1.6A2.5 2.5 0 011.5 13c0-1.2.6-2.3 1.6-2.7l4.2-2 2-4.2c.4-1 1.5-1.6 2.7-1.6z"/>'),
    clipboard: svg('<path d="M6 2.5h4v2H6zM4.5 4.5v9h7v-9H10v1H6v-1H4.5z"/>'),
    eyedrop: svg('<path d="M13.4.6a1.2 1.2 0 00-1.7 0L8.5 3.8l-.6-.6a.5.5 0 10-.7.7L8.3 5 1.1 12.1a.5.5 0 00-.1.4v2a.5.5 0 00.5.5h2a.5.5 0 00.4-.1L11 7.7l1.1 1.1a.5.5 0 00.8-.7L12.2 7.5 15.3 4.3a1.2 1.2 0 000-1.7l-1.9-2zM2 13.3l6.5-6.5L9.7 8 3.2 14.5H2v-1.2z"/>')
};

export const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const round2 = value => Math.round(value * 100) / 100;
export const fmt = (value, scale = 1) => String(round2((Number(value) || 0) / scale));
export const uid = type => `${type}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export const getPath = (target, path) => path.split('.').reduce((value, key) => value?.[key], target);
export function setPath(target, path, value) {
    const keys = path.split('.');
    const last = keys.pop();
    let cursor = target;
    for (const key of keys) cursor = cursor[key] ??= {};
    cursor[last] = value;
}

export let styleClipboard = null;
export function setStyleClipboard(data) { styleClipboard = data; }
export function getStyleClipboard() { return styleClipboard; }

/**
 * Pluggable Host Adapter
 * Decouples the editor from StreamPulse-specific routes, enabling seamless porting to NodeCG replicants or other backends.
 */
export const OverlayAdapter = {
    fetchOverlay: async (id) => {
        const res = await fetch(`/api/custom-overlays/${encodeURIComponent(id)}`);
        return res.ok ? res.json() : null;
    },
    saveOverlay: async (id, data) => {
        const res = await fetch(`/api/custom-overlays/${encodeURIComponent(id)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return res.ok ? res.json() : null;
    },
    uploadAsset: async (file) => {
        const fd = new FormData();
        fd.append('file', file);
        const res = await fetch('/api/custom-overlay-assets', { method: 'POST', body: fd });
        return res.ok ? res.json() : null;
    }
};

export function toast(message, kind = 'info', ms = 3200) {
    const container = $('toasts');
    if (!container) return;
    const node = document.createElement('div');
    node.className = `toast ${kind}`;
    node.textContent = message;
    container.appendChild(node);
    setTimeout(() => node.remove(), ms);
}

// ---- preferences ------------------------------------------------------------------
export const PREF_KEY = 'streampulse.overlayEditor.v1';
export const prefs = Object.assign({
    snap: true, scaleText: true, grid: false, safeZones: false, live: true, fx: true,
    backdrop: 'checker', backdropImage: '', backdropOpacity: 80, alignTo: 'selection',
    sections: {}, recentColors: []
}, (() => {
    try { return JSON.parse(localStorage.getItem(PREF_KEY)) || {}; }
    catch { return {}; }
})());

export const savePrefs = () => {
    try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch {}
};

export function addRecentColor(color) {
    if (!color || typeof color !== 'string') return;
    color = color.trim().toLowerCase();
    if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(color) && !/^rgba?\(/i.test(color)) return;
    if (!Array.isArray(prefs.recentColors)) prefs.recentColors = [];
    prefs.recentColors = [color, ...prefs.recentColors.filter(c => c !== color)].slice(0, 12);
    savePrefs();
}

export function getDocumentColors() {
    const colors = new Set();
    const add = val => {
        if (!val || typeof val !== 'string') return;
        val = val.trim();
        if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(val)) colors.add(val.toLowerCase());
        else if (/^rgba?\(/i.test(val) && !val.includes(', 0)')) colors.add(val);
    };
    if (state.overlay.canvas?.background) add(state.overlay.canvas.background);
    for (const el of state.overlay.elements || []) {
        if (el.style) {
            add(el.style.color); add(el.style.background); add(el.style.borderColor);
            add(el.style.shadowColor); add(el.style.glowColor);
            if (el.style.fillColor) add(el.style.fillColor);
            if (el.style.textGradient?.from) add(el.style.textGradient.from);
            if (el.style.textGradient?.to) add(el.style.textGradient.to);
            if (el.style.borderGradient?.from) add(el.style.borderGradient.from);
            if (el.style.borderGradient?.to) add(el.style.borderGradient.to);
        }
        if (el.qr) { add(el.qr.fg); add(el.qr.bg); }
    }
    if (Array.isArray(prefs.recentColors)) {
        for (const c of prefs.recentColors) add(c);
    }
    return [...colors].slice(0, 14);
}

// ---- Central State Object ---------------------------------------------------------
export const state = {
    overlay: {
        id: initialId || uid('ov'),
        name: initialId || 'Untitled overlay',
        revision: 1,
        canvas: { width: 1920, height: 1080, background: 'transparent' },
        pages: null,
        elements: []
    },
    selectedIds: new Set(),
    zoom: 0.5,
    pan: { x: 0, y: 0 },
    autoFit: true,
    dirty: false,
    saving: false,
    isNew: !params.get('id'),
    initialId,
    curPage: 'page-1',
    nodes: new Map(),
    liveStatus: {},
    spaceDown: false,
    gesture: null,
    lastTextField: null,
    hist: { stack: [], index: -1, timer: null },
    savedSnapshot: '',
    pickerTarget: null,
    mediaTab: new Map(),
    collapsedGroups: new Set(JSON.parse(localStorage.getItem('layerCollapsedGroups') || '[]')),
    layerOrder: []
};

// ---- Model & Geometry Helpers -----------------------------------------------------
export const byId = id => state.overlay.elements.find(item => item.id === id);
export const selectedElements = () => state.overlay.elements.filter(item => state.selectedIds.has(item.id));
export const primary = () => selectedElements()[0] || null;

export const boxOf = el => ({
    x: el.x,
    y: el.y,
    w: el.width,
    h: isLine(el) ? Math.max(1, el.style?.borderWidth || 4) : el.height
});

export function visualBoxOf(el) {
    const b = boxOf(el);
    const r = el.style?.rotate;
    if (!r) return b;
    const rad = Math.abs(r) * Math.PI / 180;
    const cos = Math.cos(rad), sin = Math.sin(rad);
    const w = Math.round(b.w * cos + b.h * sin);
    const h = Math.round(b.w * sin + b.h * cos);
    return { x: Math.round(b.x + (b.w - w) / 2), y: Math.round(b.y + (b.h - h) / 2), w, h };
}

export const boundsOf = items => {
    const boxes = items.map(visualBoxOf);
    const x = Math.min(...boxes.map(b => b.x)), y = Math.min(...boxes.map(b => b.y));
    return {
        x,
        y,
        w: Math.max(...boxes.map(b => b.x + b.w)) - x,
        h: Math.max(...boxes.map(b => b.y + b.h)) - y
    };
};

export const SCALE_STYLE = ['fontSize', 'borderWidth', 'borderRadius', 'padding', 'letterSpacing'];

export function scaleSnapshot(items) {
    return items.filter(el => !el.locked).map(el => ({
        el, x: el.x, y: el.y, w: el.width, h: el.height, line: isLine(el),
        style: Object.fromEntries(SCALE_STYLE.map(key => [key, el.style?.[key]]))
    }));
}

export function scaleLimits(snaps) {
    let minX = 0, minY = 0, maxX = Infinity, maxY = Infinity;
    for (const s of snaps) {
        minX = Math.max(minX, LIMITS.elementW[0] / Math.max(1, s.w));
        maxX = Math.min(maxX, LIMITS.elementW[1] / Math.max(1, s.w));
        if (!s.line) {
            minY = Math.max(minY, LIMITS.elementH[0] / Math.max(1, s.h));
            maxY = Math.min(maxY, LIMITS.elementH[1] / Math.max(1, s.h));
        }
    }
    return { minX, minY, maxX, maxY };
}

export function applyScale(snaps, anchor, sx, sy) {
    const lim = scaleLimits(snaps);
    sx = Math.min(lim.maxX, Math.max(lim.minX, sx));
    sy = Math.min(lim.maxY, Math.max(lim.minY, sy));
    const text = Math.min(sx, sy), withText = prefs.scaleText !== false;
    for (const s of snaps) {
        const el = s.el;
        el.x = Math.round(anchor.x + (s.x - anchor.x) * sx);
        el.y = Math.round(anchor.y + (s.y - anchor.y) * sy);
        el.width = Math.round(s.w * sx);
        if (!s.line) el.height = Math.round(s.h * sy);
        if (withText) {
            for (const key of SCALE_STYLE) {
                const base = s.style[key];
                if (typeof base !== 'number' || !base) continue;
                const next = base * text;
                el.style[key] = key === 'fontSize' ? Math.min(400, Math.max(8, Math.round(next))) :
                    key === 'letterSpacing' ? Math.round(next * 10) / 10 : Math.max(0, Math.round(next));
            }
        }
    }
    return { sx, sy };
}

export function displayName(el) {
    if (el.name) return el.name;
    return `${TYPE_META[el.type]?.label || el.type} ${state.overlay.elements.filter(item => item.type === el.type).indexOf(el) + 1}`;
}

export function normalizeZ() {
    state.overlay.elements.forEach((item, index) => { item.zIndex = index; });
}

export const defaultPages = () => ({
    enabled: false,
    mode: 'manual',
    cycleSeconds: 10,
    loop: true,
    transition: 'fade',
    transitionMs: 500,
    transitionDirection: 'left',
    transitionDistance: 120,
    items: [{ id: 'page-1', name: 'Page 1', duration: 0, enabled: true }]
});

export const pagesOn = () => state.overlay.pages?.enabled === true;
export const inView = el => !pagesOn() || el.page === '*' || el.page === state.curPage;
export const visibleElements = () => state.overlay.elements.filter(inView);
export const pageName = id => state.overlay.pages?.items.find(p => p.id === id)?.name || id;

export function ensureCurPage() {
    if (!state.overlay.pages) state.overlay.pages = defaultPages();
    if (!state.overlay.pages.items.some(p => p.id === state.curPage)) {
        state.curPage = state.overlay.pages.items[0]?.id || 'page-1';
    }
}

export function normalizeLoaded(data) {
    const next = JSON.parse(JSON.stringify(data));
    next.pages = Object.assign(defaultPages(), next.pages);
    if (!Array.isArray(next.pages.items) || !next.pages.items.length) next.pages.items = defaultPages().items;
    const pageIds = new Set(next.pages.items.map(p => p.id));
    (next.elements || []).forEach(item => { if (item.page !== '*' && !pageIds.has(item.page)) item.page = next.pages.items[0].id; });
    next.canvas = Object.assign({ width: 1920, height: 1080, background: 'transparent' }, next.canvas);
    next.elements = (next.elements || []).map((item, index) => ({ index, item }))
        .sort((a, b) => (a.item.zIndex - b.item.zIndex) || (a.index - b.index)).map(entry => entry.item);
    next.elements.forEach(item => {
        item.name = item.name || '';
        item.locked = item.locked === true;
        item.items ||= [];
        item.textFit ||= 'none';
        item.columns ||= 1;
        item.headingSpan ??= 6;
        item.headingScale ??= 100;
        item.source ||= { mode: 'inline', path: '', split: 'lines' };
        item.random ||= { mode: 'random', intervalSeconds: 5, typewriter: false, typewriterSpeed: 110, marquee: false, marqueeSpeed: 60 };
        if (item.type === 'video') item.video = Object.assign({ autoplay: true, loop: true, sound: false, volume: 100 }, item.video);
        if (item.type === 'alert') item.alert = Object.assign({ layout: 'stack', mediaFit: 'contain', mediaScale: 60, titleSize: 44, messageSize: 28, titleColor: '#ffd166', gap: 12, sound: true, videoSound: false, videoLoop: true, hideText: false, showOnPreview: false, triggers: [] }, item.alert);
        if (item.type === 'poll') item.poll = window.PollWidget.settings(item.poll);
        if (item.type === 'cutout') item.cutout = Object.assign({ shape: 'rectangle', feather: 0 }, item.cutout);
        if (item.type === 'pattern') item.pattern = Object.assign({ sourceType: 'image', layout: 'brick', tileSize: 96, gap: 16, offsetX: 50, offsetY: 0, angle: -15, tileAngle: 0, alternateFlip: 'tilt', tileOpacity: 1, altOpacity: 0.4, altScale: 100, blendMode: 'normal', wedges: 6, feather: 0, motion: 'scroll', trackMode: 'uniform', scrollAngle: 315, speed: 12, spinSpeed: 8, spinDirection: 'cw', waveAmount: 25 }, item.pattern);
        item.style ||= {};
    });
    return next;
}

export function createElementData(type, overrides = {}) {
    const sizes = {
        text: [640, 120], 'random-text': [800, 120], markdown: [640, 240], image: [480, 270],
        video: [640, 360], embed: [640, 360], qr: [320, 320], icon: [160, 160], shape: [480, 160],
        cutout: [480, 270], progress: [480, 48], poll: [400, 150], 'game-list': [800, 320], alert: [640, 280], slideshow: [640, 360], pattern: [640, 360]
    };
    const [width, height] = sizes[type] || [480, 270];
    const offset = (state.overlay.elements.length % 6) * 24;
    const data = {
        id: uid(type), name: '', locked: false, type,
        content: { text: 'Text element', 'random-text': 'Random phrase', markdown: '## Heading\n\nMarkdown **content**', image: '', video: '', embed: '', qr: '', icon: 'fa-brands fa-twitch', shape: '', cutout: '', progress: '50', poll: '', 'game-list': '', alert: '', slideshow: '', pattern: 'fa-brands fa-twitch' }[type],
        textFit: 'none',
        columns: 1,
        headingSpan: 6,
        headingScale: 100,
        source: { mode: 'inline', path: '', split: 'lines' },
        items: type === 'random-text' ? ['First random phrase', 'Second random phrase', 'Third random phrase'] : [],
        random: { mode: 'random', intervalSeconds: 5, typewriter: false, typewriterSpeed: 110, marquee: false, marqueeSpeed: 60 },
        group: '', qr: { fg: '#000000', bg: '#ffffff', margin: 2, ecc: 'M' },
        gameList: { filter: 'scheduled', period: '', layout: 'grid', coverFit: 'cover', fit: 'none', coverScale: 100, headingSize: 0, titleSize: 0, titleWrap: 'ellipsis', columns: 3, gap: 12, max: 0, showCovers: true, showTitles: true, meta: 'none', headings: true, highlightCurrent: true, accent: '#3fb950' },
        slideshow: { source: 'tags', tags: [], tagMode: 'any', files: [], kinds: 'image', seconds: 5, order: 'sequential', fit: 'cover', transition: 'fade', direction: 'left', transitionMs: 800, caption: false, kenBurns: false },
        pattern: { sourceType: 'image', layout: 'brick', tileSize: 96, gap: 16, offsetX: 50, offsetY: 0, angle: -15, tileAngle: 0, alternateFlip: 'tilt', tileOpacity: 1, altOpacity: 0.4, altScale: 100, blendMode: 'normal', wedges: 6, feather: 0, motion: 'scroll', trackMode: 'uniform', scrollAngle: 315, speed: 12, spinSpeed: 8, spinDirection: 'cw', waveAmount: 25 },
        video: { loop: true, sound: false, volume: 100 },
        alert: { layout: 'stack', mediaFit: 'contain', mediaScale: 60, titleSize: 44, messageSize: 28, titleColor: '#ffd166', gap: 12, sound: true, videoSound: false, videoLoop: true, hideText: false, showOnPreview: false, triggers: [] },
        cutout: { shape: 'rectangle', feather: 0 },
        progress: { kind: 'bar', label: '{{progress}}%', showLabel: true, trackColor: 'rgba(255,255,255,0.18)', thickness: 10 },
        poll: type === 'poll' ? window.PollWidget.settings() : undefined,
        page: pagesOn() ? state.curPage : state.overlay.pages?.items[0]?.id || 'page-1',
        src: '',
        x: Math.round((state.overlay.canvas.width - width) / 2 + offset),
        y: Math.round((state.overlay.canvas.height - height) / 2 + offset),
        width, height, zIndex: state.overlay.elements.length, visible: true,
        style: {
            fontFamily: 'sans-serif',
            fontSize: type === 'poll' ? 12 : type === 'markdown' ? 32 : type === 'progress' ? 24 : type === 'game-list' ? 28 : 48,
            fontWeight: type === 'alert' ? '600' : '400',
            color: '#ffffff', textAlign: 'left', verticalAlign: 'top', lineHeight: 1.2, letterSpacing: 0,
            background: type === 'shape' ? '#1f6feb' : type === 'poll' ? 'rgba(13,17,23,0.85)' : type === 'alert' ? 'rgba(15,15,25,0.85)' : 'transparent',
            borderColor: '#ffffff', borderWidth: 0, borderRadius: type === 'poll' ? 10 : type === 'alert' ? 24 : type === 'cutout' ? 16 : 0,
            padding: 0,
            opacity: 1, objectFit: type === 'pattern' ? 'contain' : 'cover', shape: 'rectangle', fill: '#1f6feb',
            gradient: { enabled: false, from: '#1f6feb', to: '#8957e5', angle: 135 },
            blur: 0, shadow: { blur: 0, color: 'rgba(0,0,0,0.5)' }
        }
    };
    if (type === 'icon' || type === 'alert') Object.assign(data.style, { textAlign: 'center', verticalAlign: 'middle' });
    return Object.assign(data, overrides);
}

export function withGroups(ids) {
    const set = new Set(ids);
    const groups = new Set([...set].map(id => byId(id)?.group).filter(Boolean));
    if (groups.size) state.overlay.elements.forEach(el => { if (groups.has(el.group)) set.add(el.id); });
    return set;
}

export const variableContext = () => ({ overlayName: state.overlay.name });
export const expand = value => {
    const sh = window.OverlayShared;
    return prefs.live && sh ? sh.expandVariables(value, state.liveStatus, variableContext(), true) : String(value ?? '');
};
export const liveSignature = () => {
    const sh = window.OverlayShared;
    return prefs.live && sh ? sh.variableSnapshot(state.liveStatus, variableContext()) : 'off';
};

export const alertSample = el => {
    const sh = window.OverlayShared;
    return sh?.alertSample ? sh.alertSample(el) : {};
};

// ---- History & Dirty Tracking -----------------------------------------------------
export const snapshot = () => JSON.stringify({
    name: state.overlay.name,
    canvas: state.overlay.canvas,
    pages: state.overlay.pages,
    elements: state.overlay.elements
});

export function updateHistoryUI() {
    const undoBtn = $('undo');
    const redoBtn = $('redo');
    const dirtyBadge = $('dirty');
    if (undoBtn) undoBtn.disabled = state.hist.index <= 0 && !state.hist.timer;
    if (redoBtn) redoBtn.disabled = state.hist.index >= state.hist.stack.length - 1 || !!state.hist.timer;
    if (dirtyBadge) dirtyBadge.hidden = !state.dirty;
    document.title = `${state.dirty ? '• ' : ''}${state.overlay.name || 'Overlay'} — StreamPulse Editor`;
}

export function pushHistory() {
    clearTimeout(state.hist.timer);
    state.hist.timer = null;
    const current = snapshot();
    if (current !== state.hist.stack[state.hist.index]) {
        state.hist.stack.length = state.hist.index + 1;
        state.hist.stack.push(current);
        if (state.hist.stack.length > 35) state.hist.stack.shift();
        state.hist.index = state.hist.stack.length - 1;
    }
    state.dirty = current !== state.savedSnapshot;
    updateHistoryUI();
}

export function changed(immediate = false) {
    state.dirty = true;
    clearTimeout(state.hist.timer);
    state.hist.timer = null;
    if (immediate) pushHistory();
    else {
        state.hist.timer = setTimeout(pushHistory, 450);
        updateHistoryUI();
    }
}

export function flushHistory() {
    if (state.hist.timer) pushHistory();
}

// Callbacks registered by other modules
let renderAllHandler = () => {};
let fitViewHandler = () => {};
let selectionChangeHandler = () => {};
let statusBarHandler = () => {};

export function registerRenderAll(fn) { renderAllHandler = fn; }
export function registerFitView(fn) { fitViewHandler = fn; }
export function registerSelectionChange(fn) { selectionChangeHandler = fn; }
export function registerStatusBar(fn) { statusBarHandler = fn; }

export function restore(json) {
    const s = JSON.parse(json);
    state.overlay.name = s.name;
    state.overlay.canvas = s.canvas;
    state.overlay.elements = s.elements;
    state.overlay.pages = s.pages || defaultPages();
    ensureCurPage();
    state.selectedIds = new Set([...state.selectedIds].filter(id => byId(id)));
    renderAllHandler();
    if (state.autoFit) fitViewHandler(true);
}

export function undo() {
    flushHistory();
    if (state.hist.index > 0) {
        state.hist.index--;
        restore(state.hist.stack[state.hist.index]);
        state.dirty = snapshot() !== state.savedSnapshot;
        updateHistoryUI();
    }
}

export function redo() {
    flushHistory();
    if (state.hist.index < state.hist.stack.length - 1) {
        state.hist.index++;
        restore(state.hist.stack[state.hist.index]);
        state.dirty = snapshot() !== state.savedSnapshot;
        updateHistoryUI();
    }
}

export function updateStatusBar() {
    statusBarHandler();
}

export function setSelection(ids, { light = false } = {}) {
    const next = new Set(ids);
    if (next.size === state.selectedIds.size && [...next].every(id => state.selectedIds.has(id))) return false;
    state.selectedIds = next;
    for (const [id, node] of state.nodes) node.classList.toggle('selected', state.selectedIds.has(id));
    selectionChangeHandler({ light });
    return true;
}

export function groupSelection() {
    const items = selectedElements();
    if (items.length < 2) {
        toast('Select two or more elements to group.', 'warn', 2000);
        return;
    }
    const id = uid('group');
    items.forEach(el => { el.group = id; el.groupName = ''; });
    renderAllHandler();
    changed(true);
    toast(`Grouped ${items.length} elements`, 'success', 1500);
}

export function ungroupSelection() {
    const items = selectedElements().filter(el => el.group);
    if (!items.length) return;
    const groups = new Set(items.map(el => el.group));
    state.overlay.elements.forEach(el => {
        if (groups.has(el.group)) { el.group = ''; el.groupName = ''; }
    });
    renderAllHandler();
    changed(true);
}

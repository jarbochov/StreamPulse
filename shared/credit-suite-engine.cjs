'use strict';

/**
 * StreamPulse Credit Suite — Shared Deterministic Timeline, Auto-Reflow & Normalization Engine
 * Used identically by Node backend (server/services/credit-suite.js),
 * Live OBS Overlay (public/overlays/credit-suite.html),
 * and Credit Suite Studio (public/tools/credit-suite.html).
 */

const CANVAS_PRESETS = Object.freeze([
    { id: '1080p', label: '1080p HD (16:9)', width: 1920, height: 1080 },
    { id: '4k', label: '4K UHD (16:9)', width: 3840, height: 2160 },
    { id: '720p', label: '720p HD (16:9)', width: 1280, height: 720 },
    { id: 'vertical', label: 'Vertical (9:16)', width: 1080, height: 1920 },
    { id: 'cinemascope', label: 'CinemaScope (2.39:1)', width: 1920, height: 804 },
    { id: 'square', label: 'Square (1:1)', width: 1080, height: 1080 },
    { id: 'custom', label: 'Custom', width: 1920, height: 1080 }
]);

const GOOGLE_FONT_LIST = Object.freeze([
    'Cinzel',
    'Playfair Display',
    'Cormorant Garamond',
    'EB Garamond',
    'Lora',
    'Merriweather',
    'Oswald',
    'Bebas Neue',
    'Montserrat',
    'Raleway',
    'Inter',
    'Space Grotesk',
    'DM Sans',
    'Outfit',
    'Syne',
    'JetBrains Mono',
    'Crimson Pro',
    'Georgia',
    'Times New Roman',
    'Arial'
]);

const SYSTEM_FONTS = Object.freeze(['Georgia', 'Times New Roman', 'Arial', 'Helvetica', 'Verdana', 'Courier New', 'sans-serif', 'serif', 'monospace']);

const STARTER_THEMES = Object.freeze({
    'hollywood-classic': {
        id: 'hollywood-classic',
        name: 'Hollywood Classic',
        headingFont: 'Cinzel',
        contentFont: 'Cormorant Garamond',
        headingSize: 40,
        contentSize: 28,
        headingWeight: '700',
        contentWeight: '400',
        headingStyle: 'normal',
        contentStyle: 'normal',
        headingTransform: 'uppercase',
        headingLetterSpacing: 0.14,
        lineHeight: 1.75,
        sectionSpacing: 72,
        textColor: '#F3F4F6FF',
        accentColor: '#E5C07BFF',
        subtitleColor: '#9CA3AFFF',
        dividerColor: '#E5C07B66',
        background: { type: 'solid', color1: '#07080CFF', color2: '#11141FFF', angle: 180 }
    },
    'a24-minimal': {
        id: 'a24-minimal',
        name: 'Modern Minimal',
        headingFont: 'Space Grotesk',
        contentFont: 'Inter',
        headingSize: 32,
        contentSize: 24,
        headingWeight: '600',
        contentWeight: '400',
        headingStyle: 'normal',
        contentStyle: 'normal',
        headingTransform: 'uppercase',
        headingLetterSpacing: 0.22,
        lineHeight: 1.7,
        sectionSpacing: 84,
        textColor: '#FAFAFAFF',
        accentColor: '#A1A1AAFF',
        subtitleColor: '#71717AFF',
        dividerColor: '#3F3F46FF',
        background: { type: 'solid', color1: '#09090BFF', color2: '#18181BFF', angle: 180 }
    },
    'scifi-neon': {
        id: 'scifi-neon',
        name: 'Sci-Fi Neon',
        headingFont: 'Oswald',
        contentFont: 'Montserrat',
        headingSize: 44,
        contentSize: 24,
        headingWeight: '700',
        contentWeight: '400',
        headingStyle: 'normal',
        contentStyle: 'normal',
        headingTransform: 'uppercase',
        headingLetterSpacing: 0.16,
        lineHeight: 1.65,
        sectionSpacing: 68,
        textColor: '#E2E8F0FF',
        accentColor: '#38BDF8FF',
        subtitleColor: '#94A3B8FF',
        dividerColor: '#38BDF877',
        background: { type: 'gradient', color1: '#050816FF', color2: '#111C3AFF', angle: 160 }
    },
    'broadcast-doc': {
        id: 'broadcast-doc',
        name: 'Broadcast Documentary',
        headingFont: 'Montserrat',
        contentFont: 'DM Sans',
        headingSize: 34,
        contentSize: 24,
        headingWeight: '700',
        contentWeight: '400',
        headingStyle: 'normal',
        contentStyle: 'normal',
        headingTransform: 'uppercase',
        headingLetterSpacing: 0.12,
        lineHeight: 1.6,
        sectionSpacing: 64,
        textColor: '#F8FAFCFF',
        accentColor: '#60A5FAFF',
        subtitleColor: '#CBD5E1FF',
        dividerColor: '#60A5FA66',
        background: { type: 'gradient', color1: '#0F172AFF', color2: '#1E293BFF', angle: 135 }
    },
    'gold-prestige': {
        id: 'gold-prestige',
        name: 'Gold Prestige',
        headingFont: 'Playfair Display',
        contentFont: 'EB Garamond',
        headingSize: 44,
        contentSize: 28,
        headingWeight: '700',
        contentWeight: '400',
        headingStyle: 'italic',
        contentStyle: 'normal',
        headingTransform: 'none',
        headingLetterSpacing: 0.06,
        lineHeight: 1.8,
        sectionSpacing: 78,
        textColor: '#F7F1E3FF',
        accentColor: '#D4A843FF',
        subtitleColor: '#C2B28FFF',
        dividerColor: '#D4A84388',
        background: { type: 'gradient', color1: '#120E0AFF', color2: '#1E1710FF', angle: 180 }
    },
    'clean-light': {
        id: 'clean-light',
        name: 'Clean Light Studio',
        headingFont: 'Outfit',
        contentFont: 'Inter',
        headingSize: 36,
        contentSize: 24,
        headingWeight: '700',
        contentWeight: '400',
        headingStyle: 'normal',
        contentStyle: 'normal',
        headingTransform: 'uppercase',
        headingLetterSpacing: 0.12,
        lineHeight: 1.7,
        sectionSpacing: 68,
        textColor: '#1E293BFF',
        accentColor: '#2563EBFF',
        subtitleColor: '#64748BFF',
        dividerColor: '#CBD5E1FF',
        background: { type: 'solid', color1: '#F8FAFCFF', color2: '#E2E8F0FF', angle: 180 }
    }
});

const BLOCK_TYPES = Object.freeze([
    { id: 'featured', label: 'Featured Card', defaultPresentation: 'card' },
    { id: 'role-split', label: 'Role & Name Split', defaultPresentation: 'crawl' },
    { id: 'roster', label: 'Multi-Col Roster', defaultPresentation: 'crawl' },
    { id: 'section', label: 'Stacked Section', defaultPresentation: 'crawl' },
    { id: 'paragraph', label: 'Paragraph / Legal', defaultPresentation: 'crawl' },
    { id: 'media', label: 'Inline Media', defaultPresentation: 'crawl' },
    { id: 'logo-strip', label: 'Logo / Sponsor Strip', defaultPresentation: 'crawl' },
    { id: 'split-row', label: 'Inline Split Row', defaultPresentation: 'crawl' },
    { id: 'divider', label: 'Divider', defaultPresentation: 'crawl' },
    { id: 'spacer', label: 'Spacer', defaultPresentation: 'crawl' }
]);

const CLIP_ELEMENT_TYPES = Object.freeze([
    'image',
    'video',
    'slideshow',
    'text',
    'icon',
    'shape',
    'pattern',
    'badge',
    'counter',
    'meter',
    'cutout'
]);

const TRANSITION_TYPES = Object.freeze([
    'fade',
    'slide-up',
    'slide-down',
    'slide-left',
    'slide-right',
    'zoom',
    'blur',
    'wipe',
    'none'
]);

const KEN_BURNS_TYPES = Object.freeze([
    'none',
    'zoom-in',
    'zoom-out',
    'pan-left',
    'pan-right'
]);

const DIVIDER_STYLES = Object.freeze([
    'line',
    'double',
    'dashed',
    'dotted',
    'stars',
    'fade',
    'ornament',
    'icon'
]);

function clamp(v, min, max, fallback) {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
}

function sanitizeId(raw, fallback = 'item') {
    const clean = String(raw || '')
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 64);
    return clean || fallback;
}

function sanitizeColor(raw, fallback = '#FFFFFFFF') {
    const s = String(raw || '').trim();
    if (!s) return fallback;
    if (/^var:[a-zA-Z0-9_.-]+(\|.*)?$/.test(s)) return s;
    if (/^#[0-9a-fA-F]{3,8}$/.test(s)) return s;
    if (/^(rgba?|hsla?)\([^)]+\)$/i.test(s)) return s;
    if (s === 'transparent') return s;
    return fallback;
}

function sanitizeMediaUrl(raw) {
    const s = String(raw || '').trim();
    if (!s || s.includes('..') || s.includes('\\')) return '';
    if (
        s.startsWith('/custom-overlay-assets/') ||
        s.startsWith('/uploads/') ||
        s.startsWith('/api/') ||
        s.startsWith('http://') ||
        s.startsWith('https://') ||
        s.startsWith('data:image/')
    ) {
        return s.slice(0, 1024);
    }
    return '';
}

function easeInOutCubic(t) {
    const x = Math.max(0, Math.min(1, t));
    return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

function easeOutCubic(t) {
    const x = Math.max(0, Math.min(1, t));
    return 1 - Math.pow(1 - x, 3);
}

function normalizeBlockStyle(raw = {}) {
    const s = raw && typeof raw === 'object' ? raw : {};
    return {
        headingFont: String(s.headingFont || '').trim().slice(0, 80),
        contentFont: String(s.contentFont || '').trim().slice(0, 80),
        headingSize: s.headingSize === '' || s.headingSize === undefined || s.headingSize === null ? '' : clamp(s.headingSize, 10, 240, ''),
        contentSize: s.contentSize === '' || s.contentSize === undefined || s.contentSize === null ? '' : clamp(s.contentSize, 10, 180, ''),
        headingWeight: String(s.headingWeight || '').slice(0, 16),
        contentWeight: String(s.contentWeight || '').slice(0, 16),
        headingColor: s.headingColor ? sanitizeColor(s.headingColor, '') : '',
        contentColor: s.contentColor ? sanitizeColor(s.contentColor, '') : '',
        align: ['left', 'center', 'right'].includes(s.align) ? s.align : 'center',
        italic: Boolean(s.italic),
        underline: Boolean(s.underline),
        uppercase: s.uppercase === undefined ? '' : Boolean(s.uppercase),
        letterSpacing: s.letterSpacing === '' || s.letterSpacing === undefined || s.letterSpacing === null ? '' : clamp(s.letterSpacing, -0.05, 0.8, ''),
        textShadow: Boolean(s.textShadow),
        bgColor: s.bgColor ? sanitizeColor(s.bgColor, '') : '',
        bgOpacity: clamp(s.bgOpacity, 0, 1, 0),
        bgRadius: clamp(s.bgRadius, 0, 120, 12),
        borderStyle: String(s.borderStyle || 'none').slice(0, 32),
        borderWidth: clamp(s.borderWidth, 0, 24, 0),
        borderColor: s.borderColor ? sanitizeColor(s.borderColor, '#FFFFFF44') : '#FFFFFF44',
        borderColor2: s.borderColor2 ? sanitizeColor(s.borderColor2, '#38BDF8FF') : '#38BDF8FF',
        borderAnim: String(s.borderAnim || 'none').slice(0, 32),
        iconClass: String(s.iconClass || '').replace(/[^a-z0-9\s-]/gi, '').trim().slice(0, 64),
        iconColor: s.iconColor ? sanitizeColor(s.iconColor, '') : ''
    };
}

function normalizeBlock(raw = {}, idx = 0) {
    const b = raw && typeof raw === 'object' ? raw : {};
    const validTypeIds = BLOCK_TYPES.map(t => t.id);
    const type = validTypeIds.includes(b.type) ? b.type : 'section';
    const typeDef = BLOCK_TYPES.find(t => t.id === type);
    const presentation = ['crawl', 'card'].includes(b.presentation)
        ? b.presentation
        : (typeDef?.defaultPresentation || 'crawl');

    const base = {
        id: sanitizeId(b.id, `blk-${idx + 1}`),
        type,
        presentation,
        enabled: b.enabled !== undefined ? Boolean(b.enabled) : true,
        collapsed: Boolean(b.collapsed),
        title: String(b.title ?? '').slice(0, 240),
        subtitle: String(b.subtitle ?? '').slice(0, 240),
        content: String(b.content ?? '').slice(0, 20000),
        duration: clamp(b.duration, 0.5, 120, presentation === 'card' ? 4.5 : 5),
        transitionIn: TRANSITION_TYPES.includes(b.transitionIn) ? b.transitionIn : 'fade',
        transitionOut: TRANSITION_TYPES.includes(b.transitionOut) ? b.transitionOut : 'fade',
        transitionSec: clamp(b.transitionSec, 0.05, 10, 0.75),
        transitionInSec: clamp(b.transitionInSec ?? b.transitionSec, 0, 10, 0.75),
        transitionOutSec: clamp(b.transitionOutSec ?? b.transitionSec, 0, 10, 0.75),
        zoneOverride: ['auto', 'center', 'left', 'right'].includes(b.zoneOverride) ? b.zoneOverride : 'auto',
        marker: String(b.marker || '').trim().slice(0, 64),
        paddingTop: b.paddingTop === '' || b.paddingTop === undefined || b.paddingTop === null ? '' : clamp(b.paddingTop, 0, 400, ''),
        paddingBottom: b.paddingBottom === '' || b.paddingBottom === undefined || b.paddingBottom === null ? '' : clamp(b.paddingBottom, 0, 400, ''),
        paddingH: b.paddingH === '' || b.paddingH === undefined || b.paddingH === null ? '' : clamp(b.paddingH, 0, 400, ''),
        columns: clamp(b.columns, 1, 4, type === 'roster' ? 2 : 1),
        autoFitNames: b.autoFitNames !== undefined ? Boolean(b.autoFitNames) : true,
        spacerHeight: clamp(b.spacerHeight, 16, 1200, 120),
        dividerStyle: DIVIDER_STYLES.includes(b.dividerStyle) ? b.dividerStyle : 'fade',
        dividerWidth: clamp(b.dividerWidth, 10, 100, 55),
        // Role-split rows: [{ id, role, name, checked }]
        rows: Array.isArray(b.rows)
            ? b.rows.slice(0, 500).map((r, ri) => ({
                id: sanitizeId(r?.id, `row-${ri + 1}`),
                role: String(r?.role ?? '').slice(0, 160),
                name: String(r?.name ?? '').slice(0, 200),
                checked: r?.checked !== undefined ? Boolean(r.checked) : true
            }))
            : [],
        // Roster entries: [{ id, name, editedName, checked, sourceKey }]
        names: Array.isArray(b.names)
            ? b.names.slice(0, 1000).map((n, ni) => ({
                id: sanitizeId(n?.id, `name-${ni + 1}`),
                name: String(n?.name ?? '').slice(0, 200),
                editedName: n?.editedName ? String(n.editedName).slice(0, 200) : '',
                checked: n?.checked !== undefined ? Boolean(n.checked) : true,
                sourceKey: String(n?.sourceKey || '').slice(0, 128)
            }))
            : [],
        // Data source binding for roster / role-split blocks
        dataSource: {
            type: ['manual', 'variable-set', 'list-variable', 'session-credits'].includes(b.dataSource?.type)
                ? b.dataSource.type
                : 'manual',
            sourceId: String(b.dataSource?.sourceId || '').slice(0, 128),
            field: String(b.dataSource?.field || '').slice(0, 64),
            roleField: String(b.dataSource?.roleField || '').slice(0, 64),
            sessionCategory: String(b.dataSource?.sessionCategory || 'all').slice(0, 40)
        },
        // Inline media / split-row fields
        mediaKind: ['image', 'video', 'icon'].includes(b.mediaKind) ? b.mediaKind : 'image',
        mediaUrl: sanitizeMediaUrl(b.mediaUrl),
        mediaIcon: String(b.mediaIcon || 'fa-solid fa-film').replace(/[^a-z0-9\s-]/gi, '').trim().slice(0, 64),
        mediaWidth: clamp(b.mediaWidth, 40, 1600, type === 'split-row' ? 320 : 520),
        mediaHeight: clamp(b.mediaHeight, 0, 1200, 0),
        mediaRadius: clamp(b.mediaRadius, 0, 200, 12),
        mediaPosition: ['left', 'right'].includes(b.mediaPosition) ? b.mediaPosition : 'left',
        caption: String(b.caption ?? '').slice(0, 300),
        // Logo strip items: [{ id, url, label, height }]
        logos: Array.isArray(b.logos)
            ? b.logos.slice(0, 24).map((lg, li) => ({
                id: sanitizeId(lg?.id, `logo-${li + 1}`),
                url: sanitizeMediaUrl(lg?.url),
                iconClass: String(lg?.iconClass || '').replace(/[^a-z0-9\s-]/gi, '').trim().slice(0, 64),
                label: String(lg?.label ?? '').slice(0, 120)
            }))
            : [],
        logoHeight: clamp(b.logoHeight, 24, 240, 64),
        logoGap: clamp(b.logoGap, 8, 160, 48),
        logoMono: Boolean(b.logoMono),
        logoTint: b.logoTint ? sanitizeColor(b.logoTint, '#FFFFFFFF') : '',
        style: normalizeBlockStyle(b.style)
    };
    return base;
}

function normalizeClip(raw = {}, idx = 0) {
    const c = raw && typeof raw === 'object' ? raw : {};
    const elementType = CLIP_ELEMENT_TYPES.includes(c.elementType) ? c.elementType : 'image';
    return {
        id: sanitizeId(c.id, `clip-${idx + 1}`),
        name: String(c.name || `${elementType[0].toUpperCase()}${elementType.slice(1)} ${idx + 1}`).trim().slice(0, 100),
        elementType,
        enabled: c.enabled !== undefined ? Boolean(c.enabled) : true,
        timingMode: ['timecode', 'block'].includes(c.timingMode) ? c.timingMode : 'timecode',
        startSec: clamp(c.startSec, 0, 36000, 0),
        durationSec: clamp(c.durationSec, 0.25, 36000, 10),
        anchorBlockId: String(c.anchorBlockId || '').slice(0, 64),
        anchorOffsetSec: clamp(c.anchorOffsetSec, -60, 60, 0),
        anchorSpanBlocks: clamp(c.anchorSpanBlocks, 1, 20, 1),
        // Geometry in canvas percentages (0..100) for resolution independence
        x: clamp(c.x, -50, 100, 6),
        y: clamp(c.y, -50, 100, 14),
        width: clamp(c.width, 2, 150, 40),
        height: clamp(c.height, 2, 150, 72),
        rotation: clamp(c.rotation, -360, 360, 0),
        opacity: clamp(c.opacity, 0, 1, 1),
        pushCredits: ['auto', 'none', 'left', 'right'].includes(c.pushCredits) ? c.pushCredits : 'auto',
        enterAnim: TRANSITION_TYPES.includes(c.enterAnim) ? c.enterAnim : 'fade',
        exitAnim: TRANSITION_TYPES.includes(c.exitAnim) ? c.exitAnim : 'fade',
        enterSec: clamp(c.enterSec, 0, 10, 0.75),
        exitSec: clamp(c.exitSec, 0, 10, 0.75),
        kenBurns: KEN_BURNS_TYPES.includes(c.kenBurns) ? c.kenBurns : 'none',
        // Media & content props
        mediaUrl: sanitizeMediaUrl(c.mediaUrl),
        mediaFit: ['cover', 'contain', 'contain-blur', 'fill'].includes(c.mediaFit) ? c.mediaFit : 'cover',
        videoMuted: c.videoMuted !== undefined ? Boolean(c.videoMuted) : true,
        videoLoop: c.videoLoop !== undefined ? Boolean(c.videoLoop) : true,
        videoStartSec: clamp(c.videoStartSec, 0, 36000, 0),
        videoRate: clamp(c.videoRate, 0.25, 4, 1),
        slideshowImages: Array.isArray(c.slideshowImages)
            ? c.slideshowImages.slice(0, 40).map(sanitizeMediaUrl).filter(Boolean)
            : [],
        slideshowIntervalSec: clamp(c.slideshowIntervalSec, 1, 60, 4),
        text: String(c.text ?? '').slice(0, 4000),
        subtext: String(c.subtext ?? '').slice(0, 1000),
        fontFamily: String(c.fontFamily || '').slice(0, 80),
        fontSize: clamp(c.fontSize, 10, 240, 36),
        fontWeight: String(c.fontWeight || '700').slice(0, 16),
        textAlign: ['left', 'center', 'right'].includes(c.textAlign) ? c.textAlign : 'center',
        textColor: sanitizeColor(c.textColor, '#FFFFFFFF'),
        iconClass: String(c.iconClass || 'fa-solid fa-star').replace(/[^a-z0-9\s-]/gi, '').trim().slice(0, 64),
        iconColor: sanitizeColor(c.iconColor, '#E5C07BFF'),
        // Shape / pattern / counter / meter / badge props
        fillColor: sanitizeColor(c.fillColor, '#111827CC'),
        fillColor2: sanitizeColor(c.fillColor2, '#1E293BCC'),
        fillGradient: Boolean(c.fillGradient),
        fillAngle: clamp(c.fillAngle, 0, 360, 135),
        patternPreset: String(c.patternPreset || 'constellation').slice(0, 48),
        patternPalette: String(c.patternPalette || 'midnight').slice(0, 48),
        patternSpeed: clamp(c.patternSpeed, 0, 4, 0.5),
        counterValue: String(c.counterValue ?? '100').slice(0, 64),
        counterMax: clamp(c.counterMax, 1, 1000000, 100),
        counterLabel: String(c.counterLabel || 'Progress').slice(0, 80),
        badgeLabel: String(c.badgeLabel || 'FEATURED').slice(0, 80),
        badgeIcon: String(c.badgeIcon || 'fa-solid fa-award').replace(/[^a-z0-9\s-]/gi, '').trim().slice(0, 64),
        // Borders (shared 31 styles + 17 animations) & FX
        borderRadius: clamp(c.borderRadius, 0, 500, 14),
        borderStyle: String(c.borderStyle || 'none').slice(0, 32),
        borderWidth: clamp(c.borderWidth, 0, 40, 0),
        borderColor: sanitizeColor(c.borderColor, '#FFFFFFFF'),
        borderColor2: sanitizeColor(c.borderColor2, '#38BDF8FF'),
        borderAnim: String(c.borderAnim || 'none').slice(0, 32),
        borderAnimSpeed: clamp(c.borderAnimSpeed, 0.25, 20, 3),
        shadow: Boolean(c.shadow),
        filterBrightness: clamp(c.filterBrightness, 0, 200, 100),
        filterContrast: clamp(c.filterContrast, 0, 200, 100),
        filterSaturate: clamp(c.filterSaturate, 0, 200, 100),
        filterBlur: clamp(c.filterBlur, 0, 40, 0),
        filterGrayscale: clamp(c.filterGrayscale, 0, 100, 0),
        caption: String(c.caption || '').slice(0, 240)
    };
}

function normalizeTrack(raw = {}, idx = 0) {
    const t = raw && typeof raw === 'object' ? raw : {};
    const layer = ['behind', 'side', 'above'].includes(t.layer) ? t.layer : 'side';
    return {
        id: sanitizeId(t.id, `trk-${idx + 1}`),
        name: String(t.name || (layer === 'behind' ? 'Background Media' : layer === 'above' ? 'Foreground Overlay' : 'Side Showcase')).trim().slice(0, 80),
        layer,
        visible: t.visible !== undefined ? Boolean(t.visible) : true,
        locked: Boolean(t.locked),
        clips: Array.isArray(t.clips) ? t.clips.slice(0, 100).map((c, ci) => normalizeClip(c, ci)) : []
    };
}

function normalizeProject(raw = {}, fallbackIndex = 0) {
    const p = raw && typeof raw === 'object' ? raw : {};
    const themePresetId = STARTER_THEMES[p.theme?.preset] ? p.theme.preset : 'hollywood-classic';
    const preset = STARTER_THEMES[themePresetId];
    const presetCanvas = CANVAS_PRESETS.find(c => c.id === p.canvas?.preset) || CANVAS_PRESETS[0];

    const canvasW = clamp(p.canvas?.width, 320, 7680, presetCanvas.width);
    const canvasH = clamp(p.canvas?.height, 240, 4320, presetCanvas.height);

    const tracks = Array.isArray(p.tracks) && p.tracks.length
        ? p.tracks.slice(0, 12).map((t, ti) => normalizeTrack(t, ti))
        : [
            normalizeTrack({ id: 'trk-side', name: 'Side Media & Visuals', layer: 'side', clips: [] }, 0),
            normalizeTrack({ id: 'trk-behind', name: 'Backdrop Layer', layer: 'behind', clips: [] }, 1)
        ];

    return {
        id: sanitizeId(p.id || p.name, `credits-${fallbackIndex + 1}`),
        name: String(p.name || 'Untitled Credit Sequence').trim().slice(0, 100) || 'Untitled Credit Sequence',
        description: String(p.description || '').trim().slice(0, 300),
        createdAt: p.createdAt || new Date().toISOString(),
        updatedAt: p.updatedAt || new Date().toISOString(),
        canvas: {
            preset: CANVAS_PRESETS.some(c => c.id === p.canvas?.preset) ? p.canvas.preset : '1080p',
            width: Math.round(canvasW),
            height: Math.round(canvasH),
            fps: [24, 30, 60].includes(Number(p.canvas?.fps)) ? Number(p.canvas.fps) : 60,
            edgeFadeTop: clamp(p.canvas?.edgeFadeTop, 0, 35, 10),
            edgeFadeBottom: clamp(p.canvas?.edgeFadeBottom, 0, 35, 10)
        },
        background: {
            type: ['solid', 'gradient', 'transparent', 'pattern', 'image', 'video', 'chroma'].includes(p.background?.type)
                ? p.background.type
                : (preset.background?.type || 'solid'),
            color1: sanitizeColor(p.background?.color1, preset.background?.color1 || '#07080CFF'),
            color2: sanitizeColor(p.background?.color2, preset.background?.color2 || '#11141FFF'),
            angle: clamp(p.background?.angle, 0, 360, preset.background?.angle ?? 180),
            chromaColor: sanitizeColor(p.background?.chromaColor, '#00FF00FF'),
            patternPreset: String(p.background?.patternPreset || 'constellation').slice(0, 48),
            patternPalette: String(p.background?.patternPalette || 'midnight').slice(0, 48),
            patternSpeed: clamp(p.background?.patternSpeed, 0, 4, 0.4),
            patternOpacity: clamp(p.background?.patternOpacity, 0, 1, 0.55),
            mediaUrl: sanitizeMediaUrl(p.background?.mediaUrl),
            mediaFit: ['cover', 'contain', 'contain-blur'].includes(p.background?.mediaFit) ? p.background.mediaFit : 'cover',
            mediaOpacity: clamp(p.background?.mediaOpacity, 0, 1, 0.45),
            mediaBlur: clamp(p.background?.mediaBlur, 0, 40, 0)
        },
        timing: {
            mode: ['speed', 'duration'].includes(p.timing?.mode) ? p.timing.mode : 'speed',
            speedPxPerSec: clamp(p.timing?.speedPxPerSec, 15, 600, 95),
            targetDurationSec: clamp(p.timing?.targetDurationSec, 5, 3600, 45),
            leadInSec: clamp(p.timing?.leadInSec, 0, 30, 0.5),
            leadOutSec: clamp(p.timing?.leadOutSec, 0, 30, 1.0),
            endBehavior: ['clear', 'hold', 'loop'].includes(p.timing?.endBehavior) ? p.timing.endBehavior : 'hold',
            autoplay: p.timing?.autoplay !== undefined ? Boolean(p.timing.autoplay) : true,
            loop: Boolean(p.timing?.loop),
            resetOnVisible: p.timing?.resetOnVisible !== undefined ? Boolean(p.timing.resetOnVisible) : true
        },
        theme: {
            preset: themePresetId,
            headingFont: String(p.theme?.headingFont || preset.headingFont).trim().slice(0, 80),
            contentFont: String(p.theme?.contentFont || preset.contentFont).trim().slice(0, 80),
            headingSize: clamp(p.theme?.headingSize, 12, 160, preset.headingSize),
            contentSize: clamp(p.theme?.contentSize, 10, 120, preset.contentSize),
            headingWeight: String(p.theme?.headingWeight || preset.headingWeight).slice(0, 16),
            contentWeight: String(p.theme?.contentWeight || preset.contentWeight).slice(0, 16),
            headingStyle: ['normal', 'italic'].includes(p.theme?.headingStyle) ? p.theme.headingStyle : preset.headingStyle,
            contentStyle: ['normal', 'italic'].includes(p.theme?.contentStyle) ? p.theme.contentStyle : preset.contentStyle,
            headingTransform: ['uppercase', 'capitalize', 'none'].includes(p.theme?.headingTransform) ? p.theme.headingTransform : preset.headingTransform,
            headingLetterSpacing: clamp(p.theme?.headingLetterSpacing, 0, 0.6, preset.headingLetterSpacing),
            lineHeight: clamp(p.theme?.lineHeight, 1.0, 3.2, preset.lineHeight),
            sectionSpacing: clamp(p.theme?.sectionSpacing, 0, 300, preset.sectionSpacing),
            textColor: sanitizeColor(p.theme?.textColor, preset.textColor),
            accentColor: sanitizeColor(p.theme?.accentColor, preset.accentColor),
            subtitleColor: sanitizeColor(p.theme?.subtitleColor, preset.subtitleColor),
            dividerColor: sanitizeColor(p.theme?.dividerColor, preset.dividerColor),
            paddingV: clamp(p.theme?.paddingV, 0, 300, 40),
            paddingH: clamp(p.theme?.paddingH, 0, 400, 96),
            maxColumnWidth: clamp(p.theme?.maxColumnWidth, 400, 3200, 1180),
            autoReflow: {
                enabled: p.theme?.autoReflow?.enabled !== undefined ? Boolean(p.theme.autoReflow.enabled) : true,
                mode: ['per-section', 'glide'].includes(p.theme?.autoReflow?.mode) ? p.theme.autoReflow.mode : 'per-section',
                transitionSec: clamp(p.theme?.autoReflow?.transitionSec, 0.15, 3.0, 0.85),
                splitRatio: clamp(p.theme?.autoReflow?.splitRatio, 35, 65, 50),
                gapPx: clamp(p.theme?.autoReflow?.gapPx, 16, 200, 48)
            }
        },
        blocks: Array.isArray(p.blocks) ? p.blocks.slice(0, 200).map((b, bi) => normalizeBlock(b, bi)) : [],
        tracks
    };
}

/**
 * Estimate a block's rendered pixel height when DOM measurement is unavailable (e.g. server-side).
 */
function estimateBlockHeight(block, project) {
    if (!block || !block.enabled) return 0;
    const theme = project.theme || {};
    const hSize = Number(block.style?.headingSize) || theme.headingSize || 40;
    const cSize = Number(block.style?.contentSize) || theme.contentSize || 28;
    const lh = theme.lineHeight || 1.75;
    const spacing = theme.sectionSpacing ?? 72;
    const padTop = block.paddingTop !== '' ? Number(block.paddingTop) : spacing * 0.5;
    const padBot = block.paddingBottom !== '' ? Number(block.paddingBottom) : spacing * 0.5;

    if (block.type === 'spacer') return block.spacerHeight || 120;
    if (block.type === 'divider') return padTop + padBot + 44;

    let bodyH = 0;
    if (block.title) bodyH += hSize * 1.4;
    if (block.subtitle) bodyH += cSize * 1.1;

    if (block.type === 'featured') {
        bodyH += (block.content ? block.content.split('\n').length : 1) * (cSize * 1.5);
    } else if (block.type === 'role-split') {
        const rows = (block.rows || []).filter(r => r.checked !== false);
        bodyH += Math.max(1, rows.length) * (cSize * lh);
    } else if (block.type === 'roster') {
        const cols = Math.max(1, Math.min(4, block.columns || 2));
        const names = (block.names || []).filter(n => n.checked !== false);
        bodyH += Math.ceil(Math.max(1, names.length) / cols) * (cSize * lh);
    } else if (block.type === 'section' || block.type === 'paragraph') {
        const lines = (block.content || '').split('\n').filter(Boolean);
        const cols = block.type === 'section' ? Math.max(1, Math.min(4, block.columns || 1)) : 1;
        bodyH += Math.ceil(Math.max(1, lines.length) / cols) * (cSize * lh);
    } else if (block.type === 'media') {
        bodyH += (block.mediaHeight || Math.round((block.mediaWidth || 520) * 0.58)) + (block.caption ? cSize * 1.3 : 0);
    } else if (block.type === 'logo-strip') {
        const count = Math.max(1, (block.logos || []).length);
        const rows = Math.ceil(count / 4);
        bodyH += rows * ((block.logoHeight || 64) + 32);
    } else if (block.type === 'split-row') {
        const lines = (block.content || '').split('\n').filter(Boolean).length;
        bodyH += Math.max(block.mediaHeight || 220, lines * cSize * lh + hSize * 1.3);
    }
    return Math.round(padTop + padBot + bodyH);
}

function clipPushZone(clip, track) {
    if (!clip || clip.enabled === false || !track || !track.visible) return 'none';
    if (clip.pushCredits === 'none' || track.layer === 'behind') return 'none';
    if (clip.pushCredits === 'left' || clip.pushCredits === 'right') return clip.pushCredits;
    const clipCenterX = (Number(clip.x) || 0) + (Number(clip.width) || 40) * 0.5;
    const clipWidth = Number(clip.width) || 40;
    if (clipWidth < 72) {
        return clipCenterX <= 50 ? 'right' : 'left';
    }
    return 'none';
}

/**
 * Deterministic Timeline Solver.
 * Groups contiguous 'crawl' blocks into Crawl Runs and 'card' blocks into Card Segments.
 * Resolves exact [startSec, endSec] for every block, every run, per-section auto-column
 * placement (with automatic vertical clearance so centered sections never collide with
 * disappearing side media), every block-anchored clip, and every jump marker.
 */
function solveTimeline(project, measuredHeights = {}) {
    const canvasH = project.canvas?.height || 1080;
    const timing = project.timing || {};
    const leadIn = timing.leadInSec ?? 0.5;
    const leadOut = timing.leadOutSec ?? 1.0;
    const reflowCfg = project.theme?.autoReflow || {};
    const reflowEnabled = reflowCfg.enabled !== false;
    const reflowMode = reflowCfg.mode === 'glide' ? 'glide' : 'per-section';

    const enabledBlocks = (project.blocks || []).filter(b => b.enabled !== false);

    // Pre-pass: identify blocks directly anchored by visible side-pushing clips
    const blockAnchoredZones = {};
    if (reflowEnabled) {
        for (const track of (project.tracks || [])) {
            if (!track.visible) continue;
            for (const clip of (track.clips || [])) {
                const pz = clipPushZone(clip, track);
                if (pz === 'none' || clip.timingMode !== 'block' || !clip.anchorBlockId) continue;
                const startIdx = enabledBlocks.findIndex(b => b.id === clip.anchorBlockId);
                if (startIdx < 0) continue;
                const spanN = Math.max(1, Number(clip.anchorSpanBlocks) || 1);
                for (let k = 0; k < spanN && startIdx + k < enabledBlocks.length; k++) {
                    blockAnchoredZones[enabledBlocks[startIdx + k].id] = pz;
                }
            }
        }
    }

    function computePass(blockZones, extraClearanceByBlock = {}) {
        const segments = [];
        let currentCrawl = null;

        for (const block of enabledBlocks) {
            const zone = block.zoneOverride && block.zoneOverride !== 'auto'
                ? block.zoneOverride
                : (blockZones[block.id] || 'center');
            if (block.presentation === 'card') {
                currentCrawl = null;
                segments.push({
                    kind: 'card',
                    id: `seg-${block.id}`,
                    blockId: block.id,
                    block,
                    zone,
                    durationSec: Math.max(0.5, Number(block.duration) || 4.5)
                });
            } else {
                if (!currentCrawl) {
                    currentCrawl = {
                        kind: 'crawl',
                        id: `run-${segments.length + 1}`,
                        blocks: [],
                        blockMetrics: [],
                        contentHeight: 0,
                        travelDistance: 0,
                        durationSec: 0
                    };
                    segments.push(currentCrawl);
                }
                const clearanceTopPx = Math.max(0, Math.round(Number(extraClearanceByBlock[block.id]) || 0));
                currentCrawl.contentHeight += clearanceTopPx;
                const h = Number(measuredHeights[block.id]) > 0
                    ? Number(measuredHeights[block.id])
                    : estimateBlockHeight(block, project);
                currentCrawl.blockMetrics.push({
                    blockId: block.id,
                    block,
                    zone,
                    clearanceTopPx,
                    offsetY: currentCrawl.contentHeight,
                    height: h
                });
                currentCrawl.blocks.push(block);
                currentCrawl.contentHeight += h;
            }
        }

        const totalCardSec = segments.filter(s => s.kind === 'card').reduce((acc, s) => acc + s.durationSec, 0);
        const crawlRuns = segments.filter(s => s.kind === 'crawl');
        let totalCrawlTravel = 0;
        for (const run of crawlRuns) {
            run.travelDistance = canvasH + Math.max(120, run.contentHeight);
            totalCrawlTravel += run.travelDistance;
        }

        let effectiveSpeed = Math.max(15, Number(timing.speedPxPerSec) || 95);
        if (timing.mode === 'duration' && crawlRuns.length > 0) {
            const targetTotal = Math.max(5, Number(timing.targetDurationSec) || 45);
            const availableForCrawl = Math.max(2, targetTotal - leadIn - leadOut - totalCardSec);
            effectiveSpeed = Math.max(10, totalCrawlTravel / availableForCrawl);
        }

        for (const run of crawlRuns) {
            run.speedPxPerSec = effectiveSpeed;
            run.durationSec = run.travelDistance / effectiveSpeed;
        }

        let cursor = leadIn;
        const blockTimings = {};
        const markers = [];

        for (const seg of segments) {
            seg.startSec = cursor;
            seg.endSec = cursor + seg.durationSec;
            if (seg.kind === 'card') {
                blockTimings[seg.blockId] = {
                    kind: 'card',
                    segmentId: seg.id,
                    zone: seg.zone,
                    startSec: seg.startSec,
                    endSec: seg.endSec,
                    centerSec: (seg.startSec + seg.endSec) * 0.5,
                    durationSec: seg.durationSec
                };
                if (seg.block.marker) {
                    markers.push({ name: seg.block.marker, timeSec: seg.startSec, blockId: seg.blockId });
                }
            } else {
                for (const bm of seg.blockMetrics) {
                    const enterSec = seg.startSec + bm.offsetY / seg.speedPxPerSec;
                    const centerSec = seg.startSec + (bm.offsetY + bm.height * 0.5 + canvasH * 0.5) / seg.speedPxPerSec;
                    const exitSec = seg.startSec + (bm.offsetY + bm.height + canvasH) / seg.speedPxPerSec;
                    const focusStart = seg.startSec + Math.max(0, bm.offsetY + canvasH * 0.12) / seg.speedPxPerSec;
                    const focusEnd = seg.startSec + (bm.offsetY + bm.height + canvasH * 0.52) / seg.speedPxPerSec;
                    blockTimings[bm.blockId] = {
                        kind: 'crawl',
                        segmentId: seg.id,
                        zone: bm.zone,
                        clearanceTopPx: bm.clearanceTopPx,
                        startSec: enterSec,
                        endSec: exitSec,
                        focusStartSec: focusStart,
                        focusEndSec: focusEnd,
                        centerSec,
                        durationSec: Math.max(0.5, exitSec - enterSec),
                        offsetY: bm.offsetY,
                        height: bm.height
                    };
                    if (bm.block.marker) {
                        markers.push({ name: bm.block.marker, timeSec: focusStart, blockId: bm.blockId });
                    }
                }
            }
            cursor = seg.endSec;
        }

        const sequenceEndSec = cursor + leadOut;

        const resolvedClips = [];
        let maxClipEnd = 0;
        for (const track of (project.tracks || [])) {
            if (!track.visible) continue;
            for (const clip of (track.clips || [])) {
                if (clip.enabled === false) continue;
                let startSec = clip.startSec || 0;
                let durationSec = Math.max(0.25, clip.durationSec || 10);

                if (clip.timingMode === 'block' && clip.anchorBlockId && blockTimings[clip.anchorBlockId]) {
                    const bt = blockTimings[clip.anchorBlockId];
                    const anchorStart = bt.kind === 'crawl' ? bt.focusStartSec : bt.startSec;
                    let spanEnd = bt.kind === 'crawl' ? bt.focusEndSec : bt.endSec;
                    const spanN = Math.max(1, Number(clip.anchorSpanBlocks) || 1);
                    if (spanN > 1) {
                        const idx = enabledBlocks.findIndex(b => b.id === clip.anchorBlockId);
                        if (idx >= 0) {
                            const lastBlock = enabledBlocks[Math.min(enabledBlocks.length - 1, idx + spanN - 1)];
                            const lastBt = blockTimings[lastBlock.id];
                            if (lastBt) spanEnd = lastBt.kind === 'crawl' ? lastBt.focusEndSec : lastBt.endSec;
                        }
                    }
                    startSec = Math.max(0, anchorStart + (Number(clip.anchorOffsetSec) || 0));
                    durationSec = Math.max(0.5, spanEnd - anchorStart);
                }

                const endSec = startSec + durationSec;
                if (endSec > maxClipEnd) maxClipEnd = endSec;

                resolvedClips.push({
                    trackId: track.id,
                    trackName: track.name,
                    layer: track.layer,
                    clip,
                    startSec,
                    endSec,
                    durationSec,
                    pushTargetZone: clipPushZone(clip, track)
                });
            }
        }

        const totalDurationSec = Math.max(
            timing.mode === 'duration' ? (Number(timing.targetDurationSec) || 10) : 0,
            sequenceEndSec,
            maxClipEnd + 0.25,
            2
        );

        return {
            segments,
            crawlRuns,
            blockTimings,
            resolvedClips,
            markers,
            effectiveSpeed,
            sequenceEndSec,
            totalDurationSec
        };
    }

    // Pass 1: initial layout with block-anchored zones
    const initialZones = { ...blockAnchoredZones };
    let solved = computePass(initialZones);

    // Pass 2 (Per-Section Auto-Center): assign timecode-overlapping blocks to side column,
    // leave the next section after side media disappears cleanly centered, and auto-calculate
    // vertical clearance so centered sections enter cleanly right after the side clip fades out!
    if (reflowEnabled && reflowMode === 'per-section') {
        const finalZones = { ...initialZones };
        const sideClips = solved.resolvedClips.filter(rc => rc.pushTargetZone !== 'none');

        if (sideClips.length) {
            for (const block of enabledBlocks) {
                if (block.zoneOverride && block.zoneOverride !== 'auto') {
                    finalZones[block.id] = block.zoneOverride;
                    continue;
                }
                if (finalZones[block.id]) continue;
                const bt = solved.blockTimings[block.id];
                if (!bt) continue;
                // Check if any timecode side clip overlaps when this block is crossing the main stage
                for (const rc of sideClips) {
                    if (rc.clip.timingMode === 'block') continue;
                    const blkStart = bt.kind === 'crawl' ? bt.focusStartSec : bt.startSec;
                    const blkEnd = bt.kind === 'crawl' ? bt.focusEndSec : bt.endSec;
                    // If the block enters after the side clip has already disappeared, keep it centered!
                    if (blkStart >= rc.endSec - 0.15) continue;
                    if (blkEnd > rc.startSec + 0.15 && blkStart < rc.endSec - 0.15) {
                        finalZones[block.id] = rc.pushTargetZone;
                        break;
                    }
                }
            }

            // Re-run with finalized per-block zones, then compute vertical clearance where
            // a side-column block transitions back to a centered section!
            const zonedSolved = computePass(finalZones);
            const clearanceMap = {};
            const resolvedSideClips = zonedSolved.resolvedClips.filter(rc => rc.pushTargetZone !== 'none');

            for (const run of zonedSolved.crawlRuns) {
                for (let i = 1; i < run.blockMetrics.length; i++) {
                    const prevBm = run.blockMetrics[i - 1];
                    const curBm = run.blockMetrics[i];
                    if (prevBm.zone !== 'center' && curBm.zone === 'center') {
                        // Find the latest endSec of any side clip covering prevBm
                        const prevBt = zonedSolved.blockTimings[prevBm.blockId];
                        let latestClipEnd = 0;
                        let lowestClipBottomY = canvasH * 0.85;
                        for (const rc of resolvedSideClips) {
                            if (rc.pushTargetZone !== prevBm.zone) continue;
                            const coversPrev = rc.clip.timingMode === 'block'
                                ? (rc.endSec >= prevBt.focusStartSec && rc.startSec <= prevBt.focusEndSec + 0.5)
                                : (rc.endSec > prevBt.startSec && rc.startSec < prevBt.endSec);
                            if (coversPrev && rc.endSec > latestClipEnd) {
                                latestClipEnd = rc.endSec;
                                lowestClipBottomY = Math.min(canvasH, ((Number(rc.clip.y) || 0) + (Number(rc.clip.height) || 70)) / 100 * canvasH);
                            }
                        }
                        if (latestClipEnd > 0) {
                            // Centered block reaches the clip's bottom band when scroll has traveled (curBm.offsetY + (canvasH - lowestClipBottomY))
                            const reachClipBandSec = run.startSec + (curBm.offsetY + Math.max(0, canvasH - lowestClipBottomY)) / run.speedPxPerSec;
                            const neededDelaySec = Math.max(0, latestClipEnd - reachClipBandSec);
                            if (neededDelaySec > 0.05) {
                                clearanceMap[curBm.blockId] = Math.min(Math.round(canvasH * 0.65), Math.round(neededDelaySec * run.speedPxPerSec));
                            }
                        }
                    }
                }
            }

            solved = computePass(finalZones, clearanceMap);
        }
    }

    return solved;
}

/**
 * Computes horizontal reflow state at time `t`.
 * - In 'per-section' mode (default): each block is permanently positioned in its solved column
 *   (Center / Left / Right) with zero jarring sideways glide mid-scroll; the credits column
 *   wrapper stays locked at 100% width centered while we report the active section's zone.
 * - In 'glide' mode: smoothly eases the entire credits column horizontally as side clips enter/exit.
 */
function evaluateReflowState(t, solved, project) {
    const reflowCfg = project.theme?.autoReflow || {};
    const enabled = reflowCfg.enabled !== false;
    const mode = reflowCfg.mode === 'glide' ? 'glide' : 'per-section';
    const transSec = Math.max(0.15, Number(reflowCfg.transitionSec) || 0.85);
    const splitRatio = clamp(reflowCfg.splitRatio, 35, 65, 50) / 100;

    if (!enabled) {
        return { mode, zone: 'center', shiftNorm: 0, widthRatio: 1, centerXPercent: 50, activePusherIds: [] };
    }

    if (mode === 'per-section') {
        // Report which column the currently focused credit section is using (for Stage status pill)
        let activeZone = 'center';
        const activePusherIds = [];
        for (const rc of solved.resolvedClips) {
            if (rc.pushTargetZone !== 'none' && t >= rc.startSec && t <= rc.endSec) {
                activePusherIds.push(rc.clip.id);
                activeZone = rc.pushTargetZone;
            }
        }
        return {
            mode: 'per-section',
            zone: activeZone,
            shiftNorm: 0,
            widthRatio: 1,
            centerXPercent: 50,
            activePusherIds
        };
    }

    // Smooth Glide mode
    for (const seg of solved.segments) {
        if (seg.kind === 'card' && t >= seg.startSec && t <= seg.endSec) {
            const ov = seg.block.zoneOverride;
            if (ov === 'left' || ov === 'right' || ov === 'center') {
                const shiftNorm = ov === 'left' ? -1 : ov === 'right' ? 1 : 0;
                const widthRatio = ov === 'center' ? 1 : splitRatio;
                const centerXPercent = ov === 'center' ? 50 : (ov === 'left' ? (splitRatio * 50) : (100 - splitRatio * 50));
                return { mode: 'glide', zone: ov, shiftNorm, widthRatio, centerXPercent, activePusherIds: [] };
            }
        }
    }

    let leftInfluence = 0;
    let rightInfluence = 0;
    const activePusherIds = [];

    for (const rc of solved.resolvedClips) {
        if (rc.pushTargetZone === 'none') continue;
        const enterLead = Math.min(transSec * 0.5, 0.5);
        const windowStart = Math.max(0, rc.startSec - enterLead);
        const windowEnd = rc.endSec + transSec * 0.35;
        if (t < windowStart || t > windowEnd) continue;

        let weight = 1;
        const inEnd = windowStart + transSec;
        const outStart = Math.max(inEnd, windowEnd - transSec);
        if (t < inEnd) {
            weight = easeInOutCubic((t - windowStart) / Math.max(0.05, inEnd - windowStart));
        } else if (t > outStart) {
            weight = 1 - easeInOutCubic((t - outStart) / Math.max(0.05, windowEnd - outStart));
        }

        if (weight > 0.001) {
            activePusherIds.push(rc.clip.id);
            if (rc.pushTargetZone === 'right') rightInfluence = Math.max(rightInfluence, weight);
            if (rc.pushTargetZone === 'left') leftInfluence = Math.max(leftInfluence, weight);
        }
    }

    const shiftNorm = Math.max(-1, Math.min(1, rightInfluence - leftInfluence));
    const absShift = Math.abs(shiftNorm);
    const widthRatio = 1 - absShift * (1 - splitRatio);
    const targetHalfCenter = 50 * splitRatio;
    const centerXPercent = 50 + shiftNorm * (50 - targetHalfCenter);
    const zone = absShift < 0.05 ? 'center' : (shiftNorm > 0 ? 'right' : 'left');

    return {
        mode: 'glide',
        zone,
        shiftNorm,
        widthRatio,
        centerXPercent,
        activePusherIds
    };
}

function evaluateTransition(type, progress, isExit) {
    // progress: 0 -> fully hidden, 1 -> fully visible
    const p = Math.max(0, Math.min(1, progress));
    const inv = 1 - p;
    const dirSign = isExit ? -1 : 1;
    const res = { opacity: 1, translateX: 0, translateY: 0, scale: 1, blur: 0, clipPath: '' };
    switch (type) {
        case 'none':
            res.opacity = p > 0 ? 1 : 0;
            break;
        case 'fade':
            res.opacity = p;
            break;
        case 'slide-up':
            res.opacity = p;
            res.translateY = inv * 56 * dirSign;
            break;
        case 'slide-down':
            res.opacity = p;
            res.translateY = -inv * 56 * dirSign;
            break;
        case 'slide-left':
            res.opacity = p;
            res.translateX = inv * 90 * dirSign;
            break;
        case 'slide-right':
            res.opacity = p;
            res.translateX = -inv * 90 * dirSign;
            break;
        case 'zoom':
            res.opacity = p;
            res.scale = 1 - inv * (isExit ? -0.08 : 0.12);
            break;
        case 'blur':
            res.opacity = p;
            res.blur = inv * 14;
            res.scale = 1 + inv * 0.04;
            break;
        case 'wipe': {
            const pct = Math.round(inv * 100);
            res.clipPath = isExit ? `inset(0 0 0 ${pct}%)` : `inset(0 ${pct}% 0 0)`;
            break;
        }
        default:
            res.opacity = p;
            break;
    }
    return res;
}

/**
 * Evaluates the complete visual state of the Credit Suite at timestamp `tSec`.
 */
function evaluateFrame(tSec, solved, project) {
    const durationSec = solved.totalDurationSec || 1;
    const endBehavior = project.timing?.endBehavior || 'hold';
    let t = Number(tSec) || 0;
    let ended = false;

    if (t < 0) t = 0;
    if (t >= durationSec) {
        if (project.timing?.loop || endBehavior === 'loop') {
            t = t % durationSec;
        } else {
            ended = true;
            t = durationSec;
        }
    }

    const canvasH = project.canvas?.height || 1080;
    const reflow = evaluateReflowState(t, solved, project);
    const activeRuns = [];
    const activeCards = [];

    const clearOnEnd = ended && endBehavior === 'clear';

    if (!clearOnEnd) {
        for (const seg of solved.segments) {
            if (seg.kind === 'crawl') {
                const isLast = seg === solved.segments[solved.segments.length - 1];
                const holdLast = ended && endBehavior === 'hold' && isLast;
                if ((t >= seg.startSec && t <= seg.endSec) || holdLast) {
                    const localT = Math.max(0, Math.min(seg.durationSec, t - seg.startSec));
                    const scrollY = canvasH - localT * seg.speedPxPerSec;
                    activeRuns.push({
                        runId: seg.id,
                        scrollY,
                        progress: seg.durationSec > 0 ? localT / seg.durationSec : 1
                    });
                }
            } else if (seg.kind === 'card') {
                const isLast = seg === solved.segments[solved.segments.length - 1];
                const holdLast = ended && endBehavior === 'hold' && isLast;
                if ((t >= seg.startSec && t <= seg.endSec) || holdLast) {
                    const localT = Math.max(0, Math.min(seg.durationSec, t - seg.startSec));
                    const inSec = Math.min(seg.block.transitionInSec ?? seg.block.transitionSec ?? 0.75, seg.durationSec * 0.48);
                    const outSec = Math.min(seg.block.transitionOutSec ?? seg.block.transitionSec ?? 0.75, seg.durationSec * 0.48);
                    let fx = { opacity: 1, translateX: 0, translateY: 0, scale: 1, blur: 0, clipPath: '' };
                    if (localT < inSec && inSec > 0) {
                        fx = evaluateTransition(seg.block.transitionIn || 'fade', easeOutCubic(localT / inSec), false);
                    } else if (!holdLast && localT > seg.durationSec - outSec && outSec > 0) {
                        fx = evaluateTransition(seg.block.transitionOut || 'fade', easeOutCubic((seg.durationSec - localT) / outSec), true);
                    }
                    activeCards.push({
                        blockId: seg.blockId,
                        segmentId: seg.id,
                        localTime: localT,
                        ...fx
                    });
                }
            }
        }
    }

    const activeClips = [];
    if (!clearOnEnd) {
        for (const rc of solved.resolvedClips) {
            if (t < rc.startSec || t > rc.endSec) continue;
            const localT = t - rc.startSec;
            const dur = rc.durationSec;
            const c = rc.clip;
            const inSec = Math.min(c.enterSec || 0, dur * 0.45);
            const outSec = Math.min(c.exitSec || 0, dur * 0.45);

            let fx = { opacity: 1, translateX: 0, translateY: 0, scale: 1, blur: 0, clipPath: '' };
            if (inSec > 0 && localT < inSec) {
                fx = evaluateTransition(c.enterAnim || 'fade', easeOutCubic(localT / inSec), false);
            } else if (outSec > 0 && localT > dur - outSec) {
                fx = evaluateTransition(c.exitAnim || 'fade', easeOutCubic((dur - localT) / outSec), true);
            }

            // Ken Burns continuous slow camera drift
            let kbScale = 1;
            let kbX = 0;
            let kbY = 0;
            const frac = dur > 0 ? localT / dur : 0;
            if (c.kenBurns === 'zoom-in') kbScale = 1 + frac * 0.14;
            else if (c.kenBurns === 'zoom-out') kbScale = 1.14 - frac * 0.14;
            else if (c.kenBurns === 'pan-left') { kbScale = 1.12; kbX = (0.5 - frac) * 6; }
            else if (c.kenBurns === 'pan-right') { kbScale = 1.12; kbX = (frac - 0.5) * 6; }

            const mediaTime = (Number(c.videoStartSec) || 0) + localT * (Number(c.videoRate) || 1);

            activeClips.push({
                trackId: rc.trackId,
                layer: rc.layer,
                clip: c,
                localTime: localT,
                duration: dur,
                mediaTime,
                opacity: (c.opacity ?? 1) * fx.opacity,
                translateX: fx.translateX,
                translateY: fx.translateY,
                scale: fx.scale,
                blur: fx.blur,
                clipPath: fx.clipPath,
                kbScale,
                kbX,
                kbY
            });
        }
    }

    return {
        timeSec: t,
        durationSec,
        progress: durationSec > 0 ? t / durationSec : 0,
        ended,
        reflow,
        activeRuns,
        activeCards,
        activeClips
    };
}

function formatSrtTimestamp(sec) {
    const msTotal = Math.max(0, Math.round(sec * 1000));
    const h = Math.floor(msTotal / 3600000);
    const m = Math.floor((msTotal % 3600000) / 60000);
    const s = Math.floor((msTotal % 60000) / 1000);
    const ms = msTotal % 1000;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

function getBlockPlainText(block) {
    if (!block || !block.enabled) return '';
    if (block.type === 'spacer' || block.type === 'divider') return '';
    const lines = [];
    if (block.title) lines.push(block.title.toUpperCase());
    if (block.subtitle) lines.push(block.subtitle);
    if (block.type === 'role-split') {
        const active = (block.rows || []).filter(r => r.checked !== false);
        active.forEach(r => lines.push([r.role, r.name].filter(Boolean).join(' — ')));
    } else if (block.type === 'roster') {
        const active = (block.names || []).filter(n => n.checked !== false);
        active.forEach(n => lines.push(n.editedName || n.name));
    } else if (block.type === 'logo-strip') {
        const labels = (block.logos || []).map(l => l.label).filter(Boolean);
        if (labels.length) lines.push(labels.join('  •  '));
    } else if (block.type === 'media') {
        if (block.caption) lines.push(block.caption);
    } else if (block.content) {
        lines.push(block.content.trim());
    }
    return lines.filter(Boolean).join('\n');
}

function generateSrt(project, solvedInput) {
    const solved = solvedInput || solveTimeline(project);
    const entries = [];
    let index = 1;
    for (const block of (project.blocks || [])) {
        if (!block.enabled) continue;
        const text = getBlockPlainText(block);
        if (!text) continue;
        const bt = solved.blockTimings[block.id];
        if (!bt) continue;
        const start = bt.kind === 'crawl' ? bt.focusStartSec : bt.startSec;
        const end = bt.kind === 'crawl' ? bt.focusEndSec : bt.endSec;
        entries.push(`${index}\n${formatSrtTimestamp(start)} --> ${formatSrtTimestamp(Math.max(start + 0.5, end))}\n${text}`);
        index++;
    }
    return entries.join('\n\n');
}

function generatePlainText(project) {
    return (project.blocks || [])
        .map(getBlockPlainText)
        .filter(Boolean)
        .join('\n\n');
}

function buildDefaultProjects() {
    const now = new Date().toISOString();
    return [
        normalizeProject({
            id: 'cinematic-feature',
            name: 'Cinematic Feature Credits',
            description: 'Modern film-grade credits combining Featured Cards, a Hollywood Role/Name crawl with automatic Side-Showcase reflow, 2-column auto-fit roster, sponsor strip, and closing card.',
            createdAt: now,
            updatedAt: now,
            canvas: { preset: '1080p', width: 1920, height: 1080, fps: 60, edgeFadeTop: 12, edgeFadeBottom: 12 },
            background: { type: 'gradient', color1: '#070910FF', color2: '#131826FF', angle: 180 },
            timing: { mode: 'speed', speedPxPerSec: 95, targetDurationSec: 45, leadInSec: 0.4, leadOutSec: 1.0, endBehavior: 'hold', autoplay: true, loop: false, resetOnVisible: true },
            theme: {
                preset: 'hollywood-classic',
                autoReflow: { enabled: true, transitionSec: 0.9, splitRatio: 52, gapPx: 48 }
            },
            blocks: [
                {
                    id: 'blk-opening',
                    type: 'featured',
                    presentation: 'card',
                    title: 'A STREAMPULSE ORIGINAL',
                    subtitle: 'Created Live With The Community',
                    content: 'DIRECTED & PRODUCED BY\nALEX RIVERA',
                    duration: 4.5,
                    transitionIn: 'fade',
                    transitionOut: 'fade',
                    transitionSec: 0.9,
                    marker: 'Opening'
                },
                {
                    id: 'blk-cast',
                    type: 'role-split',
                    presentation: 'crawl',
                    title: 'Cast & Crew',
                    subtitle: 'Principal Production Team',
                    marker: 'Cast & Crew',
                    rows: [
                        { id: 'r1', role: 'Executive Producer', name: 'Jordan Blake', checked: true },
                        { id: 'r2', role: 'Lead Director', name: 'Alex Rivera', checked: true },
                        { id: 'r3', role: 'Cinematography', name: 'Maya Chen', checked: true },
                        { id: 'r4', role: 'Motion Graphics', name: 'Devon Brooks', checked: true },
                        { id: 'r5', role: 'Audio Engineering', name: 'Samira Patel', checked: true },
                        { id: 'r6', role: 'Broadcast Technical Lead', name: 'Liam O\'Connor', checked: true }
                    ]
                },
                {
                    id: 'blk-div-1',
                    type: 'divider',
                    presentation: 'crawl',
                    dividerStyle: 'ornament'
                },
                {
                    id: 'blk-community',
                    type: 'roster',
                    presentation: 'crawl',
                    title: 'Special Thanks & Contributors',
                    subtitle: 'Featured Community Members',
                    columns: 2,
                    autoFitNames: true,
                    marker: 'Special Thanks',
                    names: [
                        { id: 'n1', name: 'Casey Morgan', checked: true },
                        { id: 'n2', name: 'Taylor Quinn', checked: true },
                        { id: 'n3', name: 'Riley Vance', checked: true },
                        { id: 'n4', name: 'Avery Sterling', checked: true },
                        { id: 'n5', name: 'Parker Hayes', checked: true },
                        { id: 'n6', name: 'Skylar Mercer', checked: true },
                        { id: 'n7', name: 'Rowan Ellis', checked: true },
                        { id: 'n8', name: 'Emerson Cross', checked: true }
                    ]
                },
                {
                    id: 'blk-split-bts',
                    type: 'split-row',
                    presentation: 'crawl',
                    title: 'Behind The Broadcast',
                    content: 'Filmed and streamed live at 60fps.\nEvery visual cue, transition, and frame dynamically orchestrated.',
                    mediaKind: 'icon',
                    mediaIcon: 'fa-solid fa-clapperboard',
                    mediaPosition: 'left',
                    mediaWidth: 160
                },
                {
                    id: 'blk-sponsors',
                    type: 'logo-strip',
                    presentation: 'crawl',
                    title: 'Built With',
                    logoHeight: 56,
                    logoGap: 56,
                    logos: [
                        { id: 'l1', iconClass: 'fa-solid fa-bolt', label: 'StreamPulse' },
                        { id: 'l2', iconClass: 'fa-solid fa-video', label: 'OBS Studio' },
                        { id: 'l3', iconClass: 'fa-solid fa-wand-magic-sparkles', label: 'Credit Suite' }
                    ]
                },
                {
                    id: 'blk-legal',
                    type: 'paragraph',
                    presentation: 'crawl',
                    title: '',
                    content: 'All fictional names shown are demonstration placeholders.\nCustomize typography, borders, side media, and live variables in Credit Suite.'
                },
                {
                    id: 'blk-outro',
                    type: 'featured',
                    presentation: 'card',
                    title: 'THANK YOU FOR WATCHING',
                    subtitle: 'See you on the next broadcast',
                    content: '',
                    duration: 4.5,
                    transitionIn: 'zoom',
                    transitionOut: 'fade',
                    transitionSec: 0.9,
                    marker: 'Ending'
                }
            ],
            tracks: [
                {
                    id: 'trk-side',
                    name: 'Side Showcase',
                    layer: 'side',
                    visible: true,
                    locked: false,
                    clips: [
                        {
                            id: 'clip-bts-card',
                            name: 'Production Reel Card (Auto-Reflow)',
                            elementType: 'shape',
                            timingMode: 'block',
                            anchorBlockId: 'blk-cast',
                            anchorOffsetSec: 0,
                            anchorSpanBlocks: 1,
                            startSec: 5.5,
                            durationSec: 11,
                            x: 5,
                            y: 16,
                            width: 40,
                            height: 68,
                            pushCredits: 'auto',
                            enterAnim: 'slide-left',
                            exitAnim: 'fade',
                            enterSec: 0.85,
                            exitSec: 0.85,
                            text: 'BEHIND THE SCENES',
                            subtext: 'Replace this card with any Video, Image, Slideshow, or Custom Element — credits automatically glide right while it plays, then return to center.',
                            iconClass: 'fa-solid fa-film',
                            iconColor: '#E5C07BFF',
                            fillColor: '#0F1524E6',
                            fillColor2: '#1C243AE6',
                            fillGradient: true,
                            borderRadius: 18,
                            borderStyle: 'corner-brackets',
                            borderWidth: 3,
                            borderColor: '#E5C07BFF',
                            borderColor2: '#38BDF8FF',
                            shadow: true
                        }
                    ]
                },
                {
                    id: 'trk-behind',
                    name: 'Backdrop FX',
                    layer: 'behind',
                    visible: true,
                    locked: false,
                    clips: []
                }
            ]
        }, 0),
        normalizeProject({
            id: 'broadcast-roll',
            name: 'Stream & Event Production Roll',
            description: 'Clean broadcast credits template pre-wired for transparent OBS overlay or quick MP4/WebM export.',
            createdAt: now,
            updatedAt: now,
            canvas: { preset: '1080p', width: 1920, height: 1080, fps: 60, edgeFadeTop: 10, edgeFadeBottom: 10 },
            background: { type: 'transparent', color1: '#0F172AFF', color2: '#1E293BFF', angle: 135 },
            timing: { mode: 'duration', speedPxPerSec: 100, targetDurationSec: 30, leadInSec: 0.25, leadOutSec: 0.75, endBehavior: 'clear', autoplay: true, loop: false, resetOnVisible: true },
            theme: { preset: 'broadcast-doc' },
            blocks: [
                {
                    id: 'blk-br-title',
                    type: 'featured',
                    presentation: 'card',
                    title: 'END OF BROADCAST',
                    subtitle: 'Thanks for tuning in',
                    duration: 3.5,
                    marker: 'Intro'
                },
                {
                    id: 'blk-br-crew',
                    type: 'role-split',
                    presentation: 'crawl',
                    title: 'Broadcast Team',
                    rows: [
                        { id: 'br1', role: 'Host', name: 'Channel Host', checked: true },
                        { id: 'br2', role: 'Moderation', name: 'Mod Team', checked: true },
                        { id: 'br3', role: 'Graphics & Overlays', name: 'StreamPulse', checked: true }
                    ]
                },
                {
                    id: 'blk-br-thanks',
                    type: 'section',
                    presentation: 'crawl',
                    title: 'Special Thanks',
                    columns: 1,
                    content: 'Everyone in chat tonight\nAll subscribers & supporters'
                }
            ],
            tracks: [
                { id: 'trk-side', name: 'Side Media & Visuals', layer: 'side', visible: true, locked: false, clips: [] },
                { id: 'trk-behind', name: 'Backdrop Layer', layer: 'behind', visible: true, locked: false, clips: [] }
            ]
        }, 1)
    ];
}

module.exports = {
    CANVAS_PRESETS,
    GOOGLE_FONT_LIST,
    SYSTEM_FONTS,
    STARTER_THEMES,
    BLOCK_TYPES,
    CLIP_ELEMENT_TYPES,
    TRANSITION_TYPES,
    KEN_BURNS_TYPES,
    DIVIDER_STYLES,
    clamp,
    sanitizeId,
    sanitizeColor,
    sanitizeMediaUrl,
    easeInOutCubic,
    easeOutCubic,
    normalizeBlockStyle,
    normalizeBlock,
    normalizeClip,
    normalizeTrack,
    normalizeProject,
    estimateBlockHeight,
    solveTimeline,
    evaluateReflowState,
    evaluateTransition,
    evaluateFrame,
    formatSrtTimestamp,
    getBlockPlainText,
    generateSrt,
    generatePlainText,
    buildDefaultProjects
};

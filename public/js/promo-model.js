(function (root) {
    const studioThemes = typeof module === 'object' && module.exports ? require('./studio-themes') : root.StudioThemes;
    const SIZES = { square: [1080, 1080], landscape: [1920, 1080], portrait: [1080, 1920] };
    const ELEMENT_TYPES = ['text', 'image', 'qr', 'shape', 'icon'];
    const TYPE_NAMES = { text: 'Text', image: 'Image', qr: 'QR code', shape: 'Shape', icon: 'Icon' };
    const ELEMENT_ROLES = ['photo', 'artwork', 'badge', 'title', 'subtitle', 'url', 'qr'];
    const PATTERNS = ['grid', 'geometry', 'orbits', 'hexagons', 'diamonds', 'isometric', 'mesh', 'sunburst', 'triangles', 'chevrons', 'checker', 'waves', 'rings', 'scales', 'topography', 'starfield', 'sparkles', 'dots', 'confetti', 'circuit'];
    const MOTIONS = ['none', 'drift', 'pulse', 'sweep', 'aurora', 'flow', 'sway', 'orbit', 'pan', 'rotate'];
    const FONT_WEIGHTS = [300, 400, 500, 600, 700, 800, 900];
    const THEMES = {
        studio: { background: '#f0eee8', panel: '#ffffff', accent: '#4338ca', text: '#141725', muted: '#51576b' },
        ember: { background: '#1b1114', panel: '#35212a', accent: '#ffb86b', text: '#fff6ee', muted: '#dbc6cd' }
    };
    for (const theme of Object.values(studioThemes)) {
        if (theme.id === 'system') continue;
        THEMES[theme.id] = {
            background: theme.id === 'gold' ? '#080f24' : theme.id === 'matrix' ? '#041511' : '#0b1020',
            panel: '#18213a', accent: theme.accent, secondary: theme.indicator,
            text: '#ffffff', muted: '#c4cce0'
        };
    }
    const number = (value, fallback, min, max) => Math.max(min, Math.min(max, value !== null && Number.isFinite(Number(value)) ? Number(value) : fallback));
    const text = (value, max) => typeof value === 'string' ? value.slice(0, max) : '';
    const hex = (value, fallback) => /^#[0-9a-f]{6}$/i.test(value || '') ? value : fallback;
    const font = value => typeof value === 'string' && /^[a-zA-Z0-9 -]{1,80}$/.test(value) ? value : '';

    const DEFAULT_ELEMENTS = [
        { id: 'photo', type: 'image', role: 'photo', name: 'Screenshot / photo', content: '', src: '', style: {} },
        { id: 'artwork', type: 'image', role: 'artwork', name: 'Artwork / logo', content: '', src: '', style: {} },
        { id: 'badge', type: 'text', role: 'badge', name: 'Status label', content: 'LIVE NOW', src: '', style: {} },
        { id: 'title', type: 'text', role: 'title', name: 'Headline', content: 'Your next great stream.', src: '', style: {} },
        { id: 'subtitle', type: 'text', role: 'subtitle', name: 'Subtitle', content: '', src: '', style: {} },
        { id: 'url', type: 'text', role: 'url', name: 'Twitch URL', content: '', source: 'channel-url', src: '', style: {} },
        { id: 'qr', type: 'qr', role: 'qr', name: 'QR code', content: '', source: 'channel-url', src: '', qr: { fg: '#000000', bg: '#ffffff', margin: 4, ecc: 'M' }, style: {} }
    ];

    function twitchUrl(value) {
        const input = String(value || '').trim();
        if (!input) return '';
        const match = input.match(/^(?:(?:https?:\/\/)?(?:www\.)?twitch\.tv\/)?([a-zA-Z0-9_]{1,25})\/?$/);
        if (!match) throw new Error('Enter your Twitch channel name or a twitch.tv/channel URL.');
        return `https://twitch.tv/${match[1].toLowerCase()}`;
    }

    function assetUrl(value) {
        const input = String(value || '');
        if (!input) return '';
        if (!/^\/custom-overlay-assets\/[^/?#\\]+$/.test(input)) throw new Error('Choose an uploaded image from the Asset Library.');
        let filename;
        try { filename = decodeURIComponent(input.slice('/custom-overlay-assets/'.length)); }
        catch { throw new Error('Invalid image asset URL.'); }
        if (/[\\/\0]/.test(filename) || filename.startsWith('.') || !/\.(png|jpe?g|gif|webp|avif|svg)$/i.test(filename)) throw new Error('Choose a supported image asset.');
        return `/custom-overlay-assets/${encodeURIComponent(filename)}`;
    }

    function background(input = {}, fallbackTheme = 'midnight', fallbackVignette = 0) {
        if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid promo background.');
        return {
            mode: ['theme', 'solid', 'gradient', 'transparent', 'image', 'pattern'].includes(input.mode) ? input.mode : 'theme',
            theme: Object.hasOwn(THEMES, input.theme) ? input.theme : fallbackTheme,
            color: hex(input.color, '#0b1020'), endColor: hex(input.endColor, '#4338ca'), midColor: hex(input.midColor, ''),
            gradientType: ['linear', 'radial', 'conic'].includes(input.gradientType) ? input.gradientType : 'linear',
            angle: number(input.angle, 135, 0, 360), speed: Math.round(number(input.speed, 1, 1, 4)),
            pattern: PATTERNS.includes(input.pattern) ? input.pattern : 'orbits',
            motion: MOTIONS.includes(input.motion) ? input.motion : 'none',
            scale: number(input.scale, 100, 2, 800),
            bar: ['theme', 'custom', 'none'].includes(input.bar) ? input.bar : 'theme', barColor: hex(input.barColor, '#ffffff'), barEndColor: hex(input.barEndColor, '#ffffff'),
            vignette: number(input.vignette, fallbackVignette, 0, 100),
            image: assetUrl(input.image), fit: input.fit === 'contain' ? 'contain' : 'cover',
            focusX: number(input.focusX, 50, 0, 100), focusY: number(input.focusY, 50, 0, 100),
            shade: number(input.shade, 35, 0, 100)
        };
    }

    function appearance(input = {}) {
        if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid promo theme.');
        const theme = Object.hasOwn(THEMES, input.theme) ? input.theme : 'midnight';
        return {
            theme,
            font: typeof input.font === 'string' && /^[a-zA-Z0-9 -]{1,80}$/.test(input.font) ? input.font : 'sans-serif',
            colors: Object.fromEntries(Object.entries({ secondary: THEMES[theme].accent, ...THEMES[theme] }).map(([key, value]) => [key, hex(input.colors?.[key], value)])),
            background: background(input.background, theme)
        };
    }

    function normalizeTheme(input = {}) {
        const style = appearance(input);
        const name = text(input.name, 80).trim();
        if (!name) throw new Error('Enter a name for your custom theme.');
        return { name, ...style };
    }

    const color = (value, fallback = '') => typeof value === 'string' && /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|transparent)$/i.test(value.trim()) ? value.trim() : fallback;
    const pick = (value, list, fallback) => list.includes(value) ? value : fallback;
    const obj = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};

    // Style names match the custom overlay editor (el.style.*) so presets can be shared.
    const ROLE_STYLE = {
        badge: { fontSize: 30, fontWeight: 600 }, title: { fontSize: 76, fontWeight: 600 },
        subtitle: { fontSize: 32, fontWeight: 400 }, url: { fontSize: 28, fontWeight: 400 }
    };
    function normalizeStyle(type, role, input) {
        const s = obj(input), base = ROLE_STYLE[role] || { fontSize: 48, fontWeight: 400 };
        const common = { opacity: number(s.opacity, 1, 0, 1), rotate: number(s.rotate, 0, -360, 360) };
        if (type === 'text') {
            const grad = obj(s.textGradient);
            return {
                fontFamily: font(s.fontFamily), fontSize: number(s.fontSize, base.fontSize, 8, 400),
                fontWeight: FONT_WEIGHTS.includes(Number(s.fontWeight)) ? Number(s.fontWeight) : base.fontWeight,
                fontStyle: s.fontStyle === 'italic' ? 'italic' : 'normal',
                letterSpacing: number(s.letterSpacing, 0, -10, 50), lineHeight: number(s.lineHeight, 1.12, .5, 3),
                textAlign: pick(s.textAlign, ['left', 'center', 'right'], 'left'),
                verticalAlign: pick(s.verticalAlign, ['top', 'middle', 'bottom'], role === 'title' || role === 'subtitle' || role === 'badge' || role === 'url' ? 'middle' : 'top'),
                color: color(s.color),
                textGradient: {
                    enabled: grad.enabled === true, type: pick(grad.type, ['linear', 'radial'], 'linear'), angle: number(grad.angle, 135, 0, 360),
                    from: color(grad.from, '#1f6feb'), to: color(grad.to, '#8957e5')
                },
                textStroke: { width: number(obj(s.textStroke).width, 0, 0, 20), color: color(obj(s.textStroke).color, '#000000') },
                textShadow: { blur: number(obj(s.textShadow).blur, 0, 0, 60), color: color(obj(s.textShadow).color, 'rgba(0,0,0,0.7)') },
                background: color(s.background) === 'transparent' ? '' : color(s.background), padding: number(s.padding, 0, 0, 200),
                borderWidth: number(s.borderWidth, 0, 0, 40), borderColor: color(s.borderColor, '#38bdf8'), borderRadius: number(s.borderRadius, 0, 0, 200),
                shadow: { blur: number(obj(s.shadow).blur, 0, 0, 100), color: color(obj(s.shadow).color, 'rgba(0,0,0,0.5)') },
                ...common
            };
        }
        if (type === 'image') {
            return {
                objectFit: pick(s.objectFit, ['cover', 'contain'], role === 'photo' ? 'cover' : 'contain'),
                focusX: number(s.focusX, 50, 0, 100), focusY: number(s.focusY, 50, 0, 100),
                shape: pick(s.shape, ['rectangle', 'rounded', 'circle'], 'rounded'), borderRadius: number(s.borderRadius, 24, 0, 300),
                borderWidth: number(s.borderWidth, 0, 0, 40), borderColor: color(s.borderColor, '#ffffff'),
                shadow: { blur: number(obj(s.shadow).blur, 0, 0, 100), color: color(obj(s.shadow).color, 'rgba(0,0,0,0.5)') },
                ...common
            };
        }
        if (type === 'shape') {
            return {
                shape: pick(s.shape, ['rectangle', 'rounded', 'circle', 'pill'], 'rounded'), background: color(s.background, '#38bdf8'),
                borderRadius: number(s.borderRadius, 24, 0, 300), borderWidth: number(s.borderWidth, 0, 0, 40), borderColor: color(s.borderColor, '#ffffff'),
                shadow: { blur: number(obj(s.shadow).blur, 0, 0, 100), color: color(obj(s.shadow).color, 'rgba(0,0,0,0.5)') }, ...common
            };
        }
        if (type === 'icon') return { color: color(s.color, '#ffffff'), shadow: { blur: number(obj(s.shadow).blur, 0, 0, 100), color: color(obj(s.shadow).color, 'rgba(0,0,0,0.5)') }, ...common };
        return { ...common, borderRadius: number(s.borderRadius, 0, 0, 200) };
    }

    function normalizeElement(input) {
        if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid promo element.');
        const id = text(input.id, 48).trim();
        if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,47}$/.test(id)) throw new Error('Promo elements need a valid ID.');
        if (!ELEMENT_TYPES.includes(input.type)) throw new Error(`Unsupported promo element type: ${text(input.type, 32)}.`);
        const role = ELEMENT_ROLES.includes(input.role) ? input.role : '';
        const source = input.source === 'channel-url' && ['text', 'qr'].includes(input.type) ? 'channel-url' : 'content';
        const element = {
            id, type: input.type, role,
            name: text(input.name, 80).trim() || TYPE_NAMES[input.type],
            content: input.type === 'icon' ? text(input.content, 120).trim() || 'fa-solid fa-star' : ['text', 'qr'].includes(input.type) && source !== 'channel-url' ? text(input.content, 500) : '',
            source, src: input.type === 'image' ? assetUrl(input.src) : '', locked: input.locked === true,
            style: normalizeStyle(input.type, role, input.style)
        };
        if (input.type === 'qr') {
            element.qr = {
                fg: hex(input.qr?.fg, '#000000'), bg: hex(input.qr?.bg, '#ffffff'),
                margin: number(input.qr?.margin, 4, 0, 20),
                ecc: ['L', 'M', 'Q', 'H'].includes(input.qr?.ecc) ? input.qr.ecc : 'M'
            };
        }
        return element;
    }

    function specsFor(ratio, template) {
        const portrait = ratio === 'portrait', square = ratio === 'square';
        const spec = (x, y, width, height) => ({ x, y, width, height, visible: true });
        const placements = portrait ? {
            photo: spec(5, 5, 90, 46),
            artwork: spec(76, 61, 17, 18),
            badge: spec(7, 55, 55, 4),
            title: spec(7, 62, 66, 14),
            subtitle: spec(7, 79, 63, 7),
            url: spec(7, 90, 66, 4),
            qr: spec(78, 86, 15, 8.4375)
        } : square ? {
            photo: spec(5, 5, 90, 49),
            artwork: spec(78, 60, 15, 19),
            badge: spec(7, 56, 55, 5),
            title: spec(7, 65, 70, 15),
            subtitle: spec(7, 82, 62, 6),
            url: spec(7, 90, 66, 5),
            qr: spec(79, 81, 14, 14)
        } : {
            photo: spec(47, 5, 49, 90),
            artwork: spec(4, 71, 13, 17),
            badge: spec(4, 8, 35, 6),
            title: spec(4, 22, 38, 32),
            subtitle: spec(4, 56, 38, 11),
            url: spec(4, 90, 25, 5),
            qr: spec(32, 81, 9, 16)
        };
        if (template === 'spotlight') placements.photo = spec(0, 0, 100, 100);
        if (template === 'minimal') {
            placements.photo.visible = false;
            placements.title.x = 7; placements.title.y = portrait ? 30 : 25;
            placements.title.width = portrait ? 86 : 82; placements.title.height = portrait ? 28 : 35;
            placements.badge.x = 7; placements.badge.y = 12;
            placements.subtitle.x = 7; placements.subtitle.y = 64;
        }
        return placements;
    }

    function normalizePlacement(input, fallback, ratio) {
        const [canvasWidth, canvasHeight] = SIZES[ratio];
        const source = obj(input);
        const x = number(source.x, fallback.x, 0, canvasWidth - 1);
        const y = number(source.y, fallback.y, 0, canvasHeight - 1);
        return {
            x, y,
            width: number(source.width, fallback.width, 1, canvasWidth - x),
            height: number(source.height, fallback.height, 1, canvasHeight - y),
            visible: source.visible === undefined ? fallback.visible !== false : source.visible !== false
        };
    }

    function arrangement(ratio, template = 'editorial', elements = DEFAULT_ELEMENTS) {
        if (!Object.hasOwn(SIZES, ratio)) throw new Error('Invalid promo format.');
        const placements = specsFor(ratio, template);
        if (placements.artwork) placements.artwork.visible = false;
        const [canvasWidth, canvasHeight] = SIZES[ratio];
        const normalized = {};
        for (const [index, element] of elements.entries()) {
            const fallback = placements[element.role];
            if (fallback) {
                normalized[element.id] = normalizePlacement({
                    x: fallback.x * canvasWidth / 100, y: fallback.y * canvasHeight / 100,
                    width: fallback.width * canvasWidth / 100, height: fallback.height * canvasHeight / 100, visible: fallback.visible
                }, { x: 0, y: 0, width: 1, height: 1, visible: true }, ratio);
                continue;
            }
            const size = Math.min(canvasWidth, canvasHeight) * (element.type === 'text' ? .2 : .3);
            const width = Math.min(canvasWidth, size * 2), height = Math.min(canvasHeight, size);
            normalized[element.id] = {
                x: Math.round(Math.min(canvasWidth - width, Math.max(0, (canvasWidth - width) / 2 + index % 6 * 24))),
                y: Math.round(Math.min(canvasHeight - height, Math.max(0, (canvasHeight - height) / 2 + index % 6 * 24))),
                width, height, visible: true
            };
        }
        return { placements: normalized, order: elements.map(element => element.id), template };
    }

    function createElement(type, id) {
        const prefix = ELEMENT_TYPES.includes(type) ? type : '';
        if (!prefix) throw new Error(`Unsupported promo element type: ${text(type, 32)}.`);
        const uniqueId = id || `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
        return normalizeElement({
            id: uniqueId, type, name: TYPE_NAMES[type],
            content: type === 'text' ? 'Text element' : type === 'icon' ? 'fa-solid fa-star' : '', src: '',
            source: type === 'qr' ? 'channel-url' : 'content',
            qr: type === 'qr' ? { fg: '#000000', bg: '#ffffff', margin: 4, ecc: 'M' } : undefined,
            style: {}
        });
    }

    function normalize(input = {}) {
        if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid promo design.');
        const template = ['editorial', 'spotlight', 'minimal'].includes(input.template) ? input.template : 'editorial';
        const theme = Object.hasOwn(THEMES, input.theme) ? input.theme : 'midnight';
        const rawElements = Array.isArray(input.elements) ? input.elements : DEFAULT_ELEMENTS;
        if (rawElements.length > 100) throw new Error('A promo can contain at most 100 elements.');
        const elements = rawElements.map(normalizeElement);
        if (new Set(elements.map(element => element.id)).size !== elements.length) throw new Error('Promo element IDs must be unique.');
        const elementIds = new Set(elements.map(element => element.id));
        const layouts = {};
        for (const ratio of Object.keys(SIZES)) {
            const source = input.layouts?.[ratio];
            const layoutTemplate = ['editorial', 'spotlight', 'minimal'].includes(source?.template) ? source.template : template;
            const fallback = arrangement(ratio, layoutTemplate, elements);
            const placements = {};
            for (const element of elements) placements[element.id] = normalizePlacement(source?.placements?.[element.id], fallback.placements[element.id], ratio);
            const order = Array.isArray(source?.order) ? [...new Set(source.order.filter(id => elementIds.has(id)))] : [...elementIds];
            layouts[ratio] = {
                placements, order: [...order, ...elements.map(element => element.id).filter(id => !order.includes(id))],
                template: layoutTemplate
            };
        }
        const style = appearance(input);
        return {
            name: text(input.name, 80) || 'Untitled promo',
            url: twitchUrl(input.url),
            theme, template, font: style.font, colors: style.colors,
            elements, layouts,
            cornerRadius: number(input.cornerRadius, 0, 0, 300),
            background: background(input.background, theme, input.background ? 0 : 18)
        };
    }

    const api = { normalizeStyle,  SIZES, ELEMENT_TYPES, TYPE_NAMES, ELEMENT_ROLES, PATTERNS, MOTIONS, FONT_WEIGHTS, THEMES, DEFAULT_ELEMENTS, arrangement, createElement, normalize, normalizeElement, twitchUrl, assetUrl, background, appearance, normalizeTheme };
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.PromoModel = api;
})(typeof window !== 'undefined' ? window : globalThis);

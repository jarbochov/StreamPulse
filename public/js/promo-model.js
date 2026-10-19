(function (root) {
    const studioThemes = typeof module === 'object' && module.exports ? require('./studio-themes') : root.StudioThemes;
    const SIZES = { square: [1080, 1080], landscape: [1920, 1080], portrait: [1080, 1920] };
    const BLOCKS = ['photo', 'artwork', 'badge', 'title', 'subtitle', 'url', 'qr'];
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

    function background(input = {}, fallbackTheme = 'midnight') {
        if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid promo background.');
        return {
            mode: ['theme', 'solid', 'gradient', 'transparent', 'image', 'pattern'].includes(input.mode) ? input.mode : 'theme',
            theme: Object.hasOwn(THEMES, input.theme) ? input.theme : fallbackTheme,
            color: hex(input.color, '#0b1020'), endColor: hex(input.endColor, '#4338ca'),
            angle: number(input.angle, 135, 0, 360),
            pattern: ['grid', 'geometry', 'orbits'].includes(input.pattern) ? input.pattern : 'orbits',
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

    function arrangement(ratio, template = 'editorial') {
        const portrait = ratio === 'portrait', square = ratio === 'square';
        const box = (x, y, w, h, extra = {}) => ({ x, y, w, h, enabled: true, fontSize: 64, color: '', fit: 'cover', focusX: 50, focusY: 50, shape: 'rounded', radius: 24, ...extra });
        const blocks = portrait ? {
            photo: box(5, 5, 90, 46), artwork: box(73, 43, 20, 18, { enabled: false, fit: 'contain' }),
            badge: box(7, 55, 55, 4, { fontSize: 32 }), title: box(7, 61, 86, 14, { fontSize: 96 }),
            subtitle: box(7, 77, 65, 7, { fontSize: 38 }), url: box(7, 90, 66, 4, { fontSize: 30 }),
            qr: box(78, 86, 15, 8.4375)
        } : square ? {
            photo: box(5, 5, 90, 49), artwork: box(74, 45, 19, 25, { enabled: false, fit: 'contain' }),
            badge: box(7, 58, 56, 5, { fontSize: 28 }), title: box(7, 65, 86, 14, { fontSize: 72 }),
            subtitle: box(7, 81, 62, 6, { fontSize: 28 }), url: box(7, 90, 66, 5, { fontSize: 26 }),
            qr: box(79, 81, 14, 14)
        } : {
            photo: box(43, 5, 54, 90), artwork: box(33, 66, 13, 29, { enabled: false, fit: 'contain' }),
            badge: box(4, 8, 35, 6, { fontSize: 30 }), title: box(4, 22, 35, 32, { fontSize: 104 }),
            subtitle: box(4, 57, 32, 12, { fontSize: 38 }), url: box(4, 86, 27, 6, { fontSize: 28 }),
            qr: box(32, 81, 9, 16)
        };
        if (template === 'spotlight') {
            blocks.photo = box(0, 0, 100, 100, { shape: 'rectangle', radius: 0 });
        } else if (template === 'minimal') {
            blocks.photo.enabled = false;
            blocks.title.w = portrait ? 86 : 82;
            blocks.title.x = 7;
            blocks.title.y = portrait ? 30 : 25;
            blocks.title.h = portrait ? 28 : 35;
            blocks.badge.x = 7; blocks.badge.y = 12;
            blocks.subtitle.x = 7; blocks.subtitle.y = portrait ? 64 : 64;
        }
        return { blocks, order: [...BLOCKS], template, cornerRadius: 0 };
    }

    function normalize(input = {}) {
        if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid promo design.');
        const template = ['editorial', 'spotlight', 'minimal'].includes(input.template) ? input.template : 'editorial';
        const theme = Object.hasOwn(THEMES, input.theme) ? input.theme : 'midnight';
        const layouts = {};
        for (const ratio of Object.keys(SIZES)) {
            const source = input.layouts?.[ratio];
            const layoutTemplate = ['editorial', 'spotlight', 'minimal'].includes(source?.template) ? source.template : template;
            const fallback = arrangement(ratio, layoutTemplate);
            const blocks = {};
            for (const key of BLOCKS) {
                const base = fallback.blocks[key], block = source?.blocks?.[key] || base;
                const x = number(block.x, base.x, 0, 98), y = number(block.y, base.y, 0, 98);
                blocks[key] = {
                    x, y, w: number(block.w, base.w, 2, 100 - x), h: number(block.h, base.h, 2, 100 - y),
                    enabled: block.enabled !== false, fontSize: number(block.fontSize, base.fontSize, 12, 240),
                    color: hex(block.color, ''), fit: block.fit === 'contain' ? 'contain' : 'cover',
                    shape: ['rectangle', 'rounded', 'circle'].includes(block.shape) ? block.shape : base.shape,
                    radius: number(block.radius, base.radius, 0, 200),
                    focusX: number(block.focusX, 50, 0, 100), focusY: number(block.focusY, 50, 0, 100)
                };
            }
            const order = Array.isArray(source?.order) ? [...new Set(source.order.filter(key => BLOCKS.includes(key)))] : [...BLOCKS];
            layouts[ratio] = { blocks, order: [...order, ...BLOCKS.filter(key => !order.includes(key))], template: layoutTemplate, cornerRadius: number(source?.cornerRadius, 0, 0, 300), background: background(source?.background, theme) };
        }
        const style = appearance(input);
        return {
            name: text(input.name, 80) || 'Untitled promo', title: text(input.title, 180) || 'Your next great stream.',
            subtitle: text(input.subtitle, 240), badge: text(input.badge ?? 'LIVE NOW', 40),
            url: twitchUrl(input.url), photo: assetUrl(input.photo), artwork: assetUrl(input.artwork),
            theme, template, font: style.font, colors: style.colors,
            layouts
        };
    }

    const api = { SIZES, BLOCKS, THEMES, arrangement, normalize, twitchUrl, assetUrl, background, appearance, normalizeTheme };
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.PromoModel = api;
})(typeof window !== 'undefined' ? window : globalThis);

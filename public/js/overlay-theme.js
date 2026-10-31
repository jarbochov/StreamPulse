// Shared theme handling for StreamPulse overlays (credits, stats, goals, timers, versus, tournaments).
(function () {
    const COLOR = /^(#[0-9a-f]{3,8}|(rgb|hsl)a?\([0-9.,%\s/]+\)|[a-z]{3,20})$/i;
    const HEX = /^[0-9a-f]{3}([0-9a-f]{3}([0-9a-f]{2})?)?$/i;

    function cleanColor(raw) {
        const value = String(raw || '').trim();
        if (HEX.test(value)) return `#${value}`;
        return COLOR.test(value) ? value : '';
    }

    function cleanRadius(raw) {
        const value = String(raw || '').trim();
        if (!value) return '';
        if (/^\d+$/.test(value)) return `${value}px`;
        if (/^\d+(\.\d+)?(px|rem|em|vmin|vmax|%)$/.test(value)) return value;
        if (value === 'pill' || value === 'full') return '999px';
        if (value === 'sharp' || value === 'none' || value === 'square') return '0px';
        return '';
    }

    // Curated font families for streaming, esports, and HUD overlays
    const SYSTEM_FONTS = ['Arial', 'Helvetica', 'Georgia', 'Impact', 'Trebuchet MS', 'Courier New', 'Verdana', 'Tahoma'];
    const GOOGLE_FONTS = [
        'Montserrat', 'Oswald', 'Roboto', 'Bebas Neue', 'Poppins', 'Teko', 'Rajdhani',
        'Silkscreen', 'Fira Code', 'Inter', 'Rubik', 'Jersey 20', 'Press Start 2P',
        'Chakra Petch', 'Russo One', 'Oxanium', 'Cinzel', 'Permanent Marker',
        'Playfair Display', 'Open Sans', 'Lato', 'Raleway', 'Merriweather'
    ];

    const loadedFonts = new Set();
    let cachedAssetFonts = null;
    let assetFontsPromise = null;

    function getAssetFonts() {
        if (!assetFontsPromise && typeof fetch === 'function') {
            assetFontsPromise = fetch('/api/custom-overlays/assets', { cache: 'no-store' })
                .then(r => r.ok ? r.json() : [])
                .then(assets => {
                    cachedAssetFonts = (Array.isArray(assets) ? assets : []).filter(a => a && a.kind === 'font');
                    return cachedAssetFonts;
                })
                .catch(() => {
                    cachedAssetFonts = [];
                    return [];
                });
        }
        return assetFontsPromise || Promise.resolve(cachedAssetFonts || []);
    }

    // Prefetch asset fonts in browser contexts
    if (typeof window !== 'undefined' && typeof fetch === 'function') {
        getAssetFonts();
    }

    function applyAssetFont(cleanName, match) {
        if (!match || !match.url) return false;
        const fams = new Set([cleanName, match.family, match.label].filter(Boolean));
        fams.forEach(f => {
            const fam = String(f).replace(/'/g, '');
            if (typeof FontFace !== 'undefined' && typeof document !== 'undefined' && document.fonts) {
                try {
                    const ff = new FontFace(fam, `url("${match.url.replace(/"/g, '%22')}")`);
                    ff.load().then(loaded => document.fonts.add(loaded)).catch(() => {});
                } catch {}
            }
            if (typeof document !== 'undefined' && document.head) {
                const style = document.createElement('style');
                style.textContent = `@font-face { font-family: '${fam}'; src: url('${match.url}'); font-display: swap; }`;
                document.head.appendChild(style);
            }
        });
        return true;
    }

    function matchAssetFont(cleanName, fontList) {
        if (!cleanName || !Array.isArray(fontList)) return null;
        const cleanLower = cleanName.toLowerCase();
        return fontList.find(a => (
            (a.family && a.family.toLowerCase() === cleanLower) ||
            (a.name && a.name.toLowerCase() === cleanLower) ||
            (a.label && a.label.toLowerCase() === cleanLower) ||
            (a.name && a.name.replace(/\.[a-z0-9]+$/i, '').toLowerCase() === cleanLower)
        )) || null;
    }

    function loadUrlFont(name) {
        if (!name) return;
        const cleanName = String(name).replace(/["'<>;{}\\]/g, '').trim().slice(0, 80);
        if (!cleanName || SYSTEM_FONTS.map(f => f.toLowerCase()).includes(cleanName.toLowerCase())) return;
        if (loadedFonts.has(cleanName.toLowerCase())) return;
        loadedFonts.add(cleanName.toLowerCase());

        // 1. If cached asset library fonts are already present, apply immediately
        if (cachedAssetFonts && cachedAssetFonts.length > 0) {
            const match = matchAssetFont(cleanName, cachedAssetFonts);
            if (match && applyAssetFont(cleanName, match)) {
                return;
            }
        }

        // 2. Check and load via Google Fonts
        if (typeof document !== 'undefined' && document.head) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(cleanName).replace(/%20/g, '+')}:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,700;1,900&display=swap`;
            document.head.appendChild(link);
        }

        // 3. Check asynchronously if asset fonts are still resolving
        if (typeof fetch === 'function') {
            getAssetFonts().then(fonts => {
                const match = matchAssetFont(cleanName, fonts);
                if (match) applyAssetFont(cleanName, match);
            }).catch(() => {});
        }
    }

    const BUILT_IN_THEMES = {
        card: { id: 'card', name: 'Dark Card (Default)', bg: 'rgba(13, 17, 23, 0.92)', cardBg: 'rgba(22, 27, 34, 0.88)', border: '#30363d', text: '#f0f6fc', muted: '#8b949e', accent: '#58a6ff', winner: '#3fb950', radius: '8px', backdrop: 'blur(12px)' },
        glass: { id: 'glass', name: 'Frosted Glass', bg: 'rgba(13, 17, 23, 0.65)', cardBg: 'rgba(22, 27, 34, 0.6)', border: 'rgba(255, 255, 255, 0.18)', text: '#ffffff', muted: '#cbd5e1', accent: '#38bdf8', winner: '#4ade80', radius: '12px', backdrop: 'blur(16px) saturate(180%)' },
        solid: { id: 'solid', name: 'Opaque Solid', bg: '#0d1117', cardBg: '#161b22', border: '#30363d', text: '#f0f6fc', muted: '#8b949e', accent: '#58a6ff', winner: '#3fb950', radius: '6px', backdrop: 'none' },
        transparent: { id: 'transparent', name: 'Transparent / Clean', bg: 'transparent', cardBg: 'rgba(0, 0, 0, 0.55)', border: 'rgba(255, 255, 255, 0.12)', text: '#ffffff', muted: '#cbd5e1', accent: '#38bdf8', winner: '#4ade80', radius: '8px', backdrop: 'none' },
        neon: { id: 'neon', name: 'Neon Glow', bg: 'rgba(9, 13, 22, 0.94)', cardBg: 'rgba(15, 23, 42, 0.9)', border: '#38bdf8', text: '#f8fafc', muted: '#94a3b8', accent: '#38bdf8', winner: '#22c55e', radius: '8px', backdrop: 'blur(10px)' },
        retro: { id: 'retro', name: 'Retro Arcade', bg: 'rgba(15, 10, 30, 0.94)', cardBg: 'rgba(30, 18, 55, 0.9)', border: '#ec4899', text: '#fdf4ff', muted: '#f0abfc', accent: '#06b6d4', winner: '#a855f7', radius: '0px', backdrop: 'none' },
        cyber: { id: 'cyber', name: 'Cyberpunk', bg: 'rgba(6, 10, 20, 0.94)', cardBg: 'rgba(12, 20, 36, 0.9)', border: '#00f0ff', text: '#ffffff', muted: '#67e8f9', accent: '#ff0055', winner: '#00ff66', radius: '0px', backdrop: 'none' },
        'fgc-evo': { id: 'fgc-evo', name: 'EVO Championship', bg: 'linear-gradient(180deg, #161b22 0%, #0a0d14 100%)', cardBg: '#121824', border: '#f59e0b', text: '#ffffff', muted: '#fcd34d', accent: '#ffd700', winner: '#10b981', radius: '4px', backdrop: 'none' },
        championship: { id: 'championship', name: 'Championship Gold', bg: 'rgba(22, 17, 8, 0.94)', cardBg: 'rgba(35, 28, 12, 0.9)', border: '#ffd700', text: '#fffbeb', muted: '#fef3c7', accent: '#ffd700', winner: '#eab308', radius: '8px', backdrop: 'none' },
        'clean-light': { id: 'clean-light', name: 'Clean Light', bg: '#ffffff', cardBg: '#f6f8fa', border: '#d0d7de', text: '#1f2328', muted: '#656d76', accent: '#0969da', winner: '#1a7f37', radius: '8px', backdrop: 'none' },
        'minimal-dark': { id: 'minimal-dark', name: 'OLED Black', bg: '#000000', cardBg: '#0a0a0a', border: '#262626', text: '#fafafa', muted: '#737373', accent: '#ffffff', winner: '#4ade80', radius: '6px', backdrop: 'none' },
        ember: { id: 'ember', name: 'Ember Flame', bg: 'linear-gradient(135deg, #2a0f0a, #12060a)', cardBg: 'rgba(20, 8, 8, 0.9)', border: '#ff6a3d', text: '#fff5f2', muted: '#ffb299', accent: '#ff6a3d', winner: '#f97316', radius: '8px', backdrop: 'none' },
        aurora: { id: 'aurora', name: 'Aurora Borealis', bg: 'linear-gradient(135deg, #06232b, #0b1a3a)', cardBg: 'rgba(8, 25, 35, 0.9)', border: '#2dd4bf', text: '#f0fdfa', muted: '#99f6e4', accent: '#2dd4bf', winner: '#34d399', radius: '8px', backdrop: 'none' },
        ocean: { id: 'ocean', name: 'Deep Ocean', bg: 'linear-gradient(135deg, #071c3a, #04101f)', cardBg: 'rgba(8, 20, 40, 0.9)', border: '#38bdf8', text: '#f0f9ff', muted: '#bae6fd', accent: '#38bdf8', winner: '#0ea5e9', radius: '8px', backdrop: 'none' },
        sunset: { id: 'sunset', name: 'Neon Sunset', bg: 'linear-gradient(135deg, #3b0f3a, #2a0d1a)', cardBg: 'rgba(35, 10, 30, 0.9)', border: '#fb7185', text: '#fff1f2', muted: '#fecdd3', accent: '#fbbf24', winner: '#f43f5e', radius: '8px', backdrop: 'none' },
        violet: { id: 'violet', name: 'Ultra Violet', bg: 'linear-gradient(135deg, #1e1038, #0d0820)', cardBg: 'rgba(22, 10, 40, 0.9)', border: '#a78bfa', text: '#faf5ff', muted: '#e9d5ff', accent: '#c084fc', winner: '#a855f7', radius: '8px', backdrop: 'none' },
        forest: { id: 'forest', name: 'Emerald Forest', bg: 'linear-gradient(135deg, #0a2316, #06120b)', cardBg: 'rgba(8, 28, 18, 0.9)', border: '#4ade80', text: '#f0fdf4', muted: '#bbf7d0', accent: '#4ade80', winner: '#22c55e', radius: '8px', backdrop: 'none' },
        border: { id: 'border', name: 'Border Framing', bg: 'transparent', cardBg: 'rgba(10, 14, 22, 0.9)', border: '#58a6ff', text: '#ffffff', muted: '#94a3b8', accent: '#58a6ff', winner: '#3fb950', radius: '4px', backdrop: 'none' },
        pill: { id: 'pill', name: 'Pill Capsule', bg: 'rgba(13, 17, 23, 0.9)', cardBg: 'rgba(22, 27, 34, 0.9)', border: '#30363d', text: '#f0f6fc', muted: '#8b949e', accent: '#58a6ff', winner: '#3fb950', radius: '999px', backdrop: 'none' }
    };

    const CUSTOM_THEMES_KEY = 'streampulse_overlay_custom_themes';

    const OverlayThemes = {
        BUILT_IN: BUILT_IN_THEMES,
        getCustomThemes() {
            try {
                return JSON.parse(localStorage.getItem(CUSTOM_THEMES_KEY) || '{}');
            } catch { return {}; }
        },
        saveCustomTheme(idOrTheme, optionalTheme) {
            try {
                let theme = optionalTheme;
                let id = idOrTheme;
                if (!theme && typeof idOrTheme === 'object') {
                    theme = idOrTheme;
                    id = theme.id;
                }
                theme = theme || {};
                const themes = this.getCustomThemes();
                const slug = String(id || theme.name || 'custom').toLowerCase().replace(/[^a-z0-9-_]/g, '-').slice(0, 32);
                themes[slug] = {
                    id: slug,
                    name: theme.name || slug,
                    isCustom: true,
                    bg: theme.bg || '',
                    cardBg: theme.cardBg || '',
                    border: theme.border || '',
                    text: theme.text || '',
                    muted: theme.muted || '',
                    accent: theme.accent || '',
                    winner: theme.winner || '',
                    radius: theme.radius || '',
                    font: theme.font || '',
                    weight: theme.weight || '',
                    scale: theme.scale || '',
                    textTransform: theme.textTransform || '',
                    updatedAt: new Date().toISOString()
                };
                localStorage.setItem(CUSTOM_THEMES_KEY, JSON.stringify(themes));
                return themes[slug];
            } catch { return null; }
        },
        deleteCustomTheme(id) {
            try {
                const themes = this.getCustomThemes();
                delete themes[id];
                localStorage.setItem(CUSTOM_THEMES_KEY, JSON.stringify(themes));
                return true;
            } catch { return false; }
        },
        getTheme(id) {
            if (!id) return null;
            const key = String(id).toLowerCase().trim();
            const custom = this.getCustomThemes();
            if (custom[key]) return custom[key];
            if (BUILT_IN_THEMES[key]) return BUILT_IN_THEMES[key];
            const alias = {
                gold: 'championship',
                evo: 'fgc-evo',
                neon: 'cyber',
                cyberpunk: 'cyber',
                light: 'clean-light',
                dark: 'minimal-dark',
                arcade: 'border',
                clean: 'transparent',
                none: 'transparent'
            }[key];
            if (alias && BUILT_IN_THEMES[alias]) return BUILT_IN_THEMES[alias];
            if (/^#?[0-9a-fA-F]{3,8}$/.test(key)) {
                const hex = key.startsWith('#') ? key : `#${key}`;
                return {
                    id: 'custom',
                    name: 'Custom Hex',
                    isCustom: true,
                    cardBg: hex,
                    bg: hex
                };
            }
            return null;
        },
        getAllThemes() {
            const list = Object.values(BUILT_IN_THEMES);
            const custom = Object.values(this.getCustomThemes());
            return { builtIn: list, custom };
        }
    };

    window.OverlayFonts = {
        system: SYSTEM_FONTS,
        google: GOOGLE_FONTS,
        getAssetFonts,
        loadFont: loadUrlFont
    };
    window.loadUrlFont = loadUrlFont;
    OverlayThemes.BUILT_IN_THEMES = BUILT_IN_THEMES;
    window.OverlayThemes = OverlayThemes;

    // Applied by /matchup.html
    window.applyVersusTheme = function applyVersusTheme(options = {}) {
        const params = (typeof overlayParams === 'function') ? overlayParams() : new URLSearchParams(window.location.search);
        const root = document.documentElement.style;
        const hashVal = (window.location.hash || '').replace(/^#/, '').trim();
        const rawTheme = (params.get('overlay') || params.get('theme') || (!hashVal.includes('=') ? hashVal : '') || 'card').trim().toLowerCase();

        const matchedTheme = OverlayThemes.getTheme(rawTheme);
        const isBuiltIn = Boolean(matchedTheme && BUILT_IN_THEMES[matchedTheme.id] && !matchedTheme.isCustom);
        const theme = matchedTheme || BUILT_IN_THEMES.card;
        const themeId = theme.id || 'card';

        // Apply theme CSS class
        if (isBuiltIn) {
            document.body.classList.add(`theme-${matchedTheme.id}`);
        } else {
            document.body.classList.add('theme-custom');
        }

        // 1. Base theme properties
        if (theme.bg) root.setProperty('--matchup-bg', theme.bg);
        if (theme.cardBg) root.setProperty('--matchup-card-bg', theme.cardBg);
        if (theme.border) root.setProperty('--matchup-border', theme.border);
        if (theme.text) root.setProperty('--matchup-text', theme.text);
        if (theme.muted) root.setProperty('--matchup-muted', theme.muted);
        if (theme.accent) root.setProperty('--matchup-accent', theme.accent);
        if (theme.winner) root.setProperty('--matchup-winner', theme.winner);
        if (theme.radius) root.setProperty('--matchup-radius', theme.radius);
        if (theme.backdrop) root.setProperty('--matchup-backdrop', theme.backdrop);
        if (theme.font) {
            loadUrlFont(theme.font);
            root.setProperty('--matchup-font', `"${theme.font}", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`);
        }
        if (theme.weight) root.setProperty('--matchup-weight', theme.weight);
        if (theme.textTransform) root.setProperty('--matchup-text-transform', theme.textTransform);

        // 2. Granular URL parameter overrides
        const urlFont = (params.get('font') || '').replace(/["'<>;{}\\]/g, '').trim().slice(0, 80);
        if (urlFont) {
            loadUrlFont(urlFont);
            root.setProperty('--matchup-font', `"${urlFont}", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`);
        }

        const urlWeight = (params.get('weight') || '').trim().toLowerCase();
        if (urlWeight) {
            const w = { normal: '400', bold: '700' }[urlWeight] || (/^[1-9]00$/.test(urlWeight) ? urlWeight : '');
            if (w) root.setProperty('--matchup-weight', w);
        }

        const urlTransform = (params.get('transform') || params.get('texttransform') || '').trim().toLowerCase();
        if (['uppercase', 'none', 'capitalize', 'lowercase'].includes(urlTransform)) {
            root.setProperty('--matchup-text-transform', urlTransform);
        }

        const urlScale = Number(params.get('scale') || params.get('fontscale'));
        if (urlScale > 0 && Number.isFinite(urlScale)) {
            const clamped = Math.max(0.4, Math.min(3.5, urlScale));
            root.setProperty('--matchup-scale', clamped);
        }

        const urlText = cleanColor(params.get('text') || params.get('textcolor'));
        if (urlText) root.setProperty('--matchup-text', urlText);

        const urlMuted = cleanColor(params.get('muted') || params.get('mutedcolor'));
        if (urlMuted) root.setProperty('--matchup-muted', urlMuted);

        const urlAccent = cleanColor(params.get('accent'));
        if (urlAccent) root.setProperty('--matchup-accent', urlAccent);

        const urlBg = cleanColor(params.get('bg'));
        if (urlBg) {
            root.setProperty('--matchup-bg', urlBg);
            document.body.classList.add('theme-custom');
        }

        const urlCardBg = cleanColor(params.get('cardbg') || params.get('card_bg'));
        if (urlCardBg) root.setProperty('--matchup-card-bg', urlCardBg);

        const urlBorder = cleanColor(params.get('border') || params.get('bordercolor'));
        if (urlBorder) root.setProperty('--matchup-border', urlBorder);

        const urlWinner = cleanColor(params.get('winner') || params.get('winnercolor'));
        if (urlWinner) root.setProperty('--matchup-winner', urlWinner);

        const urlRadius = cleanRadius(params.get('radius') || params.get('roundness'));
        if (urlRadius) root.setProperty('--matchup-radius', urlRadius);

        const urlBadgeColor = cleanColor(params.get('badgecolor') || params.get('centerbadge') || params.get('badge_color'));
        if (urlBadgeColor) {
            root.setProperty('--matchup-badge-color', urlBadgeColor);
            root.setProperty('--matchup-badge-bg', `color-mix(in srgb, ${urlBadgeColor} 18%, rgba(0, 0, 0, 0.4))`);
            root.setProperty('--matchup-badge-border', `color-mix(in srgb, ${urlBadgeColor} 50%, rgba(255, 255, 255, 0.12))`);
        }

        const urlOutline = (params.get('outline') || params.get('shadow') || '').trim().toLowerCase();
        if (urlOutline === 'none') {
            root.setProperty('--matchup-text-shadow', 'none');
        } else if (urlOutline === 'subtle') {
            root.setProperty('--matchup-text-shadow', '0 1px 3px rgba(0,0,0,0.7)');
        } else if (urlOutline === 'strong' || urlOutline === '1' || urlOutline === 'true') {
            root.setProperty('--matchup-text-shadow', '0 2px 8px rgba(0,0,0,0.95), 0 0 2px #000');
        } else if (cleanColor(urlOutline)) {
            root.setProperty('--matchup-text-shadow', `0 0 4px ${cleanColor(urlOutline)}`);
        }

        // Competitor Slot Colors
        ['p1color', 'p2color', 'p3color', 'p4color'].forEach((key, idx) => {
            const val = cleanColor(params.get(key));
            if (val) root.setProperty(`--p${idx + 1}-color`, val);
        });

        return { theme: themeId, font: urlFont || theme.font, scale: urlScale || theme.scale || 1 };
    };

    // Applied by /tournament.html, /versus-tournament.html, /poll-tournament.html
    window.applyTourneyTheme = function applyTourneyTheme(options = {}) {
        const params = (typeof overlayParams === 'function') ? overlayParams() : new URLSearchParams(window.location.search);
        const root = document.documentElement.style;
        const hashVal = (window.location.hash || '').replace(/^#/, '').trim();
        const rawTheme = (params.get('overlay') || params.get('theme') || (!hashVal.includes('=') ? hashVal : '') || 'card').trim().toLowerCase();

        const matchedTheme = OverlayThemes.getTheme(rawTheme);
        const isBuiltIn = Boolean(matchedTheme && BUILT_IN_THEMES[matchedTheme.id] && !matchedTheme.isCustom);
        const theme = matchedTheme || BUILT_IN_THEMES.card;
        const themeId = theme.id || 'card';

        // Apply theme CSS class
        if (isBuiltIn) {
            document.body.classList.add(`theme-${matchedTheme.id}`);
        } else {
            document.body.classList.add('theme-custom');
        }

        // 1. Base theme properties
        if (theme.bg) root.setProperty('--tourney-bg', theme.bg);
        if (theme.cardBg) root.setProperty('--tourney-card-bg', theme.cardBg);
        if (theme.border) root.setProperty('--tourney-border', theme.border);
        if (theme.text) root.setProperty('--tourney-text', theme.text);
        if (theme.muted) root.setProperty('--tourney-muted', theme.muted);
        if (theme.accent) root.setProperty('--tourney-accent', theme.accent);
        if (theme.winner) root.setProperty('--tourney-winner', theme.winner);
        if (theme.radius) root.setProperty('--tourney-radius', theme.radius);
        if (theme.backdrop) root.setProperty('--tourney-backdrop', theme.backdrop);
        if (theme.font) {
            loadUrlFont(theme.font);
            root.setProperty('--tourney-font', `"${theme.font}", -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif`);
        }
        if (theme.weight) root.setProperty('--tourney-weight', theme.weight);
        if (theme.textTransform) root.setProperty('--tourney-text-transform', theme.textTransform);

        // 2. Granular URL parameter overrides
        const urlFont = (params.get('font') || '').replace(/["'<>;{}\\]/g, '').trim().slice(0, 80);
        if (urlFont) {
            loadUrlFont(urlFont);
            root.setProperty('--tourney-font', `"${urlFont}", -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif`);
        }

        const urlWeight = (params.get('weight') || '').trim().toLowerCase();
        if (urlWeight) {
            const w = { normal: '400', bold: '700' }[urlWeight] || (/^[1-9]00$/.test(urlWeight) ? urlWeight : '');
            if (w) root.setProperty('--tourney-weight', w);
        }

        const urlTransform = (params.get('transform') || params.get('texttransform') || '').trim().toLowerCase();
        if (['uppercase', 'none', 'capitalize', 'lowercase'].includes(urlTransform)) {
            root.setProperty('--tourney-text-transform', urlTransform);
        }

        const urlScale = Number(params.get('scale') || params.get('fontscale'));
        if (urlScale > 0 && Number.isFinite(urlScale)) {
            const clamped = Math.max(0.4, Math.min(3.5, urlScale));
            root.setProperty('--tourney-scale', clamped);
        }

        const urlText = cleanColor(params.get('text') || params.get('textcolor'));
        if (urlText) root.setProperty('--tourney-text', urlText);

        const urlMuted = cleanColor(params.get('muted') || params.get('mutedcolor'));
        if (urlMuted) root.setProperty('--tourney-muted', urlMuted);

        const urlAccent = cleanColor(params.get('accent'));
        if (urlAccent) root.setProperty('--tourney-accent', urlAccent);

        const urlBg = cleanColor(params.get('bg'));
        if (urlBg) {
            root.setProperty('--tourney-bg', urlBg);
            document.body.classList.add('theme-custom');
        }

        const urlCardBg = cleanColor(params.get('cardbg') || params.get('card_bg'));
        if (urlCardBg) root.setProperty('--tourney-card-bg', urlCardBg);

        const urlBorder = cleanColor(params.get('border') || params.get('bordercolor'));
        if (urlBorder) root.setProperty('--tourney-border', urlBorder);

        const urlWinner = cleanColor(params.get('winner') || params.get('winnercolor'));
        if (urlWinner) root.setProperty('--tourney-winner', urlWinner);

        const urlRadius = cleanRadius(params.get('radius') || params.get('roundness'));
        if (urlRadius) root.setProperty('--tourney-radius', urlRadius);

        const urlBadgeColor = cleanColor(params.get('badgecolor') || params.get('centerbadge') || params.get('badge_color'));
        if (urlBadgeColor) {
            root.setProperty('--tourney-badge-bg', urlBadgeColor);
            root.setProperty('--tourney-badge-color', '#0d1117');
        }

        const urlOutline = (params.get('outline') || params.get('shadow') || '').trim().toLowerCase();
        if (urlOutline === 'none') {
            root.setProperty('--tourney-text-shadow', 'none');
        } else if (urlOutline === 'subtle') {
            root.setProperty('--tourney-text-shadow', '0 1px 3px rgba(0,0,0,0.7)');
        } else if (urlOutline === 'strong' || urlOutline === '1' || urlOutline === 'true') {
            root.setProperty('--tourney-text-shadow', '0 2px 8px rgba(0,0,0,0.95), 0 0 2px #000');
        } else if (cleanColor(urlOutline)) {
            root.setProperty('--tourney-text-shadow', `0 0 4px ${cleanColor(urlOutline)}`);
        }

        const spacing = (params.get('spacing') || 'normal').toLowerCase();
        if (spacing === 'compact') document.body.classList.add('spacing-compact');
        else if (spacing === 'spacious') document.body.classList.add('spacing-spacious');

        const lines = (params.get('lines') || 'glow').toLowerCase();
        if (lines) document.body.classList.add('lines-' + lines);

        const rh = (params.get('roundheaders') || '').toLowerCase();
        if (rh) document.body.classList.add('roundheaders-' + rh);

        const cardWidthParam = (params.get('cardwidth') || params.get('roundwidth') || params.get('matchwidth') || '').trim();
        const isWide = params.get('wide') === '1' || params.get('wide') === 'true';
        if (cardWidthParam) {
            const cardWidthCss = /^\d+$/.test(cardWidthParam) ? `${cardWidthParam}px` : cardWidthParam;
            root.setProperty('--round-min-width', cardWidthCss);
            root.setProperty('--round-max-width', cardWidthCss);
        } else if (isWide) {
            root.setProperty('--round-min-width', '280px');
            root.setProperty('--round-max-width', 'clamp(440px, 36vw, 680px)');
        }

        return { theme: themeId, font: urlFont || theme.font, scale: urlScale || theme.scale || 1 };
    };

    // Shared theme handling for legacy browser-source overlays (credits, stats, hashtags, goal, viewers).
    window.applyOverlayTheme = function applyOverlayTheme(theme, vars, options = {}) {
        const t = theme || {};
        const params = window.overlayParams ? window.overlayParams() : { get: () => null };
        const root = document.documentElement.style;
        const resolved = {};

        const urlFont = String(params.get('font') || '').replace(/["'<>;{}\\]/g, '').trim().slice(0, 80);
        const family = urlFont || t.font_family || options.defaultFont || '';
        if (family && vars.font) {
            resolved.font = family;
            if (urlFont) loadUrlFont(urlFont);
            root.setProperty(vars.font, `"${family}", ${options.fontFallback || 'sans-serif'}`);
            if (!urlFont && t.font_import) {
                const link = document.createElement('link');
                link.rel = 'stylesheet';
                link.href = t.font_import;
                document.head.appendChild(link);
            }
        }

        const rawWeight = String(params.get('weight') || t.font_weight || '').trim().toLowerCase();
        const weight = { normal: '400', bold: '700' }[rawWeight] || (/^[1-9]00$/.test(rawWeight) ? rawWeight : '');
        if (weight) {
            const style = document.createElement('style');
            style.textContent = `body, body * { font-weight: ${weight} !important; }`;
            document.head.appendChild(style);
            resolved.weight = weight;
        }

        const colors = [
            ['text', 'text', t.text_color],
            ['accent', 'accent', t.accent_color],
            ['background', 'bg', t[options.backgroundKey || 'background_color']]
        ];
        for (const [role, param, saved] of colors) {
            const value = cleanColor(params.get(param)) || saved;
            if (value && vars[role]) { root.setProperty(vars[role], value); resolved[role] = value; }
        }

        if (vars.outline) {
            const urlOutline = String(params.get('outline') || '').trim().toLowerCase();
            const outline = urlOutline === 'none' ? 'transparent'
                : cleanColor(urlOutline) || (t.text_outline === false ? 'transparent' : t.text_outline_color);
            if (outline) { root.setProperty(vars.outline, outline); resolved.outline = outline; }
        }

        if (vars.scale) {
            const urlScale = Number(params.get('fontscale'));
            const scale = urlScale > 0 ? Math.max(0.5, Math.min(5, urlScale)) : t.font_scale;
            if (scale) { root.setProperty(vars.scale, scale); resolved.scale = scale; }
        }
        return resolved;
    };
})();

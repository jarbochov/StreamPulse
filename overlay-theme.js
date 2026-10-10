// Shared theme handling for the browser-source overlays (credits, stats, hashtags, goal, viewers).
// Applies the saved theme, then lets URL parameters override it per browser source:
// ?font=Arial &text=#ffffff &accent=#ff0066 &bg=rgba(0,0,0,.5) &outline=#000000 (or none) &fontscale=1.2
// Needs url-params.js. `vars` maps each role to the overlay's own CSS variable name.
(function () {
    const COLOR = /^(#[0-9a-f]{3,8}|(rgb|hsl)a?\([0-9.,%\s/]+\)|[a-z]{3,20})$/i;
    const HEX = /^[0-9a-f]{3}([0-9a-f]{3}([0-9a-f]{2})?)?$/i;

    function cleanColor(raw) {
        const value = String(raw || '').trim();
        if (HEX.test(value)) return `#${value}`;
        return COLOR.test(value) ? value : '';
    }

    // Font families offered in the wizard; mirrors the custom overlay editor's font list.
    const SYSTEM_FONTS = ['Arial', 'Helvetica', 'Georgia', 'Impact', 'Courier New', 'Trebuchet MS'];
    const GOOGLE_FONTS = ['Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Oswald', 'Poppins', 'Raleway', 'Merriweather', 'Playfair Display', 'Bebas Neue', 'Fira Code', 'Silkscreen'];
    window.OverlayFonts = { system: SYSTEM_FONTS, google: GOOGLE_FONTS };

    function loadUrlFont(name) {
        if (GOOGLE_FONTS.includes(name)) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(name).replace(/%20/g, '+')}:wght@400;600;700;900&display=swap`;
            document.head.appendChild(link);
        } else if (!SYSTEM_FONTS.includes(name)) {
            // May be an uploaded font; register it if the assets library has a match.
            fetch('/api/custom-overlays/assets', { cache: 'no-store' }).then(r => r.ok ? r.json() : []).then(assets => {
                const match = assets.find(a => a.kind === 'font' && a.family === name);
                if (!match) return;
                const style = document.createElement('style');
                style.textContent = `@font-face { font-family: '${name.replace(/'/g, '')}'; src: url('${match.url}'); font-display: swap; }`;
                document.head.appendChild(style);
            }).catch(() => {});
        }
    }

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
            const scale = urlScale > 0 ? Math.max(0.5, Math.min(3, urlScale)) : t.font_scale;
            if (scale) { root.setProperty(vars.scale, scale); resolved.scale = scale; }
        }
        return resolved;
    };
})();

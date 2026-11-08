const GOOGLE_FONTS = ['Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Oswald', 'Poppins', 'Raleway', 'Merriweather', 'Playfair Display', 'Bebas Neue', 'Fira Code', 'Silkscreen'];
const googleFontSet = new Set(GOOGLE_FONTS);

function loadGoogleFont(fontFamily) {
    const name = String(fontFamily || '').split(',')[0].replace(/^['"]|['"]$/g, '').trim();
    if (!googleFontSet.has(name)) return;
    const id = `google-font-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(name).replace(/%20/g, '+')}:wght@400;600;700;900&display=swap`;
    document.head.appendChild(link);
}

// Uploaded font files are registered with @font-face so they work in browsers that hide installed fonts (Safari).
const assetFonts = [];
let assetFontsFetchedAt = 0;
let assetFontsSig = '';
async function loadAssetFonts(force = false) {
    if (!force && assetFontsFetchedAt && Date.now() - assetFontsFetchedAt < 10000) return assetFonts;
    try {
        const response = await fetch('/api/custom-overlays/assets', { cache: 'no-store' });
        if (!response.ok) return assetFonts;
        assetFontsFetchedAt = Date.now();
        const fonts = (await response.json()).filter(asset => asset.kind === 'font');
        assetFonts.splice(0, assetFonts.length, ...fonts);
        const nextSig = fonts.map(f => `${f.family}|${f.url}`).join('\n');
        if (nextSig !== assetFontsSig) {
            assetFontsSig = nextSig;
            let style = document.getElementById('asset-font-faces');
            if (!style) { style = document.createElement('style'); style.id = 'asset-font-faces'; document.head.appendChild(style); }
            style.textContent = fonts.map(font => `@font-face { font-family: '${font.family.replace(/'/g, '')}'; src: url('${font.url}'); font-display: swap; }`).join('\n');
            if (document.fonts?.load) {
                fonts.forEach(font => document.fonts.load(`16px '${font.family}'`).catch(() => null));
            }
        }
    } catch { /* fonts are optional */ }
    return assetFonts;
}

export { GOOGLE_FONTS, assetFonts, loadAssetFonts, loadGoogleFont };

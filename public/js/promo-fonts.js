const pending = new Map();
let assets;

export async function fontAssets() {
    if (!assets) {
        assets = fetch('/api/custom-overlays/assets').then(async response => {
            if (!response.ok) throw new Error('Could not load uploaded fonts from the Asset Library.');
            const data = await response.json();
            if (!Array.isArray(data)) throw new Error('Invalid font library response.');
            return data.filter(asset => asset.kind === 'font');
        }).catch(error => { assets = null; throw error; });
    }
    return assets;
}

async function deadline(promise) {
    let timer;
    try {
        return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Font loading timed out.')), 15000); })]);
    } finally { clearTimeout(timer); }
}

export async function promoFont(name) {
    if (['sans-serif', 'serif', 'monospace'].includes(name)) return name;
    if (window.OverlayFonts.system.includes(name)) return `"${name}"`;
    if (!pending.has(name)) {
        const load = (async () => {
            if (window.OverlayFonts.google.includes(name)) {
                const link = document.createElement('link');
                link.rel = 'stylesheet';
                link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(name).replace(/%20/g, '+')}&display=swap`;
                try {
                    await deadline(new Promise((resolve, reject) => {
                        link.onload = resolve; link.onerror = () => reject(new Error('Font stylesheet could not be loaded.'));
                        document.head.appendChild(link);
                    }));
                    const loaded = await deadline(document.fonts.load(`400 32px "${name}"`));
                    if (!loaded.length) throw new Error('Font data is unavailable.');
                } catch (error) { link.remove(); throw error; }
            } else {
                const asset = (await fontAssets()).find(font => font.family === name);
                if (!asset || !/^\/custom-overlay-assets\/[^/?#\\]+$/.test(asset.url)) throw new Error('Uploaded font not found.');
                const face = await deadline(new FontFace(name, `url("${asset.url.replace(/"/g, '%22')}")`).load());
                document.fonts.add(face);
            }
        })().catch(error => { pending.delete(name); throw new Error(`Could not load "${name}". ${error.message} Choose a system font to export offline.`); });
        pending.set(name, load);
    }
    await pending.get(name);
    return `"${name}"`;
}

// Applies the saved admin appearance (light/dark/system and accent color) before first paint.
(function () {
    const KEY = 'streampulse:appearance';
    const root = document.documentElement;
    const media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null;

    function read() {
        try { return Object.assign({ mode: 'dark', accent: '' }, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { return { mode: 'dark', accent: '' }; }
    }
    function apply() {
        const s = read();
        const light = s.mode === 'light' || (s.mode === 'system' && media && media.matches);
        root.dataset.theme = light ? 'light' : 'dark';
        const vars = ['--accent', '--accent-strong', '--accent-soft', '--accent-bg', '--accent-border'];
        vars.forEach(v => root.style.removeProperty(v));
        if (/^#[0-9a-f]{6}$/i.test(s.accent)) {
            const card = light ? '#ffffff' : '#161b22';
            root.style.setProperty('--accent', s.accent);
            root.style.setProperty('--accent-strong', `color-mix(in srgb, ${s.accent} ${light ? 100 : 80}%, #000)`);
            root.style.setProperty('--accent-soft', `color-mix(in srgb, ${s.accent} 70%, ${light ? '#000' : '#fff'})`);
            root.style.setProperty('--accent-bg', `color-mix(in srgb, ${s.accent} ${light ? 12 : 14}%, ${card})`);
            root.style.setProperty('--accent-border', `color-mix(in srgb, ${s.accent} ${light ? 30 : 32}%, ${card})`);
        }
    }
    function save(patch) {
        localStorage.setItem(KEY, JSON.stringify(Object.assign(read(), patch)));
        apply();
        window.dispatchEvent(new CustomEvent('streampulse:appearance'));
    }
    apply();
    if (media && media.addEventListener) media.addEventListener('change', apply);
    window.addEventListener('storage', event => { if (event.key === KEY) apply(); });
    window.StreamPulseAppearance = { read, save, apply };
})();

// Over plain http on a LAN address (e.g. http://192.168.1.4:3000) browsers hide navigator.clipboard, so every Copy button would fail.
(function () {
    function legacyCopy(text) {
        const area = document.createElement('textarea');
        area.value = String(text);
        area.setAttribute('readonly', '');
        area.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
        document.body.appendChild(area);
        area.select();
        area.setSelectionRange(0, area.value.length);
        let ok = false;
        try { ok = document.execCommand('copy'); } catch { ok = false; }
        area.remove();
        return ok ? Promise.resolve() : Promise.reject(new Error('Copy is not available in this browser'));
    }
    const native = navigator.clipboard && window.isSecureContext ? navigator.clipboard : null;
    const shim = { writeText: text => (native ? native.writeText(text).catch(() => legacyCopy(text)) : legacyCopy(text)) };
    if (!native) {
        try { Object.defineProperty(navigator, 'clipboard', { value: shim, configurable: true }); } catch { /* read-only navigator */ }
    }
})();

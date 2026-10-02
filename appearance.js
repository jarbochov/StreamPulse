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

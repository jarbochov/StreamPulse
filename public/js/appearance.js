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

// Global accessible in-app toast notifications and modal dialogs (replaces native alert/confirm/prompt)
(function () {
    function toast(message, type = 'info', duration = 3200) {
        let container = document.getElementById('sp-toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'sp-toast-container';
            document.body.appendChild(container);
        }
        const el = document.createElement('div');
        el.className = `sp-toast ${type || ''}`.trim();
        const text = document.createElement('span');
        text.textContent = String(message || '');
        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '&times;';
        closeBtn.setAttribute('aria-label', 'Close');
        closeBtn.style.cssText = 'background:none;border:none;color:currentColor;opacity:.6;cursor:pointer;font-size:16px;padding:0 0 0 8px;line-height:1;';
        closeBtn.onclick = () => el.remove();
        el.append(text, closeBtn);
        container.appendChild(el);
        if (duration > 0) {
            setTimeout(() => {
                el.style.transition = 'opacity .2s ease, transform .2s ease';
                el.style.opacity = '0';
                el.style.transform = 'translateY(8px)';
                setTimeout(() => el.remove(), 220);
            }, duration);
        }
    }

    function confirm(title, message, options = {}) {
        if (message === undefined || (typeof message === 'object' && message !== null)) {
            options = message || {};
            message = title;
            title = options.title || 'Confirm';
        }
        return new Promise((resolve) => {
            const dialog = document.createElement('dialog');
            dialog.className = 'sp-dialog';
            dialog.style.margin = 'auto';
            const h3 = document.createElement('h3');
            h3.textContent = title;
            const p = document.createElement('p');
            p.textContent = message;
            const actions = document.createElement('div');
            actions.className = 'sp-dialog-actions';
            const cancelBtn = document.createElement('button');
            cancelBtn.type = 'button';
            cancelBtn.className = 'btn';
            cancelBtn.textContent = options.cancelText || 'Cancel';
            const okBtn = document.createElement('button');
            okBtn.type = 'button';
            okBtn.className = `btn ${options.danger ? 'btn-danger' : 'btn-primary'}`;
            okBtn.textContent = options.confirmText || 'Confirm';

            const cleanup = (val) => { dialog.close(); dialog.remove(); resolve(val); };
            cancelBtn.onclick = () => cleanup(false);
            okBtn.onclick = () => cleanup(true);
            dialog.oncancel = (e) => { e.preventDefault(); cleanup(false); };
            dialog.onclick = (e) => {
                const rect = dialog.getBoundingClientRect();
                if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
                    cleanup(false);
                }
            };

            actions.append(cancelBtn, okBtn);
            dialog.append(h3, p, actions);
            document.body.appendChild(dialog);
            dialog.showModal();
            okBtn.focus();
        });
    }

    function prompt(title, message, defaultValue = '') {
        if (typeof message !== 'string') {
            defaultValue = message || '';
            message = title;
            title = 'Input Required';
        }
        return new Promise((resolve) => {
            const dialog = document.createElement('dialog');
            dialog.className = 'sp-dialog';
            dialog.style.margin = 'auto';
            const h3 = document.createElement('h3');
            h3.textContent = title;
            const p = document.createElement('p');
            p.textContent = message;
            const input = document.createElement('input');
            input.className = 'input';
            input.value = defaultValue || '';
            const actions = document.createElement('div');
            actions.className = 'sp-dialog-actions';
            const cancelBtn = document.createElement('button');
            cancelBtn.type = 'button';
            cancelBtn.className = 'btn';
            cancelBtn.textContent = 'Cancel';
            const okBtn = document.createElement('button');
            okBtn.type = 'button';
            okBtn.className = 'btn btn-primary';
            okBtn.textContent = 'OK';

            const cleanup = (val) => { dialog.close(); dialog.remove(); resolve(val); };
            cancelBtn.onclick = () => cleanup(null);
            okBtn.onclick = () => cleanup(input.value);
            dialog.oncancel = (e) => { e.preventDefault(); cleanup(null); };
            dialog.onclick = (e) => {
                const rect = dialog.getBoundingClientRect();
                if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
                    cleanup(null);
                }
            };
            input.onkeydown = (e) => {
                if (e.key === 'Enter') { e.preventDefault(); okBtn.click(); }
            };

            actions.append(cancelBtn, okBtn);
            dialog.append(h3, p, input, actions);
            document.body.appendChild(dialog);
            dialog.showModal();
            input.focus();
            input.select();
        });
    }

    window.StreamPulse = Object.assign(window.StreamPulse || {}, { toast, confirm, prompt });
    window.showToast = toast;
})();

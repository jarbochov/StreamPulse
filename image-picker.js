/* Shared image picker: choose from the asset library or upload a file from this computer. */
(function () {
    const STYLE_ID = 'image-picker-style';

    function injectStyle() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
.mp-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.6); z-index: 100000; display: flex; align-items: center; justify-content: center; padding: 16px; }
.mp-dialog { background: var(--bg-card, #1c2128); color: var(--text, #e6edf3); border: 1px solid var(--border, #30363d); border-radius: 10px; width: min(720px, 100%); max-height: min(640px, 90vh); display: flex; flex-direction: column; box-shadow: 0 20px 60px rgba(0,0,0,.5); }
.mp-head, .mp-foot { display: flex; gap: 8px; padding: 12px; align-items: center; }
.mp-head { border-bottom: 1px solid var(--border, #30363d); }
.mp-foot { border-top: 1px solid var(--border, #30363d); font-size: 12px; color: var(--text-muted, #8b949e); }
.mp-head input[type=search] { flex: 1; min-width: 0; padding: 8px 10px; background: var(--bg-inset, #0d1117); border: 1px solid var(--border, #30363d); border-radius: 6px; color: inherit; font: inherit; }
.mp-dialog button, .mp-upload { background: var(--bg-raised, #21262d); color: inherit; border: 1px solid var(--border, #30363d); border-radius: 6px; padding: 7px 12px; cursor: pointer; font: inherit; }
.mp-grid { overflow: auto; padding: 12px; display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 8px; }
.mp-grid button { padding: 0; overflow: hidden; display: flex; flex-direction: column; text-align: left; background: var(--bg-inset, #0d1117); }
.mp-grid button:hover, .mp-grid button:focus-visible, .mp-grid button.on { border-color: var(--accent, #58a6ff); outline: none; }
.mp-thumb { height: 84px; background: repeating-conic-gradient(#2a2f36 0 25%, #1c2128 0 50%) 0 0 / 14px 14px; }
.mp-thumb img { width: 100%; height: 100%; object-fit: contain; display: block; }
.mp-cap { padding: 4px 6px; font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mp-empty { grid-column: 1 / -1; text-align: center; color: var(--text-muted, #8b949e); padding: 20px; }
.mp-status { margin-right: auto; }`;
        document.head.appendChild(style);
    }

    const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    function open({ value = '', onPick }) {
        injectStyle();
        const backdrop = document.createElement('div');
        backdrop.className = 'mp-backdrop';
        backdrop.innerHTML = `<div class="mp-dialog" role="dialog" aria-label="Choose an image">
            <div class="mp-head"><input type="search" placeholder="Filter by name" aria-label="Filter images"><label class="mp-upload">Upload from computer<input type="file" accept="image/*" hidden></label><button type="button" data-clear>No image</button><button type="button" data-close>Cancel</button></div>
            <div class="mp-grid" role="listbox"><div class="mp-empty">Loading…</div></div>
            <div class="mp-foot"><span class="mp-status">Images from the Asset Library. Uploads are saved there too.</span></div>
        </div>`;
        const input = backdrop.querySelector('input[type=search]');
        const file = backdrop.querySelector('input[type=file]');
        const grid = backdrop.querySelector('.mp-grid');
        const status = backdrop.querySelector('.mp-status');
        let assets = [];

        const close = () => { backdrop.remove(); document.removeEventListener('keydown', onKey, true); };
        const pick = url => { close(); onPick && onPick(url); };
        function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } }

        function draw() {
            const q = input.value.trim().toLowerCase();
            const list = assets.filter(a => !q || (a.label || a.name).toLowerCase().includes(q));
            grid.innerHTML = list.length ? '' : '<div class="mp-empty">No images found. Upload one from your computer.</div>';
            list.forEach(a => {
                const b = document.createElement('button');
                b.type = 'button';
                b.setAttribute('role', 'option');
                if (a.url === value) b.classList.add('on');
                b.innerHTML = `<div class="mp-thumb"><img src="${esc(a.url)}" alt="" loading="lazy"></div><div class="mp-cap" title="${esc(a.label || a.name)}">${esc(a.label || a.name)}</div>`;
                b.onclick = () => pick(a.url);
                grid.appendChild(b);
            });
        }

        fetch('/api/custom-overlays/assets', { cache: 'no-store' })
            .then(r => r.json())
            .then(list => { assets = list.filter(a => a.kind === 'image'); draw(); })
            .catch(() => { grid.innerHTML = '<div class="mp-empty">Could not load the Asset Library.</div>'; });

        file.addEventListener('change', async () => {
            const f = file.files[0];
            if (!f) return;
            status.textContent = 'Uploading…';
            try {
                const res = await fetch('/api/custom-overlays/assets', {
                    method: 'POST',
                    headers: { 'Content-Type': f.type || 'application/octet-stream', 'X-Asset-Name': f.name },
                    body: f
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Upload failed');
                pick(data.url);
            } catch (err) {
                status.textContent = err.message;
            }
        });

        input.addEventListener('input', draw);
        backdrop.querySelector('[data-clear]').onclick = () => pick('');
        backdrop.querySelector('[data-close]').onclick = close;
        backdrop.addEventListener('mousedown', e => { if (e.target === backdrop) close(); });
        document.addEventListener('keydown', onKey, true);
        document.body.appendChild(backdrop);
        input.focus();
    }

    window.ImagePicker = { open };
})();

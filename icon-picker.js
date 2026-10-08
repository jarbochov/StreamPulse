// Shared Font Awesome icon picker. Usage: IconPicker.open({ value, onPick(cls) }). Also exposes IconPicker.ensureFont().
(function () {
    const FA_CSS = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css';
    const brands = 'twitch youtube twitter x-twitter instagram tiktok discord threads mastodon github gitlab linkedin facebook reddit snapchat pinterest telegram whatsapp spotify apple soundcloud bandcamp steam xbox playstation itch-io patreon paypal kickstarter twitter-square tumblr medium stack-overflow codepen figma behance dribbble slack skype signal vimeo flickr deviantart wordpress amazon google chrome firefox safari windows linux android ubuntu docker npm python js node-js react vuejs unity unreal battle-net ebay etsy shopify cc-visa bitcoin ethereum creative-commons gofundme goodreads imdb letterboxd lastfm mixcloud napster raspberry-pi trello twitch-square'.split(' ');
    const solid = 'globe link envelope at heart star gamepad trophy crown gem fire bolt music headphones microphone video film camera tv desktop laptop keyboard mouse gift hand-holding-heart handshake users user comment comments message bell calendar clock hourglass trophy medal flag location-dot map house cart-shopping bag-shopping coins dollar-sign money-bill credit-card ticket tag tags bookmark book newspaper pen pencil palette paintbrush wand-magic-sparkles sparkles rocket ghost skull dragon dice chess puzzle-piece cube shield-halved sword swords bomb robot brain lightbulb sun moon cloud cloud-rain snowflake umbrella leaf tree paw dog cat fish bug car plane ship bicycle utensils pizza-slice burger mug-hot beer-mugstin cake-candles cookie-bite check xmark plus minus arrow-right arrow-left arrow-up arrow-down play pause stop forward backward volume-high podcast radio rss wifi signal share-nodes qrcode code terminal gear wrench screwdriver-wrench circle-info circle-question triangle-exclamation thumbs-up thumbs-down face-smile face-laugh face-grin-stars face-heart-eyes hands-clapping eye lock key unlock download upload cloud-arrow-up cloud-arrow-down paper-plane hashtag percent infinity'.replace('beer-mugstin', 'beer-mug-empty').split(' ');
    const ICONS = [...new Set([...brands.map(n => `fa-brands fa-${n}`), ...solid.map(n => `fa-solid fa-${n}`)])];

    function ensureFont() {
        if (document.querySelector('link[data-fa]')) return;
        const link = document.createElement('link');
        link.rel = 'stylesheet'; link.href = FA_CSS; link.dataset.fa = '1';
        document.head.appendChild(link);
    }

    function normalize(value) {
        const v = String(value || '').trim();
        if (!v) return '';
        // Accept the legacy "fab"/"fas" prefixes and bare names like "twitch".
        return v.replace(/^fab\b/, 'fa-brands').replace(/^fas\b/, 'fa-solid').replace(/^far\b/, 'fa-regular');
    }

    function injectStyle() {
        if (document.getElementById('icon-picker-style')) return;
        const style = document.createElement('style');
        style.id = 'icon-picker-style';
        style.textContent = `
.ip-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.6); z-index: 100000; display: flex; align-items: center; justify-content: center; padding: 16px; }
.ip-dialog { background: var(--bg-card, #1c2128); color: var(--text, #e6edf3); border: 1px solid var(--border, #30363d); border-radius: 10px; width: min(640px, 100%); max-height: min(640px, 90vh); display: flex; flex-direction: column; box-shadow: 0 20px 60px rgba(0,0,0,.5); font: 14px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
.ip-head { display: flex; gap: 8px; padding: 12px; border-bottom: 1px solid var(--border, #30363d); align-items: center; }
.ip-head input { flex: 1; min-width: 0; padding: 8px 10px; background: var(--bg-inset, #0d1117); border: 1px solid var(--border, #30363d); border-radius: 6px; color: inherit; font: inherit; }
.ip-head button, .ip-foot button { background: var(--bg-raised, #21262d); color: inherit; border: 1px solid var(--border, #30363d); border-radius: 6px; padding: 7px 12px; cursor: pointer; font: inherit; }
.ip-grid { overflow: auto; padding: 12px; display: grid; grid-template-columns: repeat(auto-fill, minmax(64px, 1fr)); gap: 6px; }
.ip-grid button { aspect-ratio: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; background: var(--bg-inset, #0d1117); border: 1px solid transparent; border-radius: 6px; color: inherit; cursor: pointer; padding: 4px; min-width: 0; }
.ip-grid button:hover, .ip-grid button:focus-visible { border-color: var(--accent, #58a6ff); outline: none; }
.ip-grid button.on { border-color: var(--accent, #58a6ff); background: rgba(88,166,255,.15); }
.ip-grid i { font-size: 22px; }
.ip-grid span { font-size: 9px; color: var(--text-muted, #8b949e); max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ip-foot { display: flex; gap: 8px; padding: 10px 12px; border-top: 1px solid var(--border, #30363d); align-items: center; font-size: 12px; color: var(--text-muted, #8b949e); }
.ip-foot .ip-note { flex: 1; }
.ip-empty { grid-column: 1 / -1; text-align: center; color: var(--text-muted, #8b949e); padding: 20px; }`;
        document.head.appendChild(style);
    }

    function open({ value = '', onPick }) {
        ensureFont(); injectStyle();
        const backdrop = document.createElement('div');
        backdrop.className = 'ip-backdrop';
        backdrop.innerHTML = `<div class="ip-dialog" role="dialog" aria-label="Pick an icon">
            <div class="ip-head"><input type="search" placeholder="Search icons, or type any Font Awesome name and press Enter" aria-label="Search icons"><button type="button" data-act="clear">No icon</button><button type="button" data-act="close">Close</button></div>
            <div class="ip-grid" role="listbox"></div>
            <div class="ip-foot"><span class="ip-note">Free Font Awesome 6 icons. Typing a name not in the list uses it directly.</span><a href="https://fontawesome.com/search?o=r&m=free" target="_blank" rel="noopener" style="color:var(--accent,#58a6ff)">Browse all ↗</a></div>
        </div>`;
        const input = backdrop.querySelector('input');
        const grid = backdrop.querySelector('.ip-grid');
        const current = normalize(value);
        const close = () => { backdrop.remove(); document.removeEventListener('keydown', onKey, true); };
        const pick = cls => { close(); onPick && onPick(cls); };
        const label = cls => cls.split(' ').pop().replace(/^fa-/, '');
        function draw() {
            const q = input.value.trim().toLowerCase().replace(/^fa[a-z-]*\s+/, '').replace(/^fa-/, '');
            const list = ICONS.filter(cls => !q || label(cls).includes(q));
            grid.innerHTML = list.length ? list.map(cls => `<button type="button" role="option" data-cls="${cls}" class="${cls === current ? 'on' : ''}" title="${cls}"><i class="${cls}"></i><span>${label(cls)}</span></button>`).join('') : '<div class="ip-empty">No match. Press Enter to use it as a Font Awesome name.</div>';
        }
        function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } }
        input.addEventListener('input', draw);
        input.addEventListener('keydown', e => {
            if (e.key !== 'Enter') return;
            const raw = input.value.trim();
            if (!raw) return;
            const first = grid.querySelector('button[data-cls]');
            if (first && !/^fa[a-z-]*\s/.test(raw) && first.dataset.cls.endsWith(`fa-${raw.replace(/^fa-/, '').toLowerCase()}`)) return pick(first.dataset.cls);
            if (/^fa[a-z-]*\s+fa-[\w-]+$/.test(raw)) return pick(normalize(raw));
            if (/^[\w-]+$/.test(raw)) return pick(first ? first.dataset.cls : `fa-solid fa-${raw.replace(/^fa-/, '')}`);
        });
        grid.addEventListener('click', e => { const b = e.target.closest('button[data-cls]'); if (b) pick(b.dataset.cls); });
        backdrop.addEventListener('click', e => {
            if (e.target === backdrop) return close();
            const act = e.target.closest('[data-act]')?.dataset.act;
            if (act === 'close') close();
            if (act === 'clear') pick('');
        });
        document.addEventListener('keydown', onKey, true);
        document.body.appendChild(backdrop);
        draw();
        input.focus();
    }

    window.IconPicker = { open, ensureFont, normalize, ICONS };
})();

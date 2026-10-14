// Shared navigation component — edit here to update all pages
(function() {
    // Inject nav active styles once
    const style = document.createElement('style');
    style.textContent = `
        .nav { display: flex; gap: 0.6rem; align-items: center; flex-wrap: wrap; }
        .nav a { color: var(--text-muted); text-decoration: none; font-size: 0.85rem; padding: 0.4rem 0.75rem; border-radius: 6px; transition: all 0.2s; }
        .nav a:hover { color: var(--text); background: var(--bg-raised); }
        .nav .dropdown { position: relative; display: flex; align-items: center; }
        .nav .dropdown-toggle { color: var(--text-muted); text-decoration: none; font-size: 0.85rem; padding: 0.4rem 0.75rem; border-radius: 6px; transition: all 0.2s; cursor: pointer; display: block; user-select: none; }
        .nav .dropdown-toggle:hover { color: var(--text); background: var(--bg-raised); }
        .nav .dropdown-menu { display: none; position: absolute; top: 100%; right: 0; background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px; padding: 0.4rem 0; min-width: 210px; max-height: 80vh; overflow-y: auto; z-index: 50; box-shadow: 0 8px 24px rgba(0,0,0,0.4); }
        .nav .dropdown::after { content: ''; position: absolute; top: 100%; left: 0; right: 0; height: 8px; }
        .nav .dropdown:hover .dropdown-menu, .nav .dropdown.open .dropdown-menu { display: block; }
        .nav .dropdown-menu a { display: flex; align-items: center; justify-content: space-between; padding: 0.5rem 1rem; color: var(--text-muted); text-decoration: none; font-size: 0.85rem; transition: all 0.15s; }
        .nav .dropdown-menu a:hover { color: var(--text); background: var(--bg-raised); }
        .nav .ext-icon { font-size: 0.75em; opacity: 0.5; margin-left: 0.4rem; display: inline-block; vertical-align: 1px; }
        .nav .menu-heading { padding: 0.55rem 1rem 0.2rem; margin-top: 0.25rem; border-top: 1px solid var(--bg-raised); color: var(--text-faint); font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 700; }
        .nav a.active, .nav .dropdown-toggle.active { color: var(--text) !important; background: var(--bg-raised); }
        .nav .dropdown-menu a.active { color: var(--accent) !important; background: var(--bg-card); }
        
        /* Status pill */
        .nav-status-pill { display: inline-flex; align-items: center; gap: 0.4rem; font-size: 0.75rem; font-weight: 600; padding: 0.25rem 0.6rem; border-radius: 999px; text-decoration: none; color: var(--text-muted); background: var(--bg-card); border: 1px solid var(--border); transition: all 0.2s; white-space: nowrap; }
        .nav-status-pill:hover { border-color: var(--accent); color: var(--text); }
        .nav-status-pill .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--text-muted); }
        .nav-status-pill.live { color: #fff; background: color-mix(in srgb, #f85149 18%, var(--bg-card)); border-color: #f85149; }
        .nav-status-pill.live .dot { background: #f85149; box-shadow: 0 0 6px #f85149; animation: nav-pulse 2s infinite; }
        @keyframes nav-pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.35; transform: scale(0.85); } }

        /* Command palette trigger */
        .nav-cmd-btn { display: inline-flex; align-items: center; gap: 0.35rem; background: var(--bg-card); border: 1px solid var(--border); border-radius: 6px; padding: 0.3rem 0.55rem; color: var(--text-muted); font-size: 0.8rem; cursor: pointer; transition: all 0.2s; }
        .nav-cmd-btn:hover { border-color: var(--accent); color: var(--text); background: var(--bg-raised); }
        .nav-cmd-btn kbd { font: 10px ui-monospace, Menlo, monospace; background: var(--bg-inset); border: 1px solid var(--border); border-radius: 4px; padding: 0.05rem 0.3rem; color: var(--text-muted); }

        /* Command Palette modal */
        #nav-palette-backdrop { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.65); z-index: 99999; backdrop-filter: blur(3px); place-items: start center; padding-top: 12vh; box-sizing: border-box; }
        #nav-palette-backdrop.open { display: grid; }
        .nav-palette { background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; width: min(540px, 92vw); box-shadow: 0 16px 48px rgba(0,0,0,0.5); overflow: hidden; display: flex; flex-direction: column; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
        .nav-palette-input-wrap { display: flex; align-items: center; gap: 0.6rem; padding: 0.8rem 1rem; border-bottom: 1px solid var(--border); background: var(--bg-inset); }
        .nav-palette-input-wrap input { width: 100%; border: 0; background: transparent; font-size: 1rem; color: var(--text); outline: none; }
        .nav-palette-results { max-height: 52vh; overflow-y: auto; padding: 0.4rem; display: flex; flex-direction: column; gap: 2px; }
        .nav-palette-group { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-faint); padding: 0.5rem 0.6rem 0.2rem; font-weight: 700; }
        .nav-palette-item { display: flex; align-items: center; justify-content: space-between; padding: 0.5rem 0.75rem; border-radius: 6px; color: var(--text); text-decoration: none; font-size: 0.88rem; cursor: pointer; transition: all 0.1s; }
        .nav-palette-item:hover, .nav-palette-item.selected { background: var(--accent-strong, #1f6feb); color: #fff; }
        .nav-palette-item:hover .palette-hint, .nav-palette-item.selected .palette-hint { color: rgba(255,255,255,0.8); }
        .nav-palette-item .palette-hint { font-size: 0.75rem; color: var(--text-muted); }
        .nav-palette-empty { padding: 1.5rem; text-align: center; color: var(--text-muted); font-size: 0.88rem; }
        .nav-palette-footer { padding: 0.5rem 0.9rem; border-top: 1px solid var(--border); font-size: 0.75rem; color: var(--text-faint); display: flex; justify-content: space-between; background: var(--bg-inset); }
    `;
    document.head.appendChild(style);

    const nav = [
        { label: 'Dashboard', href: '/dashboard.html' },
        { label: 'Overlays ▾', children: [
            { label: 'All Overlays', href: '/overlays.html' },
            { label: 'Custom Overlays', href: '/custom-overlays.html' },
            { heading: 'Built-in' },
            { label: 'Credits', href: '/credits.html', target: '_blank' },
            { label: 'Stats', href: '/stats.html', target: '_blank' },
            { label: 'Hashtags', href: '/hashtags.html', target: '_blank' },
            { label: 'Viewer Count', href: '/viewers.html', target: '_blank' },
            { label: 'Goal', href: '/goal.html', target: '_blank' },
            { label: 'Goals Cycle', href: '/goal.html?mode=cycle', target: '_blank' },
            { label: 'Game Plan', href: '/game-plan.html', target: '_blank' },
            { label: 'Milestones & Streaks', href: '/milestones.html', target: '_blank' },
            { heading: 'Music (Beta)' },
            { label: 'Full', href: '/music.html?mode=full', target: '_blank' },
            { label: 'Art Only', href: '/music.html?mode=art', target: '_blank' },
            { label: 'Mini Bar', href: '/music.html?mode=mini', target: '_blank' },
            { heading: 'Timers' },
            { label: 'Countdown', href: '/countdown.html', target: '_blank' },
            { label: 'Stopwatch', href: '/stopwatch.html', target: '_blank' },
            { heading: 'URL Builders' },
            { label: 'Credits, Goals & Viewers', href: '/overlay-url-wizard.html' },
            { label: 'Timers', href: '/timer-url-wizard.html' },
            { label: 'Music', href: '/music-url-wizard.html' },
            { label: 'Game Plan', href: '/game-plan-url-wizard.html' },
            { label: 'Milestones', href: '/milestone-url-wizard.html' }
        ]},
        { label: 'Library ▾', children: [
            { label: 'Highlights', href: '/highlights.html' },
            { label: 'Clips (Beta)', href: '/clips.html' },
            { label: 'Sessions', href: '/sessions.html?session=__current__' },
            { label: 'Categories', href: '/categories.html' },
            { label: 'Analytics & Community', href: '/analytics.html' },
            { label: 'Hashtag Stats', href: '/hashtag-stats.html' }
        ]},
        { label: 'Manage ▾', children: [
            { heading: 'Overlay settings' },
            { label: 'Credits', href: '/credits-editor.html' },
            { label: 'Theme', href: '/theme-editor.html' },
            { label: 'Goals', href: '/goals-editor.html' },
            { label: 'Game Plan', href: '/game-plan-editor.html' },
            { label: 'Assets', href: '/assets.html' },
            { label: 'Timers', href: '/timers-editor.html' },
            { label: 'Alerts (Beta)', href: '/alerts.html' },
            { label: 'Chat Bot (Beta)', href: '/chatbot.html' },
            { label: 'Placeholders & Variables', href: '/placeholders.html' },
            { label: 'Music Settings (Beta)', href: '/music-editor.html' },
            { label: 'Hashtag Tools', href: '/manage-hashtags.html' },
            { heading: 'System' },
            { label: 'Config', href: '/config-editor.html' },
            { label: 'Twitch Connect', href: '/twitch-connect.html' },
            { label: 'Backup & Restore', href: '/backup.html' },
            { label: 'Update', href: '/update.html' }
        ]},
        { label: 'API', href: '/api.html' },
        { label: 'Docs', href: '/docs.html' }
    ];

    const currentPath = window.location.pathname;

    function isActive(href) {
        if (!href) return false;
        const clean = href.split('?')[0];
        return currentPath === clean;
    }

    // Flatten all navigable items for Command Palette search
    function flattenItems() {
        const list = [];
        for (const item of nav) {
            if (item.children) {
                let currentHeading = item.label.replace(' ▾', '');
                for (const child of item.children) {
                    if (child.heading) {
                        currentHeading = `${item.label.replace(' ▾', '')} › ${child.heading}`;
                        continue;
                    }
                    list.push({
                        label: child.label,
                        href: child.href,
                        target: child.target,
                        group: currentHeading
                    });
                }
            } else {
                list.push({
                    label: item.label,
                    href: item.href,
                    group: 'Navigation'
                });
            }
        }
        // Additional deep-link shortcuts for command palette
        list.push({ label: 'Milestones & Streaks', href: '/analytics.html#milestones', group: 'Analytics' });
        list.push({ label: 'Chatters & Notes (Community)', href: '/analytics.html#crm', group: 'Analytics' });
        list.push({ label: 'Subscribers & Growth', href: '/analytics.html#growth', group: 'Analytics' });
        list.push({ label: 'Milestones Overlay URL Wizard', href: '/milestone-url-wizard.html', group: 'URL Builders' });
        return list;
    }

    // Command Palette Modal & Controller
    let paletteBackdrop = null;
    let paletteInput = null;
    let paletteResults = null;
    let activePaletteIndex = 0;
    const allSearchItems = flattenItems();

    function initCommandPalette() {
        if (document.getElementById('nav-palette-backdrop')) return;

        paletteBackdrop = document.createElement('div');
        paletteBackdrop.id = 'nav-palette-backdrop';
        paletteBackdrop.innerHTML = `
            <div class="nav-palette" role="dialog" aria-modal="true" aria-label="Quick Jump">
                <div class="nav-palette-input-wrap">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                    <input type="text" id="nav-palette-input" placeholder="Type a page, overlay, or tool…" autocomplete="off" spellcheck="false">
                </div>
                <div class="nav-palette-results" id="nav-palette-results"></div>
                <div class="nav-palette-footer">
                    <span><b>↑↓</b> to navigate · <b>↵</b> to select</span>
                    <span><b>Esc</b> to close</span>
                </div>
            </div>
        `;
        document.body.appendChild(paletteBackdrop);

        paletteInput = document.getElementById('nav-palette-input');
        paletteResults = document.getElementById('nav-palette-results');

        paletteBackdrop.addEventListener('click', (e) => {
            if (e.target === paletteBackdrop) closeCommandPalette();
        });

        paletteInput.addEventListener('input', () => {
            activePaletteIndex = 0;
            renderPaletteResults(paletteInput.value.trim().toLowerCase());
        });

        paletteInput.addEventListener('keydown', (e) => {
            const items = paletteResults.querySelectorAll('.nav-palette-item');
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (items.length) {
                    activePaletteIndex = (activePaletteIndex + 1) % items.length;
                    highlightPaletteItem(items);
                }
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (items.length) {
                    activePaletteIndex = (activePaletteIndex - 1 + items.length) % items.length;
                    highlightPaletteItem(items);
                }
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (items[activePaletteIndex]) {
                    items[activePaletteIndex].click();
                }
            } else if (e.key === 'Escape') {
                e.preventDefault();
                closeCommandPalette();
            }
        });

        window.addEventListener('keydown', (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                toggleCommandPalette();
            }
        });
    }

    function highlightPaletteItem(items) {
        items.forEach((item, idx) => {
            const isSel = idx === activePaletteIndex;
            item.classList.toggle('selected', isSel);
            if (isSel) item.scrollIntoView({ block: 'nearest' });
        });
    }

    function renderPaletteResults(query) {
        if (!paletteResults) return;
        const filtered = query
            ? allSearchItems.filter(i => `${i.label} ${i.group} ${i.href}`.toLowerCase().includes(query))
            : allSearchItems;

        if (!filtered.length) {
            paletteResults.innerHTML = '<div class="nav-palette-empty">No matching pages found</div>';
            return;
        }

        let html = '';
        let lastGroup = null;
        let itemIndex = 0;

        for (const item of filtered) {
            if (item.group !== lastGroup) {
                html += `<div class="nav-palette-group">${item.group}</div>`;
                lastGroup = item.group;
            }
            const isSelected = itemIndex === activePaletteIndex;
            const ext = item.target === '_blank' ? ' ↗' : '';
            html += `<a class="nav-palette-item${isSelected ? ' selected' : ''}" href="${item.href}"${item.target ? ` target="${item.target}"` : ''} data-idx="${itemIndex}">
                <span>${item.label}${ext}</span>
                <span class="palette-hint">${item.href}</span>
            </a>`;
            itemIndex++;
        }
        paletteResults.innerHTML = html;

        paletteResults.querySelectorAll('.nav-palette-item').forEach(el => {
            el.addEventListener('mouseenter', () => {
                activePaletteIndex = Number(el.dataset.idx);
                highlightPaletteItem(paletteResults.querySelectorAll('.nav-palette-item'));
            });
        });
    }

    function openCommandPalette() {
        initCommandPalette();
        paletteBackdrop.classList.add('open');
        paletteInput.value = '';
        activePaletteIndex = 0;
        renderPaletteResults('');
        setTimeout(() => paletteInput.focus(), 50);
    }

    function closeCommandPalette() {
        if (paletteBackdrop) paletteBackdrop.classList.remove('open');
    }

    function toggleCommandPalette() {
        if (paletteBackdrop?.classList.contains('open')) {
            closeCommandPalette();
        } else {
            openCommandPalette();
        }
    }

    function buildNav() {
        const container = document.getElementById('main-nav');
        if (!container) return;

        let html = '';
        for (const item of nav) {
            if (item.children) {
                const anyActive = item.children.some(c => !c.heading && isActive(c.href));
                html += `<div class="dropdown">`;
                html += `<a href="#" class="dropdown-toggle${anyActive ? ' active' : ''}" role="button" aria-haspopup="true" aria-expanded="false">${item.label}</a>`;
                html += `<div class="dropdown-menu">`;
                for (const child of item.children) {
                    if (child.heading) { html += `<div class="menu-heading">${child.heading}</div>`; continue; }
                    const active = isActive(child.href) ? ' class="active"' : '';
                    const target = child.target ? ` target="${child.target}" rel="noopener"` : '';
                    const ext = child.target === '_blank' ? `<span class="ext-icon" aria-hidden="true">↗</span>` : '';
                    html += `<a href="${child.href}"${target}${active}><span>${child.label}</span>${ext}</a>`;
                }
                html += `</div></div>`;
            } else {
                const active = isActive(item.href) ? ' class="active"' : '';
                html += `<a href="${item.href}"${active}>${item.label}</a>`;
            }
        }

        // Live stream status indicator
        html += `<a href="/dashboard.html" id="nav-live-indicator" class="nav-status-pill" title="Stream status" style="display:none;"><span class="dot"></span><span class="label"></span></a>`;

        // Command palette button
        html += `<button type="button" id="nav-cmd-k" class="nav-cmd-btn" title="Quick Jump (Ctrl/⌘+K)" aria-label="Search pages"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-1px"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg> <kbd>⌘K</kbd></button>`;

        // Theme toggle
        html += `<a href="#" id="nav-theme-toggle" title="Switch light / dark" style="padding:0.4rem 0.6rem;"></a>`;
        container.innerHTML = html;

        // Command palette click
        document.getElementById('nav-cmd-k')?.addEventListener('click', openCommandPalette);

        // Dropdown click & tap toggle support
        container.querySelectorAll('.dropdown-toggle').forEach(btn => {
            btn.addEventListener('click', event => {
                event.preventDefault();
                event.stopPropagation();
                const dropdown = btn.closest('.dropdown');
                const wasOpen = dropdown.classList.contains('open');
                document.querySelectorAll('.nav .dropdown.open').forEach(d => {
                    d.classList.remove('open');
                    d.querySelector('.dropdown-toggle')?.setAttribute('aria-expanded', 'false');
                });
                if (!wasOpen) {
                    dropdown.classList.add('open');
                    btn.setAttribute('aria-expanded', 'true');
                }
            });
        });

        // Close dropdowns on outside click
        document.addEventListener('click', event => {
            if (!event.target.closest('.nav .dropdown')) {
                document.querySelectorAll('.nav .dropdown.open').forEach(d => {
                    d.classList.remove('open');
                    d.querySelector('.dropdown-toggle')?.setAttribute('aria-expanded', 'false');
                });
            }
        });

        // Theme toggle logic
        const toggle = document.getElementById('nav-theme-toggle');
        const ap = window.StreamPulseAppearance;
        if (toggle && ap) {
            const paint = () => { toggle.textContent = document.documentElement.dataset.theme === 'light' ? '🌙' : '☀️'; };
            toggle.addEventListener('click', event => { event.preventDefault(); ap.save({ mode: document.documentElement.dataset.theme === 'light' ? 'dark' : 'light' }); paint(); });
            window.addEventListener('streampulse:appearance', paint);
            paint();
        }

        // Live stream status polling
        function updateLiveIndicator() {
            fetch('/api/status').then(r => r.json()).then(data => {
                const pill = document.getElementById('nav-live-indicator');
                if (!pill) return;
                const isLive = !!data.viewers?.live;
                const viewers = data.viewers?.current || 0;
                pill.style.display = 'inline-flex';
                if (isLive) {
                    pill.className = 'nav-status-pill live';
                    pill.querySelector('.label').textContent = `LIVE · ${viewers.toLocaleString()}`;
                    pill.title = `Stream is LIVE with ${viewers} viewers — Click to open Dashboard`;
                } else {
                    pill.className = 'nav-status-pill';
                    pill.querySelector('.label').textContent = 'Offline';
                    pill.title = 'Stream is offline — Click to open Dashboard';
                }
            }).catch(() => {});
        }
        updateLiveIndicator();
        setInterval(() => { if (!document.hidden) updateLiveIndicator(); }, 15000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => { buildNav(); initCommandPalette(); });
    } else {
        buildNav();
        initCommandPalette();
    }
})();

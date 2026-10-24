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
        .nav-status-pill { display: inline-flex; align-items: center; gap: 0.38rem; font-size: 0.72rem; font-weight: 600; padding: 0.22rem 0.55rem; border-radius: 999px; text-decoration: none; color: var(--text-muted); background: var(--bg-card); border: 1px solid var(--border); transition: all 0.2s; white-space: nowrap; }
        .nav-status-pill:hover { border-color: var(--accent); color: var(--text); }
        .nav-status-pill .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--text-muted); flex-shrink: 0; }
        .nav-status-pill.live { color: #fff; background: color-mix(in srgb, #f85149 18%, var(--bg-card)); border-color: #f85149; }
        .nav-status-pill.live .dot { background: #f85149; box-shadow: 0 0 6px #f85149; animation: nav-pulse 2s infinite; }
        .nav-status-pill.connected { color: var(--text); border-color: color-mix(in srgb, #3fb950 40%, var(--border)); }
        .nav-status-pill.connected .dot { background: #3fb950; box-shadow: 0 0 5px rgba(63,185,80,0.6); }
        .nav-status-pill.warn { color: var(--text); border-color: color-mix(in srgb, #d29922 40%, var(--border)); }
        .nav-status-pill.warn .dot { background: #d29922; box-shadow: 0 0 4px rgba(210,153,34,0.5); }
        .nav-status-pill.twitch.connected { border-color: color-mix(in srgb, #9146ff 50%, var(--border)); }
        .nav-status-pill.twitch.connected .dot { background: #9146ff; box-shadow: 0 0 5px rgba(145,70,255,0.7); }
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

    const MODULE_STORAGE_KEY = 'streampulse:modules';
    let moduleState = { chatbot: true, clips: true, weather: true, music: true, hashtags: true };
    try {
        const cached = localStorage.getItem(MODULE_STORAGE_KEY);
        if (cached) {
            const parsed = JSON.parse(cached);
            if (parsed && typeof parsed === 'object') {
                moduleState = Object.assign(moduleState, parsed);
            }
        }
    } catch (e) {}

    function isModuleActive(mod) {
        if (!mod) return true;
        return moduleState[mod] !== false;
    }

    const nav = [
        { label: 'Dashboard', href: '/dashboard.html' },
        { label: 'Overlays ▾', children: [
            { heading: 'Hub & Gallery' },
            { label: 'All Overlays', href: '/overlays.html' },
            { label: 'Custom Overlays', href: '/custom-overlays.html' },
            { heading: 'Editors & Studios' },
            { label: 'Credits Editor', href: '/credits-editor.html' },
            { label: 'Theme Editor', href: '/theme-editor.html' },
            { label: 'Choice Randomizer Studio', href: '/randomizer-editor.html' },
            { label: 'Timers Studio', href: '/timers-editor.html' },
            { label: 'Goals Manager', href: '/goals-editor.html' },
            { label: 'Game Plan Manager', href: '/game-plan-editor.html' },
            { label: 'Music Settings', href: '/music-editor.html', module: 'music' },
            { label: 'Overlay Assets', href: '/assets.html' },
            { heading: 'URL Wizards' },
            { label: 'Credits, Goals & Stats', href: '/overlay-url-wizard.html' },
            { label: 'Timers', href: '/timer-url-wizard.html' },
            { label: 'Music', href: '/music-url-wizard.html', module: 'music' },
            { label: 'Game Plan', href: '/game-plan-url-wizard.html' },
            { label: 'Milestones', href: '/milestone-url-wizard.html' }
        ]},
        { label: 'Tools ▾', children: [
            { label: 'Poll Studio', href: '/polls.html' },
            { label: 'Versus Studio', href: '/versus.html' },
            { label: 'Promo Creator', href: '/promo-creator.html' },
            { label: 'Chat Bot', href: '/chatbot.html', module: 'chatbot' },
            { label: 'Alerts & SFX', href: '/alerts.html' },
            { label: 'Placeholders & Variables', href: '/placeholders.html' },
            { label: 'Hashtag Tools', href: '/manage-hashtags.html', module: 'hashtags' }
        ]},
        { label: 'Library ▾', children: [
            { label: 'Highlights', href: '/highlights.html' },
            { label: 'Clips', href: '/clips.html', module: 'clips' },
            { label: 'Sessions', href: '/sessions.html?session=__current__' },
            { label: 'Categories', href: '/categories.html' },
            { label: 'Analytics & Community', href: '/analytics.html' },
            { label: 'Hashtag Stats', href: '/hashtag-stats.html', module: 'hashtags' }
        ]},
        { label: 'System ▾', children: [
            { label: 'Config', href: '/config-editor.html' },
            { label: 'Twitch Connect', href: '/twitch-connect.html' },
            { label: 'Backup & Restore', href: '/backup.html' },
            { label: 'System Update', href: '/update.html' }
        ]},
        { label: 'API', href: '/api.html' },
        { label: 'Docs', href: '/docs.html' }
    ];

    const currentPath = window.location.pathname;

    const pageParentMap = {
        '/tournaments.html': '/versus.html', '/competitions.html': '/versus.html',
        '/custom-overlay-editor.html': '/custom-overlays.html',
        '/alert-queue.html': '/alerts.html',
        '/commands.html': '/chatbot.html',
        '/overlay-url-wizard.html': '/overlays.html',
        '/timer-url-wizard.html': '/timers-editor.html',
        '/music-url-wizard.html': '/music-editor.html',
        '/game-plan-url-wizard.html': '/game-plan-editor.html',
        '/milestone-url-wizard.html': '/analytics.html'
    };

    function isActive(href) {
        if (!href) return false;
        const cleanHref = href.split('?')[0].split('#')[0];
        const cleanCurrent = currentPath.split('?')[0].split('#')[0];
        if (cleanCurrent === cleanHref) return true;
        if (pageParentMap[cleanCurrent] === cleanHref) return true;
        const rootCurrent = cleanCurrent.replace(/^\/(?:system|tools|editors|wizards|library|overlays)\//, '/');
        if (rootCurrent === cleanHref) return true;
        if (pageParentMap[rootCurrent] === cleanHref) return true;
        return false;
    }

    // Curated order of groups for Command Palette default view and search relevance
    const groupOrder = [
        'Navigation',
        'Editors & Studios',
        'Stream Tools',
        'URL Wizards (OBS)',
        'System & Settings',
        'Overlays Hub',
        'Library & Analytics',
        'Reference'
    ];

    // Flatten all navigable items for Command Palette search
    function flattenItems() {
        const list = [];

        // 1. Navigation / Core
        list.push({ label: 'Dashboard', href: '/dashboard.html', group: 'Navigation' });

        // 2. Editors & Studios (interactive configuration & live controllers)
        list.push({ label: 'Credits Editor', href: '/credits-editor.html', group: 'Editors & Studios' });
        list.push({ label: 'Theme Editor', href: '/theme-editor.html', group: 'Editors & Studios' });
        list.push({ label: 'Choice Randomizer Studio', href: '/randomizer-editor.html', group: 'Editors & Studios' });
        list.push({ label: 'Timers Studio', href: '/timers-editor.html', group: 'Editors & Studios' });
        list.push({ label: 'Goals Manager', href: '/goals-editor.html', group: 'Editors & Studios' });
        list.push({ label: 'Game Plan Manager', href: '/game-plan-editor.html', group: 'Editors & Studios' });
        list.push({ label: 'Music Settings', href: '/music-editor.html', group: 'Editors & Studios', module: 'music' });
        list.push({ label: 'Overlay Assets', href: '/assets.html', group: 'Editors & Studios' });

        // 3. Stream Tools & Automation
        list.push({ label: 'Poll Studio', href: '/polls.html', group: 'Stream Tools' });
        list.push({ label: 'Versus Studio', href: '/versus.html', group: 'Stream Tools' });
        list.push({ label: 'Promo Creator', href: '/promo-creator.html', group: 'Stream Tools' });
        list.push({ label: 'Chat Bot', href: '/chatbot.html', group: 'Stream Tools', module: 'chatbot' });
        list.push({ label: 'Alerts & SFX', href: '/alerts.html', group: 'Stream Tools' });
        list.push({ label: 'Placeholders & Variables', href: '/placeholders.html', group: 'Stream Tools' });
        list.push({ label: 'Hashtag Tools', href: '/manage-hashtags.html', group: 'Stream Tools', module: 'hashtags' });
        list.push({ label: 'Chat Commands Cheat Sheet', href: '/commands.html', group: 'Stream Tools', module: 'chatbot' });
        list.push({ label: 'Alert Queue Monitor', href: '/alert-queue.html', group: 'Stream Tools' });

        // 4. URL Wizards (OBS Parameterized Source Generators)
        list.push({ label: 'Credits, Goals & Stats Wizard', href: '/overlay-url-wizard.html', group: 'URL Wizards (OBS)' });
        list.push({ label: 'Timers Wizard', href: '/timer-url-wizard.html', group: 'URL Wizards (OBS)' });
        list.push({ label: 'Music Wizard', href: '/music-url-wizard.html', group: 'URL Wizards (OBS)', module: 'music' });
        list.push({ label: 'Game Plan Wizard', href: '/game-plan-url-wizard.html', group: 'URL Wizards (OBS)' });
        list.push({ label: 'Milestones Wizard', href: '/milestone-url-wizard.html', group: 'URL Wizards (OBS)' });

        // 5. System & Settings
        list.push({ label: 'System Config', href: '/config-editor.html', group: 'System & Settings' });
        list.push({ label: 'Twitch Connect', href: '/twitch-connect.html', group: 'System & Settings' });
        list.push({ label: 'Backup & Restore', href: '/backup.html', group: 'System & Settings' });
        list.push({ label: 'System Update', href: '/update.html', group: 'System & Settings' });

        // 6. Overlays Hub
        list.push({ label: 'All Overlays (Gallery)', href: '/overlays.html', group: 'Overlays Hub' });
        list.push({ label: 'Custom Overlays', href: '/custom-overlays.html', group: 'Overlays Hub' });
        list.push({ label: 'New Custom Overlay Builder', href: '/custom-overlay-editor.html?new=1', group: 'Overlays Hub' });

        // 7. Library & Analytics
        list.push({ label: 'Analytics & Community', href: '/analytics.html', group: 'Library & Analytics' });
        list.push({ label: 'Milestones & Streaks', href: '/analytics.html#milestones', group: 'Library & Analytics' });
        list.push({ label: 'Chatters & Notes (Community CRM)', href: '/analytics.html#crm', group: 'Library & Analytics' });
        list.push({ label: 'Subscribers & Growth', href: '/analytics.html#growth', group: 'Library & Analytics' });
        list.push({ label: 'Sessions', href: '/sessions.html?session=__current__', group: 'Library & Analytics' });
        list.push({ label: 'Highlights', href: '/highlights.html', group: 'Library & Analytics' });
        list.push({ label: 'Clips', href: '/clips.html', group: 'Library & Analytics', module: 'clips' });
        list.push({ label: 'Categories', href: '/categories.html', group: 'Library & Analytics' });
        list.push({ label: 'Hashtag Stats', href: '/hashtag-stats.html', group: 'Library & Analytics', module: 'hashtags' });

        // 8. Documentation & API
        list.push({ label: 'Documentation', href: '/docs.html', group: 'Reference' });
        list.push({ label: 'API Reference', href: '/api.html', group: 'Reference' });

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

    function scoreItem(item, q) {
        const label = item.label.toLowerCase();
        const group = item.group.toLowerCase();
        const href = item.href.toLowerCase();

        // Exact match
        if (label === q) return 100;
        // Word begins with query
        if (label.startsWith(q)) return 90;
        // Query as distinct word
        if (label.includes(' ' + q)) return 85;
        // Substring inside label
        if (label.includes(q)) return 70;
        // Group match
        if (group.startsWith(q)) return 50;
        if (group.includes(q)) return 40;
        // Href match
        if (href.includes(q)) return 30;
        return 0;
    }

    function renderPaletteResults(query) {
        if (!paletteResults) return;

        const activeSearchItems = allSearchItems.filter(item => isModuleActive(item.module));

        let filtered = [];
        if (!query) {
            filtered = activeSearchItems;
        } else {
            const scored = [];
            for (const item of activeSearchItems) {
                const s = scoreItem(item, query);
                if (s > 0) {
                    scored.push({ item, score: s });
                }
            }

            // Group matched items by category
            const groupsMap = new Map();
            for (const { item, score } of scored) {
                if (!groupsMap.has(item.group)) {
                    groupsMap.set(item.group, { maxScore: score, items: [] });
                }
                const g = groupsMap.get(item.group);
                if (score > g.maxScore) g.maxScore = score;
                g.items.push({ item, score });
            }

            // Sort categories by highest match score, breaking ties with groupOrder
            const sortedGroups = [...groupsMap.entries()].sort((a, b) => {
                if (b[1].maxScore !== a[1].maxScore) return b[1].maxScore - a[1].maxScore;
                const ga = groupOrder.indexOf(a[0]);
                const gb = groupOrder.indexOf(b[0]);
                return (ga === -1 ? 99 : ga) - (gb === -1 ? 99 : gb);
            });

            // Within each category, sort items by score descending
            for (const [, g] of sortedGroups) {
                g.items.sort((a, b) => b.score - a.score);
                for (const it of g.items) {
                    filtered.push(it.item);
                }
            }
        }

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

    let lastStatusData = null;

    function renderNavStatusPills() {
        if (!lastStatusData) return;
        const data = lastStatusData;
        const isLive = !!data.viewers?.live;
        const viewers = data.viewers?.current || 0;
        const hasTwitch = !!data.twitch?.hasToken;
        const ssnConnected = !!data.ssn?.connected;
        const ssnHasSession = !!data.ssn?.session;

        const healthParts = [
            isLive ? `Stream: LIVE (${viewers.toLocaleString()} viewers)` : 'Stream: Offline',
            hasTwitch ? 'Twitch: Connected' : 'Twitch: Not connected',
            ssnConnected ? `SocialStream: Connected (${(data.ssn?.messages || 0).toLocaleString()} msgs)` : (ssnHasSession ? 'SocialStream: Disconnected' : 'SocialStream: Not configured')
        ];
        const healthSummary = healthParts.join(' · ') + ' — Click for Dashboard';

        const livePill = document.getElementById('nav-live-indicator');
        if (livePill) {
            livePill.style.display = 'inline-flex';
            if (isLive) {
                livePill.className = 'nav-status-pill live';
                livePill.querySelector('.label').textContent = `LIVE · ${viewers.toLocaleString()}`;
            } else {
                livePill.className = 'nav-status-pill';
                livePill.querySelector('.label').textContent = 'Offline';
            }
            livePill.title = healthSummary;
        }

        const twitchPill = document.getElementById('nav-twitch-indicator');
        if (twitchPill) {
            if (hasTwitch) {
                twitchPill.style.display = 'none';
            } else {
                twitchPill.style.display = 'inline-flex';
                twitchPill.className = 'nav-status-pill warn';
                twitchPill.querySelector('.label').textContent = 'Twitch Offline';
                twitchPill.title = 'Twitch is not connected — Click to connect';
            }
        }

        const ssnPill = document.getElementById('nav-ssn-indicator');
        if (ssnPill) {
            if (ssnConnected) {
                ssnPill.style.display = 'none';
            } else {
                ssnPill.style.display = 'inline-flex';
                ssnPill.className = 'nav-status-pill warn';
                ssnPill.querySelector('.label').textContent = ssnHasSession ? 'SocialStream Offline' : 'SocialStream Setup';
                ssnPill.title = ssnHasSession ? 'SocialStream disconnected — Click to configure' : 'SocialStream not configured — Click to configure';
            }
        }
    }

    function buildNav() {
        const container = document.getElementById('main-nav');
        if (!container) return;

        let html = '';
        for (const item of nav) {
            if (item.children) {
                // Filter items by module active state
                const visible = item.children.filter(c => c.heading || isModuleActive(c.module));

                // Clean up orphan headings (headings that have no visible items before next heading or end)
                const cleaned = [];
                for (let i = 0; i < visible.length; i++) {
                    const child = visible[i];
                    if (child.heading) {
                        let hasItem = false;
                        for (let j = i + 1; j < visible.length; j++) {
                            if (visible[j].heading) break;
                            hasItem = true;
                            break;
                        }
                        if (hasItem) cleaned.push(child);
                    } else {
                        cleaned.push(child);
                    }
                }

                if (!cleaned.some(c => !c.heading)) continue;

                const anyActive = cleaned.some(c => !c.heading && isActive(c.href));
                html += `<div class="dropdown">`;
                html += `<a href="#" class="dropdown-toggle${anyActive ? ' active' : ''}" role="button" aria-haspopup="true" aria-expanded="false">${item.label}</a>`;
                html += `<div class="dropdown-menu">`;
                for (const child of cleaned) {
                    if (child.heading) { html += `<div class="menu-heading">${child.heading}</div>`; continue; }
                    const active = isActive(child.href) ? ' class="active"' : '';
                    const target = child.target ? ` target="${child.target}" rel="noopener"` : '';
                    const ext = child.target === '_blank' ? `<span class="ext-icon" aria-hidden="true">↗</span>` : '';
                    html += `<a href="${child.href}"${target}${active}><span>${child.label}</span>${ext}</a>`;
                }
                html += `</div></div>`;
            } else {
                if (!isModuleActive(item.module)) continue;
                const active = isActive(item.href) ? ' class="active"' : '';
                html += `<a href="${item.href}"${active}>${item.label}</a>`;
            }
        }

        // Live stream & integration status indicators
        html += `<a href="/dashboard.html" id="nav-live-indicator" class="nav-status-pill" title="Stream status" style="display:none;"><span class="dot"></span><span class="label"></span></a>`;
        html += `<a href="/twitch-connect.html" id="nav-twitch-indicator" class="nav-status-pill twitch" title="Twitch connection status" style="display:none;"><span class="dot"></span><span class="label">Twitch</span></a>`;
        html += `<a href="/config-editor.html" id="nav-ssn-indicator" class="nav-status-pill" title="SocialStream connection status" style="display:none;"><span class="dot"></span><span class="label">SocialStream</span></a>`;

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

        // Theme toggle logic
        const toggle = document.getElementById('nav-theme-toggle');
        const ap = window.StreamPulseAppearance;
        if (toggle && ap) {
            const paint = () => { toggle.textContent = document.documentElement.dataset.theme === 'light' ? '🌙' : '☀️'; };
            toggle.addEventListener('click', event => { event.preventDefault(); ap.save({ mode: document.documentElement.dataset.theme === 'light' ? 'dark' : 'light' }); paint(); });
            paint();
        }

        renderNavStatusPills();
    }

    // Close dropdowns on outside click (registered once)
    document.addEventListener('click', event => {
        if (!event.target.closest('.nav .dropdown')) {
            document.querySelectorAll('.nav .dropdown.open').forEach(d => {
                d.classList.remove('open');
                d.querySelector('.dropdown-toggle')?.setAttribute('aria-expanded', 'false');
            });
        }
    });

    // Theme appearance sync (registered once)
    window.addEventListener('streampulse:appearance', () => {
        const toggle = document.getElementById('nav-theme-toggle');
        if (toggle) toggle.textContent = document.documentElement.dataset.theme === 'light' ? '🌙' : '☀️';
    });

    // Live stream & integration status indicators polling
    function updateNavStatus() {
        fetch('/api/status').then(r => r.json()).then(data => {
            lastStatusData = data;
            renderNavStatusPills();

            if (data.modules && typeof data.modules === 'object') {
                let changed = false;
                for (const [k, v] of Object.entries(data.modules)) {
                    if (moduleState[k] !== v) {
                        moduleState[k] = v;
                        changed = true;
                    }
                }
                if (changed) {
                    try { localStorage.setItem(MODULE_STORAGE_KEY, JSON.stringify(moduleState)); } catch (e) {}
                    buildNav();
                    if (paletteBackdrop?.classList.contains('open')) {
                        renderPaletteResults(paletteInput ? paletteInput.value.trim().toLowerCase() : '');
                    }
                }
            }
        }).catch(() => {});
    }

    // Instant update when Config Editor saves without page reload
    window.addEventListener('streampulse:config-saved', event => {
        if (event.detail && typeof event.detail === 'object') {
            let changed = false;
            if (event.detail.chatbot_enabled !== undefined && moduleState.chatbot !== (event.detail.chatbot_enabled !== false)) {
                moduleState.chatbot = event.detail.chatbot_enabled !== false;
                changed = true;
            }
            if (event.detail.hashtags_enabled !== undefined && moduleState.hashtags !== (event.detail.hashtags_enabled !== false)) {
                moduleState.hashtags = event.detail.hashtags_enabled !== false;
                changed = true;
            }
            if (event.detail.clip_candidates?.enabled !== undefined && moduleState.clips !== (event.detail.clip_candidates.enabled !== false)) {
                moduleState.clips = event.detail.clip_candidates.enabled !== false;
                changed = true;
            }
            if (event.detail.weather?.enabled !== undefined && moduleState.weather !== (event.detail.weather.enabled === true)) {
                moduleState.weather = event.detail.weather.enabled === true;
                changed = true;
            }
            if (event.detail.music?.enabled !== undefined && moduleState.music !== (event.detail.music.enabled === true)) {
                moduleState.music = event.detail.music.enabled === true;
                changed = true;
            }
            if (changed) {
                try { localStorage.setItem(MODULE_STORAGE_KEY, JSON.stringify(moduleState)); } catch (err) {}
                buildNav();
                if (paletteBackdrop?.classList.contains('open')) {
                    renderPaletteResults(paletteInput ? paletteInput.value.trim().toLowerCase() : '');
                }
            }
        }
        updateNavStatus();
    });

    // Multi-tab synchronization
    window.addEventListener('storage', event => {
        if (event.key === MODULE_STORAGE_KEY && event.newValue) {
            try {
                const parsed = JSON.parse(event.newValue);
                if (parsed && typeof parsed === 'object') {
                    moduleState = Object.assign(moduleState, parsed);
                    buildNav();
                    if (paletteBackdrop?.classList.contains('open')) {
                        renderPaletteResults(paletteInput ? paletteInput.value.trim().toLowerCase() : '');
                    }
                }
            } catch (err) {}
        }
    });

    setInterval(() => { if (!document.hidden) updateNavStatus(); }, 15000);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => { buildNav(); initCommandPalette(); updateNavStatus(); });
    } else {
        buildNav();
        initCommandPalette();
        updateNavStatus();
    }
})();

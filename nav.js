// Shared navigation component — edit here to update all pages
(function() {
    // Inject nav active styles once
    const style = document.createElement('style');
    style.textContent = `
        .nav { display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap; }
        .nav a { color: var(--text-muted); text-decoration: none; font-size: 0.85rem; padding: 0.4rem 0.8rem; border-radius: 6px; transition: all 0.2s; }
        .nav a:hover { color: var(--text); background: var(--bg-raised); }
        .nav .dropdown { position: relative; display: flex; align-items: center; }
        .nav .dropdown-toggle { color: var(--text-muted); text-decoration: none; font-size: 0.85rem; padding: 0.4rem 0.8rem; border-radius: 6px; transition: all 0.2s; cursor: pointer; display: block; }
        .nav .dropdown-toggle:hover { color: var(--text); background: var(--bg-raised); }
        .nav .dropdown-menu { display: none; position: absolute; top: 100%; right: 0; background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px; padding: 0.4rem 0; min-width: 200px; max-height: 80vh; overflow-y: auto; z-index: 50; box-shadow: 0 8px 24px rgba(0,0,0,0.4); }
        .nav .dropdown::after { content: ''; position: absolute; top: 100%; left: 0; right: 0; height: 8px; }
        .nav .dropdown:hover .dropdown-menu { display: block; }
        .nav .dropdown-menu a { display: block; padding: 0.5rem 1rem; color: var(--text-muted); text-decoration: none; font-size: 0.85rem; transition: all 0.15s; }
        .nav .dropdown-menu a:hover { color: var(--text); background: var(--bg-raised); }
        .nav .menu-heading { padding: 0.55rem 1rem 0.2rem; margin-top: 0.25rem; border-top: 1px solid var(--bg-raised); color: var(--text-faint); font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.06em; }
        .nav a.active, .nav .dropdown-toggle.active { color: var(--text) !important; background: var(--bg-raised); }
        .nav .dropdown-menu a.active { color: var(--accent) !important; background: var(--bg-card); }
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
            { label: 'Music', href: '/music-url-wizard.html' }
        ]},
        { label: 'Library ▾', children: [
            { label: 'Highlights', href: '/highlights.html' },
            { label: 'Clips (Beta)', href: '/clips.html' },
            { label: 'Sessions', href: '/sessions.html?session=__current__' },
            { label: 'Categories', href: '/categories.html' },
            { label: 'Analytics & Subscribers', href: '/analytics.html' },
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
            { label: 'Music Settings (Beta)', href: '/music-editor.html' },
            { label: 'Hashtag Tools', href: '/manage-hashtags.html' },
            { heading: 'System' },
            { label: 'Config', href: '/config-editor.html' },
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

    function buildNav() {
        const container = document.getElementById('main-nav');
        if (!container) return;

        let html = '';
        for (const item of nav) {
            if (item.children) {
                                const anyActive = item.children.some(c => !c.heading && isActive(c.href));
                html += `<div class="dropdown">`;
                html += `<a href="#" class="dropdown-toggle${anyActive ? ' active' : ''}">${item.label}</a>`;
                html += `<div class="dropdown-menu">`;
                for (const child of item.children) {
                    if (child.heading) { html += `<div class="menu-heading">${child.heading}</div>`; continue; }
                    const active = isActive(child.href) ? ' class="active"' : '';
                    const target = child.target ? ` target="${child.target}"` : '';
                    html += `<a href="${child.href}"${target}${active}>${child.label}</a>`;
                }
                html += `</div></div>`;
            } else {
                const active = isActive(item.href) ? ' class="active"' : '';
                html += `<a href="${item.href}"${active}>${item.label}</a>`;
            }
        }
        html += `<a href="#" id="nav-theme-toggle" title="Switch light / dark" style="padding:0.4rem 0.6rem;"></a>`;
        container.innerHTML = html;
        const toggle = document.getElementById('nav-theme-toggle');
        const ap = window.StreamPulseAppearance;
        if (toggle && ap) {
            const paint = () => { toggle.textContent = document.documentElement.dataset.theme === 'light' ? '🌙' : '☀️'; };
            toggle.addEventListener('click', event => { event.preventDefault(); ap.save({ mode: document.documentElement.dataset.theme === 'light' ? 'dark' : 'light' }); paint(); });
            window.addEventListener('streampulse:appearance', paint);
            paint();
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', buildNav);
    } else {
        buildNav();
    }
})();

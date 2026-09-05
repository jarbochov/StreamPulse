// Shared navigation component — edit here to update all pages
(function() {
    // Inject nav active styles once
    const style = document.createElement('style');
    style.textContent = `
        .nav { display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap; }
        .nav a { color: #8b949e; text-decoration: none; font-size: 0.85rem; padding: 0.4rem 0.8rem; border-radius: 6px; transition: all 0.2s; }
        .nav a:hover { color: #e1e4e8; background: #21262d; }
        .nav .dropdown { position: relative; display: flex; align-items: center; }
        .nav .dropdown-toggle { color: #8b949e; text-decoration: none; font-size: 0.85rem; padding: 0.4rem 0.8rem; border-radius: 6px; transition: all 0.2s; cursor: pointer; display: block; }
        .nav .dropdown-toggle:hover { color: #e1e4e8; background: #21262d; }
        .nav .dropdown-menu { display: none; position: absolute; top: 100%; right: 0; background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 0.4rem 0; min-width: 180px; z-index: 50; box-shadow: 0 8px 24px rgba(0,0,0,0.4); }
        .nav .dropdown::after { content: ''; position: absolute; top: 100%; left: 0; right: 0; height: 8px; }
        .nav .dropdown:hover .dropdown-menu { display: block; }
        .nav .dropdown-menu a { display: block; padding: 0.5rem 1rem; color: #8b949e; text-decoration: none; font-size: 0.85rem; transition: all 0.15s; }
        .nav .dropdown-menu a:hover { color: #e1e4e8; background: #21262d; }
        .nav a.active, .nav .dropdown-toggle.active { color: #e1e4e8 !important; background: #21262d; }
        .nav .dropdown-menu a.active { color: #58a6ff !important; background: #161b22; }
    `;
    document.head.appendChild(style);

    const nav = [
        { label: 'Dashboard', href: '/dashboard.html' },
        { label: 'Overlays ▾', children: [
            { label: 'Credits', href: '/credits.html' },
            { label: 'Credits Preview', href: '/credits.html?preview=true', target: '_blank' },
            { label: 'Stats', href: '/stats.html' },
            { label: 'Hashtags', href: '/hashtags.html' },
            { label: 'Viewer Count', href: '/viewers.html', target: '_blank' },
            { label: 'Goal', href: '/goal.html', target: '_blank' },
            { label: 'Goals Cycle', href: '/goal.html?mode=cycle', target: '_blank' },
            { label: 'Music — Full', href: '/music.html?mode=full', target: '_blank' },
            { label: 'Music — Art Only', href: '/music.html?mode=art', target: '_blank' },
            { label: 'Music — Mini Bar', href: '/music.html?mode=mini', target: '_blank' },
            { label: 'Countdown', href: '/countdown.html', target: '_blank' },
            { label: 'Stopwatch', href: '/stopwatch.html', target: '_blank' }
        ]},
        { label: 'Library ▾', children: [
            { label: 'Highlights', href: '/highlights.html' },
            { label: 'Sessions', href: '/sessions.html' },
            { label: 'Categories', href: '/categories.html' },
            { label: 'Analytics & Subscribers', href: '/analytics.html' },
            { label: 'Hashtag Stats', href: '/hashtag-stats.html' }
        ]},
        { label: 'Music (Beta) ▾', children: [
            { label: 'Settings', href: '/music-editor.html' },
            { label: 'URL Wizard', href: '/music-url-wizard.html' }
        ]},
        { label: 'Timers ▾', children: [
            { label: 'Manager', href: '/timers-editor.html' },
            { label: 'URL Wizard', href: '/timer-url-wizard.html' }
        ]},
        { label: 'Manage ▾', children: [
            { label: 'Config', href: '/config-editor.html' },
            { label: 'Theme', href: '/theme-editor.html' },
            { label: 'Goals', href: '/goals-editor.html' },
            { label: 'Hashtag Tools', href: '/manage-hashtags.html' },
            { label: 'Update', href: '/update.html' },
            { label: 'Backup & Restore', href: '/backup.html' }
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
                const label = item.label.replace(' ▾', '');
                const anyActive = item.children.some(c => isActive(c.href));
                html += `<div class="dropdown">`;
                html += `<a href="#" class="dropdown-toggle${anyActive ? ' active' : ''}">${item.label}</a>`;
                html += `<div class="dropdown-menu">`;
                for (const child of item.children) {
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
        container.innerHTML = html;
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', buildNav);
    } else {
        buildNav();
    }
})();

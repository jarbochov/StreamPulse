// Shared navigation component — edit here to update all pages
(function() {
    // Inject nav active styles once
    const style = document.createElement('style');
    style.textContent = '.nav a.active, .nav .dropdown-toggle.active { color: #e1e4e8 !important; background: #21262d; } .nav .dropdown-menu a.active { color: #58a6ff !important; background: #161b22; }';
    document.head.appendChild(style);

    const nav = [
        { label: 'Dashboard', href: '/dashboard.html' },
        { label: 'Highlights', href: '/highlights.html' },
        { label: 'Sessions', href: '/sessions.html' },
        { label: 'Categories', href: '/categories.html' },
        { label: 'Overlays ▾', children: [
            { label: 'Credits', href: '/credits.html' },
            { label: 'Credits Preview', href: '/credits.html?preview=true', target: '_blank' },
            { label: 'Stats', href: '/stats.html' },
            { label: 'Hashtags', href: '/hashtags.html' }
        ]},
        { label: 'Music ▾', children: [
            { label: 'Settings', href: '/music-editor.html' },
            { label: 'Full Player', href: '/music.html?mode=full', target: '_blank' },
            { label: 'Art Only', href: '/music.html?mode=art', target: '_blank' },
            { label: 'Mini Bar', href: '/music.html?mode=mini', target: '_blank' }
        ]},
        { label: 'Manage ▾', children: [
            { label: 'Config', href: '/config-editor.html' },
            { label: 'Hashtag Tools', href: '/manage-hashtags.html' },
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

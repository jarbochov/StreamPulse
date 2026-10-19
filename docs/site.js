(function () {
  'use strict';
  const technical = new Set(['technical-reference', 'architecture', 'api-reference', 'developer-guide', 'server-management', 'desktop-app']);
  const streamer = new Set(['streamer-guide', 'quickstart', 'socialstream-setup', 'companion', 'troubleshooting']);
  const escapeHtml = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const guides = [
    '/', '/features', '/streamer-guide', '/quickstart', '/socialstream-setup', '/companion',
    '/custom-overlays', '/overlay-wizards', '/credits-guide', '/randomizer-guide',
    '/game-plan-guide', '/community-guide', '/alerts-guide', '/chatbot-guide', '/clips-beta',
    '/technical-reference', '/desktop-app', '/architecture', '/api-reference', '/developer-guide',
    '/server-management', '/troubleshooting', '/changelog'
  ];
  window.$docsify = {
    name: 'StreamPulse',
    coverpage: true,
    loadSidebar: true,
    subMaxLevel: 1,
    auto2top: true,
    notFoundPage: '_not-found.md',
    search: {
      maxAge: 3600000,
      paths: guides,
      placeholder: 'Search all guides',
      noData: 'No guides found. Try a feature name.',
      depth: 3
    },
    tabs: { persist: true, sync: true, theme: 'classic' },
    markdown: {
      renderer: {
        code: function (code, lang) {
          if (lang !== 'mermaid' || !window.pele) return this.origin.code.apply(this, arguments);
          try {
            return '<div class="mermaid-diagram">' + window.pele.render(code, { responsive: true, autoDirection: true }).svg + '</div>';
          } catch (error) {
            console.warn('Diagram could not be rendered:', error.message);
            return '<pre><code>' + escapeHtml(code) + '</code></pre>';
          }
        }
      }
    },
    plugins: [
      function (hook, vm) {
        hook.afterEach(function (html) {
          const page = vm.route.path.replace(/^\//, '').replace(/\.md$/, '');
          const label = technical.has(page) ? 'Technical reference' : streamer.has(page) ? 'Streamer guides' : page === 'features' ? 'Feature overview' : '';
          const context = label ? '<div class="page-context">' + label + '</div>' : '';
          return context + html + '<footer class="page-footer"><span>StreamPulse &middot; Independent, open-source broadcast tools</span><span><a href="#/changelog">Release notes</a> &middot; <a href="https://github.com/jarbochov/StreamPulse/issues" target="_blank" rel="noopener noreferrer">Report an issue</a> &middot; <a href="https://ko-fi.com/jarbochov" target="_blank" rel="noopener noreferrer">Support the project</a></span></footer>';
        });
        hook.doneEach(function () {
          if (window.matchMedia('(max-width: 768px)').matches) document.body.classList.remove('close');
          const article = document.querySelector('.markdown-section');
          if (article) {
            article.id = 'main-content';
            article.tabIndex = -1;
            article.setAttribute('aria-label', 'Documentation');
          }
          const title = article?.querySelector('h1')?.textContent || 'Guides';
          document.title = title + ' | StreamPulse';
          const page = vm.route.path.replace(/^\//, '').replace(/\.md$/, '');
          const section = technical.has(page) ? 'technical' : streamer.has(page) ? 'streamer' : page === 'features' ? 'features' : '';
          document.querySelectorAll('[data-section]').forEach(link => {
            if (link.dataset.section === section) link.setAttribute('aria-current', 'page');
            else link.removeAttribute('aria-current');
          });
          document.querySelectorAll('.markdown-section img').forEach(image => {
            image.loading = 'lazy';
            image.decoding = 'async';
          });
          const search = document.querySelector('.search input');
          if (search) search.setAttribute('aria-label', 'Search all documentation');
          const sidebar = document.querySelector('.sidebar');
          if (sidebar) { sidebar.setAttribute('aria-label', 'Documentation navigation'); sidebar.id = 'docs-navigation'; }
          const toggle = document.querySelector('.sidebar-toggle');
          if (toggle) {
            const header = document.querySelector('.site-header');
            if (header && toggle.parentElement !== header) header.appendChild(toggle);
            toggle.setAttribute('aria-label', 'Toggle documentation navigation');
            toggle.setAttribute('aria-controls', 'docs-navigation');
            toggle.setAttribute('aria-expanded', String(document.body.classList.contains('close')));
            if (!toggle.dataset.bound) {
              toggle.dataset.bound = 'true';
              toggle.addEventListener('click', () => requestAnimationFrame(() =>
                toggle.setAttribute('aria-expanded', String(document.body.classList.contains('close')))));
            }
          }
        });
      }
    ]
  };
  document.querySelector('.skip-link').addEventListener('click', event => {
    const content = document.getElementById('main-content');
    if (content) { event.preventDefault(); content.focus(); content.scrollIntoView(); }
  });
})();

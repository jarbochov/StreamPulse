(function () {
  'use strict';
  const legacy = new Set(['technical-reference', 'architecture', 'api-reference', 'developer-guide', 'server-management']);
  const escapeHtml = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pages = [
    '/', '/features', '/showcase', '/support', '/quickstart', '/socialstream-setup', '/companion',
    '/custom-overlays', '/overlay-wizards', '/credits-guide', '/randomizer-guide',
    '/game-plan-guide', '/community-guide', '/alerts-guide', '/chatbot-guide', '/clips-beta',
    '/polls-guide', '/promo-creator', '/desktop-app', '/streamer-guide', '/troubleshooting', '/changelog'
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
      namespace: 'streampulse-showcase',
      paths: pages,
      placeholder: 'Find a feature',
      noData: 'No matches. Try overlays, polls, or credits.',
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
          const context = legacy.has(page) ? '<aside class="legacy-notice" aria-label="Legacy reference">This page is kept for older links and may not match your installed version. Open <strong>Docs</strong> or <strong>API Reference</strong> in StreamPulse for instructions. <a href="#/features">Explore what you can create</a>.</aside>' : '';
          return context + html + '<footer class="page-footer"><span>StreamPulse &middot; Independent, open-source broadcast tools</span><span><a href="#/changelog">Changelog</a> &middot; <a href="#/support">Support</a> &middot; <a href="https://ko-fi.com/jarbochov" target="_blank" rel="noopener noreferrer">Support the project</a></span></footer>';
        });
        hook.doneEach(function () {
          if (window.matchMedia('(max-width: 768px)').matches) document.body.classList.remove('close');
          const article = document.querySelector('.markdown-section');
          if (article) {
            article.id = 'main-content';
            article.tabIndex = -1;
            article.setAttribute('aria-label', 'StreamPulse features and project information');
          }
          const title = article?.querySelector('h1')?.textContent || 'Your stream, thoughtfully connected';
          document.title = title + ' | StreamPulse';
          const page = vm.route.path.replace(/^\//, '').replace(/\.md$/, '');
          const section = page === 'quickstart' || page === 'desktop-app' ? 'download' : page === 'showcase' ? 'showcase' : page === 'support' || page === 'troubleshooting' ? 'support' : page === 'changelog' ? 'changelog' : page && !legacy.has(page) ? 'features' : '';
          document.querySelectorAll('[data-section]').forEach(link => {
            if (link.dataset.section === section) link.setAttribute('aria-current', 'page');
            else link.removeAttribute('aria-current');
          });
          document.querySelectorAll('.markdown-section img').forEach(image => {
            image.loading = 'lazy';
            image.decoding = 'async';
          });
          const search = document.querySelector('.search input');
          if (search) search.setAttribute('aria-label', 'Find a StreamPulse feature');
          const sidebar = document.querySelector('.sidebar');
          if (sidebar) { sidebar.setAttribute('aria-label', 'StreamPulse website navigation'); sidebar.id = 'site-navigation'; }
          const toggle = document.querySelector('.sidebar-toggle');
          if (toggle) {
            const header = document.querySelector('.site-header');
            if (header && toggle.parentElement !== header) header.appendChild(toggle);
            toggle.setAttribute('aria-label', 'Toggle website navigation');
            toggle.setAttribute('aria-controls', 'site-navigation');
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

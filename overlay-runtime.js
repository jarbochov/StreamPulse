(function() {
    const params = new URLSearchParams(location.search);
    const overlayId = params.get('id');
    const root = document.getElementById('overlay-root');
    if (!overlayId || !root) return;

    function escapeHtml(value) {
        return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function renderMarkdown(source) {
        const expanded = String(source || '').replace(/\{\{overlay\.name\}\}/g, document.title);
        const html = window.marked.parse(expanded, { breaks: true });
        return window.DOMPurify.sanitize(html, {
            ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'del', 'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'a', 'h1', 'h2', 'h3', 'img'],
            ALLOWED_ATTR: ['href', 'title', 'target', 'rel', 'src', 'alt']
        });
    }

    function applyElementStyle(node, element) {
        const style = element.style || {};
        Object.assign(node.style, {
            left: `${element.x || 0}px`,
            top: `${element.y || 0}px`,
            width: `${element.width || 400}px`,
            height: `${element.height || 100}px`,
            zIndex: element.zIndex || 0,
            opacity: style.opacity ?? 1,
            background: style.background || 'transparent',
            border: `${style.borderWidth || 0}px solid ${style.borderColor || 'transparent'}`,
            borderRadius: `${style.borderRadius || 0}px`,
            fontFamily: style.fontFamily || 'sans-serif',
            fontSize: `${style.fontSize || 32}px`,
            fontWeight: style.fontWeight || '400',
            color: style.color || '#fff',
            textAlign: style.textAlign || 'left'
        });
    }

    function render(overlay) {
        document.title = `StreamPulse — ${overlay.name}`;
        root.style.width = `${overlay.canvas.width}px`;
        root.style.height = `${overlay.canvas.height}px`;
        root.style.background = overlay.canvas.background || 'transparent';
        root.replaceChildren();
        for (const element of (overlay.elements || []).filter(item => item.visible !== false)) {
            const node = document.createElement('div');
            node.className = `overlay-element overlay-${element.type}`;
            applyElementStyle(node, element);
            if (element.type === 'image' || element.type === 'video') {
                const media = document.createElement(element.type);
                media.src = element.src || '';
                media.autoplay = element.type === 'video';
                media.loop = element.type === 'video';
                media.muted = element.type === 'video';
                media.playsInline = true;
                media.draggable = false;
                media.style.width = '100%';
                media.style.height = '100%';
                media.style.objectFit = element.style?.objectFit || 'cover';
                node.appendChild(media);
            } else if (element.type === 'embed') {
                const frame = document.createElement('iframe');
                frame.src = element.src || 'about:blank';
                frame.sandbox = 'allow-forms allow-popups allow-scripts';
                frame.referrerPolicy = 'no-referrer';
                frame.style.cssText = 'width:100%;height:100%;border:0;';
                node.appendChild(frame);
            } else if (element.type === 'markdown') {
                node.innerHTML = renderMarkdown(element.content);
            } else if (element.type === 'random-text') {
                const items = Array.isArray(element.items) ? element.items : [];
                node.textContent = items.length ? items[Math.floor(Math.random() * items.length)] : element.content || '';
            } else if (element.type === 'shape') {
                node.setAttribute('aria-hidden', 'true');
            } else {
                node.textContent = element.content || '';
            }
            root.appendChild(node);
        }
    }

    async function load() {
        const response = await fetch(`/api/custom-overlays/${encodeURIComponent(overlayId)}`, { cache: 'no-store' });
        if (!response.ok) throw new Error('Overlay not found');
        render(await response.json());
    }

    function connect() {
        const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        const socket = new WebSocket(`${protocol}//${location.host}`);
        socket.addEventListener('message', event => {
            try {
                const message = JSON.parse(event.data);
                if (message.type === 'custom-overlay-update' && message.data?.id === overlayId) {
                    if (message.data.overlay) render(message.data.overlay);
                    else root.replaceChildren();
                }
            } catch {}
        });
        socket.addEventListener('close', () => setTimeout(connect, 2000));
    }

    load().catch(error => {
        root.textContent = error.message;
        root.style.color = '#f85149';
    });
    connect();
})();

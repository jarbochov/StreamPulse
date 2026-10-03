(function() {
    const params = new URLSearchParams(location.search);
    const overlayId = params.get('id');
    const root = document.getElementById('overlay-root');
    if (!overlayId || !root) return;
    let liveStatus = {};
    const randomTimers = new Map();
    const randomIndexes = new Map();
    let currentOverlay = null;
    const shared = window.OverlayShared;
    const loadGoogleFont = shared.loadGoogleFont;

    function stopRandomTimers() {
        for (const timer of randomTimers.values()) clearInterval(timer);
        randomTimers.clear();
    }

    function setRandomText(node, element) {
        const pool = shared.elementItems(element);
        const items = pool.length ? pool : [element.content || ''];
        const config = element.random || {};
        let index = randomIndexes.get(element.id) || 0;
        const value = expandVariables(config.mode === 'order' ? items[index % items.length] : items[Math.floor(Math.random() * items.length)]);
        randomIndexes.set(element.id, config.mode === 'order' ? index + 1 : index);
        if (config.typewriter) {
            node.classList.add('overlay-typewriter');
            const typed = document.createElement('span');
            typed.className = 'overlay-caret';
            node.replaceChildren(typed);
            let position = 0;
            const speed = Math.max(10, Number(config.typewriterSpeed) || 110);
            const typeTimer = setInterval(() => {
                typed.textContent = value.slice(0, ++position);
                if (position >= value.length) clearInterval(typeTimer);
            }, speed);
        } else {
            node.classList.remove('overlay-typewriter');
            node.textContent = value;
        }
        if (config.marquee) {
            node.classList.add('overlay-marquee');
            node.style.setProperty('--marquee-duration', `${Math.max(10, Number(config.marqueeSpeed) || 60)}s`);
        } else {
            node.classList.remove('overlay-marquee');
        }
    }

    function variableContext() {
        return { overlayName: liveStatus.overlayName };
    }

    function expandVariables(value) {
        return shared.expandVariables(value, liveStatus, variableContext());
    }

    function renderMarkdown(source) {
        return shared.renderMarkdown(expandVariables(source));
    }

    function applyElementStyle(node, element) {
        const style = element.style || {};
        loadGoogleFont(style.fontFamily);
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
            textAlign: style.textAlign || 'left',
            lineHeight: style.lineHeight || 1.2,
            letterSpacing: `${style.letterSpacing || 0}px`,
            display: style.verticalAlign === 'top' ? 'block' : 'flex',
            alignItems: style.verticalAlign === 'middle' ? 'center' : style.verticalAlign === 'bottom' ? 'flex-end' : 'flex-start',
            justifyContent: style.textAlign === 'center' ? 'center' : style.textAlign === 'right' ? 'flex-end' : 'flex-start'
        });
        Object.assign(node.style, shared.decorationStyle(style, element.type));
        if (element.type === 'game-list') node.style.display = 'block';
        if (element.type === 'shape') {
            if (style.shape === 'circle') node.style.borderRadius = '50%';
            if (style.shape === 'pill') node.style.borderRadius = '999px';
            if (style.shape === 'line') { node.style.height = `${Math.max(1, style.borderWidth || 4)}px`; node.style.border = '0'; }
        }
    }

    const tickingNodes = [];
    const alertNodes = [];
    const activeAlerts = [];

    function showAlert(payload) {
        for (const { node, element } of alertNodes) {
            const only = element.alert?.triggers || [];
            if (only.length && !only.includes(payload.trigger)) continue;
            activeAlerts.push(shared.playAlert(node, element, payload));
        }
    }

    function stopAlerts() {
        activeAlerts.splice(0).forEach(handle => handle.stop());
    }

    function tickPlaceholders() {
        for (const { node, element } of tickingNodes) {
            if (element.type === 'progress') shared.renderProgress(node, element, expandVariables);
            else if (element.type === 'markdown') node.innerHTML = renderMarkdown(shared.elementContent(element));
            else node.textContent = expandVariables(shared.elementContent(element) || '');
            if (element.textFit && element.textFit !== 'none') shared.fitText(node, element);
        }
    }

    const fitNodes = [];
    function refit() {
        for (const { node, element } of fitNodes) {
            const probe = element.type === 'random-text' ? shared.elementItems(element).map(expandVariables).reduce((a, b) => (b.length > a.length ? b : a), '') : null;
            shared.fitText(node, element, probe);
        }
    }
    if (document.fonts) document.fonts.addEventListener('loadingdone', () => refit());

    function render(overlay) {
        fitNodes.length = 0;
        currentOverlay = overlay;
        stopRandomTimers();
        stopAlerts();
        tickingNodes.length = 0;
        alertNodes.length = 0;
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
                const media = document.createElement(element.type === 'image' ? 'img' : 'video');
                media.src = expandVariables(element.src || '');
                media.autoplay = element.type === 'video';
                media.loop = element.type === 'video';
                media.muted = element.type === 'video';
                media.playsInline = true;
                media.draggable = false;
                media.style.width = '100%';
                media.style.height = '100%';
                media.style.objectFit = element.style?.objectFit || 'cover';
                node.appendChild(media);
            } else if (element.type === 'qr') {
                const img = document.createElement('img');
                img.src = shared.qrUrl(expandVariables(element.src || ''), element.qr);
                img.draggable = false;
                img.style.cssText = 'width:100%;height:100%;object-fit:contain;display:block;';
                node.appendChild(img);
            } else if (element.type === 'embed') {
                const frame = document.createElement('iframe');
                frame.src = expandVariables(element.src || '') || 'about:blank';
                frame.sandbox = 'allow-forms allow-popups allow-scripts';
                frame.referrerPolicy = 'no-referrer';
                frame.style.cssText = 'width:100%;height:100%;border:0;';
                node.appendChild(frame);
            } else if (element.type === 'markdown') {
                node.innerHTML = renderMarkdown(shared.elementContent(element));
            } else if (element.type === 'random-text') {
                setRandomText(node, element);
                const interval = Math.max(1, Number(element.random?.intervalSeconds) || 5) * 1000;
                randomTimers.set(element.id, setInterval(() => setRandomText(node, element), interval));
            } else if (element.type === 'game-list') {
                shared.renderGameList(node, element, liveStatus.gamePlan);
            } else if (element.type === 'progress') {
                shared.renderProgress(node, element, expandVariables);
            } else if (element.type === 'alert') {
                shared.prepareAlertNode(node);
                alertNodes.push({ node, element });
            } else if (element.type === 'shape') {
                node.setAttribute('aria-hidden', 'true');
            } else {
                node.textContent = expandVariables(shared.elementContent(element) || '');
            }
            const tickSource = element.type === 'progress' ? `${element.content} ${element.progress?.label}` : shared.elementContent(element);
            if (['text', 'markdown', 'progress'].includes(element.type) && shared.hasTicking(tickSource)) tickingNodes.push({ node, element });
            root.appendChild(node);
            if (element.textFit && element.textFit !== 'none') fitNodes.push({ node, element });
        }
        refit();
    }

    async function load() {
        const response = await fetch(`/api/custom-overlays/${encodeURIComponent(overlayId)}`, { cache: 'no-store' });
        if (!response.ok) throw new Error('Overlay not found');
        const overlay = await response.json();
        liveStatus.overlayName = overlay.name;
        await shared.loadAssetFonts();
        try {
            const statusResponse = await fetch('/api/status', { cache: 'no-store' });
            if (statusResponse.ok) liveStatus = { ...liveStatus, ...(await statusResponse.json()) };
        } catch {}
        await shared.loadLiveExtras(liveStatus);
        await shared.refreshTextSources(overlay.elements);
        render(overlay);
        return overlay;
    }

    async function refreshStatus() {
        try {
            const response = await fetch('/api/status', { cache: 'no-store' });
            if (!response.ok) return;
            const before = shared.variableSnapshot(liveStatus, variableContext());
            liveStatus = { ...liveStatus, ...(await response.json()) };
            await shared.loadLiveExtras(liveStatus);
            // Re-rendering restarts typewriters, videos and embeds, so only do it when a placeholder value changed.
            if (currentOverlay && shared.variableSnapshot(liveStatus, variableContext()) !== before) render(currentOverlay);
        } catch {}
    }

    function connect() {
        const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        const socket = new WebSocket(`${protocol}//${location.host}`);
        socket.addEventListener('message', event => {
            try {
                const message = JSON.parse(event.data);
                if (message.type === 'alert') showAlert(message.data);
                else if (message.type === 'alert-skip' || message.type === 'alert-clear') stopAlerts();
                else if (message.type === 'custom-overlay-update' && message.data?.id === overlayId) {
                    if (message.data.overlay) {
                        liveStatus.overlayName = message.data.overlay.name;
                        shared.refreshTextSources(message.data.overlay.elements).finally(() => render(message.data.overlay));
                    }
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
    setInterval(async () => {
        if (currentOverlay && await shared.refreshTextSources(currentOverlay.elements)) render(currentOverlay);
    }, 3000);
    setInterval(refreshStatus, 5000);
    setInterval(tickPlaceholders, 1000);
    connect();
})();

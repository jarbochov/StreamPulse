import { elementContent } from './text.js';

function resolveCycleLines(element, expand) {
    const raw = elementContent(element) || '';
    const skipEmpty = element.cycle?.skipEmpty !== false;
    const lines = String(raw).split(/\r?\n/).map(line => expand(line));
    return skipEmpty ? lines.filter(line => line.trim() !== '') : lines;
}

function cycleConfigKey(element) {
    const cfg = element.cycle || {};
    return JSON.stringify([
        cfg.enabled !== false,
        Math.max(1, Number(cfg.intervalSeconds) || 5),
        cfg.transition || 'fade',
        Math.max(50, Math.min(2000, Number(cfg.durationMs) || 350)),
        cfg.skipEmpty !== false
    ]);
}

function makeLayer(text) {
    const span = document.createElement('span');
    span.className = 'sp-cycle-layer';
    span.style.gridArea = '1 / 1';
    span.style.width = '100%';
    span.style.whiteSpace = 'pre-wrap';
    span.style.wordBreak = 'break-word';
    span.textContent = text;
    return span;
}

/**
 * Mounts a line-by-line rotating text stage inside `node` with true simultaneous transitions.
 * Works identically in both live overlays and the editor canvas, and cleans up via `cleanupNode`.
 */
function mountTextCycle(node, element, opts = {}) {
    if (node._cycleHandle?.stop) {
        try { node._cycleHandle.stop(); } catch {}
    }

    const expand = typeof opts.expand === 'function' ? opts.expand : (v => String(v ?? ''));
    const getIndex = typeof opts.getIndex === 'function' ? opts.getIndex : null;
    const setIndex = typeof opts.setIndex === 'function' ? opts.setIndex : null;

    let currentEl = element;
    let configSig = cycleConfigKey(currentEl);
    let stopped = false;
    let timer = null;
    const cleanupTimers = new Set();

    const stage = document.createElement('span');
    stage.className = 'sp-cycle-stage';
    stage.style.display = 'grid';
    stage.style.width = '100%';
    stage.style.alignItems = 'inherit';
    stage.style.justifyItems = 'inherit';

    let lines = resolveCycleLines(currentEl, expand);
    let idx = lines.length ? ((getIndex ? getIndex(currentEl.id) : 0) || 0) % lines.length : 0;
    let activeLayer = makeLayer(lines.length ? lines[idx] : '');
    stage.appendChild(activeLayer);
    node.replaceChildren(stage);
    node._textNode = null;

    const scheduleTimeout = (fn, ms) => {
        const id = setTimeout(() => {
            cleanupTimers.delete(id);
            if (!stopped) fn();
        }, ms);
        cleanupTimers.add(id);
        return id;
    };

    const clearCleanupTimers = () => {
        for (const id of cleanupTimers) clearTimeout(id);
        cleanupTimers.clear();
    };

    const transitionTo = nextText => {
        const cfg = currentEl.cycle || {};
        const method = cfg.transition || 'fade';
        const dur = Math.max(50, Math.min(2000, Number(cfg.durationMs) || 350));

        if (method === 'none') {
            if (activeLayer.textContent !== nextText) activeLayer.textContent = nextText;
            return;
        }

        // Remove any lingering older layers from overlapping transitions before starting a new one.
        for (const child of [...stage.children]) {
            if (child !== activeLayer) child.remove();
        }

        const outgoing = activeLayer;
        const incoming = makeLayer(nextText);

        incoming.style.opacity = '0';
        if (method === 'slide-up') incoming.style.transform = 'translateY(8px)';
        else if (method === 'flip') incoming.style.transform = 'perspective(400px) rotateX(-60deg)';
        stage.appendChild(incoming);
        void incoming.offsetWidth;

        const transitionCss = `opacity ${dur}ms ease, transform ${dur}ms ease`;
        outgoing.style.transition = transitionCss;
        outgoing.style.opacity = '0';
        if (method === 'slide-up') outgoing.style.transform = 'translateY(-8px)';
        else if (method === 'flip') outgoing.style.transform = 'perspective(400px) rotateX(60deg)';

        incoming.style.transition = transitionCss;
        incoming.style.opacity = '1';
        incoming.style.transform = method === 'flip' ? 'perspective(400px) rotateX(0deg)' : '';

        activeLayer = incoming;
        scheduleTimeout(() => {
            if (outgoing.parentNode === stage) outgoing.remove();
        }, dur + 40);
    };

    const startTimer = () => {
        if (timer) { clearInterval(timer); timer = null; }
        const cfg = currentEl.cycle || {};
        const holdMs = Math.max(1, Number(cfg.intervalSeconds) || 5) * 1000;
        timer = setInterval(() => {
            if (stopped) return;
            lines = resolveCycleLines(currentEl, expand);
            if (!lines.length) {
                if (activeLayer.textContent !== '') activeLayer.textContent = '';
                return;
            }
            if (lines.length === 1) {
                idx = 0;
                if (setIndex) setIndex(currentEl.id, 0);
                if (activeLayer.textContent !== lines[0]) transitionTo(lines[0]);
                return;
            }
            idx = (idx + 1) % lines.length;
            if (setIndex) setIndex(currentEl.id, idx);
            transitionTo(lines[idx]);
        }, holdMs);
    };

    startTimer();

    const handle = {
        update(nextEl, { resetIndex = false } = {}) {
            if (stopped) return;
            currentEl = nextEl;
            const nextConfigSig = cycleConfigKey(nextEl);
            lines = resolveCycleLines(nextEl, expand);
            if (!lines.length) {
                idx = 0;
                if (setIndex) setIndex(currentEl.id, 0);
                if (activeLayer.textContent !== '') activeLayer.textContent = '';
            } else if (resetIndex) {
                idx = 0;
                if (setIndex) setIndex(currentEl.id, 0);
                if (activeLayer.textContent !== lines[0]) activeLayer.textContent = lines[0];
                startTimer();
            } else {
                const wasEmpty = activeLayer.textContent === '';
                idx = idx % lines.length;
                if ((lines.length === 1 || wasEmpty) && activeLayer.textContent !== lines[idx]) {
                    activeLayer.textContent = lines[idx];
                }
            }
            if (nextConfigSig !== configSig) {
                configSig = nextConfigSig;
                startTimer();
            }
        },
        stop() {
            stopped = true;
            if (timer) { clearInterval(timer); timer = null; }
            clearCleanupTimers();
        }
    };

    node._cycleHandle = handle;
    return handle;
}

export { mountTextCycle, resolveCycleLines };

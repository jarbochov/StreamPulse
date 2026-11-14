/**
 * Dashboard grid layout, drag-and-drop reordering, corner resizing, and module auto-hiding.
 */

import { $, escapeHtml, showToast } from './dashboard-state.js';

const LAYOUT_KEY = 'streampulse.dashboard.layout.v4';
const LEGACY_KEYS = ['streampulse.dashboard.layout.v3', 'streampulse.dashboard.layout.v2'];
const MIN_SPAN = 2;
const MIN_HEIGHT = 90;

export function createLayoutManager(grid) {
    let draggedPanelId = null;
    let disabledModules = new Set();

    const cards = () => [...grid.querySelectorAll(':scope > .card[data-panel-id]')];
    const defaultOrder = cards().map(c => c.dataset.panelId);

    const LIVE_OPS_HIDDEN = new Set(['milestones', 'library', 'message-volume', 'hashtag-stats', 'goals', 'overlays']);

    function defaultLayout() {
        return { order: [...defaultOrder], spans: {}, heights: {}, hidden: [], showDisabled: [], openDetails: {}, compact: false, liveOps: false };
    }

    function loadLayout() {
        const base = defaultLayout();
        try {
            const stored = JSON.parse(localStorage.getItem(LAYOUT_KEY) || 'null');
            if (stored && typeof stored === 'object') {
                return {
                    ...base,
                    ...stored,
                    spans: stored.spans || {},
                    heights: stored.heights || {},
                    hidden: stored.hidden || [],
                    showDisabled: stored.showDisabled || [],
                    openDetails: stored.openDetails || {},
                    liveOps: !!stored.liveOps
                };
            }
            for (const key of LEGACY_KEYS) {
                const legacy = JSON.parse(localStorage.getItem(key) || 'null');
                if (legacy && typeof legacy === 'object') {
                    return {
                        ...base,
                        hidden: Array.isArray(legacy.hidden) ? legacy.hidden : [],
                        compact: !!legacy.compact
                    };
                }
            }
        } catch { /* fall through to defaults */ }
        return base;
    }

    let layout = loadLayout();

    function saveLayout() {
        layout.order = cards().map(c => c.dataset.panelId);
        try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout)); } catch { /* storage may be unavailable */ }
    }

    function spanOf(card) {
        return layout.spans[card.dataset.panelId] || Number(card.dataset.span) || 4;
    }

    function effectiveSpan(span) {
        const width = grid.clientWidth;
        if (width < 640) return 12;
        if (width < 1000) return span < 12 ? 6 : 12;
        return span;
    }

    function applySize(card) {
        card.style.setProperty('--span', effectiveSpan(spanOf(card)));
        const height = layout.heights[card.dataset.panelId];
        if (height) {
            card.dataset.h = '1';
            card.style.minHeight = `${height}px`;
            card.style.setProperty('--card-h', `${height}px`);
        } else {
            delete card.dataset.h;
            card.style.minHeight = '';
            card.style.removeProperty('--card-h');
        }
    }

    function isCardHidden(card) {
        const id = card.dataset.panelId;
        if (layout.hidden.includes(id)) return true;
        if (layout.liveOps && LIVE_OPS_HIDDEN.has(id)) return true;
        const mod = card.dataset.module;
        return Boolean(mod && disabledModules.has(mod) && !layout.showDisabled.includes(id));
    }

    function renderHiddenBar() {
        const bar = $('hidden-panels');
        const hiddenCards = cards().filter(isCardHidden);
        bar.classList.toggle('has-items', hiddenCards.length > 0);
        bar.innerHTML = hiddenCards.length
            ? 'Hidden panels: ' + hiddenCards.map(card => {
                const id = card.dataset.panelId;
                const mod = card.dataset.module;
                const modOff = mod && disabledModules.has(mod);
                return `<button class="layout-btn" data-restore="${escapeHtml(id)}"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;vertical-align:-1px;"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>${escapeHtml(card.dataset.title || id)}${modOff ? ' (off)' : ''}</button>`;
            }).join('')
            : '';
    }

    function applyLayout() {
        const byId = new Map(cards().map(c => [c.dataset.panelId, c]));
        const order = [...layout.order.filter(id => byId.has(id)), ...[...byId.keys()].filter(id => !layout.order.includes(id))];
        order.forEach(id => grid.appendChild(byId.get(id)));
        cards().forEach(card => {
            card.hidden = isCardHidden(card);
            applySize(card);
        });
        document.body.classList.toggle('compact', !!layout.compact);
        $('density-btn').classList.toggle('on', !!layout.compact);
        const liveOpsBtn = $('live-ops-btn');
        if (liveOpsBtn) liveOpsBtn.classList.toggle('on', !!layout.liveOps);
        grid.querySelectorAll('details[data-persist-open]').forEach(el => {
            el.open = !!layout.openDetails?.[el.dataset.persistOpen];
        });
        renderHiddenBar();
    }

    /** Hide module-specific panels whose module is disabled unless explicitly pinned. */
    function syncModuleVisibility(modules = {}) {
        const nextDisabled = new Set();
        for (const [key, enabled] of Object.entries(modules)) {
            if (enabled === false) nextDisabled.add(key);
        }
        const changed = nextDisabled.size !== disabledModules.size
            || [...nextDisabled].some(k => !disabledModules.has(k));
        if (!changed) return;
        disabledModules = nextDisabled;
        cards().forEach(card => {
            card.hidden = isCardHidden(card);
        });
        renderHiddenBar();
    }

    function enhanceCards() {
        cards().forEach(card => {
            const title = card.querySelector(':scope > h2');
            if (!title || card.querySelector('.panel-header')) return;
            const header = document.createElement('div');
            header.className = 'panel-header';
            const body = document.createElement('div');
            body.className = 'panel-body';
            while (title.nextSibling) body.appendChild(title.nextSibling);
            const tools = document.createElement('div');
            tools.className = 'panel-tools';
            tools.innerHTML = '<button type="button" class="tool-btn" data-hide title="Hide panel"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button><button type="button" class="tool-btn drag" draggable="true" title="Drag to reorder"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/></svg></button>';
            header.append(title, tools);
            card.append(header, body);
            card.insertAdjacentHTML('beforeend', '<span class="rz rz-bl" data-corner="bl" title="Drag to resize · double-click to reset"></span><span class="rz rz-br" data-corner="br" title="Drag to resize · double-click to reset"></span><span class="size-badge"></span>');

            tools.querySelector('[data-hide]').addEventListener('click', () => {
                const id = card.dataset.panelId;
                if (!layout.hidden.includes(id)) layout.hidden.push(id);
                layout.showDisabled = layout.showDisabled.filter(item => item !== id);
                card.hidden = true;
                saveLayout();
                renderHiddenBar();
            });
            const handle = tools.querySelector('.drag');
            handle.addEventListener('dragstart', event => {
                draggedPanelId = card.dataset.panelId;
                card.style.opacity = '.55';
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', draggedPanelId);
            });
            handle.addEventListener('dragend', () => {
                card.style.opacity = '';
                draggedPanelId = null;
                cards().forEach(item => item.classList.remove('drag-over'));
            });
            card.addEventListener('dragover', event => {
                if (!draggedPanelId || draggedPanelId === card.dataset.panelId) return;
                event.preventDefault();
                card.classList.add('drag-over');
            });
            card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
            card.addEventListener('drop', event => {
                event.preventDefault();
                card.classList.remove('drag-over');
                const source = cards().find(item => item.dataset.panelId === draggedPanelId);
                if (!source || source === card) return;
                const all = cards();
                grid.insertBefore(source, all.indexOf(source) < all.indexOf(card) ? card.nextSibling : card);
                saveLayout();
            });
        });
    }

    function bindEvents() {
        grid.addEventListener('pointerdown', event => {
            const corner = event.target.closest('.rz');
            if (!corner || event.button !== 0) return;
            event.preventDefault();
            const card = corner.closest('.card');
            const id = card.dataset.panelId;
            const rect = card.getBoundingClientRect();
            const gridWidth = grid.clientWidth;
            const gap = parseFloat(getComputedStyle(grid).columnGap) || 12;
            const columnWidth = (gridWidth - gap * 11) / 12;
            const start = { x: event.clientX, y: event.clientY, width: rect.width, height: rect.height };
            const left = corner.dataset.corner === 'bl';
            const badge = card.querySelector('.size-badge');
            card.classList.add('resizing');
            document.body.classList.add('resizing');
            corner.setPointerCapture(event.pointerId);
            let changed = false;

            const move = e => {
                const dx = (left ? -1 : 1) * (e.clientX - start.x);
                const span = Math.max(MIN_SPAN, Math.min(12, Math.round((start.width + dx + gap) / (columnWidth + gap))));
                const height = Math.max(MIN_HEIGHT, Math.round(start.height + (e.clientY - start.y)));
                layout.spans[id] = span;
                layout.heights[id] = height;
                applySize(card);
                badge.textContent = `${span}/12 cols · ${height}px`;
                changed = true;
            };
            const end = () => {
                corner.removeEventListener('pointermove', move);
                corner.removeEventListener('pointerup', end);
                corner.removeEventListener('pointercancel', end);
                card.classList.remove('resizing');
                document.body.classList.remove('resizing');
                if (changed) saveLayout();
            };
            corner.addEventListener('pointermove', move);
            corner.addEventListener('pointerup', end);
            corner.addEventListener('pointercancel', end);
        });

        grid.addEventListener('dblclick', event => {
            const corner = event.target.closest('.rz');
            if (!corner) return;
            const card = corner.closest('.card');
            delete layout.spans[card.dataset.panelId];
            delete layout.heights[card.dataset.panelId];
            applySize(card);
            saveLayout();
            showToast(`${card.dataset.title} size reset`);
        });

        new ResizeObserver(() => cards().forEach(card => card.style.setProperty('--span', effectiveSpan(spanOf(card))))).observe(grid);

        $('density-btn').addEventListener('click', () => {
            layout.compact = !layout.compact;
            saveLayout();
            applyLayout();
        });
        const liveOpsBtn = $('live-ops-btn');
        if (liveOpsBtn) {
            liveOpsBtn.addEventListener('click', () => {
                layout.liveOps = !layout.liveOps;
                saveLayout();
                applyLayout();
            });
        }

        $('edit-btn').addEventListener('click', () => {
            const editing = document.body.classList.toggle('editing');
            $('edit-btn').classList.toggle('on', editing);
            $('edit-btn').textContent = editing ? 'Done' : 'Edit layout';
        });

        $('reset-btn').addEventListener('click', async () => {
            if (!await window.StreamPulse.confirm('Reset Layout', 'Reset the dashboard layout to the default?')) return;
            localStorage.removeItem(LAYOUT_KEY);
            LEGACY_KEYS.forEach(key => localStorage.removeItem(key));
            layout = defaultLayout();
            defaultOrder.forEach(id => grid.appendChild(cards().find(c => c.dataset.panelId === id)));
            applyLayout();
            showToast('Dashboard layout reset');
        });

        $('hidden-panels').addEventListener('click', event => {
            const id = event.target.closest('[data-restore]')?.dataset.restore;
            if (!id) return;
            layout.hidden = layout.hidden.filter(item => item !== id);
            const card = cards().find(c => c.dataset.panelId === id);
            if (card?.dataset.module && disabledModules.has(card.dataset.module) && !layout.showDisabled.includes(id)) {
                layout.showDisabled.push(id);
            }
            saveLayout();
            applyLayout();
        });

        grid.querySelectorAll('details[data-persist-open]').forEach(el => {
            el.addEventListener('toggle', () => {
                layout.openDetails[el.dataset.persistOpen] = el.open;
                saveLayout();
            });
        });
    }

    enhanceCards();
    bindEvents();
    applyLayout();

    return { applyLayout, syncModuleVisibility };
}

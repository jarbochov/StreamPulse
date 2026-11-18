'use strict';

import { esc, toast } from '../shared/client-core.js';
import { OP_ICONS } from './operator-icons.js';
import {
    getCardType,
    listAvailableCardTypes,
    registerOperatorModule
} from './operator-registry.js';
import {
    getCollapsedPanelIds,
    getCurrentProfile,
    getFocusedPanelId,
    isEditLocked,
    isFocusPanelMode,
    isLayoutLocked,
    operatorState,
    saveCollapsedPanelIds,
    saveFocusedPanelId,
    saveProfileToServer
} from './operator-state.js';

let domainMounted = false;
let domainContainer = null;
const mountedCards = new Map(); // cardId -> { el, def, card }

const MODULE_LABELS = {
    alerts: 'Alerts',
    timers: 'Timers & Subathon',
    overlays: 'Overlays',
    variables: 'Variables',
    music: 'Music',
    board: 'Other'
};

function unmountAllCards() {
    for (const entry of mountedCards.values()) {
        try {
            entry.def?.unmount?.(entry.el);
        } catch (err) {
            console.warn('[Operator] Card unmount error:', err);
        }
    }
    mountedCards.clear();
}

function isTargetPinned(cards, type, config = {}) {
    return (cards || []).some(c => c.type === type && JSON.stringify(c.config || {}) === JSON.stringify(config || {}));
}

async function openAddCardModal(ctx) {
    const modal = document.getElementById('op-modal');
    const titleEl = document.getElementById('op-modal-title');
    const bodyEl = document.getElementById('op-modal-body');
    const footEl = document.getElementById('op-modal-foot');
    if (!modal || !titleEl || !bodyEl || !footEl) return;

    const types = listAvailableCardTypes(ctx.status);
    let activeCategory = 'all';
    let typeQuery = '';

    let stepCleanup = () => {};
    const closeModal = () => {
        stepCleanup();
        modal.hidden = true;
    };

    const addCardToBoard = async (def, { title, config = {} } = {}, { keepOpen = false } = {}) => {
        const prof = getCurrentProfile();
        if (!prof) return;
        const id = `${def.type}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
        const nextCard = {
            id,
            type: def.type,
            title: title || def.defaultTitle || def.label,
            span: 1, // Always default to 1x width; drag corner handle to resize
            config
        };
        const updated = {
            ...prof,
            board: {
                columns: prof.board?.columns || 3,
                cards: [...(prof.board?.cards || []), nextCard]
            }
        };
        await saveProfileToServer(updated);
        if (domainMounted && domainContainer) {
            renderBoard(domainContainer, ctx);
        }
        toast(`Added "${nextCard.title}"`, 'success');
        if (!keepOpen) closeModal();
    };

    const showTargetPicker = async def => {
        stepCleanup();
        titleEl.textContent = `Add ${def.label}`;
        bodyEl.innerHTML = '<div style="font-size:.82rem;color:var(--text-muted);">Loading available items…</div>';
        footEl.innerHTML = '<button type="button" class="op-btn sm" data-card-back="1">Back</button><button type="button" class="op-btn sm primary" data-modal-close="1">Done</button>';

        let items = [];
        try {
            items = await def.getPickerItems(ctx);
        } catch (err) {
            bodyEl.innerHTML = `<div style="color:#f87171;font-size:.82rem;">${esc(err.message)}</div>`;
            return;
        }

        bodyEl.innerHTML = `
            <div class="op-field">
                <label for="op-card-target-search">Search ${esc(def.label)}</label>
                <input type="search" id="op-card-target-search" placeholder="Type to filter…">
            </div>
            <div class="op-picker-list" data-card-target-list="1"></div>`;

        let targetQuery = '';
        const drawTargets = () => {
            const listEl = bodyEl.querySelector('[data-card-target-list]');
            if (!listEl) return;
            const currentCards = getCurrentProfile()?.board?.cards || [];
            const term = targetQuery.trim().toLowerCase();
            const matches = items.filter(it => !term || `${it.title} ${it.subtitle || ''}`.toLowerCase().includes(term));
            listEl.innerHTML = matches.length ? matches.map(it => {
                const pinned = isTargetPinned(currentCards, def.type, it.config || {});
                return `
                <div class="op-picker-row">
                    <div class="op-picker-row-info">
                        <strong>${esc(it.title)} ${pinned ? '<span class="op-pill is-ok" style="margin-left:.3rem;">On Board</span>' : ''}</strong>
                        ${it.subtitle ? `<span>${esc(it.subtitle)}</span>` : ''}
                    </div>
                    <button type="button" class="op-btn sm ${pinned ? '' : 'primary'}" data-pick-target-idx="${items.indexOf(it)}">
                        ${pinned ? 'Add Again' : 'Add'}
                    </button>
                </div>`;
            }).join('') : '<div style="font-size:.8rem;color:var(--text-muted);">No matching items found.</div>';
        };
        drawTargets();

        const searchEl = document.getElementById('op-card-target-search');
        const onSearch = e => {
            targetQuery = e.target.value;
            drawTargets();
        };
        const onPick = async e => {
            const pick = e.target.closest('[data-pick-target-idx]');
            if (!pick) return;
            const item = items[Number(pick.dataset.pickTargetIdx)];
            if (!item) return;
            await addCardToBoard(def, { title: item.defaultTitle || item.title, config: item.config || {} }, { keepOpen: true });
            drawTargets();
        };
        const onFoot = e => {
            if (e.target.closest('[data-card-back]')) showTypeList();
            else if (e.target.closest('[data-modal-close]')) closeModal();
        };
        searchEl?.addEventListener('input', onSearch);
        bodyEl.addEventListener('click', onPick);
        footEl.addEventListener('click', onFoot);
        stepCleanup = () => {
            searchEl?.removeEventListener('input', onSearch);
            bodyEl.removeEventListener('click', onPick);
            footEl.removeEventListener('click', onFoot);
        };
        searchEl?.focus();
    };

    const showTypeList = () => {
        stepCleanup();
        titleEl.textContent = 'Add Card to Live Board';
        const modOrder = [...new Set(types.map(t => t.moduleId || 'board'))];
        bodyEl.innerHTML = `
            <div class="op-field">
                <input type="search" id="op-card-type-search" value="${esc(typeQuery)}" placeholder="Search widgets (timers, alerts, variables, overlays…)" aria-label="Search card types">
            </div>
            <div class="op-filter-seg" id="op-card-cat-seg" role="group" aria-label="Filter card category">
                <button type="button" class="op-filter-btn ${activeCategory === 'all' ? 'active' : ''}" data-card-cat="all">All</button>
                ${modOrder.map(m => `<button type="button" class="op-filter-btn ${activeCategory === m ? 'active' : ''}" data-card-cat="${esc(m)}">${esc(MODULE_LABELS[m] || m)}</button>`).join('')}
            </div>
            <div class="op-picker-list" data-card-type-list="1"></div>`;
        footEl.innerHTML = '<button type="button" class="op-btn sm primary" data-modal-close="1">Done</button>';

        const drawTypes = () => {
            const listEl = bodyEl.querySelector('[data-card-type-list]');
            if (!listEl) return;
            const currentCards = getCurrentProfile()?.board?.cards || [];
            const term = typeQuery.trim().toLowerCase();
            const filtered = types.filter(def => {
                if (activeCategory !== 'all' && (def.moduleId || 'board') !== activeCategory) return false;
                return !term || `${def.label} ${def.description || ''} ${MODULE_LABELS[def.moduleId] || ''}`.toLowerCase().includes(term);
            });
            listEl.innerHTML = filtered.length ? filtered.map(def => {
                const count = currentCards.filter(c => c.type === def.type).length;
                return `
                <div class="op-picker-row">
                    <div class="op-picker-row-info">
                        <strong>${esc(def.label)}${count ? ` <span class="op-pill is-ok" style="margin-left:.3rem;">${count} on board</span>` : ''}</strong>
                        <span>${esc(def.description || '')}</span>
                    </div>
                    <button type="button" class="op-btn sm primary" data-pick-card-type="${esc(def.type)}">${def.getPickerItems ? 'Choose…' : 'Add'}</button>
                </div>`;
            }).join('') : '<div style="font-size:.82rem;color:var(--text-muted);">No matching widgets found.</div>';
        };
        drawTypes();

        const searchEl = document.getElementById('op-card-type-search');
        const onSearch = e => {
            typeQuery = e.target.value;
            drawTypes();
        };
        const onBodyClick = async e => {
            const catBtn = e.target.closest('[data-card-cat]');
            if (catBtn) {
                activeCategory = catBtn.dataset.cardCat;
                bodyEl.querySelectorAll('[data-card-cat]').forEach(b => b.classList.toggle('active', b === catBtn));
                drawTypes();
                return;
            }
            const btn = e.target.closest('[data-pick-card-type]');
            if (!btn) return;
            const def = getCardType(btn.dataset.pickCardType);
            if (!def) return;
            if (typeof def.getPickerItems === 'function') {
                await showTargetPicker(def);
            } else {
                await addCardToBoard(def, {}, { keepOpen: true });
                drawTypes();
            }
        };
        const onFootClick = e => {
            if (e.target.closest('[data-modal-close]')) closeModal();
        };
        searchEl?.addEventListener('input', onSearch);
        bodyEl.addEventListener('click', onBodyClick);
        footEl.addEventListener('click', onFootClick);
        stepCleanup = () => {
            searchEl?.removeEventListener('input', onSearch);
            bodyEl.removeEventListener('click', onBodyClick);
            footEl.removeEventListener('click', onFootClick);
        };
        searchEl?.focus();
    };

    showTypeList();
    modal.hidden = false;
}

function resolveBoardCollapsedSet(profile, cards) {
    const scopeKey = `board_${profile?.id || 'default'}`;
    const manualCollapsed = getCollapsedPanelIds(scopeKey);
    if (!isFocusPanelMode()) {
        return { scopeKey, collapsed: manualCollapsed };
    }
    const savedFocused = getFocusedPanelId(scopeKey);
    let activeId = savedFocused;
    if (savedFocused !== '__none__' && !cards.some(c => c.id === savedFocused)) {
        activeId = (cards.find(c => !manualCollapsed.has(c.id)) || cards[0])?.id || '';
        if (activeId) saveFocusedPanelId(scopeKey, activeId);
    }
    const focusCollapsed = new Set(cards.filter(c => c.id !== activeId).map(c => c.id));
    return { scopeKey, collapsed: focusCollapsed };
}

function applyBoardCollapseDom(container, collapsedSet) {
    container.querySelectorAll('.op-board-card[data-card-id]').forEach(cardEl => {
        const isCollapsed = collapsedSet.has(cardEl.dataset.cardId);
        cardEl.classList.toggle('is-collapsed', isCollapsed);
        const btn = cardEl.querySelector('[data-card-collapse]');
        if (btn) btn.setAttribute('aria-expanded', String(!isCollapsed));
    });
}

function renderBoard(container, ctx) {
    unmountAllCards();
    const profile = getCurrentProfile();
    const cols = Number(profile?.board?.columns) || 3;
    const cards = profile?.board?.cards || [];
    const layoutLocked = isLayoutLocked();
    const readOnly = isEditLocked();
    const hideDockToolbar = operatorState.dockMode && cards.length > 0;
    const { collapsed } = resolveBoardCollapsedSet(profile, cards);

    container.innerHTML = `
        <div class="op-domain-stack">
            ${hideDockToolbar ? '' : `<div class="op-toolbar">
                <div class="op-toolbar-left">
                    <span class="op-pill">${cards.length} card${cards.length === 1 ? '' : 's'}</span>
                    ${layoutLocked ? `<span class="op-pill is-live">${readOnly ? 'Show Mode · Read-Only Values' : 'Layout Locked'}</span>` : `
                    <div class="op-filter-seg" role="group" aria-label="Board columns">
                        ${[1, 2, 3, 4].map(n => `
                            <button type="button" class="op-filter-btn ${cols === n ? 'active' : ''}" data-board-cols="${n}">${n} Col</button>
                        `).join('')}
                    </div>`}
                </div>
                <div class="op-toolbar-right">
                    ${layoutLocked ? '' : `<button type="button" class="op-btn sm primary" data-board-add="1">${OP_ICONS.plus} Add Card</button>`}
                </div>
            </div>`}
            ${cards.length ? `
                <div class="op-board-grid" style="--op-board-cols:${cols};">
                    ${cards.map(card => {
                        const def = getCardType(card.type);
                        const enabled = def && def.isEnabled(ctx.status);
                        const span = Math.min(cols, Math.max(1, Number(card.span) || 1));
                        const minH = Number(card.minHeight) >= 80 ? Number(card.minHeight) : 0;
                        const title = card.title || def?.label || card.type;
                        const isCollapsed = collapsed.has(card.id);
                        return `
                        <section class="op-board-card${isCollapsed ? ' is-collapsed' : ''}" draggable="${layoutLocked ? 'false' : 'true'}" data-card-id="${esc(card.id)}" data-span="${span}"${minH ? ` style="min-height:${minH}px;"` : ''}>
                            <header class="op-board-card-head">
                                <div class="op-board-card-title-wrap">
                                    <button type="button" class="op-icon-btn op-collapse-btn" data-card-collapse="${esc(card.id)}" aria-expanded="${!isCollapsed}" title="${isCollapsed ? 'Expand card' : 'Collapse card'}">${OP_ICONS.chevronDown}</button>
                                    ${layoutLocked ? '' : `<span class="op-var-drag" title="Drag card to reorder">${OP_ICONS.grip}</span>`}
                                    <span class="op-board-card-icon">${def?.iconSvg || OP_ICONS.board}</span>
                                    <span class="op-board-card-title" data-card-title="${esc(card.id)}" title="${esc(title)}${layoutLocked ? '' : ' (double-click to rename)'}">${esc(title)}</span>
                                </div>
                                <div class="op-board-card-actions">
                                    ${!layoutLocked && typeof def?.toggleConfig === 'function' ? `<button type="button" class="op-icon-btn" data-card-config="${esc(card.id)}" title="Choose included overlay sections">${OP_ICONS.sliders}</button>` : ''}
                                    ${layoutLocked ? '' : `<button type="button" class="op-icon-btn danger" data-card-remove="${esc(card.id)}" title="Remove card">${OP_ICONS.close}</button>`}
                                </div>
                            </header>
                            <div class="op-board-card-body" data-card-body="${esc(card.id)}">
                                ${enabled ? '' : '<div style="font-size:.8rem;color:var(--text-muted);">Disabled in Config Editor.</div>'}
                            </div>
                            ${layoutLocked ? '' : `<div class="op-card-resize-handle" data-card-resize="${esc(card.id)}" title="Drag corner to resize width & height (double-click to reset)">${OP_ICONS.resize}</div>`}
                        </section>`;
                    }).join('')}
                </div>
            ` : `
                <div class="op-card">
                    <div class="op-empty">
                        <div>Your Live Board for "${esc(profile?.name || 'Main Show')}" has no pinned cards yet.</div>
                        ${layoutLocked || operatorState.dockMode ? '' : `<button type="button" class="op-btn sm primary" data-board-add="1">${OP_ICONS.plus} Add First Card</button>`}
                    </div>
                </div>
            `}
        </div>`;

    for (const card of cards) {
        const def = getCardType(card.type);
        if (!def || !def.isEnabled(ctx.status)) continue;
        const bodyEl = container.querySelector(`[data-card-body="${CSS.escape(card.id)}"]`);
        if (!bodyEl) continue;
        mountedCards.set(card.id, { el: bodyEl, def, card });
        try {
            def.mount(bodyEl, card, ctx);
        } catch (err) {
            bodyEl.textContent = err.message;
        }
    }
}

function bindBoardInteractions(container, ctx) {
    let draggedId = '';

    const onDragStart = e => {
        if (isLayoutLocked()) { e.preventDefault(); return; }
        const cardEl = e.target.closest('.op-board-card[data-card-id]');
        if (!cardEl || e.target.closest('input, textarea, select, button, a, [data-card-resize], .op-board-card-body')) {
            if (e.target.closest('input, textarea, select, button, [data-card-resize]')) e.preventDefault();
            return;
        }
        draggedId = cardEl.dataset.cardId;
        cardEl.classList.add('is-dragging');
        if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', draggedId);
        }
    };

    const onDragOver = e => {
        if (!draggedId) return;
        const cardEl = e.target.closest('.op-board-card[data-card-id]');
        if (!cardEl || cardEl.dataset.cardId === draggedId) return;
        e.preventDefault();
        container.querySelectorAll('.op-board-card.is-drag-over').forEach(el => el.classList.remove('is-drag-over'));
        cardEl.classList.add('is-drag-over');
    };

    const onDragLeave = e => {
        const cardEl = e.target.closest('.op-board-card[data-card-id]');
        if (cardEl && !cardEl.contains(e.relatedTarget)) cardEl.classList.remove('is-drag-over');
    };

    const onDrop = async e => {
        if (!draggedId) return;
        const target = e.target.closest('.op-board-card[data-card-id]');
        container.querySelectorAll('.op-board-card.is-drag-over').forEach(el => el.classList.remove('is-drag-over'));
        if (!target || target.dataset.cardId === draggedId) return;
        e.preventDefault();
        const prof = getCurrentProfile();
        if (!prof) return;
        const cards = [...(prof.board?.cards || [])];
        const fromIdx = cards.findIndex(c => c.id === draggedId);
        const toIdx = cards.findIndex(c => c.id === target.dataset.cardId);
        if (fromIdx >= 0 && toIdx >= 0) {
            const [moved] = cards.splice(fromIdx, 1);
            cards.splice(toIdx, 0, moved);
            await saveProfileToServer({ ...prof, board: { ...prof.board, cards } });
            renderBoard(container, ctx);
        }
    };

    const onDragEnd = () => {
        draggedId = '';
        container.querySelectorAll('.op-board-card.is-dragging, .op-board-card.is-drag-over').forEach(el => {
            el.classList.remove('is-dragging', 'is-drag-over');
        });
    };

    const onPointerDown = e => {
        if (isLayoutLocked()) return;
        const handle = e.target.closest('[data-card-resize]');
        if (!handle) return;
        const cardEl = handle.closest('.op-board-card[data-card-id]');
        const gridEl = container.querySelector('.op-board-grid');
        if (!cardEl || !gridEl) return;
        e.preventDefault();
        e.stopPropagation();

        const prof = getCurrentProfile();
        const cols = Number(prof?.board?.columns) || 3;
        const startX = e.clientX;
        const startY = e.clientY;
        const rect = cardEl.getBoundingClientRect();
        const gridRect = gridEl.getBoundingClientRect();
        const singleColWidth = Math.max(180, (gridRect.width - Math.max(0, cols - 1) * 11) / cols);
        const initialSpan = Math.min(cols, Math.max(1, Number(cardEl.dataset.span) || 1));
        const initialHeight = rect.height;

        let nextSpan = initialSpan;
        let nextMinHeight = Number(prof?.board?.cards?.find(c => c.id === cardEl.dataset.cardId)?.minHeight) || 0;
        cardEl.classList.add('is-resizing');

        const onMove = ev => {
            const dx = ev.clientX - startX;
            const dy = ev.clientY - startY;
            const targetW = Math.max(singleColWidth * 0.6, rect.width + dx);
            nextSpan = Math.min(cols, Math.max(1, Math.round(targetW / singleColWidth)));
            cardEl.dataset.span = String(nextSpan);

            const targetH = Math.round(initialHeight + dy);
            if (Math.abs(dy) > 8) {
                nextMinHeight = Math.max(110, Math.min(900, targetH));
                cardEl.style.minHeight = `${nextMinHeight}px`;
            }
        };

        const onUp = async () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            cardEl.classList.remove('is-resizing');
            const latestProf = getCurrentProfile();
            if (!latestProf) return;
            const cardId = cardEl.dataset.cardId;
            let changed = false;
            const cards = (latestProf.board?.cards || []).map(c => {
                if (c.id !== cardId) return c;
                if ((c.span || 1) !== nextSpan || (c.minHeight || 0) !== nextMinHeight) {
                    changed = true;
                    const updated = { ...c, span: nextSpan };
                    if (nextMinHeight >= 80) updated.minHeight = nextMinHeight;
                    else delete updated.minHeight;
                    return updated;
                }
                return c;
            });
            if (changed) {
                await saveProfileToServer({ ...latestProf, board: { ...latestProf.board, cards } });
            }
        };

        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
    };

    const onDblClick = async e => {
        if (isLayoutLocked()) return;
        const handle = e.target.closest('[data-card-resize]');
        if (handle) {
            const cardId = handle.dataset.cardResize;
            const prof = getCurrentProfile();
            if (!prof) return;
            const cards = (prof.board?.cards || []).map(c => {
                if (c.id !== cardId) return c;
                const copy = { ...c, span: 1 };
                delete copy.minHeight;
                return copy;
            });
            await saveProfileToServer({ ...prof, board: { ...prof.board, cards } });
            renderBoard(container, ctx);
            return;
        }

        const titleEl = e.target.closest('[data-card-title]');
        if (titleEl && !titleEl.querySelector('input')) {
            const cardId = titleEl.dataset.cardTitle;
            const currentText = titleEl.textContent || '';
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'op-cell-input';
            input.style.height = '24px';
            input.style.fontSize = '.8rem';
            input.value = currentText;
            titleEl.replaceChildren(input);
            input.focus();
            input.select();

            let committed = false;
            const commit = async save => {
                if (committed) return;
                committed = true;
                const nextTitle = input.value.trim() || currentText;
                if (save && nextTitle !== currentText) {
                    const prof = getCurrentProfile();
                    if (prof) {
                        const cards = (prof.board?.cards || []).map(c => c.id === cardId ? { ...c, title: nextTitle } : c);
                        await saveProfileToServer({ ...prof, board: { ...prof.board, cards } });
                    }
                }
                renderBoard(container, ctx);
            };
            input.addEventListener('keydown', ev => {
                if (ev.key === 'Enter') commit(true);
                else if (ev.key === 'Escape') commit(false);
            });
            input.addEventListener('blur', () => commit(true));
        }
    };

    container.addEventListener('dragstart', onDragStart);
    container.addEventListener('dragover', onDragOver);
    container.addEventListener('dragleave', onDragLeave);
    container.addEventListener('drop', onDrop);
    container.addEventListener('dragend', onDragEnd);
    container.addEventListener('pointerdown', onPointerDown);
    container.addEventListener('dblclick', onDblClick);

    return () => {
        container.removeEventListener('dragstart', onDragStart);
        container.removeEventListener('dragover', onDragOver);
        container.removeEventListener('dragleave', onDragLeave);
        container.removeEventListener('drop', onDrop);
        container.removeEventListener('dragend', onDragEnd);
        container.removeEventListener('pointerdown', onPointerDown);
        container.removeEventListener('dblclick', onDblClick);
    };
}

async function handleBoardClick(e, container, ctx) {
    const colBtn = e.target.closest('[data-card-collapse]');
    const collapsedHeader = !colBtn && e.target.closest('.op-board-card.is-collapsed .op-board-card-title-wrap');
    if (colBtn || collapsedHeader) {
        const cardEl = (colBtn || collapsedHeader).closest('.op-board-card[data-card-id]');
        const cardId = cardEl?.dataset.cardId;
        const prof = getCurrentProfile();
        if (!cardId || !prof) return;
        const cards = prof.board?.cards || [];
        const scopeKey = `board_${prof.id || 'default'}`;
        if (isFocusPanelMode()) {
            const wasCollapsed = cardEl.classList.contains('is-collapsed');
            const nextFocused = wasCollapsed ? cardId : '__none__';
            saveFocusedPanelId(scopeKey, nextFocused);
            applyBoardCollapseDom(container, resolveBoardCollapsedSet(prof, cards).collapsed);
            return;
        }
        const collapsed = getCollapsedPanelIds(scopeKey);
        if (collapsed.has(cardId)) collapsed.delete(cardId);
        else collapsed.add(cardId);
        saveCollapsedPanelIds(scopeKey, collapsed);
        applyBoardCollapseDom(container, collapsed);
        return;
    }

    if (isLayoutLocked()) return;
    if (e.target.closest('[data-board-add]')) {
        await openAddCardModal(ctx);
        return;
    }

    const colsBtn = e.target.closest('[data-board-cols]');
    if (colsBtn) {
        const prof = getCurrentProfile();
        if (!prof) return;
        const columns = Number(colsBtn.dataset.boardCols) || 3;
        await saveProfileToServer({ ...prof, board: { ...prof.board, columns } });
        renderBoard(container, ctx);
        return;
    }

    const cfgBtn = e.target.closest('[data-card-config]');
    if (cfgBtn) {
        const entry = mountedCards.get(cfgBtn.dataset.cardConfig);
        entry?.def?.toggleConfig?.(entry.el, entry.card, ctx);
        return;
    }

    const rm = e.target.closest('[data-card-remove]');
    if (rm) {
        const prof = getCurrentProfile();
        if (!prof) return;
        const cards = (prof.board?.cards || []).filter(c => c.id !== rm.dataset.cardRemove);
        await saveProfileToServer({ ...prof, board: { ...prof.board, cards } });
        renderBoard(container, ctx);
    }
}

registerOperatorModule({
    id: 'board',
    label: 'Live Board',
    iconSvg: OP_ICONS.board,
    order: 10,
    alwaysVisible: true,
    isEnabled: () => true,
    mount(container, ctx) {
        domainMounted = true;
        domainContainer = container;
        container.hidden = false;
        const onClick = e => handleBoardClick(e, container, ctx);
        const cleanupDnd = bindBoardInteractions(container, ctx);
        container._opBoardClick = onClick;
        container._opBoardDnd = cleanupDnd;
        container.addEventListener('click', onClick);
        renderBoard(container, ctx);
    },
    unmount(ctx) {
        domainMounted = false;
        unmountAllCards();
        if (domainContainer?._opBoardClick) {
            domainContainer.removeEventListener('click', domainContainer._opBoardClick);
            delete domainContainer._opBoardClick;
        }
        if (domainContainer?._opBoardDnd) {
            domainContainer._opBoardDnd();
            delete domainContainer._opBoardDnd;
        }
        if (ctx?.container) ctx.container.hidden = true;
        domainContainer = null;
    },
    onSocket(type, data, ctx) {
        if (!domainMounted) return;
        if (type === 'operator-update' || type === 'operator-active-profile') {
            if (domainContainer) renderBoard(domainContainer, ctx);
            return;
        }
        for (const entry of mountedCards.values()) {
            entry.def?.onSocket?.(entry.el, entry.card, type, data, ctx);
        }
    },
    onStatus(status, ctx) {
        if (domainMounted && domainContainer) {
            renderBoard(domainContainer, { ...ctx, status });
        }
    }
});

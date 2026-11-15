function elementUsesSet(el, setId) {
    if (!el || !setId) return false;
    const needle = `{{var.${setId}_`.toLowerCase();
    const hay = `${el.content || ''} ${el.src || ''} ${el.progress?.label || ''} ${(el.items || []).join(' ')}`.toLowerCase();
    return hay.includes(needle);
}

/**
 * Variable Set rotation for live overlays and the editor canvas.
 * Timer rotation is owned by the server (`set.rotation`); overlays opt in per set via `variableSetFollow`.
 * Page-triggered rules (`variableSetRotations` with trigger "page") stay local to the overlay.
 * Overrides cover every alias of slot 1 (or the slotless entry): `<id>_<field>`, `<id>_1_<field>`, named slot aliases and `_active`.
 */
function setAliases(setObj) {
    const id = setObj.id;
    const prefixes = [id];
    if ((setObj.slotsCount || 0) > 0) {
        prefixes.push(`${id}_1`);
        const slug = String(setObj.slotNames?.[0] || '').toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/^_+|_+$/g, '').slice(0, 24);
        if (slug && !/^\d+$/.test(slug) && slug !== 'active') prefixes.push(`${id}_${slug}`);
    }
    return prefixes;
}

function hasMedia(node) {
    return node.matches?.('video, iframe') || Boolean(node.querySelector?.('video, iframe'));
}

function createVarRotationEngine({ getOverlay, getSets, getNodes, onResetCycle, onRender }) {
    const overrides = new Map();
    const pageState = new Map();
    const cleanupFns = new Set();
    let overlayRef = null;

    const sets = () => (typeof getSets === 'function' ? getSets() : []) || [];
    const follows = (overlay, setId) => overlay?.variableSetFollow?.[setId] === true;
    const pageRules = overlay => (overlay?.variableSetRotations || []).filter(r => r && r.enabled !== false && r.setId && r.trigger === 'page');

    function clear() {
        for (const fn of cleanupFns) { try { fn(); } catch {} }
        cleanupFns.clear();
    }

    function applyEntry(setObj, entry) {
        for (const prefix of setAliases(setObj)) {
            overrides.set(`${prefix}_active`, entry ? 'true' : 'false');
            for (const f of (setObj.fields || [])) {
                let raw = entry ? String(entry.values?.[f.key] ?? '') : '';
                if (f.type === 'template' && raw && entry?.values) {
                    raw = raw.replace(/@([a-z0-9_]{1,20})\b/gi, (_, k) => (entry.values[k] !== undefined && entry.values[k] !== null ? String(entry.values[k]) : ''));
                }
                const fallback = f.type === 'toggle' ? 'false' : f.type === 'color' ? '#3b82f6' : (f.type === 'counter' || f.type === 'number') ? '0' : '';
                overrides.set(`${prefix}_${f.key}`, raw || fallback);
            }
        }
    }

    // Rebuilds overrides from current sets: followed server rotations first, then local page-rule picks.
    function recompute() {
        overrides.clear();
        const overlay = overlayRef;
        if (!overlay) return;
        const list = sets();
        for (const setObj of list) {
            if (!follows(overlay, setObj.id) || !setObj.rotation?.enabled || !setObj.rotation.entryId) continue;
            const entry = (setObj.roster || []).find(e => e.id === setObj.rotation.entryId);
            if (entry) applyEntry(setObj, entry);
        }
        for (const rule of pageRules(overlay)) {
            const setObj = list.find(s => s.id === rule.setId);
            const entryId = pageState.get(rule.setId);
            const entry = setObj && (setObj.roster || []).find(e => e.id === entryId && e.enabled !== false);
            if (entry) applyEntry(setObj, entry);
        }
    }

    function resetCycles(setId) {
        const nodes = getNodes?.();
        for (const el of (overlayRef?.elements || [])) {
            if (el.type === 'text' && el.cycle?.enabled && elementUsesSet(el, setId)) {
                const node = nodes?.get(el.id);
                if (node) node._pendingCycleReset = true;
                onResetCycle?.(el);
            }
        }
    }

    function pickLocal(rule) {
        const setObj = sets().find(s => s.id === rule.setId);
        if (!setObj) return false;
        const pool = (setObj.roster || []).filter(e => e.enabled !== false);
        if (!pool.length) { pageState.delete(rule.setId); return true; }
        const pos = pool.findIndex(e => e.id === pageState.get(rule.setId));
        let next;
        if (rule.mode === 'random' && pool.length > 1) {
            const others = pool.filter((_, i) => i !== pos);
            next = others[Math.floor(Math.random() * others.length)];
        } else next = pool[pos === -1 ? 0 : (pos + 1) % pool.length];
        pageState.set(rule.setId, next.id);
        return true;
    }

    // Runs `mutate`, re-renders, and cross-fades every element that uses the set. Media elements skip the
    // ghost clone so videos and embeds are not reloaded.
    function transition(setId, opts, mutate) {
        const overlay = getOverlay?.();
        const nodes = getNodes?.();
        const method = ['none', 'fade', 'slide-up', 'flip'].includes(opts?.transition) ? opts.transition : 'fade';
        const dur = Math.max(50, Math.min(2000, Number(opts?.durationMs) || 350));
        const targets = method === 'none' || !overlay?.elements || !nodes || (typeof document !== 'undefined' && document.hidden)
            ? []
            : overlay.elements
                .filter(el => elementUsesSet(el, setId))
                .map(el => ({ el, node: nodes.get(el.id) }))
                .filter(x => x.node && x.node.isConnected && x.node.parentNode);
        const snapshots = targets.map(({ el, node }) => {
            const baseOpacity = String(el.type === 'alert' ? 1 : (el.style?.opacity ?? 1));
            const baseTransform = node.style.transform || '';
            if (hasMedia(node)) return { el, node, ghost: null, baseOpacity, baseTransform };
            const ghost = node.cloneNode(true);
            ghost.removeAttribute('data-element-id');
            ghost.removeAttribute('data-id');
            ghost.setAttribute('aria-hidden', 'true');
            ghost.style.pointerEvents = 'none';
            ghost.style.transition = 'none';
            node.parentNode.insertBefore(ghost, node.nextSibling);
            return { el, node, ghost, baseOpacity, baseTransform };
        });

        mutate();
        recompute();
        resetCycles(setId);
        onRender?.(overlay);

        for (const { el, node, ghost, baseOpacity, baseTransform } of snapshots) {
            // onRender may replace nodes; animate the fresh one.
            const live = nodes.get(el.id) || node;
            live.style.transition = 'none';
            live.style.opacity = '0';
            if (method === 'slide-up') live.style.transform = `${baseTransform} translateY(8px)`.trim();
            else if (method === 'flip') live.style.transform = `${baseTransform} perspective(400px) rotateX(-60deg)`.trim();
            void live.offsetWidth;
            const tr = `opacity ${dur}ms ease, transform ${dur}ms ease`;
            if (ghost) {
                ghost.style.transition = tr;
                ghost.style.opacity = '0';
                if (method === 'slide-up') ghost.style.transform = `${baseTransform} translateY(-8px)`.trim();
                else if (method === 'flip') ghost.style.transform = `${baseTransform} perspective(400px) rotateX(60deg)`.trim();
            }
            live.style.transition = tr;
            live.style.opacity = baseOpacity;
            live.style.transform = baseTransform;
            let done = false;
            let tid = null;
            const cleanup = () => {
                if (done) return;
                done = true;
                if (tid) clearTimeout(tid);
                cleanupFns.delete(cleanup);
                if (ghost?.parentNode) ghost.remove();
                if (live.isConnected) live.style.transition = '';
            };
            cleanupFns.add(cleanup);
            tid = setTimeout(cleanup, dur + 40);
        }
        return true;
    }

    // Call on overlay load or overlay edits. No timers: safe to call on every variables-update.
    function setup(overlay) {
        clear();
        if (overlay !== overlayRef) {
            const keep = new Set(pageRules(overlay).map(r => r.setId));
            for (const id of [...pageState.keys()]) if (!keep.has(id)) pageState.delete(id);
        }
        overlayRef = overlay || null;
        for (const rule of pageRules(overlay)) if (!pageState.has(rule.setId)) pickLocal(rule);
        recompute();
    }

    // Call with the `rotated` set id from a variables-update broadcast; returns true when it handled rendering.
    function serverRotated(setId) {
        const overlay = overlayRef;
        if (!setId || !overlay || !follows(overlay, setId)) { recompute(); return false; }
        const setObj = sets().find(s => s.id === setId);
        const override = overlay.variableSetTransitions?.[setId];
        const opts = override?.transition ? override : setObj?.rotation;
        return transition(setId, opts, () => {});
    }

    function triggerPage(pageId) {
        let changed = false;
        for (const rule of pageRules(overlayRef)) {
            if (!rule.pageId || rule.pageId === pageId) {
                transition(rule.setId, rule, () => pickLocal(rule));
                changed = true;
            }
        }
        return changed;
    }

    function effectiveStatus(baseStatus) {
        if (!overrides.size) return baseStatus;
        const merged = new Map((baseStatus?.customVars || []).map(v => [v.name, v]));
        for (const [k, val] of overrides.entries()) {
            const prev = merged.get(k);
            merged.set(k, prev ? { ...prev, value: val } : { name: k, type: 'text', value: val });
        }
        return { ...baseStatus, customVars: [...merged.values()] };
    }

    function dispose() {
        clear();
        overrides.clear();
        pageState.clear();
        overlayRef = null;
    }

    return { setup, recompute, serverRotated, triggerPage, effectiveStatus, clear, dispose };
}

export { createVarRotationEngine, elementUsesSet };

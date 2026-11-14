function elementUsesSet(el, setId) {
    if (!el || !setId) return false;
    const needle = `{{var.${setId}_`.toLowerCase();
    const hay = `${el.content || ''} ${el.src || ''} ${el.progress?.label || ''} ${(el.items || []).join(' ')}`.toLowerCase();
    return hay.includes(needle);
}

/**
 * Shared local Variable Set rotation engine for both live overlays and the editor canvas.
 * Handles sequential/random stepping, skip-disabled pooling, text-cycle reset coordination,
 * and simultaneous ghost transitions (`fade`, `slide-up`, `flip`, `none`) on any matching element.
 */
function createVarRotationEngine({ getOverlay, getSets, getNodes, onResetCycle, onRender }) {
    const localVarOverrides = new Map();
    const varRotState = new Map();
    const cleanupFns = new Set();
    let timers = [];

    function clear() {
        for (const id of timers) clearInterval(id);
        timers = [];
        for (const fn of cleanupFns) { try { fn(); } catch {} }
        cleanupFns.clear();
    }

    function applySetEntryOverride(setObj, entry) {
        if (!setObj?.id) return;
        localVarOverrides.set(`${setObj.id}_active`, entry ? 'true' : 'false');
        for (const f of (setObj.fields || [])) {
            const val = entry ? String(entry.values?.[f.key] ?? '') : '';
            localVarOverrides.set(`${setObj.id}_${f.key}`, val);
            if ((setObj.slotsCount || 0) > 0) {
                localVarOverrides.set(`${setObj.id}_1_${f.key}`, val);
            }
        }
    }

    function step(rule, { advance = true } = {}) {
        const sets = (typeof getSets === 'function' ? getSets() : []) || [];
        const setObj = sets.find(s => s.id === rule?.setId);
        if (!setObj) return false;
        const pool = (setObj.roster || []).filter(e => e.enabled !== false);
        if (!pool.length) {
            applySetEntryOverride(setObj, null);
            varRotState.delete(setObj.id);
            return true;
        }
        const prev = varRotState.get(setObj.id);
        let nextIdx = prev ? pool.findIndex(e => e.id === prev.entryId) : -1;
        if (!advance && nextIdx !== -1) {
            applySetEntryOverride(setObj, pool[nextIdx]);
            return true;
        }
        if (rule.mode === 'random') {
            if (pool.length === 1) nextIdx = 0;
            else {
                let pick = Math.floor(Math.random() * pool.length);
                if (pick === nextIdx) pick = (pick + 1) % pool.length;
                nextIdx = pick;
            }
        } else {
            nextIdx = nextIdx === -1 ? 0 : (nextIdx + 1) % pool.length;
        }
        const chosen = pool[nextIdx];
        varRotState.set(setObj.id, { index: nextIdx, entryId: chosen.id });
        applySetEntryOverride(setObj, chosen);

        if (advance) {
            const overlay = getOverlay?.();
            const nodes = getNodes?.();
            for (const el of (overlay?.elements || [])) {
                if (el.type === 'text' && el.cycle?.enabled && elementUsesSet(el, setObj.id)) {
                    const node = nodes?.get(el.id);
                    if (node) node._pendingCycleReset = true;
                    if (onResetCycle) onResetCycle(el);
                }
            }
        }
        return true;
    }

    function stepWithTransition(rule) {
        const overlay = getOverlay?.();
        const nodes = getNodes?.();
        const method = ['none', 'fade', 'slide-up', 'flip'].includes(rule?.transition) ? rule.transition : 'fade';
        const dur = Math.max(50, Math.min(2000, Number(rule?.durationMs) || 350));

        const targets = method === 'none' || !overlay?.elements || !nodes
            ? []
            : overlay.elements
                .filter(el => elementUsesSet(el, rule.setId))
                .map(el => ({ el, node: nodes.get(el.id) }))
                .filter(x => x.node && x.node.isConnected && x.node.parentNode);

        if (!targets.length) {
            if (step(rule, { advance: true })) onRender?.(overlay);
            return true;
        }

        const snapshots = targets.map(({ el, node }) => {
            const ghost = node.cloneNode(true);
            ghost.removeAttribute('data-element-id');
            ghost.removeAttribute('data-id');
            ghost.setAttribute('aria-hidden', 'true');
            ghost.style.pointerEvents = 'none';
            ghost.style.transition = 'none';
            const baseOpacity = String(el.type === 'alert' ? 1 : (el.style?.opacity ?? 1));
            const baseTransform = node.style.transform || '';
            node.parentNode.insertBefore(ghost, node.nextSibling);
            return { node, ghost, baseOpacity, baseTransform };
        });

        const changed = step(rule, { advance: true });
        if (!changed) {
            for (const s of snapshots) s.ghost.remove();
            return false;
        }
        onRender?.(overlay);

        for (const { node, ghost, baseOpacity, baseTransform } of snapshots) {
            node.style.transition = 'none';
            node.style.opacity = '0';
            if (method === 'slide-up') node.style.transform = `${baseTransform} translateY(8px)`.trim();
            else if (method === 'flip') node.style.transform = `${baseTransform} perspective(400px) rotateX(-60deg)`.trim();
            void node.offsetWidth;

            const tr = `opacity ${dur}ms ease, transform ${dur}ms ease`;
            ghost.style.transition = tr;
            ghost.style.opacity = '0';
            if (method === 'slide-up') ghost.style.transform = `${baseTransform} translateY(-8px)`.trim();
            else if (method === 'flip') ghost.style.transform = `${baseTransform} perspective(400px) rotateX(60deg)`.trim();

            node.style.transition = tr;
            node.style.opacity = baseOpacity;
            node.style.transform = baseTransform;

            let done = false;
            let tid = null;
            const cleanup = () => {
                if (done) return;
                done = true;
                if (tid) clearTimeout(tid);
                cleanupFns.delete(cleanup);
                if (ghost.parentNode) ghost.remove();
                if (node.isConnected) node.style.transition = '';
            };
            cleanupFns.add(cleanup);
            tid = setTimeout(cleanup, dur + 40);
        }
        return true;
    }

    function setup(overlay) {
        clear();
        const rules = (overlay?.variableSetRotations || []).filter(r => r && r.enabled !== false && r.setId);
        if (!rules.length) {
            localVarOverrides.clear();
            return;
        }
        for (const rule of rules) {
            step(rule, { advance: false });
            if (rule.trigger !== 'page') {
                const ms = Math.max(1000, (Number(rule.intervalSeconds) || 10) * 1000);
                const timer = setInterval(() => {
                    if (document.hidden || getOverlay?.() !== overlay) return;
                    stepWithTransition(rule);
                }, ms);
                timers.push(timer);
            }
        }
    }

    function triggerPage(pageId) {
        const overlay = getOverlay?.();
        const rules = (overlay?.variableSetRotations || []).filter(r => r && r.enabled !== false && r.setId && r.trigger === 'page');
        let changed = false;
        for (const rule of rules) {
            if (!rule.pageId || rule.pageId === pageId) {
                if (stepWithTransition(rule)) changed = true;
            }
        }
        return changed;
    }

    function effectiveStatus(baseStatus) {
        if (!localVarOverrides.size) return baseStatus;
        const base = baseStatus?.customVars || [];
        const merged = new Map(base.map(v => [v.name, v]));
        for (const [k, val] of localVarOverrides.entries()) {
            const prev = merged.get(k);
            merged.set(k, prev ? { ...prev, value: val } : { name: k, type: 'text', value: val });
        }
        return { ...baseStatus, customVars: [...merged.values()] };
    }

    return { setup, triggerPage, effectiveStatus, clear, step };
}

export { createVarRotationEngine, elementUsesSet };

import { fxPaused } from './effects.js';
import { root } from './environment.js';


let filterScriptPromise = null;
function ensureOverlayFilters() {
    if (root.OverlayFilters && root.OverlayRetro) return Promise.resolve(root.OverlayFilters);
    if (!filterScriptPromise) {
        filterScriptPromise = new Promise((resolve) => {
            if (typeof document === 'undefined') return resolve(null);
            const loadRetro = () => {
                if (root.OverlayRetro) return Promise.resolve();
                return new Promise((res) => {
                    const sRetro = document.createElement('script');
                    sRetro.src = '/overlay-retro.js';
                    sRetro.onload = () => res();
                    sRetro.onerror = () => res();
                    document.head.appendChild(sRetro);
                });
            };
            loadRetro().then(() => {
                if (root.OverlayRetro?.setEffectsPaused) root.OverlayRetro.setEffectsPaused(fxPaused);
                if (root.OverlayFilters) {
                    if (root.OverlayFilters.setEffectsPaused) root.OverlayFilters.setEffectsPaused(fxPaused);
                    return resolve(root.OverlayFilters);
                }
                const script = document.createElement('script');
                script.src = '/overlay-filters.js';
                script.onload = () => {
                    if (root.OverlayFilters?.setEffectsPaused) root.OverlayFilters.setEffectsPaused(fxPaused);
                    resolve(root.OverlayFilters);
                };
                script.onerror = () => resolve(null);
                document.head.appendChild(script);
            });
        });
    }
    return filterScriptPromise;
}

function applyMediaFilter(node, element, options) {
    if (root.OverlayFilters?.applyMediaFilter) {
        return root.OverlayFilters.applyMediaFilter(node, element, options);
    }
    ensureOverlayFilters().then(filters => {
        if (node.isConnected && filters?.applyMediaFilter) {
            filters.applyMediaFilter(node, element, options);
        }
    });
}

export { applyMediaFilter };

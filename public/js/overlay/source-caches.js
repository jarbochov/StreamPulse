import { slideshowCache, slideshowSourceKey } from './slideshow.js';
import { textSourceKey, textSources } from './text.js';


// Reconcile against the whole model, not just the visible page or a single inspector selection.
function pruneSourceCaches(elements) {
    const textKeys = new Set((elements || []).map(textSourceKey).filter(Boolean));
    const slideKeys = new Set((elements || []).filter(el => el.type === 'slideshow').map(el => slideshowSourceKey(el.slideshow)).filter(Boolean));
    for (const key of textSources.keys()) if (!textKeys.has(key)) textSources.delete(key);
    for (const key of slideshowCache.keys()) if (!slideKeys.has(key)) slideshowCache.delete(key);
}

export { pruneSourceCaches };

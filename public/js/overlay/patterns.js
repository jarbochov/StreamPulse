import { mountProceduralPattern } from './pattern-procedural.js';
import { mountPatternTiles } from './pattern-tiles.js';

const isProceduralPattern = element => element.type === 'procedural-pattern' || element.pattern?.sourceType === 'preset' || element.pattern?.mode === 'procedural';

function mountPattern(node, element, options = {}) {
    const kind = isProceduralPattern(element) ? 'procedural' : 'tiles';
    const current = node._patternHandle;
    if (current && !current.isStopped?.() && current.update && node._patternKind === kind && node.querySelector(':scope > .sp-pattern-wrap')) {
        current.update(element, options);
        return current;
    }
    if (current?.stop) {
        try { current.stop(); } catch {}
        node._patternHandle = null;
    }
    node._patternKind = kind;
    return kind === 'procedural' ? mountProceduralPattern(node, element, options) : mountPatternTiles(node, element, options);
}

export { mountPattern };

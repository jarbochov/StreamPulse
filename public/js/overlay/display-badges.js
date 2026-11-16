import { getDisplayRows } from '../../../shared/display-table.cjs';
import numericBindings from '../../../shared/numeric-bindings.cjs';
import { renderImageGroupStrip } from './media.js';
import { decorationStyle } from './styles.js';
import { applyMediaFilter } from './filters.js';

export function renderSavedBadge(host, element, status, definition) {
    const binding = element.display || {};
    const badge = definition.badge || {};
    const signature = JSON.stringify([badge, definition.catalogId, binding, element.style, element.width, element.height, status.variableSets, status.customVars, status.modules]);
    if (host._badgeSignature === signature && host.querySelector('.sp-variable-display')) return true;
    host._badgeSignature = signature;
    const node = document.createElement('div');
    node.className = 'sp-variable-display sp-saved-badge';
    node.style.cssText = 'position:relative;width:100%;height:100%;min-width:0;min-height:0;box-sizing:border-box;';
    host.replaceChildren(node);
    if (status.modules?.variableSets === false) return false;
    let imageGroup = { ...badge.imageGroup, enabled: true, setId: definition.catalogId, filterMode: 'all' };
    let resolvedStatus = status;
    if (binding.badgeSource) {
        imageGroup = { ...imageGroup, ...binding.badgeSource };
    } else {
        const { set, entries } = getDisplayRows(status.variableSets || [], definition, binding);
        if (!set) return false;
        const previewSet = { ...set, id: '__saved_badge', roster: entries };
        imageGroup = { ...imageGroup, setId: previewSet.id, filterMode: 'all', onlySelected: false };
        resolvedStatus = { ...status, variableSets: [...(status.variableSets || []), previewSet] };
    }
    const visual = numericBindings.resolveNumericElement({
        ...element, type: 'image', imageGroup,
        style: badge.style || {},
        mediaFilter: badge.mediaFilter || {}
    }, resolvedStatus);
    const style = window.OverlayShared?.resolveStyleVariables?.(visual.style, resolvedStatus, {}) || visual.style;
    Object.assign(node.style, {
        background: style.background || 'transparent', borderRadius: `${style.borderRadius || 0}px`,
        padding: `${style.padding || 0}px`, fontFamily: style.fontFamily || 'sans-serif',
        fontSize: `${style.fontSize || 20}px`, fontWeight: style.fontWeight || '600',
        color: style.color || '#ffffff', opacity: style.opacity ?? 1,
        lineHeight: style.lineHeight || 1.2, letterSpacing: `${style.letterSpacing || 0}px`
    });
    const decoration = decorationStyle(style, 'image');
    if (decoration && typeof decoration === 'object') Object.assign(node.style, decoration);
    window.OverlayShared?.applyBorderEffects?.(node, style, visual);
    const rendered = renderImageGroupStrip(node, visual, resolvedStatus);
    applyMediaFilter(node, visual);
    return rendered;
}

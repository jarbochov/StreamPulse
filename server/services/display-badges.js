const { createHash } = require('crypto');
const { normalizeCustomOverlay } = require('./overlays');
const { normalizeDisplayBinding } = require('../../shared/variable-displays.cjs');

const SOURCE_KEYS = ['setId', 'filterMode', 'linkedSource', 'onlySelected', 'showMode'];
const copy = value => globalThis.structuredClone(value);

function splitBadgeSource(imageGroup = {}) {
    const visual = copy(imageGroup);
    const source = {};
    for (const key of SOURCE_KEYS) {
        if (Object.hasOwn(visual, key)) source[key] = visual[key];
        delete visual[key];
    }
    return { visual, source };
}

function normalizeBadge(input = {}) {
    input ||= {};
    const element = normalizeCustomOverlay({
        id: 'badge-design',
        elements: [{
            id: 'badge', type: 'image', width: input.width || 640, height: input.height || 360,
            imageGroup: { ...input.imageGroup, showLabels: input.imageGroup?.showLabels ?? Boolean(input.imageGroup?.fields?.length), enabled: true },
            style: input.style || {}, mediaFilter: input.mediaFilter || {}
        }]
    }).elements[0];
    return {
        width: element.width, height: element.height,
        imageGroup: splitBadgeSource(element.imageGroup).visual,
        style: element.style, mediaFilter: element.mediaFilter
    };
}

function stable(value) {
    if (Array.isArray(value)) return value.map(stable);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
}

function migrateDisplayBadges({ overlays, displays, sets = [], saveOverlays, warn = console.warn }) {
    let converted = 0;
    const updates = [];
    for (const overlay of Object.values(overlays)) {
        for (const element of overlay.elements || []) {
            if (element.type !== 'image' || element.imageGroup?.enabled !== true) continue;
            const { visual, source } = splitBadgeSource(element.imageGroup);
            const linkedSet = sets.find(set => set.id === source.linkedSource?.setId);
            const target = linkedSet?.fields?.find(field => source.linkedSource?.fields?.includes(field.key))?.targetSet;
            const catalogId = ['linked', 'checklist'].includes(source.filterMode) ? target || source.setId : source.setId;
            // Unresolvable sources are retained rather than silently losing a saved layer.
            if (!catalogId) continue;
            const badge = normalizeBadge({ imageGroup: visual, style: { ...element.style, rotate: 0 }, mediaFilter: element.mediaFilter, width: element.width, height: element.height });
            const fingerprint = JSON.stringify(stable({ catalogId, badge }));
            const id = `badge_${createHash('sha256').update(fingerprint).digest('hex').slice(0, 20)}`;
            try {
                if (!displays.get(id)) displays.save({
                    id, name: element.name || `${overlay.name || 'Overlay'} badge`, kind: 'badge',
                    catalogId, imageField: visual.imageField || 'image', labelField: visual.labelField || 'name',
                    badge, sections: []
                }, id);
            } catch (error) {
                warn(`[Displays] Badge migration retained ${overlay.id}/${element.id}: ${error.message}`);
                continue;
            }
            updates.push({ element, original: copy(element), display: normalizeDisplayBinding({
                displayId: id, badgeSource: { ...source, filterMode: source.filterMode || 'inGroup', showMode: source.showMode || 'active' }
            }) });
        }
    }
    for (const { element, display } of updates) {
        element.type = 'data-display';
        element.display = display;
        element.style = { rotate: element.style?.rotate || 0, background: 'transparent', borderWidth: 0, padding: 0, opacity: 1 };
        element.mediaFilter = {};
        delete element.imageGroup;
    }
    if (updates.length) {
        try { saveOverlays(); converted = updates.length; }
        catch (error) {
            for (const { element, original } of updates) {
                for (const key of Object.keys(element)) delete element[key];
                Object.assign(element, original);
            }
            warn(`[Displays] Badge migration retained original layers: ${error.message}`);
        }
    }
    return converted;
}

module.exports = { normalizeBadge, splitBadgeSource, migrateDisplayBadges };

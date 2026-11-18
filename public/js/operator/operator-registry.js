'use strict';

/**
 * Extensible Operator Mode Registry
 * Future features register Domain Tabs and/or Live Board Card Types here.
 */

const modules = new Map();
const cardTypes = new Map();

export function registerOperatorModule(def) {
    if (!def?.id) throw new Error('registerOperatorModule requires an id');
    modules.set(def.id, {
        order: 50,
        alwaysVisible: false,
        isEnabled: () => true,
        ...def
    });
}

export function registerCardType(def) {
    if (!def?.type) throw new Error('registerCardType requires a type');
    cardTypes.set(def.type, {
        moduleId: 'board',
        defaultSpan: 1,
        isEnabled: () => true,
        ...def
    });
}

export function getOperatorModule(id) {
    return modules.get(id) || null;
}

export function listEnabledModules(status, profile = null, { includeHidden = false } = {}) {
    const hidden = new Set((profile?.tabs?.hidden || []).map(t => String(t).toLowerCase()));
    return [...modules.values()]
        .filter(mod => {
            if (!mod.isEnabled(status)) return false;
            if (!includeHidden && !mod.alwaysVisible && hidden.has(mod.id)) return false;
            return true;
        })
        .sort((a, b) => (a.order - b.order) || a.label.localeCompare(b.label));
}

export function getCardType(type) {
    return cardTypes.get(type) || null;
}

export function listAvailableCardTypes(status) {
    return [...cardTypes.values()].filter(def => def.isEnabled(status));
}

const style = {
    fontSize: [8, 400], borderWidth: [0, 40], borderRadius: [0, 200],
    padding: [0, 200], opacity: [0, 100, 0.01], rotate: [-180, 180],
    lineHeight: [0.5, 3], letterSpacing: [-10, 50], blur: [0, 60],
    'shadow.blur': [0, 100], 'innerShadow.blur': [0, 100], 'innerShadow.spread': [0, 50],
    'innerShadow.x': [-50, 50], 'innerShadow.y': [-50, 50],
    'textStroke.width': [0, 20], 'textShadow.blur': [0, 60],
    'textShadow.x': [-40, 40], 'textShadow.y': [-40, 40],
    'borderGlow.blur': [0, 100],
    'borderAnimation.speed': [0.5, 60], 'borderAnimation.size': [10, 100],
    'textAnimation.delay': [0, 30], 'textAnimation.speed': [0.3, 30], 'textAnimation.intensity': [10, 100]
};
for (const corner of ['tl', 'tr', 'bl', 'br']) style[`borderRadiusCorners.${corner}`] = [0, 200];
for (const gradient of ['gradient', 'textGradient', 'borderGradient']) {
    style[`${gradient}.angle`] = [0, 360];
    style[`${gradient}.speed`] = [1, 120];
}
const imageGroup = {
    gap: [0, 80], rowGap: [0, 120], innerGap: [0, 60], fieldGap: [0, 40], size: [16, 400],
    avatarRadius: [0, 100], avatarBorderWidth: [0, 12], avatarShadow: [0, 40],
    cardBorderWidth: [0, 16], cardRadius: [0, 999], cardPaddingX: [0, 64],
    cardPaddingY: [0, 64], cardShadow: [0, 48], cardBlur: [0, 40], labelSize: [0, 72],
    staggerOffset: [0, 80], spotlightScale: [1.1, 2], overlap: [4, 60]
};
const domains = { style, imageGroup };
const variableMaps = new WeakMap();

function numericBindingField(path) {
    const [domain, ...parts] = String(path).split('.');
    const key = parts.join('.');
    const limits = Object.hasOwn(domains, domain) && Object.hasOwn(domains[domain], key) ? domains[domain][key] : null;
    return limits ? { domain, key, min: limits[0], max: limits[1], scale: limits[2] ?? 1 } : null;
}

function normalizeNumericBindings(bindings, domain) {
    const out = {};
    if (!bindings || typeof bindings !== 'object' || Array.isArray(bindings)) return out;
    for (const [key, name] of Object.entries(bindings)) {
        if (Object.hasOwn(domains[domain] || {}, key) && typeof name === 'string' && /^[a-z0-9_]{1,40}$/.test(name)) out[key] = name;
    }
    return out;
}

function resolveNumericConfig(config, domain, status) {
    if (status?.modules?.variableSettings === false) return config;
    if (!config?.numberBindings || typeof config.numberBindings !== 'object') return config;
    const vars = status?.customVars;
    if (!Array.isArray(vars)) return config;
    let lookup = variableMaps.get(vars);
    if (!lookup) { lookup = new Map(vars.map(variable => [variable.name, variable])); variableMaps.set(vars, lookup); }
    let out = config;
    for (const [key, name] of Object.entries(config.numberBindings)) {
        const field = numericBindingField(`${domain}.${key}`);
        const variable = lookup.get(name);
        if (!field || !['number', 'counter'].includes(variable?.type) || !['number', 'string'].includes(typeof variable.value) || String(variable.value).trim() === '' || !Number.isFinite(Number(variable.value))) continue;
        const value = Math.max(field.min, Math.min(field.max, Number(variable.value))) * field.scale;
        const parts = key.split('.');
        if (parts.reduce((current, part) => current?.[part], config) === value) continue;
        if (out === config) out = { ...config };
        let target = out;
        for (const part of parts.slice(0, -1)) { target[part] = { ...(target[part] || {}) }; target = target[part]; }
        target[parts.at(-1)] = value;
    }
    return out;
}

function resolveNumericElement(element, status) {
    const style = resolveNumericConfig(element.style, 'style', status);
    const imageGroup = resolveNumericConfig(element.imageGroup, 'imageGroup', status);
    return style === element.style && imageGroup === element.imageGroup ? element : { ...element, style, imageGroup };
}

module.exports = { numericBindingField, normalizeNumericBindings, resolveNumericConfig, resolveNumericElement };

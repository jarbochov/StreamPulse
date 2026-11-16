export const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
let formContext = () => null;
export const setDisplayFormContext = provider => { formContext = provider; };
const variableIcon = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M8 3H6v7l-3 2 3 2v7h2M16 3h2v7l3 2-3 2v7h-2"/></svg>';
function numericValue(path, fallback) {
    const context = formContext(), shared = window.OverlayShared;
    const field = context && shared?.numericBindingField?.(path);
    if (!field) return fallback;
    const config = shared.resolveNumericConfig(context.badge[field.domain], field.domain, { customVars: context.variables });
    return field.key.split('.').reduce((value, key) => value?.[key], config) ?? fallback;
}
export function refreshBoundDisplayNumbers(root) {
    for (const input of root.querySelectorAll('input[data-kind="number"]:disabled')) {
        input.value = numericValue(input.dataset.path, 0) / (Number(input.dataset.scale) || 1);
    }
}
const field = (label, body) => `<label class="field"><span>${label}</span>${body}</label>`;
const options = (values, current) => values.map(item => item.group
    ? `<optgroup label="${esc(item.group)}">${options(item.options, current)}</optgroup>`
    : `<option value="${esc(item[0])}"${String(item[0]) === String(current) ? ' selected' : ''}>${esc(item[1])}</option>`).join('');
export const F = {
    text: (path, label, value, extra = '') => field(label, `<input data-path="${path}" value="${esc(value)}" ${extra}>`),
    number: (path, label, value, { min, max, step = 1, scale = 1 } = {}) => {
        const context = formContext(), spec = context && window.OverlayShared?.numericBindingField?.(path);
        const binding = spec && context.badge?.[spec.domain]?.numberBindings?.[spec.key];
        const variables = context?.variables?.filter(variable => variable.type === 'number') || [];
        value = numericValue(path, value);
        return field(label, `<span class="display-number-field"><input type="number" data-path="${path}" data-kind="number" data-scale="${scale}" value="${esc(Number.isFinite(Number(value)) ? Number(value) / scale : '')}" ${min == null ? '' : `min="${min}"`} ${max == null ? '' : `max="${max}"`} step="${step}"${binding ? ' disabled' : ''}>${spec && variables.length ? `<button type="button" data-badge-number-pick="${path}" title="Bind Number variable" aria-label="Bind ${esc(label)} to Number variable">${variableIcon}</button>` : ''}${binding ? `<button type="button" data-badge-number-unbind="${path}" title="Unlink Number variable" aria-label="Unlink ${esc(label)}">&times;</button>` : ''}</span>${binding ? `<small class="display-muted">Number variable: ${esc(binding)}</small>` : ''}`);
    },
    range: (path, label, value, config) => F.number(path, label, value, config),
    check: (path, label, value) => `<label class="check"><input type="checkbox" data-path="${path}" data-kind="check"${value ? ' checked' : ''}> ${label}</label>`,
    select: (path, label, value, values) => field(label, `<select data-path="${path}">${options(values, value)}</select>`),
    color: (path, label, value, { clear = false, clearValue = 'transparent', clearLabel = 'None' } = {}) => `<div class="field"><span>${label}</span><span class="color-field"><input type="color" data-path="${path}" value="${/^#[a-f\d]{6}/i.test(value || '') ? value.slice(0, 7) : '#000000'}" aria-label="${esc(label)} picker"><input data-path="${path}" class="color-text" value="${esc(value)}" placeholder="#RRGGBBAA, rgba(), @field or {{var.color}}" aria-label="${esc(label)} value">${formContext() ? `<button type="button" data-badge-color-pick="${path}" title="Bind Color variable" aria-label="Bind ${esc(label)} to Color variable">${variableIcon}</button>` : ''}${clear ? `<button type="button" data-clear="${path}" data-clear-value="${esc(clearValue)}">${clearLabel}</button>` : ''}</span></div>`,
    seg: (path, label, value, values) => `<div class="field"><span>${label}</span><span class="seg tabs-nav" role="group" aria-label="${esc(label)}" data-seg-path="${path}">${values.map(([key, title, icon]) => `<button type="button" class="tab-btn${String(value) === String(key) ? ' active' : ''}" data-seg-value="${key}" aria-label="${esc(title)}" aria-pressed="${String(value) === String(key)}">${icon || esc(title)}</button>`).join('')}</span></div>`,
    section: (id, title, body, open = true) => `<details class="sect" data-sect="${id}"${open ? ' open' : ''}><summary>${title}</summary><div class="sect-body">${body}</div></details>`
};
export function setPath(object, path, value) {
    const parts = path.split('.');
    let target = object;
    for (const key of parts.slice(0, -1)) target = target[key] ||= {};
    target[parts.at(-1)] = value;
}

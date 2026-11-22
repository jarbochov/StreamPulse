/**
 * StreamPulse Custom Overlay Editor — Form Builders & Data Binding
 */

import {
    esc, fmt, round2, setPath, getPath, prefs, savePrefs, addRecentColor,
    getDocumentColors, ICON, LIMITS, toast, state, alertLookSelection
} from './editor-state.js';

const ICON_COLOR_VAR = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1"/><path d="M16 3h1a2 2 0 0 1 2 2v5a2 2 0 0 0 2 2 2 2 0 0 0-2 2v5a2 2 0 0 1-2 2h-1"/></svg>';

function hasVariableColors(path) {
    if (state.liveStatus?.modules?.variableSettings === false) return false;
    const vars = Array.isArray(state.liveStatus?.customVars) ? state.liveStatus.customVars : [];
    if (vars.some(v => v && v.type === 'color')) return true;
    const sets = Array.isArray(state.liveStatus?.variableSets) ? state.liveStatus.variableSets : [];
    if (sets.some(s => (s?.fields || []).some(f => f && f.type === 'color'))) return true;
    return false;
}

function resolveColorPreviewHex(value) {
    const raw = String(value || '').trim();
    if (/^#[0-9a-f]{6}$/i.test(raw)) return raw;
    if (/^#[0-9a-f]{3}$/i.test(raw)) return `#${[...raw.slice(1)].map(c => c + c).join('')}`;
    if (raw.includes('{{')) {
        const shared = typeof window !== 'undefined' ? window.OverlayShared : null;
        const resolved = String(shared?.resolveColorToken?.(raw, state.liveStatus || {}, {}) || '').trim();
        if (/^#[0-9a-f]{6}$/i.test(resolved)) return resolved;
        if (/^#[0-9a-f]{3}$/i.test(resolved)) return `#${[...resolved.slice(1)].map(c => c + c).join('')}`;
    }
    return '#000000';
}

export function renderSwatches(path) {
    const docColors = getDocumentColors();
    const recents = (prefs.recentColors || []).filter(c => !docColors.includes(c));
    const all = [...docColors, ...recents].slice(0, 14);
    if (!all.length) return '';
    return `<div class="color-swatches" data-swatch-path="${path}">` +
        all.map(c => `<button type="button" class="swatch-btn" data-color="${esc(c)}" title="${esc(c)}" style="background-color:${esc(c)}" aria-label="Use color ${esc(c)}"></button>`).join('') +
        `</div>`;
}

function numberBinding(path, label, value) {
    const shared = window.OverlayShared;
    const field = shared?.numericBindingField?.(path);
    if (!field) return { value, actions: '', note: '', disabled: '' };
    const element = state.overlay?.elements?.find(el => state.selectedIds?.has(el.id));
    const lookId = element?.type === 'alert' ? alertLookSelection?.get?.(element.id) : null;
    const look = lookId ? (element.alert?.looks || []).find(l => l.id === lookId) : null;
    const config = getPath(look || element, field.domain);
    const name = config?.numberBindings?.[field.key];
    const settingsEnabled = state.liveStatus?.modules?.variableSettings !== false;
    if (!settingsEnabled && !name) return { value, actions: '', note: '', disabled: '' };
    const resolved = shared.resolveNumericConfig(config, field.domain, state.liveStatus);
    const pickBtn = settingsEnabled
        ? `<button type="button" class="number-var-btn" data-number-pick="${path}" title="${name ? `Change Number binding: ${esc(name)}` : 'Bind Number variable'}" aria-label="Bind ${esc(label)} to Number variable">${ICON_COLOR_VAR}</button>`
        : '';
    return {
        value: name ? getPath(resolved, field.key) ?? value : value,
        disabled: name && settingsEnabled ? ' disabled' : '',
        actions: `<span class="number-binding-actions">${pickBtn}${name ? `<button type="button" class="number-var-btn" data-number-unbind="${path}" title="Unlink and restore saved value" aria-label="Unlink ${esc(label)}">&times;</button>` : ''}</span>`,
        note: name ? `<small class="number-binding-note">${esc(name)} <span> · ${settingsEnabled ? 'saved value is fallback' : 'variable settings disabled'}</span></small>` : ''
    };
}

export const F = {
    text: (path, label, value, extra = '') =>
        `<label class="field"><span>${label}</span><input data-path="${path}" data-kind="text" value="${esc(value)}" ${extra}></label>`,

    number: (path, label, value, { min, max, step = 1, scale = 1, lazy = false } = {}) => {
        const binding = numberBinding(path, label, value);
        return `<label class="field"><span>${label}</span><span class="number-field"><input type="number" data-path="${path}" data-kind="number" value="${fmt(binding.value, scale)}" ${min !== undefined ? `min="${min}" data-min="${min}"` : ''} ${max !== undefined ? `max="${max}" data-max="${max}"` : ''} step="${step}" data-scale="${scale}" ${lazy ? 'data-lazy="1"' : ''}${binding.disabled}>${binding.actions}</span>${binding.note}</label>`;
    },

    range: (path, label, value, { min, max, step = 1, scale = 1, unit = '', editable = false, reset = undefined, resetTitle = '' } = {}) => {
        const binding = numberBinding(path, label, value);
        const v = fmt(binding.value, scale);
        const cls = ['range-field', editable ? 'has-number' : '', reset !== undefined ? 'has-reset' : '', binding.actions ? 'has-number-binding' : ''].filter(Boolean).join(' ');
        const valInput = editable
            ? `<input type="number" class="range-num" data-path="${path}" data-kind="number" data-scale="${scale}" min="${min}" max="${max}" data-min="${min}" data-max="${max}" step="${step}" value="${v}" aria-label="${label} value"${binding.disabled}>`
            : `<output>${v}${unit}</output>`;
        const resetBtn = reset !== undefined && !binding.disabled
            ? `<button type="button" class="range-reset" data-reset="${path}" data-reset-value="${reset}" title="${esc(resetTitle || `Reset to ${reset}${unit}`)}" aria-label="${esc(resetTitle || `Reset to ${reset}${unit}`)}">${ICON.reset}</button>`
            : '';
        return `<label class="field"><span>${label}</span><span class="${cls}" data-unit="${esc(unit)}"><input type="range" data-path="${path}" data-kind="number" data-scale="${scale}" min="${min}" max="${max}" data-min="${min}" data-max="${max}" step="${step}" value="${v}"${binding.disabled}>${valInput}${reset !== undefined && binding.actions ? `<span class="range-reset-slot">${resetBtn}</span>` : resetBtn}${binding.actions}</span>${binding.note}</label>`;
    },

    check: (path, label, value) =>
        `<label class="check"><input type="checkbox" data-path="${path}" data-kind="check" ${value ? 'checked' : ''}> ${label}</label>`,

    select: (path, label, value, options) => {
        const renderOpts = (opts) => opts.map(item => {
            if (item && item.group) {
                return `<optgroup label="${esc(item.group)}">${renderOpts(item.options || [])}</optgroup>`;
            }
            const [v, l] = item;
            return `<option value="${esc(v)}"${String(v) === String(value) ? ' selected' : ''}>${esc(l)}</option>`;
        }).join('');
        return `<label class="field"><span>${label}</span><select data-path="${path}" data-kind="text">${renderOpts(options)}</select></label>`;
    },

    color: (path, label, value, { clear = false, clearValue = 'transparent', clearLabel = 'None' } = {}) => {
        const hex = resolveColorPreviewHex(value);
        const varBtn = hasVariableColors(path)
            ? `<button type="button" class="color-var-btn" data-color-pick="${path}" title="Bind color placeholder" aria-label="Bind color placeholder">${ICON_COLOR_VAR}</button>`
            : '';
        const eyedropBtn = (typeof window !== 'undefined' && window.EyeDropper)
            ? `<button type="button" class="eyedrop-btn" data-eyedrop="${path}" title="Sample color from screen" aria-label="Sample color from screen">${ICON.eyedrop}</button>`
            : '';
        const clearBtn = clear
            ? `<button type="button" data-clear="${path}" data-clear-value="${esc(clearValue)}" title="Clear color">${esc(clearLabel)}</button>`
            : '';
        const actions = `${varBtn}${eyedropBtn}${clearBtn}`;
        return `<div class="field"><span>${label}</span><span class="color-field">${''}<input type="color" data-path="${path}" data-kind="text" value="${hex}" aria-label="${label} picker"><input class="color-text" data-path="${path}" data-kind="text" value="${esc(value)}" placeholder="#rrggbb, rgba(), or {{var.name}}" spellcheck="false" aria-label="${label} value">${actions ? `<span class="color-field-actions">${actions}</span>` : ''}</span>${renderSwatches(path)}</div>`;
    },

    seg: (path, label, value, options) =>
        `<div class="field"><span>${label}</span><span class="seg" data-seg-path="${path}">${options.map(([v, title, icon]) => `<button type="button" data-seg-value="${v}" aria-pressed="${v === value}" title="${title}" aria-label="${title}">${icon || title}</button>`).join('')}</span></div>`,

    section: (id, title, body, openByDefault = true) =>
        `<details class="sect" data-sect="${id}" ${(prefs.sections[id] ?? openByDefault) ? 'open' : ''}><summary>${title}</summary><div class="sect-body">${body}</div></details>`
};

export function readField(input, event) {
    const kind = input.dataset.kind;
    if (kind === 'check') return input.checked;
    if (kind === 'number') {
        if (input.value.trim() === '' || !Number.isFinite(Number(input.value))) return undefined;
        const scale = Number(input.dataset.scale) || 1;
        let value = Number(input.value);
        if (input.dataset.min !== undefined) {
            if (event?.type === 'input' && value < Number(input.dataset.min)) return undefined;
            value = Math.max(Number(input.dataset.min), value);
        }
        if (input.dataset.max !== undefined) value = Math.min(Number(input.dataset.max), value);
        return round2(value * scale);
    }
    if (kind === 'lines') return input.value.split('\n').map(line => line.trim()).filter(Boolean);
    return input.value;
}

export function syncColorPair(input) {
    const wrap = input.closest('.color-field');
    if (!wrap) return;
    if (input.type === 'color') {
        const textInp = wrap.querySelector('.color-text');
        if (textInp) textInp.value = input.value;
    } else if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(input.value.trim())) {
        const v = input.value.trim();
        const colorInp = wrap.querySelector('input[type="color"]');
        if (colorInp) colorInp.value = v.length === 4 ? `#${[...v.slice(1)].map(c => c + c).join('')}` : v;
    } else if (input.value.trim().startsWith('@') || input.value.includes('{{')) {
        const colorInp = wrap.querySelector('input[type="color"]');
        if (colorInp) colorInp.value = resolveColorPreviewHex(input.value);
    }
}

export function bindFields(container, getTargets, onApply) {
    container.addEventListener('click', event => {
        const button = event.target.closest('[data-number-pick], [data-number-unbind]');
        if (!button) return;
        event.preventDefault();
        const path = button.dataset.numberPick || button.dataset.numberUnbind;
        const field = window.OverlayShared?.numericBindingField?.(path);
        if (!field) return;
        const applyBinding = name => {
            for (const target of getTargets()) {
                const config = target[field.domain];
                if (!config) continue;
                config.numberBindings = { ...(config.numberBindings || {}) };
                if (name) config.numberBindings[field.key] = name;
                else delete config.numberBindings[field.key];
            }
            onApply(`${field.domain}.numberBindings`, new Event('change'));
        };
        if (button.dataset.numberUnbind) applyBinding('');
        else window.PlaceholderPicker?.open({
            filter: 'number',
            getStatus: () => state.liveStatus,
            title: 'Bind Number variable',
            subtitle: 'Uses this control’s displayed units and limits. Unlinking restores its saved value.',
            onPick: key => applyBinding(key.replace(/^var\./, ''))
        });
    });
    let pendingRaf = null;
    let pendingPath = null;
    let pendingEvent = null;
    const editedColors = new WeakMap();

    const flushOnApply = () => {
        if (!pendingPath) return;
        const p = pendingPath;
        const ev = pendingEvent;
        pendingPath = null;
        pendingEvent = null;
        pendingRaf = null;
        onApply(p, ev);
    };

    const apply = (input, event) => {
        const value = readField(input, event);
        if (value === undefined) return;
        const targets = getTargets();
        if (!targets.length) return;
        if (input.type === 'color' || input.classList.contains('color-text')) editedColors.set(input, targets);
        targets.forEach(target => {
            setPath(target, input.dataset.path, value);
            if (input.dataset.path === 'video.sound' && target.video) {
                delete target.video.muted;
            }
            if (target.aspectLock && target.width > 0 && target.height > 0) {
                const ratio = target.aspectRatio || (target.width / target.height);
                if (input.dataset.path === 'width' && event.type === 'change') {
                    const newH = Math.max(LIMITS.elementH[0], Math.min(LIMITS.elementH[1], Math.round(value / ratio)));
                    target.height = newH;
                    const hInput = container.querySelector('[data-path="height"]');
                    if (hInput) hInput.value = String(newH);
                } else if (input.dataset.path === 'height' && event.type === 'change') {
                    const newW = Math.max(LIMITS.elementW[0], Math.min(LIMITS.elementW[1], Math.round(value * ratio)));
                    target.width = newW;
                    const wInput = container.querySelector('[data-path="width"]');
                    if (wInput) wInput.value = String(newW);
                }
            }
        });
        syncColorPair(input);
        if (input.type === 'color' || input.classList.contains('color-text')) addRecentColor(value);
        const rangeWrap = input.closest('.range-field');
        if (rangeWrap) {
            const partner = rangeWrap.querySelector(input.type === 'range' ? 'input[type="number"]' : 'input[type="range"]');
            if (partner && partner !== input) partner.value = input.value;
            const output = rangeWrap.querySelector('output');
            if (output) output.textContent = `${fmt(value, Number(input.dataset.scale) || 1)}${rangeWrap.dataset.unit || ''}`;
        }
        if (event?.type === 'input') {
            pendingPath = input.dataset.path;
            pendingEvent = event;
            if (!pendingRaf) {
                pendingRaf = requestAnimationFrame(flushOnApply);
            }
        } else {
            if (pendingRaf) {
                cancelAnimationFrame(pendingRaf);
                pendingRaf = null;
                pendingPath = null;
                pendingEvent = null;
            }
            onApply(input.dataset.path, event);
        }
    };

    container.addEventListener('input', event => {
        const input = event.target.closest('[data-path]');
        if (input && input.dataset.lazy !== '1') apply(input, event);
    });

    container.addEventListener('change', event => {
        const input = event.target.closest('[data-path]');
        if (!input) return;
        if (input.dataset.lazy === '1' || input.dataset.kind === 'number' || input.dataset.kind === 'check' || input.tagName === 'SELECT' || input.type === 'color' || input.classList.contains('color-text')) apply(input, event);
        const target = getTargets()[0];
        if (target && input.dataset.kind === 'number') {
            const formatted = fmt(getPath(target, input.dataset.path), Number(input.dataset.scale) || 1);
            input.value = formatted;
            const rangeWrap = input.closest('.range-field');
            if (rangeWrap) {
                const partner = rangeWrap.querySelector(input.type === 'range' ? 'input[type="number"]' : 'input[type="range"]');
                if (partner && partner !== input) partner.value = formatted;
            }
        }
        state.dirty = true;
    });

    container.addEventListener('focusout', event => {
        const input = event.target.closest('[data-path]');
        if (!input || !editedColors.has(input)) return;
        const editedTargets = editedColors.get(input);
        editedColors.delete(input);
        const currentTargets = getTargets();
        if (currentTargets.length !== editedTargets.length || currentTargets.some(target => !editedTargets.includes(target))) return;
        apply(input, event);
        editedColors.delete(input);
    });

    container.addEventListener('pointerdown', event => {
        const labelSpan = event.target.closest('.field > span:first-child');
        if (labelSpan) {
            const field = labelSpan.closest('.field');
            const numInput = field?.querySelector('input[data-kind="number"]');
            if (numInput && !numInput.disabled) {
                event.preventDefault();
                const startX = event.clientX;
                const startVal = Number(numInput.value) || 0;
                const step = Number(numInput.step) || 1;
                const min = numInput.dataset.min !== undefined ? Number(numInput.dataset.min) : -Infinity;
                const max = numInput.dataset.max !== undefined ? Number(numInput.dataset.max) : Infinity;
                let isScrubbing = false;

                document.body.classList.add('is-scrubbing');
                labelSpan.classList.add('scrubbing');

                const move = e => {
                    const dx = e.clientX - startX;
                    if (Math.abs(dx) > 2) isScrubbing = true;
                    if (!isScrubbing) return;
                    const multiplier = e.shiftKey ? 10 : (e.altKey ? 0.1 : 1);
                    const delta = dx * multiplier * (step >= 1 ? 1 : step);
                    let newVal = startVal + delta;
                    newVal = Math.max(min, Math.min(max, newVal));
                    if (step >= 1) newVal = Math.round(newVal);
                    else {
                        const dec = String(step).split('.')[1]?.length || 1;
                        newVal = Number(newVal.toFixed(dec));
                    }
                    numInput.value = String(newVal);
                    apply(numInput, new Event('input', { bubbles: true }));
                };

                const up = () => {
                    removeEventListener('pointermove', move);
                    removeEventListener('pointerup', up);
                    document.body.classList.remove('is-scrubbing');
                    labelSpan.classList.remove('scrubbing');
                    if (isScrubbing) {
                        apply(numInput, new Event('change', { bubbles: true }));
                    } else {
                        numInput.focus();
                        if (numInput.select) numInput.select();
                    }
                };

                addEventListener('pointermove', move);
                addEventListener('pointerup', up);
                return;
            }
        }

        const pick = event.target.closest('[data-focus-pick]');
        if (!pick) return;
        event.preventDefault();
        const dot = pick.querySelector('.focus-dot');
        const move = e => {
            const r = pick.getBoundingClientRect();
            const x = Math.round(Math.max(0, Math.min(100, (e.clientX - r.left) / r.width * 100)));
            const y = Math.round(Math.max(0, Math.min(100, (e.clientY - r.top) / r.height * 100)));
            if (dot) { dot.style.left = `${x}%`; dot.style.top = `${y}%`; }
            getTargets().forEach(t => { setPath(t, 'style.focusX', x); setPath(t, 'style.focusY', y); });
            onApply('style.focusX', e);
        };
        const up = () => {
            removeEventListener('pointermove', move);
            removeEventListener('pointerup', up);
            state.dirty = true;
        };
        addEventListener('pointermove', move);
        addEventListener('pointerup', up);
        move(event);
    });

    container.addEventListener('click', event => {
        const eyedrop = event.target.closest('[data-eyedrop]');
        if (eyedrop && window.EyeDropper) {
            const path = eyedrop.dataset.eyedrop;
            new window.EyeDropper().open().then(result => {
                if (!result?.sRGBHex) return;
                const color = result.sRGBHex.toLowerCase();
                getTargets().forEach(target => setPath(target, path, color));
                const colorField = eyedrop.closest('.color-field');
                if (colorField) {
                    const hexInput = colorField.querySelector('input[type="color"]');
                    const textInput = colorField.querySelector('.color-text');
                    if (hexInput) hexInput.value = color;
                    if (textInput) textInput.value = color;
                }
                addRecentColor(color);
                onApply(path, event);
                state.dirty = true;
                toast(`Sampled ${color}`, 'ok', 1000);
            }).catch(() => {});
            return;
        }

        const seg = event.target.closest('[data-seg-value]');
        if (seg) {
            const wrap = seg.closest('[data-seg-path]');
            const path = wrap?.dataset?.segPath;
            if (!path) return;
            const segValue = path.endsWith('.enabled') ? seg.dataset.segValue === 'true' : seg.dataset.segValue;
            getTargets().forEach(target => setPath(target, path, segValue));
            wrap.querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', String(button === seg)));
            onApply(path, event);
            state.dirty = true;
            return;
        }

        const clear = event.target.closest('[data-clear]');
        if (clear) {
            const path = clear.dataset.clear;
            const clearVal = clear.dataset.clearValue !== undefined ? clear.dataset.clearValue : 'transparent';
            getTargets().forEach(target => setPath(target, path, clearVal));
            const wrap = clear.closest('.color-field');
            if (wrap) {
                const textInp = wrap.querySelector('.color-text');
                if (textInp) textInp.value = clearVal;
            }
            onApply(path, event);
            state.dirty = true;
            return;
        }

        const resetBtn = event.target.closest('[data-reset]');
        if (resetBtn) {
            const path = resetBtn.dataset.reset;
            const resetVal = Number(resetBtn.dataset.resetValue ?? 0);
            getTargets().forEach(target => setPath(target, path, resetVal));
            const rangeWrap = resetBtn.closest('.range-field');
            if (rangeWrap) {
                const rangeInp = rangeWrap.querySelector('input[type="range"]');
                if (rangeInp) rangeInp.value = String(resetVal);
                const numInp = rangeWrap.querySelector('input[type="number"]');
                if (numInp) numInp.value = String(resetVal);
                const output = rangeWrap.querySelector('output');
                if (output) output.textContent = `${resetVal}${rangeWrap.dataset.unit || ''}`;
            }
            onApply(path, event);
            state.dirty = true;
            if (path === 'style.rotate') toast('Rotation reset to 0°', 'info', 1000);
            return;
        }

        const swatch = event.target.closest('[data-color]');
        if (swatch) {
            const wrap = swatch.closest('.color-swatches');
            const path = wrap?.dataset.swatchPath;
            const color = swatch.dataset.color;
            if (path && color) {
                getTargets().forEach(target => setPath(target, path, color));
                const fieldWrap = wrap.parentElement;
                const colorField = fieldWrap?.querySelector('.color-field');
                if (colorField) {
                    const hexInput = colorField.querySelector('input[type="color"]');
                    const textInput = colorField.querySelector('.color-text');
                    if (textInput) textInput.value = color;
                    if (hexInput) {
                        const previewHex = swatch.dataset.swatchPreview || color;
                        if (/^#[0-9a-f]{3,6}$/i.test(previewHex)) {
                            hexInput.value = previewHex.length === 4 ? `#${[...previewHex.slice(1)].map(c => c + c).join('')}` : previewHex;
                        }
                    }
                }
                if (color.startsWith('#')) addRecentColor(color);
                onApply(path, event);
                state.dirty = true;
            }
            return;
        }
    });

    container.addEventListener('focusin', event => {
        if (event.target.matches('textarea[data-path], input[data-path="src"]')) {
            state.lastTextField = event.target;
        }
    });

    container.addEventListener('toggle', event => {
        const id = event.target.dataset?.sect;
        if (id) {
            prefs.sections[id] = event.target.open;
            savePrefs();
        }
    }, true);
}

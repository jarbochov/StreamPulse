import { api, esc, pickImage, toast } from './variables-state.js';
import { fontControls } from './variables-groups.js';
import { numberOptions } from './variables-numbers.js';

export function createVariableInspector(host, { getVariable, getStatus, onSaved }) {
    let name = '', type = '', dirty = false, busy = false, initial = new Map(), rendered = '';
    try { name = localStorage.getItem('streampulse:variables:selected') || ''; } catch { /* optional */ }
    const confirm = async message => window.StreamPulse?.confirm
        ? window.StreamPulse.confirm('Variable options', message, { confirmText: 'Continue' })
        : window.confirm(message);
    const remember = () => {
        try { localStorage.setItem('streampulse:variables:selected', name); } catch { /* optional */ }
    };
    const preview = () => {
        const variable = getVariable(name);
        const value = host.querySelector('[data-live-value]');
        if (value) value.textContent = String(variable?.value ?? '');
        const output = host.querySelector('[data-template-preview]');
        if (output) output.textContent = window.OverlayShared?.expandVariables(host.querySelector('[name="value"]').value, getStatus(), {}) || '(empty)';
    };
    const fields = variable => {
        if (['number', 'counter'].includes(variable.type)) return `${numberOptions(variable, true)}<p class="muted">Bounds and precision affect storage; step affects counter actions. Bind Numbers with {} beside supported overlay style controls.</p>`;
        if (variable.type === 'font') return `${fontControls(variable)}<p class="variable-font-sample">The quick brown fox</p>`;
        if (variable.type === 'list') return `<label>Items<textarea name="items" rows="7">${esc((variable.items || []).join('\n'))}</textarea></label><label>Order<select name="mode"><option value="random"${variable.mode !== 'sequential' ? ' selected' : ''}>Random</option><option value="sequential"${variable.mode === 'sequential' ? ' selected' : ''}>Sequential</option></select></label>`;
        if (variable.type === 'select' || variable.type === 'tags') {
            const opts = Array.isArray(variable.options) ? variable.options : [];
            const activeTags = new Set((Array.isArray(variable.items) ? variable.items : []).map(s => String(s).toLowerCase()));
            const activeSelect = String(variable.value || '').toLowerCase();
            return `
                <div class="vp-options-editor" data-options-editor>
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.35rem;">
                        <span style="font-size:.75rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);">Preset options</span>
                        <button type="button" class="b sm" data-opt-add>+ Add Option</button>
                    </div>
                    <div data-opt-list style="display:grid;gap:.35rem;">
                        ${opts.length ? opts.map((opt, idx) => `
                            <div class="vp-opt-row" data-opt-idx="${idx}" style="display:grid;grid-template-columns:minmax(0,1fr) 32px auto auto;gap:.3rem;align-items:center;">
                                <input type="text" data-opt-label value="${esc(opt.label || opt.value)}" placeholder="Option label" maxlength="60">
                                <input type="color" data-opt-color value="${esc(/^#[0-9a-f]{6}/i.test(opt.color || '') ? opt.color.slice(0, 7) : '#3b82f6')}" data-has-color="${opt.color ? '1' : '0'}" title="Option color" style="width:32px;height:30px;padding:2px;">
                                <button type="button" class="b sm" data-opt-icon="${idx}" title="${opt.icon ? esc(opt.icon) : 'Optional icon'}">${opt.icon ? `<i class="${esc(opt.icon)}"></i>` : 'Icon'}</button>
                                <button type="button" class="b sm danger" data-opt-del="${idx}" aria-label="Remove option">&times;</button>
                                <input type="hidden" data-opt-icon-val value="${esc(opt.icon || '')}">
                                <input type="hidden" data-opt-color-val value="${esc(opt.color || '')}">
                            </div>
                        `).join('') : '<p class="muted" style="margin:0;font-size:.78rem;">Add options below (e.g. Live, BRB, Intermission).</p>'}
                    </div>
                </div>
                ${opts.length ? (variable.type === 'select'
                    ? `<label style="margin-top:.55rem;">Active option<select name="value">${opts.map(opt => `<option value="${esc(opt.value)}"${opt.value.toLowerCase() === activeSelect ? ' selected' : ''}>${esc(opt.label || opt.value)}</option>`).join('')}</select></label>`
                    : `<div style="margin-top:.55rem;"><span style="display:block;font-size:.75rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin-bottom:.3rem;">Active tags</span><div style="display:flex;flex-wrap:wrap;gap:.35rem;">${opts.map(opt => `<label style="display:inline-flex;align-items:center;gap:.3rem;padding:.22rem .5rem;border:1px solid var(--border);border-radius:999px;font-size:.78rem;cursor:pointer;"><input type="checkbox" data-tag-active value="${esc(opt.value)}"${activeTags.has(opt.value.toLowerCase()) ? ' checked' : ''}>${opt.color ? `<span style="width:8px;height:8px;border-radius:50%;background:${esc(opt.color)};display:inline-block;"></span>` : ''}${esc(opt.label || opt.value)}</label>`).join('')}</div></div>`)
                    : ''}
                <p class="muted" style="margin-top:.4rem;">${variable.type === 'select' ? 'Exposes label, <code>_color</code>, and <code>_icon</code> tokens automatically. Supports <code>/next</code> and <code>/prev</code> triggers.' : 'Select multiple active tags at once. Supports <code>/toggle?value=...</code> and <code>/clear</code> triggers.'}</p>
            `;
        }
        if (variable.type === 'toggle') return `<label class="variable-toggle-option"><input type="checkbox" name="value"${String(variable.value) === 'true' ? ' checked' : ''}> Enabled</label>`;
        if (variable.type === 'color') {
            const rawHex = String(variable.value || '').trim();
            const hexInputVal = /^#[0-9a-f]{3}$/i.test(rawHex)
                ? `#${rawHex[1]}${rawHex[1]}${rawHex[2]}${rawHex[2]}${rawHex[3]}${rawHex[3]}`
                : (/^#[0-9a-f]{6}/i.test(rawHex) ? rawHex.slice(0, 7) : '#000000');
            return `<label>Color<span class="variable-color-edit"><input type="color" data-inspector-color value="${esc(hexInputVal)}" aria-label="Color picker"><input name="value" value="${esc(variable.value)}" maxlength="9" placeholder="#RRGGBBAA"></span></label>`;
        }
        if (variable.type === 'image') return `${variable.value ? `<img class="variable-image-preview" src="${esc(variable.value)}" alt="Variable image preview" referrerpolicy="no-referrer">` : ''}<label>Image URL<input name="value" value="${esc(variable.value)}" maxlength="1000"></label><button type="button" class="b sm" data-inspector-image>Asset Library</button>`;
        if (['date', 'time', 'datetime'].includes(variable.type)) {
            return `<label>${variable.type === 'datetime' ? 'Date &amp; time' : variable.type === 'date' ? 'Date' : 'Time'}<input type="${variable.type === 'datetime' ? 'datetime-local' : variable.type}" name="value" value="${esc(variable.value)}"></label><p class="muted">A reusable local ${variable.type === 'datetime' ? 'date and time' : variable.type} value. It stays as entered; it does not start a timer.</p>`;
        }
        if (variable.type === 'duration') return `<label>Duration<input name="value" value="${esc(variable.value)}" placeholder="45m or 1:30:00" maxlength="500"></label><p class="muted">A fixed duration, not a running countdown. Use it as an overlay placeholder or in templates.</p>`;
        return `<label>${variable.type === 'template' ? 'Expression' : 'Value'}<textarea name="value" rows="4" maxlength="500">${esc(variable.value)}</textarea></label>${variable.type === 'template' ? '<button type="button" class="b sm" data-inspector-placeholder>Insert placeholder</button><div class="variable-template-preview"><span>Preview</span><p data-template-preview></p></div>' : ''}`;
    };
    const read = input => input.type === 'checkbox' ? input.checked : input.value;
    function refresh() {
        const variable = getVariable(name);
        host.classList.toggle('is-open', Boolean(variable));
        if (dirty || busy || (host.contains(document.activeElement) && document.activeElement.matches('input,textarea,select'))) { preview(); return; }
        const signature = JSON.stringify(variable || null);
        if (signature === rendered && host.childElementCount) { preview(); return; }
        rendered = signature;
        if (!variable) {
            host.innerHTML = '<div class="variable-inspector-empty"><h3>Variable inspector</h3><p class="muted">Select a variable name to edit its settings. Values can be edited directly in the list.</p></div>';
            return;
        }
        type = variable.type;
        const key = window.OverlayShared.variableKey(variable);
        if (variable.icon) window.IconPicker?.ensureFont?.();
        const iconField = variable.setId ? '' : `<label>Icon (optional)<span class="variable-icon-edit"><span class="variable-icon-preview" data-inspector-icon-preview>${variable.icon ? `<i class="${esc(variable.icon)}"></i>` : ''}</span><input name="icon" value="${esc(variable.icon || '')}" placeholder="e.g. fa-brands fa-twitch" maxlength="80" spellcheck="false"><button type="button" class="b sm" data-inspector-icon>Pick…</button></span></label>`;
        host.innerHTML = `<div class="variable-inspector-heading"><div><span class="variable-micro-heading">${esc(type === 'counter' ? 'Number' : type === 'datetime' ? 'Date & time' : type)}</span><h3>${esc(name)}</h3></div><button type="button" class="b sm" data-inspector-close aria-label="Close variable inspector">&times;</button></div>
            <div style="display:flex;flex-wrap:wrap;gap:0.35rem;align-items:center;"><code class="copyable" data-copy="{{var.${esc(key)}}}" title="Copy placeholder">{{var.${esc(key)}}}</code>${variable.icon ? `<code class="copyable" data-copy="{{var.${esc(key)}.icon}}" title="Copy icon placeholder">{{var.${esc(key)}.icon}}</code>` : ''}${variable.type === 'select' ? `<code class="copyable" data-copy="{{var.${esc(key)}_color}}" title="Active option color">{{var.${esc(key)}_color}}</code><code class="copyable" data-copy="{{var.${esc(key)}_icon}}" title="Active option icon">{{var.${esc(key)}_icon}}</code>` : ''}${variable.type === 'tags' ? `<code class="copyable" data-copy="{{var.${esc(key)}_count}}" title="Active tag count">{{var.${esc(key)}_count}}</code>` : ''}</div>
            <p class="variable-live-value">Live value <strong data-live-value></strong></p>
            ${variable.group ? `<p class="muted">API name: <code>${esc(name)}</code>. Moving this variable or renaming its group changes its placeholder path.</p>` : ''}
            <form class="variable-inspector-form">${fields(variable)}${iconField}<div class="variable-inspector-footer">${variable.setId ? '' : '<button type="button" class="b sm danger variable-inspector-delete" data-inspector-delete title="Delete variable">Delete</button>'}<button type="button" class="b sm" data-inspector-cancel>Revert</button><button type="submit" class="b sm primary">Save changes</button></div></form>
            ${variable.setId ? '<p class="muted">This value is managed by a Variable Set.</p>' : ''}`;
        const font = host.querySelector('select[data-act="value"]');
        if (font) font.name = 'value';
        initial = new Map([...host.querySelectorAll('[name]')].map(input => [input.name, read(input)]));
        preview();
        host.querySelector('.variable-font-sample')?.style.setProperty('font-family', variable.value);
    }
    async function open(next) {
        if (busy) return false;
        if (next === name) { preview(); return true; }
        if (dirty && !await confirm('Discard unsaved variable options?')) return false;
        name = next; dirty = false; rendered = ''; remember(); refresh();
        host.classList.toggle('is-open', Boolean(name));
        return true;
    }
    host.addEventListener('input', event => {
        dirty = true;
        if (event.target.matches('input[name="icon"]')) {
            const box = host.querySelector('[data-inspector-icon-preview]');
            const cls = window.OverlayShared?.sanitizeIconClass?.(event.target.value) || '';
            if (cls) window.IconPicker?.ensureFont?.();
            if (box) box.innerHTML = cls ? `<i class="${esc(cls)}"></i>` : '';
        }
        const customFont = event.target.closest('input[data-act="value"]');
        if (customFont) {
            const select = host.querySelector('select[name="value"]');
            if (!Array.from(select.options).some(option => option.value === customFont.value)) select.add(new Option(customFont.value, customFont.value));
            select.value = customFont.value;
            host.querySelector('.variable-font-sample').style.fontFamily = customFont.value;
        }
        preview();
    });
    host.addEventListener('change', event => {
        dirty = true;
        if (event.target.matches('[data-inspector-color]')) {
            const input = host.querySelector('[name="value"]');
            input.value = event.target.value + (input.value.length === 9 ? input.value.slice(7) : '');
        }
        if (event.target.matches('[data-opt-color]')) {
            const row = event.target.closest('[data-opt-idx]');
            const hidden = row?.querySelector('[data-opt-color-val]');
            if (hidden) hidden.value = event.target.value;
            event.target.dataset.hasColor = '1';
        }
        const sample = host.querySelector('.variable-font-sample');
        if (sample) sample.style.fontFamily = host.querySelector('[name="value"]').value;
        preview();
    });
    host.addEventListener('click', async event => {
        if (busy) return;
        if (event.target.closest('[data-inspector-close]')) { await open(''); return; }
        if (event.target.closest('[data-inspector-cancel]')) { dirty = false; rendered = ''; refresh(); return; }
        if (event.target.closest('[data-opt-add]')) {
            const listEl = host.querySelector('[data-opt-list]');
            if (!listEl) return;
            const emptyMsg = listEl.querySelector('p.muted');
            if (emptyMsg) emptyMsg.remove();
            const idx = listEl.querySelectorAll('[data-opt-idx]').length;
            const row = document.createElement('div');
            row.className = 'vp-opt-row';
            row.dataset.optIdx = String(idx);
            row.style.cssText = 'display:grid;grid-template-columns:minmax(0,1fr) 32px auto auto;gap:.3rem;align-items:center;';
            row.innerHTML = `<input type="text" data-opt-label value="" placeholder="Option label" maxlength="60"><input type="color" data-opt-color value="#3b82f6" data-has-color="0" title="Option color" style="width:32px;height:30px;padding:2px;"><button type="button" class="b sm" data-opt-icon="${idx}" title="Optional icon">Icon</button><button type="button" class="b sm danger" data-opt-del="${idx}" aria-label="Remove option">&times;</button><input type="hidden" data-opt-icon-val value=""><input type="hidden" data-opt-color-val value="">`;
            listEl.appendChild(row);
            row.querySelector('[data-opt-label]')?.focus();
            dirty = true;
            return;
        }
        const optDel = event.target.closest('[data-opt-del]');
        if (optDel) {
            optDel.closest('[data-opt-idx]')?.remove();
            dirty = true;
            return;
        }
        const optIconBtn = event.target.closest('[data-opt-icon]');
        if (optIconBtn) {
            const row = optIconBtn.closest('[data-opt-idx]');
            const hidden = row?.querySelector('[data-opt-icon-val]');
            window.IconPicker?.open({
                value: hidden?.value || '',
                onPick: cls => {
                    if (!hidden) return;
                    hidden.value = cls || '';
                    optIconBtn.innerHTML = cls ? `<i class="${esc(cls)}"></i>` : 'Icon';
                    dirty = true;
                }
            });
            return;
        }
        if (event.target.closest('[data-inspector-icon]')) {
            const selected = name;
            const input = host.querySelector('input[name="icon"]');
            window.IconPicker?.open({
                value: input?.value || '',
                onPick: cls => {
                    if (selected !== name || !input) return;
                    input.value = cls || '';
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                }
            });
        }
        if (event.target.closest('[data-inspector-image]')) {
            const selected = name;
            pickImage(host.querySelector('[name="value"]').value, value => {
                if (selected !== name || getVariable(name)?.type !== 'image') return;
                const input = host.querySelector('[name="value"]');
                input.value = value; input.dispatchEvent(new Event('input', { bubbles: true }));
            });
        }
        if (event.target.closest('[data-inspector-placeholder]')) {
            const selected = name;
            window.PlaceholderPicker?.open({
            getStatus, onPick: token => {
                if (selected !== name || getVariable(name)?.type !== 'template') return;
                const input = host.querySelector('[name="value"]');
                input.setRangeText(`{{${token}}}`, input.selectionStart, input.selectionEnd, 'end');
                input.dispatchEvent(new Event('input', { bubbles: true })); input.focus();
            }
            });
        }
        if (event.target.closest('[data-inspector-delete]') && !busy) {
            const selected = name;
            if (!await confirm(`Delete "${name}"? Existing placeholders will use their fallback values.`)) return;
            if (selected !== name || busy) return;
            busy = true;
            try { await api(`/api/variables/${encodeURIComponent(name)}`, 'DELETE'); dirty = false; name = ''; remember(); await onSaved(); }
            catch (error) { toast(error.message, 'error'); }
            finally { busy = false; rendered = ''; refresh(); }
        }
    });
    host.addEventListener('submit', async event => {
        event.preventDefault();
        if (busy) return;
        const current = getVariable(name);
        if (!current || current.type !== type) return toast('This variable changed or was removed. Select it again.', 'error');
        const patch = type === 'counter' ? { type: 'number' } : {};
        for (const input of host.querySelectorAll('[name]')) {
            const value = read(input);
            if (value === initial.get(input.name) && type !== 'counter') continue;
            patch[input.name] = input.type === 'number' ? value === '' ? null : Number(value) : input.name === 'items' ? value.split('\n').filter(line => line.trim()) : value;
        }
        if (type === 'select' || type === 'tags') {
            const optRows = [...host.querySelectorAll('[data-opt-idx]')];
            const options = optRows.map(row => {
                const label = (row.querySelector('[data-opt-label]')?.value || '').trim();
                const color = (row.querySelector('[data-opt-color-val]')?.value || '').trim();
                const icon = (row.querySelector('[data-opt-icon-val]')?.value || '').trim();
                return label ? { value: label, label, ...(color ? { color } : {}), ...(icon ? { icon } : {}) } : null;
            }).filter(Boolean);
            patch.options = options;
            if (type === 'tags') {
                patch.items = [...host.querySelectorAll('[data-tag-active]:checked')].map(cb => cb.value);
            }
        }
        if (type === 'color' && patch.value !== undefined && !/^#(?:[a-f0-9]{3}|[a-f0-9]{6}|[a-f0-9]{8})$/i.test(patch.value)) return toast('Use a valid #RGB, #RRGGBB or #RRGGBBAA color.', 'error');
        if (!Object.keys(patch).length) { dirty = false; rendered = ''; refresh(); return; }
        busy = true;
        host.querySelectorAll('input,textarea,select,button').forEach(input => { input.disabled = true; });
        try { await api(`/api/variables/${encodeURIComponent(name)}`, 'PUT', patch); dirty = false; await onSaved(); toast('Variable saved', 'success'); }
        catch (error) { toast(error.message, 'error'); }
        finally { busy = false; rendered = ''; refresh(); }
    });
    return { open, refresh, selected: () => name };
}

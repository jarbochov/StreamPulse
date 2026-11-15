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
        if (variable.type === 'toggle') return `<label class="variable-toggle-option"><input type="checkbox" name="value"${String(variable.value) === 'true' ? ' checked' : ''}> Enabled</label>`;
        if (variable.type === 'color') return `<label>Color<span class="variable-color-edit"><input type="color" data-inspector-color value="${esc(String(variable.value).slice(0, 7))}" aria-label="Color picker"><input name="value" value="${esc(variable.value)}" maxlength="9" placeholder="#RRGGBBAA"></span></label>`;
        if (variable.type === 'image') return `${variable.value ? `<img class="variable-image-preview" src="${esc(variable.value)}" alt="Variable image preview" referrerpolicy="no-referrer">` : ''}<label>Image URL<input name="value" value="${esc(variable.value)}" maxlength="1000"></label><button type="button" class="b sm" data-inspector-image>Asset Library</button>`;
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
        host.innerHTML = `<div class="variable-inspector-heading"><div><span class="variable-micro-heading">${esc(type === 'counter' ? 'Number' : type)}</span><h3>${esc(name)}</h3></div><button type="button" class="b sm" data-inspector-close aria-label="Close variable inspector">&times;</button></div>
            <code class="copyable" data-copy="{{var.${esc(name)}}}" title="Copy placeholder">{{var.${esc(name)}}}</code>
            <p class="variable-live-value">Live value <strong data-live-value></strong></p>
            <form class="variable-inspector-form">${fields(variable)}<div class="variable-inspector-footer">${variable.setId ? '' : '<button type="button" class="b sm danger variable-inspector-delete" data-inspector-delete title="Delete variable">Delete</button>'}<button type="button" class="b sm" data-inspector-cancel>Revert</button><button type="submit" class="b sm primary">Save changes</button></div></form>
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
        const sample = host.querySelector('.variable-font-sample');
        if (sample) sample.style.fontFamily = host.querySelector('[name="value"]').value;
        preview();
    });
    host.addEventListener('click', async event => {
        if (busy) return;
        if (event.target.closest('[data-inspector-close]')) { await open(''); return; }
        if (event.target.closest('[data-inspector-cancel]')) { dirty = false; rendered = ''; refresh(); return; }
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

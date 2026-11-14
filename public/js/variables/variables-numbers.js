import { api, esc, toast } from './variables-state.js';

export function numberControls(variable) {
    return `<button type="button" class="b sm" data-act="edit-number" title="Number options and counter controls">Options</button>`;
}

export function openNumberEditor(variable, onSaved) {
    const dialog = document.createElement('dialog');
    dialog.className = 'variable-group-dialog';
    const fields = [
        ['value', 'Value', variable.value],
        ['resetValue', 'Reset value', variable.resetValue ?? variable.initial ?? 0],
        ['min', 'Minimum (optional)', variable.min],
        ['max', 'Maximum (optional)', variable.max],
        ['step', 'Counter step', variable.step ?? 1],
        ['precision', 'Stored decimal precision (optional)', variable.precision]
    ];
    dialog.innerHTML = `<form><h2>Number: ${esc(variable.name)}</h2>
        <div class="variable-number-options">${fields.map(([name, label, value]) => `<label>${label}<input name="${name}" type="number" step="${name === 'precision' ? '1' : 'any'}" value="${esc(value ?? '')}"${['value', 'resetValue', 'step'].includes(name) ? ' required' : ''}></label>`).join('')}</div>
        <p class="muted">Values clamp to the bounds. Step controls increments, not manual entries. Precision rounds the stored value; overlay formatting stays separate.</p>
        <div class="variable-number-actions"><button type="button" class="b btn" data-number-action="decrement">Decrement</button><button type="button" class="b btn" data-number-action="increment">Increment</button><button type="button" class="b btn" data-number-action="reset">Reset</button></div>
        <p class="muted">Counter controls act immediately using saved options. Save applies the entered value and options.</p>
        <div class="variable-group-footer"><button type="button" class="b btn" data-close>Close</button><button type="submit" class="b btn primary">Save</button></div></form>`;
    document.body.appendChild(dialog);
    dialog.addEventListener('close', () => dialog.remove(), { once: true });
    dialog.querySelector('[data-close]').onclick = () => dialog.close();
    const url = `/api/variables/${encodeURIComponent(variable.name)}`;
    let busy = false;
    dialog.addEventListener('click', async event => {
        const button = event.target.closest('[data-number-action]');
        if (!button || busy) return;
        busy = true;
        try {
            const updated = await api(`${url}/${button.dataset.numberAction}`, 'POST');
            dialog.querySelector('[name="value"]').value = updated.value;
            await onSaved();
        } catch (error) { toast(error.message, 'error'); }
        finally { busy = false; }
    });
    dialog.querySelector('form').onsubmit = async event => {
        event.preventDefault();
        if (busy) return;
        busy = true;
        try {
            const patch = { type: 'number' };
            for (const [name] of fields) {
                const value = dialog.querySelector(`[name="${name}"]`).value;
                patch[name] = value === '' ? null : Number(value);
            }
            await api(url, 'PUT', patch);
            dialog.close();
            await onSaved();
        } catch (error) { toast(error.message, 'error'); }
        finally { busy = false; }
    };
    dialog.showModal();
}

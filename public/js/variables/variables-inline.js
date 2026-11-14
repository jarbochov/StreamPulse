import { api, esc, toast } from './variables-state.js';

export function inlineValue(variable) {
    const value = String(variable.value ?? '');
    if (variable.type === 'list') return `<span class="var-number-value">${esc(value) || '(empty)'}</span>`;
    return `<button type="button" class="var-inline-value" data-inline-edit aria-label="Edit ${esc(variable.name)} value" title="Click to edit; Enter or blur saves, Escape cancels"><span>${esc(value) || '(empty)'}</span><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m16 3 5 5-13 13H3v-5Z"/><path d="m14 5 5 5"/></svg></button>`;
}

export function bindInlineEditing(container, getVariable, onFinished) {
    let active = null;
    let pointerDown = false, frame = 0, needsRender = false;
    // Preserve row geometry until the pointer click reaches its destination.
    const pendingRestore = [];
    const restore = edit => {
        edit.button.querySelector('span').textContent = String(getVariable(edit.name)?.value ?? '') || '(empty)';
        edit.editor.replaceWith(edit.button);
    };
    const pressPointer = () => { pointerDown = true; };
    const releasePointer = () => {
        if (!pointerDown) return;
        pointerDown = false;
        if ((needsRender || pendingRestore.length) && !frame) frame = requestAnimationFrame(() => {
            frame = 0;
            pendingRestore.splice(0).forEach(restore);
            onFinished(null);
        });
    };
    container.addEventListener('pointerdown', pressPointer, true);
    document.addEventListener('pointerup', releasePointer);
    document.addEventListener('pointercancel', releasePointer);
    const finish = (edit, updated, focus) => {
        if (active !== edit) return;
        active = null;
        if (!pointerDown && frame) {
            cancelAnimationFrame(frame);
            frame = 0;
            pendingRestore.splice(0).forEach(restore);
        }
        if (pointerDown) {
            pendingRestore.push(edit);
            edit.input.disabled = true;
        } else restore(edit);
        onFinished(updated);
        if (focus) [...container.querySelectorAll('[data-n]')].find(row => row.dataset.n === edit.name)?.querySelector('[data-inline-edit]')?.focus();
    };
    const save = (edit, focus = false) => {
        if (!edit || active !== edit) return Promise.resolve();
        if (edit.promise) return edit.promise;
        if (edit.input.value === edit.initialValue) {
            finish(edit, null, focus);
            return Promise.resolve();
        }
        edit.promise = Promise.resolve().then(async () => {
            try {
                const current = getVariable(edit.name);
                if (!current || current.type !== edit.type) throw new Error('This variable changed or was removed. Edit its current value again.');
                const value = edit.input.value;
                if (edit.type === 'color' && !/^#(?:[a-f0-9]{3}|[a-f0-9]{6}|[a-f0-9]{8})$/i.test(value)) throw new Error('Use a valid #RGB, #RRGGBB or #RRGGBBAA color.');
                const updated = await api(`/api/variables/${encodeURIComponent(edit.name)}`, 'PUT', { value });
                finish(edit, updated, focus);
            } catch (error) {
                toast(error.message, 'error');
                finish(edit, null, focus);
            }
        });
        edit.input.disabled = true;
        edit.editor.classList.add('is-saving');
        return edit.promise;
    };
    const onClick = async event => {
        let button = event.target.closest('[data-inline-edit]');
        if (!button) return;
        const name = button.closest('[data-n]').dataset.n;
        await save(active);
        if (!button.isConnected) button = [...container.querySelectorAll('[data-n]')].find(row => row.dataset.n === name)?.querySelector('[data-inline-edit]');
        if (!button) return;
        const variable = getVariable(name);
        if (!variable) return;
        const numeric = ['number', 'counter'].includes(variable.type);
        const multiline = ['text', 'template'].includes(variable.type);
        const editor = document.createElement('div');
        editor.className = 'var-inline-editor';
        const input = document.createElement(multiline ? 'textarea' : 'input');
        input.className = 'var-inline-input';
        input.setAttribute('data-inline-value', '');
        input.setAttribute('aria-label', `${name} value`);
        if (multiline) input.rows = 2;
        else {
            input.type = numeric ? 'number' : 'text';
            if (numeric) input.step = 'any';
        }
        if (!numeric) input.maxLength = variable.type === 'image' ? 1000 : variable.type === 'font' ? 120 : 500;
        input.value = String(variable.value ?? '');
        const hint = document.createElement('small');
        hint.textContent = 'Enter saves · Escape cancels';
        editor.append(input, hint);
        const edit = { name, type: variable.type, button, editor, input, initialValue: input.value };
        active = edit;
        button.replaceWith(editor);
        input.addEventListener('keydown', event => {
            if (event.isComposing) return;
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                if (!edit.promise) finish(edit, null, true);
            } else if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void save(edit, true);
            }
        });
        input.addEventListener('blur', () => { void save(edit); });
        input.focus();
        input.select();
    };
    container.addEventListener('click', onClick);
    return {
        isEditing: () => {
            needsRender = Boolean(active) || pointerDown;
            if (!needsRender && frame) {
                cancelAnimationFrame(frame);
                frame = 0;
                pendingRestore.splice(0).forEach(restore);
            }
            return needsRender;
        },
        flush: () => save(active),
        dispose: () => {
            container.removeEventListener('click', onClick);
            container.removeEventListener('pointerdown', pressPointer, true);
            document.removeEventListener('pointerup', releasePointer);
            document.removeEventListener('pointercancel', releasePointer);
            if (frame) cancelAnimationFrame(frame);
            pendingRestore.splice(0).forEach(restore);
            if (active) active.editor.replaceWith(active.button);
            active = null;
        }
    };
}

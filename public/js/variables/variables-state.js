// Shared state and API helpers for Placeholders & Custom Variables

export const state = {
    status: {},
    customVars: [],
    variableSets: [],
    showSetVars: false,
    varQuery: '',
    varTypeFilter: 'all'
};

export function esc(v) {
    const d = document.createElement('div');
    d.textContent = v ?? '';
    return d.innerHTML;
}

export function toast(msg, type = 'info') {
    if (window.StreamPulse?.toast) window.StreamPulse.toast(msg, type);
    else console.log(`[${type}]`, msg);
}

export async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        toast(`Copied ${text}`, 'success');
    } catch {
        const t = document.createElement('textarea');
        t.value = text;
        document.body.append(t);
        t.select();
        document.execCommand('copy');
        t.remove();
        toast(`Copied ${text}`, 'success');
    }
}

export async function api(path, method = 'GET', body = null) {
    const opts = { method, headers: {} };
    if (body !== null) {
        opts.headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(body);
    }
    const res = await fetch(path, opts);
    if (!res.ok) {
        let msg = res.statusText;
        try {
            const err = await res.json();
            msg = err.error || err.message || msg;
        } catch {
            // ignore parse failure
        }
        throw new Error(msg);
    }
    return res.json();
}

export function slugId(raw) {
    return String(raw || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 32);
}

export function pickImage(currentUrl, onPick) {
    if (window.ImagePicker?.open) {
        window.ImagePicker.open({ value: currentUrl || '', onPick });
    } else {
        toast('Image Picker is still loading', 'error');
    }
}

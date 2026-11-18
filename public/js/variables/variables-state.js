// Shared state and API helpers for Placeholders & Custom Variables
import { api, esc, toast } from '../shared/client-core.js';
export { api, esc, toast };

export const state = {
    status: {},
    customVars: [],
    variableGroups: [],
    variableSets: [],
    variableSetsEnabled: true,
    overlays: [],
    showSetVars: false,
    varQuery: '',
    varGroupQuery: '',
    varTypeFilter: 'all',
    focusVar: ''
};

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

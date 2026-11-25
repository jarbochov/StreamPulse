'use strict';

const MAX_OPTIONS = 30;

function sanitizeOptionIcon(raw) {
    const cls = String(raw || '').trim()
        .replace(/^fab\b/, 'fa-brands')
        .replace(/^fas\b/, 'fa-solid')
        .replace(/^far\b/, 'fa-regular')
        .replace(/\s+/g, ' ')
        .slice(0, 80);
    return /^[a-z0-9 -]+$/i.test(cls) && /\bfa-[a-z0-9-]+/i.test(cls) ? cls : '';
}

function sanitizeOptionColor(raw) {
    const str = String(raw || '').trim();
    if (/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(str)) return str.toLowerCase();
    if (/^#[0-9a-f]{3}$/i.test(str)) return `#${str[1]}${str[1]}${str[2]}${str[2]}${str[3]}${str[3]}`.toLowerCase();
    return '';
}

function normalizeOptions(raw) {
    let list = [];
    if (Array.isArray(raw)) {
        list = raw;
    } else if (typeof raw === 'string') {
        const trimmed = raw.trim();
        if (trimmed.startsWith('[')) {
            try {
                const parsed = JSON.parse(trimmed);
                if (Array.isArray(parsed)) list = parsed;
            } catch {
                list = trimmed.split(/[\r\n,]+/);
            }
        } else {
            list = trimmed.split(/[\r\n,]+/);
        }
    }
    const seen = new Set();
    const out = [];
    for (const item of list) {
        if (out.length >= MAX_OPTIONS) break;
        const obj = typeof item === 'string' ? { value: item, label: item } : (item || {});
        const label = String(obj.label ?? obj.value ?? '').trim().slice(0, 60);
        const value = String(obj.value ?? obj.label ?? '').trim().slice(0, 60) || label;
        if (!value) continue;
        const key = value.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        const color = sanitizeOptionColor(obj.color);
        const icon = sanitizeOptionIcon(obj.icon);
        out.push({
            value,
            label: label || value,
            ...(color ? { color } : {}),
            ...(icon ? { icon } : {})
        });
    }
    return out;
}

function findOption(rawValue, options = []) {
    const needle = String(rawValue ?? '').trim().toLowerCase();
    if (!needle) return null;
    return options.find(opt => opt.value.toLowerCase() === needle)
        || options.find(opt => opt.label.toLowerCase() === needle)
        || null;
}

function normalizeSelectValue(rawValue, options = []) {
    if (!options.length) return String(rawValue ?? '').trim().slice(0, 60);
    const match = findOption(rawValue, options);
    return match ? match.value : options[0].value;
}

function resolveSelectMeta(rawValue, options = []) {
    const match = findOption(rawValue, options);
    if (match) {
        return {
            value: match.value,
            label: match.label || match.value,
            color: match.color || '',
            icon: match.icon || ''
        };
    }
    const val = String(rawValue ?? '').trim();
    return { value: val, label: val, color: '', icon: '' };
}

function normalizeTagsValue(rawValue, options = []) {
    let rawList = [];
    if (Array.isArray(rawValue)) {
        rawList = rawValue;
    } else if (typeof rawValue === 'string') {
        const trimmed = rawValue.trim();
        if (!trimmed) rawList = [];
        else if (trimmed.startsWith('[')) {
            try {
                const parsed = JSON.parse(trimmed);
                rawList = Array.isArray(parsed) ? parsed : [];
            } catch {
                rawList = trimmed.split(',');
            }
        } else {
            rawList = trimmed.split(',');
        }
    }
    const seen = new Set();
    const out = [];
    for (const item of rawList) {
        const str = String(item ?? '').trim().slice(0, 60);
        if (!str) continue;
        if (options.length) {
            const match = findOption(str, options);
            if (!match) continue;
            const k = match.value.toLowerCase();
            if (seen.has(k)) continue;
            seen.add(k);
            out.push(match.value);
        } else {
            const k = str.toLowerCase();
            if (seen.has(k)) continue;
            seen.add(k);
            out.push(str);
        }
        if (out.length >= MAX_OPTIONS) break;
    }
    if (options.length && out.length > 1) {
        const order = new Map(options.map((opt, idx) => [opt.value.toLowerCase(), idx]));
        out.sort((a, b) => (order.get(a.toLowerCase()) ?? 999) - (order.get(b.toLowerCase()) ?? 999));
    }
    return out;
}

function formatTagsValue(values = [], options = []) {
    const list = Array.isArray(values) ? values : normalizeTagsValue(values, options);
    return list.map(val => {
        const match = findOption(val, options);
        return match ? (match.label || match.value) : String(val);
    }).filter(Boolean).join(', ');
}

module.exports = {
    MAX_OPTIONS,
    normalizeOptions,
    findOption,
    normalizeSelectValue,
    resolveSelectMeta,
    normalizeTagsValue,
    formatTagsValue
};

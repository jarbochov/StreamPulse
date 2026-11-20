// Case-insensitive overlay URL parameters: ?fontScale=1.2 and ?fontscale=1.2 are equivalent.
// Also resolves variable-bound parameter tokens (var:name, var:name|fallback, {{var.name}}, {{var.name|fallback}})
// on overlay load/refresh via /api/variables with zero overhead when no variable tokens are used.
(function () {
    const VAR_TOKEN_TEST_RE = /(?:^var:[a-z0-9_.]|\{\{\s*var\.[a-z0-9_.])/i;
    const COMPACT_VAR_RE = /^var:([a-z0-9_.]+)(?:\|(.*))?$/i;
    const BRACE_EXACT_VAR_RE = /^\{\{\s*var\.([a-z0-9_.]+)\s*(?:\|([^{}]*?))?\s*\}\}$/i;
    const BRACE_INLINE_VAR_RE = /\{\{\s*var\.([a-z0-9_.]+)\s*(?:\|([^{}]*?))?\s*\}\}/gi;

    let cachedValues = null;

    function hasToken(raw) {
        if (typeof raw !== 'string' || !raw) return false;
        return VAR_TOKEN_TEST_RE.test(raw.trim());
    }

    function parseToken(raw) {
        if (typeof raw !== 'string' || !raw) return null;
        const trimmed = raw.trim();
        let m = trimmed.match(COMPACT_VAR_RE);
        if (m) {
            return {
                key: m[1].toLowerCase(),
                fallback: m[2] !== undefined ? m[2].trim() : '',
                syntax: 'compact'
            };
        }
        m = trimmed.match(BRACE_EXACT_VAR_RE);
        if (m) {
            return {
                key: m[1].toLowerCase(),
                fallback: m[2] !== undefined ? m[2].trim() : '',
                syntax: 'brace'
            };
        }
        return null;
    }

    function formatToken(key, fallback = '') {
        const cleanKey = String(key || '').trim().replace(/^var[.:]/i, '').toLowerCase();
        if (!cleanKey) return '';
        const fb = fallback !== undefined && fallback !== null ? String(fallback).trim() : '';
        return fb ? `var:${cleanKey}|${fb}` : `var:${cleanKey}`;
    }

    function ingestPayload(data) {
        const map = {};
        if (!data || typeof data !== 'object') return map;
        if (data.values && typeof data.values === 'object') {
            Object.entries(data.values).forEach(([k, v]) => {
                if (v !== undefined && v !== null) map[String(k).toLowerCase()] = String(v);
            });
        }
        if (Array.isArray(data.variables)) {
            data.variables.forEach(v => {
                if (!v || !v.name) return;
                const k = String(v.key || (v.group && !v.setId ? `${v.group}.${v.name}` : v.name)).toLowerCase();
                if (map[k] === undefined && v.value !== undefined && v.value !== null) {
                    map[k] = String(v.value);
                }
                const rawName = String(v.name).toLowerCase();
                if (map[rawName] === undefined && v.value !== undefined && v.value !== null) {
                    map[rawName] = String(v.value);
                }
            });
        }
        return map;
    }

    function ensureLoadedSync() {
        if (cachedValues !== null) return cachedValues;
        cachedValues = {};
        const XHR = (typeof window !== 'undefined' && window.XMLHttpRequest)
            || (typeof globalThis !== 'undefined' ? globalThis.XMLHttpRequest : undefined);
        if (typeof XHR !== 'function') return cachedValues;
        try {
            const xhr = new XHR();
            xhr.open('GET', '/api/variables', false);
            xhr.send(null);
            if (xhr.status >= 200 && xhr.status < 300 && xhr.responseText) {
                cachedValues = ingestPayload(JSON.parse(xhr.responseText));
            }
        } catch {}
        return cachedValues;
    }

    async function refreshAsync() {
        if (typeof fetch !== 'function') return cachedValues || {};
        try {
            const res = await fetch('/api/variables', { cache: 'no-store' });
            if (res.ok) {
                const data = await res.json();
                cachedValues = ingestPayload(data);
            }
        } catch {}
        return cachedValues || {};
    }

    function setValues(valuesMap) {
        if (!valuesMap || typeof valuesMap !== 'object') return;
        if (valuesMap.variables || valuesMap.values) {
            cachedValues = ingestPayload(valuesMap);
            return;
        }
        const next = {};
        Object.entries(valuesMap).forEach(([k, v]) => {
            if (v !== undefined && v !== null) next[String(k).toLowerCase()] = String(v);
        });
        cachedValues = next;
    }

    function lookupKey(map, key) {
        const k = String(key || '').toLowerCase();
        if (!k || !map) return undefined;
        if (map[k] !== undefined && map[k] !== '') return map[k];
        if (k.includes('.')) {
            const shortName = k.split('.').pop();
            if (map[shortName] !== undefined && map[shortName] !== '') return map[shortName];
        }
        return map[k];
    }

    function resolve(raw, customMap) {
        if (typeof raw !== 'string' || !hasToken(raw)) return raw;
        const map = customMap || (cachedValues !== null ? cachedValues : ensureLoadedSync());
        const exact = parseToken(raw);
        if (exact) {
            const found = lookupKey(map, exact.key);
            if (found !== undefined && found !== null && String(found).trim() !== '') {
                return String(found).trim();
            }
            return exact.fallback;
        }
        return raw.replace(BRACE_INLINE_VAR_RE, (_m, key, fb) => {
            const found = lookupKey(map, key);
            if (found !== undefined && found !== null && String(found).trim() !== '') {
                return String(found).trim();
            }
            return fb !== undefined ? fb.trim() : '';
        });
    }

    const origSearchParamsGet = typeof URLSearchParams !== 'undefined'
        ? (URLSearchParams.prototype.get.__origGet || URLSearchParams.prototype.get)
        : null;

    if (origSearchParamsGet && !URLSearchParams.prototype.get.__spVarPatched) {
        const patchedGet = function (name) {
            const val = origSearchParamsGet.call(this, name);
            if (val && hasToken(val) && !window.__SP_WIZARD_RAW_URL_PARAMS) {
                return window.OverlayVariableSettings.resolve(val);
            }
            return val;
        };
        patchedGet.__spVarPatched = true;
        patchedGet.__origGet = origSearchParamsGet;
        URLSearchParams.prototype.get = patchedGet;
    }

    function getRawParam(params, name) {
        if (!params) return null;
        if (typeof params.getRaw === 'function') return params.getRaw(name);
        if (origSearchParamsGet && params instanceof URLSearchParams) {
            return origSearchParamsGet.call(params, name);
        }
        return typeof params.get === 'function' ? params.get(name) : null;
    }

    if (!window.OverlayVariableSettings) {
        window.OverlayVariableSettings = {
            hasToken,
            parseToken,
            formatToken,
            resolve,
            setValues,
            refreshAsync,
            ensureLoadedSync,
            getRawParam,
            getValues: () => (cachedValues !== null ? cachedValues : ensureLoadedSync())
        };
    }

    window.overlayParams = function overlayParams(search = window.location.search) {
        const values = new Map();
        new URLSearchParams(search).forEach((value, key) => {
            const name = key.toLowerCase();
            if (!values.has(name)) values.set(name, value);
        });
        return {
            get: name => {
                if (!values.has(name.toLowerCase())) return null;
                const raw = values.get(name.toLowerCase());
                return (raw && hasToken(raw) && !window.__SP_WIZARD_RAW_URL_PARAMS)
                    ? window.OverlayVariableSettings.resolve(raw)
                    : raw;
            },
            getRaw: name => (values.has(name.toLowerCase()) ? values.get(name.toLowerCase()) : null),
            has: name => values.has(name.toLowerCase())
        };
    };
})();

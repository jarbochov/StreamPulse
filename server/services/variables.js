// Named variables (text) and counters (numbers), shared by overlays, chat bot, API and Companion.
const fs = require('fs');
const path = require('path');

const NAME_RE = /^[a-z0-9_]{1,40}$/;

module.exports = function createVariables({ dataDir }) {
    const file = path.join(dataDir, 'variables.json');
    let vars = {};

    try { vars = JSON.parse(fs.readFileSync(file, 'utf8')) || {}; } catch { /* first run */ }

    function save() {
        fs.mkdirSync(dataDir, { recursive: true });
        fs.writeFileSync(`${file}.tmp`, JSON.stringify(vars, null, 2));
        fs.renameSync(`${file}.tmp`, file);
    }

    const normName = name => String(name || '').toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 40);
    const list = () => Object.entries(vars).map(([name, v]) => ({ name, ...v }));
    // Flat map for placeholders: {{var.name}}
    const values = () => Object.fromEntries(Object.entries(vars).map(([name, v]) => [name, v.value]));

    function set(name, patch) {
        name = normName(name);
        if (!NAME_RE.test(name)) throw new Error('Name must be letters, numbers or underscore');
        const cur = vars[name];
        const type = ['counter', 'text', 'list'].includes(patch.type) ? patch.type : cur?.type || 'text';
        if (type === 'list') {
            const raw = patch.items ?? cur?.items ?? [];
            const items = (Array.isArray(raw) ? raw : String(raw).split(/\r?\n/)).map(i => String(i).trim().slice(0, 300)).filter(Boolean).slice(0, 200);
            const mode = patch.mode === 'sequential' ? 'sequential' : patch.mode === 'random' ? 'random' : cur?.mode || 'random';
            let value = patch.value ?? cur?.value ?? '';
            if (!items.includes(value)) value = items[0] || '';
            vars[name] = { type, items, mode, value, updatedAt: Date.now() };
            save();
            return { name, ...vars[name] };
        }
        if (!cur && Object.keys(vars).length >= 300) throw new Error('Too many variables');
        let value = patch.value ?? cur?.value ?? (type === 'counter' ? 0 : '');
        value = type === 'counter' ? (Number.isFinite(Number(value)) ? Number(value) : 0) : String(value).slice(0, 500);
        vars[name] = { type, value, initial: type === 'counter' ? Number(patch.initial ?? cur?.initial ?? 0) || 0 : undefined, updatedAt: Date.now() };
        save();
        return { name, ...vars[name] };
    }

    function change(name, action, amount) {
        name = normName(name);
        const cur = vars[name] || { type: 'counter', value: 0, initial: 0 };
        if (cur.type !== 'counter') throw new Error('Not a counter');
        const by = Number.isFinite(Number(amount)) && amount !== '' && amount !== undefined ? Number(amount) : 1;
        const value = action === 'reset' ? cur.initial || 0 : cur.value + (action === 'decrement' ? -by : by);
        return set(name, { type: 'counter', value });
    }

    function roll(name) {
        name = normName(name);
        const cur = vars[name];
        if (!cur || cur.type !== 'list') throw new Error('Not a list');
        const { items } = cur;
        let value = cur.value;
        if (items.length > 1) {
            if (cur.mode === 'sequential') value = items[(items.indexOf(cur.value) + 1) % items.length];
            else { const others = items.filter(i => i !== cur.value); value = others[Math.floor(Math.random() * others.length)]; }
        }
        return set(name, { value });
    }

    async function handleApi(req, res, pathname, readBody) {
        const json = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
        try {
            const body = req.method === 'GET' || req.method === 'DELETE' ? {} : JSON.parse(await readBody(req) || '{}');
            if (pathname === '/api/variables' && req.method === 'GET') return json(200, { variables: list() }), true;
            const m = pathname.match(/^\/api\/variables\/([^/]+)(?:\/(increment|decrement|reset|roll))?$/);
            if (!m) return json(404, { error: 'Unknown variables endpoint' }), true;
            const name = decodeURIComponent(m[1]);
            const query = req.method === 'GET' ? Object.fromEntries(new URL(req.url, 'http://localhost').searchParams) : {};
            if (m[2] === 'roll' && (req.method === 'POST' || req.method === 'GET')) return json(200, roll(name)), true;
            if (m[2] && (req.method === 'POST' || req.method === 'GET')) return json(200, change(name, m[2], query.amount ?? body.amount)), true;
            if (req.method === 'PUT' || req.method === 'POST') return json(200, set(name, body)), true;
            if (req.method === 'DELETE') { delete vars[normName(name)]; save(); return json(200, { variables: list() }), true; }
            if (req.method === 'GET') {
                const v = vars[normName(name)];
                if (query.raw === '1' || query.plain === '1' || query.format === 'text') {
                    res.writeHead(v ? 200 : 404, { 'Content-Type': 'text/plain; charset=utf-8' });
                    res.end(v ? String(v.value ?? '') : '');
                    return true;
                }
                return json(v ? 200 : 404, v ? { name: normName(name), ...v } : { error: 'Not found' }), true;
            }
        } catch (err) {
            return json(400, { error: err.message }), true;
        }
        return json(405, { error: 'Method not allowed' }), true;
    }

    return { handleApi, values, list, set, change, roll };
};

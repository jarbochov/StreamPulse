const fs = require('fs');
const path = require('path');
const { variableGroupKey } = require('../../shared/variable-paths.cjs');

const normalizeGroup = value => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 60);

module.exports = function createVariableGroups(dataDir) {
    const file = path.join(dataDir, 'variable-groups.json');
    let names = new Set();
    let saved = '';
    function reload() {
        try {
            const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
            names = new Set((Array.isArray(raw) ? raw : []).map(normalizeGroup).filter(Boolean));
        } catch { names = new Set(); }
        saved = JSON.stringify([...names]);
    }
    reload();
    function validate(name, previous = '') {
        const key = variableGroupKey(name);
        if (!key) throw new Error('Group names must include letters or numbers for their placeholder namespace');
        if ([...names].some(group => group !== name && group !== previous && variableGroupKey(group) === key)) {
            throw new Error(`Another group already uses the "${key}" placeholder namespace`);
        }
    }
    return {
        normalize: normalizeGroup,
        list: () => [...names],
        restore: snapshot => { names = new Set(snapshot); },
        reload,
        add(value) {
            const name = normalizeGroup(value);
            if (!name) throw new Error('Group name is required');
            validate(name);
            if (!names.has(name) && names.size >= 100) throw new Error('Too many Variable Groups');
            names.add(name);
            return name;
        },
        rename(previous, value) {
            const name = normalizeGroup(value);
            if (!name) throw new Error('Group name is required');
            validate(name, previous);
            if (!names.has(previous)) throw new Error('Variable Group not found');
            if (previous !== name && names.has(name)) throw new Error('A group with this name already exists');
            names = new Set([...names].map(group => group === previous ? name : group));
            return name;
        },
        save() {
            const json = JSON.stringify([...names]);
            if (json === saved) return;
            fs.mkdirSync(dataDir, { recursive: true });
            fs.writeFileSync(`${file}.tmp`, json);
            fs.renameSync(`${file}.tmp`, file);
            saved = json;
        }
    };
};

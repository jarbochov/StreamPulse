// Shared {{placeholder}} chooser used by the overlay editor and the chat bot page.
// PlaceholderPicker.open({ getStatus, getContext, onPick(token), extraGroups?, extraValues? })
(function (root) {
    const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
    const matches = (query, text) => query.split(/\s+/).every(term => text.toLowerCase().includes(term));
    let dialog = null, options = null;

    function injectStyles() {
        if (document.getElementById('sp-picker-style')) return;
        const link = document.createElement('link');
        link.id = 'sp-picker-style';
        link.rel = 'stylesheet';
        link.href = '/css/placeholder-picker.css';
        document.head.append(link);
    }

    function build() {
        injectStyles();
        dialog = document.createElement('dialog');
        dialog.id = 'sp-picker';
        dialog.innerHTML = `<h3 id="sp-title">Insert placeholder</h3>
            <p id="sp-subtitle" class="hint" style="margin:0 0 .5rem">Live values update as data changes. Click one to insert it at your cursor.</p>
            <input id="sp-search" type="search" aria-label="Search placeholders" placeholder="Search timers, clock, events, goals…">
            <div class="sp-fmt"><span>Format <span class="hint">(optional; dates, timer clocks and lists)</span></span>
                <input id="sp-format" list="sp-format-presets" placeholder="e.g. dddd, MMM D · h:mm A" spellcheck="false"><datalist id="sp-format-presets"></datalist>
                <span class="hint">YYYY year · MMMM/MMM/MM month · dddd/ddd weekday · D/Do/DD day · h/hh/H/HH hour · mm minutes · ss seconds · A am/pm · [text] literal</span>
                <span class="hint"><strong>Lists</strong> (like the game plan) have format buttons under them. Type any separator in their box to join items your way, e.g. <code> / </code> or <code> • </code>.</span></div>
            <div id="sp-list"></div>
            <div class="sp-actions"><button type="button" id="sp-close">Close</button></div>`;
        document.body.append(dialog);
        const $ = id => dialog.querySelector(`#${id}`);
        $('sp-search').addEventListener('input', render);
        $('sp-format').addEventListener('input', render);
        $('sp-close').addEventListener('click', () => dialog.close());
        $('sp-list').addEventListener('click', event => {
            const numberButton = event.target.closest('[data-number-key]');
            if (numberButton) {
                const details = numberButton.closest('details');
                const read = name => details.querySelector(`[name="${name}"]`).value;
                const token = `${numberButton.dataset.numberKey}|number:${read('digits')}:${read('separator')}:${encodeURIComponent(read('prefix'))}:${encodeURIComponent(read('suffix'))}`;
                options.onPick(token, { raw: false });
                dialog.close();
                return;
            }
            const sepKey = event.target.closest('[data-sep-key]');
            const tokenBtn = event.target.closest('[data-token]');
            let token = tokenBtn?.dataset.token;
            const raw = tokenBtn?.dataset.rawToken === '1';
            if (sepKey) {
                const rawSep = sepKey.parentElement.querySelector('.sep-input').value;
                if (!rawSep) { options.onWarn?.('Type a separator first.'); return; }
                token = `${sepKey.dataset.sepKey}|sep:${rawSep.replace(/^ /, '\\s').replace(/ $/, '\\s').replace(/\n/g, '\\n')}`;
            }
            if (!token) return;
            options.onPick(token, { raw });
            dialog.close();
        });
    }

    function looksLikeCssColor(value) {
        const s = String(value || '').trim();
        return /^#[0-9a-f]{3,8}$/i.test(s) || /^rgba?\([^)]+\)$/i.test(s) || /^hsla?\([^)]+\)$/i.test(s);
    }

    function buildColorGroups(status, table) {
        const groups = [];
        const memberColors = Array.isArray(options.memberColorFields) ? options.memberColorFields : [];
        if (memberColors.length) {
            groups.push({
                label: 'Member Fields (Per-Member Color)',
                items: memberColors.map(mf => ({
                    key: `@${mf.key}`,
                    label: mf.label || mf.key,
                    preview: mf.sample || '',
                    raw: true
                }))
            });
        }
        const customColorVars = (status?.customVars || []).filter(v => v && !v.hidden && !v.setId && v.type === 'color' && v.name);
        if (customColorVars.length) {
            groups.push({
                label: 'Global Color Variables',
                items: customColorVars.map(v => ({
                    key: `var.${v.name}`,
                    label: v.label || v.name,
                    preview: v.value || table[`var.${v.name}`] || ''
                }))
            });
        }
        const setItems = root.OverlayShared.variableGroups(status).flatMap(group =>
            group.items.filter(([, , meta]) => meta?.type === 'color' && !meta.list)
                .map(([key, label, meta]) => ({ key, label, preview: meta.preview, state: meta.state })));
        if (setItems.length) {
            groups.push({ label: 'Variable Set Colors', items: setItems });
        }
        return groups;
    }

    function render() {
        const shared = root.OverlayShared;
        const status = options.getStatus() || {};
        const table = shared.variableTable(status, options.getContext?.() || {});
        const query = dialog.querySelector('#sp-search').value.trim().toLowerCase();
        const colorMode = options.filter === 'color';
        if (options.filter === 'number') {
            const vars = (status.customVars || []).filter(v => !v.hidden && !v.setId && ['number', 'counter'].includes(v.type));
            const bindable = new Set((status.customVars || []).filter(v => !v.hidden && ['number', 'counter'].includes(v.type)).map(v => `var.${v.name}`));
            const groups = [{ label: 'Custom Numbers', items: vars.map(v => [`var.${v.name}`, v.name, { preview: v.value, search: v.group }]) },
                ...shared.variableGroups(status).map(group => ({ ...group, items: group.items.filter(([key, , meta]) => bindable.has(key) && ['number', 'counter'].includes(meta?.type) && !meta.list) }))];
            dialog.querySelector('#sp-list').innerHTML = groups.map(group => {
                const items = group.items.filter(([key, label, meta]) => !query || matches(query, `${group.label} ${key} ${label} ${meta.preview ?? ''} ${meta.search || ''}`));
                return items.length ? `<h4>${esc(group.label)}</h4>` + items.map(([key, label, meta]) =>
                    `<button type="button" data-token="${esc(key)}"><span>${esc(label)}</span><code>{{${esc(key)}}}</code><span class="preview">${esc(meta.preview === '' ? meta.state || 'Empty' : meta.preview)}</span></button>`
                ).join('') : '';
            }).join('')
                || '<p class="hint">No Number variables match. Create one in <a href="/tools/placeholders.html#variables" target="_blank" rel="noopener">Variables</a>.</p>';
            return;
        }

        if (colorMode) {
            const groups = buildColorGroups(status, table);
            const html = groups.map(group => {
                const items = group.items.filter(item => !query || matches(query, `${group.label} ${item.key} ${item.label} ${item.preview || ''}`));
                if (!items.length) return '';
                return `<h4>${esc(group.label)}</h4>` + items.map(item => {
                    const previewColor = item.preview || '';
                    const swatch = looksLikeCssColor(previewColor)
                        ? `<span class="sp-color-dot" style="background-color:${esc(previewColor)}"></span>`
                        : '';
                    const codeText = item.raw ? item.key : `{{${item.key}}}`;
                    return `<button type="button" data-token="${esc(item.key)}"${item.raw ? ' data-raw-token="1"' : ''}><span>${esc(item.label)}</span><code>${esc(codeText)}</code><span class="preview">${swatch}<span>${esc(previewColor || item.state || (item.raw ? 'Per member' : 'Empty'))}</span></span></button>`;
                }).join('');
            }).join('');
            dialog.querySelector('#sp-list').innerHTML = html || '<p class="hint">No color variables or member color fields defined yet. Create a Color variable in Variables &amp; Placeholders.</p>';
            return;
        }

        const format = dialog.querySelector('#sp-format').value.trim();
        dialog.querySelector('#sp-format-presets').innerHTML = [...shared.FORMAT_PRESETS, ...shared.LIST_FORMAT_PRESETS].map(([value, label]) => `<option value="${esc(value)}">${esc(label)}</option>`).join('');
        let groups = shared.variableGroups(status);
        if (options.isChatbot) {
            table['user'] = 'Alice';
            table['target'] = 'Bob';
            table['args'] = 'tea coffee';
            table['arg.1'] = 'tea';
            table['arg.2'] = 'coffee';
            table['viewers'] = '42';
            table['random 1 6'] = '4';
            table['choice Option A|Option B'] = 'Option A';
            groups = [
                {
                    label: 'Chat Bot Arguments & Helpers',
                    items: [
                        ['user', 'Chatter name who typed command'],
                        ['target', 'Target user from args (@Bob -> Bob)'],
                        ['args', 'All arguments after command'],
                        ['arg.1', 'First argument word (e.g. tea)'],
                        ['arg.2', 'Second argument word (e.g. coffee)'],
                        ['viewers', 'Viewer count of incoming raid in shoutouts'],
                        ['random 1 6', 'Random integer / dice roll (min max)'],
                        ['choice Option A|Option B', 'Pick one random choice (pipe-separated)']
                    ]
                },
                ...groups
            ];
        }
        if (options.extraGroups?.length) {
            Object.assign(table, options.extraValues || {});
            groups = [...options.extraGroups, ...groups];
        }
        const html = groups.map(group => {
            const items = group.items.filter(([key, label, meta]) => !query || matches(query, `${group.label} ${key} ${label} ${meta?.search || ''} ${meta?.preview ?? table[key] ?? ''}`));
            if (!items.length) return '';
            return `<h4>${esc(group.label)}</h4>` + items.map(([key, label, meta]) => {
                const listed = meta?.list || shared.isListKey(key, table);
                const dated = format && (listed ? shared.isListFormat(format) : (shared.isDateKey(key) || ['date', 'datetime'].includes(meta?.type)) && !shared.isListFormat(format));
                const value = dated ? shared.applyFormat(key, table[key], format, Date.now(), table) : table[key];
                const preview = value === undefined || value === null || value === '' ? meta?.state || 'Empty' : String(value);
                const token = dated ? `${key}|${format}` : key;
                const numeric = !listed && ((status.customVars || []).find(v => `var.${v.name}` === key && ['number', 'counter'].includes(v.type)) || (['number', 'counter'].includes(meta?.type) ? meta : null));
                const numberOptions = numeric ? `<details class="sp-number-format"><summary>Number formatting</summary><div class="sp-number-fields">
                    <label>Decimal places<select name="digits">${Array.from({ length: 13 }, (_, i) => `<option value="${i}"${i === (numeric.precision ?? 0) ? ' selected' : ''}>${i}</option>`).join('')}</select></label>
                    <label>Separators<select name="separator"><option value="comma">1,234.56</option><option value="period">1.234,56</option><option value="space">1 234.56</option><option value="none">1234.56</option></select></label>
                    <label>Prefix<input name="prefix" maxlength="60" placeholder="e.g. $"></label><label>Suffix<input name="suffix" maxlength="60" placeholder="e.g.  points"></label>
                    <button type="button" data-number-key="${esc(key)}">Insert formatted number</button></div></details>` : '';
                const chips = listed ? `<div class="chips">${[['', 'Comma'], ['lines', 'Lines'], ['bullets', 'Bullets'], ['numbered', 'Numbered'], ['3', 'First 3']].map(([f, name]) => `<button type="button" class="chip" data-token="${esc(f ? `${key}|${f}` : key)}">${name}</button>`).join('')}<span class="sep"><input type="text" class="sep-input" placeholder="custom separator, e.g. / " spellcheck="false" aria-label="Custom separator"><button type="button" class="chip" data-sep-key="${esc(key)}">Insert</button></span></div>` : '';
                return `<button type="button" data-token="${esc(token)}"><span>${esc(label)}</span><code>{{${esc(token)}}}</code><span class="preview">${esc(preview)}</span></button>${chips}${numberOptions}`;
            }).join('');
        }).join('');
        dialog.querySelector('#sp-list').innerHTML = html || '<p class="hint">No placeholders match.</p>';
    }

    function open(opts) {
        options = opts || {};
        if (!dialog) build();
        const isColor = options.filter === 'color';
        dialog.classList.toggle('is-color-mode', isColor || options.filter === 'number');
        dialog.querySelector('#sp-title').textContent = options.title || (isColor ? 'Bind color variable' : 'Insert placeholder');
        dialog.querySelector('#sp-subtitle').textContent = options.subtitle || (isColor ? 'Click a color variable or member color field to bind it dynamically.' : 'Live values update as data changes. Click one to insert it at your cursor.');
        dialog.querySelector('#sp-search').placeholder = options.filter === 'number' ? 'Search Number variables or groups...' : isColor ? 'Search color variables or member fields…' : 'Search timers, clock, events, goals…';
        dialog.querySelector('#sp-search').value = '';
        render();
        dialog.showModal();
        dialog.querySelector('#sp-search').focus();
        const requestOptions = options;
        const status = options.getStatus() || {};
        if (status.modules?.variableSets !== false && !Array.isArray(status.variableSets)) {
            fetch('/api/variables', { cache: 'no-store' }).then(response => response.ok ? response.json() : null).then(data => {
                if (!data || requestOptions !== options || !dialog.open) return;
                const current = options.getStatus();
                if (!current || current.modules?.variableSets === false) return;
                if (typeof data.variableSetsEnabled === 'boolean') current.modules = { ...current.modules, variableSets: data.variableSetsEnabled };
                current.variableSets = data.variableSetsEnabled === false ? [] : Array.isArray(data.sets) ? data.sets : [];
                render();
            }).catch(() => {});
        }
    }

    // Inserts {{token}} at the cursor of a text field and fires an input event so listeners pick it up.
    function insertInto(field, token) {
        field.setRangeText(`{{${token}}}`, field.selectionStart, field.selectionEnd, 'end');
        const cursor = field.selectionStart;
        field.dispatchEvent(new Event('input', { bubbles: true }));
        queueMicrotask(() => {
            if (!field.isConnected) return;
            field.focus();
            field.setSelectionRange(cursor, cursor);
        });
    }

    root.PlaceholderPicker = { open, insertInto };
})(window);

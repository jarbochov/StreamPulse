// Shared {{placeholder}} chooser used by the overlay editor and the chat bot page.
// PlaceholderPicker.open({ getStatus, getContext, onPick(token) })
(function (root) {
    const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
    let dialog = null, options = null;

    function injectStyles() {
        if (document.getElementById('sp-picker-style')) return;
        const style = document.createElement('style');
        style.id = 'sp-picker-style';
        style.textContent = `
        #sp-picker { width: min(640px, 92vw); max-width: 640px; background: var(--panel, var(--bg-card)); color: var(--text); border: 1px solid var(--border); border-radius: 12px; padding: 1.2rem 1.4rem; }
        #sp-picker::backdrop { background: #000a; }
        #sp-picker h3 { margin: 0 0 .4rem; }
        #sp-picker .hint { color: var(--muted, var(--text-muted)); font-size: 11px; line-height: 1.45; margin: 0; }
        #sp-picker input { width: 100%; padding: .45rem .6rem; background: var(--bg-inset, var(--panel)); border: 1px solid var(--border); border-radius: 6px; color: var(--text); font: inherit; font-size: .85rem; }
        #sp-picker button { cursor: pointer; border: 1px solid var(--border); border-radius: 6px; background: var(--bg-raised, var(--panel)); color: var(--text); font: inherit; font-size: .82rem; padding: .4rem .7rem; }
        #sp-picker button:hover { border-color: var(--accent); }
        #sp-picker .sp-fmt { display: grid; gap: .25rem; margin-top: .6rem; color: var(--muted, var(--text-muted)); font-size: 11px; }
        #sp-picker .sp-actions { display: flex; justify-content: flex-end; margin-top: 1rem; }
        #sp-list { max-height: 55vh; overflow: auto; margin-top: .6rem; }
        #sp-list h4 { margin: .8rem 0 .3rem; font-size: .75rem; text-transform: uppercase; letter-spacing: .05em; color: var(--muted, var(--text-muted)); }
        #sp-list > button { display: grid; grid-template-columns: 1fr auto; gap: .2rem .8rem; width: 100%; text-align: left; margin-bottom: .25rem; }
        #sp-list code { grid-column: 1; font-size: .72rem; color: var(--muted, var(--text-muted)); }
        #sp-list .sep { display: inline-flex; gap: .3rem; margin-left: auto; }
        #sp-list .sep-input { width: 11rem; padding: .15rem .4rem; font-size: .7rem; }
        #sp-list .chips { display: flex; flex-wrap: wrap; gap: .3rem; align-items: center; margin: -.1rem 0 .4rem .5rem; font-size: .7rem; color: var(--muted, var(--text-muted)); }
        #sp-list .chip { width: auto; margin: 0; padding: .15rem .5rem; font-size: .7rem; display: inline-block; }
        #sp-list .preview { grid-row: 1 / span 2; grid-column: 2; align-self: center; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--accent); }`;
        document.head.append(style);
    }

    function build() {
        injectStyles();
        dialog = document.createElement('dialog');
        dialog.id = 'sp-picker';
        dialog.innerHTML = `<h3>Insert placeholder</h3>
            <p class="hint" style="margin:0 0 .5rem">Live values update as data changes. Click one to insert it at your cursor.</p>
            <input id="sp-search" type="search" placeholder="Search timers, clock, events, goals…">
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
            const sepKey = event.target.closest('[data-sep-key]');
            let token = event.target.closest('[data-token]')?.dataset.token;
            if (sepKey) {
                const raw = sepKey.parentElement.querySelector('.sep-input').value;
                if (!raw) { options.onWarn?.('Type a separator first.'); return; }
                token = `${sepKey.dataset.sepKey}|sep:${raw.replace(/^ /, '\\s').replace(/ $/, '\\s').replace(/\n/g, '\\n')}`;
            }
            if (!token) return;
            dialog.close();
            options.onPick(token);
        });
    }

    function render() {
        const shared = root.OverlayShared;
        const status = options.getStatus() || {};
        const table = shared.variableTable(status, options.getContext?.() || {});
        const query = dialog.querySelector('#sp-search').value.trim().toLowerCase();
        const format = dialog.querySelector('#sp-format').value.trim();
        dialog.querySelector('#sp-format-presets').innerHTML = [...shared.FORMAT_PRESETS, ...shared.LIST_FORMAT_PRESETS].map(([value, label]) => `<option value="${esc(value)}">${esc(label)}</option>`).join('');
        const html = shared.variableGroups(status).map(group => {
            const items = group.items.filter(([key, label]) => !query || `${group.label} ${key} ${label}`.toLowerCase().includes(query));
            if (!items.length) return '';
            return `<h4>${esc(group.label)}</h4>` + items.map(([key, label]) => {
                const listed = shared.isListKey(key);
                const dated = format && (listed ? shared.isListFormat(format) : shared.isDateKey(key) && !shared.isListFormat(format));
                const value = dated ? shared.applyFormat(key, table[key], format, Date.now()) : table[key];
                const preview = value === undefined || value === null || value === '' ? '—' : String(value);
                const token = dated ? `${key}|${format}` : key;
                const chips = listed ? `<div class="chips">${[['', 'Comma'], ['lines', 'Lines'], ['bullets', 'Bullets'], ['numbered', 'Numbered'], ['3', 'First 3']].map(([f, name]) => `<button type="button" class="chip" data-token="${esc(f ? `${key}|${f}` : key)}">${name}</button>`).join('')}<span class="sep"><input type="text" class="sep-input" placeholder="custom separator, e.g. / " spellcheck="false" aria-label="Custom separator"><button type="button" class="chip" data-sep-key="${esc(key)}">Insert</button></span></div>` : '';
                return `<button type="button" data-token="${esc(token)}"><span>${esc(label)}</span><code>{{${esc(token)}}}</code><span class="preview">${esc(preview)}</span></button>${chips}`;
            }).join('');
        }).join('');
        dialog.querySelector('#sp-list').innerHTML = html || '<p class="hint">No placeholders match.</p>';
    }

    function open(opts) {
        options = opts;
        if (!dialog) build();
        dialog.querySelector('#sp-search').value = '';
        render();
        dialog.showModal();
        dialog.querySelector('#sp-search').focus();
    }

    // Inserts {{token}} at the cursor of a text field and fires an input event so listeners pick it up.
    function insertInto(field, token) {
        field.focus();
        field.setRangeText(`{{${token}}}`, field.selectionStart, field.selectionEnd, 'end');
        field.dispatchEvent(new Event('input', { bubbles: true }));
    }

    root.PlaceholderPicker = { open, insertInto };
})(window);

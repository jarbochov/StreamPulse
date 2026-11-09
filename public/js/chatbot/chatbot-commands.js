/**
 * StreamPulse — Chatbot Studio Commands Controller
 */

import { $, esc, svgIcon, toast, api, state, prefixOf, liveStatus, download } from './chatbot-state.js';

export function httpActionHtml(c) {
    const hasHttp = Boolean(c.httpAction?.enabled || c._httpAction);
    const httpUrl = c.httpAction?.url || '';
    const httpMethod = c.httpAction?.method || 'GET';
    const httpBody = c.httpAction?.body || '';

    return `<div class="action-preset-box">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:.5rem;">
            <label class="check" style="font-weight:600;"><input type="checkbox" data-k="useHttp" ${hasHttp ? 'checked' : ''}> ${svgIcon('link')} Trigger API / Webhook / Bitfocus Companion</label>
            <div class="row" style="margin:0;display:${hasHttp ? 'flex' : 'none'};">
                <select data-act="preset-pick" style="padding:.2rem .4rem;font-size:.78rem;background:var(--bg-card);border:1px solid var(--border);border-radius:4px;color:var(--text);">
                    <option value="">Choose preset helper...</option>
                    <option value="companion-v3">Bitfocus Companion v3 (Page / Row / Col)</option>
                    <option value="companion-v2">Bitfocus Companion v2 (Page / Button)</option>
                    <option value="companion-var">Bitfocus Companion: Custom Variable</option>
                    <option value="sp-randomizer">StreamPulse: Randomizer Spin</option>
                    <option value="sp-timer">StreamPulse: Timer Control</option>
                    <option value="sp-alert-replay">StreamPulse: Replay Last Alert</option>
                    <option value="sp-highlight">StreamPulse: Pin Last Highlight</option>
                </select>
            </div>
        </div>
        <div class="http-fields" style="display:${hasHttp ? 'flex' : 'none'};flex-direction:column;gap:.5rem;margin-top:.2rem;">
            <div class="row" style="align-items:flex-end;">
                <label class="f" style="width:5.5rem;"><span>Method</span><select data-k="httpMethod">${['GET', 'POST', 'PUT', 'DELETE'].map(m => `<option value="${m}" ${httpMethod === m ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
                <label class="f" style="flex:1;min-width:240px;"><span>Target URL (supports tokens e.g. {{user}}, {{arg.1}}, relative /api/...)</span><input data-k="httpUrl" value="${esc(httpUrl)}" placeholder="http://127.0.0.1:8000/press/bank/1/1 or /api/randomizer/spin"></label>
                <button class="btn small" data-act="test-http" type="button" style="align-self:flex-end;">${svgIcon('send')} Test API Call</button>
            </div>
            <label class="f" style="width:100%;${httpMethod === 'GET' ? 'display:none;' : ''}" data-k-wrap="httpBody">
                <span>JSON Body (for POST/PUT)</span>
                <textarea data-k="httpBody" rows="2" maxlength="2000" placeholder='{"user": "{{user}}", "preset": "wheel"}'>${esc(httpBody)}</textarea>
            </label>
            <div class="http-test-status muted" style="font-size:.76rem;font-family:ui-monospace,Menlo,monospace;" data-http-status></div>
        </div>
    </div>`;
}

export function readHttpAction(item) {
    const useHttp = item.querySelector('[data-k="useHttp"]')?.checked || false;
    if (!useHttp) return null;
    return {
        enabled: true,
        method: item.querySelector('[data-k="httpMethod"]')?.value || 'GET',
        url: item.querySelector('[data-k="httpUrl"]')?.value || '',
        body: item.querySelector('[data-k="httpBody"]')?.value || ''
    };
}

export function commandHtml(c, i) {
    const aliasesArr = Array.isArray(c.aliases) ? c.aliases : String(c.aliases || '').split(',').map(s => s.trim()).filter(Boolean);
    const aliasesStr = aliasesArr.join(', ');
    const preview = String(c.response || '').split('\\n')[0].slice(0, 60);
    const hasHttp = Boolean(c.httpAction?.enabled || c._httpAction);
    const httpUrl = c.httpAction?.url || '';

    return `<details class="item" data-i="${i}" ${c._open ? 'open' : ''}>
        <summary class="item-summary">
            <div class="item-summary-left">
                <span class="cmd-badge">${esc(c.name ? prefixOf() + c.name : 'New command')}</span>
                ${aliasesStr ? `<span class="alias-tag">${esc(aliasesStr)}</span>` : ''}
                ${c.silent ? `<span class="meta-pill silent-pill">${svgIcon('volumeX')} Silent</span>` : ''}
                ${hasHttp && httpUrl ? `<span class="meta-pill api-pill">${svgIcon('link')} API</span>` : ''}
                <span class="sum-text">${esc(c.silent && !preview ? (httpUrl || 'Silent background action') : preview)}</span>
            </div>
            <div class="item-summary-right">
                ${c.cooldown ? `<span class="meta-pill">${esc(c.cooldown)}s</span>` : ''}
                ${c.access && c.access !== 'everyone' ? `<span class="meta-pill">${esc(c.access)}</span>` : ''}
                <label class="check" onclick="event.stopPropagation()"><input type="checkbox" data-k="enabled" ${c.enabled !== false ? 'checked' : ''}> On</label>
            </div>
        </summary>
        <div class="item-body">
            <div class="grid" style="grid-template-columns: minmax(130px, 1fr) minmax(130px, 1fr) 110px 140px auto;">
                <label class="f"><span>Command name</span><input data-k="name" value="${esc(c.name)}" placeholder="song"></label>
                <label class="f"><span>Aliases (comma-separated)</span><input data-k="aliases" value="${esc(aliasesStr)}" placeholder="np, track"></label>
                <label class="f"><span>Cooldown (s)</span><input data-k="cooldown" type="number" min="0" value="${c.cooldown ?? ''}" placeholder="default"></label>
                <label class="f"><span>Who can use</span><select data-k="access"><option value="everyone">Everyone</option><option value="subs" ${c.access === 'subs' ? 'selected' : ''}>Subscribers + mods</option><option value="mods" ${c.access === 'mods' ? 'selected' : ''}>Mods only</option></select></label>
                <label class="check" style="align-self:flex-end;padding-bottom:.55rem;" title="Suppress chat reply (execute background action or webhook quietly)"><input type="checkbox" data-k="silent" ${c.silent ? 'checked' : ''}> Silent command</label>
            </div>
            <label class="f" style="width:100%;">
                <span style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.2rem;">
                    <span>Command reply ${c.silent ? '<span class="muted">(optional in silent mode)</span>' : ''}</span>
                    <button type="button" class="btn small" data-act="placeholder">${svgIcon('plus')} Insert placeholder</button>
                </span>
                <textarea data-k="response" rows="2" maxlength="1000" placeholder="${c.silent ? 'Optional: leave blank for pure silent action' : 'Now playing: {{track}} by {{artist}}'}">${esc(c.response)}</textarea>
            </label>
            <div class="preview-box" data-preview></div>

            <!-- API / Webhook Action Section -->
            ${httpActionHtml(c)}

            <details class="item-advanced" ${c._advancedOpen ? 'open' : ''}>
                <summary>${svgIcon('gear')} Advanced settings (limits, mod cooldown, counters)</summary>
                <div class="item-advanced-body">
                    <div class="row">
                        <label class="check" title="Mod cooldown"><input data-k="modCooldown" type="number" min="0" style="width:4.5rem;" value="${c.modCooldown ?? ''}" placeholder="default"> Mod cooldown (s)</label>
                        <label class="check" title="Per-user cooldown (seconds)"><input data-k="userCooldown" type="number" min="0" style="width:4.5rem;" value="${c.userCooldown ?? ''}" placeholder="none"> User cooldown (s)</label>
                        <label class="check" title="Limit per person"><input data-k="limit" type="number" min="1" style="width:4.5rem;" value="${c.limit ?? ''}" placeholder="none"> Limit per <select data-k="limitPer" style="padding:.2rem .4rem;">${[['session','session'],['day','day'],['forever','all time']].map(([v, l]) => `<option value="${v}" ${c.limitPer === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
                        <label class="check" title="One reply per line, random one picked"><input type="checkbox" data-k="random" ${c.random ? 'checked' : ''}> Random line</label>
                    </div>
                    <div style="margin-top:.4rem;padding-top:.4rem;border-top:1px dashed var(--border);">
                        <label class="check" style="font-weight:600;"><input type="checkbox" data-k="useCounter" ${c.counter || c._counter ? 'checked' : ''}> Also update a counter or list</label>
                        <div class="counter-fields row" style="margin-top:.4rem;display:${c.counter || c._counter ? 'flex' : 'none'};">
                            <label class="f"><span>Counter or list name</span><input data-k="counter" value="${esc(c.counter || '')}" placeholder="deaths"></label>
                            <label class="f"><span>Action</span><select data-k="counterAction"><option value="increment" ${c.counterAction !== 'decrement' && c.counterAction !== 'reset' && c.counterAction !== 'roll' ? 'selected' : ''}>Add 1</option><option value="decrement" ${c.counterAction === 'decrement' ? 'selected' : ''}>Subtract 1</option><option value="roll" ${c.counterAction === 'roll' ? 'selected' : ''}>Pick next (list)</option><option value="reset" ${c.counterAction === 'reset' ? 'selected' : ''}>Reset</option></select></label>
                            <span class="muted" style="align-self:flex-end;padding-bottom:.4rem;">Include in reply with <code>{{var.name}}</code></span>
                        </div>
                    </div>
                </div>
            </details>
            <div class="row" style="margin-top:.2rem;">
                <button class="btn small" data-act="test" type="button">${svgIcon('send')} Send test</button>
                <span style="flex:1"></span>
                <button class="btn small danger" data-act="remove" type="button">${svgIcon('trash')} Remove</button>
            </div>
        </div>
    </details>`;
}

export function renderCommands() {
    const commandsEl = $('commands');
    if (!commandsEl) return;
    commandsEl.innerHTML = state.commands.length
        ? state.commands.map(commandHtml).join('')
        : '<div class="empty">No commands yet. Click "+ Add command" to create one.</div>';
}

export function readCommands() {
    return [...document.querySelectorAll('#commands .item')].map(item => {
        const open = item.open;
        const advancedOpen = item.querySelector('.item-advanced')?.open || false;
        const get = k => item.querySelector(`[data-k="${k}"]`);
        const useHttp = get('useHttp')?.checked || false;
        return {
            name: get('name')?.value || '',
            aliases: get('aliases')?.value || '',
            cooldown: get('cooldown')?.value || '',
            response: get('response')?.value || '',
            silent: get('silent')?.checked || false,
            httpAction: readHttpAction(item),
            _httpAction: useHttp,
            enabled: get('enabled')?.checked !== false,
            access: get('access')?.value || 'everyone',
            limit: get('limit')?.value || '',
            modCooldown: get('modCooldown')?.value || '',
            userCooldown: get('userCooldown')?.value || '',
            limitPer: get('limitPer')?.value || 'session',
            random: get('random')?.checked || false,
            counter: get('useCounter')?.checked ? (get('counter')?.value || '') : '',
            _counter: get('useCounter')?.checked || false,
            counterAction: get('counterAction')?.value || 'increment',
            _open: open,
            _advancedOpen: advancedOpen
        };
    });
}

export function applyPreset(item, presetKey) {
    const methodEl = item.querySelector('[data-k="httpMethod"]');
    const urlEl = item.querySelector('[data-k="httpUrl"]');
    const bodyEl = item.querySelector('[data-k="httpBody"]');
    const wrapEl = item.querySelector('[data-k-wrap="httpBody"]');

    if (presetKey === 'companion-v3') {
        if (methodEl) methodEl.value = 'POST';
        if (urlEl) urlEl.value = 'http://127.0.0.1:8000/api/location/1/0/0/press';
        if (bodyEl) bodyEl.value = '{}';
    } else if (presetKey === 'companion-v2') {
        if (methodEl) methodEl.value = 'POST';
        if (urlEl) urlEl.value = 'http://127.0.0.1:8000/press/bank/1/1';
        if (bodyEl) bodyEl.value = '{}';
    } else if (presetKey === 'companion-var') {
        if (methodEl) methodEl.value = 'POST';
        if (urlEl) urlEl.value = 'http://127.0.0.1:8000/api/custom-variable/my_var/value';
        if (bodyEl) bodyEl.value = '{\n  "value": "{{user}}"\n}';
    } else if (presetKey === 'sp-randomizer') {
        if (methodEl) methodEl.value = 'POST';
        if (urlEl) urlEl.value = '/api/randomizer/spin';
        if (bodyEl) bodyEl.value = '{}';
    } else if (presetKey === 'sp-timer') {
        if (methodEl) methodEl.value = 'POST';
        if (urlEl) urlEl.value = '/api/timer/toggle';
        if (bodyEl) bodyEl.value = '{}';
    } else if (presetKey === 'sp-alert-replay') {
        if (methodEl) methodEl.value = 'POST';
        if (urlEl) urlEl.value = '/api/alerts/replay';
        if (bodyEl) bodyEl.value = '{}';
    } else if (presetKey === 'sp-highlight') {
        if (methodEl) methodEl.value = 'POST';
        if (urlEl) urlEl.value = '/api/highlights';
        if (bodyEl) bodyEl.value = '{\n  "user": "{{user}}",\n  "text": "{{arg}}"\n}';
    }
    if (wrapEl && methodEl) {
        wrapEl.style.display = methodEl.value === 'GET' ? 'none' : '';
    }
}

export async function testHttpAction(item) {
    const method = item.querySelector('[data-k="httpMethod"]')?.value || 'GET';
    const url = item.querySelector('[data-k="httpUrl"]')?.value || '';
    const body = item.querySelector('[data-k="httpBody"]')?.value || '';
    const statusEl = item.querySelector('[data-http-status]');

    if (!url.trim()) {
        toast('Please enter a target URL to test');
        return;
    }
    if (statusEl) {
        statusEl.textContent = 'Testing API call…';
        statusEl.style.color = 'var(--text-muted)';
    }
    try {
        const res = await api('/api/chatbot/test-http', 'POST', {
            action: { method, url, body },
            user: 'Tester',
            arg: '@sample_target'
        });
        if (statusEl) {
            const statusText = `HTTP ${res.status || 'OK'}: ${res.statusText || 'Success'}`;
            const summary = typeof res.data === 'object' ? JSON.stringify(res.data) : String(res.data || '');
            statusEl.textContent = `${statusText} ${summary ? `· Response: ${summary.slice(0, 100)}` : ''}`;
            statusEl.style.color = (res.status >= 200 && res.status < 400) ? 'var(--text-success, #3fb950)' : 'var(--text-warn, #f59e0b)';
        }
        toast(`API Test: HTTP ${res.status || 200}`);
    } catch (e) {
        if (statusEl) {
            statusEl.textContent = `Error: ${e.message}`;
            statusEl.style.color = '#f85149';
        }
        toast(`API Test Failed: ${e.message}`);
    }
}

export function setupCommandsEvents(applyState) {
    const commandsEl = $('commands');
    if (!commandsEl) return;

    commandsEl.addEventListener('change', event => {
        const item = event.target.closest('.item');
        if (!item) return;
        if (event.target.dataset.k === 'useCounter') {
            const counterRow = item.querySelector('.counter-fields');
            if (counterRow) {
                counterRow.style.display = event.target.checked ? 'flex' : 'none';
                if (event.target.checked) {
                    const counterInput = counterRow.querySelector('[data-k="counter"]');
                    if (counterInput && !counterInput.value) counterInput.focus();
                }
            }
        } else if (event.target.dataset.k === 'useHttp') {
            const fields = item.querySelector('.http-fields');
            const picker = item.querySelector('[data-act="preset-pick"]')?.closest('.row');
            if (fields) fields.style.display = event.target.checked ? 'flex' : 'none';
            if (picker) picker.style.display = event.target.checked ? 'flex' : 'none';
            if (event.target.checked) {
                const urlInput = item.querySelector('[data-k="httpUrl"]');
                if (urlInput && !urlInput.value) urlInput.focus();
            }
        } else if (event.target.dataset.k === 'httpMethod') {
            const wrap = item.querySelector('[data-k-wrap="httpBody"]');
            if (wrap) wrap.style.display = event.target.value === 'GET' ? 'none' : '';
        } else if (event.target.dataset.act === 'preset-pick') {
            if (event.target.value) {
                applyPreset(item, event.target.value);
                event.target.value = '';
            }
        }
    });

    commandsEl.addEventListener('click', async event => {
        const act = event.target.dataset.act, item = event.target.closest('.item');
        if (!act || !item) return;
        if (act === 'test-http') {
            testHttpAction(item);
            return;
        }
        if (act === 'placeholder') {
            const field = item.querySelector('[data-k="response"]');
            if (window.PlaceholderPicker) {
                window.PlaceholderPicker.open({
                    getStatus: () => liveStatus,
                    isChatbot: true,
                    onWarn: toast,
                    onPick: token => window.PlaceholderPicker.insertInto(field, token)
                });
            }
            return;
        }
        if (act === 'remove') {
            state.commands = readCommands();
            state.commands.splice(Number(item.dataset.i), 1);
            renderCommands();
        }
        if (act === 'test') {
            try {
                const text = item.querySelector('[data-k="response"]').value;
                const { text: out } = await api('/api/chatbot/preview', 'POST', { text, user: 'viewer', arg: '@someone 100' });
                await api('/api/chatbot/send', 'POST', { text: out || text });
                toast('Test sent to chat');
            } catch (e) {
                toast(e.message);
            }
        }
    });

    $('add-command')?.addEventListener('click', () => {
        const cmdFilter = $('cmd-filter');
        if (cmdFilter) {
            cmdFilter.value = '';
            cmdFilter.dispatchEvent(new Event('input'));
        }
        state.commands = readCommands();
        state.commands.push({ _open: true, name: '', aliases: [], response: '', enabled: true, access: 'everyone', cooldown: null });
        renderCommands();
        document.querySelector('#commands .item:last-child [data-k="name"]')?.focus();
    });

    $('save-commands')?.addEventListener('click', async () => {
        try {
            const list = readCommands();
            if (list.some(c => !/^[a-z0-9_]{1,30}$/i.test(String(c.name).replace(/^[^a-z0-9_]+/i, '')))) {
                throw new Error('Each command needs a name (letters, numbers, underscore)');
            }
            applyState(await api('/api/chatbot', 'PUT', { commands: list }));
            toast('Commands saved');
        } catch (e) {
            toast(e.message);
        }
    });

    $('export-commands')?.addEventListener('click', async () => {
        try {
            const data = await api('/api/chatbot/commands/export');
            download('streampulse-commands.json', 'application/json', JSON.stringify(data, null, 2));
            toast('Commands exported');
        } catch (e) {
            toast(e.message);
        }
    });

    $('import-commands')?.addEventListener('click', () => $('import-commands-file')?.click());
    $('import-commands-file')?.addEventListener('change', e => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async ev => {
            try {
                const parsed = JSON.parse(ev.target.result);
                const res = await api('/api/chatbot/commands/import', 'POST', parsed);
                applyState(res);
                toast('Imported commands');
            } catch (err) {
                toast(err.message || 'Import failed');
            }
            e.target.value = '';
        };
        reader.readAsText(file);
    });

    $('cmd-filter')?.addEventListener('input', e => {
        const q = e.target.value.trim().toLowerCase();
        document.querySelectorAll('#commands .item').forEach(item => {
            const name = item.querySelector('[data-k="name"]')?.value || '';
            const aliases = item.querySelector('[data-k="aliases"]')?.value || '';
            const response = item.querySelector('[data-k="response"]')?.value || '';
            const match = !q || name.toLowerCase().includes(q) || aliases.toLowerCase().includes(q) || response.toLowerCase().includes(q);
            item.style.display = match ? '' : 'none';
        });
    });
}

/**
 * StreamPulse — Chatbot Studio Messages & Triggers Controller
 */

import { $, esc, svgIcon, toast, api, state, liveStatus, download } from './chatbot-state.js';
import { httpActionHtml, readHttpAction, applyPreset, testHttpAction } from './chatbot-commands.js';

export const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function schedText(m) {
    const k = m.kind || 'interval';
    let base = '';
    if (k === 'interval') base = m.vary ? `Random ${m.every ?? 30}-${m.everyMax ?? (m.every ?? 30) * 2} min` : `Every ${m.every ?? 30} min`;
    else if (k === 'hourly') base = `Hourly at :${String(m.minute ?? 0).padStart(2, '0')}`;
    else if (k === 'daily') base = `Daily at ${m.time || '12:00'}`;
    else if (k === 'datetime') base = `${m.date || 'no date'} at ${m.time || '12:00'}`;
    else base = `Every year ${m.md || '??-??'}, ${m.vary ? `random ${m.every ?? 30}-${m.everyMax ?? (m.every ?? 30) * 2}` : `every ${m.every ?? 30}`} min`;
    return m.liveOnly ? `${base} · live only` : base;
}

export const accessOpts = v => [['everyone', 'Everyone'], ['subs', 'Subscribers + mods'], ['mods', 'Mods only']].map(([k, n]) => `<option value="${k}" ${v === k ? 'selected' : ''}>${n}</option>`).join('');
export const varyHtml = m => `<label class="check" style="align-self:flex-end;padding-bottom:.5rem" title="Pick a random wait each time"><input type="checkbox" data-k="vary" ${m.vary ? 'checked' : ''}> Vary</label>${m.vary ? `<label class="f"><span>and (min)</span><input data-k="everyMax" type="number" min="1" max="1440" value="${m.everyMax ?? (m.every ?? 30) * 2}" style="width:6rem"></label>` : ''}`;

export function messageHtml(m, i) {
    const k = m.kind || 'interval';
    return `<details class="item" data-i="${i}" ${m._open ? 'open' : ''}>
        <summary class="item-summary">
            <div class="item-summary-left">
                <span class="cmd-badge">${svgIcon('clock')} ${esc(m.name || 'New message')}</span>
                <span class="sum-text">${esc(schedText(m))}</span>
            </div>
            <div class="item-summary-right">
                ${m.liveOnly ? `<span class="meta-pill live-pill"><span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#f85149;margin-right:4px;"></span>Live only</span>` : ''}
                <label class="check" onclick="event.stopPropagation()"><input type="checkbox" data-k="enabled" ${m.enabled !== false ? 'checked' : ''}> On</label>
            </div>
        </summary>
        <div class="item-body">
            <div class="grid" style="grid-template-columns: minmax(140px, 1fr) 180px 1fr;">
                <label class="f"><span>Message name</span><input data-k="name" value="${esc(m.name)}" placeholder="Follow reminder"></label>
                <label class="f"><span>Schedule type</span><select data-k="kind"><option value="interval" ${k === 'interval' ? 'selected' : ''}>Every N minutes</option><option value="hourly" ${k === 'hourly' ? 'selected' : ''}>Every hour</option><option value="daily" ${k === 'daily' ? 'selected' : ''}>Daily at a time</option><option value="datetime" ${k === 'datetime' ? 'selected' : ''}>Once, on a date and time</option><option value="dateinterval" ${k === 'dateinterval' ? 'selected' : ''}>Every year on a date, repeating</option></select></label>
                <div class="row" style="align-items:flex-end;">
                    ${k === 'interval' ? `<label class="f"><span>${m.vary ? 'Between (min)' : 'Every (min)'}</span><input data-k="every" type="number" min="1" max="1440" value="${m.every ?? 30}" style="width:6rem"></label>${varyHtml(m)}` : ''}
                    ${k === 'hourly' ? `<label class="f"><span>Minutes past</span><input data-k="minute" type="number" min="0" max="59" value="${m.minute ?? 0}" style="width:6rem"></label>` : ''}
                    ${k === 'datetime' ? `<label class="f"><span>Date</span><input data-k="date" type="date" value="${m.date || ''}"></label><label class="f"><span>Time</span><input data-k="time" type="time" value="${m.time || '12:00'}"></label>` : ''}
                    ${k === 'dateinterval' ? `<label class="f"><span>MM-DD</span><input data-k="md" value="${esc(m.md || '')}" placeholder="07-04" maxlength="5" style="width:5rem"></label><label class="f"><span>Every (min)</span><input data-k="every" type="number" min="1" max="1440" value="${m.every ?? 30}" style="width:5.5rem"></label>${varyHtml(m)}<label class="f"><span>From</span><input data-k="from" type="time" value="${m.from || '00:00'}"></label><label class="f"><span>Until</span><input data-k="to" type="time" value="${m.to || '23:59'}"></label>` : ''}
                    ${k === 'daily' ? `<label class="f"><span>Time</span><input data-k="time" type="time" value="${m.time || '12:00'}"></label>` : ''}
                    ${k !== 'datetime' && k !== 'dateinterval' ? `<label class="f"><span>Active chat req (msgs)</span><input data-k="minChat" type="number" min="0" value="${m.minChat ?? 5}" style="width:6.5rem"></label>` : ''}
                    <label class="check" style="align-self:flex-end;padding-bottom:.5rem;" title="Only send when live"><input type="checkbox" data-k="liveOnly" ${m.liveOnly ? 'checked' : ''}> Only when live</label>
                </div>
            </div>
            ${['hourly', 'daily'].includes(k) ? `<div class="row" style="background:var(--bg-inset);padding:.5rem .75rem;border-radius:6px;border:1px solid var(--border);"><span class="muted" style="font-size:.78rem;">Active days:</span>${DAYS.map((d, n) => `<label class="check" style="font-size:.78rem;"><input type="checkbox" data-day="${n}" ${(m.days || []).includes(n) ? 'checked' : ''}> ${d}</label>`).join('')}</div>` : ''}
            <label class="f" style="width:100%;">
                <span style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.2rem;">
                    <span>Message text</span>
                    <button type="button" class="btn small" data-act="placeholder">${svgIcon('plus')} Insert placeholder</button>
                </span>
                <textarea data-k="text" rows="2" maxlength="1000" placeholder="Enjoying the stream? Hit follow!">${esc(m.text)}</textarea>
            </label>
            <div class="preview-box" data-preview></div>
            <div class="row" style="margin-top:.2rem;">
                <label class="check" title="One message per line; a random one is sent each time"><input type="checkbox" data-k="random" ${m.random ? 'checked' : ''}> Pick random line</label>
                <button class="btn small" data-act="test" type="button">${svgIcon('send')} Send now</button>
                <button class="btn small" data-act="duplicate" type="button">Duplicate</button>
                <span style="flex:1"></span>
                <button class="btn small danger" data-act="remove" type="button">${svgIcon('trash')} Remove</button>
            </div>
        </div>
    </details>`;
}

export function triggerHtml(t, i) {
    const wordsArr = Array.isArray(t.words) ? t.words : String(t.words || '').split(',').map(w => w.trim()).filter(Boolean);
    const wordsStr = wordsArr.join(', ');
    const preview = String(t.text || '').split('\\n')[0].slice(0, 50);
    const hasHttp = Boolean(t.httpAction?.enabled || t._httpAction);
    const httpUrl = t.httpAction?.url || '';

    return `<details class="item" data-i="${i}" ${t._open ? 'open' : ''}>
        <summary class="item-summary">
            <div class="item-summary-left">
                <span class="cmd-badge">${svgIcon('target')} ${esc(t.name || 'New trigger')}</span>
                ${t.silent ? `<span class="meta-pill silent-pill">${svgIcon('volumeX')} Silent</span>` : ''}
                ${hasHttp && httpUrl ? `<span class="meta-pill api-pill">${svgIcon('link')} API</span>` : ''}
                <span class="sum-text">${esc(t.silent && !preview ? (httpUrl || 'Silent background action') : (preview || wordsStr.slice(0, 50)))}</span>
            </div>
            <div class="item-summary-right">
                ${t.cooldown ? `<span class="meta-pill">${esc(t.cooldown)}s</span>` : ''}
                <label class="check" onclick="event.stopPropagation()"><input type="checkbox" data-k="enabled" ${t.enabled !== false ? 'checked' : ''}> On</label>
            </div>
        </summary>
        <div class="item-body">
            <div class="grid" style="grid-template-columns: minmax(130px, 1fr) 2fr 110px 140px auto;">
                <label class="f"><span>Trigger name</span><input data-k="name" value="${esc(t.name)}" placeholder="Greeting"></label>
                <label class="f"><span>Keywords or phrases (comma-separated)</span><input data-k="words" value="${esc(wordsStr)}" placeholder="hello, hi there"></label>
                <label class="f"><span>Cooldown (s)</span><input data-k="cooldown" type="number" min="0" value="${t.cooldown ?? 60}"></label>
                <label class="f"><span>Who can trigger</span><select data-k="access">${accessOpts(t.access || 'everyone')}</select></label>
                <label class="check" style="align-self:flex-end;padding-bottom:.55rem;" title="Suppress chat reply (execute background action or webhook quietly)"><input type="checkbox" data-k="silent" ${t.silent ? 'checked' : ''}> Silent trigger</label>
            </div>
            <label class="f" style="width:100%;">
                <span style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.2rem;">
                    <span>Trigger reply ${t.silent ? '<span class="muted">(optional in silent mode)</span>' : ''}</span>
                    <button type="button" class="btn small" data-act="placeholder">${svgIcon('plus')} Insert placeholder</button>
                </span>
                <textarea data-k="text" rows="2" maxlength="1000" placeholder="${t.silent ? 'Optional: leave blank for pure silent action' : 'Welcome in, {{user}}!'}">${esc(t.text)}</textarea>
            </label>
            <div class="preview-box" data-preview></div>

            <!-- API / Webhook Action Section -->
            ${httpActionHtml(t)}

            <details class="item-advanced">
                <summary>${svgIcon('gear')} Advanced trigger options (limits, mod cooldown, whole words)</summary>
                <div class="item-advanced-body">
                    <div class="row" style="flex-wrap:wrap;gap:.6rem;align-items:center;">
                        <label class="check"><input type="checkbox" data-k="wholeWord" ${t.wholeWord !== false ? 'checked' : ''}> Whole words only</label>
                        <label class="check"><input type="checkbox" data-k="random" ${t.random ? 'checked' : ''}> Pick random line</label>
                        <label class="check" title="Mod cooldown"><input data-k="modCooldown" type="number" min="0" style="width:4.5rem" value="${t.modCooldown ?? ''}" placeholder="default"> Mod cooldown (s)</label>
                        <label class="check" title="Limit per person"><input data-k="limit" type="number" min="1" style="width:4.5rem" value="${t.limit ?? ''}" placeholder="none"> Limit per <select data-k="limitPer" style="padding:.2rem .4rem;">${[['session','session'],['day','day'],['forever','all time']].map(([v, l]) => `<option value="${v}" ${t.limitPer === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
                        <label class="f" style="margin-left:.25rem;"><span>Matching mode</span><select data-k="matchMode"><option value="contains" ${(!t.matchMode || t.matchMode === 'contains') ? 'selected' : ''}>Contains</option><option value="exact" ${t.matchMode === 'exact' ? 'selected' : ''}>Exact match</option><option value="starts_with" ${t.matchMode === 'starts_with' ? 'selected' : ''}>Starts with</option><option value="ends_with" ${t.matchMode === 'ends_with' ? 'selected' : ''}>Ends with</option><option value="regex" ${t.matchMode === 'regex' ? 'selected' : ''}>Regex pattern</option></select></label>
                    </div>
                </div>
            </details>
            <div class="row" style="margin-top:.2rem;">
                <button class="btn small" data-act="test" type="button">${svgIcon('send')} Send test</button>
                <button class="btn small" data-act="duplicate" type="button">Duplicate</button>
                <span style="flex:1"></span>
                <button class="btn small danger" data-act="remove" type="button">${svgIcon('trash')} Remove</button>
            </div>
        </div>
    </details>`;
}

export const listCfg = {
    messages: { el: 'messages', html: messageHtml, blank: () => ({ _open: true, kind: 'interval', every: 30, minChat: 5, minute: 0, time: '12:00', days: [], enabled: true, liveOnly: false, text: '' }) },
    triggers: { el: 'triggers', html: triggerHtml, blank: () => ({ _open: true, words: [], cooldown: 60, enabled: true, wholeWord: true, access: 'everyone', text: '', matchMode: 'contains' }) }
};

export function readList(name) {
    return [...document.querySelectorAll(`#${listCfg[name].el} .item`)].map(item => {
        const o = { _open: item.open };
        item.querySelectorAll('[data-k]').forEach(f => { o[f.dataset.k] = f.type === 'checkbox' ? f.checked : f.value; });
        if (name === 'messages') o.days = [...item.querySelectorAll('[data-day]:checked')].map(c => Number(c.dataset.day));
        if (name === 'triggers') {
            o.words = (Array.isArray(o.words) ? o.words : String(o.words || '')).split(',').map(w => w.trim()).filter(Boolean);
            o.silent = item.querySelector('[data-k="silent"]')?.checked || false;
            o.httpAction = readHttpAction(item);
            o._httpAction = item.querySelector('[data-k="useHttp"]')?.checked || false;
        }
        return o;
    });
}

export function renderList(name) {
    const c = listCfg[name];
    const el = $(c.el);
    if (!el) return;
    el.innerHTML = state[name].length ? state[name].map(c.html).join('') : `<div class="empty">None yet. Click "+ Add ${name === 'messages' ? 'message' : 'trigger'}" to create one.</div>`;
    const countEl = $(name === 'messages' ? 'msg-count' : 'trig-count');
    if (countEl) countEl.textContent = `(${state[name].length})`;
}

export async function renderPreview(item) {
    const field = item.querySelector('[data-k="response"], [data-k="text"]'), box = item.querySelector('[data-preview]');
    if (!field || !box) return;
    const lines = field.value.split(/\\n|\n/).map(l => l.trim()).filter(Boolean).slice(0, 12);
    if (!lines.length) { box.innerHTML = ''; return; }
    try {
        const user = ($('cmd-test-user')?.value || '').trim() || 'viewer';
        const arg = ($('cmd-test-arg')?.value || '').trim() || '@someone 100';
        const out = await Promise.all(lines.map(l => api('/api/chatbot/preview', 'POST', { text: l, user, arg }).then(r => r.text || '(no value yet)')));
        const random = item.querySelector('[data-k="random"]')?.checked;
        box.innerHTML = random
            ? `Preview, one of these at random:<ul>${out.map(t => `<li>${esc(t)}</li>`).join('')}</ul>`
            : out.length > 1 ? `Preview, sent as ${out.length} messages:<ol>${out.map(t => `<li>${esc(t)}</li>`).join('')}</ol>` : `Preview: <b>${esc(out[0])}</b>`;
    } catch { /* preview is optional */ }
}

const previewTimers = new WeakMap();

export function setupMessagesEvents(applyState) {
    for (const name of Object.keys(listCfg)) {
        const c = listCfg[name];
        const addBtn = $(`add-${name === 'messages' ? 'message' : 'trigger'}`);
        if (addBtn) {
            addBtn.onclick = () => {
                const filterEl = $(name === 'messages' ? 'msg-filter' : 'trig-filter');
                if (filterEl) { filterEl.value = ''; filterEl.dispatchEvent(new Event('input')); }
                state[name] = readList(name);
                state[name].push(c.blank());
                renderList(name);
                const last = document.querySelector(`#${c.el} .item:last-child`);
                if (last) {
                    last.open = true;
                    const input = last.querySelector('input');
                    if (input) input.focus();
                }
            };
        }

        const saveBtn = $(`save-${name}`);
        if (saveBtn) {
            saveBtn.onclick = async () => {
                try {
                    const list = readList(name);
                    if (name === 'triggers') {
                        if (list.some(x => (!x.words || !x.words.length) || (!String(x.text || '').trim() && (!x.httpAction || !x.httpAction.url)))) {
                            throw new Error('Each trigger needs trigger words and either a reply message or an API action');
                        }
                    } else if (name === 'messages') {
                        if (list.some(x => !String(x.text || '').trim())) throw new Error('Each message needs text');
                    }
                    applyState(await api('/api/chatbot', 'PUT', { [name]: list }));
                    toast('Saved');
                } catch (e) { toast(e.message); }
            };
        }

        const containerEl = $(c.el);
        if (containerEl) {
            containerEl.addEventListener('change', event => {
                if (['kind', 'vary'].includes(event.target.dataset.k)) {
                    state[name] = readList(name);
                    renderList(name);
                }
            });
            containerEl.addEventListener('click', async event => {
                const act = event.target.dataset.act, item = event.target.closest('.item');
                if (!act || !item) return;
                const field = item.querySelector('[data-k="text"]');
                if (act === 'placeholder' && window.PlaceholderPicker) {
                    window.PlaceholderPicker.open({
                        getStatus: () => liveStatus,
                        isChatbot: true,
                        onWarn: toast,
                        onPick: token => window.PlaceholderPicker.insertInto(field, token)
                    });
                }
                if (act === 'duplicate') {
                    const idx = Number(item.dataset.i);
                    state[name] = readList(name);
                    const copy = structuredClone(state[name][idx]);
                    delete copy.id;
                    if (copy.name) copy.name = `${copy.name} (copy)`.slice(0, 60);
                    copy._open = true;
                    state[name].splice(idx + 1, 0, copy);
                    renderList(name);
                    document.querySelectorAll(`#${c.el} .item`)[idx + 1]?.querySelector('input')?.focus();
                    return;
                }
                if (act === 'remove') {
                    state[name] = readList(name);
                    state[name].splice(Number(item.dataset.i), 1);
                    renderList(name);
                }
                if (act === 'test') {
                    try {
                        const existingId = name === 'messages' ? state.messages[Number(item.dataset.i)]?.id : null;
                        if (existingId) {
                            await api(`/api/chatbot/messages/${encodeURIComponent(existingId)}/run`, 'POST', {});
                        } else {
                            const { text } = await api('/api/chatbot/preview', 'POST', { text: field.value.split('\n')[0] });
                            await api('/api/chatbot/send', 'POST', { text: text || field.value, expand: false });
                        }
                        toast(name === 'messages' ? 'Message sent to chat' : 'Test sent to chat');
                    } catch (e) { toast(e.message); }
                }
            });
        }
    }

    // Trigger-specific preset picker, dry-run tester & HTTP actions
    $('trigger-test-form')?.addEventListener('submit', async e => {
        e.preventDefault();
        const input = $('trigger-test-input');
        const resultEl = $('trigger-test-result');
        const text = input?.value.trim();
        if (!text || !resultEl) return;
        const user = ($('trigger-test-user')?.value || '').trim() || 'viewer';
        try {
            const res = await api('/api/chatbot/test-trigger', 'POST', { text, user });
            resultEl.hidden = false;
            if (!res.matched) {
                resultEl.innerHTML = 'No enabled saved trigger matched that message.';
                return;
            }
            const t = res.trigger || {};
            const meta = [t.matchMode || 'contains', res.silent ? 'silent' : null, res.hasHttpAction ? 'webhook' : null].filter(Boolean).join(' · ');
            const reply = res.text ? ` → <b>${esc(res.text)}</b>` : (res.silent ? ' <em>(silent — no chat reply)</em>' : '');
            resultEl.innerHTML = `Matched <b>${esc(t.name || t.id)}</b> <span class="meta-pill">${esc(meta)}</span>${reply}`;
        } catch (err) {
            resultEl.hidden = false;
            resultEl.textContent = err.message;
        }
    });

    const triggersEl = $('triggers');
    if (triggersEl) {
        triggersEl.addEventListener('change', event => {
            const item = event.target.closest('.item');
            if (!item) return;
            if (event.target.dataset.k === 'useHttp') {
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
        triggersEl.addEventListener('click', async event => {
            const act = event.target.dataset.act;
            const item = event.target.closest('.item');
            if (!act || !item) return;
            if (act === 'test-http') testHttpAction(item);
        });
    }

    // Preview debounced inputs
    for (const id of ['commands', 'messages', 'triggers']) {
        const el = $(id);
        if (!el) continue;
        el.addEventListener('input', event => {
            if (!['response', 'text'].includes(event.target.dataset.k)) return;
            const item = event.target.closest('.item');
            clearTimeout(previewTimers.get(item));
            previewTimers.set(item, setTimeout(() => renderPreview(item), 350));
        });
        el.addEventListener('change', event => {
            if (event.target.dataset.k === 'random') renderPreview(event.target.closest('.item'));
        });
        el.addEventListener('toggle', event => {
            if (event.target.open) renderPreview(event.target);
        }, true);
    }

    // Filters
    $('msg-filter')?.addEventListener('input', e => {
        const q = e.target.value.trim().toLowerCase();
        document.querySelectorAll('#messages .item').forEach(item => {
            const name = item.querySelector('[data-k="name"]')?.value || '';
            const text = item.querySelector('[data-k="text"]')?.value || '';
            const match = !q || name.toLowerCase().includes(q) || text.toLowerCase().includes(q);
            item.style.display = match ? '' : 'none';
        });
    });

    $('trig-filter')?.addEventListener('input', e => {
        const q = e.target.value.trim().toLowerCase();
        document.querySelectorAll('#triggers .item').forEach(item => {
            const name = item.querySelector('[data-k="name"]')?.value || '';
            const words = item.querySelector('[data-k="words"]')?.value || '';
            const text = item.querySelector('[data-k="text"]')?.value || '';
            const match = !q || name.toLowerCase().includes(q) || words.toLowerCase().includes(q) || text.toLowerCase().includes(q);
            item.style.display = match ? '' : 'none';
        });
    });

    // Export / Import triggers
    $('export-triggers')?.addEventListener('click', async () => {
        try {
            const data = await api('/api/chatbot/triggers/export');
            download('streampulse-triggers.json', 'application/json', JSON.stringify(data, null, 2));
            toast('Triggers exported');
        } catch (e) { toast(e.message); }
    });

    $('import-triggers')?.addEventListener('click', () => $('import-triggers-file')?.click());
    $('import-triggers-file')?.addEventListener('change', e => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async ev => {
            try {
                const parsed = JSON.parse(ev.target.result);
                const res = await api('/api/chatbot/triggers/import', 'POST', parsed);
                applyState(res);
                toast('Imported triggers');
            } catch (err) { toast(err.message || 'Import failed'); }
            e.target.value = '';
        };
        reader.readAsText(file);
    });
}

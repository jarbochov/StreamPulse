/**
 * StreamPulse — Chatbot Studio Quotes Controller
 */

import { $, esc, toast, api, state, download } from './chatbot-state.js';

export function renderQuotes() {
    const quoteCountEl = $('quote-count');
    if (quoteCountEl) quoteCountEl.textContent = `(${state.quotes.length})`;
    const term = ($('quote-search')?.value || '').trim().toLowerCase();
    const shown = state.quotes.filter(q => !term || q.text.toLowerCase().includes(term) || String(q.id) === term.replace('#', ''));
    const quotesEl = $('quotes');
    if (!quotesEl) return;

    quotesEl.innerHTML = shown.length ? [...shown].reverse().map(q => `<div class="quote" data-id="${q.id}">
        <span class="num">#${q.id}</span>
        <div><div class="q-text">${esc(q.text)}</div><div class="meta">${q.game ? `${esc(q.game)} · ` : ''}${q.by ? `Added by ${esc(q.by)} · ` : ''}${new Date(q.at).toLocaleDateString()}</div></div>
        <div class="row"><button class="btn small" data-act="edit-quote">Edit</button><button class="btn small danger" data-act="del-quote">Delete</button></div></div>`).join('') : '<div class="empty">No quotes yet.</div>';
}

export function setupQuotesEvents(applyState) {
    const addQuoteBtn = $('add-quote');
    const newQuoteInput = $('new-quote');

    if (addQuoteBtn && newQuoteInput) {
        addQuoteBtn.onclick = async () => {
            const text = newQuoteInput.value.trim();
            if (!text) return;
            try {
                applyState(await api('/api/chatbot/quotes', 'POST', { text }));
                newQuoteInput.value = '';
                toast('Quote added');
            } catch (e) { toast(e.message); }
        };
        newQuoteInput.addEventListener('keydown', e => {
            if (e.key === 'Enter') addQuoteBtn.click();
        });
    }

    $('quotes')?.addEventListener('click', async event => {
        const act = event.target.dataset.act, row = event.target.closest('.quote');
        if (!act || !row) return;
        const id = row.dataset.id;
        try {
            if (act === 'del-quote') {
                const confirmed = window.StreamPulse
                    ? await window.StreamPulse.confirm('Delete Quote', `Delete quote #${id}?`, { danger: true, confirmText: 'Delete' })
                    : confirm(`Delete quote #${id}?`);
                if (!confirmed) return;
                applyState(await api(`/api/chatbot/quotes/${id}`, 'DELETE'));
                toast(`Quote #${id} deleted`);
            }
            if (act === 'edit-quote') {
                const q = state.quotes.find(x => x.id === Number(id));
                row.outerHTML = `<div class="quote" data-id="${id}" style="grid-template-columns:3rem 1fr"><span class="num">#${id}</span><div style="display:grid;gap:.4rem">
                    <textarea data-q="text" rows="2" maxlength="300" style="width:100%;padding:.5rem;background:var(--bg-inset);border:1px solid var(--border);border-radius:6px;color:var(--text);font:inherit">${esc(q.text)}</textarea>
                    <div class="row"><label class="f" style="flex:1">Game<input data-q="game" value="${esc(q.game || '')}" style="display:block;width:100%;margin-top:.2rem;padding:.4rem;background:var(--bg-inset);border:1px solid var(--border);border-radius:6px;color:var(--text)"></label><label class="f" style="flex:1">Added by<input data-q="by" value="${esc(q.by || '')}" style="display:block;width:100%;margin-top:.2rem;padding:.4rem;background:var(--bg-inset);border:1px solid var(--border);border-radius:6px;color:var(--text)"></label></div>
                    <div class="row end"><button class="btn small" data-act="cancel-quote">Cancel</button><button class="btn small primary" data-act="save-quote">Save</button></div></div></div>`;
            }
            if (act === 'cancel-quote') renderQuotes();
            if (act === 'save-quote') {
                const v = k => row.querySelector(`[data-q="${k}"]`).value;
                if (!v('text').trim()) throw new Error('Quote text is required');
                applyState(await api(`/api/chatbot/quotes/${id}`, 'PUT', { text: v('text'), game: v('game'), by: v('by') }));
                toast('Quote saved');
            }
        } catch (e) { toast(e.message); }
    });

    $('quote-search')?.addEventListener('input', renderQuotes);
    $('save-quote-settings')?.addEventListener('click', () => $('save-settings')?.click());

    $('export-json')?.addEventListener('click', () => {
        download('streampulse-quotes.json', 'application/json', JSON.stringify(state.quotes.map(({ text, by, at, game }) => ({ text, by, at, game })), null, 2));
    });

    $('export-txt')?.addEventListener('click', () => {
        download('streampulse-quotes.txt', 'text/plain', state.quotes.map(q => q.text).join('\n'));
    });

    $('import-quotes')?.addEventListener('click', () => $('import-file')?.click());
    $('import-file')?.addEventListener('change', async event => {
        const file = event.target.files[0];
        event.target.value = '';
        if (!file) return;
        try {
            const raw = await file.text();
            let list;
            try {
                const parsed = JSON.parse(raw);
                list = Array.isArray(parsed) ? parsed : parsed.quotes;
            } catch {
                list = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
            }
            if (!Array.isArray(list)) throw new Error('No quotes found in that file');
            const result = await api('/api/chatbot/quotes/import', 'POST', { quotes: list });
            applyState(result);
            toast(`Imported ${result.added}, skipped ${result.skipped} duplicates or invalid`);
        } catch (e) { toast(e.message); }
    });
}

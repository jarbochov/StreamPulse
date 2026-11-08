import { root } from './environment.js';


// Splits blocks into balanced flex columns, breaking lists between items and keeping numbering continuous.
function buildColumns(nodes, cols) {
    const units = [];
    nodes.forEach(node => {
        const weight = n => 1 + Math.floor((n.textContent || '').length / 40);
        if (node.nodeType === 1 && (node.tagName === 'UL' || node.tagName === 'OL')) {
            const start = node.tagName === 'OL' ? Number(node.getAttribute('start') || 1) : 0;
            [...node.children].forEach((li, index) => units.push({ node: li, list: node, number: start + index, weight: weight(li) }));
        } else if (node.nodeType !== 3 || node.textContent.trim()) units.push({ node, weight: weight(node) });
    });
    const total = units.reduce((sum, unit) => sum + unit.weight, 0);
    const group = document.createElement('div');
    group.className = 'md-col-group';
    group.style.cssText = `display:flex;align-items:flex-start;gap:1.5em`;
    const columns = Array.from({ length: cols }, () => { const col = document.createElement('div'); col.style.cssText = 'flex:1 1 0;min-width:0'; group.appendChild(col); return col; });
    let seen = 0, index = 0, lastList = null, lastCol = -1, listEl = null;
    units.forEach(unit => {
        index = Math.min(cols - 1, Math.floor(((seen + unit.weight / 2) / total) * cols));
        seen += unit.weight;
        const col = columns[index];
        if (unit.list) {
            if (unit.list !== lastList || index !== lastCol) {
                listEl = document.createElement(unit.list.tagName);
                [...unit.list.attributes].forEach(attr => listEl.setAttribute(attr.name, attr.value));
                if (unit.list.tagName === 'OL') listEl.setAttribute('start', unit.number);
                col.appendChild(listEl);
            }
            listEl.appendChild(unit.node);
            lastList = unit.list; lastCol = index;
        } else { col.appendChild(unit.node); lastList = null; }
    });
    return group;
}

function renderMarkdown(source, el) {
    // Obsidian-style YAML frontmatter at the very top is metadata, not content.
    const body = String(source ?? '').replace(/^\uFEFF?\s*---[ \t]*\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/, '');
    const html = root.marked.parse(body, { breaks: true, gfm: true });
    const fragment = root.DOMPurify.sanitize(html, {
        RETURN_DOM_FRAGMENT: true,
        ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'del', 'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'img', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td'],
        ALLOWED_ATTR: ['href', 'title', 'target', 'rel', 'src', 'alt', 'align']
    });
    // Wrap each list item's inline text so right-aligned lists can flip their bullets without reordering the text.
    const BLOCKS = new Set(['UL', 'OL', 'P', 'PRE', 'BLOCKQUOTE', 'TABLE', 'HR', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6']);
    fragment.querySelectorAll('li').forEach(li => {
        let run = null;
        [...li.childNodes].forEach(child => {
            if (child.nodeType === 1 && BLOCKS.has(child.tagName)) { run = null; return; }
            if (!run) { run = document.createElement('span'); run.className = 'li-t'; li.insertBefore(run, child); }
            run.appendChild(child);
        });
    });
    const holder = document.createElement('div');
    holder.appendChild(fragment);
    const cols = el && el.columns > 1 ? Number(el.columns) : 0;
    if (cols) {
        // Columns are real flex children, not CSS multicol: Safari can't paint a clipped text gradient through multicol, and CSS column-span mis-lays out in a fixed-height box.
        const span = Number(el.headingSpan ?? 6);
        const out = document.createElement('div');
        let run = [];
        const flush = () => { if (run.length) out.appendChild(buildColumns(run, cols)); run = []; };
        [...holder.childNodes].forEach(child => {
            const level = child.nodeType === 1 && /^H[1-6]$/.test(child.tagName) ? Number(child.tagName[1]) : 0;
            if (level && level <= span) { flush(); out.appendChild(child); } else run.push(child);
        });
        flush();
        return out.innerHTML;
    }
    return holder.innerHTML;
}


// ---- text sources: text / markdown / random-text elements can read a library or on-disk file ----
const textSources = new Map();
const textSourceKey = el => (el?.source && el.source.mode !== 'inline' && el.source.path ? `${el.source.mode}|${el.source.path}` : '');
async function loadTextSource(key) {
    const [mode, ...rest] = key.split('|');
    try {
        const response = await fetch(`/api/custom-overlays/text-source?mode=${mode}&path=${encodeURIComponent(rest.join('|'))}`, { cache: 'no-store' });
        const data = await response.json().catch(() => ({}));
        return response.ok ? { text: data.text, mtimeMs: data.mtimeMs, name: data.name } : { error: data.error || 'Could not read file' };
    } catch { return { error: 'Could not reach StreamPulse' }; }
}
// Returns true when any source changed (text, modification time or error).
async function refreshTextSources(elements) {
    const keys = [...new Set((elements || []).map(textSourceKey).filter(Boolean))];
    let changed = false;
    await Promise.all(keys.map(async key => {
        let entry = textSources.get(key);
        if (!entry) {
            entry = { state: null, revision: 0 };
            textSources.set(key, entry);
        }
        const revision = ++entry.revision;
        const next = await loadTextSource(key);
        if (textSources.get(key) !== entry || entry.revision !== revision) return;
        const prev = entry.state;
        if (!prev || prev.text !== next.text || prev.mtimeMs !== next.mtimeMs || prev.error !== next.error) changed = true;
        entry.state = next;
    }));
    return changed;
}
const textSourceState = el => textSources.get(textSourceKey(el))?.state || null;
const sourceText = el => { const state = textSourceState(el); return state && typeof state.text === 'string' ? state.text : null; };
// Scrolls the node's current contents across it. The track animates text-indent (layout, not a transform) so a clipped text gradient still follows the letters.
function wrapMarquee(node) {
    const track = document.createElement('span');
    track.className = 'overlay-marquee-track';
    track.append(...node.childNodes);
    node.appendChild(track);
    const measure = () => track.style.setProperty('--mq-end', `-${Math.ceil(track.scrollWidth) + 8}px`);
    requestAnimationFrame(measure);
    if (document.fonts?.ready) document.fonts.ready.then(measure);
}
const elementContent = el => { const text = sourceText(el); return text !== null && el.type !== 'random-text' ? text : el.content; };
function elementItems(el) {
    const text = sourceText(el);
    if (text === null) return el.items || [];
    const parts = el.source.split === 'blocks' ? text.split(/\r?\n\s*\r?\n/) : text.split(/\r?\n/);
    const items = parts.map(part => part.trim()).filter(Boolean);
    return items.length ? items : el.items || [];
}

// Auto-fit: 'shrink' only reduces the font size, 'fit' may also enlarge it, until the text fits the element box.
function fitText(node, el, probeText) {
    const mode = el.textFit;
    if ((mode !== 'shrink' && mode !== 'fit') || !node.isConnected || el.random?.marquee) return;
    const base = Number(el.style?.fontSize) || 32;
    const textKey = probeText != null ? probeText : (node._textNode ? node._textNode.nodeValue : node.textContent);
    const fitKey = `${el.width}x${el.height}|${mode}|${base}|${el.style?.fontFamily}|${el.columns || 1}|${el.style?.padding || 0}|${textKey}`;
    if (node._fitKey === fitKey && node._fittedFontSize) {
        node.style.fontSize = `${node._fittedFontSize}px`;
        return;
    }

    const saved = { display: node.style.display, children: probeText != null ? [...node.childNodes] : null };
    // Centered flex boxes hide overflow at the top, so measure as a normal block.
    node.style.display = 'block';
    if (probeText != null) node.replaceChildren(document.createTextNode(probeText));
    // Some browsers don't count overflowed columns in scrollWidth, so multi-column text is also checked against its actual content bounds.
    const columnar = el.type === 'markdown' && el.columns > 1;
    const inside = () => {
        const box = node.getBoundingClientRect(), range = document.createRange();
        range.selectNodeContents(node);
        const used = range.getBoundingClientRect();
        const tol = 2 * (box.width / (node.offsetWidth || box.width) || 1);
        return used.right <= box.right + tol && used.bottom <= box.bottom + tol && used.left >= box.left - tol && used.top >= box.top - tol;
    };
    const fits = size => { node.style.fontSize = `${size}px`; return node.scrollHeight <= node.clientHeight + 1 && node.scrollWidth <= node.clientWidth + 1 && (!columnar || inside()); };
    let lo = 8, hi = mode === 'fit' ? 400 : base;
    let chosen = base;
    if (!fits(hi)) {
        while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (fits(mid)) lo = mid; else hi = mid; }
        chosen = lo;
        node.style.fontSize = `${lo}px`;
    } else {
        chosen = hi;
        node.style.fontSize = `${hi}px`;
    }
    node._fitKey = fitKey;
    node._fittedFontSize = chosen;
    node.style.display = saved.display;
    if (saved.children) node.replaceChildren(...saved.children);
}

export { elementContent, elementItems, fitText, refreshTextSources, renderMarkdown, textSourceKey, textSourceState, textSources, wrapMarquee };

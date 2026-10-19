import { renderPromo } from './promo-renderer.js';
import { exportPromos } from './promo-export.js';
import { fontAssets } from './promo-fonts.js';

const M = window.PromoModel, $ = id => document.getElementById(id);
const LABELS = { photo: 'Screenshot / photo', artwork: 'Artwork / logo', badge: 'Status label', title: 'Headline', subtitle: 'Subtitle', url: 'Twitch URL', qr: 'QR code' };
const clone = value => JSON.parse(JSON.stringify(value));
let design = M.normalize(), library = [], id = '', selected = 'title', dirty = false, ready = false;
let ratio = 'square', assetTarget = 'photo', assets = [], renderRevision = 0, renderTimer = null;
let customThemes = [], themesReady = false, editingTheme = '', themeSnapshot = null;
try {
    const saved = localStorage.getItem('streampulse.promo.ratio');
    if (Object.hasOwn(M.SIZES, saved)) ratio = saved;
} catch { /* Storage can be unavailable in private browser contexts. */ }
const block = () => design.layouts[ratio].blocks[selected];
const status = (message, error = false) => {
    $('status').textContent = message;
    $('status').dataset.error = String(error);
};
const changed = () => {
    dirty = true;
    $('save-design').textContent = 'Save changes';
    status('Unsaved changes. Save your design to reuse it next time.');
    syncThemeSelection();
    queueRender();
};
for (const [label, fonts] of [
    ['System fonts / work offline', ['sans-serif', 'serif', 'monospace', ...window.OverlayFonts.system]],
    ['Google Fonts', window.OverlayFonts.google]
]) {
    const group = document.createElement('optgroup'); group.label = label;
    for (const name of fonts) {
        const option = new Option(name, name); option.style.fontFamily = name;
        group.appendChild(option);
    }
    $('font').appendChild(group);
}

async function request(url, options) {
    const response = await fetch(url, options);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
    return data;
}

function updateHandles() {
    const host = $('handles');
    host.replaceChildren();
    for (const key of design.layouts[ratio].order) {
        const b = design.layouts[ratio].blocks[key];
        if (!b.enabled) continue;
        const handle = document.createElement('div');
        handle.className = `promo-handle${key === selected ? ' selected' : ''}`;
        handle.dataset.block = key;
        handle.style.cssText = `left:${b.x}%;top:${b.y}%;width:${b.w}%;height:${b.h}%`;
        handle.title = LABELS[key];
        if (key === selected) {
            const resize = document.createElement('span');
            resize.className = 'promo-resize';
            handle.appendChild(resize);
        }
        host.appendChild(handle);
    }
}

async function draw(revision) {
    const canvas = document.createElement('canvas');
    try {
        const snapshot = M.normalize(design), format = ratio;
        await renderPromo(canvas, snapshot, format);
        if (revision !== renderRevision) return;
        const target = $('preview');
        target.width = canvas.width; target.height = canvas.height;
        target.getContext('2d').drawImage(canvas, 0, 0);
        const [w, h] = M.SIZES[format];
        $('stage').style.setProperty('--stage-ratio', String(w / h));
    } catch (error) {
        if (revision === renderRevision) status(error.message, true);
    }
}

function queueRender() {
    const revision = ++renderRevision;
    clearTimeout(renderTimer);
    updateHandles();
    renderTimer = setTimeout(() => draw(revision), 80);
}

function syncBlock() {
    const b = block(), image = ['photo', 'artwork'].includes(selected);
    $('block-heading').textContent = LABELS[selected];
    $('block-enabled').checked = b.enabled;
    for (const key of ['x', 'y', 'w', 'h', 'fontSize', 'focusX', 'focusY', 'radius']) $('block-' + key).value = Math.round(b[key] * 10) / 10;
    $('block-fit').value = b.fit;
    $('block-shape').value = b.shape;
    $('radius-control').hidden = b.shape !== 'rounded';
    $('block-color').value = b.color || design.colors[selected === 'badge' ? 'accent' : selected === 'title' ? 'text' : 'muted'];
    $('text-controls').hidden = image || selected === 'qr';
    $('image-controls').hidden = !image;
    $('qr-hint').hidden = selected !== 'qr';
    $('block-list').replaceChildren();
    for (const key of [...design.layouts[ratio].order].reverse()) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = `${LABELS[key]}${design.layouts[ratio].blocks[key].enabled ? '' : ' / hidden'}`;
        button.dataset.select = key;
        button.setAttribute('aria-pressed', String(key === selected));
        $('block-list').appendChild(button);
    }
    updateHandles();
}

function syncFields() {
    for (const key of ['name', 'title', 'subtitle', 'badge', 'url', 'font']) $(key).value = design[key];
    $('template').value = design.layouts[ratio].template;
    document.querySelectorAll('[data-ratio]').forEach(tab => {
        tab.setAttribute('aria-selected', String(tab.dataset.ratio === ratio));
        tab.tabIndex = tab.dataset.ratio === ratio ? 0 : -1;
    });
    $('composition').setAttribute('aria-labelledby', `tab-${ratio}`);
    $('format-size').textContent = `${M.SIZES[ratio].join(' x ')} px / Export includes all three formats`;
    $('stage-hint').textContent = `${ratio === 'square' ? 'Square' : ratio === 'landscape' ? 'Landscape' : 'Portrait'} composition / drag to position, corner to resize`;
    $('canvas-radius').value = design.layouts[ratio].cornerRadius;
    syncBackground(); syncThemeSelection();
    for (const key of ['photo', 'artwork']) {
        $(key + '-name').textContent = design[key] ? decodeURIComponent(design[key].split('/').pop()) : (key === 'photo' ? 'Add a photo' : 'Optional');
        renderAssetPreview($(`${key}-preview`), design[key], key);
    }
    $('colors').replaceChildren();
    for (const [key, color] of Object.entries(design.colors)) {
        const label = document.createElement('label');
        label.textContent = key[0].toUpperCase() + key.slice(1);
        const input = document.createElement('input');
        input.type = 'color'; input.value = color; input.dataset.palette = key;
        label.appendChild(input); $('colors').appendChild(label);
    }
    syncBlock();
    queueRender();
}

async function loadLibrary() {
    library = await request('/api/promos');
    if (!Array.isArray(library)) throw new Error('Invalid promo library response.');
    $('saved').replaceChildren(new Option('Unsaved design', ''));
    for (const item of library) $('saved').appendChild(new Option(item.name, item.id));
    $('saved').value = id;
}

function contentSnapshot() {
    return M.normalize({ ...design, ...Object.fromEntries(['name', 'title', 'subtitle', 'badge', 'url'].map(key => [key, $(key).value])) });
}

async function save(copy = false) {
    if (!ready) throw new Error('The promo library could not be loaded. Reload and resolve the library error before saving.');
    const snapshot = contentSnapshot();
    document.querySelector('main').inert = true;
    try {
        const result = await request(id && !copy ? `/api/promos/${id}` : '/api/promos', {
            method: id && !copy ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(snapshot)
        });
        id = result.id; design = M.normalize(result); dirty = false;
        $('save-design').textContent = 'Save design';
        await loadLibrary();
        history.replaceState(null, '', `?id=${encodeURIComponent(id)}`);
        syncFields();
        status('Design saved. All three format arrangements are stored locally on your StreamPulse server.');
    } finally { document.querySelector('main').inert = false; }
}

function action(fn) {
    return async () => {
        try { await fn(); } catch (error) { status(error.message, true); }
    };
}

for (const key of ['name', 'title', 'subtitle', 'badge']) $(key).addEventListener('input', () => {
    design[key] = $(key).value;
    changed();
});
$('url').addEventListener('input', () => { design.url = $('url').value; changed(); });
$('url').addEventListener('change', () => {
    try { design.url = M.twitchUrl($('url').value); $('url').value = design.url; changed(); }
    catch (error) { status(error.message, true); }
});
$('font').addEventListener('change', () => { design.font = $('font').value; changed(); });
$('canvas-radius').addEventListener('input', () => {
    design.layouts[ratio].cornerRadius = Math.max(0, Math.min(300, Number($('canvas-radius').value) || 0));
    changed();
});
function builtinLook(theme) {
    return M.appearance({ theme, font: theme === 'matrix' ? 'monospace' : theme === 'gold' ? 'serif' : 'sans-serif', background: { mode: 'theme', vignette: 18 } });
}
const currentAppearance = () => M.appearance({ ...design, background: design.layouts[ratio].background });
function syncThemeSelection() {
    const signature = JSON.stringify(currentAppearance());
    const saved = customThemes.find(theme => JSON.stringify(M.appearance(theme)) === signature);
    $('theme').value = saved ? `saved:${saved.id}` : Object.keys(M.THEMES).find(theme => JSON.stringify(builtinLook(theme)) === signature) || 'custom';
}
function applyLook(style) {
    const look = M.appearance(style);
    design.theme = look.theme; design.colors = look.colors; design.font = look.font;
    design.layouts[ratio].background = look.background;
    changed(); syncFields();
}
$('theme').appendChild(new Option('Custom / current settings', 'custom'));
const builtinGroup = document.createElement('optgroup'); builtinGroup.label = 'Built-in themes';
for (const theme of Object.values(window.StudioThemes)) {
    if (theme.id === 'system') continue;
    builtinGroup.appendChild(new Option(theme.name, theme.id));
}
builtinGroup.append(new Option('Studio light', 'studio'), new Option('Ember', 'ember'));
$('theme').appendChild(builtinGroup);
$('theme').addEventListener('change', () => {
    const value = $('theme').value;
    if (value === 'custom') return;
    const style = value.startsWith('saved:') ? customThemes.find(theme => `saved:${theme.id}` === value) : builtinLook(value);
    if (style) applyLook(style);
});
async function loadThemes() {
    const data = await request('/api/promo-themes');
    if (!Array.isArray(data)) throw new Error('Invalid custom theme library response.');
    customThemes = data; themesReady = true;
    $('saved-theme-options')?.remove();
    const group = document.createElement('optgroup'); group.id = 'saved-theme-options'; group.label = 'Your themes';
    for (const theme of customThemes) group.appendChild(new Option(theme.name, `saved:${theme.id}`));
    if (customThemes.length) $('theme').appendChild(group);
    syncThemeSelection();
}
$('save-theme').addEventListener('click', action(async () => {
    if (!themesReady) await loadThemes();
    editingTheme = $('theme').value.startsWith('saved:') ? $('theme').value.slice(6) : '';
    themeSnapshot = currentAppearance();
    $('theme-target').replaceChildren(new Option('Choose a saved theme', ''));
    for (const theme of customThemes) $('theme-target').appendChild(new Option(theme.name, theme.id));
    $('theme-target').value = editingTheme;
    $('theme-name').value = customThemes.find(theme => theme.id === editingTheme)?.name || '';
    $('update-theme').hidden = $('delete-theme').hidden = !editingTheme;
    $('theme-status').textContent = '';
    $('theme-dialog').showModal(); $('theme-name').focus();
}));
$('close-theme').addEventListener('click', () => $('theme-dialog').close());
$('theme-target').addEventListener('change', () => {
    editingTheme = $('theme-target').value;
    $('update-theme').hidden = $('delete-theme').hidden = !editingTheme;
    if (editingTheme) $('theme-name').value = customThemes.find(theme => theme.id === editingTheme).name;
});
for (const operation of ['create', 'update', 'delete']) $(operation + '-theme').addEventListener('click', async () => {
    if (operation === 'delete' && !window.confirm('Delete this reusable theme? Existing promo designs keep their appearance.')) return;
    $('theme-dialog').querySelectorAll('button,input,select').forEach(el => { el.disabled = true; });
    try {
        const data = operation === 'delete' ? null : M.normalizeTheme({ ...themeSnapshot, name: $('theme-name').value });
        await request(`/api/promo-themes${operation === 'create' ? '' : `/${editingTheme}`}`, {
            method: { create: 'POST', update: 'PUT', delete: 'DELETE' }[operation],
            ...(data ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) } : {})
        });
        await loadThemes(); $('theme-dialog').close();
        status(operation === 'delete' ? 'Custom theme deleted. Existing promos are unchanged.' : 'Custom theme saved for reuse across promos. Save your design separately to keep its edits.');
    } catch (error) { $('theme-status').textContent = error.message; }
    finally { $('theme-dialog').querySelectorAll('button,input,select').forEach(el => { el.disabled = false; }); }
});
function syncBackground() {
    const bg = design.layouts[ratio].background;
    for (const key of ['mode', 'color', 'endColor', 'angle', 'pattern', 'vignette', 'fit', 'focusX', 'focusY', 'shade']) $('background-' + key).value = bg[key];
    $('vignette-value').textContent = `${bg.vignette}%`;
    $('background-fill').hidden = ['theme', 'transparent'].includes(bg.mode);
    $('background-gradient').hidden = bg.mode !== 'gradient';
    $('background-pattern-control').hidden = bg.mode !== 'pattern';
    $('background-image-controls').hidden = bg.mode !== 'image';
    $('background-vignette-control').hidden = bg.mode === 'transparent';
    $('background-name').textContent = bg.image ? decodeURIComponent(bg.image.split('/').pop()) : 'No background image';
}
function renderAssetPreview(host, url, label) {
    host.replaceChildren();
    if (url) {
        const image = new Image();
        image.src = url; image.alt = ''; image.loading = 'lazy';
        host.appendChild(image);
    } else {
        const mark = document.createElement('span');
        mark.textContent = label === 'photo' ? 'PHOTO' : 'LOGO';
        host.appendChild(mark);
    }
    host.classList.toggle('has-image', Boolean(url));
}
for (const key of ['mode', 'color', 'endColor', 'angle', 'pattern', 'vignette', 'fit', 'focusX', 'focusY', 'shade']) {
    const field = $('background-' + key);
    field.addEventListener(field.tagName === 'SELECT' ? 'change' : 'input', event => {
        const bg = design.layouts[ratio].background;
        bg[key] = ['angle', 'focusX', 'focusY', 'shade', 'vignette'].includes(key) ? Number(event.target.value) : event.target.value;
        design.layouts[ratio].background = M.background(bg);
        changed();
        if (key === 'mode') syncBackground();
        if (key === 'vignette') $('vignette-value').textContent = `${bg.vignette}%`;
    });
}
$('colors').addEventListener('input', event => {
    if (!event.target.dataset.palette) return;
    design.colors[event.target.dataset.palette] = event.target.value;
    changed();
});
function changeRatio(next, focus = false) {
    ratio = next;
    try { localStorage.setItem('streampulse.promo.ratio', ratio); } catch { /* Optional view preference. */ }
    syncFields();
    if (focus) $(`tab-${ratio}`).focus();
}
$('ratio-tabs').addEventListener('click', event => {
    const tab = event.target.closest('[data-ratio]');
    if (tab) changeRatio(tab.dataset.ratio);
});
$('ratio-tabs').addEventListener('keydown', event => {
    const keys = Object.keys(M.SIZES), at = keys.indexOf(ratio);
    const next = { ArrowLeft: keys[(at + 2) % 3], ArrowRight: keys[(at + 1) % 3], Home: keys[0], End: keys[2] }[event.key];
    if (next) { event.preventDefault(); changeRatio(next, true); }
});
function applyLayout(template) {
    const current = design.layouts[ratio];
    const baseline = M.normalize({ layouts: { [ratio]: M.arrangement(ratio, current.template) } }).layouts[ratio];
    if (design.artwork) baseline.blocks.artwork.enabled = true;
    if (JSON.stringify({ blocks: current.blocks, order: current.order }) !== JSON.stringify({ blocks: baseline.blocks, order: baseline.order }) && !window.confirm('Replace your layout edits in this format? Your content and other formats will not change.')) {
        $('template').value = current.template;
        return;
    }
    design.layouts[ratio] = M.normalize({ layouts: { [ratio]: M.arrangement(ratio, template) } }).layouts[ratio];
    design.layouts[ratio].background = current.background;
    design.layouts[ratio].cornerRadius = current.cornerRadius;
    if (design.artwork) design.layouts[ratio].blocks.artwork.enabled = true;
    changed(); syncFields();
}
$('template').addEventListener('change', () => applyLayout($('template').value));
$('auto-layout').addEventListener('click', () => applyLayout($('template').value));
$('block-list').addEventListener('click', event => {
    const key = event.target.closest('[data-select]')?.dataset.select;
    if (key) { selected = key; syncBlock(); }
});
for (const key of ['x', 'y', 'w', 'h', 'fontSize', 'focusX', 'focusY', 'radius', 'shape', 'fit', 'color', 'enabled']) {
    $('block-' + key).addEventListener('input', event => {
        block()[key] = key === 'enabled' ? event.target.checked : ['color', 'fit', 'shape'].includes(key) ? event.target.value : Number(event.target.value);
        design.layouts = M.normalize({ ...design, url: '' }).layouts;
        changed();
        if (key === 'enabled' || key === 'shape') syncBlock();
    });
}
$('inherit-color').addEventListener('click', () => { block().color = ''; changed(); syncBlock(); });
for (const [button, direction] of [['move-front', 1], ['move-back', -1]]) $(button).addEventListener('click', () => {
    const order = design.layouts[ratio].order, i = order.indexOf(selected), next = i + direction;
    if (next < 0 || next >= order.length) return;
    [order[i], order[next]] = [order[next], order[i]];
    changed(); syncBlock();
});

let drag = null;
$('handles').addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    const handle = event.target.closest('[data-block]');
    if (!handle) return;
    selected = handle.dataset.block;
    drag = { pointer: event.pointerId, x: event.clientX, y: event.clientY, box: clone(block()), resize: event.target.classList.contains('promo-resize'), bounds: $('stage').getBoundingClientRect() };
    $('handles').setPointerCapture(event.pointerId);
    $('stage').focus();
    syncBlock(); event.preventDefault();
});
$('handles').addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.pointer) return;
    const dx = (event.clientX - drag.x) / drag.bounds.width * 100, dy = (event.clientY - drag.y) / drag.bounds.height * 100;
    const b = block();
    if (drag.resize) {
        b.w = Math.max(2, Math.min(100 - b.x, drag.box.w + dx));
        b.h = Math.max(2, Math.min(100 - b.y, drag.box.h + dy));
    } else {
        b.x = Math.max(0, Math.min(100 - b.w, drag.box.x + dx));
        b.y = Math.max(0, Math.min(100 - b.h, drag.box.y + dy));
    }
    changed();
});
for (const name of ['pointerup', 'pointercancel']) $('handles').addEventListener(name, () => { drag = null; syncBlock(); });
$('stage').addEventListener('keydown', event => {
    const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (!delta) return;
    const step = event.shiftKey ? 1 : .1, b = block();
    b.x = Math.max(0, Math.min(100 - b.w, b.x + delta[0] * step));
    b.y = Math.max(0, Math.min(100 - b.h, b.y + delta[1] * step));
    event.preventDefault(); changed(); syncBlock();
});

function renderAssets() {
    const query = $('asset-search').value.toLowerCase().trim();
    const filtered = assets.filter(asset => [asset.label, asset.name, ...(asset.tags || [])].some(value => value?.toLowerCase().includes(query)));
    $('asset-grid').replaceChildren();
    for (const asset of filtered) {
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'promo-asset';
        const image = new Image(); image.src = asset.url; image.alt = ''; image.loading = 'lazy';
        const label = document.createElement('span'); label.textContent = asset.label || asset.name;
        button.append(image, label); button.title = label.textContent;
        button.addEventListener('click', action(() => { useImage(asset.url); $('asset-dialog').close(); }));
        $('asset-grid').appendChild(button);
    }
    $('asset-status').textContent = filtered.length ? `${filtered.length} images` : 'No matching images. Upload a PNG, JPEG, WebP, GIF, or SVG.';
}
function useImage(url, target = assetTarget, format = ratio) {
    const image = M.assetUrl(url);
    if (target === 'background') {
        design.layouts[format].background.image = image;
        design.layouts[format].background.mode = 'image';
    } else {
        design[target] = image;
        for (const key of target === 'artwork' ? Object.keys(M.SIZES) : [format]) design.layouts[key].blocks[target].enabled = true;
    }
    changed(); syncFields();
}
document.querySelectorAll('[data-library]').forEach(button => button.addEventListener('click', action(async () => {
    assetTarget = button.dataset.library;
    assets = []; $('asset-grid').replaceChildren(); $('asset-search').value = '';
    $('asset-status').textContent = 'Loading images...'; $('asset-dialog').showModal();
    try {
        const data = await request('/api/custom-overlays/assets');
        if (!Array.isArray(data)) throw new Error('Invalid image library response.');
        assets = data.filter(asset => asset.kind === 'image');
        renderAssets();
    } catch (error) { $('asset-status').textContent = error.message; }
})));
$('asset-search').addEventListener('input', renderAssets);
$('close-assets').addEventListener('click', () => $('asset-dialog').close());
let igdbRevision = 0, igdbTarget = 'artwork', igdbResults = [];
function igdbButton(url, label, onClick) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'promo-asset';
    if (url) {
        const image = new Image();
        image.src = url; image.alt = ''; image.loading = 'lazy'; image.referrerPolicy = 'no-referrer';
        button.appendChild(image);
    }
    const text = document.createElement('span');
    text.textContent = label; button.title = label; button.appendChild(text);
    button.addEventListener('click', onClick);
    $('igdb-grid').appendChild(button);
}
function showGames() {
    $('igdb-back').hidden = true;
    $('igdb-grid').replaceChildren();
    $('igdb-status').textContent = igdbResults.length ? 'Choose a game to browse its artwork.' : 'No games found. Try another title.';
    for (const game of igdbResults) igdbButton(game.cover, `${game.name}${game.year ? ` (${game.year})` : ''}`, () => showGameMedia(game.id));
}
async function showGameMedia(gameId) {
    const revision = ++igdbRevision;
    $('igdb-grid').replaceChildren(); $('igdb-back').hidden = false;
    $('igdb-status').textContent = 'Loading game artwork...';
    try {
        const game = await request(`/api/promos/igdb/games/${encodeURIComponent(gameId)}`);
        if (revision !== igdbRevision) return;
        $('igdb-status').textContent = game.images.length ? `${game.name} / choose a cover, artwork, or screenshot.` : 'This game has no images on IGDB.';
        for (const [index, image] of game.images.entries()) igdbButton(image.url, `${image.kind} ${index + 1}`, async () => {
            const target = igdbTarget, current = design;
            $('igdb-status').textContent = 'Saving full-resolution artwork to your Asset Library...';
            $('igdb-dialog').querySelectorAll('button,input').forEach(el => { el.disabled = true; });
            try {
                const asset = await request('/api/promos/igdb/import', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ gameId, imageId: image.imageId })
                });
                if (current === design) useImage(asset.url, target);
                else status('Artwork imported to the Asset Library. Choose Library to add it to this design.');
                $('igdb-dialog').close();
            } catch (error) { $('igdb-status').textContent = error.message; }
            finally { $('igdb-dialog').querySelectorAll('button,input').forEach(el => { el.disabled = false; }); }
        });
    } catch (error) {
        if (revision === igdbRevision) $('igdb-status').textContent = error.message;
    }
}
document.querySelectorAll('[data-igdb]').forEach(button => button.addEventListener('click', () => {
    igdbTarget = button.dataset.igdb; igdbRevision++;
    $('igdb-grid').replaceChildren(); $('igdb-back').hidden = true;
    $('igdb-status').textContent = 'Search IGDB for a game. Uses your configured Twitch client credentials.';
    $('igdb-dialog').showModal(); $('igdb-query').focus();
}));
$('close-igdb').addEventListener('click', () => $('igdb-dialog').close());
$('igdb-dialog').addEventListener('close', () => { igdbRevision++; });
$('igdb-back').addEventListener('click', () => { igdbRevision++; showGames(); });
$('igdb-search-form').addEventListener('submit', async event => {
    event.preventDefault();
    const revision = ++igdbRevision;
    $('igdb-grid').replaceChildren(); $('igdb-back').hidden = true;
    $('igdb-status').textContent = 'Searching IGDB...';
    try {
        const data = await request(`/api/promos/igdb/search?q=${encodeURIComponent($('igdb-query').value)}`);
        if (revision !== igdbRevision) return;
        igdbResults = data.results; showGames();
    } catch (error) { if (revision === igdbRevision) $('igdb-status').textContent = error.message; }
});
document.querySelectorAll('[data-upload]').forEach(button => button.addEventListener('click', () => {
    assetTarget = button.dataset.upload; $('upload-file').click();
}));
document.querySelectorAll('[data-clear]').forEach(button => button.addEventListener('click', () => {
    if (button.dataset.clear === 'background') {
        design.layouts[ratio].background.image = '';
        design.layouts[ratio].background.mode = 'theme';
    } else {
        design[button.dataset.clear] = '';
        if (button.dataset.clear === 'artwork') {
            for (const layout of Object.values(design.layouts)) layout.blocks.artwork.enabled = false;
        }
    }
    changed(); syncFields();
}));
async function upload(file) {
    const target = assetTarget, format = ratio, current = design;
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/avif', 'image/gif', 'image/svg+xml'].includes(file.type)) throw new Error('Choose a PNG, JPEG, WebP, AVIF, GIF, or SVG image.');
    status('Uploading image...');
    const asset = await request('/api/custom-overlays/assets', { method: 'POST', headers: { 'Content-Type': file.type, 'X-Asset-Name': file.name.replace(/[^\x20-\x7e]/g, '-') }, body: file });
    if (current === design) useImage(asset.url, target, format);
    else status('Image uploaded to the Asset Library. Choose Library to add it to this design.');
}
$('upload-file').addEventListener('change', action(async () => {
    const file = $('upload-file').files[0]; $('upload-file').value = '';
    if (file) await upload(file);
}));
document.addEventListener('paste', event => {
    if (event.target.closest('input,textarea,[contenteditable]')) return;
    const file = [...(event.clipboardData?.files || [])].find(item => item.type.startsWith('image/'));
    if (file) { event.preventDefault(); assetTarget = 'photo'; action(() => upload(file))(); }
});

$('save-design').addEventListener('click', action(() => save()));
$('duplicate').addEventListener('click', action(() => save(true)));
$('new-design').addEventListener('click', () => {
    if (dirty && !window.confirm('Discard unsaved changes?')) return;
    design = M.normalize(); id = ''; dirty = false; $('saved').value = '';
    $('save-design').textContent = 'Save design';
    history.replaceState(null, '', location.pathname); syncFields(); status('New promo. Add your title, channel URL, and images.');
});
$('saved').addEventListener('change', () => {
    const requested = $('saved').value;
    if (dirty && !window.confirm('Discard unsaved changes?')) { $('saved').value = id; return; }
    if (!requested) { $('saved').value = id; return; }
    const item = library.find(entry => entry.id === requested);
    if (!item) return;
    design = M.normalize(item); id = item.id; dirty = false;
    $('save-design').textContent = 'Save design';
    history.replaceState(null, '', `?id=${encodeURIComponent(id)}`);
    syncFields(); status('Saved promo loaded.');
});
$('delete-design').addEventListener('click', action(async () => {
    if (!id) throw new Error('This design has not been saved yet.');
    if (!window.confirm('Delete this saved promo? Uploaded images will remain in the Asset Library.')) return;
    await request(`/api/promos/${id}`, { method: 'DELETE' });
    id = ''; design = M.normalize(); dirty = false;
    $('save-design').textContent = 'Save design';
    history.replaceState(null, '', location.pathname); await loadLibrary(); syncFields(); status('Promo deleted.');
}));
$('export').addEventListener('click', action(async () => {
    const snapshot = contentSnapshot();
    if (Object.values(snapshot.layouts).some(layout => layout.blocks.qr.enabled) && !snapshot.url) throw new Error('Enter your Twitch URL for the QR code, or hide the QR block in all three formats.');
    $('export').disabled = true;
    try {
        status('Preparing square, landscape, and portrait PNGs...');
        const { blob, name } = await exportPromos(snapshot);
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url; link.download = name;
        link.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
        status(`PNGs exported: all three full-resolution arrangements in one ZIP. ${dirty ? 'Design changes are still unsaved.' : ''}`);
    } finally { $('export').disabled = false; }
}));
window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
await (async () => {
    try {
        await loadLibrary();
        ready = true;
        const uploaded = await fontAssets();
        if (uploaded.length) {
            const group = document.createElement('optgroup'); group.label = 'Uploaded fonts';
            for (const font of uploaded) group.appendChild(new Option(font.family, font.family));
            $('font').appendChild(group);
        }
        const requested = new URLSearchParams(location.search).get('id');
        if (requested) {
            const item = library.find(entry => entry.id === requested);
            if (!item) throw new Error('Saved promo not found. Use New promo to start a design.');
            design = M.normalize(item); id = item.id; $('saved').value = id;
        }
        $('save-design').textContent = 'Save design';
        syncFields(); status(id ? 'Ready. Your saved promo is loaded.' : 'Ready. Add a headline and photo; export includes all three sizes.');
        await loadThemes();
    } catch (error) { status(error.message, true); }
})();

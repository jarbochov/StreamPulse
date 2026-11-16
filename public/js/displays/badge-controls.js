import { F, setPath, esc } from './display-form.js';

export function badgeVisualControls(element, { fontOptions, inheritFontOptions }, sets, catalogId) {
    const ig = element.imageGroup, style = element.style || {};
    const fields = sets.find(set => set.id === catalogId)?.fields || [];
    return F.section('badgePrimary', 'Badge image & text defaults',
        F.select('imageGroup.imageField', 'Primary image field', ig.imageField || 'image', fields.map(field => [field.key, field.label || field.key]))
        + F.select('imageGroup.fallbackMode', 'Missing images', ig.fallbackMode || 'initials', [['skip', 'Skip entries without an image'], ['initials', 'Show initials']])
        + F.check('imageGroup.showLabels', 'Show member text fields', ig.showLabels !== false)
        + `<label class="field"><span>Base font</span><select data-path="style.fontFamily" data-font-picker>${fontOptions(style.fontFamily || 'sans-serif')}</select></label>`
        + `<label class="field"><span>Subtitle font</span><select data-path="imageGroup.subFontFamily" data-font-picker>${inheritFontOptions(ig.subFontFamily)}</select></label>`
        + `<label class="field"><span>Pill font</span><select data-path="imageGroup.badgeFontFamily" data-font-picker>${inheritFontOptions(ig.badgeFontFamily)}</select></label>`
        + F.text('style.fontFamily', 'Custom / variable font', style.fontFamily || 'sans-serif')
        + '<label class="field"><span>Upload font</span><input id="badge-font-upload" type="file" accept=".ttf,.otf,.woff,.woff2"></label>'
        + F.number('style.fontSize', 'Default field font size', style.fontSize || 20, { min: 8, max: 400 })
        + F.select('style.fontWeight', 'Font weight', style.fontWeight || '600', [['400', 'Normal'], ['600', 'Semi-bold'], ['700', 'Bold'], ['900', 'Black']])
        + F.color('style.color', 'Default field text color', style.color || '#ffffff')
        + F.number('style.lineHeight', 'Line height', style.lineHeight || 1.2, { min: .5, max: 3, step: .1 })
        + F.number('style.letterSpacing', 'Letter spacing', style.letterSpacing || 0, { min: -10, max: 50, step: .5 })
        + F.check('style.tabularNums', 'Tabular numbers', style.tabularNums));
}

export function bindBadgeControls(root, primary, render, changed, uploadFont, getStatus, pickColor) {
    const edit = event => {
        const input = event.target.closest('[data-path]');
        if (!input || input.type === 'file') return;
        if (event.type === 'input' && input.tagName === 'SELECT') return;
        const value = input.dataset.kind === 'check' ? input.checked : input.dataset.kind === 'number' ? (input.value === '' ? 0 : Number(input.value) * (Number(input.dataset.scale) || 1)) : input.value;
        if (typeof value === 'number' && !Number.isFinite(value)) return;
        setPath(primary(), input.dataset.path, value);
        const pair = input.closest('.color-field');
        if (pair) {
            if (input.type === 'color') pair.querySelector('.color-text').value = value;
            else if (/^#[a-f\d]{6}/i.test(value)) pair.querySelector('[type=color]').value = value.slice(0, 7);
        }
        if (/fontFamily$/.test(input.dataset.path)) window.OverlayShared?.loadGoogleFont?.(String(value));
        changed();
        if (event.type === 'change' && (input.type === 'checkbox' || input.tagName === 'SELECT' || /Width$/.test(input.dataset.path))) render();
    };
    root.addEventListener('input', edit);
    root.addEventListener('change', edit);
    root.addEventListener('change', async event => {
        if (event.target.id === 'badge-font-upload' && event.target.files[0]) {
            await uploadFont(event.target.files[0]);
            render();
        }
    });
    root.addEventListener('click', event => {
        const color = event.target.closest('[data-badge-color-pick]');
        if (color) pickColor({
            allowMember: color.dataset.badgeColorPick.startsWith('imageGroup.'),
            onSelect: value => {
                const input = color.closest('.color-field').querySelector('.color-text');
                input.value = value;
                input.dispatchEvent(new Event('input', { bubbles: true }));
            }
        });
        const number = event.target.closest('[data-badge-number-pick], [data-badge-number-unbind]');
        if (number) {
            const spec = window.OverlayShared?.numericBindingField?.(number.dataset.badgeNumberPick || number.dataset.badgeNumberUnbind);
            if (!spec) return;
            const apply = name => {
                const config = primary()[spec.domain];
                config.numberBindings ||= {};
                if (name) config.numberBindings[spec.key] = name;
                else delete config.numberBindings[spec.key];
                changed(); render();
            };
            if (number.dataset.badgeNumberUnbind) apply('');
            else window.PlaceholderPicker?.open({ filter: 'number', getStatus, title: 'Bind Number variable', onPick: key => apply(key.replace(/^var\./, '')) });
        }
        const button = event.target.closest('[data-seg-value], [data-clear]');
        const mid = event.target.closest('[data-grad-mid-toggle]');
        if (mid) { setPath(primary(), mid.dataset.gradMidToggle, mid.checked ? '#ffffff' : ''); changed(); render(); }
        if (button) {
            const path = button.dataset.clear || button.closest('[data-seg-path]').dataset.segPath;
            const raw = button.dataset.clear ? button.dataset.clearValue : button.dataset.segValue;
            setPath(primary(), path, raw === 'true' ? true : raw === 'false' ? false : raw);
            changed(); render();
        }
    });
}

export async function uploadBadgeAsset(file) {
    const fontTypes = { ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2' };
    const type = fontTypes[file.name.split('.').at(-1).toLowerCase()] || file.type || 'application/octet-stream';
    const response = await fetch('/api/custom-overlays/assets', {
        method: 'POST', headers: { 'Content-Type': type, 'X-Asset-Name': file.name.replace(/[^\x20-\x7e]+/g, '-') }, body: file
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Upload failed');
    await window.OverlayShared?.loadAssetFonts?.(true);
    return result;
}

export async function pickBadgeAsset(onPick) {
    const dialog = document.createElement('dialog');
    dialog.className = 'badge-assets-dialog';
    dialog.innerHTML = '<div class="builder-card-heading"><h3>Image assets</h3><button class="btn" type="button" data-close>Close</button></div><label class="field">Upload image<input type="file" accept="image/*" data-upload></label><div class="badge-assets-grid">Loading assets…</div>';
    document.body.append(dialog);
    dialog.addEventListener('close', () => dialog.remove(), { once: true });
    dialog.querySelector('[data-close]').onclick = () => dialog.close();
    dialog.showModal();
    const choose = url => { onPick(url); dialog.close(); };
    dialog.querySelector('[data-upload]').onchange = async event => {
        const file = event.target.files[0];
        if (file) {
            try { choose((await uploadBadgeAsset(file)).url); }
            catch (error) { dialog.querySelector('.badge-assets-grid').textContent = error.message; }
        }
    };
    try {
        const response = await fetch('/api/custom-overlays/assets', { cache: 'no-store' });
        const data = await response.json();
        const files = Array.isArray(data) ? data : data.assets || [];
        dialog.querySelector('.badge-assets-grid').innerHTML = files.filter(asset => asset.type === 'image' || /\.(png|jpe?g|gif|webp|svg)$/i.test(asset.name || asset.url || '')).map(asset => `<button type="button" data-url="${esc(asset.url)}"><img src="${esc(asset.url)}" alt=""><span>${esc(asset.name || 'Image')}</span></button>`).join('') || '<p>No images uploaded yet.</p>';
        dialog.querySelector('.badge-assets-grid').onclick = event => { const button = event.target.closest('[data-url]'); if (button) choose(button.dataset.url); };
    } catch (error) { dialog.querySelector('.badge-assets-grid').textContent = error.message; }
}

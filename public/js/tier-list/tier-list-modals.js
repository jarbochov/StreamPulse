/**
 * StreamPulse Tier List Maker — Modals & Asset Operations
 * Manages item/tier editing, asset library picker, preset packs, settings, and high-res PNG export.
 */

import { getState, $, esc, showToast, fetchState, saveItem, updateTiers, batchAddItems, loadPreset, deletePreset, restoreDefaultPresets, savePreset, saveSettings } from './tier-list-state.js';
import { TierAudio } from './tier-list-audio.js';

let libraryAssets = [];
let selectedAssetUrls = new Set();

export function openModal(id) {
    const el = $(id);
    if (el) el.classList.add('open');
}

export function closeModal(id) {
    const el = $(id);
    if (el) el.classList.remove('open');
}

export function initModalListeners() {
    document.querySelectorAll('[data-close]').forEach(btn => {
        btn.addEventListener('click', () => closeModal(btn.dataset.close));
    });

    // ── Item Modal ───────────────────────────────────────────────────────────
    $('btn-add-item')?.addEventListener('click', () => {
        $('modal-item-title').textContent = 'Add Item';
        $('item-edit-id').value = '';
        $('item-name').value = '';
        $('item-image-url').value = '';
        $('item-file-input').value = '';
        $('item-note').value = '';
        $('item-initial-tier').value = '';
        openModal('modal-item');
        $('item-name').focus();
    });

    $('btn-save-item')?.addEventListener('click', async () => {
        const editId = $('item-edit-id').value;
        const name = $('item-name').value.trim();
        let imageUrl = $('item-image-url').value.trim();
        const fileInput = $('item-file-input');
        const note = $('item-note').value.trim();
        const tierId = $('item-initial-tier').value || null;

        if (!name) {
            showToast('Please provide an item caption/name');
            return;
        }

        // Upload local file if selected
        if (fileInput.files && fileInput.files[0]) {
            const file = fileInput.files[0];
            try {
                const uploadRes = await fetch('/api/custom-overlays/assets', {
                    method: 'POST',
                    headers: {
                        'Content-Type': file.type,
                        'x-asset-name': file.name
                    },
                    body: file
                });
                if (uploadRes.ok) {
                    const data = await uploadRes.json();
                    imageUrl = data.url;
                }
            } catch (e) {
                console.error('File upload error:', e);
            }
        }

        const success = await saveItem({ name, imageUrl, note, tierId }, editId || null);
        if (success) {
            closeModal('modal-item');
        }
    });

    // ── Tier Edit Modal ──────────────────────────────────────────────────────
    $('tier-edit-color')?.addEventListener('input', (e) => {
        $('tier-edit-color-hex').value = e.target.value;
    });
    $('tier-edit-color-hex')?.addEventListener('input', (e) => {
        if (/^#[0-9a-f]{6}$/i.test(e.target.value)) {
            $('tier-edit-color').value = e.target.value;
        }
    });

    $('btn-save-tier-edit')?.addEventListener('click', async () => {
        const state = getState();
        const tierId = $('tier-edit-id').value;
        const label = $('tier-edit-label').value.trim();
        const color = $('tier-edit-color-hex').value.trim() || $('tier-edit-color').value;
        const description = $('tier-edit-desc').value.trim();

        if (!label) {
            showToast('Tier label required');
            return;
        }

        const updatedTiers = state.tiers.map(t => {
            if (t.id === tierId) {
                return { ...t, label, color, description };
            }
            return t;
        });

        await updateTiers(updatedTiers);
        closeModal('modal-tier-edit');
        showToast('Tier updated');
    });

    $('btn-delete-tier')?.addEventListener('click', async () => {
        const state = getState();
        const tierId = $('tier-edit-id').value;
        if (state.tiers.length <= 1) {
            showToast('Cannot delete the last remaining tier');
            return;
        }
        if (confirm('Delete this tier? (Any items placed in this tier will be returned to the pool)')) {
            const updatedTiers = state.tiers.filter(t => t.id !== tierId);
            await updateTiers(updatedTiers);
            closeModal('modal-tier-edit');
            showToast('Tier deleted');
        }
    });

    // ── Asset Library Modal ──────────────────────────────────────────────────
    $('btn-asset-library')?.addEventListener('click', async () => {
        openModal('modal-assets');
        selectedAssetUrls.clear();
        $('selected-asset-count').textContent = '0 selected';
        const grid = $('asset-grid');
        grid.innerHTML = '<div style="grid-column:1/-1;padding:1.5rem;text-align:center;color:var(--text-muted);">Loading assets…</div>';

        try {
            const res = await fetch('/api/custom-overlays/assets');
            if (res.ok) {
                const data = await res.json();
                const list = Array.isArray(data) ? data : (data.assets || []);
                libraryAssets = list.filter(a => {
                    if (a.kind === 'image') return true;
                    const name = (a.name || '').toLowerCase();
                    return ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.avif'].some(ext => name.endsWith(ext));
                });
                renderAssetGrid();
            }
        } catch {
            grid.innerHTML = '<div style="grid-column:1/-1;padding:1.5rem;text-align:center;color:#f85149;">Failed to load assets</div>';
        }
    });

    $('asset-search')?.addEventListener('input', renderAssetGrid);

    $('asset-grid')?.addEventListener('click', (e) => {
        const card = e.target.closest('.asset-card');
        if (!card) return;
        const url = card.dataset.url;
        if (selectedAssetUrls.has(url)) {
            selectedAssetUrls.delete(url);
            card.classList.remove('selected');
            card.querySelector('.asset-checkbox').checked = false;
        } else {
            selectedAssetUrls.add(url);
            card.classList.add('selected');
            card.querySelector('.asset-checkbox').checked = true;
        }
        $('selected-asset-count').textContent = `${selectedAssetUrls.size} selected`;
    });

    $('btn-select-all-assets')?.addEventListener('click', () => {
        libraryAssets.forEach(a => selectedAssetUrls.add(a.url));
        renderAssetGrid();
        $('selected-asset-count').textContent = `${selectedAssetUrls.size} selected`;
    });

    $('btn-deselect-all-assets')?.addEventListener('click', () => {
        selectedAssetUrls.clear();
        renderAssetGrid();
        $('selected-asset-count').textContent = '0 selected';
    });

    $('btn-add-selected-assets')?.addEventListener('click', async () => {
        if (selectedAssetUrls.size === 0) {
            showToast('No assets selected');
            return;
        }

        const itemsToAdd = [];
        libraryAssets.forEach(a => {
            if (selectedAssetUrls.has(a.url)) {
                const cleanName = a.caption || a.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
                itemsToAdd.push({
                    name: cleanName,
                    imageUrl: a.url
                });
            }
        });

        const success = await batchAddItems(itemsToAdd);
        if (success) {
            closeModal('modal-assets');
            showToast(`Added ${itemsToAdd.length} items to unranked pool`);
        } else {
            showToast('Failed to add assets');
        }
    });

    // ── Presets Modal ────────────────────────────────────────────────────────
    $('btn-presets')?.addEventListener('click', () => {
        renderPresetsList();
        openModal('modal-presets');
    });

    $('presets-list')?.addEventListener('click', async (e) => {
        const loadBtn = e.target.closest('[data-load-preset]');
        if (loadBtn) {
            const presetId = loadBtn.dataset.loadPreset;
            const state = getState();
            const preset = (state.presets || []).find(p => p.id === presetId);
            const name = preset ? preset.name : 'preset';
            if (confirm(`Load preset "${name}"? This will update your tier structure.`)) {
                await loadPreset(presetId);
                closeModal('modal-presets');
            }
            return;
        }

        const delBtn = e.target.closest('[data-del-preset]');
        if (delBtn) {
            const presetId = delBtn.dataset.delPreset;
            const state = getState();
            const preset = (state.presets || []).find(p => p.id === presetId);
            const name = preset ? preset.name : 'this preset';
            if (confirm(`Delete preset "${name}"?`)) {
                await deletePreset(presetId);
                renderPresetsList();
            }
        }
    });

    $('btn-restore-presets')?.addEventListener('click', async () => {
        const success = await restoreDefaultPresets();
        if (success) renderPresetsList();
    });

    $('btn-save-new-preset')?.addEventListener('click', async () => {
        const name = $('new-preset-name').value.trim();
        const description = $('new-preset-desc').value.trim();
        const includeItems = $('preset-include-items').checked;

        if (!name) {
            showToast('Preset name is required');
            return;
        }

        const success = await savePreset(name, description, includeItems);
        if (success) {
            $('new-preset-name').value = '';
            $('new-preset-desc').value = '';
            $('preset-include-items').checked = false;
            renderPresetsList();
        }
    });

    // ── Settings Modal ───────────────────────────────────────────────────────
    $('btn-settings')?.addEventListener('click', () => {
        const state = getState();
        $('setting-title').value = state.title || '';
        $('setting-consensus').value = state.settings.consensusMode || 'weighted_mean';
        $('setting-sub-mult').value = state.settings.subMultiplier || 1;
        $('setting-duration').value = state.settings.defaultDuration || 60;
        $('setting-auto-lock').checked = state.settings.autoLockIn !== false;
        $('setting-allow-change').checked = state.settings.allowVoteChange !== false;
        $('setting-announce-chat').checked = state.settings.announceChat !== false;
        $('setting-sound').checked = state.settings.soundEnabled !== false;
        $('setting-show-hint').checked = state.settings.showVoteHint !== false;
        $('setting-volume').value = state.settings.soundVolume !== undefined ? state.settings.soundVolume : 75;
        $('setting-volume-label').textContent = `${$('setting-volume').value}%`;
        openModal('modal-settings');
    });

    $('setting-volume')?.addEventListener('input', (e) => {
        $('setting-volume-label').textContent = `${e.target.value}%`;
        TierAudio.volume = Number(e.target.value) / 100;
    });

    $('btn-save-settings')?.addEventListener('click', async () => {
        const title = $('setting-title').value.trim();
        const consensusMode = $('setting-consensus').value;
        const subMultiplier = Number($('setting-sub-mult').value) || 1;
        const defaultDuration = Math.max(10, Number($('setting-duration').value) || 60);
        const autoLockIn = $('setting-auto-lock').checked;
        const allowVoteChange = $('setting-allow-change').checked;
        const announceChat = $('setting-announce-chat').checked;
        const soundEnabled = $('setting-sound').checked;
        const showVoteHint = $('setting-show-hint').checked;
        const soundVolume = Number($('setting-volume').value) || 75;

        TierAudio.enabled = soundEnabled;
        TierAudio.volume = soundVolume / 100;

        await saveSettings(title, {
            consensusMode,
            subMultiplier,
            defaultDuration,
            autoLockIn,
            allowVoteChange,
            announceChat,
            soundEnabled,
            soundVolume,
            showVoteHint
        });

        closeModal('modal-settings');
    });

    $('btn-export-image')?.addEventListener('click', exportTierListImage);
}

function renderAssetGrid() {
    const state = getState();
    const grid = $('asset-grid');
    const query = ($('asset-search').value || '').trim().toLowerCase();
    const filtered = libraryAssets.filter(a => {
        if (!query) return true;
        return (a.label || a.name || '').toLowerCase().includes(query) || (a.tags || []).some(t => t.toLowerCase().includes(query));
    });

    if (filtered.length === 0) {
        grid.innerHTML = '<div style="grid-column:1/-1;padding:1.5rem;text-align:center;color:var(--text-muted);">No matching images found</div>';
        return;
    }

    grid.innerHTML = filtered.map(a => {
        const isSel = selectedAssetUrls.has(a.url);
        const cleanName = a.caption || a.label || a.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
        const isAlreadyOnList = (state.items || []).some(i => i.imageUrl && (i.imageUrl === a.url || i.imageUrl.endsWith('/' + a.name)));
        return `
            <div class="asset-card${isSel ? ' selected' : ''}" data-url="${esc(a.url)}" data-name="${esc(cleanName)}">
                <input type="checkbox" class="asset-checkbox" ${isSel ? 'checked' : ''}>
                ${isAlreadyOnList ? '<span class="badge" style="position:absolute;top:6px;right:6px;background:rgba(56,189,248,0.2);color:#38bdf8;border:1px solid rgba(56,189,248,0.4);font-size:10px;padding:1px 6px;border-radius:10px;pointer-events:none;z-index:2;">In List</span>' : ''}
                <img src="${esc(a.url)}" alt="${esc(cleanName)}" loading="lazy">
                <div class="asset-card-label">${esc(cleanName)}</div>
            </div>
        `;
    }).join('');
}

function renderPresetsList() {
    const listEl = $('presets-list');
    const presets = getState().presets || [];

    if (presets.length === 0) {
        listEl.innerHTML = '<div style="padding:1.5rem;text-align:center;color:var(--text-muted);font-style:italic;">No presets available. Click "Restore Defaults" above to bring back built-in templates.</div>';
        return;
    }

    listEl.innerHTML = presets.map(p => `
        <div style="background:var(--bg-inset);border:1px solid var(--border);border-radius:6px;padding:0.6rem 0.8rem;display:flex;align-items:center;justify-content:space-between;gap:0.75rem;">
            <div style="min-width:0;flex:1;">
                <div style="font-weight:600;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(p.name)}</div>
                <div style="font-size:11px;color:var(--text-muted);">${esc(p.description || '')} &middot; ${(p.tiers || []).length} Tiers</div>
            </div>
            <div style="display:flex;gap:6px;flex-shrink:0;">
                <button class="btn primary" data-load-preset="${esc(p.id)}">Load</button>
                <button class="btn danger" data-del-preset="${esc(p.id)}" title="Delete preset">
                    <svg class="ico" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg> Delete
                </button>
            </div>
        </div>
    `).join('');
}

// ── High-Resolution PNG Image Export ─────────────────────────────────────────

export async function exportTierListImage() {
    const state = getState();
    showToast('Generating high-resolution tier list image…');

    const width = 1920;
    const headerHeight = 110;
    const tierHeaderWidth = 220;
    const cardSize = 110;
    const cardGap = 10;
    const rowPadding = 12;
    const contentWidth = width - tierHeaderWidth;

    const rankedTiers = state.tiers.slice();

    const tierRowData = rankedTiers.map(tier => {
        const items = state.items
            .filter(i => i.tierId === tier.id)
            .sort((a, b) => (a.order || 0) - (b.order || 0));

        const availableWidth = contentWidth - (rowPadding * 2);
        const itemsPerRow = Math.max(1, Math.floor((availableWidth + cardGap) / (cardSize + cardGap)));
        const rowCount = Math.max(1, Math.ceil(items.length / itemsPerRow));
        const rowHeight = Math.max(120, (rowCount * (cardSize + cardGap)) - cardGap + (rowPadding * 2));

        return { tier, items, itemsPerRow, rowHeight };
    });

    const totalRowsHeight = tierRowData.reduce((sum, r) => sum + r.rowHeight, 0);
    const footerHeight = 44;
    const totalHeight = headerHeight + totalRowsHeight + footerHeight;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = totalHeight;
    const ctx = canvas.getContext('2d');

    // Background
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, width, totalHeight);

    // Header
    ctx.fillStyle = '#161b22';
    ctx.fillRect(0, 0, width, headerHeight);
    ctx.fillStyle = '#30363d';
    ctx.fillRect(0, headerHeight - 1, width, 1);

    ctx.font = 'bold 34px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = '#f0f6fc';
    ctx.textBaseline = 'middle';
    ctx.fillText(state.title || 'Community Tier List', 32, headerHeight / 2 - 12);

    ctx.font = '15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = '#8b949e';
    const totalRanked = state.items.filter(i => i.tierId).length;
    const subtitle = `${totalRanked} items ranked across ${state.tiers.length} tiers · ${new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}`;
    ctx.fillText(subtitle, 32, headerHeight / 2 + 20);

    ctx.font = 'bold 22px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = '#58a6ff';
    ctx.textAlign = 'right';
    ctx.fillText('StreamPulse', width - 32, headerHeight / 2);
    ctx.textAlign = 'left';

    const loadImage = (url) => new Promise((resolve) => {
        if (!url) return resolve(null);
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = url;
    });

    const imageCache = new Map();
    for (const row of tierRowData) {
        for (const item of row.items) {
            if (item.imageUrl && !imageCache.has(item.imageUrl)) {
                imageCache.set(item.imageUrl, await loadImage(item.imageUrl));
            }
        }
    }

    let currentY = headerHeight;

    for (const row of tierRowData) {
        const { tier, items, itemsPerRow, rowHeight } = row;

        ctx.fillStyle = tier.color || '#ff7f7f';
        ctx.fillRect(0, currentY, tierHeaderWidth, rowHeight);

        ctx.save();
        ctx.fillStyle = '#111111';
        ctx.shadowColor = 'rgba(255, 255, 255, 0.4)';
        ctx.shadowBlur = 2;
        ctx.font = 'bold 32px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(tier.label, tierHeaderWidth / 2, currentY + (rowHeight / 2) - (tier.description ? 10 : 0));
        if (tier.description) {
            ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
            ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
            ctx.shadowBlur = 0;
            ctx.fillText(tier.description, tierHeaderWidth / 2, currentY + (rowHeight / 2) + 16);
        }
        ctx.restore();

        ctx.fillStyle = '#161b22';
        ctx.fillRect(tierHeaderWidth, currentY, contentWidth, rowHeight);

        items.forEach((item, index) => {
            const col = index % itemsPerRow;
            const r = Math.floor(index / itemsPerRow);
            const cardX = tierHeaderWidth + rowPadding + (col * (cardSize + cardGap));
            const cardY = currentY + rowPadding + (r * (cardSize + cardGap));

            ctx.save();
            ctx.beginPath();
            ctx.roundRect(cardX, cardY, cardSize, cardSize, 6);
            ctx.clip();

            const img = imageCache.get(item.imageUrl);
            if (img) {
                const imgAspect = img.width / img.height;
                let sx = 0, sy = 0, sWidth = img.width, sHeight = img.height;
                if (imgAspect > 1) {
                    sWidth = img.height;
                    sx = (img.width - sWidth) / 2;
                } else {
                    sHeight = img.width;
                    sy = (img.height - sHeight) / 2;
                }
                ctx.drawImage(img, sx, sy, sWidth, sHeight, cardX, cardY, cardSize, cardSize);
            } else {
                ctx.fillStyle = '#21262d';
                ctx.fillRect(cardX, cardY, cardSize, cardSize);
                ctx.fillStyle = '#8b949e';
                ctx.font = '11px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('No Image', cardX + cardSize / 2, cardY + cardSize / 2);
            }

            const capHeight = 22;
            const grad = ctx.createLinearGradient(cardX, cardY + cardSize - capHeight - 8, cardX, cardY + cardSize);
            grad.addColorStop(0, 'rgba(0,0,0,0)');
            grad.addColorStop(0.3, 'rgba(0,0,0,0.7)');
            grad.addColorStop(1, 'rgba(0,0,0,0.92)');
            ctx.fillStyle = grad;
            ctx.fillRect(cardX, cardY + cardSize - capHeight - 8, cardSize, capHeight + 8);

            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(item.name, cardX + cardSize / 2, cardY + cardSize - (capHeight / 2));
            ctx.restore();

            ctx.save();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.roundRect(cardX, cardY, cardSize, cardSize, 6);
            ctx.stroke();
            ctx.restore();
        });

        ctx.fillStyle = '#30363d';
        ctx.fillRect(0, currentY + rowHeight - 1, width, 1);
        currentY += rowHeight;
    }

    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, currentY, width, footerHeight);
    ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = '#6e7681';
    ctx.textBaseline = 'middle';
    ctx.fillText('Created with StreamPulse Tier List Maker', 32, currentY + (footerHeight / 2));
    ctx.textAlign = 'right';
    ctx.fillText('https://github.com/jarbochov/StreamPulse', width - 32, currentY + (footerHeight / 2));

    canvas.toBlob((blob) => {
        if (!blob) {
            showToast('Failed to create image blob');
            return;
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const cleanTitle = (state.title || 'tier-list').toLowerCase().replace(/[^a-z0-9]+/g, '-');
        a.download = `${cleanTitle}-${Date.now().toString(36)}.png`;
        a.href = url;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        showToast('High-res tier list PNG downloaded!');
    }, 'image/png');
}

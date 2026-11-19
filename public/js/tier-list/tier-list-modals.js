/**
 * StreamPulse Tier List Maker — Modals & Asset Operations
 * Manages item/tier editing, asset library picker, preset packs, settings, and high-res PNG export.
 */

import { getState, $, esc, showToast, fetchState, saveItem, updateTiers, batchAddItems, loadPreset, deletePreset, restoreDefaultPresets, savePreset, saveSettings } from './tier-list-state.js';
import { TierAudio } from './tier-list-audio.js';
import { resolveTierThemePalette } from './tier-list-themes.js';
import { getContrastColor } from './tier-list-board.js';

let libraryAssets = [];
let assetBrowser = null, shownAssets = [];
let selectedAssetUrls = new Set();
let assetModalMode = 'items';
let bannerPickCallback = null;
let tierSoundPreviewAudio = null;

export function openModal(id) {
    const el = $(id);
    if (el) el.classList.add('open');
}

export function closeModal(id) {
    if (id === 'modal-assets') {
        assetBrowser?.cancel();
        assetModalMode = 'items';
        bannerPickCallback = null;
    }
    if (tierSoundPreviewAudio) {
        try { tierSoundPreviewAudio.pause(); } catch {}
        tierSoundPreviewAudio = null;
    }
    const el = $(id);
    if (el) el.classList.remove('open');
}

async function openAssetLibraryModal(mode = 'items', onPick = null) {
    assetModalMode = mode === 'banner' ? 'banner' : (mode === 'audio' ? 'audio' : 'items');
    bannerPickCallback = (assetModalMode === 'banner' || assetModalMode === 'audio') ? onPick : null;

    const modalEl = $('modal-assets');
    const titleEl = modalEl?.querySelector('.modal-title');
    if (titleEl) {
        titleEl.textContent = assetModalMode === 'banner'
            ? 'Select Banner Image from Library'
            : (assetModalMode === 'audio' ? 'Select Tier Sound from Library' : 'Select Assets from Library');
    }
    const selectAllBtn = $('btn-select-all-assets');
    const deselectAllBtn = $('btn-deselect-all-assets');
    const confirmBtn = $('btn-add-selected-assets');
    const isSinglePick = assetModalMode === 'banner' || assetModalMode === 'audio';
    if (selectAllBtn) selectAllBtn.hidden = isSinglePick;
    if (deselectAllBtn) deselectAllBtn.hidden = isSinglePick;
    if (confirmBtn) {
        confirmBtn.textContent = assetModalMode === 'banner'
            ? 'Use Selected Banner'
            : (assetModalMode === 'audio' ? 'Use Selected Sound' : 'Add Selected to Pool');
    }

    if (!assetBrowser) {
        const { mountAssetBrowser } = await import('../asset-browser.js');
        assetBrowser = mountAssetBrowser({ search: $('asset-search'), key: 'tier-list-images', onChange: renderAssetGrid });
    }
    openModal('modal-assets');
    libraryAssets = [];
    shownAssets = [];
    selectedAssetUrls.clear();
    $('selected-asset-count').textContent = assetModalMode === 'banner'
        ? 'Select 1 banner image'
        : (assetModalMode === 'audio' ? 'Select 1 audio file' : '0 selected');
    const grid = $('asset-grid');
    grid.innerHTML = '<div style="grid-column:1/-1;padding:1.5rem;text-align:center;color:var(--text-muted);">Loading assets…</div>';

    try {
        const res = await fetch('/api/custom-overlays/assets');
        if (res.ok) {
            const data = await res.json();
            const list = Array.isArray(data) ? data : (data.assets || []);
            libraryAssets = list.filter(a => {
                const name = (a.name || '').toLowerCase();
                if (assetModalMode === 'audio') {
                    if (a.kind === 'audio') return true;
                    return ['.mp3', '.wav', '.m4a', '.aac', '.oga', '.ogg'].some(ext => name.endsWith(ext));
                }
                if (a.kind === 'image') return true;
                return ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.avif'].some(ext => name.endsWith(ext));
            });
            renderAssetGrid();
        }
    } catch {
        grid.innerHTML = '<div style="grid-column:1/-1;padding:1.5rem;text-align:center;color:#f85149;">Failed to load assets</div>';
    }
}

export function openAssetLibraryForBanner(onSelect) {
    return openAssetLibraryModal('banner', onSelect);
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
        const soundUrl = $('tier-edit-sound-url')?.value?.trim() || '';

        if (!label) {
            showToast('Tier label required');
            return;
        }

        const updatedTiers = state.tiers.map(t => {
            if (t.id === tierId) {
                return { ...t, label, color, description, soundUrl };
            }
            return t;
        });

        await updateTiers(updatedTiers);
        closeModal('modal-tier-edit');
        showToast('Tier updated');
    });

    $('btn-tier-sound-upload')?.addEventListener('click', () => {
        $('tier-sound-file-input')?.click();
    });

    $('tier-sound-file-input')?.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        showToast('Uploading tier audio…');
        try {
            const res = await fetch('/api/custom-overlays/assets', {
                method: 'POST',
                headers: {
                    'Content-Type': file.type || 'audio/mpeg',
                    'x-asset-name': file.name || `tier-sound-${Date.now()}.mp3`
                },
                body: file
            });
            if (res.ok) {
                const data = await res.json();
                if ($('tier-edit-sound-url')) $('tier-edit-sound-url').value = data.url;
                showToast('Tier sound uploaded!');
            } else {
                showToast('Failed to upload audio file');
            }
        } catch {
            showToast('Failed to upload audio file');
        } finally {
            e.target.value = '';
        }
    });

    $('btn-tier-sound-library')?.addEventListener('click', () => {
        openAssetLibraryModal('audio', (pickedUrl) => {
            if ($('tier-edit-sound-url')) $('tier-edit-sound-url').value = pickedUrl;
            showToast('Selected tier sound from Asset Library');
        });
    });

    $('btn-tier-sound-test')?.addEventListener('click', () => {
        const url = $('tier-edit-sound-url')?.value?.trim();
        if (!url) {
            showToast('Enter or pick an audio URL first');
            return;
        }
        if (tierSoundPreviewAudio) {
            try { tierSoundPreviewAudio.pause(); } catch {}
        }
        tierSoundPreviewAudio = new Audio(url);
        tierSoundPreviewAudio.volume = TierAudio.volume || 0.75;
        tierSoundPreviewAudio.play().catch(() => showToast('Unable to play audio preview'));
    });

    $('btn-tier-sound-clear')?.addEventListener('click', () => {
        if ($('tier-edit-sound-url')) $('tier-edit-sound-url').value = '';
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
    $('btn-asset-library')?.addEventListener('click', () => openAssetLibraryModal('items'));

    $('asset-grid')?.addEventListener('click', (e) => {
        const playBtn = e.target.closest('[data-preview-audio]');
        if (playBtn) {
            e.stopPropagation();
            const audioUrl = playBtn.dataset.previewAudio;
            if (tierSoundPreviewAudio) {
                try { tierSoundPreviewAudio.pause(); } catch {}
            }
            tierSoundPreviewAudio = new Audio(audioUrl);
            tierSoundPreviewAudio.volume = TierAudio.volume || 0.75;
            tierSoundPreviewAudio.play().catch(() => showToast('Unable to preview audio'));
            return;
        }
        const card = e.target.closest('.asset-card');
        if (!card) return;
        const url = card.dataset.url;
        if (assetModalMode === 'banner' || assetModalMode === 'audio') {
            selectedAssetUrls.clear();
            $('asset-grid')?.querySelectorAll('.asset-card.selected').forEach(other => {
                other.classList.remove('selected');
                const cb = other.querySelector('.asset-checkbox');
                if (cb) cb.checked = false;
            });
            selectedAssetUrls.add(url);
            card.classList.add('selected');
            const cb = card.querySelector('.asset-checkbox');
            if (cb) cb.checked = true;
            $('selected-asset-count').textContent = assetModalMode === 'audio' ? '1 sound selected' : '1 banner selected';
            return;
        }
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
        if (assetModalMode === 'banner') return;
        shownAssets.forEach(a => selectedAssetUrls.add(a.url));
        renderAssetGrid();
        $('selected-asset-count').textContent = `${selectedAssetUrls.size} selected`;
    });

    $('btn-deselect-all-assets')?.addEventListener('click', () => {
        selectedAssetUrls.clear();
        renderAssetGrid();
        $('selected-asset-count').textContent = assetModalMode === 'banner' ? 'Select 1 banner image' : '0 selected';
    });

    $('btn-add-selected-assets')?.addEventListener('click', async () => {
        if (assetModalMode === 'banner' || assetModalMode === 'audio') {
            const [pickedUrl] = Array.from(selectedAssetUrls);
            if (!pickedUrl) {
                showToast(assetModalMode === 'audio' ? 'Please select an audio file' : 'Please select a banner image');
                return;
            }
            const cb = bannerPickCallback;
            closeModal('modal-assets');
            if (cb) await cb(pickedUrl);
            return;
        }

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
    function syncChatVotingSettingsUI() {
        const enabled = $('setting-chat-voting')?.checked !== false;
        const group = $('group-chat-vote-settings');
        if (group) group.hidden = !enabled;
    }

    $('setting-chat-voting')?.addEventListener('change', syncChatVotingSettingsUI);

    $('btn-settings')?.addEventListener('click', () => {
        const state = getState();
        $('setting-title').value = state.title || '';
        const chatVotingCb = $('setting-chat-voting');
        if (chatVotingCb) chatVotingCb.checked = state.settings.chatVotingEnabled !== false;
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
        syncChatVotingSettingsUI();
        openModal('modal-settings');
    });

    $('setting-volume')?.addEventListener('input', (e) => {
        $('setting-volume-label').textContent = `${e.target.value}%`;
        TierAudio.volume = Number(e.target.value) / 100;
    });

    $('btn-save-settings')?.addEventListener('click', async () => {
        const title = $('setting-title').value.trim();
        const chatVotingEnabled = $('setting-chat-voting')?.checked !== false;
        const consensusMode = $('setting-consensus').value;
        const subMultiplier = Number($('setting-sub-mult').value) || 1;
        const defaultDuration = Math.max(10, Number($('setting-duration').value) || 60);
        const autoLockIn = $('setting-auto-lock').checked;
        const allowVoteChange = $('setting-allow-change').checked;
        const announceChat = $('setting-announce-chat').checked;
        const soundEnabled = $('setting-sound').checked;
        const showVoteHint = $('setting-show-hint').checked;
        const rawVol = Number($('setting-volume').value);
        const soundVolume = Number.isFinite(rawVol) ? Math.min(100, Math.max(0, Math.round(rawVol))) : 75;

        TierAudio.enabled = chatVotingEnabled && soundEnabled && soundVolume > 0;
        TierAudio.volume = soundVolume / 100;
        if (!TierAudio.enabled) TierAudio.suspend();

        await saveSettings(title, {
            chatVotingEnabled,
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
    const filtered = assetBrowser ? assetBrowser.filter(libraryAssets) : libraryAssets.filter(a => {
        if (!query) return true;
        return (a.label || a.name || '').toLowerCase().includes(query) || (a.tags || []).some(t => t.toLowerCase().includes(query));
    });
    shownAssets = filtered;

    if (filtered.length === 0) {
        grid.innerHTML = `<div style="grid-column:1/-1;padding:1.5rem;text-align:center;color:var(--text-muted);">${assetModalMode === 'audio' ? 'No matching audio files found' : 'No matching images found'}</div>`;
        return;
    }

    grid.innerHTML = filtered.map(a => {
        const isSel = selectedAssetUrls.has(a.url);
        const cleanName = a.caption || a.label || a.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
        if (assetModalMode === 'audio') {
            return `
                <div class="asset-card${isSel ? ' selected' : ''}" data-url="${esc(a.url)}" data-name="${esc(cleanName)}" style="justify-content:center;align-items:center;gap:6px;padding:10px;min-height:96px;">
                    <input type="checkbox" class="asset-checkbox" ${isSel ? 'checked' : ''}>
                    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--accent);flex-shrink:0;"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
                    <div class="asset-card-label" style="position:static;background:none;padding:0;max-width:100%;">${esc(cleanName)}</div>
                    <button type="button" class="btn btn-sm" data-preview-audio="${esc(a.url)}" style="font-size:10px;padding:2px 8px;">Play</button>
                </div>
            `;
        }
        const isAlreadyOnList = assetModalMode === 'banner'
            ? Boolean(state.theme?.bannerUrl && (state.theme.bannerUrl === a.url || state.theme.bannerUrl.endsWith('/' + a.name)))
            : (state.items || []).some(i => i.imageUrl && (i.imageUrl === a.url || i.imageUrl.endsWith('/' + a.name)));
        const statusLabel = assetModalMode === 'banner' ? 'Active Banner' : 'In List';
        return `
            <div class="asset-card${isSel ? ' selected' : ''}" data-url="${esc(a.url)}" data-name="${esc(cleanName)}">
                <input type="checkbox" class="asset-checkbox" ${isSel ? 'checked' : ''}>
                ${isAlreadyOnList ? `<span class="badge" style="position:absolute;top:6px;right:6px;background:rgba(56,189,248,0.2);color:#38bdf8;border:1px solid rgba(56,189,248,0.4);font-size:10px;padding:1px 6px;border-radius:10px;pointer-events:none;z-index:2;">${statusLabel}</span>` : ''}
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

function drawFittedCanvasImage(ctx, img, dx, dy, dW, dH, fitMode = 'cover') {
    const imgAspect = img.width / Math.max(1, img.height);
    const boxAspect = dW / Math.max(1, dH);
    if (fitMode === 'contain') {
        let rw = dW;
        let rh = dH;
        if (imgAspect > boxAspect) rh = dW / imgAspect;
        else rw = dH * imgAspect;
        ctx.drawImage(img, dx + (dW - rw) / 2, dy + (dH - rh) / 2, rw, rh);
        return;
    }
    let sx = 0, sy = 0, sWidth = img.width, sHeight = img.height;
    if (imgAspect > boxAspect) {
        sWidth = img.height * boxAspect;
        sx = (img.width - sWidth) / 2;
    } else {
        sHeight = img.width / boxAspect;
        sy = (img.height - sHeight) / 2;
    }
    ctx.drawImage(img, sx, sy, sWidth, sHeight, dx, dy, dW, dH);
}

function wrapCanvasCaptionLines(ctx, text, maxWidth) {
    const words = String(text || '').split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    const lines = [];
    let current = '';
    const pushBrokenWord = (word) => {
        let chunk = '';
        for (const ch of word) {
            const next = chunk + ch;
            if (ctx.measureText(next).width > maxWidth && chunk) {
                lines.push(chunk);
                chunk = ch;
            } else {
                chunk = next;
            }
        }
        return chunk;
    };
    for (const word of words) {
        const candidate = current ? `${current} ${word}` : word;
        if (ctx.measureText(candidate).width <= maxWidth) {
            current = candidate;
        } else {
            if (current) lines.push(current);
            if (ctx.measureText(word).width <= maxWidth) {
                current = word;
            } else {
                current = pushBrokenWord(word);
            }
        }
    }
    if (current) lines.push(current);
    return lines;
}

function resolveCanvasFill(ctx, cssVal, x, y, w, h, fallback) {
    const raw = String(cssVal || '').trim();
    if (!raw || raw === 'transparent') return fallback;
    if (raw.toLowerCase().startsWith('linear-gradient(')) {
        const stops = raw.match(/(#[0-9a-f]{3,8}|rgba?\([^)]+\))/gi) || [];
        if (stops.length >= 2) {
            const grad = ctx.createLinearGradient(x, y, x + w, y + h);
            grad.addColorStop(0, stops[0]);
            grad.addColorStop(1, stops[stops.length - 1]);
            return grad;
        }
        return stops[0] || fallback;
    }
    return raw;
}

function applyCanvasTextTransform(str, transform) {
    const text = String(str || '');
    if (transform === 'uppercase') return text.toUpperCase();
    if (transform === 'lowercase') return text.toLowerCase();
    if (transform === 'capitalize') return text.replace(/\b\w/g, c => c.toUpperCase());
    return text;
}

function buildCanvasFont(weight, px, family) {
    const cleanFam = String(family || '').replace(/["']/g, '').trim();
    const stack = cleanFam
        ? `"${cleanFam}", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
        : '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    return `${weight} ${px}px ${stack}`;
}

export async function exportTierListImage() {
    const state = getState();
    const theme = state.theme || {};
    showToast('Generating high-resolution tier list image…');

    const palette = resolveTierThemePalette(theme.style || 'dark', theme.customThemeId);
    const effBg = theme.backgroundColor || palette.bg;
    const effRowBg = theme.rowBackgroundColor || palette.rowBg;
    const effBorder = (theme.borderColor || palette.border) === 'transparent' ? 'rgba(255,255,255,0.12)' : (theme.borderColor || palette.border || '#30363d');
    const effText = theme.textColor || palette.text || '#f0f6fc';
    const effMuted = theme.mutedColor || palette.muted || '#cbd5e1';
    const effAccent = theme.accentColor || palette.accent || '#58a6ff';
    const effFont = theme.fontFamily || palette.font || '';
    const effHeadingFont = theme.headingFont || palette.headingFont || effFont;
    const effWeight = theme.fontWeight || palette.weight || '700';
    const effHeadingWeight = theme.fontWeight || palette.weight || '800';
    const effTransform = theme.textTransform || palette.textTransform || 'none';
    const effFontScale = Math.max(0.5, Math.min(2.0, Number(theme.fontScale) || 1));

    if (effFont) window.OverlayFonts?.loadFont?.(effFont);
    if (effHeadingFont) window.OverlayFonts?.loadFont?.(effHeadingFont);
    if (document.fonts?.ready) {
        await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 1500))]);
    }

    const loadImage = (url) => new Promise((resolve) => {
        if (!url) return resolve(null);
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = url;
    });

    const bannerImg = theme.bannerUrl ? await loadImage(theme.bannerUrl) : null;

    const width = 1920;
    const headerHeight = bannerImg ? Math.min(240, Math.max(80, Number(theme.bannerHeight) || 110)) : 110;
    const tierHeaderWidth = 220;
    const baseCardW = 110;
    const aspect = theme.cardAspect || '1/1';
    const cardFit = ['cover', 'contain', 'natural'].includes(theme.cardFit) ? theme.cardFit : 'cover';
    const isNatural = cardFit === 'natural';
    const cardH = isNatural ? 110 : (aspect === '3/4' ? 147 : aspect === '16/9' ? 62 : 110);
    const drawFit = cardFit === 'natural' ? 'contain' : cardFit;
    const showCaptions = theme.showCaptions !== false;
    const fitCaptions = Boolean(theme.fitCaptions);
    const cardGap = 10;
    const rowPadding = 12;
    const contentWidth = width - tierHeaderWidth;
    const availableWidth = contentWidth - (rowPadding * 2);

    const rankedTiers = state.tiers.slice();
    const imageCache = new Map();
    for (const item of state.items || []) {
        if (item.tierId && item.imageUrl && !imageCache.has(item.imageUrl)) {
            imageCache.set(item.imageUrl, await loadImage(item.imageUrl));
        }
    }

    const tierRowData = rankedTiers.map(tier => {
        const items = state.items
            .filter(i => i.tierId === tier.id)
            .sort((a, b) => (a.order || 0) - (b.order || 0));

        const placements = [];
        let lineIdx = 0;
        let curX = 0;
        for (const item of items) {
            const img = imageCache.get(item.imageUrl);
            let w = baseCardW;
            if (isNatural) {
                const ratio = (img && img.width > 0 && img.height > 0)
                    ? Math.min(2.6, Math.max(0.45, img.width / img.height))
                    : 1;
                w = Math.round(Math.min(availableWidth, Math.max(50, cardH * ratio)));
            }
            if (curX > 0 && curX + cardGap + w > availableWidth) {
                lineIdx++;
                curX = 0;
            }
            placements.push({
                item,
                xOffset: curX,
                yOffset: lineIdx * (cardH + cardGap),
                w,
                h: cardH
            });
            curX += (curX === 0 ? w : cardGap + w);
        }

        const rowCount = Math.max(1, lineIdx + (placements.length ? 1 : 0));
        const rowHeight = Math.max(cardH + rowPadding * 2, (rowCount * (cardH + cardGap)) - cardGap + (rowPadding * 2));

        return { tier, placements, rowHeight };
    });

    const totalRowsHeight = tierRowData.reduce((sum, r) => sum + r.rowHeight, 0);
    const footerHeight = 44;
    const totalHeight = headerHeight + totalRowsHeight + footerHeight;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = totalHeight;
    const ctx = canvas.getContext('2d');

    // Background
    ctx.fillStyle = resolveCanvasFill(ctx, effBg, 0, 0, width, totalHeight, '#0d1117');
    ctx.fillRect(0, 0, width, totalHeight);

    // Header / Custom Banner
    ctx.fillStyle = resolveCanvasFill(ctx, effBg, 0, 0, width, headerHeight, '#161b22');
    ctx.fillRect(0, 0, width, headerHeight);
    if (bannerImg) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, width, headerHeight);
        ctx.clip();
        drawFittedCanvasImage(ctx, bannerImg, 0, 0, width, headerHeight, theme.bannerFit === 'contain' ? 'contain' : 'cover');
        if (theme.bannerMode === 'behind') {
            const scrim = ctx.createLinearGradient(0, 0, width, 0);
            scrim.addColorStop(0, 'rgba(0,0,0,0.72)');
            scrim.addColorStop(0.65, 'rgba(0,0,0,0.38)');
            scrim.addColorStop(1, 'rgba(0,0,0,0.52)');
            ctx.fillStyle = scrim;
            ctx.fillRect(0, 0, width, headerHeight);
        }
        ctx.restore();
    }
    ctx.fillStyle = effBorder;
    ctx.fillRect(0, headerHeight - 1, width, 1);

    if (!bannerImg || theme.bannerMode === 'behind') {
        const titleSize = Math.round(34 * effFontScale);
        ctx.font = buildCanvasFont(effHeadingWeight, titleSize, effHeadingFont);
        ctx.fillStyle = (bannerImg && theme.bannerMode === 'behind') ? '#f0f6fc' : effText;
        ctx.textBaseline = 'middle';
        ctx.fillText(applyCanvasTextTransform(state.title || 'Community Tier List', effTransform), 32, headerHeight / 2 - 12);

        ctx.font = buildCanvasFont('400', 15, effFont);
        ctx.fillStyle = (bannerImg && theme.bannerMode === 'behind') ? '#cbd5e1' : effMuted;
        const totalRanked = state.items.filter(i => i.tierId).length;
        const subtitle = `${totalRanked} items ranked across ${state.tiers.length} tiers · ${new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}`;
        ctx.fillText(subtitle, 32, headerHeight / 2 + 20);

        ctx.font = buildCanvasFont(effHeadingWeight, 22, effHeadingFont);
        ctx.fillStyle = effAccent;
        ctx.textAlign = 'right';
        ctx.fillText('StreamPulse', width - 32, headerHeight / 2);
        ctx.textAlign = 'left';
    }

    let currentY = headerHeight;

    for (const row of tierRowData) {
        const { tier, placements, rowHeight } = row;

        ctx.fillStyle = tier.color || '#ff7f7f';
        ctx.fillRect(0, currentY, tierHeaderWidth, rowHeight);

        const headerTextColor = getContrastColor(tier.color);
        const isDarkHeaderText = headerTextColor === '#111111';

        ctx.save();
        ctx.fillStyle = headerTextColor;
        ctx.shadowColor = isDarkHeaderText ? 'rgba(255, 255, 255, 0.35)' : 'rgba(0, 0, 0, 0.45)';
        ctx.shadowBlur = 2;
        const labelFontSize = Math.round(32 * Math.min(1.3, effFontScale));
        const descFontSize = Math.max(10, Math.min(14, Math.round(12 * effFontScale)));
        const descLineHeight = Math.round(descFontSize * 1.2);
        let descLines = [];
        if (tier.description) {
            ctx.font = buildCanvasFont('600', descFontSize, effFont);
            descLines = wrapCanvasCaptionLines(ctx, tier.description, tierHeaderWidth - 18).slice(0, 3);
        }

        const labelHeight = labelFontSize;
        const descBlockH = descLines.length > 0 ? (descLines.length * descLineHeight) + 6 : 0;
        const totalBlockH = labelHeight + descBlockH;
        const blockTopY = currentY + (rowHeight - totalBlockH) / 2;

        ctx.font = buildCanvasFont(effHeadingWeight, labelFontSize, effHeadingFont);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(
            applyCanvasTextTransform(tier.label, effTransform),
            tierHeaderWidth / 2,
            blockTopY + (labelHeight / 2),
            tierHeaderWidth - 16
        );

        if (descLines.length > 0) {
            ctx.font = buildCanvasFont('600', descFontSize, effFont);
            ctx.fillStyle = isDarkHeaderText ? 'rgba(17, 17, 17, 0.82)' : 'rgba(255, 255, 255, 0.88)';
            ctx.shadowBlur = 0;
            const descStartY = blockTopY + labelHeight + 6 + (descLineHeight / 2);
            descLines.forEach((ln, idx) => {
                ctx.fillText(ln, tierHeaderWidth / 2, descStartY + (idx * descLineHeight));
            });
        }
        ctx.restore();

        ctx.fillStyle = resolveCanvasFill(ctx, effRowBg, tierHeaderWidth, currentY, contentWidth, rowHeight, '#161b22');
        ctx.fillRect(tierHeaderWidth, currentY, contentWidth, rowHeight);

        placements.forEach(({ item, xOffset, yOffset, w, h }) => {
            const cardX = tierHeaderWidth + rowPadding + xOffset;
            const cardY = currentY + rowPadding + yOffset;

            ctx.save();
            ctx.beginPath();
            ctx.roundRect(cardX, cardY, w, h, 6);
            ctx.clip();

            ctx.fillStyle = '#111827';
            ctx.fillRect(cardX, cardY, w, h);

            const img = imageCache.get(item.imageUrl);
            if (img) {
                drawFittedCanvasImage(ctx, img, cardX, cardY, w, h, drawFit);
            } else {
                ctx.fillStyle = '#21262d';
                ctx.fillRect(cardX, cardY, w, h);
                ctx.fillStyle = '#8b949e';
                ctx.font = buildCanvasFont('400', 11, effFont);
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('No Image', cardX + w / 2, cardY + h / 2);
            }

            if (showCaptions) {
                const capText = applyCanvasTextTransform(item.name, effTransform);
                if (fitCaptions) {
                    const maxCapH = Math.floor(h * 0.76);
                    let fontSize = Math.min(16, Math.max(9, Math.round(11 * effFontScale)));
                    let lines = [];
                    let lineHeight = 13;
                    for (; fontSize >= 6; fontSize--) {
                        ctx.font = buildCanvasFont(effWeight, fontSize, effFont);
                        lineHeight = Math.max(fontSize + 2, Math.round(fontSize * 1.15));
                        lines = wrapCanvasCaptionLines(ctx, capText, w - 8);
                        if (lines.length * lineHeight + 6 <= maxCapH) break;
                    }
                    const capHeight = Math.min(h, Math.max(20, lines.length * lineHeight + 6));
                    const grad = ctx.createLinearGradient(cardX, cardY + h - capHeight - 10, cardX, cardY + h);
                    grad.addColorStop(0, 'rgba(0,0,0,0)');
                    grad.addColorStop(0.25, 'rgba(0,0,0,0.74)');
                    grad.addColorStop(1, 'rgba(0,0,0,0.92)');
                    ctx.fillStyle = grad;
                    ctx.fillRect(cardX, cardY + h - capHeight - 10, w, capHeight + 10);

                    ctx.fillStyle = '#ffffff';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    const startY = cardY + h - capHeight + (lineHeight / 2) + 2;
                    lines.forEach((ln, li) => {
                        ctx.fillText(ln, cardX + w / 2, startY + (li * lineHeight));
                    });
                } else {
                    const capHeight = 22;
                    const grad = ctx.createLinearGradient(cardX, cardY + h - capHeight - 8, cardX, cardY + h);
                    grad.addColorStop(0, 'rgba(0,0,0,0)');
                    grad.addColorStop(0.3, 'rgba(0,0,0,0.7)');
                    grad.addColorStop(1, 'rgba(0,0,0,0.92)');
                    ctx.fillStyle = grad;
                    ctx.fillRect(cardX, cardY + h - capHeight - 8, w, capHeight + 8);

                    ctx.fillStyle = '#ffffff';
                    ctx.font = buildCanvasFont(effWeight, Math.min(14, Math.max(9, Math.round(11 * effFontScale))), effFont);
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(capText, cardX + w / 2, cardY + h - (capHeight / 2), w - 6);
                }
            }
            ctx.restore();

            ctx.save();
            ctx.strokeStyle = effBorder;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.roundRect(cardX, cardY, w, h, 6);
            ctx.stroke();
            ctx.restore();
        });

        ctx.fillStyle = effBorder;
        ctx.fillRect(0, currentY + rowHeight - 1, width, 1);
        currentY += rowHeight;
    }

    ctx.fillStyle = resolveCanvasFill(ctx, effBg, 0, currentY, width, footerHeight, '#0d1117');
    ctx.fillRect(0, currentY, width, footerHeight);
    ctx.font = buildCanvasFont('400', 12, effFont);
    ctx.fillStyle = effMuted;
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

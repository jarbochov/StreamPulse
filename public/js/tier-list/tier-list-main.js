/**
 * StreamPulse Tier List Maker — Main Bootstrap
 * Coordinates state, drag-and-drop file ingestion, clipboard image paste,
 * board interactions, live voting, and modal dialogs.
 */

import { getState, $, showToast, fetchState, setupWebSocket, onStateChange, moveItem, startVote, lockVote, cancelVote, resetPlacements, clearAllItems, deleteItem, updateTiers, batchAddItems } from './tier-list-state.js';
import { TierAudio } from './tier-list-audio.js';
import { renderBoard, renderHUD, updateHudMeters } from './tier-list-board.js';
import { openModal, closeModal, initModalListeners } from './tier-list-modals.js';
import { loadOverlayOptions, initPreviewOptionsListeners } from './tier-list-preview.js';

function handleItemDrop(evt) {
    const itemId = evt.item.dataset.itemId;
    const toTier = evt.to.dataset.tierId || null;
    const toIndex = evt.newIndex;
    moveItem(itemId, toTier, toIndex);
}

function initBoardDelegation() {
    document.body.addEventListener('click', async (e) => {
        const target = e.target.closest('button, .tier-header');
        if (!target) return;
        const state = getState();

        // Edit tier header
        if (target.classList.contains('tier-header') || target.dataset.action === 'tier-edit') {
            const tierId = target.dataset.tierId;
            const tier = state.tiers.find(t => t.id === tierId);
            if (tier) {
                $('tier-edit-id').value = tier.id;
                $('tier-edit-label').value = tier.label;
                $('tier-edit-color').value = tier.color || '#ff7f7f';
                $('tier-edit-color-hex').value = tier.color || '#ff7f7f';
                $('tier-edit-desc').value = tier.description || '';
                openModal('modal-tier-edit');
            }
            return;
        }

        // Tier Up / Down
        if (target.dataset.action === 'tier-up' || target.dataset.action === 'tier-down') {
            const tierId = target.dataset.tierId;
            const idx = state.tiers.findIndex(t => t.id === tierId);
            if (idx !== -1) {
                const newTiers = [...state.tiers];
                const swapIdx = target.dataset.action === 'tier-up' ? idx - 1 : idx + 1;
                if (swapIdx >= 0 && swapIdx < newTiers.length) {
                    const temp = newTiers[idx];
                    newTiers[idx] = newTiers[swapIdx];
                    newTiers[swapIdx] = temp;
                    await updateTiers(newTiers);
                }
            }
            return;
        }

        // Start Chat Vote
        if (target.dataset.action === 'start-vote') {
            const itemId = target.dataset.itemId;
            await startVote(itemId);
            return;
        }

        // Edit Item
        if (target.dataset.action === 'edit-item') {
            const itemId = target.dataset.itemId;
            const item = state.items.find(i => i.id === itemId);
            if (item) {
                $('modal-item-title').textContent = 'Edit Item';
                $('item-edit-id').value = item.id;
                $('item-name').value = item.name;
                $('item-image-url').value = item.imageUrl || '';
                $('item-file-input').value = '';
                $('item-note').value = item.note || '';
                $('item-initial-tier').value = item.tierId || '';
                openModal('modal-item');
            }
            return;
        }

        // Delete Item
        if (target.dataset.action === 'delete-item') {
            const itemId = target.dataset.itemId;
            await deleteItem(itemId);
            return;
        }
    });

    // Vote Lock & Cancel
    $('btn-lock-vote')?.addEventListener('click', () => lockVote());
    $('btn-cancel-vote')?.addEventListener('click', () => cancelVote());

    // Reset & Clear Placements
    $('btn-reset-placements')?.addEventListener('click', () => resetPlacements());
    $('btn-clear-items')?.addEventListener('click', () => clearAllItems());
}

function initDragAndDropFiles() {
    const unrankedPoolEl = $('unranked-pool');
    if (!unrankedPoolEl) return;

    ['dragenter', 'dragover'].forEach(eventName => {
        unrankedPoolEl.addEventListener(eventName, (e) => {
            if (e.dataTransfer && e.dataTransfer.types.includes('Files')) {
                e.preventDefault();
                unrankedPoolEl.classList.add('drag-over');
            }
        });
    });

    ['dragleave', 'drop'].forEach(eventName => {
        unrankedPoolEl.addEventListener(eventName, () => {
            unrankedPoolEl.classList.remove('drag-over');
        });
    });

    unrankedPoolEl.addEventListener('drop', async (e) => {
        if (!e.dataTransfer || !e.dataTransfer.files || e.dataTransfer.files.length === 0) return;
        e.preventDefault();

        const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
        if (files.length === 0) return;

        showToast(`Uploading ${files.length} image(s)…`);

        const batch = [];
        for (const file of files) {
            try {
                const res = await fetch('/api/custom-overlays/assets', {
                    method: 'POST',
                    headers: {
                        'Content-Type': file.type,
                        'x-asset-name': file.name
                    },
                    body: file
                });
                if (res.ok) {
                    const data = await res.json();
                    const cleanName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
                    batch.push({
                        name: cleanName,
                        imageUrl: data.url
                    });
                }
            } catch (err) {
                console.error('File upload failed:', err);
            }
        }

        if (batch.length > 0) {
            await batchAddItems(batch);
            showToast(`Added ${batch.length} item(s) to pool`);
        }
    });
}

function cleanImageName(name, fallback = 'Pasted Item') {
    if (!name || name.startsWith('image.') || name === 'blob') return fallback;
    const base = name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ').trim();
    return base || fallback;
}

function initClipboardPaste() {
    window.addEventListener('paste', async (e) => {
        const clipboardData = e.clipboardData;
        if (!clipboardData) return;

        const imageFiles = [];
        if (clipboardData.items && clipboardData.items.length > 0) {
            for (let i = 0; i < clipboardData.items.length; i++) {
                const item = clipboardData.items[i];
                if (item.type && item.type.startsWith('image/')) {
                    const file = item.getAsFile();
                    if (file) imageFiles.push(file);
                }
            }
        } else if (clipboardData.files && clipboardData.files.length > 0) {
            for (let i = 0; i < clipboardData.files.length; i++) {
                const file = clipboardData.files[i];
                if (file.type && file.type.startsWith('image/')) {
                    imageFiles.push(file);
                }
            }
        }

        if (imageFiles.length > 0) {
            e.preventDefault();
            const itemModal = $('modal-item');
            const isItemModalOpen = itemModal && itemModal.classList.contains('open');

            if (isItemModalOpen) {
                const file = imageFiles[0];
                showToast('Uploading pasted image…');
                try {
                    const uploadRes = await fetch('/api/custom-overlays/assets', {
                        method: 'POST',
                        headers: {
                            'Content-Type': file.type,
                            'x-asset-name': file.name || `pasted-${Date.now()}.png`
                        },
                        body: file
                    });
                    if (uploadRes.ok) {
                        const data = await uploadRes.json();
                        $('item-image-url').value = data.url;
                        $('item-file-input').value = '';
                        if (!$('item-name').value.trim()) {
                            $('item-name').value = cleanImageName(file.name, 'Pasted Item');
                        }
                        showToast('Pasted image uploaded to asset library');
                    }
                } catch {
                    showToast('Failed to upload pasted image');
                }
                return;
            }

            showToast(`Uploading ${imageFiles.length} pasted image(s)…`);
            const batch = [];
            for (let i = 0; i < imageFiles.length; i++) {
                const file = imageFiles[i];
                try {
                    const fname = file.name && !file.name.startsWith('image.')
                        ? file.name
                        : `pasted-${Date.now()}-${i + 1}.png`;
                    const uploadRes = await fetch('/api/custom-overlays/assets', {
                        method: 'POST',
                        headers: {
                            'Content-Type': file.type,
                            'x-asset-name': fname
                        },
                        body: file
                    });
                    if (uploadRes.ok) {
                        const data = await uploadRes.json();
                        batch.push({
                            name: cleanImageName(file.name, `Pasted Item ${i + 1}`),
                            imageUrl: data.url
                        });
                    }
                } catch (err) {
                    console.error('Failed to upload pasted image:', err);
                }
            }

            if (batch.length > 0) {
                await batchAddItems(batch);
                showToast(`Added ${batch.length} pasted item(s) to unranked pool`);
            }
            return;
        }

        // Pasted image URL text
        const activeEl = document.activeElement;
        const isTyping = activeEl && (
            activeEl.tagName === 'INPUT' ||
            activeEl.tagName === 'TEXTAREA' ||
            activeEl.isContentEditable
        );

        const itemModal = $('modal-item');
        const isItemModalOpen = itemModal && itemModal.classList.contains('open');
        const pastedText = (clipboardData.getData('text/plain') || '').trim();
        const isImageUrl = /^https?:\/\/.+\.(png|jpe?g|gif|webp|svg|avif)(\?.*)?$/i.test(pastedText) ||
                           pastedText.startsWith('data:image/');

        if (isItemModalOpen && !isTyping && isImageUrl) {
            e.preventDefault();
            $('item-image-url').value = pastedText;
            if (!$('item-name').value.trim()) {
                try {
                    const u = new URL(pastedText);
                    const fn = u.pathname.substring(u.pathname.lastIndexOf('/') + 1);
                    if (fn) $('item-name').value = cleanImageName(decodeURIComponent(fn), 'Web Item');
                } catch {}
            }
            showToast('Pasted image URL into item');
            return;
        }

        if (!isTyping && isImageUrl) {
            e.preventDefault();
            let cleanName = 'Web Item';
            try {
                const u = new URL(pastedText);
                const fn = u.pathname.substring(u.pathname.lastIndexOf('/') + 1);
                if (fn) cleanName = cleanImageName(decodeURIComponent(fn), 'Web Item');
            } catch {}

            await batchAddItems([{ name: cleanName, imageUrl: pastedText }]);
            showToast('Added pasted image URL to unranked pool');
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    onStateChange((state) => {
        if (state.settings) {
            TierAudio.enabled = state.settings.soundEnabled !== false;
            TierAudio.volume = (state.settings.soundVolume !== undefined ? state.settings.soundVolume : 75) / 100;
        }
        renderBoard(state, handleItemDrop);
        renderHUD(state);
    });

    initBoardDelegation();
    initModalListeners();
    initPreviewOptionsListeners();
    initDragAndDropFiles();
    initClipboardPaste();

    fetchState();
    setupWebSocket((consensus) => {
        updateHudMeters(consensus, getState());
    });
    loadOverlayOptions();
});

/**
 * StreamPulse Tier List Maker — Overlay URL & Options Preview
 * Manages parameterized overlay settings (layout, sizing, theme, SFX, voting hint),
 * studio tab switching, and live resolution-scaled OBS preview.
 */

import { $, showToast } from './tier-list-state.js';
import { openModal } from './tier-list-modals.js';

const OVERLAY_OPTIONS_KEY = 'streampulse:tier-list:overlay-options';
const ACTIVE_TAB_KEY = 'streampulse:tier-list:active-tab';
const VIEWPORT_KEY = 'streampulse:tier-list:preview-viewport';

let overlayOptions = {
    layout: 'board',
    hideUnranked: '0',
    size: 'medium',
    aspect: '1/1',
    coverFit: 'cover',
    theme: 'dark',
    howtovote: 'auto',
    hintScale: '1',
    sfx: '1'
};

let previewWidth = 1920;
let previewHeight = 1080;
let previewBackdrop = 'solid';

export function switchTab(tabName) {
    try {
        localStorage.setItem(ACTIVE_TAB_KEY, tabName);
    } catch {}

    document.querySelectorAll('.studio-tab-btn').forEach(btn => {
        if (btn.id === `tab-btn-${tabName}`) {
            btn.classList.add('active');
        } else if (btn.id.startsWith('tab-btn-')) {
            btn.classList.remove('active');
        }
    });

    const boardPane = $('tab-pane-board');
    const themingPane = $('tab-pane-theming');

    if (tabName === 'board') {
        if (boardPane) boardPane.style.display = 'block';
        if (themingPane) themingPane.style.display = 'none';
    } else {
        if (boardPane) boardPane.style.display = 'none';
        if (themingPane) themingPane.style.display = 'block';
        updateOverlayUrl();
        window.requestAnimationFrame(applyViewportScale);
    }
}

export function restoreActiveTab() {
    let saved = 'board';
    try {
        saved = localStorage.getItem(ACTIVE_TAB_KEY) || 'board';
    } catch {}
    switchTab(saved);
}

export function loadOverlayOptions() {
    try {
        const saved = JSON.parse(localStorage.getItem(OVERLAY_OPTIONS_KEY) || '{}');
        if (saved && typeof saved === 'object') {
            overlayOptions = Object.assign(overlayOptions, saved);
        }
    } catch {}

    const layoutEl = $('overlay-opt-layout');
    if (layoutEl) layoutEl.value = overlayOptions.layout || 'board';
    const hideEl = $('overlay-opt-hide-unranked');
    if (hideEl) hideEl.value = overlayOptions.hideUnranked || '0';
    const sizeEl = $('overlay-opt-size');
    if (sizeEl) sizeEl.value = overlayOptions.size || 'medium';
    const aspectEl = $('overlay-opt-aspect');
    if (aspectEl) aspectEl.value = overlayOptions.aspect || '1/1';
    const coverEl = $('overlay-opt-coverfit');
    if (coverEl) coverEl.value = overlayOptions.coverFit || 'cover';
    const themeEl = $('overlay-opt-theme');
    if (themeEl) themeEl.value = overlayOptions.theme || 'dark';
    const hintEl = $('overlay-opt-hint');
    if (hintEl) hintEl.value = overlayOptions.howtovote !== undefined ? overlayOptions.howtovote : 'auto';
    const hintScaleEl = $('overlay-opt-hintscale');
    if (hintScaleEl) hintScaleEl.value = overlayOptions.hintScale || '1';
    const sfxEl = $('overlay-opt-sfx');
    if (sfxEl) sfxEl.value = overlayOptions.sfx !== undefined ? overlayOptions.sfx : '1';

    updateOverlayUrl();
}

export function updateOverlayUrl() {
    overlayOptions.layout = $('overlay-opt-layout')?.value || 'board';
    overlayOptions.hideUnranked = $('overlay-opt-hide-unranked')?.value || '0';
    overlayOptions.size = $('overlay-opt-size')?.value || 'medium';
    overlayOptions.aspect = $('overlay-opt-aspect')?.value || '1/1';
    overlayOptions.coverFit = $('overlay-opt-coverfit')?.value || 'cover';
    overlayOptions.theme = $('overlay-opt-theme')?.value || 'dark';
    overlayOptions.howtovote = $('overlay-opt-hint')?.value || 'auto';
    overlayOptions.hintScale = $('overlay-opt-hintscale')?.value || '1';
    overlayOptions.sfx = $('overlay-opt-sfx')?.value || '1';

    try {
        localStorage.setItem(OVERLAY_OPTIONS_KEY, JSON.stringify(overlayOptions));
    } catch {}

    const params = new URLSearchParams();
    if (overlayOptions.layout !== 'board') params.set('layout', overlayOptions.layout);
    if (overlayOptions.hideUnranked === '1') params.set('hideUnranked', '1');
    if (overlayOptions.size !== 'medium') params.set('size', overlayOptions.size);
    if (overlayOptions.aspect !== '1/1') params.set('aspect', overlayOptions.aspect);
    if (overlayOptions.coverFit && overlayOptions.coverFit !== 'cover') params.set('coverFit', overlayOptions.coverFit);
    if (overlayOptions.theme !== 'dark') params.set('theme', overlayOptions.theme);
    if (overlayOptions.howtovote === '0') params.set('howtovote', '0');
    else if (overlayOptions.howtovote === 'always') params.set('howtovote', 'always');
    if (overlayOptions.hintScale && overlayOptions.hintScale !== '1') params.set('hintScale', overlayOptions.hintScale);
    if (overlayOptions.sfx === '0') params.set('sfx', '0');

    const queryString = params.toString() ? `?${params.toString()}` : '';
    const relativeUrl = `/overlays/tier-list.html${queryString}`;
    const fullUrl = `${location.origin}${relativeUrl}`;

    // Update URLs across all input links
    const previewUrlEl = $('overlay-preview-url');
    if (previewUrlEl) previewUrlEl.value = fullUrl;
    const themingUrlEl = $('theming-preview-url');
    if (themingUrlEl) themingUrlEl.value = fullUrl;

    const modalLaunchEl = $('modal-launch-overlay');
    if (modalLaunchEl) modalLaunchEl.href = relativeUrl;
    const btnLaunchEl = $('btn-launch-overlay');
    if (btnLaunchEl) btnLaunchEl.href = relativeUrl;
    const themingLaunchEl = $('btn-theming-launch');
    if (themingLaunchEl) themingLaunchEl.href = relativeUrl;
    const topLaunchEl = $('top-launch-overlay');
    if (topLaunchEl) topLaunchEl.href = relativeUrl;

    // Update Live Preview iframe
    const previewIframe = $('tier-preview-iframe');
    if (previewIframe) {
        const previewUrl = `${relativeUrl}${queryString ? '&' : '?'}preview=1`;
        if (previewIframe.dataset.currentSrc !== previewUrl) {
            previewIframe.dataset.currentSrc = previewUrl;
            previewIframe.src = previewUrl;
        }
    }

    return fullUrl;
}

export function copyComputedOverlayUrl() {
    const fullUrl = updateOverlayUrl();
    navigator.clipboard.writeText(fullUrl).then(() => {
        showToast('Configured Overlay URL copied to clipboard!');
    }).catch(() => {
        prompt('OBS Browser Source URL:', fullUrl);
    });
}

export function setPreviewViewport(w, h, btn, mode) {
    previewWidth = w;
    previewHeight = h;
    document.querySelectorAll('.viewport-chip-btn').forEach(c => c.classList.remove('active'));
    if (btn) btn.classList.add('active');

    const layoutSelect = $('overlay-opt-layout');
    if (mode && layoutSelect && layoutSelect.value !== mode) {
        layoutSelect.value = mode;
        updateOverlayUrl();
    }

    try {
        localStorage.setItem(VIEWPORT_KEY, JSON.stringify({
            w, h, mode, chipId: btn ? btn.id : null
        }));
    } catch {}

    applyViewportScale();
}

export function applyViewportScale() {
    const wrapper = $('preview-viewport-wrapper');
    const scaler = $('preview-viewport-scaler');
    const box = $('tier-preview-box');
    if (!wrapper || !scaler || !box) return;

    const availW = Math.max(280, wrapper.clientWidth - 24);
    const maxAvailH = 520;

    const scale = Math.min(availW / previewWidth, maxAvailH / previewHeight, 1.0);
    const scaledW = Math.round(previewWidth * scale);
    const scaledH = Math.round(previewHeight * scale);

    scaler.style.width = `${scaledW}px`;
    scaler.style.height = `${scaledH}px`;

    box.style.position = 'absolute';
    box.style.top = '0';
    box.style.left = '0';
    box.style.width = `${previewWidth}px`;
    box.style.height = `${previewHeight}px`;
    box.style.transform = `scale(${scale})`;
    box.style.transformOrigin = 'top left';

    const resLabel = $('preview-res-label');
    if (resLabel) {
        resLabel.textContent = `${previewWidth}×${previewHeight} (${Math.round(scale * 100)}%)`;
    }
}

export function restorePreviewViewport() {
    try {
        const savedVp = localStorage.getItem(VIEWPORT_KEY);
        if (savedVp) {
            const parsed = JSON.parse(savedVp);
            if (parsed.w && parsed.h) {
                previewWidth = parsed.w;
                previewHeight = parsed.h;
                if (parsed.chipId) {
                    const chip = $(parsed.chipId);
                    if (chip) {
                        document.querySelectorAll('.viewport-chip-btn').forEach(c => c.classList.remove('active'));
                        chip.classList.add('active');
                    }
                }
            }
        }
    } catch {}
}

export function togglePreviewBackdrop() {
    previewBackdrop = (previewBackdrop === 'solid') ? 'checker' : 'solid';
    const box = $('tier-preview-box');
    const btn = $('prev-btn-backdrop');
    if (!box) return;
    box.classList.toggle('checkerboard', previewBackdrop === 'checker');
    if (btn) {
        btn.textContent = previewBackdrop === 'checker' ? 'Canvas: Checkerboard' : 'Canvas: Dark';
        btn.classList.toggle('active', previewBackdrop === 'checker');
    }
}

export function initPreviewOptionsListeners() {
    window.switchTab = switchTab;
    window.setPreviewViewport = setPreviewViewport;
    window.togglePreviewBackdrop = togglePreviewBackdrop;

    $('btn-overlay-options')?.addEventListener('click', () => {
        switchTab('theming');
    });

    ['overlay-opt-layout', 'overlay-opt-hide-unranked', 'overlay-opt-size', 'overlay-opt-aspect', 'overlay-opt-coverfit', 'overlay-opt-theme', 'overlay-opt-hint', 'overlay-opt-hintscale', 'overlay-opt-sfx'].forEach(id => {
        $(id)?.addEventListener('change', () => {
            updateOverlayUrl();
            if (id === 'overlay-opt-layout') {
                const isSidebar = $('overlay-opt-layout')?.value === 'sidebar';
                if (isSidebar) {
                    setPreviewViewport(440, 1080, $('chip-vp-sidebar'), 'sidebar');
                } else {
                    setPreviewViewport(1920, 1080, $('chip-vp-board'), 'board');
                }
            }
        });
    });

    $('btn-copy-overlay')?.addEventListener('click', copyComputedOverlayUrl);
    $('btn-modal-copy-url')?.addEventListener('click', copyComputedOverlayUrl);
    $('btn-theming-copy-url')?.addEventListener('click', copyComputedOverlayUrl);
    $('prev-btn-backdrop')?.addEventListener('click', togglePreviewBackdrop);

    // Responsive scaling observer
    window.addEventListener('resize', () => {
        window.requestAnimationFrame(applyViewportScale);
    });

    const wrapper = $('preview-viewport-wrapper');
    if (wrapper && typeof ResizeObserver !== 'undefined') {
        const ro = new ResizeObserver(() => {
            window.requestAnimationFrame(applyViewportScale);
        });
        ro.observe(wrapper);
    }

    restorePreviewViewport();
    restoreActiveTab();
    applyViewportScale();
}

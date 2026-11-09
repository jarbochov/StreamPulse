/**
 * StreamPulse Tier List Maker — Overlay URL & Options Preview
 * Manages parameterized overlay settings (layout, sizing, theme, SFX, voting hint)
 * and generates live OBS URLs.
 */

import { $, showToast } from './tier-list-state.js';
import { openModal } from './tier-list-modals.js';

const OVERLAY_OPTIONS_KEY = 'streampulse:tier-list:overlay-options';

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

    const previewUrlEl = $('overlay-preview-url');
    if (previewUrlEl) previewUrlEl.value = fullUrl;
    const modalLaunchEl = $('modal-launch-overlay');
    if (modalLaunchEl) modalLaunchEl.href = relativeUrl;
    const btnLaunchEl = $('btn-launch-overlay');
    if (btnLaunchEl) btnLaunchEl.href = relativeUrl;

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

export function initPreviewOptionsListeners() {
    $('btn-overlay-options')?.addEventListener('click', () => {
        updateOverlayUrl();
        openModal('modal-overlay-options');
    });

    ['overlay-opt-layout', 'overlay-opt-hide-unranked', 'overlay-opt-size', 'overlay-opt-aspect', 'overlay-opt-coverfit', 'overlay-opt-theme', 'overlay-opt-hint', 'overlay-opt-hintscale', 'overlay-opt-sfx'].forEach(id => {
        $(id)?.addEventListener('change', updateOverlayUrl);
    });

    $('btn-copy-overlay')?.addEventListener('click', copyComputedOverlayUrl);
    $('btn-modal-copy-url')?.addEventListener('click', copyComputedOverlayUrl);
}

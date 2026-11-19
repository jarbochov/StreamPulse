/**
 * StreamPulse Tier List Maker — Overlay & Theming Controller
 * Manages StreamPulse theme presets, saved custom themes, custom fonts (Google + Asset Library),
 * full color palette with opacity, custom banner, item caption & auto-fit settings,
 * live OBS preview synchronization via postMessage (zero iframe reloads), and server persistence.
 */

import { $, showToast, saveTheme } from './tier-list-state.js';
import { openAssetLibraryForBanner } from './tier-list-modals.js';
import {
    BUILT_IN_THEME_ID_SET,
    resolveTierThemePalette,
    populateThemeDropdown,
    extractHexAndAlpha,
    hexAlphaToCss,
    syncColorInputPair,
    populateFontDatalist,
    updateAssetFontBadges,
    openAssetFontPicker,
    openSaveThemeModal,
    openManageThemesModal,
    initThemeModals
} from './tier-list-themes.js';

const OVERLAY_OPTIONS_KEY = 'streampulse:tier-list:overlay-options';
const ACTIVE_TAB_KEY = 'streampulse:tier-list:active-tab';
const THEMING_SUBTAB_KEY = 'streampulse:tier-list:theming-subtab';
const VIEWPORT_KEY = 'streampulse:tier-list:preview-viewport';
const SAMPLE_DATA_KEY = 'streampulse:tier-list:preview-sample';

const DEFAULT_OVERLAY_OPTIONS = {
    title: 'Community Tier List',
    layout: 'board',
    hideUnranked: '0',
    size: 'medium',
    aspect: '1/1',
    coverFit: 'cover',
    theme: 'dark',
    customThemeId: '',
    headingFont: '',
    fontFamily: '',
    fontWeight: '',
    fontScale: '1',
    textTransform: '',
    textOutline: '',
    backgroundColor: '',
    rowBackgroundColor: '',
    borderColor: '',
    textColor: '',
    mutedColor: '',
    accentColor: '',
    borderRadius: '',
    backdropBlur: '',
    bannerUrl: '',
    bannerMode: 'replace',
    bannerHeight: 110,
    bannerFit: 'cover',
    showCaptions: '1',
    fitCaptions: '0',
    autoFit: '0',
    focusEnlarge: '0',
    followZoom: '0',
    howtovote: 'auto',
    hintScale: '1',
    sfx: '1'
};

let overlayOptions = Object.assign({}, DEFAULT_OVERLAY_OPTIONS);

let previewWidth = 1920;
let previewHeight = 1080;
let previewBackdrop = 'solid';
let useSampleData = false;
let saveTimer = null;
let lastLocalSaveAt = 0;
let previewResizeObserver = null;
let chatVotingEnabledState = true;
let globalSoundEnabledState = true;

function setSyncPill(text, stateClass = 'is-ok') {
    const pill = $('theming-sync-status');
    if (!pill) return;
    pill.textContent = text;
    pill.className = `tl-sync-pill ${stateClass}`.trim();
}

function updateBannerPreviewUI() {
    const cleanUrl = (overlayOptions.bannerUrl || '').trim();
    const hasBanner = Boolean(cleanUrl);
    const box = $('banner-preview-box');
    const img = $('banner-preview-img');
    const empty = $('banner-preview-empty');
    const clearBtn = $('btn-banner-clear');
    const extraOpts = $('banner-extra-opts');
    const heightVal = $('banner-height-val');

    if (box) box.classList.toggle('has-image', hasBanner);
    if (img) {
        if (!img.dataset.boundError) {
            img.dataset.boundError = '1';
            img.addEventListener('error', () => {
                img.hidden = true;
                if (box) box.classList.remove('has-image');
                if (empty) empty.hidden = false;
            });
        }
        if (hasBanner) {
            if (img.dataset.loadedSrc !== cleanUrl) {
                img.dataset.loadedSrc = cleanUrl;
                img.src = cleanUrl;
            }
            img.style.objectFit = overlayOptions.bannerFit === 'contain' ? 'contain' : 'cover';
            img.hidden = false;
        } else {
            delete img.dataset.loadedSrc;
            img.removeAttribute('src');
            img.hidden = true;
        }
    }
    if (empty) empty.hidden = hasBanner;
    if (clearBtn) clearBtn.hidden = !hasBanner;
    if (extraOpts) {
        extraOpts.hidden = !hasBanner;
        extraOpts.classList.toggle('is-disabled', !hasBanner);
    }
    if (heightVal) heightVal.textContent = `${overlayOptions.bannerHeight || 110}px`;
}

function updateDependentControlStates() {
    const showCaptions = overlayOptions.showCaptions !== '0';
    const fitCb = $('overlay-opt-fit-captions');
    const fitRow = $('fit-captions-row');
    if (fitCb) fitCb.disabled = !showCaptions;
    if (fitRow) fitRow.classList.toggle('is-disabled', !showCaptions);

    const autoFitOn = overlayOptions.autoFit === '1';
    const sizeSel = $('overlay-opt-size');
    const sizeRow = $('row-opt-size');
    if (sizeSel) sizeSel.disabled = autoFitOn;
    if (sizeRow) sizeRow.classList.toggle('is-disabled', autoFitOn);

    const naturalFitOn = overlayOptions.coverFit === 'natural';
    const aspectSel = $('overlay-opt-aspect');
    const aspectRow = $('row-opt-aspect');
    if (aspectSel) aspectSel.disabled = naturalFitOn;
    if (aspectRow) aspectRow.classList.toggle('is-disabled', naturalFitOn);

    const votingSection = $('tl-section-voting-overlay');
    if (votingSection) votingSection.hidden = !chatVotingEnabledState;
}

function updateAccentChipsUI() {
    const palette = resolveTierThemePalette(overlayOptions.theme, overlayOptions.customThemeId);
    const activeHex = extractHexAndAlpha(overlayOptions.accentColor || palette.accent, '#3b82f6').hex.toLowerCase();
    document.querySelectorAll('#tl-accent-chips .tl-p-chip').forEach(chip => {
        const chipHex = String(chip.dataset.color || '').toLowerCase();
        chip.classList.toggle('active', Boolean(chipHex && chipHex === activeHex));
    });
}

function writeColorControlsFromOptions() {
    const palette = resolveTierThemePalette(overlayOptions.theme, overlayOptions.customThemeId);
    const bgDefault = extractHexAndAlpha(palette.bg, '#0d1117', 92);
    const rowDefault = extractHexAndAlpha(palette.rowBg, '#0d1117', 70);
    const borderDefault = extractHexAndAlpha(palette.border, '#30363d', 100);
    const textDefault = extractHexAndAlpha(palette.text, '#f0f6fc', 100);
    const mutedDefault = extractHexAndAlpha(palette.muted, '#8b949e', 100);
    const accentDefault = extractHexAndAlpha(palette.accent, '#3b82f6', 100);

    const bgEl = $('overlay-opt-bg');
    if (bgEl && document.activeElement !== bgEl) bgEl.value = overlayOptions.backgroundColor || '';
    const bgSlider = $('overlay-opt-bg-opacity');
    if (bgSlider) bgSlider.dataset.defaultAlpha = String(bgDefault.alpha);
    syncColorInputPair(bgEl, $('overlay-opt-bg-picker'), bgDefault.hex, bgSlider, $('tl-bg-opacity-val'));

    const rowBgEl = $('overlay-opt-rowbg');
    if (rowBgEl && document.activeElement !== rowBgEl) rowBgEl.value = overlayOptions.rowBackgroundColor || '';
    const rowBgSlider = $('overlay-opt-rowbg-opacity');
    if (rowBgSlider) rowBgSlider.dataset.defaultAlpha = String(rowDefault.alpha);
    syncColorInputPair(rowBgEl, $('overlay-opt-rowbg-picker'), rowDefault.hex, rowBgSlider, $('tl-rowbg-opacity-val'));

    const borderEl = $('overlay-opt-border');
    if (borderEl && document.activeElement !== borderEl) borderEl.value = overlayOptions.borderColor || '';
    syncColorInputPair(borderEl, $('overlay-opt-border-picker'), borderDefault.hex);

    const textEl = $('overlay-opt-text');
    if (textEl && document.activeElement !== textEl) textEl.value = overlayOptions.textColor || '';
    syncColorInputPair(textEl, $('overlay-opt-text-picker'), textDefault.hex);

    const mutedEl = $('overlay-opt-muted');
    if (mutedEl && document.activeElement !== mutedEl) mutedEl.value = overlayOptions.mutedColor || '';
    syncColorInputPair(mutedEl, $('overlay-opt-muted-picker'), mutedDefault.hex);

    const accentEl = $('overlay-opt-accent');
    if (accentEl && document.activeElement !== accentEl) accentEl.value = overlayOptions.accentColor || '';
    syncColorInputPair(accentEl, $('overlay-opt-accent-picker'), accentDefault.hex);

    updateAccentChipsUI();
}

function writeControlsFromOptions() {
    const titleEl = $('overlay-opt-title');
    if (titleEl && document.activeElement !== titleEl) {
        titleEl.value = overlayOptions.title || 'Community Tier List';
    }
    const bannerUrlEl = $('overlay-opt-banner-url');
    if (bannerUrlEl && document.activeElement !== bannerUrlEl) {
        bannerUrlEl.value = overlayOptions.bannerUrl || '';
    }
    const bannerModeEl = $('overlay-opt-banner-mode');
    if (bannerModeEl) bannerModeEl.value = overlayOptions.bannerMode === 'behind' ? 'behind' : 'replace';
    const bannerFitEl = $('overlay-opt-banner-fit');
    if (bannerFitEl) bannerFitEl.value = overlayOptions.bannerFit === 'contain' ? 'contain' : 'cover';
    const bannerHeightEl = $('overlay-opt-banner-height');
    if (bannerHeightEl) bannerHeightEl.value = String(overlayOptions.bannerHeight || 110);

    const layoutEl = $('overlay-opt-layout');
    if (layoutEl) layoutEl.value = overlayOptions.layout || 'board';
    const autoFitEl = $('overlay-opt-autofit');
    if (autoFitEl) autoFitEl.checked = overlayOptions.autoFit === '1';
    const hideEl = $('overlay-opt-hide-unranked');
    if (hideEl) hideEl.checked = overlayOptions.hideUnranked === '1';

    const sizeEl = $('overlay-opt-size');
    if (sizeEl) sizeEl.value = overlayOptions.size || 'medium';
    const aspectEl = $('overlay-opt-aspect');
    if (aspectEl) aspectEl.value = overlayOptions.aspect || '1/1';
    const coverEl = $('overlay-opt-coverfit');
    if (coverEl) coverEl.value = overlayOptions.coverFit || 'cover';

    const showCapEl = $('overlay-opt-show-captions');
    if (showCapEl) showCapEl.checked = overlayOptions.showCaptions !== '0';
    const fitCapEl = $('overlay-opt-fit-captions');
    if (fitCapEl) fitCapEl.checked = overlayOptions.fitCaptions === '1';
    const focusEnlargeEl = $('overlay-opt-focus-enlarge');
    if (focusEnlargeEl) focusEnlargeEl.checked = overlayOptions.focusEnlarge === '1';
    const followZoomEl = $('overlay-opt-follow-zoom');
    if (followZoomEl) followZoomEl.checked = overlayOptions.followZoom === '1';

    const themeEl = $('overlay-opt-theme');
    if (themeEl) {
        const desired = (overlayOptions.theme === 'custom' && overlayOptions.customThemeId)
            ? overlayOptions.customThemeId
            : (overlayOptions.theme || 'dark');
        const hasOpt = Array.from(themeEl.options).some(o => o.value === desired);
        if (!hasOpt && desired && overlayOptions.theme === 'custom') {
            const temp = document.createElement('option');
            temp.value = desired;
            temp.textContent = `${desired} (Custom)`;
            themeEl.appendChild(temp);
        }
        themeEl.value = Array.from(themeEl.options).some(o => o.value === desired) ? desired : 'dark';
    }

    const headingFontEl = $('overlay-opt-heading-font');
    if (headingFontEl && document.activeElement !== headingFontEl) {
        headingFontEl.value = overlayOptions.headingFont || '';
    }
    const contentFontEl = $('overlay-opt-font');
    if (contentFontEl && document.activeElement !== contentFontEl) {
        contentFontEl.value = overlayOptions.fontFamily || '';
    }
    const weightEl = $('overlay-opt-weight');
    if (weightEl) weightEl.value = overlayOptions.fontWeight || '';
    const fontScaleEl = $('overlay-opt-fontscale');
    if (fontScaleEl) {
        const scaleVal = String(overlayOptions.fontScale || '1');
        fontScaleEl.value = Array.from(fontScaleEl.options).some(o => o.value === scaleVal) ? scaleVal : '1';
    }
    const transformEl = $('overlay-opt-transform');
    if (transformEl) transformEl.value = overlayOptions.textTransform || '';
    const outlineEl = $('overlay-opt-outline');
    if (outlineEl) outlineEl.value = overlayOptions.textOutline || '';
    const radiusEl = $('overlay-opt-radius');
    if (radiusEl) {
        const radVal = overlayOptions.borderRadius || '';
        radiusEl.value = Array.from(radiusEl.options).some(o => o.value === radVal) ? radVal : '';
    }

    const blurEl = $('overlay-opt-blur');
    const blurValEl = $('tl-blur-val');
    if (blurEl) {
        const palette = resolveTierThemePalette(overlayOptions.theme, overlayOptions.customThemeId);
        const rawBlur = overlayOptions.backdropBlur;
        if (rawBlur) {
            const px = Math.min(24, Math.max(0, Math.round(parseFloat(rawBlur) || 0)));
            blurEl.value = String(px);
            blurEl.dataset.isCustom = '1';
            if (blurValEl) blurValEl.textContent = `${px}px`;
        } else {
            const themeBlurMatch = String(palette.backdrop || '').match(/(\d+(?:\.\d+)?)px/i);
            const px = themeBlurMatch ? Math.min(24, Math.max(0, Math.round(Number(themeBlurMatch[1])))) : 0;
            blurEl.value = String(px);
            blurEl.dataset.isCustom = '0';
            if (blurValEl) blurValEl.textContent = 'Theme';
        }
    }

    const hintEl = $('overlay-opt-hint');
    if (hintEl) hintEl.value = overlayOptions.howtovote !== undefined ? overlayOptions.howtovote : 'auto';
    const hintScaleEl = $('overlay-opt-hintscale');
    if (hintScaleEl) hintScaleEl.value = overlayOptions.hintScale || '1';
    const sfxEl = $('overlay-opt-sfx');
    if (sfxEl) sfxEl.checked = overlayOptions.sfx !== '0';

    writeColorControlsFromOptions();
    updateAssetFontBadges();
    updateBannerPreviewUI();
    updateDependentControlStates();
}

function readOptionsFromControls() {
    const titleEl = $('overlay-opt-title');
    if (titleEl) overlayOptions.title = titleEl.value.trim() || 'Community Tier List';
    const bannerUrlEl = $('overlay-opt-banner-url');
    if (bannerUrlEl) overlayOptions.bannerUrl = bannerUrlEl.value.trim();
    const bannerModeEl = $('overlay-opt-banner-mode');
    if (bannerModeEl) overlayOptions.bannerMode = bannerModeEl.value === 'behind' ? 'behind' : 'replace';
    const bannerFitEl = $('overlay-opt-banner-fit');
    if (bannerFitEl) overlayOptions.bannerFit = bannerFitEl.value === 'contain' ? 'contain' : 'cover';
    const bannerHeightEl = $('overlay-opt-banner-height');
    if (bannerHeightEl) overlayOptions.bannerHeight = Math.min(240, Math.max(48, Math.round(Number(bannerHeightEl.value) || 110)));

    overlayOptions.layout = $('overlay-opt-layout')?.value || 'board';
    const autoFitEl = $('overlay-opt-autofit');
    if (autoFitEl) overlayOptions.autoFit = autoFitEl.checked ? '1' : '0';
    const hideEl = $('overlay-opt-hide-unranked');
    if (hideEl) overlayOptions.hideUnranked = hideEl.checked ? '1' : '0';

    overlayOptions.size = $('overlay-opt-size')?.value || 'medium';
    overlayOptions.aspect = $('overlay-opt-aspect')?.value || '1/1';
    overlayOptions.coverFit = $('overlay-opt-coverfit')?.value || 'cover';

    const showCapEl = $('overlay-opt-show-captions');
    if (showCapEl) overlayOptions.showCaptions = showCapEl.checked ? '1' : '0';
    const fitCapEl = $('overlay-opt-fit-captions');
    if (fitCapEl) overlayOptions.fitCaptions = fitCapEl.checked ? '1' : '0';
    const focusEnlargeEl = $('overlay-opt-focus-enlarge');
    if (focusEnlargeEl) overlayOptions.focusEnlarge = focusEnlargeEl.checked ? '1' : '0';
    const followZoomEl = $('overlay-opt-follow-zoom');
    if (followZoomEl) overlayOptions.followZoom = followZoomEl.checked ? '1' : '0';

    const selectedThemeVal = $('overlay-opt-theme')?.value || 'dark';
    if (BUILT_IN_THEME_ID_SET.has(selectedThemeVal)) {
        overlayOptions.theme = selectedThemeVal;
        overlayOptions.customThemeId = '';
    } else {
        overlayOptions.theme = 'custom';
        overlayOptions.customThemeId = selectedThemeVal;
    }

    overlayOptions.headingFont = $('overlay-opt-heading-font')?.value?.trim() || '';
    overlayOptions.fontFamily = $('overlay-opt-font')?.value?.trim() || '';
    overlayOptions.fontWeight = $('overlay-opt-weight')?.value || '';
    overlayOptions.fontScale = $('overlay-opt-fontscale')?.value || '1';
    overlayOptions.textTransform = $('overlay-opt-transform')?.value || '';
    overlayOptions.textOutline = $('overlay-opt-outline')?.value || '';
    overlayOptions.borderRadius = $('overlay-opt-radius')?.value || '';

    const blurEl = $('overlay-opt-blur');
    if (blurEl) {
        if (blurEl.dataset.isCustom === '1') {
            overlayOptions.backdropBlur = `${Math.min(24, Math.max(0, Math.round(Number(blurEl.value) || 0)))}px`;
        } else {
            overlayOptions.backdropBlur = '';
        }
    }

    overlayOptions.backgroundColor = $('overlay-opt-bg')?.value?.trim() || '';
    overlayOptions.rowBackgroundColor = $('overlay-opt-rowbg')?.value?.trim() || '';
    overlayOptions.borderColor = $('overlay-opt-border')?.value?.trim() || '';
    overlayOptions.textColor = $('overlay-opt-text')?.value?.trim() || '';
    overlayOptions.mutedColor = $('overlay-opt-muted')?.value?.trim() || '';
    overlayOptions.accentColor = $('overlay-opt-accent')?.value?.trim() || '';

    overlayOptions.howtovote = $('overlay-opt-hint')?.value || 'auto';
    overlayOptions.hintScale = $('overlay-opt-hintscale')?.value || '1';
    const sfxEl = $('overlay-opt-sfx');
    if (sfxEl) overlayOptions.sfx = sfxEl.checked ? '1' : '0';

    try {
        localStorage.setItem(OVERLAY_OPTIONS_KEY, JSON.stringify(overlayOptions));
    } catch {}
    updateAssetFontBadges();
    updateAccentChipsUI();
    updateBannerPreviewUI();
    updateDependentControlStates();
}

function buildOverrideUrl() {
    const params = new URLSearchParams();
    if (overlayOptions.layout !== 'board') params.set('layout', overlayOptions.layout);
    if (overlayOptions.hideUnranked === '1') params.set('hideUnranked', '1');
    if (overlayOptions.autoFit === '1') params.set('autoFit', '1');
    if (overlayOptions.size !== 'medium') params.set('size', overlayOptions.size);
    if (overlayOptions.aspect !== '1/1') params.set('aspect', overlayOptions.aspect);
    if (overlayOptions.coverFit && overlayOptions.coverFit !== 'cover') params.set('coverFit', overlayOptions.coverFit);
    if (overlayOptions.showCaptions === '0') params.set('captions', '0');
    if (overlayOptions.fitCaptions === '1') params.set('fitCaptions', '1');
    if (overlayOptions.focusEnlarge === '1') params.set('focusEnlarge', '1');
    if (overlayOptions.followZoom === '1') params.set('followZoom', '1');

    if (overlayOptions.theme === 'custom' && overlayOptions.customThemeId) {
        params.set('theme', overlayOptions.customThemeId);
    } else if (overlayOptions.theme !== 'dark') {
        params.set('theme', overlayOptions.theme);
    }

    if (overlayOptions.headingFont) params.set('headingfont', overlayOptions.headingFont);
    if (overlayOptions.fontFamily) params.set('font', overlayOptions.fontFamily);
    if (overlayOptions.fontWeight) params.set('weight', overlayOptions.fontWeight);
    if (overlayOptions.fontScale && Number(overlayOptions.fontScale) !== 1) params.set('fontscale', String(overlayOptions.fontScale));
    if (overlayOptions.textTransform) params.set('transform', overlayOptions.textTransform);
    if (overlayOptions.textOutline) params.set('outline', overlayOptions.textOutline);
    if (overlayOptions.borderRadius) params.set('radius', overlayOptions.borderRadius);
    if (overlayOptions.backdropBlur) params.set('blur', overlayOptions.backdropBlur);
    if (overlayOptions.backgroundColor) params.set('bg', overlayOptions.backgroundColor);
    if (overlayOptions.rowBackgroundColor) params.set('rowbg', overlayOptions.rowBackgroundColor);
    if (overlayOptions.borderColor) params.set('border', overlayOptions.borderColor);
    if (overlayOptions.textColor) params.set('text', overlayOptions.textColor);
    if (overlayOptions.mutedColor) params.set('muted', overlayOptions.mutedColor);
    if (overlayOptions.accentColor) params.set('accent', overlayOptions.accentColor);

    if (overlayOptions.bannerUrl && !overlayOptions.bannerUrl.startsWith('data:')) {
        params.set('banner', overlayOptions.bannerUrl);
    }
    if (overlayOptions.bannerUrl) {
        if (overlayOptions.bannerMode === 'behind') params.set('bannerMode', 'behind');
        if (Number(overlayOptions.bannerHeight) !== 110) params.set('bannerHeight', String(overlayOptions.bannerHeight));
        if (overlayOptions.bannerFit === 'contain') params.set('bannerFit', 'contain');
    }
    if (overlayOptions.howtovote === '0') params.set('howtovote', '0');
    else if (overlayOptions.howtovote === 'always') params.set('howtovote', 'always');
    if (overlayOptions.hintScale && overlayOptions.hintScale !== '1') params.set('hintScale', overlayOptions.hintScale);
    if (overlayOptions.sfx === '0') params.set('sfx', '0');

    const qs = params.toString();
    return `${location.origin}/overlays/tier-list.html${qs ? `?${qs}` : ''}`;
}

function sendPreviewPostMessage() {
    const previewIframe = $('tier-preview-iframe');
    if (!previewIframe) return;
    const relativeUrl = '/overlays/tier-list.html';
    const previewUrl = `${relativeUrl}?preview=1`;

    if (previewIframe.dataset.initialLoaded !== 'true') {
        previewIframe.dataset.initialLoaded = 'true';
        previewIframe.dataset.currentSrc = previewUrl;
        if (!previewIframe.getAttribute('src')) {
            previewIframe.src = previewUrl;
        }
    }

    let docReady = false;
    try {
        docReady = previewIframe.contentDocument?.readyState === 'complete';
    } catch {}

    if (!docReady) {
        if (!previewIframe.dataset.loadListenerBound) {
            previewIframe.dataset.loadListenerBound = '1';
            previewIframe.addEventListener('load', () => {
                delete previewIframe.dataset.loadListenerBound;
                sendPreviewPostMessage();
            }, { once: true });
        }
        return;
    }

    try {
        previewIframe.contentWindow?.postMessage({
            type: 'tierlist:preview-config',
            options: {
                title: overlayOptions.title,
                layout: overlayOptions.layout,
                hideUnranked: overlayOptions.hideUnranked === '1',
                size: overlayOptions.size,
                aspect: overlayOptions.aspect,
                coverFit: overlayOptions.coverFit,
                theme: overlayOptions.theme,
                style: overlayOptions.theme,
                customThemeId: overlayOptions.customThemeId,
                headingFont: overlayOptions.headingFont,
                fontFamily: overlayOptions.fontFamily,
                fontWeight: overlayOptions.fontWeight,
                fontScale: Number(overlayOptions.fontScale) || 1,
                textTransform: overlayOptions.textTransform,
                textOutline: overlayOptions.textOutline,
                backgroundColor: overlayOptions.backgroundColor,
                rowBackgroundColor: overlayOptions.rowBackgroundColor,
                borderColor: overlayOptions.borderColor,
                textColor: overlayOptions.textColor,
                mutedColor: overlayOptions.mutedColor,
                accentColor: overlayOptions.accentColor,
                borderRadius: overlayOptions.borderRadius,
                backdropBlur: overlayOptions.backdropBlur,
                bannerUrl: overlayOptions.bannerUrl,
                bannerMode: overlayOptions.bannerMode,
                bannerHeight: Number(overlayOptions.bannerHeight) || 110,
                bannerFit: overlayOptions.bannerFit,
                showCaptions: overlayOptions.showCaptions !== '0',
                fitCaptions: overlayOptions.fitCaptions === '1',
                autoFit: overlayOptions.autoFit === '1',
                focusEnlarge: overlayOptions.focusEnlarge === '1',
                followZoom: overlayOptions.followZoom === '1',
                howToVote: overlayOptions.howtovote,
                hintScale: overlayOptions.hintScale,
                sfx: overlayOptions.sfx !== '0',
                chatVotingEnabled: chatVotingEnabledState,
                soundEnabled: globalSoundEnabledState,
                useSampleData
            }
        }, '*');
    } catch {}
}

function refreshUrlOutputs() {
    const relativeUrl = '/overlays/tier-list.html';
    const fullUrl = `${location.origin}${relativeUrl}`;

    const themingUrlEl = $('theming-preview-url');
    if (themingUrlEl) themingUrlEl.value = fullUrl;
    const overrideUrlEl = $('theming-override-url');
    if (overrideUrlEl) overrideUrlEl.value = buildOverrideUrl();

    const themingLaunchEl = $('btn-theming-launch');
    if (themingLaunchEl) themingLaunchEl.href = relativeUrl;
    const topLaunchEl = $('top-launch-overlay');
    if (topLaunchEl) topLaunchEl.href = relativeUrl;
}

function buildServerThemePatch() {
    return {
        layout: overlayOptions.layout,
        style: overlayOptions.theme,
        customThemeId: overlayOptions.customThemeId || '',
        headingFont: overlayOptions.headingFont || '',
        fontFamily: overlayOptions.fontFamily || '',
        fontWeight: overlayOptions.fontWeight || '',
        fontScale: Number(overlayOptions.fontScale) || 1,
        textTransform: overlayOptions.textTransform || '',
        textOutline: overlayOptions.textOutline || '',
        backgroundColor: overlayOptions.backgroundColor || '',
        rowBackgroundColor: overlayOptions.rowBackgroundColor || '',
        borderColor: overlayOptions.borderColor || '',
        textColor: overlayOptions.textColor || '',
        mutedColor: overlayOptions.mutedColor || '',
        accentColor: overlayOptions.accentColor || '',
        borderRadius: overlayOptions.borderRadius || '',
        backdropBlur: overlayOptions.backdropBlur || '',
        hideUnranked: overlayOptions.hideUnranked === '1',
        cardSize: overlayOptions.size,
        cardAspect: overlayOptions.aspect,
        cardFit: overlayOptions.coverFit,
        bannerUrl: overlayOptions.bannerUrl || '',
        bannerMode: overlayOptions.bannerMode || 'replace',
        bannerHeight: Number(overlayOptions.bannerHeight) || 110,
        bannerFit: overlayOptions.bannerFit || 'cover',
        showCaptions: overlayOptions.showCaptions !== '0',
        fitCaptions: overlayOptions.fitCaptions === '1',
        autoFit: overlayOptions.autoFit === '1',
        focusEnlarge: overlayOptions.focusEnlarge === '1',
        followZoom: overlayOptions.followZoom === '1',
        howToVote: overlayOptions.howtovote || 'auto',
        hintScale: overlayOptions.hintScale || '1',
        sfx: overlayOptions.sfx !== '0'
    };
}

function persistThemeToServer({ immediate = false, settingsPatch = undefined } = {}) {
    clearTimeout(saveTimer);
    setSyncPill('Saving…', 'is-saving');

    const flush = async () => {
        lastLocalSaveAt = Date.now();
        const ok = await saveTheme(buildServerThemePatch(), overlayOptions.title, settingsPatch);
        if (settingsPatch && typeof settingsPatch.soundEnabled === 'boolean') {
            globalSoundEnabledState = settingsPatch.soundEnabled;
        }
        setSyncPill(ok ? 'Synced to OBS' : 'Saved locally', ok ? 'is-ok' : '');
    };

    if (immediate) {
        return flush();
    }
    saveTimer = setTimeout(flush, 250);
}

export function switchThemingSubtab(name = 'layout') {
    const valid = ['layout', 'typography', 'colors'].includes(name) ? name : 'layout';
    try {
        localStorage.setItem(THEMING_SUBTAB_KEY, valid);
    } catch {}

    document.querySelectorAll('.tl-subtab-btn').forEach(btn => {
        const isActive = btn.dataset.subtab === valid;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    ['layout', 'typography', 'colors'].forEach(panelName => {
        const panel = $(`tl-subpanel-${panelName}`);
        if (panel) panel.hidden = panelName !== valid;
    });
}

export function restoreThemingSubtab() {
    let saved = 'layout';
    try {
        saved = localStorage.getItem(THEMING_SUBTAB_KEY) || 'layout';
    } catch {}
    switchThemingSubtab(saved);
}

export function switchTab(tabName) {
    try {
        localStorage.setItem(ACTIVE_TAB_KEY, tabName);
    } catch {}

    document.querySelectorAll('.tab-btn, .studio-tab-btn').forEach(btn => {
        if (btn.id === `tab-btn-${tabName}`) {
            btn.classList.add('active');
            btn.setAttribute('aria-selected', 'true');
        } else if (btn.id.startsWith('tab-btn-')) {
            btn.classList.remove('active');
            btn.setAttribute('aria-selected', 'false');
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
        refreshUrlOutputs();
        sendPreviewPostMessage();
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
            if (
                saved.backgroundColor === 'rgba(13, 17, 23, 0.92)' &&
                saved.textColor === '#f0f6fc' &&
                saved.accentColor === '#3b82f6' &&
                !saved.rowBackgroundColor
            ) {
                delete saved.backgroundColor;
                delete saved.textColor;
                delete saved.accentColor;
            }
            overlayOptions = Object.assign(overlayOptions, saved);
        }
        useSampleData = localStorage.getItem(SAMPLE_DATA_KEY) === '1';
    } catch {}

    try {
        localStorage.setItem(OVERLAY_OPTIONS_KEY, JSON.stringify(overlayOptions));
    } catch {}

    const sampleBtn = $('prev-btn-sample');
    if (sampleBtn) {
        sampleBtn.textContent = useSampleData ? 'Sample Data: On' : 'Sample Data: Off';
        sampleBtn.classList.toggle('active', useSampleData);
    }

    writeControlsFromOptions();
    refreshUrlOutputs();
    sendPreviewPostMessage();
}

export function syncOverlayOptionsFromServer(serverState) {
    if (!serverState || typeof serverState !== 'object') return;
    chatVotingEnabledState = serverState.settings?.chatVotingEnabled !== false;
    globalSoundEnabledState = serverState.settings?.soundEnabled !== false;

    if (Date.now() - lastLocalSaveAt < 1200) {
        updateDependentControlStates();
        sendPreviewPostMessage();
        return;
    }

    if (serverState.title !== undefined && serverState.title !== '') {
        overlayOptions.title = serverState.title;
    }
    const t = serverState.theme;
    if (t && typeof t === 'object' && Object.keys(t).length > 0) {
        if (t.layout !== undefined) overlayOptions.layout = t.layout;
        if (t.style !== undefined) overlayOptions.theme = t.style;
        if (t.customThemeId !== undefined) overlayOptions.customThemeId = t.customThemeId || '';
        if (t.headingFont !== undefined) overlayOptions.headingFont = t.headingFont || '';
        if (t.fontFamily !== undefined) overlayOptions.fontFamily = t.fontFamily || '';
        if (t.fontWeight !== undefined) overlayOptions.fontWeight = t.fontWeight || '';
        if (t.fontScale !== undefined) overlayOptions.fontScale = String(t.fontScale || 1);
        if (t.textTransform !== undefined) overlayOptions.textTransform = t.textTransform || '';
        if (t.textOutline !== undefined) overlayOptions.textOutline = t.textOutline || '';
        if (t.backgroundColor !== undefined) overlayOptions.backgroundColor = t.backgroundColor || '';
        if (t.rowBackgroundColor !== undefined) overlayOptions.rowBackgroundColor = t.rowBackgroundColor || '';
        if (t.borderColor !== undefined) overlayOptions.borderColor = t.borderColor || '';
        if (t.textColor !== undefined) overlayOptions.textColor = t.textColor || '';
        if (t.mutedColor !== undefined) overlayOptions.mutedColor = t.mutedColor || '';
        if (t.accentColor !== undefined) overlayOptions.accentColor = t.accentColor || '';
        if (t.borderRadius !== undefined) overlayOptions.borderRadius = t.borderRadius || '';
        if (t.backdropBlur !== undefined) overlayOptions.backdropBlur = t.backdropBlur || '';
        if (t.hideUnranked !== undefined) overlayOptions.hideUnranked = t.hideUnranked ? '1' : '0';
        if (t.cardSize !== undefined) overlayOptions.size = t.cardSize;
        if (t.cardAspect !== undefined) overlayOptions.aspect = t.cardAspect;
        if (t.cardFit !== undefined) overlayOptions.coverFit = t.cardFit;
        if (t.bannerUrl !== undefined) overlayOptions.bannerUrl = t.bannerUrl || '';
        if (t.bannerMode !== undefined) overlayOptions.bannerMode = t.bannerMode || 'replace';
        if (t.bannerHeight !== undefined) overlayOptions.bannerHeight = Number(t.bannerHeight) || 110;
        if (t.bannerFit !== undefined) overlayOptions.bannerFit = t.bannerFit || 'cover';
        if (t.showCaptions !== undefined) overlayOptions.showCaptions = t.showCaptions !== false ? '1' : '0';
        if (t.fitCaptions !== undefined) overlayOptions.fitCaptions = t.fitCaptions ? '1' : '0';
        if (t.autoFit !== undefined) overlayOptions.autoFit = t.autoFit ? '1' : '0';
        if (t.focusEnlarge !== undefined) overlayOptions.focusEnlarge = t.focusEnlarge ? '1' : '0';
        if (t.followZoom !== undefined) overlayOptions.followZoom = t.followZoom ? '1' : '0';
        if (t.howToVote !== undefined) overlayOptions.howtovote = String(t.howToVote);
        if (t.hintScale !== undefined) overlayOptions.hintScale = String(t.hintScale);
        if (t.sfx !== undefined) overlayOptions.sfx = t.sfx !== false ? '1' : '0';
        if (!globalSoundEnabledState) overlayOptions.sfx = '0';

        try {
            localStorage.setItem(OVERLAY_OPTIONS_KEY, JSON.stringify(overlayOptions));
        } catch {}
    }

    writeControlsFromOptions();
    refreshUrlOutputs();
    sendPreviewPostMessage();
}

export function updateOverlayUrl({ persist = true, immediate = true, settingsPatch = undefined } = {}) {
    readOptionsFromControls();
    refreshUrlOutputs();
    sendPreviewPostMessage();
    if (persist) {
        persistThemeToServer({ immediate, settingsPatch });
    }
    return `${location.origin}/overlays/tier-list.html`;
}

export function copyComputedOverlayUrl(override = false) {
    const url = override ? buildOverrideUrl() : `${location.origin}/overlays/tier-list.html`;
    navigator.clipboard.writeText(url).then(() => {
        showToast(override ? 'Scene override URL copied to clipboard!' : 'OBS Overlay URL copied to clipboard!');
    }).catch(() => {
        prompt('OBS Browser Source URL:', url);
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
        updateOverlayUrl({ persist: true, immediate: true });
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
    const maxAvailH = 560;

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

function togglePreviewSampleData() {
    useSampleData = !useSampleData;
    try {
        localStorage.setItem(SAMPLE_DATA_KEY, useSampleData ? '1' : '0');
    } catch {}
    const btn = $('prev-btn-sample');
    if (btn) {
        btn.textContent = useSampleData ? 'Sample Data: On' : 'Sample Data: Off';
        btn.classList.toggle('active', useSampleData);
    }
    sendPreviewPostMessage();
}

function applyCustomThemeObjectToStudio(customTheme) {
    if (!customTheme) return;
    overlayOptions.theme = 'custom';
    overlayOptions.customThemeId = customTheme.id || '';
    overlayOptions.headingFont = customTheme.headingFont || customTheme.headingfont || '';
    overlayOptions.fontFamily = customTheme.font || '';
    overlayOptions.fontWeight = customTheme.weight || '';
    overlayOptions.fontScale = customTheme.scale ? String(customTheme.scale) : '1';
    overlayOptions.textTransform = customTheme.textTransform || '';
    overlayOptions.textOutline = customTheme.outline || '';
    overlayOptions.borderRadius = customTheme.radius || '';
    const blurMatch = String(customTheme.backdrop || '').match(/(\d+(?:\.\d+)?)px/i);
    overlayOptions.backdropBlur = customTheme.backdrop === 'none'
        ? '0px'
        : (blurMatch ? `${blurMatch[1]}px` : '');
    overlayOptions.backgroundColor = customTheme.bg || '';
    overlayOptions.rowBackgroundColor = customTheme.cardBg || '';
    overlayOptions.borderColor = customTheme.border || '';
    overlayOptions.textColor = customTheme.text || '';
    overlayOptions.mutedColor = customTheme.muted || '';
    overlayOptions.accentColor = customTheme.accent || '';

    populateThemeDropdown($('overlay-opt-theme'));
    if ($('overlay-opt-theme') && customTheme.id) {
        $('overlay-opt-theme').value = customTheme.id;
    }
    writeControlsFromOptions();
    return updateOverlayUrl({ persist: true, immediate: true });
}

export function initPreviewOptionsListeners() {
    window.switchTab = switchTab;
    window.setPreviewViewport = setPreviewViewport;
    window.togglePreviewBackdrop = togglePreviewBackdrop;

    populateThemeDropdown($('overlay-opt-theme'));
    populateFontDatalist();
    initThemeModals();

    document.querySelectorAll('.tl-subtab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchThemingSubtab(btn.dataset.subtab));
    });
    restoreThemingSubtab();

    $('btn-overlay-options')?.addEventListener('click', () => {
        switchTab('theming');
    });

    // Theme preset selector (handles both built-in presets and saved custom themes)
    $('overlay-opt-theme')?.addEventListener('change', () => {
        const picked = $('overlay-opt-theme')?.value || 'dark';
        if (!BUILT_IN_THEME_ID_SET.has(picked)) {
            const customTheme = window.OverlayThemes?.getTheme?.(picked);
            if (customTheme && customTheme.isCustom) {
                applyCustomThemeObjectToStudio(customTheme);
                return;
            }
        }
        const wasCustomTheme = overlayOptions.theme === 'custom';
        overlayOptions.theme = picked;
        overlayOptions.customThemeId = '';
        overlayOptions.backgroundColor = '';
        overlayOptions.rowBackgroundColor = '';
        overlayOptions.borderColor = '';
        overlayOptions.textColor = '';
        overlayOptions.mutedColor = '';
        overlayOptions.accentColor = '';
        overlayOptions.borderRadius = '';
        overlayOptions.backdropBlur = '';
        if (wasCustomTheme) {
            overlayOptions.headingFont = '';
            overlayOptions.fontFamily = '';
            overlayOptions.fontWeight = '';
            overlayOptions.fontScale = '1';
            overlayOptions.textTransform = '';
            overlayOptions.textOutline = '';
        }
        writeControlsFromOptions();
        updateOverlayUrl({ persist: true, immediate: true });
    });

    const immediateIds = [
        'overlay-opt-banner-mode',
        'overlay-opt-banner-fit',
        'overlay-opt-layout',
        'overlay-opt-autofit',
        'overlay-opt-hide-unranked',
        'overlay-opt-size',
        'overlay-opt-aspect',
        'overlay-opt-coverfit',
        'overlay-opt-show-captions',
        'overlay-opt-fit-captions',
        'overlay-opt-focus-enlarge',
        'overlay-opt-follow-zoom',
        'overlay-opt-weight',
        'overlay-opt-fontscale',
        'overlay-opt-transform',
        'overlay-opt-outline',
        'overlay-opt-radius',
        'overlay-opt-hint',
        'overlay-opt-hintscale'
    ];
    immediateIds.forEach(id => {
        $(id)?.addEventListener('change', () => {
            updateOverlayUrl({ persist: true, immediate: true });
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

    $('overlay-opt-sfx')?.addEventListener('change', (e) => {
        const checked = Boolean(e.target.checked);
        const settingsPatch = (checked && !globalSoundEnabledState) ? { soundEnabled: true } : undefined;
        if (settingsPatch) globalSoundEnabledState = true;
        updateOverlayUrl({ persist: true, immediate: true, settingsPatch });
    });

    // Font text inputs
    ['overlay-opt-heading-font', 'overlay-opt-font'].forEach(id => {
        $(id)?.addEventListener('input', () => {
            updateOverlayUrl({ persist: true, immediate: false });
        });
        $(id)?.addEventListener('change', () => {
            updateOverlayUrl({ persist: true, immediate: true });
        });
    });

    $('btn-pick-heading-font')?.addEventListener('click', () => {
        openAssetFontPicker('heading', (fam) => {
            const input = $('overlay-opt-heading-font');
            if (input) input.value = fam;
            updateOverlayUrl({ persist: true, immediate: true });
        });
    });
    $('btn-pick-content-font')?.addEventListener('click', () => {
        openAssetFontPicker('content', (fam) => {
            const input = $('overlay-opt-font');
            if (input) input.value = fam;
            updateOverlayUrl({ persist: true, immediate: true });
        });
    });

    // Backdrop Blur slider + Auto reset
    $('overlay-opt-blur')?.addEventListener('input', (e) => {
        e.target.dataset.isCustom = '1';
        if ($('tl-blur-val')) $('tl-blur-val').textContent = `${e.target.value}px`;
        updateOverlayUrl({ persist: true, immediate: false });
    });
    $('overlay-opt-blur')?.addEventListener('change', (e) => {
        e.target.dataset.isCustom = '1';
        updateOverlayUrl({ persist: true, immediate: true });
    });
    $('btn-clear-blur')?.addEventListener('click', () => {
        const blurEl = $('overlay-opt-blur');
        const palette = resolveTierThemePalette(overlayOptions.theme, overlayOptions.customThemeId);
        const themeBlurMatch = String(palette.backdrop || '').match(/(\d+(?:\.\d+)?)px/i);
        const px = themeBlurMatch ? Math.min(24, Math.max(0, Math.round(Number(themeBlurMatch[1])))) : 0;
        if (blurEl) {
            blurEl.dataset.isCustom = '0';
            blurEl.value = String(px);
        }
        if ($('tl-blur-val')) $('tl-blur-val').textContent = 'Theme';
        updateOverlayUrl({ persist: true, immediate: true });
    });

    // Color picker + text + opacity pairs
    const bindAlphaColorControl = (textId, pickerId, opacityId, opacityValId, fallbackHex) => {
        const textEl = $(textId);
        const pickerEl = $(pickerId);
        const opacityEl = $(opacityId);
        const opacityValEl = $(opacityValId);

        textEl?.addEventListener('input', () => {
            syncColorInputPair(textEl, pickerEl, fallbackHex, opacityEl, opacityValEl);
            updateOverlayUrl({ persist: true, immediate: false });
        });
        textEl?.addEventListener('change', () => {
            syncColorInputPair(textEl, pickerEl, fallbackHex, opacityEl, opacityValEl);
            updateOverlayUrl({ persist: true, immediate: true });
        });
        pickerEl?.addEventListener('input', () => {
            const alpha = opacityEl ? Number(opacityEl.value) : 100;
            if (textEl) textEl.value = opacityEl ? hexAlphaToCss(pickerEl.value, alpha) : pickerEl.value;
            if (opacityValEl && opacityEl) opacityValEl.textContent = `${alpha}%`;
            updateOverlayUrl({ persist: true, immediate: false });
        });
        pickerEl?.addEventListener('change', () => {
            updateOverlayUrl({ persist: true, immediate: true });
        });
        opacityEl?.addEventListener('input', () => {
            const hex = pickerEl ? pickerEl.value : fallbackHex;
            if (textEl) textEl.value = hexAlphaToCss(hex, Number(opacityEl.value));
            if (opacityValEl) opacityValEl.textContent = `${opacityEl.value}%`;
            updateOverlayUrl({ persist: true, immediate: false });
        });
        opacityEl?.addEventListener('change', () => {
            updateOverlayUrl({ persist: true, immediate: true });
        });
    };

    bindAlphaColorControl('overlay-opt-bg', 'overlay-opt-bg-picker', 'overlay-opt-bg-opacity', 'tl-bg-opacity-val', '#0d1117');
    bindAlphaColorControl('overlay-opt-rowbg', 'overlay-opt-rowbg-picker', 'overlay-opt-rowbg-opacity', 'tl-rowbg-opacity-val', '#0d1117');
    bindAlphaColorControl('overlay-opt-border', 'overlay-opt-border-picker', null, null, '#30363d');
    bindAlphaColorControl('overlay-opt-text', 'overlay-opt-text-picker', null, null, '#f0f6fc');
    bindAlphaColorControl('overlay-opt-muted', 'overlay-opt-muted-picker', null, null, '#8b949e');
    bindAlphaColorControl('overlay-opt-accent', 'overlay-opt-accent-picker', null, null, '#3b82f6');

    $('tl-accent-chips')?.addEventListener('click', (e) => {
        const chip = e.target.closest('.tl-p-chip');
        if (!chip) return;
        const hex = chip.dataset.color || '#3b82f6';
        if ($('overlay-opt-accent')) $('overlay-opt-accent').value = hex;
        if ($('overlay-opt-accent-picker')) $('overlay-opt-accent-picker').value = hex;
        updateOverlayUrl({ persist: true, immediate: true });
    });

    $('btn-clear-colors')?.addEventListener('click', () => {
        overlayOptions.backgroundColor = '';
        overlayOptions.rowBackgroundColor = '';
        overlayOptions.borderColor = '';
        overlayOptions.textColor = '';
        overlayOptions.mutedColor = '';
        overlayOptions.accentColor = '';
        writeColorControlsFromOptions();
        updateOverlayUrl({ persist: true, immediate: true });
        showToast('Color overrides cleared');
    });

    $('btn-save-custom-theme')?.addEventListener('click', () => {
        readOptionsFromControls();
        openSaveThemeModal(
            () => Object.assign({}, overlayOptions),
            async (saved) => {
                populateThemeDropdown($('overlay-opt-theme'));
                await applyCustomThemeObjectToStudio(saved);
            }
        );
    });

    $('btn-manage-custom-themes')?.addEventListener('click', () => {
        openManageThemesModal(
            async (theme) => {
                await applyCustomThemeObjectToStudio(theme);
                showToast(`Applied custom theme "${theme.name || theme.id}"`);
            },
            async (deletedId) => {
                if (overlayOptions.theme === 'custom' && overlayOptions.customThemeId === deletedId) {
                    overlayOptions.theme = 'dark';
                    overlayOptions.customThemeId = '';
                }
                populateThemeDropdown($('overlay-opt-theme'));
                writeControlsFromOptions();
                await updateOverlayUrl({ persist: true, immediate: true });
            }
        );
    });

    $('btn-reset-theming')?.addEventListener('click', async () => {
        const currentTitle = overlayOptions.title || 'Community Tier List';
        overlayOptions = Object.assign({}, DEFAULT_OVERLAY_OPTIONS, { title: currentTitle });
        populateThemeDropdown($('overlay-opt-theme'));
        writeControlsFromOptions();
        await updateOverlayUrl({ persist: true, immediate: true });
        showToast('Overlay theming reset to defaults');
    });

    $('overlay-opt-title')?.addEventListener('input', () => {
        updateOverlayUrl({ persist: true, immediate: false });
    });
    $('overlay-opt-banner-url')?.addEventListener('input', () => {
        updateOverlayUrl({ persist: true, immediate: false });
    });
    $('overlay-opt-banner-height')?.addEventListener('input', () => {
        updateOverlayUrl({ persist: true, immediate: false });
    });
    $('overlay-opt-banner-height')?.addEventListener('change', () => {
        updateOverlayUrl({ persist: true, immediate: true });
    });

    $('btn-banner-upload')?.addEventListener('click', () => {
        $('banner-file-input')?.click();
    });

    $('banner-file-input')?.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        showToast('Uploading banner image…');
        try {
            const res = await fetch('/api/custom-overlays/assets', {
                method: 'POST',
                headers: {
                    'Content-Type': file.type,
                    'x-asset-name': file.name || `tier-banner-${Date.now()}.png`
                },
                body: file
            });
            if (res.ok) {
                const data = await res.json();
                const bannerInput = $('overlay-opt-banner-url');
                if (bannerInput) bannerInput.value = data.url;
                await updateOverlayUrl({ persist: true, immediate: true });
                showToast('Banner image uploaded and applied!');
            } else {
                showToast('Failed to upload banner image');
            }
        } catch {
            showToast('Failed to upload banner image');
        } finally {
            e.target.value = '';
        }
    });

    $('btn-banner-library')?.addEventListener('click', () => {
        openAssetLibraryForBanner(async (pickedUrl) => {
            const bannerInput = $('overlay-opt-banner-url');
            if (bannerInput) bannerInput.value = pickedUrl;
            await updateOverlayUrl({ persist: true, immediate: true });
            showToast('Banner updated from Asset Library');
        });
    });

    $('btn-banner-clear')?.addEventListener('click', async () => {
        const bannerInput = $('overlay-opt-banner-url');
        if (bannerInput) bannerInput.value = '';
        await updateOverlayUrl({ persist: true, immediate: true });
        showToast('Custom banner removed');
    });

    $('btn-copy-overlay')?.addEventListener('click', () => copyComputedOverlayUrl(false));
    $('btn-theming-copy-url')?.addEventListener('click', () => copyComputedOverlayUrl(false));
    $('btn-theming-copy-override')?.addEventListener('click', () => copyComputedOverlayUrl(true));
    $('prev-btn-backdrop')?.addEventListener('click', togglePreviewBackdrop);
    $('prev-btn-sample')?.addEventListener('click', togglePreviewSampleData);

    const onResize = () => window.requestAnimationFrame(applyViewportScale);
    window.addEventListener('resize', onResize);

    const wrapper = $('preview-viewport-wrapper');
    if (wrapper && typeof ResizeObserver !== 'undefined') {
        previewResizeObserver = new ResizeObserver(onResize);
        previewResizeObserver.observe(wrapper);
    }

    const cleanupPreview = () => {
        clearTimeout(saveTimer);
        window.removeEventListener('resize', onResize);
        if (previewResizeObserver) {
            previewResizeObserver.disconnect();
            previewResizeObserver = null;
        }
    };
    window.addEventListener('pagehide', cleanupPreview);
    window.addEventListener('beforeunload', cleanupPreview);

    restorePreviewViewport();
    restoreActiveTab();
    applyViewportScale();
}

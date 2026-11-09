/**
 * StreamPulse — Versus Studio Preview, Viewport Scaling, Parameterized URLs & Themes
 */

import {
    $,
    esc,
    toast,
    escapeHtml,
    activeTourneyData,
    activeMatchupData,
    previewMode,
    setPreviewModeState,
    previewUseSample,
    setPreviewUseSampleState,
    previewBackdrop,
    setPreviewBackdropState,
    tourneyFitWholeBracket,
    setTourneyFitWholeBracketState,
    currentViewportW,
    setCurrentViewportW,
    currentViewportH,
    setCurrentViewportH,
    activeThemeModalTarget,
    setActiveThemeModalTarget,
    activeFontPickerTarget,
    setActiveFontPickerTarget,
    cachedAssetFontsList,
    setCachedAssetFontsList,
    isRestoringVersusPrefs,
    setIsRestoringVersusPrefs,
    setActiveTourneyData
} from './versus-state.js';

export function syncTourneyOptFromMain(key, val) {
    if (key === 'theme' && $('prev-ctrl-tourney-theme')) $('prev-ctrl-tourney-theme').value = val;
    if (key === 'spacing' && $('prev-ctrl-tourney-spacing')) $('prev-ctrl-tourney-spacing').value = val;
    if (key === 'lines' && $('prev-ctrl-tourney-lines')) $('prev-ctrl-tourney-lines').value = val;
    if (key === 'radius') {
        if ($('tourney-opt-radius')) $('tourney-opt-radius').value = val;
        if ($('tourney-opt-radius-layout')) $('tourney-opt-radius-layout').value = val;
        if ($('prev-ctrl-tourney-radius')) $('prev-ctrl-tourney-radius').value = val;
    }
    if (key === 'scores' && $('prev-ctrl-tourney-scores')) $('prev-ctrl-tourney-scores').value = val;
    if (key === 'title' && $('prev-ctrl-tourney-title')) $('prev-ctrl-tourney-title').value = val;
    if (key === 'format' && $('prev-ctrl-tourney-format')) $('prev-ctrl-tourney-format').value = val;
    if (key === 'rounds' && $('prev-ctrl-tourney-rounds')) $('prev-ctrl-tourney-rounds').value = val;
    if (key === 'seeds' && $('prev-ctrl-tourney-seeds')) $('prev-ctrl-tourney-seeds').value = val;
    if (key === 'tags' && $('prev-ctrl-tourney-tags')) $('prev-ctrl-tourney-tags').value = val;
    if (key === 'pipstyle' && $('prev-ctrl-tourney-pipstyle')) $('prev-ctrl-tourney-pipstyle').value = val;
    if (key === 'roundpipstyle' && $('prev-ctrl-tourney-roundpipstyle')) $('prev-ctrl-tourney-roundpipstyle').value = val;
    if (key === 'fit') {
        setTourneyFitWholeBracket(val === '1');
        return;
    }
    updateTourneyOverlayUrl();
}

export function setTourneyFitWholeBracket(enabled) {
    setTourneyFitWholeBracketState(Boolean(enabled));
    const btn = $('btn-tourney-fit-toggle');
    if (btn) btn.textContent = tourneyFitWholeBracket ? 'Fit Whole Bracket: ON' : 'Fit Whole Bracket: OFF';
    if ($('tourney-opt-fit')) $('tourney-opt-fit').checked = tourneyFitWholeBracket;
    try { localStorage.setItem('versus-tourney-fit-whole-bracket', tourneyFitWholeBracket ? '1' : '0'); } catch {}
    saveVersusOverlayPrefs();
    updateTourneyOverlayUrl();
}

export function toggleTourneyFitWholeBracket() {
    setTourneyFitWholeBracket(!tourneyFitWholeBracket);
}

export function setPreviewBackdrop(mode) {
    setPreviewBackdropState((mode === 'checkerboard' || mode === 'grid') ? 'checkerboard' : 'dark');
    const boxes = [$('matchup-preview-box'), $('tourney-tree-box'), $('tourney-hud-box')];
    boxes.forEach(b => {
        if (!b) return;
        b.classList.toggle('solid-dark', previewBackdrop === 'dark');
        b.classList.toggle('checkerboard', previewBackdrop === 'checkerboard');
    });
    const btn = $('prev-btn-bg');
    if (btn) btn.textContent = previewBackdrop === 'dark' ? 'Canvas: Dark' : 'Canvas: Grid';
    try { localStorage.setItem('versus-preview-backdrop', previewBackdrop); } catch {}
    saveVersusOverlayPrefs();
}

export function togglePreviewBackdrop() {
    setPreviewBackdrop(previewBackdrop === 'dark' ? 'checkerboard' : 'dark');
}

export function setPreviewSampleData(enabled) {
    setPreviewUseSampleState(Boolean(enabled));
    const btn = $('prev-btn-sample');
    if (btn) btn.textContent = previewUseSample ? 'Sample: ON' : 'Sample: OFF';
    try { localStorage.setItem('versus-preview-sample', previewUseSample ? '1' : '0'); } catch {}
    saveVersusOverlayPrefs();
    updateMatchupOverlayUrl();
    updateTourneyOverlayUrl();
}

export function togglePreviewSampleData() {
    setPreviewSampleData(!previewUseSample);
}

export function setPreviewViewport(w, h, btn, shouldSave = true) {
    document.querySelectorAll('#prev-viewport-chips .preset-chip-btn').forEach(b => b.classList.remove('active'));
    if (!btn && (w !== undefined || h !== undefined)) {
        const chips = Array.from(document.querySelectorAll('#prev-viewport-chips .preset-chip-btn'));
        btn = chips.find(b => {
            if (w === null && h === 560 && b.id === 'chip-vp-bracket') return true;
            if (w === 1100 && (h === 100 || h === 110) && b.id === 'chip-vp-topbar') return true;
            if (w === 800 && h === 130 && b.id === 'chip-vp-hud') return true;
            if (w === 1280 && h === 220 && b.id === 'chip-vp-race') return true;
            if (w === 480 && h === 120 && b.id === 'chip-vp-narrow') return true;
            if (w === 340 && h === 200 && b.id === 'chip-vp-mobile') return true;
            if (w === 1280 && (h === 720 || h === 120) && b.id === 'chip-vp-169') return true;
            if (w === 380 && h === 120 && b.id === 'chip-vp-bug') return true;
            if (w === 420 && h === 360 && b.id === 'chip-vp-pillar') return true;
            if (w === 900 && h === 80 && b.id === 'chip-vp-topbar') return true;
            return false;
        });
    }
    if (btn) btn.classList.add('active');
    setCurrentViewportW(w);
    setCurrentViewportH(h);
    if (shouldSave) {
        try {
            localStorage.setItem('versus-viewport-' + previewMode, JSON.stringify({
                w,
                h,
                chipId: btn ? btn.id : ''
            }));
        } catch {}
        saveVersusOverlayPrefs();
    }
    applyViewportScale();
}

export function applyViewportScale() {
    const wrapper = $('preview-viewport-wrapper');
    const scaler = $('preview-viewport-scaler');
    if (!wrapper || !scaler) return;
    const availW = Math.max(280, wrapper.clientWidth - 16);
    const box = previewMode === 'tourney-tree' ? $('tourney-tree-box') : $('matchup-preview-box');
    if (!box) return;

    if (!currentViewportW) {
        scaler.style.width = '100%';
        scaler.style.height = `${currentViewportH}px`;
        box.style.position = 'relative';
        box.style.width = '100%';
        box.style.height = '100%';
        box.style.transform = 'none';
        return;
    }

    const scale = currentViewportW > availW ? availW / currentViewportW : 1;
    const scaledW = Math.min(availW, Math.round(currentViewportW * scale));
    const scaledH = Math.round(currentViewportH * scale);

    scaler.style.width = `${scaledW}px`;
    scaler.style.height = `${scaledH}px`;

    box.style.position = 'absolute';
    box.style.top = '0';
    box.style.left = '0';
    box.style.width = `${currentViewportW}px`;
    box.style.height = `${currentViewportH}px`;
    box.style.transform = `scale(${scale})`;
    box.style.transformOrigin = 'top left';
}

export function syncColorPicker(textId, pickerId) {
    const val = $(textId)?.value?.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(val) && $(pickerId)) {
        $(pickerId).value = val;
    }
}

export function onPreviewOptionChange(opt, val) {
    if (opt === 'layout') {
        if ($('matchup-opt-layout')) $('matchup-opt-layout').value = val;
        if (val === 'top') setPreviewViewport(1100, 100, $('chip-vp-topbar'));
        else if (val === 'fgc') setPreviewViewport(1100, 110, $('chip-vp-topbar'));
        else if (val === 'split') setPreviewViewport(1280, 120, $('chip-vp-169'));
        else if (val === 'race') setPreviewViewport(1280, 220, $('chip-vp-race'));
        else if (val === 'minimal') setPreviewViewport(900, 80, $('chip-vp-topbar'));
        else if (val === 'bottom') setPreviewViewport(800, 130, $('chip-vp-hud'));
        else if (val === 'pillar') setPreviewViewport(420, 360, $('chip-vp-pillar'));
        else if (val === 'compact') setPreviewViewport(380, 120, $('chip-vp-bug'));
        else if (val === 'angular') setPreviewViewport(1100, 100, $('chip-vp-topbar'));
        else if (val === 'versus') setPreviewViewport(1280, 720, $('chip-vp-169'));
        else if (val === 'pod') setPreviewViewport(380, 90, $('chip-vp-bug'));
        else if (val === 'pill') setPreviewViewport(420, 100, $('chip-vp-bug'));
        else if (val === 'clock') setPreviewViewport(460, 110, $('chip-vp-bug'));
    }
    if (opt === 'player') {
        if ($('matchup-opt-player')) $('matchup-opt-player').value = val;
        if (['1', '2', '3', '4'].includes(val)) {
            if ($('matchup-opt-layout')?.value === 'pillar') setPreviewViewport(160, 240, $('chip-vp-pillar'));
            else setPreviewViewport(380, 90, $('chip-vp-bug'));
        }
        else if (val === 'none') setPreviewViewport(460, 110, $('chip-vp-bug'));
    }
    if (opt === 'theme' && $('matchup-opt-theme')) $('matchup-opt-theme').value = val;
    if (opt === 'clockstyle' && $('matchup-opt-clockstyle')) $('matchup-opt-clockstyle').value = val;
    if (opt === 'runnertimers' && $('matchup-opt-runnertimers')) $('matchup-opt-runnertimers').value = val;
    if (opt === 'pipstyle' && $('matchup-opt-pipstyle')) $('matchup-opt-pipstyle').value = val;
    if (opt === 'roundpipstyle' && $('matchup-opt-roundpipstyle')) $('matchup-opt-roundpipstyle').value = val;
    if (opt === 'scale' && $('matchup-opt-scale')) $('matchup-opt-scale').value = val;
    if (opt === 'fit' && $('matchup-opt-fit')) $('matchup-opt-fit').checked = val === 'content';
    if (opt === 'gap' && $('matchup-opt-gap')) $('matchup-opt-gap').value = val;
    if (opt === 'splits' && $('matchup-opt-splits')) $('matchup-opt-splits').checked = val === '1';
    if (opt === 'mirror' && $('matchup-opt-mirror')) $('matchup-opt-mirror').checked = val === '1';
    updateMatchupOverlayUrl();
}

export function onTourneyPreviewOptionChange() {
    if ($('tourney-opt-theme') && $('prev-ctrl-tourney-theme')) $('tourney-opt-theme').value = $('prev-ctrl-tourney-theme').value;
    if ($('tourney-opt-spacing') && $('prev-ctrl-tourney-spacing')) $('tourney-opt-spacing').value = $('prev-ctrl-tourney-spacing').value;
    if ($('tourney-opt-lines') && $('prev-ctrl-tourney-lines')) $('tourney-opt-lines').value = $('prev-ctrl-tourney-lines').value;
    if ($('prev-ctrl-tourney-radius')) {
        if ($('tourney-opt-radius')) $('tourney-opt-radius').value = $('prev-ctrl-tourney-radius').value;
        if ($('tourney-opt-radius-layout')) $('tourney-opt-radius-layout').value = $('prev-ctrl-tourney-radius').value;
    }
    if ($('tourney-opt-scores') && $('prev-ctrl-tourney-scores')) $('tourney-opt-scores').checked = $('prev-ctrl-tourney-scores').value === '1';
    if ($('tourney-opt-title') && $('prev-ctrl-tourney-title')) $('tourney-opt-title').checked = $('prev-ctrl-tourney-title').value === '1';
    if ($('tourney-opt-format') && $('prev-ctrl-tourney-format')) $('tourney-opt-format').checked = $('prev-ctrl-tourney-format').value === '1';
    if ($('tourney-opt-rounds') && $('prev-ctrl-tourney-rounds')) $('tourney-opt-rounds').checked = $('prev-ctrl-tourney-rounds').value === '1';
    if ($('tourney-opt-seeds') && $('prev-ctrl-tourney-seeds')) $('tourney-opt-seeds').checked = $('prev-ctrl-tourney-seeds').value === '1';
    if ($('tourney-opt-tags') && $('prev-ctrl-tourney-tags')) $('tourney-opt-tags').checked = $('prev-ctrl-tourney-tags').value === '1';
    if ($('tourney-opt-pipstyle') && $('prev-ctrl-tourney-pipstyle')) $('tourney-opt-pipstyle').value = $('prev-ctrl-tourney-pipstyle').value;
    if ($('tourney-opt-roundpipstyle') && $('prev-ctrl-tourney-roundpipstyle')) $('tourney-opt-roundpipstyle').value = $('prev-ctrl-tourney-roundpipstyle').value;
    updateTourneyOverlayUrl();
}

export function setPreviewMode(mode) {
    setPreviewModeState(mode);
    $('btn-prev-matchup')?.classList.toggle('active', mode === 'matchup');
    $('btn-prev-tourney-tree')?.classList.toggle('active', mode === 'tourney-tree');
    $('btn-prev-tourney-hud')?.classList.toggle('active', mode === 'tourney-hud');
    if ($('ov-sec-matchup')) $('ov-sec-matchup').style.display = mode === 'matchup' ? 'block' : 'none';
    if ($('ov-sec-hud')) $('ov-sec-hud').style.display = mode === 'tourney-hud' ? 'block' : 'none';
    if ($('ov-sec-tree')) $('ov-sec-tree').style.display = mode === 'tourney-tree' ? 'block' : 'none';
    try { localStorage.setItem('versus-overlay-tab', mode); } catch (e) {}

    const isMatchupLike = mode === 'matchup' || mode === 'tourney-hud';
    if ($('matchup-preview-box')) $('matchup-preview-box').style.display = isMatchupLike ? 'block' : 'none';
    if ($('tourney-tree-box')) $('tourney-tree-box').style.display = mode === 'tourney-tree' ? 'block' : 'none';

    if ($('preview-toolbar-matchup')) $('preview-toolbar-matchup').style.display = isMatchupLike ? 'flex' : 'none';
    if ($('preview-toolbar-tourney')) $('preview-toolbar-tourney').style.display = mode === 'tourney-tree' ? 'flex' : 'none';

    const labelEl = $('prev-mode-label');
    if (labelEl) {
        if (mode === 'matchup') labelEl.textContent = 'Matchup Scoreboard Preview';
        else if (mode === 'tourney-tree') labelEl.textContent = 'Tournament Bracket Tree Preview';
        else if (mode === 'tourney-hud') labelEl.textContent = 'Tournament Active Match HUD Preview (Unified)';
    }

    let hasSavedViewport = false;
    try {
        const rawVp = localStorage.getItem('versus-viewport-' + mode);
        if (rawVp) {
            const savedVp = JSON.parse(rawVp);
            if (savedVp && (savedVp.w !== undefined || savedVp.h !== undefined)) {
                const chip = savedVp.chipId ? $(savedVp.chipId) : null;
                setPreviewViewport(savedVp.w, savedVp.h, chip, false);
                hasSavedViewport = true;
            }
        }
    } catch {}

    if (!hasSavedViewport) {
        if (mode === 'tourney-tree') {
            setPreviewViewport(null, 560, $('chip-vp-bracket'), false);
        } else if (mode === 'tourney-hud') {
            setPreviewViewport(1100, 100, $('chip-vp-topbar'), false);
        } else {
            const curLayout = $('matchup-opt-layout')?.value || 'top';
            onPreviewOptionChange('layout', curLayout);
        }
    }

    if (mode === 'tourney-tree') {
        updateTourneyOverlayUrl();
    } else {
        updateMatchupOverlayUrl();
    }
    saveVersusOverlayPrefs();
}

export function updateTourneyOverlayUrl() {
    const origin = window.location.origin;
    const themeSelect = $('prev-ctrl-tourney-theme') || $('tourney-opt-theme');
    const spacingSelect = $('prev-ctrl-tourney-spacing') || $('tourney-opt-spacing');
    const linesSelect = $('prev-ctrl-tourney-lines') || $('tourney-opt-lines');
    const scoresSelect = $('prev-ctrl-tourney-scores') || $('tourney-opt-scores');
    const titleSelect = $('prev-ctrl-tourney-title') || $('tourney-opt-title');
    const roundsSelect = $('prev-ctrl-tourney-rounds') || $('tourney-opt-rounds');

    const urlParams = new URLSearchParams();
    const bracketSelect = $('tourney-opt-bracket');
    if (bracketSelect && bracketSelect.value !== 'all') urlParams.set('bracket', bracketSelect.value);
    if (themeSelect && themeSelect.value !== 'card') urlParams.set('overlay', themeSelect.value);
    if (spacingSelect && spacingSelect.value !== 'normal') urlParams.set('spacing', spacingSelect.value);
    if (linesSelect && linesSelect.value !== 'glow') urlParams.set('lines', linesSelect.value);
    if (scoresSelect && String(scoresSelect.value) === '0') urlParams.set('showscores', '0');
    if (titleSelect && String(titleSelect.value) === '0') urlParams.set('showtitle', '0');
    if (roundsSelect && String(roundsSelect.value) === '0') urlParams.set('showrounds', '0');

    const tourneyPipStyleSelect = $('prev-ctrl-tourney-pipstyle') || $('tourney-opt-pipstyle');
    if (tourneyPipStyleSelect && tourneyPipStyleSelect.value !== 'circle') urlParams.set('pipstyle', tourneyPipStyleSelect.value);
    const tourneyRoundPipStyleSelect = $('prev-ctrl-tourney-roundpipstyle') || $('tourney-opt-roundpipstyle');
    if (tourneyRoundPipStyleSelect && tourneyRoundPipStyleSelect.value !== 'diamond') urlParams.set('roundpipstyle', tourneyRoundPipStyleSelect.value);

    const formatCheck = $('prev-ctrl-tourney-format') ? $('prev-ctrl-tourney-format').value === '1' : ($('tourney-opt-format')?.checked ?? true);
    if (!formatCheck) urlParams.set('showformat', '0');
    const seedsCheck = $('prev-ctrl-tourney-seeds') ? $('prev-ctrl-tourney-seeds').value === '1' : ($('tourney-opt-seeds')?.checked ?? true);
    if (!seedsCheck) urlParams.set('showseeds', '0');
    const tagsCheck = $('prev-ctrl-tourney-tags') ? $('prev-ctrl-tourney-tags').value === '1' : ($('tourney-opt-tags')?.checked ?? true);
    if (!tagsCheck) urlParams.set('showtags', '0');

    ['mode', 'entrants', 'status', 'roundpips', 'badges', 'champion'].forEach(k => {
        const el = $('tourney-opt-' + k);
        if (el && !el.checked) {
            if (k === 'roundpips') urlParams.set('roundpips', '0');
            else if (k === 'champion') urlParams.set('champion', '0');
            else urlParams.set('show' + k, '0');
        }
    });
    const confettiCheck = $('prev-ctrl-tourney-confetti') ? $('prev-ctrl-tourney-confetti').value === '1' : ($('tourney-opt-confetti')?.checked ?? false);
    if (confettiCheck) urlParams.set('confetti', '1');
    const highlightEl = $('tourney-opt-highlight');
    if (highlightEl && !highlightEl.checked) urlParams.set('highlight', '0');
    const showLogoEl = $('tourney-opt-showlogo');
    if (showLogoEl && !showLogoEl.checked) urlParams.set('showlogo', '0');
    const logoInput = $('tourney-opt-logo');
    if (logoInput && logoInput.value.trim()) urlParams.set('logo', logoInput.value.trim());
    const logoSizeEl = $('tourney-opt-logosize');
    if (logoSizeEl && logoSizeEl.value && logoSizeEl.value !== '56px') urlParams.set('logosize', logoSizeEl.value);
    const centerEl = $('tourney-opt-center');
    if (centerEl && !centerEl.checked) urlParams.set('center', '0');
    const gapEl = $('tourney-opt-gap');
    if (gapEl && gapEl.value) urlParams.set('gap', gapEl.value);
    const tourneyAccentInput = $('tourney-opt-accent');
    if (tourneyAccentInput && tourneyAccentInput.value.trim()) urlParams.set('accent', tourneyAccentInput.value.trim());
    const tourneyBadgeColorInput = $('tourney-opt-badgecolor');
    if (tourneyBadgeColorInput && tourneyBadgeColorInput.value.trim()) urlParams.set('badgecolor', tourneyBadgeColorInput.value.trim());

    // Typography & Styling Overrides
    const tourneyLayout = $('tourney-opt-layout')?.value;
    if (tourneyLayout && tourneyLayout !== 'tree') urlParams.set('layout', tourneyLayout);
    const tourneyCamera = $('tourney-opt-camera')?.value;
    if (tourneyCamera === '1' || tourneyCamera === '0') urlParams.set('focus', tourneyCamera);
    const tourneyGlide = $('tourney-opt-glide')?.value;
    if (tourneyGlide === '0') urlParams.set('glide', '0');
    const tourneyBadge = $('tourney-opt-badge')?.value;
    if (tourneyBadge === '1') urlParams.set('focusbadge', '1');
    else if (tourneyBadge === '0') urlParams.set('focusbadge', '0');
    const tourneyHeadingFont = $('tourney-opt-heading-font')?.value?.trim();
    if (tourneyHeadingFont) urlParams.set('headingfont', tourneyHeadingFont);
    const tourneyFont = $('tourney-opt-font')?.value?.trim();
    if (tourneyFont) urlParams.set('font', tourneyFont);
    const tourneyScale = $('tourney-opt-scale')?.value?.trim();
    if (tourneyScale && tourneyScale !== '1') urlParams.set('scale', tourneyScale);
    const tourneyWeight = $('tourney-opt-weight')?.value?.trim();
    if (tourneyWeight) urlParams.set('weight', tourneyWeight);
    const tourneyTransform = $('tourney-opt-transform')?.value?.trim();
    if (tourneyTransform) urlParams.set('transform', tourneyTransform);
    const tourneyRadius = $('tourney-opt-radius')?.value?.trim();
    if (tourneyRadius) urlParams.set('radius', tourneyRadius);
    const tourneyOutline = $('tourney-opt-outline')?.value?.trim();
    if (tourneyOutline) urlParams.set('outline', tourneyOutline);
    const tourneyText = $('tourney-opt-text')?.value?.trim();
    if (tourneyText) urlParams.set('text', tourneyText);
    const tourneyMuted = $('tourney-opt-muted')?.value?.trim();
    if (tourneyMuted) urlParams.set('muted', tourneyMuted);
    const tourneyCardBg = $('tourney-opt-cardbg')?.value?.trim();
    if (tourneyCardBg) urlParams.set('cardbg', tourneyCardBg);
    const tourneyBg = $('tourney-opt-bg')?.value?.trim();
    if (tourneyBg) urlParams.set('bg', tourneyBg);
    const tourneyBorder = $('tourney-opt-border')?.value?.trim();
    if (tourneyBorder) urlParams.set('border', tourneyBorder);
    const tourneyWinner = $('tourney-opt-winner')?.value?.trim();
    if (tourneyWinner) urlParams.set('winner', tourneyWinner);
    const tourneyP1Color = $('tourney-opt-p1color')?.value?.trim();
    if (tourneyP1Color) urlParams.set('p1color', tourneyP1Color);
    const tourneyP2Color = $('tourney-opt-p2color')?.value?.trim();
    if (tourneyP2Color) urlParams.set('p2color', tourneyP2Color);

    if (tourneyFitWholeBracket) urlParams.set('fit', '1');
    if ($('tourney-opt-wide') && $('tourney-opt-wide').checked) urlParams.set('wide', '1');

    const qs = urlParams.toString();
    const fullUrl = `${origin}/overlays/tournament.html${qs ? `?${qs}` : ''}`;
    if ($('url-tourney-overlay')) $('url-tourney-overlay').value = fullUrl;
    if ($('btn-open-tourney-overlay')) $('btn-open-tourney-overlay').href = fullUrl;

    const previewParams = new URLSearchParams(urlParams);
    if (!previewParams.get('logo') && activeTourneyData?.logo) {
        previewParams.set('logo', activeTourneyData.logo);
    }
    previewParams.set('preview', '1');
    previewParams.set('fit', '1');
    previewParams.set('sample', previewUseSample ? '1' : '0');

    if ($('tourney-preview-iframe')) {
        $('tourney-preview-iframe').src = `/overlays/tournament.html?${previewParams.toString()}`;
    }
    saveVersusOverlayPrefs();
}

export function setCreateTourneyLogo(url) {
    const clean = (url || '').trim();
    if ($('tourney-create-logo')) $('tourney-create-logo').value = clean;
    const thumb = $('tourney-create-logo-thumb');
    const btnText = $('tourney-create-logo-btn-text');
    const clearBtn = $('tourney-create-logo-clear');
    if (thumb) {
        thumb.src = clean;
        thumb.style.display = clean ? 'block' : 'none';
    }
    if (btnText) {
        const friendly = clean ? decodeURIComponent(clean.split('/').pop()).replace(/^[a-z0-9]{6,}-/, '') : '';
        btnText.textContent = clean ? (friendly || 'Change Logo…') : 'Choose from Asset Library…';
    }
    if (clearBtn) clearBtn.style.display = clean ? 'inline-flex' : 'none';
}

export function pickCreateTourneyLogo() {
    if (!window.ImagePicker) {
        toast('Image Picker not loaded');
        return;
    }
    window.ImagePicker.open({
        value: $('tourney-create-logo')?.value || '',
        onPick: (url) => {
            setCreateTourneyLogo(url);
            setOverlayTourneyLogo(url, false);
        }
    });
}

export function syncTourneyOverlayLogoUi(url) {
    const clean = (url || '').trim();
    const thumb = $('tourney-opt-logo-thumb');
    const clearBtn = $('tourney-opt-logo-clear');
    const prevBtnText = $('btn-prev-tourney-logo-text');
    if (thumb) {
        thumb.src = clean;
        thumb.style.display = clean ? 'block' : 'none';
    }
    if (clearBtn) clearBtn.style.display = clean ? 'inline-flex' : 'none';
    if (prevBtnText) prevBtnText.textContent = clean ? 'Logo: Set' : 'Logo…';
}

export async function setOverlayTourneyLogo(url, syncLive = true) {
    const clean = (url || '').trim();
    if ($('tourney-opt-logo')) $('tourney-opt-logo').value = clean;
    syncTourneyOverlayLogoUi(clean);
    updateTourneyOverlayUrl();
    if (syncLive && activeTourneyData) {
        try {
            const res = await fetch('/api/tournament/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ logo: clean })
            });
            const data = await res.json();
            if (data.status === 'ok') {
                setActiveTourneyData(data.tournament);
                if (window.renderTournamentStudio) window.renderTournamentStudio(activeTourneyData);
            }
        } catch {}
    }
}

export function pickOverlayTourneyLogo() {
    if (!window.ImagePicker) return;
    window.ImagePicker.open({
        value: $('tourney-opt-logo')?.value || activeTourneyData?.logo || '',
        onPick: (url) => {
            setOverlayTourneyLogo(url, true);
            toast(url ? 'Bracket header logo updated' : 'Bracket header logo cleared');
        }
    });
}

export function pickLiveTourneyLogo() {
    if (!window.ImagePicker) return;
    window.ImagePicker.open({
        value: activeTourneyData?.logo || $('tourney-opt-logo')?.value || '',
        onPick: async (url) => {
            await setOverlayTourneyLogo(url, true);
            toast(url ? 'Tournament bracket logo updated!' : 'Tournament bracket logo removed');
        }
    });
}

export function updateMatchupOverlayUrl() {
    const origin = window.location.origin;
    const layoutSelect = $('matchup-opt-layout');
    const themeSelect = $('matchup-opt-theme');
    const clockStyleSelect = $('matchup-opt-clockstyle');
    const runnerTimersSelect = $('matchup-opt-runnertimers');
    const sourceSelect = $('matchup-opt-source');
    const pipStyleSelect = $('matchup-opt-pipstyle');
    const roundPipStyleSelect = $('matchup-opt-roundpipstyle');
    const scaleSelect = $('matchup-opt-scale');
    const widthInput = $('matchup-opt-width');
    const gapSelect = $('matchup-opt-gap');
    const centerCheck = $('matchup-opt-center');
    const fitCheck = $('matchup-opt-fit');
    const confettiCheck = $('matchup-opt-confetti');
    const showEstCheck = $('matchup-opt-showest');
    const splitsCheck = $('matchup-opt-splits');
    const mirrorCheck = $('matchup-opt-mirror');
    const playerSelect = $('matchup-opt-player');
    const accentInput = $('matchup-opt-accent');
    const badgeColorInput = $('matchup-opt-badgecolor');

    if ($('prev-ctrl-layout') && layoutSelect) $('prev-ctrl-layout').value = layoutSelect.value;
    if ($('prev-ctrl-player') && playerSelect) $('prev-ctrl-player').value = playerSelect.value;
    if ($('prev-ctrl-mirror') && mirrorCheck) $('prev-ctrl-mirror').checked = mirrorCheck.checked;
    if ($('prev-ctrl-theme') && themeSelect) $('prev-ctrl-theme').value = themeSelect.value;
    if ($('prev-ctrl-clockstyle') && clockStyleSelect) $('prev-ctrl-clockstyle').value = clockStyleSelect.value;
    if ($('prev-ctrl-runnertimers') && runnerTimersSelect) $('prev-ctrl-runnertimers').value = runnerTimersSelect.value;
    if ($('prev-ctrl-splits') && splitsCheck) $('prev-ctrl-splits').value = splitsCheck.checked ? '1' : '0';
    if ($('prev-ctrl-pipstyle') && pipStyleSelect) $('prev-ctrl-pipstyle').value = pipStyleSelect.value;
    if ($('prev-ctrl-roundpipstyle') && roundPipStyleSelect) $('prev-ctrl-roundpipstyle').value = roundPipStyleSelect.value;
    if ($('prev-ctrl-scale') && scaleSelect) $('prev-ctrl-scale').value = scaleSelect.value;
    if ($('prev-ctrl-fit') && fitCheck) $('prev-ctrl-fit').value = fitCheck.checked ? 'content' : 'full';
    if ($('prev-ctrl-gap') && gapSelect) $('prev-ctrl-gap').value = gapSelect.value;

    const urlParams = new URLSearchParams();
    if (layoutSelect && layoutSelect.value !== 'top') urlParams.set('layout', layoutSelect.value);
    if (playerSelect && playerSelect.value) urlParams.set('player', playerSelect.value);
    if (mirrorCheck && mirrorCheck.checked) urlParams.set('mirror', '1');
    if (themeSelect && themeSelect.value !== 'card') urlParams.set('overlay', themeSelect.value);
    if (accentInput && accentInput.value.trim()) urlParams.set('accent', accentInput.value.trim());
    if (badgeColorInput && badgeColorInput.value.trim()) urlParams.set('badgecolor', badgeColorInput.value.trim());

    // Typography & Styling Overrides
    const matchupHeadingFont = $('matchup-opt-heading-font')?.value?.trim();
    if (matchupHeadingFont) urlParams.set('headingfont', matchupHeadingFont);
    const matchupFont = $('matchup-opt-font')?.value?.trim();
    if (matchupFont) urlParams.set('font', matchupFont);
    const matchupWeight = $('matchup-opt-weight')?.value?.trim();
    if (matchupWeight) urlParams.set('weight', matchupWeight);
    const matchupTransform = $('matchup-opt-transform')?.value?.trim();
    if (matchupTransform) urlParams.set('transform', matchupTransform);
    const matchupRadius = $('matchup-opt-radius')?.value?.trim();
    if (matchupRadius) urlParams.set('radius', matchupRadius);
    const matchupOutline = $('matchup-opt-outline')?.value?.trim();
    if (matchupOutline) urlParams.set('outline', matchupOutline);
    const matchupText = $('matchup-opt-text')?.value?.trim();
    if (matchupText) urlParams.set('text', matchupText);
    const matchupMuted = $('matchup-opt-muted')?.value?.trim();
    if (matchupMuted) urlParams.set('muted', matchupMuted);
    const matchupCardBg = $('matchup-opt-cardbg')?.value?.trim();
    if (matchupCardBg) urlParams.set('cardbg', matchupCardBg);
    const matchupBg = $('matchup-opt-bg')?.value?.trim();
    if (matchupBg) urlParams.set('bg', matchupBg);
    const matchupBorder = $('matchup-opt-border')?.value?.trim();
    if (matchupBorder) urlParams.set('border', matchupBorder);
    const matchupWinner = $('matchup-opt-winner')?.value?.trim();
    if (matchupWinner) urlParams.set('winner', matchupWinner);
    const matchupP1Color = $('matchup-opt-p1color')?.value?.trim();
    if (matchupP1Color) urlParams.set('p1color', matchupP1Color);
    const matchupP2Color = $('matchup-opt-p2color')?.value?.trim();
    if (matchupP2Color) urlParams.set('p2color', matchupP2Color);
    if (clockStyleSelect && clockStyleSelect.value && clockStyleSelect.value !== 'badge') urlParams.set('clockstyle', clockStyleSelect.value);
    if (runnerTimersSelect && runnerTimersSelect.value && runnerTimersSelect.value !== 'finish') urlParams.set('runnertimers', runnerTimersSelect.value);
    if (sourceSelect && sourceSelect.value !== 'auto') urlParams.set('source', sourceSelect.value);
    if (pipStyleSelect && pipStyleSelect.value !== 'circle') urlParams.set('pipstyle', pipStyleSelect.value);
    if (roundPipStyleSelect && roundPipStyleSelect.value !== 'diamond') urlParams.set('roundpipstyle', roundPipStyleSelect.value);
    if (scaleSelect && scaleSelect.value && scaleSelect.value !== '1') urlParams.set('scale', scaleSelect.value);
    if (widthInput && widthInput.value && widthInput.value.trim()) urlParams.set('width', widthInput.value.trim());
    if (gapSelect && gapSelect.value) urlParams.set('gap', gapSelect.value);
    if (centerCheck && !centerCheck.checked) urlParams.set('center', '0');
    ['title', 'phase', 'clock', 'playerclocks', 'tags', 'details', 'pips', 'banner'].forEach(k => { const el = $('matchup-opt-' + k); if (el && !el.checked) urlParams.set(k, '0'); });
    const roundPipsEl = $('matchup-opt-roundpips');
    if (roundPipsEl) {
        if (roundPipsEl.checked) urlParams.set('roundpips', '1');
        else urlParams.set('roundpips', '0');
    }
    if (splitsCheck && !splitsCheck.checked) urlParams.set('splits', '0');
    if (showEstCheck && !showEstCheck.checked) urlParams.set('showest', '0');
    if (fitCheck && fitCheck.checked) urlParams.set('fit', 'content');
    if (confettiCheck && !confettiCheck.checked) urlParams.set('confetti', '0');
    if ($('matchup-opt-wide') && $('matchup-opt-wide').checked) urlParams.set('wide', '1');

    const qs = urlParams.toString();
    const fullUrl = `${origin}/overlays/matchup.html${qs ? `?${qs}` : ''}`;
    if ($('url-matchup-overlay')) $('url-matchup-overlay').value = fullUrl;
    if ($('btn-open-matchup-overlay')) $('btn-open-matchup-overlay').href = fullUrl;

    // Unified Active Tournament HUD OBS Link
    const hudParams = new URLSearchParams(urlParams);
    hudParams.set('source', 'tournament');
    const hudUrl = `${origin}/overlays/matchup.html?${hudParams.toString()}`;
    if ($('url-tourney-hud')) $('url-tourney-hud').value = hudUrl;
    if ($('btn-open-tourney-hud')) $('btn-open-tourney-hud').href = hudUrl;

    const previewIframe = $('matchup-preview-iframe');
    if (previewIframe) {
        const previewParams = new URLSearchParams(urlParams);
        if (previewMode === 'tourney-hud') {
            previewParams.set('source', 'tournament');
        }
        previewParams.set('preview', '1');
        previewParams.set('sample', previewUseSample ? '1' : '0');
        previewIframe.src = `/overlays/matchup.html?${previewParams.toString()}`;
    }
    saveVersusOverlayPrefs();
}

const VERSUS_OVERLAY_PREFS_KEY = 'streampulse_versus_overlay_prefs';

export function saveVersusOverlayPrefs() {
    if (isRestoringVersusPrefs) return;
    try {
        const prefs = {
            preview: {
                mode: previewMode,
                backdrop: previewBackdrop,
                useSample: previewUseSample,
                tourneyFitWholeBracket: tourneyFitWholeBracket,
                viewportW: currentViewportW,
                viewportH: currentViewportH,
            },
            matchup: {
                layout: $('matchup-opt-layout')?.value,
                player: $('matchup-opt-player')?.value,
                accent: $('matchup-opt-accent')?.value,
                badgecolor: $('matchup-opt-badgecolor')?.value,
                theme: $('matchup-opt-theme')?.value,
                headingfont: $('matchup-opt-heading-font')?.value,
                font: $('matchup-opt-font')?.value,
                weight: $('matchup-opt-weight')?.value,
                transform: $('matchup-opt-transform')?.value,
                radius: $('matchup-opt-radius')?.value,
                outline: $('matchup-opt-outline')?.value,
                text: $('matchup-opt-text')?.value,
                muted: $('matchup-opt-muted')?.value,
                cardbg: $('matchup-opt-cardbg')?.value,
                bg: $('matchup-opt-bg')?.value,
                border: $('matchup-opt-border')?.value,
                winner: $('matchup-opt-winner')?.value,
                p1color: $('matchup-opt-p1color')?.value,
                p2color: $('matchup-opt-p2color')?.value,
                clockstyle: $('matchup-opt-clockstyle')?.value,
                runnertimers: $('matchup-opt-runnertimers')?.value,
                source: $('matchup-opt-source')?.value,
                pipstyle: $('matchup-opt-pipstyle')?.value,
                roundpipstyle: $('matchup-opt-roundpipstyle')?.value,
                scale: $('matchup-opt-scale')?.value,
                width: $('matchup-opt-width')?.value,
                gap: $('matchup-opt-gap')?.value,
                center: $('matchup-opt-center')?.checked,
                title: $('matchup-opt-title')?.checked,
                phase: $('matchup-opt-phase')?.checked,
                banner: $('matchup-opt-banner')?.checked,
                clock: $('matchup-opt-clock')?.checked,
                playerclocks: $('matchup-opt-playerclocks')?.checked,
                showest: $('matchup-opt-showest')?.checked,
                tags: $('matchup-opt-tags')?.checked,
                details: $('matchup-opt-details')?.checked,
                pips: $('matchup-opt-pips')?.checked,
                roundpips: $('matchup-opt-roundpips')?.checked,
                splits: $('matchup-opt-splits')?.checked,
                fit: $('matchup-opt-fit')?.checked,
                mirror: $('matchup-opt-mirror')?.checked,
                confetti: $('matchup-opt-confetti')?.checked,
            },
            tourney: {
                layout: $('tourney-opt-layout')?.value,
                bracket: $('tourney-opt-bracket')?.value,
                theme: $('tourney-opt-theme')?.value,
                headingfont: $('tourney-opt-heading-font')?.value,
                font: $('tourney-opt-font')?.value,
                scale: $('tourney-opt-scale')?.value,
                weight: $('tourney-opt-weight')?.value,
                transform: $('tourney-opt-transform')?.value,
                radius: $('tourney-opt-radius')?.value,
                outline: $('tourney-opt-outline')?.value,
                text: $('tourney-opt-text')?.value,
                muted: $('tourney-opt-muted')?.value,
                cardbg: $('tourney-opt-cardbg')?.value,
                bg: $('tourney-opt-bg')?.value,
                border: $('tourney-opt-border')?.value,
                winner: $('tourney-opt-winner')?.value,
                p1color: $('tourney-opt-p1color')?.value,
                p2color: $('tourney-opt-p2color')?.value,
                spacing: $('tourney-opt-spacing')?.value,
                lines: $('tourney-opt-lines')?.value,
                pipstyle: $('tourney-opt-pipstyle')?.value,
                roundpipstyle: $('tourney-opt-roundpipstyle')?.value,
                gap: $('tourney-opt-gap')?.value,
                accent: $('tourney-opt-accent')?.value,
                badgecolor: $('tourney-opt-badgecolor')?.value,
                logosize: $('tourney-opt-logosize')?.value,
                showlogo: $('tourney-opt-showlogo')?.checked,
                highlight: $('tourney-opt-highlight')?.checked,
                center: $('tourney-opt-center')?.checked,
                title: $('tourney-opt-title')?.checked,
                format: $('tourney-opt-format')?.checked,
                mode: $('tourney-opt-mode')?.checked,
                entrants: $('tourney-opt-entrants')?.checked,
                scores: $('tourney-opt-scores')?.checked,
                rounds: $('tourney-opt-rounds')?.checked,
                seeds: $('tourney-opt-seeds')?.checked,
                tags: $('tourney-opt-tags')?.checked,
                badges: $('tourney-opt-badges')?.checked,
                champion: $('tourney-opt-champion')?.checked,
                confetti: $('tourney-opt-confetti')?.checked,
                fit: $('tourney-opt-fit')?.checked,
                tourneyFitWholeBracket: typeof tourneyFitWholeBracket !== 'undefined' ? tourneyFitWholeBracket : false,
            }
        };
        localStorage.setItem(VERSUS_OVERLAY_PREFS_KEY, JSON.stringify(prefs));
    } catch { /* ignore storage errors */ }
}

export function restoreVersusOverlayPrefs() {
    try {
        const raw = localStorage.getItem(VERSUS_OVERLAY_PREFS_KEY);
        const prefs = raw ? JSON.parse(raw) : {};
        setIsRestoringVersusPrefs(true);

        const savedBackdrop = prefs.preview?.backdrop || localStorage.getItem('versus-preview-backdrop');
        if (savedBackdrop) setPreviewBackdrop(savedBackdrop);

        const savedSample = prefs.preview?.useSample !== undefined ? prefs.preview.useSample : (localStorage.getItem('versus-preview-sample') !== null ? localStorage.getItem('versus-preview-sample') === '1' : undefined);
        if (savedSample !== undefined) setPreviewSampleData(savedSample);

        const savedFit = prefs.preview?.tourneyFitWholeBracket !== undefined ? prefs.preview.tourneyFitWholeBracket : (localStorage.getItem('versus-tourney-fit-whole-bracket') !== null ? localStorage.getItem('versus-tourney-fit-whole-bracket') === '1' : undefined);
        if (savedFit !== undefined) setTourneyFitWholeBracket(savedFit);

        const savedMode = prefs.preview?.mode || localStorage.getItem('versus-overlay-tab');
        if (savedMode && ['matchup', 'tourney-tree', 'tourney-hud'].includes(savedMode)) {
            setPreviewModeState(savedMode);
        }

        if (prefs.matchup) {
            const m = prefs.matchup;
            if (m.layout !== undefined && $('matchup-opt-layout')) $('matchup-opt-layout').value = m.layout;
            if (m.player !== undefined && $('matchup-opt-player')) $('matchup-opt-player').value = m.player;
            if (m.theme !== undefined && $('matchup-opt-theme')) $('matchup-opt-theme').value = m.theme;
            if (m.clockstyle !== undefined && $('matchup-opt-clockstyle')) $('matchup-opt-clockstyle').value = m.clockstyle;
            if (m.runnertimers !== undefined && $('matchup-opt-runnertimers')) $('matchup-opt-runnertimers').value = m.runnertimers;
            if (m.source !== undefined && $('matchup-opt-source')) $('matchup-opt-source').value = m.source;
            if (m.pipstyle !== undefined && $('matchup-opt-pipstyle')) $('matchup-opt-pipstyle').value = m.pipstyle;
            if (m.roundpipstyle !== undefined && $('matchup-opt-roundpipstyle')) $('matchup-opt-roundpipstyle').value = m.roundpipstyle;
            if (m.scale !== undefined && $('matchup-opt-scale')) $('matchup-opt-scale').value = m.scale;
            if (m.width !== undefined && $('matchup-opt-width')) $('matchup-opt-width').value = m.width;
            if (m.gap !== undefined && $('matchup-opt-gap')) $('matchup-opt-gap').value = m.gap;
            if (m.headingfont !== undefined && $('matchup-opt-heading-font')) $('matchup-opt-heading-font').value = m.headingfont;
            ['font', 'weight', 'transform', 'radius', 'outline'].forEach(k => {
                const el = $('matchup-opt-' + k);
                if (el && m[k] !== undefined) el.value = m[k];
            });
            ['accent', 'badgecolor', 'text', 'muted', 'cardbg', 'bg', 'border', 'winner', 'p1color', 'p2color'].forEach(k => {
                const el = $('matchup-opt-' + k);
                if (el && m[k] !== undefined) {
                    el.value = m[k];
                    syncColorPicker('matchup-opt-' + k, 'matchup-opt-' + k + '-picker');
                }
            });
            ['center', 'title', 'phase', 'banner', 'clock', 'playerclocks', 'showest', 'tags', 'details', 'pips', 'roundpips', 'splits', 'fit', 'mirror', 'confetti'].forEach(k => {
                const el = $('matchup-opt-' + k);
                if (el && m[k] !== undefined) el.checked = Boolean(m[k]);
            });
        }
        if (prefs.tourney) {
            const t = prefs.tourney;
            if (t.layout !== undefined && $('tourney-opt-layout')) $('tourney-opt-layout').value = t.layout;
            if (['all', 'winners', 'losers', 'finals'].includes(t.bracket) && $('tourney-opt-bracket')) $('tourney-opt-bracket').value = t.bracket;
            if (t.theme !== undefined && $('tourney-opt-theme')) $('tourney-opt-theme').value = t.theme;
            if (t.spacing !== undefined && $('tourney-opt-spacing')) $('tourney-opt-spacing').value = t.spacing;
            if (t.lines !== undefined && $('tourney-opt-lines')) $('tourney-opt-lines').value = t.lines;
            if (t.pipstyle !== undefined && $('tourney-opt-pipstyle')) $('tourney-opt-pipstyle').value = t.pipstyle;
            if (t.roundpipstyle !== undefined && $('tourney-opt-roundpipstyle')) $('tourney-opt-roundpipstyle').value = t.roundpipstyle;
            if (t.gap !== undefined && $('tourney-opt-gap')) $('tourney-opt-gap').value = t.gap;
            if (t.logosize !== undefined && $('tourney-opt-logosize')) $('tourney-opt-logosize').value = t.logosize;
            ['headingfont', 'font', 'scale', 'weight', 'transform', 'radius', 'outline'].forEach(k => {
                const el = $('tourney-opt-' + k);
                if (el && t[k] !== undefined) el.value = t[k];
            });
            if (t.radius !== undefined) {
                if ($('tourney-opt-radius-layout')) $('tourney-opt-radius-layout').value = t.radius;
                if ($('prev-ctrl-tourney-radius')) $('prev-ctrl-tourney-radius').value = t.radius;
            }
            ['accent', 'badgecolor', 'p1color', 'p2color', 'text', 'muted', 'cardbg', 'bg', 'border', 'winner'].forEach(k => {
                const el = $('tourney-opt-' + k);
                if (el && t[k] !== undefined) {
                    el.value = t[k];
                    syncColorPicker('tourney-opt-' + k, 'tourney-opt-' + k + '-picker');
                }
            });
            ['showlogo', 'highlight', 'center', 'title', 'format', 'mode', 'entrants', 'scores', 'rounds', 'seeds', 'tags', 'badges', 'champion', 'confetti', 'fit'].forEach(k => {
                const el = $('tourney-opt-' + k);
                if (el && t[k] !== undefined) el.checked = Boolean(t[k]);
            });
            if (t.tourneyFitWholeBracket !== undefined) {
                setTourneyFitWholeBracket(Boolean(t.tourneyFitWholeBracket));
            }
        }
    } catch { /* ignore parse error */ } finally {
        setIsRestoringVersusPrefs(false);
        updateAssetFontBadges();
    }
}

export async function populateFontDatalist() {
    const list = $('overlay-fonts-list');
    if (!list) return;

    let fontEntries = [];
    try {
        if (window.OverlayFonts && typeof window.OverlayFonts.getDeduplicatedFontFamilies === 'function') {
            fontEntries = await window.OverlayFonts.getDeduplicatedFontFamilies();
        } else if (window.OverlayFonts && typeof window.OverlayFonts.getAssetFonts === 'function') {
            const assets = await window.OverlayFonts.getAssetFonts();
            fontEntries = (Array.isArray(assets) ? assets : []).map(a => ({
                name: (a.family || a.label || a.name || '').replace(/['"]/g, '').trim(),
                source: 'asset',
                raw: a
            }));
        }
    } catch {
        fontEntries = [];
    }

    setCachedAssetFontsList(fontEntries.filter(e => e.source === 'asset' && e.raw).map(e => e.raw));

    list.innerHTML = '';
    fontEntries.forEach(entry => {
        if (!entry.name) return;
        const opt = document.createElement('option');
        opt.value = entry.name;
        list.appendChild(opt);

        // Pre-register @font-face for uploaded asset fonts
        if (entry.source === 'asset' && entry.raw?.url) {
            if (typeof FontFace !== 'undefined' && document.fonts) {
                try {
                    const ff = new FontFace(entry.name, `url("${entry.raw.url.replace(/"/g, '%22')}")`);
                    ff.load().then(loaded => document.fonts.add(loaded)).catch(() => {});
                } catch {}
            }
            const style = document.createElement('style');
            style.textContent = `@font-face { font-family: '${entry.name}'; src: url('${entry.raw.url}'); font-display: swap; }`;
            document.head.appendChild(style);
        }
    });

    updateAssetFontBadges();
}

export function onFontInput(target) {
    if (target === 'matchup' || target === 'matchup-heading') updateMatchupOverlayUrl();
    else updateTourneyOverlayUrl();
    updateAssetFontBadges();
}

export function updateAssetFontBadges() {
    const assetNames = (cachedAssetFontsList || []).map(a => (a.family || a.label || (a.name ? a.name.replace(/\.[a-z0-9]+$/i, '') : '')).trim().toLowerCase());
    const mhVal = $('matchup-opt-heading-font')?.value?.trim().toLowerCase();
    const mVal = $('matchup-opt-font')?.value?.trim().toLowerCase();
    const thVal = $('tourney-opt-heading-font')?.value?.trim().toLowerCase();
    const tVal = $('tourney-opt-font')?.value?.trim().toLowerCase();
    if ($('matchup-heading-font-asset-badge')) {
        $('matchup-heading-font-asset-badge').style.display = mhVal && assetNames.includes(mhVal) ? 'inline-block' : 'none';
    }
    if ($('matchup-font-asset-badge')) {
        $('matchup-font-asset-badge').style.display = mVal && assetNames.includes(mVal) ? 'inline-block' : 'none';
    }
    if ($('tourney-heading-font-asset-badge')) {
        $('tourney-heading-font-asset-badge').style.display = thVal && assetNames.includes(thVal) ? 'inline-block' : 'none';
    }
    if ($('tourney-font-asset-badge')) {
        $('tourney-font-asset-badge').style.display = tVal && assetNames.includes(tVal) ? 'inline-block' : 'none';
    }
}

export function openAssetFontPicker(target) {
    setActiveFontPickerTarget(target || 'matchup');
    const modal = $('modal-asset-font-picker');
    if (!modal) return;
    renderAssetFontPickerList();
    modal.style.display = 'flex';
}

export function closeAssetFontPicker() {
    const modal = $('modal-asset-font-picker');
    if (modal) modal.style.display = 'none';
}

export async function refreshAssetFontsAndPicker() {
    toast('Refreshing Asset Library fonts...');
    await populateFontDatalist();
    renderAssetFontPickerList();
}

export function renderAssetFontPickerList() {
    const container = $('asset-font-picker-list');
    if (!container) return;

    const fontMap = new Map();
    (cachedAssetFontsList || []).forEach(a => {
        const fam = (a.family || a.label || (a.name ? a.name.replace(/\.[a-z0-9]+$/i, '') : '')).replace(/['"]/g, '').trim();
        if (!fam) return;
        const key = fam.toLowerCase();
        const ext = a.name ? a.name.split('.').pop().toUpperCase() : 'FONT';
        if (!fontMap.has(key)) {
            fontMap.set(key, { family: fam, formats: [ext], asset: a });
        } else {
            const existing = fontMap.get(key);
            if (!existing.formats.includes(ext)) existing.formats.push(ext);
        }
    });

    if (fontMap.size === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 2.5rem 1rem; color: var(--text-muted);">
                <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" style="margin-bottom: 0.6rem; opacity: 0.6;"><path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/></svg>
                <div style="font-weight: 700; font-size: 0.95rem; color: var(--text);">No Custom Fonts in Asset Library</div>
                <div style="font-size: 0.78rem; margin-top: 0.35rem; max-width: 380px; margin-inline: auto; line-height: 1.45;">Upload .ttf, .otf, .woff, or .woff2 files in the Asset Library to make them available here for scoreboards and tournament brackets.</div>
                <div style="margin-top: 1.1rem;">
                    <a href="/assets.html" target="_blank" rel="noopener noreferrer" class="btn-primary btn-sm" style="text-decoration: none; display: inline-flex; align-items: center; gap: 0.35rem; font-size: 0.78rem; padding: 0.35rem 0.75rem;">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                        Open Asset Library
                    </a>
                </div>
            </div>
        `;
        return;
    }

    container.innerHTML = Array.from(fontMap.values()).map(f => {
        const fam = f.family;
        const safeFam = fam.replace(/'/g, '');
        const formatBadges = f.formats.map(fmt => `<span class="badge" style="background: var(--bg-card); border: 1px solid var(--border); font-size: 0.65rem; padding: 0.1rem 0.35rem; border-radius: 3px; color: var(--text-muted); text-transform: uppercase;">${escapeHtml(fmt)}</span>`).join(' ');
        return `
            <div style="background: var(--bg-surface); border: 1px solid var(--border); border-radius: 8px; padding: 0.85rem 1rem; display: flex; flex-direction: column; gap: 0.5rem;">
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;">
                    <div style="display: flex; align-items: center; gap: 0.5rem; min-width: 0;">
                        <span style="font-weight: 700; font-size: 0.88rem; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(fam)}</span>
                        ${formatBadges}
                    </div>
                    <button type="button" class="btn-primary btn-sm" onclick="selectAssetFont('${escapeHtml(fam)}')" style="font-size: 0.72rem; padding: 0.22rem 0.6rem; display: inline-flex; align-items: center; gap: 0.3rem; white-space: nowrap;">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                        Select Font
                    </button>
                </div>
                <div style="font-family: '${safeFam}', sans-serif; font-size: 1.15rem; color: var(--text); padding: 0.4rem 0.6rem; background: var(--bg-card); border-radius: 4px; border: 1px solid var(--border); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; letter-spacing: 0.02em;">
                    DAIGO 4 - 3 JUSTIN WONG • GRAND FINALS 2026
                </div>
            </div>
        `;
    }).join('');
}

export function selectAssetFont(fam) {
    const targetMap = {
        'matchup': 'matchup-opt-font',
        'matchup-heading': 'matchup-opt-heading-font',
        'tourney': 'tourney-opt-font',
        'tourney-heading': 'tourney-opt-heading-font'
    };
    const inputId = targetMap[activeFontPickerTarget] || 'tourney-opt-font';
    const input = $(inputId);
    if (input) {
        input.value = fam;
        if (activeFontPickerTarget && activeFontPickerTarget.startsWith('matchup')) updateMatchupOverlayUrl();
        else updateTourneyOverlayUrl();
        updateAssetFontBadges();
    }
    closeAssetFontPicker();
    toast(`Applied font "${fam}" from Asset Library!`);
}

export const BUILT_IN_THEME_OPTIONS = [
    { id: 'card', name: 'Dark Card' },
    { id: 'fgc-evo', name: 'EVO Championship' },
    { id: 'championship', name: 'Championship Gold' },
    { id: 'cyber', name: 'Cyberpunk Neon' },
    { id: 'clean-light', name: 'Clean Light Contrast' },
    { id: 'minimal-dark', name: 'OLED Deep Black' },
    { id: 'glass', name: 'Frosted Glass' },
    { id: 'solid', name: 'Opaque Solid' },
    { id: 'transparent', name: 'Transparent / Clean' },
    { id: 'pill', name: 'Pill Capsule' },
    { id: 'border', name: 'Border Framing' },
    { id: 'retro', name: 'Retro Arcade' },
    { id: 'ember', name: 'Ember' },
    { id: 'aurora', name: 'Aurora' },
    { id: 'ocean', name: 'Ocean' },
    { id: 'sunset', name: 'Sunset' },
    { id: 'violet', name: 'Violet' },
    { id: 'forest', name: 'Forest' }
];

export function populateThemeDropdowns() {
    const customThemes = window.OverlayThemes ? window.OverlayThemes.getCustomThemes() : {};
    const customList = Object.values(customThemes);

    const updateSelect = (selectEl, isMatchup) => {
        if (!selectEl) return;
        const currentVal = selectEl.value;
        selectEl.innerHTML = '';

        const builtInGroup = document.createElement('optgroup');
        builtInGroup.label = 'Built-in Themes';
        BUILT_IN_THEME_OPTIONS.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t.id;
            opt.textContent = isMatchup ? `${t.name} (?overlay=${t.id})` : t.name;
            builtInGroup.appendChild(opt);
        });
        selectEl.appendChild(builtInGroup);

        if (customList.length > 0) {
            const customGroup = document.createElement('optgroup');
            customGroup.label = 'Custom Saved Themes';
            customList.forEach(t => {
                const opt = document.createElement('option');
                opt.value = t.id;
                opt.textContent = `${t.name || t.id} (Custom)`;
                customGroup.appendChild(opt);
            });
            selectEl.appendChild(customGroup);
        }

        if (currentVal) selectEl.value = currentVal;
    };

    updateSelect($('matchup-opt-theme'), true);
    updateSelect($('prev-ctrl-theme'), false);
    updateSelect($('tourney-opt-theme'), false);
    updateSelect($('prev-ctrl-tourney-theme'), false);
}

export function onThemeSelectChange(target, val) {
    if (window.OverlayThemes) {
        const theme = window.OverlayThemes.getTheme(val);
        if (theme && theme.isCustom) {
            applyThemeToInputs(target, theme);
        }
    }
    if (target === 'matchup') updateMatchupOverlayUrl();
    else updateTourneyOverlayUrl();
}

export function applyThemeToInputs(target, theme) {
    if (!theme) return;
    const prefix = target === 'matchup' ? 'matchup-opt-' : 'tourney-opt-';
    if ((theme.headingFont !== undefined || theme.headingfont !== undefined) && $(prefix + 'heading-font')) {
        $(prefix + 'heading-font').value = theme.headingFont || theme.headingfont || '';
    }
    if (theme.font !== undefined && $(prefix + 'font')) $(prefix + 'font').value = theme.font;
    if (theme.weight !== undefined && $(prefix + 'weight')) $(prefix + 'weight').value = theme.weight;
    if (theme.textTransform !== undefined && $(prefix + 'transform')) $(prefix + 'transform').value = theme.textTransform;
    if (theme.radius !== undefined && $(prefix + 'radius')) $(prefix + 'radius').value = theme.radius;
    if (target === 'tourney' && theme.radius !== undefined) {
        if ($('tourney-opt-radius-layout')) $('tourney-opt-radius-layout').value = theme.radius;
        if ($('prev-ctrl-tourney-radius')) $('prev-ctrl-tourney-radius').value = theme.radius;
    }
    if (theme.outline !== undefined && $(prefix + 'outline')) $(prefix + 'outline').value = theme.outline;
    if (theme.scale !== undefined && $(prefix + 'scale')) $(prefix + 'scale').value = theme.scale;

    const colors = ['cardbg', 'bg', 'border', 'text', 'muted', 'accent', 'winner', 'badgecolor', 'p1color', 'p2color'];
    colors.forEach(c => {
        let val;
        if (c === 'cardbg') val = theme.cardBg !== undefined ? theme.cardBg : theme.cardbg;
        else if (c === 'badgecolor') val = theme.badgeColor !== undefined ? theme.badgeColor : theme.badgecolor;
        else if (c === 'p1color') val = theme.p1Color !== undefined ? theme.p1Color : theme.p1color;
        else if (c === 'p2color') val = theme.p2Color !== undefined ? theme.p2Color : theme.p2color;
        else val = theme[c];
        const el = $(prefix + c);
        if (el && val !== undefined) {
            el.value = val;
            syncColorPicker(prefix + c, prefix + c + '-picker');
        }
    });
}

export function openSaveThemeModal(target) {
    setActiveThemeModalTarget(target || 'matchup');
    const modal = $('modal-save-theme');
    const nameInput = $('save-theme-name');
    const summary = $('save-theme-preview-summary');
    if (!modal) return;
    if (nameInput) nameInput.value = '';

    const prefix = activeThemeModalTarget === 'matchup' ? 'matchup-opt-' : 'tourney-opt-';
    const font = $(prefix + 'font')?.value || 'Theme Default';
    const weight = $(prefix + 'weight')?.value || 'Theme Default';
    const radius = $(prefix + 'radius')?.value || 'Theme Default';
    const accent = $(prefix + 'accent')?.value || '#58a6ff';
    const cardbg = $(prefix + 'cardbg')?.value || '#161b22';
    const border = $(prefix + 'border')?.value || '#30363d';
    const text = $(prefix + 'text')?.value || '#f0f6fc';

    if (summary) {
        summary.innerHTML = `
            <div style="display: flex; flex-wrap: wrap; gap: 0.4rem; font-size: 0.72rem;">
                <span class="badge" style="background: var(--bg-surface); border: 1px solid var(--border); padding: 0.2rem 0.5rem; border-radius: 4px;">Font: <strong>${escapeHtml(font)}</strong></span>
                <span class="badge" style="background: var(--bg-surface); border: 1px solid var(--border); padding: 0.2rem 0.5rem; border-radius: 4px;">Weight: <strong>${escapeHtml(weight)}</strong></span>
                <span class="badge" style="background: var(--bg-surface); border: 1px solid var(--border); padding: 0.2rem 0.5rem; border-radius: 4px;">Radius: <strong>${escapeHtml(radius)}</strong></span>
            </div>
            <div style="display: flex; align-items: center; gap: 0.5rem; margin-top: 0.5rem; font-size: 0.72rem;">
                <span style="display: inline-flex; align-items: center; gap: 0.25rem;"><span style="width: 12px; height: 12px; border-radius: 2px; background: ${escapeHtml(accent)}; display: inline-block; border: 1px solid rgba(255,255,255,0.2);"></span> Accent</span>
                <span style="display: inline-flex; align-items: center; gap: 0.25rem;"><span style="width: 12px; height: 12px; border-radius: 2px; background: ${escapeHtml(cardbg)}; display: inline-block; border: 1px solid rgba(255,255,255,0.2);"></span> Card</span>
                <span style="display: inline-flex; align-items: center; gap: 0.25rem;"><span style="width: 12px; height: 12px; border-radius: 2px; background: ${escapeHtml(border)}; display: inline-block; border: 1px solid rgba(255,255,255,0.2);"></span> Border</span>
                <span style="display: inline-flex; align-items: center; gap: 0.25rem;"><span style="width: 12px; height: 12px; border-radius: 2px; background: ${escapeHtml(text)}; display: inline-block; border: 1px solid rgba(255,255,255,0.2);"></span> Text</span>
            </div>
        `;
    }

    modal.style.display = 'flex';
    setTimeout(() => nameInput?.focus(), 50);
}

export function closeSaveThemeModal() {
    const modal = $('modal-save-theme');
    if (modal) modal.style.display = 'none';
}

export function submitSaveTheme(e) {
    if (e && e.preventDefault) e.preventDefault();
    const nameInput = $('save-theme-name');
    const name = nameInput ? nameInput.value.trim() : '';
    if (!name) return;

    const prefix = activeThemeModalTarget === 'matchup' ? 'matchup-opt-' : 'tourney-opt-';
    const themeObj = {
        name,
        headingFont: $(prefix + 'heading-font')?.value?.trim() || '',
        font: $(prefix + 'font')?.value?.trim() || '',
        weight: $(prefix + 'weight')?.value?.trim() || '',
        textTransform: $(prefix + 'transform')?.value?.trim() || '',
        radius: $(prefix + 'radius')?.value?.trim() || '',
        outline: $(prefix + 'outline')?.value?.trim() || '',
        scale: $(prefix + 'scale')?.value?.trim() || '',
        text: $(prefix + 'text')?.value?.trim() || '',
        muted: $(prefix + 'muted')?.value?.trim() || '',
        cardBg: $(prefix + 'cardbg')?.value?.trim() || '',
        bg: $(prefix + 'bg')?.value?.trim() || '',
        border: $(prefix + 'border')?.value?.trim() || '',
        accent: $(prefix + 'accent')?.value?.trim() || '',
        badgecolor: $(prefix + 'badgecolor')?.value?.trim() || '',
        p1color: $(prefix + 'p1color')?.value?.trim() || '',
        p2color: $(prefix + 'p2color')?.value?.trim() || '',
        winner: $(prefix + 'winner')?.value?.trim() || ''
    };

    if (window.OverlayThemes) {
        const saved = window.OverlayThemes.saveCustomTheme(themeObj);
        populateThemeDropdowns();
        const selectId = activeThemeModalTarget === 'matchup' ? 'matchup-opt-theme' : 'tourney-opt-theme';
        if ($(selectId) && saved) {
            $(selectId).value = saved.id;
        }
        closeSaveThemeModal();
        if (activeThemeModalTarget === 'matchup') updateMatchupOverlayUrl();
        else updateTourneyOverlayUrl();
        toast(`Custom theme "${name}" saved!`);
    }
}

export function openManageThemesModal() {
    const modal = $('modal-manage-themes');
    if (!modal) return;
    renderManageThemesList();
    modal.style.display = 'flex';
}

export function closeManageThemesModal() {
    const modal = $('modal-manage-themes');
    if (modal) modal.style.display = 'none';
}

export function renderManageThemesList() {
    const container = $('manage-themes-list');
    if (!container) return;
    const themes = window.OverlayThemes ? window.OverlayThemes.getCustomThemes() : {};
    const list = Object.values(themes);

    if (list.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 2.5rem 1rem; color: var(--text-muted);">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom: 0.5rem; opacity: 0.6;"><circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>
                <div style="font-weight: 600; font-size: 0.9rem; color: var(--text);">No Custom Themes Saved</div>
                <div style="font-size: 0.78rem; margin-top: 0.35rem; max-width: 360px; margin-inline: auto;">Customize typography, fonts, and colors in the Matchup or Tournament controls, then click "Save Theme" to save your custom design.</div>
            </div>
        `;
        return;
    }

    container.innerHTML = list.map(t => {
        const font = t.font || 'Default';
        const weight = t.weight ? `(${t.weight})` : '';
        const radius = t.radius || 'Default radius';
        return `
            <div style="background: var(--bg-surface); border: 1px solid var(--border); border-radius: 8px; padding: 0.85rem 1rem; display: flex; align-items: center; justify-content: space-between; gap: 0.75rem;">
                <div style="display: flex; flex-direction: column; gap: 0.25rem;">
                    <div style="font-weight: 700; font-size: 0.88rem; color: var(--text);">${escapeHtml(t.name || t.id)}</div>
                    <div style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.72rem; color: var(--text-muted);">
                        <span>${escapeHtml(font)} ${escapeHtml(weight)}</span>
                        <span>•</span>
                        <span>${escapeHtml(radius)}</span>
                        <div style="display: inline-flex; align-items: center; gap: 0.2rem; margin-left: 0.25rem;">
                            ${t.accent ? `<span style="width: 10px; height: 10px; border-radius: 2px; background: ${escapeHtml(t.accent)}; display: inline-block; border: 1px solid rgba(255,255,255,0.2);" title="Accent: ${escapeHtml(t.accent)}"></span>` : ''}
                            ${t.cardBg ? `<span style="width: 10px; height: 10px; border-radius: 2px; background: ${escapeHtml(t.cardBg)}; display: inline-block; border: 1px solid rgba(255,255,255,0.2);" title="Card: ${escapeHtml(t.cardBg)}"></span>` : ''}
                            ${t.border ? `<span style="width: 10px; height: 10px; border-radius: 2px; background: ${escapeHtml(t.border)}; display: inline-block; border: 1px solid rgba(255,255,255,0.2);" title="Border: ${escapeHtml(t.border)}"></span>` : ''}
                            ${t.text ? `<span style="width: 10px; height: 10px; border-radius: 2px; background: ${escapeHtml(t.text)}; display: inline-block; border: 1px solid rgba(255,255,255,0.2);" title="Text: ${escapeHtml(t.text)}"></span>` : ''}
                        </div>
                    </div>
                </div>
                <div style="display: flex; align-items: center; gap: 0.4rem;">
                    <button type="button" class="btn-secondary btn-sm" onclick="applyCustomThemeToActive('${escapeHtml(t.id)}', 'matchup')" title="Load into Matchup Overlay" style="font-size: 0.72rem; padding: 0.25rem 0.5rem; display: inline-flex; align-items: center; gap: 0.25rem;">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>
                        Matchup
                    </button>
                    <button type="button" class="btn-secondary btn-sm" onclick="applyCustomThemeToActive('${escapeHtml(t.id)}', 'tourney')" title="Load into Tournament Bracket" style="font-size: 0.72rem; padding: 0.25rem 0.5rem; display: inline-flex; align-items: center; gap: 0.25rem;">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>
                        Bracket
                    </button>
                    <button type="button" class="btn-danger btn-sm" onclick="deleteCustomThemeAndRefresh('${escapeHtml(t.id)}')" title="Delete Theme" style="font-size: 0.72rem; padding: 0.25rem 0.45rem; display: inline-flex; align-items: center;">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

export function applyCustomThemeToActive(themeId, target) {
    if (!window.OverlayThemes) return;
    const theme = window.OverlayThemes.getTheme(themeId);
    if (!theme) return;
    applyThemeToInputs(target, theme);
    const selectId = target === 'matchup' ? 'matchup-opt-theme' : 'tourney-opt-theme';
    if ($(selectId)) $(selectId).value = themeId;
    if (target === 'matchup') updateMatchupOverlayUrl();
    else updateTourneyOverlayUrl();
    toast(`Theme "${theme.name || themeId}" applied to ${target === 'matchup' ? 'Matchup' : 'Tournament Bracket'}!`);
}

export function deleteCustomThemeAndRefresh(themeId) {
    if (!window.OverlayThemes) return;
    if (!confirm('Are you sure you want to delete this custom theme?')) return;
    window.OverlayThemes.deleteCustomTheme(themeId);
    populateThemeDropdowns();
    renderManageThemesList();
    toast('Custom theme deleted');
}

export function copyUrl(inputId, btn) {
    const input = $(inputId);
    navigator.clipboard.writeText(input.value).then(() => {
        const prev = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = prev; }, 1500);
    });
}

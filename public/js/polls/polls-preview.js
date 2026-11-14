/**
 * StreamPulse Poll Studio — Live Preview & Theming Manager
 */

import {
    $,
    esc,
    escapeHtml,
    toast,
    activePollData,
    selectedDuration,
    BUILT_IN_THEME_OPTIONS
} from './polls-state.js';

export let previewMode = 'poll';
export function setPreviewModeState(val) { previewMode = val; if (typeof window !== 'undefined') window.previewMode = val; }

export let activeThemeModalTarget = 'tourney';
export let activeFontPickerTarget = 'tourney';
export let cachedAssetFontsList = [];

function postPreviewParams(iframeEl, msgType, previewParams, defaultBaseSrc) {
            if (!iframeEl) return;
            const qs = previewParams instanceof URLSearchParams ? previewParams.toString() : String(previewParams || '');
            iframeEl.dataset.pendingPreviewType = msgType;
            iframeEl.dataset.pendingPreviewParams = qs;
            if (!iframeEl.dataset.previewMessageBound) {
                iframeEl.dataset.previewMessageBound = '1';
                iframeEl.addEventListener('load', () => {
                    try {
                        const pendingType = iframeEl.dataset.pendingPreviewType;
                        const pendingQs = iframeEl.dataset.pendingPreviewParams || '';
                        if (pendingType && iframeEl.contentWindow) {
                            iframeEl.contentWindow.postMessage({ type: pendingType, params: pendingQs }, window.location.origin);
                        }
                    } catch {}
                });
            }
            const currentAttr = iframeEl.getAttribute('src') || '';
            if (!currentAttr && defaultBaseSrc) {
                iframeEl.src = `${defaultBaseSrc}${qs ? `?${qs}` : ''}`;
                return;
            }
            try {
                if (iframeEl.contentWindow) {
                    iframeEl.contentWindow.postMessage({ type: msgType, params: qs }, window.location.origin);
                }
            } catch {}
        }

function resetContainerControlsToDefaults(containerId) {
            const container = $(containerId);
            if (!container) return;
            container.querySelectorAll('input, select, textarea').forEach(el => {
                if (el.readOnly) return;
                if (el.type === 'checkbox' || el.type === 'radio') {
                    el.checked = el.defaultChecked;
                } else if (el.tagName === 'SELECT') {
                    const opts = Array.from(el.options || []);
                    const defIdx = opts.findIndex(o => o.defaultSelected);
                    el.selectedIndex = defIdx >= 0 ? defIdx : 0;
                } else {
                    el.value = el.defaultValue;
                }
            });
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

            cachedAssetFontsList = fontEntries.filter(e => e.source === 'asset' && e.raw).map(e => e.raw);

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
            if (target === 'poll' || target === 'poll-heading') updatePollOverlayUrl();
            else updateTourneyOverlayUrl();
            updateAssetFontBadges();
        }

export function updateAssetFontBadges() {
            const assetNames = (cachedAssetFontsList || []).map(a => (a.family || a.label || (a.name ? a.name.replace(/\.[a-z0-9]+$/i, '') : '')).trim().toLowerCase());
            const phVal = $('poll-opt-heading-font')?.value?.trim().toLowerCase();
            const pVal = $('poll-opt-font')?.value?.trim().toLowerCase();
            const thVal = $('tourney-opt-heading-font')?.value?.trim().toLowerCase();
            const tVal = $('tourney-opt-font')?.value?.trim().toLowerCase();
            if ($('poll-heading-font-asset-badge')) {
                $('poll-heading-font-asset-badge').style.display = phVal && assetNames.includes(phVal) ? 'inline-block' : 'none';
            }
            if ($('poll-font-asset-badge')) {
                $('poll-font-asset-badge').style.display = pVal && assetNames.includes(pVal) ? 'inline-block' : 'none';
            }
            if ($('tourney-heading-font-asset-badge')) {
                $('tourney-heading-font-asset-badge').style.display = thVal && assetNames.includes(thVal) ? 'inline-block' : 'none';
            }
            if ($('tourney-font-asset-badge')) {
                $('tourney-font-asset-badge').style.display = tVal && assetNames.includes(tVal) ? 'inline-block' : 'none';
            }
        }

export function openAssetFontPicker(target) {
            activeFontPickerTarget = target || 'tourney';
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

            // Group uploaded font assets by normalized family name to prevent duplicate cards
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
                        <div style="font-size: 0.78rem; margin-top: 0.35rem; max-width: 380px; margin-inline: auto; line-height: 1.45;">Upload .ttf, .otf, .woff, or .woff2 files in the Asset Library to make them available here for live polls and tournament brackets.</div>
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

            const specimenText = activeFontPickerTarget === 'poll'
                ? 'WHICH GAME NEXT? • CHRONO TRIGGER 64% - 36% FINAL'
                : 'OPTION A 64% - 36% OPTION B • CHAMPIONSHIP FINALS';

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
                            ${escapeHtml(specimenText)}
                        </div>
                    </div>
                `;
            }).join('');
        }

export function selectAssetFont(fam) {
            const targetMap = {
                'poll': 'poll-opt-font',
                'poll-heading': 'poll-opt-heading-font',
                'tourney': 'tourney-opt-font',
                'tourney-heading': 'tourney-opt-heading-font'
            };
            const inputId = targetMap[activeFontPickerTarget] || 'tourney-opt-font';
            const input = $(inputId);
            if (input) {
                input.value = fam;
                if (activeFontPickerTarget && activeFontPickerTarget.startsWith('poll')) updatePollOverlayUrl();
                else updateTourneyOverlayUrl();
                updateAssetFontBadges();
            }
            closeAssetFontPicker();
            toast(`Applied font "${fam}" from Asset Library!`);
        }

export function populateThemeDropdowns() {
            const customThemes = window.OverlayThemes ? window.OverlayThemes.getCustomThemes() : {};
            const customList = Object.values(customThemes);

            const updateSelect = (selectEl, isPoll) => {
                if (!selectEl) return;
                const currentVal = selectEl.value;
                selectEl.innerHTML = '';

                const builtInGroup = document.createElement('optgroup');
                builtInGroup.label = 'Built-in Themes';
                BUILT_IN_THEME_OPTIONS.forEach(t => {
                    const opt = document.createElement('option');
                    opt.value = t.id;
                    opt.textContent = isPoll ? `${t.name} (?overlay=${t.id})` : t.name;
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

            updateSelect($('poll-opt-theme'), true);
            updateSelect($('tourney-opt-theme'), false);
        }

export function onThemeSelectChange(target, val) {
            if (window.OverlayThemes) {
                const theme = window.OverlayThemes.getTheme(val);
                if (theme && theme.isCustom) {
                    applyThemeToInputs(target, theme);
                }
            }
            if (target === 'poll') updatePollOverlayUrl();
            else updateTourneyOverlayUrl();
        }

export function applyThemeToInputs(target, theme) {
            if (!theme) return;
            const prefix = target === 'poll' ? 'poll-opt-' : 'tourney-opt-';
            if ((theme.headingFont !== undefined || theme.headingfont !== undefined) && $(prefix + 'heading-font')) {
                $(prefix + 'heading-font').value = theme.headingFont || theme.headingfont || '';
            }
            if (theme.font !== undefined && $(prefix + 'font')) $(prefix + 'font').value = theme.font;
            if (theme.weight !== undefined && $(prefix + 'weight')) $(prefix + 'weight').value = theme.weight;
            if (theme.textTransform !== undefined && $(prefix + 'transform')) $(prefix + 'transform').value = theme.textTransform;
            if (theme.radius !== undefined && $(prefix + 'radius')) $(prefix + 'radius').value = theme.radius;
            if (target === 'tourney' && theme.radius !== undefined && $('tourney-opt-radius-layout')) {
                $('tourney-opt-radius-layout').value = theme.radius;
            }
            if (theme.outline !== undefined && $(prefix + 'outline')) $(prefix + 'outline').value = theme.outline;
            if (theme.scale !== undefined && $(prefix + 'scale')) $(prefix + 'scale').value = theme.scale;

            const colors = ['cardbg', 'bg', 'border', 'text', 'muted', 'accent', 'winner', 'track', 'badgecolor', 'p1color', 'p2color'];
            colors.forEach(c => {
                const val = theme[c === 'cardbg' ? 'cardBg' : c];
                const el = $(prefix + c);
                if (el && val !== undefined) {
                    el.value = val;
                    syncColorPicker(prefix + c, prefix + c + '-picker');
                }
            });
        }

export function openSaveThemeModal(target) {
            activeThemeModalTarget = target || 'tourney';
            const modal = $('modal-save-theme');
            const nameInput = $('save-theme-name');
            const summary = $('save-theme-preview-summary');
            if (!modal) return;
            if (nameInput) nameInput.value = '';

            const prefix = activeThemeModalTarget === 'poll' ? 'poll-opt-' : 'tourney-opt-';
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

            const prefix = activeThemeModalTarget === 'poll' ? 'poll-opt-' : 'tourney-opt-';
            const themeObj = {
                name,
                headingfont: $(prefix + 'heading-font')?.value?.trim() || '',
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
                winner: $(prefix + 'winner')?.value?.trim() || '',
                track: $(prefix + 'track')?.value?.trim() || '',
                badgecolor: $(prefix + 'badgecolor')?.value?.trim() || '',
                p1color: $(prefix + 'p1color')?.value?.trim() || '',
                p2color: $(prefix + 'p2color')?.value?.trim() || ''
            };

            if (window.OverlayThemes) {
                const saved = window.OverlayThemes.saveCustomTheme(themeObj);
                populateThemeDropdowns();
                const selectId = activeThemeModalTarget === 'poll' ? 'poll-opt-theme' : 'tourney-opt-theme';
                if ($(selectId) && saved) {
                    $(selectId).value = saved.id;
                }
                closeSaveThemeModal();
                if (activeThemeModalTarget === 'poll') updatePollOverlayUrl();
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
                        <div style="font-size: 0.78rem; margin-top: 0.35rem; max-width: 360px; margin-inline: auto;">Customize typography, fonts, and colors in the Poll or Tournament controls, then click "Save Theme" to save your custom design.</div>
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
                            <button type="button" class="btn-secondary btn-sm" onclick="applyCustomThemeToActive('${escapeHtml(t.id)}', 'poll')" title="Load into Live Poll Overlay" style="font-size: 0.72rem; padding: 0.25rem 0.5rem; display: inline-flex; align-items: center; gap: 0.25rem;">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>
                                Poll
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
            const selectId = target === 'poll' ? 'poll-opt-theme' : 'tourney-opt-theme';
            if ($(selectId)) $(selectId).value = themeId;
            if (target === 'poll') updatePollOverlayUrl();
            else updateTourneyOverlayUrl();
            toast(`Theme "${theme.name || themeId}" applied to ${target === 'poll' ? 'Poll' : 'Tournament Bracket'}!`);
        }

export function deleteCustomThemeAndRefresh(themeId) {
            if (!window.OverlayThemes) return;
            if (!confirm('Are you sure you want to delete this custom theme?')) return;
            window.OverlayThemes.deleteCustomTheme(themeId);
            populateThemeDropdowns();
            renderManageThemesList();
            toast('Custom theme deleted');
        }

export function syncColorPicker(textId, pickerId) {
            const val = $(textId)?.value?.trim();
            if (/^#[0-9a-fA-F]{6}$/.test(val) && $(pickerId)) {
                $(pickerId).value = val;
            }
        }

        const POLLS_OVERLAY_PREFS_KEY = 'streampulse_polls_overlay_prefs';
        let isRestoringPollsPrefs = false;

export function savePollsOverlayPrefs() {
            if (isRestoringPollsPrefs) return;
            try {
                const prefs = {
                    preview: {
                        mode: previewMode,
                    },
                    poll: {
                        theme: $('poll-opt-theme')?.value,
                        headingfont: $('poll-opt-heading-font')?.value,
                        font: $('poll-opt-font')?.value,
                        scale: $('poll-opt-scale')?.value,
                        weight: $('poll-opt-weight')?.value,
                        transform: $('poll-opt-transform')?.value,
                        radius: $('poll-opt-radius')?.value,
                        outline: $('poll-opt-outline')?.value,
                        align: $('poll-opt-align')?.value,
                        valign: $('poll-opt-valign')?.value,
                        text: $('poll-opt-text')?.value,
                        muted: $('poll-opt-muted')?.value,
                        cardbg: $('poll-opt-cardbg')?.value,
                        border: $('poll-opt-border')?.value,
                        accent: $('poll-opt-accent')?.value,
                        winner: $('poll-opt-winner')?.value,
                        track: $('poll-opt-track')?.value,
                        howtovote: $('poll-opt-howtovote')?.checked,
                        confetti: $('poll-opt-confetti')?.checked,
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
                        spacing: $('tourney-opt-spacing')?.value,
                        lines: $('tourney-opt-lines')?.value,
                        pipstyle: $('tourney-opt-pipstyle')?.value,
                        roundpipstyle: $('tourney-opt-roundpipstyle')?.value,
                        gap: $('tourney-opt-gap')?.value,
                        text: $('tourney-opt-text')?.value,
                        muted: $('tourney-opt-muted')?.value,
                        cardbg: $('tourney-opt-cardbg')?.value,
                        bg: $('tourney-opt-bg')?.value,
                        border: $('tourney-opt-border')?.value,
                        accent: $('tourney-opt-accent')?.value,
                        winner: $('tourney-opt-winner')?.value,
                        badgecolor: $('tourney-opt-badgecolor')?.value,
                        p1color: $('tourney-opt-p1color')?.value,
                        p2color: $('tourney-opt-p2color')?.value,
                        logosize: $('tourney-opt-logosize')?.value,
                        showlogo: $('tourney-opt-showlogo')?.checked,
                        highlight: $('tourney-opt-highlight')?.checked,
                        center: $('tourney-opt-center')?.checked,
                        title: $('tourney-opt-title')?.checked,
                        format: $('tourney-opt-format')?.checked,
                        mode: $('tourney-opt-mode')?.checked,
                        entrants: $('tourney-opt-entrants')?.checked,
                        status: $('tourney-opt-status')?.checked,
                        rounds: $('tourney-opt-rounds')?.checked,
                        scores: $('tourney-opt-scores')?.checked,
                        seeds: $('tourney-opt-seeds')?.checked,
                        tags: $('tourney-opt-tags')?.checked,
                        badges: $('tourney-opt-badges')?.checked,
                        champion: $('tourney-opt-champion')?.checked,
                        confetti: $('tourney-opt-confetti')?.checked,
                        fit: $('tourney-opt-fit')?.checked,
                        wide: $('tourney-opt-wide')?.checked,
                    }
                };
                localStorage.setItem(POLLS_OVERLAY_PREFS_KEY, JSON.stringify(prefs));
            } catch { /* ignore storage errors */ }
        }

export function restorePollsOverlayPrefs() {
            try {
                const raw = localStorage.getItem(POLLS_OVERLAY_PREFS_KEY);
                const prefs = raw ? JSON.parse(raw) : {};
                isRestoringPollsPrefs = true;

                const savedMode = prefs.preview?.mode || localStorage.getItem('polls-overlay-preview-mode');
                if (savedMode && ['poll', 'tree', 'active'].includes(savedMode)) {
                    previewMode = savedMode;
                }

                if (prefs.poll) {
                    const p = prefs.poll;
                    if (p.theme !== undefined && $('poll-opt-theme')) $('poll-opt-theme').value = p.theme;
                    if (p.headingfont !== undefined && $('poll-opt-heading-font')) $('poll-opt-heading-font').value = p.headingfont;
                    if (p.font !== undefined && $('poll-opt-font')) $('poll-opt-font').value = p.font;
                    if (p.scale !== undefined && $('poll-opt-scale')) $('poll-opt-scale').value = p.scale;
                    if (p.weight !== undefined && $('poll-opt-weight')) $('poll-opt-weight').value = p.weight;
                    if (p.transform !== undefined && $('poll-opt-transform')) $('poll-opt-transform').value = p.transform;
                    if (p.radius !== undefined && $('poll-opt-radius')) $('poll-opt-radius').value = p.radius;
                    if (p.outline !== undefined && $('poll-opt-outline')) $('poll-opt-outline').value = p.outline;
                    if (p.align !== undefined && $('poll-opt-align')) $('poll-opt-align').value = p.align;
                    if (p.valign !== undefined && $('poll-opt-valign')) $('poll-opt-valign').value = p.valign;

                    ['text', 'muted', 'cardbg', 'border', 'accent', 'winner', 'track'].forEach(c => {
                        if (p[c] !== undefined && $('poll-opt-' + c)) {
                            $('poll-opt-' + c).value = p[c];
                            syncColorPicker('poll-opt-' + c, 'poll-opt-' + c + '-picker');
                        }
                    });

                    if (p.howtovote !== undefined && $('poll-opt-howtovote')) $('poll-opt-howtovote').checked = Boolean(p.howtovote);
                    if (p.confetti !== undefined && $('poll-opt-confetti')) $('poll-opt-confetti').checked = Boolean(p.confetti);
                }
                if (prefs.tourney) {
                    const t = prefs.tourney;
                    if (t.layout !== undefined && $('tourney-opt-layout')) $('tourney-opt-layout').value = t.layout;
                    if (['all', 'winners', 'losers', 'finals'].includes(t.bracket) && $('tourney-opt-bracket')) $('tourney-opt-bracket').value = t.bracket;
                    if (t.theme !== undefined && $('tourney-opt-theme')) $('tourney-opt-theme').value = t.theme;
                    if (t.headingfont !== undefined && $('tourney-opt-heading-font')) $('tourney-opt-heading-font').value = t.headingfont;
                    if (t.font !== undefined && $('tourney-opt-font')) $('tourney-opt-font').value = t.font;
                    if (t.scale !== undefined && $('tourney-opt-scale')) $('tourney-opt-scale').value = t.scale;
                    if (t.weight !== undefined && $('tourney-opt-weight')) $('tourney-opt-weight').value = t.weight;
                    if (t.transform !== undefined && $('tourney-opt-transform')) $('tourney-opt-transform').value = t.transform;
                    if (t.radius !== undefined && $('tourney-opt-radius')) $('tourney-opt-radius').value = t.radius;
                    if (t.radius !== undefined && $('tourney-opt-radius-layout')) $('tourney-opt-radius-layout').value = t.radius;
                    if (t.outline !== undefined && $('tourney-opt-outline')) $('tourney-opt-outline').value = t.outline;
                    if (t.spacing !== undefined && $('tourney-opt-spacing')) $('tourney-opt-spacing').value = t.spacing;
                    if (t.lines !== undefined && $('tourney-opt-lines')) $('tourney-opt-lines').value = t.lines;
                    if (t.pipstyle !== undefined && $('tourney-opt-pipstyle')) $('tourney-opt-pipstyle').value = t.pipstyle;
                    if (t.roundpipstyle !== undefined && $('tourney-opt-roundpipstyle')) $('tourney-opt-roundpipstyle').value = t.roundpipstyle;
                    if (t.gap !== undefined && $('tourney-opt-gap')) $('tourney-opt-gap').value = t.gap;

                    ['text', 'muted', 'cardbg', 'bg', 'border', 'accent', 'winner', 'badgecolor', 'p1color', 'p2color'].forEach(c => {
                        if (t[c] !== undefined && $('tourney-opt-' + c)) {
                            $('tourney-opt-' + c).value = t[c];
                            syncColorPicker('tourney-opt-' + c, 'tourney-opt-' + c + '-picker');
                        }
                    });

                    if (t.logosize !== undefined && $('tourney-opt-logosize')) $('tourney-opt-logosize').value = t.logosize;
                    ['showlogo', 'highlight', 'center', 'title', 'format', 'mode', 'entrants', 'status', 'rounds', 'scores', 'seeds', 'tags', 'badges', 'champion', 'confetti', 'fit', 'wide'].forEach(k => {
                        const el = $('tourney-opt-' + k);
                        if (el && t[k] !== undefined) el.checked = Boolean(t[k]);
                    });
                }
            } catch { /* ignore parse error */ } finally {
                isRestoringPollsPrefs = false;
            }
        }

export function updatePollOverlayUrl() {
            const origin = window.location.origin;
            const themeSelect = $('poll-opt-theme');
            if (!themeSelect) return;
            const theme = themeSelect.value || 'card';

            const urlParams = new URLSearchParams();
            if (theme && theme !== 'card') {
                urlParams.set('overlay', theme);
            }

            // Typography & Styling
            const headingFontVal = $('poll-opt-heading-font')?.value?.trim();
            if (headingFontVal) urlParams.set('headingfont', headingFontVal);
            const fontVal = $('poll-opt-font')?.value?.trim();
            if (fontVal) urlParams.set('font', fontVal);

            const scaleVal = $('poll-opt-scale')?.value;
            if (scaleVal && scaleVal !== '1') urlParams.set('fontscale', scaleVal);

            const weightVal = $('poll-opt-weight')?.value;
            if (weightVal) urlParams.set('weight', weightVal);

            const transformVal = $('poll-opt-transform')?.value;
            if (transformVal) urlParams.set('transform', transformVal);

            const radiusVal = $('poll-opt-radius')?.value;
            if (radiusVal) urlParams.set('radius', radiusVal);

            const outlineVal = $('poll-opt-outline')?.value;
            if (outlineVal) urlParams.set('outline', outlineVal);

            // Alignment
            const alignVal = $('poll-opt-align')?.value;
            if (alignVal) urlParams.set('align', alignVal);
            const valignVal = $('poll-opt-valign')?.value;
            if (valignVal) urlParams.set('valign', valignVal);

            // Colors
            const colorKeys = [
                ['text', 'poll-opt-text'],
                ['muted', 'poll-opt-muted'],
                ['cardbg', 'poll-opt-cardbg'],
                ['border', 'poll-opt-border'],
                ['accent', 'poll-opt-accent'],
                ['winner', 'poll-opt-winner'],
                ['track', 'poll-opt-track']
            ];
            colorKeys.forEach(([param, inputId]) => {
                const val = $(inputId)?.value?.trim();
                if (val) urlParams.set(param, val);
            });

            // Toggles
            if ($('poll-opt-howtovote') && $('poll-opt-howtovote').checked) {
                urlParams.set('howtovote', '1');
            } else if ($('poll-opt-howtovote') && !$('poll-opt-howtovote').checked) {
                urlParams.set('howtovote', '0');
            }
            if ($('poll-opt-confetti') && !$('poll-opt-confetti').checked) {
                urlParams.set('confetti', '0');
            }

            const qs = urlParams.toString();
            const fullUrl = `${origin}/overlays/poll.html${qs ? `?${qs}` : ''}`;
            if ($('url-poll-overlay')) $('url-poll-overlay').value = fullUrl;
            if ($('btn-open-poll-overlay')) $('btn-open-poll-overlay').href = fullUrl;

            // Live preview iframe update
            const previewIframe = $('poll-preview-iframe');
            if (previewIframe) {
                const previewParams = new URLSearchParams(urlParams);
                previewParams.set('preview', '1');
                postPreviewParams(previewIframe, 'poll:preview-update', previewParams, '/overlays/poll.html');
            }
            savePollsOverlayPrefs();
        }

export function resetPollOverlayDefaults() {
            resetContainerControlsToDefaults('ov-sec-poll');
            updatePollOverlayUrl();
            updateAssetFontBadges();
            savePollsOverlayPrefs();
            toast('Poll overlay settings reset to defaults');
        }

export function syncPollTourneyRadius(val) {
            if ($('tourney-opt-radius')) $('tourney-opt-radius').value = val;
            if ($('tourney-opt-radius-layout')) $('tourney-opt-radius-layout').value = val;
            updateTourneyOverlayUrl();
        }

export function updateTourneyOverlayUrl() {
            const origin = window.location.origin;
            const layoutSelect = $('tourney-opt-layout');
            const themeSelect = $('tourney-opt-theme');
            const scoresCheck = $('tourney-opt-scores');

            if (!themeSelect) return;
            const theme = themeSelect.value || 'card';

            const urlParams = new URLSearchParams();
            const bracketSelect = $('tourney-opt-bracket');
            if (bracketSelect) {
                const isTree = !layoutSelect || layoutSelect.value !== 'active';
                bracketSelect.disabled = !isTree;
                if (isTree && bracketSelect.value !== 'all') urlParams.set('bracket', bracketSelect.value);
            }
            if (layoutSelect && layoutSelect.value !== 'tree') {
                urlParams.set('layout', layoutSelect.value);
            }
            const tourneyCamera = $('tourney-opt-camera')?.value;
            if (tourneyCamera === '1' || tourneyCamera === '0') urlParams.set('focus', tourneyCamera);
            const tourneyGlide = $('tourney-opt-glide')?.value;
            if (tourneyGlide === '0') urlParams.set('glide', '0');
            const tourneyBadge = $('tourney-opt-badge')?.value;
            if (tourneyBadge === '1') urlParams.set('focusbadge', '1');
            else if (tourneyBadge === '0') urlParams.set('focusbadge', '0');
            if (theme && theme !== 'card') {
                urlParams.set('overlay', theme);
            }

            // Typography & Styling
            const tourneyHeadingFontVal = $('tourney-opt-heading-font')?.value?.trim();
            if (tourneyHeadingFontVal) urlParams.set('headingfont', tourneyHeadingFontVal);
            const fontVal = $('tourney-opt-font')?.value?.trim();
            if (fontVal) urlParams.set('font', fontVal);

            const scaleVal = $('tourney-opt-scale')?.value;
            if (scaleVal && scaleVal !== '1') urlParams.set('scale', scaleVal);

            const weightVal = $('tourney-opt-weight')?.value;
            if (weightVal) urlParams.set('weight', weightVal);

            const transformVal = $('tourney-opt-transform')?.value;
            if (transformVal) urlParams.set('transform', transformVal);

            const radiusVal = $('tourney-opt-radius')?.value;
            if (radiusVal) urlParams.set('radius', radiusVal);

            const outlineVal = $('tourney-opt-outline')?.value;
            if (outlineVal) urlParams.set('outline', outlineVal);

            // Bracket Geometry & Pips
            const spacingEl = $('tourney-opt-spacing'), linesEl = $('tourney-opt-lines');
            if (spacingEl && spacingEl.value !== 'normal') urlParams.set('spacing', spacingEl.value);
            if (linesEl && linesEl.value !== 'glow') urlParams.set('lines', linesEl.value);

            const pipStyleEl = $('tourney-opt-pipstyle');
            if (pipStyleEl && pipStyleEl.value && pipStyleEl.value !== 'circle') urlParams.set('pipstyle', pipStyleEl.value);

            const roundPipStyleEl = $('tourney-opt-roundpipstyle');
            if (roundPipStyleEl && roundPipStyleEl.value && roundPipStyleEl.value !== 'diamond') urlParams.set('roundpipstyle', roundPipStyleEl.value);

            const gapEl = $('tourney-opt-gap');
            if (gapEl && gapEl.value) urlParams.set('gap', gapEl.value);

            // Colors
            const colorKeys = [
                ['text', 'tourney-opt-text'],
                ['muted', 'tourney-opt-muted'],
                ['cardbg', 'tourney-opt-cardbg'],
                ['bg', 'tourney-opt-bg'],
                ['border', 'tourney-opt-border'],
                ['accent', 'tourney-opt-accent'],
                ['winner', 'tourney-opt-winner'],
                ['badgecolor', 'tourney-opt-badgecolor'],
                ['p1color', 'tourney-opt-p1color'],
                ['p2color', 'tourney-opt-p2color']
            ];
            colorKeys.forEach(([param, inputId]) => {
                const val = $(inputId)?.value?.trim();
                if (val) urlParams.set(param, val);
            });

            // Toggles
            if ($('tourney-opt-highlight') && !$('tourney-opt-highlight').checked) urlParams.set('highlight', '0');
            if ($('tourney-opt-center') && !$('tourney-opt-center').checked) urlParams.set('center', '0');
            if ($('tourney-opt-title') && !$('tourney-opt-title').checked) urlParams.set('showtitle', '0');
            if ($('tourney-opt-format') && !$('tourney-opt-format').checked) urlParams.set('showformat', '0');
            if ($('tourney-opt-mode') && !$('tourney-opt-mode').checked) urlParams.set('showmode', '0');
            if ($('tourney-opt-entrants') && !$('tourney-opt-entrants').checked) urlParams.set('showentrants', '0');
            if ($('tourney-opt-status') && !$('tourney-opt-status').checked) urlParams.set('showstatus', '0');
            if ($('tourney-opt-rounds') && !$('tourney-opt-rounds').checked) urlParams.set('showrounds', '0');
            if (scoresCheck && !scoresCheck.checked) urlParams.set('showscores', '0');
            if ($('tourney-opt-seeds') && !$('tourney-opt-seeds').checked) urlParams.set('showseeds', '0');
            if ($('tourney-opt-tags') && !$('tourney-opt-tags').checked) urlParams.set('showtags', '0');
            if ($('tourney-opt-badges') && !$('tourney-opt-badges').checked) urlParams.set('showbadges', '0');
            if ($('tourney-opt-champion') && !$('tourney-opt-champion').checked) urlParams.set('champion', '0');
            if ($('tourney-opt-confetti') && $('tourney-opt-confetti').checked) urlParams.set('confetti', '1');
            if ($('tourney-opt-showlogo') && !$('tourney-opt-showlogo').checked) urlParams.set('showlogo', '0');
            const logoInput = $('tourney-opt-logo');
            if (logoInput && logoInput.value.trim()) urlParams.set('logo', logoInput.value.trim());
            const logoSizeEl = $('tourney-opt-logosize');
            if (logoSizeEl && logoSizeEl.value && logoSizeEl.value !== '56px') urlParams.set('logosize', logoSizeEl.value);
            const fitCheck = $('tourney-opt-fit');
            if (fitCheck && fitCheck.checked) urlParams.set('fit', '1');
            if ($('tourney-opt-wide') && $('tourney-opt-wide').checked) urlParams.set('wide', '1');

            const qs = urlParams.toString();
            const fullUrl = `${origin}/overlays/poll-tournament.html${qs ? `?${qs}` : ''}`;
            if ($('url-tourney-overlay')) $('url-tourney-overlay').value = fullUrl;
            if ($('btn-open-tourney-overlay')) $('btn-open-tourney-overlay').href = fullUrl;

            // Live preview iframe update
            const previewIframe = $('tourney-preview-iframe');
            if (previewIframe) {
                const previewParams = new URLSearchParams(urlParams);
                if (!previewParams.get('logo') && activeTourneyData?.logo) {
                    previewParams.set('logo', activeTourneyData.logo);
                }
                previewParams.set('preview', '1');
                postPreviewParams(previewIframe, 'tournament:preview-update', previewParams, '/overlays/poll-tournament.html');
            }
            savePollsOverlayPrefs();
        }

export function resetPollTourneyOverlayDefaults() {
            resetContainerControlsToDefaults('ov-sec-tourney');
            if ($('tourney-opt-layout')) {
                $('tourney-opt-layout').value = previewMode === 'active' ? 'active' : 'tree';
            }
            syncPollTourneyOverlayLogoUi('');
            updateTourneyOverlayUrl();
            updateAssetFontBadges();
            savePollsOverlayPrefs();
            toast('Audience bracket overlay settings reset to defaults');
        }

export function setCreatePollTourneyLogo(url) {
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

export function pickCreatePollTourneyLogo() {
            if (!window.ImagePicker) return;
            window.ImagePicker.open({
                value: $('tourney-create-logo')?.value || '',
                onPick: (url) => {
                    setCreatePollTourneyLogo(url);
                    setPollOverlayTourneyLogo(url, false);
                }
            });
        }

export function syncPollTourneyOverlayLogoUi(url) {
            const clean = (url || '').trim();
            const thumb = $('tourney-opt-logo-thumb');
            const clearBtn = $('tourney-opt-logo-clear');
            if (thumb) {
                thumb.src = clean;
                thumb.style.display = clean ? 'block' : 'none';
            }
            if (clearBtn) clearBtn.style.display = clean ? 'inline-flex' : 'none';
        }

export async function setPollOverlayTourneyLogo(url, syncLive = true) {
            const clean = (url || '').trim();
            if ($('tourney-opt-logo')) $('tourney-opt-logo').value = clean;
            syncPollTourneyOverlayLogoUi(clean);
            updateTourneyOverlayUrl();
            if (syncLive && activeTourneyData) {
                try {
                    const res = await fetch('/api/polls/tournament/settings', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ logo: clean, isPoll: true })
                    });
                    const data = await res.json();
                    if (data.status === 'ok') {
                        activeTourneyData = data.tournament;
                        renderTournamentStudio(activeTourneyData);
                    }
                } catch {}
            }
        }

export function pickPollOverlayTourneyLogo() {
            if (!window.ImagePicker) return;
            window.ImagePicker.open({
                value: $('tourney-opt-logo')?.value || activeTourneyData?.logo || '',
                onPick: (url) => {
                    setPollOverlayTourneyLogo(url, true);
                    toast(url ? 'Bracket header logo updated' : 'Bracket header logo cleared');
                }
            });
        }

export function pickPollLiveTourneyLogo() {
            if (!window.ImagePicker) return;
            window.ImagePicker.open({
                value: activeTourneyData?.logo || $('tourney-opt-logo')?.value || '',
                onPick: async (url) => {
                    await setPollOverlayTourneyLogo(url, true);
                    toast(url ? 'Tournament bracket logo updated!' : 'Tournament bracket logo removed');
                }
            });
        }

export function updateOverlayUrls() {
            updatePollOverlayUrl();
            updateTourneyOverlayUrl();
        }

export function copyUrl(inputId, btn) {
            const input = $(inputId);
            navigator.clipboard.writeText(input.value).then(() => {
                const prev = btn.textContent;
                btn.textContent = 'Copied!';
                setTimeout(() => { btn.textContent = prev; }, 1500);
            });
        }


export function setPreviewMode(mode) {
            previewMode = mode;
            try { localStorage.setItem('polls-overlay-preview-mode', mode); } catch {}
            const isTourney = mode !== 'poll';
            $('btn-preview-poll')?.classList.toggle('active', mode === 'poll');
            $('btn-preview-tree')?.classList.toggle('active', mode === 'tree');
            $('btn-preview-tourney')?.classList.toggle('active', mode === 'active');
            if ($('poll-preview-box')) $('poll-preview-box').style.display = isTourney ? 'none' : 'flex';
            if ($('tourney-preview-box')) $('tourney-preview-box').style.display = isTourney ? 'block' : 'none';
            if ($('poll-tourney-camera-toolbar')) $('poll-tourney-camera-toolbar').style.display = (mode === 'tree') ? 'flex' : 'none';
            if ($('ov-sec-poll')) $('ov-sec-poll').style.display = isTourney ? 'none' : 'block';
            if ($('ov-sec-tourney')) $('ov-sec-tourney').style.display = isTourney ? 'block' : 'none';
            if (isTourney && $('tourney-opt-layout')) {
                $('tourney-opt-layout').value = mode === 'active' ? 'active' : 'tree';
                updateTourneyOverlayUrl();
            }
            savePollsOverlayPrefs();
        }

export async function triggerLivePollTourneyView(opts) {
            try {
                const res = await fetch('/api/polls/tournament/view', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(opts)
                });
                const data = await res.json();
                if (data.status === 'ok') {
                    const iframe = $('tourney-preview-iframe');
                    if (iframe && iframe.contentWindow) {
                        iframe.contentWindow.postMessage({ type: 'poll-tournament-view', data: data.view }, '*');
                    }
                    if (data.view?.focus !== undefined) {
                        const label = $('btn-poll-live-focus-label');
                        if (label) label.textContent = data.view.focus ? 'Focus: ON' : 'Focus: OFF';
                    }
                    if (data.view?.bracket && $('poll-live-bracket-section-select')) {
                        $('poll-live-bracket-section-select').value = data.view.bracket;
                    }
                    toast('Updated audience bracket camera view');
                }
            } catch {
                toast('Error updating bracket camera view');
            }
        }

export function switchPollSubtab(tabName) {
            const tabs = ['layout', 'typography', 'colors', 'toggles'];
            tabs.forEach(t => {
                const btn = $('btn-poll-subtab-' + t);
                const panel = $('poll-subpanel-' + t);
                if (btn) btn.classList.toggle('active', t === tabName);
                if (panel) panel.style.display = (t === tabName) ? 'block' : 'none';
            });
            try { localStorage.setItem('sp-polls-subtab', tabName); } catch {}
        }

export function switchPollTourneySubtab(tabName) {
            const tabs = ['layout', 'typography', 'colors', 'elements'];
            tabs.forEach(t => {
                const btn = $('btn-poll-tourney-subtab-' + t);
                const panel = $('poll-tourney-subpanel-' + t);
                if (btn) btn.classList.toggle('active', t === tabName);
                if (panel) panel.style.display = (t === tabName) ? 'block' : 'none';
            });
            try { localStorage.setItem('sp-polls-tourney-subtab', tabName); } catch {}
        }


export function updatePreview(updateUrls = true) {
            if (updateUrls) updateOverlayUrls();
            const box = $('poll-preview-box');
            if (!box) return;

            if (activePollData && activePollData.status === 'ACTIVE') {
                window.PollWidget.render(box, { poll: { previewMode: 'live' } }, activePollData);
                return;
            }

            const q = $('poll-question').value.trim() || 'Which game should we play next?';
            const inputs = $('choices-container').querySelectorAll('.choice-input');
            const choices = [];
            inputs.forEach((inp, idx) => {
                choices.push({ id: String(idx + 1), title: inp.value.trim() || `Option ${idx + 1}`, votes: idx === 0 ? 12 : 6, percent: idx === 0 ? 67 : 33 });
            });

            const previewPoll = {
                id: 'preview',
                title: q,
                status: 'ACTIVE',
                duration: selectedDuration,
                startedAt: new Date().toISOString(),
                remainingSeconds: selectedDuration,
                totalVotes: 18,
                blind: $('poll-blind').checked,
                choices
            };

            window.PollWidget.render(box, { poll: { previewMode: 'live' } }, previewPoll, { preview: true });
        }

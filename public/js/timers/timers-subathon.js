/**
 * Subathon Automation & Rules Overlay Appearance Studio logic.
 */

import {
    state,
    $,
    esc,
    toast,
    api,
    jsonBody,
    formatMs,
    getLiveTimer,
    displayMs,
    secToMinSec,
    fromMinSec,
    secToHrMin,
    fromHrMin,
    formatDuration
} from './timers-state.js';

export const SUBATHON_THEME_PRESETS = {
    dark: {
        preset: 'dark',
        cardBackground: 'rgba(18, 24, 38, 0.88)',
        cardBorder: 'rgba(255, 255, 255, 0.12)',
        cardRadius: 10,
        textColor: '#ffffff',
        textMuted: 'rgba(255, 255, 255, 0.7)',
        accentColor: '#3b82f6',
        boostBannerColor: '#f59e0b',
        fontFamily: ''
    },
    glass: {
        preset: 'glass',
        cardBackground: 'rgba(255, 255, 255, 0.08)',
        cardBorder: 'rgba(255, 255, 255, 0.22)',
        cardRadius: 14,
        textColor: '#ffffff',
        textMuted: 'rgba(255, 255, 255, 0.75)',
        accentColor: '#38bdf8',
        boostBannerColor: '#38bdf8',
        fontFamily: ''
    },
    arcade: {
        preset: 'arcade',
        cardBackground: 'rgba(15, 12, 41, 0.94)',
        cardBorder: 'rgba(236, 72, 153, 0.45)',
        cardRadius: 4,
        textColor: '#fdf2f8',
        textMuted: '#fbcfe8',
        accentColor: '#ec4899',
        boostBannerColor: '#ec4899',
        fontFamily: "'Courier New', Courier, monospace"
    },
    light: {
        preset: 'light',
        cardBackground: 'rgba(255, 255, 255, 0.94)',
        cardBorder: 'rgba(0, 0, 0, 0.12)',
        cardRadius: 10,
        textColor: '#0f172a',
        textMuted: '#475569',
        accentColor: '#2563eb',
        boostBannerColor: '#ea580c',
        fontFamily: ''
    },
    minimal: {
        preset: 'minimal',
        cardBackground: 'rgba(0, 0, 0, 0.45)',
        cardBorder: 'rgba(255, 255, 255, 0.08)',
        cardRadius: 8,
        textColor: '#ffffff',
        textMuted: 'rgba(255, 255, 255, 0.65)',
        accentColor: '#60a5fa',
        boostBannerColor: '#f59e0b',
        fontFamily: ''
    }
};

export function switchTimersTab(tabName) {
    const isSub = tabName === 'subathon';
    $('tab-btn-timers')?.classList.toggle('active', !isSub);
    $('tab-btn-timers')?.setAttribute('aria-selected', !isSub ? 'true' : 'false');
    $('tab-btn-subathon')?.classList.toggle('active', isSub);
    $('tab-btn-subathon')?.setAttribute('aria-selected', isSub ? 'true' : 'false');
    if ($('pane-timers')) $('pane-timers').hidden = isSub;
    if ($('pane-subathon')) $('pane-subathon').hidden = !isSub;
    try { localStorage.setItem('streampulse:timers:tab', tabName); } catch {}
    if (location.hash !== `#${tabName}`) {
        history.replaceState(null, '', `#${tabName}`);
    }
    if (isSub) renderSubathon();
}

export async function loadSubathon() {
    try {
        const res = await fetch('/api/subathon');
        if (res.status === 404) {
            if ($('tab-btn-subathon')) $('tab-btn-subathon').hidden = true;
            if (location.hash.includes('subathon')) switchTimersTab('timers');
            return;
        }
        const data = await res.json();
        if (!data.ok) {
            if ($('tab-btn-subathon')) $('tab-btn-subathon').hidden = true;
            return;
        }
        state.subathonData = data;
        if ($('tab-btn-subathon')) $('tab-btn-subathon').hidden = false;
        renderSubathon();

        const hash = location.hash.replace('#', '') || localStorage.getItem('streampulse:timers:tab');
        if (hash === 'subathon') {
            switchTimersTab('subathon');
        }
    } catch (err) {
        console.error('[Subathon] Load error:', err);
        if ($('tab-btn-subathon')) $('tab-btn-subathon').hidden = true;
    }
}

export function renderSubathon() {
    if (!state.subathonData || !state.subathonData.config) return;
    const cfg = state.subathonData.config;
    const subState = state.subathonData.state || {};
    const r = cfg.rules || {};
    const mult = cfg.multiplier || {};

    if ($('subathon-active')) $('subathon-active').checked = cfg.enabled === true;
    const pill = $('subathon-subnav-status') || $('subathon-status-pill');
    if (pill) {
        pill.textContent = cfg.enabled ? 'Automation Active' : 'Disabled';
        pill.className = `pill ${cfg.enabled ? 'running' : ''}`;
    }

    const targetSelect = $('subathon-target-timer');
    const countdowns = Object.values(state.timersData).filter(t => t.kind === 'countdown');
    targetSelect.innerHTML = countdowns.length
        ? countdowns.map(t => `<option value="${esc(t.id)}">${esc(t.label || t.id)} (${t.id})</option>`).join('')
        : '<option value="">(No countdown timers found)</option>';
    if (cfg.targetTimerId) targetSelect.value = cfg.targetTimerId;

    $('hh-factor').value = mult.factor || 2.0;
    $('hh-minutes').value = mult.minutes || 60;
    const boostPill = $('boost-period-pill');
    boostPill.hidden = !mult.active;
    boostPill.textContent = `Boost Active (${mult.factor || 2}x)`;
    boostPill.className = 'pill dirty';
    $('hh-end').hidden = !mult.active;
    $('hh-start').textContent = mult.active ? 'Update Boost' : 'Start Boost';

    $('sb-subs-enabled').checked = r.subs?.enabled !== false;
    const t1 = secToMinSec(r.subs?.tier1Seconds ?? 120);
    $('sb-sub-t1-min').value = t1.min;
    $('sb-sub-t1-sec').value = t1.sec;

    const t2 = secToMinSec(r.subs?.tier2Seconds ?? 240);
    $('sb-sub-t2-min').value = t2.min;
    $('sb-sub-t2-sec').value = t2.sec;

    const t3 = secToMinSec(r.subs?.tier3Seconds ?? 600);
    $('sb-sub-t3-min').value = t3.min;
    $('sb-sub-t3-sec').value = t3.sec;

    const gift = secToMinSec(r.subs?.giftSecondsPerSub ?? 120);
    $('sb-sub-gift-min').value = gift.min;
    $('sb-sub-gift-sec').value = gift.sec;

    $('sb-donations-enabled').checked = r.donations?.enabled !== false;
    const don = secToMinSec(r.donations?.secondsPerDollar ?? 60);
    $('sb-donations-rate-min').value = don.min;
    $('sb-donations-rate-sec').value = don.sec;
    $('sb-donations-min').value = r.donations?.minAmount ?? 1.00;
    renderExactList(r.donations?.exactAmounts || []);

    $('sb-bits-enabled').checked = r.bits?.enabled !== false;
    const bits = secToMinSec(r.bits?.secondsPer100Bits ?? 30);
    $('sb-bits-rate-min').value = bits.min;
    $('sb-bits-rate-sec').value = bits.sec;
    $('sb-bits-min').value = r.bits?.minBits ?? 100;

    $('sb-follows-enabled').checked = r.follows?.enabled === true;
    const fol = secToMinSec(r.follows?.seconds ?? 15);
    $('sb-follows-min').value = fol.min;
    $('sb-follows-sec').value = fol.sec;

    $('sb-raids-enabled').checked = r.raids?.enabled !== false;
    const raidBase = secToMinSec(r.raids?.baseSeconds ?? 30);
    $('sb-raids-base-min').value = raidBase.min;
    $('sb-raids-base-sec').value = raidBase.sec;
    $('sb-raids-per-viewer').value = r.raids?.secondsPerViewer ?? 2;

    const maxSec = cfg.caps?.maxRemainingSeconds || 0;
    const cap = secToHrMin(maxSec);
    $('sb-cap-hours').value = cap.hr;
    $('sb-cap-mins').value = cap.min;

    renderTargetMonitor();
    renderSubathonHistory(subState.history || []);
    renderStudioTheme(cfg.theme || {});
}

export function renderTargetMonitor() {
    if (!state.subathonData) return;
    const cfg = state.subathonData.config || {};
    const subState = state.subathonData.state || {};
    const targetId = cfg.targetTimerId || $('subathon-target-timer')?.value;
    const target = state.timersData[targetId];

    if (target) {
        $('sb-monitor-label').textContent = `${target.label || target.id} (${target.id})`;
        const live = getLiveTimer(target);
        $('sb-monitor-time').textContent = formatMs(displayMs(live));
        $('sb-monitor-state').textContent = (target.state || 'READY').toUpperCase();
        $('sb-monitor-state').className = `pill ${target.state === 'running' ? 'running' : target.state === 'paused' ? 'paused' : ''}`;
    } else {
        $('sb-monitor-label').textContent = 'No target countdown selected';
        $('sb-monitor-time').textContent = '00:00:00';
        $('sb-monitor-state').textContent = 'OFFLINE';
        $('sb-monitor-state').className = 'pill';
    }

    $('sb-total-added-pill').textContent = `+${formatDuration(subState.totalTimeAddedSeconds || 0)} Added`;
    $('sb-events-count-pill').textContent = `${subState.totalEventsCount || 0} Events`;
    $('sb-active-rules-summary').textContent = state.subathonData.rulesSummary?.summary || 'No active rates configured';
    if ($('subathon-subnav-status')) {
        $('subathon-subnav-status').textContent = cfg.enabled ? 'Automation Active' : 'Disabled';
        $('subathon-subnav-status').className = `pill ${cfg.enabled ? 'running' : ''}`;
    }
}

export function switchSubathonView(view) {
    const isApp = view === 'appearance';
    $('sb-subnav-automation')?.classList.toggle('active', !isApp);
    $('sb-subnav-automation')?.setAttribute('aria-selected', !isApp ? 'true' : 'false');
    $('sb-subnav-appearance')?.classList.toggle('active', isApp);
    $('sb-subnav-appearance')?.setAttribute('aria-selected', isApp ? 'true' : 'false');
    if ($('sb-view-automation')) $('sb-view-automation').hidden = isApp;
    if ($('sb-view-appearance')) $('sb-view-appearance').hidden = !isApp;

    if (isApp) {
        populateSubathonFontDropdowns();
        setTimeout(() => {
            applySubathonViewportScale();
            syncStudioToPreview();
        }, 30);
    }
    try { localStorage.setItem('subathon-subview', view); } catch (_) {}
}

export function applySubathonViewportScale() {
    const wrapper = $('sb-viewport-wrapper');
    const scaler = $('sb-viewport-scaler');
    const box = $('subathon-preview-box');
    if (!wrapper || !scaler || !box) return;

    const availW = Math.max(260, wrapper.clientWidth - 24);
    const maxAvailH = 480;

    const scale = Math.min(availW / state.sbPreviewWidth, maxAvailH / state.sbPreviewHeight, 1.0);
    const scaledW = Math.round(state.sbPreviewWidth * scale);
    const scaledH = Math.round(state.sbPreviewHeight * scale);

    scaler.style.width = `${scaledW}px`;
    scaler.style.height = `${scaledH}px`;

    box.style.width = `${state.sbPreviewWidth}px`;
    box.style.height = `${state.sbPreviewHeight}px`;
    box.style.transform = `scale(${scale})`;
    box.style.transformOrigin = 'top left';

    const label = $('sb-preview-res-label');
    if (label) label.textContent = `${state.sbPreviewWidth}×${state.sbPreviewHeight} (${Math.round(scale * 100)}%)`;
}

export function toggleSubathonBackdrop() {
    state.sbPreviewBackdrop = state.sbPreviewBackdrop === 'dark' ? 'checkerboard' : 'dark';
    const box = $('subathon-preview-box');
    const btn = $('sb-prev-btn-bg');
    if (box) {
        box.classList.toggle('solid-dark', state.sbPreviewBackdrop === 'dark');
        box.classList.toggle('checkerboard', state.sbPreviewBackdrop === 'checkerboard');
    }
    if (btn) btn.textContent = state.sbPreviewBackdrop === 'dark' ? 'Canvas: Dark' : 'Canvas: Checkerboard';
}

export function toggleSubathonSample() {
    state.sbPreviewSample = !state.sbPreviewSample;
    const btn = $('sb-prev-btn-sample');
    if (btn) {
        btn.textContent = state.sbPreviewSample ? 'Sample Data: ON' : 'Sample Data: OFF';
        btn.classList.toggle('active', state.sbPreviewSample);
    }
    syncStudioToPreview();
}

export async function populateSubathonFontDropdowns() {
    if (state.sbFontsPopulated) return;
    const fontSelect = $('sb-cfg-font');
    const headerFontSelect = $('sb-cfg-header-font');
    if (!fontSelect || !headerFontSelect) return;

    let fontList = [];
    try {
        if (window.OverlayFonts && typeof window.OverlayFonts.getDeduplicatedFontFamilies === 'function') {
            fontList = await window.OverlayFonts.getDeduplicatedFontFamilies();
        } else if (window.OverlayFonts) {
            const assets = await window.OverlayFonts.getAssetFonts?.() || [];
            fontList = [
                ...assets.map(a => ({ name: a.family || a.name, source: 'asset' })),
                ...(window.OverlayFonts.google || []).map(g => ({ name: g, source: 'google' })),
                ...(window.OverlayFonts.system || []).map(s => ({ name: s, source: 'system' }))
            ];
        }
    } catch { fontList = []; }

    if (!fontList || fontList.length === 0) {
        const fallback = [
            'Inter', 'Montserrat', 'Oswald', 'Roboto', 'Bebas Neue', 'Jersey 15', 'Jersey 20',
            'Press Start 2P', 'Rajdhani', 'Orbitron', 'Righteous', 'Russo One', 'Impact', 'Arial', 'Courier New'
        ];
        fontList = fallback.map(name => ({ name, source: 'google' }));
    }

    [fontSelect, headerFontSelect].forEach(select => {
        const cur = select.value;
        select.innerHTML = select === fontSelect
            ? '<option value="">(Default System / Theme)</option>'
            : '<option value="">(Inherit Body Font)</option>';
        fontList.forEach(f => {
            const opt = document.createElement('option');
            opt.value = f.name;
            opt.textContent = f.name + (f.source === 'asset' ? ' (Custom Asset)' : '');
            select.appendChild(opt);
        });
        if (cur) select.value = cur;
    });

    state.sbFontsPopulated = true;
}

function bindColorPair(pickerId, textId) {
    const picker = $(pickerId);
    const text = $(textId);
    if (!picker || !text) return;

    picker.addEventListener('input', () => {
        text.value = picker.value;
        syncStudioToPreview();
    });
    text.addEventListener('input', () => {
        const val = text.value.trim();
        if (/^#[0-9a-f]{6}$/i.test(val)) picker.value = val;
        syncStudioToPreview();
    });
}

function setupSizeSelect(selectId, customInputId) {
    const sel = $(selectId);
    const custom = $(customInputId);
    if (!sel || !custom) return;

    sel.addEventListener('change', () => {
        if (sel.value === 'custom') {
            custom.style.display = 'inline-block';
            custom.focus();
        } else {
            custom.style.display = 'none';
        }
        syncStudioToPreview();
    });
    custom.addEventListener('input', syncStudioToPreview);
}

export function collectStudioTheme() {
    const preset = $('sb-cfg-preset')?.value || 'dark';
    const layout = $('sb-cfg-layout')?.value || 'grid';
    const columns = parseInt($('sb-cfg-columns')?.value, 10) || 0;
    const scale = parseFloat($('sb-cfg-scale')?.value) || 1.0;
    const showHeader = $('sb-cfg-show-header')?.checked !== false;
    const titleText = $('sb-cfg-title-text')?.value.trim() || 'Subathon Rates';

    let headerSize = $('sb-cfg-header-size')?.value || '1.15rem';
    if (headerSize === 'custom') headerSize = $('sb-cfg-header-size-custom')?.value.trim() || '1.15rem';

    const headerFontFamily = $('sb-cfg-header-font')?.value || '';
    const showTotalBadge = $('sb-cfg-show-total')?.checked !== false;
    const showBoostBanner = $('sb-cfg-show-boost-banner')?.checked !== false;

    const cardBackground = $('sb-cfg-card-bg')?.value.trim() || 'rgba(18, 24, 38, 0.88)';
    const cardBorder = $('sb-cfg-card-border')?.value.trim() || 'rgba(255, 255, 255, 0.12)';
    const cardRadius = parseInt($('sb-cfg-card-radius')?.value, 10) || 10;
    const accentColor = $('sb-cfg-accent')?.value.trim() || '#3b82f6';

    const fontFamily = $('sb-cfg-font')?.value || '';
    let valueSize = $('sb-cfg-value-size')?.value || '1.35rem';
    if (valueSize === 'custom') valueSize = $('sb-cfg-value-size-custom')?.value.trim() || '1.35rem';

    const valueWeight = $('sb-cfg-value-weight')?.value || '800';
    const textColor = $('sb-cfg-text-color')?.value.trim() || '#ffffff';
    const textMuted = $('sb-cfg-text-muted')?.value.trim() || 'rgba(255, 255, 255, 0.7)';
    const showCardIcons = $('sb-cfg-show-icons')?.checked !== false;
    const showNotes = $('sb-cfg-show-notes')?.checked !== false;

    const showSubs = $('sb-cfg-show-subs')?.checked !== false;
    const showDonations = $('sb-cfg-show-donations')?.checked !== false;
    const showBits = $('sb-cfg-show-bits')?.checked !== false;
    const showFollows = $('sb-cfg-show-follows')?.checked !== false;
    const showRaids = $('sb-cfg-show-raids')?.checked !== false;

    return {
        preset, layout, columns, scale, showHeader, titleText, headerSize, headerFontFamily,
        showTotalBadge, showBoostBanner, cardBackground, cardBorder, cardRadius, accentColor,
        fontFamily, valueSize, valueWeight, textColor, textMuted, showCardIcons, showNotes,
        showSubs, showDonations, showBits, showFollows, showRaids
    };
}

export function renderStudioTheme(theme = {}) {
    if ($('sb-cfg-preset')) $('sb-cfg-preset').value = theme.preset || 'dark';
    if ($('sb-cfg-layout')) $('sb-cfg-layout').value = theme.layout || 'grid';
    if ($('sb-cfg-columns')) $('sb-cfg-columns').value = String(theme.columns || 0);
    if ($('sb-cfg-scale')) {
        $('sb-cfg-scale').value = theme.scale || 1.0;
        $('sb-cfg-scale-val').textContent = `${(theme.scale || 1.0).toFixed(2)}×`;
    }
    if ($('sb-cfg-show-header')) $('sb-cfg-show-header').checked = theme.showHeader !== false;
    if ($('sb-cfg-title-text')) $('sb-cfg-title-text').value = theme.titleText || 'Subathon Rates';

    const hSize = theme.headerSize || '1.15rem';
    const hSizeSel = $('sb-cfg-header-size');
    const hSizeCustom = $('sb-cfg-header-size-custom');
    if (hSizeSel && hSizeCustom) {
        const match = Array.from(hSizeSel.options).some(o => o.value === hSize);
        if (match) {
            hSizeSel.value = hSize;
            hSizeCustom.style.display = 'none';
        } else {
            hSizeSel.value = 'custom';
            hSizeCustom.value = hSize;
            hSizeCustom.style.display = 'inline-block';
        }
    }

    if ($('sb-cfg-header-font')) $('sb-cfg-header-font').value = theme.headerFontFamily || '';
    if ($('sb-cfg-show-total')) $('sb-cfg-show-total').checked = theme.showTotalBadge !== false;
    if ($('sb-cfg-show-boost-banner')) $('sb-cfg-show-boost-banner').checked = theme.showBoostBanner !== false;

    if ($('sb-cfg-card-bg')) $('sb-cfg-card-bg').value = theme.cardBackground || 'rgba(18, 24, 38, 0.88)';
    if ($('sb-cfg-card-border')) $('sb-cfg-card-border').value = theme.cardBorder || 'rgba(255, 255, 255, 0.12)';
    if ($('sb-cfg-card-radius')) {
        const rad = theme.cardRadius !== undefined ? theme.cardRadius : 10;
        $('sb-cfg-card-radius').value = rad;
        $('sb-cfg-card-radius-val').textContent = `${rad}px`;
    }
    if ($('sb-cfg-accent')) $('sb-cfg-accent').value = theme.accentColor || '#3b82f6';
    if ($('sb-cfg-font')) $('sb-cfg-font').value = theme.fontFamily || '';

    const vSize = theme.valueSize || '1.35rem';
    const vSizeSel = $('sb-cfg-value-size');
    const vSizeCustom = $('sb-cfg-value-size-custom');
    if (vSizeSel && vSizeCustom) {
        const match = Array.from(vSizeSel.options).some(o => o.value === vSize);
        if (match) {
            vSizeSel.value = vSize;
            vSizeCustom.style.display = 'none';
        } else {
            vSizeSel.value = 'custom';
            vSizeCustom.value = vSize;
            vSizeCustom.style.display = 'inline-block';
        }
    }

    if ($('sb-cfg-value-weight')) $('sb-cfg-value-weight').value = theme.valueWeight || '800';
    if ($('sb-cfg-text-color')) $('sb-cfg-text-color').value = theme.textColor || '#ffffff';
    if ($('sb-cfg-text-muted')) $('sb-cfg-text-muted').value = theme.textMuted || 'rgba(255, 255, 255, 0.7)';
    if ($('sb-cfg-show-icons')) $('sb-cfg-show-icons').checked = theme.showCardIcons !== false;
    if ($('sb-cfg-show-notes')) $('sb-cfg-show-notes').checked = theme.showNotes !== false;

    if ($('sb-cfg-show-subs')) $('sb-cfg-show-subs').checked = theme.showSubs !== false;
    if ($('sb-cfg-show-donations')) $('sb-cfg-show-donations').checked = theme.showDonations !== false;
    if ($('sb-cfg-show-bits')) $('sb-cfg-show-bits').checked = theme.showBits !== false;
    if ($('sb-cfg-show-follows')) $('sb-cfg-show-follows').checked = theme.showFollows !== false;
    if ($('sb-cfg-show-raids')) $('sb-cfg-show-raids').checked = theme.showRaids !== false;

    syncStudioToPreview();
}

export function syncStudioToPreview() {
    const theme = collectStudioTheme();
    if ($('sb-cfg-columns-row')) {
        $('sb-cfg-columns-row').style.display = theme.layout === 'grid' ? '' : 'none';
    }

    const params = new URLSearchParams();
    if (theme.layout !== 'grid') params.set('layout', theme.layout);
    if (theme.preset !== 'dark') params.set('theme', theme.preset);
    if (theme.layout === 'grid' && theme.columns > 0) params.set('columns', theme.columns);
    if (theme.scale !== 1.0) params.set('scale', theme.scale);
    if (!theme.showHeader) params.set('header', '0');
    if (theme.titleText && theme.titleText !== 'Subathon Rates') params.set('title', theme.titleText);

    const qs = params.toString();
    const obsUrl = `${location.origin}/overlays/subathon-rules.html${qs ? `?${qs}` : ''}`;
    const previewUrl = `${location.origin}/overlays/subathon-rules.html?preview=1${qs ? `&${qs}` : ''}${state.sbPreviewSample ? '&sample=1' : ''}`;

    const urlBox = $('sb-studio-obs-url');
    if (urlBox) urlBox.textContent = obsUrl;
    const openBtn = $('sb-studio-open-url');
    if (openBtn) openBtn.href = previewUrl;

    const iframe = $('subathon-preview-iframe');
    if (iframe?.contentWindow) {
        iframe.contentWindow.postMessage({
            type: 'subathon:preview-config',
            theme,
            sample: state.sbPreviewSample
        }, '*');
    }
}

export function renderExactList(list) {
    const el = $('sb-exact-list');
    if (!list || !list.length) {
        el.innerHTML = '<div style="color:var(--text-muted); font-size:0.75rem;">No exact amount rules configured (e.g. $4.20, $6.66).</div>';
        return;
    }
    el.innerHTML = list.map((item, idx) => `
        <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-inset); padding:0.35rem 0.55rem; border-radius:6px; border:1px solid var(--border);">
            <div>
                <b>$${Number(item.amount).toFixed(2)}</b> &rarr; +${formatDuration(item.seconds)} ${item.label ? `(${esc(item.label)})` : ''}
            </div>
            <button type="button" class="btn sm danger" data-del-exact="${idx}">Delete</button>
        </div>
    `).join('');
}

export function renderSubathonHistory(history) {
    const el = $('sb-history-list');
    if (!history || !history.length) {
        el.innerHTML = '<div style="color:var(--text-muted);">No subathon events recorded yet.</div>';
        return;
    }
    el.innerHTML = history.slice(0, 20).map(item => {
        const timeStr = item.timestamp ? new Date(item.timestamp).toLocaleTimeString() : '';
        const deltaStr = (item.deltaSeconds >= 0 ? `+${formatDuration(item.deltaSeconds)}` : `-${formatDuration(Math.abs(item.deltaSeconds))}`);
        const statusStyle = item.undone ? 'text-decoration:line-through; opacity:0.5;' : '';
        return `
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--bg-raised); padding:0.25rem 0; ${statusStyle}">
                <span><span style="color:var(--text-muted); font-family:monospace;">${timeStr}</span> <b>${esc(item.user)}</b> · ${esc(item.label || item.type)}</span>
                <span style="font-weight:700; color:${item.deltaSeconds >= 0 ? 'var(--success)' : 'var(--warn)'}">${deltaStr}${item.multiplier > 1 ? ` (${item.multiplier}x)` : ''}</span>
            </div>
        `;
    }).join('');
}

export async function saveSubathonSettings() {
    if (!state.subathonData) return;
    const cfg = state.subathonData.config || {};
    const r = cfg.rules || {};

    const payload = {
        enabled: $('subathon-active').checked,
        targetTimerId: $('subathon-target-timer').value,
        rules: {
            subs: {
                ...r.subs,
                enabled: $('sb-subs-enabled').checked,
                tier1Seconds: fromMinSec($('sb-sub-t1-min'), $('sb-sub-t1-sec'), 120),
                tier2Seconds: fromMinSec($('sb-sub-t2-min'), $('sb-sub-t2-sec'), 240),
                tier3Seconds: fromMinSec($('sb-sub-t3-min'), $('sb-sub-t3-sec'), 600),
                giftSecondsPerSub: fromMinSec($('sb-sub-gift-min'), $('sb-sub-gift-sec'), 120)
            },
            donations: {
                ...r.donations,
                enabled: $('sb-donations-enabled').checked,
                secondsPerDollar: fromMinSec($('sb-donations-rate-min'), $('sb-donations-rate-sec'), 60),
                minAmount: parseFloat($('sb-donations-min').value) || 0
            },
            bits: {
                ...r.bits,
                enabled: $('sb-bits-enabled').checked,
                secondsPer100Bits: fromMinSec($('sb-bits-rate-min'), $('sb-bits-rate-sec'), 30),
                minBits: parseInt($('sb-bits-min').value, 10) || 0
            },
            follows: {
                ...r.follows,
                enabled: $('sb-follows-enabled').checked,
                seconds: fromMinSec($('sb-follows-min'), $('sb-follows-sec'), 15)
            },
            raids: {
                ...r.raids,
                enabled: $('sb-raids-enabled').checked,
                baseSeconds: fromMinSec($('sb-raids-base-min'), $('sb-raids-base-sec'), 30),
                secondsPerViewer: parseInt($('sb-raids-per-viewer').value, 10) || 0
            }
        },
        caps: {
            maxRemainingSeconds: fromHrMin($('sb-cap-hours'), $('sb-cap-mins'))
        }
    };

    try {
        const data = await api('/api/subathon', jsonBody('PUT', payload));
        state.subathonData.config = data.config;
        renderSubathon();
        toast('Subathon configuration saved');
    } catch (err) {
        toast(err.message, 'error');
    }
}

export function initSubathon() {
    $('tab-btn-timers')?.addEventListener('click', () => switchTimersTab('timers'));
    $('tab-btn-subathon')?.addEventListener('click', () => switchTimersTab('subathon'));

    window.addEventListener('hashchange', () => {
        const hash = location.hash.replace('#', '');
        if (hash === 'subathon') switchTimersTab('subathon');
        else if (hash === 'timers') switchTimersTab('timers');
    });

    $('sb-subnav-automation')?.addEventListener('click', () => switchSubathonView('automation'));
    $('sb-subnav-appearance')?.addEventListener('click', () => switchSubathonView('appearance'));

    window.addEventListener('resize', () => {
        if ($('sb-view-appearance') && !$('sb-view-appearance').hidden) {
            applySubathonViewportScale();
        }
    });

    $('sb-prev-btn-bg')?.addEventListener('click', toggleSubathonBackdrop);
    $('sb-prev-btn-sample')?.addEventListener('click', toggleSubathonSample);

    document.querySelectorAll('#sb-view-appearance .preset-chip-btn[data-w]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#sb-view-appearance .preset-chip-btn[data-w]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.sbPreviewWidth = parseInt(btn.dataset.w, 10);
            state.sbPreviewHeight = parseInt(btn.dataset.h, 10);
            if (btn.dataset.layout && $('sb-cfg-layout')) {
                $('sb-cfg-layout').value = btn.dataset.layout;
            }
            applySubathonViewportScale();
            syncStudioToPreview();
        });
    });

    bindColorPair('sb-cfg-card-bg-picker', 'sb-cfg-card-bg');
    bindColorPair('sb-cfg-card-border-picker', 'sb-cfg-card-border');
    bindColorPair('sb-cfg-accent-picker', 'sb-cfg-accent');
    bindColorPair('sb-cfg-text-color-picker', 'sb-cfg-text-color');
    bindColorPair('sb-cfg-text-muted-picker', 'sb-cfg-text-muted');

    $('sb-cfg-card-radius')?.addEventListener('input', e => {
        $('sb-cfg-card-radius-val').textContent = `${e.target.value}px`;
        syncStudioToPreview();
    });

    $('sb-cfg-scale')?.addEventListener('input', e => {
        $('sb-cfg-scale-val').textContent = `${parseFloat(e.target.value).toFixed(2)}×`;
        syncStudioToPreview();
    });

    setupSizeSelect('sb-cfg-header-size', 'sb-cfg-header-size-custom');
    setupSizeSelect('sb-cfg-value-size', 'sb-cfg-value-size-custom');

    $('sb-cfg-preset')?.addEventListener('change', e => {
        const def = SUBATHON_THEME_PRESETS[e.target.value];
        if (def) {
            $('sb-cfg-card-bg').value = def.cardBackground;
            if (/^#[0-9a-f]{6}$/i.test(def.cardBackground)) $('sb-cfg-card-bg-picker').value = def.cardBackground;
            $('sb-cfg-card-border').value = def.cardBorder;
            if (/^#[0-9a-f]{6}$/i.test(def.cardBorder)) $('sb-cfg-card-border-picker').value = def.cardBorder;
            $('sb-cfg-card-radius').value = def.cardRadius;
            $('sb-cfg-card-radius-val').textContent = `${def.cardRadius}px`;
            $('sb-cfg-accent').value = def.accentColor;
            $('sb-cfg-accent-picker').value = def.accentColor;
            $('sb-cfg-text-color').value = def.textColor;
            $('sb-cfg-text-color-picker').value = def.textColor;
            $('sb-cfg-text-muted').value = def.textMuted;
            if (def.fontFamily !== undefined && $('sb-cfg-font')) $('sb-cfg-font').value = def.fontFamily;
        }
        syncStudioToPreview();
    });

    [
        'sb-cfg-preset', 'sb-cfg-layout', 'sb-cfg-columns', 'sb-cfg-show-header',
        'sb-cfg-show-total', 'sb-cfg-show-boost-banner', 'sb-cfg-header-font',
        'sb-cfg-font', 'sb-cfg-value-weight', 'sb-cfg-show-icons', 'sb-cfg-show-notes',
        'sb-cfg-show-subs', 'sb-cfg-show-donations', 'sb-cfg-show-bits', 'sb-cfg-show-follows', 'sb-cfg-show-raids'
    ].forEach(id => {
        $(id)?.addEventListener('change', syncStudioToPreview);
    });
    $('sb-cfg-title-text')?.addEventListener('input', syncStudioToPreview);

    $('sb-studio-copy-url')?.addEventListener('click', () => {
        const url = $('sb-studio-obs-url')?.textContent;
        if (url) navigator.clipboard.writeText(url).then(() => toast('OBS overlay URL copied!'));
    });

    $('sb-save-theme-btn')?.addEventListener('click', async () => {
        const theme = collectStudioTheme();
        try {
            await api('/api/subathon', jsonBody('PUT', { theme }));
            if (state.subathonData?.config) state.subathonData.config.theme = theme;
            toast('Subathon appearance settings saved');
            syncStudioToPreview();
        } catch (err) { toast(err.message, 'error'); }
    });

    $('sb-reset-theme-btn')?.addEventListener('click', async () => {
        if (!await StreamPulse.confirm('Reset Theme', 'Reset subathon rules appearance to default StreamPulse Navy theme?', { danger: false })) return;
        renderStudioTheme(SUBATHON_THEME_PRESETS.dark);
        try {
            await api('/api/subathon', jsonBody('PUT', { theme: SUBATHON_THEME_PRESETS.dark }));
            if (state.subathonData?.config) state.subathonData.config.theme = SUBATHON_THEME_PRESETS.dark;
            toast('Subathon appearance reset to defaults');
        } catch (err) { toast(err.message, 'error'); }
    });

    $('sb-save-btn')?.addEventListener('click', saveSubathonSettings);

    $('hh-start')?.addEventListener('click', async () => {
        const factor = parseFloat($('hh-factor').value) || 2.0;
        const minutes = parseInt($('hh-minutes').value, 10) || 60;
        try {
            await api('/api/subathon/multiplier', jsonBody('POST', { factor, minutes }));
            toast(`Started ${factor}x Boost Period for ${minutes} min`);
            loadSubathon();
        } catch (err) { toast(err.message, 'error'); }
    });

    $('hh-end')?.addEventListener('click', async () => {
        try {
            await api('/api/subathon/clear_multiplier', { method: 'POST' });
            toast('Boost Period ended');
            loadSubathon();
        } catch (err) { toast(err.message, 'error'); }
    });

    $('sb-undo-btn')?.addEventListener('click', async () => {
        try {
            const data = await api('/api/subathon/undo', { method: 'POST' });
            toast(`Undone: ${data.undone?.label || 'last event'}`);
            loadSubathon();
        } catch (err) { toast(err.message, 'error'); }
    });

    $('sb-reset-stats-btn')?.addEventListener('click', async () => {
        if (!await StreamPulse.confirm('Reset Stats', 'Reset total subathon statistics and event history to zero?', { danger: true, confirmText: 'Reset' })) return;
        try {
            await api('/api/subathon/reset_stats', { method: 'POST' });
            toast('Subathon stats reset');
            loadSubathon();
        } catch (err) { toast(err.message, 'error'); }
    });

    $('sb-exact-add')?.addEventListener('click', async () => {
        const amount = parseFloat($('sb-exact-amount').value);
        const seconds = fromMinSec($('sb-exact-min'), $('sb-exact-sec'), 0);
        const label = $('sb-exact-label').value.trim();
        if (!amount || amount <= 0 || seconds <= 0) return toast('Enter valid amount and minutes/seconds', 'error');

        const exacts = state.subathonData?.config?.rules?.donations?.exactAmounts || [];
        exacts.push({ amount, seconds, label });
        try {
            await api('/api/subathon', jsonBody('PUT', { rules: { donations: { exactAmounts: exacts } } }));
            $('sb-exact-amount').value = '';
            $('sb-exact-min').value = '';
            $('sb-exact-sec').value = '';
            $('sb-exact-label').value = '';
            loadSubathon();
            toast('Exact amount rule added');
        } catch (err) { toast(err.message, 'error'); }
    });

    $('sb-test-btn')?.addEventListener('click', async () => {
        const sel = $('sb-test-event').value;
        let eventPayload = { type: 'sub', event: 'sub', tier: '1000', user: 'TestSupporter' };
        if (sel === 'sub_t2') eventPayload = { type: 'sub', event: 'sub', tier: '2000', user: 'Tier2Supporter' };
        else if (sel === 'sub_t3') eventPayload = { type: 'sub', event: 'sub', tier: '3000', user: 'VIPSupporter' };
        else if (sel === 'gift_5') eventPayload = { type: 'gift', event: 'gift', count: 5, user: 'GenerousDonor' };
        else if (sel === 'bits_500') eventPayload = { type: 'bits', event: 'bits', amount: 500, bits: 500, user: 'CheerMaster' };
        else if (sel === 'don_5') eventPayload = { type: 'donation', event: 'donation', amount: 5.00, user: 'TipLover' };
        else if (sel === 'don_exact') eventPayload = { type: 'donation', event: 'donation', amount: 4.20, user: 'ExactTipper' };
        else if (sel === 'follow') eventPayload = { type: 'follow', event: 'follow', user: 'NewFriend' };
        else if (sel === 'raid_25') eventPayload = { type: 'raid', event: 'raid', viewers: 25, user: 'RaidLeader' };

        try {
            const res = await api('/api/subathon/test', jsonBody('POST', eventPayload));
            if (res.result?.applied) {
                toast(`Simulation applied: +${formatDuration(res.result.deltaSeconds)} to ${res.result.timer?.id || 'target'}`);
            } else {
                toast(`Simulation result: ${res.result?.reason || 'no time added'}`);
            }
            loadSubathon();
        } catch (err) { toast(err.message, 'error'); }
    });

    document.addEventListener('click', async e => {
        const delBtn = e.target.closest('[data-del-exact]');
        if (delBtn) {
            const idx = parseInt(delBtn.dataset.delExact, 10);
            const exacts = state.subathonData?.config?.rules?.donations?.exactAmounts || [];
            exacts.splice(idx, 1);
            try {
                await api('/api/subathon', jsonBody('PUT', { rules: { donations: { exactAmounts: exacts } } }));
                loadSubathon();
                toast('Exact amount rule removed');
            } catch (err) { toast(err.message, 'error'); }
        }
    });

    try {
        const savedSubview = localStorage.getItem('subathon-subview');
        if (savedSubview === 'appearance') {
            switchSubathonView('appearance');
        }
    } catch (_) {}
}

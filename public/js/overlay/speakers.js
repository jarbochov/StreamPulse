import { root } from './environment.js';
import { loadGoogleFont } from './fonts.js';
import { gradientStyle } from './styles.js';


function ensureSpeakerBadgeStyle() {
    if (document.getElementById('sp-speaker-badge-style')) return;
    const tag = document.createElement('style');
    tag.id = 'sp-speaker-badge-style';
    tag.textContent = `
.sp-sb-card { box-sizing: border-box; display: flex; position: relative; width: 100%; height: 100%; container-type: size; transition: transform 0.18s ease-out, border-color 0.18s ease, box-shadow 0.18s ease, opacity 0.2s ease; overflow: hidden; user-select: none; font-family: inherit; color: inherit; box-shadow: var(--sb-base-shadow, 0 4px 16px rgba(0,0,0,0.25)); }
.sp-sb-card.is-speaking.has-highlight { border-color: var(--sb-active-color, #6366f1) !important; box-shadow: 0 0 var(--sb-glow-spread, 14px) var(--sb-active-glow, rgba(99, 102, 241, 0.45)), var(--sb-base-shadow, 0 4px 20px rgba(0,0,0,0.35)) !important; }
.sp-sb-card.is-speaking.has-pop { transform: scale(1.03); }
.sp-sb-card.is-idle.has-dim { opacity: var(--sb-idle-opacity, 0.7) !important; }

/* Avatar Wrap & Shapes */
.sp-sb-avatar-wrap { position: relative; flex-shrink: 0; display: flex; align-items: center; justify-content: center; width: var(--sb-avatar-size, 48px); height: var(--sb-avatar-size, 48px); }
.sp-sb-avatar-wrap.shape-circle, .sp-sb-avatar.shape-circle, .sp-sb-avatar-placeholder.shape-circle { border-radius: 50%; }
.sp-sb-avatar-wrap.shape-squircle, .sp-sb-avatar.shape-squircle, .sp-sb-avatar-placeholder.shape-squircle { border-radius: 26%; }
.sp-sb-avatar-wrap.shape-square, .sp-sb-avatar.shape-square, .sp-sb-avatar-placeholder.shape-square { border-radius: 8px; }
.sp-sb-avatar { width: 100%; height: 100%; object-fit: cover; display: block; }
.sp-sb-avatar-placeholder { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: rgba(255, 255, 255, 0.12); color: currentColor; box-sizing: border-box; }
.sp-sb-avatar-placeholder svg { width: calc(55% * var(--sb-icon-scale, 1)); height: calc(55% * var(--sb-icon-scale, 1)); opacity: 0.75; }

/* Pulse Ring Halo */
.sp-sb-pulse-ring { position: absolute; inset: -5px; border-radius: inherit; border: 2px solid var(--sb-active-color, #6366f1); opacity: 0; pointer-events: none; transform: scale(0.95); }
.is-speaking .sp-sb-pulse-ring { animation: spSbPulse 1.3s ease-out infinite; }
@keyframes spSbPulse { 0% { transform: scale(0.95); opacity: 0.85; } 50% { transform: scale(1.18); opacity: 0.3; } 100% { transform: scale(1.35); opacity: 0; } }

/* Metadata & Proportional Typography */
.sp-sb-meta { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; justify-content: center; gap: calc(3px * var(--sb-fit-scale, 1)); }
.sp-sb-row { display: flex; flex-wrap: wrap; flex-shrink: 0; align-items: center; justify-content: var(--sb-justify, flex-start); gap: calc(4px * var(--sb-fit-scale, 1)) calc(8px * var(--sb-fit-scale, 1)); min-width: 0; width: 100%; }
.sp-sb-subrow { margin-top: calc(1px * var(--sb-fit-scale, 1)); }
.sp-sb-name { min-width: 0; max-width: 100%; flex-shrink: 0; font-weight: var(--sb-font-weight, 700); font-size: var(--sb-font-size, 17px); line-height: var(--sb-line-height, 1.2); white-space: normal; overflow-wrap: anywhere; color: inherit; }
.sp-sb-pronouns { max-width: 100%; min-width: 0; flex-shrink: 0; font-family: var(--sb-pill-font, inherit); font-size: var(--sb-pronouns-size, 11px); font-weight: 600; text-transform: lowercase; padding: calc(2px * var(--sb-fit-scale, 1)) calc(8px * var(--sb-fit-scale, 1)); border-radius: 999px; background: color-mix(in srgb, currentColor 14%, transparent); color: inherit; border: 1px solid color-mix(in srgb, currentColor 12%, transparent); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.2; }
.sp-sb-handle, .sp-sb-location, .cspan-location { font-family: var(--sb-subtitle-font, inherit); }
.sp-sb-callin-tag, .cspan-status-tag { font-family: var(--sb-pill-font, inherit); }
.sp-sb-handle { min-width: 0; max-width: 100%; flex-shrink: 0; font-size: var(--sb-handle-size, 12px); opacity: 0.75; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: var(--sb-line-height, 1.2); color: inherit; }
.sp-sb-location { min-width: 0; max-width: 100%; flex-shrink: 0; font-size: var(--sb-loc-size, 11px); opacity: 0.8; display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.2; color: inherit; }

/* Call-In Badges & Live Status Indicator */
.sp-sb-callin-tag { display: inline-flex; align-items: center; max-width: 100%; min-width: 0; flex-shrink: 0; gap: calc(6px * var(--sb-fit-scale, 1)); font-size: var(--sb-tag-size, 10px); font-weight: 800; letter-spacing: 0.07em; text-transform: uppercase; color: var(--cspan-status-color, #22c55e); background: rgba(0, 0, 0, 0.36); padding: calc(2px * var(--sb-fit-scale, 1)) calc(7px * var(--sb-fit-scale, 1)); border-radius: 999px; border: 1px solid color-mix(in srgb, var(--cspan-status-color, #22c55e) 35%, transparent); line-height: 1.2; }
.cspan-status-label, .sp-sb-location > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sp-sb-callin-tag.size-compact { font-size: calc(var(--sb-tag-size, 10px) * 0.9); padding: calc(1px * var(--sb-fit-scale, 1)) calc(6px * var(--sb-fit-scale, 1)); gap: calc(4px * var(--sb-fit-scale, 1)); }
.sp-sb-callin-tag.size-small { font-size: calc(var(--sb-tag-size, 10px) * 0.95); padding: calc(2px * var(--sb-fit-scale, 1)) calc(6px * var(--sb-fit-scale, 1)); }
.cspan-live-dot { width: calc(7px * var(--sb-fit-scale, 1)); height: calc(7px * var(--sb-fit-scale, 1)); border-radius: 50%; background: currentColor; display: inline-block; flex-shrink: 0; }
.sp-sb-location svg { width: calc(11px * var(--sb-fit-scale, 1)); height: calc(11px * var(--sb-fit-scale, 1)); flex-shrink: 0; }
.is-speaking .cspan-live-dot { box-shadow: 0 0 8px currentColor; animation: spSbBlink 0.8s infinite alternate; }
@keyframes spSbBlink { from { opacity: 0.4; transform: scale(0.9); } to { opacity: 1; transform: scale(1.2); } }

/* EQ Audio Visualizer Bars */
.sp-sb-eq-bars { display: inline-flex; align-items: flex-end; gap: calc(3px * var(--sb-fit-scale, 1)); height: calc(20px * var(--sb-fit-scale, 1)); flex-shrink: 0; padding: 0 calc(4px * var(--sb-fit-scale, 1)); }
.sp-sb-eq-bar { width: calc(3.5px * var(--sb-fit-scale, 1)); border-radius: 999px; background: var(--sb-bar-color, var(--sb-active-color, #6366f1)); height: calc(4px * var(--sb-fit-scale, 1)); transition: height 0.12s ease, opacity 0.15s ease; opacity: 0.35; }
.is-speaking .sp-sb-eq-bar { opacity: 1; animation: spSbEqBounce 0.5s ease-in-out infinite alternate; }
.is-speaking .sp-sb-eq-bar:nth-child(1) { animation-delay: 0.05s; }
.is-speaking .sp-sb-eq-bar:nth-child(2) { animation-delay: 0.18s; }
.is-speaking .sp-sb-eq-bar:nth-child(3) { animation-delay: 0.32s; }
.is-speaking .sp-sb-eq-bar:nth-child(4) { animation-delay: 0.12s; }
.is-speaking .sp-sb-eq-bar:nth-child(5) { animation-delay: 0.25s; }
.is-speaking .sp-sb-eq-bar:nth-child(6) { animation-delay: 0.08s; }
.is-speaking .sp-sb-eq-bar:nth-child(7) { animation-delay: 0.22s; }
.is-speaking .sp-sb-eq-bar:nth-child(8) { animation-delay: 0.38s; }
@keyframes spSbEqBounce { 0% { height: calc(4px * var(--sb-fit-scale, 1)); } 30% { height: calc(18px * var(--sb-fit-scale, 1)); } 60% { height: calc(8px * var(--sb-fit-scale, 1)); } 100% { height: calc(20px * var(--sb-fit-scale, 1)); } }

/* Layout 1: Horizontal Lower-Third */
.sp-sb-card.layout-horizontal { flex-direction: row; align-items: var(--sb-valign, center); gap: calc(12px * var(--sb-fit-scale, 1)); padding: var(--sb-padding-y, 10px) var(--sb-padding-x, 16px); }
.sp-sb-card.layout-horizontal .sp-sb-avatar-wrap { --sb-avatar-size: min(calc(var(--sb-avatar-base, 48px) * var(--sb-avatar-scale, 1)), 100cqh, 30cqw); }
.sp-sb-card.layout-horizontal.is-auto-size .sp-sb-avatar-wrap { --sb-avatar-base: max(48px, min(80cqh, 24cqw)); }

/* Layout 2: C-SPAN Banner */
.sp-sb-card.layout-cspan-banner { flex-direction: column; justify-content: flex-start; padding: 0; min-height: 0; }
.sp-sb-card.layout-cspan-banner .cspan-header-bar { display: flex; align-items: center; justify-content: space-between; width: 100%; border-bottom: 1px solid rgba(255, 255, 255, 0.14); padding: calc(5px * var(--sb-fit-scale, 1)) calc(12px * var(--sb-fit-scale, 1)); box-sizing: border-box; background: rgba(0, 0, 0, 0.32); font-size: var(--sb-tag-size, 11px); flex-shrink: 0; min-height: calc(22px * var(--sb-fit-scale, 1)); }
.sp-sb-card.layout-cspan-banner .cspan-status-tag { display: inline-flex; align-items: center; min-width: 0; max-width: 60%; gap: 7px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: var(--cspan-status-color, #22c55e); }
.sp-sb-card.layout-cspan-banner .cspan-location { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.85; font-size: var(--sb-loc-size, 10.5px); }
.sp-sb-card.layout-cspan-banner .cspan-main-row { display: flex; align-items: var(--sb-valign, center); width: 100%; min-width: 0; flex: 1; padding: var(--sb-padding-y, 6px) var(--sb-padding-x, 12px); box-sizing: border-box; gap: calc(10px * var(--sb-fit-scale, 1)); overflow: hidden; container-type: size; }
.sp-sb-card.layout-cspan-banner .sp-sb-avatar-wrap { --sb-avatar-size: min(calc(var(--sb-avatar-base, 44px) * var(--sb-avatar-scale, 1)), 100cqh, 30cqw); }
.sp-sb-card.layout-cspan-banner.is-auto-size .sp-sb-avatar-wrap { --sb-avatar-base: max(44px, min(80cqh, 24cqw)); }
.sp-sb-card.layout-cspan-banner .sp-sb-name { font-size: var(--sb-font-size, 18px); font-weight: var(--sb-font-weight, 800); }

/* Layout 3: Compact Pill */
.sp-sb-card.layout-compact-pill { flex-direction: row; align-items: var(--sb-valign, center); gap: calc(9px * var(--sb-fit-scale, 1)); padding: var(--sb-padding-y, 6px) var(--sb-padding-x, 14px); border-radius: 999px !important; }
.sp-sb-card.layout-compact-pill .sp-sb-avatar-wrap { --sb-avatar-size: min(calc(var(--sb-avatar-base, 32px) * var(--sb-avatar-scale, 1)), 100cqh, 30cqw); }
.sp-sb-card.layout-compact-pill.is-auto-size .sp-sb-avatar-wrap { --sb-avatar-base: max(32px, min(80cqh, 24cqw)); }
.sp-sb-card.layout-compact-pill .sp-sb-name { font-size: var(--sb-font-size, 14px); font-weight: var(--sb-font-weight, 700); }
.sp-sb-card.layout-compact-pill .sp-sb-eq-bars { height: calc(16px * var(--sb-fit-scale, 1)); }

/* Layout 4: Vertical Sidebar Card */
.sp-sb-card.layout-vertical-card { flex-direction: column; align-items: var(--sb-justify, center); justify-content: var(--sb-valign, center); padding: var(--sb-padding-y, 14px) var(--sb-padding-x, 12px); gap: calc(6px * var(--sb-fit-scale, 1)); }
.sp-sb-card.layout-vertical-card .sp-sb-avatar-wrap { --sb-avatar-size: min(calc(var(--sb-avatar-base, 64px) * var(--sb-avatar-scale, 1)), 40cqh, 100cqw); }
.sp-sb-card.layout-vertical-card.is-auto-size .sp-sb-avatar-wrap { --sb-avatar-base: max(64px, min(30cqh, 60cqw)); }
.sp-sb-card.layout-vertical-card .sp-sb-meta { flex: 0 0 auto; width: 100%; }
.sp-sb-card.layout-vertical-card .sp-sb-row { gap: calc(4px * var(--sb-fit-scale, 1)); }
.sp-sb-card.layout-vertical-card .sp-sb-callin-tag, .sp-sb-card.layout-vertical-card .sp-sb-pronouns { max-width: 100%; }
.sp-sb-card.layout-vertical-card .sp-sb-eq-bars { margin-top: calc(4px * var(--sb-fit-scale, 1)); }

/* Layout 5: Avatar Only */
.sp-sb-card.layout-avatar-only { justify-content: center; align-items: center; overflow: visible; padding: 0 !important; background: transparent !important; border: 0 !important; box-shadow: none !important; }
.sp-sb-card.layout-avatar-only .sp-sb-avatar-wrap { width: calc(100% * var(--sb-avatar-scale, 1)); height: calc(100% * var(--sb-avatar-scale, 1)); transition: transform 0.18s ease-out, box-shadow 0.18s ease; }
.sp-sb-card.layout-avatar-only.is-speaking.has-highlight .sp-sb-avatar-wrap { box-shadow: 0 0 var(--sb-glow-spread, 16px) var(--sb-active-glow, rgba(99, 102, 241, 0.6)); }
.sp-sb-card.layout-avatar-only.is-speaking.has-pop { transform: none; }
.sp-sb-card.layout-avatar-only.is-speaking.has-pop .sp-sb-avatar-wrap { transform: scale(1.06); }
.sp-sb-card.layout-avatar-only .sp-sb-avatar, .sp-sb-card.layout-avatar-only .sp-sb-avatar-placeholder { border: 2.5px solid rgba(255, 255, 255, 0.2); box-sizing: border-box; transition: border-color 0.18s ease; }
.sp-sb-card.layout-avatar-only.is-speaking.has-highlight .sp-sb-avatar, .sp-sb-card.layout-avatar-only.is-speaking.has-highlight .sp-sb-avatar-placeholder { border-color: var(--sb-active-color, #6366f1) !important; }
.sp-sb-card.layout-avatar-only .avatar-corner-eq { position: absolute; bottom: 2px; right: 2px; background: rgba(0, 0, 0, 0.65); padding: 2px 4px; border-radius: 4px; height: 14px; }
@media (prefers-reduced-motion: reduce) {
.sp-sb-card, .sp-sb-avatar-wrap { transition: none !important; }
.sp-sb-card.is-speaking.has-pop, .sp-sb-card.layout-avatar-only.is-speaking.has-pop .sp-sb-avatar-wrap { transform: none; }
.sp-sb-card .sp-sb-pulse-ring, .sp-sb-card .sp-sb-eq-bar, .sp-sb-card .cspan-live-dot { animation: none; }
}
`;
    document.head.appendChild(tag);
}

function fitSpeakerBadge(node) {
    const card = node.querySelector(':scope > .sp-sb-card');
    if (!node.isConnected || !card || card.classList.contains('layout-avatar-only') || !card.clientHeight || !card.clientWidth) return;
    const base = card._speakerBaseFontSize;
    const meta = card.querySelector('.sp-sb-meta');
    const content = [...card.querySelectorAll('.sp-sb-meta, .sp-sb-name, .sp-sb-row, .sp-sb-handle, .sp-sb-avatar-wrap, .sp-sb-eq-bars, .cspan-header-bar')];
    const groups = [card, ...card.querySelectorAll('.cspan-main-row, .sp-sb-meta, .sp-sb-row')];
    const applySize = size => {
        const scale = size / base;
        // Keep structural spacing and effects comfortable independently of text fitting.
        card.style.setProperty('--sb-fit-scale', String(Math.max(0.75, Math.min(1.5, scale))));
        card.style.setProperty('--sb-font-size', `${size}px`);
        for (const [key, ratio] of [['handle', 0.72], ['pronouns', 0.65], ['tag', 0.60], ['loc', 0.65]]) {
            card.style.setProperty(`--sb-${key}-size`, `${Math.max(2.5, Math.round(size * ratio))}px`);
        }
        card.style.letterSpacing = `${card._speakerLetterSpacing * scale}px`;
    };
    const fits = size => {
        applySize(size);
        if (meta && meta.scrollHeight > meta.clientHeight + 1) return false;
        const contained = content.every(child => {
            const container = child.closest('.cspan-main-row') || card;
            const box = container.getBoundingClientRect(), style = root.getComputedStyle(container);
            const scale = box.width / container.offsetWidth;
            const tolerance = 1.5 * scale;
            const rect = child.getBoundingClientRect();
            return rect.left >= box.left + parseFloat(style.paddingLeft) * scale - tolerance &&
                rect.right <= box.right - parseFloat(style.paddingRight) * scale + tolerance &&
                rect.top >= box.top + parseFloat(style.paddingTop) * scale - tolerance &&
                rect.bottom <= box.bottom - parseFloat(style.paddingBottom) * scale + tolerance &&
                (!child.matches('.sp-sb-name, .sp-sb-row, .sp-sb-handle') || child.scrollWidth <= child.clientWidth + 1);
        });
        return contained && groups.every(group => {
            const boxes = [...group.children].map(child => child.getBoundingClientRect());
            return boxes.every((a, i) => boxes.slice(i + 1).every(b =>
                a.right <= b.left + 0.5 || b.right <= a.left + 0.5 ||
                a.bottom <= b.top + 0.5 || b.bottom <= a.top + 0.5));
        });
    };
    let lo = Math.min(4, base), hi = card._speakerAutoSize ? Math.min(160, card.clientHeight) : base;
    if (fits(hi)) return;
    while (hi - lo > 0.5) {
        const mid = (lo + hi) / 2;
        if (fits(mid)) lo = mid;
        else hi = mid;
    }
    applySize(lo);
}

function renderSpeakerBadge(node, element, options = {}) {
    ensureSpeakerBadgeStyle();
    const b = element.speakerBadge || {};
    const sp = b.speaker || {};
    const callIn = sp.callIn || {};
    const re = b.reaction || {};
    const s = element.style || {};
    const layout = b.layout || 'horizontal';
    const speaking = Boolean(options.speaking);

    const activeColor = re.activeColor || '#6366f1';
    const glowSpread = Math.max(0, Number(re.glowSpread ?? 14) || 0);
    const barColor = re.visualizerColor === 'match' ? activeColor : (re.visualizerColor || activeColor);

    // Keep the outer host node clean so canvas/runtime geometry & selection remain intact
    node.style.padding = '0';
    node.style.background = 'transparent';
    node.style.border = '0';
    node.style.boxShadow = 'none';
    node.style.overflow = 'visible';

    // Find or create the inner .sp-sb-card
    let card = node.querySelector(':scope > .sp-sb-card');
    if (!card) {
        node.replaceChildren();
        card = document.createElement('div');
        node.appendChild(card);
    }

    const hasHighlight = re.highlightBorder !== false;
    const hasPop = re.motionPop !== false;
    const hasDim = Boolean(re.dimWhenIdle);

    // Apply classes and CSS variables to the inner card
    card.className = `sp-sb-card layout-${layout} ${speaking ? 'is-speaking' : 'is-idle'}${b.autoSize !== false ? ' is-auto-size' : ''}${hasHighlight ? ' has-highlight' : ''}${hasPop ? ' has-pop' : ''}${hasDim ? ' has-dim' : ''}`;
    card.style.setProperty('--sb-active-color', activeColor);
    card.style.setProperty('--sb-glow-spread', `${glowSpread}px`);
    card.style.setProperty('--sb-active-glow', activeColor + (activeColor.length === 7 ? '55' : ''));
    card.style.setProperty('--sb-idle-opacity', String(re.idleOpacity ?? 0.7));
    card.style.setProperty('--sb-bar-color', barColor);
    card.style.setProperty('--cspan-status-color', callIn.statusColor || '#22c55e');
    card.style.setProperty('--sb-avatar-scale', String(Math.max(0.5, Math.min(2, Number(sp.avatarScale) || 1))));
    card.style.setProperty('--sb-icon-scale', String(Math.max(0.5, Math.min(1.8, Number(sp.iconScale) || 1))));
    card.style.setProperty('--sb-fit-scale', '1');
    const padding = layout === 'horizontal' ? [16, 10] : layout === 'compact-pill' ? [14, 6] : layout === 'vertical-card' ? [12, 14] : [12, 6];
    card.style.setProperty('--sb-padding-x', `${b.paddingX ?? padding[0]}px`);
    card.style.setProperty('--sb-padding-y', `${b.paddingY ?? padding[1]}px`);
    card.style.setProperty('--sb-subtitle-font', b.typography?.subtitleFontFamily || 'inherit');
    card.style.setProperty('--sb-pill-font', b.typography?.pillFontFamily || 'inherit');
    for (const font of [b.typography?.subtitleFontFamily, b.typography?.pillFontFamily]) if (font) loadGoogleFont(font);

    // Typography & proportional font scaling
    const defaultFs = layout === 'cspan-banner' ? 18 : layout === 'compact-pill' ? 14 : layout === 'vertical-card' ? 16 : 17;
    const fs = Number(s.fontSize) > 0 ? Number(s.fontSize) : defaultFs;
    card._speakerAutoSize = b.autoSize !== false;
    card._speakerBaseFontSize = card._speakerAutoSize ? defaultFs : fs;
    card._speakerLetterSpacing = Number(s.letterSpacing) || 0;
    if (layout !== 'avatar-only' && root.requestAnimationFrame) {
        const scheduleFit = () => {
            if (node._speakerFitFrame) root.cancelAnimationFrame(node._speakerFitFrame);
            node._speakerFitFrame = root.requestAnimationFrame(() => {
                node._speakerFitFrame = 0;
                fitSpeakerBadge(node);
            });
        };
        scheduleFit();
        if (!node._fitObserver && root.ResizeObserver) {
            node._fitObserver = new root.ResizeObserver(scheduleFit);
            node._fitObserver.observe(node);
        }
    }
    card.style.setProperty('--sb-font-size', `${fs}px`);
    card.style.setProperty('--sb-handle-size', `${Math.max(9, Math.round(fs * 0.72))}px`);
    card.style.setProperty('--sb-pronouns-size', `${Math.max(9, Math.round(fs * 0.65))}px`);
    card.style.setProperty('--sb-tag-size', `${Math.max(8, Math.round(fs * 0.60))}px`);
    card.style.setProperty('--sb-loc-size', `${Math.max(8, Math.round(fs * 0.65))}px`);
    card.style.setProperty('--sb-line-height', String(Number(s.lineHeight) > 0 ? s.lineHeight : 1.2));
    const textAlign = s.textAlign || (layout === 'vertical-card' ? 'center' : 'left');
    card.style.setProperty('--sb-justify', textAlign === 'right' ? 'flex-end' : textAlign === 'center' ? 'center' : 'flex-start');
    card.style.setProperty('--sb-valign', s.verticalAlign === 'top' ? 'flex-start' : s.verticalAlign === 'bottom' ? 'flex-end' : 'center');
    card.style.letterSpacing = `${Number(s.letterSpacing) || 0}px`;
    if (s.fontWeight) {
        card.style.setProperty('--sb-font-weight', String(s.fontWeight));
    } else if (card.style.removeProperty) {
        card.style.removeProperty('--sb-font-weight');
    } else {
        card.style.setProperty('--sb-font-weight', '');
    }
    card.style.color = s.color || '#ffffff';
    if (s.fontFamily) {
        card.style.fontFamily = s.fontFamily;
        loadGoogleFont(s.fontFamily);
    } else {
        card.style.fontFamily = '';
    }
    card.style.textAlign = textAlign;

    // Apply style background, borders, blur, and shadows to card (unless avatar-only)
    if (layout === 'avatar-only') {
        card.style.background = 'transparent';
        card.style.backgroundImage = 'none';
        card.style.backgroundSize = '';
        card.style.animation = '';
        card.style.borderColor = 'transparent';
        card.style.borderWidth = '0';
        card.style.borderRadius = '0';
        card.style.setProperty('--sb-base-shadow', 'none');
        card.style.backdropFilter = '';
        card.style.webkitBackdropFilter = '';
    } else {
        // Background fill & gradient
        if (s.gradient?.enabled) {
            const gradStyle = gradientStyle(s.gradient);
            card.style.background = gradStyle.background;
            card.style.backgroundSize = gradStyle.backgroundSize;
            card.style.animation = gradStyle.animation;
        } else if (s.background !== undefined && s.background !== '') {
            card.style.background = s.background;
            card.style.backgroundImage = 'none';
            card.style.backgroundSize = '';
            card.style.animation = '';
        } else {
            card.style.background = 'rgba(18, 18, 26, 0.9)';
            card.style.backgroundImage = 'none';
            card.style.backgroundSize = '';
            card.style.animation = '';
        }

        card.style.borderColor = s.borderColor || 'rgba(255, 255, 255, 0.12)';
        card.style.borderWidth = `${s.borderWidth != null && s.borderWidth !== '' ? s.borderWidth : 2}px`;
        card.style.borderStyle = s.borderStyle || 'solid';
        card.style.borderRadius = layout === 'compact-pill' ? '999px' : `${s.borderRadius != null && s.borderRadius !== '' ? s.borderRadius : 14}px`;

        if (Number(s.blur) > 0) {
            card.style.backdropFilter = `blur(${s.blur}px)`;
            card.style.webkitBackdropFilter = `blur(${s.blur}px)`;
        } else {
            card.style.backdropFilter = '';
            card.style.webkitBackdropFilter = '';
        }

        if (s.shadow && (Number(s.shadow.blur) > 0 || Number(s.shadow.spread) > 0 || Number(s.shadow.x) || Number(s.shadow.y))) {
            const sh = s.shadow;
            card.style.setProperty('--sb-base-shadow', `${sh.x || 0}px ${sh.y != null ? sh.y : 4}px ${sh.blur || 0}px ${sh.spread || 0}px ${sh.color || 'rgba(0,0,0,0.5)'}`);
        } else {
            card.style.setProperty('--sb-base-shadow', '0 4px 16px rgba(0,0,0,0.25)');
        }
    }

    card.replaceChildren();

    // 1. Avatar
    const avatarShape = sp.avatarShape || 'circle';
    const avatarWrap = document.createElement('div');
    avatarWrap.className = `sp-sb-avatar-wrap shape-${avatarShape}`;

    const isCallIn = layout === 'cspan-banner' || callIn.enabled;
    if (sp.avatarSrc) {
        const img = document.createElement('img');
        img.className = `sp-sb-avatar shape-${avatarShape}`;
        img.src = sp.avatarSrc;
        img.alt = sp.name || 'Speaker avatar';
        img.draggable = false;
        avatarWrap.appendChild(img);
    } else {
        const placeholder = document.createElement('div');
        placeholder.className = `sp-sb-avatar-placeholder shape-${avatarShape}`;
        if (isCallIn) {
            // Inline phone icon for call-in / C-SPAN (Strict No-Emoji Policy)
            placeholder.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>';
        } else {
            // Inline user profile icon (Strict No-Emoji Policy)
            placeholder.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>';
        }
        avatarWrap.appendChild(placeholder);
    }

    if (re.visualizer === 'pulse-ring' || re.visualizer === 'both' || layout === 'avatar-only') {
        const ring = document.createElement('div');
        ring.className = 'sp-sb-pulse-ring';
        avatarWrap.appendChild(ring);
    }

    const buildEqBars = (customClass = '') => {
        if (re.visualizer !== 'bars' && re.visualizer !== 'both') return null;
        const barContainer = document.createElement('div');
        barContainer.className = `sp-sb-eq-bars ${customClass}`.trim();
        const count = Math.max(3, Math.min(8, Number(re.barCount) || 5));
        for (let i = 0; i < count; i++) {
            const bar = document.createElement('span');
            bar.className = 'sp-sb-eq-bar';
            barContainer.appendChild(bar);
        }
        return barContainer;
    };

    const buildCallInPill = (size = 'normal') => {
        if (!callIn.enabled) return null;
        const pill = document.createElement('span');
        pill.className = `sp-sb-callin-tag size-${size}`;

        const dot = document.createElement('span');
        dot.className = 'cspan-live-dot';
        pill.appendChild(dot);

        const label = document.createElement('span');
        label.className = 'cspan-status-label';
        label.textContent = callIn.statusText || 'ON THE LINE';
        pill.appendChild(label);

        return pill;
    };

    const buildLocationEl = () => {
        if (callIn.showLocation === false || !callIn.location) return null;
        const loc = document.createElement('span');
        loc.className = 'sp-sb-location';
        loc.innerHTML = '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-1px;margin-right:2px;opacity:0.85;"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>';
        const txt = document.createElement('span');
        txt.textContent = callIn.location;
        loc.appendChild(txt);
        return loc;
    };

    // Layout 5: Avatar Only
    if (layout === 'avatar-only') {
        card.appendChild(avatarWrap);
        const eq = buildEqBars('avatar-corner-eq');
        if (eq) card.appendChild(eq);
        return;
    }

    // Layout 2: C-SPAN Banner
    if (layout === 'cspan-banner') {
        const header = document.createElement('div');
        header.className = 'cspan-header-bar';

        const statusTag = document.createElement('span');
        statusTag.className = 'cspan-status-tag';

        const dot = document.createElement('span');
        dot.className = 'cspan-live-dot';
        statusTag.appendChild(dot);

        const statusLabel = document.createElement('span');
        statusLabel.className = 'cspan-status-label';
        statusLabel.textContent = callIn.statusText || 'ON THE LINE';
        statusTag.appendChild(statusLabel);
        header.appendChild(statusTag);

        if (callIn.showLocation !== false && callIn.location) {
            const loc = document.createElement('span');
            loc.className = 'cspan-location';
            loc.textContent = callIn.location;
            header.appendChild(loc);
        }
        card.appendChild(header);

        const mainRow = document.createElement('div');
        mainRow.className = 'cspan-main-row';

        if (sp.showAvatar !== false) {
            mainRow.appendChild(avatarWrap);
        }

        const meta = document.createElement('div');
        meta.className = 'sp-sb-meta';

        const nameRow = document.createElement('div');
        nameRow.className = 'sp-sb-row';

        const nameEl = document.createElement('span');
        nameEl.className = 'sp-sb-name';
        nameEl.textContent = sp.name || 'Caller';
        nameRow.appendChild(nameEl);
        const detailsRow = document.createElement('div');
        detailsRow.className = 'sp-sb-row sp-sb-details';

        if (sp.showPronouns !== false && sp.pronouns) {
            const pro = document.createElement('span');
            pro.className = 'sp-sb-pronouns';
            pro.textContent = sp.pronouns;
            detailsRow.appendChild(pro);
        }
        meta.appendChild(nameRow);
        if (detailsRow.hasChildNodes()) meta.appendChild(detailsRow);

        if (sp.showHandle !== false && sp.handle) {
            const hEl = document.createElement('span');
            hEl.className = 'sp-sb-handle';
            hEl.textContent = sp.handle;
            meta.appendChild(hEl);
        }
        mainRow.appendChild(meta);

        const eq = buildEqBars();
        if (eq) mainRow.appendChild(eq);

        card.appendChild(mainRow);
        return;
    }

    // Layout 4: Vertical Sidebar Card
    if (layout === 'vertical-card') {
        if (sp.showAvatar !== false) {
            card.appendChild(avatarWrap);
        }

        const callPill = buildCallInPill('small');

        const meta = document.createElement('div');
        meta.className = 'sp-sb-meta';

        const nameRow = document.createElement('div');
        nameRow.className = 'sp-sb-row';

        const nameEl = document.createElement('span');
        nameEl.className = 'sp-sb-name';
        nameEl.textContent = sp.name || 'Speaker';
        nameRow.appendChild(nameEl);
        const detailsRow = document.createElement('div');
        detailsRow.className = 'sp-sb-row sp-sb-details';

        if (sp.showPronouns !== false && sp.pronouns) {
            const pro = document.createElement('span');
            pro.className = 'sp-sb-pronouns';
            pro.textContent = sp.pronouns;
            detailsRow.appendChild(pro);
        }
        if (callPill) detailsRow.appendChild(callPill);
        meta.appendChild(nameRow);
        if (detailsRow.hasChildNodes()) meta.appendChild(detailsRow);

        const subRow = document.createElement('div');
        subRow.className = 'sp-sb-row sp-sb-subrow';

        if (sp.showHandle !== false && sp.handle) {
            const hEl = document.createElement('span');
            hEl.className = 'sp-sb-handle';
            hEl.textContent = sp.handle;
            subRow.appendChild(hEl);
        }

        const loc = buildLocationEl();
        if (loc) subRow.appendChild(loc);

        if (subRow.hasChildNodes()) meta.appendChild(subRow);
        card.appendChild(meta);

        const eq = buildEqBars();
        if (eq) card.appendChild(eq);
        return;
    }

    // Layout 3: Compact Pill
    if (layout === 'compact-pill') {
        if (sp.showAvatar !== false) {
            card.appendChild(avatarWrap);
        }

        const callPill = buildCallInPill('compact');

        const meta = document.createElement('div');
        meta.className = 'sp-sb-meta';

        const nameRow = document.createElement('div');
        nameRow.className = 'sp-sb-row';

        const nameEl = document.createElement('span');
        nameEl.className = 'sp-sb-name';
        nameEl.textContent = sp.name || 'Speaker';
        nameRow.appendChild(nameEl);
        const detailsRow = document.createElement('div');
        detailsRow.className = 'sp-sb-row sp-sb-details';
        const subRow = document.createElement('div');
        subRow.className = 'sp-sb-row sp-sb-subrow';

        if (sp.showPronouns !== false && sp.pronouns) {
            const pro = document.createElement('span');
            pro.className = 'sp-sb-pronouns';
            pro.textContent = sp.pronouns;
            detailsRow.appendChild(pro);
        }
        if (callPill) detailsRow.appendChild(callPill);

        if (sp.showHandle !== false && sp.handle) {
            const hEl = document.createElement('span');
            hEl.className = 'sp-sb-handle';
            hEl.textContent = sp.handle;
            subRow.appendChild(hEl);
        }

        const loc = buildLocationEl();
        if (loc) subRow.appendChild(loc);

        meta.appendChild(nameRow);
        if (detailsRow.hasChildNodes()) meta.appendChild(detailsRow);
        if (subRow.hasChildNodes()) meta.appendChild(subRow);
        card.appendChild(meta);

        const eq = buildEqBars();
        if (eq) card.appendChild(eq);
        return;
    }

    // Layout 1: Horizontal Lower-Third (Default)
    if (sp.showAvatar !== false) {
        card.appendChild(avatarWrap);
    }

    const meta = document.createElement('div');
    meta.className = 'sp-sb-meta';

    const nameRow = document.createElement('div');
    nameRow.className = 'sp-sb-row';

    const nameEl = document.createElement('span');
    nameEl.className = 'sp-sb-name';
    nameEl.textContent = sp.name || 'Speaker';
    nameRow.appendChild(nameEl);
    const detailsRow = document.createElement('div');
    detailsRow.className = 'sp-sb-row sp-sb-details';

    if (sp.showPronouns !== false && sp.pronouns) {
        const pro = document.createElement('span');
        pro.className = 'sp-sb-pronouns';
        pro.textContent = sp.pronouns;
        detailsRow.appendChild(pro);
    }

    const callPill = buildCallInPill('normal');
    if (callPill) detailsRow.appendChild(callPill);

    meta.appendChild(nameRow);
    if (detailsRow.hasChildNodes()) meta.appendChild(detailsRow);

    const subRow = document.createElement('div');
    subRow.className = 'sp-sb-row sp-sb-subrow';

    if (sp.showHandle !== false && sp.handle) {
        const hEl = document.createElement('span');
        hEl.className = 'sp-sb-handle';
        hEl.textContent = sp.handle;
        subRow.appendChild(hEl);
    }

    const loc = buildLocationEl();
    if (loc) subRow.appendChild(loc);

    if (subRow.hasChildNodes()) meta.appendChild(subRow);
    card.appendChild(meta);

    const eq = buildEqBars();
    if (eq) card.appendChild(eq);
}

export { renderSpeakerBadge };

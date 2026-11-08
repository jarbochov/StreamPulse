import { playSoundValue } from './audio.js';
import { root } from './environment.js';
import { applyMediaFilter } from './filters.js';
import { loadGoogleFont } from './fonts.js';
import { cleanupNode } from './lifecycle.js';
import { applyBorderEffects, decorationStyle, textEffectStyle } from './styles.js';


const ALERT_SAMPLE_IMAGE = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" fill="#8957e5"/><path d="M50 22l8.5 18 19.5 2.4-14.5 13.4 3.9 19.3L50 65l-17.4 10 3.9-19.3L22 42.4 41.500 40z" fill="#ffd166"/></svg>')}`;
const ALERT_SAMPLE = { title: 'TestViewer just followed!', message: 'Thanks for the support', image: ALERT_SAMPLE_IMAGE, animOut: 'fade' };
function alertSample(el) {
    const a = el?.alert || {};
    if (a.sampleImage) return { ...ALERT_SAMPLE, image: a.sampleImage };
    if (a.sampleEmoji) return { ...ALERT_SAMPLE, image: '', emoji: a.sampleEmoji };
    return ALERT_SAMPLE;
}

// Alert box: the element's fill/border/shadow move onto an inner card so they only show while an alert plays.
const ALERT_DECORATION = [
    'background', 'backgroundColor', 'backgroundImage', 'backgroundSize', 'backgroundPosition', 'backgroundRepeat',
    'animation', 'border', 'borderColor', 'borderWidth', 'borderStyle', 'borderRadius', 'boxShadow', 'backdropFilter', 'webkitBackdropFilter'
];
function prepareAlertNode(node, element) {
    const deco = {};
    const style = element?.style || {};

    if (style.background && style.background !== 'transparent') {
        deco.background = style.background;
        deco.backgroundColor = style.background;
    }
    if (style.borderWidth > 0 && style.borderColor && style.borderColor !== 'transparent') {
        deco.border = `${style.borderWidth}px solid ${style.borderColor}`;
        deco.borderColor = style.borderColor;
        deco.borderWidth = `${style.borderWidth}px`;
        deco.borderStyle = 'solid';
    }
    if (style.borderRadius) {
        deco.borderRadius = `${style.borderRadius}px`;
    }
    if (style.padding) {
        deco.padding = `${style.padding}px`;
    }
    if (style.blur > 0) {
        deco.backdropFilter = `blur(${style.blur}px)`;
        deco.webkitBackdropFilter = `blur(${style.blur}px)`;
    }
    if (style.shadow?.blur > 0) {
        deco.boxShadow = `0 4px ${style.shadow.blur}px ${style.shadow.color || 'rgba(0,0,0,.5)'}`;
    }
    if (style.gradient?.enabled) {
        Object.assign(deco, decorationStyle(style, 'alert'));
    }

    for (const key of ALERT_DECORATION) {
        // applyElementStyle zeroes the alert's own radius, which must not overwrite the card's radius
        if (node.style[key] && !(key === 'borderRadius' && deco.borderRadius)) deco[key] = node.style[key];
        node.style[key] = '';
    }
    if (node._borderRing) { node._borderRing.remove(); node._borderRing = null; }
    if (node._borderFxRing) { node._borderFxRing.remove(); node._borderFxRing = null; }
    if (node._innerGlowRing) { node._innerGlowRing.remove(); node._innerGlowRing = null; }
    if (node._borderObserver) { node._borderObserver.disconnect(); node._borderObserver = null; }
    node.style.border = '0';
    node.style.outline = 'none';
    node.style.background = 'transparent';
    node.style.backgroundColor = 'transparent';
    node.style.boxShadow = 'none';
    node.style.backdropFilter = 'none';
    node.style.webkitBackdropFilter = 'none';
    node.style.display = 'block';
    node._alertDeco = deco;
}

// Plays one alert inside `node`. Returns { stop } so a skip/clear can end it early.
function spawnEmoteParticles(card, payload, node, boxScale = 1) {
    const effect = payload.emoteEffect;
    if (!effect || effect === 'showcase' || !['rain', 'party', 'fountain', 'bounce'].includes(effect)) return;
    const emoteUrl = payload.emojiUrl || (/^(https?:\/\/|\/|data:image\/)/i.test(payload.emoji) ? payload.emoji : '');
    const isFa = !emoteUrl && payload.emoji && (payload.emoji.startsWith('fa-') || payload.emoji.includes('fa-'));
    const rawEmoji = payload.emoji || '🎉';
    if (!emoteUrl && !isFa && !rawEmoji) return;

    const container = document.createElement('div');
    container.className = `alert-emote-particles effect-${effect}`;

    const density = Math.max(10, Math.min(80, Number(payload.emoteDensity) || 30));
    const scaleFactor = Math.max(0.4, Math.min(2.5, (Number(payload.emoteScale) || 100) / 100)) * boxScale;
    const durMs = Math.max(3000, Number(payload.durationMs) || 6000);

    for (let p = 0; p < density; p++) {
        const item = document.createElement('div');
        item.className = 'alert-emote-particle';

        const baseSize = 30 + Math.random() * 26;
        const size = Math.round(baseSize * scaleFactor);
        item.style.width = `${size}px`;
        item.style.height = `${size}px`;

        if (emoteUrl) {
            const img = document.createElement('img');
            img.src = emoteUrl;
            img.alt = '';
            img.draggable = false;
            item.appendChild(img);
        } else if (isFa) {
            const icon = document.createElement('i');
            icon.className = rawEmoji;
            icon.style.fontSize = `${size}px`;
            item.appendChild(icon);
        } else {
            const span = document.createElement('span');
            span.textContent = rawEmoji;
            span.style.fontSize = `${size}px`;
            span.style.lineHeight = '1';
            item.appendChild(span);
        }

        const rot1 = `${Math.round(-35 + Math.random() * 70)}deg`;
        const rot2 = `${Math.round(-55 + Math.random() * 110)}deg`;
        const rot3 = `${Math.round(-120 + Math.random() * 240)}deg`;
        item.style.setProperty('--rot1', rot1);
        item.style.setProperty('--rot2', rot2);
        item.style.setProperty('--rot3', rot3);

        if (effect === 'rain') {
            const left = (2 + Math.random() * 94).toFixed(1);
            const animDur = (1.4 + Math.random() * 1.6).toFixed(2);
            const delay = (Math.random() * (durMs > 5000 ? 3.5 : 2)).toFixed(2);
            const drift = Math.round(-30 + Math.random() * 60);
            item.style.left = `${left}%`;
            item.style.top = '0';
            item.style.setProperty('--drift', `${drift}px`);
            item.style.setProperty('--rot', rot2);
            item.style.animation = `alert-rain-fall ${animDur}s cubic-bezier(0.25, 0.46, 0.45, 0.94) ${delay}s infinite`;
        } else if (effect === 'party') {
            const angle = Math.random() * 2 * Math.PI;
            const distance = 90 + Math.random() * 280;
            const vx = Math.round(Math.cos(angle) * distance);
            const vy = Math.round(Math.sin(angle) * distance);
            const animDur = (1.6 + Math.random() * 1.3).toFixed(2);
            const delay = (Math.random() * 2.5).toFixed(2);
            item.style.left = '50%';
            item.style.top = '50%';
            item.style.setProperty('--vx', `${vx}px`);
            item.style.setProperty('--vy', `${vy}px`);
            item.style.animation = `alert-party-burst ${animDur}s cubic-bezier(0.18, 0.89, 0.32, 1.28) ${delay}s infinite`;
        } else if (effect === 'fountain') {
            const left = (44 + Math.random() * 12).toFixed(1);
            const fx = Math.round(-180 + Math.random() * 360);
            const fy = Math.round(160 + Math.random() * 220);
            const animDur = (1.8 + Math.random() * 1.2).toFixed(2);
            const delay = (Math.random() * 2.8).toFixed(2);
            item.style.left = `${left}%`;
            item.style.top = '95%';
            item.style.setProperty('--fx', `${fx}px`);
            item.style.setProperty('--fy', `${fy}px`);
            item.style.animation = `alert-fountain-spray ${animDur}s cubic-bezier(0.15, 0.85, 0.35, 1.2) ${delay}s infinite`;
        } else if (effect === 'bounce') {
            const left = (5 + Math.random() * 90).toFixed(1);
            const top = (20 + Math.random() * 60).toFixed(1);
            const animDur = (2.0 + Math.random() * 1.5).toFixed(2);
            const delay = (Math.random() * 2.0).toFixed(2);
            item.style.left = `${left}%`;
            item.style.top = `${top}%`;
            item.style.animation = `alert-bounce-float ${animDur}s ease-in-out ${delay}s infinite`;
        }

        container.appendChild(item);
    }
    card.appendChild(container);
}

const ALERT_PRESENTATION_KEYS = ['layout', 'hideText', 'hideMessage', 'effectsTarget', 'mediaFit',
    'mediaFocusX', 'mediaFocusY', 'padding', 'mediaScale', 'titleSize', 'messageSize', 'titleColor', 'gap'];

function resolveAlertLook(element, { ruleId, lookId } = {}) {
    const base = element.alert || {};
    const look = (base.looks || []).find(l => lookId ? l.id === lookId : ruleId && (l.ruleIds || []).includes(ruleId));
    if (!look) return element;
    const presentation = look.alert || Object.fromEntries(ALERT_PRESENTATION_KEYS.filter(k => k in look).map(k => [k, look[k]]));
    return {
        ...element,
        alert: { ...base, ...Object.fromEntries(ALERT_PRESENTATION_KEYS.filter(k => k in presentation).map(k => [k, presentation[k]])) },
        style: { ...element.style, ...look.style, rotate: element.style?.rotate || 0 },
        mediaFilter: look.mediaFilter || element.mediaFilter
    };
}

function playAlert(node, element, payload, { sound = true, onEnd, lookId } = {}) {
    const baseElement = element;
    element = resolveAlertLook(element, { ruleId: payload.ruleId, lookId });
    const cfg = element.alert || {};
    const style = element.style || {};
    const layout = payload.image || payload.video || payload.emoji ? (cfg.layout || 'stack') : 'text';
    const card = document.createElement('div');
    card.className = `alert-card layout-${layout}`;
    
    const deco = element === baseElement ? Object.assign({}, node._alertDeco || {}) : {};
    if (!deco.background && !deco.backgroundColor && style.background && style.background !== 'transparent') {
        deco.background = style.background;
        deco.backgroundColor = style.background;
    }
    if (!deco.borderRadius && style.borderRadius) {
        deco.borderRadius = `${style.borderRadius}px`;
    }
    if (!deco.border && style.borderWidth > 0 && style.borderColor && style.borderColor !== 'transparent') {
        deco.border = `${style.borderWidth}px ${style.borderStyle || 'solid'} ${style.borderColor}`;
    }
    if (!deco.boxShadow && style.shadow?.blur > 0) {
        deco.boxShadow = `0 4px ${style.shadow.blur}px ${style.shadow.color || 'rgba(0,0,0,.5)'}`;
    }
    if (!deco.backdropFilter && style.blur > 0) {
        deco.backdropFilter = `blur(${style.blur}px)`;
        deco.webkitBackdropFilter = `blur(${style.blur}px)`;
    }
    if (style.gradient?.enabled) {
        Object.assign(deco, decorationStyle(style, 'alert'));
    }

    Object.assign(card.style, deco);
    node.style.opacity = '1';
    card.style.opacity = style.opacity ?? 1;
    node._alertPresentation = element;
    loadGoogleFont(style.fontFamily);
    applyBorderEffects(card, style, element);
    card.style.gap = `${cfg.gap ?? 12}px`;
    const customPad = cfg.padding === null || cfg.padding === undefined || cfg.padding === '' ? NaN : Number(cfg.padding);
    card.style.padding = `${Number.isFinite(customPad) ? Math.max(0, Math.min(200, customPad)) : (style.padding || 8)}px`;
    let mediaFxWrap = null;
    const hasMedia = layout !== 'text' && (payload.video || payload.image || payload.emoji);
    if (hasMedia) {
        const isEmoji = !payload.video && !payload.image;
        const media = document.createElement(isEmoji ? 'div' : payload.video ? 'video' : 'img');
        const scale = Math.max(10, Math.min(100, Number(cfg.mediaScale) || 60));
        const focusPos = v => Number.isFinite(Number(v)) && v !== null && v !== '' ? Math.max(0, Math.min(100, Number(v))) : 50;
        const hasPayloadFocus = payload.focusX !== undefined && (payload.focusX !== 50 || payload.focusY !== 50);
        const fitMode = hasPayloadFocus ? 'cover' : (cfg.mediaFit || 'contain');
        const focusPosition = hasPayloadFocus ? `${focusPos(payload.focusX)}% ${focusPos(payload.focusY)}%` : `${focusPos(cfg.mediaFocusX)}% ${focusPos(cfg.mediaFocusY)}%`;
        if (isEmoji) {
            const emoteUrl = payload.emojiUrl || (/^(https?:\/\/|\/|data:image\/)/i.test(payload.emoji) ? payload.emoji : '');
            const isFa = !emoteUrl && payload.emoji && (payload.emoji.startsWith('fa-') || payload.emoji.includes('fa-'));
            const emoteScale = Math.max(20, Math.min(300, Number(payload.emoteScale) || 100)) / 100;
            const count = Math.max(1, Math.min(25, Number(payload.emojiRepeat || 1)));

            if (emoteUrl) {
                media.style.display = 'inline-flex';
                media.style.alignItems = 'center';
                media.style.justifyContent = 'center';
                media.style.gap = '8px';
                for (let c = 0; c < count; c++) {
                    const img = document.createElement('img');
                    img.className = 'alert-emote-img';
                    img.src = emoteUrl;
                    img.alt = '';
                    img.draggable = false;
                    img.style.height = '100%';
                    img.style.width = 'auto';
                    img.style.maxHeight = '100%';
                    media.appendChild(img);
                }
            } else if (isFa) {
                if (!document.querySelector('link[data-fa]')) {
                    const link = document.createElement('link');
                    link.rel = 'stylesheet'; link.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css'; link.dataset.fa = '1';
                    document.head.appendChild(link);
                }
                const icon = document.createElement('i');
                icon.className = payload.emoji;
                media.appendChild(icon);
            } else {
                media.textContent = payload.emoji;
            }
            const clientH = node.clientHeight || 240;
            const clientW = node.clientWidth || 400;
            const boxH = clientH * (layout === 'media' ? 1 : scale / 100);
            const boxW = clientW * (layout === 'side' ? 0.5 : 1) * 0.9;
            const targetH = layout === 'media' ? Math.max(32, Math.min(clientH * 0.9 * emoteScale, clientH * 0.95)) : Math.max(48, Math.min(boxH * 0.9, clientH * 0.85)) * emoteScale;
            media.style.fontSize = `${Math.max(28, Math.min(targetH, boxW / (count * 1.05)))}px`;
            media.style.height = `${Math.round(targetH)}px`;
            media.style.lineHeight = '1';
            media.style.whiteSpace = 'nowrap';
        } else {
            media.src = payload.video || payload.image;
            if (payload.video) {
                const videoHasAudio = (cfg.videoSound === true || payload.videoSound === true) && sound;
                media.autoplay = true;
                media.loop = (cfg.videoLoop !== false && payload.videoLoop !== false);
                media.muted = !videoHasAudio;
                if (videoHasAudio) {
                    media.volume = Math.max(0, Math.min(1, (Number(cfg.videoVolume ?? payload.videoVolume ?? payload.volume ?? 100)) / 100));
                    const playPromise = media.play();
                    if (playPromise && playPromise.catch) {
                        playPromise.catch(() => {
                            media.muted = true;
                            media.play().catch(() => {});
                        });
                    }
                }
                media.playsInline = true;
            }
            media.draggable = false;
            media.style.objectFit = fitMode;
            if (fitMode === 'cover') media.style.objectPosition = focusPosition;
        }
        media.className = isEmoji ? 'alert-media is-emote' : 'alert-media';
        if (!isEmoji) {
            if (layout === 'side') { media.style.width = `${scale}%`; media.style.maxWidth = '50%'; media.style.height = '100%'; }
            else if (layout === 'media') { media.style.width = '100%'; media.style.height = '100%'; }
            else { media.style.height = `${scale}%`; media.style.maxWidth = '100%'; if (hasPayloadFocus) media.style.width = '100%'; }
        } else if (layout === 'media') {
            media.style.position = 'absolute'; media.style.inset = '0'; media.style.display = 'flex'; media.style.alignItems = 'center'; media.style.justifyContent = 'center';
        } else if (layout === 'side') {
            media.style.width = `${scale}%`; media.style.maxWidth = '50%';
        } else {
            media.style.maxWidth = '100%';
        }
        if (cfg.effectsTarget === 'media') {
            const wrap = document.createElement('div');
            wrap.className = media.className;
            wrap.style.cssText = media.style.cssText;
            wrap.style.position = wrap.style.position || 'relative';
            if (!isEmoji) {
                wrap.style.display = 'flex';
                wrap.style.width = layout === 'stack' && !hasPayloadFocus ? '' : wrap.style.width;
                media.className = 'alert-media-el';
                media.style.cssText = `height:100%;width:${layout === 'stack' && !hasPayloadFocus ? 'auto' : '100%'};max-width:100%;object-fit:${fitMode};object-position:${fitMode === 'cover' ? focusPosition : '50% 50%'}`;
                wrap.appendChild(media);
                wrap.style.maxWidth = layout === 'side' ? '50%' : '100%';
                mediaFxWrap = wrap;
            } else {
                mediaFxWrap = wrap;
                wrap.append(...media.childNodes);
            }
            card.appendChild(wrap);
        } else card.appendChild(media);
    }
    const hideText = cfg.hideText === true;
    if (!hideText && (layout !== 'media' || payload.title || payload.message)) {
        const text = document.createElement('div');
        text.className = 'alert-text';
        text.style.color = style.color || '#fff';
        text.style.fontFamily = style.fontFamily || 'sans-serif';
        text.style.fontWeight = style.fontWeight || '400';
        if (style.lineHeight) text.style.lineHeight = style.lineHeight;
        if (style.letterSpacing !== undefined && style.letterSpacing !== '') text.style.letterSpacing = `${style.letterSpacing}px`;
        Object.assign(text.style, textEffectStyle(style, 'alert'));
        
        const textAlign = style.textAlign || (layout === 'side' ? 'left' : 'center');
        text.style.textAlign = textAlign;
        text.style.alignItems = textAlign === 'left' ? 'flex-start' : textAlign === 'right' ? 'flex-end' : 'center';

        if (layout === 'media') {
            const vAlign = style.verticalAlign || 'bottom';
            const pad = Number.isFinite(customPad) ? Math.max(0, Math.min(200, customPad)) : (style.padding ?? 16);
            text.style.paddingLeft = `${Math.max(16, pad)}px`;
            text.style.paddingRight = `${Math.max(16, pad)}px`;
            if (vAlign === 'top') {
                text.style.top = `${pad}px`;
                text.style.bottom = 'auto';
                text.style.transform = 'none';
            } else if (vAlign === 'middle') {
                text.style.top = '50%';
                text.style.bottom = 'auto';
                text.style.transform = 'translateY(-50%)';
            } else {
                text.style.bottom = `${pad}px`;
                text.style.top = 'auto';
                text.style.transform = 'none';
            }
        } else if (layout === 'stack' || layout === 'text') {
            const vAlign = style.verticalAlign || 'middle';
            card.style.justifyContent = vAlign === 'top' ? 'flex-start' : vAlign === 'bottom' ? 'flex-end' : 'center';
            if (textAlign === 'left') card.style.alignItems = 'flex-start';
            else if (textAlign === 'right') card.style.alignItems = 'flex-end';
            else card.style.alignItems = 'center';
        } else if (layout === 'side') {
            const vAlign = style.verticalAlign || 'middle';
            card.style.alignItems = vAlign === 'top' ? 'flex-start' : vAlign === 'bottom' ? 'flex-end' : 'center';
            card.style.justifyContent = textAlign === 'left' ? 'flex-start' : textAlign === 'right' ? 'flex-end' : 'center';
        }

        if (payload.title) {
            const title = document.createElement('div');
            title.className = 'alert-title';
            title.textContent = payload.title;
            title.style.fontSize = `${cfg.titleSize || 44}px`;
            title.style.color = cfg.titleColor || '#ffd166';
            title.style.fontWeight = style.fontWeight || '700';
            title.style.textAlign = textAlign;
            text.appendChild(title);
        }
        if (payload.message && cfg.hideMessage !== true) {
            const message = document.createElement('div');
            message.className = 'alert-message';
            message.textContent = payload.message;
            message.style.fontSize = `${cfg.messageSize || 28}px`;
            message.style.fontWeight = style.fontWeight || '400';
            message.style.textAlign = textAlign;
            text.appendChild(message);
        }
        card.appendChild(text);
    }
    if (payload.emoteEffect && payload.emoteEffect !== 'showcase') {
        const fillBox = layout === 'media';
        const boxScale = fillBox ? Math.max(0.6, Math.min(2.5, Math.min(node.clientWidth || 400, node.clientHeight || 240) / 200)) : 1;
        spawnEmoteParticles(fillBox && mediaFxWrap ? mediaFxWrap : card, payload, node, boxScale);
    }
    node.replaceChildren(card);
    if (mediaFxWrap && cfg.effectsTarget === 'media') {
        const fxEl = { id: `${element.id}-alert-media`, type: mediaFxWrap.querySelector('.alert-media-el') ? 'image' : 'text', width: node.clientWidth || element.width, height: node.clientHeight || element.height, mediaFilter: element.mediaFilter, style: {} };
        applyMediaFilter(mediaFxWrap, fxEl);
    }
    applyMediaFilter(node, element);
    card.classList.add(`alert-in-${payload.animIn || 'pop'}`);
    // An inline decoration animation (animated gradient) overrides the entrance class, so run both
    const decoAnim = card.style.animation;
    if (decoAnim && payload.animIn !== 'none') {
        card.style.animation = '';
        const entrance = getComputedStyle(card).animation;
        if (entrance && !entrance.startsWith('none')) {
            card.style.animation = `${entrance}, ${decoAnim}`;
            card.addEventListener('animationend', e => { if (e.target === card && /^alert-.*-in$/.test(e.animationName)) card.style.animation = decoAnim; }, { once: true });
        } else card.style.animation = decoAnim;
    }
    // Fixed px font sizes overflow small alert boxes and get clipped; shrink text to fit the card
    const fitTextBlock = () => {
        const text = card.querySelector('.alert-text');
        if (!text || layout === 'media') return;
        const cs = getComputedStyle(card);
        const availH = card.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
        const media = card.querySelector('.alert-media');
        const mediaH = layout === 'stack' && media ? media.offsetHeight + (parseFloat(cs.rowGap) || 0) : 0;
        const room = availH - mediaH;
        if (room <= 0 || text.scrollHeight <= room) return;
        const k = Math.max(0.4, room / text.scrollHeight);
        text.querySelectorAll('.alert-title, .alert-message').forEach(el => { el.style.fontSize = `${Math.max(10, parseFloat(el.style.fontSize) * k)}px`; });
    };
    fitTextBlock();

    let audio = null;
    if (sound && cfg.sound !== false && payload.sound) {
        const volume = Math.max(0, Math.min(1, (Number(payload.volume) || 70) / 100));
        audio = playSoundValue(payload.sound, volume);
    }
    const fadeMs = 500;
    let finished = false;
    const finish = () => {
        if (finished) return;
        finished = true;
        clearTimeout(outTimer); clearTimeout(endTimer);
        if (audio) audio.pause();
        if (mediaFxWrap && root.OverlayFilters?.cleanupFilters) root.OverlayFilters.cleanupFilters(mediaFxWrap);
        cleanupNode(card);
        if (card.parentNode === node) node.replaceChildren();
        if (onEnd) onEnd();
    };
    const outTimer = setTimeout(() => {
        const out = payload.animOut || 'fade';
        card.className = `alert-card layout-${layout}${out === 'none' ? '' : ` alert-out-${out}`}`;
        if (out !== 'none') card.style.animation = '';
    }, Math.max(0, (payload.durationMs || 6000) - fadeMs));
    const endTimer = setTimeout(finish, payload.durationMs || 6000);
    return { stop: finish };
}

export { ALERT_PRESENTATION_KEYS, ALERT_SAMPLE, ALERT_SAMPLE_IMAGE, alertSample, playAlert, prepareAlertNode, resolveAlertLook };

'use strict';

import { api, esc, toast } from '../shared/client-core.js';
import { OP_ICONS } from './operator-icons.js';
import { registerCardType, registerOperatorModule } from './operator-registry.js';

let nowPlaying = { state: 'stopped', track: '', artist: '', album: '', artworkUrl: '' };
let overlayVisible = true;
let domainMounted = false;
let domainContainer = null;

async function fetchMusicState() {
    const [np, ov] = await Promise.all([
        api('/api/music/now-playing'),
        api('/api/music/overlay')
    ]);
    nowPlaying = np || { state: 'stopped' };
    overlayVisible = ov?.visible !== false;
    return { nowPlaying, overlayVisible };
}

function renderMusicBodyHtml() {
    const stateLabel = nowPlaying.state === 'playing' ? 'Playing' : nowPlaying.state === 'paused' ? 'Paused' : 'Stopped';
    const hasActiveTrack = (nowPlaying.state === 'playing' || nowPlaying.state === 'paused') && Boolean(nowPlaying.track);
    const artSrc = nowPlaying.artworkUrl || (hasActiveTrack
        ? `/api/music/artwork?t=${encodeURIComponent(`${nowPlaying.track || ''}_${nowPlaying.artist || ''}`)}`
        : '');
    const artHtml = artSrc
        ? `<img src="${esc(artSrc)}" alt="Album artwork" onerror="this.remove()">`
        : OP_ICONS.music;
    return `
        <div class="op-music-box">
            <div class="op-music-art">${artHtml}${artSrc ? OP_ICONS.music : ''}</div>
            <div class="op-music-meta">
                <div class="op-music-track">${esc(nowPlaying.track || 'Nothing playing')}</div>
                <div class="op-music-artist">${esc([nowPlaying.artist, nowPlaying.album].filter(Boolean).join(' · ') || 'Waiting for active media source')}</div>
                <div class="op-btn-row" style="margin-top:.25rem;">
                    <span class="op-pill ${nowPlaying.state === 'playing' ? 'is-ok' : ''}">${esc(stateLabel)}</span>
                    <span class="op-pill ${overlayVisible ? 'is-live' : ''}">Overlay: ${overlayVisible ? 'Shown' : 'Hidden'}</span>
                </div>
            </div>
        </div>
        <div class="op-btn-row">
            <button type="button" class="op-btn sm ${overlayVisible ? 'active' : 'primary'}" data-music-overlay="toggle">Toggle Music Overlay</button>
            <button type="button" class="op-btn sm" data-music-overlay="on">Show</button>
            <button type="button" class="op-btn sm" data-music-overlay="off">Hide</button>
        </div>`;
}

async function handleMusicClick(e, onUpdate) {
    const btn = e.target.closest('[data-music-overlay]');
    if (!btn) return false;
    const action = btn.dataset.musicOverlay;
    try {
        const res = await api(`/api/music/overlay?action=${encodeURIComponent(action)}`, 'POST', { action });
        overlayVisible = res?.visible !== false;
        onUpdate();
    } catch (err) {
        toast(err.message, 'error');
    }
    return true;
}

function renderDomain(container) {
    container.innerHTML = `
        <div class="op-domain-stack">
            <div class="op-toolbar">
                <div class="op-toolbar-left">
                    <span style="display:inline-flex;align-items:center;gap:.4rem;font-weight:700;font-size:.88rem;">${OP_ICONS.music} Music</span>
                    <span class="op-pill ${nowPlaying.state === 'playing' ? 'is-ok' : ''}">${esc(nowPlaying.state || 'stopped')}</span>
                </div>
                <div class="op-toolbar-right">
                    <a class="op-btn sm" href="/music-editor.html">Music Settings</a>
                </div>
            </div>
            <section class="op-panel-card" aria-label="Now Playing and Overlay Visibility" style="max-width:760px;">
                <h2 class="op-section-title">${OP_ICONS.music} Now Playing</h2>
                ${renderMusicBodyHtml()}
            </section>
        </div>`;
}

registerOperatorModule({
    id: 'music',
    label: 'Music',
    iconSvg: OP_ICONS.music,
    order: 50,
    isEnabled: status => Boolean(status?.modules?.music),
    async mount(container) {
        domainMounted = true;
        domainContainer = container;
        container.hidden = false;
        const onClick = e => handleMusicClick(e, () => renderDomain(container));
        container._opClick = onClick;
        container.addEventListener('click', onClick);
        await fetchMusicState();
        renderDomain(container);
    },
    unmount(ctx) {
        domainMounted = false;
        if (domainContainer?._opClick) {
            domainContainer.removeEventListener('click', domainContainer._opClick);
            delete domainContainer._opClick;
        }
        if (ctx?.container) ctx.container.hidden = true;
        domainContainer = null;
    },
    onSocket(type, data) {
        if (!domainMounted || !domainContainer) return;
        if (type === 'music' && data) {
            nowPlaying = { ...nowPlaying, ...data };
            renderDomain(domainContainer);
        } else if (type === 'overlay-visibility' && data?.key === 'music') {
            overlayVisible = Boolean(data.visible);
            renderDomain(domainContainer);
        }
    }
});

// --- Live Board Card: Music Now Playing ---
registerCardType({
    type: 'music-now-playing',
    moduleId: 'music',
    label: 'Music Overlay & Now Playing',
    description: 'Monitor current track artwork and toggle Music Overlay visibility.',
    iconSvg: OP_ICONS.music,
    isEnabled: status => Boolean(status?.modules?.music),
    mount(el) {
        const render = () => { el.innerHTML = renderMusicBodyHtml(); };
        const onClick = e => handleMusicClick(e, render);
        el.addEventListener('click', onClick);
        el._opRefresh = () => fetchMusicState().then(render);
        el._opRender = render;
        el._opCleanup = () => el.removeEventListener('click', onClick);
        el._opRefresh();
    },
    onSocket(el, card, type, data) {
        if (type === 'music' && data) {
            nowPlaying = { ...nowPlaying, ...data };
            el._opRender?.();
        } else if (type === 'overlay-visibility' && data?.key === 'music') {
            overlayVisible = Boolean(data.visible);
            el._opRender?.();
        }
    },
    unmount(el) {
        el._opCleanup?.();
    }
});

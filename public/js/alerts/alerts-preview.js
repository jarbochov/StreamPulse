/**
 * StreamPulse — Alerts Studio Live Preview Engine
 */

import { rule, rewardList, SAMPLE_TOKENS, DEFAULT_CHEERMOTES, toast } from './alerts-state.js';

let previewHandle = null;
let previewTimer = 0;

export function mountPreview(withSound = false, animate = false) {
    const stage = document.querySelector('#editor .variant[open] .v-live-stage');
    if (!stage || !window.OverlayShared?.playAlert) return;
    const r = rule();
    const v = r?.variants[stage.dataset.live];
    if (!v) return;

    try { window.OverlayShared.cleanupNode?.(stage); } catch { /* ignore */ }
    stage.innerHTML = '';

    const sample = { ...SAMPLE_TOKENS };
    if (r.trigger === 'redeem') {
        sample.reward = rewardList.rewards.find(reward => reward.id === r.conditions.rewardIds?.[0])?.title || r.conditions.rewardName || 'Test reward';
    }

    const fill = t => String(t || '').replace(/\{\{alert\.(\w+)\}\}/g, (m, k) => sample[k] ?? m);
    const viewerEmote = r.trigger === 'bits' && v.emoteSource !== 'custom' && !v.emoji && !v.emojiUrl;

    const payload = {
        title: fill(v.title),
        message: fill(v.message),
        image: v.video ? '' : v.image,
        video: v.video,
        focusX: v.focusX ?? 50,
        focusY: v.focusY ?? 50,
        emoji: viewerEmote ? 'Cheer100' : v.emoji,
        emojiUrl: viewerEmote ? DEFAULT_CHEERMOTES[1].url : v.emojiUrl,
        emoteScale: v.emoteScale,
        videoSound: !!v.videoSound,
        videoVolume: v.videoVolume ?? 70,
        videoLoop: v.videoLoop !== false,
        animIn: animate ? v.animIn : 'none',
        animOut: animate ? v.animOut : 'none',
        durationMs: animate ? Math.max(1500, (Number(v.duration) || 6) * 1000) : 3600000
    };

    const element = {
        alert: { layout: 'stack', mediaFit: 'cover', mediaScale: 55, titleSize: 22, messageSize: 14, videoSound: !!v.videoSound, videoVolume: v.videoVolume ?? 70 },
        style: { color: '#fff', background: '#1b1f2a', borderRadius: 10, padding: 10 }
    };

    try {
        previewHandle = window.OverlayShared.playAlert(stage, element, payload, {
            sound: withSound,
            onEnd: animate ? () => { if (stage.isConnected) mountPreview(); } : undefined
        });
    } catch {
        stage.textContent = 'Preview unavailable';
    }
}

export const schedulePreview = () => {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(() => mountPreview(), 150);
};

export function playVariantSound(v) {
    if (v.sound && window.OverlayShared) {
        window.OverlayShared.playSoundValue(v.sound, (v.volume ?? 70) / 100);
    }
    if (v.video && v.videoSound) {
        mountPreview(true);
    }
    if (!v.sound && !(v.video && v.videoSound)) {
        toast('This variant has no sound');
    }
}

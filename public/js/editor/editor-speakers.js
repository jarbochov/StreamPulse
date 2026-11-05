import { state, prefs, primary } from './editor-state.js';

const levels = new Map();
const releases = new Map();
const activity = new Map();

export function speakerIsSpeaking(element) {
    if (element._simulateSpeaking) return true;
    if (!prefs.live || !state.obs.connected || state.obs.speakerBadgesEnabled === false) return false;
    const audio = element.speakerBadge?.audio || {};
    const level = levels.get(audio.inputName || 'Mic/Aux');
    const hold = Math.max(50, Number(audio.holdMs) || 280);
    const input = audio.inputName || 'Mic/Aux', gate = audio.thresholdDb ?? -36;
    let current = activity.get(element.id);
    if (!current || current.input !== input || current.gate !== gate) {
        clearTimeout(releases.get(element.id));
        releases.delete(element.id);
        current = { input, gate, lastAbove: 0 };
        activity.set(element.id, current);
    }
    if (level?.db >= gate) current.lastAbove = level.at;
    return current.lastAbove > 0 && Date.now() - current.lastAbove < hold;
}

function drawBadge(element) {
    const node = state.nodes.get(element.id);
    if (!node || !window.OverlayShared?.renderSpeakerBadge) return;
    const speaking = speakerIsSpeaking(element);
    if (node._speakerSpeaking === speaking) return;
    node._speakerSpeaking = speaking;
    node._sig = null;
    window.OverlayShared.renderSpeakerBadge(node, element, { preview: true, speaking });
}

export function updateSpeakerMeterHint(force = false) {
    const hint = document.getElementById('sb-audio-level');
    const element = primary();
    if (!hint || element?.type !== 'speaker-badge') return;
    const audio = element.speakerBadge?.audio || {};
    const level = levels.get(audio.inputName || 'Mic/Aux');
    const gate = audio.thresholdDb ?? -36;
    if (!force && Date.now() - (hint._lastAudioUpdate || 0) < 300) return;
    hint._lastAudioUpdate = Date.now();
    hint.textContent = !state.obs.connected ? 'OBS disconnected. No live audio meters.' :
        !level || Date.now() - level.at > 2000 ? 'Waiting for this source audio meter. Make sure it is active in OBS.' :
            `Input: ${Math.round(level.displayDb)} dB / Gate: ${gate} dB`;
}

export function handleSpeakerMeter(data) {
    if (!data?.input || !Number.isFinite(data.db)) return;
    const badges = state.overlay.elements.filter(element => element.type === 'speaker-badge');
    for (const [id, current] of activity) {
        if (!badges.some(element => element.id === id)) {
            clearTimeout(releases.get(id));
            releases.delete(id);
            activity.delete(id);
        }
        if (!badges.some(element => (element.speakerBadge?.audio?.inputName || 'Mic/Aux') === current.input)) levels.delete(current.input);
    }
    if (!badges.some(element => (element.speakerBadge?.audio?.inputName || 'Mic/Aux') === data.input)) return;
    const now = Date.now();
    const previous = levels.get(data.input);
    const displayDb = previous ? previous.displayDb + (data.db - previous.displayDb) * Math.min(1, (now - previous.at) / 300) : data.db;
    levels.set(data.input, { db: data.db, displayDb, at: now });
    for (const element of badges) {
        const audio = element.speakerBadge?.audio || {};
        if ((audio.inputName || 'Mic/Aux') !== data.input) continue;
        const gate = audio.thresholdDb ?? -36, hold = Math.max(50, Number(audio.holdMs) || 280);
        drawBadge(element);
        if (data.db >= gate) {
            clearTimeout(releases.get(element.id));
            releases.set(element.id, setTimeout(() => {
                releases.delete(element.id);
                const current = state.overlay.elements.find(item => item.id === element.id);
                if (current) drawBadge(current);
                updateSpeakerMeterHint();
            }, hold + 1));
        }
    }
    updateSpeakerMeterHint(!previous);
}

export function clearSpeakerMeters() {
    for (const timer of releases.values()) clearTimeout(timer);
    releases.clear();
    levels.clear();
    activity.clear();
    for (const element of state.overlay.elements) if (element.type === 'speaker-badge') drawBadge(element);
    updateSpeakerMeterHint();
}

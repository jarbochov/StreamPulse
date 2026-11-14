/**
 * Shared state, storage persistence, Web Audio FX, Confetti, and weight math
 * for the Randomizer Studio.
 */

export const DEFAULT_FALLBACK_CHOICES = [
    'Bidiots', 'Blather Round', 'Bomb Corp', 'Bracketeering', "Champ'd Up",
    'Civic Doodle', 'Devils and the Details', 'Dictionarium', 'Dodo Re Mi',
    'Drawful 2', 'Fibbage 3', 'Mad Verse City', 'Quiplash 3', 'Trivia Murder Party 2'
];

export const STORAGE_KEY = 'streampulse_randomizer_studio';

export const $ = id => document.getElementById(id);

export const esc = s => String(s || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
}[c]));

export function toast(msg) {
    const t = $('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2400);
}

// Audio Effects via Web Audio API
export const AudioFX = {
    ctx: null,
    enabled: true,
    init() {
        if (!this.ctx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) this.ctx = new AudioContext();
        }
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume().catch(() => {});
        }
    },
    tick(speed = 1) {
        if (!this.enabled) return;
        try {
            this.init();
            if (!this.ctx) return;
            const now = this.ctx.currentTime;
            const pitch = Math.max(0.4, Math.min(2.2, Number(speed) || 1));

            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'triangle';
            const baseFreq = (560 + Math.random() * 80) * pitch;
            osc.frequency.setValueAtTime(baseFreq * 1.5, now);
            osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.6, now + 0.04);

            gain.gain.setValueAtTime(0.28, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);

            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now);
            osc.stop(now + 0.048);
        } catch {}
    },
    fanfare() {
        if (!this.enabled) return;
        try {
            this.init();
            if (!this.ctx) return;
            const notes = [440, 554.37, 659.25, 880];
            notes.forEach((freq, idx) => {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'sine';
                osc.frequency.value = freq;
                const t = this.ctx.currentTime + idx * 0.09;
                gain.gain.setValueAtTime(0.26, t);
                gain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start(t);
                osc.stop(t + 0.55);
            });
        } catch {}
    },
    cardSlide() {
        if (!this.enabled) return;
        try {
            this.init();
            if (!this.ctx) return;
            const now = this.ctx.currentTime;
            const bufferSize = Math.floor(this.ctx.sampleRate * 0.16);
            const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.4));
            }
            const noise = this.ctx.createBufferSource();
            noise.buffer = buffer;
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(1600, now);
            filter.frequency.exponentialRampToValueAtTime(480, now + 0.15);
            filter.Q.value = 1.4;

            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(0.34, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.155);

            noise.connect(filter);
            filter.connect(gain);
            gain.connect(this.ctx.destination);
            noise.start(now);

            const bodyOsc = this.ctx.createOscillator();
            const bodyGain = this.ctx.createGain();
            bodyOsc.type = 'sine';
            bodyOsc.frequency.setValueAtTime(320, now);
            bodyOsc.frequency.exponentialRampToValueAtTime(140, now + 0.14);
            bodyGain.gain.setValueAtTime(0.18, now);
            bodyGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
            bodyOsc.connect(bodyGain);
            bodyGain.connect(this.ctx.destination);
            bodyOsc.start(now);
            bodyOsc.stop(now + 0.14);
        } catch {
            this.tick(1.3);
        }
    },
    cardFlip() {
        if (!this.enabled) return;
        try {
            this.init();
            if (!this.ctx) return;
            const now = this.ctx.currentTime;

            const snapOsc = this.ctx.createOscillator();
            const snapGain = this.ctx.createGain();
            snapOsc.type = 'triangle';
            snapOsc.frequency.setValueAtTime(880, now);
            snapOsc.frequency.exponentialRampToValueAtTime(220, now + 0.05);
            snapGain.gain.setValueAtTime(0.32, now);
            snapGain.gain.exponentialRampToValueAtTime(0.001, now + 0.055);
            snapOsc.connect(snapGain);
            snapGain.connect(this.ctx.destination);
            snapOsc.start(now);
            snapOsc.stop(now + 0.06);

            const whooshOsc = this.ctx.createOscillator();
            const whooshGain = this.ctx.createGain();
            whooshOsc.type = 'sine';
            whooshOsc.frequency.setValueAtTime(260, now + 0.02);
            whooshOsc.frequency.exponentialRampToValueAtTime(680, now + 0.15);
            whooshGain.gain.setValueAtTime(0.24, now + 0.02);
            whooshGain.gain.exponentialRampToValueAtTime(0.001, now + 0.17);
            whooshOsc.connect(whooshGain);
            whooshGain.connect(this.ctx.destination);
            whooshOsc.start(now + 0.02);
            whooshOsc.stop(now + 0.17);
        } catch {}
    }
};

// Confetti Particle Engine
export const Confetti = {
    canvas: null,
    ctx: null,
    particles: [],
    animId: null,
    init(canvasEl) {
        this.canvas = canvasEl;
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');
    },
    burst() {
        if (!this.canvas) return;
        this.canvas.width = this.canvas.offsetWidth;
        this.canvas.height = this.canvas.offsetHeight;
        const colors = ['#f43f5e', '#ec4899', '#d946ef', '#a855f7', '#6366f1', '#3b82f6', '#06b6d4', '#10b981', '#f59e0b', '#fbbf24'];
        this.particles = [];
        for (let i = 0; i < 90; i++) {
            this.particles.push({
                x: this.canvas.width / 2,
                y: this.canvas.height / 2,
                vx: (Math.random() - 0.5) * 16,
                vy: (Math.random() - 0.7) * 16,
                size: Math.random() * 8 + 4,
                color: colors[Math.floor(Math.random() * colors.length)],
                rotation: Math.random() * Math.PI * 2,
                vRot: (Math.random() - 0.5) * 0.2,
                alpha: 1,
                gravity: 0.38
            });
        }
        if (this.animId) cancelAnimationFrame(this.animId);
        this.loop();
    },
    loop() {
        if (!this.ctx || !this.particles.length) return;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.vy += p.gravity;
            p.rotation += p.vRot;
            p.alpha -= 0.012;
            if (p.alpha <= 0) {
                this.particles.splice(i, 1);
                continue;
            }
            this.ctx.save();
            this.ctx.globalAlpha = Math.max(0, p.alpha);
            this.ctx.translate(p.x, p.y);
            this.ctx.rotate(p.rotation);
            this.ctx.fillStyle = p.color;
            this.ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
            this.ctx.restore();
        }
        if (this.particles.length > 0) {
            this.animId = requestAnimationFrame(() => this.loop());
        } else {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        }
    }
};

export const state = {
    currentMode: 'roller',
    currentPresetId: 'jackbox',
    currentBtnPresetId: 'chaos',
    currentQuotePresetId: 'multiverse',
    currentSuspense: 'normal',
    currentTheme: 'system',
    currentThemeSlices: null,
    choices: [...DEFAULT_FALLBACK_CHOICES],
    presetsList: [],
    buttonPresetsList: [],
    quotePresetsList: [],
    activeButtonPhrases: [],
    activeQuotesPool: [],
    isSpinning: false,
    autohideTimer: null,
    idleButtonTimer: null,
    currentRollerIndex: 0,
    savedOverlayConfigTheme: null,
    currentDeckLogo: '',
    currentDeckWatermark: 'STREAMPULSE',
    currentWeightMode: 'equal', // 'equal' | 'manual' | 'growth' | 'momentum'
    currentWeightSettings: { step: 1, max: 20, base: 1 },
    currentWeightsMap: {},
    currentChoiceStats: {},
    currentEliminationMode: false,
    currentEliminated: [],
    currentSpinHistory: [],
    pendingEliminationState: null,
    currentHistoryLimit: 100,
    choicesViewMode: 'table', // 'table' | 'raw'
    isInitialLoad: true,
    studioSettingsSync: Promise.resolve(),
    studioSettingsReady: false,
    saveStudioTimer: null,
    savedStudio: null,
    onSpinFinish: null
};

export function rgbToHex(col) {
    if (!col) return '#ffffff';
    col = String(col).trim();
    if (/^#[0-9a-f]{6}$/i.test(col)) return col.toLowerCase();
    if (/^#[0-9a-f]{3}$/i.test(col)) {
        return `#${col[1]}${col[1]}${col[2]}${col[2]}${col[3]}${col[3]}`.toLowerCase();
    }
    if (/^#[0-9a-f]{8}$/i.test(col)) {
        return col.slice(0, 7).toLowerCase();
    }
    const match = col.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (match) {
        const r = parseInt(match[1], 10).toString(16).padStart(2, '0');
        const g = parseInt(match[2], 10).toString(16).padStart(2, '0');
        const b = parseInt(match[3], 10).toString(16).padStart(2, '0');
        return `#${r}${g}${b}`.toLowerCase();
    }
    return '#8b5cf6';
}

export function hexToRgba(hex, alpha = 1) {
    hex = (hex || '').replace('#', '').trim();
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    if (hex.length !== 6) return 'rgba(15, 23, 42, 0.85)';
    const r = parseInt(hex.substring(0, 2), 16) || 0;
    const g = parseInt(hex.substring(2, 4), 16) || 0;
    const b = parseInt(hex.substring(4, 6), 16) || 0;
    return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(2)})`;
}

export function getEffectiveBackground() {
    const style = $('bg-style-select')?.value || 'glass';
    if (style === 'custom') {
        const hex = $('custom-bg-color')?.value || '#0f172a';
        const opacity = Number($('custom-bg-opacity')?.value) / 100;
        return hexToRgba(hex, isNaN(opacity) ? 0.85 : opacity);
    }
    return style;
}

export function isEliminated(c) {
    return state.currentEliminated.some(e => e.toLowerCase() === String(c).toLowerCase());
}

export function playableChoices(list = state.choices) {
    return state.currentEliminated.length ? list.filter(c => !isEliminated(c)) : list;
}

export function getWeightSettings() {
    return {
        step: Math.max(0.1, Number($('weight-step-input')?.value) || 1),
        max: Math.max(1, Number($('weight-max-input')?.value) || 20),
        base: Math.max(0.1, Number($('weight-base-input')?.value) || 1)
    };
}

export function getClientEffectiveWeights(choicesList = state.choices) {
    const mode = state.currentWeightMode || 'equal';
    const settings = state.currentWeightSettings || { step: 1, max: 20, base: 1 };
    const defaultBase = settings.base || 1;
    const weights = {};
    let total = 0;
    for (const c of choicesList) {
        let w = 1;
        const baseW = (state.currentWeightsMap[c] != null && !isNaN(Number(state.currentWeightsMap[c])))
            ? Number(state.currentWeightsMap[c])
            : defaultBase;
        if (mode === 'equal') {
            w = 1;
        } else if (mode === 'manual') {
            w = Math.max(0.01, baseW);
        } else if (mode === 'growth' || mode === 'momentum') {
            if (state.currentChoiceStats[c]?.effectiveWeight != null) {
                w = Math.max(0.01, Number(state.currentChoiceStats[c].effectiveWeight));
            } else {
                w = Math.max(0.01, baseW);
            }
        }
        weights[c] = Math.round(w * 100) / 100;
        total += weights[c];
    }
    return { weights, totalWeight: Math.round(total * 100) / 100, mode };
}

export function parseRawChoicesFromTextarea() {
    if (!$('choices-textarea')) return { choices: state.choices, weights: state.currentWeightsMap };
    const lines = $('choices-textarea').value.split('\n');
    const parsedChoices = [];
    const parsedWeights = {};
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const match = trimmed.match(/^(.+?)\s*[:=]\s*(\d+(?:\.\d+)?)$/);
        if (match) {
            const name = match[1].trim();
            const w = parseFloat(match[2]);
            if (name) {
                parsedChoices.push(name);
                if (!isNaN(w) && w > 0) parsedWeights[name] = w;
            }
        } else {
            parsedChoices.push(trimmed);
        }
    }
    return { choices: parsedChoices, weights: parsedWeights };
}

export function getChoices() {
    if (state.choicesViewMode === 'raw' && $('choices-textarea')) {
        return parseRawChoicesFromTextarea().choices;
    }
    return state.choices;
}

export function getActiveWeightsMap() {
    if (state.choicesViewMode === 'raw' && $('choices-textarea')) {
        const { weights } = parseRawChoicesFromTextarea();
        return { ...state.currentWeightsMap, ...weights };
    }
    return state.currentWeightsMap;
}

export function pickWeightedWinnerClient(choicesList, weightsMap) {
    if (!choicesList || !choicesList.length) return 'Winner';
    let total = 0;
    const entries = choicesList.map(c => {
        const w = (weightsMap && weightsMap[c] != null) ? Number(weightsMap[c]) : 1;
        total += Math.max(0.01, w);
        return { choice: c, weight: Math.max(0.01, w) };
    });
    let rnd = Math.random() * total;
    for (const e of entries) {
        if (rnd < e.weight) return e.choice;
        rnd -= e.weight;
    }
    return entries[entries.length - 1].choice;
}

export function loadStudioState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

export function hydrateSavedStudioState() {
    const saved = loadStudioState();
    state.savedStudio = saved;
    if (saved) {
        if (saved.mode) state.currentMode = saved.mode;
        if (saved.presetId) state.currentPresetId = saved.presetId;
        if (saved.btnPresetId) state.currentBtnPresetId = saved.btnPresetId;
        if (saved.quotePresetId) state.currentQuotePresetId = saved.quotePresetId;
        if (saved.suspense) state.currentSuspense = saved.suspense;
        if (saved.theme) state.currentTheme = saved.theme;
        if (saved.deckLogo !== undefined) state.currentDeckLogo = saved.deckLogo;
        if (saved.deckWatermark !== undefined) state.currentDeckWatermark = saved.deckWatermark;
    }
    return saved;
}

export function syncStudioSettingsToServer() {
    const choices = getChoices();
    if (!choices.length) return state.studioSettingsSync;
    let winnerSub = '';
    if (state.activeQuotesPool.length) {
        winnerSub = state.activeQuotesPool[Math.floor(Math.random() * state.activeQuotesPool.length)];
    }
    const payload = {
        preset: state.currentPresetId,
        choices,
        weightMode: state.currentWeightMode,
        weightSettings: getWeightSettings(),
        weights: getActiveWeightsMap(),
        choiceStats: state.currentChoiceStats,
        eliminationMode: state.currentEliminationMode,
        eliminated: state.currentEliminated,
        winnerHeader: $('winner-header-input')?.value.trim() || 'THE UNIVERSE HAS DECIDED',
        winnerSub,
        buttonPreset: state.currentBtnPresetId,
        mode: state.currentMode,
        suspense: $('suspense-select')?.value || state.currentSuspense,
        theme: $('theme-select')?.value || state.currentTheme,
        bg: getEffectiveBackground(),
        duration: Number($('spin-duration')?.value) || 6,
        autohide: Number($('autohide-select')?.value) || 0,
        buttonPhrases: state.activeButtonPhrases,
        buttonText: state.currentBtnPresetId === 'static' ? ($('btn-text-static')?.value.trim() || '') : '',
        showButton: !!$('overlay-button-enabled')?.checked,
        accent: $('display-stage')?.style.getPropertyValue('--stage-accent') || '',
        font: $('ap-font')?.value.trim() || '',
        weight: $('ap-weight')?.value.trim() || '',
        text: $('ap-text')?.value.trim() || '',
        outline: $('ap-outline')?.value.trim() || '',
        deckLogo: state.currentDeckLogo,
        deckWatermark: state.currentDeckWatermark
    };
    state.studioSettingsSync = state.studioSettingsSync.catch(() => {}).then(async () => {
        const response = await fetch('/api/randomizer/state', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await response.json();
        if (!response.ok || !result.ok) {
            throw new Error(result.error || `HTTP ${response.status}`);
        }
    }).catch(error => console.error('Failed to sync Randomizer Studio settings:', error));
    return state.studioSettingsSync;
}

export function saveStudioState() {
    clearTimeout(state.saveStudioTimer);
    state.saveStudioTimer = setTimeout(() => {
        try {
            const serialized = {
                presetId: state.currentPresetId,
                mode: state.currentMode,
                theme: $('theme-select')?.value || state.currentTheme,
                bgStyle: $('bg-style-select')?.value || 'glass',
                customBgColor: $('custom-bg-color')?.value || '#0f172a',
                customBgOpacity: Number($('custom-bg-opacity')?.value) || 85,
                accentColor: $('ap-accent')?.value || '#8b5cf6',
                textColor: $('ap-text')?.value || '#ffffff',
                fontFamily: $('ap-font')?.value || '',
                fontWeight: $('ap-weight')?.value || '600',
                textOutline: $('ap-outline')?.value || '',
                btnPresetId: state.currentBtnPresetId,
                quotePresetId: state.currentQuotePresetId,
                winnerHeader: $('winner-header-input')?.value || 'THE UNIVERSE HAS DECIDED',
                suspense: $('suspense-select')?.value || 'normal',
                duration: $('spin-duration')?.value || '6',
                autohide: $('autohide-select')?.value || '8',
                showButton: $('overlay-button-enabled')?.checked || false,
                soundEnabled: AudioFX.enabled,
                activeTab: document.querySelector('.tab-btn.active')?.id?.replace('tab-btn-', '') || 'presets',
                deckLogo: $('deck-logo-input')?.value.trim() || '',
                deckWatermark: $('deck-watermark-input')?.value !== undefined
                    ? $('deck-watermark-input').value.trim()
                    : 'STREAMPULSE'
            };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(serialized));
            syncStudioSettingsToServer();
        } catch (e) {}
    }, 200);
}

/**
 * StreamPulse Tier List Maker — Synthesized Audio FX
 * Native Web Audio synthesizer for voting countdowns, vote lock chords, and fanfare.
 * Zero external audio file dependencies.
 */

export const TierAudio = {
    ctx: null,
    enabled: true,
    volume: 0.75,

    init() {
        if (this.ctx) {
            if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
            return;
        }
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
            this.ctx = new AudioContext();
        }
    },

    voteStart() {
        if (!this.enabled) return;
        try {
            this.init();
            if (!this.ctx) return;
            const now = this.ctx.currentTime;
            const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
            notes.forEach((freq, idx) => {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'sine';
                osc.frequency.value = freq;
                const t = now + (idx * 0.08);
                const baseVol = 0.22 * this.volume;
                gain.gain.setValueAtTime(baseVol, t);
                gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start(t);
                osc.stop(t + 0.45);
            });
        } catch {}
    },

    countdownTick(isFinal = false) {
        if (!this.enabled) return;
        try {
            this.init();
            if (!this.ctx) return;
            const now = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = isFinal ? 'triangle' : 'sine';
            osc.frequency.setValueAtTime(isFinal ? 880 : 587.33, now);
            const baseVol = (isFinal ? 0.25 : 0.15) * this.volume;
            gain.gain.setValueAtTime(baseVol, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now);
            osc.stop(now + 0.09);
        } catch {}
    },

    voteLock() {
        if (!this.enabled) return;
        try {
            this.init();
            if (!this.ctx) return;
            const now = this.ctx.currentTime;
            const chord = [523.25, 659.25, 783.99, 1046.50];
            chord.forEach((freq, idx) => {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'triangle';
                osc.frequency.value = freq;
                const t = now + (idx * 0.06);
                const baseVol = 0.28 * this.volume;
                gain.gain.setValueAtTime(baseVol, t);
                gain.gain.exponentialRampToValueAtTime(0.001, t + 0.75);
                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start(t);
                osc.stop(t + 0.75);
            });
        } catch {}
    }
};

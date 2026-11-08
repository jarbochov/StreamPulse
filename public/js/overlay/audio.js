import { root } from './environment.js';


// Built-in alert sounds are synthesized with Web Audio, so no audio files are needed. Stored as "builtin:<name>".
const BUILTIN_SOUNDS = {
    // Chimes & Bells
    ding: { label: 'Desk Bell', group: 'Chimes', notes: [[880, 0, 1.0, 'sine', 0.9], [1760, 0, 0.6, 'sine', 0.25]] },
    chime: { label: 'Three-Tone Chime', group: 'Chimes', notes: [[659, 0, 0.85, 'sine', 0.7], [880, 0.13, 0.85, 'sine', 0.7], [1319, 0.26, 1.25, 'sine', 0.7]] },
    bell: { label: 'Tubular Bell', group: 'Chimes', notes: [[523, 0, 1.5, 'sine', 0.8], [1046, 0, 1.2, 'sine', 0.35], [1568, 0, 0.8, 'sine', 0.18]] },
    crystal: { label: 'Crystal Ping', group: 'Chimes', notes: [[1175, 0, 0.8, 'sine', 0.6], [1760, 0.08, 0.9, 'sine', 0.5], [2349, 0.16, 1.3, 'sine', 0.6]] },
    harp: { label: 'Harp Flourish', group: 'Chimes', notes: [[523, 0, 0.7, 'triangle', 0.55], [659, 0.08, 0.7, 'triangle', 0.55], [784, 0.16, 0.7, 'triangle', 0.55], [1047, 0.24, 0.9, 'triangle', 0.65], [1319, 0.32, 1.3, 'sine', 0.6]] },

    // Arcade & 8-Bit Retro
    coin: { label: 'Retro Coin', group: 'Arcade', notes: [[988, 0, 0.08, 'square', 0.24], [1319, 0.08, 0.5, 'square', 0.24]] },
    levelup: { label: '8-Bit Level Up', group: 'Arcade', notes: [[392, 0, 0.08, 'square', 0.2], [494, 0.08, 0.08, 'square', 0.2], [587, 0.16, 0.08, 'square', 0.2], [784, 0.24, 0.08, 'square', 0.2], [988, 0.32, 0.08, 'square', 0.2], [1175, 0.40, 0.45, 'square', 0.2]] },
    laser: { label: 'Laser Zap', group: 'Arcade', notes: [[2200, 0, 0.16, 'sawtooth', 0.35, 140]] },
    jump: { label: 'Retro Jump', group: 'Arcade', notes: [[140, 0, 0.18, 'square', 0.25, 750]] },
    powerup: { label: 'Power-Up Riser', group: 'Arcade', notes: [[261, 0, 0.1, 'square', 0.2], [330, 0.09, 0.1, 'square', 0.2], [392, 0.18, 0.1, 'square', 0.2], [523, 0.27, 0.38, 'square', 0.24, 1047]] },
    retro_win: { label: 'Retro Victory', group: 'Arcade', notes: [[523, 0, 0.1, 'square', 0.2], [523, 0.12, 0.1, 'square', 0.2], [523, 0.24, 0.1, 'square', 0.2], [659, 0.36, 0.3, 'square', 0.24], [587, 0.66, 0.1, 'square', 0.2], [659, 0.78, 0.42, 'square', 0.24]] },

    // Celebration & Triumphant
    fanfare: { label: 'Royal Fanfare', group: 'Celebration', notes: [[523, 0, 0.18, 'triangle', 0.8], [659, 0.16, 0.18, 'triangle', 0.8], [784, 0.32, 0.18, 'triangle', 0.8], [1047, 0.48, 0.9, 'triangle', 0.9], [784, 0.48, 0.9, 'triangle', 0.5]] },
    tada: { label: 'Ta-Da!', group: 'Celebration', notes: [[587, 0, 0.14, 'triangle', 0.7], [740, 0, 0.14, 'triangle', 0.6], [880, 0.16, 0.85, 'triangle', 0.8], [1175, 0.16, 0.85, 'sine', 0.5]] },
    victory: { label: 'Victory Stinger', group: 'Celebration', notes: [[523, 0, 0.12, 'triangle', 0.7], [659, 0.11, 0.12, 'triangle', 0.7], [784, 0.22, 0.12, 'triangle', 0.7], [1047, 0.33, 0.2, 'triangle', 0.8], [880, 0.54, 0.12, 'triangle', 0.7], [1047, 0.66, 0.85, 'triangle', 0.9]] },
    cheer: { label: 'Celebration Shimmer', group: 'Celebration', notes: [[523, 0, 0.6, 'sine', 0.6], [659, 0.05, 0.6, 'sine', 0.6], [784, 0.1, 0.7, 'sine', 0.6], [1047, 0.15, 0.9, 'sine', 0.7], [1319, 0.2, 1.2, 'sine', 0.7]] },
    drumroll: { label: 'Drumroll & Crash', group: 'Celebration', noise: true, noiseDuration: 0.95, filterFreqStart: 400, filterFreqEnd: 2600, filterQ: 0.9, noisePeak: 0.85, notes: [[784, 0.9, 0.7, 'triangle', 0.8], [1047, 0.9, 0.7, 'triangle', 0.8]] },

    // Modern UI & Notifications
    pop: { label: 'Bubble Pop', group: 'Modern UI', notes: [[750, 0, 0.12, 'sine', 1, 160]] },
    snap: { label: 'Snappy Click', group: 'Modern UI', notes: [[1800, 0, 0.06, 'triangle', 0.8, 120]] },
    notify: { label: 'Notification Ping', group: 'Modern UI', notes: [[740, 0, 0.24, 'sine', 0.75], [1108, 0.11, 0.6, 'sine', 0.8]] },
    success: { label: 'Warm Success', group: 'Modern UI', notes: [[523, 0, 0.8, 'sine', 0.7], [659, 0.04, 0.8, 'sine', 0.7], [784, 0.08, 1.1, 'sine', 0.7], [1047, 0.12, 1.3, 'sine', 0.5]] },
    drop: { label: 'Water Drop', group: 'Modern UI', notes: [[950, 0, 0.15, 'sine', 0.9, 1400]] },
    whoosh: { label: 'Cinematic Whoosh', group: 'Modern UI', noise: true, noiseDuration: 0.8, filterFreqStart: 250, filterFreqEnd: 3800, filterQ: 1.1, noisePeak: 0.85 },
    magic: { label: 'Magic Sparkle', group: 'Modern UI', notes: [[1047, 0, 0.16, 'sine', 0.5], [1319, 0.05, 0.16, 'sine', 0.5], [1568, 0.1, 0.16, 'sine', 0.5], [2093, 0.15, 0.2, 'sine', 0.6], [2637, 0.2, 0.28, 'sine', 0.6], [3136, 0.25, 0.45, 'sine', 0.5]] }
};
// Compact ZzFX-compatible generator (ZzFX, Frank Force, MIT). Params: volume, randomness, frequency, attack, sustain, release, shape, shapeCurve, slide, deltaSlide, pitchJump, pitchJumpTime, repeatTime, noise, modulation, bitCrush, delay, sustainVolume, decay, tremolo.
function zzfxSamples(volume = 1, randomness = 0.05, frequency = 220, attack = 0, sustain = 0, release = 0.1, shape = 0, shapeCurve = 1, slide = 0, deltaSlide = 0, pitchJump = 0, pitchJumpTime = 0, repeatTime = 0, noise = 0, modulation = 0, bitCrush = 0, delay = 0, sustainVolume = 1, decay = 0, tremolo = 0, rate = 44100) {
    const PI2 = Math.PI * 2;
    const sign = v => (v > 0 ? 1 : -1);
    let startSlide = slide *= 500 * PI2 / rate / rate;
    let startFrequency = frequency *= (1 + randomness * 2 * Math.random() - randomness) * PI2 / rate;
    const b = [];
    let t = 0, tm = 0, i = 0, j = 1, r = 0, c = 0, s = 0, f, length;
    attack = attack * rate + 9;
    decay *= rate;
    sustain *= rate;
    release *= rate;
    delay *= rate;
    deltaSlide *= 500 * PI2 / rate ** 3;
    modulation *= PI2 / rate;
    pitchJump *= PI2 / rate;
    pitchJumpTime *= rate;
    repeatTime = repeatTime * rate | 0;
    volume *= 0.3;
    for (length = attack + decay + sustain + release + delay | 0; i < length; b[i++] = s * volume) {
        if (!(++c % (bitCrush * 100 | 0))) {
            s = shape ? shape > 1 ? shape > 2 ? shape > 3 ? Math.sin((t % PI2) ** 3) : Math.max(Math.min(Math.tan(t), 1), -1) : 1 - (2 * t / PI2 % 2 + 2) % 2 : 1 - 4 * Math.abs(Math.round(t / PI2) - t / PI2) : Math.sin(t);
            s = (repeatTime ? 1 - tremolo + tremolo * Math.sin(PI2 * i / repeatTime) : 1) * sign(s) * (Math.abs(s) ** shapeCurve) * (i < attack ? i / attack : i < attack + decay ? 1 - ((i - attack) / decay) * (1 - sustainVolume) : i < attack + decay + sustain ? sustainVolume : i < length - delay ? (length - i - delay) / release * sustainVolume : 0);
            s = delay ? s / 2 + (delay > i ? 0 : (i < length - delay ? 1 : (length - i) / delay) * b[i - delay | 0] / 2 / volume) : s;
        }
        f = (frequency += slide += deltaSlide) * Math.cos(modulation * tm++);
        t += f - f * noise * (1 - (Math.sin(i) + 1) * 1e9 % 2);
        if (j && ++j > pitchJumpTime) { frequency += pitchJump; startFrequency += pitchJump; j = 0; }
        if (repeatTime && !(++r % repeatTime)) { frequency = startFrequency; slide = startSlide; j = j || 1; }
    }
    return b;
}
const ZZFX_PRESETS = {
    zz_coin: ['Synth Coin', [, 0, 1675, , 0.06, 0.24, 1, 1.82, , , 837, 0.06]],
    zz_pickup: ['Synth Pickup', [1.1, , 1130, 0.01, 0.07, 0.15, 1, 1.4, , , 330, 0.04]],
    zz_jump: ['Synth Jump', [, , 300, 0.02, 0.1, 0.1, , 1.7, 12]],
    zz_blip: ['Synth Blip', [0.9, , 700, 0.01, 0.02, 0.06, 1, 1.6]],
    zz_powerup: ['Synth Power-Up', [1, , 400, 0.02, 0.2, 0.3, 1, 1.2, 20, , 200, 0.1]],
    zz_arp: ['Synth Arpeggio', [1, , 523, 0.01, 0.2, 0.3, , 1, , , 330, 0.07, 0.1]],
    zz_laser: ['Synth Laser', [1, , 1200, 0.01, 0.05, 0.2, 2, 1.5, -40]],
    zz_zap: ['Synth Zap', [1, , 500, 0.01, 0.08, 0.2, 3, 2, -20, , , , , 0.3]],
    zz_explosion: ['Synth Boom', [1.2, , 100, 0.01, 0.2, 0.6, 4, 2, -4, , , , , 1.2]],
    zz_hit: ['Synth Hit', [1.1, , 200, , 0.03, 0.12, 4, 1.5, -5, , , , , 0.6]],
    zz_alarm: ['Synth Alarm', [1, 0, 660, 0.02, 0.3, 0.2, 1, 1, , , , , 0.12, , 0.5]],
    zz_riser: ['Synth Riser', [0.9, , 150, 0.3, 0.2, 0.3, 2, 1.4, 12]],
    zz_drop: ['Synth Drop', [1, , 900, 0.01, 0.1, 0.4, , 1.5, -8]],
    zz_sparkle: ['Synth Sparkle', [0.8, , 2200, 0.01, 0.1, 0.4, , 1.6, , , 700, 0.05, 0.08, , , , , 0.9, 0.1]],
    zz_warble: ['Synth Warble', [0.9, , 440, 0.02, 0.25, 0.25, , 1, , , , , , , 40]]
};
for (const [id, [label, params]] of Object.entries(ZZFX_PRESETS)) BUILTIN_SOUNDS[id] = { label, group: 'Synth', zzfx: params };
// Layered presets: notes [freq, at, dur, type, peak, slideTo, detune] plus noise bursts [at, dur, f0, f1, q, peak, filterType].
const arp = (freqs, step, dur, type, peak) => freqs.map((f, i) => [f, i * step, dur, type, peak]);
const LAYERED = {
    fanfare_big: ['Big Fanfare', 'Celebration', { notes: [...arp([523, 659, 784], 0.14, 0.2, 'sawtooth', 0.5), [1047, 0.45, 1.1, 'sawtooth', 0.7], [784, 0.45, 1.1, 'square', 0.35], [523, 0.45, 1.1, 'sawtooth', 0.4]], bursts: [[0.45, 0.5, 6000, 1500, 0.6, 0.35, 'highpass']] }],
    jackpot: ['Coin Jackpot', 'Celebration', { notes: [...arp([1319, 1568, 2093, 1319, 1568, 2093, 1319, 1568, 2093, 2637], 0.07, 0.35, 'square', 0.22), [1047, 0.7, 0.9, 'triangle', 0.6]] }],
    confetti: ['Confetti Pop', 'Celebration', { notes: [[300, 0, 0.12, 'sine', 1, 60], ...arp([1568, 2093, 2637, 3136], 0.06, 0.4, 'sine', 0.35)], bursts: [[0, 0.5, 5000, 800, 0.5, 0.8, 'highpass']] }],
    level_up_big: ['Level Up', 'Celebration', { notes: [...arp([392, 523, 659, 784, 1047], 0.09, 0.18, 'square', 0.3), [1319, 0.5, 0.9, 'triangle', 0.8], [1047, 0.5, 0.9, 'square', 0.25]] }],
    riser_hit: ['Riser + Hit', 'Hype', { notes: [[110, 0, 1.0, 'sawtooth', 0.35, 880], [55, 1.05, 0.9, 'sine', 1, 35]], bursts: [[0, 1.0, 300, 6000, 1.5, 0.5, 'bandpass'], [1.05, 0.6, 3000, 200, 0.7, 0.9, 'lowpass']] }],
    air_horn: ['Air Horn', 'Hype', { notes: [[466, 0, 1.1, 'sawtooth', 0.6], [470, 0.0, 1.1, 'sawtooth', 0.6], [698, 0, 1.1, 'sawtooth', 0.45], [703, 0, 1.1, 'sawtooth', 0.45], [466, 1.2, 0.6, 'sawtooth', 0.6], [698, 1.2, 0.6, 'sawtooth', 0.45]] }],
    bass_drop: ['Bass Drop', 'Hype', { notes: [[160, 0, 0.9, 'sine', 1, 38], [80, 0, 0.9, 'sawtooth', 0.4, 30]], bursts: [[0, 0.15, 5000, 300, 0.7, 0.8, 'lowpass']] }],
    drumroll_hit: ['Drum Roll + Hit', 'Hype', { notes: [[90, 1.0, 0.8, 'sine', 1, 40], [523, 1.0, 0.9, 'sawtooth', 0.4], [784, 1.0, 0.9, 'sawtooth', 0.4]], bursts: [[0, 1.0, 200, 1800, 1, 0.75, 'bandpass'], [1.0, 0.6, 4000, 400, 0.6, 0.9, 'lowpass']] }],
    boom: ['Boom', 'Impact', { notes: [[120, 0, 1.0, 'sine', 1, 30]], bursts: [[0, 0.9, 2500, 150, 0.7, 0.9, 'lowpass']] }],
    gong: ['Gong', 'Impact', { notes: [[110, 0, 2.2, 'sine', 0.8], [165, 0, 2, 'sine', 0.5], [233, 0, 1.8, 'sine', 0.4], [331, 0.01, 1.4, 'sine', 0.3], [447, 0.01, 1.0, 'sine', 0.25]], bursts: [[0, 0.4, 3000, 800, 0.8, 0.35, 'bandpass']] }],
    crowd_applause: ['Applause', 'Cheer/Crowd', { bursts: [[0, 0.25, 1800, 2400, 0.8, 0.8, 'bandpass'], [0.25, 0.9, 2400, 1800, 0.7, 0.9, 'bandpass'], [1.1, 0.9, 1800, 1200, 0.7, 0.6, 'bandpass']] }],
    crowd_cheer: ['Crowd Cheer', 'Cheer/Crowd', { notes: [[400, 0, 1.4, 'sawtooth', 0.25, 700], [520, 0.05, 1.4, 'sawtooth', 0.22, 900], [650, 0.1, 1.2, 'sawtooth', 0.2, 1000]], bursts: [[0, 1.5, 700, 1600, 0.6, 0.7, 'bandpass'], [0, 1.5, 2200, 3000, 0.8, 0.35, 'bandpass']] }],
    sub_bell: ['Sub Bell', 'Chime/Bell', { notes: [[880, 0, 1.6, 'sine', 0.8], [1760, 0, 1.2, 'sine', 0.4], [2217, 0.0, 1.0, 'sine', 0.25], [1318, 0.25, 1.6, 'sine', 0.7], [2637, 0.25, 1.2, 'sine', 0.3]] }],
    raid_horns: ['Raid Horns', 'Chime/Bell', { notes: [[262, 0, 0.35, 'sawtooth', 0.45], [330, 0.3, 0.35, 'sawtooth', 0.45], [392, 0.6, 1.0, 'sawtooth', 0.55], [523, 0.6, 1.0, 'sawtooth', 0.4]] }],
    sparkle_arp: ['Sparkle Arpeggio', 'Chime/Bell', { notes: arp([1047, 1319, 1568, 2093, 2637, 3136, 2637, 3136, 4186], 0.06, 0.5, 'sine', 0.45) }]
};
for (const [id, [label, group, def]] of Object.entries(LAYERED)) BUILTIN_SOUNDS[id] = { label, group, ...def };
let audioCtx = null;
function playBuiltinSound(name, volume = 0.7) {
    const def = BUILTIN_SOUNDS[name];
    const Ctx = root.AudioContext || root.webkitAudioContext;
    if (!def || !Ctx) return { pause() {} };
    audioCtx = audioCtx || new Ctx();
    let stopped = false;
    const sources = [];

    const startSound = () => {
        if (stopped) return;
        const ctx = audioCtx;
        const now = ctx.currentTime + 0.01;
        const master = ctx.createGain();
        master.gain.value = Math.max(0, Math.min(1, volume)) * 0.5;
        master.connect(ctx.destination);

        const envelope = (start, dur, peak) => {
            const gain = ctx.createGain();
            const attack = Math.min(0.015, Math.max(0.002, dur * 0.2));
            gain.gain.setValueAtTime(0.0001, start);
            gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), start + attack);
            gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
            gain.connect(master);
            return gain;
        };

        if (def.zzfx) {
            const samples = zzfxSamples(...def.zzfx);
            const buffer = ctx.createBuffer(1, Math.max(1, samples.length), 44100);
            buffer.getChannelData(0).set(samples);
            const src = ctx.createBufferSource();
            src.buffer = buffer;
            src.connect(master);
            src.start(now);
            sources.push(src);
        }

        for (const [freq, at, dur, type, peak, slideTo] of def.notes || []) {
            const osc = ctx.createOscillator();
            osc.type = type || 'sine';
            osc.frequency.setValueAtTime(Math.max(20, freq), now + at);
            if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), now + at + dur);
            osc.connect(envelope(now + at, dur, peak));
            osc.start(now + at);
            osc.stop(now + at + dur + 0.05);
            sources.push(osc);
        }

        for (const [at, dur, f0, f1, q, peak, ftype] of def.bursts || []) {
            const length = Math.floor(ctx.sampleRate * dur);
            const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
            const src = ctx.createBufferSource();
            const filter = ctx.createBiquadFilter();
            src.buffer = buffer;
            filter.type = ftype || 'bandpass';
            filter.Q.value = q || 1;
            filter.frequency.setValueAtTime(f0, now + at);
            filter.frequency.exponentialRampToValueAtTime(f1, now + at + dur);
            src.connect(filter);
            filter.connect(envelope(now + at, dur, peak));
            src.start(now + at);
            src.stop(now + at + dur + 0.05);
            sources.push(src);
        }

        if (def.noise) {
            const dur = def.noiseDuration || 0.8;
            const length = Math.floor(ctx.sampleRate * dur);
            const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
            const src = ctx.createBufferSource();
            const filter = ctx.createBiquadFilter();
            src.buffer = buffer;
            filter.type = def.filterType || 'bandpass';
            filter.Q.value = def.filterQ || 1.2;
            filter.frequency.setValueAtTime(def.filterFreqStart || 300, now);
            filter.frequency.exponentialRampToValueAtTime(def.filterFreqEnd || 4000, now + dur);
            src.connect(filter);
            filter.connect(envelope(now, dur, def.noisePeak || 0.8));
            src.start(now);
            src.stop(now + dur + 0.05);
            sources.push(src);
        }
    };

    if (audioCtx.state === 'suspended') {
        audioCtx.resume().then(startSound).catch(() => {});
    } else {
        startSound();
    }

    return {
        pause() {
            stopped = true;
            sources.forEach(source => { try { source.stop(); } catch {} });
        }
    };
}
// 'sfx:<group>/<id>' -> bundled file URL (manifest files are .mp3); other values pass through.
const SFX_RE = /^sfx:([a-z0-9_-]+)\/([a-z0-9_-]+)$/i;
const resolveSoundUrl = value => {
    const m = SFX_RE.exec(String(value || ''));
    return m ? `/sounds/${m[1].toLowerCase()}/${m[2].toLowerCase()}.mp3` : String(value || '');
};
// Plays any stored sound value (builtin:, sfx:, URL); returns { pause() }.
function playSoundValue(value, volume = 0.7) {
    const v = Math.max(0, Math.min(1, volume));
    const name = String(value || '').startsWith('builtin:') ? String(value).slice(8) : '';
    if (name) return playBuiltinSound(name, v);
    if (!value) return { pause() {} };
    const audio = new Audio(resolveSoundUrl(value));
    audio.volume = v;
    audio.play().catch(() => {});
    return audio;
}
const alertSoundName = value => (String(value || '').startsWith('builtin:') ? String(value).slice(8) : '');

export { BUILTIN_SOUNDS, playBuiltinSound, playSoundValue, resolveSoundUrl, zzfxSamples };

(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.StreamPulseMotion = api;
}(typeof self !== 'undefined' ? self : this, function () {
    // Equations match the OBS Move plugin (AHEasing), so the overlay, editor preview and OBS play the same curve.
    const PI = Math.PI;
    const bounceOut = p => {
        if (p < 4 / 11) return (121 * p * p) / 16;
        if (p < 8 / 11) return (363 / 40) * p * p - (99 / 10) * p + 17 / 5;
        if (p < 9 / 10) return (4356 / 361) * p * p - (35442 / 1805) * p + 16061 / 1805;
        return (54 / 5) * p * p - (513 / 25) * p + 268 / 25;
    };
    const backIn = p => p * p * p - p * Math.sin(p * PI);

    const FAMILIES = {
        quad: { move: 1, label: 'Quadratic', in: p => p * p, out: p => -(p * (p - 2)), inOut: p => (p < 0.5 ? 2 * p * p : -2 * p * p + 4 * p - 1) },
        cubic: { move: 2, label: 'Cubic', in: p => p * p * p, out: p => (p - 1) ** 3 + 1, inOut: p => (p < 0.5 ? 4 * p * p * p : 0.5 * (2 * p - 2) ** 3 + 1) },
        quart: { move: 3, label: 'Quartic', in: p => p ** 4, out: p => (p - 1) ** 3 * (1 - p) + 1, inOut: p => (p < 0.5 ? 8 * p ** 4 : -8 * (p - 1) ** 4 + 1) },
        quint: { move: 4, label: 'Quintic', in: p => p ** 5, out: p => (p - 1) ** 5 + 1, inOut: p => (p < 0.5 ? 16 * p ** 5 : 0.5 * (2 * p - 2) ** 5 + 1) },
        sine: { move: 5, label: 'Sine', in: p => Math.sin((p - 1) * PI / 2) + 1, out: p => Math.sin(p * PI / 2), inOut: p => 0.5 * (1 - Math.cos(p * PI)) },
        circ: {
            move: 6, label: 'Circular',
            in: p => 1 - Math.sqrt(1 - p * p),
            out: p => Math.sqrt((2 - p) * p),
            inOut: p => (p < 0.5 ? 0.5 * (1 - Math.sqrt(1 - 4 * p * p)) : 0.5 * (Math.sqrt(-((2 * p) - 3) * ((2 * p) - 1)) + 1))
        },
        expo: {
            move: 7, label: 'Exponential',
            in: p => (p === 0 ? 0 : 2 ** (10 * (p - 1))),
            out: p => (p === 1 ? 1 : 1 - 2 ** (-10 * p)),
            inOut: p => (p === 0 || p === 1 ? p : p < 0.5 ? 0.5 * 2 ** ((20 * p) - 10) : -0.5 * 2 ** ((-20 * p) + 10) + 1)
        },
        elastic: {
            move: 8, label: 'Elastic',
            in: p => Math.sin(13 * PI / 2 * p) * 2 ** (10 * (p - 1)),
            out: p => Math.sin(-13 * PI / 2 * (p + 1)) * 2 ** (-10 * p) + 1,
            inOut: p => (p < 0.5
                ? 0.5 * Math.sin(13 * PI / 2 * (2 * p)) * 2 ** (10 * ((2 * p) - 1))
                : 0.5 * (Math.sin(-13 * PI / 2 * ((2 * p - 1) + 1)) * 2 ** (-10 * (2 * p - 1)) + 2))
        },
        bounce: { move: 9, label: 'Bounce', in: p => 1 - bounceOut(1 - p), out: bounceOut, inOut: p => (p < 0.5 ? 0.5 * (1 - bounceOut(1 - p * 2)) : 0.5 * bounceOut(p * 2 - 1) + 0.5) },
        back: {
            move: 10, label: 'Back',
            in: backIn,
            out: p => 1 - backIn(1 - p),
            inOut: p => (p < 0.5 ? 0.5 * backIn(2 * p) : 0.5 * (1 - backIn(1 - (2 * p - 1))) + 0.5)
        }
    };
    const MODES = { in: { move: 1, label: 'In' }, out: { move: 2, label: 'Out' }, 'in-out': { move: 3, label: 'In-Out', key: 'inOut' } };

    // Original easing names stay valid so saved overlays keep working.
    const ALIASES = { smooth: 'quint-out', snappy: 'expo-out', spring: 'back-out', 'ease-in-out': 'cubic-in-out' };

    function resolve(name) {
        const key = ALIASES[name] || name;
        if (key === 'linear') return { fn: p => p, move: { match: 0, fn: 2 } };
        const [family, ...rest] = String(key).split('-');
        const mode = MODES[rest.join('-')];
        const def = FAMILIES[family];
        if (!def || !mode) return resolve('quint-out');
        return { fn: def[mode.key || rest.join('-')], move: { match: mode.move, fn: def.move } };
    }

    const NAMES = ['linear'];
    Object.keys(FAMILIES).forEach(family => Object.keys(MODES).forEach(mode => NAMES.push(`${family}-${mode}`)));
    const isEasing = name => name === 'linear' || NAMES.includes(name) || Object.prototype.hasOwnProperty.call(ALIASES, name);

    function evaluate(name, t) {
        const x = Math.max(0, Math.min(1, Number(t) || 0));
        if (x === 0 || x === 1) return x;
        return resolve(name).fn(x);
    }

    // CSS linear() samples the exact function, so browser transitions match without cubic-bezier approximations.
    const cssCache = new Map();
    function toCss(name) {
        const key = ALIASES[name] || name;
        if (key === 'linear') return 'linear';
        if (!cssCache.has(key)) {
            const points = [];
            for (let i = 0; i <= 64; i++) points.push(Number(evaluate(key, i / 64).toFixed(4)));
            cssCache.set(key, `linear(${points.join(', ')})`);
        }
        return cssCache.get(key);
    }

    const moveSettings = name => {
        const { match, fn } = resolve(name).move;
        return { easing_match: match, easing_function_match: fn };
    };

    const options = () => [
        ['smooth', 'Smooth (Quintic out)'],
        ['snappy', 'Snappy (Exponential out)'],
        ['spring', 'Spring (Back out)'],
        ['ease-in-out', 'Ease In-Out (Cubic)'],
        ['linear', 'Linear (Constant speed)'],
        ...Object.entries(FAMILIES).flatMap(([family, def]) => Object.entries(MODES).map(([mode, m]) => [`${family}-${mode}`, `${def.label} ${m.label}`]))
    ];

    return { names: NAMES, aliases: ALIASES, isEasing, evaluate, toCss, moveSettings, options };
}));

function finite(value, label) {
    if (!['number', 'string'].includes(typeof value) || (typeof value === 'string' && !value.trim()) || !Number.isFinite(Number(value))) throw new Error(`${label} must be a finite number`);
    return Number(value);
}
const formatters = new Map();

function addNumbers(value, delta) {
    const decimalPlaces = number => {
        const [base, exponent = '0'] = String(number).split(/[eE]/);
        return Math.max(0, (base.split('.')[1]?.length || 0) - Number(exponent));
    };
    const digits = Math.max(decimalPlaces(value), decimalPlaces(delta));
    if (digits <= 12) {
        const scale = 10 ** digits;
        const left = Math.round(value * scale), right = Math.round(delta * scale);
        if ([left, right, left + right].every(Number.isSafeInteger)) return (left + right) / scale;
    }
    return value + delta;
}

function normalizeNumber(patch, current = {}) {
    const optional = key => {
        const raw = patch[key] !== undefined ? patch[key] : current[key];
        return raw === undefined || raw === null || raw === '' ? null : finite(raw, key);
    };
    const min = optional('min'), max = optional('max'), precision = optional('precision');
    const step = finite(patch.step ?? current.step ?? 1, 'Step');
    if (min !== null && max !== null && min > max) throw new Error('Minimum must not exceed maximum');
    if (step <= 0) throw new Error('Step must be positive');
    if (precision !== null && (!Number.isInteger(precision) || precision < 0 || precision > 12)) throw new Error('Precision must be an integer from 0 to 12');
    const factor = precision === null ? null : 10 ** precision;
    if (precision !== null && !formatters.has(precision)) formatters.set(precision, new Intl.NumberFormat('en-US', {
        useGrouping: false, minimumFractionDigits: precision, maximumFractionDigits: precision
    }));
    const round = value => precision === null ? value : Number(formatters.get(precision).format(value));
    let lower = min ?? -Infinity, upper = max ?? Infinity;
    if (precision !== null) {
        if (min !== null) {
            lower = round(min);
            if (lower < min) lower = addNumbers(lower, 1 / factor);
        }
        if (max !== null) {
            upper = round(max);
            if (upper > max) upper = addNumbers(upper, -1 / factor);
        }
    }
    if ((min !== null && !Number.isFinite(lower)) || (max !== null && !Number.isFinite(upper))) throw new Error('Bounds exceed the supported precision range');
    if (lower > upper) throw new Error('Bounds contain no value at the chosen precision');
    if (precision !== null && step < 1 / factor) throw new Error('Step is too small for the chosen precision');
    const normalize = raw => {
        const clamped = Math.max(lower, Math.min(upper, finite(raw, 'Value')));
        const rounded = round(clamped);
        return Math.max(lower, Math.min(upper, rounded));
    };

    return {
        value: normalize(patch.value !== undefined ? patch.value : current.value ?? 0),
        resetValue: normalize(patch.resetValue !== undefined ? patch.resetValue : current.resetValue ?? current.initial ?? 0),
        min, max, step, precision
    };
}

normalizeNumber.add = addNumbers;
normalizeNumber.parse = finite;
module.exports = normalizeNumber;

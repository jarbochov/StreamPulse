/**
 * StreamPulse Weather Service (Open-Meteo Integration)
 * Free API, no API key required.
 */

const WEATHER_CODES = {
    0: ['Clear', '☀️', '🌙'], 1: ['Mostly clear', '🌤️', '🌙'], 2: ['Partly cloudy', '⛅', '☁️'], 3: ['Overcast', '☁️', '☁️'],
    45: ['Fog', '🌫️', '🌫️'], 48: ['Freezing fog', '🌫️', '🌫️'],
    51: ['Light drizzle', '🌦️', '🌧️'], 53: ['Drizzle', '🌦️', '🌧️'], 55: ['Heavy drizzle', '🌧️', '🌧️'], 56: ['Freezing drizzle', '🌧️', '🌧️'], 57: ['Freezing drizzle', '🌧️', '🌧️'],
    61: ['Light rain', '🌦️', '🌧️'], 63: ['Rain', '🌧️', '🌧️'], 65: ['Heavy rain', '🌧️', '🌧️'], 66: ['Freezing rain', '🌧️', '🌧️'], 67: ['Freezing rain', '🌧️', '🌧️'],
    71: ['Light snow', '🌨️', '🌨️'], 73: ['Snow', '❄️', '❄️'], 75: ['Heavy snow', '❄️', '❄️'], 77: ['Snow grains', '🌨️', '🌨️'],
    80: ['Light showers', '🌦️', '🌧️'], 81: ['Showers', '🌧️', '🌧️'], 82: ['Heavy showers', '🌧️', '🌧️'], 85: ['Snow showers', '🌨️', '🌨️'], 86: ['Heavy snow showers', '❄️', '❄️'],
    95: ['Thunderstorm', '⛈️', '⛈️'], 96: ['Thunderstorm, hail', '⛈️', '⛈️'], 99: ['Thunderstorm, hail', '⛈️', '⛈️']
};

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

function weatherSlug(location) {
    return String(location || '').split(',')[0].toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function normalizeWeatherConfig(input = {}) {
    const slugs = new Set();
    const extra = [];
    for (const entry of (Array.isArray(input?.extra_locations) ? input.extra_locations : String(input?.extra_locations || '').split('\n')).slice(0, 8)) {
        const name = String(entry || '').trim().slice(0, 80);
        const slug = weatherSlug(name);
        if (name && slug && !slugs.has(slug)) { slugs.add(slug); extra.push(name); }
    }
    return {
        enabled: input?.enabled === true,
        location: String(input?.location || '').trim().slice(0, 80),
        extra_locations: extra,
        units: input?.units === 'metric' ? 'metric' : 'imperial',
        poll_minutes: Math.max(5, Math.min(180, Math.round(Number(input?.poll_minutes) || 15)))
    };
}

function weatherClock(iso) {
    const match = /T(\d{2}):(\d{2})/.exec(String(iso || ''));
    if (!match) return '';
    const hour = Number(match[1]);
    return `${hour % 12 || 12}:${match[2]} ${hour < 12 ? 'AM' : 'PM'}`;
}

function weatherHourLabel(iso) { return weatherClock(iso).replace(':00', ''); }

function weatherDayLabel(iso) {
    const date = new Date(`${String(iso).slice(0, 10)}T12:00:00Z`);
    return Number.isNaN(date.getTime()) ? '' : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getUTCDay()];
}

function createWeatherService({ getConfig, broadcastToOverlays = () => {} }) {
    let weatherState = { ok: false, error: '', extras: {} };
    let weatherTimer = null;
    const weatherGeoCache = new Map();

    async function geocodeWeather(location) {
        if (weatherGeoCache.has(location)) return weatherGeoCache.get(location);
        const [name, ...rest] = location.split(',').map(part => part.trim()).filter(Boolean);
        const hint = rest.join(' ').toLowerCase();
        const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=10&language=en&format=json`, { signal: AbortSignal.timeout(10000) });
        if (!response.ok) throw new Error(`Geocoding failed (${response.status})`);
        const results = (await response.json()).results || [];
        const match = (hint && results.find(place => [place.admin1, place.country, place.country_code].some(value => value && hint.includes(String(value).toLowerCase())))) || results[0];
        if (!match) throw new Error(`Could not find "${location}"`);
        const place = { city: match.name, region: match.admin1 || match.country || '', latitude: match.latitude, longitude: match.longitude };
        weatherGeoCache.set(location, place);
        return place;
    }

    async function readWeather(location, units) {
        const place = await geocodeWeather(location);
        const imperial = units === 'imperial';
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}`
            + '&current=temperature_2m,apparent_temperature,relative_humidity_2m,is_day,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,cloud_cover,pressure_msl'
            + '&hourly=temperature_2m,weather_code,precipitation_probability,is_day'
            + '&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code,sunrise,sunset,uv_index_max&forecast_days=6&timezone=auto'
            + `&temperature_unit=${imperial ? 'fahrenheit' : 'celsius'}&wind_speed_unit=${imperial ? 'mph' : 'kmh'}`;
        const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
        if (!response.ok) throw new Error(`Forecast failed (${response.status})`);
        const data = await response.json();
        const now = data.current || {};
        const lookup = (code, night) => { const [label, dayIcon, nightIcon] = WEATHER_CODES[code] || ['Unknown', '🌡️', '🌡️']; return { condition: label, icon: night ? nightIcon : dayIcon }; };
        const round = value => (Number.isFinite(value) ? Math.round(value) : '');
        const current = lookup(now.weather_code, now.is_day === 0);

        const hourly = [];
        const times = data.hourly?.time || [];
        const start = times.findIndex(time => time > String(now.time || '').slice(0, 13) + ':59');
        for (let i = Math.max(0, start), n = 0; i < times.length && n < 6; i++, n++) {
            hourly.push({ time: weatherHourLabel(times[i]), temp: round(data.hourly.temperature_2m?.[i]), precip: round(data.hourly.precipitation_probability?.[i]), ...lookup(data.hourly.weather_code?.[i], data.hourly.is_day?.[i] === 0) });
        }
        const daily = [];
        for (let i = 1; i < (data.daily?.time || []).length && i <= 5; i++) {
            daily.push({ day: weatherDayLabel(data.daily.time[i]), high: round(data.daily.temperature_2m_max?.[i]), low: round(data.daily.temperature_2m_min?.[i]), precip: round(data.daily.precipitation_probability_max?.[i]), ...lookup(data.daily.weather_code?.[i], false) });
        }
        return {
            ok: true, error: '', updatedAt: Date.now(),
            city: place.city, region: place.region, unit: imperial ? '°F' : '°C', wind_unit: imperial ? 'mph' : 'km/h', pressure_unit: imperial ? 'inHg' : 'hPa',
            temp: round(now.temperature_2m), feels_like: round(now.apparent_temperature),
            humidity: round(now.relative_humidity_2m),
            wind: round(now.wind_speed_10m), wind_dir: Number.isFinite(now.wind_direction_10m) ? COMPASS[Math.round(now.wind_direction_10m / 45) % 8] : '',
            gusts: round(now.wind_gusts_10m), cloud_cover: round(now.cloud_cover),
            pressure: Number.isFinite(now.pressure_msl) ? (imperial ? (now.pressure_msl * 0.02953).toFixed(2) : String(Math.round(now.pressure_msl))) : '',
            uv: round(data.daily?.uv_index_max?.[0]), sunrise: weatherClock(data.daily?.sunrise?.[0]), sunset: weatherClock(data.daily?.sunset?.[0]),
            condition: current.condition, icon: current.icon, is_day: now.is_day !== 0,
            high: round(data.daily?.temperature_2m_max?.[0]), low: round(data.daily?.temperature_2m_min?.[0]),
            precip_chance: round(data.daily?.precipitation_probability_max?.[0]),
            hourly, daily
        };
    }

    async function fetchWeather() {
        const config = getConfig();
        const cfg = normalizeWeatherConfig(config.weather);
        if (!cfg.enabled) { weatherState = { ok: false, error: '', extras: {} }; return; }
        const next = { ...weatherState, extras: {} };
        if (!cfg.location) next.error = 'Enter a location in the config editor.';
        else {
            try { Object.assign(next, await readWeather(cfg.location, cfg.units)); } catch (error) { next.ok = false; next.error = error.message; console.warn('[Weather]', error.message); }
        }
        for (const name of cfg.extra_locations) {
            try { next.extras[weatherSlug(name)] = await readWeather(name, cfg.units); }
            catch (error) { next.extras[weatherSlug(name)] = { ok: false, error: error.message, name }; console.warn('[Weather]', name, error.message); }
        }
        weatherState = next;
        broadcastToOverlays('weather', publicWeather());
    }

    function publicWeather() {
        const config = getConfig();
        const cfg = normalizeWeatherConfig(config.weather);
        return { enabled: cfg.enabled, units: cfg.units, location: cfg.location, ...weatherState };
    }

    function scheduleWeather() {
        const config = getConfig();
        const cfg = normalizeWeatherConfig(config.weather);
        if (weatherTimer) clearInterval(weatherTimer);
        weatherTimer = null;
        if (!cfg.enabled) { weatherState = { ok: false, error: '', extras: {} }; return; }
        fetchWeather();
        weatherTimer = setInterval(fetchWeather, cfg.poll_minutes * 60000);
    }

    function stop() {
        if (weatherTimer) clearInterval(weatherTimer);
        weatherTimer = null;
    }

    return {
        fetchWeather,
        publicWeather,
        scheduleWeather,
        normalizeWeatherConfig,
        stop
    };
}

module.exports = {
    createWeatherService,
    normalizeWeatherConfig,
    WEATHER_CODES
};

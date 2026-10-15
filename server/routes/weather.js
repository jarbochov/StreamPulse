const { normalizeWeatherConfig } = require('../services/weather');
const { sendJson, sendText } = require('./helpers');

function createWeatherRoutes({ weatherService, getConfig = () => ({}) }) {
    return async function handleWeatherRoutes(req, res, url, pathname) {
        if (!pathname.startsWith('/api/weather')) {
            return false;
        }

        if (pathname === '/api/weather') {
            const config = getConfig();
            if (url.searchParams.get('refresh') === '1' && normalizeWeatherConfig(config.weather).enabled) {
                await weatherService.fetchWeather();
            }
            sendJson(res, weatherService.publicWeather(), 200, { 'Cache-Control': 'no-store' });
            return true;
        }

        if (pathname === '/api/weather/icon.svg') {
            const icon = String(url.searchParams.get('e') || '🌡️').replace(/[<>&"']/g, '').slice(0, 8);
            sendText(res, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text x="50" y="50" font-size="80" text-anchor="middle" dominant-baseline="central">${icon}</text></svg>`, 200, 'image/svg+xml', { 'Cache-Control': 'no-store' });
            return true;
        }

        return false;
    };
}

module.exports = {
    createWeatherRoutes
};

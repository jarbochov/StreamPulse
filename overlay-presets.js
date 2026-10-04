// Built-in element presets for the overlay editor. Positions are relative to the preset's top-left corner;
// the editor fills in every other element default and places the result on the canvas.
(function (root) {
    const MUTED = '#8b949e';
    const PANEL = { background: 'rgba(13,17,23,0.82)', borderRadius: 18, borderColor: '#30363d', borderWidth: 2, shadow: { blur: 24, color: 'rgba(0,0,0,0.5)' } };

    const panel = (width, height, name = 'Panel') => ({ type: 'shape', name, x: 0, y: 0, width, height, style: PANEL });
    const text = (name, content, x, y, width, height, style = {}) => ({ type: 'text', name, content, x, y, width, height, style: { textAlign: 'left', verticalAlign: 'middle', ...style } });
    const muted = (name, content, x, y, width, height, size, align = 'left') => text(name, content, x, y, width, height, { fontSize: size, color: MUTED, textAlign: align });

    function build(id, name, category, description, width, height, elements, requires = '') {
        return { id, name, category, description, width, height, requires, builtin: true, elements };
    }

    function weatherHourly() {
        const parts = [panel(700, 190, 'Hourly panel'), muted('Hourly title', '{{weather.city}} · next hours', 20, 10, 660, 30, 18)];
        for (let i = 1; i <= 6; i++) {
            const x = 20 + (i - 1) * 110;
            parts.push(
                muted(`Hour ${i} time`, `{{weather.h${i}.time}}`, x, 44, 110, 26, 18, 'center'),
                text(`Hour ${i} icon`, `{{weather.h${i}.icon}}`, x, 70, 110, 52, { fontSize: 40, textAlign: 'center' }),
                text(`Hour ${i} temp`, `{{weather.h${i}.temp}}°`, x, 122, 110, 34, { fontSize: 26, fontWeight: '700', textAlign: 'center' }),
                muted(`Hour ${i} rain`, `💧 {{weather.h${i}.precip}}%`, x, 154, 110, 24, 15, 'center')
            );
        }
        return parts;
    }

    function weatherDaily() {
        const parts = [panel(690, 236, 'Daily panel'), muted('Daily title', '{{weather.city}} · 5-day forecast', 20, 10, 650, 30, 18)];
        for (let i = 1; i <= 5; i++) {
            const x = 20 + (i - 1) * 130;
            parts.push(
                text(`Day ${i} name`, `{{weather.d${i}.day}}`, x, 44, 130, 28, { fontSize: 22, fontWeight: '600', textAlign: 'center' }),
                text(`Day ${i} icon`, `{{weather.d${i}.icon}}`, x, 72, 130, 58, { fontSize: 44, textAlign: 'center' }),
                text(`Day ${i} high`, `{{weather.d${i}.high}}°`, x, 130, 130, 34, { fontSize: 28, fontWeight: '700', textAlign: 'center' }),
                muted(`Day ${i} low`, `{{weather.d${i}.low}}°`, x, 164, 130, 28, 22, 'center'),
                muted(`Day ${i} rain`, `💧 {{weather.d${i}.precip}}%`, x, 194, 130, 24, 15, 'center')
            );
        }
        return parts;
    }

    function weatherDetails() {
        const stat = (label, content, col, row) => text(label, content, 20 + col * 245, 140 + row * 30, 235, 28, { fontSize: 18, color: '#c9d1d9' });
        return [
            panel(520, 240, 'Weather panel'),
            text('Weather icon', '{{weather.icon}}', 14, 14, 120, 120, { fontSize: 80, textAlign: 'center' }),
            text('Weather temp', '{{weather.temp_full}}', 140, 8, 370, 70, { fontSize: 56, fontWeight: '700' }),
            text('Weather condition', '{{weather.condition}} · feels like {{weather.feels_like}}°', 140, 76, 370, 30, { fontSize: 20 }),
            muted('Weather location', '{{weather.location}}', 140, 104, 370, 26, 16),
            stat('Humidity', '💧 Humidity {{weather.humidity}}%', 0, 0),
            stat('Wind', '💨 {{weather.wind}}', 1, 0),
            stat('High / low', '🌡️ {{weather.high}}° / {{weather.low}}°', 0, 1),
            stat('Rain chance', '🌧️ Rain {{weather.precip_chance}}%', 1, 1),
            stat('Sun times', '🌅 {{weather.sunrise}} · 🌇 {{weather.sunset}}', 0, 2),
            stat('UV index', '☀️ UV {{weather.uv}} · ☁️ {{weather.cloud_cover}}%', 1, 2)
        ];
    }

    function list() {
        return [
            build('counter', 'Counter card', 'Stream', 'Big number with a caption, such as new followers this session.', 320, 180, [
                panel(320, 180, 'Counter panel'),
                text('Counter value', '{{followers.session}}', 0, 18, 320, 100, { fontSize: 84, fontWeight: '700', textAlign: 'center' }),
                muted('Counter caption', 'New followers', 0, 120, 320, 44, 26, 'center')
            ]),
            build('clock', 'Clock and date', 'Stream', 'Current time with the weekday and date underneath.', 360, 130, [
                panel(360, 130, 'Clock panel'),
                text('Clock time', '{{time}}', 0, 10, 360, 70, { fontSize: 58, fontWeight: '700', textAlign: 'center' }),
                muted('Clock date', '{{weekday}}, {{date}}', 0, 80, 360, 36, 22, 'center')
            ]),
            build('activity', 'Latest activity', 'Stream', 'Latest follower, subscriber, cheer and raider.', 420, 190, [
                panel(420, 190, 'Activity panel'),
                muted('Activity title', 'LATEST', 20, 10, 380, 26, 15),
                text('Latest follower', '👤 {{latest.follower}}', 20, 40, 380, 34, { fontSize: 24 }),
                text('Latest subscriber', '⭐ {{latest.subscriber}}', 20, 76, 380, 34, { fontSize: 24 }),
                text('Latest cheer', '💎 {{latest.cheer}} {{latest.cheer.amount}}', 20, 112, 380, 34, { fontSize: 24 }),
                text('Latest raider', '🚀 {{latest.raider}} {{latest.raider.viewers}}', 20, 148, 380, 34, { fontSize: 24 })
            ]),
            build('now-playing', 'Now playing card', 'Music', 'Album art with title, artist and a progress bar.', 540, 160, [
                panel(540, 160, 'Music panel'),
                { type: 'image', name: 'Album art', src: '{{music.cover}}', x: 15, y: 15, width: 130, height: 130, style: { borderRadius: 10, objectFit: 'cover' } },
                text('Track title', '{{music.title}}', 165, 14, 360, 44, { fontSize: 30, fontWeight: '700' }),
                muted('Track artist', '{{music.artist}}', 165, 58, 360, 32, 22),
                { type: 'progress', name: 'Track progress', content: '{{music.percent}}', x: 165, y: 108, width: 360, height: 12, style: { fontSize: 14 }, progress: { showLabel: false, thickness: 10 } },
                muted('Track time', '{{music.position}} / {{music.duration}}', 165, 122, 360, 24, 15)
            ]),
            build('game-banner', 'Game banner', 'Games', 'The game you are playing now, with what is scheduled next.', 560, 120, [
                panel(560, 120, 'Game panel'),
                muted('Game label', 'NOW PLAYING', 20, 10, 520, 24, 15),
                text('Game name', '{{plan.now}}', 20, 34, 520, 48, { fontSize: 34, fontWeight: '700' }),
                muted('Game next', 'Up next: {{plan.scheduled}}', 20, 82, 520, 28, 17)
            ]),
            build('weather-card', 'Weather card', 'Weather', 'Compact current conditions for your main city.', 340, 140, [
                panel(340, 140, 'Weather panel'),
                text('Weather icon', '{{weather.icon}}', 10, 15, 110, 110, { fontSize: 72, textAlign: 'center' }),
                text('Weather temp', '{{weather.temp_full}}', 125, 12, 205, 70, { fontSize: 52, fontWeight: '700' }),
                muted('Weather detail', '{{weather.condition}} · {{weather.city}}', 125, 84, 205, 44, 20)
            ], 'weather'),
            build('weather-details', 'Weather: current conditions', 'Weather', 'Detailed conditions: feels like, humidity, wind, high/low, rain, sunrise/sunset, UV.', 520, 240, weatherDetails(), 'weather'),
            build('weather-hourly', 'Weather: hourly forecast', 'Weather', 'The next six hours with icon, temperature and rain chance.', 700, 190, weatherHourly(), 'weather'),
            build('weather-daily', 'Weather: 5-day forecast', 'Weather', 'The next five days with icon, high, low and rain chance.', 690, 236, weatherDaily(), 'weather')
        ];
    }

    root.OverlayPresets = { list };
})(typeof window !== 'undefined' ? window : globalThis);

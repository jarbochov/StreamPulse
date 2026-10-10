(function(root) {
    const GOOGLE_FONTS = ['Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Oswald', 'Poppins', 'Raleway', 'Merriweather', 'Playfair Display', 'Bebas Neue', 'Fira Code', 'Silkscreen'];
    const googleFontSet = new Set(GOOGLE_FONTS);

    const VARIABLE_GROUPS = [
        { label: 'Viewers', items: [['viewers.current', 'Current viewers'], ['viewers.peak', 'Peak viewers'], ['viewers.average', 'Average viewers']] },
        { label: 'Chat', items: [['chatters', 'Chatters'], ['messages', 'Messages'], ['followers', 'Followers (current total)'], ['followers.session', 'New followers this session'], ['subscribers', 'Subscribers (current total)'], ['subscribers.session', 'Subscribers seen this session']] },
        { label: 'Engagement', items: [['gift_subs', 'Gift subs this session'], ['gift_subs.total', 'Gift subs (lifetime)'], ['bits', 'Bits this session'], ['bits.total', 'Bits (lifetime)'], ['donations', 'Donations this session'], ['donations.total', 'Donations (lifetime)']] },
        { label: 'Hashtags', items: [['hashtags.top', 'Most popular hashtag overall'], ['hashtags.session_top', 'Most popular hashtag this session'], ['hashtags.total', 'Total hashtag mentions']] },
        { label: 'Stream', items: [['music.title', 'Music title'], ['music.artist', 'Music artist'], ['music.album', 'Music album'], ['music.cover', 'Album art URL (use as an image source)'], ['music.position', 'Track position (m:ss)'], ['music.duration', 'Track length (m:ss)'], ['music.remaining', 'Track time remaining (m:ss)'], ['music.percent', 'Track progress % (for a progress element)'], ['stream.title', 'Stream title'], ['stream.category', 'Stream category (from Twitch)'], ['category.session_time', 'Time in this category, this session'], ['category.total_time', 'Time in this category, all sessions'], ['category.total_hours', 'Hours in this category, all sessions'], ['overlay.name', 'Overlay name']] }
    ];

    const CLOCK_ITEMS = [['now', 'Current date & time (format it with {{now|MMMM D, h:mm A}})'], ['time', 'Time (e.g. 3:07 PM)'], ['time.24', 'Time, 24-hour'], ['time.seconds', 'Time with seconds'], ['date', 'Date (short)'], ['date.long', 'Date (long)'], ['weekday', 'Weekday'], ['month', 'Month'], ['year', 'Year'], ['uptime', 'Stream uptime (H:MM:SS)']];
    const GAME_ITEMS = [['game.cover', 'Cover art URL (use as an image source)'], ['game.release_date', 'Release date'], ['game.release_year', 'Release year'], ['game.genres', 'Genres'], ['game.developer', 'Developer'], ['game.platforms', 'Platforms'], ['game.rating', 'IGDB rating (0–100)'], ['game.summary', 'Summary']];
    const WEATHER_ITEMS = [['weather.temp', 'Temperature (number)'], ['weather.temp_full', 'Temperature with unit (72°F)'], ['weather.unit', 'Temperature unit (°F / °C)'], ['weather.feels_like', 'Feels like (number)'], ['weather.condition', 'Conditions (Partly cloudy)'], ['weather.icon', 'Weather icon (emoji)'], ['weather.icon.url', 'Weather icon image URL (use as an image source)'], ['weather.humidity', 'Humidity %'], ['weather.wind', 'Wind with unit (8 mph NW)'], ['weather.wind.speed', 'Wind speed (number)'], ['weather.wind.dir', 'Wind direction (NW)'], ['weather.high', 'Today\'s high'], ['weather.low', 'Today\'s low'], ['weather.precip_chance', 'Chance of precipitation %'], ['weather.city', 'City'], ['weather.location', 'City, region'], ['weather.gusts', 'Wind gusts (number)'], ['weather.cloud_cover', 'Cloud cover %'], ['weather.pressure', 'Pressure (29.92 inHg / 1013 hPa)'], ['weather.pressure.unit', 'Pressure unit'], ['weather.uv', 'UV index (today\'s max)'], ['weather.sunrise', 'Sunrise (6:52 AM)'], ['weather.sunset', 'Sunset (7:14 PM)'],
        ['weather.h1.time', 'Next hours: h1–h6 time (3 PM)'], ['weather.h1.temp', 'Next hours: h1–h6 temperature'], ['weather.h1.icon', 'Next hours: h1–h6 icon (emoji)'], ['weather.h1.icon.url', 'Next hours: h1–h6 icon image URL'], ['weather.h1.condition', 'Next hours: h1–h6 conditions'], ['weather.h1.precip', 'Next hours: h1–h6 chance of precipitation %'],
        ['weather.d1.day', 'Next days: d1–d5 weekday (d1 = tomorrow)'], ['weather.d1.high', 'Next days: d1–d5 high'], ['weather.d1.low', 'Next days: d1–d5 low'], ['weather.d1.icon', 'Next days: d1–d5 icon (emoji)'], ['weather.d1.icon.url', 'Next days: d1–d5 icon image URL'], ['weather.d1.condition', 'Next days: d1–d5 conditions'], ['weather.d1.precip', 'Next days: d1–d5 chance of precipitation %']];
    const PLAN_ITEMS = [['plan.now', 'Game from your plan you are playing now'], ['plan.scheduled', 'Scheduled games (comma list)'], ['plan.backlog', 'Backlog games (comma list)']];
    const EVENT_ITEMS = [['latest.follower', 'Latest follower'], ['latest.subscriber', 'Latest subscriber'], ['latest.gifter', 'Latest gift sub gifter'], ['latest.cheer', 'Latest cheerer'], ['latest.cheer.amount', 'Latest cheer amount'], ['latest.donation', 'Latest donor'], ['latest.donation.amount', 'Latest donation amount'], ['latest.raider', 'Latest raider'], ['latest.raider.viewers', 'Latest raid size'], ['chatter.top', 'Top chatter this session'], ['chatter.top.count', 'Top chatter message count']];
    // Values that change every second are refreshed in place instead of re-rendering the overlay.
    // Live counters change constantly, so they refresh their text in place instead of re-rendering (and flashing) the whole overlay.
    const TICKING = /^(now$|time|date|weekday|month|year|uptime|timer\.|music\.(position|remaining|percent)$|category\.|viewers?\.|chatters$|messages$)/;
    const isTicking = name => TICKING.test(name);
    const hasTicking = value => /\{\{\s*(now|time|date|weekday|month|year|uptime|timer\.|music\.(position|remaining|percent)|category\.|viewers?\.|chatters|messages)/.test(String(value ?? ''));

    function formatMinutes(minutes) {
        const m = Math.max(0, Math.round(minutes || 0));
        return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
    }

    function pad(n) { return String(n).padStart(2, '0'); }
    function clock(ms) {
        const total = Math.max(0, Math.floor(ms / 1000));
        const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
        return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
    }

    function timerValues(status, now) {
        const out = {};
        const data = status.timerData;
        if (!data) return out;
        const drift = Math.max(0, now - (data.fetchedAt || now));
        for (const [id, timer] of Object.entries(data.timers || {})) {
            const running = timer.state === 'running';
            let text, percent;
            if (timer.kind === 'countdown') {
                const remaining = Math.max(0, (timer.remainingMs || 0) - (running ? drift : 0));
                text = clock(remaining);
                percent = timer.totalMs > 0 ? Math.round(Math.min(1, (timer.totalMs - remaining) / timer.totalMs) * 100) : 0;
            } else {
                text = clock((timer.elapsedMs || 0) + (running ? drift : 0));
                percent = '';
            }
            out[`timer.${id}`] = text;
            out[`timer.${id}.ms`] = timer.kind === 'countdown' ? Math.max(0, (timer.remainingMs || 0) - (running ? drift : 0)) : (timer.elapsedMs || 0) + (running ? drift : 0);
            out[`timer.${id}.label`] = timer.label;
            out[`timer.${id}.state`] = timer.state;
            out[`timer.${id}.percent`] = percent;
            if (timer.kind === 'countdown' && timer.targetAt) out[`timer.${id}.target`] = timer.targetAt;
        }
        return out;
    }

    // The server polls the player every few seconds, so position is advanced locally between refreshes.
    function musicValues(status, now) {
        const music = status.music;
        if (!music) return {};
        const duration = Number(music.duration) || 0;
        let position = Number(music.position) || 0;
        if (music.state === 'playing') position += (Number(music.positionAgeMs) || 0) / 1000 + Math.max(0, now - (status.musicFetchedAt || now)) / 1000;
        if (duration > 0) position = Math.min(position, duration);
        const hasTrack = !!music.track;
        const mmss = seconds => `${Math.floor(seconds / 60)}:${pad(Math.floor(seconds % 60))}`;
        return {
            'music.album': music.album,
            'music.cover': music.artworkUrl,
            'music.position': hasTrack ? mmss(position) : '',
            'music.duration': hasTrack && duration ? mmss(duration) : '',
            'music.remaining': hasTrack && duration ? mmss(Math.max(0, duration - position)) : '',
            'music.percent': hasTrack && duration ? Math.round(position / duration * 100) : ''
        };
    }

    function weatherFields(w) {
        return {
            temp: w.temp, temp_full: `${w.temp}${w.unit}`, unit: w.unit, feels_like: w.feels_like,
            condition: w.condition, icon: w.icon, 'icon.url': `/api/weather/icon.svg?e=${encodeURIComponent(w.icon)}`,
            humidity: w.humidity, wind: `${w.wind} ${w.wind_unit}${w.wind_dir ? ` ${w.wind_dir}` : ''}`, 'wind.speed': w.wind, 'wind.dir': w.wind_dir,
            high: w.high, low: w.low, precip_chance: w.precip_chance,
            city: w.city, location: [w.city, w.region].filter(Boolean).join(', '),
            gusts: w.gusts, cloud_cover: w.cloud_cover, pressure: w.pressure, 'pressure.unit': w.pressure_unit, uv: w.uv, sunrise: w.sunrise, sunset: w.sunset,
            ...forecastFields(w.hourly, 'h', ['time', 'temp', 'condition', 'icon', 'precip']),
            ...forecastFields(w.daily, 'd', ['day', 'high', 'low', 'condition', 'icon', 'precip'])
        };
    }

    // h1..h6 are the next hours, d1..d5 the next days; each also gets an icon.url for image elements.
    function forecastFields(rows, prefix, keys) {
        const out = {};
        (rows || []).forEach((row, index) => {
            for (const key of keys) out[`${prefix}${index + 1}.${key}`] = row[key];
            out[`${prefix}${index + 1}.icon.url`] = `/api/weather/icon.svg?e=${encodeURIComponent(row.icon)}`;
        });
        return out;
    }

    // The main city is {{weather.temp}}; extra cities use their name: {{weather.tokyo.temp}}
    function weatherValues(status) {
        const w = status.weather;
        const out = {};
        if (!w?.enabled) return out;
        if (w.ok) for (const [key, value] of Object.entries(weatherFields(w))) out[`weather.${key}`] = value;
        for (const [slug, extra] of Object.entries(w.extras || {})) {
            if (!extra.ok) continue;
            for (const [key, value] of Object.entries(weatherFields(extra))) out[`weather.${slug}.${key}`] = value;
        }
        return out;
    }

    function planListValues(status) {
        const out = {};
        for (const list of status.gamePlan?.lists || []) out[`plan.list.${list.id}`] = (status.gamePlan.items || []).filter(item => item.status === list.id).map(item => item.name).join(', ');
        return out;
    }

    function goalValues(status) {
        const out = {};
        for (const goal of status.goalItems || []) {
            out[`goal.${goal.id}.title`] = goal.title;
            out[`goal.${goal.id}.current`] = goal.progress;
            out[`goal.${goal.id}.target`] = goal.target;
            out[`goal.${goal.id}.percent`] = goal.percent;
            out[`goal.${goal.id}.remaining`] = goal.remaining;
            const text = value => goal.unit === 'usd' ? `$${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: Number.isInteger(Number(value)) ? 0 : 2, maximumFractionDigits: 2 })}` : String(value ?? '');
            out[`goal.${goal.id}.current_text`] = text(goal.progress);
            out[`goal.${goal.id}.target_text`] = text(goal.target);
            out[`goal.${goal.id}.remaining_text`] = text(goal.remaining);
        }
        return out;
    }

    function eventValues(status) {
        const out = {};
        const first = type => (status.recentEvents || []).find(event => event.type === type);
        const pick = (name, type, field = 'user') => { const found = first(type); if (found) out[name] = found[field]; };
        pick('latest.follower', 'follow'); pick('latest.subscriber', 'sub'); pick('latest.gifter', 'gift');
        pick('latest.cheer', 'bits'); pick('latest.cheer.amount', 'bits', 'detail');
        pick('latest.donation', 'donation'); pick('latest.donation.amount', 'donation', 'detail');
        pick('latest.raider', 'raid');
        const raid = first('raid');
        if (raid) out['latest.raider.viewers'] = parseInt(raid.detail, 10) || raid.detail;
        const top = status.topChatters?.[0];
        if (top) { out['chatter.top'] = top.chatname; out['chatter.top.count'] = top.messageCount; }
        return out;
    }

    function clockValues(status, now) {
        const d = new Date(now);
        const started = Date.parse(status.viewers?.streamStartedAt || '') || Date.parse(status.startedAt || '');
        return {
            'time': d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
            'time.24': `${pad(d.getHours())}:${pad(d.getMinutes())}`,
            'time.seconds': d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' }),
            'date': d.toLocaleDateString(),
            'date.long': d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
            'weekday': d.toLocaleDateString([], { weekday: 'long' }),
            'month': d.toLocaleDateString([], { month: 'long' }),
            'year': String(d.getFullYear()),
            'now': d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }),
            'uptime': started ? clock(now - started) : ''
        };
    }

    // Static groups plus the timers and goals that currently exist.
    function variableGroups(status = {}) {
        const groups = VARIABLE_GROUPS.map(g => ({ label: g.label, items: g.items.slice() }));
        groups.push({ label: 'Clock', items: CLOCK_ITEMS });
        if (status.weather?.enabled) {
            groups.push({ label: 'Weather', items: WEATHER_ITEMS });
            for (const [slug, extra] of Object.entries(status.weather.extras || {})) {
                if (extra.ok) groups.push({ label: `Weather: ${extra.city}`, items: WEATHER_ITEMS.map(([name, label]) => [name.replace('weather.', `weather.${slug}.`), label]) });
            }
        }
        groups.push({ label: 'Game (IGDB)', items: GAME_ITEMS });
        groups.push({ label: 'Game plan', items: [...PLAN_ITEMS, ...(status.gamePlan?.lists || []).map(list => [`plan.list.${list.id}`, `${list.name} list (comma list)`])] });
        groups.push({ label: 'Latest events', items: EVENT_ITEMS });
        for (const [id, timer] of Object.entries(status.timerData?.timers || {})) {
            const items = [[`timer.${id}`, `${timer.label} — clock (format it: {{timer.${id}|short}})`], [`timer.${id}.ms`, `${timer.label} — milliseconds`], [`timer.${id}.label`, `${timer.label} — title`], [`timer.${id}.state`, `${timer.label} — state`]];
            if (timer.kind === 'countdown') items.push([`timer.${id}.percent`, `${timer.label} — percent complete`]);
            if (timer.kind === 'countdown' && timer.targetAt) items.push([`timer.${id}.target`, `${timer.label} — target date & time (formattable)`]);
            groups.push({ label: `Timer: ${timer.label}`, items });
        }
        for (const goal of status.goalItems || []) {
            groups.push({ label: `Goal: ${goal.title}`, items: [['title', 'title'], ['current', 'current progress'], ['target', 'target'], ['percent', 'percent'], ['remaining', 'remaining'], ['current_text', 'current (with $ for donations)'], ['target_text', 'target (with $ for donations)'], ['remaining_text', 'remaining (with $ for donations)']].map(([key, label]) => [`goal.${goal.id}.${key}`, `${goal.title} — ${label}`]) });
        }
        return groups;
    }

    function variableTable(status = {}, context = {}, now = Date.now()) {
        return {
            ...clockValues(status, now),
            ...eventValues(status),
            ...goalValues(status),
            ...timerValues(status, now),
            ...musicValues(status, now),
            ...planListValues(status),
            ...weatherValues(status),
            'stream.category': status.stream?.category?.name,
            'game.cover': status.stream?.game?.cover,
            'game.release_date': status.stream?.game?.releaseDate,
            'game.release_year': status.stream?.game?.releaseYear,
            'game.rating': status.stream?.game?.rating,
            'game.genres': (status.stream?.game?.genres || []).join(', '),
            'game.developer': (status.stream?.game?.developers || [])[0],
            'game.platforms': (status.stream?.game?.platforms || []).join(', '),
            'game.summary': status.stream?.game?.summary,
            'plan.now': (status.gamePlan?.items || []).find(item => item.playingNow)?.name,
            'plan.scheduled': (status.gamePlan?.items || []).filter(item => item.status === 'scheduled').map(item => item.name).join(', '),
            'plan.backlog': (status.gamePlan?.items || []).filter(item => item.status === 'backlog').map(item => item.name).join(', '),
            'category.session_time': status.stream?.category ? formatMinutes(status.stream.category.sessionMinutes) : undefined,
            'category.total_time': status.stream?.category ? formatMinutes(status.stream.category.totalMinutes) : undefined,
            'category.total_hours': status.stream?.category ? (status.stream.category.totalMinutes / 60).toFixed(1) : undefined,
            'viewer.current': status.viewers?.current,
            'viewers.current': status.viewers?.current,
            'viewer.peak': status.viewers?.peak,
            'viewers.peak': status.viewers?.peak,
            'viewer.average': status.viewers?.average,
            'viewers.average': status.viewers?.average,
            'chatters': status.ssn?.chatters,
            'messages': status.ssn?.messages,
            'followers': status.goalMetrics?.persistent?.followers ?? status.ssn?.followers,
            'followers.session': status.goalMetrics?.session?.followers ?? status.ssn?.followers,
            'subscribers': status.goalMetrics?.persistent?.subscribers ?? status.ssn?.subscribers,
            'subscribers.session': status.goalMetrics?.session?.subscribers ?? status.ssn?.subscribers,
            'gift_subs': status.goalMetrics?.session?.gift_subs,
            'gift_subs.total': status.goalMetrics?.persistent?.gift_subs,
            'bits': status.goalMetrics?.session?.bits,
            'bits.total': status.goalMetrics?.persistent?.bits,
            'donations': status.goalMetrics?.session?.donations,
            'donations.total': status.goalMetrics?.persistent?.donations,
            'hashtags': status.ssn?.hashtags,
            'hashtags.top': status.popularHashtags?.overall?.[0]?.tag || status.hashtags?.topTag,
            'hashtags.session_top': status.popularHashtags?.session?.[0]?.tag,
            'hashtags.total': status.hashtags?.totalMentions,
            'music.title': status.music?.track,
            'music.artist': status.music?.artist,
            'stream.title': status.stream?.title,
            'overlay.name': context.overlayName
        };
    }


    // Date/time formatting for {{token|format}}. Tokens follow the familiar Moment/Day.js style; wrap literal text in [brackets].
    const FORMAT_PRESETS = [['short', '4d 3h 22m 2s (timers)'], ['long', '4 days, 3 hours… (timers)'], ['clock', '4d 3:22:02 (timers)'], ['d[d] h[h] m[m]', '4d 3h 22m (timers)'], ['MMMM D, YYYY', 'October 2, 2026'], ['MMM D', 'Oct 2'], ['ddd, MMM D', 'Fri, Oct 2'], ['dddd, MMMM Do', 'Friday, October 2nd'], ['YYYY-MM-DD', '2026-10-02'], ['MM/DD/YYYY', '10/02/2026'], ['h:mm A', '1:34 PM'], ['HH:mm', '13:34'], ['MMM D, h:mm A', 'Oct 2, 1:34 PM'], ['dddd [at] h A', 'Friday at 1 PM']];
    const isDateKey = name => /^timer\.[a-zA-Z0-9_-]+$/.test(name) || /^(now|time|time\.24|time\.seconds|date|date\.long|game\.release_date|timer\.[a-zA-Z0-9_-]+\.target)$/.test(name);
    const ordinal = n => { const v = n % 100; return n + (['th', 'st', 'nd', 'rd'][(v - 20) % 10] || ['th', 'st', 'nd', 'rd'][v] || 'th'); };

    function formatDate(date, format) {
        const h12 = date.getHours() % 12 || 12;
        const names = { MMMM: { month: 'long' }, MMM: { month: 'short' }, dddd: { weekday: 'long' }, ddd: { weekday: 'short' } };
        const map = {
            YYYY: () => date.getFullYear(), YY: () => String(date.getFullYear()).slice(-2),
            MM: () => pad(date.getMonth() + 1), M: () => date.getMonth() + 1,
            DD: () => pad(date.getDate()), Do: () => ordinal(date.getDate()), D: () => date.getDate(),
            HH: () => pad(date.getHours()), H: () => date.getHours(),
            hh: () => pad(h12), h: () => h12,
            mm: () => pad(date.getMinutes()), m: () => date.getMinutes(),
            ss: () => pad(date.getSeconds()), s: () => date.getSeconds(),
            A: () => (date.getHours() < 12 ? 'AM' : 'PM'), a: () => (date.getHours() < 12 ? 'am' : 'pm')
        };
        return format.replace(/\[([^\]]*)\]|MMMM|MMM|dddd|ddd|YYYY|YY|MM|M|DD|Do|D|HH|H|hh|h|mm|m|ss|s|A|a/g, (token, literal) => {
            if (literal !== undefined) return literal;
            if (names[token]) return date.toLocaleDateString([], names[token]);
            return String(map[token]());
        });
    }

    function parseDateValue(value) {
        const text = String(value ?? '').trim();
        if (!text) return null;
        const dateOnly = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        const date = dateOnly ? new Date(+dateOnly[1], +dateOnly[2] - 1, +dateOnly[3]) : new Date(text);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    // Duration formatting for timer clocks: {{timer.id|d[d] h[h] m[m]}} or a preset (short, long, clock).
    function formatDuration(ms, format) {
        const total = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
        const v = { d: Math.floor(total / 86400), h: Math.floor(total % 86400 / 3600), m: Math.floor(total % 3600 / 60), s: total % 60 };
        const first = v.d ? 'd' : v.h ? 'h' : v.m ? 'm' : 's';
        const order = ['d', 'h', 'm', 's'].slice(['d', 'h', 'm', 's'].indexOf(first));
        const presets = {
            short: order.map(u => `${v[u]}${u}`).join(' '),
            long: order.map(u => `${v[u]} ${{ d: 'day', h: 'hour', m: 'minute', s: 'second' }[u]}${v[u] === 1 ? '' : 's'}`).join(', '),
            clock: v.d ? `${v.d}d ${v.h}:${pad(v.m)}:${pad(v.s)}` : v.h ? `${v.h}:${pad(v.m)}:${pad(v.s)}` : `${v.m}:${pad(v.s)}`
        };
        if (presets[format] !== undefined) return presets[format];
        const map = { d: v.d, dd: pad(v.d), h: v.h, hh: pad(v.h), m: v.m, mm: pad(v.m), s: v.s, ss: pad(v.s), th: Math.floor(total / 3600), tm: Math.floor(total / 60), ts: total };
        return format.replace(/\[([^\]]*)\]|th|tm|ts|dd|d|hh|h|mm|m|ss|s/g, (token, literal) => literal !== undefined ? literal : String(map[token]));
    }

    function applyFormat(name, value, format, now, table = {}) {
        if (!format) return value;
        if (/^timer\.[a-zA-Z0-9_-]+$/.test(name) && table[`${name}.ms`] !== undefined) return formatDuration(table[`${name}.ms`], format);
        const clockKey = /^(now|time|time\.24|time\.seconds|date|date\.long)$/.test(name);
        const date = clockKey ? new Date(now) : parseDateValue(value);
        return date ? formatDate(date, format) : value;
    }

    // keepEmpty leaves {{token}} in place when no live value exists, which keeps editor previews selectable.
    function expandVariables(value, status, context = {}, keepEmpty = false) {
        const now = Date.now();
        const table = variableTable(status, context, now);
        return String(value ?? '').replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*(?:\|([^{}]*?))?\s*\}\}/g, (match, name, format) => {
            const resolved = format === undefined ? table[name] : applyFormat(name, table[name], format.trim(), now, table);
            const text = resolved === undefined || resolved === null ? '' : String(resolved);
            return text === '' && keepEmpty ? match : text;
        });
    }

    function variableSnapshot(status, context) {
        const table = variableTable(status, context);
        for (const key of Object.keys(table)) if (isTicking(key) && !key.startsWith('timer.')) delete table[key];
        // Timer clocks tick on their own, so only structural timer values count as changes.
        for (const key of Object.keys(table)) if (key.startsWith('timer.') && !/\.(label|state)$/.test(key)) delete table[key];
        table.__plan = (status.gamePlan?.items || []).map(item => [item.name, item.status, item.period, item.cover, item.playingNow, item.note, item.finished, (item.played || []).join(',')]);
        return JSON.stringify(table);
    }

    // Splits blocks into balanced flex columns, breaking lists between items and keeping numbering continuous.
    function buildColumns(nodes, cols) {
        const units = [];
        nodes.forEach(node => {
            const weight = n => 1 + Math.floor((n.textContent || '').length / 40);
            if (node.nodeType === 1 && (node.tagName === 'UL' || node.tagName === 'OL')) {
                const start = node.tagName === 'OL' ? Number(node.getAttribute('start') || 1) : 0;
                [...node.children].forEach((li, index) => units.push({ node: li, list: node, number: start + index, weight: weight(li) }));
            } else if (node.nodeType !== 3 || node.textContent.trim()) units.push({ node, weight: weight(node) });
        });
        const total = units.reduce((sum, unit) => sum + unit.weight, 0);
        const group = document.createElement('div');
        group.className = 'md-col-group';
        group.style.cssText = `display:flex;align-items:flex-start;gap:1.5em`;
        const columns = Array.from({ length: cols }, () => { const col = document.createElement('div'); col.style.cssText = 'flex:1 1 0;min-width:0'; group.appendChild(col); return col; });
        let seen = 0, index = 0, lastList = null, lastCol = -1, listEl = null;
        units.forEach(unit => {
            index = Math.min(cols - 1, Math.floor(((seen + unit.weight / 2) / total) * cols));
            seen += unit.weight;
            const col = columns[index];
            if (unit.list) {
                if (unit.list !== lastList || index !== lastCol) {
                    listEl = document.createElement(unit.list.tagName);
                    [...unit.list.attributes].forEach(attr => listEl.setAttribute(attr.name, attr.value));
                    if (unit.list.tagName === 'OL') listEl.setAttribute('start', unit.number);
                    col.appendChild(listEl);
                }
                listEl.appendChild(unit.node);
                lastList = unit.list; lastCol = index;
            } else { col.appendChild(unit.node); lastList = null; }
        });
        return group;
    }

    function renderMarkdown(source, el) {
        // Obsidian-style YAML frontmatter at the very top is metadata, not content.
        const body = String(source ?? '').replace(/^\uFEFF?\s*---[ \t]*\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/, '');
        const html = root.marked.parse(body, { breaks: true, gfm: true });
        const fragment = root.DOMPurify.sanitize(html, {
            RETURN_DOM_FRAGMENT: true,
            ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'del', 'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'img', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td'],
            ALLOWED_ATTR: ['href', 'title', 'target', 'rel', 'src', 'alt', 'align']
        });
        // Wrap each list item's inline text so right-aligned lists can flip their bullets without reordering the text.
        const BLOCKS = new Set(['UL', 'OL', 'P', 'PRE', 'BLOCKQUOTE', 'TABLE', 'HR', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6']);
        fragment.querySelectorAll('li').forEach(li => {
            let run = null;
            [...li.childNodes].forEach(child => {
                if (child.nodeType === 1 && BLOCKS.has(child.tagName)) { run = null; return; }
                if (!run) { run = document.createElement('span'); run.className = 'li-t'; li.insertBefore(run, child); }
                run.appendChild(child);
            });
        });
        const holder = document.createElement('div');
        holder.appendChild(fragment);
        const cols = el && el.columns > 1 ? Number(el.columns) : 0;
        if (cols) {
            // Columns are real flex children, not CSS multicol: Safari can't paint a clipped text gradient through multicol, and CSS column-span mis-lays out in a fixed-height box.
            const span = Number(el.headingSpan ?? 6);
            const out = document.createElement('div');
            let run = [];
            const flush = () => { if (run.length) out.appendChild(buildColumns(run, cols)); run = []; };
            [...holder.childNodes].forEach(child => {
                const level = child.nodeType === 1 && /^H[1-6]$/.test(child.tagName) ? Number(child.tagName[1]) : 0;
                if (level && level <= span) { flush(); out.appendChild(child); } else run.push(child);
            });
            flush();
            return out.innerHTML;
        }
        return holder.innerHTML;
    }

    function loadGoogleFont(fontFamily) {
        const name = String(fontFamily || '').split(',')[0].replace(/^['"]|['"]$/g, '').trim();
        if (!googleFontSet.has(name)) return;
        const id = `google-font-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
        if (document.getElementById(id)) return;
        const link = document.createElement('link');
        link.id = id;
        link.rel = 'stylesheet';
        link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(name).replace(/%20/g, '+')}:wght@400;600;700;900&display=swap`;
        document.head.appendChild(link);
    }

    // Uploaded font files are registered with @font-face so they work in browsers that hide installed fonts (Safari).
    const assetFonts = [];
    async function loadAssetFonts() {
        try {
            const response = await fetch('/api/custom-overlays/assets', { cache: 'no-store' });
            if (!response.ok) return assetFonts;
            const fonts = (await response.json()).filter(asset => asset.kind === 'font');
            assetFonts.splice(0, assetFonts.length, ...fonts);
            let style = document.getElementById('asset-font-faces');
            if (!style) { style = document.createElement('style'); style.id = 'asset-font-faces'; document.head.appendChild(style); }
            style.textContent = fonts.map(font => `@font-face { font-family: '${font.family.replace(/'/g, '')}'; src: url('${font.url}'); font-display: swap; }`).join('\n');
            await Promise.all(fonts.map(font => document.fonts.load(`16px '${font.family}'`).catch(() => null)));
        } catch { /* fonts are optional */ }
        return assetFonts;
    }

    async function loadLiveExtras(status) {
        try {
            const [timers, goals, plan, weather] = await Promise.all([
                fetch('/api/timers', { cache: 'no-store' }).then(r => r.ok ? r.json() : null),
                fetch('/api/goals', { cache: 'no-store' }).then(r => r.ok ? r.json() : null),
                fetch('/api/game-plan', { cache: 'no-store' }).then(r => r.ok ? r.json() : null),
                fetch('/api/weather', { cache: 'no-store' }).then(r => r.ok ? r.json() : null)
            ]);
            if (weather) status.weather = weather;
            if (plan) status.gamePlan = plan;
            status.musicFetchedAt = Date.now();
            if (timers) status.timerData = { fetchedAt: Date.now(), timers: timers.timers || {} };
            if (goals) status.goalItems = goals.items || [];
        } catch { /* extras are optional */ }
        return status;
    }

    // Extra look-and-feel that every element type shares: gradient fills (box and text), frosted blur and drop shadow.
    // Progress elements put the gradient on their fill, so the track stays a plain color.
    const TEXT_FILL_TYPES = new Set(['text', 'random-text', 'markdown', 'game-list']);
    const isTextGradient = (style, type) => TEXT_FILL_TYPES.has(type) && style?.textGradient?.enabled === true;

    const hasBoxFill = style => style?.gradient?.enabled === true || (!!style?.background && !/^(transparent|rgba\(0,\s*0,\s*0,\s*0\))$/i.test(style.background));

    function decorationStyle(style = {}, type = '') {
        const out = {
            backdropFilter: style.blur > 0 ? `blur(${style.blur}px)` : '',
            boxShadow: style.shadow?.blur > 0 ? `0 4px ${style.shadow.blur}px ${style.shadow.color || 'rgba(0,0,0,.5)'}` : ''
        };
        const text = isTextGradient(style, type) ? style.textGradient : null;
        const box = style.gradient?.enabled && type !== 'progress' ? style.gradient : null;
        if (!text && !box) return Object.assign(out, { webkitTextFillColor: '', backgroundSize: '', backgroundClip: '', webkitBackgroundClip: '', backgroundPosition: '', animation: '' });
        ensureGradientKeyframes();
        // One background list: the text gradient is clipped to the letters, the box gradient or color fills the box behind it.
        const layers = [], sizes = [], clips = [];
        const add = (css, g, clip) => { layers.push(css); sizes.push(g?.animate ? '300% 300%' : '100% 100%'); clips.push(clip); };
        if (text) add(gradientCss(text), text, 'text');
        if (box) add(gradientCss(box), box, 'border-box');
        else if (text && style.background && style.background !== 'transparent') add(`linear-gradient(${style.background}, ${style.background})`, null, 'border-box');
        const positions = [], anims = [];
        const track = (g, name) => {
            positions.push(g?.animate ? (slidesVertically(g) ? `50% var(--sp-${name})` : `var(--sp-${name}) 50%`) : '0% 50%');
            if (g?.animate) anims.push(`sp-shift-${name} ${Math.max(1, g.speed || 8)}s ease-in-out infinite alternate`);
        };
        if (text) track(text, 't');
        if (box) track(box, 'b');
        else if (layers.length > (text ? 1 : 0)) track(null, 'b');
        Object.assign(out, {
            background: layers.join(', '),
            backgroundPosition: positions.join(', '),
            backgroundSize: sizes.join(', '),
            backgroundClip: clips.join(', '),
            webkitBackgroundClip: clips.join(', '),
            animation: anims.join(', ')
        });
        // Fill is transparent but color stays solid, so borders, rules and bullets that use currentColor remain visible.
        out.webkitTextFillColor = text ? 'transparent' : '';
        if (text) out.color = text.from || '#1f6feb';
        return out;
    }

    // Linear or radial fill with 2-3 stops; animated gradients slide an oversized fill back and forth like the timer wizard.
    function gradientCss(g) {
        const stops = [g.from || '#1f6feb', g.mid, g.to || '#8957e5'].filter(Boolean).join(', ');
        return g.type === 'radial' ? `radial-gradient(circle at ${g.position || 'center'}, ${stops})` : `linear-gradient(${g.angle ?? 135}deg, ${stops})`;
    }

    // Slide along the axis the gradient actually changes on; a 0/180deg linear gradient doesn't vary horizontally.
    function slidesVertically(g) {
        if (g?.type === 'radial') return false;
        const rad = (Number(g?.angle ?? 135) * Math.PI) / 180;
        return Math.abs(Math.cos(rad)) > Math.abs(Math.sin(rad));
    }

    function gradientStyle(g) {
        ensureGradientKeyframes();
        return g.animate
            ? { background: gradientCss(g), backgroundSize: '300% 300%', animation: `${slidesVertically(g) ? 'sp-gradient-shift-y' : 'sp-gradient-shift'} ${Math.max(1, g.speed || 8)}s ease-in-out infinite alternate` }
            : { background: gradientCss(g), backgroundSize: '', animation: '' };
    }

    function ensureGradientKeyframes() {
        if (document.getElementById('sp-gradient-keyframes')) return;
        const tag = document.createElement('style');
        tag.id = 'sp-gradient-keyframes';
        // Registered properties let text and box gradients animate on separate timers.
        tag.textContent = '@property --sp-t { syntax: "<percentage>"; inherits: false; initial-value: 0%; } @property --sp-b { syntax: "<percentage>"; inherits: false; initial-value: 0%; } '
            + '@keyframes sp-gradient-shift { from { background-position: 0% 50%; } to { background-position: 100% 50%; } } @keyframes sp-gradient-shift-y { from { background-position: 50% 0%; } to { background-position: 50% 100%; } } '
            + '@keyframes sp-shift-t { from { --sp-t: 0%; } to { --sp-t: 100%; } } @keyframes sp-shift-b { from { --sp-b: 0%; } to { --sp-b: 100%; } }';
        document.head.appendChild(tag);
    }

    // Gradient borders keep rounded corners by drawing a masked ring inside the element. A MutationObserver puts the ring
    // back whenever the element's content is rewritten.
    function applyBorderGradient(node, style = {}) {
        const g = style.borderGradient, width = Number(style.borderWidth) || 0;
        if (!g?.enabled || width <= 0) {
            if (node._borderRing) { node._borderObserver.disconnect(); node._borderRing.remove(); node._borderRing = node._borderObserver = null; }
            return;
        }
        let ring = node._borderRing;
        if (!ring) {
            ring = node._borderRing = document.createElement('div');
            ring.setAttribute('aria-hidden', 'true');
            node._borderObserver = new MutationObserver(() => { if (ring.parentNode !== node) node.append(ring); });
            node._borderObserver.observe(node, { childList: true });
        }
        if (ring.parentNode !== node) node.append(ring);
        // The element's own border moves into padding so layout stays put while the ring is drawn inside the clipped box.
        node.style.padding = `calc(${node.style.padding || '0px'} + ${width}px)`;
        node.style.border = '0';
        Object.assign(ring.style, gradientStyle(g), {
            position: 'absolute', inset: '0', boxSizing: 'border-box', border: `${width}px solid transparent`,
            borderRadius: 'inherit', pointerEvents: 'none', backgroundOrigin: 'border-box', backgroundClip: 'border-box'
        });
        ring.style.setProperty('-webkit-mask', 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)');
        ring.style.setProperty('-webkit-mask-composite', 'xor');
        ring.style.setProperty('mask-composite', 'exclude');
    }

    // Outline, text shadow and case/decoration apply to the text itself (and inherit into markdown and alert text).
    function textEffectStyle(style = {}, type = '') {
        const stroke = style.textStroke?.width > 0;
        return {
            webkitTextStroke: stroke ? `${style.textStroke.width}px ${style.textStroke.color || '#000'}` : '',
            paintOrder: stroke ? 'stroke fill' : '',
            textShadow: style.textShadow?.blur > 0 && !isTextGradient(style, type) ? `0 2px ${style.textShadow.blur}px ${style.textShadow.color || 'rgba(0,0,0,.7)'}` : '',
            // Clipped gradient text ignores text-shadow, so a drop-shadow filter follows the letters instead (only when no box fill would be shadowed too).
            filter: style.textShadow?.blur > 0 && isTextGradient(style, type) && !hasBoxFill(style) ? `drop-shadow(0 2px ${style.textShadow.blur}px ${style.textShadow.color || 'rgba(0,0,0,.7)'})` : '',
            textTransform: style.textTransform && style.textTransform !== 'none' ? style.textTransform : '',
            textDecoration: style.textDecoration && style.textDecoration !== 'none' ? style.textDecoration : ''
        };
    }

    // Draws or updates a progress bar/ring in place so CSS transitions keep animating between ticks.
    function renderProgress(node, element, expand) {
        const config = element.progress || {};
        const style = element.style || {};
        const ring = config.kind === 'ring';
        const raw = parseFloat(expand(element.content || '0'));
        const percent = Math.max(0, Math.min(100, Number.isFinite(raw) ? raw : 0));
        const label = expand(String(config.label ?? '{{progress}}%').replace(/\{\{\s*progress\s*\}\}/g, String(Math.round(percent))));
        const key = ring ? 'ring' : 'bar';
        if (node._progressKind !== key) {
            node._progressKind = key;
            const ns = 'http://www.w3.org/2000/svg';
            const holder = document.createElement('div');
            holder.style.cssText = 'position:absolute;inset:0;border-radius:inherit;overflow:hidden;';
            if (ring) {
                const svg = document.createElementNS(ns, 'svg');
                svg.setAttribute('viewBox', '0 0 100 100');
                svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;';
                const track = document.createElementNS(ns, 'circle'), arc = document.createElementNS(ns, 'circle');
                for (const circle of [track, arc]) { circle.setAttribute('cx', '50'); circle.setAttribute('cy', '50'); circle.setAttribute('fill', 'none'); }
                arc.setAttribute('stroke-linecap', 'round');
                arc.setAttribute('transform', 'rotate(-90 50 50)');
                arc.style.transition = 'stroke-dashoffset .5s linear';
                svg.append(track, arc);
                holder.appendChild(svg);
                holder._track = track; holder._fill = arc;
            } else {
                const track = document.createElement('div'), fill = document.createElement('div');
                track.style.cssText = 'position:absolute;inset:0;';
                fill.style.cssText = 'position:absolute;left:0;top:0;bottom:0;transition:width .5s linear;';
                track.appendChild(fill);
                holder.appendChild(track);
                holder._track = track; holder._fill = fill;
            }
            const text = document.createElement('div');
            text.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;white-space:nowrap;';
            holder._text = text;
            holder.appendChild(text);
            node.replaceChildren(holder);
            node._progress = holder;
        }
        const holder = node._progress;
        if (ring) {
            const thickness = Math.max(2, Math.min(40, config.thickness || 10));
            const radius = 50 - thickness / 2, circumference = 2 * Math.PI * radius;
            holder._track.setAttribute('r', radius); holder._track.setAttribute('stroke', config.trackColor || 'rgba(255,255,255,.18)'); holder._track.setAttribute('stroke-width', thickness);
            holder._fill.setAttribute('r', radius); holder._fill.setAttribute('stroke', style.fill || '#1f6feb'); holder._fill.setAttribute('stroke-width', thickness);
            holder._fill.style.strokeDasharray = circumference;
            holder._fill.style.strokeDashoffset = circumference * (1 - percent / 100);
        } else {
            holder._track.style.background = config.trackColor || 'rgba(255,255,255,.18)';
            holder._fill.style.background = style.fill || '#1f6feb';
            holder._fill.style.width = `${percent}%`;
            const fillStyle = style.gradient?.enabled ? gradientStyle(style.gradient) : { backgroundSize: '', animation: '' };
            Object.assign(holder._fill.style, fillStyle);
        }
        holder._text.textContent = config.showLabel === false ? '' : label;
    }

    function ensureTickerStyle() {
        if (document.getElementById('sp-gl-ticker')) return;
        const tag = document.createElement('style');
        tag.id = 'sp-gl-ticker';
        tag.textContent = '@keyframes spGlTicker{from{transform:translateX(0)}to{transform:translateX(-50%)}}@keyframes spGlTickerR{from{transform:translateX(-50%)}to{transform:translateX(0)}}';
        document.head.appendChild(tag);
    }

    // Renders the manual game plan as a cover grid, a cover strip or a text list.
    function renderGameList(node, element, plan) {
        const config = element.gameList || {};
        const style = element.style || {};
        let items = (plan?.items || []).filter(item => config.filter === 'all' || item.status === (config.filter || 'scheduled'));
        const order = (plan?.periods || []).map(name => String(name).toLowerCase());
        const rank = item => { const at = order.indexOf(String(item.period || '').toLowerCase()); return at < 0 ? order.length : at; };
        const wanted = (Array.isArray(config.periods) && config.periods.length ? config.periods : config.period ? [config.period] : []).map(name => String(name).toLowerCase());
        if (wanted.length) items = items.filter(item => wanted.includes(String(item.period || '').toLowerCase()));
        // Date filter and grouping use the dates a game was streamed on (auto-recorded) plus its finished date.
        const datesOf = item => [...new Set([...(item.played || []), item.finished].filter(Boolean))];
        const monthKey = (year, month) => { const d = new Date(year, month, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
        const today = new Date();
        const when = config.when || '';
        const inWindow = !when ? null
            : when === 'thisYear' ? date => date.startsWith(String(today.getFullYear()))
            : when === 'lastYear' ? date => date.startsWith(String(today.getFullYear() - 1))
            : when === 'thisMonth' ? date => date.startsWith(monthKey(today.getFullYear(), today.getMonth()))
            : when === 'lastMonth' ? date => date.startsWith(monthKey(today.getFullYear(), today.getMonth() - 1))
            : date => date.startsWith(when);
        if (inWindow) items = items.filter(item => datesOf(item).some(inWindow));
        if (config.groupBy === 'month' || config.groupBy === 'year') {
            const size = config.groupBy === 'month' ? 7 : 4;
            const label = key => !key ? 'Undated' : size === 7 ? new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' }) : key;
            items = items.flatMap(item => {
                const keys = [...new Set(datesOf(item).filter(date => !inWindow || inWindow(date)).map(date => date.slice(0, size)))].sort();
                return (keys.length ? keys : ['']).map(key => ({ ...item, period: label(key), __groupKey: key }));
            }).sort((a, b) => a.__groupKey.localeCompare(b.__groupKey));
        }
        if (config.maxPeriods > 0) {
            const keep = [...new Set(items.map(item => item.period || ''))].sort((a, b) => rank({ period: a }) - rank({ period: b })).slice(0, config.maxPeriods);
            items = items.filter(item => keep.includes(item.period || ''));
        }
        if (config.sort === 'rating') items = [...items].sort((a, b) => (b.rating || 0) - (a.rating || 0));
        else if (config.sort === 'name') items = [...items].sort((a, b) => String(a.name).localeCompare(String(b.name)));
        if (config.max > 0) items = items.slice(0, config.max);
        if (config.filter === 'scheduled' || config.filter === 'all' || config.sort === 'plan' || !config.sort) items = items.map((item, at) => ({ item, at })).sort((a, b) => rank(a.item) - rank(b.item) || a.at - b.at).map(entry => entry.item);
        const layout = config.layout || 'grid';
        if (layout === 'ticker') ensureTickerStyle();
        const gap = config.gap ?? 12;
        const groupGap = config.groupGap ?? gap;
        const accent = config.accent || '#3fb950';
        node.replaceChildren();
        node._fitObserver?.disconnect();
        node._fitObserver = null;
        node.style.display = 'block';
        node.style.overflow = 'hidden';
        node.style.whiteSpace = 'normal';
        if (!items.length) {
            const empty = document.createElement('div');
            empty.style.opacity = '.6';
            empty.textContent = 'No games to show. Add some in the Game Plan editor.';
            node.appendChild(empty);
            return;
        }

        const inner = document.createElement('div');
        inner.style.transformOrigin = 'top left';
        node.appendChild(inner);
        const sections = [];
        const kanban = layout === 'kanban';
        const tiers = layout === 'tiers';
        const ticker = layout === 'ticker';
        const alignH = config.alignH || 'left', alignV = config.alignV || 'top';
        const hAlign = kanban || ticker ? 'left' : alignH;
        const just = { left: 'flex-start', center: 'center', right: 'flex-end' }[hAlign];
        const coverMargin = { left: '0 auto 0 0', center: '0 auto', right: '0 0 0 auto' }[hAlign];
        const TIERS = [[5, 'S', '#ff7f7f'], [4, 'A', '#ffbf7f'], [3, 'B', '#ffdf7f'], [2, 'C', '#bfff7f'], [1, 'D', '#7fbfff'], [0, '?', '#b0b0b0']];
        const TIER_LETTERS = [['S', '#ff7f7f'], ['A', '#ffbf7f'], ['B', '#ffdf7f'], ['C', '#bfff7f'], ['D', '#7fbfff'], ['F', '#bf9fff'], ['?', '#b0b0b0']];
        const autoColumns = layout === 'grid' && config.columns === 0;
        const statusNames = { scheduled: 'Scheduled', backlog: 'Backlog', played: 'Played' };
        for (const entry of plan?.lists || []) statusNames[entry.id] = entry.name;
        if (tiers) {
            if (config.tierSource === 'tier') {
                const defs = (plan?.tierSets?.[config.filter] || (plan?.tiers?.length ? plan.tiers : TIER_LETTERS.slice(0, 6).map(([id, color]) => ({ id, label: id, color }))));
                for (const def of defs) {
                    const tierItems = items.filter(item => item.tier === def.id);
                    if (tierItems.length) sections.push({ label: def.label, color: def.color, items: tierItems });
                }
                const unranked = items.filter(item => !defs.some(def => def.id === item.tier));
                if (unranked.length) sections.push({ label: '?', color: '#b0b0b0', items: unranked });
            } else for (const [stars, label, color] of TIERS) {
                const tierItems = items.filter(item => Math.round(Math.max(0, Math.min(5, item.rating || 0))) === stars);
                if (tierItems.length) sections.push({ label, color, items: tierItems });
            }
        } else if (kanban) {
            // One column per period, or per list when showing everything.
            for (const item of items) {
                const label = config.filter === 'all' ? (statusNames[item.status] || item.status) : (item.period || 'No period');
                let section = sections.find(entry => entry.label === label);
                if (!section) { section = { label, items: [] }; sections.push(section); }
                section.items.push(item);
            }
            inner.style.cssText += `display:flex;align-items:flex-start;gap:${groupGap}px;transform-origin:top left;`;
        } else if (!ticker && config.headings !== false && config.filter !== 'backlog') {
            for (const item of items) {
                const label = item.period || '';
                let section = sections.find(entry => entry.label === label);
                if (!section) { section = { label, items: [] }; sections.push(section); }
                section.items.push(item);
            }
        } else sections.push({ label: '', items });

        const meta = item => {
            if (config.meta === 'year') return item.releaseYear ? String(item.releaseYear) : '';
            if (config.meta === 'genres') return (item.genres || []).slice(0, 2).join(' · ');
            if (config.meta === 'note') return item.note || '';
            if (config.meta === 'rating') {
                if (!(item.rating > 0)) return '';
                const full = Math.floor(item.rating), half = item.rating - full >= 0.5 ? 1 : 0;
                return '★'.repeat(full) + (half ? '½' : '') + '☆'.repeat(5 - full - half);
            }
            if (config.meta === 'tags') return (item.tags || []).slice(0, 3).join(' · ');
            return '';
        };
        const scale = (config.coverScale || 100) / 100;
        const compact = layout === 'grid' || layout === 'strip' || tiers || ticker;
        // Opacity would cut text out of a parent's clipped gradient fill, so dimmed text stays solid when the text color is a gradient.
        const dim = value => (style.textGradient?.enabled ? '' : `opacity:${value};`);
        // Text sizes are percentages of the element's own font size; the old px settings still apply when no percentage is set.
        const rel = (percent, legacyPx, fallback) => (!(percent > 0) && legacyPx > 0 ? `${legacyPx}px` : `${(percent > 0 ? percent : fallback) / 100}em`);
        const titleSize = rel(config.titleScale, config.titleSize, compact ? 80 : 100);
        const headingSize = rel(config.headingScale, config.headingSize, 100);
        const metaSize = rel(config.metaScale, 0, compact ? 65 : 70);
        const onCover = compact && config.titlePlacement === 'overlay' && config.showCovers !== false && config.showTitles !== false;
        const titleFlow = config.titleWrap === 'wrap' ? 'overflow-wrap:break-word;line-height:1.2' : 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
        const badge = () => {
            const tag = document.createElement('span');
            tag.textContent = 'NOW PLAYING';
            tag.style.cssText = `background:${accent};color:#000;font-size:.55em;font-weight:800;letter-spacing:.06em;padding:.15em .5em;border-radius:999px;white-space:nowrap;`;
            return tag;
        };
        const cover = (item, extra, hideName) => {
            const wrap = document.createElement('div');
            wrap.dataset.glCover = '1';
            wrap.style.cssText = `background:rgba(255,255,255,.08);border-radius:${Math.min(12, style.borderRadius || 8)}px;overflow:hidden;display:flex;align-items:center;justify-content:center;text-align:center;font-size:.6em;padding:.3em;box-sizing:border-box;${extra}`;
            if (item.cover) {
                const img = document.createElement('img');
                img.src = item.cover; img.alt = '';
                img.style.cssText = config.coverFit === 'natural' ? 'width:100%;height:auto;display:block;' : `position:absolute;inset:0;width:100%;height:100%;object-fit:${config.coverFit === 'contain' ? 'contain' : 'cover'};display:block;`;
                if (config.coverFit !== 'natural') wrap.style.position = 'relative';
                wrap.style.padding = '0';
                wrap.appendChild(img);
            } else if (!hideName) wrap.textContent = item.name;
            if (item.playingNow && config.highlightCurrent !== false) wrap.style.boxShadow = `0 0 0 3px ${accent}`;
            return wrap;
        };

        const tierBoxWidth = Math.max(2.2, Math.min(6, Math.max(...sections.map(entry => String(entry.label || '').length), 1) * 0.65 + 0.8));
        for (const section of sections) {
            let holder = inner;
            if (kanban) {
                holder = document.createElement('div');
                holder.dataset.glCover = '1';
                holder.style.cssText = `flex:1 1 0;min-width:0;background:rgba(255,255,255,.06);border-radius:${Math.min(16, style.borderRadius || 10)}px;padding:.6em;box-sizing:border-box;`;
                inner.appendChild(holder);
            } else if (tiers) {
                holder = document.createElement('div');
                holder.dataset.glSection = '1';
                holder.style.cssText = `display:flex;align-items:stretch;gap:.6em;min-width:0;margin-bottom:${groupGap}px;`;
                const badgeBox = document.createElement('div');
                badgeBox.textContent = section.label;
                badgeBox.style.cssText = `flex:none;width:${tierBoxWidth}em;display:flex;align-items:center;justify-content:center;text-align:center;overflow-wrap:anywhere;line-height:1.1;font-weight:800;font-size:${headingSize};background:${section.color};color:#000;border-radius:${Math.min(12, style.borderRadius || 8)}px;`;
                holder.appendChild(badgeBox);
                inner.appendChild(holder);
            } else if (autoColumns || config.periodsAcross > 0) {
                holder = document.createElement('div');
                holder.dataset.glSection = '1';
                holder.style.minWidth = '0';
                inner.appendChild(holder);
            }
            if (section.label && !tiers) {
                const heading = document.createElement('div');
                heading.textContent = section.label;
                heading.style.cssText = `font-weight:700;margin:0 0 .5em;text-align:${hAlign};${dim(.85)}font-size:${headingSize};`;
                holder.appendChild(heading);
            }
            const body = document.createElement('div');
            body.style.marginBottom = kanban || tiers ? '0' : `${groupGap}px`;
            if (tiers) body.style.cssText += 'flex:1;min-width:0;';
            if (layout === 'list' || kanban) {
                body.style.cssText += `display:flex;flex-direction:column;gap:${gap / 2}px;`;
                for (const item of section.items) {
                    const row = document.createElement('div');
                    row.style.cssText = `display:flex;align-items:center;gap:.6em;justify-content:${just};`;
                    if (config.showCovers !== false) row.appendChild(cover(item, `width:${((kanban ? 3 : 2.4) * scale).toFixed(2)}em;height:${((kanban ? 4 : 3.2) * scale).toFixed(2)}em;flex:none;`));
                    const text = document.createElement('div');
                    text.style.cssText = `min-width:0;flex:${hAlign === 'left' ? '1' : '0 1 auto'};text-align:${hAlign};`;
                    const title = document.createElement('div');
                    title.style.cssText = `display:flex;align-items:center;gap:.5em;justify-content:${just};`;
                    const name = document.createElement('span');
                    name.textContent = item.name;
                    name.style.cssText = `font-weight:600;${titleFlow};font-size:${titleSize};`;
                    if (config.showTitles !== false || config.showCovers === false) title.appendChild(name);
                    if (item.playingNow && config.highlightCurrent !== false) title.appendChild(badge());
                    text.appendChild(title);
                    const extra = meta(item);
                    if (extra) { const line = document.createElement('div'); line.textContent = extra; line.style.cssText = `font-size:${metaSize};${dim(.65)}`; text.appendChild(line); }
                    row.appendChild(text);
                    body.appendChild(row);
                }
            } else {
                const strip = layout === 'strip';
                const cols = ticker ? (config.columns || 5) : tiers ? (config.columns || 6) : (config.columns || 3);
                body.style.cssText += strip
                    ? `display:flex;gap:${gap}px;`
                    : ticker ? 'display:flex;width:max-content;'
                    : `display:flex;flex-wrap:wrap;gap:${gap}px;justify-content:${just};--cols:${cols};`;
                if (!strip && !ticker) body.dataset.glGrid = '1';
                const fill = target => { for (const item of section.items) {
                    const card = document.createElement('div');
                    card.style.cssText = strip ? 'flex:1 1 0;min-width:0;'
                        : ticker ? `flex:0 0 calc((100cqw - ${(cols - 1) * gap}px) / ${cols});min-width:0;`
                        : `flex:0 0 calc((100% - (var(--cols) - 1) * ${gap}px) / var(--cols) - .5px);min-width:0;`;
                    const face = cover(item, `width:${Math.min(100, scale * 100)}%;margin:${coverMargin};${config.coverFit === 'natural' && item.cover ? '' : `aspect-ratio:${config.coverRatio || '3/4'};`}`, onCover);
                    const extra = meta(item);
                    if (onCover) {
                        face.style.position = 'relative';
                        const bar = document.createElement('div');
                        bar.style.cssText = 'position:absolute;left:0;right:0;bottom:0;padding:1.6em .45em .4em;background:linear-gradient(transparent,rgba(0,0,0,.85));color:#fff;text-align:center;text-shadow:0 1px 3px rgba(0,0,0,.7);';
                        const name = document.createElement('div');
                        name.textContent = item.name;
                        name.style.cssText = `font-weight:600;font-size:${titleSize};${titleFlow};`;
                        bar.appendChild(name);
                        if (extra) { const line = document.createElement('div'); line.textContent = extra; line.style.cssText = `font-size:${metaSize};opacity:.8;${titleFlow};`; bar.appendChild(line); }
                        face.appendChild(bar);
                        if (item.playingNow && config.highlightCurrent !== false) { const flag = badge(); flag.style.cssText += 'position:absolute;top:.4em;left:.4em;'; face.appendChild(flag); }
                        card.appendChild(face);
                    } else {
                        card.appendChild(face);
                        if (item.playingNow && config.highlightCurrent !== false) { const holder = document.createElement('div'); holder.style.cssText = `text-align:${hAlign};margin-top:.35em;`; holder.appendChild(badge()); card.appendChild(holder); }
                        if (config.showTitles !== false) {
                            const name = document.createElement('div');
                            name.textContent = item.name;
                            name.style.cssText = `margin-top:.35em;font-weight:600;text-align:${hAlign};font-size:${titleSize};${titleFlow};`;
                            card.appendChild(name);
                        }
                        if (extra) { const line = document.createElement('div'); line.textContent = extra; line.style.cssText = `font-size:${metaSize};${dim(.65)}text-align:${hAlign};${titleFlow};`; card.appendChild(line); }
                    }
                    target.appendChild(card);
                } };
                if (ticker) {
                    for (let copy = 0; copy < 2; copy++) {
                        const half = document.createElement('div');
                        half.dataset.glTickerCopy = '1';
                        half.style.cssText = `display:flex;gap:${gap}px;padding-right:${gap}px;`;
                        fill(half);
                        body.appendChild(half);
                    }
                } else fill(body);
            }
            holder.appendChild(body);
        }

        // Placement: auto columns pick the fewest columns (biggest covers) that fit the box, "shrink" scales down when still too tall,
        // and the position options decide where leftover space goes.
        const shrink = config.fit === 'shrink';
        node.style.containerType = ticker ? 'inline-size' : '';
        const fadeMask = ticker && config.tickerFade !== false ? 'linear-gradient(90deg,transparent,#000 6%,#000 94%,transparent)' : '';
        node.style.webkitMaskImage = fadeMask;
        node.style.maskImage = fadeMask;
        if (typeof ResizeObserver !== 'function' || !(ticker || autoColumns || shrink || config.periodsAcross > 0 || alignV !== 'top' || alignH !== 'left')) return;
        const grids = [...inner.querySelectorAll('[data-gl-grid]')];
        if (config.periodsAcross > 0 && !kanban) {
            inner.style.display = 'grid';
            inner.style.gridTemplateColumns = `repeat(${config.periodsAcross},minmax(0,1fr))`;
            inner.style.columnGap = `${groupGap}px`;
            inner.style.alignItems = 'start';
        }
        const place = () => {
            if (ticker) {
                const copies = [...inner.querySelectorAll('[data-gl-ticker-copy]')];
                if (!copies.length) return;
                const width = copies[0].getBoundingClientRect().width;
                const scrolls = width > node.clientWidth + 1;
                copies[1].style.display = scrolls ? 'flex' : 'none';
                const body = copies[0].parentElement;
                body.style.animation = scrolls ? `${config.tickerDirection === 'right' ? 'spGlTickerR' : 'spGlTicker'} ${(copies[0].children.length * (config.tickerPace || 3)).toFixed(2)}s linear infinite` : 'none';
                return;
            }
            inner.style.transform = '';
            inner.style.transformOrigin = 'left top';
            const avail = node.clientHeight;
            if (!(avail > 0)) return;
            if (autoColumns && grids.length) {
                // Try every mix of "periods side by side" and "covers per row", keeping the one with the biggest covers once fitted.
                const sectionEls = [...inner.querySelectorAll(':scope > [data-gl-section]')];
                const width = node.clientWidth;
                const most = Math.min(12, Math.max(...grids.map(grid => grid.children.length)));
                inner.style.display = 'grid';
                inner.style.columnGap = `${groupGap}px`;
                inner.style.alignItems = 'start';
                let best = null;
                for (let across = config.periodsAcross > 0 ? Math.min(config.periodsAcross, sectionEls.length) : 1; across <= (config.periodsAcross > 0 ? Math.min(config.periodsAcross, sectionEls.length) : sectionEls.length); across++) {
                    inner.style.gridTemplateColumns = `repeat(${across},minmax(0,1fr))`;
                    for (let columns = 1; columns <= most; columns++) {
                        grids.forEach(grid => grid.style.setProperty('--cols', columns));
                        const need = inner.offsetHeight;
                        const fit = need > avail ? avail / need : 1;
                        const cell = (width - (across - 1) * groupGap) / across;
                        const score = shrink || need <= avail ? ((cell - (columns - 1) * gap) / columns) * fit : fit * 0.0001;
                        if (!best || score > best.score * 1.02) best = { across, columns, score };
                    }
                }
                inner.style.gridTemplateColumns = `repeat(${best.across},minmax(0,1fr))`;
                grids.forEach(grid => grid.style.setProperty('--cols', best.columns));
            }
            const need = inner.offsetHeight;
            const factor = shrink && need > avail ? avail / need : 1;
            const free = Math.max(0, avail - need * factor);
            const dy = alignV === 'middle' ? free / 2 : alignV === 'bottom' ? free : 0;
            let dx = 0;
            if (alignH !== 'left') {
                // Align the visible content (covers and tight text bounds), not the stretched grid cells around it.
                const box = node.getBoundingClientRect();
                let left = Infinity, right = -Infinity;
                const take = rect => { if (rect.width > 0) { left = Math.min(left, rect.left); right = Math.max(right, rect.right); } };
                inner.querySelectorAll('[data-gl-cover], img').forEach(el => take(el.getBoundingClientRect()));
                const range = document.createRange();
                const walker = document.createTreeWalker(inner, NodeFilter.SHOW_TEXT);
                while (walker.nextNode()) { if (walker.currentNode.textContent.trim()) { range.selectNodeContents(walker.currentNode); take(range.getBoundingClientRect()); } }
                if (right > left) {
                    const from = (left - box.left) * factor, to = (right - box.left) * factor;
                    dx = alignH === 'center' ? (node.clientWidth - (to - from)) / 2 - from : node.clientWidth - to;
                }
            }
            if (factor < 1 || dy > 0 || dx) inner.style.transform = `translate(${dx.toFixed(1)}px,${dy.toFixed(1)}px) scale(${factor.toFixed(4)})`;
        };
        node._fitObserver = new ResizeObserver(place);
        node._fitObserver.observe(node);
        node.querySelectorAll('img').forEach(img => img.addEventListener('load', place));
        place();
    }

    // QR codes are rendered by the server as SVG, so the overlay only needs an image URL.
    // Font Awesome icon. The class list is restricted to safe characters, and the stylesheet loads on first use.
    function renderIcon(node, value, style = {}) {
        node.replaceChildren();
        const cls = String(value || '').trim().replace(/^fab\b/, 'fa-brands').replace(/^fas\b/, 'fa-solid').replace(/^far\b/, 'fa-regular');
        if (!cls) return;
        if (!document.querySelector('link[data-fa]')) {
            const link = document.createElement('link');
            link.rel = 'stylesheet'; link.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css'; link.dataset.fa = '1';
            document.head.appendChild(link);
        }
        if (!/^[a-z0-9 -]+$/i.test(cls)) { node.textContent = cls.slice(0, 4); return; }
        const icon = document.createElement('i');
        icon.className = cls;
        // Sized to the box height; width follows the glyph, and alignment places it in the box.
        icon.style.cssText = 'font-size:100cqh;line-height:1;display:block;flex:none;';
        node.style.containerType = 'size';
        node.style.display = 'flex';
        node.style.alignItems = style.verticalAlign === 'top' ? 'flex-start' : style.verticalAlign === 'bottom' ? 'flex-end' : 'center';
        node.style.justifyContent = style.textAlign === 'left' ? 'flex-start' : style.textAlign === 'right' ? 'flex-end' : 'center';
        node.appendChild(icon);
    }

    function qrUrl(text, qr = {}) {
        const value = String(text ?? '').trim();
        if (!value) return '';
        const params = new URLSearchParams({ text: value, fg: qr.fg || '#000000', bg: qr.bg || '#ffffff', margin: String(qr.margin ?? 2), ecc: qr.ecc || 'M' });
        return `/api/qr?${params}`;
    }

    // Alert box: the element's fill/border/shadow move onto an inner card so they only show while an alert plays.
    const ALERT_DECORATION = ['background', 'backgroundImage', 'backgroundSize', 'animation', 'border', 'borderRadius', 'boxShadow', 'backdropFilter', 'webkitBackdropFilter'];
    function prepareAlertNode(node) {
        const deco = {};
        for (const key of ALERT_DECORATION) {
            if (node.style[key]) deco[key] = node.style[key];
            node.style[key] = '';
        }
        node.style.border = '0';
        node.style.display = 'block';
        node._alertDeco = deco;
    }

    // Built-in alert sounds are synthesized with Web Audio, so no audio files are needed. Stored as "builtin:<name>".
    const BUILTIN_SOUNDS = {
        ding: { label: 'Ding', notes: [[880, 0, 1.1, 'sine', 0.9]] },
        chime: { label: 'Chime', notes: [[659, 0, 0.9, 'sine', 0.7], [880, 0.14, 0.9, 'sine', 0.7], [1319, 0.28, 1.3, 'sine', 0.7]] },
        coin: { label: 'Coin', notes: [[988, 0, 0.09, 'square', 0.25], [1319, 0.09, 0.55, 'square', 0.25]] },
        fanfare: { label: 'Fanfare', notes: [[523, 0, 0.18, 'triangle', 0.9], [659, 0.16, 0.18, 'triangle', 0.9], [784, 0.32, 0.18, 'triangle', 0.9], [1047, 0.48, 0.9, 'triangle', 0.9], [784, 0.48, 0.9, 'triangle', 0.5]] },
        levelup: { label: 'Level up', notes: [[392, 0, 0.1, 'square', 0.22], [494, 0.09, 0.1, 'square', 0.22], [587, 0.18, 0.1, 'square', 0.22], [784, 0.27, 0.1, 'square', 0.22], [988, 0.36, 0.1, 'square', 0.22], [1175, 0.45, 0.45, 'square', 0.22]] },
        pop: { label: 'Pop', notes: [[700, 0, 0.14, 'sine', 1, 180]] },
        whoosh: { label: 'Whoosh', noise: true }
    };
    let audioCtx = null;
    function playBuiltinSound(name, volume = 0.7) {
        const def = BUILTIN_SOUNDS[name];
        const Ctx = root.AudioContext || root.webkitAudioContext;
        if (!def || !Ctx) return { pause() {} };
        audioCtx = audioCtx || new Ctx();
        if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
        const ctx = audioCtx, now = ctx.currentTime + 0.02, sources = [];
        const master = ctx.createGain();
        master.gain.value = Math.max(0, Math.min(1, volume)) * 0.5;
        master.connect(ctx.destination);
        const envelope = (start, dur, peak) => {
            const gain = ctx.createGain();
            gain.gain.setValueAtTime(0.0001, start);
            gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), start + 0.012);
            gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
            gain.connect(master);
            return gain;
        };
        for (const [freq, at, dur, type, peak, slideTo] of def.notes || []) {
            const osc = ctx.createOscillator();
            osc.type = type;
            osc.frequency.setValueAtTime(freq, now + at);
            if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, now + at + dur);
            osc.connect(envelope(now + at, dur, peak));
            osc.start(now + at); osc.stop(now + at + dur + 0.05);
            sources.push(osc);
        }
        if (def.noise) {
            const length = Math.floor(ctx.sampleRate * 0.9);
            const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
            const src = ctx.createBufferSource(), filter = ctx.createBiquadFilter();
            src.buffer = buffer;
            filter.type = 'bandpass'; filter.Q.value = 1.2;
            filter.frequency.setValueAtTime(300, now);
            filter.frequency.exponentialRampToValueAtTime(4000, now + 0.8);
            src.connect(filter); filter.connect(envelope(now, 0.9, 0.9));
            src.start(now); src.stop(now + 0.95);
            sources.push(src);
        }
        return { pause() { sources.forEach(source => { try { source.stop(); } catch { /* already ended */ } }); } };
    }
    const alertSoundName = value => (String(value || '').startsWith('builtin:') ? String(value).slice(8) : '');

    // Plays one alert inside `node`. Returns { stop } so a skip/clear can end it early.
    function playAlert(node, element, payload, { sound = true, onEnd } = {}) {
        const cfg = element.alert || {};
        const style = element.style || {};
        const layout = payload.image || payload.video || payload.emoji ? (cfg.layout || 'stack') : 'text';
        const card = document.createElement('div');
        card.className = `alert-card layout-${layout}`;
        Object.assign(card.style, node._alertDeco || {});
        card.style.gap = `${cfg.gap ?? 12}px`;
        card.style.padding = '8px';
        const hasMedia = layout !== 'text' && (payload.video || payload.image || payload.emoji);
        if (hasMedia) {
            const isEmoji = !payload.video && !payload.image;
            const media = document.createElement(isEmoji ? 'div' : payload.video ? 'video' : 'img');
            const scale = Math.max(10, Math.min(100, Number(cfg.mediaScale) || 60));
            if (isEmoji) {
                media.textContent = payload.emoji;
                const count = Array.from(payload.emoji).length || 1;
                const boxH = node.clientHeight * (layout === 'media' ? 0.7 : scale / 100);
                const boxW = node.clientWidth * (layout === 'side' ? 0.5 : 1) * 0.9;
                media.style.fontSize = `${Math.max(12, Math.min(boxH * 0.8, boxW / (count * 1.15)))}px`;
                media.style.lineHeight = '1.1';
                media.style.whiteSpace = 'nowrap';
            } else {
                media.src = payload.video || payload.image;
                if (payload.video) { media.autoplay = true; media.loop = true; media.muted = true; media.playsInline = true; }
                media.draggable = false;
                media.style.objectFit = cfg.mediaFit || 'contain';
            }
            media.className = 'alert-media';
            if (!isEmoji) {
                if (layout === 'side') { media.style.width = `${scale}%`; media.style.maxWidth = '50%'; media.style.height = '100%'; }
                else if (layout === 'media') { media.style.width = '100%'; media.style.height = '100%'; }
                else { media.style.height = `${scale}%`; media.style.maxWidth = '100%'; }
            } else if (layout === 'media') {
                media.style.position = 'absolute'; media.style.inset = '0'; media.style.display = 'flex'; media.style.alignItems = 'center'; media.style.justifyContent = 'center';
            }
            card.appendChild(media);
        }
        if (layout !== 'media' || payload.title || payload.message) {
            const text = document.createElement('div');
            text.className = 'alert-text';
            text.style.color = style.color || '#fff';
            text.style.fontFamily = style.fontFamily || 'sans-serif';
            if (payload.title) {
                const title = document.createElement('div');
                title.className = 'alert-title';
                title.textContent = payload.title;
                title.style.fontSize = `${cfg.titleSize || 44}px`;
                title.style.color = cfg.titleColor || '#ffd166';
                text.appendChild(title);
            }
            if (payload.message) {
                const message = document.createElement('div');
                message.className = 'alert-message';
                message.textContent = payload.message;
                message.style.fontSize = `${cfg.messageSize || 28}px`;
                message.style.fontWeight = style.fontWeight || '400';
                text.appendChild(message);
            }
            card.appendChild(text);
        }
        node.replaceChildren(card);
        card.classList.add(`alert-in-${payload.animIn || 'pop'}`);

        let audio = null;
        if (sound && cfg.sound !== false && payload.sound) {
            const volume = Math.max(0, Math.min(1, (Number(payload.volume) || 70) / 100));
            if (alertSoundName(payload.sound)) audio = playBuiltinSound(alertSoundName(payload.sound), volume);
            else {
                audio = new Audio(payload.sound);
                audio.volume = volume;
                audio.play().catch(() => {});
            }
        }
        const fadeMs = 500;
        let finished = false;
        const finish = () => {
            if (finished) return;
            finished = true;
            clearTimeout(outTimer); clearTimeout(endTimer);
            if (audio) audio.pause();
            if (card.parentNode === node) node.replaceChildren();
            if (onEnd) onEnd();
        };
        const outTimer = setTimeout(() => {
            const out = payload.animOut || 'fade';
            card.className = `alert-card layout-${layout}${out === 'none' ? '' : ` alert-out-${out}`}`;
        }, Math.max(0, (payload.durationMs || 6000) - fadeMs));
        const endTimer = setTimeout(finish, payload.durationMs || 6000);
        return { stop: finish };
    }


    // ---- text sources: text / markdown / random-text elements can read a library or on-disk file ----
    const textSources = new Map();
    const textSourceKey = el => (el?.source && el.source.mode !== 'inline' && el.source.path ? `${el.source.mode}|${el.source.path}` : '');
    async function loadTextSource(key) {
        const [mode, ...rest] = key.split('|');
        try {
            const response = await fetch(`/api/custom-overlays/text-source?mode=${mode}&path=${encodeURIComponent(rest.join('|'))}`, { cache: 'no-store' });
            const data = await response.json().catch(() => ({}));
            return response.ok ? { text: data.text, mtimeMs: data.mtimeMs, name: data.name } : { error: data.error || 'Could not read file' };
        } catch { return { error: 'Could not reach StreamPulse' }; }
    }
    // Returns true when any source changed (text, modification time or error).
    async function refreshTextSources(elements) {
        const keys = [...new Set((elements || []).map(textSourceKey).filter(Boolean))];
        let changed = false;
        await Promise.all(keys.map(async key => {
            const next = await loadTextSource(key);
            const prev = textSources.get(key);
            if (!prev || prev.text !== next.text || prev.error !== next.error) changed = true;
            textSources.set(key, next);
        }));
        return changed;
    }
    const textSourceState = el => textSources.get(textSourceKey(el)) || null;
    const sourceText = el => { const state = textSourceState(el); return state && typeof state.text === 'string' ? state.text : null; };
    // Scrolls the node's current contents across it. The track animates text-indent (layout, not a transform) so a clipped text gradient still follows the letters.
    function wrapMarquee(node) {
        const track = document.createElement('span');
        track.className = 'overlay-marquee-track';
        track.append(...node.childNodes);
        node.appendChild(track);
        const measure = () => track.style.setProperty('--mq-end', `-${Math.ceil(track.scrollWidth) + 8}px`);
        requestAnimationFrame(measure);
        if (document.fonts?.ready) document.fonts.ready.then(measure);
    }
    const elementContent = el => { const text = sourceText(el); return text !== null && el.type !== 'random-text' ? text : el.content; };
    function elementItems(el) {
        const text = sourceText(el);
        if (text === null) return el.items || [];
        const parts = el.source.split === 'blocks' ? text.split(/\r?\n\s*\r?\n/) : text.split(/\r?\n/);
        const items = parts.map(part => part.trim()).filter(Boolean);
        return items.length ? items : el.items || [];
    }

    // Auto-fit: 'shrink' only reduces the font size, 'fit' may also enlarge it, until the text fits the element box.
    function fitText(node, el, probeText) {
        const mode = el.textFit;
        if ((mode !== 'shrink' && mode !== 'fit') || !node.isConnected || el.random?.marquee) return;
        const base = Number(el.style?.fontSize) || 32;
        const saved = { display: node.style.display, children: probeText != null ? [...node.childNodes] : null };
        // Centered flex boxes hide overflow at the top, so measure as a normal block.
        node.style.display = 'block';
        if (probeText != null) node.replaceChildren(document.createTextNode(probeText));
        // Some browsers don't count overflowed columns in scrollWidth, so multi-column text is also checked against its actual content bounds.
        const columnar = el.type === 'markdown' && el.columns > 1;
        const inside = () => {
            const box = node.getBoundingClientRect(), range = document.createRange();
            range.selectNodeContents(node);
            const used = range.getBoundingClientRect();
            const tol = 2 * (box.width / (node.offsetWidth || box.width) || 1);
            return used.right <= box.right + tol && used.bottom <= box.bottom + tol && used.left >= box.left - tol && used.top >= box.top - tol;
        };
        const fits = size => { node.style.fontSize = `${size}px`; return node.scrollHeight <= node.clientHeight + 1 && node.scrollWidth <= node.clientWidth + 1 && (!columnar || inside()); };
        let lo = 8, hi = mode === 'fit' ? 400 : base;
        if (!fits(hi)) {
            while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (fits(mid)) lo = mid; else hi = mid; }
            node.style.fontSize = `${lo}px`;
        }
        node.style.display = saved.display;
        if (saved.children) node.replaceChildren(...saved.children);
    }

    // ---- slideshow ----------------------------------------------------------------------------
    const slideshowCache = new Map();
    const mediaKind = name => (/\.(mp4|webm|ogg)$/i.test(name) ? 'video' : /\.(png|jpe?g|gif|webp|svg)$/i.test(name) ? 'image' : 'other');
    async function slideshowItems(config) {
        if (config.source === 'manual') {
            if (!(config.files || []).length) return [];
            const url = `/api/asset-library?kinds=${config.kinds || 'image'}&names=${encodeURIComponent((config.files || []).join('\n'))}`;
            const cached = slideshowCache.get(url);
            if (cached && Date.now() - cached.at < 8000) return cached.items;
            try {
                const response = await fetch(url, { cache: 'no-store' });
                const items = response.ok ? await response.json() : [];
                slideshowCache.set(url, { at: Date.now(), items });
                return items;
            } catch { return cached?.items || []; }
        }
        if (!(config.tags || []).length) return [];
        const url = `/api/asset-library?tags=${encodeURIComponent(config.tags.join(','))}&mode=${config.tagMode || 'any'}&kinds=${config.kinds || 'image'}`;
        const cached = slideshowCache.get(url);
        if (cached && Date.now() - cached.at < 8000) return cached.items;
        try {
            const response = await fetch(url, { cache: 'no-store' });
            const items = response.ok ? await response.json() : [];
            slideshowCache.set(url, { at: Date.now(), items });
            return items;
        } catch { return cached?.items || []; }
    }

    // Plays a slideshow inside `node`. With { preview: true } it only shows the first slide. Returns { stop() }.
    function mountSlideshow(node, element, options = {}) {
        const config = element.slideshow || {};
        const frozen = options.preview && !options.animate;
        let paused = config.advance === 'manual';
        let items = [], order = [], position = -1, timer = null, refreshTimer = null, stopped = false, current = null, token = 0;
        node.replaceChildren();
        node.style.position = node.style.position || 'absolute';
        node.style.overflow = 'hidden';
        const stage = document.createElement('div');
        stage.style.cssText = 'position:absolute;inset:0;overflow:hidden;';
        node.appendChild(stage);
        const note = document.createElement('div');
        note.style.cssText = 'position:absolute;inset:0;display:grid;place-items:center;text-align:center;padding:1rem;color:#8b949e;font:14px sans-serif;pointer-events:none;';
        node.appendChild(note);

        const signature = list => list.map(item => item.name).join('|');
        const buildOrder = () => {
            order = items.map((_, index) => index);
            if (config.order === 'shuffle') for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
        };
        const nextIndex = () => {
            if (config.order === 'random' && items.length > 1) { let pick; do { pick = Math.floor(Math.random() * items.length); } while (pick === order[position]); order[position + 1] = pick; position++; return pick; }
            position++;
            if (position >= order.length) { buildOrder(); position = 0; }
            return order[position];
        };

        function makeSlide(item) {
            const layer = document.createElement('div');
            layer.style.cssText = 'position:absolute;inset:0;overflow:hidden;will-change:transform,opacity;';
            const media = document.createElement(item.kind === 'video' ? 'video' : 'img');
            media.style.cssText = `position:absolute;inset:0;width:100%;height:100%;object-fit:${config.fit === 'contain' ? 'contain' : 'cover'};`;
            if (item.kind === 'video') { media.muted = true; media.playsInline = true; media.autoplay = true; }
            media.src = item.url;
            media.alt = '';
            layer.appendChild(media);
            const captionText = config.caption === 'caption' ? item.caption : config.caption === 'name' || config.caption === true ? item.label : '';
            if (captionText) {
                const bar = document.createElement('div');
                bar.textContent = captionText;
                bar.style.cssText = `position:absolute;left:0;right:0;bottom:0;padding:${Math.max(8, node.clientHeight * 0.03)}px ${Math.max(12, node.clientWidth * 0.02)}px;font:600 ${Math.max(14, node.clientHeight * 0.045)}px sans-serif;color:#fff;background:linear-gradient(transparent,rgba(0,0,0,0.7));text-shadow:0 1px 3px rgba(0,0,0,0.8);`;
                layer.appendChild(bar);
            }
            return { layer, media };
        }

        function ready(media) {
            return new Promise(resolve => {
                if (media.tagName === 'VIDEO') { media.addEventListener('loadeddata', () => resolve(true), { once: true }); media.addEventListener('error', () => resolve(false), { once: true }); return; }
                if (media.complete && media.naturalWidth) return resolve(true);
                media.addEventListener('load', () => resolve(true), { once: true });
                media.addEventListener('error', () => resolve(false), { once: true });
            });
        }

        function transitionVectors() {
            const w = node.clientWidth || 1, h = node.clientHeight || 1;
            return { left: [w, 0], right: [-w, 0], up: [0, h], down: [0, -h] }[config.direction] || [w, 0];
        }

        async function show(dir = 1) {
            timer = null;
            if (stopped || !items.length) return;
            if (dir < 0) { position -= 2; if (position < -1) position += order.length; }
            const mine = ++token;
            let attempts = 0, slide = null, item = null;
            // Skip files that fail to load (deleted or corrupt) rather than getting stuck on them.
            while (attempts++ < Math.min(items.length, 8)) {
                item = items[nextIndex()];
                const candidate = makeSlide(item);
                if (await ready(candidate.media)) { slide = candidate; break; }
            }
            if (!slide || stopped || mine !== token) return schedule(config.seconds * 1000);
            const old = current;
            current = slide;
            emitState();
            stage.appendChild(slide.layer);
            const ms = frozen || !old ? 0 : config.transitionMs;
            if (ms && config.transition === 'fade') {
                slide.layer.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ms, easing: 'ease', fill: 'both' });
                old.layer.animate([{ opacity: 1 }, { opacity: 0 }], { duration: ms, easing: 'ease', fill: 'both' });
            } else if (ms && config.transition === 'slide') {
                const [x, y] = transitionVectors();
                slide.layer.animate([{ transform: `translate(${x}px,${y}px)` }, { transform: 'translate(0,0)' }], { duration: ms, easing: 'ease', fill: 'both' });
                old.layer.animate([{ transform: 'translate(0,0)' }, { transform: `translate(${-x}px,${-y}px)` }], { duration: ms, easing: 'ease', fill: 'both' });
            }
            if (config.kenBurns && item.kind === 'image' && !frozen) {
                const grow = Math.random() < 0.5;
                slide.media.animate([{ transform: `scale(${grow ? 1 : 1.08})` }, { transform: `scale(${grow ? 1.08 : 1})` }], { duration: config.seconds * 1000 + ms, easing: 'linear', fill: 'both' });
            }
            if (old) setTimeout(() => old.layer.remove(), ms + 60);
            note.textContent = '';
            if (frozen) return;
            if (item.kind === 'video' && items.length < 2) slide.media.loop = true;
            else if (item.kind === 'video') {
                slide.media.addEventListener('ended', () => schedule(0), { once: true });
                schedule(Math.max(config.seconds, 600) * 1000);
            } else schedule(config.seconds * 1000);
        }

        // Lets StreamPulse report slideshow state (for Companion and other controllers)
        function emitState() {
            if (options.onState) options.onState({ paused, position: Math.max(0, position) + 1, count: items.length });
        }

        function schedule(ms) {
            clearTimeout(timer);
            if (stopped || frozen || paused || items.length < 2) return;
            timer = setTimeout(show, ms);
        }

        async function refresh(first) {
            const next = await slideshowItems(config);
            if (stopped) return;
            if (!first && signature(next) === signature(items)) return;
            const hadItems = items.length > 0;
            items = next;
            buildOrder();
            position = -1;
            if (!items.length) {
                clearTimeout(timer);
                stage.replaceChildren(); current = null;
                note.textContent = options.preview ? (config.source === 'manual' ? 'Slideshow: choose images in the properties panel' : (config.tags || []).length ? `Slideshow: no images tagged ${config.tags.join(', ')}` : 'Slideshow: choose tags or pick images') : '';
                return;
            }
            if (options.preview) note.textContent = '';
            if (first || !hadItems || !current) show();
            else if (!timer) schedule(config.seconds * 1000);
        }

        refresh(true);
        if (!frozen && config.source !== 'manual') refreshTimer = setInterval(() => refresh(false), 20000);
        const control = action => {
            if (stopped || !items.length) return;
            if (action === 'toggle') action = paused ? 'play' : 'pause';
            if (action === 'next' || action === 'prev') { clearTimeout(timer); show(action === 'prev' ? -1 : 1); }
            else if (action === 'pause') { paused = true; clearTimeout(timer); timer = null; emitState(); }
            else if (action === 'play') { paused = false; if (!timer) schedule(config.seconds * 1000); emitState(); }
        };
        return { stop() { stopped = true; clearTimeout(timer); clearInterval(refreshTimer); }, count: () => items.length, control };
    }

    root.OverlayShared = { applyBorderGradient, hasBoxFill, textEffectStyle, wrapMarquee, fitText, refreshTextSources, textSourceState, textSourceKey, elementContent, elementItems, qrUrl, renderIcon, prepareAlertNode, playAlert, playBuiltinSound, BUILTIN_SOUNDS, renderGameList, mountSlideshow, slideshowItems, decorationStyle, renderProgress, GOOGLE_FONTS, VARIABLE_GROUPS, variableGroups, variableTable, formatDuration, formatDate, applyFormat, isDateKey, FORMAT_PRESETS, hasTicking, loadLiveExtras, assetFonts, loadAssetFonts, expandVariables, variableSnapshot, renderMarkdown, loadGoogleFont };
})(window);

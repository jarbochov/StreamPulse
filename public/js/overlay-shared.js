(function(root) {
    const GOOGLE_FONTS = ['Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Oswald', 'Poppins', 'Raleway', 'Merriweather', 'Playfair Display', 'Bebas Neue', 'Fira Code', 'Silkscreen'];
    const googleFontSet = new Set(GOOGLE_FONTS);

    const VARIABLE_GROUPS = [
        { label: 'Viewers', items: [['viewers.current', 'Current viewers'], ['viewers.peak', 'Peak viewers'], ['viewers.average', 'Average viewers']] },
        { label: 'Chat', items: [['chatters', 'Chatters'], ['messages', 'Messages'], ['followers', 'Followers (current total)'], ['followers.session', 'New followers this session'], ['subscribers', 'Subscribers (current total)'], ['subscribers.session', 'Subscribers seen this session'], ['emotes', 'Different emotes used this session'], ['raids', 'Raids this session'], ['highlights', 'Saved highlights'], ['clips.pending', 'Clip candidates waiting']] },
        { label: 'Engagement', items: [['gift_subs', 'Gift subs this session'], ['gift_subs.total', 'Gift subs (lifetime)'], ['bits', 'Bits this session'], ['bits.total', 'Bits (lifetime)'], ['donations', 'Donations this session'], ['donations.total', 'Donations (lifetime)']] },
        { label: 'Hashtags', items: [['hashtags.top', 'Most popular hashtag overall'], ['hashtags.session_top', 'Most popular hashtag this session'], ['hashtags.top.count', 'Mentions of the most popular hashtag'], ['hashtags.top.2', 'Second most popular hashtag'], ['hashtags.top.3', 'Third most popular hashtag'], ['hashtags.total', 'Total hashtag mentions']] },
        { label: 'Twitch Poll', items: [['poll.title', 'Poll question / title'], ['poll.winner', 'Winning choice title'], ['poll.winner_votes', 'Winning choice vote count'], ['poll.winner_percent', 'Winning choice percentage (e.g. 64%)'], ['poll.total_votes', 'Total votes across all choices'], ['poll.status', 'Status (ACTIVE, COMPLETED, etc.)'], ['poll.duration', 'Total poll duration (seconds)'], ['poll.remaining', 'Remaining countdown timer (e.g. 1:45)'], ['poll.choice.1.title', 'Choice 1 title'], ['poll.choice.1.votes', 'Choice 1 votes'], ['poll.choice.1.percent', 'Choice 1 percent'], ['poll.choice.2.title', 'Choice 2 title'], ['poll.choice.2.votes', 'Choice 2 votes'], ['poll.choice.2.percent', 'Choice 2 percent'], ['poll.choice.3.title', 'Choice 3 title'], ['poll.choice.3.votes', 'Choice 3 votes'], ['poll.choice.3.percent', 'Choice 3 percent'], ['poll.choice.4.title', 'Choice 4 title'], ['poll.choice.4.votes', 'Choice 4 votes'], ['poll.choice.4.percent', 'Choice 4 percent'], ['poll.choice.5.title', 'Choice 5 title'], ['poll.choice.5.votes', 'Choice 5 votes'], ['poll.choice.5.percent', 'Choice 5 percent']] },
        { label: 'Stream', items: [['music.title', 'Music title'], ['music.artist', 'Music artist'], ['music.album', 'Music album'], ['music.cover', 'Album art URL (use as an image source)'], ['music.position', 'Track position (m:ss)'], ['music.duration', 'Track length (m:ss)'], ['music.remaining', 'Track time remaining (m:ss)'], ['music.percent', 'Track progress % (for a progress element)'], ['music.state', 'Music state (playing / paused / stopped)'], ['stream.title', 'Stream title'], ['stream.category', 'Stream category (from Twitch)'], ['stream.live', 'Live on Twitch (yes / no)'], ['session.started', 'Session start time (formattable)'], ['session.duration', 'Time since the session started'], ['category.session_time', 'Time in this category, this session'], ['category.total_time', 'Time in this category, all sessions'], ['category.total_hours', 'Hours in this category, all sessions'], ['overlay.name', 'Overlay name']] }
    ];

    const CLOCK_ITEMS = [['now', 'Current date & time (format it with {{now|MMMM D, h:mm A}})'], ['time', 'Time (e.g. 3:07 PM)'], ['time.24', 'Time, 24-hour'], ['time.seconds', 'Time with seconds'], ['date', 'Date (short)'], ['date.long', 'Date (long)'], ['weekday', 'Weekday'], ['month', 'Month'], ['year', 'Year'], ['uptime', 'Stream uptime (H:MM:SS)']];
    const GAME_ITEMS = [['game.name', 'Game name'], ['game.url', 'IGDB page link'], ['game.cover', 'Cover art URL (use as an image source)'], ['game.release_date', 'Release date'], ['game.release_year', 'Release year'], ['game.genres', 'Genres'], ['game.developer', 'Developer'], ['game.platforms', 'Platforms'], ['game.rating', 'IGDB rating (0–100)'], ['game.summary', 'Summary']];
    const WEATHER_ITEMS = [['weather.temp', 'Temperature (number)'], ['weather.temp_full', 'Temperature with unit (72°F)'], ['weather.unit', 'Temperature unit (°F / °C)'], ['weather.feels_like', 'Feels like (number)'], ['weather.condition', 'Conditions (Partly cloudy)'], ['weather.icon', 'Weather icon (emoji)'], ['weather.icon.url', 'Weather icon image URL (use as an image source)'], ['weather.humidity', 'Humidity %'], ['weather.wind', 'Wind with unit (8 mph NW)'], ['weather.wind.speed', 'Wind speed (number)'], ['weather.wind.dir', 'Wind direction (NW)'], ['weather.high', 'Today\'s high'], ['weather.low', 'Today\'s low'], ['weather.precip_chance', 'Chance of precipitation %'], ['weather.city', 'City'], ['weather.location', 'City, region'], ['weather.gusts', 'Wind gusts (number)'], ['weather.cloud_cover', 'Cloud cover %'], ['weather.pressure', 'Pressure (29.92 inHg / 1013 hPa)'], ['weather.pressure.unit', 'Pressure unit'], ['weather.uv', 'UV index (today\'s max)'], ['weather.sunrise', 'Sunrise (6:52 AM)'], ['weather.sunset', 'Sunset (7:14 PM)'],
        ['weather.h1.time', 'Next hours: h1–h6 time (3 PM)'], ['weather.h1.temp', 'Next hours: h1–h6 temperature'], ['weather.h1.icon', 'Next hours: h1–h6 icon (emoji)'], ['weather.h1.icon.url', 'Next hours: h1–h6 icon image URL'], ['weather.h1.condition', 'Next hours: h1–h6 conditions'], ['weather.h1.precip', 'Next hours: h1–h6 chance of precipitation %'],
        ['weather.d1.day', 'Next days: d1–d5 weekday (d1 = tomorrow)'], ['weather.d1.high', 'Next days: d1–d5 high'], ['weather.d1.low', 'Next days: d1–d5 low'], ['weather.d1.icon', 'Next days: d1–d5 icon (emoji)'], ['weather.d1.icon.url', 'Next days: d1–d5 icon image URL'], ['weather.d1.condition', 'Next days: d1–d5 conditions'], ['weather.d1.precip', 'Next days: d1–d5 chance of precipitation %']];
    const PLAN_ITEMS = [['plan.now', 'Game from your plan you are playing now'], ['plan.scheduled', 'Scheduled games (comma list)'], ['plan.backlog', 'Backlog games (comma list)'], ['plan.next', 'Next scheduled game'], ['plan.scheduled.count', 'Number of scheduled games'], ['plan.backlog.count', 'Number of backlog games']];
    const EVENT_ITEMS = [['latest.follower', 'Latest follower'], ['latest.subscriber', 'Latest subscriber'], ['latest.gifter', 'Latest gift sub gifter'], ['latest.gifter.recipient', 'Latest gift sub recipient'], ['latest.subscriber.tier', 'Latest subscriber tier or type'], ['latest.cheer', 'Latest cheerer'], ['latest.cheer.amount', 'Latest cheer amount'], ['latest.donation', 'Latest donor'], ['latest.donation.amount', 'Latest donation amount'], ['latest.raider', 'Latest raider'], ['latest.raider.viewers', 'Latest raid size'], ['chatter.top', 'Top chatter this session'], ['chatter.top.count', 'Top chatter message count'], ['chatter.last', 'Most recent chatter'], ['chatter.random', 'Random chatter seen this session'], ['chatter.list', 'Chatters seen this session (first 20)'], ['chatter.top.5m', 'Top chatter, last 5 minutes (also 10m, 15m, 30m, 60m)'], ['chatter.top.10m', 'Top chatter, last 10 minutes'], ['chatter.top.15m', 'Top chatter, last 15 minutes'], ['chatter.top.30m', 'Top chatter, last 30 minutes'], ['chatter.top.60m', 'Top chatter, last hour'], ['chatter.top.5m.count', 'Messages from the last-5-minutes top chatter (also 10m…60m)']];
    const MILESTONE_ITEMS = [
        ['milestone.stream_number', 'Current stream broadcast number (e.g. 46)'],
        ['milestone.total_hours', 'Total lifetime streamed hours (e.g. 466)'],
        ['milestone.total_time', 'Total lifetime streamed time (e.g. 466h 18m)'],
        ['milestone.streak_days', 'Consecutive stream days streak (e.g. 3)'],
        ['milestone.streak_weeks', 'Consecutive stream weeks streak (e.g. 12)'],
        ['milestone.lifetime_chatters', 'Total unique chatters all-time (e.g. 158)'],
        ['milestone.lifetime_messages', 'Total chat messages all-time (e.g. 14,230)'],
        ['milestone.next_stream_goal', 'Next stream count milestone (e.g. 50)'],
        ['milestone.streams_remaining', 'Streams remaining until next stream goal (e.g. 4)'],
        ['milestone.stream_goal_percent', 'Percent progress to next stream goal (e.g. 92)'],
        ['milestone.next_hours_goal', 'Next broadcast hours milestone (e.g. 500)'],
        ['milestone.hours_remaining', 'Broadcast hours remaining until goal (e.g. 34)'],
        ['milestone.hours_goal_percent', 'Percent progress to next hours goal (e.g. 93)']
    ];
    // Values that change every second are refreshed in place instead of re-rendering the overlay.
    // Live counters change constantly, so they refresh their text in place instead of re-rendering (and flashing) the whole overlay.
    const TICKING = /^(now$|time|date|weekday|month|year|uptime|session\.duration|timer\.|music\.(position|remaining|percent)$|category\.|viewers?\.|chatters$|messages$|poll\.)/;
    const isTicking = name => TICKING.test(name);
    const hasTicking = value => /\{\{\s*(now|time|date|weekday|month|year|uptime|session\.duration|timer\.|music\.(position|remaining|percent)|category\.|viewers?\.|chatters|messages|poll\.)/.test(String(value ?? ''));

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

    // External host data (NodeCG replicants): {{rep.<bundle>.<name>.<path>}}, arrays by index.
    function flattenExternal(value, prefix, out, depth = 0) {
        if (value === null || value === undefined) { out[prefix] = ''; return out; }
        if (typeof value !== 'object') { out[prefix] = value; return out; }
        if (depth >= 6) return out;
        if (Array.isArray(value)) {
            out[`${prefix}.length`] = value.length;
            value.slice(0, 50).forEach((item, i) => flattenExternal(item, `${prefix}.${i}`, out, depth + 1));
            return out;
        }
        for (const [key, item] of Object.entries(value)) flattenExternal(item, `${prefix}.${key}`, out, depth + 1);
        return out;
    }
    function externalValues(status) {
        const out = {};
        for (const [key, value] of Object.entries(status.external || {})) flattenExternal(value, `rep.${key}`, out);
        return out;
    }

    const inPlanList = (item, id) => item.status === id || (item.extraLists || []).includes(id);
    function planListValues(status) {
        const out = {};
        for (const list of status.gamePlan?.lists || []) out[`plan.list.${list.id}`] = (status.gamePlan.items || []).filter(item => inPlanList(item, list.id)).map(item => item.name).join(', ');
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
        pick('latest.subscriber.tier', 'sub', 'detail');
        const gift = first('gift');
        if (gift?.detail) out['latest.gifter.recipient'] = gift.detail.replace(/^\u2192\s*/, '');
        const raid = first('raid');
        if (raid) out['latest.raider.viewers'] = parseInt(raid.detail, 10) || raid.detail;
        const top = status.topChatters?.[0];
        if (top) { out['chatter.top'] = top.chatname; out['chatter.top.count'] = top.messageCount; }
        out['chatter.last'] = status.recentChat?.last;
        const seen = (status.topChatters || []).map(c => c.chatname).filter(Boolean);
        if (seen.length) { out['chatter.random'] = seen[Math.floor(Math.random() * seen.length)]; out['chatter.list'] = seen.slice(0, 20).join(', '); }
        for (const minutes of [5, 10, 15, 30, 60]) {
            const w = status.recentChat?.windows?.[minutes];
            out[`chatter.top.${minutes}m`] = w?.name;
            out[`chatter.top.${minutes}m.count`] = w?.count;
        }
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
            'uptime': started ? clock(now - started) : '',
            'session.duration': Date.parse(status.startedAt || '') ? clock(now - Date.parse(status.startedAt)) : ''
        };
    }

    // Static groups plus the timers and goals that currently exist.
    function variableGroups(status = {}) {
        const groups = VARIABLE_GROUPS.map(g => ({ label: g.label, items: g.items.slice() }));
        groups.push({ label: 'Clock', items: CLOCK_ITEMS });
        if (status.customVars?.length) groups.push({ label: 'Variables and counters', items: status.customVars.flatMap(v => [[`var.${v.name}`, `${v.name} (${v.type})`], ...(v.type === 'list' ? [[`var.${v.name}.random`, `${v.name}, random item each time`]] : [])]) });
        if (status.weather?.enabled) {
            groups.push({ label: 'Weather', items: WEATHER_ITEMS });
            for (const [slug, extra] of Object.entries(status.weather.extras || {})) {
                if (extra.ok) groups.push({ label: `Weather: ${extra.city}`, items: WEATHER_ITEMS.map(([name, label]) => [name.replace('weather.', `weather.${slug}.`), label]) });
            }
        }
        for (const [key, value] of Object.entries(status.external || {})) {
            const items = Object.keys(flattenExternal(value, `rep.${key}`, {})).slice(0, 200).map(name => [name, name.slice(`rep.${key}.`.length) || key]);
            if (items.length) groups.push({ label: `NodeCG: ${key}`, items });
        }
        groups.push({ label: 'Game (IGDB)', items: GAME_ITEMS });
        groups.push({ label: 'Game plan', items: [...PLAN_ITEMS, ...(status.gamePlan?.lists || []).map(list => [`plan.list.${list.id}`, `${list.name} list (comma list)`])] });
        groups.push({ label: 'Latest events', items: EVENT_ITEMS });
        groups.push({ label: 'Milestones & Streaks', items: MILESTONE_ITEMS });
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

    function milestoneValues(status) {
        const m = status.milestones || {};
        const streamNum = Number(m.stream_number) || 0;
        const nextStreamGoal = Number(m.next_stream_goal) || 0;
        const streamsRemaining = Math.max(0, nextStreamGoal - streamNum);
        const streamGoalPercent = nextStreamGoal > 0 ? Math.min(100, Math.round((streamNum / nextStreamGoal) * 100)) : 0;

        const totalHours = Number(m.total_hours) || 0;
        const nextHoursGoal = Number(m.next_hours_goal) || 0;
        const hoursRemaining = Math.max(0, nextHoursGoal - totalHours);
        const hoursGoalPercent = nextHoursGoal > 0 ? Math.min(100, Math.round((totalHours / nextHoursGoal) * 100)) : 0;

        return {
            'milestone.stream_number': m.stream_number ?? '',
            'milestone.total_hours': m.total_hours ?? '',
            'milestone.total_time': m.total_time ?? '',
            'milestone.streak_days': m.streak_days ?? 0,
            'milestone.streak_weeks': m.streak_weeks ?? 0,
            'milestone.lifetime_chatters': m.lifetime_chatters !== undefined ? Number(m.lifetime_chatters).toLocaleString() : '',
            'milestone.lifetime_messages': m.lifetime_messages !== undefined ? Number(m.lifetime_messages).toLocaleString() : '',
            'milestone.next_stream_goal': m.next_stream_goal ?? '',
            'milestone.streams_remaining': streamsRemaining,
            'milestone.stream_goal_percent': streamGoalPercent,
            'milestone.next_hours_goal': m.next_hours_goal ?? '',
            'milestone.hours_remaining': hoursRemaining,
            'milestone.hours_goal_percent': hoursGoalPercent
        };
    }

    function pollValues(status, now = Date.now()) {
        const poll = status.poll;
        if (!poll) return {};
        const p = {
            'poll.title': poll.title || '',
            'poll.status': poll.status || '',
            'poll.winner': poll.winner || '',
            'poll.winner_votes': poll.winningVotes !== undefined ? poll.winningVotes : '',
            'poll.winner_percent': poll.winningPercent !== undefined ? `${poll.winningPercent}%` : '',
            'poll.total_votes': poll.totalVotes !== undefined ? poll.totalVotes : '',
            'poll.duration': poll.duration ? String(poll.duration) : ''
        };
        if (poll.status === 'ACTIVE' && poll.duration && poll.startedAt) {
            const startedMs = Date.parse(poll.startedAt);
            const elapsed = !isNaN(startedMs) ? Math.floor((now - startedMs) / 1000) : 0;
            const remaining = Math.max(0, Number(poll.duration) - elapsed);
            const m = Math.floor(remaining / 60);
            const s = remaining % 60;
            p['poll.remaining'] = m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`;
            p['poll.remaining_seconds'] = remaining;
        } else {
            p['poll.remaining'] = '0s';
            p['poll.remaining_seconds'] = 0;
        }
        (poll.choices || []).forEach((c, i) => {
            const idx = i + 1;
            p[`poll.choice.${idx}.title`] = c.title || '';
            p[`poll.choice.${idx}.votes`] = c.votes !== undefined ? c.votes : '';
            p[`poll.choice.${idx}.percent`] = c.percent !== undefined ? `${c.percent}%` : '';
        });
        return p;
    }

    function variableTable(status = {}, context = {}, now = Date.now()) {
        const table = {
            ...clockValues(status, now),
            ...eventValues(status),
            ...goalValues(status),
            ...timerValues(status, now),
            ...musicValues(status, now),
            ...planListValues(status),
            ...weatherValues(status),
            ...externalValues(status),
            ...pollValues(status, now),
            ...milestoneValues(status),
            ...Object.fromEntries((status.customVars || []).map(v => [`var.${v.name}`, v.value])),
            ...Object.fromEntries((status.customVars || []).filter(v => v.type === 'list' && v.items?.length).map(v => [`var.${v.name}.random`, v.items[Math.floor(Math.random() * v.items.length)]])),
            'stream.category': status.stream?.category?.name,
            'stream.live': status.viewers?.live ? 'yes' : 'no',
            'session.started': status.startedAt,
            'music.state': status.music?.state,
            'emotes': status.ssn?.emotes,
            'raids': status.ssn?.raids,
            'highlights': status.library?.highlights,
            'clips.pending': status.library?.clipCandidates,
            'hashtags.top.count': status.popularHashtags?.overall?.[0]?.count,
            'hashtags.top.2': status.popularHashtags?.overall?.[1]?.tag,
            'hashtags.top.3': status.popularHashtags?.overall?.[2]?.tag,
            'game.name': status.stream?.game?.igdbName || status.stream?.game?.name,
            'game.url': status.stream?.game?.igdbUrl,
            'plan.next': (status.gamePlan?.items || []).find(item => item.status === 'scheduled' && !item.playingNow)?.name,
            'plan.scheduled.count': (status.gamePlan?.items || []).filter(item => item.status === 'scheduled').length,
            'plan.backlog.count': (status.gamePlan?.items || []).filter(item => item.status === 'backlog').length,
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
        // Real arrays for list tokens, so items containing commas survive formatting.
        const planItems = status.gamePlan?.items || [];
        const lists = {
            'plan.scheduled': planItems.filter(item => item.status === 'scheduled').map(item => item.name),
            'plan.backlog': planItems.filter(item => item.status === 'backlog').map(item => item.name),
            'game.genres': status.stream?.game?.genres || [],
            'game.platforms': status.stream?.game?.platforms || []
        };
        for (const list of status.gamePlan?.lists || []) lists[`plan.list.${list.id}`] = planItems.filter(item => inPlanList(item, list.id)).map(item => item.name);
        Object.defineProperty(table, '__lists', { value: lists, enumerable: false });
        return table;
    }


    // Date/time formatting for {{token|format}}. Tokens follow the familiar Moment/Day.js style; wrap literal text in [brackets].
    const LIST_FORMAT_PRESETS = [['lines', 'One per line'], ['bullets', '• One per line'], ['numbered', '1. One per line'], ['3', 'First 3 only'], ['sep:\\s/\\s', 'Separated by /'], ['sep:\\s•\\s', 'Separated by •']];
    const FORMAT_PRESETS = [['short', '4d 3h 22m 2s (timers)'], ['long', '4 days, 3 hours… (timers)'], ['clock', '4d 3:22:02 (timers)'], ['d[d] h[h] m[m]', '4d 3h 22m (timers)'], ['MMMM D, YYYY', 'October 2, 2026'], ['MMM D', 'Oct 2'], ['ddd, MMM D', 'Fri, Oct 2'], ['dddd, MMMM Do', 'Friday, October 2nd'], ['YYYY-MM-DD', '2026-10-02'], ['MM/DD/YYYY', '10/02/2026'], ['h:mm A', '1:34 PM'], ['HH:mm', '13:34'], ['MMM D, h:mm A', 'Oct 2, 1:34 PM'], ['dddd [at] h A', 'Friday at 1 PM']];
    const isDateKey = name => /^timer\.[a-zA-Z0-9_-]+$/.test(name) || /^(now|time|time\.24|time\.seconds|date|date\.long|game\.release_date|session\.started|timer\.[a-zA-Z0-9_-]+\.target)$/.test(name);
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

    const isListFormat = format => /^(lines|newline|br|bullets|numbered|sep:|\d+(:|$))/i.test(String(format || '').trim());
    const isListKey = name => /^(plan\.scheduled|plan\.backlog|plan\.list\..+|game\.genres|game\.platforms)$/.test(name);

    function applyFormat(name, value, format, now, table = {}) {
        if (!format) return value;
        const money = format.match(/^money(?::([a-z]{3}))?$/i);
        if (money) {
            const n = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
            if (value === '' || value === undefined || value === null || !Number.isFinite(n)) return value;
            try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: (money[1] || 'USD').toUpperCase() }).format(n); } catch { return n.toFixed(2); }
        }
        if (isListKey(name)) {
            const items = (table.__lists?.[name] || String(value ?? '').split(', ')).filter(Boolean);
            if (/^(lines|newline|br)$/i.test(format)) return items.join('\n');
            if (/^bullets$/i.test(format)) return items.map(item => `• ${item}`).join('\n');
            if (/^numbered$/i.test(format)) return items.map((item, i) => `${i + 1}. ${item}`).join('\n');
            const limit = format.match(/^(\d+)(?::(.*))?$/s);
            if (limit) return items.slice(0, Number(limit[1])).join(limit[2] === undefined ? ', ' : limit[2].replace(/\\n/g, '\n').replace(/\\s/g, ' '));
            return items.join(format.replace(/^sep:/, '').replace(/\\n/g, '\n').replace(/\\s/g, ' '));
        }
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
            const resolved = format === undefined ? table[name] : applyFormat(name, table[name], isListKey(name) ? format.replace(/^\s+/, '') : format.trim(), now, table);
            const text = resolved === undefined || resolved === null ? '' : String(resolved);
            return text === '' && keepEmpty ? match : text;
        });
    }

    function variableSnapshot(status, context) {
        const table = variableTable(status, context);
        for (const key of Object.keys(table)) {
            if ((isTicking(key) && !key.startsWith('timer.')) || key === 'chatter.random' || /\.random$/i.test(key)) delete table[key];
        }
        // Timer clocks tick on their own, so only structural timer values count as changes.
        for (const key of Object.keys(table)) if (key.startsWith('timer.') && !/\.(label|state)$/.test(key)) delete table[key];
        table.__plan = (status.gamePlan?.items || []).map(item => [item.name, item.status, item.period, item.cover, item.playingNow, item.note, item.finished, (item.played || []).join(','), (item.extraLists || []).join(',')]);
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

    // ---- media filters ----
    // Defaults, presets, dithering, halftone screentones and the filter pipeline live in /js/overlay-filters.js.
    // That module attaches defaultMediaFilter, mediaFilterActive and MEDIA_FILTER_PRESETS to OverlayShared when it loads.
    const patternRunners = new Set();
    let fxPaused = false;
    function fxResume() {
        for (const wake of patternRunners) wake();
    }
    function setEffectsPaused(paused) {
        fxPaused = !!paused;
        if (typeof document !== 'undefined') {
            document.documentElement.classList.toggle('sp-fx-paused', fxPaused);
        }
        if (root.OverlayFilters?.setEffectsPaused) root.OverlayFilters.setEffectsPaused(paused);
        if (root.OverlayRetro?.setEffectsPaused) root.OverlayRetro.setEffectsPaused(paused);
        fxResume();
    }
    if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', fxResume);
    }

    let filterScriptPromise = null;
    function ensureOverlayFilters() {
        if (root.OverlayFilters && root.OverlayRetro) return Promise.resolve(root.OverlayFilters);
        if (!filterScriptPromise) {
            filterScriptPromise = new Promise((resolve) => {
                if (typeof document === 'undefined') return resolve(null);
                const loadRetro = () => {
                    if (root.OverlayRetro) return Promise.resolve();
                    return new Promise((res) => {
                        const sRetro = document.createElement('script');
                        sRetro.src = '/overlay-retro.js';
                        sRetro.onload = () => res();
                        sRetro.onerror = () => res();
                        document.head.appendChild(sRetro);
                    });
                };
                loadRetro().then(() => {
                    if (root.OverlayRetro?.setEffectsPaused) root.OverlayRetro.setEffectsPaused(fxPaused);
                    if (root.OverlayFilters) {
                        if (root.OverlayFilters.setEffectsPaused) root.OverlayFilters.setEffectsPaused(fxPaused);
                        return resolve(root.OverlayFilters);
                    }
                    const script = document.createElement('script');
                    script.src = '/overlay-filters.js';
                    script.onload = () => {
                        if (root.OverlayFilters?.setEffectsPaused) root.OverlayFilters.setEffectsPaused(fxPaused);
                        resolve(root.OverlayFilters);
                    };
                    script.onerror = () => resolve(null);
                    document.head.appendChild(script);
                });
            });
        }
        return filterScriptPromise;
    }

    function applyMediaFilter(node, element, options) {
        if (root.OverlayFilters?.applyMediaFilter) {
            return root.OverlayFilters.applyMediaFilter(node, element, options);
        }
        ensureOverlayFilters().then(filters => {
            if (node.isConnected && filters?.applyMediaFilter) {
                filters.applyMediaFilter(node, element, options);
            }
        });
    }

    function parseYouTubeUrl(urlStr) {
        if (!urlStr || typeof urlStr !== 'string') return null;
        const str = urlStr.trim();
        try {
            const u = new URL(str, typeof location !== 'undefined' ? location.href : 'http://localhost:3000/');
            const host = u.hostname.toLowerCase().replace(/^www\./, '').replace(/^m\./, '');
            const timeParam = u.searchParams.get('t') || u.searchParams.get('start');
            let start = 0;
            if (timeParam) {
                const secMatch = timeParam.match(/^(?:(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?|(\d+))$/);
                if (secMatch) {
                    if (secMatch[4]) start = Number(secMatch[4]);
                    else start = (Number(secMatch[1] || 0) * 3600) + (Number(secMatch[2] || 0) * 60) + Number(secMatch[3] || 0);
                }
            }
            if (host === 'youtu.be') {
                const id = u.pathname.slice(1).split('/')[0].split('?')[0];
                if (id && /^[a-zA-Z0-9_-]{11}$/.test(id)) {
                    return { type: 'video', id, list: u.searchParams.get('list') || null, start };
                }
            } else if (host === 'youtube.com' || host === 'youtube-nocookie.com' || host.endsWith('.youtube.com')) {
                if (u.pathname === '/watch') {
                    const id = u.searchParams.get('v');
                    if (id && /^[a-zA-Z0-9_-]{11}$/.test(id)) {
                        return { type: 'video', id, list: u.searchParams.get('list') || null, start };
                    }
                } else if (u.pathname.startsWith('/shorts/') || u.pathname.startsWith('/live/') || u.pathname.startsWith('/embed/')) {
                    const parts = u.pathname.split('/').filter(Boolean);
                    const id = parts[1];
                    if (id && /^[a-zA-Z0-9_-]{11}$/.test(id)) {
                        return { type: 'video', id, list: u.searchParams.get('list') || null, start };
                    }
                } else if (u.pathname === '/playlist' && u.searchParams.get('list')) {
                    return { type: 'playlist', list: u.searchParams.get('list') };
                }
            }
        } catch { /* fallback to regex */ }

        const match = str.match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?v=|shorts\/|live\/|embed\/))([a-zA-Z0-9_-]{11})/i);
        if (match) {
            const listMatch = str.match(/[?&]list=([a-zA-Z0-9_-]+)/i);
            const timeMatch = str.match(/[?&](?:t|start)=([0-9hms]+)/i);
            let start = 0;
            if (timeMatch) {
                const m = timeMatch[1].match(/^(?:(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?|(\d+))$/);
                if (m) {
                    if (m[4]) start = Number(m[4]);
                    else start = (Number(m[1] || 0) * 3600) + (Number(m[2] || 0) * 60) + Number(m[3] || 0);
                }
            }
            return { type: 'video', id: match[1], list: listMatch ? listMatch[1] : null, start };
        }
        const plMatch = str.match(/[?&]list=([a-zA-Z0-9_-]+)/i);
        if (plMatch && /youtube/i.test(str)) {
            return { type: 'playlist', list: plMatch[1] };
        }
        return null;
    }

    // Embeds saved as http://localhost:PORT/... break when the overlay is opened from another device; point them at the current origin.
    // YouTube links (watch, shorts, live, share) are converted to privacy-enhanced embed URLs.
    function embedUrl(url, options = {}) {
        if (!url) return '';
        try {
            const yt = parseYouTubeUrl(url);
            if (yt) {
                const params = new URLSearchParams();
                if (options.autoplay !== false) params.set('autoplay', '1');
                else params.set('autoplay', '0');
                params.set('enablejsapi', '1');
                if (options.loop !== false) {
                    params.set('loop', '1');
                    if (yt.id) params.set('playlist', yt.id);
                }
                if (options.controls === false) params.set('controls', '0');
                if (options.sound === false || options.mute === true || options.autoplay !== false) params.set('mute', '1');
                params.set('playsinline', '1');
                if (yt.list && yt.type !== 'playlist') params.set('list', yt.list);
                if (yt.start) params.set('start', String(yt.start));
                try {
                    if (typeof location !== 'undefined' && location.origin && location.origin !== 'null') {
                        params.set('origin', location.origin);
                    }
                } catch {}
                return yt.type === 'playlist'
                    ? `https://www.youtube-nocookie.com/embed/videoseries?list=${encodeURIComponent(yt.list)}&${params.toString()}`
                    : `https://www.youtube-nocookie.com/embed/${yt.id}?${params.toString()}`;
            }

            const parsed = new URL(url, location.href);
            if (['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname) && parsed.host !== location.host) {
                parsed.protocol = location.protocol;
                parsed.host = location.host;
                return parsed.toString();
            }
        } catch { /* leave invalid URLs untouched */ }
        return url;
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
    let assetFontsFetchedAt = 0;
    let assetFontsSig = '';
    async function loadAssetFonts(force = false) {
        if (!force && assetFontsFetchedAt && Date.now() - assetFontsFetchedAt < 10000) return assetFonts;
        try {
            const response = await fetch('/api/custom-overlays/assets', { cache: 'no-store' });
            if (!response.ok) return assetFonts;
            assetFontsFetchedAt = Date.now();
            const fonts = (await response.json()).filter(asset => asset.kind === 'font');
            assetFonts.splice(0, assetFonts.length, ...fonts);
            const nextSig = fonts.map(f => `${f.family}|${f.url}`).join('\n');
            if (nextSig !== assetFontsSig) {
                assetFontsSig = nextSig;
                let style = document.getElementById('asset-font-faces');
                if (!style) { style = document.createElement('style'); style.id = 'asset-font-faces'; document.head.appendChild(style); }
                style.textContent = fonts.map(font => `@font-face { font-family: '${font.family.replace(/'/g, '')}'; src: url('${font.url}'); font-display: swap; }`).join('\n');
                if (document.fonts?.load) {
                    fonts.forEach(font => document.fonts.load(`16px '${font.family}'`).catch(() => null));
                }
            }
        } catch { /* fonts are optional */ }
        return assetFonts;
    }

    async function loadLiveExtras(status, elements = null) {
        try {
            let needTimers = true, needGoals = true, needPlan = true, needWeather = true;
            if (Array.isArray(elements)) {
                const raw = elements.map(el => `${el.type || ''} ${el.content || ''} ${el.progress?.label || ''} ${(el.items || []).join(' ')}`).join(' ');
                needTimers = /\btimer\./i.test(raw);
                needGoals = /\bgoal\./i.test(raw);
                needPlan = elements.some(el => el.type === 'game-list') || /\bplan\./i.test(raw);
                needWeather = /\bweather\./i.test(raw);
            }
            const [timers, goals, plan, weather] = await Promise.all([
                needTimers ? fetch('/api/timers', { cache: 'no-store' }).then(r => r.ok ? r.json() : null) : null,
                needGoals ? fetch('/api/goals', { cache: 'no-store' }).then(r => r.ok ? r.json() : null) : null,
                needPlan ? fetch('/api/game-plan', { cache: 'no-store' }).then(r => r.ok ? r.json() : null) : null,
                needWeather ? fetch('/api/weather', { cache: 'no-store' }).then(r => r.ok ? r.json() : null) : null
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
        const add = (css, g, clip) => { layers.push(css); sizes.push(g?.animate ? '200% 200%' : '100% 100%'); clips.push(clip); };
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
            ? { background: gradientCss(g), backgroundSize: '200% 200%', animation: `${slidesVertically(g) ? 'sp-gradient-shift-y' : 'sp-gradient-shift'} ${Math.max(1, g.speed || 8)}s ease-in-out infinite alternate` }
            : { background: gradientCss(g), backgroundSize: '', animation: '' };
    }

    function ensureGradientKeyframes() {
        if (document.getElementById('sp-gradient-keyframes')) return;
        const tag = document.createElement('style');
        tag.id = 'sp-gradient-keyframes';
        // Registered properties let text and box gradients animate on separate timers.
        tag.textContent = '@property --sp-t { syntax: "<percentage>"; inherits: false; initial-value: 0%; } @property --sp-b { syntax: "<percentage>"; inherits: false; initial-value: 0%; } '
            + '@keyframes sp-gradient-shift { from { background-position: 0% 50%; } to { background-position: 100% 50%; } } @keyframes sp-gradient-shift-y { from { background-position: 50% 0%; } to { background-position: 50% 100%; } } '
            + '@keyframes sp-shift-t { from { --sp-t: 0%; } to { --sp-t: 100%; } } @keyframes sp-shift-b { from { --sp-b: 0%; } to { --sp-b: 100%; } } '
            + '.sp-fx-paused *, .sp-fx-paused { animation-play-state: paused !important; }';
        document.head.appendChild(tag);
    }

    const BORDER_STYLES = ['solid', 'dashed', 'dotted', 'double', 'groove', 'ridge', 'inset', 'outset'];
    const BORDER_PLACEMENTS = ['inside', 'center', 'outside'];
    const BORDER_ANIM_TYPES = ['none', 'rotating', 'radial', 'pulsing', 'gradient', 'rainbow', 'marching'];

    function borderPlacement(style = {}, element = {}) {
        return BORDER_PLACEMENTS.includes(style.borderPlacement) ? style.borderPlacement
            : element.type === 'shape' && element.obsLink?.enabled === true ? 'outside' : 'inside';
    }

    function ensureBorderKeyframes() {
        if (window.CSS && typeof window.CSS.registerProperty === 'function') {
            try {
                window.CSS.registerProperty({
                    name: '--sp-angle',
                    syntax: '<angle>',
                    inherits: false,
                    initialValue: '0deg'
                });
            } catch {}
        }
        if (document.getElementById('sp-border-keyframes')) return;
        const tag = document.createElement('style');
        tag.id = 'sp-border-keyframes';
        tag.textContent = '@property --sp-angle { syntax: "<angle>"; inherits: false; initial-value: 0deg; } '
            + '@keyframes sp-border-spin { from { --sp-angle: 0deg; } to { --sp-angle: 360deg; } } '
            + '@keyframes sp-border-pulse { 0%, 100% { opacity: 0.3; filter: brightness(0.85); } 50% { opacity: 1; filter: brightness(1.35) drop-shadow(0 0 10px currentColor); } } '
            + '@keyframes sp-border-gradient-shift { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } } '
            + '@keyframes sp-border-rainbow { 0% { filter: hue-rotate(0deg); } 100% { filter: hue-rotate(360deg); } } '
            + '@keyframes sp-border-marching { from { stroke-dashoffset: 0; } to { stroke-dashoffset: -32; } } '
            + '@keyframes sp-border-radial-circuit { 0% { background-position: 0% 0%; } 25% { background-position: 100% 0%; } 50% { background-position: 100% 100%; } 75% { background-position: 0% 100%; } 100% { background-position: 0% 0%; } } '
            + '@keyframes sp-border-radial-circuit-rev { 0% { background-position: 0% 0%; } 25% { background-position: 0% 100%; } 50% { background-position: 100% 100%; } 75% { background-position: 100% 0%; } 100% { background-position: 0% 0%; } } '
            + '.sp-fx-paused [data-border-fx], .sp-fx-paused [data-border-ring], .sp-fx-paused [data-border-fx-ring] { animation-play-state: paused !important; }';
        document.head.appendChild(tag);
    }

    function computeBoxShadow(style = {}, width = 0, outset = 0) {
        const shadows = [];
        if (style.shadow?.blur > 0) {
            shadows.push(`0 0 ${style.shadow.blur}px ${outset}px ${style.shadow.color || 'rgba(0,0,0,0.5)'}`);
        }
        const glow = style.borderGlow;
        if (glow?.enabled && width > 0) {
            const gc = glow.color && glow.color !== 'transparent' ? glow.color : (style.borderColor && style.borderColor !== 'transparent' ? style.borderColor : '#38bdf8');
            const gb = Math.max(0, Number(glow.blur ?? 16));
            const gs = Math.max(0, Number(glow.spread ?? 2));
            if (glow.neon) {
                shadows.push(
                    `0 0 3px ${outset}px #ffffff`,
                    `0 0 ${Math.max(6, Math.round(gb * 0.4))}px ${outset}px ${gc}`,
                    `0 0 ${gb}px ${gs + outset}px ${gc}`,
                    `0 0 ${Math.round(gb * 1.6)}px ${Math.round(gs * 1.5) + outset}px ${gc}`
                );
            } else {
                shadows.push(`0 0 ${gb}px ${gs + outset}px ${gc}`);
            }
        }
        return shadows.length ? shadows.join(', ') : 'none';
    }

    // Applies full border styling, gradients, glows, and hardware-accelerated animations across all element types.
    function applyBorderEffects(node, style = {}, element = {}) {
        if (!node) return;
        const lineShape = element.type === 'shape' && style.shape === 'line';
        const width = lineShape ? 0 : Math.max(0, Number(style.borderWidth) || 0);
        const shapeBorder = element.type === 'shape' && !lineShape;
        const placement = shapeBorder ? borderPlacement(style, element) : 'inside';
        const outset = width * (placement === 'outside' ? 1 : placement === 'center' ? 0.5 : 0);
        const innerInset = width - outset;
        const shape = style.shape || 'rectangle';
        const radius = shapeBorder && shape === 'circle' ? '50%'
            : shapeBorder && shape === 'pill' ? '999px'
                : (node.style.borderRadius || `${Number(style.borderRadius) || 0}px`);
        const outerRadius = outset && radius !== '50%' ? `calc(${radius} + ${outset}px)` : radius;
        const borderStyle = style.borderStyle || 'solid';
        const borderColor = style.borderColor || 'transparent';
        const g = style.borderGradient;
        const anim = style.borderAnimation || {};
        const glow = style.borderGlow || {};
        const ish = style.innerShadow || {};
        const hasInnerGlow = glow.enabled && glow.inner;
        const hasInnerShadow = Number(ish.blur) > 0 || Number(ish.spread) > 0;
        const hasBorderGradient = width > 0 && Boolean(g?.enabled);
        const hasBorderAnim = width > 0 && !hasBorderGradient && Boolean(anim.type && anim.type !== 'none');
        const hasRingBorder = hasBorderGradient || hasBorderAnim || (shapeBorder && width > 0);

        node.style.boxShadow = computeBoxShadow(style, width, outset);

        if (hasInnerGlow || hasInnerShadow || hasRingBorder) {
            if (!node._borderObserver) {
                node._borderObserver = new MutationObserver(() => {
                    if (node._borderRing && node._borderRing.parentNode !== node) node.append(node._borderRing);
                    if (node._borderFxRing && node._borderFxRing.parentNode !== node) node.append(node._borderFxRing);
                    if (node._innerGlowRing && node._innerGlowRing.parentNode !== node) node.append(node._innerGlowRing);
                });
                node._borderObserver.observe(node, { childList: true });
            }
        } else if (node._borderObserver) {
            node._borderObserver.disconnect();
            node._borderObserver = null;
        }

        // Inner shadow and inner glow are rendered via a dedicated overlay under borders so they stay visible over fills, images, videos, and cutouts without obscuring borders.
        if (hasInnerGlow || hasInnerShadow) {
            let innerRing = node._innerGlowRing;
            if (!innerRing) {
                innerRing = node._innerGlowRing = document.createElement('div');
                innerRing.setAttribute('aria-hidden', 'true');
                innerRing.dataset.innerGlow = 'true';
            }
            if (innerRing.parentNode !== node) node.append(innerRing);

            const innerShadows = [];
            if (hasInnerShadow) {
                const isx = Number(ish.x) || 0;
                const isy = Number(ish.y) || 0;
                const isb = Math.max(0, Number(ish.blur) || 0);
                const iss = Math.max(0, Number(ish.spread) || 0);
                const isc = ish.color || 'rgba(0,0,0,0.5)';
                innerShadows.push(`inset ${isx}px ${isy}px ${isb}px ${iss}px ${isc}`);
            }
            if (hasInnerGlow) {
                const gc = glow.color && glow.color !== 'transparent' ? glow.color : (borderColor && borderColor !== 'transparent' ? borderColor : '#38bdf8');
                const gb = Math.max(0, Number(glow.blur ?? 16));
                const gs = Math.max(0, Number(glow.spread ?? 2));
                if (glow.neon) {
                    innerShadows.push('inset 0 0 3px #ffffff', `inset 0 0 ${gb}px ${Math.max(2, gs)}px ${gc}`);
                } else {
                    innerShadows.push(`inset 0 0 ${gb}px ${Math.max(1, gs)}px ${gc}`);
                }
            }
            const innerShadowCss = innerShadows.join(', ');
            const insetCss = hasRingBorder ? `${innerInset}px` : '0';
            const radiusCss = width > 0 && radius !== '50%' ? `max(0px, calc(${radius} - ${innerInset}px))` : radius;
            const innerSig = `${insetCss}|${radiusCss}|${innerShadowCss}`;
            if (innerRing._sig !== innerSig) {
                innerRing._sig = innerSig;
                innerRing.style.cssText = `position:absolute;inset:${insetCss};box-sizing:border-box;border-radius:${radiusCss};pointer-events:none;z-index:1;box-shadow:${innerShadowCss};`;
            }
        } else if (node._innerGlowRing) {
            node._innerGlowRing.remove();
            node._innerGlowRing = null;
        }

        if (width <= 0) {
            if (node._borderRing) { node._borderRing.remove(); node._borderRing = null; }
            if (node._borderFxRing) { node._borderFxRing.remove(); node._borderFxRing = null; }
            if (!hasInnerGlow && !hasInnerShadow && node._borderObserver) {
                node._borderObserver.disconnect();
                node._borderObserver = null;
            }
            if (element.type !== 'cutout') node.style.border = '0';
            node.style.backgroundClip = '';
            return;
        }

        // Case 1: Gradient Border (with from, optional mid, to, angle/radial, and sweeping animation)
        if (hasBorderGradient) {
            let ring = node._borderRing;
            if (!ring) {
                ring = node._borderRing = document.createElement('div');
                ring.setAttribute('aria-hidden', 'true');
                ring.dataset.borderRing = 'true';
            }
            if (ring.parentNode !== node) node.append(ring);
            node.style.border = '0';
            node.style.backgroundClip = 'padding-box';

            ensureGradientKeyframes();
            const gradCss = gradientCss(g);
            const isVertical = slidesVertically(g);
            const animCss = g.animate
                ? `${isVertical ? 'sp-gradient-shift-y' : 'sp-gradient-shift'} ${Math.max(1, g.speed || 8)}s ease-in-out infinite alternate`
                : '';
            const ringSig = `${width}|${gradCss}|${g.animate}|${g.speed}`;
            if (ring._sig !== ringSig) {
                ring._sig = ringSig;
                ring.style.cssText = `position:absolute;inset:0;box-sizing:border-box;border:${width}px solid transparent;border-radius:inherit;pointer-events:none;background:${gradCss};background-size:${g.animate ? '200% 200%' : 'cover'};animation:${animCss};z-index:2;`;
                ring.style.setProperty('-webkit-mask', 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0) border-box');
                ring.style.setProperty('-webkit-mask-composite', 'xor');
                ring.style.setProperty('mask', 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0) border-box');
                ring.style.setProperty('mask-composite', 'exclude');
            }
        } else if (node._borderRing && (!shapeBorder || hasBorderAnim)) {
            node._borderRing.remove();
            node._borderRing = null;
        }

        // Case 2: Animated Border (Rotating beam, Radial rotating, Pulsing, Sweeping gradient with middle color, Rainbow, Marching ants)
        if (!hasBorderGradient && hasBorderAnim) {
            ensureBorderKeyframes();
            let fxRing = node._borderFxRing;
            if (!fxRing) {
                fxRing = node._borderFxRing = document.createElement('div');
                fxRing.setAttribute('aria-hidden', 'true');
                fxRing.dataset.borderFxRing = 'true';
            }
            if (fxRing.parentNode !== node) node.append(fxRing);
            node.style.border = '0';
            node.style.backgroundClip = 'padding-box';

            if (anim.type === 'rotating') {
                const speed = Math.max(0.5, Math.min(60, Number(anim.speed) || 4));
                const size = Math.max(10, Math.min(100, Number(anim.size) || 35));
                const arc = Math.round(360 * (size / 100));
                const head = anim.color2 || '#ffffff';
                const trail = borderColor && borderColor !== 'transparent' ? borderColor : '#38bdf8';
                const sig = `rotating|${width}|${speed}|${size}|${head}|${trail}`;
                if (fxRing._sig !== sig) {
                    fxRing._sig = sig;
                    fxRing.style.cssText = `position:absolute;inset:0;box-sizing:border-box;border:${width}px solid transparent;border-radius:inherit;pointer-events:none;background:conic-gradient(from var(--sp-angle), transparent 0deg, transparent ${360 - arc}deg, ${trail} ${360 - Math.round(arc / 2)}deg, ${head} 360deg);animation:sp-border-spin ${speed}s linear infinite;z-index:2;`;
                    fxRing.style.setProperty('-webkit-mask', 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0) border-box');
                    fxRing.style.setProperty('-webkit-mask-composite', 'xor');
                    fxRing.style.setProperty('mask', 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0) border-box');
                    fxRing.style.setProperty('mask-composite', 'exclude');
                    fxRing.innerHTML = '';
                }
            } else if (anim.type === 'radial') {
                const speed = Math.max(0.5, Math.min(60, Number(anim.speed) || 4));
                const size = Math.max(10, Math.min(100, Number(anim.size) || 40));
                const mode = ['spotlight', 'two-tone', 'fade-white', 'fade-black', 'rainbow'].includes(anim.mode) ? anim.mode : 'spotlight';
                const direction = ['cw', 'ccw', 'alternate'].includes(anim.direction) ? anim.direction : 'cw';
                const head = anim.color2 || (mode === 'spotlight' ? '#ffffff' : '#38bdf8');
                const trail = borderColor && borderColor !== 'transparent' ? borderColor : '#38bdf8';
                const mid = anim.color3 || '';
                const bgSize = Math.max(160, Math.min(320, Math.round(150 + (size * 1.5))));

                let gradStops = '';
                if (mode === 'rainbow') {
                    gradStops = '#ff0055 0%, #ff9900 17%, #ffee00 33%, #00ff66 50%, #00bbff 67%, #8800ff 83%, #ff0055 100%';
                } else if (mode === 'fade-white') {
                    gradStops = mid ? `${head} 0%, ${mid} 45%, #ffffff 100%` : `${head} 0%, #ffffff 100%`;
                } else if (mode === 'fade-black') {
                    gradStops = mid ? `${head} 0%, ${mid} 45%, #000000 100%` : `${head} 0%, #000000 100%`;
                } else if (mode === 'two-tone') {
                    gradStops = mid ? `${head} 0%, ${mid} 45%, ${trail} 100%` : `${head} 0%, ${trail} 100%`;
                } else {
                    const base = 'transparent';
                    const spreadRatio = Math.max(20, Math.min(80, size));
                    gradStops = mid
                        ? `${head} 0%, ${mid} ${Math.round(spreadRatio * 0.45)}%, ${trail} ${spreadRatio}%, ${base} ${Math.min(100, Math.round(spreadRatio * 1.5))}%`
                        : `${head} 0%, ${trail} ${spreadRatio}%, ${base} ${Math.min(100, Math.round(spreadRatio * 1.5))}%`;
                }

                const animName = direction === 'ccw' ? 'sp-border-radial-circuit-rev' : 'sp-border-radial-circuit';
                const animDir = direction === 'alternate' ? 'alternate' : 'normal';
                const sig = `radial|${width}|${speed}|${size}|${mode}|${direction}|${head}|${mid}|${trail}|${bgSize}`;
                if (fxRing._sig !== sig) {
                    fxRing._sig = sig;
                    fxRing.style.cssText = `position:absolute;inset:0;box-sizing:border-box;border:${width}px solid transparent;border-radius:inherit;pointer-events:none;background:radial-gradient(circle, ${gradStops});background-size:${bgSize}% ${bgSize}%;animation:${animName} ${speed}s ease-in-out infinite ${animDir};z-index:2;`;
                    fxRing.style.setProperty('-webkit-mask', 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0) border-box');
                    fxRing.style.setProperty('-webkit-mask-composite', 'xor');
                    fxRing.style.setProperty('mask', 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0) border-box');
                    fxRing.style.setProperty('mask-composite', 'exclude');
                    fxRing.innerHTML = '';
                }
            } else if (anim.type === 'pulsing') {
                const speed = Math.max(0.5, Math.min(60, Number(anim.speed) || 2));
                const c = borderColor && borderColor !== 'transparent' ? borderColor : '#38bdf8';
                const sig = `pulsing|${width}|${borderStyle}|${c}|${speed}`;
                if (fxRing._sig !== sig) {
                    fxRing._sig = sig;
                    fxRing.style.cssText = `position:absolute;inset:0;box-sizing:border-box;border:${width}px ${borderStyle} ${c};border-radius:inherit;pointer-events:none;color:${c};box-shadow:0 0 16px ${c};animation:sp-border-pulse ${speed}s ease-in-out infinite;z-index:2;`;
                    fxRing.style.webkitMask = fxRing.style.mask = '';
                    fxRing.innerHTML = '';
                }
            } else if (anim.type === 'gradient') {
                const speed = Math.max(0.5, Math.min(60, Number(anim.speed) || 4));
                const c1 = borderColor && borderColor !== 'transparent' ? borderColor : '#1f6feb';
                const mid = anim.color3 || '';
                const c2 = anim.color2 || '#8957e5';
                const stops = [c1, mid, c2].filter(Boolean).join(', ');
                const sig = `gradient|${width}|${speed}|${stops}`;
                if (fxRing._sig !== sig) {
                    fxRing._sig = sig;
                    fxRing.style.cssText = `position:absolute;inset:0;box-sizing:border-box;border:${width}px solid transparent;border-radius:inherit;pointer-events:none;background:linear-gradient(135deg, ${stops});background-size:200% 200%;animation:sp-border-gradient-shift ${speed}s ease-in-out infinite alternate;z-index:2;`;
                    fxRing.style.setProperty('-webkit-mask', 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0) border-box');
                    fxRing.style.setProperty('-webkit-mask-composite', 'xor');
                    fxRing.style.setProperty('mask', 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0) border-box');
                    fxRing.style.setProperty('mask-composite', 'exclude');
                    fxRing.innerHTML = '';
                }
            } else if (anim.type === 'rainbow') {
                const speed = Math.max(0.5, Math.min(60, Number(anim.speed) || 4));
                const sig = `rainbow|${width}|${speed}`;
                if (fxRing._sig !== sig) {
                    fxRing._sig = sig;
                    fxRing.style.cssText = `position:absolute;inset:0;box-sizing:border-box;border:${width}px solid transparent;border-radius:inherit;pointer-events:none;background:linear-gradient(135deg, #ff0055, #ff9900, #ffee00, #00ff66, #00bbff, #8800ff, #ff0055);animation:sp-border-rainbow ${speed}s linear infinite;z-index:2;`;
                    fxRing.style.setProperty('-webkit-mask', 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0) border-box');
                    fxRing.style.setProperty('-webkit-mask-composite', 'xor');
                    fxRing.style.setProperty('mask', 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0) border-box');
                    fxRing.style.setProperty('mask-composite', 'exclude');
                    fxRing.innerHTML = '';
                }
            } else if (anim.type === 'marching') {
                const speed = Math.max(0.5, Math.min(60, Number(anim.speed) || 2));
                const c = borderColor && borderColor !== 'transparent' ? borderColor : '#38bdf8';
                const rad = node.style.borderRadius || '0px';
                const sig = `marching|${width}|${speed}|${c}|${rad}`;
                if (fxRing._sig !== sig) {
                    fxRing._sig = sig;
                    fxRing.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible;z-index:2;';
                    fxRing.style.webkitMask = fxRing.style.mask = '';
                    fxRing.innerHTML = `<svg data-border-fx="marching" style="position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none;"><rect x="${width / 2}" y="${width / 2}" width="calc(100% - ${width}px)" height="calc(100% - ${width}px)" rx="${rad}" ry="${rad}" fill="none" stroke="${c}" stroke-width="${width}" stroke-dasharray="${Math.max(6, width * 2)} ${Math.max(4, width * 1.5)}" style="animation:sp-border-marching ${speed}s linear infinite;"></rect></svg>`;
                }
            }
        } else if (node._borderFxRing) {
            node._borderFxRing.remove();
            node._borderFxRing = null;
        }

        // Case 3: Static solid/dashed/groove border
        if (!hasBorderGradient && !hasBorderAnim) {
            if (shapeBorder) {
                let ring = node._borderRing;
                if (!ring) {
                    ring = node._borderRing = document.createElement('div');
                    ring.setAttribute('aria-hidden', 'true');
                    ring.dataset.borderRing = 'true';
                }
                if (ring.parentNode !== node) node.append(ring);
                ring._sig = null;
                ring.style.cssText = `position:absolute;box-sizing:border-box;border:${width}px ${borderStyle} ${borderColor};pointer-events:none;z-index:2;`;
                node.style.border = '0';
            } else {
                node.style.border = `${width}px ${borderStyle} ${borderColor}`;
            }
            node.style.backgroundClip = '';
        }

        // The source box stays fixed; only the decorative ring expands beyond it.
        for (const ring of [node._borderRing, node._borderFxRing]) {
            if (!ring) continue;
            ring.style.inset = `${-outset}px`;
            ring.style.width = ring.style.height = '';
            ring.style.borderRadius = outerRadius;
            const rect = ring.querySelector('svg > rect');
            if (rect) {
                const strokeRadius = `max(0px, calc(${outerRadius} - ${width / 2}px))`;
                rect.style.rx = rect.style.ry = strokeRadius;
            }
        }
    }

    function applyBorderGradient(node, style = {}, element = {}) {
        applyBorderEffects(node, style, element);
    }

    // Outline, text shadow and case/decoration apply to the text itself (and inherit into markdown and alert text).
    function textEffectStyle(style = {}, type = '') {
        if (type === 'icon') return {};
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

    // Layers clip their content, which cuts off text shadows and glows at the box edge. Let the shadow spill out instead.
    function shadowClipStyle(element) {
        if (element.type === 'icon' || element.type === 'speaker-badge') return { overflow: 'visible', overflowClipMargin: '' };
        const style = element.style || {};
        if (element.type === 'shape' && (style.shape === 'line' || borderPlacement(style, element) !== 'inside' || style.borderAnimation?.type === 'pulsing')) {
            return { overflow: 'visible', overflowClipMargin: '' };
        }
        const blur = Number(style.textShadow?.blur) || 0;
        const textual = !['image', 'video', 'slideshow', 'embed', 'qr', 'icon', 'shape', 'progress', 'game-list', 'pattern'].includes(element.type);
        if (!(blur > 0) || !textual || element.random?.marquee) return { overflow: '', overflowClipMargin: '' };
        if (window.CSS?.supports?.('overflow-clip-margin', '4px')) return { overflow: 'clip', overflowClipMargin: `${Math.ceil(blur * 2 + 4)}px` };
        return { overflow: 'visible', overflowClipMargin: '' };
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
        tag.textContent = '@keyframes spGlTicker{from{transform:translateX(0)}to{transform:translateX(-50%)}}@keyframes spGlTickerR{from{transform:translateX(-50%)}to{transform:translateX(0)}}.sp-fx-paused [data-gl-ticker-body]{animation-play-state:paused!important}';
        document.head.appendChild(tag);
    }

    function matchesPeriodToken(item, token) {
        if (!item || !token) return true;
        const t = String(token).trim().toLowerCase();
        if (!t || t === 'all') return true;

        const itemDates = [
            item.streamDate,
            ...(Array.isArray(item.streamDates) ? item.streamDates.map(d => typeof d === 'string' ? d : d?.date) : [])
        ].filter(Boolean);

        const now = new Date();
        const pad = n => String(n).padStart(2, '0');
        const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

        const tom = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        const tomorrowStr = `${tom.getFullYear()}-${pad(tom.getMonth() + 1)}-${pad(tom.getDate())}`;

        const dayOfWeek = now.getDay();
        const diffToMon = (dayOfWeek + 6) % 7;
        const mon = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diffToMon);
        const weekStartStr = `${mon.getFullYear()}-${pad(mon.getMonth() + 1)}-${pad(mon.getDate())}`;
        const sun = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diffToMon + 6);
        const weekEndStr = `${sun.getFullYear()}-${pad(sun.getMonth() + 1)}-${pad(sun.getDate())}`;

        const periodLower = String(item.period || '').trim().toLowerCase();

        if (t === '@today' || t === 'today' || t === 'tonight') {
            return item.status === 'tonight' ||
                   periodLower === 'tonight' ||
                   periodLower === 'today' ||
                   itemDates.includes(todayStr);
        }
        if (t === '@tomorrow' || t === 'tomorrow' || t === 'next-stream' || t === 'next stream') {
            return periodLower === 'next stream' ||
                   periodLower === 'next-stream' ||
                   periodLower === 'tomorrow' ||
                   itemDates.includes(tomorrowStr);
        }
        if (t === '@this-week' || t === 'this-week' || t === 'thisweek' || t === 'this week') {
            return periodLower === 'this week' ||
                   periodLower === 'weekend' ||
                   itemDates.some(d => d >= weekStartStr && d <= weekEndStr);
        }
        if (t === '@upcoming' || t === 'upcoming') {
            return itemDates.some(d => d >= todayStr) ||
                   Boolean(item.streamRecurring) ||
                   (periodLower && !['played', 'backlog'].includes(periodLower) && !['played', 'backlog'].includes(item.status));
        }
        if (t === '@unscheduled' || t === 'unscheduled' || t === 'none' || t === 'no-period' || t === 'undated') {
            return !periodLower && itemDates.length === 0;
        }

        if (t.startsWith('!')) {
            const notToken = t.slice(1).trim().toLowerCase();
            return periodLower !== notToken;
        }

        return periodLower === t;
    }

    function matchesPeriodFilter(item, wantedTokens) {
        if (!item) return false;
        if (!wantedTokens || !wantedTokens.length) return true;
        const tokens = (Array.isArray(wantedTokens) ? wantedTokens : String(wantedTokens).split(','))
            .map(t => String(t).trim())
            .filter(Boolean);
        if (!tokens.length) return true;

        const pos = tokens.filter(t => !t.startsWith('!'));
        const neg = tokens.filter(t => t.startsWith('!'));

        if (neg.some(t => !matchesPeriodToken(item, t))) {
            return false;
        }
        if (!pos.length) return true;
        return pos.some(t => matchesPeriodToken(item, t));
    }

    // Renders the manual game plan as a cover grid, a cover strip or a text list.
    function renderGameList(node, element, plan) {
        const config = element.gameList || {};
        const style = element.style || {};
        let items = (plan?.items || []).filter(item => {
            if (config.filter === 'all') return true;
            if (config.filter === 'scheduled-only') {
                return (item.status === 'scheduled' || (item.extraLists || []).includes('scheduled')) && item.status !== 'tonight';
            }
            if (config.filter === 'scheduled' || !config.filter) {
                return item.status === 'scheduled' || item.status === 'tonight' || (item.extraLists || []).includes('scheduled');
            }
            return inPlanList(item, config.filter);
        });
        const order = (plan?.periods || []).map(name => String(name).toLowerCase());
        const rank = item => { const at = order.indexOf(String(item.period || '').toLowerCase()); return at < 0 ? order.length : at; };
        const wanted = (Array.isArray(config.periods) && config.periods.length ? config.periods : config.period ? [config.period] : []);
        if (wanted.length) items = items.filter(item => matchesPeriodFilter(item, wanted));
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

        const listMap = new Map((plan?.lists || []).map(l => [l.id, l.name]));
        const statusNames = { scheduled: 'Scheduled', backlog: 'Backlog', played: 'Played', tonight: 'Tonight' };
        for (const entry of plan?.lists || []) statusNames[entry.id] = entry.name;

        const dateVal = item => item.streamDate || item.finished || (Array.isArray(item.played) ? item.played[0] : '') || '';
        const groupVal = item => listMap.get(item.status) || (item.extraLists || []).map(id => listMap.get(id)).find(Boolean) || item.period || '';
        const STATUS_PRIORITY = { tonight: 1, scheduled: 2, 'up-next': 3, backlog: 4, played: 5 };

        const sortMode = config.sort || 'plan';
        if (sortMode === 'date' || sortMode === 'date-asc') {
            items = [...items].sort((a, b) => {
                const dA = dateVal(a), dB = dateVal(b);
                if (dA && dB) return dA.localeCompare(dB) || String(a.name).localeCompare(String(b.name));
                if (dA && !dB) return -1;
                if (!dA && dB) return 1;
                return rank(a) - rank(b) || String(a.name).localeCompare(String(b.name));
            });
        } else if (sortMode === 'date-desc') {
            items = [...items].sort((a, b) => {
                const dA = dateVal(a), dB = dateVal(b);
                if (dA && dB) return dB.localeCompare(dA) || String(a.name).localeCompare(String(b.name));
                if (dA && !dB) return -1;
                if (!dA && dB) return 1;
                return rank(a) - rank(b) || String(a.name).localeCompare(String(b.name));
            });
        } else if (sortMode === 'group' || sortMode === 'collection') {
            items = [...items].sort((a, b) => {
                const gA = groupVal(a), gB = groupVal(b);
                if (gA && gB && gA !== gB) return gA.localeCompare(gB);
                if (gA && !gB) return -1;
                if (!gA && gB) return 1;
                const dA = dateVal(a), dB = dateVal(b);
                return (dA && dB ? dA.localeCompare(dB) : 0) || String(a.name).localeCompare(String(b.name));
            });
        } else if (sortMode === 'status') {
            items = [...items].sort((a, b) => {
                const sA = STATUS_PRIORITY[a.status] || 50;
                const sB = STATUS_PRIORITY[b.status] || 50;
                if (sA !== sB) return sA - sB;
                const dA = dateVal(a), dB = dateVal(b);
                return (dA && dB ? dA.localeCompare(dB) : 0) || String(a.name).localeCompare(String(b.name));
            });
        } else if (sortMode === 'name' || sortMode === 'name-asc') {
            items = [...items].sort((a, b) => String(a.name).localeCompare(String(b.name)));
        } else if (sortMode === 'name-desc') {
            items = [...items].sort((a, b) => String(b.name).localeCompare(String(a.name)));
        } else if (sortMode === 'rating') {
            items = [...items].sort((a, b) => (b.rating || 0) - (a.rating || 0) || String(a.name).localeCompare(String(b.name)));
        } else {
            // 'plan' order (default)
            items = items.map((item, at) => ({ item, at })).sort((a, b) => rank(a.item) - rank(b.item) || a.at - b.at).map(entry => entry.item);
        }

        if (config.max > 0) items = items.slice(0, config.max);

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
                const customList = listMap.get(item.status) || (item.extraLists || []).map(id => listMap.get(id)).find(Boolean);
                const label = config.groupBy === 'collection' ? (customList || item.period || 'General')
                    : config.groupBy === 'status' ? (item.status === 'tonight' ? 'Tonight' : (item.status === 'scheduled' ? 'Scheduled' : (statusNames[item.status] || item.status || 'Other')))
                    : config.filter === 'all' ? (statusNames[item.status] || item.status) : (item.period || 'No period');
                let section = sections.find(entry => entry.label === label);
                if (!section) { section = { label, items: [] }; sections.push(section); }
                section.items.push(item);
            }
            inner.style.cssText += `display:flex;align-items:flex-start;gap:${groupGap}px;transform-origin:top left;`;
        } else if (!ticker && config.headings !== false && config.filter !== 'backlog' && config.groupBy !== 'none') {
            for (const item of items) {
                const customList = listMap.get(item.status) || (item.extraLists || []).map(id => listMap.get(id)).find(Boolean);
                const label = config.groupBy === 'collection' ? (customList || item.period || 'General')
                    : config.groupBy === 'status' ? (item.status === 'tonight' ? 'Tonight' : (item.status === 'scheduled' ? 'Scheduled' : (statusNames[item.status] || item.status || 'Other')))
                    : (item.period || '');
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
            if (config.meta === 'group') {
                return listMap.get(item.status) || (item.extraLists || []).map(id => listMap.get(id)).find(Boolean) || item.period || '';
            }
            if (config.meta === 'status') {
                return item.playingNow ? 'Playing' : (item.status === 'tonight' ? 'Tonight' : (item.status === 'scheduled' ? 'Scheduled' : (statusNames[item.status] || item.status || '')));
            }
            if (config.meta === 'date') return item.streamDate || '';
            if (config.meta === 'period') return item.period || '';
            return '';
        };
        const makePill = (text, bg, fg, border) => {
            const pill = document.createElement('span');
            pill.textContent = text;
            pill.style.cssText = `background:${bg};color:${fg};${border ? `border:1px solid ${border};` : ''}font-size:.55em;font-weight:700;letter-spacing:.04em;padding:.15em .5em;border-radius:999px;white-space:nowrap;display:inline-flex;align-items:center;line-height:1.2;`;
            return pill;
        };
        const statusPill = item => {
            if (!config.showStatusBadge) return null;
            if (item.status === 'tonight') return makePill('Tonight', `color-mix(in srgb, ${accent} 22%, transparent)`, `color-mix(in srgb, ${accent} 80%, #ffffff)`, `color-mix(in srgb, ${accent} 45%, transparent)`);
            if (item.status === 'up-next') return makePill('Up Next', `color-mix(in srgb, ${accent} 15%, transparent)`, `color-mix(in srgb, ${accent} 70%, #ffffff)`, `color-mix(in srgb, ${accent} 35%, transparent)`);
            if (item.status === 'scheduled') return makePill('Scheduled', 'rgba(255,255,255,0.1)', '#e2e8f0', 'rgba(255,255,255,0.2)');
            if (item.status === 'played') return makePill('Done', 'rgba(34,197,94,0.2)', '#4ade80', 'rgba(34,197,94,0.4)');
            return null;
        };
        const groupPill = item => {
            if (!config.showGroupBadge) return null;
            const grp = listMap.get(item.status) || (item.extraLists || []).map(id => listMap.get(id)).find(Boolean) || item.period;
            if (!grp) return null;
            return makePill(grp, 'rgba(139,92,246,0.2)', '#c084fc', 'rgba(139,92,246,0.4)');
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
                img.decoding = 'async';
                img.src = item.cover; img.alt = '';
                img.style.cssText = config.coverFit === 'natural' ? 'width:100%;height:auto;display:block;' : `position:absolute;inset:0;width:100%;height:100%;object-fit:${config.coverFit === 'contain' ? 'contain' : 'cover'};display:block;`;
                if (config.coverFit !== 'natural') wrap.style.position = 'relative';
                wrap.style.padding = '0';
                wrap.appendChild(img);
            } else if (!hideName) wrap.textContent = item.name;
            if (item.playingNow && config.highlightCurrent !== false) {
                wrap.style.boxShadow = `0 0 0 3px ${accent}`;
            } else if (item.status === 'tonight' && config.highlightCurrent !== false) {
                wrap.style.boxShadow = `0 0 0 2px color-mix(in srgb, ${accent} 50%, transparent)`;
            }
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
            } else if (autoColumns || config.periodsAcross > 0 || config.fit === 'shrink') {
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
                    title.style.cssText = `display:flex;align-items:center;gap:.5em;justify-content:${just};flex-wrap:wrap;`;
                    const name = document.createElement('span');
                    name.textContent = item.name;
                    name.style.cssText = `font-weight:600;${titleFlow};font-size:${titleSize};`;
                    if (config.showTitles !== false || config.showCovers === false) title.appendChild(name);
                    if (item.playingNow && config.highlightCurrent !== false) title.appendChild(badge());
                    const sp = statusPill(item); if (sp) title.appendChild(sp);
                    const gp = groupPill(item); if (gp) title.appendChild(gp);
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
                    ? `display:flex;gap:${gap}px;justify-content:${just};`
                    : ticker ? 'display:flex;width:max-content;align-items:center;min-height:100%;will-change:transform;'
                    : `display:flex;flex-wrap:wrap;gap:${gap}px;justify-content:${just};--cols:${cols};`;
                if (!strip && !ticker) body.dataset.glGrid = '1';
                if (ticker) body.dataset.glTickerBody = '1';
                let tickerItems = section.items;
                if (ticker && tickerItems.length > 0) {
                    tickerItems = [...tickerItems];
                    const minNeeded = Math.max(cols + 1, section.items.length * 2);
                    while (tickerItems.length < minNeeded) {
                        tickerItems = tickerItems.concat(section.items);
                    }
                }
                const fill = target => { for (const item of (ticker ? tickerItems : section.items)) {
                    const card = document.createElement('div');
                    card.style.cssText = strip ? `flex:1 1 0;min-width:0;max-width:calc((100% - ${5 * gap}px) / 6);`
                        : ticker ? `flex:0 0 calc((100cqw - ${(cols - 1) * gap}px) / ${cols});width:calc((100cqw - ${(cols - 1) * gap}px) / ${cols});min-width:0;`
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
                        const sp = statusPill(item), gp = groupPill(item);
                        if (sp || gp) {
                            const pillRow = document.createElement('div');
                            pillRow.style.cssText = 'position:absolute;top:.4em;right:.4em;display:flex;gap:4px;flex-wrap:wrap;';
                            if (sp) pillRow.appendChild(sp);
                            if (gp) pillRow.appendChild(gp);
                            face.appendChild(pillRow);
                        }
                        card.appendChild(face);
                    } else {
                        card.appendChild(face);
                        const sp = statusPill(item), gp = groupPill(item);
                        if ((item.playingNow && config.highlightCurrent !== false) || sp || gp) {
                            const holder = document.createElement('div');
                            holder.style.cssText = `display:flex;align-items:center;gap:4px;flex-wrap:wrap;justify-content:${just};margin-top:.35em;`;
                            if (item.playingNow && config.highlightCurrent !== false) holder.appendChild(badge());
                            if (sp) holder.appendChild(sp);
                            if (gp) holder.appendChild(gp);
                            card.appendChild(holder);
                        }
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
        if (config.periodsAcross > 0 && !kanban && !tiers) {
            inner.style.display = 'grid';
            inner.style.gridTemplateColumns = `repeat(${config.periodsAcross},minmax(0,1fr))`;
            inner.style.columnGap = `${groupGap}px`;
            inner.style.alignItems = 'start';
        }
        // "Shrink to fit" first reflows grids/tiers into more games per row (never fewer than set) so covers stay big before anything is scaled down.
        const reflow = autoColumns || (shrink && (layout === 'grid' || tiers));
        const minCols = autoColumns ? 1 : (config.columns || (tiers ? 6 : 3));
        const place = () => {
            if (ticker) {
                const copies = [...inner.querySelectorAll('[data-gl-ticker-copy]')];
                if (!copies.length) return;
                const scrolls = copies[0].children.length > 0;
                if (copies[1]) copies[1].style.display = scrolls ? 'flex' : 'none';
                const body = copies[0].parentElement;
                if (body) {
                    body.style.animation = scrolls
                        ? `${config.tickerDirection === 'right' ? 'spGlTickerR' : 'spGlTicker'} ${(copies[0].children.length * (config.tickerPace || 3)).toFixed(2)}s linear infinite`
                        : 'none';
                }
                return;
            }
            inner.style.transform = '';
            inner.style.transformOrigin = 'left top';
            const avail = node.clientHeight;
            if (!(avail > 0)) return;
            if (reflow && grids.length) {
                // Try every mix of "periods side by side" and "covers per row", keeping the one with the biggest covers once fitted.
                const sectionEls = [...inner.querySelectorAll(':scope > [data-gl-section]')];
                const width = node.clientWidth;
                const most = Math.max(1, Math.min(12, Math.max(...grids.map(grid => grid.children.length))));
                inner.style.display = 'grid';
                inner.style.columnGap = `${groupGap}px`;
                inner.style.alignItems = 'start';
                let best = null;
                const maxAcross = tiers ? 1 : (config.periodsAcross > 0 ? Math.min(config.periodsAcross, sectionEls.length) : sectionEls.length);
                const minAcross = config.periodsAcross > 0 && !tiers ? Math.min(config.periodsAcross, sectionEls.length) : 1;
                for (let across = minAcross; across <= maxAcross; across++) {
                    inner.style.gridTemplateColumns = `repeat(${across},minmax(0,1fr))`;
                    for (let columns = Math.min(minCols, most); columns <= most; columns++) {
                        grids.forEach(grid => grid.style.setProperty('--cols', columns));
                        const need = inner.offsetHeight;
                        const fit = need > avail ? avail / need : 1;
                        const cell = (width - (across - 1) * groupGap) / across;
                        const score = shrink || need <= avail ? ((cell - (columns - 1) * gap) / columns) * fit : fit * 0.0001;
                        if (!best || score > best.score * 1.02) best = { across, columns, score };
                    }
                }
                if (best) {
                    inner.style.gridTemplateColumns = `repeat(${best.across},minmax(0,1fr))`;
                    grids.forEach(grid => grid.style.setProperty('--cols', best.columns));
                }
            }
            const need = inner.offsetHeight;
            const factorH = shrink && need > avail ? avail / need : 1;
            const needW = inner.offsetWidth;
            const availW = node.clientWidth;
            const factorW = shrink && availW > 0 && needW > availW ? availW / needW : 1;
            const factor = Math.min(factorH, factorW);
            const free = Math.max(0, avail - need * factor);
            const dy = alignV === 'middle' ? free / 2 : alignV === 'bottom' ? free : 0;
            let dx = 0;
            if (alignH !== 'left') {
                // Align the visible content (covers and tight text bounds), not the stretched grid cells around it.
                const box = node.getBoundingClientRect();
                const zoom = node.offsetWidth ? box.width / node.offsetWidth : 1;
                let left = Infinity, right = -Infinity;
                const take = rect => { if (rect.width > 0) { left = Math.min(left, rect.left); right = Math.max(right, rect.right); } };
                inner.querySelectorAll('[data-gl-cover], img').forEach(el => take(el.getBoundingClientRect()));
                const range = document.createRange();
                const walker = document.createTreeWalker(inner, NodeFilter.SHOW_TEXT);
                while (walker.nextNode()) { if (walker.currentNode.textContent.trim()) { range.selectNodeContents(walker.currentNode); take(range.getBoundingClientRect()); } }
                if (right > left) {
                    const from = (left - box.left) / zoom * factor, to = (right - box.left) / zoom * factor;
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
    function extractGraphemes(str, max = 4) {
        const s = String(str || '').trim();
        if (!s) return '';
        if (typeof Intl !== 'undefined' && Intl.Segmenter) {
            const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
            const out = [];
            for (const part of seg.segment(s)) {
                out.push(part.segment);
                if (out.length >= max) break;
            }
            return out.join('');
        }
        return Array.from(s).slice(0, max).join('');
    }

    function renderIcon(node, value, style = {}) {
        node.replaceChildren();
        const cls = String(value || '').trim().replace(/^fab\b/, 'fa-brands').replace(/^fas\b/, 'fa-solid').replace(/^far\b/, 'fa-regular');
        if (!cls) return;
        const isFa = /^[a-z0-9 -]+$/i.test(cls) && /\bfa-[a-z0-9-]+/i.test(cls);
        if (isFa && !document.querySelector('link[data-fa]')) {
            const link = document.createElement('link');
            link.rel = 'stylesheet'; link.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css'; link.dataset.fa = '1';
            document.head.appendChild(link);
        }
        const icon = document.createElement(isFa ? 'i' : 'span');
        if (isFa) {
            icon.className = cls;
            icon.style.cssText = 'font-size:100cqh;line-height:1;display:block;flex:none;';
        } else {
            icon.textContent = extractGraphemes(cls, 4);
            icon.style.cssText = 'font-size:88cqh;line-height:1;display:block;flex:none;font-family:"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",system-ui,sans-serif;';
        }
        if (style.textStroke?.width > 0) {
            icon.style.webkitTextStroke = `${style.textStroke.width}px ${style.textStroke.color || '#000000'}`;
            icon.style.paintOrder = 'stroke fill';
        }
        if (style.textShadow?.blur > 0) {
            icon.style.filter = `drop-shadow(0 2px ${style.textShadow.blur}px ${style.textShadow.color || 'rgba(0,0,0,0.7)'})`;
        }
        node.style.overflow = 'visible';
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

    const ALERT_SAMPLE_IMAGE = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" fill="#8957e5"/><path d="M50 22l8.5 18 19.5 2.4-14.5 13.4 3.9 19.3L50 65l-17.4 10 3.9-19.3L22 42.4 41.500 40z" fill="#ffd166"/></svg>')}`;
    const ALERT_SAMPLE = { title: 'TestViewer just followed!', message: 'Thanks for the support', image: ALERT_SAMPLE_IMAGE, animOut: 'fade' };
    function alertSample(el) {
        const a = el?.alert || {};
        if (a.sampleImage) return { ...ALERT_SAMPLE, image: a.sampleImage };
        if (a.sampleEmoji) return { ...ALERT_SAMPLE, image: '', emoji: a.sampleEmoji };
        return ALERT_SAMPLE;
    }

    // Alert box: the element's fill/border/shadow move onto an inner card so they only show while an alert plays.
    const ALERT_DECORATION = [
        'background', 'backgroundColor', 'backgroundImage', 'backgroundSize', 'backgroundPosition', 'backgroundRepeat',
        'animation', 'border', 'borderColor', 'borderWidth', 'borderStyle', 'borderRadius', 'boxShadow', 'backdropFilter', 'webkitBackdropFilter'
    ];
    function prepareAlertNode(node, element) {
        const deco = {};
        const style = element?.style || {};

        if (style.background && style.background !== 'transparent') {
            deco.background = style.background;
            deco.backgroundColor = style.background;
        }
        if (style.borderWidth > 0 && style.borderColor && style.borderColor !== 'transparent') {
            deco.border = `${style.borderWidth}px solid ${style.borderColor}`;
            deco.borderColor = style.borderColor;
            deco.borderWidth = `${style.borderWidth}px`;
            deco.borderStyle = 'solid';
        }
        if (style.borderRadius) {
            deco.borderRadius = `${style.borderRadius}px`;
        }
        if (style.padding) {
            deco.padding = `${style.padding}px`;
        }
        if (style.blur > 0) {
            deco.backdropFilter = `blur(${style.blur}px)`;
            deco.webkitBackdropFilter = `blur(${style.blur}px)`;
        }
        if (style.shadow?.blur > 0) {
            deco.boxShadow = `0 4px ${style.shadow.blur}px ${style.shadow.color || 'rgba(0,0,0,.5)'}`;
        }
        if (style.gradient?.enabled) {
            Object.assign(deco, decorationStyle(style, 'alert'));
        }

        for (const key of ALERT_DECORATION) {
            // applyElementStyle zeroes the alert's own radius, which must not overwrite the card's radius
            if (node.style[key] && !(key === 'borderRadius' && deco.borderRadius)) deco[key] = node.style[key];
            node.style[key] = '';
        }
        if (node._borderRing) { node._borderRing.remove(); node._borderRing = null; }
        if (node._borderFxRing) { node._borderFxRing.remove(); node._borderFxRing = null; }
        if (node._innerGlowRing) { node._innerGlowRing.remove(); node._innerGlowRing = null; }
        if (node._borderObserver) { node._borderObserver.disconnect(); node._borderObserver = null; }
        node.style.border = '0';
        node.style.outline = 'none';
        node.style.background = 'transparent';
        node.style.backgroundColor = 'transparent';
        node.style.boxShadow = 'none';
        node.style.backdropFilter = 'none';
        node.style.webkitBackdropFilter = 'none';
        node.style.display = 'block';
        node._alertDeco = deco;
    }

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

    // Plays one alert inside `node`. Returns { stop } so a skip/clear can end it early.
    function spawnEmoteParticles(card, payload, node, boxScale = 1) {
        const effect = payload.emoteEffect;
        if (!effect || effect === 'showcase' || !['rain', 'party', 'fountain', 'bounce'].includes(effect)) return;
        const emoteUrl = payload.emojiUrl || (/^(https?:\/\/|\/|data:image\/)/i.test(payload.emoji) ? payload.emoji : '');
        const isFa = !emoteUrl && payload.emoji && (payload.emoji.startsWith('fa-') || payload.emoji.includes('fa-'));
        const rawEmoji = payload.emoji || '🎉';
        if (!emoteUrl && !isFa && !rawEmoji) return;

        const container = document.createElement('div');
        container.className = `alert-emote-particles effect-${effect}`;

        const density = Math.max(10, Math.min(80, Number(payload.emoteDensity) || 30));
        const scaleFactor = Math.max(0.4, Math.min(2.5, (Number(payload.emoteScale) || 100) / 100)) * boxScale;
        const durMs = Math.max(3000, Number(payload.durationMs) || 6000);

        for (let p = 0; p < density; p++) {
            const item = document.createElement('div');
            item.className = 'alert-emote-particle';

            const baseSize = 30 + Math.random() * 26;
            const size = Math.round(baseSize * scaleFactor);
            item.style.width = `${size}px`;
            item.style.height = `${size}px`;

            if (emoteUrl) {
                const img = document.createElement('img');
                img.src = emoteUrl;
                img.alt = '';
                img.draggable = false;
                item.appendChild(img);
            } else if (isFa) {
                const icon = document.createElement('i');
                icon.className = rawEmoji;
                icon.style.fontSize = `${size}px`;
                item.appendChild(icon);
            } else {
                const span = document.createElement('span');
                span.textContent = rawEmoji;
                span.style.fontSize = `${size}px`;
                span.style.lineHeight = '1';
                item.appendChild(span);
            }

            const rot1 = `${Math.round(-35 + Math.random() * 70)}deg`;
            const rot2 = `${Math.round(-55 + Math.random() * 110)}deg`;
            const rot3 = `${Math.round(-120 + Math.random() * 240)}deg`;
            item.style.setProperty('--rot1', rot1);
            item.style.setProperty('--rot2', rot2);
            item.style.setProperty('--rot3', rot3);

            if (effect === 'rain') {
                const left = (2 + Math.random() * 94).toFixed(1);
                const animDur = (1.4 + Math.random() * 1.6).toFixed(2);
                const delay = (Math.random() * (durMs > 5000 ? 3.5 : 2)).toFixed(2);
                const drift = Math.round(-30 + Math.random() * 60);
                item.style.left = `${left}%`;
                item.style.top = '0';
                item.style.setProperty('--drift', `${drift}px`);
                item.style.setProperty('--rot', rot2);
                item.style.animation = `alert-rain-fall ${animDur}s cubic-bezier(0.25, 0.46, 0.45, 0.94) ${delay}s infinite`;
            } else if (effect === 'party') {
                const angle = Math.random() * 2 * Math.PI;
                const distance = 90 + Math.random() * 280;
                const vx = Math.round(Math.cos(angle) * distance);
                const vy = Math.round(Math.sin(angle) * distance);
                const animDur = (1.6 + Math.random() * 1.3).toFixed(2);
                const delay = (Math.random() * 2.5).toFixed(2);
                item.style.left = '50%';
                item.style.top = '50%';
                item.style.setProperty('--vx', `${vx}px`);
                item.style.setProperty('--vy', `${vy}px`);
                item.style.animation = `alert-party-burst ${animDur}s cubic-bezier(0.18, 0.89, 0.32, 1.28) ${delay}s infinite`;
            } else if (effect === 'fountain') {
                const left = (44 + Math.random() * 12).toFixed(1);
                const fx = Math.round(-180 + Math.random() * 360);
                const fy = Math.round(160 + Math.random() * 220);
                const animDur = (1.8 + Math.random() * 1.2).toFixed(2);
                const delay = (Math.random() * 2.8).toFixed(2);
                item.style.left = `${left}%`;
                item.style.top = '95%';
                item.style.setProperty('--fx', `${fx}px`);
                item.style.setProperty('--fy', `${fy}px`);
                item.style.animation = `alert-fountain-spray ${animDur}s cubic-bezier(0.15, 0.85, 0.35, 1.2) ${delay}s infinite`;
            } else if (effect === 'bounce') {
                const left = (5 + Math.random() * 90).toFixed(1);
                const top = (20 + Math.random() * 60).toFixed(1);
                const animDur = (2.0 + Math.random() * 1.5).toFixed(2);
                const delay = (Math.random() * 2.0).toFixed(2);
                item.style.left = `${left}%`;
                item.style.top = `${top}%`;
                item.style.animation = `alert-bounce-float ${animDur}s ease-in-out ${delay}s infinite`;
            }

            container.appendChild(item);
        }
        card.appendChild(container);
    }

    const ALERT_PRESENTATION_KEYS = ['layout', 'hideText', 'hideMessage', 'effectsTarget', 'mediaFit',
        'mediaFocusX', 'mediaFocusY', 'padding', 'mediaScale', 'titleSize', 'messageSize', 'titleColor', 'gap'];

    function resolveAlertLook(element, { ruleId, lookId } = {}) {
        const base = element.alert || {};
        const look = (base.looks || []).find(l => lookId ? l.id === lookId : ruleId && (l.ruleIds || []).includes(ruleId));
        if (!look) return element;
        const presentation = look.alert || Object.fromEntries(ALERT_PRESENTATION_KEYS.filter(k => k in look).map(k => [k, look[k]]));
        return {
            ...element,
            alert: { ...base, ...Object.fromEntries(ALERT_PRESENTATION_KEYS.filter(k => k in presentation).map(k => [k, presentation[k]])) },
            style: { ...element.style, ...look.style, rotate: element.style?.rotate || 0 },
            mediaFilter: look.mediaFilter || element.mediaFilter
        };
    }

    function playAlert(node, element, payload, { sound = true, onEnd, lookId } = {}) {
        const baseElement = element;
        element = resolveAlertLook(element, { ruleId: payload.ruleId, lookId });
        const cfg = element.alert || {};
        const style = element.style || {};
        const layout = payload.image || payload.video || payload.emoji ? (cfg.layout || 'stack') : 'text';
        const card = document.createElement('div');
        card.className = `alert-card layout-${layout}`;
        
        const deco = element === baseElement ? Object.assign({}, node._alertDeco || {}) : {};
        if (!deco.background && !deco.backgroundColor && style.background && style.background !== 'transparent') {
            deco.background = style.background;
            deco.backgroundColor = style.background;
        }
        if (!deco.borderRadius && style.borderRadius) {
            deco.borderRadius = `${style.borderRadius}px`;
        }
        if (!deco.border && style.borderWidth > 0 && style.borderColor && style.borderColor !== 'transparent') {
            deco.border = `${style.borderWidth}px ${style.borderStyle || 'solid'} ${style.borderColor}`;
        }
        if (!deco.boxShadow && style.shadow?.blur > 0) {
            deco.boxShadow = `0 4px ${style.shadow.blur}px ${style.shadow.color || 'rgba(0,0,0,.5)'}`;
        }
        if (!deco.backdropFilter && style.blur > 0) {
            deco.backdropFilter = `blur(${style.blur}px)`;
            deco.webkitBackdropFilter = `blur(${style.blur}px)`;
        }
        if (style.gradient?.enabled) {
            Object.assign(deco, decorationStyle(style, 'alert'));
        }

        Object.assign(card.style, deco);
        node.style.opacity = '1';
        card.style.opacity = style.opacity ?? 1;
        node._alertPresentation = element;
        loadGoogleFont(style.fontFamily);
        applyBorderEffects(card, style, element);
        card.style.gap = `${cfg.gap ?? 12}px`;
        const customPad = cfg.padding === null || cfg.padding === undefined || cfg.padding === '' ? NaN : Number(cfg.padding);
        card.style.padding = `${Number.isFinite(customPad) ? Math.max(0, Math.min(200, customPad)) : (style.padding || 8)}px`;
        let mediaFxWrap = null;
        const hasMedia = layout !== 'text' && (payload.video || payload.image || payload.emoji);
        if (hasMedia) {
            const isEmoji = !payload.video && !payload.image;
            const media = document.createElement(isEmoji ? 'div' : payload.video ? 'video' : 'img');
            const scale = Math.max(10, Math.min(100, Number(cfg.mediaScale) || 60));
            const focusPos = v => Number.isFinite(Number(v)) && v !== null && v !== '' ? Math.max(0, Math.min(100, Number(v))) : 50;
            const hasPayloadFocus = payload.focusX !== undefined && (payload.focusX !== 50 || payload.focusY !== 50);
            const fitMode = hasPayloadFocus ? 'cover' : (cfg.mediaFit || 'contain');
            const focusPosition = hasPayloadFocus ? `${focusPos(payload.focusX)}% ${focusPos(payload.focusY)}%` : `${focusPos(cfg.mediaFocusX)}% ${focusPos(cfg.mediaFocusY)}%`;
            if (isEmoji) {
                const emoteUrl = payload.emojiUrl || (/^(https?:\/\/|\/|data:image\/)/i.test(payload.emoji) ? payload.emoji : '');
                const isFa = !emoteUrl && payload.emoji && (payload.emoji.startsWith('fa-') || payload.emoji.includes('fa-'));
                const emoteScale = Math.max(20, Math.min(300, Number(payload.emoteScale) || 100)) / 100;
                const count = Math.max(1, Math.min(25, Number(payload.emojiRepeat || 1)));

                if (emoteUrl) {
                    media.style.display = 'inline-flex';
                    media.style.alignItems = 'center';
                    media.style.justifyContent = 'center';
                    media.style.gap = '8px';
                    for (let c = 0; c < count; c++) {
                        const img = document.createElement('img');
                        img.className = 'alert-emote-img';
                        img.src = emoteUrl;
                        img.alt = '';
                        img.draggable = false;
                        img.style.height = '100%';
                        img.style.width = 'auto';
                        img.style.maxHeight = '100%';
                        media.appendChild(img);
                    }
                } else if (isFa) {
                    if (!document.querySelector('link[data-fa]')) {
                        const link = document.createElement('link');
                        link.rel = 'stylesheet'; link.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css'; link.dataset.fa = '1';
                        document.head.appendChild(link);
                    }
                    const icon = document.createElement('i');
                    icon.className = payload.emoji;
                    media.appendChild(icon);
                } else {
                    media.textContent = payload.emoji;
                }
                const clientH = node.clientHeight || 240;
                const clientW = node.clientWidth || 400;
                const boxH = clientH * (layout === 'media' ? 1 : scale / 100);
                const boxW = clientW * (layout === 'side' ? 0.5 : 1) * 0.9;
                const targetH = layout === 'media' ? Math.max(32, Math.min(clientH * 0.9 * emoteScale, clientH * 0.95)) : Math.max(48, Math.min(boxH * 0.9, clientH * 0.85)) * emoteScale;
                media.style.fontSize = `${Math.max(28, Math.min(targetH, boxW / (count * 1.05)))}px`;
                media.style.height = `${Math.round(targetH)}px`;
                media.style.lineHeight = '1';
                media.style.whiteSpace = 'nowrap';
            } else {
                media.src = payload.video || payload.image;
                if (payload.video) {
                    const videoHasAudio = (cfg.videoSound === true || payload.videoSound === true) && sound;
                    media.autoplay = true;
                    media.loop = (cfg.videoLoop !== false && payload.videoLoop !== false);
                    media.muted = !videoHasAudio;
                    if (videoHasAudio) {
                        media.volume = Math.max(0, Math.min(1, (Number(cfg.videoVolume ?? payload.videoVolume ?? payload.volume ?? 100)) / 100));
                        const playPromise = media.play();
                        if (playPromise && playPromise.catch) {
                            playPromise.catch(() => {
                                media.muted = true;
                                media.play().catch(() => {});
                            });
                        }
                    }
                    media.playsInline = true;
                }
                media.draggable = false;
                media.style.objectFit = fitMode;
                if (fitMode === 'cover') media.style.objectPosition = focusPosition;
            }
            media.className = isEmoji ? 'alert-media is-emote' : 'alert-media';
            if (!isEmoji) {
                if (layout === 'side') { media.style.width = `${scale}%`; media.style.maxWidth = '50%'; media.style.height = '100%'; }
                else if (layout === 'media') { media.style.width = '100%'; media.style.height = '100%'; }
                else { media.style.height = `${scale}%`; media.style.maxWidth = '100%'; if (hasPayloadFocus) media.style.width = '100%'; }
            } else if (layout === 'media') {
                media.style.position = 'absolute'; media.style.inset = '0'; media.style.display = 'flex'; media.style.alignItems = 'center'; media.style.justifyContent = 'center';
            } else if (layout === 'side') {
                media.style.width = `${scale}%`; media.style.maxWidth = '50%';
            } else {
                media.style.maxWidth = '100%';
            }
            if (cfg.effectsTarget === 'media') {
                const wrap = document.createElement('div');
                wrap.className = media.className;
                wrap.style.cssText = media.style.cssText;
                wrap.style.position = wrap.style.position || 'relative';
                if (!isEmoji) {
                    wrap.style.display = 'flex';
                    wrap.style.width = layout === 'stack' && !hasPayloadFocus ? '' : wrap.style.width;
                    media.className = 'alert-media-el';
                    media.style.cssText = `height:100%;width:${layout === 'stack' && !hasPayloadFocus ? 'auto' : '100%'};max-width:100%;object-fit:${fitMode};object-position:${fitMode === 'cover' ? focusPosition : '50% 50%'}`;
                    wrap.appendChild(media);
                    wrap.style.maxWidth = layout === 'side' ? '50%' : '100%';
                    mediaFxWrap = wrap;
                } else {
                    mediaFxWrap = wrap;
                    wrap.append(...media.childNodes);
                }
                card.appendChild(wrap);
            } else card.appendChild(media);
        }
        const hideText = cfg.hideText === true;
        if (!hideText && (layout !== 'media' || payload.title || payload.message)) {
            const text = document.createElement('div');
            text.className = 'alert-text';
            text.style.color = style.color || '#fff';
            text.style.fontFamily = style.fontFamily || 'sans-serif';
            text.style.fontWeight = style.fontWeight || '400';
            if (style.lineHeight) text.style.lineHeight = style.lineHeight;
            if (style.letterSpacing !== undefined && style.letterSpacing !== '') text.style.letterSpacing = `${style.letterSpacing}px`;
            Object.assign(text.style, textEffectStyle(style, 'alert'));
            
            const textAlign = style.textAlign || (layout === 'side' ? 'left' : 'center');
            text.style.textAlign = textAlign;
            text.style.alignItems = textAlign === 'left' ? 'flex-start' : textAlign === 'right' ? 'flex-end' : 'center';

            if (layout === 'media') {
                const vAlign = style.verticalAlign || 'bottom';
                const pad = Number.isFinite(customPad) ? Math.max(0, Math.min(200, customPad)) : (style.padding ?? 16);
                text.style.paddingLeft = `${Math.max(16, pad)}px`;
                text.style.paddingRight = `${Math.max(16, pad)}px`;
                if (vAlign === 'top') {
                    text.style.top = `${pad}px`;
                    text.style.bottom = 'auto';
                    text.style.transform = 'none';
                } else if (vAlign === 'middle') {
                    text.style.top = '50%';
                    text.style.bottom = 'auto';
                    text.style.transform = 'translateY(-50%)';
                } else {
                    text.style.bottom = `${pad}px`;
                    text.style.top = 'auto';
                    text.style.transform = 'none';
                }
            } else if (layout === 'stack' || layout === 'text') {
                const vAlign = style.verticalAlign || 'middle';
                card.style.justifyContent = vAlign === 'top' ? 'flex-start' : vAlign === 'bottom' ? 'flex-end' : 'center';
                if (textAlign === 'left') card.style.alignItems = 'flex-start';
                else if (textAlign === 'right') card.style.alignItems = 'flex-end';
                else card.style.alignItems = 'center';
            } else if (layout === 'side') {
                const vAlign = style.verticalAlign || 'middle';
                card.style.alignItems = vAlign === 'top' ? 'flex-start' : vAlign === 'bottom' ? 'flex-end' : 'center';
                card.style.justifyContent = textAlign === 'left' ? 'flex-start' : textAlign === 'right' ? 'flex-end' : 'center';
            }

            if (payload.title) {
                const title = document.createElement('div');
                title.className = 'alert-title';
                title.textContent = payload.title;
                title.style.fontSize = `${cfg.titleSize || 44}px`;
                title.style.color = cfg.titleColor || '#ffd166';
                title.style.fontWeight = style.fontWeight || '700';
                title.style.textAlign = textAlign;
                text.appendChild(title);
            }
            if (payload.message && cfg.hideMessage !== true) {
                const message = document.createElement('div');
                message.className = 'alert-message';
                message.textContent = payload.message;
                message.style.fontSize = `${cfg.messageSize || 28}px`;
                message.style.fontWeight = style.fontWeight || '400';
                message.style.textAlign = textAlign;
                text.appendChild(message);
            }
            card.appendChild(text);
        }
        if (payload.emoteEffect && payload.emoteEffect !== 'showcase') {
            const fillBox = layout === 'media';
            const boxScale = fillBox ? Math.max(0.6, Math.min(2.5, Math.min(node.clientWidth || 400, node.clientHeight || 240) / 200)) : 1;
            spawnEmoteParticles(fillBox && mediaFxWrap ? mediaFxWrap : card, payload, node, boxScale);
        }
        node.replaceChildren(card);
        if (mediaFxWrap && cfg.effectsTarget === 'media') {
            const fxEl = { id: `${element.id}-alert-media`, type: mediaFxWrap.querySelector('.alert-media-el') ? 'image' : 'text', width: node.clientWidth || element.width, height: node.clientHeight || element.height, mediaFilter: element.mediaFilter, style: {} };
            applyMediaFilter(mediaFxWrap, fxEl);
        }
        applyMediaFilter(node, element);
        card.classList.add(`alert-in-${payload.animIn || 'pop'}`);
        // An inline decoration animation (animated gradient) overrides the entrance class, so run both
        const decoAnim = card.style.animation;
        if (decoAnim && payload.animIn !== 'none') {
            card.style.animation = '';
            const entrance = getComputedStyle(card).animation;
            if (entrance && !entrance.startsWith('none')) {
                card.style.animation = `${entrance}, ${decoAnim}`;
                card.addEventListener('animationend', e => { if (e.target === card && /^alert-.*-in$/.test(e.animationName)) card.style.animation = decoAnim; }, { once: true });
            } else card.style.animation = decoAnim;
        }
        // Fixed px font sizes overflow small alert boxes and get clipped; shrink text to fit the card
        const fitTextBlock = () => {
            const text = card.querySelector('.alert-text');
            if (!text || layout === 'media') return;
            const cs = getComputedStyle(card);
            const availH = card.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
            const media = card.querySelector('.alert-media');
            const mediaH = layout === 'stack' && media ? media.offsetHeight + (parseFloat(cs.rowGap) || 0) : 0;
            const room = availH - mediaH;
            if (room <= 0 || text.scrollHeight <= room) return;
            const k = Math.max(0.4, room / text.scrollHeight);
            text.querySelectorAll('.alert-title, .alert-message').forEach(el => { el.style.fontSize = `${Math.max(10, parseFloat(el.style.fontSize) * k)}px`; });
        };
        fitTextBlock();

        let audio = null;
        if (sound && cfg.sound !== false && payload.sound) {
            const volume = Math.max(0, Math.min(1, (Number(payload.volume) || 70) / 100));
            audio = playSoundValue(payload.sound, volume);
        }
        const fadeMs = 500;
        let finished = false;
        const finish = () => {
            if (finished) return;
            finished = true;
            clearTimeout(outTimer); clearTimeout(endTimer);
            if (audio) audio.pause();
            if (mediaFxWrap && root.OverlayFilters?.cleanupFilters) root.OverlayFilters.cleanupFilters(mediaFxWrap);
            cleanupNode(card);
            if (card.parentNode === node) node.replaceChildren();
            if (onEnd) onEnd();
        };
        const outTimer = setTimeout(() => {
            const out = payload.animOut || 'fade';
            card.className = `alert-card layout-${layout}${out === 'none' ? '' : ` alert-out-${out}`}`;
            if (out !== 'none') card.style.animation = '';
        }, Math.max(0, (payload.durationMs || 6000) - fadeMs));
        const endTimer = setTimeout(finish, payload.durationMs || 6000);
        return { stop: finish };
    }

    function cleanupMedia(rootNode) {
        if (!rootNode) return;
        const unloadVideo = v => {
            try {
                v.pause();
                v.removeAttribute('src');
                v.load();
            } catch {}
        };
        const unloadFrame = f => {
            try { f.src = 'about:blank'; } catch {}
        };
        const unloadCanvas = c => {
            try { c.width = 0; c.height = 0; } catch {}
        };
        if (rootNode.tagName === 'VIDEO') unloadVideo(rootNode);
        else if (rootNode.tagName === 'IFRAME') unloadFrame(rootNode);
        else if (rootNode.tagName === 'CANVAS') unloadCanvas(rootNode);
        if (rootNode._patternHandle?.stop) { try { rootNode._patternHandle.stop(); } catch {} rootNode._patternHandle = null; }
        if (typeof rootNode.querySelectorAll === 'function') {
            rootNode.querySelectorAll('video').forEach(unloadVideo);
            rootNode.querySelectorAll('iframe').forEach(unloadFrame);
            rootNode.querySelectorAll('canvas.sp-pattern-canvas').forEach(unloadCanvas);
        }
    }

    function cleanupNode(node) {
        if (!node) return;
        if (node._alertHandle) {
            const handle = node._alertHandle;
            node._alertHandle = null;
            handle.stop();
        }
        cleanupMedia(node);
        if (node._borderObserver) { node._borderObserver.disconnect(); node._borderObserver = null; }
        if (node._fitObserver) { node._fitObserver.disconnect(); node._fitObserver = null; }
        if (node._speakerFitFrame) { root.cancelAnimationFrame(node._speakerFitFrame); node._speakerFitFrame = 0; }
        if (node._slideshow?.stop) { try { node._slideshow.stop(); } catch {} node._slideshow = null; }
        if (node._slideHandle?.stop) { try { node._slideHandle.stop(); } catch {} node._slideHandle = null; }
        if (node._patternHandle?.stop) { try { node._patternHandle.stop(); } catch {} node._patternHandle = null; }
        if (root.OverlayFilters?.cleanupFilters) {
            root.OverlayFilters.cleanupFilters(node);
        }
        if (node._fxCanvas) {
            node._fxCanvas.remove();
            node._fxCanvas = null;
        }
        if (node._htWrap) {
            node._htWrap.remove();
            node._htWrap = null;
        }
        if (node._fxId) {
            document.getElementById(node._fxId)?.remove();
            node._fxId = null;
        }
        if (typeof node.querySelectorAll === 'function') {
            node.querySelectorAll('.alert-card').forEach(c => {
                if (c._borderObserver) { c._borderObserver.disconnect(); c._borderObserver = null; }
            });
            node.querySelectorAll('.sp-fx-canvas').forEach(c => c.remove());
            node.querySelectorAll('.sp-ht-wrap').forEach(w => w.remove());
            node.querySelectorAll('[data-element-id]').forEach(el => {
                if (el._fxId) {
                    document.getElementById(el._fxId)?.remove();
                    el._fxId = null;
                }
            });
        }
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
            let entry = textSources.get(key);
            if (!entry) {
                entry = { state: null };
                textSources.set(key, entry);
            }
            const next = await loadTextSource(key);
            if (textSources.get(key) !== entry) return;
            const prev = entry.state;
            if (!prev || prev.text !== next.text || prev.error !== next.error) changed = true;
            entry.state = next;
        }));
        return changed;
    }
    const textSourceState = el => textSources.get(textSourceKey(el))?.state || null;
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
        const textKey = probeText != null ? probeText : (node._textNode ? node._textNode.nodeValue : node.textContent);
        const fitKey = `${el.width}x${el.height}|${mode}|${base}|${el.style?.fontFamily}|${el.columns || 1}|${el.style?.padding || 0}|${textKey}`;
        if (node._fitKey === fitKey && node._fittedFontSize) {
            node.style.fontSize = `${node._fittedFontSize}px`;
            return;
        }

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
        let chosen = base;
        if (!fits(hi)) {
            while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (fits(mid)) lo = mid; else hi = mid; }
            chosen = lo;
            node.style.fontSize = `${lo}px`;
        } else {
            chosen = hi;
            node.style.fontSize = `${hi}px`;
        }
        node._fitKey = fitKey;
        node._fittedFontSize = chosen;
        node.style.display = saved.display;
        if (saved.children) node.replaceChildren(...saved.children);
    }

    // ---- slideshow ----------------------------------------------------------------------------
    const slideshowCache = new Map();
    const mediaKind = name => (/\.(mp4|webm|ogg)$/i.test(name) ? 'video' : /\.(png|jpe?g|gif|webp|svg)$/i.test(name) ? 'image' : 'other');
    function slideshowSourceKey(config = {}) {
        if (config.source === 'manual') {
            if (!(config.files || []).length) return '';
            return `/api/asset-library?kinds=${config.kinds || 'image'}&names=${encodeURIComponent((config.files || []).join('\n'))}`;
        }
        if (!(config.tags || []).length) return '';
        return `/api/asset-library?tags=${encodeURIComponent(config.tags.join(','))}&mode=${config.tagMode || 'any'}&kinds=${config.kinds || 'image'}`;
    }

    // Reconcile against the whole model, not just the visible page or a single inspector selection.
    function pruneSourceCaches(elements) {
        const textKeys = new Set((elements || []).map(textSourceKey).filter(Boolean));
        const slideKeys = new Set((elements || []).filter(el => el.type === 'slideshow').map(el => slideshowSourceKey(el.slideshow)).filter(Boolean));
        for (const key of textSources.keys()) if (!textKeys.has(key)) textSources.delete(key);
        for (const key of slideshowCache.keys()) if (!slideKeys.has(key)) slideshowCache.delete(key);
    }

    async function slideshowItems(config) {
        const url = slideshowSourceKey(config);
        if (!url) return [];
        let entry = slideshowCache.get(url);
        if (!entry) {
            entry = { at: 0, items: [] };
            slideshowCache.set(url, entry);
        }
        if (entry.at && Date.now() - entry.at < 8000) return entry.items;
        try {
            const response = await fetch(url, { cache: 'no-store' });
            const items = response.ok ? await response.json() : [];
            if (slideshowCache.get(url) === entry) {
                entry.at = Date.now();
                entry.items = items;
            }
            return items;
        } catch { return entry.items; }
    }

    // Plays a slideshow inside `node`. With { preview: true } it only shows the first slide. Returns { stop() }.
    function mountSlideshow(node, element, options = {}) {
        const config = element.slideshow || {};
        const frozen = options.preview && !options.animate;
        let paused = options.initialState?.paused ?? config.advance === 'manual';
        let items = [], order = [], position = -1, timer = null, refreshTimer = null, stopped = false, current = null, token = 0;
        const pending = new Set(), transitions = new Set();
        cleanupMedia(node);
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
            layer.style.cssText = 'position:absolute;inset:0;overflow:hidden;';
            const media = document.createElement(item.kind === 'video' ? 'video' : 'img');
            media.style.cssText = `position:absolute;inset:0;width:100%;height:100%;object-fit:${config.fit === 'contain' ? 'contain' : 'cover'};`;
            if (item.kind === 'video') { media.muted = true; media.playsInline = true; media.autoplay = true; }
            else media.decoding = 'async';
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
                if (media.tagName !== 'VIDEO' && media.complete && media.naturalWidth) return resolve(true);
                const evt = media.tagName === 'VIDEO' ? 'loadeddata' : 'load';
                const finish = success => {
                    media.removeEventListener(evt, loaded);
                    media.removeEventListener('error', failed);
                    pending.delete(cancel);
                    resolve(success);
                };
                const loaded = () => finish(true), failed = () => finish(false);
                const cancel = () => { cleanupMedia(media); finish(false); };
                pending.add(cancel);
                media.addEventListener(evt, loaded);
                media.addEventListener('error', failed);
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
                cleanupMedia(candidate.layer);
                if (stopped || mine !== token) return;
            }
            if (!slide || stopped || mine !== token) {
                if (slide) cleanupMedia(slide.layer);
                return schedule(config.seconds * 1000);
            }
            const old = current;
            current = slide;
            emitState();
            stage.appendChild(slide.layer);
            const ms = frozen || !old ? 0 : config.transitionMs;
            const easing = config.easing || 'ease';
            if (ms && config.transition === 'fade') {
                slide.layer.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ms, easing, fill: 'both' });
                old.layer.animate([{ opacity: 1 }, { opacity: 0 }], { duration: ms, easing, fill: 'both' });
            } else if (ms && config.transition === 'slide') {
                const [x, y] = transitionVectors();
                slide.layer.animate([{ transform: `translate(${x}px,${y}px)` }, { transform: 'translate(0,0)' }], { duration: ms, easing, fill: 'both' });
                old.layer.animate([{ transform: 'translate(0,0)' }, { transform: `translate(${-x}px,${-y}px)` }], { duration: ms, easing, fill: 'both' });
            }
            if (config.kenBurns && item.kind === 'image' && !frozen) {
                const grow = Math.random() < 0.5;
                slide.media.animate([{ transform: `scale(${grow ? 1 : 1.08})` }, { transform: `scale(${grow ? 1.08 : 1})` }], { duration: config.seconds * 1000 + ms, easing: 'linear', fill: 'both' });
            }
            if (old) {
                const timer = setTimeout(() => {
                    transitions.delete(timer);
                    cleanupMedia(old.layer); old.layer.remove();
                }, ms + 60);
                transitions.add(timer);
            }
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
            if (first && options.initialState?.item) {
                const index = items.findIndex(item => item.name === options.initialState.item);
                if (index >= 0) position = order.indexOf(index) - 1;
            }
            if (!items.length) {
                clearTimeout(timer);
                cleanupMedia(stage);
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
        return {
            stop() {
                stopped = true;
                ++token;
                clearTimeout(timer); clearInterval(refreshTimer);
                transitions.forEach(clearTimeout); transitions.clear();
                for (const cancel of pending) cancel();
                stage.getAnimations({ subtree: true }).forEach(animation => animation.cancel());
                cleanupMedia(stage);
            },
            snapshot: () => ({ paused, item: items[order[position]]?.name }),
            count: () => items.length,
            control
        };
    }

    // ---- pattern tile (repeating mosaic & kaleidoscope motion graphics) ------------------------
    function drawSamplePatternStamp(ctx, sw, sh = sw) {
        ctx.clearRect(0, 0, sw, sh);
        ctx.save();
        ctx.translate(sw / 2, sh / 2);
        const r = Math.min(sw, sh) * 0.42;
        const grad = ctx.createLinearGradient(-r, -r, r, r);
        grad.addColorStop(0, 'rgba(88, 166, 255, 0.92)');
        grad.addColorStop(0.5, 'rgba(163, 113, 247, 0.92)');
        grad.addColorStop(1, 'rgba(247, 120, 186, 0.92)');
        // Outer 4-point star / diamond motif
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
            const ang = (i * Math.PI) / 4 - Math.PI / 2;
            const rad = i % 2 === 0 ? r : r * 0.36;
            const x = Math.cos(ang) * rad;
            const y = Math.sin(ang) * rad;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.lineWidth = Math.max(1.5, Math.min(sw, sh) * 0.025);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
        ctx.stroke();
        // Asymmetric corner accent so rotation/flip/kaleidoscope are clearly visible
        ctx.beginPath();
        ctx.arc(r * 0.45, -r * 0.45, r * 0.14, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(56, 189, 248, 0.95)';
        ctx.fill();
        // Inner ring
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.18, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.stroke();
        ctx.restore();
    }

    const faGlyphCache = new Map();

    function mountPattern(node, element, options = {}) {
        if (node._patternHandle && !node._patternHandle.isStopped?.() && node._patternHandle.update && node.querySelector(':scope > .sp-pattern-wrap')) {
            node._patternHandle.update(element, options);
            return node._patternHandle;
        }
        if (node._patternHandle?.stop) {
            try { node._patternHandle.stop(); } catch {}
            node._patternHandle = null;
        }

        const wrap = document.createElement('div');
        wrap.className = 'sp-pattern-wrap';
        wrap.style.cssText = 'position:absolute;inset:0;overflow:hidden;pointer-events:none;border-radius:inherit;contain:strict;';
        const canvas = document.createElement('canvas');
        canvas.className = 'sp-pattern-canvas';
        canvas.style.cssText = 'width:100%;height:100%;display:block;will-change:contents;';
        wrap.appendChild(canvas);

        const note = document.createElement('div');
        note.style.cssText = 'position:absolute;left:10px;right:10px;bottom:8px;padding:4px 10px;border-radius:6px;background:rgba(13,17,23,0.78);border:1px solid rgba(255,255,255,0.12);color:rgba(255,255,255,0.82);font:500 11px/1.35 system-ui,sans-serif;text-align:center;pointer-events:none;display:none;';
        node.replaceChildren(wrap, note);

        const ctx = canvas.getContext('2d', { alpha: true });
        const stampCanvas = document.createElement('canvas');
        const stampCtx = stampCanvas.getContext('2d');
        let cellCanvas = null;
        let cellCtx = null;

        let stopped = false;
        let rafId = 0;
        let readyToDraw = false;
        let startTime = 0;

        let curElement = element;
        let curOptions = options;
        let layout = 'brick', aspectRatio = '1:1', tileSize = 96, gap = 16, offsetX = 50, offsetY = 0;
        let gridAngleRad = 0, cosG = 1, sinG = 0, tileAngleDeg = 0, tileAngleRad = 0;
        let alternateFlip = 'tilt', tileOpacity = 1, altOpacity = 0.4, altScale = 1;
        let blendMode = 'normal', sourceType = 'image', wedges = 6, feather = 0;
        let motion = 'scroll', trackMode = 'uniform', scrollAngleRad = 0;
        let speed = 12, spinSpeed = 8, spinDirection = 'cw', waveAmount = 0.25;
        let hueShift = 'none', hueSpeed = 12, hueJitter = 0;
        let brightnessJitter = 0, saturationJitter = 0;
        let scaleJitter = 0, rotationJitter = 0, positionJitter = 0;
        let twinkle = 0, twinkleSpeed = 4;
        let dpr = 1, stampW = 96, stampH = 96, isKaleido = false;
        let lastStampKey = '';
        let lastImgSrc = '';
        let cachedImg = null;
        let lastFeather = -1;
        const iconHueCache = new Map();

        function parseColorHex(c) {
            if (!c || c === 'transparent') return { r: 255, g: 255, b: 255 };
            if (c.startsWith('#')) {
                let hex = c.slice(1);
                if (hex.length === 3) hex = hex.split('').map(x => x + x).join('');
                const num = parseInt(hex, 16);
                if (!Number.isNaN(num)) return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
            }
            return { r: 255, g: 255, b: 255 };
        }

        function rgbToHsl(r, g, b) {
            r /= 255; g /= 255; b /= 255;
            const max = Math.max(r, g, b), min = Math.min(r, g, b);
            let h = 0, s = 0, l = (max + min) / 2;
            if (max !== min) {
                const d = max - min;
                s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
                switch (max) {
                    case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                    case g: h = (b - r) / d + 2; break;
                    case b: h = (r - g) / d + 4; break;
                }
                h /= 6;
            }
            return { h: Math.round(h * 360), s, l };
        }

        function getTileDimensions() {
            let ar = 1;
            if (aspectRatio === 'natural' && cachedImg && cachedImg.naturalWidth && cachedImg.naturalHeight) {
                ar = cachedImg.naturalWidth / cachedImg.naturalHeight;
            } else {
                const AR_MAP = {
                    '1:1': 1, '16:9': 16 / 9, '4:3': 4 / 3, '3:2': 1.5, '2:1': 2,
                    '3:4': 0.75, '9:16': 9 / 16
                };
                ar = AR_MAP[aspectRatio] || 1;
            }
            ar = Math.max(0.1, Math.min(10, ar));
            const tileW = tileSize;
            const tileH = Math.max(8, Math.round(tileSize / ar));
            return { tileW, tileH, ar };
        }

        function cellHash(r, c, seed = 0) {
            let h = (r * 374761393 + c * 668265263 + seed * 1274126177) ^ 0x5bf03635;
            h = Math.imul(h ^ (h >>> 13), 1274126177);
            return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
        }

        function buildStampFromImage(img) {
            const iw = img.naturalWidth || img.width || stampW;
            const ih = img.naturalHeight || img.height || stampH;
            stampCtx.clearRect(0, 0, stampW, stampH);
            const fit = curElement.style?.objectFit || 'contain';
            const fx = (curElement.style?.focusX ?? 50) / 100;
            const fy = (curElement.style?.focusY ?? 50) / 100;
            if (fit === 'fill') {
                stampCtx.drawImage(img, 0, 0, stampW, stampH);
            } else {
                const scale = fit === 'cover' ? Math.max(stampW / iw, stampH / ih) : Math.min(stampW / iw, stampH / ih);
                const dw = iw * scale;
                const dh = ih * scale;
                const dx = (stampW - dw) * fx;
                const dy = (stampH - dh) * fy;
                stampCtx.drawImage(img, dx, dy, dw, dh);
            }
        }

        function buildStampFromIcon(cls) {
            const isFa = /^[a-z0-9 -]+$/i.test(cls) && /\bfa-[a-z0-9-]+/i.test(cls);
            let glyph = '';
            let fontFamily = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", system-ui, sans-serif';
            let fontWeight = '400';

            if (isFa) {
                const cached = faGlyphCache.get(cls);
                if (cached) {
                    ({ glyph, fontFamily, fontWeight } = cached);
                } else {
                    const probe = document.createElement('i');
                    probe.className = cls;
                    probe.style.cssText = 'position:fixed;left:-9999px;top:-9999px;visibility:hidden;pointer-events:none;';
                    document.body.appendChild(probe);
                    const beforeStyle = getComputedStyle(probe, '::before');
                    const elemStyle = getComputedStyle(probe);
                    const rawContent = beforeStyle.content;
                    fontFamily = beforeStyle.fontFamily || elemStyle.fontFamily || '"Font Awesome 6 Free", "Font Awesome 6 Brands", sans-serif';
                    fontWeight = beforeStyle.fontWeight || elemStyle.fontWeight || (cls.includes('fa-brands') ? '400' : '900');
                    probe.remove();

                    if (rawContent && rawContent !== 'none' && rawContent !== 'normal') {
                        glyph = rawContent.replace(/^["']|["']$/g, '');
                    }
                    if (glyph) faGlyphCache.set(cls, { glyph, fontFamily, fontWeight });
                }
            } else if (cls) {
                glyph = extractGraphemes(cls, 4);
            }
            if (!glyph) return { glyph: '', fontFamily, fontWeight, isFa };

            const s = curElement.style || {};
            const strokeW = Number(s.textStroke?.width) || 0;
            const shadowBlur = Number(s.textShadow?.blur) || 0;
            const padRatio = (strokeW > 0 || shadowBlur > 0) ? 0.68 : 0.78;
            const fontPx = Math.max(12, Math.round(Math.min(stampW, stampH) * padRatio));

            stampCtx.clearRect(0, 0, stampW, stampH);
            stampCtx.save();
            stampCtx.font = `${fontWeight} ${fontPx}px ${fontFamily}`;
            stampCtx.textAlign = 'center';
            stampCtx.textBaseline = 'middle';

            const cx = stampW / 2;
            const cy = stampH / 2;

            if (shadowBlur > 0) {
                stampCtx.shadowBlur = shadowBlur * dpr;
                stampCtx.shadowColor = s.textShadow?.color || 'rgba(0,0,0,0.7)';
                stampCtx.shadowOffsetX = 0;
                stampCtx.shadowOffsetY = 2 * dpr;
            }
            if (strokeW > 0) {
                stampCtx.lineWidth = strokeW * 2 * dpr;
                stampCtx.lineJoin = 'round';
                stampCtx.strokeStyle = s.textStroke?.color || '#000000';
                stampCtx.strokeText(glyph, cx, cy);
                stampCtx.shadowBlur = 0;
                stampCtx.shadowOffsetY = 0;
            }
            stampCtx.fillStyle = s.color || '#ffffff';
            stampCtx.fillText(glyph, cx, cy);
            stampCtx.restore();
            iconHueCache.clear();
            return { glyph, fontFamily, fontWeight, isFa };
        }

        function getTintedIconStamp(cls, tileHue, satShift = 0, briShift = 0) {
            const hKey = Math.round(tileHue / 6) * 6;
            const bKey = Math.round(briShift * 10);
            const sKey = Math.round(satShift * 10);
            const cacheKey = `${hKey}_${bKey}_${sKey}`;
            if (iconHueCache.has(cacheKey)) return iconHueCache.get(cacheKey);

            const baseHex = curElement.style?.color || '#ffffff';
            const rgb = parseColorHex(baseHex);
            const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
            let h = (hsl.h + tileHue) % 360;
            if (h < 0) h += 360;
            let s = hsl.s < 0.08 ? 0.88 : hsl.s;
            let l = (hsl.l > 0.95 || hsl.l < 0.08) ? 0.58 : hsl.l;
            if (satShift !== 0) s = Math.max(0.05, Math.min(1, s + satShift));
            if (briShift !== 0) l = Math.max(0.05, Math.min(0.95, l * (1 + briShift)));
            const colorStr = `hsl(${Math.round(h)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`;

            const c = document.createElement('canvas');
            c.width = stampW; c.height = stampH;
            const tCtx = c.getContext('2d');
            tCtx.drawImage(stampCanvas, 0, 0);
            tCtx.globalCompositeOperation = 'source-in';
            tCtx.fillStyle = colorStr;
            tCtx.fillRect(0, 0, stampW, stampH);

            if (iconHueCache.size > 80) iconHueCache.clear();
            iconHueCache.set(cacheKey, c);
            return c;
        }

        function updateKaleidoCell(t) {
            if (!cellCtx) return;
            const halfW = stampW / 2;
            const halfH = stampH / 2;
            cellCtx.clearRect(0, 0, stampW, stampH);
            const dir = spinDirection === 'ccw' ? -1 : 1;
            const kPhase = motion === 'kaleidoscope' ? (t / spinSpeed) * Math.PI * 2 * dir : 0;
            const drift = motion === 'kaleidoscope' ? Math.sin(kPhase * 0.5) * stampW * 0.14 * waveAmount : 0;

            if (layout === 'kaleidoscope-radial') {
                const wedgeAngle = (Math.PI * 2) / wedges;
                const r = Math.max(stampW, stampH) * 0.72;
                for (let i = 0; i < wedges; i++) {
                    cellCtx.save();
                    cellCtx.translate(halfW, halfH);
                    cellCtx.rotate(i * wedgeAngle);
                    if (i & 1) cellCtx.scale(1, -1);
                    cellCtx.beginPath();
                    cellCtx.moveTo(0, 0);
                    cellCtx.arc(0, 0, r, -wedgeAngle / 2 - 0.012, wedgeAngle / 2 + 0.012);
                    cellCtx.closePath();
                    cellCtx.clip();
                    cellCtx.translate(drift, 0);
                    cellCtx.rotate(kPhase + tileAngleRad);
                    cellCtx.drawImage(stampCanvas, -halfW, -halfH, stampW, stampH);
                    cellCtx.restore();
                }
            } else if (layout === 'kaleidoscope-quad') {
                const quads = [[1, 1], [-1, 1], [1, -1], [-1, -1]];
                for (const [qx, qy] of quads) {
                    cellCtx.save();
                    cellCtx.translate(halfW, halfH);
                    cellCtx.scale(qx, qy);
                    cellCtx.beginPath();
                    cellCtx.rect(0, 0, halfW + 0.5, halfH + 0.5);
                    cellCtx.clip();
                    cellCtx.translate(halfW * 0.5 + drift, halfH * 0.5 + drift * 0.5);
                    cellCtx.rotate(kPhase + tileAngleRad);
                    cellCtx.drawImage(stampCanvas, -halfW * 0.65, -halfH * 0.65, stampW * 0.65, stampH * 0.65);
                    cellCtx.restore();
                }
            } else {
                cellCtx.save();
                cellCtx.translate(halfW, halfH);
                cellCtx.rotate(kPhase);
                cellCtx.drawImage(stampCanvas, -halfW, -halfH, stampW, stampH);
                cellCtx.scale(-1, 1);
                cellCtx.globalAlpha = 0.65;
                cellCtx.rotate(-kPhase * 2);
                cellCtx.drawImage(stampCanvas, -halfW * 0.85, -halfH * 0.85, stampW * 0.85, stampH * 0.85);
                cellCtx.restore();
            }
        }

        function drawFrame(now) {
            rafId = 0;
            if (stopped || !readyToDraw || !node.isConnected || !ctx || curElement.visible === false || node.classList.contains('hidden')) return;
            const ts = now || performance.now();
            if (!startTime) startTime = ts;

            const logicalW = Math.max(1, Number(curElement.width) || node.clientWidth || 300);
            const logicalH = Math.max(1, Number(curElement.height) || node.clientHeight || 200);
            // Match OBS 1080p 1:1 on large layers to avoid 4K Retina fill-rate bottlenecks
            const maxDpr = (logicalW * logicalH > 600000) ? 1 : Math.min(dpr, 1.5);
            const scaleCap = Math.min(maxDpr, 1920 / Math.max(logicalW, logicalH, 1));
            const cw = Math.max(1, Math.round(logicalW * scaleCap));
            const ch = Math.max(1, Math.round(logicalH * scaleCap));
            if (canvas.width !== cw || canvas.height !== ch) {
                canvas.width = cw;
                canvas.height = ch;
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'medium';
            }

            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.globalAlpha = 1;
            ctx.clearRect(0, 0, cw, ch);

            const t = Math.max(0, (ts - startTime) / 1000);

            const isProcedural = curElement.type === 'procedural-pattern' || curElement.pattern?.sourceType === 'preset' || curElement.pattern?.mode === 'procedural';
            if (isProcedural) {
                const patternsEngine = window.StreamPulsePatterns || root.OverlayShared?.Patterns;
                const p = curElement.pattern || {};
                const presetName = p.preset || 'hexagons';
                const pMotion = curOptions.animate === false ? 'none' : (p.motion || 'none');
                if (patternsEngine?.drawProceduralPattern) {
                    patternsEngine.drawProceduralPattern(ctx, presetName, cw, ch, {
                        scale: p.scale ?? 100,
                        color: p.color || 'transparent',
                        accent: p.accent || '#58a6ff',
                        secondary: p.secondary || p.accent || '#38bdf8',
                        lineWidth: Number(p.lineWidth) || 0,
                        motion: pMotion,
                        speed: Number(p.speed) || 1,
                        time: t
                    });
                }
                if (pMotion !== 'none' && !fxPaused && !document.hidden) {
                    rafId = requestAnimationFrame(drawFrame);
                }
                return;
            }
            if (isKaleido) updateKaleidoCell(t);
            const sourceBitmap = isKaleido ? cellCanvas : stampCanvas;

            const { tileW, tileH } = getTileDimensions();
            const stepX = Math.max(8, tileW + gap);
            const stepY = Math.max(8, tileH + gap);
            const rowCycle = stepX * 2;
            const colCycle = stepY * 2;
            const u = t / speed;
            const dir = spinDirection === 'ccw' ? -1 : 1;

            let dx = 0, dy = 0;
            if (motion === 'scroll' || motion === 'scroll-spin') {
                const cycleDist = Math.hypot(stepX, stepY) * 2;
                const dist = u * cycleDist;
                dx = Math.cos(scrollAngleRad) * dist;
                dy = Math.sin(scrollAngleRad) * dist;
            } else if (motion === 'sway') {
                const phase = u * Math.PI * 2;
                dx = Math.sin(phase) * stepX * waveAmount * 1.4;
                dy = Math.cos(phase * 0.5) * stepY * waveAmount * 0.8;
            }

            let evenRowX = dx, oddRowX = dx;
            let evenColY = dy, oddColY = dy;

            if (motion === 'alt-rows') {
                if (trackMode === 'sine') {
                    const s = Math.sin(u * Math.PI * 2) * stepX * (waveAmount * 2) * dir;
                    evenRowX += s;
                    oddRowX -= s;
                } else if (trackMode === 'stagger') {
                    evenRowX += dir * u * rowCycle * 2;
                    oddRowX += dir * u * rowCycle;
                } else if (trackMode === 'alternate-stop') {
                    evenRowX += dir * u * rowCycle;
                } else {
                    evenRowX += dir * u * rowCycle;
                    oddRowX -= dir * u * rowCycle;
                }
            } else if (motion === 'alt-cols') {
                if (trackMode === 'sine') {
                    const s = Math.sin(u * Math.PI * 2) * stepY * (waveAmount * 2) * dir;
                    evenColY += s;
                    oddColY -= s;
                } else if (trackMode === 'stagger') {
                    evenColY += dir * u * colCycle * 2;
                    oddColY += dir * u * colCycle;
                } else if (trackMode === 'alternate-stop') {
                    evenColY += dir * u * colCycle;
                } else {
                    evenColY += dir * u * colCycle;
                    oddColY -= dir * u * colCycle;
                }
            } else if (motion === 'weave') {
                const phase = u % 1;
                const easeCubic = p => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
                if (phase < 0.5) {
                    const e = easeCubic(phase * 2) * rowCycle * dir;
                    evenRowX += e;
                    if (trackMode !== 'alternate-stop' && trackMode !== 'stagger') oddRowX -= e;
                } else {
                    const e = easeCubic((phase - 0.5) * 2) * colCycle * dir;
                    if (trackMode === 'alternate-stop' || trackMode === 'stagger') {
                        oddColY += e;
                    } else {
                        evenColY += e;
                        oddColY -= e;
                    }
                }
            } else if ((motion === 'scroll' || motion === 'scroll-spin') && trackMode !== 'uniform') {
                if (trackMode === 'alt-rows') {
                    const fallbackX = Math.abs(dx) < 0.5 ? dir * u * rowCycle : dx;
                    evenRowX = fallbackX;
                    oddRowX = -fallbackX;
                } else if (trackMode === 'stagger-rows') {
                    const fallbackX = Math.abs(dx) < 0.5 ? dir * u * rowCycle : dx;
                    evenRowX = fallbackX * 1.5;
                    oddRowX = fallbackX * 0.75;
                } else if (trackMode === 'alt-cols') {
                    const fallbackY = Math.abs(dy) < 0.5 ? dir * u * colCycle : dy;
                    evenColY = fallbackY;
                    oddColY = -fallbackY;
                } else if (trackMode === 'stagger-cols') {
                    const fallbackY = Math.abs(dy) < 0.5 ? dir * u * colCycle : dy;
                    evenColY = fallbackY * 1.5;
                    oddColY = fallbackY * 0.75;
                }
            }

            const wrapAxis = (val, step) => {
                const raw = Math.floor(val / step);
                const base = raw - (raw & 1);
                return { base, rem: val - base * step };
            };
            const evenRowW = wrapAxis(evenRowX, stepX);
            const oddRowW = wrapAxis(oddRowX, stepX);
            const evenColW = wrapAxis(evenColY, stepY);
            const oddColW = wrapAxis(oddColY, stepY);

            const halfW = logicalW / 2;
            const halfH = logicalH / 2;
            const extentX = halfW * Math.abs(cosG) + halfH * Math.abs(sinG) + Math.max(tileW, tileH) * 1.5;
            const extentY = halfW * Math.abs(sinG) + halfH * Math.abs(cosG) + Math.max(tileW, tileH) * 1.5;
            const cols = Math.min(64, Math.ceil(extentX / stepX) + 1);
            const rows = Math.min(64, Math.ceil(extentY / stepY) + 1);

            const halfTileW = tileW / 2;
            const halfTileH = tileH / 2;
            const altDefaultTilt = (15 * Math.PI) / 180;
            const baseRot = (layout === 'kaleidoscope-quad' || layout === 'kaleidoscope-radial') ? 0 : tileAngleRad;
            const spinPhase = (motion === 'spin' || motion === 'scroll-spin' || motion === 'sway' || motion === 'wave') ? (t / spinSpeed) * Math.PI * 2 : 0;

            // Precompute trig for even/odd cells when rotation is not position-dependent ('sway')
            const isSway = motion === 'sway';
            let evenRot = baseRot, oddRot = baseRot;
            if (layout === 'alternating') {
                if (alternateFlip === 'tilt' && tileAngleDeg === 0) {
                    evenRot = altDefaultTilt;
                    oddRot = -altDefaultTilt;
                } else if (alternateFlip === 'tilt') {
                    oddRot = -baseRot;
                }
            }
            if (motion === 'spin' || motion === 'scroll-spin') {
                const evenDir = spinDirection === 'ccw' ? -1 : 1;
                const oddDir = spinDirection === 'ccw' ? -1 : spinDirection === 'alternate' ? -1 : 1;
                evenRot += evenDir * spinPhase;
                oddRot += oddDir * spinPhase;
            }
            const cosEven = Math.cos(gridAngleRad + evenRot), sinEven = Math.sin(gridAngleRad + evenRot);
            const cosOdd = Math.cos(gridAngleRad + oddRot), sinOdd = Math.sin(gridAngleRad + oddRot);

            let lastAlpha = 1;
            let lastFilter = 'none';
            if (ctx.filter && ctx.filter !== 'none') {
                ctx.filter = 'none';
            }
            const staticRowShift = (offsetX / 100) * stepX;
            const staticColShift = (offsetY / 100) * stepY;

            const hasDynamicAnim = motion !== 'none' || hueShift !== 'none' || twinkle > 0;
            const hasColorFilter = hueJitter > 0 || hueShift !== 'none' || brightnessJitter > 0 || saturationJitter > 0;
            const baseHueCycle = hueShift === 'cycle' ? ((t / hueSpeed) * 360) : 0;

            for (let r = -rows; r <= rows; r++) {
                const oddRow = (r & 1) !== 0;
                const rw = oddRow ? oddRowW : evenRowW;
                const rowShiftX = oddRow ? staticRowShift : 0;

                for (let c = -cols; c <= cols; c++) {
                    const oddCol = (c & 1) !== 0;
                    const cwWrap = oddCol ? oddColW : evenColW;

                    let cx = c * stepX + rw.rem + rowShiftX;
                    let cy = r * stepY + cwWrap.rem + (oddCol ? staticColShift : 0);

                    const row = r - cwWrap.base;
                    const col = c - rw.base;
                    const oddCell = ((row + col) & 1) !== 0;

                    if (positionJitter > 0) {
                        const pj = (positionJitter / 100) * 0.45;
                        cx += (cellHash(row, col, 7) * 2 - 1) * stepX * pj;
                        cy += (cellHash(row, col, 8) * 2 - 1) * stepY * pj;
                    }

                    if (cx < -extentX || cx > extentX) continue;
                    if (cy < -extentY || cy > extentY) continue;

                    let alpha = tileOpacity;
                    let scale = 1;
                    let sx = 1, sy = 1;

                    if (oddCell) {
                        if (layout === 'checkerboard') {
                            alpha *= altOpacity;
                            scale *= altScale;
                        } else if (layout === 'alternating') {
                            if (alternateFlip === 'h') sx = -1;
                            else if (alternateFlip === 'v') sy = -1;
                            else if (alternateFlip === 'both') { sx = -1; sy = -1; }
                            alpha *= altOpacity;
                            scale *= altScale;
                        }
                    }

                    if (scaleJitter > 0) {
                        const sj = 1 + (cellHash(row, col, 5) * 2 - 1) * (scaleJitter / 100);
                        scale *= Math.max(0.05, sj);
                    }

                    if (twinkle > 0) {
                        const twSeed = cellHash(row, col, 9);
                        const twPhase = ((t / twinkleSpeed) * Math.PI * 2) + (twSeed * Math.PI * 2);
                        const twPulse = 1 - (Math.cos(twPhase) * 0.5 + 0.5) * (twinkle / 100) * 0.85;
                        alpha *= Math.max(0.01, twPulse);
                    }

                    if (alpha < 0.01 || scale < 0.02) continue;

                    let rotJitterRad = 0;
                    if (rotationJitter > 0) {
                        rotJitterRad = ((cellHash(row, col, 6) * 2 - 1) * rotationJitter * Math.PI) / 180;
                    }

                    let cosT = oddCell ? cosOdd : cosEven;
                    let sinT = oddCell ? sinOdd : sinEven;

                    if (motion === 'wave') {
                        const wavePhase = spinPhase - (col * 0.45 + row * 0.45);
                        scale *= Math.max(0.1, 1 + Math.sin(wavePhase) * waveAmount * 0.45);
                        cy += Math.cos(wavePhase) * tileSize * waveAmount * 0.16;
                    }

                    if (isSway) {
                        const swayDir = spinDirection === 'alternate' ? (oddCell ? -1 : 1) : 1;
                        const rot = (oddCell ? oddRot : evenRot) + swayDir * Math.sin(spinPhase + (row + col) * 0.4) * (waveAmount * 0.65) + rotJitterRad;
                        cosT = Math.cos(gridAngleRad + rot);
                        sinT = Math.sin(gridAngleRad + rot);
                    } else if (rotJitterRad !== 0) {
                        const rot = (oddCell ? oddRot : evenRot) + rotJitterRad;
                        cosT = Math.cos(gridAngleRad + rot);
                        sinT = Math.sin(gridAngleRad + rot);
                    }

                    const tx = (halfW + cx * cosG - cy * sinG) * scaleCap;
                    const ty = (halfH + cx * sinG + cy * cosG) * scaleCap;
                    const sX = sx * scale * scaleCap;
                    const sY = sy * scale * scaleCap;

                    if (lastAlpha !== alpha) {
                        ctx.globalAlpha = alpha;
                        lastAlpha = alpha;
                    }

                    let currentBitmap = sourceBitmap;
                    let filterStr = 'none';

                    if (sourceType === 'icon' && hasColorFilter) {
                        let tileHue = baseHueCycle;
                        if (hueShift === 'wave-x') {
                            tileHue = ((t / hueSpeed) * 360) + (col * 24);
                        } else if (hueShift === 'wave-y') {
                            tileHue = ((t / hueSpeed) * 360) + (row * 24);
                        }
                        if (hueJitter > 0) {
                            tileHue += (cellHash(row, col, 1) * 2 - 1) * hueJitter;
                        }
                        tileHue = ((tileHue % 360) + 360) % 360;

                        const bVal = brightnessJitter > 0 ? (cellHash(row, col, 2) * 2 - 1) * (brightnessJitter / 100) : 0;
                        const sVal = saturationJitter > 0 ? (cellHash(row, col, 3) * 2 - 1) * (saturationJitter / 100) : 0;
                        const cls = String(curElement.content || 'fa-brands fa-twitch').trim();
                        const tinted = getTintedIconStamp(cls, tileHue, sVal, bVal);
                        if (tinted) {
                            currentBitmap = tinted;
                        } else {
                            currentBitmap = sourceBitmap;
                            let fp = '';
                            if (tileHue > 0.5 && tileHue < 359.5) {
                                fp += `hue-rotate(${Math.round(tileHue)}deg) `;
                            }
                            if (bVal !== 0) {
                                fp += `brightness(${Math.round((1 + bVal) * 100)}%) `;
                            }
                            if (sVal !== 0) {
                                fp += `saturate(${Math.round((1 + sVal) * 100)}%) `;
                            }
                            filterStr = fp ? fp.trim() : 'none';
                            if (lastFilter !== filterStr) {
                                ctx.filter = filterStr;
                                lastFilter = filterStr;
                            }
                        }
                    } else if (hasColorFilter) {
                        let tileHue = baseHueCycle;
                        if (hueShift === 'wave-x') {
                            tileHue = ((t / hueSpeed) * 360) + (col * 24);
                        } else if (hueShift === 'wave-y') {
                            tileHue = ((t / hueSpeed) * 360) + (row * 24);
                        }
                        if (hueJitter > 0) {
                            tileHue += (cellHash(row, col, 1) * 2 - 1) * hueJitter;
                        }
                        tileHue = ((tileHue % 360) + 360) % 360;

                        let fp = '';
                        if (tileHue > 0.5 && tileHue < 359.5) {
                            fp += `hue-rotate(${Math.round(tileHue)}deg) `;
                        }
                        if (brightnessJitter > 0) {
                            const bVal = 1 + (cellHash(row, col, 2) * 2 - 1) * (brightnessJitter / 100);
                            fp += `brightness(${Math.round(bVal * 100)}%) `;
                        }
                        if (saturationJitter > 0) {
                            const sVal = 1 + (cellHash(row, col, 3) * 2 - 1) * (saturationJitter / 100);
                            fp += `saturate(${Math.round(sVal * 100)}%) `;
                        }
                        filterStr = fp ? fp.trim() : 'none';

                        if (lastFilter !== filterStr) {
                            ctx.filter = filterStr;
                            lastFilter = filterStr;
                        }
                    }

                    ctx.setTransform(cosT * sX, sinT * sX, -sinT * sY, cosT * sY, tx, ty);
                    ctx.drawImage(currentBitmap, -halfTileW, -halfTileH, tileW, tileH);
                }
            }

            if (lastFilter !== 'none') {
                ctx.filter = 'none';
                lastFilter = 'none';
            }

            if (hasDynamicAnim && curOptions.animate !== false && !fxPaused && !document.hidden) {
                rafId = requestAnimationFrame(drawFrame);
            }
        }

        function wake() {
            if (document.hidden) {
                if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
                return;
            }
            if (stopped || !readyToDraw || curElement.visible === false || node.classList.contains('hidden')) return;
            const p = curElement.pattern || {};
            const pMotion = curOptions.animate === false ? 'none' : (p.motion || motion || 'none');
            const pHueShift = p.hueShift || hueShift || 'none';
            const pTwinkle = Number(p.twinkle ?? twinkle);
            const needsLoop = (pMotion !== 'none' || pHueShift !== 'none' || pTwinkle > 0) && curOptions.animate !== false && !fxPaused;
            if (!needsLoop) {
                if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
                drawFrame(performance.now());
            } else {
                drawFrame(performance.now());
                if (!rafId) {
                    rafId = requestAnimationFrame(drawFrame);
                }
            }
        }

        function syncConfig(nextEl, nextOpts = {}) {
            curElement = nextEl || curElement;
            curOptions = nextOpts || curOptions;
            if (curElement.visible === false || node.classList.contains('hidden')) {
                if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
                canvas.width = 1; canvas.height = 1;
                patternRunners.delete(wake);
                return;
            }
            const config = curElement.pattern || {};
            layout = ['grid', 'brick', 'stagger', 'alternating', 'checkerboard', 'kaleidoscope-quad', 'kaleidoscope-radial'].includes(config.layout) ? config.layout : 'brick';
            aspectRatio = ['1:1', '16:9', '4:3', '3:2', '2:1', '3:4', '9:16', 'natural'].includes(config.aspectRatio) ? config.aspectRatio : '1:1';
            iconHueCache.clear();
            tileSize = Math.max(16, Math.min(1024, Number(config.tileSize) || 96));
            gap = Math.max(0, Math.min(256, Number(config.gap ?? 16)));
            offsetX = Math.max(0, Math.min(100, Number(config.offsetX ?? (layout === 'brick' ? 50 : 0))));
            offsetY = Math.max(0, Math.min(100, Number(config.offsetY ?? (layout === 'stagger' ? 50 : 0))));
            gridAngleRad = (Number(config.angle ?? -15) * Math.PI) / 180;
            cosG = Math.cos(gridAngleRad);
            sinG = Math.sin(gridAngleRad);
            tileAngleDeg = Number(config.tileAngle ?? 0);
            tileAngleRad = (tileAngleDeg * Math.PI) / 180;
            alternateFlip = ['none', 'tilt', 'h', 'v', 'both'].includes(config.alternateFlip) ? config.alternateFlip : 'tilt';
            tileOpacity = Math.max(0.05, Math.min(1, Number(config.tileOpacity ?? 1)));
            altOpacity = Math.max(0, Math.min(1, Number(config.altOpacity ?? 0.4)));
            altScale = Math.max(10, Math.min(200, Number(config.altScale ?? 100))) / 100;
            blendMode = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion', 'luminosity', 'plus-lighter'].includes(config.blendMode) ? config.blendMode : 'normal';
            sourceType = ['preset', 'icon', 'image'].includes(config.sourceType) ? config.sourceType : (config.preset ? 'preset' : 'image');
            wedges = Math.max(4, Math.min(16, Math.round((Number(config.wedges) || 6) / 2) * 2));
            feather = Math.max(0, Math.min(100, Number(config.feather) || 0));
            motion = curOptions.animate === false ? 'none' : (['none', 'scroll', 'alt-rows', 'alt-cols', 'weave', 'sway', 'spin', 'scroll-spin', 'wave', 'kaleidoscope'].includes(config.motion) ? config.motion : 'scroll');
            const defaultTrack = (motion === 'alt-rows' || motion === 'alt-cols') ? 'opposite' : 'uniform';
            trackMode = ['uniform', 'opposite', 'stagger', 'sine', 'alternate-stop', 'alt-rows', 'stagger-rows', 'alt-cols', 'stagger-cols'].includes(config.trackMode) ? config.trackMode : defaultTrack;
            scrollAngleRad = (Number(config.scrollAngle ?? 315) * Math.PI) / 180;
            speed = Math.max(0.5, Math.min(120, Number(config.speed) || 12));
            spinSpeed = Math.max(0.5, Math.min(120, Number(config.spinSpeed) || 8));
            spinDirection = ['cw', 'ccw', 'alternate'].includes(config.spinDirection) ? config.spinDirection : 'cw';
            waveAmount = Math.max(5, Math.min(100, Number(config.waveAmount) || 25)) / 100;
            hueShift = ['none', 'cycle', 'wave-x', 'wave-y'].includes(config.hueShift) ? config.hueShift : 'none';
            hueSpeed = Math.max(0.5, Math.min(120, Number(config.hueSpeed) || 12));
            hueJitter = Math.max(0, Math.min(180, Number(config.hueJitter) || 0));
            brightnessJitter = Math.max(0, Math.min(50, Number(config.brightnessJitter) || 0));
            saturationJitter = Math.max(0, Math.min(50, Number(config.saturationJitter) || 0));
            scaleJitter = Math.max(0, Math.min(50, Number(config.scaleJitter) || 0));
            rotationJitter = Math.max(0, Math.min(180, Number(config.rotationJitter) || 0));
            positionJitter = Math.max(0, Math.min(50, Number(config.positionJitter) || 0));
            twinkle = Math.max(0, Math.min(100, Number(config.twinkle) || 0));
            twinkleSpeed = Math.max(0.5, Math.min(30, Number(config.twinkleSpeed) || 4));

            const hasFill = hasBoxFill(curElement.style || {});
            if (hasFill && blendMode !== 'normal') {
                wrap.style.mixBlendMode = blendMode;
                node.style.mixBlendMode = '';
            } else {
                wrap.style.mixBlendMode = '';
                node.style.mixBlendMode = blendMode !== 'normal' ? blendMode : '';
            }

            if (feather !== lastFeather) {
                lastFeather = feather;
                if (feather > 0) {
                    const stop = Math.max(0, 100 - feather);
                    const mask = `radial-gradient(ellipse at center, #000 ${stop}%, transparent 100%)`;
                    wrap.style.webkitMaskImage = mask;
                    wrap.style.maskImage = mask;
                } else {
                    wrap.style.webkitMaskImage = '';
                    wrap.style.maskImage = '';
                }
            }

            const isProcedural = curElement.type === 'procedural-pattern' || config.sourceType === 'preset' || config.mode === 'procedural';
            if (isProcedural) {
                const pMotion = curOptions.animate === false ? 'none' : (config.motion || 'none');
                motion = pMotion;
                if (motion !== 'none') patternRunners.add(wake);
                else patternRunners.delete(wake);
                note.style.display = 'none';
                readyToDraw = true;
                wake();
                return;
            }

            const needsRunner = (motion !== 'none' || hueShift !== 'none' || twinkle > 0) && curOptions.animate !== false;
            if (needsRunner) patternRunners.add(wake);
            else patternRunners.delete(wake);

            dpr = Math.min(window.devicePixelRatio || 1, 1.5);
            const { tileW: curW, tileH: curH } = getTileDimensions();
            stampW = Math.min(384, Math.max(32, Math.round(curW * dpr)));
            stampH = Math.min(384, Math.max(32, Math.round(curH * dpr)));

            isKaleido = layout === 'kaleidoscope-quad' || layout === 'kaleidoscope-radial' || motion === 'kaleidoscope';
            if (isKaleido) {
                if (!cellCanvas) {
                    cellCanvas = document.createElement('canvas');
                    cellCtx = cellCanvas.getContext('2d');
                }
                if (cellCanvas.width !== stampW || cellCanvas.height !== stampH) {
                    cellCanvas.width = stampW;
                    cellCanvas.height = stampH;
                }
            }

            const rawSrc = curOptions.expand ? curOptions.expand(curElement.src || '') : String(curElement.src || '');
            const nextStampKey = sourceType === 'icon'
                ? JSON.stringify(['icon', curElement.content, stampW, stampH, curElement.style?.color, curElement.style?.textStroke, curElement.style?.textShadow])
                : JSON.stringify(['image', rawSrc, stampW, stampH, curElement.style?.objectFit, curElement.style?.focusX, curElement.style?.focusY]);

            if (nextStampKey === lastStampKey && readyToDraw) {
                wake();
                return;
            }
            lastStampKey = nextStampKey;
            if (stampCanvas.width !== stampW || stampCanvas.height !== stampH) {
                stampCanvas.width = stampW;
                stampCanvas.height = stampH;
            }

            if (sourceType === 'icon') {
                const cls = String(curElement.content || 'fa-brands fa-twitch').trim().replace(/^fab\b/, 'fa-brands').replace(/^fas\b/, 'fa-solid').replace(/^far\b/, 'fa-regular');
                const refreshIconStamp = () => {
                    if (stopped) return;
                    const { glyph, fontFamily, fontWeight, isFa } = buildStampFromIcon(cls);
                    if (glyph) {
                        note.style.display = 'none';
                        readyToDraw = true;
                        wake();
                        if (isFa && document.fonts?.load) {
                            document.fonts.load(`${fontWeight} 32px ${fontFamily}`, glyph).then(() => {
                                if (stopped) return;
                                buildStampFromIcon(cls);
                                wake();
                            }).catch(() => {});
                        }
                    } else if (curOptions.preview) {
                        drawSamplePatternStamp(stampCtx, stampW, stampH);
                        note.textContent = 'Choose a valid Font Awesome icon or paste an emoji in Content';
                        note.style.display = 'block';
                        readyToDraw = true;
                        wake();
                    }
                };
                let faLink = document.querySelector('link[data-fa]');
                if (!faLink) {
                    faLink = document.createElement('link');
                    faLink.rel = 'stylesheet';
                    faLink.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css';
                    faLink.dataset.fa = '1';
                    faLink.addEventListener('load', () => { faGlyphCache.clear(); refreshIconStamp(); }, { once: true });
                    document.head.appendChild(faLink);
                }
                refreshIconStamp();
            } else {
                if (!rawSrc || /\{\{/.test(rawSrc)) {
                    if (curOptions.preview) {
                        drawSamplePatternStamp(stampCtx, stampW, stampH);
                        note.textContent = rawSrc ? `${rawSrc} (sample tile shown until live value is available)` : 'Sample pattern tile — upload an image or switch to Icon / Emoji in Content';
                        note.style.display = 'block';
                        readyToDraw = true;
                        wake();
                    }
                } else if (cachedImg && lastImgSrc === rawSrc && cachedImg.complete && cachedImg.naturalWidth > 0) {
                    note.style.display = 'none';
                    buildStampFromImage(cachedImg);
                    readyToDraw = true;
                    wake();
                } else {
                    lastImgSrc = rawSrc;
                    const img = new Image();
                    img.decoding = 'async';
                    img.onload = () => {
                        if (stopped || lastImgSrc !== rawSrc) return;
                        cachedImg = img;
                        note.style.display = 'none';
                        buildStampFromImage(img);
                        readyToDraw = true;
                        wake();
                    };
                    img.onerror = () => {
                        if (stopped || lastImgSrc !== rawSrc) return;
                        cachedImg = null;
                        if (curOptions.preview) {
                            drawSamplePatternStamp(stampCtx, stampW, stampH);
                            note.textContent = "Couldn't load tile image — showing sample pattern";
                            note.style.display = 'block';
                            readyToDraw = true;
                            wake();
                        }
                    };
                    img.src = rawSrc;
                }
            }
        }

        syncConfig(element, options);

        const handle = {
            isStopped: () => stopped,
            stop() {
                stopped = true;
                if (node._patternHandle === handle) node._patternHandle = null;
                patternRunners.delete(wake);
                if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
                cachedImg = null;
                try {
                    canvas.width = 0; canvas.height = 0;
                    stampCanvas.width = 0; stampCanvas.height = 0;
                    if (cellCanvas) { cellCanvas.width = 0; cellCanvas.height = 0; }
                } catch {}
            },
            update: (nextEl, nextOpts) => { if (!stopped) syncConfig(nextEl, nextOpts); },
            redraw: () => { if (!stopped) wake(); }
        };
        node._patternHandle = handle;
        return handle;
    }

    function ensureSpeakerBadgeStyle() {
        if (document.getElementById('sp-speaker-badge-style')) return;
        const tag = document.createElement('style');
        tag.id = 'sp-speaker-badge-style';
        tag.textContent = `
.sp-sb-card { box-sizing: border-box; display: flex; position: relative; width: 100%; height: 100%; container-type: size; transition: transform 0.18s ease-out, border-color 0.18s ease, box-shadow 0.18s ease, opacity 0.2s ease; overflow: hidden; user-select: none; font-family: inherit; color: inherit; box-shadow: var(--sb-base-shadow, 0 4px 16px rgba(0,0,0,0.25)); }
.sp-sb-card.is-speaking.has-highlight { border-color: var(--sb-active-color, #6366f1) !important; box-shadow: 0 0 var(--sb-glow-spread, 14px) var(--sb-active-glow, rgba(99, 102, 241, 0.45)), var(--sb-base-shadow, 0 4px 20px rgba(0,0,0,0.35)) !important; }
.sp-sb-card.is-speaking.has-pop { transform: scale(1.03); }
.sp-sb-card.is-idle.has-dim { opacity: var(--sb-idle-opacity, 0.7) !important; }

/* Avatar Wrap & Shapes */
.sp-sb-avatar-wrap { position: relative; flex-shrink: 0; display: flex; align-items: center; justify-content: center; width: var(--sb-avatar-size, 48px); height: var(--sb-avatar-size, 48px); }
.sp-sb-avatar-wrap.shape-circle, .sp-sb-avatar.shape-circle, .sp-sb-avatar-placeholder.shape-circle { border-radius: 50%; }
.sp-sb-avatar-wrap.shape-squircle, .sp-sb-avatar.shape-squircle, .sp-sb-avatar-placeholder.shape-squircle { border-radius: 26%; }
.sp-sb-avatar-wrap.shape-square, .sp-sb-avatar.shape-square, .sp-sb-avatar-placeholder.shape-square { border-radius: 8px; }
.sp-sb-avatar { width: 100%; height: 100%; object-fit: cover; display: block; }
.sp-sb-avatar-placeholder { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: rgba(255, 255, 255, 0.12); color: currentColor; box-sizing: border-box; }
.sp-sb-avatar-placeholder svg { width: calc(55% * var(--sb-icon-scale, 1)); height: calc(55% * var(--sb-icon-scale, 1)); opacity: 0.75; }

/* Pulse Ring Halo */
.sp-sb-pulse-ring { position: absolute; inset: -5px; border-radius: inherit; border: 2px solid var(--sb-active-color, #6366f1); opacity: 0; pointer-events: none; transform: scale(0.95); }
.is-speaking .sp-sb-pulse-ring { animation: spSbPulse 1.3s ease-out infinite; }
@keyframes spSbPulse { 0% { transform: scale(0.95); opacity: 0.85; } 50% { transform: scale(1.18); opacity: 0.3; } 100% { transform: scale(1.35); opacity: 0; } }

/* Metadata & Proportional Typography */
.sp-sb-meta { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; justify-content: center; gap: calc(3px * var(--sb-fit-scale, 1)); }
.sp-sb-row { display: flex; flex-wrap: wrap; flex-shrink: 0; align-items: center; justify-content: var(--sb-justify, flex-start); gap: calc(4px * var(--sb-fit-scale, 1)) calc(8px * var(--sb-fit-scale, 1)); min-width: 0; width: 100%; }
.sp-sb-subrow { margin-top: calc(1px * var(--sb-fit-scale, 1)); }
.sp-sb-name { min-width: 0; max-width: 100%; flex-shrink: 0; font-weight: var(--sb-font-weight, 700); font-size: var(--sb-font-size, 17px); line-height: var(--sb-line-height, 1.2); white-space: normal; overflow-wrap: anywhere; color: inherit; }
.sp-sb-pronouns { max-width: 100%; min-width: 0; flex-shrink: 0; font-family: var(--sb-pill-font, inherit); font-size: var(--sb-pronouns-size, 11px); font-weight: 600; text-transform: lowercase; padding: calc(2px * var(--sb-fit-scale, 1)) calc(8px * var(--sb-fit-scale, 1)); border-radius: 999px; background: color-mix(in srgb, currentColor 14%, transparent); color: inherit; border: 1px solid color-mix(in srgb, currentColor 12%, transparent); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.2; }
.sp-sb-handle, .sp-sb-location, .cspan-location { font-family: var(--sb-subtitle-font, inherit); }
.sp-sb-callin-tag, .cspan-status-tag { font-family: var(--sb-pill-font, inherit); }
.sp-sb-handle { min-width: 0; max-width: 100%; flex-shrink: 0; font-size: var(--sb-handle-size, 12px); opacity: 0.75; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: var(--sb-line-height, 1.2); color: inherit; }
.sp-sb-location { min-width: 0; max-width: 100%; flex-shrink: 0; font-size: var(--sb-loc-size, 11px); opacity: 0.8; display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.2; color: inherit; }

/* Call-In Badges & Live Status Indicator */
.sp-sb-callin-tag { display: inline-flex; align-items: center; max-width: 100%; min-width: 0; flex-shrink: 0; gap: calc(6px * var(--sb-fit-scale, 1)); font-size: var(--sb-tag-size, 10px); font-weight: 800; letter-spacing: 0.07em; text-transform: uppercase; color: var(--cspan-status-color, #22c55e); background: rgba(0, 0, 0, 0.36); padding: calc(2px * var(--sb-fit-scale, 1)) calc(7px * var(--sb-fit-scale, 1)); border-radius: 999px; border: 1px solid color-mix(in srgb, var(--cspan-status-color, #22c55e) 35%, transparent); line-height: 1.2; }
.cspan-status-label, .sp-sb-location > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sp-sb-callin-tag.size-compact { font-size: calc(var(--sb-tag-size, 10px) * 0.9); padding: calc(1px * var(--sb-fit-scale, 1)) calc(6px * var(--sb-fit-scale, 1)); gap: calc(4px * var(--sb-fit-scale, 1)); }
.sp-sb-callin-tag.size-small { font-size: calc(var(--sb-tag-size, 10px) * 0.95); padding: calc(2px * var(--sb-fit-scale, 1)) calc(6px * var(--sb-fit-scale, 1)); }
.cspan-live-dot { width: calc(7px * var(--sb-fit-scale, 1)); height: calc(7px * var(--sb-fit-scale, 1)); border-radius: 50%; background: currentColor; display: inline-block; flex-shrink: 0; }
.sp-sb-location svg { width: calc(11px * var(--sb-fit-scale, 1)); height: calc(11px * var(--sb-fit-scale, 1)); flex-shrink: 0; }
.is-speaking .cspan-live-dot { box-shadow: 0 0 8px currentColor; animation: spSbBlink 0.8s infinite alternate; }
@keyframes spSbBlink { from { opacity: 0.4; transform: scale(0.9); } to { opacity: 1; transform: scale(1.2); } }

/* EQ Audio Visualizer Bars */
.sp-sb-eq-bars { display: inline-flex; align-items: flex-end; gap: calc(3px * var(--sb-fit-scale, 1)); height: calc(20px * var(--sb-fit-scale, 1)); flex-shrink: 0; padding: 0 calc(4px * var(--sb-fit-scale, 1)); }
.sp-sb-eq-bar { width: calc(3.5px * var(--sb-fit-scale, 1)); border-radius: 999px; background: var(--sb-bar-color, var(--sb-active-color, #6366f1)); height: calc(4px * var(--sb-fit-scale, 1)); transition: height 0.12s ease, opacity 0.15s ease; opacity: 0.35; }
.is-speaking .sp-sb-eq-bar { opacity: 1; animation: spSbEqBounce 0.5s ease-in-out infinite alternate; }
.is-speaking .sp-sb-eq-bar:nth-child(1) { animation-delay: 0.05s; }
.is-speaking .sp-sb-eq-bar:nth-child(2) { animation-delay: 0.18s; }
.is-speaking .sp-sb-eq-bar:nth-child(3) { animation-delay: 0.32s; }
.is-speaking .sp-sb-eq-bar:nth-child(4) { animation-delay: 0.12s; }
.is-speaking .sp-sb-eq-bar:nth-child(5) { animation-delay: 0.25s; }
.is-speaking .sp-sb-eq-bar:nth-child(6) { animation-delay: 0.08s; }
.is-speaking .sp-sb-eq-bar:nth-child(7) { animation-delay: 0.22s; }
.is-speaking .sp-sb-eq-bar:nth-child(8) { animation-delay: 0.38s; }
@keyframes spSbEqBounce { 0% { height: calc(4px * var(--sb-fit-scale, 1)); } 30% { height: calc(18px * var(--sb-fit-scale, 1)); } 60% { height: calc(8px * var(--sb-fit-scale, 1)); } 100% { height: calc(20px * var(--sb-fit-scale, 1)); } }

/* Layout 1: Horizontal Lower-Third */
.sp-sb-card.layout-horizontal { flex-direction: row; align-items: var(--sb-valign, center); gap: calc(12px * var(--sb-fit-scale, 1)); padding: var(--sb-padding-y, 10px) var(--sb-padding-x, 16px); }
.sp-sb-card.layout-horizontal .sp-sb-avatar-wrap { --sb-avatar-size: min(calc(var(--sb-avatar-base, 48px) * var(--sb-avatar-scale, 1)), 100cqh, 30cqw); }
.sp-sb-card.layout-horizontal.is-auto-size .sp-sb-avatar-wrap { --sb-avatar-base: max(48px, min(80cqh, 24cqw)); }

/* Layout 2: C-SPAN Banner */
.sp-sb-card.layout-cspan-banner { flex-direction: column; justify-content: flex-start; padding: 0; min-height: 0; }
.sp-sb-card.layout-cspan-banner .cspan-header-bar { display: flex; align-items: center; justify-content: space-between; width: 100%; border-bottom: 1px solid rgba(255, 255, 255, 0.14); padding: calc(5px * var(--sb-fit-scale, 1)) calc(12px * var(--sb-fit-scale, 1)); box-sizing: border-box; background: rgba(0, 0, 0, 0.32); font-size: var(--sb-tag-size, 11px); flex-shrink: 0; min-height: calc(22px * var(--sb-fit-scale, 1)); }
.sp-sb-card.layout-cspan-banner .cspan-status-tag { display: inline-flex; align-items: center; min-width: 0; max-width: 60%; gap: 7px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: var(--cspan-status-color, #22c55e); }
.sp-sb-card.layout-cspan-banner .cspan-location { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.85; font-size: var(--sb-loc-size, 10.5px); }
.sp-sb-card.layout-cspan-banner .cspan-main-row { display: flex; align-items: var(--sb-valign, center); width: 100%; min-width: 0; flex: 1; padding: var(--sb-padding-y, 6px) var(--sb-padding-x, 12px); box-sizing: border-box; gap: calc(10px * var(--sb-fit-scale, 1)); overflow: hidden; container-type: size; }
.sp-sb-card.layout-cspan-banner .sp-sb-avatar-wrap { --sb-avatar-size: min(calc(var(--sb-avatar-base, 44px) * var(--sb-avatar-scale, 1)), 100cqh, 30cqw); }
.sp-sb-card.layout-cspan-banner.is-auto-size .sp-sb-avatar-wrap { --sb-avatar-base: max(44px, min(80cqh, 24cqw)); }
.sp-sb-card.layout-cspan-banner .sp-sb-name { font-size: var(--sb-font-size, 18px); font-weight: var(--sb-font-weight, 800); }

/* Layout 3: Compact Pill */
.sp-sb-card.layout-compact-pill { flex-direction: row; align-items: var(--sb-valign, center); gap: calc(9px * var(--sb-fit-scale, 1)); padding: var(--sb-padding-y, 6px) var(--sb-padding-x, 14px); border-radius: 999px !important; }
.sp-sb-card.layout-compact-pill .sp-sb-avatar-wrap { --sb-avatar-size: min(calc(var(--sb-avatar-base, 32px) * var(--sb-avatar-scale, 1)), 100cqh, 30cqw); }
.sp-sb-card.layout-compact-pill.is-auto-size .sp-sb-avatar-wrap { --sb-avatar-base: max(32px, min(80cqh, 24cqw)); }
.sp-sb-card.layout-compact-pill .sp-sb-name { font-size: var(--sb-font-size, 14px); font-weight: var(--sb-font-weight, 700); }
.sp-sb-card.layout-compact-pill .sp-sb-eq-bars { height: calc(16px * var(--sb-fit-scale, 1)); }

/* Layout 4: Vertical Sidebar Card */
.sp-sb-card.layout-vertical-card { flex-direction: column; align-items: var(--sb-justify, center); justify-content: var(--sb-valign, center); padding: var(--sb-padding-y, 14px) var(--sb-padding-x, 12px); gap: calc(6px * var(--sb-fit-scale, 1)); }
.sp-sb-card.layout-vertical-card .sp-sb-avatar-wrap { --sb-avatar-size: min(calc(var(--sb-avatar-base, 64px) * var(--sb-avatar-scale, 1)), 40cqh, 100cqw); }
.sp-sb-card.layout-vertical-card.is-auto-size .sp-sb-avatar-wrap { --sb-avatar-base: max(64px, min(30cqh, 60cqw)); }
.sp-sb-card.layout-vertical-card .sp-sb-meta { flex: 0 0 auto; width: 100%; }
.sp-sb-card.layout-vertical-card .sp-sb-row { gap: calc(4px * var(--sb-fit-scale, 1)); }
.sp-sb-card.layout-vertical-card .sp-sb-callin-tag, .sp-sb-card.layout-vertical-card .sp-sb-pronouns { max-width: 100%; }
.sp-sb-card.layout-vertical-card .sp-sb-eq-bars { margin-top: calc(4px * var(--sb-fit-scale, 1)); }

/* Layout 5: Avatar Only */
.sp-sb-card.layout-avatar-only { justify-content: center; align-items: center; overflow: visible; padding: 0 !important; background: transparent !important; border: 0 !important; box-shadow: none !important; }
.sp-sb-card.layout-avatar-only .sp-sb-avatar-wrap { width: calc(100% * var(--sb-avatar-scale, 1)); height: calc(100% * var(--sb-avatar-scale, 1)); transition: transform 0.18s ease-out, box-shadow 0.18s ease; }
.sp-sb-card.layout-avatar-only.is-speaking.has-highlight .sp-sb-avatar-wrap { box-shadow: 0 0 var(--sb-glow-spread, 16px) var(--sb-active-glow, rgba(99, 102, 241, 0.6)); }
.sp-sb-card.layout-avatar-only.is-speaking.has-pop { transform: none; }
.sp-sb-card.layout-avatar-only.is-speaking.has-pop .sp-sb-avatar-wrap { transform: scale(1.06); }
.sp-sb-card.layout-avatar-only .sp-sb-avatar, .sp-sb-card.layout-avatar-only .sp-sb-avatar-placeholder { border: 2.5px solid rgba(255, 255, 255, 0.2); box-sizing: border-box; transition: border-color 0.18s ease; }
.sp-sb-card.layout-avatar-only.is-speaking.has-highlight .sp-sb-avatar, .sp-sb-card.layout-avatar-only.is-speaking.has-highlight .sp-sb-avatar-placeholder { border-color: var(--sb-active-color, #6366f1) !important; }
.sp-sb-card.layout-avatar-only .avatar-corner-eq { position: absolute; bottom: 2px; right: 2px; background: rgba(0, 0, 0, 0.65); padding: 2px 4px; border-radius: 4px; height: 14px; }
@media (prefers-reduced-motion: reduce) {
    .sp-sb-card, .sp-sb-avatar-wrap { transition: none !important; }
    .sp-sb-card.is-speaking.has-pop, .sp-sb-card.layout-avatar-only.is-speaking.has-pop .sp-sb-avatar-wrap { transform: none; }
    .sp-sb-card .sp-sb-pulse-ring, .sp-sb-card .sp-sb-eq-bar, .sp-sb-card .cspan-live-dot { animation: none; }
}
`;
        document.head.appendChild(tag);
    }

    function fitSpeakerBadge(node) {
        const card = node.querySelector(':scope > .sp-sb-card');
        if (!node.isConnected || !card || card.classList.contains('layout-avatar-only') || !card.clientHeight || !card.clientWidth) return;
        const base = card._speakerBaseFontSize;
        const meta = card.querySelector('.sp-sb-meta');
        const content = [...card.querySelectorAll('.sp-sb-meta, .sp-sb-name, .sp-sb-row, .sp-sb-handle, .sp-sb-avatar-wrap, .sp-sb-eq-bars, .cspan-header-bar')];
        const groups = [card, ...card.querySelectorAll('.cspan-main-row, .sp-sb-meta, .sp-sb-row')];
        const applySize = size => {
            const scale = size / base;
            // Keep structural spacing and effects comfortable independently of text fitting.
            card.style.setProperty('--sb-fit-scale', String(Math.max(0.75, Math.min(1.5, scale))));
            card.style.setProperty('--sb-font-size', `${size}px`);
            for (const [key, ratio] of [['handle', 0.72], ['pronouns', 0.65], ['tag', 0.60], ['loc', 0.65]]) {
                card.style.setProperty(`--sb-${key}-size`, `${Math.max(2.5, Math.round(size * ratio))}px`);
            }
            card.style.letterSpacing = `${card._speakerLetterSpacing * scale}px`;
        };
        const fits = size => {
            applySize(size);
            if (meta && meta.scrollHeight > meta.clientHeight + 1) return false;
            const contained = content.every(child => {
                const container = child.closest('.cspan-main-row') || card;
                const box = container.getBoundingClientRect(), style = root.getComputedStyle(container);
                const scale = box.width / container.offsetWidth;
                const tolerance = 1.5 * scale;
                const rect = child.getBoundingClientRect();
                return rect.left >= box.left + parseFloat(style.paddingLeft) * scale - tolerance &&
                    rect.right <= box.right - parseFloat(style.paddingRight) * scale + tolerance &&
                    rect.top >= box.top + parseFloat(style.paddingTop) * scale - tolerance &&
                    rect.bottom <= box.bottom - parseFloat(style.paddingBottom) * scale + tolerance &&
                    (!child.matches('.sp-sb-name, .sp-sb-row, .sp-sb-handle') || child.scrollWidth <= child.clientWidth + 1);
            });
            return contained && groups.every(group => {
                const boxes = [...group.children].map(child => child.getBoundingClientRect());
                return boxes.every((a, i) => boxes.slice(i + 1).every(b =>
                    a.right <= b.left + 0.5 || b.right <= a.left + 0.5 ||
                    a.bottom <= b.top + 0.5 || b.bottom <= a.top + 0.5));
            });
        };
        let lo = Math.min(4, base), hi = card._speakerAutoSize ? Math.min(160, card.clientHeight) : base;
        if (fits(hi)) return;
        while (hi - lo > 0.5) {
            const mid = (lo + hi) / 2;
            if (fits(mid)) lo = mid;
            else hi = mid;
        }
        applySize(lo);
    }

    function renderSpeakerBadge(node, element, options = {}) {
        ensureSpeakerBadgeStyle();
        const b = element.speakerBadge || {};
        const sp = b.speaker || {};
        const callIn = sp.callIn || {};
        const re = b.reaction || {};
        const s = element.style || {};
        const layout = b.layout || 'horizontal';
        const speaking = Boolean(options.speaking);

        const activeColor = re.activeColor || '#6366f1';
        const glowSpread = Math.max(0, Number(re.glowSpread ?? 14) || 0);
        const barColor = re.visualizerColor === 'match' ? activeColor : (re.visualizerColor || activeColor);

        // Keep the outer host node clean so canvas/runtime geometry & selection remain intact
        node.style.padding = '0';
        node.style.background = 'transparent';
        node.style.border = '0';
        node.style.boxShadow = 'none';
        node.style.overflow = 'visible';

        // Find or create the inner .sp-sb-card
        let card = node.querySelector(':scope > .sp-sb-card');
        if (!card) {
            node.replaceChildren();
            card = document.createElement('div');
            node.appendChild(card);
        }

        const hasHighlight = re.highlightBorder !== false;
        const hasPop = re.motionPop !== false;
        const hasDim = Boolean(re.dimWhenIdle);

        // Apply classes and CSS variables to the inner card
        card.className = `sp-sb-card layout-${layout} ${speaking ? 'is-speaking' : 'is-idle'}${b.autoSize !== false ? ' is-auto-size' : ''}${hasHighlight ? ' has-highlight' : ''}${hasPop ? ' has-pop' : ''}${hasDim ? ' has-dim' : ''}`;
        card.style.setProperty('--sb-active-color', activeColor);
        card.style.setProperty('--sb-glow-spread', `${glowSpread}px`);
        card.style.setProperty('--sb-active-glow', activeColor + (activeColor.length === 7 ? '55' : ''));
        card.style.setProperty('--sb-idle-opacity', String(re.idleOpacity ?? 0.7));
        card.style.setProperty('--sb-bar-color', barColor);
        card.style.setProperty('--cspan-status-color', callIn.statusColor || '#22c55e');
        card.style.setProperty('--sb-avatar-scale', String(Math.max(0.5, Math.min(2, Number(sp.avatarScale) || 1))));
        card.style.setProperty('--sb-icon-scale', String(Math.max(0.5, Math.min(1.8, Number(sp.iconScale) || 1))));
        card.style.setProperty('--sb-fit-scale', '1');
        const padding = layout === 'horizontal' ? [16, 10] : layout === 'compact-pill' ? [14, 6] : layout === 'vertical-card' ? [12, 14] : [12, 6];
        card.style.setProperty('--sb-padding-x', `${b.paddingX ?? padding[0]}px`);
        card.style.setProperty('--sb-padding-y', `${b.paddingY ?? padding[1]}px`);
        card.style.setProperty('--sb-subtitle-font', b.typography?.subtitleFontFamily || 'inherit');
        card.style.setProperty('--sb-pill-font', b.typography?.pillFontFamily || 'inherit');
        for (const font of [b.typography?.subtitleFontFamily, b.typography?.pillFontFamily]) if (font) loadGoogleFont(font);

        // Typography & proportional font scaling
        const defaultFs = layout === 'cspan-banner' ? 18 : layout === 'compact-pill' ? 14 : layout === 'vertical-card' ? 16 : 17;
        const fs = Number(s.fontSize) > 0 ? Number(s.fontSize) : defaultFs;
        card._speakerAutoSize = b.autoSize !== false;
        card._speakerBaseFontSize = card._speakerAutoSize ? defaultFs : fs;
        card._speakerLetterSpacing = Number(s.letterSpacing) || 0;
        if (layout !== 'avatar-only' && root.requestAnimationFrame) {
            const scheduleFit = () => {
                if (node._speakerFitFrame) root.cancelAnimationFrame(node._speakerFitFrame);
                node._speakerFitFrame = root.requestAnimationFrame(() => {
                    node._speakerFitFrame = 0;
                    fitSpeakerBadge(node);
                });
            };
            scheduleFit();
            if (!node._fitObserver && root.ResizeObserver) {
                node._fitObserver = new root.ResizeObserver(scheduleFit);
                node._fitObserver.observe(node);
            }
        }
        card.style.setProperty('--sb-font-size', `${fs}px`);
        card.style.setProperty('--sb-handle-size', `${Math.max(9, Math.round(fs * 0.72))}px`);
        card.style.setProperty('--sb-pronouns-size', `${Math.max(9, Math.round(fs * 0.65))}px`);
        card.style.setProperty('--sb-tag-size', `${Math.max(8, Math.round(fs * 0.60))}px`);
        card.style.setProperty('--sb-loc-size', `${Math.max(8, Math.round(fs * 0.65))}px`);
        card.style.setProperty('--sb-line-height', String(Number(s.lineHeight) > 0 ? s.lineHeight : 1.2));
        const textAlign = s.textAlign || (layout === 'vertical-card' ? 'center' : 'left');
        card.style.setProperty('--sb-justify', textAlign === 'right' ? 'flex-end' : textAlign === 'center' ? 'center' : 'flex-start');
        card.style.setProperty('--sb-valign', s.verticalAlign === 'top' ? 'flex-start' : s.verticalAlign === 'bottom' ? 'flex-end' : 'center');
        card.style.letterSpacing = `${Number(s.letterSpacing) || 0}px`;
        if (s.fontWeight) {
            card.style.setProperty('--sb-font-weight', String(s.fontWeight));
        } else if (card.style.removeProperty) {
            card.style.removeProperty('--sb-font-weight');
        } else {
            card.style.setProperty('--sb-font-weight', '');
        }
        card.style.color = s.color || '#ffffff';
        if (s.fontFamily) {
            card.style.fontFamily = s.fontFamily;
            loadGoogleFont(s.fontFamily);
        } else {
            card.style.fontFamily = '';
        }
        card.style.textAlign = textAlign;

        // Apply style background, borders, blur, and shadows to card (unless avatar-only)
        if (layout === 'avatar-only') {
            card.style.background = 'transparent';
            card.style.backgroundImage = 'none';
            card.style.backgroundSize = '';
            card.style.animation = '';
            card.style.borderColor = 'transparent';
            card.style.borderWidth = '0';
            card.style.borderRadius = '0';
            card.style.setProperty('--sb-base-shadow', 'none');
            card.style.backdropFilter = '';
            card.style.webkitBackdropFilter = '';
        } else {
            // Background fill & gradient
            if (s.gradient?.enabled) {
                const gradStyle = gradientStyle(s.gradient);
                card.style.background = gradStyle.background;
                card.style.backgroundSize = gradStyle.backgroundSize;
                card.style.animation = gradStyle.animation;
            } else if (s.background !== undefined && s.background !== '') {
                card.style.background = s.background;
                card.style.backgroundImage = 'none';
                card.style.backgroundSize = '';
                card.style.animation = '';
            } else {
                card.style.background = 'rgba(18, 18, 26, 0.9)';
                card.style.backgroundImage = 'none';
                card.style.backgroundSize = '';
                card.style.animation = '';
            }

            card.style.borderColor = s.borderColor || 'rgba(255, 255, 255, 0.12)';
            card.style.borderWidth = `${s.borderWidth != null && s.borderWidth !== '' ? s.borderWidth : 2}px`;
            card.style.borderStyle = s.borderStyle || 'solid';
            card.style.borderRadius = layout === 'compact-pill' ? '999px' : `${s.borderRadius != null && s.borderRadius !== '' ? s.borderRadius : 14}px`;

            if (Number(s.blur) > 0) {
                card.style.backdropFilter = `blur(${s.blur}px)`;
                card.style.webkitBackdropFilter = `blur(${s.blur}px)`;
            } else {
                card.style.backdropFilter = '';
                card.style.webkitBackdropFilter = '';
            }

            if (s.shadow && (Number(s.shadow.blur) > 0 || Number(s.shadow.spread) > 0 || Number(s.shadow.x) || Number(s.shadow.y))) {
                const sh = s.shadow;
                card.style.setProperty('--sb-base-shadow', `${sh.x || 0}px ${sh.y != null ? sh.y : 4}px ${sh.blur || 0}px ${sh.spread || 0}px ${sh.color || 'rgba(0,0,0,0.5)'}`);
            } else {
                card.style.setProperty('--sb-base-shadow', '0 4px 16px rgba(0,0,0,0.25)');
            }
        }

        card.replaceChildren();

        // 1. Avatar
        const avatarShape = sp.avatarShape || 'circle';
        const avatarWrap = document.createElement('div');
        avatarWrap.className = `sp-sb-avatar-wrap shape-${avatarShape}`;

        const isCallIn = layout === 'cspan-banner' || callIn.enabled;
        if (sp.avatarSrc) {
            const img = document.createElement('img');
            img.className = `sp-sb-avatar shape-${avatarShape}`;
            img.src = sp.avatarSrc;
            img.alt = sp.name || 'Speaker avatar';
            img.draggable = false;
            avatarWrap.appendChild(img);
        } else {
            const placeholder = document.createElement('div');
            placeholder.className = `sp-sb-avatar-placeholder shape-${avatarShape}`;
            if (isCallIn) {
                // Inline phone icon for call-in / C-SPAN (Strict No-Emoji Policy)
                placeholder.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>';
            } else {
                // Inline user profile icon (Strict No-Emoji Policy)
                placeholder.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>';
            }
            avatarWrap.appendChild(placeholder);
        }

        if (re.visualizer === 'pulse-ring' || re.visualizer === 'both' || layout === 'avatar-only') {
            const ring = document.createElement('div');
            ring.className = 'sp-sb-pulse-ring';
            avatarWrap.appendChild(ring);
        }

        const buildEqBars = (customClass = '') => {
            if (re.visualizer !== 'bars' && re.visualizer !== 'both') return null;
            const barContainer = document.createElement('div');
            barContainer.className = `sp-sb-eq-bars ${customClass}`.trim();
            const count = Math.max(3, Math.min(8, Number(re.barCount) || 5));
            for (let i = 0; i < count; i++) {
                const bar = document.createElement('span');
                bar.className = 'sp-sb-eq-bar';
                barContainer.appendChild(bar);
            }
            return barContainer;
        };

        const buildCallInPill = (size = 'normal') => {
            if (!callIn.enabled) return null;
            const pill = document.createElement('span');
            pill.className = `sp-sb-callin-tag size-${size}`;

            const dot = document.createElement('span');
            dot.className = 'cspan-live-dot';
            pill.appendChild(dot);

            const label = document.createElement('span');
            label.className = 'cspan-status-label';
            label.textContent = callIn.statusText || 'ON THE LINE';
            pill.appendChild(label);

            return pill;
        };

        const buildLocationEl = () => {
            if (callIn.showLocation === false || !callIn.location) return null;
            const loc = document.createElement('span');
            loc.className = 'sp-sb-location';
            loc.innerHTML = '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-1px;margin-right:2px;opacity:0.85;"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>';
            const txt = document.createElement('span');
            txt.textContent = callIn.location;
            loc.appendChild(txt);
            return loc;
        };

        // Layout 5: Avatar Only
        if (layout === 'avatar-only') {
            card.appendChild(avatarWrap);
            const eq = buildEqBars('avatar-corner-eq');
            if (eq) card.appendChild(eq);
            return;
        }

        // Layout 2: C-SPAN Banner
        if (layout === 'cspan-banner') {
            const header = document.createElement('div');
            header.className = 'cspan-header-bar';

            const statusTag = document.createElement('span');
            statusTag.className = 'cspan-status-tag';

            const dot = document.createElement('span');
            dot.className = 'cspan-live-dot';
            statusTag.appendChild(dot);

            const statusLabel = document.createElement('span');
            statusLabel.className = 'cspan-status-label';
            statusLabel.textContent = callIn.statusText || 'ON THE LINE';
            statusTag.appendChild(statusLabel);
            header.appendChild(statusTag);

            if (callIn.showLocation !== false && callIn.location) {
                const loc = document.createElement('span');
                loc.className = 'cspan-location';
                loc.textContent = callIn.location;
                header.appendChild(loc);
            }
            card.appendChild(header);

            const mainRow = document.createElement('div');
            mainRow.className = 'cspan-main-row';

            if (sp.showAvatar !== false) {
                mainRow.appendChild(avatarWrap);
            }

            const meta = document.createElement('div');
            meta.className = 'sp-sb-meta';

            const nameRow = document.createElement('div');
            nameRow.className = 'sp-sb-row';

            const nameEl = document.createElement('span');
            nameEl.className = 'sp-sb-name';
            nameEl.textContent = sp.name || 'Caller';
            nameRow.appendChild(nameEl);
            const detailsRow = document.createElement('div');
            detailsRow.className = 'sp-sb-row sp-sb-details';

            if (sp.showPronouns !== false && sp.pronouns) {
                const pro = document.createElement('span');
                pro.className = 'sp-sb-pronouns';
                pro.textContent = sp.pronouns;
                detailsRow.appendChild(pro);
            }
            meta.appendChild(nameRow);
            if (detailsRow.hasChildNodes()) meta.appendChild(detailsRow);

            if (sp.showHandle !== false && sp.handle) {
                const hEl = document.createElement('span');
                hEl.className = 'sp-sb-handle';
                hEl.textContent = sp.handle;
                meta.appendChild(hEl);
            }
            mainRow.appendChild(meta);

            const eq = buildEqBars();
            if (eq) mainRow.appendChild(eq);

            card.appendChild(mainRow);
            return;
        }

        // Layout 4: Vertical Sidebar Card
        if (layout === 'vertical-card') {
            if (sp.showAvatar !== false) {
                card.appendChild(avatarWrap);
            }

            const callPill = buildCallInPill('small');

            const meta = document.createElement('div');
            meta.className = 'sp-sb-meta';

            const nameRow = document.createElement('div');
            nameRow.className = 'sp-sb-row';

            const nameEl = document.createElement('span');
            nameEl.className = 'sp-sb-name';
            nameEl.textContent = sp.name || 'Speaker';
            nameRow.appendChild(nameEl);
            const detailsRow = document.createElement('div');
            detailsRow.className = 'sp-sb-row sp-sb-details';

            if (sp.showPronouns !== false && sp.pronouns) {
                const pro = document.createElement('span');
                pro.className = 'sp-sb-pronouns';
                pro.textContent = sp.pronouns;
                detailsRow.appendChild(pro);
            }
            if (callPill) detailsRow.appendChild(callPill);
            meta.appendChild(nameRow);
            if (detailsRow.hasChildNodes()) meta.appendChild(detailsRow);

            const subRow = document.createElement('div');
            subRow.className = 'sp-sb-row sp-sb-subrow';

            if (sp.showHandle !== false && sp.handle) {
                const hEl = document.createElement('span');
                hEl.className = 'sp-sb-handle';
                hEl.textContent = sp.handle;
                subRow.appendChild(hEl);
            }

            const loc = buildLocationEl();
            if (loc) subRow.appendChild(loc);

            if (subRow.hasChildNodes()) meta.appendChild(subRow);
            card.appendChild(meta);

            const eq = buildEqBars();
            if (eq) card.appendChild(eq);
            return;
        }

        // Layout 3: Compact Pill
        if (layout === 'compact-pill') {
            if (sp.showAvatar !== false) {
                card.appendChild(avatarWrap);
            }

            const callPill = buildCallInPill('compact');

            const meta = document.createElement('div');
            meta.className = 'sp-sb-meta';

            const nameRow = document.createElement('div');
            nameRow.className = 'sp-sb-row';

            const nameEl = document.createElement('span');
            nameEl.className = 'sp-sb-name';
            nameEl.textContent = sp.name || 'Speaker';
            nameRow.appendChild(nameEl);
            const detailsRow = document.createElement('div');
            detailsRow.className = 'sp-sb-row sp-sb-details';
            const subRow = document.createElement('div');
            subRow.className = 'sp-sb-row sp-sb-subrow';

            if (sp.showPronouns !== false && sp.pronouns) {
                const pro = document.createElement('span');
                pro.className = 'sp-sb-pronouns';
                pro.textContent = sp.pronouns;
                detailsRow.appendChild(pro);
            }
            if (callPill) detailsRow.appendChild(callPill);

            if (sp.showHandle !== false && sp.handle) {
                const hEl = document.createElement('span');
                hEl.className = 'sp-sb-handle';
                hEl.textContent = sp.handle;
                subRow.appendChild(hEl);
            }

            const loc = buildLocationEl();
            if (loc) subRow.appendChild(loc);

            meta.appendChild(nameRow);
            if (detailsRow.hasChildNodes()) meta.appendChild(detailsRow);
            if (subRow.hasChildNodes()) meta.appendChild(subRow);
            card.appendChild(meta);

            const eq = buildEqBars();
            if (eq) card.appendChild(eq);
            return;
        }

        // Layout 1: Horizontal Lower-Third (Default)
        if (sp.showAvatar !== false) {
            card.appendChild(avatarWrap);
        }

        const meta = document.createElement('div');
        meta.className = 'sp-sb-meta';

        const nameRow = document.createElement('div');
        nameRow.className = 'sp-sb-row';

        const nameEl = document.createElement('span');
        nameEl.className = 'sp-sb-name';
        nameEl.textContent = sp.name || 'Speaker';
        nameRow.appendChild(nameEl);
        const detailsRow = document.createElement('div');
        detailsRow.className = 'sp-sb-row sp-sb-details';

        if (sp.showPronouns !== false && sp.pronouns) {
            const pro = document.createElement('span');
            pro.className = 'sp-sb-pronouns';
            pro.textContent = sp.pronouns;
            detailsRow.appendChild(pro);
        }

        const callPill = buildCallInPill('normal');
        if (callPill) detailsRow.appendChild(callPill);

        meta.appendChild(nameRow);
        if (detailsRow.hasChildNodes()) meta.appendChild(detailsRow);

        const subRow = document.createElement('div');
        subRow.className = 'sp-sb-row sp-sb-subrow';

        if (sp.showHandle !== false && sp.handle) {
            const hEl = document.createElement('span');
            hEl.className = 'sp-sb-handle';
            hEl.textContent = sp.handle;
            subRow.appendChild(hEl);
        }

        const loc = buildLocationEl();
        if (loc) subRow.appendChild(loc);

        if (subRow.hasChildNodes()) meta.appendChild(subRow);
        card.appendChild(meta);

        const eq = buildEqBars();
        if (eq) card.appendChild(eq);
    }

    root.OverlayShared = { cleanupMedia, cleanupNode, alertSample, ALERT_SAMPLE, ALERT_SAMPLE_IMAGE, setEffectsPaused, isListKey, isListFormat, LIST_FORMAT_PRESETS, applyBorderEffects, BORDER_STYLES, BORDER_ANIM_TYPES, applyBorderGradient, hasBoxFill, textEffectStyle, wrapMarquee, fitText, refreshTextSources, pruneSourceCaches, textSourceState, textSourceKey, elementContent, elementItems, qrUrl, renderIcon, prepareAlertNode, playAlert, playBuiltinSound, playSoundValue, resolveSoundUrl, zzfxSamples, BUILTIN_SOUNDS, renderGameList, renderSpeakerBadge, matchesPeriodFilter, matchesPeriodToken, mountSlideshow, slideshowItems, mountPattern, decorationStyle, renderProgress, GOOGLE_FONTS, VARIABLE_GROUPS, variableGroups, variableTable, formatDuration, formatDate, applyFormat, isDateKey, FORMAT_PRESETS, hasTicking, loadLiveExtras, assetFonts, loadAssetFonts, expandVariables, variableSnapshot, renderMarkdown, loadGoogleFont, parseYouTubeUrl, embedUrl, applyMediaFilter, shadowClipStyle };
    root.OverlayShared.borderPlacement = borderPlacement;
    Object.assign(root.OverlayShared, { ALERT_PRESENTATION_KEYS, resolveAlertLook });
})(window);

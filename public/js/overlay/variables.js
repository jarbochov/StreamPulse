
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

const MATCHUP_ITEMS = [
    ['matchup.title', 'Event / matchup title (e.g. Grand Finals)'],
    ['matchup.phase', 'Phase / round (e.g. Winners Finals)'],
    ['matchup.format', 'Match format (e.g. Best of 5)'],
    ['matchup.status', 'Matchup status (ACTIVE, PAUSED, COMPLETED)'],
    ['matchup.winner', 'Winner name (when completed)'],
    ['matchup.clock', 'Matchup clock (e.g. 14:20)'],
    ['matchup.player1.name', 'Player 1 / Competitor 1 name'],
    ['matchup.player1.score', 'Player 1 score'],
    ['matchup.player1.tag', 'Player 1 team / tag / country'],
    ['matchup.player1.color', 'Player 1 accent color'],
    ['matchup.player2.name', 'Player 2 / Competitor 2 name'],
    ['matchup.player2.score', 'Player 2 score'],
    ['matchup.player2.tag', 'Player 2 team / tag / country'],
    ['matchup.player2.color', 'Player 2 accent color']
];

const TOURNAMENT_ITEMS = [
    ['tournament.title', 'Tournament title'],
    ['tournament.format', 'Format (singleElimination, doubleElimination, roundRobin)'],
    ['tournament.status', 'Tournament status (ACTIVE, PENDING, COMPLETED)'],
    ['tournament.champion', 'Champion / tournament winner name'],
    ['tournament.match.current', 'Current match description (e.g. Alice vs Bob)'],
    ['tournament.match.round', 'Current match round name (e.g. Semifinals)'],
    ['tournament.match.entrant1', 'Current match entrant 1 name'],
    ['tournament.match.entrant1.score', 'Current match entrant 1 score'],
    ['tournament.match.entrant2', 'Current match entrant 2 name'],
    ['tournament.match.entrant2.score', 'Current match entrant 2 score']
];

const TRIVIA_ITEMS = [
    ['trivia.question', 'Active question text'],
    ['trivia.category', 'Active question category'],
    ['trivia.phase', 'Trivia phase (question / reveal / finished / idle)'],
    ['trivia.number', 'Current question number (e.g. 1)'],
    ['trivia.total', 'Total number of questions'],
    ['trivia.answer', 'Correct answer text (when revealed)'],
    ['trivia.funfact', 'Fun fact / explanation (when revealed)'],
    ['trivia.timer', 'Remaining question time (e.g. 15s)'],
    ['trivia.votes', 'Total votes cast on active question'],
    ['trivia.choice.1', 'Choice 1 (A) text'],
    ['trivia.choice.1.votes', 'Choice 1 vote count'],
    ['trivia.choice.1.percent', 'Choice 1 percent (e.g. 45%)'],
    ['trivia.choice.2', 'Choice 2 (B) text'],
    ['trivia.choice.2.votes', 'Choice 2 vote count'],
    ['trivia.choice.2.percent', 'Choice 2 percent'],
    ['trivia.choice.3', 'Choice 3 (C) text'],
    ['trivia.choice.3.votes', 'Choice 3 vote count'],
    ['trivia.choice.3.percent', 'Choice 3 percent'],
    ['trivia.choice.4', 'Choice 4 (D) text'],
    ['trivia.choice.4.votes', 'Choice 4 vote count'],
    ['trivia.choice.4.percent', 'Choice 4 percent'],
    ['trivia.choice.5', 'Choice 5 (E) text'],
    ['trivia.choice.5.votes', 'Choice 5 vote count'],
    ['trivia.choice.5.percent', 'Choice 5 percent'],
    ['trivia.choice.6', 'Choice 6 (F) text'],
    ['trivia.choice.6.votes', 'Choice 6 vote count'],
    ['trivia.choice.6.percent', 'Choice 6 percent']
];

const TIER_LIST_ITEMS = [
    ['tier_list.title', 'Tier list title'],
    ['tier_list.item', 'Current voting item name'],
    ['tier_list.item_image', 'Current voting item image URL (use as an image source)'],
    ['tier_list.vote_status', 'Vote status (active / locked / completed / idle)'],
    ['tier_list.vote_timer', 'Remaining voting time (e.g. 45s)'],
    ['tier_list.consensus_tier', 'Current winning / consensus tier label (e.g. S)'],
    ['tier_list.consensus_percent', 'Percentage agreement for consensus tier (e.g. 78%)'],
    ['tier_list.total_votes', 'Total votes cast on active item']
];

const SUBATHON_ITEMS = [
    ['subathon.total_added', 'Total time added to subathon (e.g. 4h 25m)'],
    ['subathon.multiplier', 'Active Happy Hour multiplier (e.g. 2x) or empty'],
    ['subathon.happy_hour', 'Happy Hour status (true / false)'],
    ['subathon.subs', 'Total subscriptions credited to subathon'],
    ['subathon.bits', 'Total cheer bits credited to subathon'],
    ['subathon.donations', 'Total tips/donations credited to subathon'],
    ['subathon.follows', 'Total follows credited to subathon'],
    ['subathon.raids', 'Total raids credited to subathon'],
    ['subathon.rule.tier1', 'Configured Tier 1 Sub rate (e.g. 2m 00s)'],
    ['subathon.rule.tier2', 'Configured Tier 2 Sub rate (e.g. 4m 00s)'],
    ['subathon.rule.tier3', 'Configured Tier 3 Sub rate (e.g. 10m 00s)'],
    ['subathon.rule.tip_rate', 'Configured tip rate (e.g. 1m 00s / $1.00)'],
    ['subathon.rule.bits_rate', 'Configured bits rate (e.g. 30s / 100 bits)'],
    ['subathon.rule.follow', 'Configured follow rate (e.g. 15s)'],
    ['subathon.rule.summary', 'One-line summary of all active subathon rates']
];

// Values that change every second are refreshed in place instead of re-rendering the overlay.
// Live counters change constantly, so they refresh their text in place instead of re-rendering (and flashing) the whole overlay.
const TICKING = /^(now$|time|date|weekday|month|year|uptime|session\.duration|timer\.|music\.(position|remaining|percent)$|category\.|viewers?\.|chatters$|messages$|poll\.|tier_list\.vote_timer|trivia\.timer|matchup\.clock)/;
const isTicking = name => TICKING.test(name);
const hasTicking = value => /\{\{\s*(now|time|date|weekday|month|year|uptime|session\.duration|timer\.|music\.(position|remaining|percent)|category\.|viewers?\.|chatters|messages|poll\.|tier_list\.vote_timer|trivia\.timer|matchup\.clock)/.test(String(value ?? ''));

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

// External host data (host variables): {{rep.<bundle>.<name>.<path>}}, arrays by index.
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
        if (items.length) groups.push({ label: `Host: ${key}`, items });
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
    groups.push({ label: 'Versus / Matchup', items: MATCHUP_ITEMS });
    groups.push({ label: 'Tournament / Brackets', items: TOURNAMENT_ITEMS });
    groups.push({ label: 'Trivia Studio', items: TRIVIA_ITEMS });
    groups.push({ label: 'Tier List', items: TIER_LIST_ITEMS });
    groups.push({ label: 'Subathon Rates & Stats', items: SUBATHON_ITEMS });
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

function matchupValues(status) {
    const m = status?.matchup;
    if (!m) return {};
    const c1 = m.competitors?.[0];
    const c2 = m.competitors?.[1];

    return {
        'matchup.title': m.title || '',
        'matchup.phase': m.phase || '',
        'matchup.round': m.phase || '',
        'matchup.format': m.format || '',
        'matchup.status': m.status || '',
        'matchup.winner': m.winner || '',
        'matchup.clock': m.clock?.formatted || '',
        'matchup.player1.name': c1?.name || '',
        'matchup.player1.score': c1?.score !== undefined ? c1.score : '',
        'matchup.player1.tag': c1?.tag || '',
        'matchup.player1.color': c1?.color || '',
        'matchup.c1_name': c1?.name || '',
        'matchup.c1_score': c1?.score !== undefined ? c1.score : '',
        'matchup.player2.name': c2?.name || '',
        'matchup.player2.score': c2?.score !== undefined ? c2.score : '',
        'matchup.player2.tag': c2?.tag || '',
        'matchup.player2.color': c2?.color || '',
        'matchup.c2_name': c2?.name || '',
        'matchup.c2_score': c2?.score !== undefined ? c2.score : ''
    };
}

function tournamentValues(status) {
    const t = status?.tournament || status?.pollTournament;
    if (!t) return {};
    const match = t.activeMatch;
    const e1 = match?.entrant1;
    const e2 = match?.entrant2;
    const matchTitle = (e1?.name && e2?.name) ? `${e1.name} vs ${e2.name}` : (match?.title || '');
    const roundText = match?.roundName || (match?.round !== undefined ? `Round ${match.round}` : '');

    return {
        'tournament.title': t.title || '',
        'tournament.format': t.format || '',
        'tournament.status': t.status || '',
        'tournament.champion': t.champion?.name || t.winner?.name || (typeof t.champion === 'string' ? t.champion : '') || (typeof t.winner === 'string' ? t.winner : ''),
        'tournament.match.current': matchTitle,
        'tournament.match.round': roundText,
        'tournament.round': roundText,
        'tournament.match.entrant1': e1?.name || '',
        'tournament.match.entrant1.score': match?.e1Score !== undefined ? match.e1Score : (e1?.score !== undefined ? e1.score : ''),
        'tournament.match.entrant2': e2?.name || '',
        'tournament.match.entrant2.score': match?.e2Score !== undefined ? match.e2Score : (e2?.score !== undefined ? e2.score : '')
    };
}

function triviaValues(status, now = Date.now()) {
    const t = status?.trivia;
    if (!t) return {};
    const active = t.activeQuestion;
    const isReveal = t.status === 'reveal';

    let timerText = '';
    if (t.status === 'question' && active?.endsAt) {
        const remaining = Math.max(0, Math.ceil((active.endsAt - now) / 1000));
        timerText = `${remaining}s`;
    } else if (t.remainingSeconds !== undefined && t.status === 'question') {
        timerText = `${t.remainingSeconds}s`;
    }

    let answerText = '';
    let funfactText = '';
    if (isReveal && active) {
        funfactText = active.funfact || '';
        if (active.correctIndex !== null && active.correctIndex !== undefined && Array.isArray(active.choices)) {
            const correctChoice = active.choices[active.correctIndex];
            answerText = typeof correctChoice === 'string' ? correctChoice : (correctChoice?.text || '');
        }
    }

    const out = {
        'trivia.question': active?.question || t.activeQuestionText || '',
        'trivia.category': active?.category || t.activeCategory || '',
        'trivia.phase': t.status || 'idle',
        'trivia.number': t.currentIndex !== undefined && t.currentIndex >= 0 ? t.currentIndex + 1 : '',
        'trivia.total': t.totalQuestions !== undefined ? t.totalQuestions : '',
        'trivia.answer': answerText,
        'trivia.funfact': funfactText,
        'trivia.timer': timerText,
        'trivia.votes': active?.totalVotes !== undefined ? active.totalVotes : (t.totalVotes || '')
    };

    const choices = active?.choices || [];
    for (let i = 0; i < 6; i++) {
        const idx = i + 1;
        const c = choices[i];
        out[`trivia.choice.${idx}`] = c ? (typeof c === 'string' ? c : (c.text || '')) : '';
        out[`trivia.choice.${idx}.votes`] = c && c.votes !== undefined ? c.votes : '';
        out[`trivia.choice.${idx}.percent`] = c && c.percent !== undefined ? `${c.percent}%` : '';
    }

    return out;
}

function tierListValues(status, now = Date.now()) {
    const tl = status?.tierList;
    if (!tl) return {};
    const vote = tl.activeVote;
    const consensus = vote?.consensus;
    const tier = consensus?.consensusTier;

    let timerText = '';
    if (vote && vote.status === 'ACTIVE' && vote.endsAt) {
        const remaining = Math.max(0, Math.ceil((vote.endsAt - now) / 1000));
        const m = Math.floor(remaining / 60);
        const s = remaining % 60;
        timerText = m > 0 ? `${m}:${pad(s)}` : `${s}s`;
    } else if (vote?.status === 'LOCKED') {
        timerText = 'Locked';
    }

    return {
        'tier_list.title': tl.title || '',
        'tier_list.item': vote?.itemName || '',
        'tier_list.item_image': vote?.itemImage || '',
        'tier_list.vote_status': vote?.status ? vote.status.toLowerCase() : 'idle',
        'tier_list.vote_timer': timerText,
        'tier_list.consensus_tier': tier?.label || '',
        'tier_list.consensus_percent': consensus?.agreementPercent !== undefined ? `${consensus.agreementPercent}%` : '',
        'tier_list.total_votes': consensus?.totalVotes !== undefined ? consensus.totalVotes : (vote?.totalVotes || '')
    };
}

function subathonValues(status) {
    const sb = status?.subathon;
    if (!sb || !sb.enabled) return {};
    const totalSec = Number(sb.totalAddedSeconds) || 0;
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const totalFormatted = h > 0 ? `${h}h ${m}m` : `${m}m`;

    return {
        'subathon.total_added': totalFormatted,
        'subathon.multiplier': sb.multiplier || '',
        'subathon.happy_hour': sb.happyHour ? 'true' : 'false',
        'subathon.subs': sb.totalSubs !== undefined ? String(sb.totalSubs) : '',
        'subathon.bits': sb.totalBits !== undefined ? String(sb.totalBits) : '',
        'subathon.donations': sb.totalDonations !== undefined ? String(sb.totalDonations) : '',
        'subathon.follows': sb.totalFollows !== undefined ? String(sb.totalFollows) : '',
        'subathon.raids': sb.totalRaids !== undefined ? String(sb.totalRaids) : '',
        'subathon.rule.tier1': sb.subTier1Formatted || '',
        'subathon.rule.tier2': sb.subTier2Formatted || '',
        'subathon.rule.tier3': sb.subTier3Formatted || '',
        'subathon.rule.tip_rate': sb.tipRateFormatted || '',
        'subathon.rule.bits_rate': sb.bitsRateFormatted || '',
        'subathon.rule.follow': sb.followFormatted || '',
        'subathon.rule.summary': sb.rulesSummary || ''
    };
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
        ...matchupValues(status),
        ...tournamentValues(status),
        ...triviaValues(status, now),
        ...tierListValues(status, now),
        ...subathonValues(status),
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

export { FORMAT_PRESETS, LIST_FORMAT_PRESETS, VARIABLE_GROUPS, applyFormat, expandVariables, formatDate, formatDuration, hasTicking, inPlanList, isDateKey, isListFormat, isListKey, loadLiveExtras, variableGroups, variableSnapshot, variableTable };

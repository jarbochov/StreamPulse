(function(root) {
    const GOOGLE_FONTS = ['Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Oswald', 'Poppins', 'Raleway', 'Merriweather', 'Playfair Display', 'Bebas Neue', 'Fira Code', 'Silkscreen'];
    const googleFontSet = new Set(GOOGLE_FONTS);

    const VARIABLE_GROUPS = [
        { label: 'Viewers', items: [['viewers.current', 'Current viewers'], ['viewers.peak', 'Peak viewers'], ['viewers.average', 'Average viewers']] },
        { label: 'Chat', items: [['chatters', 'Chatters'], ['messages', 'Messages'], ['followers', 'Followers (current total)'], ['followers.session', 'New followers this session'], ['subscribers', 'Subscribers (current total)'], ['subscribers.session', 'Subscribers seen this session']] },
        { label: 'Engagement', items: [['gift_subs', 'Gift subs this session'], ['gift_subs.total', 'Gift subs (lifetime)'], ['bits', 'Bits this session'], ['bits.total', 'Bits (lifetime)'], ['donations', 'Donations this session'], ['donations.total', 'Donations (lifetime)']] },
        { label: 'Hashtags', items: [['hashtags.top', 'Most popular hashtag overall'], ['hashtags.session_top', 'Most popular hashtag this session'], ['hashtags.total', 'Total hashtag mentions']] },
        { label: 'Stream', items: [['music.title', 'Music title'], ['music.artist', 'Music artist'], ['stream.title', 'Stream title'], ['overlay.name', 'Overlay name']] }
    ];

    const CLOCK_ITEMS = [['time', 'Time (e.g. 3:07 PM)'], ['time.24', 'Time, 24-hour'], ['time.seconds', 'Time with seconds'], ['date', 'Date (short)'], ['date.long', 'Date (long)'], ['weekday', 'Weekday'], ['month', 'Month'], ['year', 'Year'], ['uptime', 'Stream uptime (H:MM:SS)']];
    const EVENT_ITEMS = [['latest.follower', 'Latest follower'], ['latest.subscriber', 'Latest subscriber'], ['latest.gifter', 'Latest gift sub gifter'], ['latest.cheer', 'Latest cheerer'], ['latest.cheer.amount', 'Latest cheer amount'], ['latest.donation', 'Latest donor'], ['latest.donation.amount', 'Latest donation amount'], ['latest.raider', 'Latest raider'], ['latest.raider.viewers', 'Latest raid size'], ['chatter.top', 'Top chatter this session'], ['chatter.top.count', 'Top chatter message count']];
    // Values that change every second are refreshed in place instead of re-rendering the overlay.
    const TICKING = /^(time|date|weekday|month|year|uptime|timer\.)/;
    const isTicking = name => TICKING.test(name);
    const hasTicking = value => /\{\{\s*(time|date|weekday|month|year|uptime|timer\.)/.test(String(value ?? ''));

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
            out[`timer.${id}.label`] = timer.label;
            out[`timer.${id}.state`] = timer.state;
            out[`timer.${id}.percent`] = percent;
        }
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
            'uptime': started ? clock(now - started) : ''
        };
    }

    // Static groups plus the timers and goals that currently exist.
    function variableGroups(status = {}) {
        const groups = VARIABLE_GROUPS.map(g => ({ label: g.label, items: g.items.slice() }));
        groups.push({ label: 'Clock', items: CLOCK_ITEMS });
        groups.push({ label: 'Latest events', items: EVENT_ITEMS });
        for (const [id, timer] of Object.entries(status.timerData?.timers || {})) {
            const items = [[`timer.${id}`, `${timer.label} — clock`], [`timer.${id}.label`, `${timer.label} — title`], [`timer.${id}.state`, `${timer.label} — state`]];
            if (timer.kind === 'countdown') items.push([`timer.${id}.percent`, `${timer.label} — percent complete`]);
            groups.push({ label: `Timer: ${timer.label}`, items });
        }
        for (const goal of status.goalItems || []) {
            groups.push({ label: `Goal: ${goal.title}`, items: [['title', 'title'], ['current', 'current progress'], ['target', 'target'], ['percent', 'percent'], ['remaining', 'remaining']].map(([key, label]) => [`goal.${goal.id}.${key}`, `${goal.title} — ${label}`]) });
        }
        return groups;
    }

    function variableTable(status = {}, context = {}, now = Date.now()) {
        return {
            ...clockValues(status, now),
            ...eventValues(status),
            ...goalValues(status),
            ...timerValues(status, now),
            'stream.category': status.streamInfo?.[status.streamInfo.length - 1]?.category,
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

    // keepEmpty leaves {{token}} in place when no live value exists, which keeps editor previews selectable.
    function expandVariables(value, status, context = {}, keepEmpty = false) {
        const table = variableTable(status, context);
        return String(value ?? '').replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (match, name) => {
            const resolved = table[name];
            const text = resolved === undefined || resolved === null ? '' : String(resolved);
            return text === '' && keepEmpty ? match : text;
        });
    }

    function variableSnapshot(status, context) {
        const table = variableTable(status, context);
        for (const key of Object.keys(table)) if (isTicking(key) && !key.startsWith('timer.')) delete table[key];
        // Timer clocks tick on their own, so only structural timer values count as changes.
        for (const key of Object.keys(table)) if (key.startsWith('timer.') && !/\.(label|state)$/.test(key)) delete table[key];
        return JSON.stringify(table);
    }

    function renderMarkdown(source) {
        const html = root.marked.parse(String(source ?? ''), { breaks: true });
        return root.DOMPurify.sanitize(html, {
            ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'del', 'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'a', 'h1', 'h2', 'h3', 'img'],
            ALLOWED_ATTR: ['href', 'title', 'target', 'rel', 'src', 'alt']
        });
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
            const [timers, goals] = await Promise.all([
                fetch('/api/timers', { cache: 'no-store' }).then(r => r.ok ? r.json() : null),
                fetch('/api/goals', { cache: 'no-store' }).then(r => r.ok ? r.json() : null)
            ]);
            if (timers) status.timerData = { fetchedAt: Date.now(), timers: timers.timers || {} };
            if (goals) status.goalItems = goals.items || [];
        } catch { /* extras are optional */ }
        return status;
    }

    root.OverlayShared = { GOOGLE_FONTS, VARIABLE_GROUPS, variableGroups, variableTable, hasTicking, loadLiveExtras, assetFonts, loadAssetFonts, expandVariables, variableSnapshot, renderMarkdown, loadGoogleFont };
})(window);

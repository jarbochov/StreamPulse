// ============================================================================
// CONFIGURATION
// ============================================================================

const urlParams = new URLSearchParams(window.location.search);
const DURATION = parseFloat(urlParams.get('duration')) || null;
const SPEED_MULTIPLIER = parseFloat(urlParams.get('speed')) || null;
const DATA_PATH = urlParams.get('datapath') || './data';
const PREVIEW = urlParams.get('preview') === 'true';
let DAYS_FILTER = parseInt(urlParams.get('days')) || 30;
const FADE_PANEL_DEFAULT_DURATION = 0;
const FADE_PANEL_TRANSITION_MS = 1000;

// Server-provided config (loaded at init)
let serverConfig = {
    subs_source: 'twitch',
    active_subs_only: false,
    broadcaster_name: '',
    exclude_users: [],
    days_filter: 30,
    credits: {
        header: { image: '', title: 'Thank you for your support!', subtitle: '' },
        closing: 'Thanks for watching!',
        closing_display_style: 'scroll',
        closing_display_duration: FADE_PANEL_DEFAULT_DURATION,
        custom_sections: [],
        section_order: [],
        sections: {
            subscribers: { enabled: true, title: 'Subscribers', subtitle: '' },
            followers: { enabled: true, title: 'New Followers', subtitle: '' },
            donations: { enabled: true, title: 'Donators', subtitle: '', source: 'session' },
            gift_subs: { enabled: true, title: 'Gift Subs', subtitle: '', source: 'session' },
            cheerers: { enabled: true, title: 'Cheerers', subtitle: '', source: 'session' },
            raids: { enabled: true, title: 'Raiders', subtitle: '' },
            emotes: { enabled: true, title: 'Top Emotes', subtitle: '' },
            hashtags: { enabled: true, title: 'Trending Hashtags', subtitle: '' },
            chatters: { enabled: true, title: "Today's Chatters", subtitle: '' },
            highlights: { enabled: false, title: 'Featured Highlights', subtitle: '', selected: [] }
        },
        social: { title: '', subtitle: '', links: [] }
    }
};

const BUILTIN_CREDIT_SECTION_KEYS = ['subscribers', 'followers', 'donations', 'gift_subs', 'cheerers', 'raids', 'emotes', 'hashtags', 'chatters', 'highlights'];
const BUILTIN_CREDIT_SECTION_LABELS = {
    subscribers: 'Subscribers',
    followers: 'New Followers',
    donations: 'Donators',
    gift_subs: 'Gift Subs',
    cheerers: 'Cheerers',
    raids: 'Raiders',
    emotes: 'Top Emotes',
    hashtags: 'Trending Hashtags',
    chatters: "Today's Chatters",
    highlights: 'Featured Highlights'
};
const SPECIAL_THANKS_ORDER_ID = 'special_thanks';

function applyTheme(cfg) {
    const t = cfg.theme;
    if (!t) return;
    const r = document.documentElement.style;
    if (t.font_family) {
        r.setProperty('--font-family', `"${t.font_family}", sans-serif`);
        if (t.font_import) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = t.font_import;
            document.head.appendChild(link);
        }
    }
    if (t.text_color) r.setProperty('--text-color', t.text_color);
    if (t.accent_color) r.setProperty('--accent-color', t.accent_color);
    if (t.background_color) r.setProperty('--bg-color', t.background_color);
    if (t.text_outline === false) r.setProperty('--text-outline-color', 'transparent');
    else if (t.text_outline_color) r.setProperty('--text-outline-color', t.text_outline_color);
    if (t.font_scale) r.setProperty('--font-scale', t.font_scale);
}

// Calculate total base pre-social credits duration - duration takes priority over speed
let totalSequenceDuration = 82;
if (DURATION) {
    totalSequenceDuration = DURATION;
} else if (SPEED_MULTIPLIER) {
    totalSequenceDuration = 82 / SPEED_MULTIPLIER;
}

document.documentElement.style.setProperty('--scroll-duration', `${totalSequenceDuration}s`);
console.log('[Config] Base credits duration set to:', totalSequenceDuration, 'seconds');

// ============================================================================
// DATA STORAGE
// ============================================================================

const liveData = {
    chatters: new Map(),
    sessionStartedAt: null,
    followers: [],
    subscribers: [],
    giftSubs: [],
    bits: [],
    donations: [],
    raids: [],
    hashtags: new Map(),
    emotes: new Map()
};

const prefetchedData = {
    subs: [],
    bits: [],
    followers: []
};

// Stats data (loaded when sections use 'stats' source)
let statsData = null;
let highlightsData = [];

// ============================================================================
// PRE-FETCHED DATA LOADING
// ============================================================================

async function loadPrefetchedData() {
    console.log('[Data] Loading pre-fetched data...');

    const files = [
        { key: 'subs', file: 'subs.json', label: 'subscribers' },
        { key: 'bits', file: 'bits.json', label: 'bits leaders' },
        { key: 'followers', file: 'followers.json', label: 'followers' }
    ];

    let loadFailures = 0;

    for (const { key, file, label } of files) {
        try {
            const response = await fetch(`${DATA_PATH}/${file}`);
            if (response.ok) {
                const json = await response.json();
                prefetchedData[key] = json.data || [];
                console.log(`[Data] Loaded ${prefetchedData[key].length} ${label}`);
            } else if (response.status === 404) {
                console.warn(`[Data] ${file} not found — skipping (run fetch script to generate)`);
            } else {
                console.error(`[Data] Failed to load ${file}: HTTP ${response.status}`);
            }
        } catch (err) {
            console.error(`[Data] Could not load ${file}: ${err.message}`);
            loadFailures++;
        }
    }

    if (loadFailures > 0) {
        console.error(`[Data] ${loadFailures} file(s) failed to load. Ensure server.js is running: npm start`);
    }

    // Load collected SSN chat data
    try {
        const chatResponse = await fetch(`${DATA_PATH}/chat.json`);
        if (chatResponse.ok) {
            const chatJson = await chatResponse.json();
            loadChatData(chatJson);
            console.log(`[Data] Loaded chat data: ${Object.keys(chatJson.chatters || {}).length} chatters, ${Object.keys(chatJson.emotes || {}).length} emotes`);
        } else if (chatResponse.status === 404) {
            console.warn('[Data] chat.json not found — skipping (server.js collects SSN data during stream)');
        }
    } catch (err) {
        console.warn('[Data] Could not load chat.json:', err.message);
    }
}

function refreshData() {
    console.log('[Data] Refreshing pre-fetched data...');
    loadPrefetchedData();
}

// ============================================================================
// WEBSOCKET LIVE DATA
// ============================================================================

let wsConnection = null;

function connectWebSocket() {
    const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProto}//${window.location.host}`;
    console.log(`[WS] Connecting to ${wsUrl}...`);

    wsConnection = new WebSocket(wsUrl);

    wsConnection.onopen = () => {
        console.log('[WS] Connected — receiving live data');
    };

    wsConnection.onmessage = (event) => {
        try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'snapshot' || msg.type === 'update') {
                loadChatData(msg.data);
            }
        } catch (err) {
            console.warn('[WS] Parse error:', err.message);
        }
    };

    wsConnection.onclose = () => {
        console.log('[WS] Disconnected — will reconnect in 5s');
        setTimeout(connectWebSocket, 5000);
    };

    wsConnection.onerror = (err) => {
        console.warn('[WS] Error:', err);
    };
}

function disconnectWebSocket() {
    if (wsConnection) {
        wsConnection.onclose = null; // Prevent reconnect
        wsConnection.close();
        wsConnection = null;
        console.log('[WS] Disconnected (credits rolling)');
    }
}

function loadChatData(chatJson) {
    // Replace data from server snapshot (not additive)
    liveData.sessionStartedAt = chatJson.startedAt || null;
    liveData.chatters.clear();
    if (chatJson.chatters) {
        Object.values(chatJson.chatters).forEach(chatter => {
            liveData.chatters.set(chatter.chatname, {
                chatname: chatter.chatname,
                chatimg: chatter.chatimg,
                type: chatter.type,
                messageCount: chatter.messageCount || 0
            });
        });
    }

    liveData.followers = (chatJson.followers || []).map(f => ({ chatname: f.chatname, chatimg: f.chatimg, timestamp: f.timestamp }));
    liveData.subscribers = (chatJson.subscribers || []).map(s => ({ chatname: s.chatname, membership: s.membership, chatimg: s.chatimg }));
    liveData.giftSubs = (chatJson.giftSubs || []).map(g => ({ chatname: g.chatname, gifter: g.gifter, recipient: g.recipient, chatimg: g.chatimg }));
    liveData.bits = (chatJson.bits || []).map(b => ({ chatname: b.chatname, amount: b.amount, chatimg: b.chatimg }));
    liveData.donations = (chatJson.donations || []).map(d => ({ chatname: d.chatname, amount: d.amount, chatimg: d.chatimg }));
    liveData.raids = (chatJson.raids || []).map(r => ({ chatname: r.chatname, chatimg: r.chatimg, viewers: r.viewers }));

    liveData.emotes.clear();
    if (chatJson.emotes) {
        Object.entries(chatJson.emotes).forEach(([name, emote]) => {
            liveData.emotes.set(name, {
                count: emote.count || 0,
                imageUrl: emote.imageUrl,
                users: new Set(emote.users || [])
            });
        });
    }

    liveData.hashtags.clear();
    if (chatJson.hashtags) {
        Object.entries(chatJson.hashtags).forEach(([tag, hashtag]) => {
            liveData.hashtags.set(tag, {
                count: hashtag.count || 0,
                users: new Set(hashtag.users || [])
            });
        });
    }
}

// ============================================================================
// CREDITS RENDERING
// ============================================================================

function renderCredits() {
    const container = document.getElementById('credits-container');
    const fadePanelsContainer = document.getElementById('fade-panels-container');
    const socialLinksContainer = document.getElementById('social-links-container');
    const c = serverConfig.credits;
    const sec = c.sections;
    const sequence = [];

    // Helper for section titles
    function sectionHeader(title, subtitle) {
        let h = `<h2>${escapeHtml(title)}</h2>`;
        if (subtitle) h += `<h3>${escapeHtml(subtitle)}</h3>`;
        return h;
    }

    function formatMultilineText(text) {
        return escapeHtml(text || '').replace(/\\n|\n/g, '<br>');
    }

    function normalizeDisplayStyle(value) {
        return value === 'fade' ? 'fade' : 'scroll';
    }

    function normalizeDisplayDuration(value) {
        const seconds = Number(value);
        return Number.isFinite(seconds) && seconds >= 0 ? seconds : FADE_PANEL_DEFAULT_DURATION;
    }

    function pushScroll(html) {
        if (html && html.trim()) sequence.push({ mode: 'scroll', html });
    }

    function pushFade(html, extraDuration) {
        if (html && html.trim()) sequence.push({ mode: 'fade', html, extraDuration: normalizeDisplayDuration(extraDuration) });
    }

    function renderNamedSectionBlock(title, subtitle, items, className = '', columns = 1) {
        if (!items || items.length === 0) return '';
        const cols = columns === 2 ? 'two-col' : columns === 3 ? 'three-col' : '';
        return `<div class="section ${className}">${sectionHeader(title, subtitle)}<div class="people-list ${cols}">${items.map(item => `<div class="person">${escapeHtml(item)}</div>`).join('')}</div></div>`;
    }

    function renderHighlightsBlock(title, subtitle, items) {
        if (!items || items.length === 0) return '';
        return `<div class="section highlights">${sectionHeader(title, subtitle)}<div class="highlight-list">${items.map(item => `
            <blockquote class="highlight-quote">
                <div class="highlight-message">${escapeHtml(item.message)}</div>
                <div class="highlight-attribution">- ${escapeHtml(item.user)}</div>
            </blockquote>
        `).join('')}</div></div>`;
    }

    function normalizeCustomSections(sections) {
        if (!Array.isArray(sections)) return [];
        return sections.map((section, index) => ({
            id: (typeof section?.id === 'string' && section.id.trim()) ? section.id.trim() : `custom-${index + 1}`,
            enabled: section?.enabled !== false,
            title: section?.title || '',
            subtitle: section?.subtitle || '',
            body: section?.body || '',
            columns: [1, 2, 3].includes(section?.columns) ? section.columns : 1,
            display_style: normalizeDisplayStyle(section?.display_style),
            display_duration: normalizeDisplayDuration(section?.display_duration),
            names: Array.isArray(section?.names) ? section.names.filter(Boolean) : []
        }));
    }

    function normalizeCreditsSectionOrder(order, customSections) {
        const defaultOrder = [...BUILTIN_CREDIT_SECTION_KEYS, ...customSections.map(section => section.id), SPECIAL_THANKS_ORDER_ID];
        const validIds = new Set(defaultOrder);
        const normalized = [];
        (Array.isArray(order) ? order : []).forEach(id => {
            if (typeof id !== 'string' || !validIds.has(id) || normalized.includes(id)) return;
            normalized.push(id);
        });
        defaultOrder.forEach(id => {
            if (!normalized.includes(id)) normalized.push(id);
        });
        return normalized;
    }

    const customSections = normalizeCustomSections(c.custom_sections);
    const specialThanks = {
        ...(c.special_thanks || {}),
        display_style: normalizeDisplayStyle(c.special_thanks?.display_style),
        display_duration: normalizeDisplayDuration(c.special_thanks?.display_duration)
    };
    const closingDisplayStyle = normalizeDisplayStyle(c.closing_display_style);
    const closingDisplayDuration = normalizeDisplayDuration(c.closing_display_duration);

    function renderBuiltInSection(sectionId) {
        const section = sec[sectionId] || {};
        const title = section.title || BUILTIN_CREDIT_SECTION_LABELS[sectionId] || 'Credits';
        const subtitle = section.subtitle || '';

        if (sectionId === 'subscribers' && section.enabled !== false) {
            const allSubs = mergeSubscribers();
            if (allSubs.length > 0) {
                let html = '<div class="section">';
                html += sectionHeader(title, subtitle);
                html += '<div class="people-list two-col">';
                allSubs.forEach(sub => {
                    html += `<div class="person">${escapeHtml(sub.name)}`;
                    if (sub.tier) html += ` (${escapeHtml(sub.tier)})`;
                    html += '</div>';
                });
                html += '</div></div>';
                return html;
            }
            return '';
        }

        if (sectionId === 'followers' && section.enabled !== false) {
            const allFollowers = mergeFollowers();
            if (allFollowers.length > 0) {
                let html = '<div class="section">';
                html += sectionHeader(title, subtitle);
                html += '<div class="people-list three-col">';
                allFollowers.forEach(f => {
                    html += `<div class="person">${escapeHtml(f.name)}</div>`;
                });
                html += '</div></div>';
                return html;
            }
            return '';
        }

        if (sectionId === 'donations' && section.enabled !== false) {
            const useStats = section.source === 'stats';
            const donationsList = useStats
                ? mergeStatsDonations()
                : liveData.donations.map(d => ({ chatname: d.chatname, amount: d.amount }));
            if (donationsList.length > 0) {
                let html = '<div class="section">';
                html += sectionHeader(title, subtitle);
                html += '<div class="people-list two-col">';
                donationsList.forEach(d => {
                    const detail = useStats ? `×${d.count}` : d.amount;
                    html += `<div class="person">${escapeHtml(d.chatname)} (${escapeHtml(detail)})</div>`;
                });
                html += '</div></div>';
                return html;
            }
            return '';
        }

        if (sectionId === 'gift_subs' && section.enabled !== false) {
            const useStats = section.source === 'stats';
            const giftSubList = useStats ? mergeStatsGiftSubs() : liveData.giftSubs;
            if (giftSubList.length > 0) {
                let html = '<div class="section">';
                html += sectionHeader(title, subtitle);
                html += '<div class="people-list two-col">';
                giftSubList.forEach(g => {
                    const gifter = g.gifter || g.chatname;
                    let label = gifter;
                    if (g.recipient) label = `${gifter} → ${g.recipient}`;
                    else if (useStats && g.count > 1) label = `${gifter} (${g.count})`;
                    html += `<div class="person">${escapeHtml(label)}</div>`;
                });
                html += '</div></div>';
                return html;
            }
            return '';
        }

        if (sectionId === 'cheerers' && section.enabled !== false) {
            const useStats = section.source === 'stats';
            const allBits = useStats ? mergeStatsBits() : mergeBits();
            if (allBits.length > 0) {
                let html = '<div class="section">';
                html += sectionHeader(title, subtitle);
                html += '<div class="people-list two-col">';
                allBits.forEach(b => {
                    html += `<div class="person">${escapeHtml(b.name)} (${escapeHtml(b.amount)})</div>`;
                });
                html += '</div></div>';
                return html;
            }
            return '';
        }

        if (sectionId === 'raids' && section.enabled !== false && liveData.raids.length > 0) {
            let html = '<div class="section">';
            html += sectionHeader(title || 'Raiders', subtitle);
            html += '<div class="people-list two-col">';
            liveData.raids.forEach(r => {
                const viewers = r.viewers ? ` (${r.viewers} viewers)` : '';
                html += `<div class="person">${escapeHtml(r.chatname)}${viewers}</div>`;
            });
            html += '</div></div>';
            return html;
        }

        if (sectionId === 'emotes' && section.enabled !== false) {
            const topEmotes = getTopEmotes(5);
            if (topEmotes.length > 0) {
                let html = '<div class="section">';
                html += sectionHeader(title, subtitle);
                html += '<div>';
                topEmotes.forEach(emote => {
                    html += '<div class="emote-item">';
                    html += `<img src="${emote.imageUrl}" class="emote-img" alt="${escapeHtml(emote.name)}">`;
                    html += `<div class="emote-name">${escapeHtml(emote.name)}</div>`;
                    html += `<div class="emote-stats">${emote.count} uses by ${emote.uniqueUsers} chatters</div>`;
                    html += '</div>';
                });
                html += '</div></div>';
                return html;
            }
            return '';
        }

        if (sectionId === 'hashtags' && section.enabled !== false) {
            const topHashtags = getTopHashtags(35);
            if (topHashtags.length > 0) {
                let html = '<div class="section">';
                html += sectionHeader(title, subtitle);
                html += '<div class="hashtag-list">';
                topHashtags.forEach(hashtag => {
                    html += '<div class="hashtag-item">';
                    html += `<span class="hashtag-tag">${escapeHtml(hashtag.tag)}</span>`;
                    html += ` (${hashtag.count})`;
                    html += '</div>';
                });
                html += '</div></div>';
                return html;
            }
            return '';
        }

        if (sectionId === 'chatters' && section.enabled !== false) {
            const sortedChatters = Array.from(liveData.chatters.values())
                .sort((a, b) => b.messageCount - a.messageCount);
            if (sortedChatters.length > 0) {
                let html = '<div class="section">';
                html += sectionHeader(title, subtitle);
                html += '<div class="people-list three-col">';
                sortedChatters.forEach(chatter => {
                    html += `<div class="person">${escapeHtml(chatter.chatname)}</div>`;
                });
                html += '</div></div>';
                return html;
            }
        }
        if (sectionId === 'highlights' && section.enabled !== false) {
            const source = section.source || (Array.isArray(section.selected) && section.selected.length > 0 ? 'manual' : 'none');
            if (source === 'none') return '';
            const selected = new Set(Array.isArray(section.selected) ? section.selected.map(String) : []);
            const sessionName = liveData.sessionStartedAt
                ? `chat-${new Date(liveData.sessionStartedAt).getFullYear()}-${String(new Date(liveData.sessionStartedAt).getMonth() + 1).padStart(2, '0')}-${String(new Date(liveData.sessionStartedAt).getDate()).padStart(2, '0')}T${String(new Date(liveData.sessionStartedAt).getHours()).padStart(2, '0')}-${String(new Date(liveData.sessionStartedAt).getMinutes()).padStart(2, '0')}.json`
                : '';
            const items = highlightsData
                .filter(highlight => source === 'current_session'
                    ? highlight.session === sessionName
                    : selected.has(`${highlight.ts}:${highlight.user}`))
                .map(highlight => ({ user: highlight.user || 'Unknown', message: highlight.message || '' }));
            return renderHighlightsBlock(title, subtitle, items);
        }
        return '';
    }

    function renderCustomSection(section) {
        if (section?.enabled === false) return;
        const title = section?.title || '';
        const subtitle = section?.subtitle || '';
        const body = String(section?.body || '').trim();
        const names = Array.isArray(section?.names) ? section.names.filter(Boolean) : [];
        if (!title && !subtitle && !body && names.length === 0) return;

        if (normalizeDisplayStyle(section?.display_style) === 'fade') {
            pushFade(buildFadePanelHtml({ title, subtitle, body, names, columns: section?.columns }), section?.display_duration);
            return;
        }

        let html = '<div class="section custom-section">';
        if (title || subtitle) html += sectionHeader(title || 'Credits', subtitle);
        if (body) {
            html += `<div class="custom-section-body">${formatMultilineText(body)}</div>`;
        }
        if (names.length > 0) {
            const cols = section?.columns === 2 ? 'two-col' : section?.columns === 3 ? 'three-col' : '';
            html += `<div class="people-list ${cols}">`;
            names.forEach(name => {
                html += `<div class="person">${escapeHtml(name)}</div>`;
            });
            html += '</div>';
        }
        html += '</div>';
        pushScroll(html);
    }

    function buildFadePanelHtml({ title = '', subtitle = '', body = '', names = [], columns = 1, className = '' }) {
        const cols = columns === 2 ? 'two-col' : columns === 3 ? 'three-col' : '';
        let panelHtml = `<div class="fade-panel-card${className ? ` ${className}` : ''}">`;
        if (title || subtitle) panelHtml += sectionHeader(title || 'Credits', subtitle);
        if (body) panelHtml += `<div class="custom-section-body">${formatMultilineText(body)}</div>`;
        if (names.length > 0) {
            panelHtml += `<div class="people-list ${cols}">`;
            names.forEach(name => {
                panelHtml += `<div class="person">${escapeHtml(name)}</div>`;
            });
            panelHtml += '</div>';
        }
        panelHtml += '</div>';
        return panelHtml;
    }

    function buildTimelineBlocks() {
        const blocks = [];
        let pendingScrollHtml = '';
        sequence.forEach(segment => {
            if (segment.mode === 'scroll') {
                pendingScrollHtml += segment.html;
                return;
            }
            if (pendingScrollHtml.trim()) {
                blocks.push({ mode: 'scroll', html: pendingScrollHtml });
                pendingScrollHtml = '';
            }
            blocks.push(segment);
        });
        if (pendingScrollHtml.trim()) {
            blocks.push({ mode: 'scroll', html: pendingScrollHtml });
        }
        return blocks;
    }

    function wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function nextFrame() {
        return new Promise(resolve => requestAnimationFrame(() => resolve()));
    }

    async function measureScrollDistance(html) {
        container.getAnimations().forEach(animation => animation.cancel());
        container.classList.remove('scrollIt', 'fadeOut');
        container.style.display = '';
        container.style.opacity = '0';
        container.style.top = '1080px';
        container.innerHTML = html;
        await nextFrame();
        return 1080 + container.scrollHeight;
    }

    async function measureFadeWeight(html) {
        fadePanelsContainer.classList.remove('preview', 'is-visible');
        fadePanelsContainer.innerHTML = html;
        await nextFrame();
        const panel = fadePanelsContainer.firstElementChild;
        return 1080 + (panel?.scrollHeight || panel?.offsetHeight || 0);
    }

    async function assignBlockDurations(blocks) {
        const measured = [];
        let totalWeight = 0;
        for (const block of blocks) {
            const weight = block.mode === 'scroll'
                ? await measureScrollDistance(block.html)
                : await measureFadeWeight(block.html);
            measured.push(weight);
            totalWeight += weight;
        }
        const totalDurationMs = totalSequenceDuration * 1000;
        return blocks.map((block, index) => {
            const weight = measured[index];
            const baseDurationMs = totalWeight > 0 ? (weight / totalWeight) * totalDurationMs : 0;
            if (block.mode === 'scroll') {
                return { ...block, weight, durationMs: baseDurationMs };
            }
            const extraDurationMs = (block.extraDuration || 0) * 1000;
            return { ...block, weight, baseDurationMs, durationMs: baseDurationMs + extraDurationMs, extraDurationMs };
        });
    }

    async function playScrollBlock(block) {
        container.getAnimations().forEach(animation => animation.cancel());
        fadePanelsContainer.classList.remove('is-visible', 'preview');
        fadePanelsContainer.innerHTML = '';
        container.classList.remove('scrollIt', 'fadeOut');
        container.style.display = '';
        container.style.opacity = '1';
        container.style.top = '1080px';
        container.innerHTML = block.html;
        await nextFrame();
        const height = container.scrollHeight;
        if (height <= 0) return;
        await new Promise(resolve => {
            const animation = container.animate([
                { top: '1080px', opacity: 1 },
                { top: `${-height}px`, opacity: 1 }
            ], {
                duration: Math.max(1, block.durationMs || 1),
                easing: 'linear',
                fill: 'forwards'
            });
            animation.onfinish = () => resolve();
        });
        container.style.display = 'none';
    }

    async function playFadeBlock(block) {
        container.getAnimations().forEach(animation => animation.cancel());
        container.style.display = 'none';
        fadePanelsContainer.classList.remove('preview', 'is-visible');
        fadePanelsContainer.innerHTML = block.html;
        await nextFrame();
        fadePanelsContainer.classList.add('is-visible');
        await wait(Math.max(0, (block.durationMs || 0) - FADE_PANEL_TRANSITION_MS));
        fadePanelsContainer.classList.remove('is-visible');
        await wait(FADE_PANEL_TRANSITION_MS);
        fadePanelsContainer.innerHTML = '';
    }

    function renderSpecialThanksSection() {
        if (specialThanks.enabled !== false && specialThanks.names && specialThanks.names.length > 0) {
            if (specialThanks.display_style === 'fade') {
                pushFade(buildFadePanelHtml({
                    title: specialThanks.title || 'Special Thanks',
                    subtitle: specialThanks.subtitle,
                    names: specialThanks.names,
                    columns: specialThanks.columns,
                    className: 'special-thanks'
                }), specialThanks.display_duration);
                return;
            }
            pushScroll(renderNamedSectionBlock(
                specialThanks.title || 'Special Thanks',
                specialThanks.subtitle,
                specialThanks.names,
                'special-thanks',
                specialThanks.columns
            ));
        }
    }

    // Header image
    if (c.header.image) {
        pushScroll(`<div class="section"><img src="${c.header.image}" class="header-img" alt="Header"></div>`);
    }

    // Header text
    if (c.header.title) {
        let html = '<div class="section">';
        html += `<h1>${escapeHtml(c.header.title)}</h1>`;
        if (c.header.subtitle) html += `<h3>${escapeHtml(c.header.subtitle)}</h3>`;
        html += '</div>';
        pushScroll(html);
    }

    const customSectionsById = new Map(customSections.map(section => [section.id, section]));
    const orderedSections = normalizeCreditsSectionOrder(c.section_order, customSections);
    orderedSections.forEach(sectionId => {
        if (sectionId === SPECIAL_THANKS_ORDER_ID) {
            renderSpecialThanksSection();
        } else if (BUILTIN_CREDIT_SECTION_KEYS.includes(sectionId)) {
            pushScroll(renderBuiltInSection(sectionId));
        } else if (customSectionsById.has(sectionId)) {
            renderCustomSection(customSectionsById.get(sectionId));
        }
    });

    // Closing
    if (c.closing) {
        if (closingDisplayStyle === 'fade') {
            pushFade(`<div class="fade-panel-card closing-panel"><div class="fade-panel-closing-text">${formatMultilineText(c.closing)}</div></div>`, closingDisplayDuration);
        } else {
            pushScroll(`<div class="section closing">${formatMultilineText(c.closing)}</div>`);
        }
    }

    const timelineBlocks = buildTimelineBlocks();
    container.getAnimations().forEach(animation => animation.cancel());
    container.innerHTML = '';
    fadePanelsContainer.innerHTML = '';
    fadePanelsContainer.classList.remove('is-visible', 'preview');
    socialLinksContainer.classList.remove('fadeIn');

    // Social links
    const social = c.social;
    let socialHtml = '';
    if (social.title) socialHtml += `<h2>${escapeHtml(social.title)}</h2>`;
    if (social.subtitle) socialHtml += `<h3>${escapeHtml(social.subtitle)}</h3>`;
    if (social.links && social.links.length > 0) {
        socialHtml += '<div>';
        social.links.forEach(link => {
            const isEmoji = !link.icon.includes(' ');
            const iconHtml = isEmoji
                ? `${link.icon} `
                : `<i class="${escapeHtml(link.icon)} social-icon"></i> `;
            socialHtml += `<div class="social-item">${iconHtml}<span>${escapeHtml(link.handle)}</span></div>`;
        });
        socialHtml += '</div>';
    }
    socialLinksContainer.innerHTML = socialHtml;

    // Preview mode — show everything statically, no scroll
    if (PREVIEW) {
        container.style.position = 'relative';
        container.style.top = '0';
        container.style.display = '';
        container.style.opacity = '1';
        container.innerHTML = sequence.map(segment =>
            segment.mode === 'fade' ? `<div class="section">${segment.html}</div>` : segment.html
        ).join('');
        document.body.style.overflow = 'auto';
        document.body.style.height = 'auto';
        fadePanelsContainer.innerHTML = '';
        fadePanelsContainer.style.pointerEvents = 'none';
        socialLinksContainer.style.position = 'relative';
        socialLinksContainer.style.opacity = '1';
        socialLinksContainer.style.bottom = 'auto';
        socialLinksContainer.style.left = 'auto';
        socialLinksContainer.style.transform = 'none';
        socialLinksContainer.style.marginTop = '50px';
        socialLinksContainer.style.marginBottom = '50px';
        console.log('[Credits] Preview mode — no scrolling');
        return;
    }
    fadePanelsContainer.style.pointerEvents = 'none';
    container.style.display = 'none';

    (async () => {
        const blocksWithDurations = await assignBlockDurations(timelineBlocks);
        const totalScrollMs = blocksWithDurations
            .filter(block => block.mode === 'scroll')
            .reduce((sum, block) => sum + (block.durationMs || 0), 0);
        const totalFadeMs = blocksWithDurations
            .filter(block => block.mode === 'fade')
            .reduce((sum, block) => sum + (block.durationMs || 0), 0);
        const totalExtraFadeMs = blocksWithDurations
            .filter(block => block.mode === 'fade')
            .reduce((sum, block) => sum + (block.extraDurationMs || 0), 0);
        console.log('[Credits] Timeline blocks:', blocksWithDurations.map(block => block.mode).join(' → ') || '(none)');
        console.log('[Credits] Base sequence duration:', totalSequenceDuration.toFixed(2), 'seconds');
        console.log('[Credits] Added fade override time:', (totalExtraFadeMs / 1000).toFixed(2), 'seconds');
        console.log('[Credits] Total pre-social duration:', ((totalScrollMs + totalFadeMs) / 1000).toFixed(2), 'seconds');
        for (const block of blocksWithDurations) {
            if (block.mode === 'scroll') await playScrollBlock(block);
            else await playFadeBlock(block);
        }
        if (socialHtml.trim()) socialLinksContainer.classList.add('fadeIn');
    })().catch(err => console.error('[Credits] Sequence failed:', err));
}

// ============================================================================
// DATA MERGING HELPERS
// ============================================================================

function mergeSubscribers() {
    const subsMap = new Map();
    const broadcasterKey = serverConfig.broadcaster_name?.toLowerCase() || '';
    const source = serverConfig.subs_source || 'twitch';

    // Twitch API subs
    if (source === 'twitch' || source === 'both') {
        prefetchedData.subs.forEach(sub => {
            const name = sub.user_name || sub.user_login;
            if (name && name.toLowerCase() !== broadcasterKey) {
                subsMap.set(name.toLowerCase(), {
                    name: name,
                    tier: sub.tier ? `Tier ${sub.tier / 1000}` : '',
                    chatimg: null
                });
            }
        });
    }

    // SSN live subs
    if (source === 'ssn' || source === 'both') {
        liveData.subscribers.forEach(sub => {
            const key = sub.chatname.toLowerCase();
            if (key !== broadcasterKey) {
                subsMap.set(key, {
                    name: sub.chatname,
                    tier: sub.membership || '',
                    chatimg: sub.chatimg
                });
            }
        });
    }

    // Filter to only active chatters if configured
    if (serverConfig.active_subs_only) {
        const activeChatters = new Set(
            Array.from(liveData.chatters.keys()).map(k => k.toLowerCase())
        );
        return Array.from(subsMap.values()).filter(sub =>
            activeChatters.has(sub.name.toLowerCase())
        );
    }

    return Array.from(subsMap.values());
}

function mergeFollowers() {
    const followersMap = new Map();
    const cutoff = Date.now() - (DAYS_FILTER * 24 * 60 * 60 * 1000);
    const broadcasterKey = serverConfig.broadcaster_name?.toLowerCase() || '';

    prefetchedData.followers.forEach(follower => {
        const name = follower.user_name || follower.user_login;
        if (name && name.toLowerCase() !== broadcasterKey && follower.followed_at) {
            const followedAt = new Date(follower.followed_at).getTime();
            if (followedAt >= cutoff) {
                followersMap.set(name.toLowerCase(), { name: name });
            }
        }
    });

    liveData.followers.forEach(follower => {
        const key = follower.chatname.toLowerCase();
        if (key !== broadcasterKey) {
            followersMap.set(key, { name: follower.chatname });
        }
    });

    return Array.from(followersMap.values());
}

function mergeBits() {
    const bitsMap = new Map();

    prefetchedData.bits.forEach(bit => {
        const name = bit.user_name || bit.user_login;
        if (name) {
            bitsMap.set(name.toLowerCase(), {
                name: name,
                amount: `${bit.score} bits`,
                chatimg: null,
                score: bit.score
            });
        }
    });

    liveData.bits.forEach(bit => {
        const key = bit.chatname.toLowerCase();
        if (!bitsMap.has(key)) {
            const match = bit.amount.match(/(\d+)/);
            const score = match ? parseInt(match[1]) : 0;
            bitsMap.set(key, {
                name: bit.chatname,
                amount: bit.amount,
                chatimg: bit.chatimg,
                score: score
            });
        } else {
            if (bit.chatimg) {
                bitsMap.get(key).chatimg = bit.chatimg;
            }
        }
    });

    return Array.from(bitsMap.values())
        .sort((a, b) => b.score - a.score);
}

// Pull donations from stats.json filtered by DAYS_FILTER
function mergeStatsDonations() {
    if (!statsData || !statsData.donations) return [];
    const cutoff = new Date(Date.now() - DAYS_FILTER * 86400000).toISOString().slice(0, 10);
    return Object.entries(statsData.donations)
        .map(([name, d]) => {
            const total = Object.entries(d.days || {})
                .filter(([day]) => day >= cutoff)
                .reduce((sum, [, c]) => sum + c, 0);
            return { chatname: name, count: total, chatimg: d.chatimg };
        })
        .filter(d => d.count > 0)
        .sort((a, b) => b.count - a.count);
}

// Pull bits/cheerers from stats.json filtered by DAYS_FILTER
function mergeStatsBits() {
    if (!statsData || !statsData.bits) return [];
    const cutoff = new Date(Date.now() - DAYS_FILTER * 86400000).toISOString().slice(0, 10);
    return Object.entries(statsData.bits)
        .map(([name, b]) => {
            const total = Object.entries(b.days || {})
                .filter(([day]) => day >= cutoff)
                .reduce((sum, [, amt]) => sum + amt, 0);
            return { name, amount: `${total} bits`, chatimg: b.chatimg, score: total };
        })
        .filter(b => b.score > 0)
        .sort((a, b) => b.score - a.score);
}

// Pull gift subs from stats.json filtered by DAYS_FILTER
function mergeStatsGiftSubs() {
    if (!statsData || !statsData.giftSubs) return [];
    const cutoff = new Date(Date.now() - DAYS_FILTER * 86400000).toISOString().slice(0, 10);
    return Object.entries(statsData.giftSubs)
        .map(([name, g]) => {
            const total = Object.entries(g.days || {})
                .filter(([day]) => day >= cutoff)
                .reduce((sum, [, c]) => sum + c, 0);
            return { chatname: name, gifter: name, count: total, chatimg: g.chatimg };
        })
        .filter(g => g.count > 0)
        .sort((a, b) => b.count - a.count);
}

function getTopHashtags(limit) {
    return Array.from(liveData.hashtags.entries())
        .map(([tag, data]) => ({
            tag: tag,
            count: data.count,
            uniqueUsers: data.users.size
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);
}

function getTopEmotes(limit) {
    return Array.from(liveData.emotes.entries())
        .map(([name, data]) => ({
            name: name,
            count: data.count,
            imageUrl: data.imageUrl,
            uniqueUsers: data.users.size
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================================================
// INITIALIZATION
// ============================================================================

let creditsStarted = false;

function startCredits() {
    if (creditsStarted) return;
    creditsStarted = true;

    // Disconnect WebSocket — take a snapshot of data for the roll
    disconnectWebSocket();

    console.log('[Credits] Starting credits roll!');
    console.log(`[Credits] Live data: ${liveData.chatters.size} chatters, ${liveData.emotes.size} emotes, ${liveData.hashtags.size} hashtags`);

    renderCredits();
}

async function init() {
    console.log('[Init] Starting StreamPulse overlay...');

    // Load server config
    try {
        const configRes = await fetch('/api/config');
        if (configRes.ok) {
            serverConfig = await configRes.json();
            applyTheme(serverConfig);
            if (!urlParams.has('days')) DAYS_FILTER = serverConfig.days_filter || 30;
            console.log('[Config] Server config loaded:', JSON.stringify(serverConfig));
        }
    } catch { /* use defaults */ }

    console.log('[Init] Duration:', DURATION, 'seconds (URL parameter)');
    console.log('[Init] Base pre-social duration:', totalSequenceDuration, 'seconds');
    console.log('[Init] Data Path:', DATA_PATH);
    console.log('[Init] Days Filter:', DAYS_FILTER, 'days');
    console.log('[Init] Subs Source:', serverConfig.subs_source);
    console.log('[Init] Active Subs Only:', serverConfig.active_subs_only);

    await loadPrefetchedData();
    try {
        const highlightsRes = await fetch('/api/highlights');
        if (highlightsRes.ok) highlightsData = await highlightsRes.json();
    } catch (err) {
        console.warn('[Highlights] Failed to load highlights:', err.message);
    }

    // Load stats data if any section uses 'stats' source
    const sec = serverConfig.credits?.sections || {};
    if (sec.donations?.source === 'stats' || sec.cheerers?.source === 'stats' || sec.gift_subs?.source === 'stats') {
        try {
            const statsRes = await fetch('/api/stats');
            if (statsRes.ok) {
                statsData = await statsRes.json();
                console.log('[Stats] Loaded stats data for credits');
            }
        } catch { /* use session data as fallback */ }
    }

    // Connect WebSocket for live data updates
    connectWebSocket();

    startCredits();

    console.log('[Init] Credits overlay initialized!');
}

window.addEventListener('DOMContentLoaded', init);

// Public API for manual control
window.triggerCredits = startCredits;

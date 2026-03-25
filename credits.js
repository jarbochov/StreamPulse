// ============================================================================
// CONFIGURATION
// ============================================================================

const urlParams = new URLSearchParams(window.location.search);
const DURATION = parseFloat(urlParams.get('duration')) || null;
const SPEED_MULTIPLIER = parseFloat(urlParams.get('speed')) || null;
const DATA_PATH = urlParams.get('datapath') || './data';
let DAYS_FILTER = parseInt(urlParams.get('days')) || 30;

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
        sections: {
            subscribers: { enabled: true, title: 'Subscribers', subtitle: '' },
            followers: { enabled: true, title: 'New Followers', subtitle: '' },
            donations: { enabled: true, title: 'Donators', subtitle: '' },
            gift_subs: { enabled: true, title: 'Gift Subs', subtitle: '' },
            cheerers: { enabled: true, title: 'Cheerers', subtitle: '' },
            emotes: { enabled: true, title: 'Top Emotes', subtitle: '' },
            hashtags: { enabled: true, title: 'Trending Hashtags', subtitle: '' },
            chatters: { enabled: true, title: "Today's Chatters", subtitle: '' }
        },
        social: { title: '', subtitle: '', links: [] }
    }
};

// Calculate scroll duration - duration takes priority over speed
let scrollDuration = 82;
if (DURATION) {
    scrollDuration = DURATION;
} else if (SPEED_MULTIPLIER) {
    scrollDuration = 82 / SPEED_MULTIPLIER;
}

document.documentElement.style.setProperty('--scroll-duration', `${scrollDuration}s`);
console.log('[Config] Scroll duration set to:', scrollDuration, 'seconds');

// ============================================================================
// DATA STORAGE
// ============================================================================

const liveData = {
    chatters: new Map(),
    followers: [],
    subscribers: [],
    giftSubs: [],
    bits: [],
    donations: [],
    hashtags: new Map(),
    emotes: new Map()
};

const prefetchedData = {
    subs: [],
    bits: [],
    followers: []
};

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

function loadChatData(chatJson) {
    // Merge chatters
    if (chatJson.chatters) {
        Object.values(chatJson.chatters).forEach(chatter => {
            if (!liveData.chatters.has(chatter.chatname)) {
                liveData.chatters.set(chatter.chatname, {
                    chatname: chatter.chatname,
                    chatimg: chatter.chatimg,
                    type: chatter.type,
                    messageCount: chatter.messageCount || 0
                });
            } else {
                liveData.chatters.get(chatter.chatname).messageCount += (chatter.messageCount || 0);
            }
        });
    }

    // Merge followers
    if (chatJson.followers) {
        chatJson.followers.forEach(f => {
            liveData.followers.push({ chatname: f.chatname, chatimg: f.chatimg, timestamp: f.timestamp });
        });
    }

    // Merge subscribers
    if (chatJson.subscribers) {
        chatJson.subscribers.forEach(s => {
            liveData.subscribers.push({ chatname: s.chatname, membership: s.membership, chatimg: s.chatimg });
        });
    }

    // Merge gift subs
    if (chatJson.giftSubs) {
        chatJson.giftSubs.forEach(g => {
            liveData.giftSubs.push({ chatname: g.chatname, chatimg: g.chatimg });
        });
    }

    // Merge bits
    if (chatJson.bits) {
        chatJson.bits.forEach(b => {
            liveData.bits.push({ chatname: b.chatname, amount: b.amount, chatimg: b.chatimg });
        });
    }

    // Merge donations
    if (chatJson.donations) {
        chatJson.donations.forEach(d => {
            liveData.donations.push({ chatname: d.chatname, amount: d.amount, chatimg: d.chatimg });
        });
    }

    // Merge emotes
    if (chatJson.emotes) {
        Object.entries(chatJson.emotes).forEach(([name, emote]) => {
            if (!liveData.emotes.has(name)) {
                liveData.emotes.set(name, {
                    count: emote.count || 0,
                    imageUrl: emote.imageUrl,
                    users: new Set(emote.users || [])
                });
            } else {
                const existing = liveData.emotes.get(name);
                existing.count += (emote.count || 0);
                (emote.users || []).forEach(u => existing.users.add(u));
            }
        });
    }

    // Merge hashtags
    if (chatJson.hashtags) {
        Object.entries(chatJson.hashtags).forEach(([tag, hashtag]) => {
            if (!liveData.hashtags.has(tag)) {
                liveData.hashtags.set(tag, {
                    count: hashtag.count || 0,
                    users: new Set(hashtag.users || [])
                });
            } else {
                const existing = liveData.hashtags.get(tag);
                existing.count += (hashtag.count || 0);
                (hashtag.users || []).forEach(u => existing.users.add(u));
            }
        });
    }
}

// ============================================================================
// CREDITS RENDERING
// ============================================================================

function renderCredits() {
    const container = document.getElementById('credits-container');
    const socialLinksContainer = document.getElementById('social-links-container');
    const c = serverConfig.credits;
    const sec = c.sections;
    let html = '';

    // Helper for section titles
    function sectionHeader(title, subtitle) {
        let h = `<h2>${escapeHtml(title)}</h2>`;
        if (subtitle) h += `<h3>${escapeHtml(subtitle)}</h3>`;
        return h;
    }

    // Header image
    if (c.header.image) {
        html += '<div class="section">';
        html += `<img src="${c.header.image}" class="header-img" alt="Header">`;
        html += '</div>';
    }

    // Header text
    if (c.header.title) {
        html += '<div class="section">';
        html += `<h1>${escapeHtml(c.header.title)}</h1>`;
        if (c.header.subtitle) html += `<h3>${escapeHtml(c.header.subtitle)}</h3>`;
        html += '</div>';
    }

    // Subscribers
    if (sec.subscribers.enabled !== false) {
        const allSubs = mergeSubscribers();
        if (allSubs.length > 0) {
            html += '<div class="section">';
            html += sectionHeader(sec.subscribers.title, sec.subscribers.subtitle);
            html += '<div class="people-list two-col">';
            allSubs.forEach(sub => {
                html += `<div class="person">${escapeHtml(sub.name)}`;
                if (sub.tier) html += ` (${escapeHtml(sub.tier)})`;
                html += '</div>';
            });
            html += '</div></div>';
        }
    }

    // Followers
    if (sec.followers.enabled !== false) {
        const allFollowers = mergeFollowers();
        if (allFollowers.length > 0) {
            html += '<div class="section">';
            html += sectionHeader(sec.followers.title, sec.followers.subtitle);
            html += '<div class="people-list three-col">';
            allFollowers.forEach(f => {
                html += `<div class="person">${escapeHtml(f.name)}</div>`;
            });
            html += '</div></div>';
        }
    }

    // Donations
    if (sec.donations.enabled !== false && liveData.donations.length > 0) {
        html += '<div class="section">';
        html += sectionHeader(sec.donations.title, sec.donations.subtitle);
        html += '<div class="people-list two-col">';
        liveData.donations.forEach(d => {
            html += `<div class="person">${escapeHtml(d.chatname)} (${escapeHtml(d.amount)})</div>`;
        });
        html += '</div></div>';
    }

    // Gift Subs
    if (sec.gift_subs.enabled !== false && liveData.giftSubs.length > 0) {
        html += '<div class="section">';
        html += sectionHeader(sec.gift_subs.title, sec.gift_subs.subtitle);
        html += '<div class="people-list two-col">';
        liveData.giftSubs.forEach(g => {
            html += `<div class="person">${escapeHtml(g.chatname)}</div>`;
        });
        html += '</div></div>';
    }

    // Cheerers
    if (sec.cheerers.enabled !== false) {
        const allBits = mergeBits();
        if (allBits.length > 0) {
            html += '<div class="section">';
            html += sectionHeader(sec.cheerers.title, sec.cheerers.subtitle);
            html += '<div class="people-list two-col">';
            allBits.forEach(b => {
                html += `<div class="person">${escapeHtml(b.name)} (${escapeHtml(b.amount)})</div>`;
            });
            html += '</div></div>';
        }
    }

    // Top Emotes
    if (sec.emotes.enabled !== false) {
        const topEmotes = getTopEmotes(5);
        if (topEmotes.length > 0) {
            html += '<div class="section">';
            html += sectionHeader(sec.emotes.title, sec.emotes.subtitle);
            html += '<div>';
            topEmotes.forEach(emote => {
                html += '<div class="emote-item">';
                html += `<img src="${emote.imageUrl}" class="emote-img" alt="${escapeHtml(emote.name)}">`;
                html += `<div class="emote-name">${escapeHtml(emote.name)}</div>`;
                html += `<div class="emote-stats">${emote.count} uses by ${emote.uniqueUsers} chatters</div>`;
                html += '</div>';
            });
            html += '</div></div>';
        }
    }

    // Trending Hashtags
    if (sec.hashtags.enabled !== false) {
        const topHashtags = getTopHashtags(35);
        if (topHashtags.length > 0) {
            html += '<div class="section">';
            html += sectionHeader(sec.hashtags.title, sec.hashtags.subtitle);
            html += '<div class="hashtag-list">';
            topHashtags.forEach(hashtag => {
                html += '<div class="hashtag-item">';
                html += `<span class="hashtag-tag">${escapeHtml(hashtag.tag)}</span>`;
                html += ` (${hashtag.count})`;
                html += '</div>';
            });
            html += '</div></div>';
        }
    }

    // Chatters
    if (sec.chatters.enabled !== false) {
        const sortedChatters = Array.from(liveData.chatters.values())
            .sort((a, b) => b.messageCount - a.messageCount);
        if (sortedChatters.length > 0) {
            html += '<div class="section">';
            html += sectionHeader(sec.chatters.title, sec.chatters.subtitle);
            html += '<div class="people-list three-col">';
            sortedChatters.forEach(chatter => {
                html += `<div class="person">${escapeHtml(chatter.chatname)}</div>`;
            });
            html += '</div></div>';
        }
    }

    // Closing
    if (c.closing) {
        html += '<div class="section">';
        html += escapeHtml(c.closing);
        html += '</div>';
    }

    container.innerHTML = html;

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

    // Start scroll animation
    const creditsHeight = container.scrollHeight;
    document.documentElement.style.setProperty('--credits-height', `${creditsHeight}px`);
    console.log('[Credits] Content height:', creditsHeight, 'px');

    const socialLinkDelay = scrollDuration * 1000;
    setTimeout(() => {
        container.classList.add('scrollIt');
        setTimeout(() => {
            container.classList.add('fadeOut');
            setTimeout(() => {
                socialLinksContainer.classList.add('fadeIn');
            }, 2000);
        }, socialLinkDelay);
    }, 100);
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

    console.log('[Credits] Starting credits roll!');
    console.log(`[Credits] Live data: ${liveData.chatters.size} chatters, ${liveData.emotes.size} emotes, ${liveData.hashtags.size} hashtags`);

    renderCredits();
}

async function init() {
    console.log('[Init] Starting stream credits overlay...');

    // Load server config
    try {
        const configRes = await fetch('/api/config');
        if (configRes.ok) {
            serverConfig = await configRes.json();
            if (!urlParams.has('days')) DAYS_FILTER = serverConfig.days_filter || 30;
            console.log('[Config] Server config loaded:', JSON.stringify(serverConfig));
        }
    } catch { /* use defaults */ }

    console.log('[Init] Duration:', DURATION, 'seconds (URL parameter)');
    console.log('[Init] Effective Scroll Duration:', scrollDuration, 'seconds');
    console.log('[Init] Data Path:', DATA_PATH);
    console.log('[Init] Days Filter:', DAYS_FILTER, 'days');
    console.log('[Init] Subs Source:', serverConfig.subs_source);
    console.log('[Init] Active Subs Only:', serverConfig.active_subs_only);

    await loadPrefetchedData();

    startCredits();

    console.log('[Init] Credits overlay initialized!');
}

window.addEventListener('DOMContentLoaded', init);

// Public API for manual control
window.triggerCredits = startCredits;

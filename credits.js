// ============================================================================
// CONFIGURATION
// ============================================================================

const urlParams = new URLSearchParams(window.location.search);
const DURATION = parseFloat(urlParams.get('duration')) || null;
const SPEED_MULTIPLIER = parseFloat(urlParams.get('speed')) || null;
const DATA_PATH = urlParams.get('datapath') || './data';
const DAYS_FILTER = parseInt(urlParams.get('days')) || 30;

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
    let html = '';

    // Header image
    html += '<div class="section">';
    html += '<img src="https://cdn.streamelements.com/uploads/638fc6af-7d92-4f44-9fae-3d7cb65375a8.gif" class="header-img" alt="Header">';
    html += '</div>';

    // Header text
    html += '<div class="section">';
    html += '<h1>Thank you for your support!</h1>';
    html += '<h3>The room where it happens</h3>';
    html += '</div>';

    // Subscribers section
    const allSubs = mergeSubscribers();
    if (allSubs.length > 0) {
        html += '<div class="section">';
        html += '<h2>Subscribers</h2>';
        html += '<h3>Remember to feed your Wii U a disc</h3>';
        html += '<div class="people-list two-col">';
        allSubs.forEach(sub => {
            html += `<div class="person">${escapeHtml(sub.name)}`;
            if (sub.tier) {
                html += ` (${escapeHtml(sub.tier)})`;
            }
            html += '</div>';
        });
        html += '</div>';
        html += '</div>';
    }

    // New Followers section
    const allFollowers = mergeFollowers();
    if (allFollowers.length > 0) {
        html += '<div class="section">';
        html += '<h2>New Followers</h2>';
        html += '<h3>(not a cult)</h3>';
        html += '<div class="people-list three-col">';
        allFollowers.forEach(follower => {
            html += `<div class="person">${escapeHtml(follower.name)}</div>`;
        });
        html += '</div>';
        html += '</div>';
    }

    // Donations section
    if (liveData.donations.length > 0) {
        html += '<div class="section">';
        html += '<h2>Donators</h2>';
        html += '<h3 class="smallerheader">Can I have fifty dollars?</h3>';
        html += '<div class="people-list two-col">';
        liveData.donations.forEach(donation => {
            html += `<div class="person">${escapeHtml(donation.chatname)}`;
            html += ` (${escapeHtml(donation.amount)})</div>`;
        });
        html += '</div>';
        html += '</div>';
    }

    // Gift Subs section
    if (liveData.giftSubs.length > 0) {
        html += '<div class="section">';
        html += '<h2>Gift Subs</h2>';
        html += '<div class="people-list two-col">';
        liveData.giftSubs.forEach(gift => {
            html += `<div class="person">${escapeHtml(gift.chatname)}</div>`;
        });
        html += '</div>';
        html += '</div>';
    }

    // Bits/Cheers section
    const allBits = mergeBits();
    if (allBits.length > 0) {
        html += '<div class="section">';
        html += '<h2>Cheerers</h2>';
        html += '<div class="people-list two-col">';
        allBits.forEach(bit => {
            html += `<div class="person">${escapeHtml(bit.name)}`;
            html += ` (${escapeHtml(bit.amount)})</div>`;
        });
        html += '</div>';
        html += '</div>';
    }

    // Top Emotes section
    const topEmotes = getTopEmotes(5);
    if (topEmotes.length > 0) {
        html += '<div class="section">';
        html += '<h2>Top Emotes</h2>';
        html += '<h3>Chat\'s Mood Board</h3>';
        html += '<div>';
        topEmotes.forEach(emote => {
            html += '<div class="emote-item">';
            html += `<img src="${emote.imageUrl}" class="emote-img" alt="${escapeHtml(emote.name)}">`;
            html += `<div class="emote-name">${escapeHtml(emote.name)}</div>`;
            html += `<div class="emote-stats">${emote.count} uses by ${emote.uniqueUsers} chatters</div>`;
            html += '</div>';
        });
        html += '</div>';
        html += '</div>';
    }

    // Trending Hashtags section
    const topHashtags = getTopHashtags(10);
    if (topHashtags.length > 0) {
        html += '<div class="section">';
        html += '<h2>Trending Hashtags</h2>';
        html += '<h3>What we\'re talking about</h3>';
        html += '<div class="people-list three-col">';
        topHashtags.forEach(hashtag => {
            html += '<div class="hashtag-item">';
            html += `<span class="hashtag-tag">${escapeHtml(hashtag.tag)}</span>`;
            html += ` (${hashtag.count} uses)`;
            html += '</div>';
        });
        html += '</div>';
        html += '</div>';
    }

    // Chatters section
    const sortedChatters = Array.from(liveData.chatters.values())
        .sort((a, b) => b.messageCount - a.messageCount);

    if (sortedChatters.length > 0) {
        html += '<div class="section">';
        html += '<h2>Today\'s Chatters</h2>';
        html += '<h3>The Peanut Gallery</h3>';
        html += '<div class="people-list three-col">';
        sortedChatters.forEach(chatter => {
            html += `<div class="person">${escapeHtml(chatter.chatname)}</div>`;
        });
        html += '</div>';
        html += '</div>';
    }

    // Ending statement
    html += '<div class="section">';
    html += '<h1>Never forget that you\'re awesome and that you matter. Thanks for being you!</h1>';
    html += '</div>';

    container.innerHTML = html;

    // Social links
    let socialHtml = '';
    socialHtml += '<h2>SEE YA NEXT TIME!</h2>';
    socialHtml += '<h3>Follow For More Randomness</h3>';
    socialHtml += '<div>';
    socialHtml += '<div class="social-item"><i class="fab fa-threads social-icon"></i> <span>@jarbochov</span></div>';
    socialHtml += '<div class="social-item"><i class="fab fa-mastodon social-icon"></i> <span>@jarbochov</span></div>';
    socialHtml += '<div class="social-item">🦋 <span>@wyomingjarbo.com</span></div>';
    socialHtml += '<div class="social-item"><i class="fas fa-globe social-icon"></i> <span>wyomingjarbo.com</span></div>';
    socialHtml += '</div>';
    socialLinksContainer.innerHTML = socialHtml;

    // Start scroll animation
    const socialLinkDelay = scrollDuration * 1000;
    setTimeout(() => {
        container.classList.add('scrollIt');

        // After scroll completes, fade out credits and fade in social links
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

    prefetchedData.subs.forEach(sub => {
        const name = sub.user_name || sub.user_login;
        if (name) {
            subsMap.set(name.toLowerCase(), {
                name: name,
                tier: sub.tier ? `Tier ${sub.tier / 1000}` : '',
                chatimg: null
            });
        }
    });

    liveData.subscribers.forEach(sub => {
        const key = sub.chatname.toLowerCase();
        subsMap.set(key, {
            name: sub.chatname,
            tier: sub.membership || '',
            chatimg: sub.chatimg
        });
    });

    return Array.from(subsMap.values());
}

function mergeFollowers() {
    const followersMap = new Map();
    const cutoff = Date.now() - (DAYS_FILTER * 24 * 60 * 60 * 1000);

    prefetchedData.followers.forEach(follower => {
        const name = follower.user_name || follower.user_login;
        if (name && follower.followed_at) {
            const followedAt = new Date(follower.followed_at).getTime();
            if (followedAt >= cutoff) {
                followersMap.set(name.toLowerCase(), { name: name });
            }
        }
    });

    liveData.followers.forEach(follower => {
        const key = follower.chatname.toLowerCase();
        followersMap.set(key, { name: follower.chatname });
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

    loadPrefetchedData().then(() => {
        renderCredits();
    });
}

async function init() {
    console.log('[Init] Starting stream credits overlay...');
    console.log('[Init] Duration:', DURATION, 'seconds (URL parameter)');
    console.log('[Init] Effective Scroll Duration:', scrollDuration, 'seconds');
    console.log('[Init] Data Path:', DATA_PATH);
    console.log('[Init] Days Filter:', DAYS_FILTER, 'days');

    await loadPrefetchedData();

    startCredits();

    console.log('[Init] Credits overlay initialized!');
}

window.addEventListener('DOMContentLoaded', init);

// Public API for manual control
window.triggerCredits = startCredits;

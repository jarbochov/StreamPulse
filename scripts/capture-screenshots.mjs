import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import promoModel from '../public/js/promo-model.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const docsImgDir = path.join(__dirname, '..', 'docs', 'images');

const baseUrl = (process.env.STREAMPULSE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const dummyPromo = {
    ...promoModel.normalize({
        name: 'Fictional expedition', title: 'Tonight,\nwe go beyond.', subtitle: 'First steps. Big discoveries.\nJoin the expedition.',
        badge: 'LIVE TONIGHT / 8 PM', url: 'fictionalstudio42', theme: 'purple',
        photo: '/custom-overlay-assets/promo-fictional-scene.svg'
    }),
    id: 'fictional-promo'
};
dummyPromo.layouts.square.background = promoModel.background({
    ...dummyPromo.layouts.square.background, mode: 'pattern', pattern: 'hexagons', motion: 'sweep'
});
const dummyPromoImage = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">
<defs><linearGradient id="sky" x2=".6" y2="1"><stop stop-color="#080d29"/><stop offset=".55" stop-color="#66379d"/><stop offset="1" stop-color="#ffb382"/></linearGradient>
<radialGradient id="moon"><stop stop-color="#ffe8bd"/><stop offset="1" stop-color="#e395d9"/></radialGradient></defs>
<path fill="url(#sky)" d="M0 0h1600v900H0z"/><circle cx="1150" cy="300" r="175" fill="url(#moon)"/>
<g fill="white" opacity=".8"><circle cx="200" cy="120" r="2"/><circle cx="450" cy="230" r="3"/><circle cx="800" cy="80" r="2"/><circle cx="1450" cy="160" r="2"/><circle cx="650" cy="310" r="2"/><circle cx="130" cy="350" r="2"/></g>
<path fill="#46355f" d="M0 590 230 350 410 560 680 400 960 610 1270 470 1600 620V900H0Z"/>
<path fill="#221c40" d="M0 710 300 560 520 740 850 520 1120 720 1440 590 1600 740V900H0Z"/>
<path fill="#101329" d="M0 830 290 720 590 820 840 710 1180 840 1450 710 1600 800V900H0Z"/>
<path stroke="#f3b6ff" stroke-width="3" fill="none" opacity=".55" d="m300 560 220 180 330-220 270 200"/>
<g transform="translate(820 666)" fill="#0a1021"><circle cx="0" cy="-42" r="12"/><path d="m-10-28 20 0 8 45-35 0zM-9 12l-10 35h12L2 16l8 31h12L12 10z"/></g>
</svg>`;

// Fictional, engaging dummy community members
const dummyCommunityList = {
    chatters: [
        {
            username: 'PixelKnight',
            displayName: 'PixelKnight',
            firstSeen: '2026-01-10T18:00:00.000Z',
            lastSeen: '2026-10-18T20:30:00.000Z',
            streamCount: 48,
            messageCount: 3840,
            bits: 12500,
            gifts: 15,
            raids: 3,
            isMod: true,
            isVip: false,
            isSub: true,
            subMonths: 18,
            tags: ['mod', 'speedrunner', 'regular'],
            notes: 'Channel moderator & speedrun community host. Very helpful with new viewers.',
            pronouns: 'they/them'
        },
        {
            username: 'CosmicVoyager',
            displayName: 'CosmicVoyager',
            firstSeen: '2026-02-14T19:00:00.000Z',
            lastSeen: '2026-10-17T22:15:00.000Z',
            streamCount: 36,
            messageCount: 2410,
            bits: 7500,
            gifts: 30,
            raids: 1,
            isMod: false,
            isVip: true,
            isSub: true,
            subMonths: 12,
            tags: ['vip', 'artist', 'regular'],
            notes: 'Community artist, created sub badges and channel emotes.',
            pronouns: 'she/her'
        },
        {
            username: 'RetroSamurai',
            displayName: 'RetroSamurai',
            firstSeen: '2026-03-01T20:00:00.000Z',
            lastSeen: '2026-10-16T21:00:00.000Z',
            streamCount: 29,
            messageCount: 1850,
            bits: 5000,
            gifts: 8,
            raids: 2,
            isMod: false,
            isVip: true,
            isSub: true,
            subMonths: 9,
            tags: ['vip', 'regular'],
            notes: 'Retro gaming fan, always recommends classic SNES RPGs.',
            pronouns: 'he/him'
        },
        {
            username: 'NebulaFox',
            displayName: 'NebulaFox',
            firstSeen: '2026-04-12T18:30:00.000Z',
            lastSeen: '2026-10-15T23:00:00.000Z',
            streamCount: 22,
            messageCount: 1120,
            bits: 2500,
            gifts: 4,
            raids: 0,
            isMod: false,
            isVip: false,
            isSub: true,
            subMonths: 6,
            tags: ['regular'],
            notes: 'Joined during anniversary subathon, active during evening streams.',
            pronouns: 'they/them'
        },
        {
            username: 'ArcadeHero',
            displayName: 'ArcadeHero',
            firstSeen: '2026-05-20T19:00:00.000Z',
            lastSeen: '2026-10-14T20:00:00.000Z',
            streamCount: 18,
            messageCount: 940,
            bits: 1000,
            gifts: 2,
            raids: 0,
            isMod: false,
            isVip: false,
            isSub: false,
            subMonths: 0,
            tags: ['regular'],
            notes: 'High-score chaser on retro arcade games.',
            pronouns: 'he/him'
        },
        {
            username: 'StarGazer',
            displayName: 'StarGazer',
            firstSeen: '2026-10-18T19:30:00.000Z',
            lastSeen: '2026-10-18T21:45:00.000Z',
            streamCount: 1,
            messageCount: 42,
            bits: 500,
            gifts: 0,
            raids: 0,
            isMod: false,
            isVip: false,
            isSub: false,
            subMonths: 0,
            tags: ['newcomer'],
            notes: 'First time viewer, discovered channel from a raid by RetroSamurai.',
            pronouns: 'she/her'
        }
    ],
    tags: ['mod', 'vip', 'regular', 'artist', 'speedrunner', 'newcomer', 'lapsed'],
    summary: {
        total: 154,
        regulars: 32,
        vips: 8,
        mods: 5,
        totalMessages: 54200
    }
};

const dummyDossierPixelKnight = {
    username: 'PixelKnight',
    broadcaster: 'DemoStreamer',
    pronouns: 'they/them',
    isMod: true,
    isVip: false,
    isSubscriber: true,
    subMonths: 18,
    firstSeen: '2026-01-10T18:00:00.000Z',
    lastSeen: '2026-10-18T20:30:00.000Z',
    sessionsAttended: 48,
    totalMessages: 3840,
    bitsTotal: 12500,
    giftSubsTotal: 15,
    raidsCount: 3,
    favoriteGames: [
        { category: "Castlevania: Belmont's Curse", sessions: 24, messages: 1850 },
        { category: 'The Legend of Zelda: Ocarina of Time', sessions: 14, messages: 1120 },
        { category: 'Super Meat Boy', sessions: 10, messages: 870 }
    ],
    notes: 'Channel moderator & speedrun community host. Very helpful with new viewers.',
    tags: ['mod', 'speedrunner', 'regular']
};

const dummyAlertEvents = [
    {
        id: 'ev-1',
        type: 'cheer',
        username: 'PixelKnight',
        details: 'cheered 500 bits',
        amount: 500,
        timestamp: Date.now() - 1000 * 60 * 2,
        ruleName: 'Bits Tier 2'
    },
    {
        id: 'ev-2',
        type: 'subscription',
        username: 'CosmicVoyager',
        details: 'subscribed at Tier 1 (12 months)',
        amount: 1,
        timestamp: Date.now() - 1000 * 60 * 14,
        ruleName: 'Resub Chime'
    },
    {
        id: 'ev-3',
        type: 'raid',
        username: 'RetroSamurai',
        details: 'raided with 45 viewers',
        amount: 45,
        timestamp: Date.now() - 1000 * 60 * 32,
        ruleName: 'Raid Fanfare'
    },
    {
        id: 'ev-4',
        type: 'follow',
        username: 'StarGazer',
        details: 'followed the channel',
        amount: 1,
        timestamp: Date.now() - 1000 * 60 * 55,
        ruleName: 'New Follower Pop'
    }
];

const dummyAlertsState = {
    rules: [
        { id: 'r1', name: 'Bits Tier 2', eventType: 'bits', minAmount: 500, enabled: true },
        { id: 'r2', name: 'Resub Chime', eventType: 'sub', enabled: true },
        { id: 'r3', name: 'Raid Fanfare', eventType: 'raid', minAmount: 20, enabled: true },
        { id: 'r4', name: 'New Follower Pop', eventType: 'follow', enabled: true }
    ],
    queue: {
        paused: false,
        current: null,
        pending: 0,
        events: [
            {
                id: 'ev-1',
                at: Date.now() - 1000 * 45,
                status: 'shown',
                event: { type: 'bits', user: 'PixelKnight', amount: '500 bits' }
            },
            {
                id: 'ev-2',
                at: Date.now() - 1000 * 120,
                status: 'shown',
                event: { type: 'sub', user: 'CosmicVoyager', amount: 'Tier 1 (12 mo)' }
            },
            {
                id: 'ev-3',
                at: Date.now() - 1000 * 300,
                status: 'shown',
                event: { type: 'raid', user: 'RetroSamurai', amount: '45 viewers' }
            },
            {
                id: 'ev-4',
                at: Date.now() - 1000 * 600,
                status: 'shown',
                event: { type: 'follow', user: 'StarGazer', amount: '' }
            }
        ],
        history: [
            {
                id: 'h-1',
                title: 'Bits Tier 2 — PixelKnight (500 bits)',
                shownAt: Date.now() - 1000 * 45,
                test: false
            },
            {
                id: 'h-2',
                title: 'Resub Chime — CosmicVoyager (Tier 1)',
                shownAt: Date.now() - 1000 * 120,
                test: false
            },
            {
                id: 'h-3',
                title: 'Raid Fanfare — RetroSamurai (45 viewers)',
                shownAt: Date.now() - 1000 * 300,
                test: false
            }
        ]
    }
};

const dummyChatLog = {
    session: '__current__',
    messages: [
        { id: 'm1', user: 'PixelKnight', displayName: 'PixelKnight', message: 'Welcome in everyone! Tonight we are doing the Castlevania run!', timestamp: Date.now() - 3600000, isMod: true, isSub: true, isVip: false, subMonths: 18, color: '#3b82f6', badges: ['moderator/1', 'subscriber/12'] },
        { id: 'm2', user: 'CosmicVoyager', displayName: 'CosmicVoyager', message: 'Hype! Grab your snacks and settle in chat :D', timestamp: Date.now() - 3400000, isMod: false, isSub: true, isVip: true, subMonths: 12, color: '#ec4899', badges: ['vip/1', 'subscriber/12'] },
        { id: 'm3', user: 'RetroSamurai', displayName: 'RetroSamurai', message: 'cheered 500 bits: Let\'s get that sub-40 minute run tonight!', timestamp: Date.now() - 3100000, isMod: false, isSub: true, isVip: true, subMonths: 9, bits: 500, color: '#eab308', badges: ['vip/1', 'bits/100'] },
        { id: 'm4', user: 'NebulaFox', displayName: 'NebulaFox', message: 'That jump in stage 4 was insane! Clean execution!', timestamp: Date.now() - 2500000, isMod: false, isSub: true, isVip: false, subMonths: 6, color: '#10b981', badges: ['subscriber/6'] },
        { id: 'm5', user: 'StarGazer', displayName: 'StarGazer', message: 'First time chatter here, loving the vibes in this community!', timestamp: Date.now() - 1900000, isMod: false, isSub: false, isVip: false, subMonths: 0, color: '#8b5cf6', badges: [] },
        { id: 'm6', user: 'ArcadeHero', displayName: 'ArcadeHero', message: 'The overlay ticker looks so clean! What game is next on the schedule?', timestamp: Date.now() - 1200000, isMod: false, isSub: false, isVip: false, subMonths: 0, color: '#06b6d4', badges: [] },
        { id: 'm7', user: 'PixelKnight', displayName: 'PixelKnight', message: 'Up next is Zelda Ocarina of Time! Check the Game Plan banner above.', timestamp: Date.now() - 600000, isMod: true, isSub: true, isVip: false, subMonths: 18, color: '#3b82f6', badges: ['moderator/1', 'subscriber/12'] }
    ]
};

const dummySessionData = {
    streamer: 'DemoStreamer',
    title: 'Retro Speedruns & Community Hangout',
    category: "Castlevania: Belmont's Curse",
    startedAt: new Date(Date.now() - 3600000 * 3).toISOString(),
    chatters: {
        PixelKnight: { count: 48, first: Date.now() - 3600000 * 3, last: Date.now(), isSub: true, isMod: true, isVip: false },
        CosmicVoyager: { count: 36, first: Date.now() - 3600000 * 3, last: Date.now(), isSub: true, isMod: false, isVip: true },
        RetroSamurai: { count: 29, first: Date.now() - 3600000 * 2, last: Date.now(), isSub: true, isMod: false, isVip: true },
        NebulaFox: { count: 22, first: Date.now() - 3600000 * 2, last: Date.now(), isSub: true, isMod: false, isVip: false },
        StarGazer: { count: 12, first: Date.now() - 3600000, last: Date.now(), isSub: false, isMod: false, isVip: false },
        ArcadeHero: { count: 14, first: Date.now() - 3600000, last: Date.now(), isSub: false, isMod: false, isVip: false }
    },
    subs: [
        { name: 'PixelKnight', tier: 'Tier 3', months: 18 },
        { name: 'CosmicVoyager', tier: 'Tier 1', months: 12 },
        { name: 'RetroSamurai', tier: 'Tier 1', months: 9 },
        { name: 'NebulaFox', tier: 'Tier 1', months: 6 }
    ],
    cheers: {
        PixelKnight: 12500,
        CosmicVoyager: 7500,
        RetroSamurai: 5000
    },
    emotes: {
        'streampulseHype': 24,
        'streampulseGG': 18,
        'streampulseHeart': 15
    },
    hashtags: {
        '#speedrun': 12,
        '#retro': 8
    },
    viewerStats: {
        current: 84,
        peak: 112,
        average: 76,
        samples: [45, 52, 68, 79, 94, 112, 98, 88, 84]
    }
};

const dummyHighlights = [
    {
        id: 'h1',
        ts: Date.now() - 3100000,
        user: 'RetroSamurai',
        message: 'cheered 500 bits: Let\'s get that sub-40 minute run tonight!',
        pinned: true
    }
];

const dummyActivePoll = {
    id: 'poll-fictional-1',
    title: "Tonight's Next Retro Run?",
    status: 'ACTIVE',
    source: 'streampulse',
    duration: 120,
    startedAt: new Date(Date.now() - 45000).toISOString(),
    remainingSeconds: 75,
    totalVotes: 98,
    blind: false,
    keywordVoting: true,
    isTie: false,
    winner: '',
    winningVotes: 0,
    winningPercent: 0,
    settings: {
        blind: false,
        keywordVoting: true,
        subMultiplier: 2,
        resultsSeconds: 15,
        celebration: { sound: true, confetti: true }
    },
    choices: [
        { id: '1', title: "Castlevania: Symphony of the Night", votes: 47, percent: 48 },
        { id: '2', title: "Super Metroid (Any% Speedrun)", votes: 31, percent: 32 },
        { id: '3', title: "Chrono Trigger (Level 1 Run)", votes: 20, percent: 20 }
    ]
};

const dummyTournament = {
    id: 'tourney-fictional-1',
    title: 'Community Retro Championship',
    format: 'single',
    progressionMode: 'manual',
    scoringType: 'bestOf',
    bestOf: 3,
    targetScore: 2,
    status: 'ACTIVE',
    activeMatchId: 'm_1_1',
    rounds: [
        {
            roundIndex: 0,
            name: 'Semifinals',
            matches: [
                {
                    id: 'm_0_1',
                    roundIndex: 0,
                    matchIndex: 0,
                    status: 'COMPLETED',
                    entrant1: { name: 'PixelKnight', seed: 1, score: 2, tag: 'Ryu', winner: true },
                    entrant2: { name: 'RetroSamurai', seed: 4, score: 0, tag: 'Ken', winner: false },
                    winner: 'PixelKnight',
                    matchDetails: 'Semifinal 1'
                },
                {
                    id: 'm_0_2',
                    roundIndex: 0,
                    matchIndex: 1,
                    status: 'COMPLETED',
                    entrant1: { name: 'CosmicVoyager', seed: 2, score: 2, tag: 'Chun-Li', winner: true },
                    entrant2: { name: 'NebulaFox', seed: 3, score: 1, tag: 'Cammy', winner: false },
                    winner: 'CosmicVoyager',
                    matchDetails: 'Semifinal 2'
                }
            ]
        },
        {
            roundIndex: 1,
            name: 'Grand Finals',
            matches: [
                {
                    id: 'm_1_1',
                    roundIndex: 1,
                    matchIndex: 0,
                    status: 'ACTIVE',
                    entrant1: { name: 'PixelKnight', seed: 1, score: 1, tag: 'Ryu' },
                    entrant2: { name: 'CosmicVoyager', seed: 2, score: 1, tag: 'Chun-Li' },
                    matchDetails: 'Grand Finals — Game 3'
                }
            ]
        }
    ],
    entrants: ['PixelKnight', 'RetroSamurai', 'CosmicVoyager', 'NebulaFox'],
    champion: null
};

const dummyMatchup = {
    id: 'matchup-fictional-1',
    title: 'EVO Champions Exhibition',
    phase: 'Grand Finals',
    details: 'Best of 5',
    competitorCount: 2,
    competitors: [
        { id: 'c1', name: 'PixelKnight', tag: 'Ryu', color: '#3b82f6', score: 2, rounds: 1 },
        { id: 'c2', name: 'CosmicVoyager', tag: 'Chun-Li', color: '#ec4899', score: 1, rounds: 0 }
    ],
    format: 'bestOf',
    bestOf: 5,
    targetScore: 3,
    status: 'ACTIVE',
    winner: null,
    clock: {
        enabled: true,
        mode: 'countdown',
        runnerTimersMode: 'finish',
        showSplits: true,
        duration: 99,
        remaining: 74,
        elapsed: 25,
        isRunning: true,
        startedAt: Date.now() - 25000,
        estimate: '45:00',
        split: ''
    },
    queue: [
        { id: 'q1', title: 'Next Exhibition: Speedrun Showdown', p1: 'ArcadeHero', p2: 'StarGazer', format: 'Best of 3' }
    ],
    presets: []
};

const dummyChatbotSnapshot = {
    enabled: true,
    moduleEnabled: true,
    botActive: true,
    ssnConfigured: true,
    broadcaster: 'DemoStreamer',
    twitchMods: [{ name: 'PixelKnight', displayName: 'PixelKnight' }],
    settings: {
        enabled: true,
        prefix: '!',
        tag: '[BOT]',
        cooldown: 5,
        mods: ['PixelKnight'],
        autoShoutout: {
            enabled: true,
            message: 'Huge thanks for the raid @{{user}}! Show some love over at twitch.tv/{{user}}',
            minViewers: 5
        },
        pollAnnouncements: {
            enabled: true,
            announceStart: true,
            announceEnd: true,
            startTemplate: '[Poll] {title} ({duration})\n{choices}',
            endTemplate: '[Poll Result] Winner: {winner} with {votes} votes ({percent}%)!',
            tieTemplate: '[Poll Result] The poll ended in a tie between {choices}!',
            championTemplate: '[Tournament Champion] {champion} has won {title}!'
        }
    },
    commands: [
        { name: 'discord', reply: 'Join our friendly retro gaming Discord community: https://discord.gg/streampulse', enabled: true, modOnly: false, cooldown: 5, count: 84 },
        { name: 'game', reply: "Tonight's featured speedrun: Castlevania: Belmont's Curse! Check out Game Plan above.", enabled: true, modOnly: false, cooldown: 5, count: 62 },
        { name: 'schedule', reply: 'Live Mon/Wed/Fri at 7 PM ET, Retro Marathon Saturdays at 2 PM ET!', enabled: true, modOnly: false, cooldown: 10, count: 41 },
        { name: 'rules', reply: '1. Be respectful to chat and mods. 2. No backseating unless asked. 3. Have fun!', enabled: true, modOnly: false, cooldown: 15, count: 28 },
        { name: 'hype', reply: 'StreamPulse HYPE! Let\'s go chat!!', enabled: true, modOnly: false, cooldown: 5, count: 119 },
        { name: 'hydrate', reply: 'Friendly hydration reminder for the streamer and chat! Drink some water!', enabled: true, modOnly: false, cooldown: 30, count: 35 }
    ],
    quotes: [
        { id: 'q1', text: 'That jump was pixel-perfect!', author: 'PixelKnight', date: '2026-10-14' },
        { id: 'q2', text: 'Never celebrate before the final boss phase.', author: 'CosmicVoyager', date: '2026-10-16' },
        { id: 'q3', text: 'Sub-40 minute run or we riot!', author: 'RetroSamurai', date: '2026-10-18' }
    ],
    messages: [
        { id: 'm1', name: 'Socials Reminder', text: 'Enjoying the stream? Don\'t forget to follow and check !discord !', kind: 'interval', value: 20, enabled: true }
    ],
    triggers: []
};

const dummySessionsList = [
    {
        file: '__current__',
        label: 'Current Broadcast (Live)',
        date: '2026-10-18',
        duration: '3h 12m',
        category: "Castlevania: Belmont's Curse",
        title: 'Retro Speedruns & Community Hangout',
        chatters: 6,
        messages: 168
    },
    {
        file: 'chat-2026-10-16T20-00.json',
        label: 'Friday Retro Night',
        date: '2026-10-16',
        duration: '4h 05m',
        category: 'Super Meat Boy',
        title: 'Dark World Gauntlet — No Death Runs',
        chatters: 24,
        messages: 890
    }
];

async function run() {
    let serverInstance = null;
    try {
        const check = await fetch(`${baseUrl}/api/status`).catch(() => null);
        if (!check || !check.ok) {
            console.log('Backend server not detected on port 3000. Launching in-process server...');
            serverInstance = await import('../server.js');
            await new Promise(r => setTimeout(r, 1500));
        }
    } catch {
        serverInstance = await import('../server.js');
        await new Promise(r => setTimeout(r, 1500));
    }

    console.log(`Connecting to ${baseUrl} to capture sanitized documentation screenshots...`);
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1600,1000']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 2 });
    page.on('dialog', async d => { await d.accept(); });

    // Enable request interception to guarantee zero real streamer or chatter data
    await page.setRequestInterception(true);
    page.on('request', req => {
        const url = req.url();
        if (url.includes('/api/promo-themes')) {
            req.respond({ status: 200, contentType: 'application/json', body: '[]' });
        } else if (url.includes('/api/promos')) {
            req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify([dummyPromo]) });
        } else if (url.includes('/custom-overlay-assets/promo-fictional-scene.svg')) {
            req.respond({ status: 200, contentType: 'image/svg+xml', body: dummyPromoImage });
        } else if (url.includes('/api/chatters/PixelKnight')) {
            req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(dummyDossierPixelKnight) });
        } else if (url.includes('/api/chatters')) {
            req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(dummyCommunityList) });
        } else if (url.includes('/api/alerts/events') || url.includes('/api/events')) {
            req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(dummyAlertEvents) });
        } else if (url.endsWith('/api/alerts') || url.includes('/api/alerts?')) {
            req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(dummyAlertsState) });
        } else if (url.includes('/api/chat-log')) {
            req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(dummyChatLog) });
        } else if (url.includes('/api/chat')) {
            req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(dummySessionData) });
        } else if (url.includes('/api/sessions')) {
            req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(dummySessionsList) });
        } else if (url.includes('/api/highlights')) {
            req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(dummyHighlights) });
        } else if (url.includes('/api/polls/active') || url.includes('/api/polls/status') || url.includes('/api/polls/latest')) {
            req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(dummyActivePoll) });
        } else if (url.includes('/api/polls/presets')) {
            req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
        } else if (url.includes('/api/polls/tournament')) {
            req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(dummyTournament) });
        } else if (url.includes('/api/tournament/presets')) {
            req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
        } else if (url.includes('/api/tournament/drafts') || url.includes('/api/tournament/history')) {
            req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
        } else if (url.includes('/api/tournament')) {
            req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(dummyTournament) });
        } else if (url.includes('/api/matchup/history') || url.includes('/api/matchup/queue')) {
            req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
        } else if (url.includes('/api/matchup')) {
            req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(dummyMatchup) });
        } else if (url.includes('/api/chatbot')) {
            req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(dummyChatbotSnapshot) });
        } else {
            req.continue();
        }
    });

    const targets = [
        {
            url: `${baseUrl}/promo-creator.html?id=fictional-promo`,
            file: 'promo-creator.png',
            wait: 1200,
            action: async p => {
                await p.setViewport({ width: 1600, height: 1600, deviceScaleFactor: 2 });
                await p.click('#rail-tab-appearance');
            }
        },
        {
            url: `${baseUrl}/dashboard.html`,
            file: 'dashboard.png',
            wait: 1500
        },
        {
            url: `${baseUrl}/custom-overlay-editor.html?id=border-showcase&select=elem-neon`,
            file: 'custom-overlay-studio.png',
            wait: 2500,
            action: async (p) => {
                await p.evaluate(() => {
                    if (window.fitView) window.fitView(true);
                });
                await new Promise(r => setTimeout(r, 800));
            }
        },
        {
            url: `${baseUrl}/randomizer-editor.html`,
            file: 'randomizer-studio.png',
            wait: 1500
        },
        {
            url: `${baseUrl}/credits-editor.html`,
            file: 'credits-studio.png',
            wait: 1500
        },
        {
            url: `${baseUrl}/game-plan-editor.html`,
            file: 'game-plan-studio.png',
            wait: 2000,
            action: async (p) => {
                await p.evaluate(() => {
                    const calBtn = document.querySelector('[data-view="calendar"]');
                    if (calBtn) calBtn.click();
                });
                await new Promise(r => setTimeout(r, 1000));
            }
        },
        {
            url: `${baseUrl}/analytics.html`,
            file: 'community-directory.png',
            wait: 1500,
            action: async (p) => {
                await p.evaluate(() => {
                    const crmTab = document.querySelector('.tab-btn[data-tab="crm"]');
                    if (crmTab) crmTab.click();
                });
                await new Promise(r => setTimeout(r, 1000));
            }
        },
        {
            url: `${baseUrl}/analytics.html`,
            file: 'chatter-dossier.png',
            wait: 1500,
            action: async (p) => {
                await p.evaluate(() => {
                    const crmTab = document.querySelector('.tab-btn[data-tab="crm"]');
                    if (crmTab) crmTab.click();
                });
                await new Promise(r => setTimeout(r, 800));
                await p.evaluate(() => {
                    if (typeof window.openChatterDossier === 'function') {
                        window.openChatterDossier('PixelKnight');
                    } else {
                        const firstChatter = document.querySelector('.crm-user-link, [data-chatter="PixelKnight"]');
                        if (firstChatter) firstChatter.click();
                    }
                });
                await new Promise(r => setTimeout(r, 1000));
            }
        },
        {
            url: `${baseUrl}/alert-queue.html`,
            file: 'alert-queue.png',
            wait: 1500,
            action: async (p) => {
                await p.setViewport({ width: 440, height: 680, deviceScaleFactor: 2 });
            }
        },
        {
            url: `${baseUrl}/overlays/randomizer.html?preset=jackbox`,
            file: 'randomizer-overlay.png',
            wait: 2000,
            action: async (p) => {
                await p.setViewport({ width: 1280, height: 720, deviceScaleFactor: 2 });
            }
        },
        {
            url: `${baseUrl}/sessions.html`,
            file: 'overview-chat-log.png',
            wait: 2000,
            action: async (p) => {
                await p.setViewport({ width: 1440, height: 860, deviceScaleFactor: 2 });
                await p.evaluate(async () => {
                    const firstSession = document.querySelector('.session-item');
                    if (firstSession) {
                        firstSession.click();
                        await new Promise(r => setTimeout(r, 800));
                        const chatBtn = Array.from(document.querySelectorAll('.detail-header-actions button')).find(b => b.textContent.includes('Chat Log'));
                        if (chatBtn) chatBtn.click();
                    }
                });
                await new Promise(r => setTimeout(r, 1200));
            }
        },
        {
            url: `${baseUrl}/overlays/credits.html?preview=true`,
            file: 'overview-credits-roll.png',
            wait: 2000,
            action: async (p) => {
                await p.setViewport({ width: 1280, height: 720, deviceScaleFactor: 2 });
                await p.evaluate(() => {
                    document.body.style.backgroundColor = '#0d1117';
                    const container = document.getElementById('credits-container');
                    if (container) {
                        container.style.position = 'relative';
                        container.style.top = '0';
                        container.style.display = 'block';
                        container.style.opacity = '1';
                        container.style.padding = '40px 60px';
                        container.style.maxWidth = '800px';
                        container.style.margin = '0 auto';
                        container.style.textAlign = 'center';
                        container.innerHTML = `
                            <div class="section" style="margin-bottom:32px;">
                                <h1 style="font-size:2.8rem;margin-bottom:8px;color:#fff;letter-spacing:1px;font-family:'Jersey 20',sans-serif;">Thank you for watching!</h1>
                                <h3 style="font-size:1.4rem;color:#8b949e;font-family:'Jersey 20',sans-serif;">Broadcast Credits · Six Year Anniversary Special</h3>
                            </div>
                            <div class="section" style="margin-bottom:32px;">
                                <h2 style="font-size:1.8rem;color:#58a6ff;margin-bottom:12px;text-transform:uppercase;letter-spacing:2px;font-family:'Jersey 20',sans-serif;">Subscribers</h2>
                                <div style="display:flex;justify-content:center;gap:24px;flex-wrap:wrap;font-size:1.4rem;color:#c9d1d9;font-family:'Jersey 20',sans-serif;">
                                    <span>PixelKnight</span>
                                    <span>CosmicVoyager</span>
                                    <span>RetroSamurai</span>
                                    <span>NebulaFox</span>
                                </div>
                            </div>
                            <div class="section" style="margin-bottom:32px;">
                                <h2 style="font-size:1.8rem;color:#e3b341;margin-bottom:12px;text-transform:uppercase;letter-spacing:2px;font-family:'Jersey 20',sans-serif;">Cheerers &amp; Supporters</h2>
                                <div style="display:flex;justify-content:center;gap:24px;flex-wrap:wrap;font-size:1.4rem;color:#c9d1d9;font-family:'Jersey 20',sans-serif;">
                                    <span>RetroSamurai (500 bits)</span>
                                    <span>PixelKnight (250 bits)</span>
                                </div>
                            </div>
                            <div class="section" style="margin-bottom:32px;">
                                <h2 style="font-size:1.8rem;color:#3fb950;margin-bottom:12px;text-transform:uppercase;letter-spacing:2px;font-family:'Jersey 20',sans-serif;">Today's Chatters</h2>
                                <div style="display:flex;justify-content:center;gap:18px;flex-wrap:wrap;font-size:1.3rem;color:#c9d1d9;font-family:'Jersey 20',sans-serif;max-width:650px;margin:0 auto;">
                                    <span>ArcadeHero</span>
                                    <span>StarGazer</span>
                                    <span>CosmicVoyager</span>
                                    <span>PixelKnight</span>
                                    <span>NebulaFox</span>
                                    <span>RetroSamurai</span>
                                </div>
                            </div>
                            <div class="section closing" style="margin-top:36px;">
                                <h2 style="font-size:1.8rem;color:#fff;font-family:'Jersey 20',sans-serif;">Thanks for being part of the community!</h2>
                            </div>
                        `;
                    }
                });
                await new Promise(r => setTimeout(r, 600));
            }
        },
        {
            url: `${baseUrl}/overlays/game-plan.html?mode=ticker&theme=dark`,
            file: 'game-plan-overlay-ticker.png',
            wait: 2000,
            action: async (p) => {
                await p.setViewport({ width: 1280, height: 160, deviceScaleFactor: 2 });
            }
        },
        {
            url: `${baseUrl}/overlays/game-plan.html?mode=schedule&theme=dark&max=4`,
            file: 'game-plan-overlay-schedule.png',
            wait: 2000,
            action: async (p) => {
                await p.setViewport({ width: 1200, height: 260, deviceScaleFactor: 2 });
            }
        },
        {
            url: `${baseUrl}/overlays/game-plan.html?mode=checklist&theme=dark&max=4`,
            file: 'game-plan-overlay-checklist.png',
            wait: 2000,
            action: async (p) => {
                await p.setViewport({ width: 440, height: 480, deviceScaleFactor: 2 });
            }
        },
        {
            url: `${baseUrl}/overlay-url-wizard.html`,
            file: 'wizard-credits-overlay.png',
            wait: 2000,
            action: async (p) => {
                await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
            }
        },
        {
            url: `${baseUrl}/game-plan-url-wizard.html`,
            file: 'wizard-game-plan.png',
            wait: 2000,
            action: async (p) => {
                await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
            }
        },
        {
            url: `${baseUrl}/timer-url-wizard.html`,
            file: 'wizard-timer.png',
            wait: 2000,
            action: async (p) => {
                await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
            }
        },
        {
            url: `${baseUrl}/music-url-wizard.html`,
            file: 'wizard-music.png',
            wait: 2000,
            action: async (p) => {
                await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
            }
        },
        {
            url: `${baseUrl}/milestone-url-wizard.html`,
            file: 'wizard-milestone.png',
            wait: 2000,
            action: async (p) => {
                await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
            }
        },
        {
            url: `${baseUrl}/polls.html`,
            file: 'polls-studio.png',
            wait: 2000,
            action: async (p) => {
                await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
            }
        },
        {
            url: `${baseUrl}/overlays/poll.html?preview=1`,
            file: 'poll-overlay.png',
            wait: 1500,
            action: async (p) => {
                await p.setViewport({ width: 640, height: 420, deviceScaleFactor: 2 });
            }
        },
        {
            url: `${baseUrl}/versus.html`,
            file: 'tournament-studio.png',
            wait: 2000,
            action: async (p) => {
                await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
                await p.evaluate(() => {
                    const btn = document.getElementById('tab-btn-tourney');
                    if (btn) btn.click();
                });
                await new Promise(r => setTimeout(r, 1000));
            }
        },
        {
            url: `${baseUrl}/overlays/tournament.html?preview=1&layout=tree`,
            file: 'tournament-overlay.png',
            wait: 2000,
            action: async (p) => {
                await p.setViewport({ width: 1280, height: 720, deviceScaleFactor: 2 });
            }
        },
        {
            url: `${baseUrl}/versus.html`,
            file: 'versus-studio.png',
            wait: 2000,
            action: async (p) => {
                await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
                await p.evaluate(() => {
                    const btn = document.getElementById('tab-btn-matchup');
                    if (btn) btn.click();
                });
                await new Promise(r => setTimeout(r, 1000));
            }
        },
        {
            url: `${baseUrl}/overlays/matchup.html?preview=1&layout=fgc`,
            file: 'matchup-overlay.png',
            wait: 1500,
            action: async (p) => {
                await p.setViewport({ width: 1280, height: 180, deviceScaleFactor: 2 });
            }
        },
        {
            url: `${baseUrl}/chatbot.html`,
            file: 'chatbot-studio.png',
            wait: 2000,
            action: async (p) => {
                await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
            }
        },
        {
            url: `${baseUrl}/tools/alerts.html`,
            file: 'alerts-studio.png',
            wait: 2000,
            action: async (p) => {
                await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
            }
        }
    ];

    const only = process.argv.find(arg => arg.startsWith('--only='))?.slice('--only='.length);
    const onlyList = only ? only.split(',').map(s => s.trim().endsWith('.png') ? s.trim() : `${s.trim()}.png`) : null;
    const selectedTargets = onlyList ? targets.filter(target => onlyList.includes(target.file)) : targets;
    if (!selectedTargets.length) throw new Error(`Unknown screenshot target(s): ${only}`);
    for (const target of selectedTargets) {
        try {
            console.log(`Capturing ${target.url} -> ${target.file}...`);
            await page.goto(target.url, { waitUntil: 'networkidle2', timeout: 30000 });
            if (target.wait) {
                await new Promise(r => setTimeout(r, target.wait));
            }
            if (target.action) {
                await target.action(page);
            }
            const outPath = path.join(docsImgDir, target.file);
            await page.screenshot({ path: outPath, fullPage: false });
            console.log(`Saved sanitized: ${outPath}`);
        } catch (err) {
            console.error(`Failed capturing ${target.file}:`, err.message);
        }
    }

    await browser.close();
    if (serverInstance && typeof serverInstance.gracefulShutdown === 'function') {
        serverInstance.gracefulShutdown('CAPTURE_DONE', false);
    }
    console.log('All sanitized screenshots captured successfully!');
    process.exit(0);
}

run().catch(err => {
    console.error('Fatal error capturing screenshots:', err);
    process.exit(1);
});

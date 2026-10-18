import puppeteer from 'puppeteer';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const docsImgDir = path.join(__dirname, '..', 'docs', 'images');

const baseUrl = (process.env.STREAMPULSE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');

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
            notes: 'Consistent weekend regular, loves platformers and racing games.',
            pronouns: 'he/him'
        },
        {
            username: 'GlitchMage',
            displayName: 'GlitchMage',
            firstSeen: '2026-02-01T17:00:00.000Z',
            lastSeen: '2026-08-25T21:00:00.000Z',
            streamCount: 15,
            messageCount: 680,
            bits: 800,
            gifts: 1,
            raids: 0,
            isMod: false,
            isVip: false,
            isSub: false,
            subMonths: 0,
            tags: ['lapsed'],
            notes: 'Historical regular, currently on hiatus for college finals.',
            pronouns: 'she/her'
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

// Detailed dummy dossier for modal view
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
        { category: 'Hades II', sessions: 24, messages: 1850 },
        { category: 'Silent Hill 2', sessions: 14, messages: 1120 },
        { category: 'Celeste', sessions: 10, messages: 870 }
    ],
    notes: 'Channel moderator & community speedrun host. Very helpful with new viewers.',
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

async function run() {
    console.log(`Connecting to ${baseUrl} to capture sanitized documentation screenshots...`);
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1600,1000']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 2 });
    page.on('dialog', async d => { await d.accept(); });

    // Enable request interception to guarantee zero real names
    await page.setRequestInterception(true);
    page.on('request', req => {
        const url = req.url();
        if (url.includes('/api/chatters/PixelKnight')) {
            req.respond({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(dummyDossierPixelKnight)
            });
        } else if (url.includes('/api/chatters')) {
            req.respond({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(dummyCommunityList)
            });
        } else if (url.includes('/api/alerts/events') || url.includes('/api/events')) {
            req.respond({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(dummyAlertEvents)
            });
        } else if (url.endsWith('/api/alerts') || url.includes('/api/alerts?')) {
            req.respond({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(dummyAlertsState)
            });
        } else {
            req.continue();
        }
    });

    const targets = [
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
                // Switch to Community Directory tab
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
                // Switch to Community Directory tab and open Chatter Dossier for PixelKnight
                await p.evaluate(() => {
                    const crmTab = document.querySelector('.tab-btn[data-tab="crm"]');
                    if (crmTab) crmTab.click();
                });
                await new Promise(r => setTimeout(r, 800));
                // Click on PixelKnight in the table or call window.openChatterDossier
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
        }
    ];

    for (const target of targets) {
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
    console.log('All sanitized screenshots captured successfully!');
}

run().catch(err => {
    console.error('Fatal error capturing screenshots:', err);
    process.exit(1);
});

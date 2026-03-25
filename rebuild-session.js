#!/usr/bin/env node
// Rebuild a chat-*.json session file from its chatlog-*.jsonl companion
// Usage: node fix-session.js <chatlog-file.jsonl>
// Output: writes the corresponding chat-*.json in the same directory

const fs = require('fs');
const path = require('path');

const jsonlFile = process.argv[2];
if (!jsonlFile) {
    console.error('Usage: node fix-session.js <chatlog-XXXX.jsonl>');
    process.exit(1);
}

if (!fs.existsSync(jsonlFile)) {
    console.error(`File not found: ${jsonlFile}`);
    process.exit(1);
}

const lines = fs.readFileSync(jsonlFile, 'utf8').trim().split('\n');
const messages = lines.map(l => JSON.parse(l));

// Build session data from chat log messages
const chatters = {};
const followers = [];
const subscribers = [];
const giftSubs = [];
const bits = [];
const donations = [];
const raids = [];
const hashtags = {};
const emotes = {};
const hourlyMessages = {};
let messageCount = 0;

for (const m of messages) {
    const user = m.user;
    if (!user) continue;

    messageCount++;

    // Hourly messages
    const hour = new Date(m.ts).toISOString().slice(0, 13);
    hourlyMessages[hour] = (hourlyMessages[hour] || 0) + 1;

    // Track chatters (skip event messages)
    if (!m.event) {
        if (!chatters[user]) {
            chatters[user] = { chatname: user, chatimg: m.avatar || null, type: m.type || null, messageCount: 0 };
        }
        chatters[user].messageCount++;
    }

    // Extract hashtags from plain text
    const hashtagMatches = (m.message || '').match(/#[a-zA-Z0-9_]+/gi);
    if (hashtagMatches) {
        for (const raw of hashtagMatches) {
            const normalized = raw.toLowerCase();
            if (!hashtags[normalized]) {
                hashtags[normalized] = { count: 0, users: [] };
            }
            hashtags[normalized].count++;
            if (!hashtags[normalized].users.includes(user)) {
                hashtags[normalized].users.push(user);
            }
        }
    }

    // Extract emotes from messageHtml
    if (m.messageHtml) {
        const imgRegex = /<img[^>]+src="([^"]+)"[^>]*alt="([^"]*)"[^>]*>/gi;
        let match;
        while ((match = imgRegex.exec(m.messageHtml)) !== null) {
            const src = match[1];
            const alt = match[2];
            if (alt && src) {
                if (!emotes[alt]) {
                    emotes[alt] = { count: 0, imageUrl: src, users: [] };
                }
                emotes[alt].count++;
                if (!emotes[alt].users.includes(user)) {
                    emotes[alt].users.push(user);
                }
            }
        }
    }
}

const startedAt = messages.length > 0 ? new Date(messages[0].ts).toISOString() : new Date().toISOString();
const lastUpdated = messages.length > 0 ? new Date(messages[messages.length - 1].ts).toISOString() : null;

const sessionData = {
    chatters,
    followers,
    subscribers,
    giftSubs,
    bits,
    donations,
    raids,
    hashtags,
    emotes,
    hourlyMessages,
    startedAt,
    lastUpdated,
    messageCount
};

// Determine output filename
const dir = path.dirname(jsonlFile);
const base = path.basename(jsonlFile);
const chatFilename = base.replace('chatlog-', 'chat-').replace('.jsonl', '.json');
const outPath = path.join(dir, chatFilename);

fs.writeFileSync(outPath, JSON.stringify(sessionData, null, 2));
console.log(`Rebuilt ${outPath} — ${messageCount} messages, ${Object.keys(chatters).length} chatters, ${Object.keys(hashtags).length} hashtags, ${Object.keys(emotes).length} emotes`);

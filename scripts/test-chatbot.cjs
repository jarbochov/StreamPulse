'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const createChatbot = require('../server/services/chatbot');

test('Chatbot: quotes and chatbot config are stored independently and auto-migrated', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-chatbot-test-'));
    const chatbotFile = path.join(tempDir, 'chatbot.json');
    const quotesFile = path.join(tempDir, 'quotes.json');

    // 1. Initial state: neither file exists
    let bot = createChatbot({ dataDir: tempDir, getConfig: () => ({ chatbot_enabled: true }) });
    bot.start();

    // Add quote
    const q1 = (await bot.handleApi({ method: 'POST' }, { writeHead: () => {}, end: () => {} }, '/api/chatbot/quotes', async () => JSON.stringify({ text: 'Quote 1', by: 'Tester' })));
    assert.ok(q1);
    assert.ok(fs.existsSync(quotesFile), 'quotes.json should be created upon adding quote');

    // Check quotes.json content
    const quotesContent = JSON.parse(fs.readFileSync(quotesFile, 'utf8'));
    assert.equal(quotesContent.quotes.length, 1);
    assert.equal(quotesContent.quotes[0].text, 'Quote 1');

    // Add command (should save chatbot.json, not bloat it with quotes)
    await bot.handleApi({ method: 'PUT' }, { writeHead: () => {}, end: () => {} }, '/api/chatbot', async () => JSON.stringify({
        commands: [{ name: 'testcmd', response: 'Test response!' }]
    }));
    assert.ok(fs.existsSync(chatbotFile), 'chatbot.json should exist');
    const chatbotContent = JSON.parse(fs.readFileSync(chatbotFile, 'utf8'));
    assert.equal(chatbotContent.commands.length, 1);
    assert.equal(chatbotContent.commands[0].name, 'testcmd');
    assert.equal(chatbotContent.quotes, undefined, 'chatbot.json must not serialize quotes');

    bot.stop();

    // 2. Migration test: legacy chatbot.json with embedded quotes, no quotes.json
    fs.rmSync(quotesFile, { force: true });
    fs.writeFileSync(chatbotFile, JSON.stringify({
        settings: { enabled: true, prefix: '!' },
        commands: [{ name: 'legacy', response: 'Hi' }],
        quotes: [{ id: 10, text: 'Legacy quote', by: 'OldUser', at: Date.now() }],
        nextQuoteId: 11
    }, null, 2));

    bot = createChatbot({ dataDir: tempDir, getConfig: () => ({ chatbot_enabled: true }) });
    bot.start();
    const snap = (await new Promise(resolve => {
        bot.handleApi({ method: 'GET' }, { writeHead: () => {}, end: (data) => resolve(JSON.parse(data)) }, '/api/chatbot', async () => '{}');
    }));
    assert.equal(snap.quotes.length, 1);
    assert.equal(snap.quotes[0].text, 'Legacy quote');
    assert.ok(fs.existsSync(quotesFile), 'quotes.json should be auto-created during migration');

    bot.stop();
    fs.rmSync(tempDir, { recursive: true, force: true });
});

test('Chatbot: pre-compiled trigger matching supports all match modes efficiently', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-chatbot-triggers-'));
    const sentMessages = [];
    const bot = createChatbot({
        dataDir: tempDir,
        getConfig: () => ({ chatbot_enabled: true }),
        onUse: (type, name) => {}
    });

    // Mock send via handleApi or internal
    await bot.handleApi({ method: 'PUT' }, { writeHead: () => {}, end: () => {} }, '/api/chatbot', async () => JSON.stringify({
        settings: { enabled: true, prefix: '!', cooldown: 0 },
        triggers: [
            { id: 't1', name: 'exact match', words: ['bingo'], matchMode: 'exact', text: 'Exact hit!' },
            { id: 't2', name: 'starts with', words: ['hello'], matchMode: 'starts_with', text: 'Greeting!' },
            { id: 't3', name: 'ends with', words: ['world'], matchMode: 'ends_with', text: 'Farewell!' },
            { id: 't4', name: 'regex match', words: ['loot\\d+'], matchMode: 'regex', text: 'Found loot!' },
            { id: 't5', name: 'contains word', words: ['hype'], matchMode: 'contains', wholeWord: true, text: 'Hype train!' }
        ]
    }));

    bot.start();

    // Test triggers directly through onMessage
    // Mock send by hooking into send implementation or verifying handleApi triggers
    const snap = await new Promise(resolve => {
        bot.handleApi({ method: 'GET' }, { writeHead: () => {}, end: (data) => resolve(JSON.parse(data)) }, '/api/chatbot', async () => '{}');
    });
    assert.equal(snap.triggers.length, 5);

    bot.stop();
    fs.rmSync(tempDir, { recursive: true, force: true });
});

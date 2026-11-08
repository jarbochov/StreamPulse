'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');

const { createTriviaService, DEFAULT_THEME, DEFAULT_SETTINGS, BUILTIN_PRESETS } = require('../server/services/trivia');
const { createTriviaRoutes } = require('../server/routes/trivia');

function createMockReqRes({ method = 'GET', url = '/', headers = {}, body = null }) {
    const req = new Readable({
        read() {
            if (body) {
                this.push(typeof body === 'string' ? body : JSON.stringify(body));
            }
            this.push(null);
        }
    });
    req.method = method;
    req.url = url;
    req.headers = { ...headers };
    if (body && !req.headers['content-type']) {
        req.headers['content-type'] = 'application/json';
    }

    const resHeaders = {};
    let statusCode = 200;
    const chunks = [];
    let onDone;
    const done = new Promise(resolve => { onDone = resolve; });

    const res = {
        statusCode: 200,
        writeHead(code, h = {}) {
            statusCode = code;
            this.statusCode = code;
            Object.assign(resHeaders, h);
            return this;
        },
        setHeader(k, v) { resHeaders[k.toLowerCase()] = v; return this; },
        getHeader(k) { return resHeaders[k.toLowerCase()]; },
        write(c) { chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)); return true; },
        end(c) {
            if (c) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
            const buf = Buffer.concat(chunks);
            const text = buf.toString('utf8');
            let json = null;
            try { json = JSON.parse(text); } catch {}
            onDone({ status: statusCode, headers: resHeaders, text, json });
        }
    };

    return { req, res, done };
}

test('Trivia Service: Initialization, defaults, and presets', (t) => {
    const testDir = path.join(__dirname, '..', 'data', `.test-trivia-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });
    t.after(() => { try { fs.rmSync(testDir, { recursive: true, force: true }); } catch {} });

    const triviaPath = path.join(testDir, 'trivia.json');
    const service = createTriviaService({ dataDir: testDir, triviaPath, broadcastToOverlays: () => {} });

    const state = service.getPublicState({ includeAnswers: false });
    assert.equal(state.status, 'idle');
    assert.equal(state.currentIndex, 0);
    assert.ok(state.totalQuestions >= 5, 'Should load initial questions from default preset');
    assert.equal(state.presets.length, BUILTIN_PRESETS.length);
    assert.equal(state.settings.defaultDuration, 20);
    assert.equal(state.settings.chatVoting, true);
});

test('Trivia Service: Question Management CRUD', (t) => {
    const testDir = path.join(__dirname, '..', 'data', `.test-trivia-crud-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });
    t.after(() => { try { fs.rmSync(testDir, { recursive: true, force: true }); } catch {} });

    const service = createTriviaService({ dataDir: testDir, triviaPath: path.join(testDir, 'trivia.json') });

    // 1. Add question
    const newQ = service.addQuestion({
        category: 'Custom Category',
        question: 'What is the answer to life, universe, and everything?',
        choices: ['40', '41', '42', '43'],
        correctIndex: 2,
        funfact: 'Douglas Adams confirmed 42 was a completely random choice.'
    });
    assert.ok(newQ.id);
    assert.equal(newQ.question, 'What is the answer to life, universe, and everything?');
    assert.equal(newQ.correctIndex, 2);

    // 2. Update question
    const updated = service.updateQuestion(newQ.id, {
        question: 'Updated Hitchhiker question?',
        correctIndex: 2
    });
    assert.equal(updated.question, 'Updated Hitchhiker question?');

    // 3. Reorder questions
    const allQuestions = service.getState().questions;
    const reorderedIds = [newQ.id, ...allQuestions.filter(q => q.id !== newQ.id).map(q => q.id)];
    service.reorderQuestions(reorderedIds);
    assert.equal(service.getState().questions[0].id, newQ.id);

    // 4. Delete question
    const deleted = service.deleteQuestion(newQ.id);
    assert.equal(deleted, true);
    assert.ok(!service.getState().questions.some(q => q.id === newQ.id));

    // 5. Batch import
    const batch = [
        { category: 'Math', question: '2 + 2?', choices: ['1', '2', '3', '4'], correctIndex: 3 },
        { category: 'Science', question: 'H2O is?', choices: ['Water', 'Air', 'Fire', 'Earth'], correctIndex: 0 }
    ];
    service.importQuestions(batch, { replace: true });
    assert.equal(service.getState().questions.length, 2);
    assert.equal(service.getState().questions[0].question, '2 + 2?');
});

test('Trivia Service: Gameplay lifecycle, chat voting, and reveal', (t) => {
    const testDir = path.join(__dirname, '..', 'data', `.test-trivia-life-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });
    t.after(() => { try { fs.rmSync(testDir, { recursive: true, force: true }); } catch {} });

    let lastBroadcast = null;
    const service = createTriviaService({
        dataDir: testDir,
        triviaPath: path.join(testDir, 'trivia.json'),
        broadcastToOverlays: (type, data) => { lastBroadcast = { type, data }; }
    });

    // 1. Start Question
    const qState = service.startQuestion(0, { duration: 30 });
    assert.equal(qState.status, 'question');
    assert.ok(qState.activeQuestion);
    assert.equal(qState.activeQuestion.correctIndex, null, 'Correct answer must be hidden during question phase');
    assert.equal(lastBroadcast.type, 'trivia:start');

    // 2. Chat voting: direct letters and commands
    const vote1 = service.handleChatMessage({ user: 'Alice', comment: '!b' });
    assert.equal(vote1, true, 'Alice should vote for B');

    const vote2 = service.handleChatMessage({ user: 'Bob', comment: '!trivia 2' }); // choice 2 = B (index 1)
    assert.equal(vote2, true, 'Bob should vote for choice 2 (B)');

    const vote3 = service.handleChatMessage({ user: 'Charlie', comment: '!a' });
    assert.equal(vote3, true, 'Charlie should vote for A');

    const vote4 = service.handleChatMessage({ user: 'David', comment: 'c' }); // bare single char
    assert.equal(vote4, true, 'David should vote for C');

    // Deduplication check: Alice votes again for C
    service.handleChatMessage({ user: 'Alice', comment: '!c' });

    const activeSnapshot = service.getPublicState({ includeAnswers: false }).activeQuestion;
    assert.equal(activeSnapshot.totalVotes, 4, 'Total votes should be 4 unique chatters');

    // Choice B (index 1) has Bob (1 vote); Choice C (index 2) has Alice + David (2 votes); Choice A (index 0) has Charlie (1 vote)
    const choiceC = activeSnapshot.choices[2];
    assert.equal(choiceC.votes, 2);
    assert.equal(choiceC.percent, 50);

    // 3. Reveal Answer
    const revealState = service.revealAnswer();
    assert.equal(revealState.status, 'reveal');
    assert.ok(revealState.activeQuestion.correctIndex !== null, 'Correct index must be revealed');
    assert.equal(lastBroadcast.type, 'trivia:reveal');

    // Voting rejected during reveal phase
    const lateVote = service.handleChatMessage({ user: 'LateComer', comment: '!b' });
    assert.equal(lateVote, false);

    // 4. Reset
    service.resetTrivia();
    assert.equal(service.getState().status, 'idle');
    assert.equal(service.getState().activeQuestion, null);
    assert.equal(lastBroadcast.type, 'trivia:reset');
});

test('Trivia Service: Presets save, load, and delete', (t) => {
    const testDir = path.join(__dirname, '..', 'data', `.test-trivia-presets-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });
    t.after(() => { try { fs.rmSync(testDir, { recursive: true, force: true }); } catch {} });

    const service = createTriviaService({ dataDir: testDir, triviaPath: path.join(testDir, 'trivia.json') });

    // Save custom preset
    const saved = service.savePreset('Community Quiz Night', 'Special community stream quiz pack');
    assert.ok(saved.id);
    assert.equal(saved.name, 'Community Quiz Night');

    // Load built-in preset
    service.loadPreset('pop-culture');
    assert.equal(service.getState().questions[0].category, 'Sci-Fi Cinema');

    // Load custom preset back
    service.loadPreset(saved.id);
    assert.equal(service.getState().questions.length, saved.questions.length);

    // Delete custom preset
    const deleted = service.deletePreset(saved.id);
    assert.equal(deleted, true);

    // Attempting to delete a built-in preset should throw
    assert.throws(() => {
        service.deletePreset('gaming-classics');
    }, /Built-in presets cannot be deleted/);
});

test('Trivia Routes & Companion HTTP Endpoints', async (t) => {
    const testDir = path.join(__dirname, '..', 'data', `.test-trivia-routes-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });
    t.after(() => { try { fs.rmSync(testDir, { recursive: true, force: true }); } catch {} });

    let isEnabled = true;
    const service = createTriviaService({ dataDir: testDir, triviaPath: path.join(testDir, 'trivia.json') });
    const routes = createTriviaRoutes({ triviaService: service, isTriviaEnabled: () => isEnabled });

    const request = async (urlStr, options = {}) => {
        const { req, res, done } = createMockReqRes({
            method: options.method || 'GET',
            url: urlStr,
            headers: options.headers || {},
            body: options.body || null
        });
        const urlObj = new URL(urlStr, 'http://localhost');
        const handled = await routes(req, res, urlObj.pathname, urlObj);
        assert.equal(handled, true, `Route ${urlStr} should be handled`);
        return await done;
    };

    // 1. GET /api/trivia
    const r1 = await request('/api/trivia');
    assert.equal(r1.status, 200);
    assert.equal(r1.json.status, 'idle');

    // 2. Companion Friendly: GET /api/trivia/question/start
    const rStart = await request('/api/trivia/question/start?index=0');
    assert.equal(rStart.status, 200);
    assert.equal(rStart.json.status, 'question');

    // 3. Companion Friendly: GET /api/trivia/question/reveal
    const rReveal = await request('/api/trivia/question/reveal');
    assert.equal(rReveal.status, 200);
    assert.equal(rReveal.json.status, 'reveal');

    // 4. Companion Friendly: GET /api/trivia/question/next
    const rNext = await request('/api/trivia/question/next');
    assert.equal(rNext.status, 200);
    assert.equal(rNext.json.currentIndex, 1);

    // 5. Companion Friendly: GET /api/trivia/reset
    const rReset = await request('/api/trivia/reset');
    assert.equal(rReset.status, 200);
    assert.equal(rReset.json.status, 'idle');

    // 6. GET /api/trivia/status summary
    const rStatus = await request('/api/trivia/status');
    assert.equal(rStatus.status, 200);
    assert.equal(rStatus.json.status, 'idle');

    // 7. Disabled module guard
    isEnabled = false;
    const rDisabled = await request('/api/trivia');
    assert.equal(rDisabled.status, 403, 'Disabled trivia module should return 403');
});

test('Trivia Service: 2 to 6 choices validation and True/False questions', (t) => {
    const testDir = path.join(__dirname, '..', 'data', `.test-trivia-tf-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });
    let service;
    t.after(() => {
        if (service) service.destroy();
        try { fs.rmSync(testDir, { recursive: true, force: true }); } catch {}
    });

    service = createTriviaService({ dataDir: testDir, triviaPath: path.join(testDir, 'trivia.json') });

    // 1. True/False Question (2 choices)
    const tfQ = service.addQuestion({
        category: 'Science',
        question: 'Light travels faster than sound in a vacuum.',
        choices: ['True', 'False'],
        correctIndex: 0
    });
    assert.equal(tfQ.choices.length, 2);
    assert.equal(tfQ.isTrueFalse, true);

    // 2. 6-choice Question
    const sixQ = service.addQuestion({
        category: 'Geography',
        question: 'Which of the following are continents?',
        choices: ['Asia', 'Africa', 'Europe', 'North America', 'South America', 'Australia'],
        correctIndex: 0
    });
    assert.equal(sixQ.choices.length, 6);

    // 3. Validation: Under 2 choices should throw
    assert.throws(() => {
        service.addQuestion({
            question: 'Only one choice?',
            choices: ['Only one'],
            correctIndex: 0
        });
    }, /A question must have between 2 and 6 choices/);

    // 4. Validation: Over 6 choices should throw
    assert.throws(() => {
        service.addQuestion({
            question: 'Seven choices?',
            choices: ['1', '2', '3', '4', '5', '6', '7'],
            correctIndex: 0
        });
    }, /A question must have between 2 and 6 choices/);

    // 5. Test True/False chat voting keywords
    service.startQuestion({ questionId: tfQ.id });
    assert.equal(service.getState().activeQuestion.isTrueFalse, true);

    // User A votes !true
    service.handleChatMessage({ user: 'UserA', comment: '!true' });
    // User B votes !false
    service.handleChatMessage({ user: 'UserB', comment: '!false' });
    // User C votes !t (short for true)
    service.handleChatMessage({ user: 'UserC', comment: '!t' });
    // User D votes !f (short for false)
    service.handleChatMessage({ user: 'UserD', comment: '!f' });

    const activeQ = service.getPublicState({ includeAnswers: false }).activeQuestion;
    assert.equal(activeQ.totalVotes, 4);
    assert.equal(activeQ.choices[0].votes, 2, 'True should have 2 votes');
    assert.equal(activeQ.choices[1].votes, 2, 'False should have 2 votes');
});

test('Trivia Service: Move, Shuffle, and Reorder Questions', (t) => {
    const testDir = path.join(__dirname, '..', 'data', `.test-trivia-reorder-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });
    t.after(() => { try { fs.rmSync(testDir, { recursive: true, force: true }); } catch {} });

    const service = createTriviaService({ dataDir: testDir, triviaPath: path.join(testDir, 'trivia.json') });
    service.importQuestions([
        { question: 'Q1', choices: ['A', 'B'], correctIndex: 0 },
        { question: 'Q2', choices: ['A', 'B'], correctIndex: 0 },
        { question: 'Q3', choices: ['A', 'B'], correctIndex: 0 }
    ], { replace: true });

    const questions = service.getState().questions;
    const q1Id = questions[0].id;
    const q2Id = questions[1].id;

    // moveQuestion down
    service.moveQuestion(q1Id, 'down');
    let currentQuestions = service.getState().questions;
    const q1IdxAfterDown = currentQuestions.findIndex(q => q.id === q1Id);
    const q2IdxAfterDown = currentQuestions.findIndex(q => q.id === q2Id);
    assert.ok(q1IdxAfterDown > q2IdxAfterDown, 'Q1 should move below Q2');

    // moveQuestion up
    service.moveQuestion(q1Id, 'up');
    currentQuestions = service.getState().questions;
    assert.equal(currentQuestions[0].id, q1Id, 'Q1 should move back to first');

    // shuffleQuestions
    const shuffled = service.shuffleQuestions();
    assert.equal(shuffled.length, 3);
});

test('Trivia Service: (Done) played question tracking, toggleQuestionDone, and resetDoneQuestions', (t) => {
    const testDir = path.join(__dirname, '..', 'data', `.test-trivia-done-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });
    t.after(() => { try { fs.rmSync(testDir, { recursive: true, force: true }); } catch {} });

    const service = createTriviaService({ dataDir: testDir, triviaPath: path.join(testDir, 'trivia.json') });
    const batch = [
        { category: 'General', question: 'Q1?', choices: ['A', 'B'], correctIndex: 0 },
        { category: 'General', question: 'Q2?', choices: ['A', 'B'], correctIndex: 0 },
        { category: 'General', question: 'Q3?', choices: ['A', 'B'], correctIndex: 0 }
    ];
    service.importQuestions(batch, { replace: true });

    let pubState = service.getPublicState();
    assert.equal(pubState.unplayedCount, 3);
    assert.equal(pubState.questions[0].done, false);

    // Play first question
    service.startQuestion({ index: 0 });
    service.revealAnswer();

    pubState = service.getPublicState();
    assert.equal(pubState.unplayedCount, 2);
    assert.equal(pubState.questions[0].done, true);
    assert.equal(pubState.questions[1].done, false);

    // Toggle done on second question
    const q2Id = pubState.questions[1].id;
    const toggled = service.toggleQuestionDone(q2Id);
    assert.equal(toggled.done, true);
    assert.equal(toggled.unplayedCount, 1);

    // Toggle done again to unmark
    const unToggled = service.toggleQuestionDone(q2Id);
    assert.equal(unToggled.done, false);
    assert.equal(unToggled.unplayedCount, 2);

    // Reset done questions
    service.resetDoneQuestions();
    pubState = service.getPublicState();
    assert.equal(pubState.unplayedCount, 3);
    assert.equal(pubState.questions[0].done, false);
});

test('Trivia Service: Manual transition to answer and autoReveal option', (t) => {
    const testDir = path.join(__dirname, '..', 'data', `.test-trivia-manual-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });
    t.after(() => { try { fs.rmSync(testDir, { recursive: true, force: true }); } catch {} });

    const service = createTriviaService({ dataDir: testDir, triviaPath: path.join(testDir, 'trivia.json') });

    // Enable manual transition
    service.updateSettings({ manualTransition: true, autoReveal: false });
    assert.equal(service.getState().settings.manualTransition, true);
    assert.equal(service.getState().settings.autoReveal, false);

    // Start question with manual transition - verify status is 'question'
    const qState = service.startQuestion({ index: 0, duration: 1 });
    assert.equal(qState.status, 'question');

    // Host manually calls revealAnswer()
    const rState = service.revealAnswer();
    assert.equal(rState.status, 'reveal');
});

test('Trivia Service: Themes and element visibility toggles', (t) => {
    const testDir = path.join(__dirname, '..', 'data', `.test-trivia-theme-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });
    t.after(() => { try { fs.rmSync(testDir, { recursive: true, force: true }); } catch {} });

    const service = createTriviaService({ dataDir: testDir, triviaPath: path.join(testDir, 'trivia.json') });

    // Default theme includes element toggles and cardStyle
    const theme = service.getState().theme;
    assert.equal(theme.cardStyle, 'cards');
    assert.equal(theme.showCategory, true);
    assert.equal(theme.showTimer, true);
    assert.equal(theme.showVoteCounts, true);

    // Update to NodeCG text broadcast mode with comprehensive typography and glass panel options
    service.updateTheme({
        preset: 'nodecg',
        cardStyle: 'text',
        cardBg: '#0b0f19',
        cardBorderColor: '#00f0ff',
        cardBlur: 16,
        choiceBg: '#121827',
        hintColor: '#38bdf8',
        funfactFont: 'Oswald',
        funfactWeight: '600',
        funfactColor: '#facc15',
        questionWeight: '800',
        choiceWeight: '700',
        headerWeight: '800',
        collapseIncorrect: true,
        showCategory: false,
        showTimer: false
    });

    const updated = service.getState().theme;
    assert.equal(updated.preset, 'nodecg');
    assert.equal(updated.cardStyle, 'text');
    assert.equal(updated.cardBg, '#0b0f19');
    assert.equal(updated.cardBorderColor, '#00f0ff');
    assert.equal(updated.cardBlur, 16);
    assert.equal(updated.choiceBg, '#121827');
    assert.equal(updated.hintColor, '#38bdf8');
    assert.equal(updated.funfactFont, 'Oswald');
    assert.equal(updated.funfactWeight, '600');
    assert.equal(updated.funfactColor, '#facc15');
    assert.equal(updated.questionWeight, '800');
    assert.equal(updated.choiceWeight, '700');
    assert.equal(updated.headerWeight, '800');
    assert.equal(updated.collapseIncorrect, true);
    assert.equal(updated.showCategory, false);
    assert.equal(updated.showTimer, false);
});

test('Trivia Service: Chatbot enabled/disabled voting state awareness', (t) => {
    const testDir = path.join(__dirname, '..', 'data', `.test-trivia-cb-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });
    t.after(() => { try { fs.rmSync(testDir, { recursive: true, force: true }); } catch {} });

    let botEnabled = false;
    const mockBot = {
        getStats: () => ({ enabled: botEnabled }),
        announceTriviaQuestion: () => {},
        announceTriviaAnswer: () => {}
    };

    const service = createTriviaService({
        dataDir: testDir,
        triviaPath: path.join(testDir, 'trivia.json'),
        chatbotAnnouncer: mockBot
    });

    // 1. When chatbot is disabled:
    botEnabled = false;
    let pub = service.getPublicState();
    assert.equal(pub.chatbotEnabled, false);
    assert.equal(pub.chatVotingActive, false);
    let summary = service.getStatusSummary();
    assert.equal(summary.chatbotEnabled, false);
    assert.equal(summary.chatVotingActive, false);

    // Votes should not register when chat voting is inactive
    service.startQuestion(0);
    const voteDisabled = service.handleChatMessage({ user: 'voter1', message: '!a' });
    assert.equal(voteDisabled, false);

    // 2. When forceChatVoting is true, allow voting even if bot announcer is off:
    service.updateSettings({ forceChatVoting: true });
    pub = service.getPublicState();
    assert.equal(pub.chatbotEnabled, false);
    assert.equal(pub.chatVotingActive, true);
    const voteForced = service.handleChatMessage({ user: 'voter2', message: '!a' });
    assert.equal(voteForced, true);

    // 3. When chatbot is active:
    service.updateSettings({ forceChatVoting: false });
    botEnabled = true;
    pub = service.getPublicState();
    assert.equal(pub.chatbotEnabled, true);
    assert.equal(pub.chatVotingActive, true);
    summary = service.getStatusSummary();
    assert.equal(summary.chatbotEnabled, true);
    assert.equal(summary.chatVotingActive, true);
    const voteActive = service.handleChatMessage({ user: 'voter3', message: '!b' });
    assert.equal(voteActive, true);
});

test('Chatbot Service: Trivia question and answer announcements', async (t) => {
    const testDir = path.join(__dirname, '..', 'data', `.test-trivia-bot-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });

    const createChatbotService = require('../server/services/chatbot');
    const sentMessages = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
        const urlStr = String(url);
        if (urlStr.includes('/sendChat/')) {
            sentMessages.push(decodeURIComponent(urlStr.split('/sendChat/')[1]));
            return { ok: true, status: 200, text: async () => 'ok' };
        }
        return { ok: true, status: 200, json: async () => ({}) };
    };

    const bot = createChatbotService({
        dataDir: testDir,
        getConfig: () => ({ chatbot_enabled: true, ssn: { session_id: 'test-sess' } }),
        isOnline: () => true,
        getChannelMods: () => []
    });

    t.after(() => {
        globalThis.fetch = originalFetch;
        bot.stop();
        try { fs.rmSync(testDir, { recursive: true, force: true }); } catch {}
    });

    bot.getData().settings.enabled = true;

    // 1. Announce Question (test mode)
    const qData = {
        category: 'Gaming',
        question: 'Who is Mario\'s brother?',
        choices: [
            { letter: 'A', text: 'Luigi' },
            { letter: 'B', text: 'Wario' }
        ],
        duration: 20
    };
    const resQ = await bot.announceTriviaQuestion(qData, { test: true });
    assert.equal(resQ.sent, true);
    assert.ok(sentMessages.some(m => m.includes('[Trivia]') && m.includes('Who is Mario\'s brother?')));

    // 2. Announce Answer (test mode)
    const aData = {
        category: 'Gaming',
        question: 'Who is Mario\'s brother?',
        answerText: 'Luigi',
        correctLetter: 'A',
        percent: 90,
        totalVotes: 10,
        correctVotes: 9,
        funfact: 'Luigi first appeared in Mario Bros. in 1983.'
    };
    const resA = await bot.announceTriviaAnswer(aData, { test: true });
    assert.equal(resA.sent, true);
    assert.ok(sentMessages.some(m => m.includes('[Trivia Answer]') && m.includes('Luigi')));
});

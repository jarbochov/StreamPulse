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

    let lastBroadcast = null;
    const service = createTriviaService({
        dataDir: testDir,
        triviaPath: path.join(testDir, 'trivia.json'),
        broadcastToOverlays: (type, data) => { lastBroadcast = { type, data }; }
    });
    t.after(() => {
        service.destroy();
        try { fs.rmSync(testDir, { recursive: true, force: true }); } catch {}
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

    let isEnabled = true;
    const service = createTriviaService({ dataDir: testDir, triviaPath: path.join(testDir, 'trivia.json') });
    t.after(() => {
        service.destroy();
        try { fs.rmSync(testDir, { recursive: true, force: true }); } catch {}
    });

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

    // 6. Companion Friendly: GET /api/trivia/questions/shuffle and alias /api/trivia/shuffle
    const rShuffle1 = await request('/api/trivia/questions/shuffle');
    assert.equal(rShuffle1.status, 200);
    assert.equal(rShuffle1.json.success, true);
    const rShuffle2 = await request('/api/trivia/shuffle');
    assert.equal(rShuffle2.status, 200);
    assert.equal(rShuffle2.json.success, true);

    // 7. Companion Friendly: GET /api/trivia/questions/reset-done and alias /api/trivia/reset-done
    const rResetDone1 = await request('/api/trivia/questions/reset-done');
    assert.equal(rResetDone1.status, 200);
    assert.equal(rResetDone1.json.success, true);
    const rResetDone2 = await request('/api/trivia/reset-done');
    assert.equal(rResetDone2.status, 200);
    assert.equal(rResetDone2.json.success, true);

    // 8. Companion Friendly: GET /api/trivia/preset/load?id=pop-culture and alias /api/trivia/presets/load?id=pop-culture
    const rPresetLoad1 = await request('/api/trivia/preset/load?id=pop-culture');
    assert.equal(rPresetLoad1.status, 200);
    assert.equal(rPresetLoad1.json.questions[0].category, 'Sci-Fi Cinema');
    const rPresetLoad2 = await request('/api/trivia/presets/load?id=gaming-classics');
    assert.equal(rPresetLoad2.status, 200);
    assert.equal(rPresetLoad2.json.questions[0].category, 'Retro Gaming');

    // 9. GET /api/trivia/status summary
    const rStatus = await request('/api/trivia/status');
    assert.equal(rStatus.status, 200);
    assert.equal(rStatus.json.status, 'idle');

    // 10. Disabled module guard
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
    let service;
    t.after(() => {
        if (service) service.destroy();
        try { fs.rmSync(testDir, { recursive: true, force: true }); } catch {}
    });

    service = createTriviaService({ dataDir: testDir, triviaPath: path.join(testDir, 'trivia.json') });
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
    assert.equal(theme.questionLabel, 'Question');
    assert.equal(theme.answerLabel, 'Answer');
    assert.equal(theme.counterFormat, 'full');
    assert.equal(theme.phaseTransform, 'uppercase');
    assert.equal(theme.headerFontSize, '');
    assert.equal(theme.phaseFont, '');
    assert.equal(theme.showCategory, true);
    assert.equal(theme.showTimer, true);
    assert.equal(theme.showVoteCounts, true);
    assert.equal(theme.showPhaseIndicator, true);

    // Update to broadcast text mode with 8-digit hex opacity (#00000000), comprehensive typography and glass panel options
    service.updateTheme({
        preset: 'broadcast-text',
        cardStyle: 'text',
        cardBg: '#00000000',
        cardBorderColor: '#00000000',
        cardBlur: 16,
        choiceBg: '#00000000',
        choiceBorderColor: '#00000000',
        accentColor: '#38bdf880',
        hintColor: '#38bdf8',
        funfactFont: 'Oswald',
        funfactWeight: '600',
        funfactColor: '#facc15',
        questionWeight: '800',
        choiceWeight: '700',
        headerWeight: '800',
        questionLabel: 'Round 1',
        answerLabel: 'Correct Solution',
        counterFormat: 'compact',
        phaseTransform: 'capitalize',
        headerFontSize: '1.25rem',
        phaseFont: 'Rajdhani',
        phaseQuestionColor: '#f43f5e',
        phaseAnswerColor: '#10b981',
        collapseIncorrect: true,
        showPhaseIndicator: false,
        showCategory: false,
        showTimer: false
    });

    const updated = service.getState().theme;
    assert.equal(updated.preset, 'broadcast-text');
    assert.equal(updated.cardStyle, 'text');
    assert.equal(updated.cardBg, '#00000000');
    assert.equal(updated.cardBorderColor, '#00000000');
    assert.equal(updated.cardBlur, 16);
    assert.equal(updated.choiceBg, '#00000000');
    assert.equal(updated.choiceBorderColor, '#00000000');
    assert.equal(updated.accentColor, '#38bdf880');
    assert.equal(updated.hintColor, '#38bdf8');
    assert.equal(updated.funfactFont, 'Oswald');
    assert.equal(updated.funfactWeight, '600');
    assert.equal(updated.funfactColor, '#facc15');
    assert.equal(updated.questionWeight, '800');
    assert.equal(updated.choiceWeight, '700');
    assert.equal(updated.headerWeight, '800');
    assert.equal(updated.questionLabel, 'Round 1');
    assert.equal(updated.answerLabel, 'Correct Solution');
    assert.equal(updated.counterFormat, 'compact');
    assert.equal(updated.phaseTransform, 'capitalize');
    assert.equal(updated.headerFontSize, '1.25rem');
    assert.equal(updated.phaseFont, 'Rajdhani');
    assert.equal(updated.phaseQuestionColor, '#f43f5e');
    assert.equal(updated.phaseAnswerColor, '#10b981');
    assert.equal(updated.showPhaseIndicator, false);
    assert.equal(updated.collapseIncorrect, true);
    assert.equal(updated.showCategory, false);
    assert.equal(updated.showTimer, false);
});

test('Trivia Service: Chatbot enabled/disabled voting state awareness', (t) => {
    const testDir = path.join(__dirname, '..', 'data', `.test-trivia-cb-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });
    let service;
    t.after(() => {
        if (service) service.destroy();
        try { fs.rmSync(testDir, { recursive: true, force: true }); } catch {}
    });

    let botEnabled = false;
    const mockBot = {
        getStats: () => ({ enabled: botEnabled }),
        announceTriviaQuestion: () => {},
        announceTriviaAnswer: () => {}
    };

    service = createTriviaService({
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

test('Trivia settings mute automatic chat announcements and persist without disabling gameplay', async t => {
    const dir = fs.mkdtempSync(path.join(__dirname, '..', 'data', '.test-trivia-silent-'));
    const announcements = [];
    const errors = [];
    const options = {
        dataDir: dir,
        chatbotAnnouncer: {
            getStats: () => ({ enabled: true }),
            announceTriviaQuestion: async () => { announcements.push('question'); },
            announceTriviaAnswer: async () => { announcements.push('answer'); }
        },
        log: (...args) => errors.push(args.join(' '))
    };
    let service = createTriviaService(options);
    t.after(() => { service.destroy(); fs.rmSync(dir, { recursive: true, force: true }); });
    const routes = createTriviaRoutes({ triviaService: service });
    const { req, res, done } = createMockReqRes({
        method: 'PUT', url: '/api/trivia', body: { settings: { chatVoting: false } }
    });
    await routes(req, res, '/api/trivia', new URL(req.url, 'http://fixture.local'));
    assert.equal((await done).json.chatVotingActive, false);
    service.destroy();
    service = createTriviaService(options);
    service.startQuestion(0);
    assert.equal(service.handleChatMessage({ user: 'FictionalViewer', message: '!a' }), false);
    service.revealAnswer();
    assert.equal(service.getPublicState().status, 'reveal');
    assert.deepEqual(announcements, [], 'presentation mode sends neither opening nor reveal announcements');

    service.updateSettings({ chatVoting: true });
    service.startQuestion(0);
    assert.equal(service.handleChatMessage({ user: 'FictionalViewer', message: '!a' }), true);
    service.updateSettings({ chatVoting: false });
    service.revealAnswer();
    assert.deepEqual(announcements, ['question'], 'disabling voting during a question also silences its reveal');
    service.updateSettings({ chatVoting: true });
    options.chatbotAnnouncer.announceTriviaQuestion = async () => { throw new Error('fictional send failure'); };
    service.startQuestion(0);
    await new Promise(resolve => setImmediate(resolve));
    assert.ok(errors.some(message => message.includes('fictional send failure')), 'async announcement failure is handled');
});

test('Trivia done flags and empty banks survive restart; numeric move controls honor direction', async t => {
    const dir = fs.mkdtempSync(path.join(__dirname, '..', 'data', '.test-trivia-tracking-'));
    let service = createTriviaService({ dataDir: dir });
    t.after(() => { service.destroy(); fs.rmSync(dir, { recursive: true, force: true }); });
    const ids = service.getState().questions.map(q => q.id);
    const routes = createTriviaRoutes({ triviaService: service });
    const { req, res, done } = createMockReqRes({
        method: 'POST', url: `/api/trivia/question/${ids[1]}/move`, body: { direction: -1 }
    });
    await routes(req, res, req.url, new URL(req.url, 'http://fixture.local'));
    assert.equal((await done).status, 200);
    assert.equal(service.getState().questions[0].id, ids[1], 'Up must not move down');
    service.moveQuestion(ids[1], 1);
    assert.equal(service.getState().questions[1].id, ids[1]);
    service.startQuestion(0);
    service.moveQuestion(ids[0], 1);
    assert.equal(service.getPublicState().currentIndex, 1, 'reordering retains the active question index');
    service.moveQuestion(ids[0], -1);
    service.setQuestionDone(ids[1], true);
    service.destroy();
    service = createTriviaService({ dataDir: dir });
    assert.equal(service.getPublicState().unplayedCount, ids.length - 2);
    assert.equal(service.startQuestion().activeQuestion.id, ids[2], 'skip both played and manually completed questions after restart');
    service.resetTrivia();
    assert.equal(service.getPublicState().unplayedCount, ids.length, 'session reset consistently clears all done flags');
    service.clearQuestions();
    service.destroy();
    service = createTriviaService({ dataDir: dir });
    assert.equal(service.getPublicState().totalQuestions, 0, 'an intentionally empty bank must not resurrect starter questions');
});

test('Trivia API True/False votes follow actual choice order and reject invalid indexes', async t => {
    const dir = fs.mkdtempSync(path.join(__dirname, '..', 'data', '.test-trivia-api-votes-'));
    const service = createTriviaService({ dataDir: dir });
    t.after(() => { service.destroy(); fs.rmSync(dir, { recursive: true, force: true }); });
    const question = service.addQuestion({ question: 'Fictional statement?', choices: ['False', 'True'], correctIndex: 1 });
    service.startQuestion(question.id);
    const routes = createTriviaRoutes({ triviaService: service });
    for (const [choice, index] of [['true', 1], ['false', 0]]) {
        const { req, res, done } = createMockReqRes({
            method: 'POST', url: '/api/trivia/vote', body: { choice, user: 'FictionalDeck' }
        });
        await routes(req, res, req.url, new URL(req.url, 'http://fixture.local'));
        assert.equal((await done).json.success, true);
        assert.equal(service.getPublicState().activeQuestion.choices[index].votes, 1);
    }
    for (const choiceIndex of [NaN, 0.5, -1, 6]) {
        assert.equal(service.castVote({ user: 'Invalid', choiceIndex }), false);
    }
    assert.equal(service.getPublicState().activeQuestion.totalVotes, 1);
});

test('Trivia auto-advance respects its toggle and remaining questions rather than the last index', t => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.now() });
    const dir = fs.mkdtempSync(path.join(__dirname, '..', 'data', '.test-trivia-advance-'));
    const service = createTriviaService({ dataDir: dir });
    t.after(() => { service.destroy(); fs.rmSync(dir, { recursive: true, force: true }); });
    service.updateSettings({ autoAdvance: true, advanceDelay: 1, randomOrder: true });
    service.startQuestion(service.getState().questions.length - 1);
    service.revealAnswer();
    t.mock.timers.tick(1000);
    assert.equal(service.getPublicState().status, 'question', 'a random final-index question is not the end of the bank');
    service.revealAnswer();
    service.updateSettings({ autoAdvance: false });
    t.mock.timers.tick(1000);
    assert.equal(service.getPublicState().status, 'reveal', 'a scheduled advance must respect being switched off');
});

test('Trivia waits after countdown, holds the answer independently, and closes voting at zero', t => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.now() });
    const dir = fs.mkdtempSync(path.join(__dirname, '..', 'data', '.test-trivia-delays-'));
    const service = createTriviaService({ dataDir: dir });
    t.after(() => { service.destroy(); fs.rmSync(dir, { recursive: true, force: true }); });
    service.updateSettings({ revealDelay: 2, advanceDelay: 3, autoAdvance: true });
    service.startQuestion(0, { duration: 1 });
    assert.equal(service.castVote({ user: 'FictionalViewer', choiceIndex: 0 }), true);
    t.mock.timers.tick(1000);
    assert.equal(service.getPublicState().activeQuestion.remainingSeconds, 0);
    assert.equal(service.getPublicState().status, 'question', 'zero begins the reveal delay, not the answer phase');
    assert.equal(service.getPublicState().activeQuestion.correctIndex, null);
    assert.equal(service.castVote({ user: 'LateViewer', choiceIndex: 1 }), false, 'voting closes at the countdown deadline');
    t.mock.timers.tick(1999);
    assert.equal(service.getPublicState().status, 'question');
    t.mock.timers.tick(1);
    assert.equal(service.getPublicState().status, 'reveal');
    t.mock.timers.tick(2999);
    assert.equal(service.getPublicState().status, 'reveal', 'the answer remains for the separate advance delay');
    t.mock.timers.tick(1);
    assert.equal(service.getPublicState().status, 'question');

    service.updateSettings({ autoAdvance: false });
    service.startQuestion(0, { duration: 1 });
    t.mock.timers.tick(1000);
    service.revealAnswer();
    assert.equal(service.getPublicState().status, 'reveal', 'manual reveal bypasses the pending delay');
    t.mock.timers.tick(3000);
    assert.equal(service.getPublicState().status, 'reveal', 'manual reveal cancels the pending timer');

    service.updateSettings({ revealDelay: 0 });
    service.startQuestion(0, { duration: 1 });
    t.mock.timers.tick(1000);
    assert.equal(service.getPublicState().status, 'reveal', 'zero is an immediate auto-reveal, not a fallback to six seconds');
    service.startQuestion(0, { duration: 1, manualTransition: true });
    t.mock.timers.tick(10000);
    assert.equal(service.getPublicState().status, 'question', 'manual transition never schedules an automatic reveal');
});

test('Trivia uses the studio duration and randomizes choices without changing the bank or correct answer', t => {
    const dir = fs.mkdtempSync(path.join(__dirname, '..', 'data', '.test-trivia-choices-'));
    const service = createTriviaService({ dataDir: dir });
    t.after(() => { service.destroy(); fs.rmSync(dir, { recursive: true, force: true }); });
    const q = service.addQuestion({
        question: 'Fictional duplicate-answer fixture', choices: ['Duplicate', 'Wrong', 'Duplicate', 'Other'],
        correctIndex: 2, duration: 15
    });
    const bankChoices = [...q.choices];
    service.updateSettings({ defaultDuration: 77, randomizeChoices: true, autoReveal: false });
    t.mock.method(Math, 'random', () => 0);
    let active = service.startQuestion(q.id).activeQuestion;
    assert.equal(active.duration, 77, 'saved per-question duration cannot override the studio default');
    assert.equal(active.endsAt - active.startedAt, 77000);
    assert.deepEqual(active.choices.map(c => c.text), ['Wrong', 'Duplicate', 'Other', 'Duplicate']);
    active = service.revealAnswer().activeQuestion;
    assert.equal(active.correctIndex, 1, 'remapping follows the original index, even with duplicate answer text');
    assert.deepEqual(q.choices, bankChoices, 'randomization is limited to the live question');
    assert.equal(q.correctIndex, 2);
    const saved = JSON.parse(fs.readFileSync(path.join(dir, 'trivia.json'), 'utf8'));
    assert.deepEqual(saved.questions.find(item => item.id === q.id).choices, bankChoices);

    service.startQuestion(q.id);
    service.updateQuestion(q.id, { choices: ['Duplicate', 'Wrong revised', 'Correct revised', 'Other'], correctIndex: 2 });
    assert.equal(service.revealAnswer().activeQuestion.choices[1].text, 'Correct revised', 'live edits retain the active choice order');
    assert.equal(service.getPublicState().activeQuestion.duration, 77);
    service.updateSettings({ randomizeChoices: false });
    active = service.startQuestion(q.id, { duration: 12 }).activeQuestion;
    assert.equal(active.duration, 12, 'an explicit start-command duration remains an intentional override');
    assert.deepEqual(active.choices.map(c => c.text), service.getState().questions.find(item => item.id === q.id).choices);
    assert.equal(service.revealAnswer().activeQuestion.correctIndex, 2, 'turning randomization off restores stored order');
    const tf = service.addQuestion({ question: 'Fictional true statement?', choices: ['True', 'False'], correctIndex: 0 });
    service.updateSettings({ randomizeChoices: true });
    service.startQuestion(tf.id);
    assert.equal(service.handleChatMessage({ user: 'FictionalViewer', message: '!true' }), true);
    active = service.revealAnswer().activeQuestion;
    assert.deepEqual(active.choices.map(c => c.text), ['False', 'True']);
    assert.equal(active.correctIndex, 1);
    assert.equal(active.choices[1].votes, 1, 'True/False votes follow shuffled answer text, not original letters');
});

test('Trivia clear endpoints stop pending transitions without resetting played questions', async t => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.now() });
    const dir = fs.mkdtempSync(path.join(__dirname, '..', 'data', '.test-trivia-clear-'));
    const events = [];
    const service = createTriviaService({ dataDir: dir, broadcastToOverlays: (type, data) => events.push({ type, data }) });
    t.after(() => { service.destroy(); fs.rmSync(dir, { recursive: true, force: true }); });
    const routes = createTriviaRoutes({ triviaService: service });
    service.updateSettings({ autoAdvance: true, revealDelay: 2, advanceDelay: 3 });
    for (const method of ['GET', 'POST']) {
        service.startQuestion(0, { duration: 1 });
        if (method === 'GET') t.mock.timers.tick(1000);
        else service.revealAnswer();
        const played = service.getPublicState().playedQuestionIds;
        const { req, res, done } = createMockReqRes({ method, url: '/api/trivia/question/clear' });
        await routes(req, res, req.url, new URL(req.url, 'http://fixture.local'));
        const response = await done;
        assert.equal(response.status, 200);
        assert.equal(response.json.status, 'idle');
        assert.equal(response.json.activeQuestion, null);
        assert.deepEqual(response.json.playedQuestionIds, played);
        assert.equal(events.at(-1).type, 'trivia:state');
        assert.equal(events.at(-1).data.activeQuestion, null);
        t.mock.timers.tick(10000);
        assert.equal(service.getPublicState().status, 'idle', 'clear cancels delayed reveal and auto-advance');
    }
});

test('Trivia Studio preserves unsaved toggles during live updates; overlay sound respects saved controls and URL overrides', async t => {
    const { createServer } = require('node:http');
    const { createStaticRouter } = require('../server/static-router');
    const puppeteer = require('puppeteer');
    const dir = fs.mkdtempSync(path.join(__dirname, '..', 'data', '.test-trivia-browser-'));
    const service = createTriviaService({ dataDir: dir });
    const routes = createTriviaRoutes({ triviaService: service });
    const rootDir = path.resolve(__dirname, '..');
    const router = createStaticRouter({ rootDir, publicDir: path.join(rootDir, 'public') });
    const server = createServer(async (req, res) => {
        const url = new URL(req.url, 'http://fixture.local');
        if (await routes(req, res, url.pathname, url)) return;
        if (url.pathname.startsWith('/api/')) {
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify(url.pathname.endsWith('/fonts') ? [] : { trivia_enabled: true }));
        } else if (!router.handleRequest(req, res)) {
            res.writeHead(404); res.end();
        }
    });
    let browser;
    t.after(async () => {
        if (browser) await browser.close();
        await new Promise(resolve => server.close(resolve));
        service.destroy();
        fs.rmSync(dir, { recursive: true, force: true });
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const errors = [];
    async function open(pathname) {
        const page = await browser.newPage();
        page.on('pageerror', err => errors.push(err.message));
        await page.setRequestInterception(true);
        page.on('request', request => {
            if (request.url().startsWith(origin) || request.url().startsWith('data:')) request.continue();
            else request.abort();
        });
        await page.evaluateOnNewDocument(() => {
            window.triviaFixture = { sockets: [], gains: [] };
            window.WebSocket = class {
                static OPEN = 1;
                constructor() { this.readyState = 1; window.triviaFixture.sockets.push(this); }
                send() {}
                close() {}
            };
            window.AudioContext = class {
                state = 'running';
                currentTime = 0;
                destination = {};
                createOscillator() {
                    return { frequency: { setValueAtTime() {} }, connect() {}, start() {}, stop() {} };
                }
                createGain() {
                    return {
                        gain: {
                            setValueAtTime(value) { window.triviaFixture.gains.push(value); },
                            exponentialRampToValueAtTime() {}
                        },
                        connect() {}
                    };
                }
            };
        });
        await page.goto(`${origin}${pathname}`, { waitUntil: 'networkidle0' });
        return page;
    }

    const studio = await open('/tools/trivia.html');
    await studio.waitForFunction(() => document.getElementById('questions-container').children.length > 0);
    await studio.evaluate(async () => {
        const state = await import('/js/trivia/trivia-state.js');
        document.getElementById('cfg-chat-voting').checked = false;
        document.getElementById('cfg-theme-blur').value = '0';
        state.setCurrentState({ ...state.getState(), chatbotEnabled: false, chatVotingActive: false,
            activeQuestion: { question: 'Fictional live question', choices: [], totalVotes: 1 } });
    });
    assert.equal(await studio.$eval('#cfg-chat-voting', el => el.checked), false);
    assert.equal(await studio.$eval('#cfg-theme-blur', el => el.value), '0');
    assert.equal(await studio.$eval('#advance-delay-row', el => getComputedStyle(el).display), 'none');
    await studio.evaluate(() => {
        document.getElementById('cfg-duration').value = '77';
        document.getElementById('cfg-randomize-choices').checked = true;
        document.getElementById('cfg-reveal-delay').value = '0';
        document.getElementById('cfg-auto-advance').checked = true;
        document.getElementById('cfg-auto-advance').dispatchEvent(new Event('change', { bubbles: true }));
        document.getElementById('cfg-advance-delay').value = '4';
    });
    assert.notEqual(await studio.$eval('#advance-delay-row', el => getComputedStyle(el).display), 'none');
    await studio.click('#btn-save-settings');
    await studio.waitForFunction(async () => (await (await fetch('/api/trivia')).json()).settings.chatVoting === false);
    assert.equal(service.getState().settings.revealDelay, 0);
    assert.equal(service.getState().settings.advanceDelay, 4);
    assert.equal(service.getState().settings.defaultDuration, 77);
    assert.equal(service.getState().settings.randomizeChoices, true);
    assert.equal(await studio.$eval('#live-choices', el => el.querySelectorAll('.monitor-choice-votes').length), 0);
    await studio.evaluate(() => {
        window.triviaApp.switchTab('theming');
        document.getElementById('cfg-theme-blur').value = '0';
        document.getElementById('cfg-theme-card-width').value = '1600px';
        document.getElementById('cfg-theme-card-width').dispatchEvent(new Event('input', { bubbles: true }));
        for (const [id, value] of [
            ['cfg-theme-timer-color-hex', '#12345680'],
            ['cfg-theme-timer-warning-color-hex', '#654321'],
            ['cfg-theme-timer-critical-color-hex', '#AABBCC']
        ]) {
            document.getElementById(id).value = value;
            document.getElementById(id).dispatchEvent(new Event('input', { bubbles: true }));
        }
        document.getElementById('btn-save-theme').click();
    });
    await studio.waitForFunction(async () => (await (await fetch('/api/trivia')).json()).theme.cardBlur === 0);
    assert.equal(service.getState().theme.cardBlur, 0, 'zero blur survives the real Save Theme path');
    assert.equal(service.getState().theme.cardMaxWidth, '1600px');
    assert.equal(service.getState().theme.timerColor, '#12345680');
    assert.equal(service.getState().theme.timerWarningColor, '#654321');
    assert.equal(service.getState().theme.timerCriticalColor, '#AABBCC');
    const previewFrame = await (await studio.$('#trivia-preview-iframe')).contentFrame();
    await previewFrame.waitForFunction(() => getComputedStyle(document.documentElement).getPropertyValue('--card-max-width').trim() === '1600px');
    assert.equal(await previewFrame.$eval('#timer-bar', el => getComputedStyle(el).backgroundColor), 'rgba(18, 52, 86, 0.5)');
    const previewLoads = await studio.evaluate(() => {
        const iframe = document.getElementById('trivia-preview-iframe');
        window.previewLoadCount = 0;
        iframe.addEventListener('load', () => { window.previewLoadCount++; });
        const input = document.getElementById('cfg-theme-card-width');
        input.value = '100%';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return window.previewLoadCount;
    });
    await previewFrame.waitForFunction(() => getComputedStyle(document.documentElement).getPropertyValue('--card-max-width').trim() === '100%');
    assert.equal(previewLoads, 0);
    assert.equal(await studio.evaluate(() => window.previewLoadCount), 0, 'width edits synchronize without reloading the preview');
    await studio.reload({ waitUntil: 'networkidle0' });
    await studio.waitForFunction(() => document.getElementById('cfg-theme-timer-color-hex').value === '#12345680');
    assert.equal(await studio.$eval('#cfg-theme-card-width', el => el.value), '1600px');
    assert.equal(await studio.$eval('#cfg-reveal-delay', el => el.value), '0');
    assert.equal(await studio.$eval('#cfg-randomize-choices', el => el.checked), true);
    await studio.evaluate(() => {
        const style = document.getElementById('cfg-theme-card-style');
        style.value = 'text';
        style.dispatchEvent(new Event('change', { bubbles: true }));
    });
    assert.equal(await studio.$eval('#card-width-row', el => getComputedStyle(el).display), 'none');
    await studio.evaluate(() => {
        const style = document.getElementById('cfg-theme-card-style');
        style.value = 'cards';
        style.dispatchEvent(new Event('change', { bubbles: true }));
    });
    assert.equal(await studio.$eval('#obs-url-link', el => new URL(el.href).searchParams.get('style')), 'cards', 'selecting boxes regenerates a cards URL');
    const currentPreviewFrame = await (await studio.$('#trivia-preview-iframe')).contentFrame();
    await currentPreviewFrame.waitForFunction(() => document.body.dataset.style === 'cards');
    const correctSelections = await studio.evaluate(async () => {
        const editor = await import('/js/trivia/trivia-editor.js');
        const state = await import('/js/trivia/trivia-state.js');
        const questions = state.getState().questions;
        editor.openEditModal(questions[0].id);
        const correct = document.getElementById('edit-q-correct');
        const first = correct.value;
        correct.value = '3';
        window.triviaApp.updateModalChoiceText(0, 'Fictional edited choice');
        const afterTextEdit = correct.value;
        editor.openEditModal(questions[1].id);
        const second = correct.value;
        editor.openEditModal(questions[0].id);
        correct.value = '2';
        editor.removeModalChoice(0);
        const afterRemoval = correct.value;
        editor.closeQuestionModal();
        return [first, afterTextEdit, second, afterRemoval];
    });
    assert.deepEqual(correctSelections, ['1', '3', '0', '1'], 'correct selection survives text edits, modal reuse, and earlier-choice removal');
    assert.equal(await studio.$eval('#btn-clear-question', el => getComputedStyle(el).display), 'none');
    await studio.evaluate(() => {
        window.triviaApp.switchTab('studio');
        document.getElementById('cfg-transition-mode').value = 'manual';
        document.getElementById('btn-save-settings').click();
    });
    await studio.waitForFunction(async () => (await (await fetch('/api/trivia')).json()).settings.manualTransition === true);
    await studio.click('#btn-start');
    await studio.waitForFunction(() => !document.getElementById('btn-clear-question').disabled);
    assert.equal(service.getPublicState().activeQuestion.duration, 77, 'real Start Question uses the saved studio duration');
    const playedBeforeClear = service.getPublicState().playedQuestionIds;
    await studio.click('#btn-clear-question');
    await studio.waitForFunction(async () => (await (await fetch('/api/trivia')).json()).activeQuestion === null);
    assert.deepEqual(service.getPublicState().playedQuestionIds, playedBeforeClear);
    await studio.close();

    for (const [query, settings, expected] of [
        ['', { soundEnabled: false }, []],
        ['', { soundEnabled: true, soundVolume: 25 }, [0.01]],
        ['', { soundEnabled: true, soundVolume: 0 }, []],
        ['?sound=0', { soundEnabled: true, soundVolume: 100 }, []],
        ['?sound=1', { soundEnabled: false, soundVolume: 100 }, [0.04]]
    ]) {
        const page = await open(`/overlays/trivia.html${query}`);
        const gains = await page.evaluate(settings => {
            const socket = window.triviaFixture.sockets[0];
            socket.onmessage({ data: JSON.stringify({ type: 'trivia:start', data: { settings } }) });
            return window.triviaFixture.gains;
        }, settings);
        assert.deepEqual(gains, expected, `sound controls: ${JSON.stringify({ query, settings })}`);
        await page.close();
    }
    const overlay = await open('/overlays/trivia.html?style=text');
    const collapse = await overlay.evaluate(() => {
        const socket = window.triviaFixture.sockets[0];
        const update = value => socket.onmessage({ data: JSON.stringify({
            type: 'trivia:state', data: { status: 'idle', theme: { collapseIncorrect: value } }
        }) });
        update(true);
        const enabled = document.body.classList.contains('collapse-incorrect');
        update(false);
        return [enabled, document.body.classList.contains('collapse-incorrect')];
    });
    assert.deepEqual(collapse, [true, false], 'collapse can be switched off again, including floating-text mode');
    await overlay.close();
    service.updateSettings({ autoAdvance: false, chatVoting: false });
    service.startQuestion(0, { duration: 60, autoReveal: false });
    const presentation = await open('/overlays/trivia.html?votes=1&percentages=1');
    for (const status of ['question', 'reveal']) {
        if (status === 'reveal') service.revealAnswer();
        const state = service.getPublicState();
        const displays = await presentation.evaluate(state => {
            window.triviaFixture.sockets[0].onmessage({ data: JSON.stringify({ type: 'trivia:state', data: state }) });
            return ['.total-votes-count', '.choice-stats', '.choice-meter', '#chat-hint'].map(selector =>
                getComputedStyle(document.querySelector(selector)).display);
        }, state);
        assert.deepEqual(displays, ['none', 'none', 'none', 'none'], `presentation mode hides all voting UI during ${status}`);
    }
    service.updateSettings({ chatVoting: true });
    for (const [ratio, color] of [
        [0.8, 'rgba(18, 52, 86, 0.5)'], [0.4, 'rgb(101, 67, 33)'], [0.1, 'rgb(170, 187, 204)']
    ]) {
        await presentation.evaluate(({ state, ratio }) => {
            const now = Date.now();
            window.triviaFixture.sockets[0].onmessage({ data: JSON.stringify({
                type: 'trivia:state', data: { ...state, status: 'question', activeQuestion: {
                    ...state.activeQuestion, startedAt: now - (1 - ratio) * 100000, endsAt: now + ratio * 100000
                } }
            }) });
        }, { state: service.getPublicState(), ratio });
        await presentation.waitForFunction(color => getComputedStyle(document.getElementById('timer-bar')).backgroundColor === color, {}, color);
    }
    await presentation.setViewport({ width: 1920, height: 1080 });
    await presentation.waitForFunction(() => document.getElementById('trivia-root').getBoundingClientRect().width > 1500);
    const wide = await presentation.$eval('#trivia-root', el => el.getBoundingClientRect().width);
    assert.equal(Math.round(wide), 1600, 'saved width grows beyond the former 1100px cap');
    await presentation.close();
    const responsive = await open('/overlays/trivia.html?cardwidth=100%&timercolor=%23FEDCBA&view=question');
    for (const [width, height] of [[3840, 2160], [1280, 720], [720, 1280], [390, 844]]) {
        await responsive.setViewport({ width, height });
        const bounds = await responsive.$eval('#trivia-root', el => {
            const rect = el.getBoundingClientRect();
            return { left: rect.left, right: rect.right, width: rect.width, overflow: el.scrollWidth > el.clientWidth + 1 };
        });
        assert.ok(bounds.left >= 0 && bounds.right <= width + 1, `card fits ${width}x${height}`);
        assert.ok(!bounds.overflow, `card contents do not overflow at ${width}x${height}`);
        if (width === 3840) assert.ok(bounds.width > 3000, 'full-width mode scales to 4K');
    }
    assert.equal(await responsive.$eval('#timer-bar', el => getComputedStyle(el).backgroundColor), 'rgb(254, 220, 186)', 'URL timer color overrides the saved color');
    await responsive.close();
    for (const [query, boxed] of [
        ['?theme=modern&style=cards', true],
        ['?theme=broadcast-text&style=cards', true],
        ['?theme=nodecg&style=cards', true],
        ['?theme=broadcast-text', false],
        ['?theme=modern&style=text', false]
    ]) {
        const page = await open(`/overlays/trivia.html${query}&view=question&hint=1`);
        const cardStyles = await page.$eval('#card', el => {
            const css = getComputedStyle(el);
            return { background: css.backgroundColor, border: css.borderTopStyle };
        });
        if (boxed) {
            assert.notEqual(cardStyles.background, 'rgba(0, 0, 0, 0)', `boxed background is respected for ${query}`);
            assert.notEqual(cardStyles.border, 'none', `boxed border is respected for ${query}`);
            const hintStates = await page.evaluate(state => {
                const update = data => window.triviaFixture.sockets[0].onmessage({ data: JSON.stringify({ type: 'trivia:state', data }) });
                const expired = { ...state, status: 'question', settings: { ...state.settings, chatVoting: true },
                    chatVotingActive: true, chatbotEnabled: true, activeQuestion: {
                        ...state.activeQuestion, startedAt: Date.now() - 10000, endsAt: Date.now() - 1
                    } };
                update(expired);
                const atZero = getComputedStyle(document.getElementById('chat-hint')).display;
                update({ ...expired, settings: { ...expired.settings, chatVoting: false }, chatVotingActive: false });
                return [atZero, getComputedStyle(document.getElementById('chat-hint')).display];
            }, service.getPublicState());
            assert.notEqual(hintStates[0], 'none', 'enabled hints remain visible at zero');
            assert.equal(hintStates[1], 'none', 'hints never show with voting off');
            if (query === '?theme=modern&style=cards') {
                await page.evaluate(state => {
                    window.triviaFixture.sockets[0].onmessage({ data: JSON.stringify({
                        type: 'trivia:state', data: { ...state, status: 'question',
                            settings: { ...state.settings, chatVoting: true, manualTransition: true },
                            chatVotingActive: true, chatbotEnabled: true, activeQuestion: {
                                ...state.activeQuestion, startedAt: Date.now() - 10000, endsAt: Date.now() + 150
                            } }
                    }) });
                }, service.getPublicState());
                await page.waitForFunction(() => {
                    const hint = document.getElementById('chat-hint');
                    return getComputedStyle(hint).display !== 'none'
                        && hint.textContent.includes('Answer choices:')
                        && !hint.textContent.includes('!');
                });
            }
        } else {
            assert.equal(cardStyles.background, 'rgba(0, 0, 0, 0)', `floating text remains transparent for ${query}`);
            assert.equal(cardStyles.border, 'none');
        }
        await page.close();
    }
    assert.deepEqual(errors, [], 'real Studio and overlay initialize without browser errors');
});

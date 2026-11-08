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

'use strict';

/**
 * StreamPulse Trivia Service
 * 
 * Manages interactive stream trivia:
 * - Question bank management with categories, choices, correct answers, and fun facts
 * - Live lifecycle state machine: IDLE -> QUESTION -> REVEAL -> IDLE
 * - Real-time audience voting via chat commands (!a, !b, !c, !d, !1, !2, !3, !4, !trivia)
 * - Saved and deletable presets with built-in starter templates
 * - Companion & REST API friendly controls (both GET and POST supported)
 * - WebSocket broadcast synchronization with overlays
 */

const fs = require('fs');
const path = require('path');
const { safeWriteFileSync } = require('../routes/helpers');

const DEFAULT_THEME = {
    preset: 'modern',
    cardBg: 'rgba(13, 17, 23, 0.94)',
    textColor: '#f0f6fc',
    accentColor: '#3b82f6',
    correctColor: '#22c55e',
    incorrectColor: '#ef4444',
    choiceBg: 'rgba(22, 27, 34, 0.85)',
    timerColor: '#38bdf8',
    categoryColor: '#a855f7',
    funfactColor: '#eab308',
    cardRadius: 16,
    fontFamily: 'Inter, system-ui, -apple-system, sans-serif'
};

const DEFAULT_SETTINGS = {
    defaultDuration: 20,
    revealDelay: 6,
    autoAdvance: false,
    chatVoting: true,
    showTimer: true,
    showVotes: true,
    showFunFact: true,
    soundEnabled: true,
    soundVolume: 75,
    subMultiplier: 1
};

const BUILTIN_PRESETS = [
    {
        id: 'gaming-classics',
        name: 'Video Game Classics',
        description: 'Iconic questions on classic Nintendo, PlayStation, Sega, and PC milestones.',
        theme: { ...DEFAULT_THEME, preset: 'modern', accentColor: '#3b82f6' },
        settings: { ...DEFAULT_SETTINGS },
        questions: [
            {
                id: 'gc-1',
                category: 'Retro Gaming',
                question: 'In what year was the original Super Mario World released in Japan?',
                choices: ['1988', '1990', '1991', '1992'],
                correctIndex: 1,
                funfact: 'Super Mario World was a launch title for the Super Famicom in Japan on November 21, 1990.',
                duration: 20,
                points: 100
            },
            {
                id: 'gc-2',
                category: 'Nintendo History',
                question: 'What was the code name for the Nintendo GameCube during development?',
                choices: ['Dolphin', 'Revolution', 'Project Reality', 'Atlantis'],
                correctIndex: 0,
                funfact: 'The Dolphin codename is still referenced today in model numbers (DOL-001) and emulator software.',
                duration: 20,
                points: 100
            },
            {
                id: 'gc-3',
                category: 'PlayStation',
                question: 'Which game is recognized as the best-selling title on the original PlayStation (PS1)?',
                choices: ['Final Fantasy VII', 'Gran Turismo', 'Crash Bandicoot', 'Metal Gear Solid'],
                correctIndex: 1,
                funfact: 'Gran Turismo sold over 10.8 million copies on PS1, out-selling Final Fantasy VII (10 million).',
                duration: 20,
                points: 100
            },
            {
                id: 'gc-4',
                category: 'Speedrunning',
                question: 'Which classic game popularized the speedrunning glitch known as the "BLJ" (Backwards Long Jump)?',
                choices: ['Banjo-Kazooie', 'Super Mario 64', 'The Legend of Zelda: Ocarina of Time', 'Super Mario Sunshine'],
                correctIndex: 1,
                funfact: 'BLJ allows players to accumulate uncapped reverse velocity on stairs to bypass key doors.',
                duration: 20,
                points: 100
            },
            {
                id: 'gc-5',
                category: 'PC Gaming',
                question: 'What was the first commercial game to run on the Source Engine in 2004?',
                choices: ['Half-Life 2', 'Counter-Strike: Source', 'Team Fortress 2', 'Portal'],
                correctIndex: 1,
                funfact: 'Counter-Strike: Source was released in October 2004 for cyber cafes, one month before Half-Life 2 launched in November.',
                duration: 20,
                points: 100
            }
        ]
    },
    {
        id: 'pop-culture',
        name: 'Pop Culture & Sci-Fi',
        description: 'Cinema, science fiction, animation, and popular fandoms.',
        theme: { ...DEFAULT_THEME, preset: 'neon', accentColor: '#a855f7', categoryColor: '#ec4899' },
        settings: { ...DEFAULT_SETTINGS },
        questions: [
            {
                id: 'pc-1',
                category: 'Sci-Fi Cinema',
                question: 'In Back to the Future, what exact speed must the DeLorean reach to initiate time travel?',
                choices: ['66 mph', '77 mph', '88 mph', '99 mph'],
                correctIndex: 2,
                funfact: 'Doc Brown chose 88 mph because it was an easily memorable number that fit neatly on digital LED speedometers.',
                duration: 20,
                points: 100
            },
            {
                id: 'pc-2',
                category: 'Comics & Marvel',
                question: 'What is the fictional metal alloy bonded to Wolverine\'s skeleton in the X-Men universe?',
                choices: ['Vibranium', 'Adamantium', 'Beskar', 'Uru'],
                correctIndex: 1,
                funfact: 'Adamantium was first introduced in Avengers #66 in 1969, created by writer Roy Thomas.',
                duration: 20,
                points: 100
            },
            {
                id: 'pc-3',
                category: 'Animation',
                question: 'What was the first feature-length computer-animated film in cinema history?',
                choices: ['A Bug\'s Life', 'Toy Story', 'Antz', 'Shrek'],
                correctIndex: 1,
                funfact: 'Pixar released Toy Story in November 1995, pioneering the CGI feature film industry.',
                duration: 20,
                points: 100
            }
        ]
    },
    {
        id: 'streaming-lore',
        name: 'Twitch & Streaming Lore',
        description: 'Historic stream moments, emotes, and community milestones.',
        theme: { ...DEFAULT_THEME, preset: 'retro', accentColor: '#9146ff', categoryColor: '#00b3ff' },
        settings: { ...DEFAULT_SETTINGS },
        questions: [
            {
                id: 'sl-1',
                category: 'Twitch History',
                question: 'In what year was Twitch officially launched as an independent spinoff from Justin.tv?',
                choices: ['2009', '2011', '2013', '2015'],
                correctIndex: 1,
                funfact: 'Twitch launched in June 2011 and rapidly eclipsed Justin.tv before Amazon acquired it in 2014.',
                duration: 20,
                points: 100
            },
            {
                id: 'sl-2',
                category: 'Community Events',
                question: 'Which social gaming phenomenon in 2014 allowed thousands of viewers to simultaneously control a Game Boy game via chat?',
                choices: ['Twitch Plays Pokémon', 'Raid Boss Live', 'Chat Plays Dark Souls', 'Crowd Control Live'],
                correctIndex: 0,
                funfact: 'Twitch Plays Pokémon beat Pokémon Red in 16 days with over 1.1 million simultaneous participants.',
                duration: 20,
                points: 100
            }
        ]
    }
];

function createTriviaService({
    dataDir,
    triviaPath = path.join(dataDir, 'trivia.json'),
    broadcastToOverlays = () => {},
    chatbotAnnouncer = null,
    log = console.log
} = {}) {
    let state = {
        id: 'default',
        title: 'Stream Trivia',
        status: 'idle', // 'idle' | 'question' | 'reveal'
        theme: { ...DEFAULT_THEME },
        settings: { ...DEFAULT_SETTINGS },
        questions: JSON.parse(JSON.stringify(BUILTIN_PRESETS[0].questions)),
        currentIndex: 0,
        activeQuestion: null,
        presets: JSON.parse(JSON.stringify(BUILTIN_PRESETS))
    };

    // Runtime state tracking
    let questionTimer = null;
    let revealTimer = null;
    const userVotes = new Map(); // userId/username -> choiceIndex

    function save() {
        try {
            const dataToSave = {
                id: state.id,
                title: state.title,
                status: state.status,
                theme: state.theme,
                settings: state.settings,
                questions: state.questions,
                currentIndex: state.currentIndex,
                activeQuestion: state.activeQuestion ? sanitizeActiveQuestion(state.activeQuestion, true) : null,
                presets: state.presets
            };
            safeWriteFileSync(triviaPath, JSON.stringify(dataToSave, null, 2));
        } catch (err) {
            log('[Trivia] Error saving state:', err.message);
        }
    }

    function load() {
        try {
            if (fs.existsSync(triviaPath)) {
                const raw = fs.readFileSync(triviaPath, 'utf8');
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === 'object') {
                    if (parsed.id) state.id = parsed.id;
                    if (parsed.title) state.title = parsed.title;
                    if (parsed.theme && typeof parsed.theme === 'object') {
                        state.theme = { ...DEFAULT_THEME, ...parsed.theme };
                    }
                    if (parsed.settings && typeof parsed.settings === 'object') {
                        state.settings = { ...DEFAULT_SETTINGS, ...parsed.settings };
                    }
                    if (Array.isArray(parsed.questions) && parsed.questions.length > 0) {
                        state.questions = parsed.questions;
                    }
                    if (typeof parsed.currentIndex === 'number' && parsed.currentIndex >= 0) {
                        state.currentIndex = parsed.currentIndex;
                    }
                    if (Array.isArray(parsed.presets) && parsed.presets.length > 0) {
                        state.presets = parsed.presets;
                    }
                }
            }
        } catch (err) {
            log('[Trivia] Error loading state:', err.message);
        }
    }

    function sanitizeActiveQuestion(q, includeAnswer = false) {
        if (!q) return null;
        const totalVotes = userVotes.size;
        const voteCounts = [0, 0, 0, 0];
        for (const choiceIdx of userVotes.values()) {
            if (choiceIdx >= 0 && choiceIdx < 4) {
                voteCounts[choiceIdx]++;
            }
        }

        const choices = (q.choices || []).map((text, idx) => ({
            index: idx,
            text,
            letter: String.fromCharCode(65 + idx), // 'A', 'B', 'C', 'D'
            votes: voteCounts[idx] || 0,
            percent: totalVotes > 0 ? Math.round(((voteCounts[idx] || 0) / totalVotes) * 100) : 0
        }));

        const now = Date.now();
        const remainingSeconds = q.endsAt ? Math.max(0, Math.ceil((q.endsAt - now) / 1000)) : 0;

        return {
            id: q.id,
            category: q.category || 'General',
            question: q.question || '',
            choices,
            correctIndex: (includeAnswer || state.status === 'reveal') ? q.correctIndex : null,
            funfact: (includeAnswer || state.status === 'reveal') ? (q.funfact || '') : '',
            points: q.points || 100,
            duration: q.duration || state.settings.defaultDuration || 20,
            totalVotes,
            phase: state.status,
            startedAt: q.startedAt || null,
            endsAt: q.endsAt || null,
            remainingSeconds
        };
    }

    function broadcastState(eventType = 'trivia:state', extra = {}) {
        const payload = {
            status: state.status,
            currentIndex: state.currentIndex,
            totalQuestions: state.questions.length,
            activeQuestion: sanitizeActiveQuestion(state.activeQuestion, state.status === 'reveal'),
            theme: state.theme,
            settings: state.settings,
            ...extra
        };
        broadcastToOverlays(eventType, payload);
        return payload;
    }

    function clearTimers() {
        if (questionTimer) {
            clearTimeout(questionTimer);
            questionTimer = null;
        }
        if (revealTimer) {
            clearTimeout(revealTimer);
            revealTimer = null;
        }
    }

    function startQuestion(indexOrId = null, options = {}) {
        clearTimers();
        userVotes.clear();

        if (state.questions.length === 0) {
            throw new Error('No questions in the trivia bank');
        }

        let targetIndex = state.currentIndex;
        if (typeof indexOrId === 'number' && indexOrId >= 0 && indexOrId < state.questions.length) {
            targetIndex = indexOrId;
        } else if (typeof indexOrId === 'string' && indexOrId) {
            const idx = state.questions.findIndex(q => q.id === indexOrId);
            if (idx !== -1) targetIndex = idx;
        }

        state.currentIndex = targetIndex;
        const rawQuestion = state.questions[targetIndex];
        const durationSec = Number(options.duration) || rawQuestion.duration || state.settings.defaultDuration || 20;
        const now = Date.now();

        state.status = 'question';
        state.activeQuestion = {
            ...rawQuestion,
            startedAt: now,
            endsAt: now + (durationSec * 1000),
            duration: durationSec
        };

        // Schedule auto-reveal when question timer expires
        if (durationSec > 0) {
            questionTimer = setTimeout(() => {
                revealAnswer();
            }, durationSec * 1000);
        }

        save();
        broadcastState('trivia:start', { question: sanitizeActiveQuestion(state.activeQuestion, false) });

        if (chatbotAnnouncer && typeof chatbotAnnouncer.announceTriviaQuestion === 'function') {
            try {
                chatbotAnnouncer.announceTriviaQuestion(state.activeQuestion);
            } catch (err) {
                log('[Trivia] Chatbot question announce failed:', err.message);
            }
        }

        return getPublicState();
    }

    function revealAnswer() {
        if (state.status !== 'question' && state.status !== 'idle') {
            return getPublicState();
        }
        if (!state.activeQuestion && state.questions.length > 0) {
            state.activeQuestion = { ...state.questions[state.currentIndex] };
        }
        if (!state.activeQuestion) return getPublicState();

        clearTimers();
        state.status = 'reveal';

        save();
        broadcastState('trivia:reveal', {
            question: sanitizeActiveQuestion(state.activeQuestion, true),
            correctIndex: state.activeQuestion.correctIndex,
            correctLetter: String.fromCharCode(65 + (state.activeQuestion.correctIndex || 0)),
            funfact: state.activeQuestion.funfact || ''
        });

        if (chatbotAnnouncer && typeof chatbotAnnouncer.announceTriviaAnswer === 'function') {
            try {
                chatbotAnnouncer.announceTriviaAnswer(state.activeQuestion);
            } catch (err) {
                log('[Trivia] Chatbot answer announce failed:', err.message);
            }
        }

        // Optional auto-advance after reveal delay
        if (state.settings.autoAdvance) {
            const delaySec = state.settings.revealDelay || 6;
            revealTimer = setTimeout(() => {
                if (state.currentIndex + 1 < state.questions.length) {
                    nextQuestion();
                } else {
                    resetTrivia();
                }
            }, delaySec * 1000);
        }

        return getPublicState();
    }

    function nextQuestion() {
        if (state.questions.length === 0) throw new Error('No questions available');
        const nextIdx = (state.currentIndex + 1) % state.questions.length;
        return startQuestion(nextIdx);
    }

    function previousQuestion() {
        if (state.questions.length === 0) throw new Error('No questions available');
        const prevIdx = (state.currentIndex - 1 + state.questions.length) % state.questions.length;
        return startQuestion(prevIdx);
    }

    function resetTrivia() {
        clearTimers();
        userVotes.clear();
        state.status = 'idle';
        state.activeQuestion = null;

        save();
        broadcastState('trivia:reset');
        return getPublicState();
    }

    function castVote({ user = '', userId = '', choiceIndex = -1, isSub = false } = {}) {
        if (state.status !== 'question') return false;
        if (!state.settings.chatVoting) return false;
        if (typeof choiceIndex !== 'number' || choiceIndex < 0 || choiceIndex >= 4) return false;

        const voterKey = (userId || user || '').trim().toLowerCase();
        if (!voterKey) return false;

        userVotes.set(voterKey, choiceIndex);

        // Broadcast updated vote counts to overlays
        const sanitized = sanitizeActiveQuestion(state.activeQuestion, false);
        broadcastToOverlays('trivia:vote-update', {
            choices: sanitized.choices,
            totalVotes: sanitized.totalVotes
        });

        return true;
    }

    function handleChatMessage(msg = {}) {
        if (state.status !== 'question' || !state.settings.chatVoting) return false;

        const comment = String(msg.comment || msg.message || '').trim();
        if (!comment) return false;

        const user = String(msg.user || msg.username || msg.author || '').trim();
        const userId = String(msg.userId || msg.authorId || user).trim();
        const isSub = Boolean(msg.subscriber || msg.isSub || msg.hasMembership);

        // Normalize command token: e.g. "!a", "!1", "!trivia b", "a"
        const lower = comment.toLowerCase();

        // 1. Check direct letter commands: "!a", "!b", "!c", "!d"
        const directMatch = lower.match(/^!([a-d1-4])\b/);
        if (directMatch) {
            const token = directMatch[1];
            let choiceIndex = -1;
            if (token >= 'a' && token <= 'd') {
                choiceIndex = token.charCodeAt(0) - 97; // 0, 1, 2, 3
            } else if (token >= '1' && token <= '4') {
                choiceIndex = parseInt(token, 10) - 1; // 0, 1, 2, 3
            }
            if (choiceIndex >= 0) {
                return castVote({ user, userId, choiceIndex, isSub });
            }
        }

        // 2. Check "!trivia <choice>"
        const triviaCmdMatch = lower.match(/^!trivia\s+([a-d1-4])\b/);
        if (triviaCmdMatch) {
            const token = triviaCmdMatch[1];
            let choiceIndex = -1;
            if (token >= 'a' && token <= 'd') {
                choiceIndex = token.charCodeAt(0) - 97;
            } else if (token >= '1' && token <= '4') {
                choiceIndex = parseInt(token, 10) - 1;
            }
            if (choiceIndex >= 0) {
                return castVote({ user, userId, choiceIndex, isSub });
            }
        }

        // 3. Optional bare letter vote (only if exactly 1 character and matches a-d or 1-4)
        if (lower.length === 1 && /^[a-d1-4]$/.test(lower)) {
            let choiceIndex = -1;
            if (lower >= 'a' && lower <= 'd') {
                choiceIndex = lower.charCodeAt(0) - 97;
            } else if (lower >= '1' && lower <= '4') {
                choiceIndex = parseInt(lower, 10) - 1;
            }
            if (choiceIndex >= 0) {
                return castVote({ user, userId, choiceIndex, isSub });
            }
        }

        return false;
    }

    // Question Management CRUD
    function addQuestion(item) {
        if (!item || !item.question || !Array.isArray(item.choices) || item.choices.length === 0) {
            throw new Error('Question and choices are required');
        }
        const newQuestion = {
            id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            category: String(item.category || 'General').trim(),
            question: String(item.question || '').trim(),
            choices: item.choices.map(c => String(c || '').trim()).slice(0, 4),
            correctIndex: Math.max(0, Math.min(3, parseInt(item.correctIndex, 10) || 0)),
            funfact: String(item.funfact || '').trim(),
            duration: Math.max(5, Math.min(300, parseInt(item.duration, 10) || state.settings.defaultDuration || 20)),
            points: Math.max(10, parseInt(item.points, 10) || 100)
        };

        state.questions.push(newQuestion);
        save();
        broadcastState('trivia:state');
        return newQuestion;
    }

    function updateQuestion(id, updates) {
        const idx = state.questions.findIndex(q => q.id === id);
        if (idx === -1) throw new Error('Question not found');

        const existing = state.questions[idx];
        const updated = {
            ...existing,
            ...updates,
            id: existing.id
        };
        if (updates.choices && Array.isArray(updates.choices)) {
            updated.choices = updates.choices.map(c => String(c || '').trim()).slice(0, 4);
        }
        if (updates.correctIndex !== undefined) {
            updated.correctIndex = Math.max(0, Math.min(3, parseInt(updates.correctIndex, 10) || 0));
        }

        state.questions[idx] = updated;
        if (state.activeQuestion && state.activeQuestion.id === id) {
            state.activeQuestion = { ...state.activeQuestion, ...updated };
        }

        save();
        broadcastState('trivia:state');
        return updated;
    }

    function deleteQuestion(id) {
        const idx = state.questions.findIndex(q => q.id === id);
        if (idx === -1) return false;

        state.questions.splice(idx, 1);
        if (state.currentIndex >= state.questions.length) {
            state.currentIndex = Math.max(0, state.questions.length - 1);
        }
        if (state.activeQuestion && state.activeQuestion.id === id) {
            resetTrivia();
        } else {
            save();
            broadcastState('trivia:state');
        }
        return true;
    }

    function reorderQuestions(ids) {
        if (!Array.isArray(ids)) throw new Error('ids must be an array');
        const qMap = new Map(state.questions.map(q => [q.id, q]));
        const reordered = [];
        for (const id of ids) {
            if (qMap.has(id)) {
                reordered.push(qMap.get(id));
                qMap.delete(id);
            }
        }
        // Append any not explicitly in ids
        for (const remaining of qMap.values()) {
            reordered.push(remaining);
        }
        state.questions = reordered;
        save();
        broadcastState('trivia:state');
        return state.questions;
    }

    function clearQuestions() {
        state.questions = [];
        state.currentIndex = 0;
        resetTrivia();
        return [];
    }

    function importQuestions(items, { replace = false } = {}) {
        if (!Array.isArray(items)) throw new Error('Import items must be an array');
        const validated = items.map((it, idx) => ({
            id: it.id || `q_imp_${Date.now()}_${idx}`,
            category: String(it.category || 'General').trim(),
            question: String(it.question || '').trim(),
            choices: Array.isArray(it.choices) ? it.choices.map(c => String(c || '').trim()).slice(0, 4) : ['A', 'B', 'C', 'D'],
            correctIndex: Math.max(0, Math.min(3, parseInt(it.correctIndex, 10) || 0)),
            funfact: String(it.funfact || '').trim(),
            duration: Math.max(5, Math.min(300, parseInt(it.duration, 10) || state.settings.defaultDuration || 20)),
            points: Math.max(10, parseInt(it.points, 10) || 100)
        })).filter(q => q.question.length > 0 && q.choices.length >= 2);

        if (replace) {
            state.questions = validated;
            state.currentIndex = 0;
        } else {
            state.questions.push(...validated);
        }

        save();
        broadcastState('trivia:state');
        return state.questions;
    }

    // Preset Management
    function savePreset(name, description = '') {
        const trimmedName = String(name || '').trim();
        if (!trimmedName) throw new Error('Preset name is required');

        const presetId = `preset_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const preset = {
            id: presetId,
            name: trimmedName,
            description: String(description || '').trim(),
            theme: JSON.parse(JSON.stringify(state.theme)),
            settings: JSON.parse(JSON.stringify(state.settings)),
            questions: JSON.parse(JSON.stringify(state.questions)),
            createdAt: new Date().toISOString()
        };

        state.presets.push(preset);
        save();
        broadcastState('trivia:state');
        return preset;
    }

    function loadPreset(presetId) {
        const preset = state.presets.find(p => p.id === presetId);
        if (!preset) throw new Error('Preset not found');

        if (Array.isArray(preset.questions)) {
            state.questions = JSON.parse(JSON.stringify(preset.questions));
        }
        if (preset.theme) {
            state.theme = { ...DEFAULT_THEME, ...preset.theme };
        }
        if (preset.settings) {
            state.settings = { ...DEFAULT_SETTINGS, ...preset.settings };
        }
        state.currentIndex = 0;
        resetTrivia();

        return getPublicState();
    }

    function deletePreset(presetId) {
        // Built-in presets cannot be deleted
        if (BUILTIN_PRESETS.some(bp => bp.id === presetId)) {
            throw new Error('Built-in presets cannot be deleted');
        }
        const idx = state.presets.findIndex(p => p.id === presetId);
        if (idx === -1) return false;

        state.presets.splice(idx, 1);
        save();
        broadcastState('trivia:state');
        return true;
    }

    function resetPresets() {
        state.presets = JSON.parse(JSON.stringify(BUILTIN_PRESETS));
        save();
        broadcastState('trivia:state');
        return state.presets;
    }

    function updateSettings(newSettings) {
        if (!newSettings || typeof newSettings !== 'object') return state.settings;
        state.settings = {
            ...state.settings,
            ...newSettings
        };
        save();
        broadcastState('trivia:state');
        return state.settings;
    }

    function updateTheme(newTheme) {
        if (!newTheme || typeof newTheme !== 'object') return state.theme;
        state.theme = {
            ...state.theme,
            ...newTheme
        };
        save();
        broadcastState('trivia:state');
        return state.theme;
    }

    function getPublicState({ includeAnswers = false } = {}) {
        return {
            id: state.id,
            title: state.title,
            status: state.status,
            currentIndex: state.currentIndex,
            totalQuestions: state.questions.length,
            activeQuestion: sanitizeActiveQuestion(state.activeQuestion, includeAnswerOrReveal(includeAnswers)),
            questions: state.questions.map(q => ({
                id: q.id,
                category: q.category,
                question: q.question,
                choices: q.choices,
                correctIndex: includeAnswers ? q.correctIndex : undefined,
                funfact: q.funfact,
                duration: q.duration,
                points: q.points
            })),
            theme: state.theme,
            settings: state.settings,
            presets: state.presets.map(p => ({
                id: p.id,
                name: p.name,
                description: p.description,
                questionCount: (p.questions || []).length,
                isBuiltin: BUILTIN_PRESETS.some(bp => bp.id === p.id)
            }))
        };
    }

    function includeAnswerOrReveal(include) {
        return Boolean(include || state.status === 'reveal');
    }

    function getStatusSummary() {
        const active = sanitizeActiveQuestion(state.activeQuestion, state.status === 'reveal');
        return {
            status: state.status,
            currentIndex: state.currentIndex,
            totalQuestions: state.questions.length,
            activeCategory: active ? active.category : null,
            activeQuestionText: active ? active.question : null,
            totalVotes: active ? active.totalVotes : 0,
            remainingSeconds: active ? active.remainingSeconds : 0
        };
    }

    // Initialize state from disk
    load();

    return {
        getPublicState,
        getStatusSummary,
        startQuestion,
        revealAnswer,
        nextQuestion,
        previousQuestion,
        resetTrivia,
        castVote,
        handleChatMessage,
        addQuestion,
        updateQuestion,
        deleteQuestion,
        reorderQuestions,
        clearQuestions,
        importQuestions,
        savePreset,
        loadPreset,
        deletePreset,
        resetPresets,
        updateSettings,
        updateTheme,
        getState: () => state
    };
}

module.exports = {
    createTriviaService,
    DEFAULT_THEME,
    DEFAULT_SETTINGS,
    BUILTIN_PRESETS
};

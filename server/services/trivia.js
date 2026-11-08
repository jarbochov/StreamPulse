'use strict';

/**
 * StreamPulse Trivia Service
 * 
 * Manages interactive stream trivia:
 * - 2 to 6 answers per question (including True/False support)
 * - Question bank management with reordering, shuffle / random order, and categories
 * - Live lifecycle state machine: IDLE -> QUESTION -> REVEAL -> IDLE
 * - Granular theming (colors, fonts, weights, shadows, border radiuses, collapse modes)
 * - Real-time audience voting via chat (!a-!f, !1-!6, !true/!false, !trivia)
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
    cardBorderColor: 'rgba(56, 189, 248, 0.35)',
    cardBorderWidth: 2,
    cardRadius: 16,
    cardBlur: 12,
    cardShadow: '0 16px 48px rgba(0, 0, 0, 0.65), 0 0 24px rgba(56, 189, 248, 0.12)',
    fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    textColor: '#f0f6fc',
    headerFont: '',
    headerColor: '#f0f6fc',
    headerWeight: '700',
    headerTransform: 'uppercase',
    headerShadow: 'none',
    categoryFont: '',
    categoryColor: '#a855f7',
    categoryWeight: '700',
    categoryTransform: 'uppercase',
    questionFont: '',
    questionColor: '#f0f6fc',
    questionWeight: '700',
    questionShadow: '0 2px 4px rgba(0, 0, 0, 0.6)',
    questionTransform: 'none',
    choiceFont: '',
    choiceColor: '#f0f6fc',
    choiceWeight: '600',
    choiceShadow: 'none',
    choiceTransform: 'none',
    choiceBg: 'rgba(22, 27, 34, 0.88)',
    choiceBorderColor: 'rgba(255, 255, 255, 0.12)',
    choiceBorderWidth: 1.5,
    choiceRadius: 12,
    accentColor: '#3b82f6',
    correctColor: '#22c55e',
    correctBg: 'rgba(34, 197, 94, 0.16)',
    correctGlow: '0 0 24px rgba(34, 197, 94, 0.45)',
    incorrectColor: '#ef4444',
    incorrectOpacity: 0.35,
    collapseIncorrect: false, // Full screen broadcast trivia style
    timerColor: '#38bdf8',
    timerWarningColor: '#f59e0b',
    timerCriticalColor: '#ef4444',
    hintColor: '#94a3b8',
    funfactFont: '',
    funfactWeight: '500',
    funfactColor: '#eab308',
    funfactBg: 'rgba(234, 179, 8, 0.12)',
    funfactShadow: 'none',
    cardStyle: 'cards', // 'cards' | 'text' (pure floating text broadcast mode)
    // Toggleable visual elements
    showCategory: true,
    showQuestionNumber: true,
    showTimer: true,
    showVoteCounts: true,
    showPercentages: true,
    showChatHint: true,
    showFunFact: true,
    showLetterBadges: true
};

const DEFAULT_SETTINGS = {
    defaultDuration: 20,
    revealDelay: 6,
    autoAdvance: false,
    randomOrder: false,
    chatVoting: true,
    forceChatVoting: false, // allow chat voting even if chatbot announcer is off
    autoReveal: true, // auto-transition to answer on timer expiration
    manualTransition: false, // when true, requires manual transition to reveal answer
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
                id: 'gc-tf-1',
                category: 'Nintendo Lore',
                question: 'True or False: Mario was originally known as "Jumpman" in the 1981 arcade game Donkey Kong.',
                choices: ['True', 'False'],
                correctIndex: 0,
                funfact: 'Shigeru Miyamoto originally called him Jumpman, and he was depicted as a carpenter before becoming a plumber.',
                duration: 15,
                points: 50
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
                id: 'gc-multi-1',
                category: 'Pokemon Lore',
                question: 'Which of the following was NOT an original Generation 1 starter or mascot in Pokemon Red and Blue?',
                choices: ['Bulbasaur', 'Charmander', 'Squirtle', 'Pikachu', 'Eevee', 'Togepi'],
                correctIndex: 5,
                funfact: 'Togepi was introduced in Generation 2 (Gold and Silver), famously carried by Misty in the anime.',
                duration: 25,
                points: 150
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
                id: 'pc-tf-1',
                category: 'Star Wars Lore',
                question: 'True or False: Darth Vader explicitly says the line "Luke, I am your father" in The Empire Strikes Back.',
                choices: ['True', 'False'],
                correctIndex: 1,
                funfact: 'One of the most famous misquotes in cinema! Vader actually says: "No, I am your father."',
                duration: 15,
                points: 50
            },
            {
                id: 'pc-2',
                category: 'Comics & Marvel',
                question: 'What is the fictional metal alloy bonded to Wolverine\'s skeleton in the X-Men universe?',
                choices: ['Vibranium', 'Adamantium', 'Beskar', 'Uru', 'Kryptonite'],
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
                id: 'sl-tf-1',
                category: 'Emote Trivia',
                question: 'True or False: The famous "Kappa" emote depicts real-life Justin.tv software engineer Josh DeSeno.',
                choices: ['True', 'False'],
                correctIndex: 0,
                funfact: 'Josh DeSeno worked on the chat client at Justin.tv and added his own grayscale photo as an emote.',
                duration: 15,
                points: 50
            },
            {
                id: 'sl-2',
                category: 'Community Events',
                question: 'Which social gaming phenomenon in 2014 allowed thousands of viewers to simultaneously control a Game Boy game via chat?',
                choices: ['Twitch Plays Pokemon', 'Raid Boss Live', 'Chat Plays Dark Souls', 'Crowd Control Live'],
                correctIndex: 0,
                funfact: 'Twitch Plays Pokemon beat Pokemon Red in 16 days with over 1.1 million simultaneous participants.',
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
    const playedQuestionIds = new Set();

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

    function isChatbotEnabled() {
        if (!chatbotAnnouncer) return false;
        if (typeof chatbotAnnouncer.getStats === 'function') {
            const stats = chatbotAnnouncer.getStats();
            return stats && stats.enabled === true;
        }
        return true;
    }

    function isChatVotingActive() {
        if (state.settings.chatVoting === false) return false;
        // If chatbot announcer is attached and disabled, chat voting is inactive unless explicitly forced on
        if (chatbotAnnouncer && !isChatbotEnabled() && !state.settings.forceChatVoting) {
            return false;
        }
        return true;
    }

    function sanitizeActiveQuestion(q, includeAnswer = false) {
        if (!q) return null;
        const totalVotes = userVotes.size;
        const choiceCount = Array.isArray(q.choices) ? q.choices.length : 4;
        const voteCounts = new Array(choiceCount).fill(0);

        for (const choiceIdx of userVotes.values()) {
            if (choiceIdx >= 0 && choiceIdx < choiceCount) {
                voteCounts[choiceIdx]++;
            }
        }

        const choices = (q.choices || []).map((text, idx) => ({
            index: idx,
            text,
            letter: String.fromCharCode(65 + idx), // 'A', 'B', 'C', 'D', 'E', 'F'
            votes: voteCounts[idx] || 0,
            percent: totalVotes > 0 ? Math.round(((voteCounts[idx] || 0) / totalVotes) * 100) : 0
        }));

        const now = Date.now();
        const remainingSeconds = q.endsAt ? Math.max(0, Math.ceil((q.endsAt - now) / 1000)) : 0;

        // Check if question is True/False format
        const isTrueFalse = choices.length === 2 &&
            choices.some(c => /^true$/i.test(c.text.trim())) &&
            choices.some(c => /^false$/i.test(c.text.trim()));

        return {
            id: q.id,
            category: q.category || 'General',
            question: q.question || '',
            choices,
            choiceCount: choices.length,
            isTrueFalse,
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
            chatbotEnabled: isChatbotEnabled(),
            chatVotingActive: isChatVotingActive(),
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

        let opts = options;
        let queryTarget = indexOrId;
        if (indexOrId && typeof indexOrId === 'object') {
            opts = { ...indexOrId, ...options };
            queryTarget = indexOrId.questionId ?? indexOrId.id ?? indexOrId.index ?? null;
        }

        if (state.questions.length === 0) {
            throw new Error('No questions in the trivia bank');
        }

        let targetIndex = state.currentIndex;
        if (typeof queryTarget === 'number' && queryTarget >= 0 && queryTarget < state.questions.length) {
            targetIndex = queryTarget;
        } else if (typeof queryTarget === 'string' && queryTarget) {
            const idx = state.questions.findIndex(q => q.id === queryTarget);
            if (idx !== -1) targetIndex = idx;
        } else if (state.settings.randomOrder) {
            let unplayed = state.questions.filter(q => !playedQuestionIds.has(q.id));
            if (unplayed.length === 0) {
                playedQuestionIds.clear();
                unplayed = state.questions;
            }
            const picked = unplayed[Math.floor(Math.random() * unplayed.length)];
            targetIndex = state.questions.findIndex(q => q.id === picked.id);
        } else {
            let unplayed = state.questions.filter(q => !playedQuestionIds.has(q.id));
            if (unplayed.length > 0) {
                const nextUnplayed = state.questions.find((q, i) => i >= state.currentIndex && !playedQuestionIds.has(q.id)) || unplayed[0];
                targetIndex = state.questions.findIndex(q => q.id === nextUnplayed.id);
            }
        }

        state.currentIndex = targetIndex;
        const rawQuestion = state.questions[targetIndex];
        playedQuestionIds.add(rawQuestion.id);

        const durationSec = Number(opts.duration) || rawQuestion.duration || state.settings.defaultDuration || 20;
        const now = Date.now();

        state.status = 'question';
        state.activeQuestion = {
            ...rawQuestion,
            startedAt: now,
            endsAt: now + (durationSec * 1000),
            duration: durationSec
        };

        // Schedule auto-reveal when question timer expires (unless manual transition is enabled)
        const shouldAutoReveal = opts.autoReveal !== undefined
            ? Boolean(opts.autoReveal)
            : (opts.manualTransition !== undefined
                ? !opts.manualTransition
                : (state.settings.autoReveal !== false && !state.settings.manualTransition));

        if (durationSec > 0 && shouldAutoReveal) {
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
                chatbotAnnouncer.announceTriviaAnswer(sanitizeActiveQuestion(state.activeQuestion, true));
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

        let targetIndex;
        if (state.settings.randomOrder) {
            let unplayed = state.questions.filter(q => !playedQuestionIds.has(q.id));
            if (unplayed.length === 0) {
                playedQuestionIds.clear();
                unplayed = state.questions;
            }
            const picked = unplayed[Math.floor(Math.random() * unplayed.length)];
            targetIndex = state.questions.findIndex(q => q.id === picked.id);
        } else {
            let unplayed = state.questions.filter(q => !playedQuestionIds.has(q.id));
            if (unplayed.length > 0) {
                const nextUnplayed = state.questions.find((q, i) => i > state.currentIndex && !playedQuestionIds.has(q.id)) || unplayed[0];
                targetIndex = state.questions.findIndex(q => q.id === nextUnplayed.id);
            } else {
                targetIndex = (state.currentIndex + 1) % state.questions.length;
            }
        }

        return startQuestion(targetIndex);
    }

    function resetDoneQuestions() {
        playedQuestionIds.clear();
        for (const q of state.questions) {
            q.done = false;
        }
        save();
        broadcastState('trivia:state');
        return true;
    }

    function toggleQuestionDone(id, forcedValue = null) {
        const q = state.questions.find(item => item.id === id);
        if (!q) throw new Error('Question not found');
        const isDone = playedQuestionIds.has(id) || Boolean(q.done);
        const nextDone = typeof forcedValue === 'boolean' ? forcedValue : !isDone;
        if (nextDone) {
            playedQuestionIds.add(id);
            q.done = true;
        } else {
            playedQuestionIds.delete(id);
            q.done = false;
        }
        save();
        broadcastState('trivia:state');
        const unplayed = state.questions.filter(item => !playedQuestionIds.has(item.id) && !item.done).length;
        return { id, done: nextDone, unplayedCount: unplayed };
    }

    function setQuestionDone(id, isDone = true) {
        return toggleQuestionDone(id, Boolean(isDone));
    }

    function previousQuestion() {
        if (state.questions.length === 0) throw new Error('No questions available');
        const prevIdx = (state.currentIndex - 1 + state.questions.length) % state.questions.length;
        return startQuestion(prevIdx);
    }

    function resetTrivia() {
        clearTimers();
        userVotes.clear();
        playedQuestionIds.clear();
        state.status = 'idle';
        state.activeQuestion = null;

        save();
        broadcastState('trivia:reset');
        return getPublicState();
    }

    function castVote({ user = '', userId = '', choiceIndex = -1, isSub = false } = {}) {
        if (state.status !== 'question') return false;
        if (!isChatVotingActive()) return false;
        const choiceCount = state.activeQuestion?.choices?.length || 4;
        if (typeof choiceIndex !== 'number' || choiceIndex < 0 || choiceIndex >= choiceCount) return false;

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
        if (state.status !== 'question' || !isChatVotingActive()) return false;
        if (!state.activeQuestion) return false;

        const comment = String(msg.comment || msg.message || '').trim();
        if (!comment) return false;

        const user = String(msg.user || msg.username || msg.author || '').trim();
        const userId = String(msg.userId || msg.authorId || user).trim();
        const isSub = Boolean(msg.subscriber || msg.isSub || msg.hasMembership);
        const lower = comment.toLowerCase();
        const choices = state.activeQuestion.choices || [];
        const choiceCount = choices.length;

        // 1. Check True/False voting if question has 2 choices and represents true/false
        if (choiceCount === 2) {
            const trueIdx = choices.findIndex(c => /^true$/i.test(c.trim()));
            const falseIdx = choices.findIndex(c => /^false$/i.test(c.trim()));

            if (trueIdx !== -1 && falseIdx !== -1) {
                if (lower === '!true' || lower === '!t' || lower === 'true' || lower === 't') {
                    return castVote({ user, userId, choiceIndex: trueIdx, isSub });
                }
                if (lower === '!false' || lower === '!f' || lower === 'false' || lower === 'f') {
                    return castVote({ user, userId, choiceIndex: falseIdx, isSub });
                }
            }
        }

        // 2. Direct letter or number command: "!a" to "!f", or "!1" to "!6"
        const directMatch = lower.match(/^!([a-f1-6])\b/);
        if (directMatch) {
            const token = directMatch[1];
            let choiceIndex = -1;
            if (token >= 'a' && token <= 'f') {
                choiceIndex = token.charCodeAt(0) - 97; // 0..5
            } else if (token >= '1' && token <= '6') {
                choiceIndex = parseInt(token, 10) - 1; // 0..5
            }
            if (choiceIndex >= 0 && choiceIndex < choiceCount) {
                return castVote({ user, userId, choiceIndex, isSub });
            }
        }

        // 3. Command "!trivia <choice>"
        const triviaCmdMatch = lower.match(/^!trivia\s+([a-f1-6]|true|false|t|f)\b/);
        if (triviaCmdMatch) {
            const token = triviaCmdMatch[1];
            if (choiceCount === 2 && (token === 'true' || token === 't')) {
                const trueIdx = choices.findIndex(c => /^true$/i.test(c.trim()));
                if (trueIdx !== -1) return castVote({ user, userId, choiceIndex: trueIdx, isSub });
            }
            if (choiceCount === 2 && (token === 'false' || token === 'f')) {
                const falseIdx = choices.findIndex(c => /^false$/i.test(c.trim()));
                if (falseIdx !== -1) return castVote({ user, userId, choiceIndex: falseIdx, isSub });
            }
            let choiceIndex = -1;
            if (token >= 'a' && token <= 'f') {
                choiceIndex = token.charCodeAt(0) - 97;
            } else if (token >= '1' && token <= '6') {
                choiceIndex = parseInt(token, 10) - 1;
            }
            if (choiceIndex >= 0 && choiceIndex < choiceCount) {
                return castVote({ user, userId, choiceIndex, isSub });
            }
        }

        // 4. Bare single letter or single number vote
        if (lower.length === 1 && /^[a-f1-6]$/.test(lower)) {
            let choiceIndex = -1;
            if (lower >= 'a' && lower <= 'f') {
                choiceIndex = lower.charCodeAt(0) - 97;
            } else if (lower >= '1' && lower <= '6') {
                choiceIndex = parseInt(lower, 10) - 1;
            }
            if (choiceIndex >= 0 && choiceIndex < choiceCount) {
                return castVote({ user, userId, choiceIndex, isSub });
            }
        }

        return false;
    }

    function checkIsTrueFalse(choices = []) {
        return choices.length === 2 &&
            choices.some(c => /^true$/i.test(String(c).trim())) &&
            choices.some(c => /^false$/i.test(String(c).trim()));
    }

    // Question Management CRUD
    function addQuestion(item) {
        if (!item || !item.question || !Array.isArray(item.choices)) {
            throw new Error('Question and choices array are required');
        }
        if (item.choices.length < 2 || item.choices.length > 6) {
            throw new Error('A question must have between 2 and 6 choices');
        }
        const choiceSlice = item.choices.map(c => String(c || '').trim()).filter(Boolean);
        if (choiceSlice.length < 2 || choiceSlice.length > 6) {
            throw new Error('A question must have between 2 and 6 choices');
        }

        const newQuestion = {
            id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            category: String(item.category || 'General').trim(),
            question: String(item.question || '').trim(),
            choices: choiceSlice,
            isTrueFalse: checkIsTrueFalse(choiceSlice),
            correctIndex: Math.max(0, Math.min(choiceSlice.length - 1, parseInt(item.correctIndex, 10) || 0)),
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
        let choices = existing.choices;
        if (updates.choices && Array.isArray(updates.choices)) {
            const filtered = updates.choices.map(c => String(c || '').trim()).filter(Boolean).slice(0, 6);
            if (filtered.length >= 2) choices = filtered;
        }

        let correctIndex = existing.correctIndex;
        if (updates.correctIndex !== undefined) {
            correctIndex = Math.max(0, Math.min(choices.length - 1, parseInt(updates.correctIndex, 10) || 0));
        }

        const updated = {
            ...existing,
            ...updates,
            id: existing.id,
            choices,
            isTrueFalse: checkIsTrueFalse(choices),
            correctIndex
        };

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
        playedQuestionIds.delete(id);
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
        for (const remaining of qMap.values()) {
            reordered.push(remaining);
        }
        state.questions = reordered;
        save();
        broadcastState('trivia:state');
        return state.questions;
    }

    function moveQuestion(id, direction) {
        const idx = state.questions.findIndex(q => q.id === id);
        if (idx === -1) return state.questions;
        const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
        if (targetIdx < 0 || targetIdx >= state.questions.length) return state.questions;

        const temp = state.questions[idx];
        state.questions[idx] = state.questions[targetIdx];
        state.questions[targetIdx] = temp;
        save();
        broadcastState('trivia:state');
        return state.questions;
    }

    function shuffleQuestions() {
        for (let i = state.questions.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [state.questions[i], state.questions[j]] = [state.questions[j], state.questions[i]];
        }
        state.currentIndex = 0;
        playedQuestionIds.clear();
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
        const validated = items.map((it, idx) => {
            const choices = Array.isArray(it.choices)
                ? it.choices.map(c => String(c || '').trim()).filter(Boolean).slice(0, 6)
                : ['True', 'False'];
            return {
                id: it.id || `q_imp_${Date.now()}_${idx}`,
                category: String(it.category || 'General').trim(),
                question: String(it.question || '').trim(),
                choices: choices.length >= 2 ? choices : ['True', 'False'],
                correctIndex: Math.max(0, Math.min(choices.length - 1, parseInt(it.correctIndex, 10) || 0)),
                funfact: String(it.funfact || '').trim(),
                duration: Math.max(5, Math.min(300, parseInt(it.duration, 10) || state.settings.defaultDuration || 20)),
                points: Math.max(10, parseInt(it.points, 10) || 100)
            };
        }).filter(q => q.question.length > 0 && q.choices.length >= 2);

        if (replace) {
            state.questions = validated;
            state.currentIndex = 0;
            playedQuestionIds.clear();
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
        playedQuestionIds.clear();
        resetTrivia();

        return getPublicState();
    }

    function deletePreset(presetId) {
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
            playedQuestionIds: Array.from(playedQuestionIds),
            unplayedCount: state.questions.filter(q => !playedQuestionIds.has(q.id) && !q.done).length,
            activeQuestion: sanitizeActiveQuestion(state.activeQuestion, Boolean(includeAnswers || state.status === 'reveal')),
            chatbotEnabled: isChatbotEnabled(),
            chatVotingActive: isChatVotingActive(),
            questions: state.questions.map(q => ({
                id: q.id,
                category: q.category,
                question: q.question,
                choices: q.choices,
                choiceCount: q.choices.length,
                isTrueFalse: q.choices.length === 2 &&
                    q.choices.some(c => /^true$/i.test(c.trim())) &&
                    q.choices.some(c => /^false$/i.test(c.trim())),
                correctIndex: includeAnswers ? q.correctIndex : undefined,
                funfact: q.funfact,
                duration: q.duration,
                points: q.points,
                done: playedQuestionIds.has(q.id) || Boolean(q.done),
                played: playedQuestionIds.has(q.id) || Boolean(q.done)
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

    function getStatusSummary() {
        const active = sanitizeActiveQuestion(state.activeQuestion, state.status === 'reveal');
        return {
            status: state.status,
            currentIndex: state.currentIndex,
            totalQuestions: state.questions.length,
            activeCategory: active ? active.category : null,
            activeQuestionText: active ? active.question : null,
            totalVotes: active ? active.totalVotes : 0,
            remainingSeconds: active ? active.remainingSeconds : 0,
            chatbotEnabled: isChatbotEnabled(),
            chatVotingActive: isChatVotingActive()
        };
    }

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
        moveQuestion,
        shuffleQuestions,
        resetDoneQuestions,
        toggleQuestionDone,
        setQuestionDone,
        clearQuestions,
        importQuestions,
        savePreset,
        loadPreset,
        deletePreset,
        resetPresets,
        updateSettings,
        updateTheme,
        stop: () => clearTimers(),
        destroy: () => clearTimers(),
        getState: () => state
    };
}

module.exports = {
    createTriviaService,
    DEFAULT_THEME,
    DEFAULT_SETTINGS,
    BUILTIN_PRESETS
};
